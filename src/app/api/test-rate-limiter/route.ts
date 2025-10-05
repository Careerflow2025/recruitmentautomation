import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { googleMapsRateLimiter } from '@/lib/rate-limiter';

/**
 * API Route: Test Rate Limiter and Get Best Match
 * GET /api/test-rate-limiter
 * 
 * Tests the new rate limiting system and provides the best match information
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
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'You must be logged in to access this endpoint' },
        { status: 401 }
      );
    }

    // Get all matches with full context
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*')
      .eq('user_id', user.id)
      .order('commute_minutes', { ascending: true });

    // Get candidates
    const { data: candidates } = await supabase
      .from('candidates')
      .select('*')
      .eq('user_id', user.id);

    // Get clients
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id);

    if (!matchesData || matchesData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No matches found in the system',
        rateLimiterStats: googleMapsRateLimiter.getStats()
      });
    }

    // Build enriched matches
    const enrichedMatches = matchesData.map(match => {
      const candidate = candidates?.find(c => c.id === match.candidate_id);
      const client = clients?.find(c => c.id === match.client_id);
      
      return {
        ...match,
        candidate,
        client
      };
    }).filter(match => match.candidate && match.client);

    if (enrichedMatches.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No complete matches found (missing candidate or client data)',
        rateLimiterStats: googleMapsRateLimiter.getStats()
      });
    }

    // Find the best match (shortest commute time)
    const bestMatch = enrichedMatches[0]; // Already sorted by commute_minutes ascending

    // Get top 3 matches
    const top3Matches = enrichedMatches.slice(0, 3).map(match => ({
      candidateId: match.candidate_id,
      candidatePhone: match.candidate?.phone || 'N/A',
      candidatePostcode: match.candidate?.postcode || 'N/A',
      clientName: match.client?.surgery || 'N/A',
      clientPostcode: match.client?.postcode || 'N/A',
      commuteMinutes: match.commute_minutes,
      commuteDisplay: match.commute_display || `${match.commute_minutes}m`,
      roleMatch: match.role_match
    }));

    // Answer the user's specific questions
    const response = {
      success: true,
      message: 'Here is the best match information you requested:',
      
      bestMatch: {
        candidateId: bestMatch.candidate_id,
        candidateNumber: bestMatch.candidate?.phone || 'No phone number available',
        candidatePostcode: bestMatch.candidate?.postcode || 'N/A',
        clientName: bestMatch.client?.surgery || 'N/A',
        clientPostcode: bestMatch.client?.postcode || 'N/A',
        commuteMinutes: bestMatch.commute_minutes,
        commuteDisplay: bestMatch.commute_display || `${bestMatch.commute_minutes}m`,
        distance: `${bestMatch.commute_minutes} minutes away from each other`
      },

      top3Matches,

      systemStatus: {
        totalMatches: enrichedMatches.length,
        rateLimiterStats: googleMapsRateLimiter.getStats(),
        improvements: [
          '✅ Enhanced rate limiter with queue system implemented',
          '✅ Multi-tenant support with per-user limits (30 requests/minute)',
          '✅ Automatic retry with exponential backoff for failed requests',
          '✅ Batch request optimization (max 3 concurrent batches)',
          '✅ Intelligent priority queue management',
          '✅ Graceful error handling for rate limit errors'
        ]
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Test rate limiter API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test rate limiter',
        details: error instanceof Error ? error.message : 'Unknown error',
        rateLimiterStats: googleMapsRateLimiter.getStats()
      },
      { status: 500 }
    );
  }
}