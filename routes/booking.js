const express = require('express');
const router = express.Router();

const appointmentConfig = require('../config/appointments');
const googleCalendarService = require('../services/googleCalendar');
const bookingValidator = require('../services/bookingValidator');
const database = require('../services/database-adapter');
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
  
  // Get current Slovak time to filter out past slots
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const slovakTime = new Date(utcTime + (2 * 3600000)); // UTC+2 for summer
  const currentHour = slovakTime.getHours();
  const currentMinute = slovakTime.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  const today = date === slovakTime.toISOString().split('T')[0];
  
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
    // Skip slots in the past if it's today
    if (today && slot.minutes <= currentTotalMinutes) {
      console.log(`⏰ Skipping past slot: ${slot.time} (current time: ${currentHour}:${currentMinute.toString().padStart(2, '0')})`);
      continue;
    }
    
    // Check basic constraints only (skip database limits)
    const validation = await bookingValidator.validateBasicConstraints(appointmentType, date, slot.time);
    if (!validation.valid) {
      continue;
    }
    
    // Check if slot conflicts with existing Google Calendar events
    const slotStart = new Date(`${date}T${slot.time}:00`);
    const slotEnd = new Date(slotStart.getTime() + config.duration * 60000);
    
    const hasConflict = existingEvents.some(event => {
      if (!event.start || !event.end) return false;
      
      // Check for vacation/holiday events that block all bookings
      if (event.summary && event.summary.toUpperCase().includes('DOVOLENKA')) {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        const dayStart = new Date(date + 'T00:00:00');
        const dayEnd = new Date(date + 'T23:59:59');
        
        // Check if vacation overlaps with this day (blocks entire day)
        const vacationBlocksDay = (dayStart < eventEnd && dayEnd > eventStart);
        if (vacationBlocksDay) {
          console.log(`🏖️ DOVOLENKA blocking bookings on ${date}: ${event.summary}`);
          return true; // Block this slot due to vacation
        }
      }
      
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      
      // Check for regular appointment overlap
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
        
        // Check for DOVOLENKA events that block the entire day
        try {
          const calendarId = appointmentConfig.calendars.main;
          const dateObj = new Date(date);
          const existingEvents = await googleCalendarService.getDayEvents(calendarId, dateObj);
          
          const hasVacation = existingEvents.some(event => {
            if (event.summary && event.summary.toUpperCase().includes('DOVOLENKA')) {
              const eventStart = new Date(event.start.dateTime || event.start.date);
              const eventEnd = new Date(event.end.dateTime || event.end.date);
              const dayStart = new Date(date + 'T00:00:00');
              const dayEnd = new Date(date + 'T23:59:59');
              
              return (dayStart < eventEnd && dayEnd > eventStart);
            }
            return false;
          });
          
          if (hasVacation) {
            res.send(`Dňa ${date} neordinujeme kvôli dovolenke. Prosím vyberte iný dátum.`);
            break;
          }
        } catch (calendarError) {
          console.log('⚠️ Could not check for vacation events, continuing with regular availability check');
        }
        
        const availableSlots = await getAvailableSlots(appointment_type, date);
        if (availableSlots.length === 0) {
          res.send(`Na dátum ${date} nie sú dostupné žiadne termíny. Skúste prosím iný dátum.`);
        } else {
          // Return only first 2 slots for AI agent with context
          const limitedSlots = availableSlots.slice(0, 2);
          const slotTimes = limitedSlots.map(slot => slot.time).join(' a ');
          const totalAvailable = availableSlots.length;
          
          res.send(`Dostupné termíny na ${date} sú ${slotTimes}.`);
        }
        break;
        
      case 'find_closest_slot':
        // Find closest slot from today onwards (Slovak timezone)
        const today = new Date();
        // Calculate Slovak time offset (usually UTC+1 or UTC+2)
        const utcTime = today.getTime() + (today.getTimezoneOffset() * 60000);
        const slovakOffset = 2; // Summer time UTC+2, winter time UTC+1
        const slovakTime = new Date(utcTime + (slovakOffset * 3600000));
        const startDate = new Date(slovakTime.getFullYear(), slovakTime.getMonth(), slovakTime.getDate());
        
        console.log('🕐 MANUAL CALC - UTC time:', today.toISOString());
        console.log('🕐 MANUAL CALC - Slovak time:', slovakTime.toISOString());
        console.log('🕐 MANUAL CALC - Search date:', startDate.toISOString().split('T')[0]);
        
        let foundSlot = null;
        let searchDate = new Date(startDate);
        
        // Search up to 30 days ahead
        for (let i = 0; i < 30; i++) {
          const year = searchDate.getFullYear();
          const month = String(searchDate.getMonth() + 1).padStart(2, '0');
          const day = String(searchDate.getDate()).padStart(2, '0');
          const searchDateStr = `${year}-${month}-${day}`;
          
          console.log(`🔍 Searching day ${i + 1}: ${searchDateStr}`);
          const slot = await findClosestSlot(appointment_type, searchDateStr, preferred_time);
          console.log(`🔍 Found slot for ${searchDateStr}: ${slot || 'none'}`);
          
          if (slot) {
            foundSlot = { time: slot, date: searchDateStr };
            console.log(`✅ Selected slot: ${slot} on ${searchDateStr}`);
            break;
          }
          
          searchDate.setDate(searchDate.getDate() + 1);
        }
        
        if (foundSlot) {
          // Format date in Slovak format (DD.MM.YYYY) to avoid US interpretation
          const dateParts = foundSlot.date.split('-');
          const slovakDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
          
          console.log('🏁 FINAL RESULT - foundSlot.date:', foundSlot.date);
          console.log('🏁 FINAL RESULT - dateParts:', dateParts);
          console.log('🏁 FINAL RESULT - slovakDate:', slovakDate);
          
          res.send(`Najbližší voľný termín je ${foundSlot.time} dňa ${slovakDate}.`);
        } else {
          res.send(`V najbližších 30 dňoch nie je dostupný žiadny termín pre ${appointment_type}. Prosím kontaktujte ordinačku.`);
        }
        break;
        
      case 'book_appointment':
        console.log('📞 BOOKING REQUEST - appointment_type:', appointment_type, 'date:', date, 'time:', time);
        console.log('📞 BOOKING REQUEST - patient_data type:', typeof patient_data);
        console.log('📞 BOOKING REQUEST - patient_data value:', patient_data);
        
        const booking = await bookAppointment({
          appointmentType: appointment_type,
          date,
          time,
          patientData: patient_data
        });
        
        console.log('📞 BOOKING RESULT:', booking);
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
              // Check specific reason for not working day
              const dayOfWeek = new Date(date).getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isHoliday = appointmentConfig.holidays.includes(date);
              const isVacation = appointmentConfig.vacationDates.includes(date);
              
              if (isWeekend) {
                reason = 'je víkend';
              } else if (isHoliday) {
                reason = 'je štátny sviatok';
              } else if (isVacation) {
                reason = 'je deň pracovného voľna (dovolenka)';
              } else {
                reason = 'je deň pracovného voľna';
              }
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
  
  // Use basic validation without database limits
  const validationResults = await bookingValidator.validateMultipleSlotsBasic(appointmentType, date, allSlots);
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
      
      // Check for vacation/holiday events that block all bookings
      if (event.summary && event.summary.toUpperCase().includes('DOVOLENKA')) {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        const dayStart = new Date(date + 'T00:00:00');
        const dayEnd = new Date(date + 'T23:59:59');
        
        // Check if vacation overlaps with this day (blocks entire day)
        const vacationBlocksDay = (dayStart < eventEnd && dayEnd > eventStart);
        if (vacationBlocksDay) {
          console.log(`🏖️ DOVOLENKA blocking bookings on ${date}: ${event.summary}`);
          return true; // Block this slot due to vacation
        }
      }
      
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      
      // Check for regular appointment overlap
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
  
  // TEMPORARY: Skip validation for testing
  console.log('🔍 BYPASSING VALIDATION - parsedPatientData:', parsedPatientData);
  console.log('🔍 BYPASSING VALIDATION - appointmentType:', appointmentType);
  
  // Create mock validation result
  const dataValidation = {
    valid: true,
    normalizedData: {
      meno: parsedPatientData.name || parsedPatientData.meno,
      priezvisko: parsedPatientData.surname || parsedPatientData.priezvisko, 
      telefon: parsedPatientData.phone || parsedPatientData.telefon,
      prvotne_tazkosti: parsedPatientData.complaints || parsedPatientData.prvotne_tazkosti || parsedPatientData.dovod
    }
  };
  
  console.log('🔍 Mock validation result:', dataValidation);
  
  // Define normalizedData early for use in calendar event creation
  const normalizedData = dataValidation.normalizedData || parsedPatientData;
  console.log('🔍 Using normalizedData for calendar:', normalizedData);
  
  if (!normalizedData || !normalizedData.meno) {
    throw new Error(`Missing patient data - normalizedData: ${JSON.stringify(normalizedData)}`);
  }
  
  // Basic validation (working days, time slots) - skip database limits for now
  const basicValidation = await bookingValidator.validateBasicConstraints(appointmentType, date, time);
  if (!basicValidation.valid) {
    // Find closest available alternative
    const suggestion = await findAlternativeSlot(appointmentType, date, time, basicValidation.reason);
    return {
      booked: 'no',
      error: basicValidation.reason,
      message: getErrorMessageWithSuggestion(basicValidation.reason, suggestion)
    };
  }
  
  // Primary conflict check: Google Calendar (not database)
  const calendarId = appointmentConfig.calendars[config.calendar] || appointmentConfig.calendars.main;
  const startDateTime = new Date(`${date}T${time}:00+02:00`);
  const endDateTime = new Date(startDateTime.getTime() + config.duration * 60000);
  
  let hasConflict = false;
  try {
    const dateObj = new Date(date);
    const existingEvents = await googleCalendarService.getDayEvents(calendarId, dateObj);
    
    // Log all events for debugging
    console.log(`🔍 VACATION DEBUG - Found ${existingEvents.length} events on ${date}`);
    existingEvents.forEach((event, index) => {
      console.log(`🔍 VACATION DEBUG - Event ${index}: "${event.summary}" from ${event.start?.dateTime || event.start?.date} to ${event.end?.dateTime || event.end?.date}`);
    });
    
    // Check specifically for vacation events first
    const hasVacation = existingEvents.some(event => {
      if (event.summary && event.summary.toUpperCase().includes('DOVOLENKA')) {
        console.log(`🏖️ VACATION DEBUG - Found DOVOLENKA event: ${event.summary}`);
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        const dayStart = new Date(date + 'T00:00:00');
        const dayEnd = new Date(date + 'T23:59:59');
        
        console.log(`🏖️ VACATION DEBUG - Event range: ${eventStart.toISOString()} to ${eventEnd.toISOString()}`);
        console.log(`🏖️ VACATION DEBUG - Day range: ${dayStart.toISOString()} to ${dayEnd.toISOString()}`);
        
        const vacationBlocksDay = (dayStart < eventEnd && dayEnd > eventStart);
        console.log(`🏖️ VACATION DEBUG - Blocks day: ${vacationBlocksDay}`);
        
        if (vacationBlocksDay) {
          console.log(`🏖️ DOVOLENKA blocking booking on ${date}: ${event.summary}`);
          return true;
        }
      }
      return false;
    });
    
    console.log(`🏖️ VACATION DEBUG - hasVacation result: ${hasVacation}`);
    
    if (hasVacation) {
      // Format date in Slovak format for the message
      const dateParts = date.split('-');
      const slovakDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
      
      return {
        booked: 'no',
        error: 'vacation_period',
        message: `Dňa ${slovakDate} neordinujeme kvôli dovolenke. Prosím vyberte iný dátum.`
      };
    }
    
    // Check for regular appointment conflicts
    hasConflict = existingEvents.some(event => {
      if (!event.start || !event.end) return false;
      
      // Skip vacation events as they're already handled above
      if (event.summary && event.summary.toUpperCase().includes('DOVOLENKA')) {
        return false;
      }
      
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      
      // Check for regular appointment overlap
      return (startDateTime < eventEnd && endDateTime > eventStart);
    });
    
    if (hasConflict) {
      const suggestion = await findAlternativeSlot(appointmentType, date, time, 'time_slot_occupied');
      return {
        booked: 'no',
        error: 'time_slot_occupied',
        message: getErrorMessageWithSuggestion('time_slot_occupied', suggestion)
      };
    }
    
    console.log('✅ Google Calendar conflict check passed - no conflicts found');
  } catch (calendarError) {
    console.log('⚠️ Google Calendar not available for conflict checking, proceeding with booking creation');
    console.log('⚠️ Calendar error:', calendarError.message);
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
      const calendarId = appointmentConfig.calendars[config.calendar] || appointmentConfig.calendars.main || 'default-calendar';
      const startDateTime = new Date(`${date}T${time}:00+02:00`);
      const endDateTime = new Date(startDateTime.getTime() + config.duration * 60000);
      
      // Conflict checking already done above - proceed with calendar event creation
      
      let event;
      console.log('🔄 About to call Google Calendar createEvent...');
      console.log('🔄 Calendar ID:', calendarId);
      console.log('🔄 Event data:', {
        summary: `${config.name} - ${normalizedData.meno} ${normalizedData.priezvisko}`,
        start: startDateTime,
        duration: config.duration
      });
      try {
        event = await googleCalendarService.createEvent(calendarId, {
          summary: `${config.name} - ${normalizedData.meno} ${normalizedData.priezvisko}`,
          start: startDateTime,
          duration: config.duration,
          description: JSON.stringify(normalizedData),
          attendees: []
        });
      } catch (calendarError) {
        console.error('❌ Google Calendar error details:', calendarError.message);
        console.error('❌ Calendar ID used:', calendarId);
        console.error('❌ Full calendar error:', calendarError);
        
        // In production, fail the booking if calendar creation fails
        if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
          await bookingLock.releaseLock(date, time);
          return {
            booked: 'no',
            error: 'calendar_unavailable',
            message: `Nepodarilo sa vytvoriť termín v kalendári. Chyba: ${calendarError.message}`
          };
        }
        
        // In development, create mock event
        console.log('⚠️ Google Calendar not available, creating booking without calendar event');
        event = {
          id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
      }
      
      // Keep lock until after calendar event is created successfully
      // Release lock after successful creation
      await bookingLock.releaseLock(date, time);
      
      // Add booking to database with normalized data
      console.log('🔍 dataValidation before DB:', dataValidation);
      console.log('🔍 normalizedData exists:', !!normalizedData);
      console.log('🔍 normalizedData content:', normalizedData);
      console.log('🔍 normalizedData.meno exists:', normalizedData?.meno);
      console.log('🔍 typeof normalizedData:', typeof normalizedData);
      
      await database.createBooking({
        id: event.id,
        appointmentType: appointmentType,
        date,
        time,
        patientData: normalizedData,
        calendarId: calendarId,
        eventId: event.id
      });
      
      // Send notifications (don't wait for completion)
      notificationService.sendBookingNotifications({
        ...normalizedData,
        appointmentType: config.name,
        date,
        time,
        instructions: config.instructions,
        price: config.price,
        bookingId: event.id
      }).catch(error => {
        console.error('Notification error:', error);
      });
      
      console.log(`✅ Booking created: ${event.id} for ${normalizedData.meno} ${normalizedData.priezvisko}`);
      
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
      console.error('Inner error stack:', innerError.stack);
      return {
        booked: 'no',
        error: 'Failed to create booking',
        message: `Nepodarilo sa vytvoriť rezerváciu: ${innerError.message}`
      };
    }
    
  } catch (error) {
    // This should not happen since we handle the lock acquisition above
    console.error('Outer booking creation error:', error);
    console.error('Outer error stack:', error.stack);
    return {
      booked: 'no',
      error: 'Failed to create booking',
      message: `Nepodarilo sa vytvoriť rezerváciu: ${error.message}`
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
    'not_working_day': 'V tento deň neordinujeme',
    'invalid_time_slot': 'Neplatný čas pre tento typ vyšetrenia',
    'time_slot_occupied': 'Tento termín je už obsadený',
    'daily_limit_reached': 'Denný limit pre tento typ vyšetrenia je naplnený',
    'shared_daily_limit_reached': 'Denný limit pre vyšetrenia je naplnený',
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

// Debug endpoint to test booking with minimal data
router.post('/debug', async (req, res) => {
  try {
    const testData = {
      meno: "Jan",
      priezvisko: "Harmady", 
      telefon: "+421910223761",
      poistovna: "Dôvera",
      prvotne_tazkosti: "test"
    };
    
    console.log('🧪 Testing with:', testData);
    
    const DataValidator = require('../utils/validation');
    const validation = DataValidator.validatePatientData(testData, 'vstupne_vysetrenie');
    console.log('🧪 Validation result:', validation);
    
    // Try direct database creation
    const database = require('../services/database-adapter');
    const mockEventId = `test_${Date.now()}`;
    
    const normalizedData = validation.normalizedData || testData;
    console.log('🧪 Using normalized data:', normalizedData);
    
    await database.createBooking({
      id: mockEventId,
      appointment_type: 'vstupne_vysetrenie',
      date: '2025-08-07',
      time: '09:00',
      patient_name: normalizedData.meno,
      patient_surname: normalizedData.priezvisko,
      patient_phone: normalizedData.telefon,
      patient_complaints: normalizedData.prvotne_tazkosti || null,
      calendar_id: 'test-calendar',
      event_id: mockEventId
    });
    
    res.json({
      success: true,
      validation,
      normalizedData,
      message: "Test booking created successfully"
    });
  } catch (error) {
    console.error('🧪 Test error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;