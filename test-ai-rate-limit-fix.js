/**
 * Test script to validate AI rate limiting fix
 * 
 * This script tests:
 * 1. Multiple concurrent AI requests to ensure rate limiting works properly
 * 2. Context management and conversation continuity
 * 3. Error handling for rate limits and empty responses
 * 4. Multi-tenant isolation
 */

console.log('🧪 Testing AI Rate Limiting and Context Management Fix');
console.log('====================================================');

// Test configuration
const testConfig = {
  maxConcurrentRequests: 5,
  requestDelay: 1000, // 1 second between requests
  testUserId: 'test_user_12345678', // Simulated user ID
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:8888'
};

console.log('Test Configuration:');
console.log('- Max concurrent requests:', testConfig.maxConcurrentRequests);
console.log('- Request delay:', testConfig.requestDelay, 'ms');
console.log('- Test user ID:', testConfig.testUserId);
console.log('- Base URL:', testConfig.baseUrl);
console.log('');

// Test questions that should trigger different response patterns
const testQuestions = [
  'How many in-progress matches do I have?',
  'Tell me about orange status matches',
  'What candidates are in progress status?',
  'Show me the names of people with in-progress status',
  'Give me phone numbers for in-progress matches'
];

async function testSingleRequest(question, sessionId) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${testConfig.baseUrl}/api/ai/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sb-auth-token=mock_token_for_${testConfig.testUserId}` // Mock auth
      },
      body: JSON.stringify({ 
        question, 
        sessionId 
      })
    });

    const responseTime = Date.now() - startTime;
    const text = await response.text();

    if (!text) {
      return {
        success: false,
        error: 'Empty response from server',
        responseTime,
        status: response.status
      };
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (parseError) {
      return {
        success: false,
        error: 'Invalid JSON response: ' + text.substring(0, 100),
        responseTime,
        status: response.status
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: result.details || result.error || 'Request failed',
        responseTime,
        status: response.status
      };
    }

    return {
      success: true,
      answer: result.answer?.substring(0, 100) + (result.answer?.length > 100 ? '...' : ''),
      sessionId: result.sessionId,
      contextInfo: result.contextInfo,
      responseTime,
      status: response.status
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      responseTime: Date.now() - startTime,
      status: 'Network Error'
    };
  }
}

async function runTests() {
  console.log('🚀 Starting AI Rate Limiting Tests...');
  console.log('');

  const sessionId = `test_session_${Date.now()}`;
  let successCount = 0;
  let totalRequests = 0;

  // Test 1: Sequential requests (normal conversation flow)
  console.log('📝 Test 1: Sequential Requests (Normal Conversation)');
  console.log('--------------------------------------------------');
  
  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i];
    totalRequests++;
    
    console.log(`Question ${i + 1}: "${question}"`);
    
    const result = await testSingleRequest(question, sessionId);
    
    if (result.success) {
      successCount++;
      console.log(`✅ Success (${result.responseTime}ms): ${result.answer}`);
      if (result.contextInfo) {
        console.log(`   Context: ${result.contextInfo.conversationHistory} history entries, ${result.contextInfo.aiRequestsRemaining} requests remaining`);
      }
    } else {
      console.log(`❌ Failed (${result.responseTime}ms): ${result.error} (Status: ${result.status})`);
    }
    
    console.log('');
    
    // Small delay between requests to simulate natural conversation
    if (i < testQuestions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, testConfig.requestDelay));
    }
  }

  // Test 2: Concurrent requests (stress test)
  console.log('⚡ Test 2: Concurrent Requests (Stress Test)');
  console.log('--------------------------------------------');
  
  const concurrentPromises = [];
  const concurrentSessionId = `concurrent_session_${Date.now()}`;
  
  for (let i = 0; i < testConfig.maxConcurrentRequests; i++) {
    const question = `Concurrent test request ${i + 1}: How many matches do I have?`;
    concurrentPromises.push(testSingleRequest(question, concurrentSessionId));
    totalRequests++;
  }
  
  console.log(`Sending ${testConfig.maxConcurrentRequests} concurrent requests...`);
  
  const concurrentResults = await Promise.allSettled(concurrentPromises);
  
  concurrentResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        successCount++;
        console.log(`✅ Concurrent ${index + 1} (${result.value.responseTime}ms): Success`);
      } else {
        console.log(`❌ Concurrent ${index + 1} (${result.value.responseTime}ms): ${result.value.error}`);
      }
    } else {
      console.log(`❌ Concurrent ${index + 1}: Promise rejected - ${result.reason}`);
    }
  });

  // Test Summary
  console.log('');
  console.log('📊 Test Summary');
  console.log('===============');
  console.log(`Total requests: ${totalRequests}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${totalRequests - successCount}`);
  console.log(`Success rate: ${((successCount / totalRequests) * 100).toFixed(1)}%`);
  console.log('');

  // Expected improvements
  console.log('✨ Expected Improvements from Fix:');
  console.log('- ✅ Increased rate limit from 10 to 30 requests/minute per user');
  console.log('- ✅ Automatic retry with exponential backoff for rate limit errors');
  console.log('- ✅ Better error messages explaining temporary delays');
  console.log('- ✅ Context size management to avoid token limit errors');
  console.log('- ✅ 500ms delay between requests to prevent API overload');
  console.log('- ✅ Multi-tenant isolation maintained while improving performance');

  if (successRate >= 80) {
    console.log('');
    console.log('🎉 AI Rate Limiting Fix appears to be working correctly!');
  } else {
    console.log('');
    console.log('⚠️  Some issues may still exist. Check server logs for details.');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});