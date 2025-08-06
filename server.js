require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const bookingRoutes = require('./routes/booking');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const logger = require('./services/logger');
const metricsCollector = require('./services/metrics');

// Initialize scheduled tasks
require('./scripts/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway deployment
app.set('trust proxy', true);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] 
    : true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Logging middleware
app.use(morgan('combined', { stream: logger.stream }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    metricsCollector.recordHttpRequest(
      req.method,
      req.route?.path || req.path,
      res.statusCode,
      duration / 1000
    );
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'clinic-booking-system',
    version: '1.0.0'
  });
});

// Routes
app.use('/api/booking', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Clinic Booking System API',
    version: '1.0.0',
    clinic: 'Dr. Milan Vahovic - Humenné',
    endpoints: {
      booking: '/api/booking',
      admin: '/api/admin',
      health: '/health'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  metricsCollector.recordError('http_error', 'express', err);
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🏥 Clinic Booking System running on port ${PORT}`);
  logger.info(`📅 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
  logger.info(`📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
  logger.info(`📈 Metrics: http://localhost:${PORT}/api/dashboard/metrics`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});