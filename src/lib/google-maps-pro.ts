/**
 * PROFESSIONAL GOOGLE MAPS DISTANCE MATRIX SERVICE
 * SaaS-Grade Implementation with Smart Batching, Queue Management, and Retry Logic
 *
 * Features:
 * - Smart batching (10 origins × 10 destinations per call)
 * - Rate limiting with Bottleneck (10 req/sec)
 * - Exponential backoff retry (1s → 2s → 4s → 8s)
 * - Comprehensive logging
 * - Real-time progress tracking
 * - NO fallback mode (Google Maps only)
 */

import Bottleneck from 'bottleneck';

// ============================================================================
// TYPES
// ============================================================================

export interface CommuteResult {
  candidateId: string;
  clientId: string;
  minutes: number;
  display: string;
  band: string;
  distanceText: string;
  durationText: string;
  originPostcode: string;
  destinationPostcode: string;
}

export interface BatchResult {
  success: boolean;
  result?: CommuteResult;
  error?: string;
  retries: number;
}

export interface ProgressUpdate {
  completed: number;
  total: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
  successCount: number;
  errorCount: number;
  excludedCount: number;
  message: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

// ============================================================================
// RATE LIMITER (Bottleneck)
// ============================================================================

const limiter = new Bottleneck({
  maxConcurrent: 1, // Only 1 request at a time (sequential processing)
  minTime: 100, // Minimum 100ms between requests = 10 req/sec max
  reservoir: 100, // Start with 100 requests available
  reservoirRefreshAmount: 100, // Refresh 100 requests
  reservoirRefreshInterval: 10 * 1000, // Every 10 seconds (= 10 req/sec)
});

// ============================================================================
// LOGGING SYSTEM
// ============================================================================

class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] ℹ️  ${message}`, data || '');
  }

  success(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] ✅ ${message}`, data || '');
  }

  error(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${this.context}] ❌ ${message}`, error || '');
  }

  warn(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [${this.context}] ⚠️  ${message}`, data || '');
  }

  batch(batchNum: number, total: number, message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.context}] 📦 [Batch ${batchNum}/${total}] ${message}`);
  }
}

// ============================================================================
// GOOGLE MAPS API CLIENT
// ============================================================================

class GoogleMapsClient {
  private logger: Logger;
  private apiKey: string;
  private maxRetries = 5;
  private baseRetryDelay = 1000; // 1 second

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.logger = new Logger('GoogleMapsClient');
  }

  /**
   * Call Google Maps Distance Matrix API with retry logic
   */
  async callDistanceMatrix(
    origins: string[],
    destinations: string[],
    retryCount = 0
  ): Promise<any> {
    const params = new URLSearchParams({
      origins: origins.join('|'),
      destinations: destinations.join('|'),
      mode: 'driving',
      units: 'imperial',
      key: this.apiKey,
    });

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

    try {
      this.logger.info(`API Call [Retry ${retryCount}/${this.maxRetries}]`, {
        origins: origins.length,
        destinations: destinations.length,
        elements: origins.length * destinations.length,
      });

      // Add timeout using AbortController
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const startTime = Date.now();

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeout);

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      this.logger.success(`API Response received in ${elapsed}ms`, {
        status: data.status,
        rows: data.rows?.length || 0,
      });

      // Check API-level status
      if (data.status !== 'OK') {
        if (data.status === 'OVER_QUERY_LIMIT' && retryCount < this.maxRetries) {
          // Retry with exponential backoff
          const delay = this.baseRetryDelay * Math.pow(2, retryCount);
          this.logger.warn(`OVER_QUERY_LIMIT - Retrying in ${delay}ms...`);
          await this.sleep(delay);
          return this.callDistanceMatrix(origins, destinations, retryCount + 1);
        }

        throw new Error(`Google Maps API Error: ${data.status} - ${data.error_message || 'No details'}`);
      }

      return data;

    } catch (error: any) {
      // Retry on network errors or timeouts
      if (retryCount < this.maxRetries && this.isRetriableError(error)) {
        const delay = this.baseRetryDelay * Math.pow(2, retryCount);
        this.logger.warn(`Retriable error - Retrying in ${delay}ms...`, error.message);
        await this.sleep(delay);
        return this.callDistanceMatrix(origins, destinations, retryCount + 1);
      }

      this.logger.error('API call failed after retries', error);
      throw error;
    }
  }

  private isRetriableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('abort') ||
      message.includes('econnreset')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SMART BATCHING SYSTEM
// ============================================================================

interface Candidate {
  id: string;
  postcode: string;
  role: string;
}

interface Client {
  id: string;
  postcode: string;
  role: string;
}

interface Batch {
  candidates: Candidate[];
  clients: Client[];
  batchNumber: number;
}

class SmartBatcher {
  private logger: Logger;
  private batchSizeOrigins = 10; // 10 origins per batch
  private batchSizeDestinations = 10; // 10 destinations per batch

  constructor() {
    this.logger = new Logger('SmartBatcher');
  }

  /**
   * Split candidates and clients into optimal batches
   * Strategy: 10 origins × 10 destinations = 100 elements per batch (optimal for Distance Matrix)
   */
  createBatches(candidates: Candidate[], clients: Client[]): Batch[] {
    const batches: Batch[] = [];

    // Split candidates into chunks of 10
    const candidateChunks: Candidate[][] = [];
    for (let i = 0; i < candidates.length; i += this.batchSizeOrigins) {
      candidateChunks.push(candidates.slice(i, i + this.batchSizeOrigins));
    }

    // Split clients into chunks of 10
    const clientChunks: Client[][] = [];
    for (let i = 0; i < clients.length; i += this.batchSizeDestinations) {
      clientChunks.push(clients.slice(i, i + this.batchSizeDestinations));
    }

    // Create all combinations
    let batchNumber = 1;
    for (const candidateChunk of candidateChunks) {
      for (const clientChunk of clientChunks) {
        batches.push({
          candidates: candidateChunk,
          clients: clientChunk,
          batchNumber: batchNumber++,
        });
      }
    }

    this.logger.info('Batches created', {
      totalCandidates: candidates.length,
      totalClients: clients.length,
      totalBatches: batches.length,
      avgElementsPerBatch: (candidates.length * clients.length) / batches.length,
    });

    return batches;
  }
}

// ============================================================================
// MATCH PROCESSOR (Main Service)
// ============================================================================

export class GoogleMapsMatchProcessor {
  private logger: Logger;
  private client: GoogleMapsClient;
  private batcher: SmartBatcher;

  constructor(apiKey: string) {
    this.logger = new Logger('MatchProcessor');
    this.client = new GoogleMapsClient(apiKey);
    this.batcher = new SmartBatcher();
  }

  /**
   * Process all candidate-client pairs and return results
   */
  async processAllMatches(
    candidates: Candidate[],
    clients: Client[],
    onProgress?: ProgressCallback
  ): Promise<BatchResult[]> {
    this.logger.info('🚀 Starting match processing', {
      candidates: candidates.length,
      clients: clients.length,
      totalPairs: candidates.length * clients.length,
    });

    // Create batches
    const batches = this.batcher.createBatches(candidates, clients);
    const totalPairs = candidates.length * clients.length;

    // Results storage
    const results: BatchResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let excludedCount = 0;

    // Process each batch sequentially (rate limited)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      this.logger.batch(
        batch.batchNumber,
        batches.length,
        `Processing ${batch.candidates.length} × ${batch.clients.length} = ${batch.candidates.length * batch.clients.length} pairs`
      );

      try {
        // Rate-limited API call
        const batchResults = await limiter.schedule(() =>
          this.processBatch(batch)
        );

        // Collect results
        for (const result of batchResults) {
          results.push(result);

          if (result.success) {
            successCount++;
          } else if (result.error?.includes('Over 80 minutes')) {
            excludedCount++;
          } else {
            errorCount++;
          }
        }

        // Send progress update
        if (onProgress) {
          const completed = results.length;
          onProgress({
            completed,
            total: totalPairs,
            percentage: Math.round((completed / totalPairs) * 100),
            currentBatch: batch.batchNumber,
            totalBatches: batches.length,
            successCount,
            errorCount,
            excludedCount,
            message: `Processing batch ${batch.batchNumber}/${batches.length}`,
          });
        }

      } catch (error: any) {
        this.logger.error(`Batch ${batch.batchNumber} failed completely`, error);

        // Mark all pairs in this batch as failed
        for (const candidate of batch.candidates) {
          for (const client of batch.clients) {
            results.push({
              success: false,
              error: `Batch failed: ${error.message}`,
              retries: 0,
            });
            errorCount++;
          }
        }
      }
    }

    this.logger.success('✅ Match processing complete', {
      total: results.length,
      success: successCount,
      excluded: excludedCount,
      errors: errorCount,
    });

    return results;
  }

  /**
   * Process a single batch (10x10 = 100 elements)
   */
  private async processBatch(batch: Batch): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    try {
      // Extract postcodes
      const origins = batch.candidates.map(c => c.postcode);
      const destinations = batch.clients.map(c => c.postcode);

      // Call Google Maps API
      const data = await this.client.callDistanceMatrix(origins, destinations);

      // Parse results
      for (let i = 0; i < batch.candidates.length; i++) {
        for (let j = 0; j < batch.clients.length; j++) {
          const candidate = batch.candidates[i];
          const client = batch.clients[j];

          const element = data.rows?.[i]?.elements?.[j];

          if (!element || element.status !== 'OK') {
            results.push({
              success: false,
              error: `Route not found: ${element?.status || 'NO_DATA'}`,
              retries: 0,
            });
            continue;
          }

          const minutes = Math.round(element.duration.value / 60);

          // Check 80-minute rule
          if (minutes > 80) {
            results.push({
              success: false,
              error: `Over 80 minutes (RULE 2): ${minutes} minutes`,
              retries: 0,
            });
            continue;
          }

          // Success!
          results.push({
            success: true,
            result: {
              candidateId: candidate.id,
              clientId: client.id,
              minutes,
              display: this.formatTime(minutes),
              band: this.getBand(minutes),
              distanceText: element.distance.text,
              durationText: element.duration.text,
              originPostcode: candidate.postcode,
              destinationPostcode: client.postcode,
            },
            retries: 0,
          });
        }
      }

    } catch (error: any) {
      // Batch failed - mark all as errors
      for (const candidate of batch.candidates) {
        for (const client of batch.clients) {
          results.push({
            success: false,
            error: `Batch error: ${error.message}`,
            retries: 0,
          });
        }
      }
    }

    return results;
  }

  private formatTime(minutes: number): string {
    const band = this.getBand(minutes);
    if (minutes < 60) {
      return `${band} ${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins === 0 ? `${band} ${hours}h` : `${band} ${hours}h ${mins}m`;
  }

  private getBand(minutes: number): string {
    if (minutes <= 20) return '🟢🟢🟢';
    if (minutes <= 40) return '🟢🟢';
    if (minutes <= 55) return '🟢';
    if (minutes <= 80) return '🟡';
    return '';
  }
}
