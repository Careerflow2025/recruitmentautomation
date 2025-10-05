import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Diagnose multi-tenant setup
 * GET /api/diagnose-multi-tenant
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Starting multi-tenant diagnosis...');

    // Create Supabase client with auth
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('❌ Authentication failed:', authError?.message || 'No user found');
      return NextResponse.json(
        { 
          success: false, 
          message: 'Authentication required for diagnosis',
          error: 'Authentication required' 
        },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}, ID: ${user.id}`);

    const diagnosis: any = {
      user: {
        id: user.id,
        email: user.email,
      },
      tables: {},
      errors: [],
    };

    // Check each table structure and data
    const tables = ['candidates', 'clients', 'matches', 'match_statuses', 'match_notes'];
    
    for (const table of tables) {
      try {
        // Check if table has user_id column and data
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        diagnosis.tables[table] = {
          total_records: count || 0,
          error: error?.message || null,
        };

        // Check if there are any records without user_id
        const { count: nullUserIdCount } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .is('user_id', null);

        diagnosis.tables[table].records_without_user_id = nullUserIdCount || 0;
        
      } catch (tableError) {
        diagnosis.errors.push(`Failed to check table ${table}: ${tableError}`);
      }
    }

    // Test Google Maps API key
    diagnosis.google_maps_api = {
      configured: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
      key_length: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.length || 0,
    };

    // Check RLS status (this requires service role but we'll try)
    try {
      const { data: rlsData } = await supabase.rpc('check_rls_status');
      diagnosis.rls_status = rlsData;
    } catch (rlsError) {
      diagnosis.rls_status = 'Cannot check RLS status with current permissions';
    }

    return NextResponse.json({
      success: true,
      message: 'Multi-tenant diagnosis completed',
      diagnosis,
    });

  } catch (error) {
    console.error('Diagnosis error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        message: `Diagnosis failed: ${errorMessage}`,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}