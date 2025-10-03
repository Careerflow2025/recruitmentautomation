const { Client } = require('pg');

// Direct connection to your Supabase database
const client = new Client({
  host: 'db.lfoapqybmhxctqdqxxoa.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'vQAZjPh54Hnp_$#',
  ssl: {
    rejectUnauthorized: false
  }
});

async function fixAuth() {
  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to Supabase database');

    // 1. Check existing users
    console.log('\n📋 Checking existing users...');
    const usersResult = await client.query(`
      SELECT
        id,
        email,
        email_confirmed_at,
        created_at,
        CASE
          WHEN email_confirmed_at IS NULL THEN 'NOT CONFIRMED'
          ELSE 'Confirmed'
        END as status
      FROM auth.users
      ORDER BY created_at DESC
    `);

    console.log('\nUsers found:');
    usersResult.rows.forEach(user => {
      console.log(`- ${user.email}: ${user.status} (created: ${user.created_at})`);
    });

    // 2. Check identities
    console.log('\n🔍 Checking identities...');
    const identitiesResult = await client.query(`
      SELECT
        u.email,
        i.provider,
        CASE
          WHEN i.id IS NULL THEN 'NO IDENTITY'
          ELSE 'Has identity'
        END as identity_status
      FROM auth.users u
      LEFT JOIN auth.identities i ON i.user_id = u.id
      ORDER BY u.created_at DESC
    `);

    identitiesResult.rows.forEach(row => {
      console.log(`- ${row.email}: ${row.identity_status} (provider: ${row.provider || 'none'})`);
    });

    // 3. Fix unconfirmed users
    const unconfirmedCount = usersResult.rows.filter(u => u.email_confirmed_at === null).length;

    if (unconfirmedCount > 0) {
      console.log(`\n🔧 Found ${unconfirmedCount} unconfirmed users. Fixing...`);

      const updateResult = await client.query(`
        UPDATE auth.users
        SET email_confirmed_at = NOW()
        WHERE email_confirmed_at IS NULL
        RETURNING email
      `);

      console.log(`✅ Fixed ${updateResult.rowCount} users:`);
      updateResult.rows.forEach(row => {
        console.log(`  - ${row.email} now confirmed`);
      });
    } else {
      console.log('\n✅ All users are already confirmed');
    }

    // 4. Final check
    console.log('\n📊 Final status:');
    const finalResult = await client.query(`
      SELECT
        email,
        email_confirmed_at IS NOT NULL as confirmed
      FROM auth.users
    `);

    finalResult.rows.forEach(user => {
      console.log(`- ${user.email}: ${user.confirmed ? '✅ Confirmed' : '❌ Not confirmed'}`);
    });

    console.log('\n✨ Authentication fix complete!');
    console.log('Try logging in now at http://localhost:3007/login');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the fix
fixAuth();