import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API Route: Fix Authentication Issues
 * GET /api/fix-auth
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔧 Starting authentication fix...');

    // Create Supabase client with SERVICE ROLE (bypasses RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 1. Get all users from auth schema
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      return NextResponse.json({
        success: false,
        error: `Failed to list users: ${authError.message}`
      });
    }

    const results = {
      totalUsers: authUsers.users.length,
      users: [] as any[],
      fixed: [] as string[],
      errors: [] as string[]
    };

    // 2. Check each user and fix if needed
    for (const user of authUsers.users) {
      const userInfo = {
        id: user.id,
        email: user.email,
        emailConfirmed: user.email_confirmed_at ? true : false,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at
      };

      results.users.push(userInfo);

      // If email is not confirmed, confirm it
      if (!user.email_confirmed_at) {
        console.log(`📧 Confirming email for ${user.email}...`);

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          user.id,
          { email_confirmed_at: new Date().toISOString() }
        );

        if (updateError) {
          results.errors.push(`Failed to confirm ${user.email}: ${updateError.message}`);
        } else {
          results.fixed.push(`✅ Confirmed email for ${user.email}`);
        }
      }
    }

    // 3. Check if candidates table has proper user_id values
    const { data: candidatesCheck, error: candidatesError } = await supabaseAdmin
      .from('candidates')
      .select('id, user_id')
      .limit(5);

    const { data: clientsCheck, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, user_id')
      .limit(5);

    return NextResponse.json({
      success: true,
      message: 'Authentication check complete',
      results,
      tableCheck: {
        candidates: candidatesError ? candidatesError.message : `Found ${candidatesCheck?.length || 0} candidates`,
        clients: clientsError ? clientsError.message : `Found ${clientsCheck?.length || 0} clients`
      },
      nextSteps: results.fixed.length > 0
        ? '✅ Fixed email confirmations. Try logging in now!'
        : '✅ All users already confirmed. If login still fails, check browser console for errors.'
    });

  } catch (error) {
    console.error('Fix auth error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fix authentication'
      },
      { status: 500 }
    );
  }
}