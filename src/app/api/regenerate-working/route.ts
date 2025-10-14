import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { rolesMatch } from '@/lib/utils/roleNormalizer';

/**
 * WORKING VERSION: Smart batching WITHOUT Bottleneck
 * This version works immediately and shows progress
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [WORKING] Starting match regeneration...');

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
      method_used: 'google_maps_working',
    });

    // Start background processing
    processMatches(user.id, candidates, clients, apiKey).catch(error => {
      console.error('❌ Background error:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Match generation started',
      processing: true,
      stats: {
        candidates: candidates.length,
        clients: clients.length,
        total_pairs_to_process: candidates.length * clients.length,
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
  apiKey: string
) {
  console.log(`🔄 [BACKGROUND] Starting for user ${userId}`);

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
    // Clear existing
    console.log('🗑️  Clearing...');
    await supabase.from('matches').delete().eq('user_id', userId);
    console.log('✅ Cleared!');

    const totalPairs = candidates.length * clients.length;
    let processed = 0;
    let successCount = 0;
    let errorCount = 0;
    let excludedCount = 0;

    // Create batches: 10×10 = 100 elements per batch
    const batchSize = 10;
    const candidateBatches: any[][] = [];
    const clientBatches: any[][] = [];

    for (let i = 0; i < candidates.length; i += batchSize) {
      candidateBatches.push(candidates.slice(i, i + batchSize));
    }

    for (let i = 0; i < clients.length; i += batchSize) {
      clientBatches.push(clients.slice(i, i + batchSize));
    }

    const totalBatches = candidateBatches.length * clientBatches.length;
    let currentBatch = 0;

    console.log(`📦 Created ${totalBatches} batches`);

    // Process each batch
    for (const candidateBatch of candidateBatches) {
      for (const clientBatch of clientBatches) {
        currentBatch++;
        console.log(`📦 Batch ${currentBatch}/${totalBatches}`);

        try {
          // Call Google Maps API
          const origins = candidateBatch.map(c => c.postcode).join('|');
          const destinations = clientBatch.map(c => c.postcode).join('|');

          const params = new URLSearchParams({
            origins,
            destinations,
            mode: 'driving',
            units: 'imperial',
            key: apiKey,
          });

          const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

          console.log(`🌐 Calling Google Maps: ${candidateBatch.length} × ${clientBatch.length}...`);

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

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

          // Parse results
          for (let i = 0; i < candidateBatch.length; i++) {
            for (let j = 0; j < clientBatch.length; j++) {
              const candidate = candidateBatch[i];
              const client = clientBatch[j];

              const element = data.rows?.[i]?.elements?.[j];

              if (!element || element.status !== 'OK') {
                errorCount++;
                processed++;
                continue;
              }

              const minutes = Math.round(element.duration.value / 60);

              if (minutes > 80) {
                excludedCount++;
                processed++;
                continue;
              }

              // 🔄 MULTI-ROLE MATCHING: Check if ANY candidate role matches client role
              // Supports formats like "Dental Nurse/ANP/PN", "Dental Nurse / ANP / PN", etc.
              const roleMatch = rolesMatch(candidate.role, client.role);

              // Insert
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
          }

        } catch (batchError: any) {
          console.error(`❌ Batch ${currentBatch} failed:`, batchError.message);
          // Mark all in batch as errors
          errorCount += candidateBatch.length * clientBatch.length;
          processed += candidateBatch.length * clientBatch.length;
        }

        // Update progress
        const percentage = Math.round((processed / totalPairs) * 100);
        console.log(`📊 Progress: ${percentage}% (${processed}/${totalPairs})`);

        await supabase.from('match_generation_status').upsert({
          user_id: userId,
          status: 'processing',
          matches_found: successCount,
          excluded_over_80min: excludedCount,
          errors: errorCount,
          percent_complete: percentage,
        });

        // Delay between batches (1 second)
        await sleep(1000);
      }
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
      method_used: 'google_maps_working',
    });

    console.log(`✅ Complete! Success: ${successCount}, Excluded: ${excludedCount}, Errors: ${errorCount}`);

  } catch (error: any) {
    console.error('❌ Processing failed:', error);

    await supabase.from('match_generation_status').upsert({
      user_id: userId,
      status: 'error',
      error_message: error.message,
      completed_at: new Date().toISOString(),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
