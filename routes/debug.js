const express = require('express');
const router = express.Router();
const googleCalendarService = require('../services/googleCalendar');
const appointmentConfig = require('../config/appointments');

// Debug endpoint to test Google Calendar integration
router.get('/calendar-test', async (req, res) => {
  try {
    console.log('🔍 Debug: Testing Google Calendar integration');
    
    // Check if Google Calendar service is initialized
    await googleCalendarService.ensureInitialized();
    
    const status = {
      initialized: googleCalendarService.initialized,
      environment: process.env.NODE_ENV,
      railwayEnv: !!process.env.RAILWAY_ENVIRONMENT,
      hasCredentials: !!process.env.GOOGLE_CALENDAR_CREDENTIALS,
      hasCredentialsJson: !!process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON,
      calendarId: appointmentConfig.calendars.main
    };
    
    console.log('🔍 Calendar service status:', status);
    
    if (!googleCalendarService.initialized) {
      return res.json({
        success: false,
        error: 'Google Calendar service not initialized',
        status
      });
    }
    
    // Try to create a test event
    const testEventData = {
      summary: 'Test Event - Debug',
      start: new Date('2025-08-07T15:00:00+02:00'),
      duration: 10,
      description: 'Test event to verify Google Calendar integration'
    };
    
    console.log('🔍 Creating test event:', testEventData);
    
    const event = await googleCalendarService.createEvent(
      appointmentConfig.calendars.main,
      testEventData
    );
    
    console.log('🔍 Test event created:', event.id);
    
    res.json({
      success: true,
      message: 'Google Calendar integration working',
      eventId: event.id,
      eventLink: event.htmlLink,
      status
    });
    
  } catch (error) {
    console.error('🔍 Calendar test failed:', error);
    
    res.json({
      success: false,
      error: error.message,
      stack: error.stack,
      status: {
        initialized: googleCalendarService.initialized,
        environment: process.env.NODE_ENV,
        railwayEnv: !!process.env.RAILWAY_ENVIRONMENT,
        hasCredentials: !!process.env.GOOGLE_CALENDAR_CREDENTIALS,
        hasCredentialsJson: !!process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON,
        calendarId: appointmentConfig.calendars.main
      }
    });
  }
});

// Test endpoint to check environment variables
router.get('/env-test', (req, res) => {
  const envStatus = {
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
    GOOGLE_CALENDAR_CREDENTIALS: !!process.env.GOOGLE_CALENDAR_CREDENTIALS,
    GOOGLE_CALENDAR_CREDENTIALS_JSON: !!process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON,
    MAIN_CALENDAR_ID: process.env.MAIN_CALENDAR_ID,
    totalEnvVars: Object.keys(process.env).length,
    allGoogleVars: Object.keys(process.env).filter(key => key.includes('GOOGLE')),
    credentialsLength: process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON?.length || 0
  };
  
  console.log('🔍 Environment status:', envStatus);
  
  // Try to parse credentials to see if they're valid JSON
  let credentialsValid = false;
  let credentialsError = null;
  
  const creds = process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON || process.env.GOOGLE_CALENDAR_CREDENTIALS;
  if (creds) {
    try {
      const parsed = JSON.parse(creds);
      credentialsValid = !!(parsed.client_email && parsed.private_key);
      console.log('🔍 Credentials parsed successfully, has client_email:', !!parsed.client_email);
    } catch (e) {
      credentialsError = e.message;
      console.log('🔍 Credentials parsing failed:', e.message);
    }
  }
  
  res.json({
    environment: envStatus,
    credentials: {
      found: !!creds,
      length: creds?.length || 0,
      valid: credentialsValid,
      error: credentialsError,
      preview: creds ? creds.substring(0, 100) + '...' : 'Not found'
    }
  });
});

module.exports = router;