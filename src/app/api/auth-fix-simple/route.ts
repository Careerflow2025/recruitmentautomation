import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // Use service role to bypass RLS
    const supabase = createClient(
      'https://lfoapqybmhxctqdqxxoa.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxmb2FwcXlibWh4Y3RxZHF4eG9hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTI4NDUwMiwiZXhwIjoyMDc0ODYwNTAyfQ.ZUjowbmJqIkc0peFhtO73F7CYQnnaxdsHfbrGP4IN0o'
    );

    // Get all users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      return NextResponse.json({ error: listError.message });
    }

    const results = [];

    // Fix each user
    for (const user of users) {
      if (!user.email_confirmed_at) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          user.id,
          { email_confirmed_at: new Date().toISOString() }
        );

        if (!updateError) {
          results.push(`✅ Fixed ${user.email}`);
        } else {
          results.push(`❌ Failed to fix ${user.email}: ${updateError.message}`);
        }
      } else {
        results.push(`✅ ${user.email} already confirmed`);
      }
    }

    return NextResponse.json({
      message: 'Auth fix complete! Try logging in now.',
      results,
      totalUsers: users.length
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}