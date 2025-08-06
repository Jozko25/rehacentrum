const axios = require('axios');

const API_URL = 'http://localhost:3000/api/booking/webhook';

// Valid Slovak names and data for testing
const validNames = [
  { meno: 'Ján', priezvisko: 'Novák' },
  { meno: 'Peter', priezvisko: 'Kováč' },
  { meno: 'Mária', priezvisko: 'Svoboda' },
  { meno: 'Anna', priezvisko: 'Horváth' },
  { meno: 'Martin', priezvisko: 'Dvořák' },
  { meno: 'Elena', priezvisko: 'Varga' },
  { meno: 'Tomáš', priezvisko: 'Šťastný' },
  { meno: 'Katarína', priezvisko: 'Černý' },
  { meno: 'Pavol', priezvisko: 'Procházka' },
  { meno: 'Lucia', priezvisko: 'Krejčí' }
];

const validPhones = [
  '+421918111111', '+421907222222', '+421908333333', '+421909444444', '+421910555555',
  '+421911666666', '+421912777777', '+421913888888', '+421914999999', '+421915000000'
];

const validBirthNumbers = [
  '7501011234', '7601021345', '7701031456', '7801041567', '7901051678',
  '8001061789', '8101071890', '8201081901', '8301091012', '8401101123'
];

// Test data templates
const createBookingData = (appointmentType, date, time, patientIndex) => {
  const nameData = validNames[patientIndex % validNames.length];
  return {
    action: 'book_appointment',
    appointment_type: appointmentType,
    date: date,
    time: time,
    patient_data: {
      meno: nameData.meno,
      priezvisko: nameData.priezvisko,
      telefon: validPhones[patientIndex % validPhones.length],
      rodne_cislo: validBirthNumbers[patientIndex % validBirthNumbers.length],
      zdravotna_poistovna: 'VšZP',
      email: `test${patientIndex}.${nameData.meno.toLowerCase()}@example.com`
    }
  };
};

async function makeBooking(bookingData, description) {
  try {
    const response = await axios.post(API_URL, bookingData);
    const success = response.data.includes('Termín rezervovaný');
    console.log(`${success ? '✅' : '❌'} ${description}: ${response.data}`);
    return { success, message: response.data };
  } catch (error) {
    const message = error.response?.data || error.message;
    console.log(`❌ ${description}: ${message}`);
    return { success: false, message };
  }
}

async function testSportovaPrehliadkaClean() {
  console.log('\n🏃 Testing Športová prehliadka daily limit (max 5/day) - Clean Test');
  console.log('=' .repeat(70));
  
  // Use a completely fresh date that hasn't been used before
  const testDate = '2025-08-20';
  
  // Use different time slots to avoid calendar conflicts
  const timeSlots = ['07:00', '07:30', '08:00', '08:30', '08:45', '08:50']; // 6 slots, but max 5 allowed
  
  let successCount = 0;
  
  for (let i = 0; i < 6; i++) {
    const bookingData = createBookingData('sportova_prehliadka', testDate, timeSlots[i], i + 100);
    const result = await makeBooking(bookingData, `Booking ${i + 1}/6 at ${timeSlots[i]}`);
    
    if (result.success) {
      successCount++;
    }
    
    // Check if we got the daily limit message
    if (result.message.includes('Denný limit pre tento typ vyšetrenia je naplnený')) {
      console.log(`   📊 Daily limit reached after ${successCount} bookings`);
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n📊 Športová prehliadka results: ${successCount}/6 bookings successful`);
  if (successCount === 5) {
    console.log('🎉 SUCCESS: Daily limit working correctly (5 allowed, 1 rejected)');
    return true;
  } else {
    console.log(`❌ FAILURE: Expected 5 successful bookings, got ${successCount}`);
    return false;
  }
}

async function testZdravottnickePomuckyClean() {
  console.log('\n🏥 Testing Zdravotnícke pomôcky daily limit (max 1/day) - Clean Test');
  console.log('=' .repeat(70));
  
  // Use a fresh date
  const testDate = '2025-08-21';
  const timeSlots = ['09:00', '10:00', '11:00']; // 3 attempts, but max 1 allowed
  
  let successCount = 0;
  
  for (let i = 0; i < 3; i++) {
    const bookingData = createBookingData('zdravotnicke_pomucky', testDate, timeSlots[i], i + 200);
    const result = await makeBooking(bookingData, `Booking ${i + 1}/3 at ${timeSlots[i]}`);
    
    if (result.success) {
      successCount++;
    }
    
    // Check if we got the daily limit message
    if (result.message.includes('Denný limit pre tento typ vyšetrenia je naplnený')) {
      console.log(`   📊 Daily limit reached after ${successCount} bookings`);
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`\n📊 Zdravotnícke pomôcky results: ${successCount}/3 bookings successful`);
  if (successCount === 1) {
    console.log('🎉 SUCCESS: Daily limit working correctly (1 allowed, 2 rejected)');
    return true;
  } else {
    console.log(`❌ FAILURE: Expected 1 successful booking, got ${successCount}`);
    return false;
  }
}

async function runCleanTests() {
  console.log('🧪 Starting CLEAN Daily Limits Test Suite');
  console.log('Using fresh dates and unique patient data to avoid conflicts');
  console.log('=' .repeat(70));
  
  const results = [];
  
  // Test individual limits with clean data
  results.push(await testSportovaPrehliadkaClean());
  results.push(await testZdravottnickePomuckyClean());
  
  // Final summary
  console.log('\\n' + '=' .repeat(70));
  console.log('📋 FINAL CLEAN TEST RESULTS');
  console.log('=' .repeat(70));
  
  const passedTests = results.filter(r => r).length;
  const totalTests = results.length;
  
  console.log(`✅ Tests passed: ${passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED: Daily limits are working correctly!');
  } else {
    console.log('❌ SOME TESTS FAILED: Daily limits need debugging');
  }
}

// Run the clean tests
runCleanTests().catch(console.error);