# Clinic Booking System - Complete Testing Guide

This guide covers all functionality testing for the AI-powered medical clinic booking system.

## Quick Start

1. **Start the application:**
   ```bash
   npm start
   ```
   App runs on http://localhost:3000

2. **Test the basic health check:**
   ```bash
   curl http://localhost:3000/health
   ```

---

## 🔧 Core API Testing

### Main Webhook Endpoint (`POST /api/booking/webhook`)

This is the primary endpoint used by the AI voice system. Test with these JSON payloads:

#### 1. Get Available Slots
```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get_available_slots",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-06"
  }'
```

#### 2. Book an Appointment
```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-06",
    "time": "09:00",
    "patient_data": {
      "name": "Ján",
      "surname": "Novák",
      "birth_number": "8001011234",
      "phone": "+421901234567",
      "health_insurance": "VšZP",
      "complaints": "bolesti hlavy"
    }
  }'
```

#### 3. Cancel Appointment
```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "cancel_appointment",
    "booking_id": "YOUR_BOOKING_ID_HERE"
  }'
```

#### 4. Find Closest Available Slot
```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "find_closest_slot",
    "appointment_type": "kontrolne_vysetrenie",
    "preferred_date": "2025-08-06",
    "preferred_time": "10:00"
  }'
```

#### 5. Check Availability
```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "check_availability",
    "appointment_type": "sportova_prehliadka",
    "date": "2025-08-06",
    "time": "08:00"
  }'
```

---

## 📊 Admin API Testing

### Get Bookings for Date
```bash
curl http://localhost:3000/api/admin/bookings/2025-08-06
```

### Get Statistics
```bash
curl http://localhost:3000/api/admin/stats/2025-08-06
```

### Add Vacation Date
```bash
curl -X POST http://localhost:3000/api/admin/vacation \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-12-25",
    "reason": "Christmas"
  }'
```

### Remove Vacation Date
```bash
curl -X DELETE http://localhost:3000/api/admin/vacation \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-25"}'
```

### Get All Vacation Dates
```bash
curl http://localhost:3000/api/admin/vacation
```

### System Health Check
```bash
curl http://localhost:3000/api/admin/health
```

---

## 📈 Dashboard & Monitoring

### View Dashboard
Open in browser: http://localhost:3000/api/dashboard/

### Get Dashboard Data
```bash
curl http://localhost:3000/api/dashboard/data
```

### Get Prometheus Metrics
```bash
curl http://localhost:3000/api/dashboard/metrics
```

---

## 🏥 Appointment Types Testing

Test each of the 5 appointment types with their specific rules:

### 1. Initial Examination (vstupne_vysetrenie)
- **Duration:** 10 minutes
- **Daily limit:** 8 (shared with other main types)
- **Time slots:** 09:00-11:30, 13:00-15:00
- **Required fields:** name, surname, phone, complaints

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-06",
    "time": "09:00",
    "patient_data": {
      "name": "Anna",
      "surname": "Svobodová",
      "birth_number": "9055123456",
      "phone": "0901234567",
      "health_insurance": "Dôvera",
      "complaints": "kontrola tlaku"
    }
  }'
```

### 2. Follow-up Examination (kontrolne_vysetrenie)
- **Duration:** 10 minutes
- **Daily limit:** 8 (shared)
- **Time slots:** 09:00-11:30, 13:00-15:00

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "kontrolne_vysetrenie",
    "date": "2025-08-06",
    "time": "10:00",
    "patient_data": {
      "name": "Peter",
      "surname": "Kováč",
      "phone": "+421905111222",
      "complaints": "výsledky vyšetrenia"
    }
  }'
```

### 3. Sports Examination (sportova_prehliadka)
- **Duration:** 24 minutes
- **Daily limit:** 5
- **Time slots:** 07:00-09:00
- **Price:** €130

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "sportova_prehliadka",
    "date": "2025-08-06",
    "time": "08:00",
    "patient_data": {
      "name": "Martin",
      "surname": "Športovec",
      "birth_number": "9512345678",
      "phone": "0944555666"
    }
  }'
```

### 4. Medical Devices (zdravotnicke_pomucky)
- **Duration:** 10 minutes
- **Daily limit:** 1
- **Time slots:** 09:00-11:30, 13:00-15:00

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "zdravotnicke_pomucky",
    "date": "2025-08-06",
    "time": "14:00",
    "patient_data": {
      "name": "Mária",
      "surname": "Zdravá",
      "phone": "0917888999",
      "complaints": "potrebujem invalidný vozík"
    }
  }'
```

### 5. Consultation (konzultacia)
- **Duration:** 30 minutes
- **No daily limit**
- **Time slots:** 07:30-09:00, 15:00-16:00
- **Price:** €30

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "konzultacia",
    "date": "2025-08-06",
    "time": "15:30",
    "patient_data": {
      "name": "Zuzana",
      "surname": "Pacientka",
      "phone": "0948111222",
      "complaints": "potrebujem radu ohľadom liekov"
    }
  }'
```

---

## 📱 Notification Testing

The system sends notifications via SMS, WhatsApp, and email. Check your logs to see if notifications are being sent:

```bash
tail -f logs/combined.log | grep -i notification
```

---

## 🧪 Advanced Testing Scenarios

### 1. Test Daily Limits
Try booking 9 appointments of type "vstupne_vysetrenie" for the same day. The 9th should fail.

### 2. Test Double-Booking Prevention
Try booking the same time slot twice simultaneously:

```bash
# Run these two commands at the same time
curl -X POST http://localhost:3000/api/booking/webhook -H "Content-Type: application/json" -d '{"action": "book_appointment", "appointment_type": "vstupne_vysetrenie", "date": "2025-08-06", "time": "09:00", "patient_data": {"name": "Test1", "surname": "User1", "phone": "0901111111"}}' &

curl -X POST http://localhost:3000/api/booking/webhook -H "Content-Type: application/json" -d '{"action": "book_appointment", "appointment_type": "vstupne_vysetrenie", "date": "2025-08-06", "time": "09:00", "patient_data": {"name": "Test2", "surname": "User2", "phone": "0902222222"}}' &
```

### 3. Test Invalid Data
Try booking with invalid phone numbers, birth numbers, or missing required fields:

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-06",
    "time": "09:00",
    "patient_data": {
      "name": "Test",
      "surname": "User",
      "birth_number": "invalid",
      "phone": "invalid_phone"
    }
  }'
```

### 4. Test Weekend Blocking
Try booking on Saturday or Sunday (should fail):

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-09",
    "time": "09:00",
    "patient_data": {
      "name": "Weekend",
      "surname": "Test",
      "phone": "0901234567"
    }
  }'
```

### 5. Test Holiday Blocking
Try booking on a Slovak public holiday (should fail):

```bash
curl -X POST http://localhost:3000/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-01-01",
    "time": "09:00",
    "patient_data": {
      "name": "Holiday",
      "surname": "Test",
      "phone": "0901234567"
    }
  }'
```

---

## ⚡ Performance Testing

### Load Testing with Multiple Requests
```bash
# Install apache bench if needed: brew install httpd (on macOS)
ab -n 100 -c 10 -H "Content-Type: application/json" -p test_payload.json http://localhost:3000/api/booking/webhook
```

Create `test_payload.json`:
```json
{
  "action": "get_available_slots",
  "appointment_type": "vstupne_vysetrenie",
  "date": "2025-08-06"
}
```

---

## 🔍 Debugging & Logs

### View Real-time Logs
```bash
# All logs
tail -f logs/combined.log

# Only errors
tail -f logs/error.log

# Only access logs
tail -f logs/access.log

# Filter for specific functionality
tail -f logs/combined.log | grep -i booking
tail -f logs/combined.log | grep -i notification
tail -f logs/combined.log | grep -i google
```

### Check Database Contents
The system uses SQLite. You can inspect the database:

```bash
# Install sqlite3 if needed
sqlite3 data/bookings.db

# View all tables
.tables

# View bookings
SELECT * FROM bookings ORDER BY date, time;

# View daily counts
SELECT * FROM daily_counts WHERE date = '2025-08-06';

# Exit sqlite3
.quit
```

---

## ✅ Test Checklist

### Basic Functionality
- [ ] Application starts without errors
- [ ] Health check endpoint responds
- [ ] Dashboard loads in browser
- [ ] Metrics endpoint returns data

### Booking System
- [ ] Can get available slots for each appointment type
- [ ] Can book appointments with valid data
- [ ] Can cancel appointments
- [ ] Can find closest available slots
- [ ] Daily limits are enforced
- [ ] Hourly limits are enforced
- [ ] Double-booking is prevented
- [ ] Weekend bookings are blocked
- [ ] Holiday bookings are blocked

### Data Validation
- [ ] Slovak birth numbers are validated
- [ ] Phone numbers are normalized
- [ ] Required fields are enforced
- [ ] Invalid data is rejected gracefully

### Admin Functions
- [ ] Can retrieve bookings for specific dates
- [ ] Can get booking statistics
- [ ] Can manage vacation dates
- [ ] Can cancel bookings via admin API

### Error Handling
- [ ] Invalid appointment types are rejected
- [ ] Missing required fields return proper errors
- [ ] Database errors are handled gracefully
- [ ] Network errors don't crash the application

### Notifications (if configured)
- [ ] SMS notifications are sent for bookings
- [ ] WhatsApp notifications are sent
- [ ] Reminder notifications work
- [ ] Notification failures are logged

---

## 🚨 Common Issues & Troubleshooting

### Google Calendar Issues
If you see calendar-related errors:
1. Check if `GOOGLE_CALENDAR_CREDENTIALS_PATH` is set
2. Verify the service account JSON file exists
3. Ensure the calendar is shared with the service account

### Database Issues
If SQLite errors occur:
1. Check if `data/` directory exists and is writable
2. The app will fallback to JSON files in the `data/` directory
3. Check file permissions

### Notification Issues
If notifications don't work:
1. Check Twilio credentials in environment variables
2. Verify webhook URLs are accessible
3. Check logs for notification service errors

### Memory/Performance Issues
Monitor with:
```bash
# Check metrics endpoint
curl http://localhost:3000/api/dashboard/metrics | grep memory

# Check process usage
ps aux | grep node
```

---

## 📞 Contact Information

This booking system is designed for **Dr. Milan Vahovič** in **Humenné, Slovakia**. All appointment types, schedules, and validation rules are configured specifically for this medical practice.

For development issues, check the logs and ensure all environment variables are properly configured according to the `.env.example` file.