import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { calculateAllCommutesSmartBatch } from '@/lib/google-maps-batch';

/**
 * API Route: Regenerate Matches with Real Google Maps Data
 * POST /api/regenerate-matches
 *
 * This replaces all mock commute times with real Google Maps API results
 * RULE 2: Excludes matches over 80 minutes
 * RULE 3: Uses ONLY Google Maps Distance Matrix API
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting asynchronous match regeneration...');

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
          message: 'You must be logged in to regenerate matches',
          error: 'Authentication required' 
        },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}, ID: ${user.id}`);

    // 1. Fetch current user's candidates and clients to validate they exist
    const [candidatesResult, clientsResult] = await Promise.all([
      supabase.from('candidates').select('id, postcode, role, user_id').eq('user_id', user.id),
      supabase.from('clients').select('id, postcode, role, user_id').eq('user_id', user.id)
    ]);

    if (candidatesResult.error) throw candidatesResult.error;
    if (clientsResult.error) throw clientsResult.error;

    const candidates = candidatesResult.data || [];
    const clients = clientsResult.data || [];

    if (candidates.length === 0) {
      return NextResponse.json({ 
        success: false,
        message: 'No candidates found for your account',
        error: 'No candidates found for your account' 
      }, { status: 404 });
    }

    if (clients.length === 0) {
      return NextResponse.json({ 
        success: false,
        message: 'No clients found for your account',
        error: 'No clients found for your account' 
      }, { status: 404 });
    }

    const totalPairs = candidates.length * clients.length;
    console.log(`📊 Found ${candidates.length} candidates × ${clients.length} clients = ${totalPairs} pairs`);

    // 2. Check Google Maps API key
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: 'Google Maps API key not configured',
        error: 'Google Maps API key not configured'
      }, { status: 500 });
    }

    // 3. Start background processing immediately (don't await)
    console.log('🔄 Starting background match generation...');
    processMatchesInBackground(user.id, candidates, clients, apiKey).catch(error => {
      console.error('❌ Background match processing failed:', error);
      // Log more details for debugging
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        userId: user.id,
        candidatesCount: candidates.length,
        clientsCount: clients.length
      });
    });

    // 4. Return immediate response for client to start polling
    return NextResponse.json({
      success: true,
      message: 'Match generation started. Please wait while we process your matches...',
      processing: true,
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        total_pairs_to_process: totalPairs,
        estimated_time_seconds: Math.ceil(totalPairs / 100) * 2 // Rough estimate: 2 seconds per 100 pairs
      }
    });

  } catch (error) {
    console.error('Match regeneration startup error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        message: `Failed to start match generation: ${errorMessage}`,
        error: errorMessage,
        processing: false
      },
      { status: 500 }
    );
  }
}

/**
 * Background function to process matches asynchronously
 * This runs independently of the HTTP request timeout
 */
async function processMatchesInBackground(
  userId: string, 
  candidates: any[], 
  clients: any[], 
  apiKey: string
) {
  try {
    console.log(`🔄 Background processing started for user ${userId}`);
    console.log(`📊 Processing ${candidates.length} candidates × ${clients.length} clients = ${candidates.length * clients.length} pairs`);
    
    // Create a separate Supabase client for background processing
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

    // Clear existing matches for current user only
    console.log(`🗑️ Clearing existing matches for user ${userId}`);
    const { error: deleteError } = await supabase
      .from('matches')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('❌ Failed to clear existing matches:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Cleared existing matches for user ${userId}`);

    // RULE 3: ALWAYS use Google Maps API - no fallback allowed
    console.log('🌐 Using Google Maps API for ALL match calculations (RULE 3)...');

    let successCount = 0;
    let excludedCount = 0;
    let errorCount = 0;

    try {
      // Use smart batch processing with Google Maps Distance Matrix API
      const batchResults = await calculateAllCommutesSmartBatch(
        candidates.map(c => ({ id: c.id, postcode: c.postcode })),
        clients.map(c => ({ id: c.id, postcode: c.postcode })),
        apiKey,
        userId,
        (current, total, message) => {
          console.log(`📊 Background progress for user ${userId}: ${message}`);
        }
      );

      console.log(`💾 Inserting ${batchResults.length} Google Maps results for user ${userId}...`);

      for (const result of batchResults) {
        if (result.result === null) {
          if (result.error?.includes('Over 80 minutes')) {
            excludedCount++;
          } else {
            errorCount++;
          }
          continue;
        }

        // Get candidate and client data for role matching
        const candidate = candidates.find(c => c.id === result.candidateId);
        const client = clients.find(c => c.id === result.clientId);

        if (!candidate || !client) continue;

        // Normalize roles for matching
        const candidateRole = normalizeRole(candidate.role);
        const clientRole = normalizeRole(client.role);
        const roleMatch = candidateRole === clientRole;

        // Insert match with current user's ID
        const { error: insertError } = await supabase.from('matches').insert({
          candidate_id: result.candidateId,
          client_id: result.clientId,
          commute_minutes: result.result.minutes,
          commute_display: result.result.display,
          commute_band: result.result.band,
          role_match: roleMatch,
          role_match_display: roleMatch ? '✅ Match' : '❌ No Match',
          user_id: userId,
        });

        if (insertError) {
          console.error(`❌ Failed to insert match for user ${userId}: ${result.candidateId} -> ${result.clientId}`, insertError);
          errorCount++;
          continue;
        }

        successCount++;
      }

    } catch (batchError) {
      console.error('❌ Google Maps batch processing FAILED:', batchError);
      throw new Error(`Google Maps API processing failed: ${batchError instanceof Error ? batchError.message : String(batchError)}. Please check your API key configuration and try again.`);
    }

    console.log(`✅ Background match regeneration complete for user ${userId}!`);
    console.log(`   ✅ Successful matches: ${successCount}`);
    console.log(`   ⊗ Excluded (>80min): ${excludedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   🌐 Method: Google Maps Distance Matrix API (RULE 3)`);

    // Store completion status
    try {
      const { error: statusError } = await supabase
        .from('match_generation_status')
        .upsert({
          user_id: userId,
          status: 'completed',
          matches_found: successCount,
          excluded_over_80min: excludedCount,
          errors: errorCount,
          method_used: 'google_maps',
          completed_at: new Date().toISOString(),
          percent_complete: 100,
        });

      if (statusError) {
        console.error('❌ Failed to update match generation status:', statusError);
      }
    } catch (statusUpdateError) {
      console.error('❌ Error updating match generation status:', statusUpdateError);
    }

  } catch (error) {
    console.error(`❌ Background match processing failed for user ${userId}:`, error);
    
    // Try to update status with error
    try {
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

      await supabase
        .from('match_generation_status')
        .upsert({
          user_id: userId,
          status: 'error',
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        });
    } catch (statusError) {
      console.error('❌ Failed to update error status:', statusError);
    }
    
    throw error;
  }
}

/**
 * Normalize role names to match specification
 * Based on matching_json_final.json role synonyms
 */
function normalizeRole(role: string): string {
  const cleaned = role.toLowerCase().trim();

  // Role synonym mapping
  const synonyms: Record<string, string> = {
    // Dentist
    dt: 'Dentist',
    dentist: 'Dentist',
    gdp: 'Dentist',
    'general dental practitioner': 'Dentist',

    // Dental Nurse
    dn: 'Dental Nurse',
    'dental nurse': 'Dental Nurse',
    nurse: 'Dental Nurse',

    // Dental Hygienist
    dh: 'Dental Hygienist',
    hygienist: 'Dental Hygienist',
    'dental hygienist': 'Dental Hygienist',

    // Dental Therapist
    th: 'Dental Therapist',
    therapist: 'Dental Therapist',
    'dental therapist': 'Dental Therapist',

    // Receptionist
    rcp: 'Dental Receptionist',
    receptionist: 'Dental Receptionist',
    'dental receptionist': 'Dental Receptionist',

    // Practice Manager
    pm: 'Practice Manager',
    mgr: 'Practice Manager',
    manager: 'Practice Manager',
    'practice manager': 'Practice Manager',

    // Trainee Dental Nurse
    'trainee dn': 'Trainee Dental Nurse',
    tdn: 'Trainee Dental Nurse',
    'trainee dental nurse': 'Trainee Dental Nurse',
  };

  return synonyms[cleaned] || role;
}
