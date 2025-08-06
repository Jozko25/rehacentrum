# Clinic Booking System

AI-powered booking system for Dr. Milan Vahovič clinic in Humenné.

## Features

- **5 Appointment Types** with different rules:
  - Vstupné vyšetrenie (max 8/day, shared limit)
  - Kontrolné vyšetrenie (max 8/day, shared limit) 
  - Športová prehliadka (max 5/day, 07:00-09:00, €130)
  - Zdravotnícke pomôcky (max 1/day)
  - Konzultácia s lekárom (€30, 07:30-09:00, 15:00-16:00)

- **Smart Scheduling**:
  - Holiday and weekend blocking
  - Vacation date management
  - Daily and hourly limits per appointment type
  - Closest slot recommendations

- **Google Calendar Integration**:
  - Single calendar for all appointment types
  - Real-time availability checking
  - Automatic event creation

- **Notifications**:
  - SMS via Twilio or Zapier/Make.com webhooks
  - WhatsApp notifications
  - Email on request
  - Day-before reminders

- **GDPR Compliant**:
  - Slovak birth number validation
  - Data sanitization for logs
  - Required patient data validation

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Google Calendar Setup

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create new project: "clinic-booking"
   - Enable Calendar API

2. **Create Service Account**:
   - IAM & Admin > Service Accounts > Create Service Account
   - Name: "booking-service"
   - Generate JSON key
   - Save as `credentials/google-calendar-credentials.json`

3. **Create Calendar**:
   - Create 1 Google Calendar for all appointments
   - Share calendar with service account email (Editor permissions)
   - Copy calendar ID to .env as MAIN_CALENDAR_ID

### 4. Run Server
```bash
npm start
# Development mode:
npm run dev
```

## API Endpoints

### Webhook Endpoint (for ElevenLabs)
```
POST /api/booking/webhook
```

**Actions supported**:
- `get_available_slots` - Get available time slots
- `find_closest_slot` - Find closest available to preferred time
- `book_appointment` - Create new booking
- `cancel_appointment` - Cancel existing booking
- `check_availability` - Check if specific time is available

**Example Request**:
```json
{
  "action": "book_appointment",
  "appointment_type": "vstupne_vysetrenie",
  "date": "2025-08-05",
  "time": "14:20",
  "patient_data": {
    "meno": "Ján",
    "priezvisko": "Novák",
    "telefon": "+421918717535",
    "rodne_cislo": "8001011234",
    "zdravotna_poistovna": "VšZP",
    "email": "jan@example.com",
    "prvotne_tazkosti": "Bolesti hlavy"
  }
}
```

### Admin Endpoints
- `GET /api/admin/bookings/:date` - Get bookings for date
- `GET /api/admin/stats/:date` - Get booking statistics
- `POST /api/admin/vacation` - Add vacation dates
- `GET /api/admin/health` - Service health check

## Deployment

### AWS EC2 t3.nano Deployment

1. **Launch EC2 Instance**:
   ```bash
   # Ubuntu 22.04 LTS
   # t3.nano (1 vCPU, 0.5 GB RAM)
   # Security Group: Allow port 80, 443, 22
   ```

2. **Server Setup**:
   ```bash
   # SSH into server
   ssh -i your-key.pem ubuntu@your-server-ip
   
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2
   sudo npm install -g pm2
   
   # Clone/upload your code
   git clone your-repo
   cd booking-logic
   npm install
   ```

3. **Environment Setup**:
   ```bash
   # Copy .env file
   cp .env.example .env
   # Edit with production values
   nano .env
   
   # Upload Google credentials
   mkdir credentials
   scp -i your-key.pem google-calendar-credentials.json ubuntu@server:/path/to/booking-logic/credentials/
   ```

4. **Start Service**:
   ```bash
   # Start with PM2
   pm2 start server.js --name clinic-booking
   pm2 startup
   pm2 save
   
   # Setup nginx reverse proxy (optional)
   sudo apt install nginx
   # Configure nginx to proxy port 3000
   ```

5. **Domain Setup**:
   ```bash
   # Point your domain to server IP
   # Update ElevenLabs webhook URL to: https://yourdomain.com/api/booking/webhook
   ```

## Estimated Costs

**AWS Monthly Costs**:
- t3.nano EC2: $3-5/month
- Data transfer: $1-2/month
- **Total: $5-10/month**

**Third-party Services**:
- Twilio SMS: €0.05 per SMS
- Google Calendar API: Free (within limits)

## Configuration

### Appointment Types
Edit `config/appointments.js` to modify:
- Working hours
- Daily/hourly limits
- Pricing
- Instructions
- Required patient data

### Notifications
Configure providers in `.env`:
- Direct Twilio API (recommended)
- Zapier webhooks
- Make.com webhooks

### Holidays & Vacation
- Slovak holidays pre-configured
- Add vacation dates via admin API
- Edit `config/appointments.js` for permanent changes

## Monitoring

### Health Checks
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/admin/health
```

### Logs
```bash
# PM2 logs
pm2 logs clinic-booking

# Manual logs
tail -f /var/log/clinic-booking.log
```

## Security

- Rate limiting (100 requests/15min)
- CORS protection
- Helmet security headers
- GDPR compliant data handling
- Birth number validation
- Phone number normalization

## Support

For issues or questions, contact Jan Harmady or check the logs for detailed error messages.

## License

MIT License - For Dr. Milan Vahovič clinic use.