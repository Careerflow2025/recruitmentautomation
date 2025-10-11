/**
 * SMART BATCHING SYSTEM for Google Maps Distance Matrix API with Enhanced Rate Limiting
 *
 * Handles ANY number of candidates and clients with multi-tenant support:
 * - 12 × 10 = 120 pairs
 * - 3,000 × 3,000 = 9 million pairs
 * - 10,000 × 10,000 = 100 million pairs
 *
 * Features:
 * - Multi-tenant queue management
 * - Intelligent rate limiting with retries
 * - Batch optimization for best performance
 * - Graceful error handling
 */

import { CommuteResult, getCommuteBand, formatCommuteTime } from './google-maps';
import { rateLimitedGoogleMapsRequest, BatchRequestOptimizer } from './rate-limiter';

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
  // But we use much smaller batches to be more conservative and avoid rate limits

  // Strategy: Use 5 origins × 5 destinations = 25 elements per batch
  // This is more conservative and less likely to hit rate limits

  const originBatchSize = Math.min(5, totalOrigins);
  const destinationBatchSize = Math.min(5, totalDestinations);

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
 * Call Google Maps Distance Matrix API with rate limiting
 */
async function callBatchAPI(
  origins: string[],
  destinations: string[],
  apiKey: string,
  userId: string,
  priority: number = 3
): Promise<any> {
  return rateLimitedGoogleMapsRequest(userId, origins, destinations, apiKey, priority);
}

/**
 * Process a single batch and return results with rate limiting
 */
async function processBatch(
  batch: BatchRequest,
  apiKey: string,
  userId: string,
  batchNumber: number,
  totalBatches: number,
  priority: number = 3
): Promise<BatchResult[]> {
  console.log(`📦 Processing batch ${batchNumber}/${totalBatches} for user ${userId} (${batch.origins.length} origins × ${batch.destinations.length} destinations = ${batch.origins.length * batch.destinations.length} pairs)`);

  try {
    const data = await callBatchAPI(batch.origins, batch.destinations, apiKey, userId, priority);

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

    console.log(`✅ Batch ${batchNumber}/${totalBatches} complete for user ${userId}: ${results.filter(r => r.result !== null).length} valid matches`);

    return results;

  } catch (error) {
    console.error(`❌ Batch ${batchNumber}/${totalBatches} failed for user ${userId}:`, error);

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
 * MAIN SMART BATCHING FUNCTION with Rate Limiting
 *
 * Calculates commute times for ALL candidate-client pairs using intelligent batching
 * with multi-tenant support and enhanced rate limiting
 *
 * @param candidates Array of {id, postcode}
 * @param clients Array of {id, postcode}
 * @param apiKey Google Maps API key
 * @param userId User ID for rate limiting and queue management
 * @param onProgress Optional callback for progress updates
 * @param priority Priority for queue processing (1=highest, 5=lowest)
 */
export async function calculateAllCommutesSmartBatch(
  candidates: Array<{ id: string; postcode: string }>,
  clients: Array<{ id: string; postcode: string }>,
  apiKey: string,
  userId: string,
  onProgress?: (current: number, total: number, message: string) => void,
  priority: number = 3
): Promise<BatchResult[]> {

  console.log(`🚀 Starting SMART BATCH processing for user ${userId}...`);
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

  console.log(`📋 Processing ${batchRequests.length} batches with rate limiting...`);

  // Use the BatchRequestOptimizer for better multi-tenant handling
  const batchProcessors = batchRequests.map((batch, index) => 
    () => processBatch(batch, apiKey, userId, index + 1, batchRequests.length, priority)
  );

  // Progress tracking
  let completedBatches = 0;
  const progressTracker = () => {
    completedBatches++;
    if (onProgress) {
      const progress = Math.round((completedBatches / batchRequests.length) * 100);
      onProgress(completedBatches, batchRequests.length, `Processing batch ${completedBatches}/${batchRequests.length} (${progress}%)`);
    }
  };

  // Process all batches with enhanced rate limiting
  const allBatchResults = await BatchRequestOptimizer.processWithRateLimit(
    userId, 
    batchProcessors, 
    Math.min(3, batchRequests.length), // Process max 3 batches concurrently
    priority
  );

  // Flatten results
  const allResults: BatchResult[] = [];
  for (const batchResult of allBatchResults) {
    if (batchResult && Array.isArray(batchResult)) {
      allResults.push(...batchResult);
    }
  }

  // Summary
  const successCount = allResults.filter(r => r.result !== null).length;
  const errorCount = allResults.filter(r => r.result === null).length;
  const excludedByRule2 = allResults.filter(r => r.error?.includes('Over 80 minutes')).length;

  console.log('');
  console.log(`✅ SMART BATCH PROCESSING COMPLETE for user ${userId}!`);
  console.log(`   📊 Total pairs processed: ${allResults.length}`);
  console.log(`   ✅ Successful matches: ${successCount}`);
  console.log(`   ⊗ Excluded by RULE 2 (>80 min): ${excludedByRule2}`);
  console.log(`   ❌ Errors: ${errorCount - excludedByRule2}`);

  return allResults;
}
