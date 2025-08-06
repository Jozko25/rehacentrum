const axios = require('axios');

// Test data for booking
const testBooking = {
  action: 'book_appointment',
  appointment_type: 'sportova_prehliadka',
  date: '2025-08-10',
  time: '07:00',
  patient_data: {
    meno: 'Test',
    priezvisko: 'Patient',
    telefon: '+421918717535',
    rodne_cislo: '8001011234',
    zdravotna_poistovna: 'VšZP',
    email: 'test@example.com'
  }
};

async function testConcurrentBooking() {
  console.log('🧪 Testing concurrent booking prevention...');
  
  // Create 5 simultaneous booking requests for the same time slot
  const promises = [];
  for (let i = 0; i < 5; i++) {
    const booking = {
      ...testBooking,
      patient_data: {
        ...testBooking.patient_data,
        email: `test${i}@example.com`,
        rodne_cislo: `800101123${i}`
      }
    };
    
    promises.push(
      axios.post('http://localhost:3000/api/booking/webhook', booking)
        .then(response => ({ success: true, data: response.data, index: i }))
        .catch(error => ({ success: false, error: error.response?.data || error.message, index: i }))
    );
  }
  
  console.log('📡 Sending 5 concurrent requests...');
  const results = await Promise.all(promises);
  
  let successCount = 0;
  let failureCount = 0;
  
  results.forEach(result => {
    if (result.success) {
      console.log(`✅ Request ${result.index}: ${result.data}`);
      if (result.data.includes('Termín rezervovaný')) {
        successCount++;
      }
    } else {
      console.log(`❌ Request ${result.index}: ${result.error}`);
      failureCount++;
    }
  });
  
  console.log('\n📊 Test Results:');
  console.log(`✅ Successful bookings: ${successCount}`);
  console.log(`❌ Failed bookings: ${failureCount}`);
  
  if (successCount === 1 && failureCount === 4) {
    console.log('🎉 SUCCESS: Double booking prevention is working correctly!');
  } else if (successCount > 1) {
    console.log('❌ FAILURE: Multiple bookings were allowed for the same time slot!');
  } else {
    console.log('⚠️ UNEXPECTED: No bookings were successful. Check server logs.');
  }
}

testConcurrentBooking().catch(console.error);