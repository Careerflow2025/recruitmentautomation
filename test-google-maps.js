/**
 * Simple test to check if Google Maps API is working
 * Run with: node test-google-maps.js
 */

const API_KEY = 'AIzaSyBzXVL8dt4sjqcJGEe1sc3efKiTPs8_TpY';

async function testGoogleMapsAPI() {
  console.log('🧪 Testing Google Maps Distance Matrix API...\n');

  // Test with two simple UK postcodes
  const origin = 'SW1A 1AA'; // Buckingham Palace
  const destination = 'E1 6AN'; // Tower of London

  const params = new URLSearchParams({
    origins: origin,
    destinations: destination,
    mode: 'driving',
    units: 'imperial',
    key: API_KEY,
  });

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

  console.log('📍 Testing route:');
  console.log(`   Origin: ${origin}`);
  console.log(`   Destination: ${destination}`);
  console.log(`   URL: ${url.replace(API_KEY, 'API_KEY_HIDDEN')}\n`);

  try {
    console.log('🌐 Making request...\n');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    console.log(`📊 Response status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP Error:', errorText);
      return;
    }

    const data = await response.json();

    console.log('📦 Full response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n');

    // Check response status
    if (data.status && data.status !== 'OK') {
      console.error('❌ API Status Error:', data.status);
      if (data.error_message) {
        console.error('❌ Error Message:', data.error_message);
      }

      if (data.status === 'REQUEST_DENIED') {
        console.error('\n🚨 REQUEST_DENIED - Possible causes:');
        console.error('   1. API key is invalid');
        console.error('   2. Distance Matrix API is not enabled in Google Cloud Console');
        console.error('   3. Billing is not set up');
        console.error('   4. API key has domain/IP restrictions that block this request');
      }

      return;
    }

    // Parse results
    if (data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0]) {
      const element = data.rows[0].elements[0];

      if (element.status === 'OK') {
        console.log('✅ SUCCESS! API is working correctly.\n');
        console.log('📊 Result:');
        console.log(`   Distance: ${element.distance.text}`);
        console.log(`   Duration: ${element.duration.text}`);
        console.log(`   Duration (seconds): ${element.duration.value}`);
        console.log(`   Duration (minutes): ${Math.round(element.duration.value / 60)}`);
      } else {
        console.error('❌ Element Status Error:', element.status);
      }
    } else {
      console.error('❌ Unexpected response structure');
    }

  } catch (error) {
    console.error('❌ Request Failed:', error.message);
    console.error('Full error:', error);
  }
}

testGoogleMapsAPI();
