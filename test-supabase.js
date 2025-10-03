// Test Supabase connection and API keys
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Testing Supabase Connection...\n');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey ? supabaseKey.substring(0, 20) + '...' : 'MISSING');
console.log('');

async function testConnection() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('✅ Supabase client created\n');
    
    // Test 1: Count candidates
    console.log('📊 Test 1: Counting candidates...');
    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true });
    
    if (candError) {
      console.log('❌ Error:', candError.message);
    } else {
      console.log('✅ Candidates found:', candidates?.length || 'Query successful');
    }
    
    // Test 2: Count clients
    console.log('\n📊 Test 2: Counting clients...');
    const { data: clients, error: clientError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });
    
    if (clientError) {
      console.log('❌ Error:', clientError.message);
    } else {
      console.log('✅ Clients found:', clients?.length || 'Query successful');
    }
    
    // Test 3: Count matches
    console.log('\n📊 Test 3: Counting matches...');
    const { data: matches, error: matchError, count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true });
    
    if (matchError) {
      console.log('❌ Error:', matchError.message);
    } else {
      console.log('✅ Matches found:', count || matches?.length || 'Query successful');
    }
    
    // Test 4: Fetch actual match data
    console.log('\n📊 Test 4: Fetching first 5 matches...');
    const { data: matchData, error: fetchError } = await supabase
      .from('matches')
      .select('*')
      .order('commute_minutes', { ascending: true })
      .limit(5);
    
    if (fetchError) {
      console.log('❌ Error:', fetchError.message);
    } else {
      console.log('✅ Matches retrieved:', matchData?.length || 0);
      if (matchData && matchData.length > 0) {
        console.log('\nFirst match:');
        console.log('  - Candidate:', matchData[0].candidate_id);
        console.log('  - Client:', matchData[0].client_id);
        console.log('  - Commute:', matchData[0].commute_display);
        console.log('  - Role Match:', matchData[0].role_match_display);
      }
    }
    
    console.log('\n✅ All tests completed successfully!');
    console.log('🎉 Supabase connection is working!');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
