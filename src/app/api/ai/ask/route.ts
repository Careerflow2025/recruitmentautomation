import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { conversationStorage } from '@/lib/conversation-storage';
import { createHash } from 'crypto';
import { createServiceClient, createClient } from '@/lib/supabase/server';

/**
 * Promise timeout wrapper for enterprise-grade stability
 */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutError = new Error('Promise timed out')): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(timeoutError);
    }, ms);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// "Can't-crash" guard: Define data variables in module scope to prevent ReferenceError
let candidates: any[] = [];
let clients: any[] = [];
let matches: any[] = [];
let matchStatuses: any[] = [];
let matchNotes: any[] = [];

/**
 * Get the highest ID from a list of candidates or clients
 */
function getHighestId(items: any[], prefix: string): string {
  if (!items || items.length === 0) return prefix + '001';

  const numbers = items
    .map(item => {
      const id = item.id || '';
      if (id.startsWith(prefix)) {
        const numPart = id.substring(prefix.length);
        return parseInt(numPart, 10);
      }
      return 0;
    })
    .filter(num => !isNaN(num) && num > 0);

  if (numbers.length === 0) return prefix + '001';

  const maxNum = Math.max(...numbers);
  return prefix + String(maxNum).padStart(3, '0');
}

/**
 * Safe array helper to ensure arrays are never undefined
 */
function asArray<T>(x: T[] | null | undefined): T[] {
  return Array.isArray(x) ? x : [];
}

/**
 * Centralized database data fetcher with RLS enforcement
 * Uses userClient (with JWT) to ensure RLS policies are applied
 */
export async function getAllData(userClient: ReturnType<typeof createServerClient>) {
  const [{ data: candsRaw, error: cErr },
         { data: clientsRaw, error: cliErr },
         { data: matchesRaw, error: mErr },
         { data: statusesRaw, error: sErr },
         { data: notesRaw, error: nErr }] = await Promise.all([
    userClient.from('candidates').select('*').order('added_at', { ascending: false }),
    userClient.from('clients').select('*').order('added_at', { ascending: false }),
    userClient.from('matches').select('*').order('commute_minutes', { ascending: true }),
    userClient.from('match_statuses').select('*'),
    userClient.from('match_notes').select('*').order('created_at', { ascending: false })
  ]);

  if (cErr)  console.error('DB candidates:', cErr);
  if (cliErr) console.error('DB clients:', cliErr);
  if (mErr)  console.error('DB matches:', mErr);
  if (sErr)  console.error('DB match_statuses:', sErr);
  if (nErr)  console.error('DB match_notes:', nErr);

  // ✅ Always return the same property names your callers expect
  return {
    candidates: asArray(candsRaw),
    clients: asArray(clientsRaw),
    matches: asArray(matchesRaw),
    matchStatuses: asArray(statusesRaw),
    matchNotes: asArray(notesRaw),
  };
}

// Global AI request queue system with user memory isolation
interface AIRequestItem {
  id: string;
  userId: string;
  request: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retryCount: number;
  timestamp: number;
}

class GlobalAIRequestQueue {
  private queue: AIRequestItem[] = [];
  private isProcessing = false;
  private requestsPerMinute = 200; // Much higher since we control our own GPU
  private delayBetweenRequests = (60 * 1000) / this.requestsPerMinute; // ~300ms
  private maxRetries = 3;
  private userRequestCounts = new Map<string, { count: number; resetTime: number }>();
  private maxRequestsPerUserPerMinute = 500; // Increased - we have our own infrastructure
  private lastRequestTime = 0;
  private concurrentRequests = new Map<string, number>();

  async enqueue<T>(userId: string, request: () => Promise<T>): Promise<T> {
    // Track concurrent requests per user
    const currentConcurrent = this.concurrentRequests.get(userId) || 0;
    const maxConcurrent = 10; // Allow more concurrent requests with GPU

    if (currentConcurrent >= maxConcurrent) {
      console.log(`🚦 Smart queuing: user ${userId.substring(0, 8)}... has ${currentConcurrent} concurrent requests`);
      await new Promise(resolve => setTimeout(resolve, 100 * currentConcurrent));
    }

    this.concurrentRequests.set(userId, currentConcurrent + 1);

    return new Promise<T>((resolve, reject) => {
      const requestItem: AIRequestItem = {
        id: `ai_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        request,
        resolve: (value: T) => {
          const current = this.concurrentRequests.get(userId) || 0;
          if (current > 0) {
            this.concurrentRequests.set(userId, current - 1);
          }
          resolve(value);
        },
        reject: (error: any) => {
          const current = this.concurrentRequests.get(userId) || 0;
          if (current > 0) {
            this.concurrentRequests.set(userId, current - 1);
          }
          reject(error);
        },
        retryCount: 0,
        timestamp: Date.now(),
      };

      this.queue.push(requestItem);

      console.log(`📥 Queued AI request ${requestItem.id} for user ${userId.substring(0, 8)}... (queue: ${this.queue.length})`);

      this.processQueue().catch(console.error);
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      try {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        // Minimal delay for GPU processing
        const adaptiveDelay = Math.max(50, this.delayBetweenRequests);

        if (timeSinceLastRequest < adaptiveDelay) {
          const waitTime = adaptiveDelay - timeSinceLastRequest;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        console.log(`🔄 Processing AI request ${item.id} (retries: ${item.retryCount})`);

        const result = await withTimeout(item.request(), 30000, new Error('AI request timed out after 30 seconds'));
        item.resolve(result);

        console.log(`✅ Completed AI request ${item.id}`);
        this.lastRequestTime = Date.now();

      } catch (error: any) {
        console.error(`❌ AI request ${item.id} failed:`, error.message);

        if (this.isRetryableError(error) && item.retryCount < this.maxRetries) {
          item.retryCount++;
          const backoffDelay = Math.min(1000 * Math.pow(2, item.retryCount), 10000);

          console.log(`🔄 Retrying AI request ${item.id} in ${backoffDelay}ms (attempt ${item.retryCount + 1}/${this.maxRetries + 1})`);

          setTimeout(() => {
            this.queue.unshift(item);
            this.processQueue();
          }, backoffDelay);
        } else {
          item.reject(error);
        }

        this.lastRequestTime = Date.now();
      }
    }

    this.isProcessing = false;
  }

  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const status = error.status;

    return (
      status === 502 ||
      status === 503 ||
      status === 504 ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection')
    );
  }

  getStats() {
    const userCounts = Array.from(this.userRequestCounts.entries()).map(([userId, data]) => ({
      userId: userId.substring(0, 8) + '...',
      count: data.count,
      resetIn: Math.max(0, data.resetTime - Date.now()),
      concurrent: this.concurrentRequests.get(userId) || 0
    }));

    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      requestsPerMinute: this.requestsPerMinute,
      userCounts,
      totalConcurrentRequests: Array.from(this.concurrentRequests.values()).reduce((sum, val) => sum + val, 0)
    };
  }
}

// Global AI request queue instance
const globalAIQueue = new GlobalAIRequestQueue();

export async function POST(request: Request) {
  const startTime = Date.now();
  let sessionLock: { id: number } | null = null;

  try {
    const { question, sessionId } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    // Check RunPod GPU configuration
    if (!process.env.VPS_AI_URL || !process.env.VPS_AI_SECRET) {
      return NextResponse.json(
        { error: 'VPS_AI_URL and VPS_AI_SECRET must be configured in environment variables' },
        { status: 500 }
      );
    }

    // Create user client with JWT (RLS enabled)
    const userClient = await createClient();

    // Get authenticated user
    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'You must be logged in to use AI assistant' },
        { status: 401 }
      );
    }

    // ===== START LOCKING MECHANISM =====
    const serviceClient = createServiceClient();

    // Check for existing fresh lock
    const freshBusy = await serviceClient
      .from('conversation_locks')
      .select('id, updated_at')
      .eq('user_id', user.id)
      .eq('status', 'processing')
      .gte('updated_at', new Date(Date.now() - 60_000).toISOString())
      .maybeSingle();

    if (freshBusy.data) {
      console.log(`🚦 User ${user.id.substring(0,8)}... is busy, rejecting request`);
      return NextResponse.json({ message: 'busy' }, { status: 429 });
    }

    // Create lock
    const { data: created, error: createErr } = await serviceClient
      .from('conversation_locks')
      .insert({ user_id: user.id, status: 'processing', started_at: new Date().toISOString() })
      .select('id')
      .single();

    if (createErr) throw createErr;
    sessionLock = created;
    console.log(`✅ Locked session ${sessionLock.id} for user ${user.id.substring(0,8)}...`);
    // ===== END LOCKING MECHANISM =====

    // Enqueue the AI request
    const aiResponse = await globalAIQueue.enqueue(user.id, async () => {
      // Load conversation history
      const currentSessionId = sessionId || await conversationStorage.createSessionId(user.id);
      const conversationHistory = await conversationStorage.getRecentConversations(user.id, 20, 50);

      // Get all data using RLS-protected userClient
      ({ candidates, clients, matches, matchStatuses, matchNotes } = await getAllData(userClient));

      console.log(`📊 Loaded: ${candidates.length} candidates, ${clients.length} clients, ${matches.length} matches for user ${user.id.substring(0, 8)}...`);

      // Build enriched matches
      const enrichedMatches = matches.map(match => {
        const candidate = candidates.find(c => c.id === match.candidate_id);
        const client = clients.find(c => c.id === match.client_id);
        const status = matchStatuses.find(s =>
          s.candidate_id === match.candidate_id && s.client_id === match.client_id
        );
        const notes = matchNotes.filter(n =>
          n.candidate_id === match.candidate_id && n.client_id === match.client_id
        );

        return {
          ...match,
          candidate,
          client,
          status: status?.status || null,
          notes: notes || []
        };
      });

      // Calculate stats
      const totalMatches = matches.length;
      const roleMatches = matches.filter(m => m.role_match).length;
      const placedMatches = matchStatuses.filter(s => s.status === 'placed').length;
      const inProgressMatches = matchStatuses.filter(s => s.status === 'in-progress').length;
      const rejectedMatches = matchStatuses.filter(s => s.status === 'rejected').length;

      // Build system prompt
      const systemPrompt = `You are a helpful AI assistant for dental recruitment. You help match dental candidates with client surgeries.

USER CONTEXT:
- User ID: ${user.id.substring(0, 8)}... (isolated session - all data shown is only for this user)
- Total candidates: ${candidates.length}
- Total clients: ${clients.length}
- Total matches: ${totalMatches}
- Placed: ${placedMatches}, In-Progress: ${inProgressMatches}, Rejected: ${rejectedMatches}

AVAILABLE DATA:
Candidates: ${JSON.stringify(candidates.slice(0, 50), null, 1)}
Clients: ${JSON.stringify(clients.slice(0, 50), null, 1)}
Matches: ${JSON.stringify(enrichedMatches.slice(0, 100), null, 1)}

CONVERSATION HISTORY:
${conversationHistory.map((msg, i) => `[${i + 1}] USER: ${msg.question}\nASSISTANT: ${msg.answer}`).join('\n\n')}

INSTRUCTIONS:
- Answer questions directly and concisely
- When asked for matches, provide candidate ID, phone, postcode, client name, and commute time
- When asked for phone numbers, provide ONLY the phone numbers
- Match statuses can be: "placed", "in-progress", "rejected", or null (pending)
- All data is isolated to this user - you're seeing only their candidates, clients, and matches
- Be helpful and professional

CURRENT QUESTION: ${question}`;

      console.log(`📤 Calling RunPod vLLM at ${process.env.VPS_AI_URL}`);

      // Call RunPod vLLM server
      // Note: Mistral doesn't support separate 'system' role, so we combine system prompt + question into one user message
      const combinedPrompt = `${systemPrompt}\n\n${question}`;

      const vllmResponse = await fetch(`${process.env.VPS_AI_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.VPS_AI_SECRET}`
        },
        body: JSON.stringify({
          model: '/workspace/models/mistral-7b-instruct',
          messages: [
            { role: 'user', content: combinedPrompt }
          ],
          max_tokens: 2000,
          temperature: 0.7,
          stream: false
        })
      });

      if (!vllmResponse.ok) {
        const errorText = await vllmResponse.text();
        throw new Error(`vLLM API error (${vllmResponse.status}): ${errorText}`);
      }

      const vllmData = await vllmResponse.json();
      const aiAnswer = vllmData.choices?.[0]?.message?.content || 'No response generated';

      console.log(`✅ Received response from RunPod vLLM (${aiAnswer.length} chars)`);

      return {
        answer: aiAnswer,
        currentSessionId,
        conversationHistory,
        totalMatches,
        candidates,
        clients,
        enrichedMatches,
        matchNotes,
        placedMatches,
        inProgressMatches,
        rejectedMatches,
        optimization: {
          processingTime: Date.now() - startTime,
          contextOptimization: true,
          model: 'mistral-7b-instruct-vllm',
          infrastructure: 'RunPod RTX 4090'
        }
      };
    });

    const {
      answer,
      currentSessionId,
      conversationHistory,
      totalMatches,
      optimization
    } = aiResponse;

    // Save conversation to storage
    await conversationStorage.saveMessage(user.id, currentSessionId, question, answer);

    return NextResponse.json({
      success: true,
      question,
      answer,
      sessionId: currentSessionId,
      contextInfo: {
        conversationHistory: conversationHistory.length,
        totalCandidates: candidates.length,
        totalClients: clients.length,
        totalMatches: totalMatches,
        multiTenantIsolation: true,
        userId: user.id.substring(0, 8) + '...',
        queueStats: globalAIQueue.getStats(),
        optimizationMetrics: {
          processingTimeMs: optimization.processingTime,
          model: optimization.model,
          infrastructure: optimization.infrastructure,
          costSavings: '100% - self-hosted GPU',
          noVendorRateLimits: true
        },
        systemStats: {
          active: true,
          infrastructure: 'RunPod RTX 4090 GPU',
          model: 'Mistral 7B Instruct',
          selfHosted: true
        }
      }
    });

  } catch (error: any) {
    console.error('AI API error:', error);

    let errorMessage = 'Failed to get answer from AI';
    let errorDetails = error.message || 'Unknown error';
    let statusCode = 500;

    if (error.message?.includes('VPS_AI_URL') || error.message?.includes('VPS_AI_SECRET')) {
      errorMessage = 'AI Configuration Error';
      errorDetails = 'RunPod GPU server is not configured. Please add VPS_AI_URL and VPS_AI_SECRET to environment variables.';
      statusCode = 503;
    } else if (error.message?.includes('vLLM API error')) {
      errorMessage = 'GPU Server Error';
      errorDetails = 'RunPod vLLM server returned an error. Please check server logs.';
      statusCode = 503;
    } else if (error.message?.toLowerCase().includes('timeout')) {
      errorMessage = 'Request Timeout';
      errorDetails = 'GPU server took too long to respond. Please try again.';
      statusCode = 504;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
        queueStats: globalAIQueue.getStats(),
        timestamp: new Date().toISOString(),
        fullError: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: statusCode }
    );
  } finally {
    // Always unlock
    if (sessionLock) {
      const serviceClient = createServiceClient();
      await serviceClient
        .from('conversation_locks')
        .update({ status: 'idle', ended_at: new Date().toISOString() })
        .eq('id', sessionLock.id);
      console.log(`✅ Unlocked session ${sessionLock.id}`);
    }
  }
}
