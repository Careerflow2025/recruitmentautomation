import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rolesMatch } from '@/lib/utils/roleNormalizer';

/**
 * SIMPLE VERSION: Regenerate matches WITHOUT complex rate limiter
 * Processes one pair at a time with simple delays
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting SIMPLE match regeneration...');

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

    // Fetch candidates and clients
    const [candidatesResult, clientsResult] = await Promise.all([
      supabase.from('candidates').select('id, postcode, role').eq('user_id', user.id),
      supabase.from('clients').select('id, postcode, role').eq('user_id', user.id)
    ]);

    if (candidatesResult.error) throw candidatesResult.error;
    if (clientsResult.error) throw clientsResult.error;

    const candidates = candidatesResult.data || [];
    const clients = clientsResult.data || [];

    console.log(`📊 Found ${candidates.length} candidates × ${clients.length} clients`);

    // Start background processing
    processSimpleMatches(user.id, candidates, clients).catch(error => {
      console.error('❌ Background processing failed:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Simple match generation started',
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        total_pairs: candidates.length * clients.length
      }
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

async function processSimpleMatches(
  userId: string,
  candidates: any[],
  clients: any[]
) {
  console.log(`🔄 Simple background processing for user ${userId}`);

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

  // Clear existing matches
  await supabase.from('matches').delete().eq('user_id', userId);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
  let successCount = 0;
  let errorCount = 0;
  let excludedCount = 0;

  // Process ONE pair at a time
  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < clients.length; j++) {
      const candidate = candidates[i];
      const client = clients[j];

      const pairNum = (i * clients.length) + j + 1;
      const totalPairs = candidates.length * clients.length;

      console.log(`🔄 Processing pair ${pairNum}/${totalPairs}: ${candidate.postcode} → ${client.postcode}`);

      try {
        // Call Google Maps DIRECTLY (no rate limiter)
        const params = new URLSearchParams({
          origins: candidate.postcode,
          destinations: client.postcode,
          mode: 'driving',
          units: 'imperial',
          key: apiKey,
        });

        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

        // Add timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
          throw new Error(`API status: ${data.status}`);
        }

        const element = data.rows[0].elements[0];

        if (element.status !== 'OK') {
          throw new Error(`Element status: ${element.status}`);
        }

        const minutes = Math.round(element.duration.value / 60);

        // Skip if over 80 minutes
        if (minutes > 80) {
          console.log(`   ⊗ Excluded: ${minutes} minutes (over 80)`);
          excludedCount++;
          continue;
        }

        // 🔄 MULTI-ROLE MATCHING: Check if ANY candidate role matches client role
        // Supports formats like "Dental Nurse/ANP/PN", "Dental Nurse / ANP / PN", etc.
        const roleMatch = rolesMatch(candidate.role, client.role);

        // Insert match
        const { error: insertError } = await supabase.from('matches').insert({
          candidate_id: candidate.id,
          client_id: client.id,
          commute_minutes: minutes,
          commute_display: formatTime(minutes),
          commute_band: getBand(minutes),
          role_match: roleMatch,
          role_match_display: roleMatch ? '✅ Match' : '❌ No Match',
          user_id: userId,
        });

        if (insertError) {
          throw insertError;
        }

        console.log(`   ✅ Success: ${minutes} minutes`);
        successCount++;

      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}`);
        errorCount++;
      }

      // Wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`✅ Complete: ${successCount} matches, ${excludedCount} excluded, ${errorCount} errors`);

  // Update status
  await supabase.from('match_generation_status').upsert({
    user_id: userId,
    status: 'completed',
    matches_found: successCount,
    excluded_over_80min: excludedCount,
    errors: errorCount,
    method_used: 'google_maps_simple',
    completed_at: new Date().toISOString(),
    percent_complete: 100,
  });
}

// 🔄 MULTI-ROLE MATCHING: Role normalization and matching now handled by imported rolesMatch() function
// Supports multi-role candidates (e.g., "Dental Nurse/ANP/PN") matching against single client roles
// The rolesMatch() function handles splitting, normalization, and comparison automatically

function formatTime(minutes: number): string {
  const band = getBand(minutes);
  if (minutes < 60) {
    return `${band} ${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${band} ${hours}h` : `${band} ${hours}h ${mins}m`;
}

function getBand(minutes: number): string {
  if (minutes <= 20) return '🟢🟢🟢';
  if (minutes <= 40) return '🟢🟢';
  if (minutes <= 55) return '🟢';
  if (minutes <= 80) return '🟡';
  return '';
}
