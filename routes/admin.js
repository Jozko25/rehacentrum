const express = require('express');
const router = express.Router();
const bookingValidator = require('../services/bookingValidator');
const database = require('../services/database');
const appointmentConfig = require('../config/appointments');

// GET /api/admin/bookings/:date - Get all bookings for a specific date
router.get('/bookings/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const bookings = await database.getBookingsForDate(date);
    
    res.json({
      status: 'success',
      date: date,
      total_bookings: bookings.length,
      bookings: bookings
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch bookings'
    });
  }
});

// GET /api/admin/stats/:date - Get booking statistics for a date
router.get('/stats/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const data = await bookingValidator.getData();
    const dateKey = bookingValidator.generateDateKey(date);
    
    const stats = {
      date: date,
      daily_counts: {},
      shared_main_count: 0,
      sports_count: 0,
      consultation_count: 0
    };
    
    // Count by appointment type
    for (const [key, count] of Object.entries(data.dailyCounts)) {
      if (key.includes(dateKey)) {
        const appointmentType = key.split('-')[0];
        stats.daily_counts[appointmentType] = count;
      }
    }
    
    // Calculate shared counts
    const sharedTypes = ['vstupne_vysetrenie', 'kontrolne_vysetrenie', 'zdravotnicke_pomucky'];
    stats.shared_main_count = sharedTypes.reduce((sum, type) => {
      return sum + (stats.daily_counts[type] || 0);
    }, 0);
    
    stats.sports_count = stats.daily_counts['sportova_prehliadka'] || 0;
    stats.consultation_count = stats.daily_counts['konzultacia'] || 0;
    
    res.json({
      status: 'success',
      stats: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to fetch statistics'
    });
  }
});

// POST /api/admin/vacation - Add vacation dates
router.post('/vacation', async (req, res) => {
  try {
    const { dates } = req.body; // Array of date strings
    
    if (!Array.isArray(dates)) {
      return res.status(400).json({
        status: 'error',
        error: 'Dates must be an array'
      });
    }
    
    // Add to vacation dates (in production, this should update a database)
    appointmentConfig.vacationDates.push(...dates);
    
    res.json({
      status: 'success',
      message: 'Vacation dates added',
      vacation_dates: appointmentConfig.vacationDates
    });
  } catch (error) {
    console.error('Error adding vacation dates:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to add vacation dates'
    });
  }
});

// DELETE /api/admin/vacation - Remove vacation dates
router.delete('/vacation', async (req, res) => {
  try {
    const { dates } = req.body; // Array of date strings
    
    if (!Array.isArray(dates)) {
      return res.status(400).json({
        status: 'error',
        error: 'Dates must be an array'
      });
    }
    
    // Remove from vacation dates
    appointmentConfig.vacationDates = appointmentConfig.vacationDates.filter(
      date => !dates.includes(date)
    );
    
    res.json({
      status: 'success',
      message: 'Vacation dates removed',
      vacation_dates: appointmentConfig.vacationDates
    });
  } catch (error) {
    console.error('Error removing vacation dates:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to remove vacation dates'
    });
  }
});

// GET /api/admin/vacation - Get all vacation dates
router.get('/vacation', (req, res) => {
  res.json({
    status: 'success',
    vacation_dates: appointmentConfig.vacationDates
  });
});

// POST /api/admin/cancel-booking/:bookingId - Cancel a specific booking
router.post('/cancel-booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    
    const booking = await database.getBooking(bookingId);
    if (!booking) {
      return res.status(404).json({
        status: 'error',
        error: 'Booking not found'
      });
    }
    
    // Cancel the booking (this would also send notifications to patient)
    const googleCalendarService = require('../services/googleCalendar');
    await googleCalendarService.deleteEvent(booking.calendarId, bookingId);
    await database.deleteBooking(bookingId);
    
    res.json({
      status: 'success',
      message: 'Booking cancelled',
      booking_id: bookingId,
      reason: reason
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to cancel booking'
    });
  }
});

// GET /api/admin/config - Get current configuration
router.get('/config', (req, res) => {
  res.json({
    status: 'success',
    config: {
      appointment_types: appointmentConfig.appointmentTypes,
      daily_limits: appointmentConfig.dailyLimits,
      working_hours: appointmentConfig.workingHours,
      booking_rules: appointmentConfig.bookingRules,
      holidays: appointmentConfig.holidays,
      vacation_dates: appointmentConfig.vacationDates,
      notifications: appointmentConfig.notifications
    }
  });
});

// GET /api/admin/health - Detailed health check
router.get('/health', async (req, res) => {
  try {
    const googleCalendarService = require('../services/googleCalendar');
    
    const health = {
      timestamp: new Date().toISOString(),
      services: {
        booking_validator: true,
        google_calendar: false,
        notifications: true
      },
      data_file_status: 'unknown'
    };
    
    // Check Google Calendar
    try {
      await googleCalendarService.ensureInitialized();
      health.services.google_calendar = true;
    } catch (error) {
      health.services.google_calendar = false;
      health.google_calendar_error = error.message;
    }
    
    // Check data file
    try {
      await bookingValidator.getData();
      health.data_file_status = 'accessible';
    } catch (error) {
      health.data_file_status = 'error';
      health.data_file_error = error.message;
    }
    
    res.json({
      status: 'success',
      health: health
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;