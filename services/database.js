const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class BookingDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, '../data/bookings.db');
    this.db = null;
    this.isInitialized = false;
    this.init();
  }

  init() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Initialize database with connection pooling
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : null,
        fileMustExist: false
      });

      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000000');
      this.db.pragma('temp_store = MEMORY');

      this.createTables();
      this.isInitialized = true;
      console.log('✅ SQLite database initialized with connection pooling');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  createTables() {
    // Bookings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        appointment_type TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        patient_surname TEXT NOT NULL,
        patient_phone TEXT NOT NULL,
        patient_complaints TEXT,
        calendar_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        queue_number INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Daily counts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_type TEXT NOT NULL,
        date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(appointment_type, date)
      )
    `);

    // Hourly counts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hourly_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_type TEXT NOT NULL,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(appointment_type, date, hour)
      )
    `);

    // Metrics table for tracking system performance
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        labels TEXT, -- JSON string
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add queue_number column to existing bookings table if it doesn't exist
    try {
      this.db.exec('ALTER TABLE bookings ADD COLUMN queue_number INTEGER');
      console.log('✅ Added queue_number column to existing bookings table');
    } catch (error) {
      // Column already exists, which is fine
      if (!error.message.includes('duplicate column name')) {
        console.log('⚠️ queue_number column already exists or other error:', error.message);
      }
    }

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(date, time);
      CREATE INDEX IF NOT EXISTS idx_bookings_appointment_type ON bookings(appointment_type);
      CREATE INDEX IF NOT EXISTS idx_bookings_date_queue ON bookings(date, queue_number);
      CREATE INDEX IF NOT EXISTS idx_daily_counts_type_date ON daily_counts(appointment_type, date);
      CREATE INDEX IF NOT EXISTS idx_hourly_counts_type_date_hour ON hourly_counts(appointment_type, date, hour);
      CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(metric_name, timestamp);
    `);

    console.log('✅ Database tables created with indexes');
  }

  // Queue number operations
  async getNextQueueNumber(date) {
    // Use a transaction to ensure atomic queue number assignment
    const transaction = this.db.transaction(() => {
      // Get the highest queue number for this date
      const stmt = this.db.prepare(`
        SELECT MAX(queue_number) as max_queue 
        FROM bookings 
        WHERE date = ?
      `);
      const result = stmt.get(date);
      const nextNumber = (result?.max_queue || 0) + 1;
      
      console.log(`🔢 Queue number for ${date}: ${nextNumber} (previous max: ${result?.max_queue || 0})`);
      return nextNumber;
    });
    
    return transaction();
  }

  // Booking operations
  async createBooking(bookingData) {
    const stmt = this.db.prepare(`
      INSERT INTO bookings (
        id, appointment_type, date, time, patient_name, patient_surname, 
        patient_phone, patient_complaints, calendar_id, event_id, queue_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(
        bookingData.id,
        bookingData.appointmentType,
        bookingData.date,
        bookingData.time,
        bookingData.patientData.meno,
        bookingData.patientData.priezvisko,
        bookingData.patientData.telefon,
        bookingData.patientData.prvotne_tazkosti || null,
        bookingData.calendarId,
        bookingData.eventId,
        bookingData.queueNumber
      );

      // Update counts only (database is used for counting, not conflict detection)
      await this.incrementDailyCount(bookingData.appointmentType, bookingData.date);
      await this.incrementHourlyCount(bookingData.appointmentType, bookingData.date, bookingData.time);

      console.log(`✅ Booking created with queue number ${bookingData.queueNumber} for ${bookingData.date}`);
      return { success: true, id: bookingData.id, queueNumber: bookingData.queueNumber };
    } catch (error) {
      console.error('Database insert error:', error);
      throw error;
    }
  }

  async getBooking(bookingId) {
    const stmt = this.db.prepare('SELECT * FROM bookings WHERE id = ?');
    return stmt.get(bookingId);
  }

  async deleteBooking(bookingId) {
    const booking = await this.getBooking(bookingId);
    if (!booking) return false;

    const stmt = this.db.prepare('DELETE FROM bookings WHERE id = ?');
    const result = stmt.run(bookingId);

    if (result.changes > 0) {
      // Decrement counts
      await this.decrementDailyCount(booking.appointment_type, booking.date);
      await this.decrementHourlyCount(booking.appointment_type, booking.date, booking.time);
      return true;
    }
    return false;
  }

  async getBookingsForDate(date) {
    const stmt = this.db.prepare('SELECT * FROM bookings WHERE date = ? ORDER BY time');
    return stmt.all(date);
  }

  async checkTimeConflict(date, time, appointmentType) {
    const stmt = this.db.prepare(`
      SELECT id FROM bookings 
      WHERE date = ? AND time = ? AND appointment_type = ?
    `);
    const result = stmt.get(date, time, appointmentType);
    return !!result;
  }

  // Count operations
  async getDailyCount(appointmentType, date) {
    const stmt = this.db.prepare(`
      SELECT count FROM daily_counts 
      WHERE appointment_type = ? AND date = ?
    `);
    const result = stmt.get(appointmentType, date);
    return result ? result.count : 0;
  }

  async getHourlyCount(appointmentType, date, hour) {
    // Accept hour as integer parameter
    const hourInt = typeof hour === 'string' ? parseInt(hour.split(':')[0]) : hour;
    const stmt = this.db.prepare(`
      SELECT count FROM hourly_counts 
      WHERE appointment_type = ? AND date = ? AND hour = ?
    `);
    const result = stmt.get(appointmentType, date, hourInt);
    return result ? result.count : 0;
  }

  async incrementDailyCount(appointmentType, date) {
    const stmt = this.db.prepare(`
      INSERT INTO daily_counts (appointment_type, date, count) 
      VALUES (?, ?, 1)
      ON CONFLICT(appointment_type, date) 
      DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(appointmentType, date);
  }

  async incrementHourlyCount(appointmentType, date, time) {
    const hour = parseInt(time.split(':')[0]);
    const stmt = this.db.prepare(`
      INSERT INTO hourly_counts (appointment_type, date, hour, count) 
      VALUES (?, ?, ?, 1)
      ON CONFLICT(appointment_type, date, hour) 
      DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(appointmentType, date, hour);
  }

  async decrementDailyCount(appointmentType, date) {
    const stmt = this.db.prepare(`
      UPDATE daily_counts 
      SET count = MAX(0, count - 1), updated_at = CURRENT_TIMESTAMP
      WHERE appointment_type = ? AND date = ?
    `);
    stmt.run(appointmentType, date);
  }

  async decrementHourlyCount(appointmentType, date, time) {
    const hour = parseInt(time.split(':')[0]);
    const stmt = this.db.prepare(`
      UPDATE hourly_counts 
      SET count = MAX(0, count - 1), updated_at = CURRENT_TIMESTAMP
      WHERE appointment_type = ? AND date = ? AND hour = ?
    `);
    stmt.run(appointmentType, date, hour);
  }

  // Analytics and metrics
  async getBookingStats(startDate, endDate) {
    const stmt = this.db.prepare(`
      SELECT 
        appointment_type,
        COUNT(*) as total_bookings,
        DATE(created_at) as booking_date
      FROM bookings 
      WHERE date BETWEEN ? AND ?
      GROUP BY appointment_type, DATE(created_at)
      ORDER BY booking_date, appointment_type
    `);
    return stmt.all(startDate, endDate);
  }

  async getPopularTimeSlots() {
    const stmt = this.db.prepare(`
      SELECT 
        time,
        COUNT(*) as booking_count,
        appointment_type
      FROM bookings 
      WHERE date >= date('now', '-30 days')
      GROUP BY time, appointment_type
      ORDER BY booking_count DESC
      LIMIT 20
    `);
    return stmt.all();
  }

  async getDailyBookingTrends() {
    const stmt = this.db.prepare(`
      SELECT 
        date,
        appointment_type,
        COUNT(*) as bookings
      FROM bookings 
      WHERE date >= date('now', '-30 days')
      GROUP BY date, appointment_type
      ORDER BY date DESC
    `);
    return stmt.all();
  }

  // Store metrics for Prometheus/Grafana
  async recordMetric(name, value, labels = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (metric_name, metric_value, labels)
      VALUES (?, ?, ?)
    `);
    stmt.run(name, value, JSON.stringify(labels));
  }

  // Health check
  async healthCheck() {
    try {
      const stmt = this.db.prepare('SELECT 1 as health');
      const result = stmt.get();
      return result.health === 1;
    } catch (error) {
      return false;
    }
  }

  // Migration from JSON to SQLite
  async migrateFromJSON(jsonData) {
    console.log('🔄 Starting migration from JSON to SQLite...');
    
    const transaction = this.db.transaction(() => {
      // Clear existing data
      this.db.exec('DELETE FROM bookings');
      this.db.exec('DELETE FROM daily_counts');
      this.db.exec('DELETE FROM hourly_counts');

      // Migrate bookings
      for (const [bookingId, booking] of Object.entries(jsonData.bookings || {})) {
        const stmt = this.db.prepare(`
          INSERT INTO bookings (
            id, appointment_type, date, time, patient_name, patient_surname, 
            patient_phone, patient_complaints, calendar_id, event_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
          bookingId,
          booking.appointmentType,
          booking.date,
          booking.time,
          booking.patientData.meno,
          booking.patientData.priezvisko,
          booking.patientData.telefon,
          booking.patientData.prvotne_tazkosti || null,
          booking.calendarId,
          booking.eventId,
          booking.createdAt
        );
      }

      // Migrate daily counts
      for (const [key, count] of Object.entries(jsonData.dailyCounts || {})) {
        const [appointmentType, date] = key.split('-').slice(0, -3).join('-').split('-').concat(key.split('-').slice(-3).join('-')).slice(0, 2);
        const actualDate = key.split('-').slice(-3).join('-');
        
        const stmt = this.db.prepare(`
          INSERT INTO daily_counts (appointment_type, date, count)
          VALUES (?, ?, ?)
        `);
        stmt.run(appointmentType, actualDate, count);
      }

      // Migrate hourly counts
      for (const [key, count] of Object.entries(jsonData.hourlyCounts || {})) {
        const parts = key.split('-');
        const hour = parseInt(parts[parts.length - 1]);
        const date = parts.slice(-4, -1).join('-');
        const appointmentType = parts.slice(0, -4).join('-');
        
        const stmt = this.db.prepare(`
          INSERT INTO hourly_counts (appointment_type, date, hour, count)
          VALUES (?, ?, ?, ?)
        `);
        stmt.run(appointmentType, date, hour, count);
      }
    });

    transaction();
    console.log('✅ Migration from JSON to SQLite completed');
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('✅ Database connection closed');
    }
  }
}

// Singleton instance
const bookingDatabase = new BookingDatabase();

module.exports = bookingDatabase;