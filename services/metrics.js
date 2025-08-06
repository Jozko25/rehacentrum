const promClient = require('prom-client');
const logger = require('./logger');
const bookingDatabase = require('./database');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'clinic_booking_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

// Custom metrics
const bookingCounter = new promClient.Counter({
  name: 'clinic_booking_total',
  help: 'Total number of bookings made',
  labelNames: ['appointment_type', 'status'],
  registers: [register]
});

const bookingDuration = new promClient.Histogram({
  name: 'clinic_booking_duration_seconds',
  help: 'Duration of booking operations',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

const activeBookings = new promClient.Gauge({
  name: 'clinic_active_bookings',
  help: 'Current number of active bookings',
  labelNames: ['appointment_type'],
  registers: [register]
});

const dailyLimitUtilization = new promClient.Gauge({
  name: 'clinic_daily_limit_utilization',
  help: 'Daily limit utilization percentage',
  labelNames: ['appointment_type'],
  registers: [register]
});

const hourlyBookings = new promClient.Gauge({
  name: 'clinic_hourly_bookings',
  help: 'Number of bookings per hour',
  labelNames: ['appointment_type', 'hour'],
  registers: [register]
});

const systemHealth = new promClient.Gauge({
  name: 'clinic_system_health',
  help: 'System health status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'],
  registers: [register]
});

const responseTime = new promClient.Histogram({
  name: 'clinic_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const requestCounter = new promClient.Counter({
  name: 'clinic_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Database connection metrics
const dbConnections = new promClient.Gauge({
  name: 'clinic_db_connections',
  help: 'Database connection statistics',
  labelNames: ['state'],
  registers: [register]
});

const dbOperationDuration = new promClient.Histogram({
  name: 'clinic_db_operation_duration_seconds',
  help: 'Database operation duration',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2],
  registers: [register]
});

// Error tracking
const errorCounter = new promClient.Counter({
  name: 'clinic_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'component'],
  registers: [register]
});

class MetricsCollector {
  constructor() {
    this.startTime = Date.now();
    this.collectInterval = null;
    this.init();
  }

  init() {
    // Collect metrics every 30 seconds
    this.collectInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    logger.info('Metrics collector initialized');
  }

  async collectSystemMetrics() {
    try {
      // Update system health
      const dbHealth = await bookingDatabase.healthCheck();
      systemHealth.set({ component: 'database' }, dbHealth ? 1 : 0);
      systemHealth.set({ component: 'system' }, 1);

      // Update booking metrics from database
      await this.updateBookingMetrics();
      
      logger.debug('System metrics collected');
    } catch (error) {
      logger.error('Failed to collect system metrics:', error);
      systemHealth.set({ component: 'metrics_collector' }, 0);
    }
  }

  async updateBookingMetrics() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const bookings = await bookingDatabase.getBookingsForDate(today);
      
      // Group by appointment type
      const bookingsByType = {};
      bookings.forEach(booking => {
        if (!bookingsByType[booking.appointment_type]) {
          bookingsByType[booking.appointment_type] = 0;
        }
        bookingsByType[booking.appointment_type]++;
      });

      // Update active bookings gauge
      for (const [type, count] of Object.entries(bookingsByType)) {
        activeBookings.set({ appointment_type: type }, count);
      }

      // Update hourly distribution
      const hourlyStats = {};
      bookings.forEach(booking => {
        const hour = booking.time.split(':')[0];
        const key = `${booking.appointment_type}_${hour}`;
        if (!hourlyStats[key]) {
          hourlyStats[key] = { type: booking.appointment_type, hour, count: 0 };
        }
        hourlyStats[key].count++;
      });

      for (const stat of Object.values(hourlyStats)) {
        hourlyBookings.set(
          { appointment_type: stat.type, hour: stat.hour }, 
          stat.count
        );
      }
    } catch (error) {
      logger.error('Failed to update booking metrics:', error);
    }
  }

  // Method to record booking events
  recordBooking(appointmentType, status = 'success', duration = 0) {
    bookingCounter.inc({ appointment_type: appointmentType, status });
    if (duration > 0) {
      bookingDuration.observe({ operation: 'create_booking' }, duration);
    }
    logger.info('Booking recorded', { appointmentType, status, duration });
  }

  // Method to record HTTP requests
  recordHttpRequest(method, route, statusCode, duration) {
    requestCounter.inc({ method, route, status_code: statusCode });
    responseTime.observe({ method, route, status_code: statusCode }, duration);
  }

  // Method to record database operations
  recordDbOperation(operation, table, duration) {
    dbOperationDuration.observe({ operation, table }, duration);
  }

  // Method to record errors
  recordError(type, component, error) {
    errorCounter.inc({ type, component });
    logger.error(`${component} error`, { type, error: error.message, stack: error.stack });
  }

  // Get metrics for Prometheus endpoint
  getMetrics() {
    return register.metrics();
  }

  // Get registry for express-prom-bundle
  getRegister() {
    return register;
  }

  // Shutdown
  shutdown() {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
    }
    logger.info('Metrics collector shutdown');
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

// Graceful shutdown
process.on('SIGTERM', () => {
  metricsCollector.shutdown();
});

process.on('SIGINT', () => {
  metricsCollector.shutdown();
});

module.exports = metricsCollector;