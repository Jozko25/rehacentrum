const twilio = require('twilio');
const appointmentConfig = require('../config/appointments');

class NotificationService {
  constructor() {
    this.twilioClient = null;
    this.initializeTwilio();
  }

  initializeTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const smsNumber = process.env.TWILIO_SMS_NUMBER;
    
    console.log('🔍 TWILIO DEBUG - Account SID:', accountSid ? `${accountSid.substring(0, 10)}...` : 'NOT SET');
    console.log('🔍 TWILIO DEBUG - Auth Token:', authToken ? `${authToken.substring(0, 10)}...` : 'NOT SET');
    console.log('🔍 TWILIO DEBUG - SMS Number:', smsNumber || 'NOT SET');
    console.log('🔍 TWILIO DEBUG - Account SID starts with AC:', accountSid ? accountSid.startsWith('AC') : 'N/A');
    console.log('🔍 TWILIO DEBUG - Auth Token length:', authToken ? authToken.length : 0);
    console.log('🔍 TWILIO DEBUG - NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 TWILIO DEBUG - RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
    
    if (accountSid && authToken && accountSid.startsWith('AC') && authToken.length > 10) {
      try {
        this.twilioClient = twilio(accountSid, authToken);
        console.log('✅ Twilio initialized successfully');
        console.log('✅ Twilio client created, ready to send SMS');
        console.log('✅ Twilio client type:', typeof this.twilioClient);
        console.log('✅ Twilio client constructor:', this.twilioClient.constructor.name);
      } catch (error) {
        console.log('❌ Twilio initialization failed:', error.message);
        console.log('❌ Full error:', error);
        console.log('❌ Error stack:', error.stack);
        console.log('⚠️ Using webhook fallback for notifications');
        this.twilioClient = null;
      }
    } else {
      console.log('❌ Twilio credentials validation failed:');
      console.log('❌ - Account SID exists:', !!accountSid);
      console.log('❌ - Auth Token exists:', !!authToken);
      console.log('❌ - Account SID starts with AC:', accountSid ? accountSid.startsWith('AC') : false);
      console.log('❌ - Auth Token length > 10:', authToken ? authToken.length > 10 : false);
      console.log('❌ Using webhook fallback for notifications');
      this.twilioClient = null;
    }
  }

  async sendBookingNotifications(bookingData) {
    const { telefon, email, appointmentType, date, time, instructions, price, bookingId } = bookingData;
    
    console.log('🔔 NOTIFICATION DEBUG - Starting notification process');
    console.log('🔔 NOTIFICATION DEBUG - Booking data:', { telefon, appointmentType, date, time, price, bookingId });
    console.log('🔔 NOTIFICATION DEBUG - SMS enabled:', appointmentConfig.notifications.sms.enabled);
    console.log('🔔 NOTIFICATION DEBUG - SMS provider:', appointmentConfig.notifications.sms.provider);
    
    try {
      const promises = [];
      
      // Generate message content
      const smsMessage = this.generateSMSMessage(bookingData);
      const whatsappMessage = this.generateWhatsAppMessage(bookingData);
      
      console.log('🔔 NOTIFICATION DEBUG - Generated SMS message:', smsMessage);
      
      // Send SMS notification
      if (appointmentConfig.notifications.sms.enabled) {
        console.log('🔔 NOTIFICATION DEBUG - Adding SMS to promises queue');
        promises.push(this.sendSMS(telefon, smsMessage));
      }
      
      // Send WhatsApp notification
      if (appointmentConfig.notifications.whatsapp.enabled) {
        console.log('🔔 NOTIFICATION DEBUG - Adding WhatsApp to promises queue');
        promises.push(this.sendWhatsApp(telefon, whatsappMessage));
      }
      
      // Send email notification if requested
      if (email && appointmentConfig.notifications.email.enabled === 'on_request') {
        console.log('🔔 NOTIFICATION DEBUG - Adding email to promises queue');
        promises.push(this.sendEmail(email, bookingData));
      }
      
      console.log('🔔 NOTIFICATION DEBUG - Executing', promises.length, 'notification promises');
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          console.log(`✅ Notification ${index + 1} sent successfully:`, result.value);
        } else {
          console.error(`❌ Notification ${index + 1} failed:`, result.reason);
        }
      });
      
      console.log(`✅ Notification process completed for booking ${bookingId}`);
    } catch (error) {
      console.error('❌ Error in notification process:', error);
    }
  }

  generateSMSMessage(bookingData) {
    const { meno, priezvisko, appointmentType, date, time, instructions, price } = bookingData;
    
    // Optimized nice message within 1 SMS segment (~150 chars max)
    const shortDate = this.formatShortDate(date);
    const shortType = this.getShortAppointmentType(appointmentType);
    
    let message = `✅ ${meno} ${priezvisko}\n`;
    message += `📅 ${shortType} ${shortDate} o ${time}\n`;
    
    if (price) {
      message += `💰 ${price}€ `;
    }
    
    // Add key instruction
    if (instructions) {
      const shortInstruction = this.getShortInstruction(instructions);
      if (shortInstruction) {
        message += `${shortInstruction}\n`;
      }
    }
    
    message += `🏥 Dr. Vahovic Humenne`;
    
    return message;
  }
  
  formatShortDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `${day}.${month}.`;
  }
  
  getShortAppointmentType(appointmentType) {
    const shortNames = {
      'Vstupné vyšetrenie': 'Vstupne',
      'Kontrolné vyšetrenie': 'Kontrola', 
      'Športová prehliadka': 'Sport. prehliadka',
      'Zdravotnícke pomôcky': 'Zdrav. pomucky',
      'Konzultácia s lekárom': 'Konzultacia'
    };
    return shortNames[appointmentType] || appointmentType;
  }
  
  getShortInstruction(instructions) {
    if (!instructions) return '';
    
    // Keep only essential information, shortened
    if (instructions.includes('Nie je hradené poisťovňou')) {
      return '(Nie poistovna)';
    }
    if (instructions.includes('nalačno')) {
      return '(Nalacno)';
    }
    if (instructions.includes('výmenný lístok')) {
      return '(Vymenny listok)';
    }
    
    return '';
  }

  generateWhatsAppMessage(bookingData) {
    const { meno, priezvisko, appointmentType, date, time, instructions, price } = bookingData;
    
    let message = `🏥 *Potvrdenie rezervácie*\\n\\n`;
    message += `*Pacient:* ${meno} ${priezvisko}\\n`;
    message += `*Typ vyšetrenia:* ${appointmentType}\\n`;
    message += `*Dátum:* ${this.formatDate(date)}\\n`;
    message += `*Čas:* ${time} _(čas je orientačný)_\\n`;
    
    if (price) {
      message += `*Cena:* ${price}€\\n`;
    }
    
    if (instructions) {
      message += `\\n⚠️ *Dôležité informácie:*\\n${instructions}\\n`;
    }
    
    message += `\\n📍 *Ordinácia Dr. Vahovič, Humenné*\\n`;
    message += `📞 Kontakt: ${appointmentConfig.fallbackPhone}`;
    
    return message;
  }

  async sendSMS(phoneNumber, message) {
    const provider = appointmentConfig.notifications.sms.provider;
    
    console.log('📱 SMS DEBUG - Provider:', provider);
    console.log('📱 SMS DEBUG - Twilio client exists:', !!this.twilioClient);
    console.log('📱 SMS DEBUG - Will use Twilio direct:', provider === 'twilio' && this.twilioClient);
    
    if (provider === 'twilio' && this.twilioClient) {
      console.log('📱 SMS DEBUG - Using Twilio direct SMS');
      return await this.sendTwilioSMS(phoneNumber, message);
    } else if (provider === 'twilio') {
      console.log('📱 SMS DEBUG - Twilio configured but client not initialized, trying to reinitialize and send');
      
      // Force reinitialize in case of Railway environment issues
      console.log('📱 SMS DEBUG - Force reinitializing Twilio for Railway...');
      this.initializeTwilio();
      
      if (this.twilioClient) {
        console.log('📱 SMS DEBUG - Twilio reinitialized successfully, sending SMS');
        return await this.sendTwilioSMS(phoneNumber, message);
      } else {
        console.log('📱 SMS DEBUG - Twilio reinitialize failed, falling back to webhook');
        return await this.sendWebhookSMS(phoneNumber, message, provider);
      }
    } else {
      console.log('📱 SMS DEBUG - Using webhook SMS with provider:', provider);
      return await this.sendWebhookSMS(phoneNumber, message, provider);
    }
  }

  async sendWhatsApp(phoneNumber, message) {
    const provider = appointmentConfig.notifications.whatsapp.provider;
    
    if (provider === 'twilio' && this.twilioClient) {
      return await this.sendTwilioWhatsApp(phoneNumber, message);
    } else {
      return await this.sendWebhookWhatsApp(phoneNumber, message, provider);
    }
  }

  async sendTwilioSMS(phoneNumber, message) {
    console.log('📱 TWILIO SMS DEBUG - Starting SMS send process');
    console.log('📱 TWILIO SMS DEBUG - Phone:', phoneNumber);
    console.log('📱 TWILIO SMS DEBUG - Message length:', message.length);
    console.log('📱 TWILIO SMS DEBUG - From number:', process.env.TWILIO_SMS_NUMBER);
    console.log('📱 TWILIO SMS DEBUG - Twilio client exists:', !!this.twilioClient);
    
    // Try to initialize Twilio if client is null
    if (!this.twilioClient) {
      console.log('📱 TWILIO SMS DEBUG - Client null, reinitializing...');
      this.initializeTwilio();
    }
    
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized - check credentials');
    }
    
    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_SMS_NUMBER,
        to: phoneNumber
      });
      
      console.log(`✅ SMS sent via Twilio successfully!`);
      console.log(`✅ Message SID: ${result.sid}`);
      console.log(`✅ Status: ${result.status}`);
      console.log(`✅ To: ${result.to}`);
      console.log(`✅ From: ${result.from}`);
      return { success: true, provider: 'twilio', messageId: result.sid };
    } catch (error) {
      console.error('❌ TWILIO SMS ERROR - Full error object:', error);
      console.error('❌ TWILIO SMS ERROR - Message:', error.message);
      console.error('❌ TWILIO SMS ERROR - Code:', error.code);
      console.error('❌ TWILIO SMS ERROR - More Info:', error.moreInfo);
      console.error('❌ TWILIO SMS ERROR - Status:', error.status);
      throw error;
    }
  }

  async sendTwilioWhatsApp(phoneNumber, message) {
    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${phoneNumber}`
      });
      
      console.log(`✅ WhatsApp sent via Twilio: ${result.sid}`);
      return { success: true, provider: 'twilio', messageId: result.sid };
    } catch (error) {
      console.error('Twilio WhatsApp error:', error);
      throw error;
    }
  }

  async sendWebhookSMS(phoneNumber, message, provider) {
    const webhookUrls = {
      'zapier': process.env.ZAPIER_SMS_WEBHOOK,
      'make': process.env.MAKE_SMS_WEBHOOK
    };
    
    const webhookUrl = webhookUrls[provider];
    if (!webhookUrl) {
      throw new Error(`No webhook URL configured for ${provider} SMS`);
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'sms',
          to: phoneNumber,
          message: message,
          timestamp: new Date().toISOString(),
          clinic: 'Dr. Vahovič - Humenné'
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status}`);
      }

      console.log(`✅ SMS sent via ${provider} webhook`);
      return { success: true, provider: provider };
    } catch (error) {
      console.error(`${provider} SMS webhook error:`, error);
      throw error;
    }
  }

  async sendWebhookWhatsApp(phoneNumber, message, provider) {
    const webhookUrls = {
      'zapier': process.env.ZAPIER_WHATSAPP_WEBHOOK,
      'make': process.env.MAKE_WHATSAPP_WEBHOOK
    };
    
    const webhookUrl = webhookUrls[provider];
    if (!webhookUrl) {
      throw new Error(`No webhook URL configured for ${provider} WhatsApp`);
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'whatsapp',
          to: phoneNumber,
          message: message,
          timestamp: new Date().toISOString(),
          clinic: 'Dr. Vahovič - Humenné'
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status}`);
      }

      console.log(`✅ WhatsApp sent via ${provider} webhook`);
      return { success: true, provider: provider };
    } catch (error) {
      console.error(`${provider} WhatsApp webhook error:`, error);
      throw error;
    }
  }

  async sendEmail(emailAddress, bookingData) {
    const webhookUrl = process.env.ZAPIER_EMAIL_WEBHOOK;
    if (!webhookUrl) {
      console.log('⚠️ No email webhook configured, skipping email notification');
      return;
    }

    try {
      const emailContent = this.generateEmailContent(bookingData);
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'email',
          to: emailAddress,
          subject: `Potvrdenie rezervácie - ${bookingData.appointmentType}`,
          content: emailContent,
          timestamp: new Date().toISOString(),
          clinic: 'Dr. Vahovič - Humenné'
        })
      });

      if (!response.ok) {
        throw new Error(`Email webhook request failed: ${response.status}`);
      }

      console.log(`✅ Email sent via Zapier webhook`);
      return { success: true, provider: 'zapier' };
    } catch (error) {
      console.error('Email webhook error:', error);
      throw error;
    }
  }

  generateEmailContent(bookingData) {
    const { meno, priezvisko, appointmentType, date, time, instructions, price } = bookingData;
    
    let content = `Vážený/-á ${meno} ${priezvisko},\\n\\n`;
    content += `potvrdzujeme Vašu rezerváciu na vyšetrenie.\\n\\n`;
    content += `DETAILY REZERVÁCIE:\\n`;
    content += `Typ vyšetrenia: ${appointmentType}\\n`;
    content += `Dátum: ${this.formatDate(date)}\\n`;
    content += `Čas: ${time} (čas je orientačný)\\n`;
    
    if (price) {
      content += `Cena: ${price}€\\n`;
    }
    
    if (instructions) {
      content += `\\nDÔLEŽITÉ INFORMÁCIE:\\n${instructions}\\n`;
    }
    
    content += `\\nOrdinácia:\\nDr. Milan Vahovič\\nHumenné\\n`;
    content += `Telefón: ${appointmentConfig.fallbackPhone}\\n\\n`;
    content += `S pozdravom,\\nAI Recepcia`;
    
    return content;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('sk-SK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Method to send day-before reminder
  async sendReminderNotifications(bookingsForTomorrow) {
    for (const booking of bookingsForTomorrow) {
      try {
        const reminderMessage = this.generateReminderMessage(booking);
        await this.sendSMS(booking.patientData.telefon, reminderMessage);
        console.log(`✅ Reminder sent for booking ${booking.eventId}`);
      } catch (error) {
        console.error(`Error sending reminder for booking ${booking.eventId}:`, error);
      }
    }
  }

  generateReminderMessage(booking) {
    const { patientData, appointmentType, date, time } = booking;
    
    let message = `🔔 Pripomíname:\\n`;
    message += `${patientData.meno} ${patientData.priezvisko}\\n`;
    message += `${appointmentType}\\n`;
    message += `ZAJTRA: ${this.formatDate(date)} o ${time}\\n`;
    message += `Ordinácia Dr. Vahovič, Humenné`;
    
    return message;
  }
}

// Singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;