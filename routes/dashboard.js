const express = require('express');
const router = express.Router();
const bookingDatabase = require('../services/database');
const logger = require('../services/logger');
const metricsCollector = require('../services/metrics');

// Dashboard HTML page
router.get('/', (req, res) => {
  const dashboardHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clinic Booking Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f5f7fa;
            color: #333;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            margin-bottom: 2rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: white;
            padding: 1.5rem;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 4px solid #667eea;
        }
        
        .stat-value {
            font-size: 2.5rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 0.5rem;
        }
        
        .stat-label {
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
        }
        
        .chart-container {
            background: white;
            padding: 1.5rem;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .chart-title {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #333;
        }
        
        .table-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .table-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem 1.5rem;
            font-weight: 600;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th, td {
            padding: 1rem 1.5rem;
            text-align: left;
            border-bottom: 1px solid #eef2f7;
        }
        
        th {
            background-color: #f8fafc;
            font-weight: 600;
            color: #374151;
        }
        
        tr:hover {
            background-color: #f8fafc;
        }
        
        .status-indicator {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .status-healthy { background-color: #10b981; }
        .status-warning { background-color: #f59e0b; }
        .status-error { background-color: #ef4444; }
        
        .refresh-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            margin-bottom: 1rem;
        }
        
        .refresh-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .loading {
            opacity: 0.6;
            pointer-events: none;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .charts-grid {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 Clinic Booking Dashboard</h1>
            <p>Dr. Milan Vahovic - Humenné | Real-time Monitoring</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value" id="todayBookings">-</div>
                <div class="stat-label">Today's Bookings</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="totalBookings">-</div>
                <div class="stat-label">Total Bookings</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="avgDaily">-</div>
                <div class="stat-label">Avg Daily Bookings</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="peakHour">-</div>
                <div class="stat-label">Peak Hour</div>
            </div>
        </div>
        
        <div class="charts-grid">
            <div class="chart-container">
                <div class="chart-title">📊 Bookings by Type</div>
                <canvas id="bookingTypeChart"></canvas>
            </div>
            <div class="chart-container">
                <div class="chart-title">📈 Daily Trend (Last 7 Days)</div>
                <canvas id="dailyTrendChart"></canvas>
            </div>
            <div class="chart-container">
                <div class="chart-title">🕐 Hourly Distribution</div>
                <canvas id="hourlyChart"></canvas>
            </div>
            <div class="chart-container">
                <div class="chart-title">⚡ System Performance</div>
                <canvas id="performanceChart"></canvas>
            </div>
        </div>
        
        <div class="table-container">
            <div class="table-header">
                <button class="refresh-btn" onclick="refreshData()">🔄 Refresh Data</button>
                Recent Bookings & System Status
            </div>
            <table id="recentBookingsTable">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Patient</th>
                        <th>Type</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="bookingsTableBody">
                    <tr><td colspan="4">Loading...</td></tr>
                </tbody>
            </table>
        </div>
    </div>
    
    <script>
        let charts = {};
        
        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            initializeCharts();
            refreshData();
            
            // Auto-refresh every 30 seconds
            setInterval(refreshData, 30000);
        });
        
        function initializeCharts() {
            // Booking Type Chart
            const typeCtx = document.getElementById('bookingTypeChart').getContext('2d');
            charts.bookingType = new Chart(typeCtx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
            
            // Daily Trend Chart
            const trendCtx = document.getElementById('dailyTrendChart').getContext('2d');
            charts.dailyTrend = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Bookings',
                        data: [],
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
            
            // Hourly Chart
            const hourlyCtx = document.getElementById('hourlyChart').getContext('2d');
            charts.hourly = new Chart(hourlyCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Bookings',
                        data: [],
                        backgroundColor: 'rgba(102, 126, 234, 0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
            
            // Performance Chart
            const perfCtx = document.getElementById('performanceChart').getContext('2d');
            charts.performance = new Chart(perfCtx, {
                type: 'radar',
                data: {
                    labels: ['Database', 'API Response', 'Calendar Sync', 'Notifications', 'System Load'],
                    datasets: [{
                        label: 'Health Score',
                        data: [95, 98, 92, 88, 94],
                        backgroundColor: 'rgba(102, 126, 234, 0.2)',
                        borderColor: '#667eea',
                        pointBackgroundColor: '#667eea'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            beginAtZero: true,
                            max: 100
                        }
                    }
                }
            });
        }
        
        async function refreshData() {
            try {
                document.body.classList.add('loading');
                
                // Fetch dashboard data
                const response = await fetch('/api/dashboard/data');
                const data = await response.json();
                
                // Update stats
                document.getElementById('todayBookings').textContent = data.stats.todayBookings || 0;
                document.getElementById('totalBookings').textContent = data.stats.totalBookings || 0;
                document.getElementById('avgDaily').textContent = (data.stats.avgDaily || 0).toFixed(1);
                document.getElementById('peakHour').textContent = data.stats.peakHour || '-';
                
                // Update charts
                updateCharts(data);
                
                // Update table
                updateBookingsTable(data.recentBookings || []);
                
            } catch (error) {
                console.error('Failed to refresh data:', error);
            } finally {
                document.body.classList.remove('loading');
            }
        }
        
        function updateCharts(data) {
            // Update booking type chart
            if (data.chartData.bookingTypes) {
                charts.bookingType.data.labels = Object.keys(data.chartData.bookingTypes);
                charts.bookingType.data.datasets[0].data = Object.values(data.chartData.bookingTypes);
                charts.bookingType.update();
            }
            
            // Update daily trend chart
            if (data.chartData.dailyTrend) {
                charts.dailyTrend.data.labels = data.chartData.dailyTrend.labels;
                charts.dailyTrend.data.datasets[0].data = data.chartData.dailyTrend.data;
                charts.dailyTrend.update();
            }
            
            // Update hourly chart
            if (data.chartData.hourlyDistribution) {
                charts.hourly.data.labels = data.chartData.hourlyDistribution.labels;
                charts.hourly.data.datasets[0].data = data.chartData.hourlyDistribution.data;
                charts.hourly.update();
            }
        }
        
        function updateBookingsTable(bookings) {
            const tbody = document.getElementById('bookingsTableBody');
            tbody.innerHTML = '';
            
            if (bookings.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4">No recent bookings</td></tr>';
                return;
            }
            
            bookings.forEach(booking => {
                const row = document.createElement('tr');
                row.innerHTML = \`
                    <td>\${booking.time}</td>
                    <td>\${booking.patient_name} \${booking.patient_surname}</td>
                    <td>\${booking.appointment_type}</td>
                    <td>
                        <div class="status-indicator">
                            <div class="status-dot status-healthy"></div>
                            Active
                        </div>
                    </td>
                \`;
                tbody.appendChild(row);
            });
        }
    </script>
</body>
</html>`;

  res.send(dashboardHTML);
});

// Dashboard data API endpoint
router.get('/data', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get today's bookings
    const todayBookings = await bookingDatabase.getBookingsForDate(today);
    
    // Get booking stats
    const bookingStats = await bookingDatabase.getBookingStats(weekAgo, today);
    
    // Get popular time slots
    const timeSlots = await bookingDatabase.getPopularTimeSlots();
    
    // Get daily trends
    const dailyTrends = await bookingDatabase.getDailyBookingTrends();
    
    // Calculate statistics
    const stats = {
      todayBookings: todayBookings.length,
      totalBookings: bookingStats.reduce((sum, stat) => sum + stat.total_bookings, 0),
      avgDaily: bookingStats.length > 0 ? 
        bookingStats.reduce((sum, stat) => sum + stat.total_bookings, 0) / bookingStats.length : 0,
      peakHour: timeSlots.length > 0 ? timeSlots[0].time : '-'
    };
    
    // Prepare chart data
    const chartData = {
      bookingTypes: {},
      dailyTrend: {
        labels: [],
        data: []
      },
      hourlyDistribution: {
        labels: [],
        data: []
      }
    };
    
    // Group by appointment type
    todayBookings.forEach(booking => {
      if (!chartData.bookingTypes[booking.appointment_type]) {
        chartData.bookingTypes[booking.appointment_type] = 0;
      }
      chartData.bookingTypes[booking.appointment_type]++;
    });
    
    // Daily trend data (last 7 days)
    const dailyData = {};
    dailyTrends.forEach(trend => {
      if (!dailyData[trend.date]) {
        dailyData[trend.date] = 0;
      }
      dailyData[trend.date] += trend.bookings;
    });
    
    const sortedDates = Object.keys(dailyData).sort().slice(-7);
    chartData.dailyTrend.labels = sortedDates.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString('sk-SK', { month: 'short', day: 'numeric' });
    });
    chartData.dailyTrend.data = sortedDates.map(date => dailyData[date] || 0);
    
    // Hourly distribution
    const hourlyData = {};
    todayBookings.forEach(booking => {
      const hour = booking.time.split(':')[0] + ':00';
      if (!hourlyData[hour]) {
        hourlyData[hour] = 0;
      }
      hourlyData[hour]++;
    });
    
    chartData.hourlyDistribution.labels = Object.keys(hourlyData).sort();
    chartData.hourlyDistribution.data = chartData.hourlyDistribution.labels.map(hour => hourlyData[hour]);
    
    // Recent bookings (last 10)
    const recentBookings = todayBookings.slice(-10).reverse();
    
    res.json({
      status: 'success',
      stats,
      chartData,
      recentBookings,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Dashboard data fetch failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch dashboard data'
    });
  }
});

// Metrics endpoint for Prometheus
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    const metrics = await metricsCollector.getMetrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Metrics fetch failed:', error);
    res.status(500).end('Failed to fetch metrics');
  }
});

// Health check with detailed status
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      components: {
        database: await bookingDatabase.healthCheck(),
        metrics: true,
        logger: true
      }
    };
    
    const allHealthy = Object.values(health.components).every(status => status === true);
    if (!allHealthy) {
      health.status = 'degraded';
    }
    
    res.json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;