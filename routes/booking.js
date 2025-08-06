const express = require('express');
const router = express.Router();

const appointmentConfig = require('../config/appointments');
const googleCalendarService = require('../services/googleCalendar');
const bookingValidator = require('../services/bookingValidator');
const database = require('../services/database');
const notificationService = require('../services/notifications');
const DataValidator = require('../utils/validation');
const bookingLock = require('../services/bookingLock');

// Helper function to generate available time slots
function generateTimeSlots(timeSlots, duration, slotInterval = 10) {
  const slots = [];
  
  for (const timeSlot of timeSlots) {
    const [startTime, endTime] = timeSlot.split('-');
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    for (let minutes = startMinutes; minutes + duration <= endMinutes; minutes += slotInterval) {
      const hour = Math.floor(minutes / 60);
      const min = minutes % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      slots.push(timeString);
    }
  }
  
  return slots;
}

// Helper function to find closest available slot
async function findClosestSlot(appointmentType, date, preferredTime) {
  const config = appointmentConfig.appointmentTypes[appointmentType];
  if (!config) return null;
  
  // Check if it's a working day
  if (!bookingValidator.isWorkingDay(date)) {
    return null;
  }
  
  // Get existing events from Google Calendar
  const calendarId = appointmentConfig.calendars.main;
  const dateObj = new Date(date);
  let existingEvents = [];
  
  try {
    existingEvents = await googleCalendarService.getDayEvents(calendarId, dateObj);
  } catch (error) {
    console.error('Error fetching calendar events:', error.message);
    // Continue without calendar checking for now
    console.log('⚠️ Continuing without Google Calendar conflict checking');
  }
  
  const allSlots = generateTimeSlots(config.timeSlots, config.duration);
  const preferredMinutes = timeToMinutes(preferredTime);
  
  // Sort slots by proximity to preferred time
  const sortedSlots = allSlots
    .map(slot => ({
      time: slot,
      minutes: timeToMinutes(slot),
      distance: Math.abs(timeToMinutes(slot) - preferredMinutes)
    }))
    .sort((a, b) => a.distance - b.distance);
  
  // Check each slot for availability
  for (const slot of sortedSlots) {
    // Check booking rules (daily/hourly limits)
    const validation = await bookingValidator.validateBooking(appointmentType, date, slot.time);
    if (!validation.valid) {
      continue;
    }
    
    // Check if slot conflicts with existing Google Calendar events
    const slotStart = new Date(`${date}T${slot.time}:00`);
    const slotEnd = new Date(slotStart.getTime() + config.duration * 60000);
    
    const hasConflict = existingEvents.some(event => {
      if (!event.start || !event.end) return false;
      
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      
      // Check for overlap
      return (slotStart < eventEnd && slotEnd > eventStart);
    });
    
    if (!hasConflict) {
      return slot.time;
    }
  }
  
  return null;
}

function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

// POST /api/booking/webhook - Main webhook endpoint for ElevenLabs
router.post('/webhook', async (req, res) => {
  try {
    const { action, appointment_type, date, time, preferred_time, patient_data } = req.body;
    
    console.log(`📞 Webhook received: ${action} for ${appointment_type} on ${date}`);
    
    switch (action) {
      case 'get_available_slots':
        // Check if it's a working day first and provide helpful info
        const dayOfWeek = new Date(date).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = appointmentConfig.holidays.includes(date);
        
        if (isWeekend) {
          res.send(`Dátum ${date} je víkend. Ordinujeme len v pracovné dni pondelok až piatok.`);
          break;
        } else if (isHoliday) {
          res.send(`Dátum ${date} je sviatok. Prosím vyberte iný dátum.`);
          break;
        }
        
        const availableSlots = await getAvailableSlots(appointment_type, date);
        if (availableSlots.length === 0) {
          res.send(`Na dátum ${date} sú už všetky termíny obsadené. Skúste iný dátum alebo sa informujte o zrušených termínoch.`);
        } else {
          // Return only first 2 slots for AI agent with context
          const limitedSlots = availableSlots.slice(0, 2);
          const slotTimes = limitedSlots.map(slot => slot.time).join(' a ');
          const totalAvailable = availableSlots.length;
          
          res.send(`Dostupné termíny na ${date} sú ${slotTimes}.`);
        }
        break;
        
      case 'find_closest_slot':
        const closestSlot = await findClosestSlot(appointment_type, date, preferred_time);
        if (closestSlot) {
          res.send(`Najbližší voľný termín k vašej požiadavke ${preferred_time} je ${closestSlot.time} na ${date}.`);
        } else {
          // Provide helpful alternatives
          const dayOfWeek = new Date(date).getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          if (isWeekend) {
            res.send(`Dátum ${date} je víkend. Skúste pracovný deň pondelok až piatok.`);
          } else {
            res.send(`Na dátum ${date} nie je dostupný žiadny termín. Skúste iný dátum alebo kontaktujte ordinačku pre možné zrušené termíny.`);
          }
        }
        break;
        
      case 'book_appointment':
        const booking = await bookAppointment({
          appointmentType: appointment_type,
          date,
          time,
          patientData: patient_data
        });
        // Return the message directly as plain text
        res.send(booking.message);
        break;
        
      case 'cancel_appointment':
        const cancellation = await cancelAppointment(req.body.booking_id);
        if (cancellation.cancelled) {
          res.send(`Rezervácia bola úspešne zrušená. Termín je teraz opäť voľný pre iných pacientov.`);
        } else {
          if (cancellation.reason === 'booking_not_found') {
            res.send(`Rezervácia nebola nájdená. Možno bola už predtým zrušená.`);
          } else {
            res.send(`Nepodarilo sa zrušiť rezerváciu. Prosím kontaktujte ordinácku.`);
          }
        }
        break;
        
      case 'check_availability':
        const validation = await bookingValidator.validateBooking(appointment_type, date, time);
        if (validation.valid) {
          res.send(`Termín ${time} na ${date} je dostupný. Môžete pokračovať s rezerváciou.`);
        } else {
          let reason = '';
          switch (validation.reason) {
            case 'not_working_day':
              reason = 'je víkend alebo sviatok';
              break;
            case 'invalid_time_slot':
              reason = 'nie je v ordinačných hodinách';
              break;
            case 'daily_limit_reached':
              reason = 'bol dosiahnutý denný limit rezervácií';
              break;
            case 'hourly_limit_reached':
              reason = 'bol dosiahnutý hodinový limit rezervácií';
              break;
            case 'time_slot_occupied':
              reason = 'je už obsadený';
              break;
            default:
              reason = 'nie je dostupný';
          }
          res.send(`Termín ${time} na ${date} nie je dostupný, pretože ${reason}.`);
        }
        break;
        
      default:
        res.status(400).send('Neplatná požiadavka. Podporované akcie sú: get_available_slots, find_closest_slot, book_appointment, cancel_appointment, check_availability.');
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Nastala chyba pri spracovaní požiadavky. Skúste to znovu.');
  }
});

// Get available slots for a specific appointment type and date
async function getAvailableSlots(appointmentType, date) {
  const config = appointmentConfig.appointmentTypes[appointmentType];
  if (!config) {
    throw new Error('Invalid appointment type');
  }
  
  // Check if it's a working day
  if (!bookingValidator.isWorkingDay(date)) {
    return [];
  }
  
  // Get existing events from Google Calendar
  const calendarId = appointmentConfig.calendars.main;
  const dateObj = new Date(date);
  let existingEvents = [];
  
  try {
    existingEvents = await googleCalendarService.getDayEvents(calendarId, dateObj);
  } catch (error) {
    console.error('Error fetching calendar events:', error.message);
    // Continue without calendar checking for now
    console.log('⚠️ Continuing without Google Calendar conflict checking');
  }
  
  // Generate all possible time slots
  const allSlots = generateTimeSlots(config.timeSlots, config.duration);
  
  // Use optimized bulk validation to reduce database queries
  const validationResults = await bookingValidator.validateMultipleSlots(appointmentType, date, allSlots);
  const availableSlots = [];
  
  // Check Google Calendar conflicts only for slots that passed validation
  for (const result of validationResults) {
    if (!result.valid) {
      continue;
    }
    
    const slot = result.time;
    
    // Check if slot conflicts with existing Google Calendar events
    const slotStart = new Date(`${date}T${slot}:00`);
    const slotEnd = new Date(slotStart.getTime() + config.duration * 60000);
    
    const hasConflict = existingEvents.some(event => {
      if (!event.start || !event.end) return false;
      
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      
      // Check for overlap
      return (slotStart < eventEnd && slotEnd > eventStart);
    });
    
    if (!hasConflict) {
      availableSlots.push({
        time: slot,
        appointment_type: config.name,
        duration: config.duration,
        price: config.price,
        instructions: config.instructions
      });
    }
  }
  
  return availableSlots;
}

// Book an appointment
async function bookAppointment(bookingData) {
  const { appointmentType, date, time, patientData } = bookingData;
  const config = appointmentConfig.appointmentTypes[appointmentType];
  
  if (!config) {
    throw new Error('Invalid appointment type');
  }
  
  // Parse patient data if it's a JSON string (from ElevenLabs)
  let parsedPatientData = patientData;
  if (typeof patientData === 'string') {
    try {
      parsedPatientData = JSON.parse(patientData);
      console.log('🔍 Parsed patient data:', parsedPatientData);
    } catch (e) {
      console.error('❌ Failed to parse patient data:', patientData);
      return {
        booked: 'no',
        error: 'invalid_patient_data',
        message: 'Neplatný formát údajov pacienta'
      };
    }
  } else {
    console.log('🔍 Patient data (object):', parsedPatientData);
  }
  
  // Validate patient data (GDPR compliant)
  const dataValidation = DataValidator.validatePatientData(parsedPatientData, appointmentType);
  if (!dataValidation.valid) {
    return {
      booked: 'no',
      error: 'invalid_patient_data',
      message: 'Neplatné údaje pacienta: ' + dataValidation.errors.join(', ')
    };
  }
  
  // Validate booking
  const validation = await bookingValidator.validateBooking(appointmentType, date, time);
  if (!validation.valid) {
    // Find closest available alternative
    const suggestion = await findAlternativeSlot(appointmentType, date, time, validation.reason);
    return {
      booked: 'no',
      error: validation.reason,
      message: getErrorMessageWithSuggestion(validation.reason, suggestion)
    };
  }
  
  try {
    // Try to acquire lock for this time slot
    const lockAcquired = await bookingLock.acquireLock(date, time);
    if (!lockAcquired) {
      // Find closest available alternative
      const suggestion = await findAlternativeSlot(appointmentType, date, time, 'time_slot_occupied');
      return {
        booked: 'no',
        error: 'time_slot_occupied',
        message: getErrorMessageWithSuggestion('time_slot_occupied', suggestion)
      };
    }

    try {
      // Final conflict check right before creating event (to prevent race conditions)
      const calendarId = appointmentConfig.calendars[config.calendar];
      const startDateTime = new Date(`${date}T${time}:00+02:00`);
      const endDateTime = new Date(startDateTime.getTime() + config.duration * 60000);
      
      // Check Google Calendar for conflicts at the exact moment of booking
      const dateObj = new Date(date);
      const existingEvents = await googleCalendarService.getDayEvents(calendarId, dateObj);
      
      // Check for exact time overlap (not just general overlap)
      const hasExactConflict = existingEvents.some(event => {
        if (!event.start || !event.end) return false;
        
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        
        // Check for exact time match (same start time) - this is stricter
        const eventStartTime = eventStart.toTimeString().substring(0, 5);
        const bookingStartTime = startDateTime.toTimeString().substring(0, 5);
        
        return eventStartTime === bookingStartTime;
      });
      
      if (hasExactConflict) {
        await bookingLock.releaseLock(date, time);
        console.log(`❌ Exact time conflict detected for ${date} at ${time}`);
        // Find closest available alternative
        const suggestion = await findAlternativeSlot(appointmentType, date, time, 'time_slot_occupied');
        return {
          booked: 'no',
          error: 'time_slot_occupied',
          message: getErrorMessageWithSuggestion('time_slot_occupied', suggestion)
        };
      }
      
      const event = await googleCalendarService.createEvent(calendarId, {
        summary: `${config.name} - ${dataValidation.normalizedData.meno} ${dataValidation.normalizedData.priezvisko}`,
        start: startDateTime,
        duration: config.duration,
        description: JSON.stringify(dataValidation.normalizedData),
        attendees: []
      });
      
      // Keep lock until after calendar event is created successfully
      // Release lock after successful creation
      await bookingLock.releaseLock(date, time);
      
      // Add booking to database with normalized data
      await database.createBooking({
        id: event.id,
        appointment_type: appointmentType,
        date,
        time,
        patient_name: dataValidation.normalizedData.name,
        patient_surname: dataValidation.normalizedData.surname,
        patient_phone: dataValidation.normalizedData.phone,
        patient_complaints: dataValidation.normalizedData.complaints || null,
        calendar_id: calendarId,
        event_id: event.id
      });
      
      // Send notifications (don't wait for completion)
      notificationService.sendBookingNotifications({
        ...dataValidation.normalizedData,
        appointmentType: config.name,
        date,
        time,
        instructions: config.instructions,
        price: config.price,
        bookingId: event.id
      }).catch(error => {
        console.error('Notification error:', error);
      });
      
      console.log(`✅ Booking created: ${event.id} for ${dataValidation.normalizedData.meno} ${dataValidation.normalizedData.priezvisko}`);
      
      // Generate confirmation message with instructions
      let confirmationMessage = `Termín rezervovaný na ${date} o ${time}. ${appointmentConfig.bookingRules.orientacnyTimeMessage}.`;
      
      if (config.instructions) {
        confirmationMessage += ` ${config.instructions}`;
      }
      
      if (config.price) {
        confirmationMessage += ` Cena: ${config.price}€.`;
      }
      
      return {
        booked: 'yes',
        booking_id: event.id,
        appointment_type: config.name,
        date: date,
        time: time,
        message: confirmationMessage
      };
      
    } catch (innerError) {
      // Release lock on any error
      await bookingLock.releaseLock(date, time);
      console.error('Inner booking creation error:', innerError);
      return {
        booked: 'no',
        error: 'Failed to create booking',
        message: 'Nepodarilo sa vytvoriť rezerváciu. Skúste to znovu.'
      };
    }
    
  } catch (error) {
    // This should not happen since we handle the lock acquisition above
    console.error('Outer booking creation error:', error);
    return {
      booked: 'no',
      error: 'Failed to create booking',
      message: 'Nepodarilo sa vytvoriť rezerváciu. Skúste to znovu.'
    };
  }
}

// Cancel an appointment
async function cancelAppointment(bookingId) {
  try {
    const booking = await database.getBooking(bookingId);
    if (!booking) {
      return {
        status: 'error',
        cancelled: false,
        error: 'Booking not found'
      };
    }
    
    // Delete from Google Calendar
    await googleCalendarService.deleteEvent(booking.calendarId, bookingId);
    
    // Remove from local tracking
    await database.deleteBooking(bookingId);
    
    return {
      status: 'success',
      cancelled: true,
      booking_id: bookingId,
      message: 'Rezervácia bola zrušená.'
    };
  } catch (error) {
    console.error('Cancellation error:', error);
    return {
      status: 'error',
      cancelled: false,
      error: 'Failed to cancel booking'
    };
  }
}

// Find alternative slot when booking fails
async function findAlternativeSlot(appointmentType, originalDate, originalTime, reason) {
  const config = appointmentConfig.appointmentTypes[appointmentType];
  if (!config) return null;

  try {
    // First try to find slots on the same day
    const sameDaySlot = await findClosestSlot(appointmentType, originalDate, originalTime);
    if (sameDaySlot && sameDaySlot !== originalTime) {
      return { date: originalDate, time: sameDaySlot, sameDay: true };
    }

    // If same day doesn't work, try next few working days
    const startDate = new Date(originalDate);
    for (let i = 1; i <= 14; i++) { // Check next 14 days
      const nextDate = new Date(startDate);
      nextDate.setDate(startDate.getDate() + i);
      const dateString = nextDate.toISOString().split('T')[0];
      
      // Skip if not a working day
      if (!bookingValidator.isWorkingDay(dateString)) {
        continue;
      }

      // Find closest slot on this day
      const nextDaySlot = await findClosestSlot(appointmentType, dateString, originalTime);
      if (nextDaySlot) {
        return { date: dateString, time: nextDaySlot, sameDay: false };
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding alternative slot:', error);
    return null;
  }
}

function getErrorMessage(reason) {
  const messages = {
    'invalid_appointment_type': 'Neplatný typ vyšetrenia',
    'not_working_day': 'V tento deň ordinujeme nezaţujeme',
    'invalid_time_slot': 'Neplatný čas pre tento typ vyšetrenia',
    'time_slot_occupied': 'Tento termín je už obsadený',
    'daily_limit_reached': 'Denný limit pre tento typ vyšetrenia je naplnený',
    'shared_daily_limit_reached': 'Denný limit pre vyšetrenia je naplnený (max 8 pacientov)',
    'hourly_limit_reached': 'Hodinový limit je naplnený'
  };
  
  return messages[reason] || 'Neznáma chyba';
}

function getErrorMessageWithSuggestion(reason, suggestion) {
  const baseMessage = getErrorMessage(reason);
  
  if (!suggestion) {
    // No alternative found
    if (reason === 'daily_limit_reached' || reason === 'shared_daily_limit_reached') {
      return `${baseMessage}. Na najbližšie dni už nie sú voľné termíny.`;
    }
    if (reason === 'not_working_day') {
      return `${baseMessage}. Skúste pracovný deň.`;
    }
    if (reason === 'invalid_time_slot') {
      return `${baseMessage}. Skúste iný čas podľa ordinačných hodín.`;
    }
    return `${baseMessage}. Momentálne nie sú voľné žiadne termíny.`;
  }

  // Format suggestion
  const suggestionDate = new Date(suggestion.date);
  const dayNames = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
  const monthNames = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 
                      'júl', 'august', 'september', 'október', 'november', 'december'];
  
  const dayName = dayNames[suggestionDate.getDay()];
  const monthName = monthNames[suggestionDate.getMonth()];
  const dayOfMonth = suggestionDate.getDate();
  
  if (suggestion.sameDay) {
    return `${baseMessage}. Najbližší voľný termín je dnes o ${suggestion.time}.`;
  } else {
    return `${baseMessage}. Najbližší voľný termín je ${dayName} ${dayOfMonth}. ${monthName} o ${suggestion.time}.`;
  }
}

// GET /api/booking/appointment-types - Get all appointment types and their config
router.get('/appointment-types', (req, res) => {
  const types = Object.keys(appointmentConfig.appointmentTypes).map(key => ({
    key,
    name: appointmentConfig.appointmentTypes[key].name,
    duration: appointmentConfig.appointmentTypes[key].duration,
    price: appointmentConfig.appointmentTypes[key].price,
    instructions: appointmentConfig.appointmentTypes[key].instructions,
    timeSlots: appointmentConfig.appointmentTypes[key].timeSlots
  }));
  
  res.json({
    status: 'success',
    appointment_types: types
  });
});

// GET /api/booking/working-hours - Get working hours
router.get('/working-hours', (req, res) => {
  res.json({
    status: 'success',
    working_hours: appointmentConfig.workingHours,
    holidays: appointmentConfig.holidays,
    vacation_dates: appointmentConfig.vacationDates
  });
});

module.exports = router;