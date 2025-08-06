const appointmentConfig = {
  // Appointment type definitions with specific rules
  appointmentTypes: {
    'vstupne_vysetrenie': {
      name: 'Vstupné vyšetrenie',
      duration: 10, // minutes
      calendar: 'main',
      maxPerDay: 8,
      maxPerHour: 6,
      timeSlots: ['09:00-11:30', '13:00-15:00'],
      sharedDailyLimit: true, // shares the 8/day limit with other main types
      instructions: 'Potrebujete výmenný lístok kvôli úhrade poisťovne a správy o predošlých vyšetreniach od iných lekárov doniesť na vyšetrenie.',
      price: null,
      requiredData: ['meno', 'priezvisko', 'telefon', 'prvotne_tazkosti']
    },
    
    'kontrolne_vysetrenie': {
      name: 'Kontrolné vyšetrenie',
      duration: 10,
      calendar: 'main',
      maxPerDay: 8,
      maxPerHour: 6,
      timeSlots: ['09:00-11:30', '13:00-15:00'],
      sharedDailyLimit: true, // shares the 8/day limit
      instructions: null,
      price: null,
      requiredData: ['meno', 'priezvisko', 'telefon', 'prvotne_tazkosti']
    },
    
    'sportova_prehliadka': {
      name: 'Športová prehliadka',
      duration: 24, // 120min / 5 patients = 24min each
      calendar: 'main',
      maxPerDay: 5,
      maxPerHour: null, // no hourly limit, just daily
      timeSlots: ['07:00-09:00'],
      sharedDailyLimit: false, // independent limit
      instructions: 'Príďte nalačno kvôli odberu krvi a moču. Prineste si jedlo, vodu, veci na prezlečenie a uterák.',
      price: 130,
      requiredData: ['meno', 'priezvisko', 'telefon']
    },
    
    'zdravotnicke_pomucky': {
      name: 'Zdravotnícke pomôcky',
      duration: 10,
      calendar: 'main',
      maxPerDay: 1, // strict limit of 1 per day
      maxPerHour: 1,
      timeSlots: ['09:00-11:30', '13:00-15:00'],
      sharedDailyLimit: true, // counts toward the 8/day limit
      instructions: null,
      price: null,
      requiredData: ['meno', 'priezvisko', 'telefon', 'prvotne_tazkosti']
    },
    
    'konzultacia': {
      name: 'Konzultácia s lekárom',
      duration: 30,
      calendar: 'main',
      maxPerDay: null, // no daily limit for consultations
      maxPerHour: 2, // 60min / 30min = 2 per hour
      timeSlots: ['07:30-09:00', '15:00-16:00'],
      sharedDailyLimit: false, // separate from main 8/day limit
      instructions: 'Nie je hradené poisťovňou.',
      price: 30,
      requiredData: ['meno', 'priezvisko', 'telefon', 'prvotne_tazkosti']
    }
  },
  
  // Daily limits management
  dailyLimits: {
    mainTypes: 8, // vstupne, kontrolne, pomucky share this limit
    sportsExams: 5, // independent limit
    consultations: null // no limit
  },
  
  // Working schedule
  workingHours: {
    monday: ['07:00-09:00', '07:30-09:00', '09:00-11:30', '13:00-15:00', '15:00-16:00'],
    tuesday: ['07:00-09:00', '07:30-09:00', '09:00-11:30', '13:00-15:00', '15:00-16:00'],
    wednesday: ['07:00-09:00', '07:30-09:00', '09:00-11:30', '13:00-15:00', '15:00-16:00'],
    thursday: ['07:00-09:00', '07:30-09:00', '09:00-11:30', '13:00-15:00', '15:00-16:00'],
    friday: ['07:00-09:00', '07:30-09:00', '09:00-11:30', '13:00-15:00', '15:00-16:00'],
    saturday: [], // closed
    sunday: []   // closed
  },
  
  // Booking rules
  bookingRules: {
    slotInterval: 10, // minutes between appointments
    orientacnyTimeMessage: 'Čas je orientačný',
    queueNumbering: true, // assign queue numbers
    maxPatientsPerHour: 6, // for main appointment types
    gdprCompliant: true,
    ringDelay: 5 // seconds before AI picks up
  },
  
  // Slovak public holidays 2025
  holidays: [
    '2025-01-01', '2025-01-06', '2025-04-18', '2025-04-21', 
    '2025-05-01', '2025-05-08', '2025-07-05', '2025-08-29',
    '2025-09-01', '2025-09-15', '2025-11-01', '2025-11-17',
    '2025-12-24', '2025-12-25', '2025-12-26'
  ],
  
  // Vacation dates (to be updated by doctor)
  vacationDates: [],
  
  // Calendar (single calendar for all appointments)
  calendars: {
    main: process.env.MAIN_CALENDAR_ID || 'janko.tank.poi@gmail.com'
  },
  
  // Notification settings
  notifications: {
    whatsapp: {
      enabled: true,
      provider: 'twilio', // or 'zapier'
      automatic: true
    },
    sms: {
      enabled: true,
      provider: 'twilio', // or 'zapier' or 'make'
      triggers: ['booking_confirmation', 'day_before_reminder']
    },
    email: {
      enabled: 'on_request',
      provider: 'zapier'
    }
  },
  
  // Fallback
  fallbackPhone: process.env.FALLBACK_PHONE || '+421918717535'
};

module.exports = appointmentConfig;