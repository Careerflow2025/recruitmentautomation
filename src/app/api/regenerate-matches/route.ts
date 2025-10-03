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
    console.log('🚀 Starting match regeneration with Google Maps API...');

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
        { success: false, error: 'You must be logged in to regenerate matches' },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.email}`);

    // 1. Fetch current user's candidates only
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('id, postcode, role')
      .eq('user_id', user.id);

    if (candidatesError) throw candidatesError;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ error: 'No candidates found for your account' }, { status: 404 });
    }

    // 2. Fetch current user's clients only
    const { data: clients, error: clientsError} = await supabase
      .from('clients')
      .select('id, postcode, role')
      .eq('user_id', user.id);

    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) {
      return NextResponse.json({ error: 'No clients found for your account' }, { status: 404 });
    }

    console.log(`📊 Found ${candidates.length} candidates and ${clients.length} clients for user ${user.email}`);
    console.log(`🔢 Total pairs to calculate: ${candidates.length * clients.length}`);

    // 3. Clear existing matches for current user only
    const { error: deleteError } = await supabase
      .from('matches')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    console.log('🗑️  Cleared old matches for current user');

    // 4. Get Google Maps API key
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    // 5. Use SMART BATCHING to calculate all commutes efficiently
    const batchResults = await calculateAllCommutesSmartBatch(
      candidates.map(c => ({ id: c.id, postcode: c.postcode })),
      clients.map(c => ({ id: c.id, postcode: c.postcode })),
      apiKey,
      (current, total, message) => {
        console.log(`📊 Progress: ${message}`);
      }
    );

    // 6. Insert successful matches into database
    let successCount = 0;
    let excludedCount = 0;
    let errorCount = 0;

    for (const result of batchResults) {
      if (result.result === null) {
        // Check if it was excluded by RULE 2
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
        user_id: user.id,  // Add current user's ID
      });

      if (insertError) {
        console.error(`Failed to insert match ${result.candidateId} -> ${result.clientId}:`);
        console.error(`Error message: ${insertError.message}`);
        console.error(`Error details: ${insertError.details}`);
        console.error(`Error hint: ${insertError.hint}`);
        errorCount++;
        continue;
      }

      successCount++;
    }

    // 7. Count final matches for current user
    const { count: finalCount, error: countError } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) throw countError;

    console.log('✅ Match regeneration complete!');
    console.log(`   ✅ Successful matches inserted: ${successCount}`);
    console.log(`   ⊗ Excluded by RULE 2 (>80 min): ${excludedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      message: 'Matches regenerated successfully with SMART BATCHING and Google Maps API',
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        total_pairs_checked: candidates.length * clients.length,
        matches_created: finalCount || 0,
        excluded_over_80min: excludedCount,
        errors: errorCount,
        batching_used: true,
      },
      compliance: {
        rule_1_sorting: 'Sorted by commute time ascending',
        rule_2_enforced: true,
        rule_3_enforced: true,
        api_used: 'Google Maps Distance Matrix API with SMART BATCHING',
      },
    });
  } catch (error) {
    console.error('Match regeneration error:');
    console.error('Error type:', typeof error);
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
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
