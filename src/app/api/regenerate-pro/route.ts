import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GoogleMapsMatchProcessor } from '@/lib/google-maps-pro';
import { rolesMatch } from '@/lib/utils/roleNormalizer';

/**
 * PROFESSIONAL MATCH GENERATION API
 * SaaS-Grade Implementation
 *
 * Features:
 * - Smart batching (10x10 elements per call)
 * - Professional rate limiting with Bottleneck
 * - Real-time progress tracking
 * - Comprehensive logging
 * - NO fallback mode
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [PROFESSIONAL] Starting match regeneration...');

    // Create Supabase client
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

    // Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log(`✅ User authenticated: ${user.email}`);

    // Fetch candidates and clients
    const [candidatesResult, clientsResult] = await Promise.all([
      supabase.from('candidates').select('id, postcode, role').eq('user_id', user.id),
      supabase.from('clients').select('id, postcode, role').eq('user_id', user.id)
    ]);

    if (candidatesResult.error) throw candidatesResult.error;
    if (clientsResult.error) throw clientsResult.error;

    const candidates = candidatesResult.data || [];
    const clients = clientsResult.data || [];

    if (candidates.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No candidates found'
      }, { status: 400 });
    }

    if (clients.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No clients found'
      }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Google Maps API key not configured'
      }, { status: 500 });
    }

    console.log(`📊 Processing: ${candidates.length} candidates × ${clients.length} clients = ${candidates.length * clients.length} pairs`);

    // Initialize progress tracking in database
    await supabase.from('match_generation_status').upsert({
      user_id: user.id,
      status: 'processing',
      started_at: new Date().toISOString(),
      matches_found: 0,
      excluded_over_80min: 0,
      errors: 0,
      percent_complete: 0,
      method_used: 'google_maps_professional',
    });

    // Start background processing
    processMatchesBackground(user.id, candidates, clients, apiKey).catch(error => {
      console.error('❌ Background processing failed:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Professional match generation started',
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        totalPairs: candidates.length * clients.length,
        estimatedMinutes: Math.ceil((candidates.length * clients.length) / 100), // ~1 minute per 100 pairs
      }
    });

  } catch (error: any) {
    console.error('❌ API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Background processing function
 */
async function processMatchesBackground(
  userId: string,
  candidates: any[],
  clients: any[],
  apiKey: string
) {
  console.log(`🔄 [BACKGROUND] Starting processing for user ${userId}`);

  // Create service-role Supabase client for background operations
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {}
      },
    }
  );

  try {
    // Clear existing matches
    console.log('🗑️  Clearing existing matches...');
    await supabase.from('matches').delete().eq('user_id', userId);

    // Initialize professional processor
    const processor = new GoogleMapsMatchProcessor(apiKey);

    // Process all matches with progress tracking
    const results = await processor.processAllMatches(
      candidates,
      clients,
      async (progress) => {
        // Update progress in database
        await supabase.from('match_generation_status').upsert({
          user_id: userId,
          status: 'processing',
          matches_found: progress.successCount,
          excluded_over_80min: progress.excludedCount,
          errors: progress.errorCount,
          percent_complete: progress.percentage,
          method_used: 'google_maps_professional',
        });

        console.log(`📊 Progress: ${progress.percentage}% (${progress.completed}/${progress.total})`);
      }
    );

    // Insert successful matches into database
    console.log('💾 Inserting matches into database...');

    for (const result of results) {
      if (result.success && result.result) {
        const { result: commuteData } = result;

        // Find candidate and client to get role information
        const candidate = candidates.find(c => c.id === commuteData.candidateId);
        const client = clients.find(c => c.id === commuteData.clientId);

        if (!candidate || !client) continue;

        // 🔄 MULTI-ROLE MATCHING: Check if ANY candidate role matches client role
        // Supports formats like "Dental Nurse/ANP/PN", "Dental Nurse / ANP / PN", etc.
        const roleMatch = rolesMatch(candidate.role, client.role);

        // Insert match
        await supabase.from('matches').insert({
          candidate_id: commuteData.candidateId,
          client_id: commuteData.clientId,
          commute_minutes: commuteData.minutes,
          commute_display: commuteData.display,
          commute_band: commuteData.band,
          role_match: roleMatch,
          role_match_display: roleMatch ? '✅ Match' : '❌ No Match',
          user_id: userId,
        });
      }
    }

    // Count results
    const successCount = results.filter(r => r.success).length;
    const excludedCount = results.filter(r => !r.success && r.error?.includes('Over 80 minutes')).length;
    const errorCount = results.filter(r => !r.success && !r.error?.includes('Over 80 minutes')).length;

    // Update final status
    await supabase.from('match_generation_status').upsert({
      user_id: userId,
      status: 'completed',
      matches_found: successCount,
      excluded_over_80min: excludedCount,
      errors: errorCount,
      percent_complete: 100,
      completed_at: new Date().toISOString(),
      method_used: 'google_maps_professional',
    });

    console.log('✅ [BACKGROUND] Processing complete!', {
      success: successCount,
      excluded: excludedCount,
      errors: errorCount,
    });

  } catch (error: any) {
    console.error('❌ [BACKGROUND] Processing failed:', error);

    // Update status with error
    await supabase.from('match_generation_status').upsert({
      user_id: userId,
      status: 'error',
      error_message: error.message,
      completed_at: new Date().toISOString(),
    });
  }
}

// 🔄 MULTI-ROLE MATCHING: Role normalization and matching now handled by imported rolesMatch() function
// Supports multi-role candidates (e.g., "Dental Nurse/ANP/PN") matching against single client roles
// The rolesMatch() function handles splitting, normalization, and comparison automatically
