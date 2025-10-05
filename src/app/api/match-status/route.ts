import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * API Route: Check Match Generation Status
 * GET /api/match-status
 *
 * Returns the current status of match generation for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json(
        { 
          success: false, 
          message: 'You must be logged in to check match status',
          error: 'Authentication required' 
        },
        { status: 401 }
      );
    }

    // Check if user has any matches
    const { count: matchCount, error: matchError } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (matchError) {
      throw matchError;
    }

    // Check for stored match status
    const { data: matchStatus, error: statusError } = await supabase
      .from('match_statuses')
      .select('*')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (statusError) {
      console.warn('Could not fetch match status:', statusError);
    }

    // Get candidates and clients count
    const [candidatesResult, clientsResult] = await Promise.all([
      supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    ]);

    if (candidatesResult.error) throw candidatesResult.error;
    if (clientsResult.error) throw clientsResult.error;

    const candidatesCount = candidatesResult.count || 0;
    const clientsCount = clientsResult.count || 0;
    const expectedMatches = candidatesCount * clientsCount;

    // Determine status
    let status = 'unknown';
    let message = '';
    let processing = false;
    let methodUsed = null;

    if (candidatesCount === 0) {
      status = 'no_candidates';
      message = 'No candidates found. Please add candidates first.';
    } else if (clientsCount === 0) {
      status = 'no_clients';
      message = 'No clients found. Please add clients first.';
    } else if (matchStatus && matchStatus.status === 'error') {
      status = 'error';
      message = `Match generation failed: ${matchStatus.error_message || 'Unknown error'}`;
    } else if (matchStatus && matchStatus.status === 'completed') {
      status = 'complete';
      methodUsed = matchStatus.method_used;
      
      if (methodUsed === 'fallback_estimation') {
        message = `Match generation complete using estimated commute times. ${matchCount} matches found. (Google Maps API unavailable)`;
      } else {
        message = `Match generation complete using Google Maps API. ${matchCount} matches found.`;
      }
    } else if (matchCount === 0) {
      status = 'processing';
      message = 'Match generation in progress. Please wait...';
      processing = true;
    } else if (matchCount > 0 && matchCount < expectedMatches * 0.5) {
      // Less than 50% of expected matches - likely still processing
      status = 'processing';
      message = `Match generation in progress. Found ${matchCount} matches so far...`;
      processing = true;
    } else {
      status = 'complete';
      message = `Match generation complete. ${matchCount} matches found.`;
      processing = false;
    }

    return NextResponse.json({
      success: true,
      status,
      message,
      processing,
      method_used: methodUsed,
      last_update: matchStatus?.completed_at,
      stats: {
        candidates: candidatesCount,
        clients: clientsCount,
        expected_matches: expectedMatches,
        current_matches: matchCount || 0,
        completion_percentage: expectedMatches > 0 ? Math.round(((matchCount || 0) / expectedMatches) * 100) : 0,
        excluded_over_80min: matchStatus?.excluded_over_80min || 0,
        errors: matchStatus?.errors || 0,
      }
    });

  } catch (error) {
    console.error('Match status check error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        message: `Failed to check match status: ${errorMessage}`,
        error: errorMessage,
        processing: false
      },
      { status: 500 }
    );
  }
}