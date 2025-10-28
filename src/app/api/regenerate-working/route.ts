import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rolesMatch } from '@/lib/utils/roleNormalizer';

/**
 * NETLIFY OPTIMIZED VERSION: Works within Netlify's 10-second timeout
 *
 * Strategy:
 * 1. Start processing immediately (don't wait)
 * 2. Return success response within 10 seconds
 * 3. Processing continues in background via async/await pattern
 * 4. Frontend polls match_generation_status for progress
 *
 * Query Parameters:
 * - force=true : Full regeneration (deletes all existing matches)
 * - force=false (default) : Incremental (skips existing matches)
 */
export async function POST(request: NextRequest) {
  try {
    // Check for force parameter
    const url = new URL(request.url);
    const forceParam = url.searchParams.get('force');
    const forceFullRegeneration = forceParam === 'true';

    console.log('🚀 [NETLIFY] Starting match regeneration...');
    console.log(`🔧 Mode: ${forceFullRegeneration ? 'FULL REGENERATION' : 'INCREMENTAL (skip existing)'}`);

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

    console.log(`📊 Processing: ${candidates.length} × ${clients.length} = ${candidates.length * clients.length} pairs`);

    // Initialize progress
    await supabase.from('match_generation_status').upsert({
      user_id: user.id,
      status: 'processing',
      started_at: new Date().toISOString(),
      matches_found: 0,
      percent_complete: 0,
      method_used: 'google_maps_netlify',
    });

    // ⚡ NETLIFY OPTIMIZATION: Start processing but DON'T await it
    // This allows us to return response within 10 seconds while processing continues
    processMatches(user.id, candidates, clients, apiKey, forceFullRegeneration)
      .catch(error => {
        console.error('❌ Background processing error:', error);
        // Error is already logged to match_generation_status by processMatches
      });

    // Return immediately (within 10 seconds) with success
    return NextResponse.json({
      success: true,
      message: forceFullRegeneration
        ? 'Full match regeneration started - check status for progress'
        : 'Incremental match generation started - check status for progress',
      processing: true,
      completed: false,
      mode: forceFullRegeneration ? 'full' : 'incremental',
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        total_pairs: candidates.length * clients.length,
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

async function processMatches(
  userId: string,
  candidates: any[],
  clients: any[],
  apiKey: string,
  forceFullRegeneration: boolean = false
) {
  console.log(`🔄 [BACKGROUND] Starting for user ${userId}`);
  console.log(`🔧 Mode: ${forceFullRegeneration ? 'FULL REGENERATION' : 'INCREMENTAL (skip existing)'}`);

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
    // 🆕 INCREMENTAL MATCHING: Fetch existing matches to skip them
    let existingPairs = new Set<string>();
    let bannedPairs = new Set<string>();

    if (forceFullRegeneration) {
      // Full regeneration mode: delete all NON-BANNED matches (keep banned ones)
      console.log('🗑️  FULL REGENERATION: Clearing all non-banned matches...');
      await supabase.from('matches')
        .delete()
        .eq('user_id', userId)
        .or('banned.is.null,banned.eq.false');
      console.log('✅ Cleared all non-banned matches!');
    } else {
      // Incremental mode: fetch existing matches and skip them
      console.log('🔍 INCREMENTAL: Fetching existing matches to skip...');
      const { data: existingMatches, error: fetchError } = await supabase
        .from('matches')
        .select('candidate_id, client_id')
        .eq('user_id', userId)
        .or('banned.is.null,banned.eq.false');

      if (fetchError) {
        console.error('❌ Error fetching existing matches:', fetchError);
        throw fetchError;
      }

      // Build Set of existing pairs for fast lookup
      existingPairs = new Set(
        (existingMatches || []).map(m => `${m.candidate_id}:${m.client_id}`)
      );

      console.log(`✅ Found ${existingPairs.size} existing matches - will skip these pairs`);
    }

    // 🚫 ALWAYS fetch banned pairs (never regenerate banned matches)
    console.log('🚫 Fetching banned pairs to skip...');
    const { data: bannedMatches, error: bannedError } = await supabase
      .from('matches')
      .select('candidate_id, client_id')
      .eq('user_id', userId)
      .eq('banned', true);

    if (bannedError) {
      console.error('❌ Error fetching banned matches:', bannedError);
      throw bannedError;
    }

    // Build Set of banned pairs for fast lookup
    bannedPairs = new Set(
      (bannedMatches || []).map(m => `${m.candidate_id}:${m.client_id}`)
    );

    console.log(`🚫 Found ${bannedPairs.size} banned pairs - will never create these`);

    const totalPairs = candidates.length * clients.length;
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;
    let excludedCount = 0;
    let skippedCount = existingPairs.size; // 🆕 Pre-existing matches count

    // 🆕 OPTIMIZATION: Filter out existing AND banned pairs BEFORE creating batches
    // This saves Google Maps API calls!
    const pairsToProcess: Array<{candidate: any, client: any}> = [];

    for (const candidate of candidates) {
      for (const client of clients) {
        const pairKey = `${candidate.id}:${client.id}`;

        // Skip if banned (ALWAYS skip banned pairs)
        if (bannedPairs.has(pairKey)) {
          continue;
        }

        // Skip if already exists (only in incremental mode)
        if (!forceFullRegeneration && existingPairs.has(pairKey)) {
          continue;
        }

        pairsToProcess.push({ candidate, client });
      }
    }

    console.log(`🎯 Pairs to process: ${pairsToProcess.length}`);
    console.log(`   ⏭️  Skipping ${skippedCount} existing pairs`);
    console.log(`   🚫 Skipping ${bannedPairs.size} banned pairs`);

    if (pairsToProcess.length === 0) {
      console.log('✅ All pairs already processed or banned - nothing to process!');
      await supabase.from('match_generation_status').upsert({
        user_id: userId,
        status: 'completed',
        matches_found: 0,
        excluded_over_80min: 0,
        errors: 0,
        skipped_existing: skippedCount,
        percent_complete: 100,
        completed_at: new Date().toISOString(),
        method_used: 'google_maps_netlify',
        mode_used: forceFullRegeneration ? 'full' : 'incremental',
      });
      return;
    }

    // ⚡ NETLIFY OPTIMIZATION: Smaller batches (5 instead of 10) for faster processing
    // Reduces chance of hitting 10-second timeout during individual batch processing
    const batchSize = 5;
    const pairBatches: Array<Array<{candidate: any, client: any}>> = [];

    for (let i = 0; i < pairsToProcess.length; i += batchSize) {
      pairBatches.push(pairsToProcess.slice(i, i + batchSize));
    }

    const totalBatches = pairBatches.length;
    let currentBatch = 0;

    console.log(`📦 Created ${totalBatches} batches from ${pairsToProcess.length} pairs`);

    // Process each batch
    for (const pairBatch of pairBatches) {
        currentBatch++;
        console.log(`📦 Batch ${currentBatch}/${totalBatches}`);

        try {
          // Extract unique origins and destinations from this batch
          const originPostcodes = Array.from(new Set(pairBatch.map(p => p.candidate.postcode)));
          const destPostcodes = Array.from(new Set(pairBatch.map(p => p.client.postcode)));

          const origins = originPostcodes.join('|');
          const destinations = destPostcodes.join('|');

          const params = new URLSearchParams({
            origins,
            destinations,
            mode: 'driving',
            units: 'imperial',
            key: apiKey,
          });

          const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

          console.log(`🌐 Calling Google Maps for ${pairBatch.length} pairs...`);
          console.log(`   Origins: ${originPostcodes.length} unique postcodes`);
          console.log(`   Destinations: ${destPostcodes.length} unique postcodes`);

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout for API call

          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.status !== 'OK') {
            throw new Error(`API status: ${data.status}`);
          }

          console.log(`✅ API returned ${data.rows?.length || 0} rows`);

          // Parse results for each pair in the batch
          for (const pair of pairBatch) {
              const candidate = pair.candidate;
              const client = pair.client;

              // Find indices in the unique postcode arrays
              const originIndex = originPostcodes.indexOf(candidate.postcode);
              const destIndex = destPostcodes.indexOf(client.postcode);

              const element = data.rows?.[originIndex]?.elements?.[destIndex];

              if (!element) {
                console.error(`❌ No element found for ${candidate.postcode} → ${client.postcode} (origin ${originIndex}, dest ${destIndex})`);
                errorCount++;
                processed++;
                continue;
              }

              if (element.status !== 'OK') {
                console.error(`❌ API error for ${candidate.postcode} → ${client.postcode}: ${element.status}`);
                errorCount++;
                processed++;
                continue;
              }

              const minutes = Math.round(element.duration.value / 60);

              if (minutes > 80) {
                console.log(`⊗ Excluded ${candidate.postcode} → ${client.postcode}: ${minutes}m (over 80)`);
                excludedCount++;
                processed++;
                continue;
              }

              const roleMatch = rolesMatch(candidate.role, client.role);

              console.log(`✅ Creating match: ${candidate.id} (${candidate.postcode}) → ${client.id} (${client.postcode}): ${minutes}m, role=${roleMatch}`);

              // Insert
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
                console.error(`❌ Insert failed for ${candidate.id} → ${client.id}:`, insertError);
                errorCount++;
              } else {
                successCount++;
              }

              processed++;
          }

        } catch (batchError: any) {
          console.error(`❌ Batch ${currentBatch} failed:`, batchError.message);
          // Mark all pairs in batch as errors
          errorCount += pairBatch.length;
          processed += pairBatch.length;
        }

        // Update progress
        const totalToProcess = pairsToProcess.length + skippedCount;
        const percentage = Math.round(((processed + skippedCount) / totalPairs) * 100);
        console.log(`📊 Progress: ${percentage}% (${processed}/${totalPairs})`);

        await supabase.from('match_generation_status').upsert({
          user_id: userId,
          status: 'processing',
          matches_found: successCount,
          excluded_over_80min: excludedCount,
          errors: errorCount,
          skipped_existing: skippedCount,
          percent_complete: percentage,
        });

        // ⚡ NETLIFY OPTIMIZATION: Shorter delay (50ms) to process faster
        await sleep(50);
      }

    // Final update
    await supabase.from('match_generation_status').upsert({
      user_id: userId,
      status: 'completed',
      matches_found: successCount,
      excluded_over_80min: excludedCount,
      errors: errorCount,
      skipped_existing: skippedCount,
      percent_complete: 100,
      completed_at: new Date().toISOString(),
      method_used: 'google_maps_netlify',
      mode_used: forceFullRegeneration ? 'full' : 'incremental',
    });

    console.log('');
    console.log(`✅ ${forceFullRegeneration ? 'FULL REGENERATION' : 'INCREMENTAL MATCHING'} COMPLETE!`);
    console.log(`   📊 Total pairs: ${totalPairs}`);
    console.log(`   ✅ New matches created: ${successCount}`);
    console.log(`   ⊗ Excluded (>80 min): ${excludedCount}`);
    console.log(`   ⏭️  Skipped (already exist): ${skippedCount}`);
    console.log(`   🚫 Banned pairs (never created): ${bannedPairs.size}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    const totalSaved = skippedCount + bannedPairs.size;
    console.log(`   💾 API calls saved: ${totalSaved > 0 ? Math.round((totalSaved / totalPairs) * 100) : 0}%`);

  } catch (error: any) {
    console.error('❌ Processing failed:', error);

    await supabase.from('match_generation_status').upsert({
      user_id: userId,
      status: 'error',
      error_message: error.message,
      completed_at: new Date().toISOString(),
    });

    throw error; // Re-throw so the catch in POST handler logs it
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
