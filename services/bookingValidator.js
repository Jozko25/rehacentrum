const appointmentConfig = require('../config/appointments');
const database = require('./database');

class BookingValidator {
  constructor() {
    // SQLite database is handled by the database service
  }

  // SQLite database operations are handled by database service

  generateDateKey(date) {
    return new Date(date).toISOString().split('T')[0];
  }

  generateHourKey(date, hour) {
    const dateKey = this.generateDateKey(date);
    return `${dateKey}-${hour.toString().padStart(2, '0')}`;
  }

  isWeekend(date) {
    // Use Slovak timezone to determine day of week
    const utcDate = new Date(date);
    const slovakDate = new Date(utcDate.toLocaleString("en-US", {timeZone: "Europe/Bratislava"}));
    const day = slovakDate.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  isHoliday(date) {
    const dateKey = this.generateDateKey(date);
    return appointmentConfig.holidays.includes(dateKey);
  }

  isVacationDay(date) {
    const dateKey = this.generateDateKey(date);
    return appointmentConfig.vacationDates.includes(dateKey);
  }

  isWorkingDay(date) {
    return !this.isWeekend(date) && !this.isHoliday(date) && !this.isVacationDay(date);
  }

  isTimeInSlot(time, timeSlot) {
    const [start, end] = timeSlot.split('-');
    return time >= start && time < end;
  }

  isValidTimeSlot(appointmentType, time) {
    const config = appointmentConfig.appointmentTypes[appointmentType];
    if (!config) return false;

    return config.timeSlots.some(slot => this.isTimeInSlot(time, slot));
  }

  async getDailyCount(appointmentType, date) {
    return await database.getDailyCount(appointmentType, date);
  }

  async getSharedDailyCount(appointmentTypes, date) {
    let total = 0;
    for (const type of appointmentTypes) {
      const count = await database.getDailyCount(type, date);
      total += count;
    }
    return total;
  }

  async getHourlyCount(appointmentType, date, time) {
    const hour = parseInt(time.split(':')[0]);
    return await database.getHourlyCount(appointmentType, date, hour);
  }

  // Count management is now handled by the database service

  // Basic validation without database limits - for use when Google Calendar is primary source
  async validateBasicConstraints(appointmentType, date, time) {
    const config = appointmentConfig.appointmentTypes[appointmentType];
    if (!config) {
      return { valid: false, reason: 'invalid_appointment_type' };
    }

    // Check if it's a working day
    if (!this.isWorkingDay(date)) {
      return { valid: false, reason: 'not_working_day' };
    }

    // Check if time slot is valid for this appointment type
    if (!this.isValidTimeSlot(appointmentType, time)) {
      return { valid: false, reason: 'invalid_time_slot' };
    }

    // Skip database limits - rely on Google Calendar for conflict detection
    return { valid: true };
  }

  async validateBooking(appointmentType, date, time) {
    const config = appointmentConfig.appointmentTypes[appointmentType];
    if (!config) {
      return { valid: false, reason: 'invalid_appointment_type' };
    }

    // Check if it's a working day
    if (!this.isWorkingDay(date)) {
      return { valid: false, reason: 'not_working_day' };
    }

    // Check if time slot is valid for this appointment type
    if (!this.isValidTimeSlot(appointmentType, time)) {
      return { valid: false, reason: 'invalid_time_slot' };
    }

    // Calendar conflict checking is done at route level with Google Calendar API
    // Database is only used for counting, not conflict detection

    // Check daily limits
    if (config.maxPerDay) {
      const dailyCount = await this.getDailyCount(appointmentType, date);
      if (dailyCount >= config.maxPerDay) {
        return { valid: false, reason: 'daily_limit_reached' };
      }
    }

    // Check shared daily limits (for main types)
    if (config.sharedDailyLimit) {
      const sharedTypes = ['vstupne_vysetrenie', 'kontrolne_vysetrenie', 'zdravotnicke_pomucky'];
      const sharedCount = await this.getSharedDailyCount(sharedTypes, date);
      if (sharedCount >= appointmentConfig.dailyLimits.mainTypes) {
        return { valid: false, reason: 'shared_daily_limit_reached' };
      }
    }

    // Check hourly limits
    if (config.maxPerHour) {
      const hourlyCount = await this.getHourlyCount(appointmentType, date, time);
      if (hourlyCount >= config.maxPerHour) {
        return { valid: false, reason: 'hourly_limit_reached' };
      }
    }

    return { valid: true };
  }

  // Booking CRUD operations are now handled by the database service

  // Basic bulk validation without database limits
  async validateMultipleSlotsBasic(appointmentType, date, timeSlots) {
    const config = appointmentConfig.appointmentTypes[appointmentType];
    if (!config) {
      return timeSlots.map(time => ({ time, valid: false, reason: 'invalid_appointment_type' }));
    }

    // Check if it's a working day (same for all slots)
    if (!this.isWorkingDay(date)) {
      return timeSlots.map(time => ({ time, valid: false, reason: 'not_working_day' }));
    }

    // Validate each time slot without database checks
    return timeSlots.map(time => {
      if (!this.isValidTimeSlot(appointmentType, time)) {
        return { time, valid: false, reason: 'invalid_time_slot' };
      }
      return { time, valid: true };
    });
  }

  // Optimized bulk validation to reduce database queries
  async validateMultipleSlots(appointmentType, date, timeSlots) {
    const config = appointmentConfig.appointmentTypes[appointmentType];
    if (!config) {
      return timeSlots.map(time => ({ time, valid: false, reason: 'invalid_appointment_type' }));
    }

    // Check if it's a working day (same for all slots)
    if (!this.isWorkingDay(date)) {
      return timeSlots.map(time => ({ time, valid: false, reason: 'not_working_day' }));
    }

    // Pre-fetch daily count once
    const dailyCount = config.maxPerDay ? await this.getDailyCount(appointmentType, date) : 0;
    
    // Pre-fetch shared daily count once if needed
    let sharedDailyCount = 0;
    if (config.sharedDailyLimit && config.sharedWith) {
      sharedDailyCount = await this.getSharedDailyCount(config.sharedWith, date);
    }

    // Group slots by hour to minimize hourly count queries
    const hourlyGroups = {};
    for (const time of timeSlots) {
      const hour = parseInt(time.split(':')[0]);
      if (!hourlyGroups[hour]) {
        hourlyGroups[hour] = [];
      }
      hourlyGroups[hour].push(time);
    }

    // Pre-fetch hourly counts for all relevant hours
    const hourlyCounts = {};
    if (config.maxPerHour) {
      for (const hour of Object.keys(hourlyGroups)) {
        hourlyCounts[hour] = await database.getHourlyCount(appointmentType, date, parseInt(hour));
      }
    }

    // Validate each slot using pre-fetched data
    const results = [];
    for (const time of timeSlots) {
      const hour = parseInt(time.split(':')[0]);
      
      // Check if time slot is valid for this appointment type
      if (!this.isValidTimeSlot(appointmentType, time)) {
        results.push({ time, valid: false, reason: 'invalid_time_slot' });
        continue;
      }

      // Check daily limits using pre-fetched data
      if (config.maxPerDay && dailyCount >= config.maxPerDay) {
        results.push({ time, valid: false, reason: 'daily_limit_reached' });
        continue;
      }

      // Check shared daily limits using pre-fetched data
      if (config.sharedDailyLimit && sharedDailyCount >= config.sharedDailyLimit) {
        results.push({ time, valid: false, reason: 'daily_limit_reached' });
        continue;
      }

      // Check hourly limits using pre-fetched data
      if (config.maxPerHour && hourlyCounts[hour] >= config.maxPerHour) {
        results.push({ time, valid: false, reason: 'hourly_limit_reached' });
        continue;
      }

      // Note: Google Calendar conflict checking is handled at route level
      // to avoid duplicate Google Calendar API calls
      
      results.push({ time, valid: true });
    }

    return results;
  }

  async checkExactTimeConflict(appointmentType, date, time) {
    // Import Google Calendar service
    const googleCalendarService = require('./googleCalendar');
    const appointmentConfig = require('../config/appointments');
    
    const config = appointmentConfig.appointmentTypes[appointmentType];
    if (!config) return false;
    
    try {
      // Get existing events from Google Calendar
      const calendarId = appointmentConfig.calendars.main;
      const dateObj = new Date(date);
      const existingEvents = await googleCalendarService.getDayEvents(calendarId, dateObj);
      
      // Check if proposed time slot conflicts with any existing Google Calendar event
      const slotStart = new Date(`${date}T${time}:00+02:00`);
      const slotEnd = new Date(slotStart.getTime() + config.duration * 60000);
      
      const hasConflict = existingEvents.some(event => {
        if (!event.start || !event.end) return false;
        
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        
        // Check for overlap
        return (slotStart < eventEnd && slotEnd > eventStart);
      });
      
      return hasConflict;
      
    } catch (error) {
      console.error('Error checking Google Calendar conflicts:', error.message);
      // Fallback to database check if Google Calendar fails
      const bookings = await database.getBookingsForDate(date);
      for (const booking of bookings) {
        if (booking.date === date && booking.time === time) {
          return true;
        }
      }
      return false;
    }
  }
}

// Singleton instance
const bookingValidator = new BookingValidator();

module.exports = bookingValidator;