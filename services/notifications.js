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
    
    if (accountSid && authToken && accountSid.startsWith('AC') && authToken.length > 10) {
      try {
        this.twilioClient = twilio(accountSid, authToken);
        console.log('✅ Twilio initialized successfully');
      } catch (error) {
        console.log('⚠️ Twilio initialization failed:', error.message);
        console.log('⚠️ Using webhook fallback for notifications');
      }
    } else {
      console.log('⚠️ Twilio credentials not found or invalid, using webhook fallback');
    }
  }

  async sendBookingNotifications(bookingData) {
    const { telefon, email, appointmentType, date, time, instructions, price, bookingId } = bookingData;
    
    try {
      const promises = [];
      
      // Generate message content
      const smsMessage = this.generateSMSMessage(bookingData);
      const whatsappMessage = this.generateWhatsAppMessage(bookingData);
      
      // Send SMS notification
      if (appointmentConfig.notifications.sms.enabled) {
        promises.push(this.sendSMS(telefon, smsMessage));
      }
      
      // Send WhatsApp notification
      if (appointmentConfig.notifications.whatsapp.enabled) {
        promises.push(this.sendWhatsApp(telefon, whatsappMessage));
      }
      
      // Send email notification if requested
      if (email && appointmentConfig.notifications.email.enabled === 'on_request') {
        promises.push(this.sendEmail(email, bookingData));
      }
      
      await Promise.allSettled(promises);
      console.log(`✅ Notifications sent for booking ${bookingId}`);
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  }

  generateSMSMessage(bookingData) {
    const { meno, priezvisko, appointmentType, date, time, instructions, price, telefon } = bookingData;
    
    let message = `Potvrdenie rezervácie:\n`;
    message += `${meno} ${priezvisko}\n`;
    message += `${appointmentType}\n`;
    message += `Dátum: ${this.formatDate(date)}\n`;
    message += `Čas: ${time} (čas je orientačný)\n`;
    message += `Telefón: ${telefon}\n`;
    
    if (price) {
      message += `Cena: ${price}€\n`;
    }
    
    if (instructions) {
      message += `\nDôležité: ${instructions}\n`;
    }
    
    message += `\nOrdinácia Dr. Vahovič, Humenné`;
    
    return message;
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
    
    if (provider === 'twilio' && this.twilioClient) {
      return await this.sendTwilioSMS(phoneNumber, message);
    } else {
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
    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });
      
      console.log(`✅ SMS sent via Twilio: ${result.sid}`);
      return { success: true, provider: 'twilio', messageId: result.sid };
    } catch (error) {
      console.error('Twilio SMS error:', error);
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