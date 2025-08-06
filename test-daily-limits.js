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
  '+421918717535', '+421907123456', '+421908234567', '+421909345678', '+421910456789',
  '+421911567890', '+421912678901', '+421913789012', '+421914890123', '+421915901234'
];

const validBirthNumbers = [
  '8001011234', '8501021345', '9001031456', '9501041567', '0001051678',
  '0501061789', '1001071890', '1501081901', '2001091012', '2501101123'
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
      email: `${nameData.meno.toLowerCase()}.${nameData.priezvisko.toLowerCase()}${patientIndex}@example.com`
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

async function testSportovaPrehliadka() {
  console.log('\n🏃 Testing Športová prehliadka daily limit (max 5/day)');
  console.log('=' .repeat(60));
  
  const testDate = '2025-08-15'; // Use a clean future date
  const timeSlots = ['07:00', '07:10', '07:20', '07:30', '07:40', '07:50']; // 6 slots, but max 5 allowed
  
  let successCount = 0;
  
  for (let i = 0; i < 6; i++) {
    const bookingData = createBookingData('sportova_prehliadka', testDate, timeSlots[i], i + 1);
    const result = await makeBooking(bookingData, `Booking ${i + 1}/6`);
    
    if (result.success) {
      successCount++;
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n📊 Športová prehliadka results: ${successCount}/6 bookings successful`);
  if (successCount === 5) {
    console.log('🎉 SUCCESS: Daily limit working correctly (5 allowed, 1 rejected)');
  } else {
    console.log(`❌ FAILURE: Expected 5 successful bookings, got ${successCount}`);
  }
  
  return successCount === 5;
}

async function testZdravottnickePomucky() {
  console.log('\n🏥 Testing Zdravotnícke pomôcky daily limit (max 1/day)');
  console.log('=' .repeat(60));
  
  const testDate = '2025-08-13'; // Use a different date
  const timeSlots = ['09:00', '09:10', '09:20']; // 3 attempts, but max 1 allowed
  
  let successCount = 0;
  
  for (let i = 0; i < 3; i++) {
    const bookingData = createBookingData('zdravotnicke_pomucky', testDate, timeSlots[i], i + 10);
    const result = await makeBooking(bookingData, `Booking ${i + 1}/3`);
    
    if (result.success) {
      successCount++;
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n📊 Zdravotnícke pomôcky results: ${successCount}/3 bookings successful`);
  if (successCount === 1) {
    console.log('🎉 SUCCESS: Daily limit working correctly (1 allowed, 2 rejected)');
  } else {
    console.log(`❌ FAILURE: Expected 1 successful booking, got ${successCount}`);
  }
  
  return successCount === 1;
}

async function testSharedDailyLimit() {
  console.log('\n🤝 Testing Shared daily limit for main appointment types (max 8/day total)');
  console.log('=' .repeat(60));
  
  const testDate = '2025-08-14'; // Use another different date
  let successCount = 0;
  
  // Try to book 10 appointments across different types that share the limit
  const appointments = [
    // 4 vstupne_vysetrenie
    { type: 'vstupne_vysetrenie', time: '09:00' },
    { type: 'vstupne_vysetrenie', time: '09:10' },
    { type: 'vstupne_vysetrenie', time: '09:20' },
    { type: 'vstupne_vysetrenie', time: '09:30' },
    // 4 kontrolne_vysetrenie
    { type: 'kontrolne_vysetrenie', time: '09:40' },
    { type: 'kontrolne_vysetrenie', time: '09:50' },
    { type: 'kontrolne_vysetrenie', time: '10:00' },
    { type: 'kontrolne_vysetrenie', time: '10:10' },
    // 2 more that should be rejected (total would be 10, but max is 8)
    { type: 'vstupne_vysetrenie', time: '10:20' },
    { type: 'kontrolne_vysetrenie', time: '10:30' }
  ];
  
  for (let i = 0; i < appointments.length; i++) {
    const bookingData = createBookingData(appointments[i].type, testDate, appointments[i].time, i + 20);
    const result = await makeBooking(bookingData, `${appointments[i].type} booking ${i + 1}/10`);
    
    if (result.success) {
      successCount++;
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n📊 Shared limit results: ${successCount}/10 bookings successful`);
  if (successCount === 8) {
    console.log('🎉 SUCCESS: Shared daily limit working correctly (8 allowed, 2 rejected)');
  } else {
    console.log(`❌ FAILURE: Expected 8 successful bookings, got ${successCount}`);
  }
  
  return successCount === 8;
}

async function runAllTests() {
  console.log('🧪 Starting Daily Limits Test Suite');
  console.log('=' .repeat(60));
  
  const results = [];
  
  // Test individual limits
  results.push(await testSportovaPrehliadka());
  results.push(await testZdravottnickePomucky());
  results.push(await testSharedDailyLimit());
  
  // Final summary
  console.log('\n' + '=' .repeat(60));
  console.log('📋 FINAL TEST RESULTS');
  console.log('=' .repeat(60));
  
  const passedTests = results.filter(r => r).length;
  const totalTests = results.length;
  
  console.log(`✅ Tests passed: ${passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED: Daily limits are working correctly!');
  } else {
    console.log('❌ SOME TESTS FAILED: Daily limits need debugging');
  }
}

// Run the tests
runAllTests().catch(console.error);