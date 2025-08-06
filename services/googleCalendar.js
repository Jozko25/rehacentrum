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
      const credentialsPath = process.env.GOOGLE_CALENDAR_CREDENTIALS_PATH || './credentials/google-calendar-credentials.json';
      
      // In production, skip Google Calendar if credentials are missing
      try {
        const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
        
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
      } catch (fileError) {
        if (process.env.NODE_ENV === 'production') {
          console.log('⚠️ Google Calendar credentials not found in production - running without calendar integration');
          this.initialized = false;
          return;
        }
        throw fileError;
      }
    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar API:', error.message);
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