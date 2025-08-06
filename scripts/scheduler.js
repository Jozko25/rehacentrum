const cron = require('node-cron');
const bookingValidator = require('../services/bookingValidator');
const database = require('../services/database');
const notificationService = require('../services/notifications');

// Schedule reminder notifications to run every day at 18:00 (6 PM)
cron.schedule('0 18 * * *', async () => {
  console.log('🔔 Running daily reminder notifications...');
  
  try {
    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    
    // Get all bookings for tomorrow
    const bookings = await database.getBookingsForDate(tomorrowDate);
    
    if (bookings.length > 0) {
      console.log(`📅 Found ${bookings.length} bookings for tomorrow (${tomorrowDate})`);
      await notificationService.sendReminderNotifications(bookings);
      console.log('✅ Reminder notifications sent successfully');
    } else {
      console.log(`📅 No bookings found for tomorrow (${tomorrowDate})`);
    }
    
  } catch (error) {
    console.error('❌ Error sending reminder notifications:', error);
  }
});

// Schedule data cleanup to run every Sunday at 02:00
cron.schedule('0 2 * * 0', async () => {
  console.log('🧹 Running weekly data cleanup...');
  
  try {
    const data = await bookingValidator.getData();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let cleanedBookings = 0;
    let cleanedCounts = 0;
    
    // Clean old bookings
    for (const [bookingId, booking] of Object.entries(data.bookings)) {
      const bookingDate = new Date(booking.date);
      if (bookingDate < thirtyDaysAgo) {
        delete data.bookings[bookingId];
        cleanedBookings++;
      }
    }
    
    // Clean old daily counts
    for (const [key, count] of Object.entries(data.dailyCounts)) {
      const dateKey = key.split('-').slice(-1)[0]; // Get date part
      const date = new Date(dateKey);
      if (date < thirtyDaysAgo) {
        delete data.dailyCounts[key];
        cleanedCounts++;
      }
    }
    
    // Clean old hourly counts
    for (const [key, count] of Object.entries(data.hourlyCounts)) {
      const dateKey = key.split('-').slice(-2, -1)[0]; // Get date part
      const date = new Date(dateKey);
      if (date < thirtyDaysAgo) {
        delete data.hourlyCounts[key];
        cleanedCounts++;
      }
    }
    
    await bookingValidator.saveData();
    
    console.log(`✅ Cleanup completed: ${cleanedBookings} old bookings and ${cleanedCounts} old counts removed`);
    
  } catch (error) {
    console.error('❌ Error during data cleanup:', error);
  }
});

// Schedule health check to run every hour
cron.schedule('0 * * * *', async () => {
  try {
    const googleCalendarService = require('../services/googleCalendar');
    
    // Test Google Calendar connection
    await googleCalendarService.ensureInitialized();
    
    // Test data file access
    await bookingValidator.getData();
    
    console.log('✅ Hourly health check passed');
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    // In production, you might want to send alert notifications here
    // For example, send SMS to fallback number about system issues
  }
});

console.log('⏰ Scheduled tasks initialized:');
console.log('   - Daily reminders: 18:00');
console.log('   - Weekly cleanup: Sunday 02:00');
console.log('   - Hourly health check');