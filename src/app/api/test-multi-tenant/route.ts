import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Test endpoint to verify multi-tenant functionality
 * GET /api/test-multi-tenant
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing multi-tenant functionality...');

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
          message: 'You must be logged in to test multi-tenant functionality',
          error: 'Authentication required' 
        },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}, ID: ${user.id}`);

    // Test candidates access
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('id, postcode, role, user_id')
      .eq('user_id', user.id);

    // Test clients access
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, postcode, role, user_id')
      .eq('user_id', user.id);

    // Test matches access
    const { data: matches, error: matchesError } = await supabase
      .from('matches')
      .select('candidate_id, client_id, user_id')
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      message: 'Multi-tenant test completed successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
        },
        candidates: {
          count: candidates?.length || 0,
          error: candidatesError?.message || null,
          sample: candidates?.slice(0, 2) || [],
        },
        clients: {
          count: clients?.length || 0,
          error: clientsError?.message || null,
          sample: clients?.slice(0, 2) || [],
        },
        matches: {
          count: matches?.length || 0,
          error: matchesError?.message || null,
          sample: matches?.slice(0, 2) || [],
        },
      },
    });
  } catch (error) {
    console.error('Multi-tenant test error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        message: `Multi-tenant test failed: ${errorMessage}`,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}