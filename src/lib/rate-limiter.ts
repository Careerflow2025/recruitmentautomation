/**
 * Enhanced Rate Limiter for Multi-Tenant Google Maps API Usage
 * 
 * Handles:
 * - Multiple users making concurrent requests
 * - Queue management with delays
 * - Batch request optimization
 * - Graceful error handling and retries
 */

interface QueueItem {
  id: string;
  userId: string;
  request: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retryCount: number;
  priority: number; // 1 = highest, 5 = lowest
}

class GoogleMapsRateLimiter {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private requestsPerSecond = 5; // More conservative rate (Google allows 10/sec)
  private delayBetweenRequests = 1000 / this.requestsPerSecond; // 200ms delay
  private maxRetries = 3;
  private userRequestCounts = new Map<string, { count: number; resetTime: number }>();
  private maxRequestsPerUserPerMinute = 500; // Allow more requests for large match generation (was 30)

  /**
   * Add a request to the queue with priority
   */
  async enqueue<T>(
    userId: string,
    request: () => Promise<T>,
    priority: number = 3
  ): Promise<T> {
    // Check user rate limits
    if (!this.checkAndIncrementUserRateLimit(userId)) {
      throw new Error('User rate limit exceeded. Please try again in a moment.');
    }

    return new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        request,
        resolve,
        reject,
        retryCount: 0,
        priority,
      };

      // Insert based on priority (higher priority = lower number = processed first)
      let insertIndex = this.queue.length;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].priority > priority) {
          insertIndex = i;
          break;
        }
      }

      this.queue.splice(insertIndex, 0, queueItem);
      
      console.log(`📥 Queued request ${queueItem.id} for user ${userId} (priority: ${priority}, queue size: ${this.queue.length})`);
      
      this.processQueue();
    });
  }

  /**
   * Check if user is within rate limits and increment their count
   */
  private checkAndIncrementUserRateLimit(userId: string): boolean {
    const now = Date.now();
    let userLimits = this.userRequestCounts.get(userId);

    if (!userLimits || now > userLimits.resetTime) {
      userLimits = {
        count: 0,
        resetTime: now + 60000, // Reset in 1 minute
      };
      this.userRequestCounts.set(userId, userLimits);
    }

    if (userLimits.count >= this.maxRequestsPerUserPerMinute) {
      console.warn(`🚨 User ${userId} rate limit exceeded: ${userLimits.count}/${this.maxRequestsPerUserPerMinute}`);
      return false;
    }

    userLimits.count++;
    return true;
  }

  /**
   * Process the queue with proper rate limiting
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      
      try {
        // User request count is now incremented on enqueue
        console.log(`🔄 Processing request ${item.id} for user ${item.userId} (retries: ${item.retryCount})`);
        
        // Execute the request
        const result = await item.request();
        item.resolve(result);
        
        console.log(`✅ Completed request ${item.id} successfully`);

      } catch (error: any) {
        console.error(`❌ Request ${item.id} failed:`, error.message);

        // Check if it's a rate limit error
        if (this.isRateLimitError(error) && item.retryCount < this.maxRetries) {
          item.retryCount++;
          
          // Calculate exponential backoff delay
          const backoffDelay = Math.min(1000 * Math.pow(2, item.retryCount), 10000);
          
          console.log(`🔄 Retrying request ${item.id} in ${backoffDelay}ms (attempt ${item.retryCount + 1}/${this.maxRetries + 1})`);
          
          // Requeue with lower priority after delay
          setTimeout(() => {
            item.priority += 1; // Lower priority for retry
            this.queue.unshift(item);
            this.processQueue();
          }, backoffDelay);
        } else {
          item.reject(error);
        }
      }

      // Add delay between requests to respect rate limits
      if (this.queue.length > 0) {
        await this.delay(this.delayBetweenRequests);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Check if error is a rate limit or timeout error (retriable errors)
   */
  private isRateLimitError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
      error.status === 429 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded') ||
      message.includes('over_query_limit') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('etimedout')
    );
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const userCounts = Array.from(this.userRequestCounts.entries()).map(([userId, data]) => ({
      userId,
      count: data.count,
      resetIn: Math.max(0, data.resetTime - Date.now())
    }));

    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      requestsPerSecond: this.requestsPerSecond,
      delayBetweenRequests: this.delayBetweenRequests,
      userCounts
    };
  }

  /**
   * Update rate limiting parameters
   */
  updateSettings(settings: {
    requestsPerSecond?: number;
    maxRequestsPerUserPerMinute?: number;
    maxRetries?: number;
  }) {
    if (settings.requestsPerSecond) {
      this.requestsPerSecond = Math.min(settings.requestsPerSecond, 10); // Cap at Google's limit
      this.delayBetweenRequests = 1000 / this.requestsPerSecond;
    }
    if (settings.maxRequestsPerUserPerMinute) {
      this.maxRequestsPerUserPerMinute = settings.maxRequestsPerUserPerMinute;
    }
    if (settings.maxRetries !== undefined) {
      this.maxRetries = settings.maxRetries;
    }

    console.log('📊 Rate limiter settings updated:', this.getStats());
  }
}

// Global rate limiter instance
export const googleMapsRateLimiter = new GoogleMapsRateLimiter();

/**
 * Batch request optimizer for Google Maps API
 */
export class BatchRequestOptimizer {
  /**
   * Smart batch processing with rate limiting
   */
  static async processWithRateLimit<T>(
    userId: string,
    requests: Array<() => Promise<T>>,
    batchSize: number = 5,
    priority: number = 3
  ): Promise<T[]> {
    const results: T[] = [];
    
    console.log(`📦 Starting batch processing for user ${userId}: ${requests.length} requests in batches of ${batchSize}`);

    // Process in smaller batches to avoid overwhelming the queue
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      // Process batch with rate limiting
      const batchPromises = batch.map((request, index) =>
        googleMapsRateLimiter.enqueue(
          userId,
          request,
          priority + Math.floor(index / 10) // Slightly lower priority for later items
        )
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            console.warn('Batch item failed:', result.reason);
            results.push(null as T); // Push null for failed requests
          }
        }

        console.log(`✅ Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(requests.length / batchSize)}`);
        
        // Small delay between batches for better distribution
        if (i + batchSize < requests.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error('Batch processing error:', error);
        // Add nulls for failed batch
        for (let j = 0; j < batch.length; j++) {
          results.push(null as T);
        }
      }
    }

    console.log(`🏁 Batch processing complete for user ${userId}: ${results.filter(r => r !== null).length}/${requests.length} successful`);
    
    return results;
  }
}

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Enhanced Google Maps API wrapper with rate limiting and timeout
 */
export async function rateLimitedGoogleMapsRequest(
  userId: string,
  origins: string[],
  destinations: string[],
  apiKey: string,
  priority: number = 3
): Promise<any> {
  return googleMapsRateLimiter.enqueue(
    userId,
    async () => {
      const params = new URLSearchParams({
        origins: origins.join('|'),
        destinations: destinations.join('|'),
        mode: 'driving',
        units: 'imperial',
        key: apiKey,
      });

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

      console.log(`🌐 Making Google Maps API request for user ${userId}:`, {
        origins: origins.length,
        destinations: destinations.length,
        url: url.replace(apiKey, 'API_KEY_HIDDEN')
      });

      // Add 15 second timeout to prevent hanging forever
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Netlify-Function/1.0',
          'Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://localhost:8888'
        }
      }, 15000);
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ Google Maps API HTTP error for user ${userId}:`, response.status, response.statusText, errorBody);
        throw new Error(`Google Maps API HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      console.log(`📊 Google Maps API response for user ${userId}:`, {
        status: data.status,
        error_message: data.error_message,
        rows: data.rows?.length || 0,
        elements_sample: data.rows?.[0]?.elements?.[0]?.status
      });

      if (data.status && data.status !== 'OK') {
        console.error(`❌ Google Maps API status error for user ${userId}:`, data.status, data.error_message);
        
        if (data.status === 'REQUEST_DENIED') {
          throw new Error(`Google Maps API access denied. Please check API key configuration, billing, and domain restrictions: ${data.error_message}`);
        }
        if (data.status === 'OVER_QUERY_LIMIT') {
          throw new Error('Google Maps API quota exceeded. Please try again later.');
        }
        if (data.status === 'INVALID_REQUEST') {
          throw new Error(`Invalid request format: ${data.error_message}`);
        }
        
        throw new Error(`Google Maps API status: ${data.status} - ${data.error_message}`);
      }

      return data;
    },
    priority
  );
}