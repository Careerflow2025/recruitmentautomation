/**
 * SMART BATCHING SYSTEM for Google Maps Distance Matrix API
 *
 * Handles ANY number of candidates and clients:
 * - 12 × 10 = 120 pairs
 * - 3,000 × 3,000 = 9 million pairs
 * - 10,000 × 10,000 = 100 million pairs
 *
 * Google Maps Limits:
 * - Max 25 origins × 25 destinations per request (625 elements)
 * - Max 100 elements per server request
 * - Rate limit: ~10 requests per second recommended
 */

import { CommuteResult, getCommuteBand, formatCommuteTime } from './google-maps';

interface BatchRequest {
  origins: string[];
  destinations: string[];
  originIds: string[];
  destinationIds: string[];
}

interface BatchResult {
  candidateId: string;
  clientId: string;
  result: CommuteResult | null;
  error?: string;
}

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Smart batch configuration based on total pairs
 */
function calculateOptimalBatchSize(totalOrigins: number, totalDestinations: number): {
  originBatchSize: number;
  destinationBatchSize: number;
  totalBatches: number;
  estimatedTime: string;
} {
  // Google Maps allows max 25 origins × 25 destinations = 625 elements
  // But we limit to 100 elements per request for server-side (Google recommendation)

  // Strategy: Use 10 origins × 10 destinations = 100 elements per batch
  // This gives us maximum efficiency while staying under limits

  const originBatchSize = Math.min(10, totalOrigins);
  const destinationBatchSize = Math.min(10, totalDestinations);

  const originBatches = Math.ceil(totalOrigins / originBatchSize);
  const destinationBatches = Math.ceil(totalDestinations / destinationBatchSize);
  const totalBatches = originBatches * destinationBatches;

  // Estimate time: ~1 second per batch + 100ms delay between batches
  const estimatedSeconds = totalBatches * 1.1;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  return {
    originBatchSize,
    destinationBatchSize,
    totalBatches,
    estimatedTime: estimatedMinutes < 2
      ? `${Math.ceil(estimatedSeconds)} seconds`
      : `${estimatedMinutes} minutes`,
  };
}

/**
 * Call Google Maps Distance Matrix API with multiple origins and destinations
 */
async function callBatchAPI(
  origins: string[],
  destinations: string[],
  apiKey: string
): Promise<any> {
  const params = new URLSearchParams({
    origins: origins.join('|'),
    destinations: destinations.join('|'),
    mode: 'driving',
    units: 'imperial',
    key: apiKey,
  });

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Maps API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== 'OK') {
    throw new Error(`Google Maps API status: ${data.status}`);
  }

  return data;
}

/**
 * Process a single batch and return results
 */
async function processBatch(
  batch: BatchRequest,
  apiKey: string,
  batchNumber: number,
  totalBatches: number
): Promise<BatchResult[]> {
  console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.origins.length} origins × ${batch.destinations.length} destinations = ${batch.origins.length * batch.destinations.length} pairs)`);

  try {
    const data = await callBatchAPI(batch.origins, batch.destinations, apiKey);

    const results: BatchResult[] = [];

    // Parse the response matrix
    for (let i = 0; i < batch.origins.length; i++) {
      for (let j = 0; j < batch.destinations.length; j++) {
        const element = data.rows[i]?.elements[j];
        const candidateId = batch.originIds[i];
        const clientId = batch.destinationIds[j];

        if (!element) {
          results.push({
            candidateId,
            clientId,
            result: null,
            error: 'No data returned from API',
          });
          continue;
        }

        if (element.status !== 'OK') {
          results.push({
            candidateId,
            clientId,
            result: null,
            error: `API status: ${element.status}`,
          });
          continue;
        }

        // Calculate minutes
        const minutes = Math.round(element.duration.value / 60);

        // RULE 2: Exclude matches over 80 minutes
        if (minutes > 80) {
          results.push({
            candidateId,
            clientId,
            result: null,
            error: `Over 80 minutes (RULE 2): ${minutes} minutes`,
          });
          continue;
        }

        // Success!
        results.push({
          candidateId,
          clientId,
          result: {
            minutes,
            display: formatCommuteTime(minutes),
            band: getCommuteBand(minutes),
            distance_text: element.distance.text,
            duration_text: element.duration.text,
          },
        });
      }
    }

    console.log(`✅ Batch ${batchNumber}/${totalBatches} complete: ${results.filter(r => r.result !== null).length} valid matches`);

    return results;

  } catch (error) {
    console.error(`❌ Batch ${batchNumber}/${totalBatches} failed:`, error);

    // Return error results for all pairs in this batch
    const errorResults: BatchResult[] = [];
    for (const originId of batch.originIds) {
      for (const destId of batch.destinationIds) {
        errorResults.push({
          candidateId: originId,
          clientId: destId,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    return errorResults;
  }
}

/**
 * MAIN SMART BATCHING FUNCTION
 *
 * Calculates commute times for ALL candidate-client pairs using intelligent batching
 *
 * @param candidates Array of {id, postcode}
 * @param clients Array of {id, postcode}
 * @param apiKey Google Maps API key
 * @param onProgress Optional callback for progress updates
 */
export async function calculateAllCommutesSmartBatch(
  candidates: Array<{ id: string; postcode: string }>,
  clients: Array<{ id: string; postcode: string }>,
  apiKey: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<BatchResult[]> {

  console.log('🚀 Starting SMART BATCH processing...');
  console.log(`📊 Total: ${candidates.length} candidates × ${clients.length} clients = ${candidates.length * clients.length} pairs`);

  // Calculate optimal batch configuration
  const config = calculateOptimalBatchSize(candidates.length, clients.length);

  console.log('📐 Batch Configuration:');
  console.log(`   - Origin batch size: ${config.originBatchSize}`);
  console.log(`   - Destination batch size: ${config.destinationBatchSize}`);
  console.log(`   - Total batches: ${config.totalBatches}`);
  console.log(`   - Estimated time: ${config.estimatedTime}`);

  // Split candidates and clients into batches
  const candidateBatches = chunkArray(candidates, config.originBatchSize);
  const clientBatches = chunkArray(clients, config.destinationBatchSize);

  console.log(`📦 Created ${candidateBatches.length} candidate batches × ${clientBatches.length} client batches`);

  // Create all batch requests
  const batchRequests: BatchRequest[] = [];
  for (const candidateBatch of candidateBatches) {
    for (const clientBatch of clientBatches) {
      batchRequests.push({
        origins: candidateBatch.map(c => c.postcode),
        destinations: clientBatch.map(c => c.postcode),
        originIds: candidateBatch.map(c => c.id),
        destinationIds: clientBatch.map(c => c.id),
      });
    }
  }

  console.log(`📋 Processing ${batchRequests.length} batches...`);

  // Process all batches with rate limiting
  const allResults: BatchResult[] = [];
  let batchNumber = 0;

  for (const batch of batchRequests) {
    batchNumber++;

    // Progress callback
    if (onProgress) {
      const progress = Math.round((batchNumber / batchRequests.length) * 100);
      onProgress(batchNumber, batchRequests.length, `Processing batch ${batchNumber}/${batchRequests.length} (${progress}%)`);
    }

    // Process batch
    const batchResults = await processBatch(batch, apiKey, batchNumber, batchRequests.length);
    allResults.push(...batchResults);

    // Rate limiting: Wait 100ms between batches (max 10 requests per second)
    if (batchNumber < batchRequests.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Summary
  const successCount = allResults.filter(r => r.result !== null).length;
  const errorCount = allResults.filter(r => r.result === null).length;
  const excludedByRule2 = allResults.filter(r => r.error?.includes('Over 80 minutes')).length;

  console.log('');
  console.log('✅ SMART BATCH PROCESSING COMPLETE!');
  console.log(`   📊 Total pairs processed: ${allResults.length}`);
  console.log(`   ✅ Successful matches: ${successCount}`);
  console.log(`   ⊗ Excluded by RULE 2 (>80 min): ${excludedByRule2}`);
  console.log(`   ❌ Errors: ${errorCount - excludedByRule2}`);

  return allResults;
}
