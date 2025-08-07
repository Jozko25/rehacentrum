const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleCalendarService {
  constructor() {
    this.auth = null;
    this.calendar = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      console.log('🔍 Google Calendar initialization - checking environment variables...');
      console.log('🔍 GOOGLE_CALENDAR_CREDENTIALS exists:', !!process.env.GOOGLE_CALENDAR_CREDENTIALS);
      console.log('🔍 GOOGLE_CALENDAR_CREDENTIALS_JSON exists:', !!process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON);
      console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
      console.log('🔍 RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
      console.log('🔍 All env vars starting with GOOGLE:', Object.keys(process.env).filter(key => key.startsWith('GOOGLE')));
      console.log('🔍 Total environment variables:', Object.keys(process.env).length);
      
      // Debug Railway environment specifically
      if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
        console.log('🔍 PRODUCTION/RAILWAY environment detected');
        console.log('🔍 GOOGLE_CALENDAR_CREDENTIALS type:', typeof process.env.GOOGLE_CALENDAR_CREDENTIALS);
        if (process.env.GOOGLE_CALENDAR_CREDENTIALS) {
          console.log('🔍 GOOGLE_CALENDAR_CREDENTIALS sample:', process.env.GOOGLE_CALENDAR_CREDENTIALS.substring(0, 50) + '...');
        }
      }
      
      let credentials;
      
      // Try environment variable first (for production)  
      const credentialsEnv = process.env.GOOGLE_CALENDAR_CREDENTIALS || process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON;
      if (credentialsEnv) {
        try {
          console.log('🔍 GOOGLE_CALENDAR_CREDENTIALS found, length:', credentialsEnv.length);
          console.log('🔍 First 100 chars:', credentialsEnv.substring(0, 100));
          
          // Handle both string and already parsed JSON
          if (typeof credentialsEnv === 'string') {
            credentials = JSON.parse(credentialsEnv);
          } else {
            credentials = credentialsEnv;
          }
          
          console.log('✅ Using Google Calendar credentials from environment variable');
          console.log('🔍 Parsed credentials keys:', Object.keys(credentials));
        } catch (parseError) {
          console.error('❌ Failed to parse GOOGLE_CALENDAR_CREDENTIALS:', parseError.message);
          console.error('❌ Raw credentials (first 200 chars):', typeof credentialsEnv === 'string' ? credentialsEnv.substring(0, 200) : JSON.stringify(credentialsEnv).substring(0, 200));
          throw new Error('Invalid Google Calendar credentials format');
        }
      } else {
        // Try to create credentials file from environment variable if it exists
        const envCreds = process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON || process.env.GOOGLE_CALENDAR_CREDENTIALS;
        if (envCreds) {
          try {
            credentials = JSON.parse(envCreds);
            console.log('✅ Using Google Calendar credentials from alternative environment variable');
          } catch (parseError) {
            console.error('❌ Failed to parse alternative credentials:', parseError.message);
          }
        }
        
        // If still no credentials, try file (works in production if file is deployed)
        if (!credentials) {
          const credentialsPath = path.join(__dirname, '../credentials/google-calendar-credentials.json');
          console.log('🔍 Trying to read credentials from file:', credentialsPath);
          try {
            const fileExists = await fs.access(credentialsPath).then(() => true).catch(() => false);
            console.log('🔍 Credentials file exists:', fileExists);
            if (fileExists) {
              credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
              console.log('✅ Using Google Calendar credentials from file');
            }
          } catch (fileError) {
            console.log('🔍 Cannot read credentials file:', fileError.message);
          }
        }
      }
      
      if (!credentials) {
        throw new Error('No Google Calendar credentials found');
      }
      
      this.auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/calendar']
      );
      
      await this.auth.authorize();
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      this.initialized = true;
      
      console.log('✅ Google Calendar API initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar API:', error.message);
      if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
        console.error('❌ Google Calendar initialization failed in production:', error.message);
        console.error('❌ Error details:', error);
        console.log('⚠️ Google Calendar not available in production - running without calendar integration');
        this.initialized = false;
        return;
      }
      throw new Error('Google Calendar initialization failed');
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async getEvents(calendarId, timeMin, timeMax) {
    await this.ensureInitialized();
    
    try {
      const response = await this.calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar events:', error.message);
      throw new Error('Failed to fetch calendar events');
    }
  }

  async createEvent(calendarId, eventData) {
    await this.ensureInitialized();
    
    if (!this.initialized) {
      console.error('❌ Google Calendar not initialized - cannot create event');
      throw new Error('Google Calendar service not available');
    }
    
    try {
      const event = {
        summary: eventData.summary,
        description: eventData.description || '',
        start: {
          dateTime: eventData.start.toISOString(),
          timeZone: 'Europe/Bratislava'
        },
        end: {
          dateTime: new Date(eventData.start.getTime() + eventData.duration * 60000).toISOString(),
          timeZone: 'Europe/Bratislava'
        },
        attendees: eventData.attendees || [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 }       // Only popup, no email reminders
          ]
        }
      };

      console.log('📅 Creating event on calendar:', calendarId);
      console.log('📅 Event details:', {
        summary: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime
      });

      const response = await this.calendar.events.insert({
        calendarId,
        resource: event
      });

      console.log(`✅ Event created successfully: ${response.data.id}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating calendar event:', error.message);
      console.error('❌ Full error:', error);
      throw new Error('Failed to create calendar event');
    }
  }

  async updateEvent(calendarId, eventId, eventData) {
    await this.ensureInitialized();
    
    try {
      const event = {
        summary: eventData.summary,
        description: eventData.description || '',
        start: {
          dateTime: eventData.start.toISOString(),
          timeZone: 'Europe/Bratislava'
        },
        end: {
          dateTime: new Date(eventData.start.getTime() + eventData.duration * 60000).toISOString(),
          timeZone: 'Europe/Bratislava'
        }
      };

      const response = await this.calendar.events.update({
        calendarId,
        eventId,
        resource: event
      });

      console.log(`✅ Event updated: ${eventId}`);
      return response.data;
    } catch (error) {
      console.error('Error updating calendar event:', error.message);
      throw new Error('Failed to update calendar event');
    }
  }

  async deleteEvent(calendarId, eventId) {
    await this.ensureInitialized();
    
    try {
      await this.calendar.events.delete({
        calendarId,
        eventId
      });

      console.log(`✅ Event deleted: ${eventId}`);
      return true;
    } catch (error) {
      console.error('Error deleting calendar event:', error.message);
      throw new Error('Failed to delete calendar event');
    }
  }

  async checkAvailability(calendarId, startTime, endTime) {
    await this.ensureInitialized();
    
    try {
      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          items: [{ id: calendarId }]
        }
      });

      const busyTimes = response.data.calendars[calendarId].busy || [];
      return busyTimes.length === 0; // true if no conflicts
    } catch (error) {
      console.error('Error checking availability:', error.message);
      throw new Error('Failed to check availability');
    }
  }

  async getDayEvents(calendarId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await this.getEvents(calendarId, startOfDay, endOfDay);
  }
}

// Singleton instance
const googleCalendarService = new GoogleCalendarService();

module.exports = googleCalendarService;