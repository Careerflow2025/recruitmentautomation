#!/usr/bin/env node

/**
 * Database migration script for conversation storage tables
 * Run with: node apply-conversation-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function main() {
  // Load environment variables
  require('dotenv').config({ path: '.env.local' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables');
    process.exit(1);
  }

  console.log('Connecting to Supabase...');
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Read the migration file
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', 'create_conversation_tables.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('Running migration...');
  
  try {
    // Execute the migration
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }

    console.log('✅ Migration completed successfully!');
    console.log('Conversation storage tables have been created:');
    console.log('- conversation_sessions');
    console.log('- conversation_messages');

    // Test the connection
    const { data, error: testError } = await supabase
      .from('conversation_sessions')
      .select('count(*)')
      .limit(1);

    if (testError) {
      console.warn('Warning: Could not test tables:', testError.message);
    } else {
      console.log('✅ Tables are accessible and ready to use');
    }

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };