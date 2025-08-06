# 🏥 Clinic Booking System - Monitoring Setup

## Overview
Complete monitoring solution with connection pooling, admin dashboard, logging, metrics, and Grafana integration.

## 🚀 Quick Start

### 1. Start with Docker Compose (Recommended)
```bash
# Start all monitoring services
docker-compose up -d

# View logs
docker-compose logs -f booking-app
```

### 2. Manual Setup
```bash
# Install dependencies
npm install

# Start the application
npm start
```

## 📊 Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **Admin Dashboard** | http://localhost:3000/api/dashboard | None |
| **Grafana** | http://localhost:3001 | admin / clinic123 |
| **Prometheus** | http://localhost:9090 | None |
| **API Metrics** | http://localhost:3000/api/dashboard/metrics | None |
| **Health Check** | http://localhost:3000/health | None |

## 🔧 Features Implemented

### ✅ Connection Pooling
- SQLite with WAL mode for better concurrency
- Optimized database connections
- Connection statistics tracking

### ✅ Admin Dashboard UI
- Real-time booking statistics
- Interactive charts (Chart.js)
- Responsive design
- Auto-refresh every 30 seconds
- Modern Material Design UI

### ✅ Comprehensive Logging
- Winston logger with multiple transports
- Structured JSON logging
- Log rotation (5MB files, 5 backups)
- Different log levels: error, combined, app, access
- Console output in development

### ✅ Metrics Collection
- Prometheus metrics integration
- Custom business metrics:
  - Total bookings by type
  - Active bookings gauge
  - Response time histograms
  - Database operation timings
  - System health indicators
  - Error tracking

### ✅ Grafana Dashboard
- Pre-configured dashboard
- Real-time visualization
- System performance monitoring
- Log aggregation with Loki
- Alert capabilities

## 📈 Monitoring Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐
│   Booking App   │───→│ Prometheus   │───→│  Grafana    │
│   (Port 3000)   │    │ (Port 9090)  │    │ (Port 3001) │
└─────────────────┘    └──────────────┘    └─────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌──────────────┐
│   Log Files     │───→│     Loki     │
│   (/logs/*.log) │    │ (Port 3100)  │
└─────────────────┘    └──────────────┘
         │                       ▲
         ▼                       │
┌─────────────────┐              │
│   Promtail      │──────────────┘
│   Log Shipper   │
└─────────────────┘
```

## 📊 Key Metrics Tracked

### Business Metrics
- `clinic_booking_total` - Total bookings counter
- `clinic_active_bookings` - Current active bookings
- `clinic_daily_limit_utilization` - Daily limit usage %
- `clinic_hourly_bookings` - Bookings per hour

### System Metrics
- `clinic_http_request_duration_seconds` - API response times
- `clinic_http_requests_total` - HTTP request counter
- `clinic_db_operation_duration_seconds` - Database performance
- `clinic_system_health` - Component health status
- `clinic_errors_total` - Error tracking

### Infrastructure Metrics
- CPU, Memory, Disk usage (Node Exporter)
- Network statistics
- Process metrics

## 🚨 Alerts & Monitoring

### Dashboard Features
- **Real-time stats**: Today's bookings, total bookings, averages
- **Visual charts**: 
  - Booking types distribution (pie chart)
  - Daily trends (line chart)
  - Hourly distribution (bar chart)
  - System performance (radar chart)
- **Recent bookings table**
- **Auto-refresh** every 30 seconds

### Grafana Alerts (Configure as needed)
- High error rate
- Slow response times
- Database connection issues
- System resource alerts

## 🔧 Configuration

### Environment Variables
```bash
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

### Log Levels
- `error`: Error logs only
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debug information

## 📁 File Structure

```
booking-logic/
├── services/
│   ├── database.js      # SQLite with connection pooling
│   ├── logger.js        # Winston logging setup
│   └── metrics.js       # Prometheus metrics collector
├── routes/
│   └── dashboard.js     # Dashboard UI and API
├── monitoring/
│   ├── prometheus.yml   # Prometheus configuration
│   ├── loki.yml        # Loki configuration
│   ├── promtail.yml    # Promtail configuration
│   └── grafana/        # Grafana dashboards & datasources
├── logs/               # Application logs
├── docker-compose.yml  # Complete monitoring stack
└── Dockerfile         # Application container
```

## 🛠 Development & Troubleshooting

### View Logs
```bash
# Application logs
tail -f logs/app.log

# Error logs
tail -f logs/error.log

# Access logs
tail -f logs/access.log
```

### Check Metrics
```bash
# Get Prometheus metrics
curl http://localhost:3000/api/dashboard/metrics

# Health check
curl http://localhost:3000/health

# Dashboard data API
curl http://localhost:3000/api/dashboard/data
```

### Database Status
- Connection pooling active with WAL mode
- Automatic migrations from JSON to SQLite
- Optimized indexes for performance
- Built-in health checks

## 🔄 Maintenance

### Log Rotation
- Automatic rotation at 5MB per file
- Keeps 5 historical files
- Compressed older logs

### Database Maintenance
- Regular VACUUM operations
- Index optimization
- Backup recommendations

### Monitoring Data Retention
- Prometheus: 30 days
- Grafana: Configurable
- Logs: 5 files x 5MB = 25MB max per log type

## 🎯 Next Steps

1. Configure alerting rules in Grafana
2. Set up email/Slack notifications
3. Add custom business dashboards
4. Implement backup monitoring
5. Add security monitoring dashboards

---

**Status**: ✅ All monitoring components implemented and ready to use!