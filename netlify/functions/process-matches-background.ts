/**
 * NETLIFY BACKGROUND FUNCTION
 * This runs for up to 15 minutes on free tier!
 *
 * Triggered by the main API endpoint
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const handler: Handler = async (event) => {
  console.log('🔄 [BACKGROUND FUNCTION] Started');

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, candidates, clients, apiKey, forceFullRegeneration } = body;

    console.log(`👤 User: ${userId}`);
    console.log(`🎯 Mode: ${forceFullRegeneration ? 'FULL' : 'INCREMENTAL'}`);
    console.log(`📊 Processing: ${candidates.length} × ${clients.length} = ${candidates.length * clients.length} pairs`);

    // Fetch existing and banned pairs
    let existingPairs = new Set<string>();
    let bannedPairs = new Set<string>();

    if (forceFullRegeneration) {
      console.log('🗑️  FULL REGENERATION: Clearing all non-banned matches...');
      await supabase.from('matches')
        .delete()
        .eq('user_id', userId)
        .or('banned.is.null,banned.eq.false');
      console.log('✅ Cleared!');
    } else {
      console.log('🔍 INCREMENTAL: Fetching existing matches...');
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('candidate_id, client_id')
        .eq('user_id', userId)
        .or('banned.is.null,banned.eq.false');

      existingPairs = new Set(
        (existingMatches || []).map((m: any) => `${m.candidate_id}:${m.client_id}`)
      );
      console.log(`✅ Found ${existingPairs.size} existing matches`);
    }

    // Fetch banned pairs
    const { data: bannedMatches } = await supabase
      .from('matches')
      .select('candidate_id, client_id')
      .eq('user_id', userId)
      .eq('banned', true);

    bannedPairs = new Set(
      (bannedMatches || []).map((m: any) => `${m.candidate_id}:${m.client_id}`)
    );
    console.log(`🚫 Found ${bannedPairs.size} banned pairs`);

    // Filter pairs to process
    const pairsToProcess: Array<{ candidate: any; client: any }> = [];

    for (const candidate of candidates) {
      for (const client of clients) {
        const pairKey = `${candidate.id}:${client.id}`;
        if (bannedPairs.has(pairKey)) continue;
        if (!forceFullRegeneration && existingPairs.has(pairKey)) continue;
        pairsToProcess.push({ candidate, client });
      }
    }

    console.log(`🎯 Pairs to process: ${pairsToProcess.length}`);

    if (pairsToProcess.length === 0) {
      console.log('✅ Nothing to process!');
      await supabase.from('match_generation_status').upsert({
        user_id: userId,
        status: 'completed',
        percent_complete: 100,
        completed_at: new Date().toISOString(),
      });
      return { statusCode: 200, body: 'Nothing to process' };
    }

    // Create batches
    const batchSize = 10;
    const batches: Array<Array<{ candidate: any; client: any }>> = [];
    for (let i = 0; i < pairsToProcess.length; i += batchSize) {
      batches.push(pairsToProcess.slice(i, i + batchSize));
    }

    console.log(`📦 Created ${batches.length} batches`);

    let processed = 0;
    let successCount = 0;
    let errorCount = 0;
    let excludedCount = 0;
    const totalPairs = candidates.length * clients.length;

    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Batch ${i + 1}/${batches.length}`);

      try {
        const originPostcodes = Array.from(new Set(batch.map((p) => p.candidate.postcode)));
        const destPostcodes = Array.from(new Set(batch.map((p) => p.client.postcode)));

        const params = new URLSearchParams({
          origins: originPostcodes.join('|'),
          destinations: destPostcodes.join('|'),
          mode: 'driving',
          units: 'imperial',
          key: apiKey,
        });

        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

        const response = await fetch(url);
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
            console.error(`❌ No data for ${candidate.postcode} → ${client.postcode}`);
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

          // Check role match (simplified for background function)
          const roleMatch = candidate.role.toLowerCase().trim() === client.role.toLowerCase().trim();

          console.log(`✅ Match: ${candidate.id} → ${client.id}: ${minutes}m`);

          await supabase.from('matches').insert({
            candidate_id: candidate.id,
            client_id: client.id,
            commute_minutes: minutes,
            commute_display: formatTime(minutes),
            commute_band: getBand(minutes),
            role_match: roleMatch,
            role_match_display: roleMatch ? '✅ Match' : '❌ No Match',
            user_id: userId,
          });

          successCount++;
          processed++;
        }
      } catch (batchError: any) {
        console.error(`❌ Batch ${i + 1} failed:`, batchError.message);
        errorCount += batch.length;
        processed += batch.length;
      }

      // Update progress
      const percentage = Math.round((processed / pairsToProcess.length) * 100);
      await supabase.from('match_generation_status').upsert({
        user_id: userId,
        status: 'processing',
        matches_found: successCount,
        excluded_over_80min: excludedCount,
        errors: errorCount,
        percent_complete: percentage,
      });

      // Small delay between batches
      await sleep(100);
    }

    // Final update
    await supabase.from('match_generation_status').upsert({
      user_id: userId,
      status: 'completed',
      matches_found: successCount,
      excluded_over_80min: excludedCount,
      errors: errorCount,
      percent_complete: 100,
      completed_at: new Date().toISOString(),
      method_used: 'netlify_background',
    });

    console.log('');
    console.log(`✅ COMPLETE!`);
    console.log(`   ✅ Matches: ${successCount}`);
    console.log(`   ⊗ Excluded: ${excludedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, matches: successCount }),
    };
  } catch (error: any) {
    console.error('❌ Background function failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
