const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

class BookingDatabase {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
    this.init();
  }

  async init() {
    try {
      // Use Railway's provided DATABASE_URL or fallback to local config
      const connectionConfig = process.env.DATABASE_URL 
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
          }
        : {
            user: process.env.POSTGRES_USER || 'postgres',
            host: process.env.POSTGRES_HOST || 'localhost',
            database: process.env.POSTGRES_DB || 'booking_system',
            password: process.env.POSTGRES_PASSWORD || 'password',
            port: process.env.POSTGRES_PORT || 5432,
          };

      this.pool = new Pool(connectionConfig);

      // Test connection
      const client = await this.pool.connect();
      client.release();

      await this.createTables();
      this.isInitialized = true;
      console.log('✅ PostgreSQL database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async createTables() {
    const client = await this.pool.connect();
    try {
      // Bookings table
      await client.query(`
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Daily counts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS daily_counts (
          id SERIAL PRIMARY KEY,
          appointment_type TEXT NOT NULL,
          date TEXT NOT NULL,
          count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(appointment_type, date)
        )
      `);

      // Hourly counts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS hourly_counts (
          id SERIAL PRIMARY KEY,
          appointment_type TEXT NOT NULL,
          date TEXT NOT NULL,
          hour INTEGER NOT NULL,
          count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(appointment_type, date, hour)
        )
      `);

      // Metrics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS metrics (
          id SERIAL PRIMARY KEY,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          labels TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(date, time);
        CREATE INDEX IF NOT EXISTS idx_bookings_appointment_type ON bookings(appointment_type);
        CREATE INDEX IF NOT EXISTS idx_daily_counts_type_date ON daily_counts(appointment_type, date);
        CREATE INDEX IF NOT EXISTS idx_hourly_counts_type_date_hour ON hourly_counts(appointment_type, date, hour);
        CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(metric_name, timestamp);
      `);

      console.log('✅ Database tables created with indexes');
    } finally {
      client.release();
    }
  }

  // Booking operations
  async createBooking(bookingData) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO bookings (
          id, appointment_type, date, time, patient_name, patient_surname, 
          patient_phone, patient_complaints, calendar_id, event_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        bookingData.id,
        bookingData.appointmentType,
        bookingData.date,
        bookingData.time,
        bookingData.patientData.meno,
        bookingData.patientData.priezvisko,
        bookingData.patientData.telefon,
        bookingData.patientData.prvotne_tazkosti || null,
        bookingData.calendarId,
        bookingData.eventId
      ]);

      // Update counts
      await this.incrementDailyCount(bookingData.appointmentType, bookingData.date);
      await this.incrementHourlyCount(bookingData.appointmentType, bookingData.date, bookingData.time);

      return { success: true, id: bookingData.id };
    } catch (error) {
      console.error('Database insert error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getBooking(bookingId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async deleteBooking(bookingId) {
    const client = await this.pool.connect();
    try {
      const booking = await this.getBooking(bookingId);
      if (!booking) return false;

      const result = await client.query('DELETE FROM bookings WHERE id = $1', [bookingId]);

      if (result.rowCount > 0) {
        await this.decrementDailyCount(booking.appointment_type, booking.date);
        await this.decrementHourlyCount(booking.appointment_type, booking.date, booking.time);
        return true;
      }
      return false;
    } finally {
      client.release();
    }
  }

  async getBookingsForDate(date) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM bookings WHERE date = $1 ORDER BY time', [date]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async checkTimeConflict(date, time, appointmentType) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT id FROM bookings 
        WHERE date = $1 AND time = $2 AND appointment_type = $3
      `, [date, time, appointmentType]);
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  // Count operations
  async getDailyCount(appointmentType, date) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT count FROM daily_counts 
        WHERE appointment_type = $1 AND date = $2
      `, [appointmentType, date]);
      return result.rows[0]?.count || 0;
    } finally {
      client.release();
    }
  }

  async getHourlyCount(appointmentType, date, hour) {
    const hourInt = typeof hour === 'string' ? parseInt(hour.split(':')[0]) : hour;
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT count FROM hourly_counts 
        WHERE appointment_type = $1 AND date = $2 AND hour = $3
      `, [appointmentType, date, hourInt]);
      return result.rows[0]?.count || 0;
    } finally {
      client.release();
    }
  }

  async incrementDailyCount(appointmentType, date) {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO daily_counts (appointment_type, date, count) 
        VALUES ($1, $2, 1)
        ON CONFLICT(appointment_type, date) 
        DO UPDATE SET count = daily_counts.count + 1, updated_at = CURRENT_TIMESTAMP
      `, [appointmentType, date]);
    } finally {
      client.release();
    }
  }

  async incrementHourlyCount(appointmentType, date, time) {
    const hour = parseInt(time.split(':')[0]);
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO hourly_counts (appointment_type, date, hour, count) 
        VALUES ($1, $2, $3, 1)
        ON CONFLICT(appointment_type, date, hour) 
        DO UPDATE SET count = hourly_counts.count + 1, updated_at = CURRENT_TIMESTAMP
      `, [appointmentType, date, hour]);
    } finally {
      client.release();
    }
  }

  async decrementDailyCount(appointmentType, date) {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE daily_counts 
        SET count = GREATEST(0, count - 1), updated_at = CURRENT_TIMESTAMP
        WHERE appointment_type = $1 AND date = $2
      `, [appointmentType, date]);
    } finally {
      client.release();
    }
  }

  async decrementHourlyCount(appointmentType, date, time) {
    const hour = parseInt(time.split(':')[0]);
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE hourly_counts 
        SET count = GREATEST(0, count - 1), updated_at = CURRENT_TIMESTAMP
        WHERE appointment_type = $1 AND date = $2 AND hour = $3
      `, [appointmentType, date, hour]);
    } finally {
      client.release();
    }
  }

  // Health check
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT 1 as health');
      client.release();
      return result.rows[0].health === 1;
    } catch (error) {
      return false;
    }
  }

  async recordMetric(name, value, labels = {}) {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO metrics (metric_name, metric_value, labels)
        VALUES ($1, $2, $3)
      `, [name, value, JSON.stringify(labels)]);
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ Database connection pool closed');
    }
  }
}

// Singleton instance
const bookingDatabase = new BookingDatabase();

module.exports = bookingDatabase;