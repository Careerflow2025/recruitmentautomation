// Test script to simulate the improved AI assistant
// This script tests the exact query from the user request

const testQuery = async () => {
  console.log('Testing improved AI assistant with user query...');
  
  const testQuestion = "Do you have access to my matches commute system";
  
  try {
    const response = await fetch('http://localhost:3000/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: testQuestion })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    console.log('\n=== ORIGINAL QUESTION ===');
    console.log(testQuestion);
    
    console.log('\n=== AI RESPONSE ===');
    console.log(result.answer);
    
    console.log('\n=== METADATA ===');
    console.log(`Session ID: ${result.sessionId}`);
    console.log(`Tools Used: ${result.toolsUsed}`);
    console.log(`Context Size: ${result.dataUsed?.contextSizeKB}KB`);
    console.log(`Matches Shown: ${result.dataUsed?.matchesShown}/${result.dataUsed?.totalMatches}`);

    // Test the specific "best 3 matches" query
    console.log('\n' + '='.repeat(50));
    console.log('Testing "best three matches" query...');
    
    const bestMatchesQuery = "OK can you bring me the best three matches just tell me the name of the candidate and the number of the candidate and his postcode for the three best ones and the same for clients and tell me the distance between each one of them";
    
    const response2 = await fetch('http://localhost:3000/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        question: bestMatchesQuery,
        sessionId: result.sessionId // Continue same session
      })
    });

    if (!response2.ok) {
      throw new Error(`HTTP ${response2.status}: ${response2.statusText}`);
    }

    const result2 = await response2.json();
    
    console.log('\n=== BEST 3 MATCHES QUESTION ===');
    console.log(bestMatchesQuery);
    
    console.log('\n=== AI RESPONSE ===');
    console.log(result2.answer);
    
    console.log('\n=== TEST COMPLETE ===');
    console.log('✅ Both queries processed successfully');
    console.log(`✅ Session continuity maintained: ${result.sessionId === result2.sessionId}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('Make sure the development server is running on port 3000');
    }
  }
};

// Run the test
testQuery();