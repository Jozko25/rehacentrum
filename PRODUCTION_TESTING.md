# Production Testing Guide - Booking System

**Production URL:** `https://rehacentrum-production.up.railway.app`

## 🚀 Pre-Testing Setup

Before testing, ensure these are configured in your Railway environment:

### Required Environment Variables
- `GOOGLE_CALENDAR_CREDENTIALS` or `GOOGLE_CALENDAR_CREDENTIALS_JSON` 
- `GOOGLE_CALENDAR_ID` 
- `NODE_ENV=production`
- Database credentials (Railway PostgreSQL or SQLite)

### Quick Health Check
```bash
curl -X GET https://rehacentrum-production.up.railway.app/health
```
Expected response: `{"status":"healthy",...}`

---

## 🔧 Core Booking Testing

### 1. Get System Configuration
```bash
# Get appointment types
curl -X GET https://rehacentrum-production.up.railway.app/api/booking/appointment-types

# Get working hours and holidays
curl -X GET https://rehacentrum-production.up.railway.app/api/booking/working-hours
```

### 2. Test Available Slots (Fixed Error Messages)
```bash
# Test normal working day
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get_available_slots",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-11"
  }'

# Test weekend (should show improved error message)
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get_available_slots",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-10"
  }'

# Test holiday (should precisely identify as holiday)
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get_available_slots",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-01-01"
  }'
```

### 3. Test Closest Slot Finder (Improved Formatting)
```bash
# Find closest slot - should show improved message format
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "find_closest_slot",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-11",
    "preferred_time": "10:00"
  }'
```

### 4. Test Availability Check (Enhanced Error Detection)
```bash
# Test valid working day slot
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "check_availability",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-11",
    "time": "09:30"
  }'

# Test weekend - should precisely say "je víkend"
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "check_availability",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-10",
    "time": "09:30"
  }'

# Test holiday - should precisely say "je štátny sviatok"
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "check_availability",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-01-01",
    "time": "09:30"
  }'
```

---

## 📋 Full Booking Workflow Test

### Step 1: Book Initial Examination
```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-11",
    "time": "09:00",
    "patient_data": {
      "meno": "Ján",
      "priezvisko": "Testovací",
      "telefon": "+421910123456",
      "poistovna": "VšZP",
      "prvotne_tazkosti": "Bolesti hlavy a únava"
    }
  }'
```

### Step 2: Book Follow-up Examination
```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "kontrolne_vysetrenie",
    "date": "2025-08-11",
    "time": "10:00",
    "patient_data": {
      "meno": "Anna",
      "priezvisko": "Kontrolná",
      "telefon": "+421905987654",
      "poistovna": "Dôvera",
      "prvotne_tazkosti": "Kontrola po liečbe"
    }
  }'
```

### Step 3: Book Sports Examination (Different Time Slot)
```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "sportova_prehliadka",
    "date": "2025-08-11",
    "time": "07:30",
    "patient_data": {
      "meno": "Peter",
      "priezvisko": "Športovec",
      "telefon": "+421944555666"
    }
  }'
```

### Step 4: Test Daily Limits (Medical Devices - Max 1 per day)
```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "zdravotnicke_pomucky",
    "date": "2025-08-11",
    "time": "14:00",
    "patient_data": {
      "meno": "Mária",
      "priezvisko": "Pomôcky",
      "telefon": "+421917888999",
      "prvotne_tazkosti": "Potrebujem berle"
    }
  }'
```

---

## 🏥 All Appointment Types Testing

### Initial Examination (vstupne_vysetrenie)
- **Duration:** 10 minutes
- **Daily limit:** 8 (shared)
- **Time slots:** 09:00-11:30, 13:00-15:00
- **Required:** name, surname, phone, complaints

```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-12",
    "time": "09:10",
    "patient_data": {
      "meno": "Test",
      "priezvisko": "Vstupné",
      "telefon": "+421901111111",
      "poistovna": "VšZP",
      "prvotne_tazkosti": "Prvé vyšetrenie"
    }
  }'
```

### Follow-up Examination (kontrolne_vysetrenie)
- **Duration:** 10 minutes
- **Daily limit:** 8 (shared)
- **Time slots:** 09:00-11:30, 13:00-15:00

```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "kontrolne_vysetrenie",
    "date": "2025-08-12",
    "time": "13:20",
    "patient_data": {
      "meno": "Test",
      "priezvisko": "Kontrolný",
      "telefon": "+421902222222",
      "prvotne_tazkosti": "Kontrola výsledkov"
    }
  }'
```

### Sports Examination (sportova_prehliadka)
- **Duration:** 24 minutes
- **Daily limit:** 5
- **Time slots:** 07:00-09:00
- **Price:** €130

```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "sportova_prehliadka",
    "date": "2025-08-12",
    "time": "08:00",
    "patient_data": {
      "meno": "Test",
      "priezvisko": "Športový",
      "telefon": "+421903333333"
    }
  }'
```

### Medical Devices (zdravotnicke_pomucky)
- **Duration:** 10 minutes
- **Daily limit:** 1
- **Time slots:** 09:00-11:30, 13:00-15:00

```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "zdravotnicke_pomucky",
    "date": "2025-08-12",
    "time": "14:30",
    "patient_data": {
      "meno": "Test",
      "priezvisko": "Pomôcky",
      "telefon": "+421904444444",
      "prvotne_tazkosti": "Potrebujem invalidný vozík"
    }
  }'
```

### Consultation (konzultacia)
- **Duration:** 30 minutes
- **No daily limit**
- **Time slots:** 07:30-09:00, 15:00-16:00
- **Price:** €30

```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "konzultacia",
    "date": "2025-08-12",
    "time": "15:30",
    "patient_data": {
      "meno": "Test",
      "priezvisko": "Konzultácia",
      "telefon": "+421905555555",
      "prvotne_tazkosti": "Potrebujem radu"
    }
  }'
```

---

## 🔧 Admin & Monitoring

### Get Bookings for Specific Date
```bash
curl -X GET https://rehacentrum-production.up.railway.app/api/admin/bookings/2025-08-11
```

### Get Statistics
```bash
curl -X GET https://rehacentrum-production.up.railway.app/api/admin/stats/2025-08-11
```

### System Health (Detailed)
```bash
curl -X GET https://rehacentrum-production.up.railway.app/api/admin/health
```

### Dashboard & Metrics
```bash
# View dashboard in browser
# https://rehacentrum-production.up.railway.app/api/dashboard/

# Get dashboard data
curl -X GET https://rehacentrum-production.up.railway.app/api/dashboard/data

# Get Prometheus metrics
curl -X GET https://rehacentrum-production.up.railway.app/api/dashboard/metrics
```

---

## 🧪 Error Testing Scenarios

### Test Invalid Appointment Type
```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "neexistujuci_typ",
    "date": "2025-08-11",
    "time": "09:00",
    "patient_data": {"meno": "Test", "priezvisko": "Error", "telefon": "123"}
  }'
```

### Test Invalid Time Slot
```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-11",
    "time": "12:00",
    "patient_data": {"meno": "Test", "priezvisko": "WrongTime", "telefon": "+421901234567"}
  }'
```

### Test Missing Patient Data
```bash
curl -X POST https://rehacentrum-production.up.railway.app/api/booking/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "book_appointment",
    "appointment_type": "vstupne_vysetrenie",
    "date": "2025-08-11",
    "time": "09:00",
    "patient_data": {"meno": "Test"}
  }'
```

---

## ✅ Expected Results After Testing

### Improved Error Messages ✨
- **Weekend booking:** "je víkend" (not "je víkend alebo sviatok")
- **Holiday booking:** "je štátny sviatok" (precisely identified)
- **No slots available:** "nie sú dostupné žiadne termíny" (not misleading "obsadené")
- **Closest slot:** "Najbližší voľný termín k požadovanému času je X dňa Y" (improved formatting)

### Booking Limits Should Work
- Max 8 daily for shared types (vstupne, kontrolne, zdravotnicke_pomucky)
- Max 5 daily for sports examinations
- Max 1 daily for medical devices
- No limits for consultations

### Google Calendar Integration
- All bookings should appear in Google Calendar
- Double-booking prevention should work
- Time conflicts should be detected

---

## 🚨 Troubleshooting

### If Health Check Fails
```bash
# Check if service is running
curl -I https://rehacentrum-production.up.railway.app/

# Check Railway logs
# Login to Railway dashboard and check deployment logs
```

### If Bookings Don't Work
1. Check Google Calendar credentials are set
2. Verify calendar sharing permissions
3. Check Railway environment variables
4. Review application logs in Railway dashboard

### If Error Messages Are Wrong
The recent fixes should resolve:
- Precise weekend vs holiday identification
- Clearer "no slots available" messaging  
- Better closest slot formatting

### Rate Limiting
If you get rate limited (100 requests per 15 minutes), wait or test from different IP.

---

## 🎯 Testing Checklist

- [ ] Health check responds
- [ ] Appointment types load
- [ ] Working hours load
- [ ] Available slots work for valid dates
- [ ] Weekend/holiday blocking works with precise messages
- [ ] All 5 appointment types can be booked
- [ ] Daily limits are enforced
- [ ] Invalid data is rejected properly
- [ ] Admin endpoints work
- [ ] Dashboard loads and shows data
- [ ] Error messages are accurate and helpful

**Your booking system is now live and improved! 🚀**