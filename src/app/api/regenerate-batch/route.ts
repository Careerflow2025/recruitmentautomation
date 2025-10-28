import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rolesMatch } from '@/lib/utils/roleNormalizer';

/**
 * BATCH PROCESSING VERSION: Processes matches in small batches that complete within Netlify's timeout
 *
 * This endpoint processes a single batch of matches and returns immediately.
 * The frontend calls this repeatedly until all batches are complete.
 *
 * Query Parameters:
 * - force=true : Full regeneration (deletes all existing matches on first call)
 * - force=false (default) : Incremental (skips existing matches)
 * - batch=0 : Batch number to process (starts at 0)
 * - init=true : Initialize the process (prepare data, clear matches if force=true)
 */

interface ProcessingState {
  candidates: any[];
  clients: any[];
  pairsToProcess: Array<{candidate: any, client: any}>;
  totalBatches: number;
  totalPairs: number;
  existingCount: number;
  bannedCount: number;
}

const BATCH_SIZE = 5; // Small batch size to ensure we complete within timeout
const processingStates = new Map<string, ProcessingState>(); // In-memory storage for processing state

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const forceFullRegeneration = url.searchParams.get('force') === 'true';
    const batchNumber = parseInt(url.searchParams.get('batch') || '0');
    const isInit = url.searchParams.get('init') === 'true';

    console.log(`🚀 Batch processing - Batch: ${batchNumber}, Init: ${isInit}, Force: ${forceFullRegeneration}`);

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

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Google Maps API key not configured'
      }, { status: 500 });
    }

    // Initialize or get processing state
    let state = processingStates.get(user.id);

    // INITIALIZATION PHASE
    if (isInit || !state) {
      console.log('📋 Initializing match generation process...');

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

      // Fetch existing and banned pairs
      let existingPairs = new Set<string>();
      let bannedPairs = new Set<string>();

      if (forceFullRegeneration) {
        // Full regeneration: delete all NON-BANNED matches
        console.log('🗑️ FULL REGENERATION: Clearing all non-banned matches...');
        await supabase.from('matches')
          .delete()
          .eq('user_id', user.id)
          .or('banned.is.null,banned.eq.false');
      } else {
        // Incremental: fetch existing matches to skip them
        console.log('🔍 INCREMENTAL: Fetching existing matches to skip...');
        const { data: existingMatches } = await supabase
          .from('matches')
          .select('candidate_id, client_id')
          .eq('user_id', user.id)
          .or('banned.is.null,banned.eq.false');

        existingPairs = new Set(
          (existingMatches || []).map(m => `${m.candidate_id}:${m.client_id}`)
        );
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

      // Build pairs to process
      const pairsToProcess: Array<{candidate: any, client: any}> = [];

      for (const candidate of candidates) {
        for (const client of clients) {
          const pairKey = `${candidate.id}:${client.id}`;

          // Skip if banned or already exists
          if (bannedPairs.has(pairKey)) continue;
          if (!forceFullRegeneration && existingPairs.has(pairKey)) continue;

          pairsToProcess.push({ candidate, client });
        }
      }

      const totalBatches = Math.ceil(pairsToProcess.length / BATCH_SIZE);

      state = {
        candidates,
        clients,
        pairsToProcess,
        totalBatches,
        totalPairs: candidates.length * clients.length,
        existingCount: existingPairs.size,
        bannedCount: bannedPairs.size,
      };

      processingStates.set(user.id, state);

      console.log(`📊 Initialization complete:`);
      console.log(`   Total candidates: ${candidates.length}`);
      console.log(`   Total clients: ${clients.length}`);
      console.log(`   Total possible pairs: ${state.totalPairs}`);
      console.log(`   Pairs to process: ${pairsToProcess.length}`);
      console.log(`   Total batches: ${totalBatches}`);
      console.log(`   Existing pairs: ${existingPairs.size}`);
      console.log(`   Banned pairs: ${bannedPairs.size}`);

      // Initialize progress
      await supabase.from('match_generation_status').upsert({
        user_id: user.id,
        status: 'processing',
        started_at: new Date().toISOString(),
        matches_found: 0,
        percent_complete: 0,
        method_used: 'batch_processing',
        mode_used: forceFullRegeneration ? 'full' : 'incremental',
        total_batches: totalBatches,
        current_batch: 0,
      });

      // If no pairs to process, complete immediately
      if (pairsToProcess.length === 0) {
        await supabase.from('match_generation_status').upsert({
          user_id: user.id,
          status: 'completed',
          matches_found: 0,
          excluded_over_80min: 0,
          errors: 0,
          skipped_existing: existingPairs.size,
          percent_complete: 100,
          completed_at: new Date().toISOString(),
        });

        processingStates.delete(user.id);

        return NextResponse.json({
          success: true,
          completed: true,
          message: 'All pairs already processed or banned',
          stats: {
            totalBatches: 0,
            currentBatch: 0,
            totalPairs: state.totalPairs,
            pairsToProcess: 0,
            existingPairs: existingPairs.size,
            bannedPairs: bannedPairs.size,
          }
        });
      }

      return NextResponse.json({
        success: true,
        initialized: true,
        nextBatch: 0,
        stats: {
          totalBatches,
          totalPairs: state.totalPairs,
          pairsToProcess: pairsToProcess.length,
          existingPairs: existingPairs.size,
          bannedPairs: bannedPairs.size,
        }
      });
    }

    // BATCH PROCESSING PHASE
    if (!state || !state.pairsToProcess) {
      return NextResponse.json({
        success: false,
        error: 'Processing state not found. Call with init=true first.'
      }, { status: 400 });
    }

    // Check if batch number is valid
    if (batchNumber >= state.totalBatches) {
      // All batches complete!
      const { data: statusData } = await supabase
        .from('match_generation_status')
        .select('matches_found, excluded_over_80min, errors')
        .eq('user_id', user.id)
        .single();

      await supabase.from('match_generation_status').upsert({
        user_id: user.id,
        status: 'completed',
        percent_complete: 100,
        completed_at: new Date().toISOString(),
      });

      processingStates.delete(user.id);

      return NextResponse.json({
        success: true,
        completed: true,
        message: 'All batches processed successfully',
        stats: {
          matchesCreated: statusData?.matches_found || 0,
          excluded: statusData?.excluded_over_80min || 0,
          errors: statusData?.errors || 0,
        }
      });
    }

    // Get the current batch
    const startIdx = batchNumber * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, state.pairsToProcess.length);
    const currentBatch = state.pairsToProcess.slice(startIdx, endIdx);

    console.log(`📦 Processing batch ${batchNumber + 1}/${state.totalBatches} (${currentBatch.length} pairs)`);

    // Update current batch in status
    await supabase.from('match_generation_status').update({
      current_batch: batchNumber + 1,
    }).eq('user_id', user.id);

    let successCount = 0;
    let errorCount = 0;
    let excludedCount = 0;

    // Process the batch
    try {
      // Extract unique origins and destinations for this batch
      const originPostcodes = Array.from(new Set(currentBatch.map(p => p.candidate.postcode)));
      const destPostcodes = Array.from(new Set(currentBatch.map(p => p.client.postcode)));

      const origins = originPostcodes.join('|');
      const destinations = destPostcodes.join('|');

      const params = new URLSearchParams({
        origins,
        destinations,
        mode: 'driving',
        units: 'imperial',
        key: apiKey,
      });

      const gmapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

      console.log(`🌐 Calling Google Maps for ${currentBatch.length} pairs...`);

      const response = await fetch(gmapsUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`API status: ${data.status}`);
      }

      // Process results for each pair
      for (const pair of currentBatch) {
        const candidate = pair.candidate;
        const client = pair.client;

        const originIndex = originPostcodes.indexOf(candidate.postcode);
        const destIndex = destPostcodes.indexOf(client.postcode);

        const element = data.rows?.[originIndex]?.elements?.[destIndex];

        if (!element || element.status !== 'OK') {
          console.error(`❌ Error for ${candidate.id} → ${client.id}`);
          errorCount++;
          continue;
        }

        const minutes = Math.round(element.duration.value / 60);

        if (minutes > 80) {
          console.log(`⊗ Excluded: ${minutes}m (over 80)`);
          excludedCount++;
          continue;
        }

        // Check role match
        const roleMatch = rolesMatch(candidate.role, client.role);

        // Insert the match
        const { error: insertError } = await supabase.from('matches').insert({
          candidate_id: candidate.id,
          client_id: client.id,
          commute_minutes: minutes,
          commute_display: formatTime(minutes),
          commute_band: getBand(minutes),
          role_match: roleMatch,
          role_match_display: roleMatch ? '✅ Match' : '❌ No Match',
          user_id: user.id,
        });

        if (insertError) {
          console.error(`❌ Insert failed: ${insertError.message}`);
          errorCount++;
        } else {
          successCount++;
        }
      }
    } catch (error: any) {
      console.error(`❌ Batch ${batchNumber + 1} failed:`, error.message);
      errorCount = currentBatch.length;
    }

    // Update progress in database
    const processedSoFar = Math.min(endIdx, state.pairsToProcess.length);
    const percentage = Math.round((processedSoFar / state.pairsToProcess.length) * 100);

    // Get current stats from database and add to them
    const { data: currentStatus } = await supabase
      .from('match_generation_status')
      .select('matches_found, excluded_over_80min, errors')
      .eq('user_id', user.id)
      .single();

    await supabase.from('match_generation_status').update({
      matches_found: (currentStatus?.matches_found || 0) + successCount,
      excluded_over_80min: (currentStatus?.excluded_over_80min || 0) + excludedCount,
      errors: (currentStatus?.errors || 0) + errorCount,
      percent_complete: percentage,
    }).eq('user_id', user.id);

    console.log(`✅ Batch ${batchNumber + 1} complete: ${successCount} created, ${excludedCount} excluded, ${errorCount} errors`);

    // Return response indicating if there are more batches
    const hasMore = batchNumber + 1 < state.totalBatches;

    return NextResponse.json({
      success: true,
      completed: !hasMore,
      nextBatch: hasMore ? batchNumber + 1 : null,
      progress: {
        currentBatch: batchNumber + 1,
        totalBatches: state.totalBatches,
        percentage,
        batchResults: {
          created: successCount,
          excluded: excludedCount,
          errors: errorCount,
        }
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