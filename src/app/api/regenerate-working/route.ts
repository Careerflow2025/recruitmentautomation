import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rolesMatch } from '@/lib/utils/roleNormalizer';

/**
 * DIRECT PROCESSING VERSION - NO BACKGROUND FUNCTIONS
 *
 * Strategy:
 * 1. Process matches in small chunks (50 at a time)
 * 2. Return results directly (no background function complexity)
 * 3. If more than 50 pairs, frontend will call multiple times
 *
 * Parameters:
 * - force=true : Full regeneration (delete all, start fresh)
 * - force=false (default) : Incremental (skip existing)
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const forceParam = url.searchParams.get('force');
    const forceFullRegeneration = forceParam === 'true';

    console.log('🚀 Starting match regeneration...');
    console.log(`🔧 Mode: ${forceFullRegeneration ? 'FULL' : 'INCREMENTAL'}`);

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

    console.log(`✅ User: ${user.email}`);

    // Fetch candidates and clients
    const [candidatesResult, clientsResult] = await Promise.all([
      supabase.from('candidates').select('id, postcode, role').eq('user_id', user.id),
      supabase.from('clients').select('id, postcode, role').eq('user_id', user.id)
    ]);

    if (candidatesResult.error) throw candidatesResult.error;
    if (clientsResult.error) throw clientsResult.error;

    const candidates = candidatesResult.data || [];
    const clients = clientsResult.data || [];

    if (candidates.length === 0 || clients.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Need both candidates and clients'
      }, { status: 400 });
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Google Maps API key not configured'
      }, { status: 500 });
    }

    const totalPairs = candidates.length * clients.length;
    console.log(`📊 Total: ${candidates.length} × ${clients.length} = ${totalPairs} pairs`);

    // Fetch existing and banned pairs
    let existingPairs = new Set<string>();
    let bannedPairs = new Set<string>();

    if (forceFullRegeneration) {
      console.log('🗑️ FULL: Clearing all non-banned matches...');
      await supabase.from('matches')
        .delete()
        .eq('user_id', user.id)
        .or('banned.is.null,banned.eq.false');
      console.log('✅ Cleared!');
    } else {
      console.log('🔍 INCREMENTAL: Fetching existing matches...');
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('candidate_id, client_id')
        .eq('user_id', user.id)
        .or('banned.is.null,banned.eq.false');

      existingPairs = new Set(
        (existingMatches || []).map(m => `${m.candidate_id}:${m.client_id}`)
      );
      console.log(`✅ Found ${existingPairs.size} existing`);
    }

    // Always fetch banned pairs
    const { data: bannedMatches } = await supabase
      .from('matches')
      .select('candidate_id, client_id')
      .eq('user_id', user.id)
      .eq('banned', true);

    bannedPairs = new Set(
      (bannedMatches || []).map(m => `${m.candidate_id}:${m.client_id}`)
    );
    console.log(`🚫 Found ${bannedPairs.size} banned`);

    // Build pairs to process
    const pairsToProcess: Array<{ candidate: any; client: any }> = [];

    for (const candidate of candidates) {
      for (const client of clients) {
        const pairKey = `${candidate.id}:${client.id}`;
        if (bannedPairs.has(pairKey)) continue;
        if (!forceFullRegeneration && existingPairs.has(pairKey)) continue;
        pairsToProcess.push({ candidate, client });
      }
    }

    console.log(`🎯 To process: ${pairsToProcess.length} pairs`);

    if (pairsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All pairs already processed',
        stats: {
          candidates: candidates.length,
          clients: clients.length,
          total_pairs: totalPairs,
          matches_found: 0,
          excluded_over_80min: 0,
          errors: 0,
          skipped: existingPairs.size,
        }
      });
    }

    // Process ALL pairs in batches (synchronously, within request)
    const batchSize = 10;
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;
    let excludedCount = 0;

    // Calculate batches
    const numBatches = Math.ceil(pairsToProcess.length / batchSize);
    console.log(`📦 ${numBatches} batches to process`);

    for (let batchNum = 0; batchNum < numBatches; batchNum++) {
      const start = batchNum * batchSize;
      const end = Math.min(start + batchSize, pairsToProcess.length);
      const batch = pairsToProcess.slice(start, end);

      console.log(`📦 Batch ${batchNum + 1}/${numBatches} (${batch.length} pairs)`);

      try {
        const originPostcodes = Array.from(new Set(batch.map(p => p.candidate.postcode)));
        const destPostcodes = Array.from(new Set(batch.map(p => p.client.postcode)));

        const params = new URLSearchParams({
          origins: originPostcodes.join('|'),
          destinations: destPostcodes.join('|'),
          mode: 'driving',
          units: 'imperial',
          key: apiKey,
        });

        const gmapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

        const response = await fetch(gmapsUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (data.status !== 'OK') throw new Error(`API status: ${data.status}`);

        console.log(`✅ API returned ${data.rows?.length || 0} rows`);

        // Process each pair in batch
        for (const pair of batch) {
          const { candidate, client } = pair;
          const originIndex = originPostcodes.indexOf(candidate.postcode);
          const destIndex = destPostcodes.indexOf(client.postcode);

          const element = data.rows?.[originIndex]?.elements?.[destIndex];

          if (!element || element.status !== 'OK') {
            console.error(`❌ No data: ${candidate.postcode} → ${client.postcode}`);
            errorCount++;
            processed++;
            continue;
          }

          const minutes = Math.round(element.duration.value / 60);

          if (minutes > 80) {
            console.log(`⊗ Excluded: ${minutes}m`);
            excludedCount++;
            processed++;
            continue;
          }

          const roleMatchResult = rolesMatch(candidate.role, client.role);

          console.log(`✅ Match: ${candidate.id} → ${client.id}: ${minutes}m`);

          await supabase.from('matches').insert({
            candidate_id: candidate.id,
            client_id: client.id,
            commute_minutes: minutes,
            commute_display: formatTime(minutes),
            commute_band: getBand(minutes),
            role_match: roleMatchResult,
            role_match_display: roleMatchResult ? '✅ Match' : '❌ No Match',
            user_id: user.id,
          });

          successCount++;
          processed++;
        }
      } catch (batchError: any) {
        console.error(`❌ Batch ${batchNum + 1} failed:`, batchError.message);
        errorCount += batch.length;
        processed += batch.length;
      }

      // Small delay between batches
      await sleep(50);
    }

    console.log('');
    console.log(`✅ COMPLETE!`);
    console.log(`   ✅ Matches: ${successCount}`);
    console.log(`   ⊗ Excluded: ${excludedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      message: `Match generation complete. ${successCount} matches found.`,
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        total_pairs: totalPairs,
        matches_found: successCount,
        excluded_over_80min: excludedCount,
        errors: errorCount,
        skipped: existingPairs.size,
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(minutes: number): string {
  const band = getBand(minutes);
  if (minutes < 60) return `${band} ${minutes}m`;
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
