import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { conversationStorage } from '@/lib/conversation-storage';
import { createHash } from 'crypto';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import {
  getSummary,
  updateSummary,
  getFacts,
  updateFact,
  generateSummary,
  extractFacts,
  shouldRegenerateSummary,
  getRecentContext
} from '@/lib/ai-memory';
import {
  getRAGContext,
  storeConversationEmbedding
} from '@/lib/rag';

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

// NOTE: Data variables are now SCOPED PER REQUEST to prevent cross-user contamination
// Previously they were module-scoped which caused User A to see User B's data!

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
 * Response batching helper for token limit management
 * Splits long responses into chunks to avoid token overflow
 */
function batchResponse(response: string, maxChars: number = 1000): string[] {
  if (response.length <= maxChars) {
    return [response];
  }

  const batches: string[] = [];
  const paragraphs = response.split('\n\n');
  let currentBatch = '';

  for (const paragraph of paragraphs) {
    if ((currentBatch + '\n\n' + paragraph).length > maxChars && currentBatch.length > 0) {
      batches.push(currentBatch.trim());
      currentBatch = paragraph;
    } else {
      currentBatch += (currentBatch ? '\n\n' : '') + paragraph;
    }
  }

  if (currentBatch) {
    batches.push(currentBatch.trim());
  }

  return batches;
}

/**
 * Estimate token count from text (rough approximation)
 * ~4 chars = 1 token on average for English text
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate response if it exceeds token limits
 * Preserves important information while staying within limits
 */
function truncateForTokenLimit(response: string, maxTokens: number = 250): string {
  const estimatedTokens = estimateTokenCount(response);

  if (estimatedTokens <= maxTokens) {
    return response;
  }

  // Calculate max chars based on token limit (4 chars ≈ 1 token)
  const maxChars = maxTokens * 4;

  // Try to truncate at sentence boundary
  const truncated = response.substring(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > maxChars * 0.7) {
    // Use sentence/newline boundary if it's not too far back
    return truncated.substring(0, cutPoint + 1) + '\n\n[Response truncated due to length. Ask follow-up questions for more details.]';
  } else {
    // Hard truncate if no good boundary found
    return truncated + '...\n\n[Response truncated. Please ask follow-up questions.]';
  }
}

/**
 * Centralized database data fetcher with RLS enforcement
 * Uses userClient (with JWT) to ensure RLS policies are applied
 */
export async function getAllData(userClient: ReturnType<typeof createServerClient>, userId: string) {
  console.log('🔒 FORCING user_id filter in queries for user:', userId.substring(0, 8));

  // BYPASS BROKEN RLS: Filter by user_id explicitly in the query
  const [{ data: candsRaw, error: cErr },
         { data: clientsRaw, error: cliErr },
         { data: matchesRaw, error: mErr },
         { data: statusesRaw, error: sErr },
         { data: notesRaw, error: nErr }] = await Promise.all([
    userClient.from('candidates').select('*').eq('user_id', userId).order('added_at', { ascending: false }),
    userClient.from('clients').select('*').eq('user_id', userId).order('added_at', { ascending: false }),
    userClient.from('matches').select('*').eq('user_id', userId).order('commute_minutes', { ascending: true }),
    userClient.from('match_statuses').select('*').eq('user_id', userId),
    userClient.from('match_notes').select('*').eq('user_id', userId).order('created_at', { ascending: false })
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
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (!user || authError) {
      console.error('❌ Auth error:', authError);
      return NextResponse.json(
        { error: 'You must be logged in to use AI assistant' },
        { status: 401 }
      );
    }

    console.log(`✅ Authenticated user: ${user.id.substring(0, 8)}... (${user.email})`);

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
      // Load conversation history (FULL - for summarization only)
      const currentSessionId = sessionId || await conversationStorage.createSessionId(user.id);
      const fullConversationHistory = await conversationStorage.getRecentConversations(user.id, 100, 100);

      // ==========================================
      // RAG SYSTEM - Retrieve relevant context
      // ==========================================
      console.log('🔍 RAG: Retrieving relevant context for question...');

      const { relevantConversations, relevantKnowledge } = await getRAGContext(
        user.id,
        question
      );

      // MEMORY SYSTEM - Load summary and facts (kept for compatibility)
      const existingSummary = await getSummary(user.id, currentSessionId);
      const userFacts = await getFacts(user.id, currentSessionId);

      const turnCount = fullConversationHistory.length;

      // Regenerate summary every 10 turns
      if (shouldRegenerateSummary(turnCount)) {
        console.log(`🔄 Regenerating summary at turn ${turnCount}...`);
        const newSummary = await generateSummary(
          fullConversationHistory.map((msg, i) => ({
            question: msg.question,
            answer: msg.answer,
            turn: i + 1
          })),
          existingSummary?.summary
        );
        await updateSummary(user.id, currentSessionId, newSummary, turnCount);
      }

      // Get all data using explicit user_id filter (RLS is broken, so we filter manually)
      const { candidates, clients, matches, matchStatuses, matchNotes } = await getAllData(userClient, user.id);

      console.log(`📊 RLS CHECK - User ${user.id.substring(0, 8)}:`);
      console.log(`   Loaded: ${candidates.length} candidates, ${clients.length} clients, ${matches.length} matches`);
      console.log(`   First 3 candidate IDs: ${candidates.slice(0, 3).map(c => c.id).join(', ')}`);

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

      // ========================================
      // PROFESSIONAL BATCHING SYSTEM V2
      // Context-aware token management
      // ========================================

      const questionLower = question.toLowerCase();
      const MAX_CONTEXT_TOKENS = 2800; // Reserve ~1200 for response

      // Question type detection for intelligent context selection
      const questionType = {
        isStats: questionLower.includes('how many') || questionLower.includes('total') || questionLower.includes('count'),
        isSpecificCandidate: questionLower.match(/can\d+/i),
        isSpecificClient: questionLower.match(/cl\d+/i),
        isInProgress: questionLower.includes('in-progress') || questionLower.includes('follow'),
        isPlaced: questionLower.includes('placed') || questionLower.includes('hired'),
        isRejected: questionLower.includes('rejected') || questionLower.includes('declined'),
        isMap: questionLower.includes('map') || questionLower.includes('commute') || questionLower.includes('drive'),
        needsData: questionLower.includes('show') || questionLower.includes('list') || questionLower.includes('find')
      };

      // Context batching strategy
      let relevantCandidates: any[] = [];
      let relevantClients: any[] = [];
      let relevantMatches: any[] = [];
      let contextMode = 'minimal';

      // BATCH 1: Statistics-only (no data needed)
      if (questionType.isStats) {
        contextMode = 'stats-only';
        // Send NO actual data, just counts
        relevantCandidates = [];
        relevantClients = [];
        relevantMatches = [];
      }
      // BATCH 2: Specific entity queries (focused data)
      else if (questionType.isSpecificCandidate) {
        contextMode = 'specific-candidate';
        const canId = questionLower.match(/can\d+/i)?.[0].toUpperCase();
        relevantCandidates = candidates.filter(c => c.id === canId).slice(0, 1);
        relevantMatches = enrichedMatches.filter(m => m.candidate_id === canId).slice(0, 5);
        const clientIds = new Set(relevantMatches.map(m => m.client_id));
        relevantClients = clients.filter(c => clientIds.has(c.id)).slice(0, 5);
      }
      else if (questionType.isSpecificClient) {
        contextMode = 'specific-client';
        const clId = questionLower.match(/cl\d+/i)?.[0].toUpperCase();
        relevantClients = clients.filter(c => c.id === clId).slice(0, 1);
        relevantMatches = enrichedMatches.filter(m => m.client_id === clId).slice(0, 5);
        const candidateIds = new Set(relevantMatches.map(m => m.candidate_id));
        relevantCandidates = candidates.filter(c => candidateIds.has(c.id)).slice(0, 5);
      }
      // BATCH 3: Status-filtered queries (moderate data)
      else if (questionType.isInProgress || questionType.isPlaced || questionType.isRejected) {
        contextMode = 'status-filtered';
        const statusFilter = questionType.isInProgress ? 'in-progress' :
                           questionType.isPlaced ? 'placed' : 'rejected';

        const statusIds = matchStatuses.filter(s => s.status === statusFilter);
        relevantMatches = enrichedMatches.filter(m =>
          statusIds.some(s => s.candidate_id === m.candidate_id && s.client_id === m.client_id)
        ).slice(0, 10); // Max 10 matches for status queries

        const candidateIds = new Set(relevantMatches.map(m => m.candidate_id));
        const clientIds = new Set(relevantMatches.map(m => m.client_id));
        relevantCandidates = candidates.filter(c => candidateIds.has(c.id)).slice(0, 10);
        relevantClients = clients.filter(c => clientIds.has(c.id)).slice(0, 10);
      }
      // BATCH 4: General queries needing data (minimal sample)
      else if (questionType.needsData) {
        contextMode = 'sample-data';
        // For general "show me" queries, provide small representative sample
        relevantCandidates = candidates.slice(0, 3);
        relevantClients = clients.slice(0, 3);
        relevantMatches = enrichedMatches.slice(0, 5);
      }
      // BATCH 5: Help/chat queries (no data)
      else {
        contextMode = 'chat-only';
        relevantCandidates = [];
        relevantClients = [];
        relevantMatches = [];
      }

      console.log(`📦 Context Batch Mode: ${contextMode}`);
      console.log(`📊 Data sizes - Candidates: ${relevantCandidates.length}, Clients: ${relevantClients.length}, Matches: ${relevantMatches.length}`);

      // ========================================
      // ULTRA-COMPACT DATA REPRESENTATION
      // Minimize tokens while preserving info
      // ========================================

      // Only include essential fields based on question type
      const compactCandidates = relevantCandidates.map(c => {
        const compact: any = { id: c.id };

        // Include fields only if relevant to the question
        if (c.role) compact.r = c.role.substring(0, 15); // Abbreviated role
        if (questionType.isMap && c.postcode) {
          compact.pc = c.postcode; // Full postcode for maps
        } else if (c.postcode) {
          compact.p = c.postcode.substring(0, 3); // Area code only
        }

        // Only include phone if specifically asked
        if (questionLower.includes('phone') || questionLower.includes('contact')) {
          compact.ph = c.phone?.slice(-4) || ''; // Last 4 digits only
        }

        return compact;
      });

      const compactClients = relevantClients.map(c => {
        const compact: any = { id: c.id };

        // Truncate surgery name for space
        if (c.surgery) compact.s = c.surgery.substring(0, 15);
        if (c.role) compact.r = c.role.substring(0, 15);

        if (questionType.isMap && c.postcode) {
          compact.pc = c.postcode; // Full for maps
        } else if (c.postcode) {
          compact.p = c.postcode.substring(0, 3); // Area only
        }

        return compact;
      });

      const compactMatches = relevantMatches.map(m => {
        const compact: any = {
          c: m.candidate_id, // Shorter key names
          l: m.client_id,
          m: m.commute_minutes || 0
        };

        // Only include role match if relevant
        if (!questionType.isStats) {
          compact.r = m.role_match ? 1 : 0;
        }

        // Only include status if it exists and is relevant
        if (m.status && (questionType.isInProgress || questionType.isPlaced || questionType.isRejected)) {
          compact.s = m.status.substring(0, 3); // pla/in-/rej
        }

        // Include map data only for map questions
        if (questionType.isMap && m.candidate && m.client) {
          compact.cpc = m.candidate.postcode || '';
          compact.lpc = m.client.postcode || '';
          compact.d = m.commute_display || `${m.commute_minutes}m`;
        }

        return compact;
      });

      // DISABLED: RAG context to prevent token overflow
      // These were contributing 1000+ tokens to the prompt
      const ragConversations = ''; // Temporarily disabled
      const ragKnowledge = '';     // Temporarily disabled

      // Use minimal system prompt to save tokens
      let baseSystemPrompt = 'You are an AI assistant for dental recruitment matching.';

      // ========================================
      // OPTIMIZED PROMPT WITH PROFESSIONAL BATCHING
      // Keep context under 2800 tokens (1200 reserved for response)
      // ========================================

      // Build minimal context with HARD SIZE LIMITS
      let contextData = '';
      const MAX_CONTEXT_LENGTH = 2000; // Hard limit for context data

      if (contextMode === 'stats-only') {
        // For stats questions, only counts needed
        contextData = `Stats: C:${candidates.length} L:${clients.length} M:${totalMatches}`;
      } else if (compactCandidates.length > 0 || compactClients.length > 0 || compactMatches.length > 0) {
        // Build context with size awareness
        const dataParts = [];

        // Stringify and truncate if needed
        if (compactCandidates.length > 0) {
          const canStr = JSON.stringify(compactCandidates);
          if (canStr.length > 500) {
            dataParts.push(`C[${compactCandidates.length}]:${canStr.substring(0, 500)}...`);
          } else {
            dataParts.push(`C[${compactCandidates.length}]:${canStr}`);
          }
        }

        if (compactClients.length > 0) {
          const clStr = JSON.stringify(compactClients);
          if (clStr.length > 500) {
            dataParts.push(`L[${compactClients.length}]:${clStr.substring(0, 500)}...`);
          } else {
            dataParts.push(`L[${compactClients.length}]:${clStr}`);
          }
        }

        if (compactMatches.length > 0) {
          const mStr = JSON.stringify(compactMatches);
          if (mStr.length > 800) {
            dataParts.push(`M[${compactMatches.length}]:${mStr.substring(0, 800)}...`);
          } else {
            dataParts.push(`M[${compactMatches.length}]:${mStr}`);
          }
        }

        contextData = dataParts.join('\n');

        // Final truncation if still too long
        if (contextData.length > MAX_CONTEXT_LENGTH) {
          contextData = contextData.substring(0, MAX_CONTEXT_LENGTH) + '...';
        }
      } else {
        // For general chat, minimal info
        contextData = `User active`;
      }

      // DISABLED: All memory/RAG features to prevent token overflow
      const compactRagMemory = '';

      // Build system prompt with token awareness
      const systemPrompt = `${baseSystemPrompt}

Mode: ${contextMode}
${contextData}${questionType.isMap ? '\n⚠️Reply with plain text only (no JSON/MAP_ACTION)' : ''}${compactRagMemory ? `\n${compactRagMemory}` : ''}

Question: ${question}`;

      console.log(`📤 Calling RunPod vLLM at ${process.env.VPS_AI_URL}`);

      // AGGRESSIVE TOKEN LIMITING - Stay well under 4096 limit
      // Truncate system prompt if it's too long
      const MAX_PROMPT_LENGTH = 8000; // ~2000 tokens max for entire prompt

      let trimmedSystemPrompt = systemPrompt;
      if (systemPrompt.length > 6000) {
        // System prompt is too long, truncate the data portion
        trimmedSystemPrompt = `${baseSystemPrompt}\nMode: ${contextMode}\nLimited data due to length.\nQuestion: ${question}`;
      }

      // Build combined prompt with hard length limit
      let combinedPrompt = `${trimmedSystemPrompt}\n\n${question}`;

      // HARD LIMIT: Truncate if still too long
      if (combinedPrompt.length > MAX_PROMPT_LENGTH) {
        console.warn(`⚠️ CRITICAL: Prompt too long (${combinedPrompt.length} chars), truncating to ${MAX_PROMPT_LENGTH}`);
        combinedPrompt = combinedPrompt.substring(0, MAX_PROMPT_LENGTH) + '\n\n[Truncated due to length]';
      }

      const estimatedTokens = Math.ceil(combinedPrompt.length / 4);
      const MAX_TOKENS = 4096;
      const INPUT_RESERVED = 300; // Reserve for response
      const CLEANUP_THRESHOLD = 0.90; // 90% threshold - keeps more history
      const CLEANUP_PERCENT = 0.30; // Delete oldest 30%

      if (estimatedTokens > (MAX_TOKENS - INPUT_RESERVED) * CLEANUP_THRESHOLD) {
        console.log(`⚠️ Token usage at ${Math.round((estimatedTokens / (MAX_TOKENS - INPUT_RESERVED)) * 100)}% - triggering auto-cleanup`);

        // Delete oldest 30% of conversation turns
        const { data: oldestTurns } = await userClient
          .from('ai_conversation')
          .select('turn')
          .eq('user_id', user.id)
          .order('turn', { ascending: true })
          .limit(Math.ceil(fullConversationHistory.length * CLEANUP_PERCENT));

        if (oldestTurns && oldestTurns.length > 0) {
          const turnsToDelete = oldestTurns.map(t => t.turn);
          await userClient
            .from('ai_conversation')
            .delete()
            .eq('user_id', user.id)
            .in('turn', turnsToDelete);

          console.log(`🗑️ Auto-deleted oldest ${turnsToDelete.length} turns (${CLEANUP_PERCENT * 100}% of conversation)`);
        }
      }

      // Enhanced debugging to find token overflow source
      console.log(`📊 TOKEN DEBUG:`);
      console.log(`   Base prompt: ${baseSystemPrompt.length} chars`);
      console.log(`   Context data: ${contextData.length} chars`);
      console.log(`   System prompt total: ${systemPrompt.length} chars`);
      console.log(`   Combined prompt: ${combinedPrompt.length} chars (~${estimatedTokens} tokens)`);
      console.log(`   Data items - Candidates: ${compactCandidates.length}, Clients: ${compactClients.length}, Matches: ${compactMatches.length}`);
      console.log(`   Relevant items - Candidates: ${relevantCandidates.length}, Clients: ${relevantClients.length}, Matches: ${relevantMatches.length}`);
      console.log(`   Total DB items - Candidates: ${candidates.length}, Clients: ${clients.length}, Matches: ${matches.length}`);

      // Token limit safety check
      if (estimatedTokens > 3500) {
        console.warn(`⚠️ WARNING: Prompt is large (${estimatedTokens} tokens). Consider reducing data further.`);
      }

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
          max_tokens: 250, // Conservative token limit for Mistral 7B
          temperature: 0.7,
          stream: false
        }),
        signal: AbortSignal.timeout(60000) // 60 second timeout
      });

      if (!vllmResponse.ok) {
        const errorText = await vllmResponse.text();
        console.error(`❌ vLLM Error ${vllmResponse.status}:`, errorText);
        throw new Error(`vLLM API error (${vllmResponse.status}): ${errorText.substring(0, 200)}`);
      }

      const vllmData = await vllmResponse.json();
      let aiAnswer = vllmData.choices?.[0]?.message?.content || 'No response generated';

      console.log(`✅ Received response from RunPod vLLM (${aiAnswer.length} chars)`);
      console.log('📝 AI Response:', aiAnswer.substring(0, 500));

      // Clean up any malformed JSON artifacts (AI sometimes generates broken JSON)
      if (questionType.isMap) {
        // Remove any standalone curly braces or MAP_ACTION attempts
        aiAnswer = aiAnswer.replace(/^\s*\}\s*$/gm, ''); // Remove lines with just }
        aiAnswer = aiAnswer.replace(/^\s*\{\s*$/gm, ''); // Remove lines with just {
        aiAnswer = aiAnswer.replace(/MAP_ACTION:\s*\{[^}]*$/gm, ''); // Remove incomplete MAP_ACTION
        aiAnswer = aiAnswer.trim();
        console.log('🧹 Cleaned AI response of malformed JSON');
      }

      // ==========================================
      // AUTO-INJECT MAP_ACTION for map questions
      // ==========================================
      // Mistral 7B is too small to reliably generate complex JSON
      // So we detect map questions and inject MAP_ACTION automatically
      if (questionType.isMap && relevantMatches.length > 0) {
        console.log('🗺️ Map question detected - auto-injecting MAP_ACTION markers');
        console.log(`📊 Available matches: ${relevantMatches.length}`);

        // Get the BEST match only (user asked for "my best commute" singular)
        const bestMatch = relevantMatches[0]; // Already sorted by commute_minutes ascending

        if (bestMatch && bestMatch.candidate && bestMatch.client) {
          const canPostcode = bestMatch.candidate.postcode;
          const clPostcode = bestMatch.client.postcode;

          console.log(`🗺️ Best match: ${bestMatch.candidate_id} (${canPostcode}) → ${bestMatch.client_id} (${clPostcode}) = ${bestMatch.commute_minutes}m`);

          if (canPostcode && clPostcode) {
            const display = bestMatch.commute_display || `${bestMatch.commute_minutes}m`;
            const mapAction = `MAP_ACTION:{"action":"openMap","data":{"originPostcode":"${canPostcode}","destinationPostcode":"${clPostcode}","candidateName":"${bestMatch.candidate_id}","clientName":"${bestMatch.client_id}","commuteMinutes":${bestMatch.commute_minutes},"commuteDisplay":"${display}"}}`;

            // Inject MAP_ACTION at the START of the response
            aiAnswer = mapAction + '\n\n' + aiAnswer;
            console.log('✅ Injected MAP_ACTION marker successfully');
            console.log('MAP_ACTION:', mapAction);
          } else {
            console.warn('⚠️ Missing postcodes - cannot inject MAP_ACTION');
          }
        } else {
          console.warn('⚠️ No valid best match found');
        }
      }

      // Parse and execute any JSON actions in the AI response
      const actionResults: string[] = [];

      // Extract JSON actions from code blocks or inline
      let actionsToExecute: any[] = [];

      // Try to find JSON in code blocks first
      const codeBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
      const codeBlockMatches = aiAnswer.matchAll(codeBlockRegex);

      for (const match of codeBlockMatches) {
        try {
          // Remove escaped underscores and backslashes that AI sometimes adds
          const cleanJson = match[1].replace(/\\_/g, '_').replace(/\\\\/g, '\\');
          console.log('🔍 Found JSON code block:', cleanJson);
          const parsed = JSON.parse(cleanJson);
          if (parsed.action && parsed.data) {
            console.log('✅ Parsed action:', JSON.stringify(parsed));
            actionsToExecute.push(parsed);
          }
        } catch (e) {
          console.error('❌ Failed to parse code block JSON:', e);
          console.error('Raw JSON was:', match[1]);
        }
      }

      // Also try inline JSON (simpler regex for single-line)
      const inlineRegex = /\{\s*"action"\s*:\s*"([^"]+)"\s*,\s*"data"\s*:\s*\{[^}]*\}\s*\}/g;
      const inlineMatches = aiAnswer.matchAll(inlineRegex);

      for (const match of inlineMatches) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.action && parsed.data) {
            actionsToExecute.push(parsed);
          }
        } catch (e) {
          console.error('Failed to parse inline JSON:', e);
        }
      }

      if (actionsToExecute.length > 0) {
        console.log(`🔧 Found ${actionsToExecute.length} action(s) to execute`);

        for (const action of actionsToExecute) {
          try {
            console.log(`Executing action: ${action.action}`, JSON.stringify(action.data));

            switch (action.action) {
              case 'add_candidate': {
                const { data: existingCandidate } = await userClient
                  .from('candidates')
                  .select('id')
                  .eq('id', action.data.id)
                  .single();

                if (existingCandidate) {
                  actionResults.push(`⚠️ Candidate ${action.data.id} already exists`);
                } else {
                  const { error } = await userClient.from('candidates').insert({
                    ...action.data,
                    user_id: user.id,
                    added_at: new Date().toISOString(),
                  });
                  if (error) {
                    actionResults.push(`❌ Error adding candidate: ${error.message}`);
                  } else {
                    actionResults.push(`✅ Successfully added candidate ${action.data.id}`);
                  }
                }
                break;
              }

              case 'update_candidate': {
                const { id, ...updateData } = action.data;
                const { error } = await userClient
                  .from('candidates')
                  .update(updateData)
                  .eq('id', id);

                if (error) {
                  actionResults.push(`❌ Error updating candidate: ${error.message}`);
                } else {
                  actionResults.push(`✅ Updated candidate ${id}`);
                }
                break;
              }

              case 'delete_candidate': {
                const { error } = await userClient
                  .from('candidates')
                  .delete()
                  .eq('id', action.data.id);

                if (error) {
                  actionResults.push(`❌ Error deleting candidate: ${error.message}`);
                } else {
                  actionResults.push(`✅ Deleted candidate ${action.data.id}`);
                }
                break;
              }

              case 'add_client': {
                const { data: existingClient } = await userClient
                  .from('clients')
                  .select('id')
                  .eq('id', action.data.id)
                  .single();

                if (existingClient) {
                  actionResults.push(`⚠️ Client ${action.data.id} already exists`);
                } else {
                  const { error } = await userClient.from('clients').insert({
                    ...action.data,
                    user_id: user.id,
                    added_at: new Date().toISOString(),
                  });
                  if (error) {
                    actionResults.push(`❌ Error adding client: ${error.message}`);
                  } else {
                    actionResults.push(`✅ Successfully added client ${action.data.id}`);
                  }
                }
                break;
              }

              case 'update_client': {
                const { id, ...updateData } = action.data;
                const { error } = await userClient
                  .from('clients')
                  .update(updateData)
                  .eq('id', id);

                if (error) {
                  actionResults.push(`❌ Error updating client: ${error.message}`);
                } else {
                  actionResults.push(`✅ Updated client ${id}`);
                }
                break;
              }

              case 'delete_client': {
                const { error } = await userClient
                  .from('clients')
                  .delete()
                  .eq('id', action.data.id);

                if (error) {
                  actionResults.push(`❌ Error deleting client: ${error.message}`);
                } else {
                  actionResults.push(`✅ Deleted client ${action.data.id}`);
                }
                break;
              }

              case 'update_match_status': {
                const { error } = await userClient
                  .from('match_statuses')
                  .upsert({
                    candidate_id: action.data.candidate_id,
                    client_id: action.data.client_id,
                    status: action.data.status,
                    user_id: user.id,
                    updated_at: new Date().toISOString(),
                  });

                if (error) {
                  actionResults.push(`❌ Error updating match status: ${error.message}`);
                } else {
                  actionResults.push(`✅ Updated match status to '${action.data.status}'`);
                }
                break;
              }

              case 'add_match_note': {
                const { error } = await userClient
                  .from('match_notes')
                  .insert({
                    candidate_id: action.data.candidate_id,
                    client_id: action.data.client_id,
                    note_text: action.data.note,
                    user_id: user.id,
                    created_at: new Date().toISOString(),
                  });

                if (error) {
                  actionResults.push(`❌ Error adding note: ${error.message}`);
                } else {
                  actionResults.push(`✅ Added note to match`);
                }
                break;
              }

              case 'bulk_add_candidates': {
                const candidatesToAdd = action.data.candidates || [];
                let successCount = 0;
                let errorCount = 0;

                for (const candidate of candidatesToAdd) {
                  // Auto-generate ID if not provided
                  if (!candidate.id) {
                    const highestId = getHighestId(candidates, 'CAN');
                    const numPart = parseInt(highestId.substring(3), 10);
                    candidate.id = `CAN${String(numPart + successCount + 1).padStart(3, '0')}`;
                  }

                  const { error } = await userClient.from('candidates').insert({
                    ...candidate,
                    user_id: user.id,
                    added_at: new Date().toISOString(),
                  });

                  if (error) {
                    errorCount++;
                    console.error(`Error adding candidate ${candidate.id}:`, error.message);
                  } else {
                    successCount++;
                  }
                }

                actionResults.push(`✅ Bulk add: ${successCount} candidates added${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
                break;
              }

              case 'bulk_add_clients': {
                const clientsToAdd = action.data.clients || [];
                let successCount = 0;
                let errorCount = 0;

                for (const client of clientsToAdd) {
                  // Auto-generate ID if not provided
                  if (!client.id) {
                    const highestId = getHighestId(clients, 'CL');
                    const numPart = parseInt(highestId.substring(2), 10);
                    client.id = `CL${String(numPart + successCount + 1).padStart(3, '0')}`;
                  }

                  const { error } = await userClient.from('clients').insert({
                    ...client,
                    user_id: user.id,
                    added_at: new Date().toISOString(),
                  });

                  if (error) {
                    errorCount++;
                    console.error(`Error adding client ${client.id}:`, error.message);
                  } else {
                    successCount++;
                  }
                }

                actionResults.push(`✅ Bulk add: ${successCount} clients added${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
                break;
              }

              case 'bulk_delete_candidates': {
                const idsToDelete = action.data.ids || [];
                const { error } = await userClient
                  .from('candidates')
                  .delete()
                  .in('id', idsToDelete);

                if (error) {
                  actionResults.push(`❌ Error bulk deleting candidates: ${error.message}`);
                } else {
                  actionResults.push(`✅ Deleted ${idsToDelete.length} candidates: ${idsToDelete.join(', ')}`);
                }
                break;
              }

              case 'bulk_delete_clients': {
                const idsToDelete = action.data.ids || [];
                const { error } = await userClient
                  .from('clients')
                  .delete()
                  .in('id', idsToDelete);

                if (error) {
                  actionResults.push(`❌ Error bulk deleting clients: ${error.message}`);
                } else {
                  actionResults.push(`✅ Deleted ${idsToDelete.length} clients: ${idsToDelete.join(', ')}`);
                }
                break;
              }

              case 'bulk_add_chunked': {
                // Add candidates or clients in chunks to avoid overwhelming the database
                const { type, items, chunkSize = 50 } = action.data;
                const itemsToAdd = items || [];

                if (itemsToAdd.length === 0) {
                  actionResults.push('⚠️ No items provided for bulk add');
                  break;
                }

                const totalItems = itemsToAdd.length;
                const chunks = Math.ceil(totalItems / chunkSize);
                let totalSuccess = 0;
                let totalError = 0;

                actionResults.push(`🔄 Starting chunked bulk add: ${totalItems} items in ${chunks} chunk(s) of ${chunkSize}...`);

                for (let i = 0; i < chunks; i++) {
                  const start = i * chunkSize;
                  const end = Math.min(start + chunkSize, totalItems);
                  const chunk = itemsToAdd.slice(start, end);

                  let successCount = 0;
                  let errorCount = 0;

                  if (type === 'candidates') {
                    for (const item of chunk) {
                      // Auto-generate ID if not provided
                      if (!item.id) {
                        const highestId = getHighestId(candidates, 'CAN');
                        const numPart = parseInt(highestId.substring(3), 10);
                        item.id = `CAN${String(numPart + totalSuccess + successCount + 1).padStart(3, '0')}`;
                      }

                      const { error } = await userClient.from('candidates').insert({
                        ...item,
                        user_id: user.id,
                        added_at: new Date().toISOString(),
                      });

                      if (error) {
                        errorCount++;
                        console.error(`Error adding candidate ${item.id}:`, error.message);
                      } else {
                        successCount++;
                      }
                    }
                  } else if (type === 'clients') {
                    for (const item of chunk) {
                      // Auto-generate ID if not provided
                      if (!item.id) {
                        const highestId = getHighestId(clients, 'CL');
                        const numPart = parseInt(highestId.substring(2), 10);
                        item.id = `CL${String(numPart + totalSuccess + successCount + 1).padStart(3, '0')}`;
                      }

                      const { error } = await userClient.from('clients').insert({
                        ...item,
                        user_id: user.id,
                        added_at: new Date().toISOString(),
                      });

                      if (error) {
                        errorCount++;
                        console.error(`Error adding client ${item.id}:`, error.message);
                      } else {
                        successCount++;
                      }
                    }
                  }

                  totalSuccess += successCount;
                  totalError += errorCount;

                  actionResults.push(`  Chunk ${i + 1}/${chunks}: ✅ ${successCount} added${errorCount > 0 ? `, ❌ ${errorCount} failed` : ''}`);
                }

                actionResults.push(`✅ Chunked bulk add complete: ${totalSuccess}/${totalItems} ${type} added${totalError > 0 ? ` (${totalError} errors)` : ''}`);
                break;
              }

              case 'bulk_delete_chunked': {
                // Delete candidates or clients in chunks
                const { type, ids, chunkSize = 50 } = action.data;
                const idsToDelete = ids || [];

                if (idsToDelete.length === 0) {
                  actionResults.push('⚠️ No IDs provided for bulk delete');
                  break;
                }

                const totalIds = idsToDelete.length;
                const chunks = Math.ceil(totalIds / chunkSize);
                let totalDeleted = 0;

                actionResults.push(`🔄 Starting chunked bulk delete: ${totalIds} items in ${chunks} chunk(s) of ${chunkSize}...`);

                const tableName = type === 'candidates' ? 'candidates' : 'clients';

                for (let i = 0; i < chunks; i++) {
                  const start = i * chunkSize;
                  const end = Math.min(start + chunkSize, totalIds);
                  const chunk = idsToDelete.slice(start, end);

                  const { error, count } = await userClient
                    .from(tableName)
                    .delete()
                    .in('id', chunk);

                  if (error) {
                    actionResults.push(`  Chunk ${i + 1}/${chunks}: ❌ Error - ${error.message}`);
                  } else {
                    const deleted = count || chunk.length;
                    totalDeleted += deleted;
                    actionResults.push(`  Chunk ${i + 1}/${chunks}: ✅ Deleted ${deleted} ${type}`);
                  }
                }

                actionResults.push(`✅ Chunked bulk delete complete: ${totalDeleted}/${totalIds} ${type} deleted`);
                break;
              }

              case 'parse_and_organize': {
                // Smart parsing for unorganized mixed data
                const { type, text } = action.data;
                const parsed: any[] = [];

                // Simple parser - extracts common patterns
                // This can be enhanced with more sophisticated NLP
                const lines = text.split('\n').filter((line: string) => line.trim());

                if (type === 'candidates') {
                  // Parse candidate data - look for patterns
                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const candidate: any = {};

                    // Extract name (first words before role/postcode)
                    const nameMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
                    if (nameMatch) {
                      const fullName = nameMatch[1].trim().split(' ');
                      candidate.first_name = fullName[0];
                      if (fullName.length > 1) candidate.last_name = fullName.slice(1).join(' ');
                    }

                    // Extract phone (UK format)
                    const phoneMatch = line.match(/0\d{9,10}/);
                    if (phoneMatch) candidate.phone = phoneMatch[0];

                    // Extract postcode (UK format)
                    const postcodeMatch = line.match(/\b[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}\b/i);
                    if (postcodeMatch) candidate.postcode = postcodeMatch[0].toUpperCase();

                    // Extract role (common dental roles)
                    const roleMatch = line.match(/\b(Dental Nurse|Dentist|Receptionist|Hygienist|Treatment Coordinator|Practice Manager|Trainee)\b/i);
                    if (roleMatch) candidate.role = roleMatch[0];

                    // Extract salary
                    const salaryMatch = line.match(/£\d+(?:-£?\d+)?/);
                    if (salaryMatch) candidate.salary = salaryMatch[0];

                    // Extract days
                    const daysMatch = line.match(/\b(Mon-Fri|Mon-Wed|Thu-Fri|Mon|Tue|Wed|Thu|Fri|Full-time|Part-time)\b/i);
                    if (daysMatch) candidate.days = daysMatch[0];

                    // Only add if we have at least a name or phone
                    if (candidate.first_name || candidate.phone) {
                      // Auto-generate ID
                      const highestId = getHighestId(candidates, 'CAN');
                      const numPart = parseInt(highestId.substring(3), 10);
                      candidate.id = `CAN${String(numPart + parsed.length + 1).padStart(3, '0')}`;

                      parsed.push(candidate);
                    }
                  }

                  // Bulk insert parsed candidates
                  let successCount = 0;
                  for (const candidate of parsed) {
                    const { error } = await userClient.from('candidates').insert({
                      ...candidate,
                      user_id: user.id,
                      added_at: new Date().toISOString(),
                    });
                    if (!error) successCount++;
                  }

                  actionResults.push(`🧠 Smart Parse: Extracted and added ${successCount} candidates from unorganized text`);

                } else if (type === 'clients') {
                  // Parse client data
                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const client: any = {};

                    // Extract surgery name (first part before role/postcode)
                    const surgeryMatch = line.match(/^([A-Za-z\s&]+(?:Dental|Surgery|Clinic|Practice))/i);
                    if (surgeryMatch) client.surgery = surgeryMatch[1].trim();

                    // Extract phone
                    const phoneMatch = line.match(/0\d{9,10}/);
                    if (phoneMatch) client.client_phone = phoneMatch[0];

                    // Extract postcode
                    const postcodeMatch = line.match(/\b[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}\b/i);
                    if (postcodeMatch) client.postcode = postcodeMatch[0].toUpperCase();

                    // Extract role
                    const roleMatch = line.match(/\b(Dental Nurse|Dentist|Receptionist|Hygienist|Treatment Coordinator|Practice Manager|Trainee)\b/i);
                    if (roleMatch) client.role = roleMatch[0];

                    // Extract budget
                    const budgetMatch = line.match(/£\d+(?:-£?\d+)?/);
                    if (budgetMatch) client.budget = budgetMatch[0];

                    // Only add if we have at least surgery name or phone
                    if (client.surgery || client.client_phone) {
                      // Auto-generate ID
                      const highestId = getHighestId(clients, 'CL');
                      const numPart = parseInt(highestId.substring(2), 10);
                      client.id = `CL${String(numPart + parsed.length + 1).padStart(3, '0')}`;

                      parsed.push(client);
                    }
                  }

                  // Bulk insert parsed clients
                  let successCount = 0;
                  for (const client of parsed) {
                    const { error } = await userClient.from('clients').insert({
                      ...client,
                      user_id: user.id,
                      added_at: new Date().toISOString(),
                    });
                    if (!error) successCount++;
                  }

                  actionResults.push(`🧠 Smart Parse: Extracted and added ${successCount} clients from unorganized text`);
                }

                break;
              }

              case 'ban_match': {
                // Ban a specific match (prevent it from appearing in matches view)
                const { candidate_id, client_id } = action.data;

                const { error } = await userClient
                  .from('matches')
                  .update({ banned: true })
                  .eq('candidate_id', candidate_id)
                  .eq('client_id', client_id)
                  .eq('user_id', user.id);

                if (error) {
                  actionResults.push(`❌ Error banning match: ${error.message}`);
                } else {
                  actionResults.push(`✅ Banned match: ${candidate_id} ↔ ${client_id}`);
                }
                break;
              }

              case 'unban_match': {
                // Unban a previously banned match
                const { candidate_id, client_id } = action.data;

                const { error } = await userClient
                  .from('matches')
                  .update({ banned: false })
                  .eq('candidate_id', candidate_id)
                  .eq('client_id', client_id)
                  .eq('user_id', user.id);

                if (error) {
                  actionResults.push(`❌ Error unbanning match: ${error.message}`);
                } else {
                  actionResults.push(`✅ Unbanned match: ${candidate_id} ↔ ${client_id}`);
                }
                break;
              }

              case 'bulk_ban_matches': {
                // Ban multiple matches at once
                const { matches: matchesToBan } = action.data;
                let successCount = 0;
                let errorCount = 0;

                for (const match of matchesToBan) {
                  const { error } = await userClient
                    .from('matches')
                    .update({ banned: true })
                    .eq('candidate_id', match.candidate_id)
                    .eq('client_id', match.client_id)
                    .eq('user_id', user.id);

                  if (error) {
                    errorCount++;
                    console.error(`Error banning match ${match.candidate_id} ↔ ${match.client_id}:`, error.message);
                  } else {
                    successCount++;
                  }
                }

                actionResults.push(`✅ Bulk ban: ${successCount} matches banned${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
                break;
              }

              case 'regenerate_matches': {
                // Trigger match regeneration (full or incremental)
                const { mode = 'incremental' } = action.data;

                try {
                  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '') || 'localhost:3000';
                  const protocol = baseUrl.includes('localhost') ? 'http' : 'https';
                  const regenerateUrl = `${protocol}://${baseUrl}/api/regenerate-working?force=${mode === 'full' ? 'true' : 'false'}`;

                  const response = await fetch(regenerateUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });

                  if (response.ok) {
                    const result = await response.json();
                    actionResults.push(`✅ Match regeneration started (${mode} mode)`);
                  } else {
                    actionResults.push(`❌ Error starting match regeneration: ${response.status}`);
                  }
                } catch (error: any) {
                  actionResults.push(`❌ Error triggering regeneration: ${error.message}`);
                }
                break;
              }

              case 'get_statistics': {
                // Provide detailed statistics about recruitment data
                const stats: any = {
                  total_candidates: candidates.length,
                  total_clients: clients.length,
                  total_matches: matches.length,
                  banned_matches: matches.filter(m => m.banned).length,
                  active_matches: matches.filter(m => !m.banned).length,
                  role_matches: matches.filter(m => m.role_match && !m.banned).length,
                  location_only_matches: matches.filter(m => !m.role_match && !m.banned).length,
                };

                // Calculate candidate statistics
                const candidatesByRole: Record<string, number> = {};
                candidates.forEach(c => {
                  const role = c.role || 'Unknown';
                  candidatesByRole[role] = (candidatesByRole[role] || 0) + 1;
                });
                stats.candidates_by_role = candidatesByRole;

                // Calculate client statistics
                const clientsByRole: Record<string, number> = {};
                clients.forEach(c => {
                  const role = c.role || 'Unknown';
                  clientsByRole[role] = (clientsByRole[role] || 0) + 1;
                });
                stats.clients_by_role = clientsByRole;

                // Calculate commute time statistics
                const activeMatches = matches.filter(m => !m.banned);
                if (activeMatches.length > 0) {
                  const commuteTimes = activeMatches.map(m => m.commute_minutes || 0);
                  stats.avg_commute_minutes = Math.round(commuteTimes.reduce((a, b) => a + b, 0) / commuteTimes.length);
                  stats.min_commute_minutes = Math.min(...commuteTimes);
                  stats.max_commute_minutes = Math.max(...commuteTimes);

                  // Count by time bands
                  stats.matches_under_20min = activeMatches.filter(m => (m.commute_minutes || 0) <= 20).length;
                  stats.matches_20_40min = activeMatches.filter(m => (m.commute_minutes || 0) > 20 && (m.commute_minutes || 0) <= 40).length;
                  stats.matches_40_60min = activeMatches.filter(m => (m.commute_minutes || 0) > 40 && (m.commute_minutes || 0) <= 60).length;
                  stats.matches_60_80min = activeMatches.filter(m => (m.commute_minutes || 0) > 60 && (m.commute_minutes || 0) <= 80).length;
                }

                actionResults.push(`📊 **Statistics Summary:**\n${JSON.stringify(stats, null, 2)}`);
                break;
              }

              case 'list_banned_matches': {
                // List all banned matches for the user
                const { data: bannedMatches, error } = await userClient
                  .from('matches')
                  .select('candidate_id, client_id, commute_minutes, commute_display, role_match')
                  .eq('user_id', user.id)
                  .eq('banned', true)
                  .order('candidate_id', { ascending: true });

                if (error) {
                  actionResults.push(`❌ Error listing banned matches: ${error.message}`);
                } else {
                  const count = bannedMatches?.length || 0;
                  if (count === 0) {
                    actionResults.push(`ℹ️ No banned matches found.`);
                  } else {
                    const matchList = bannedMatches!.map(m =>
                      `${m.candidate_id} ↔ ${m.client_id} (${m.commute_display || m.commute_minutes + 'm'})`
                    ).join(', ');
                    actionResults.push(`🚫 Found ${count} banned match${count > 1 ? 'es' : ''}: ${matchList}`);
                  }
                }
                break;
              }

              case 'export_candidates': {
                // Export candidates as CSV-formatted text
                const { format = 'csv' } = action.data;
                const candidatesToExport = candidates.slice(0, 100); // Limit to 100 for token safety

                if (format === 'csv') {
                  const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Postcode', 'Salary', 'Days'];
                  const rows = candidatesToExport.map(c => [
                    c.id,
                    c.first_name || '',
                    c.last_name || '',
                    c.email || '',
                    c.phone || '',
                    c.role || '',
                    c.postcode || '',
                    c.salary || '',
                    c.days || ''
                  ]);

                  const csvText = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                  actionResults.push(`📄 Exported ${candidatesToExport.length} candidates as CSV:\n\`\`\`csv\n${csvText.substring(0, 500)}...\n\`\`\``);
                }
                break;
              }

              case 'export_clients': {
                // Export clients as CSV-formatted text
                const { format = 'csv' } = action.data;
                const clientsToExport = clients.slice(0, 100); // Limit to 100 for token safety

                if (format === 'csv') {
                  const headers = ['ID', 'Surgery', 'Role', 'Postcode', 'Budget', 'Days'];
                  const rows = clientsToExport.map(c => [
                    c.id,
                    c.surgery || '',
                    c.role || '',
                    c.postcode || '',
                    c.budget || '',
                    c.days || ''
                  ]);

                  const csvText = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                  actionResults.push(`📄 Exported ${clientsToExport.length} clients as CSV:\n\`\`\`csv\n${csvText.substring(0, 500)}...\n\`\`\``);
                }
                break;
              }

              case 'export_matches': {
                // Export matches as CSV-formatted text
                const { format = 'csv', include_banned = false } = action.data;
                const matchesToExport = matches
                  .filter(m => include_banned || !m.banned)
                  .slice(0, 100); // Limit to 100 for token safety

                if (format === 'csv') {
                  const headers = ['Candidate ID', 'Client ID', 'Commute (min)', 'Role Match', 'Status', 'Banned'];
                  const rows = matchesToExport.map(m => [
                    m.candidate_id,
                    m.client_id,
                    m.commute_minutes,
                    m.role_match ? 'Yes' : 'No',
                    matchStatuses.find(s => s.candidate_id === m.candidate_id && s.client_id === m.client_id)?.status || '',
                    m.banned ? 'Yes' : 'No'
                  ]);

                  const csvText = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                  actionResults.push(`📄 Exported ${matchesToExport.length} matches as CSV:\n\`\`\`csv\n${csvText.substring(0, 500)}...\n\`\`\``);
                }
                break;
              }

              case 'search_candidates': {
                // Search candidates by query string
                const { query } = action.data;
                const searchTerm = query.toLowerCase();

                const results = candidates.filter(c =>
                  (c.first_name?.toLowerCase().includes(searchTerm)) ||
                  (c.last_name?.toLowerCase().includes(searchTerm)) ||
                  (c.email?.toLowerCase().includes(searchTerm)) ||
                  (c.phone?.includes(searchTerm)) ||
                  (c.role?.toLowerCase().includes(searchTerm)) ||
                  (c.postcode?.toLowerCase().includes(searchTerm)) ||
                  (c.id?.toLowerCase().includes(searchTerm))
                ).slice(0, 20); // Limit results

                if (results.length === 0) {
                  actionResults.push(`🔍 No candidates found matching "${query}"`);
                } else {
                  const resultList = results.map(c =>
                    `${c.id}: ${c.first_name || ''} ${c.last_name || ''} (${c.role || 'N/A'})`
                  ).join(', ');
                  actionResults.push(`🔍 Found ${results.length} candidate${results.length > 1 ? 's' : ''}: ${resultList}`);
                }
                break;
              }

              case 'search_clients': {
                // Search clients by query string
                const { query } = action.data;
                const searchTerm = query.toLowerCase();

                const results = clients.filter(c =>
                  (c.surgery?.toLowerCase().includes(searchTerm)) ||
                  (c.role?.toLowerCase().includes(searchTerm)) ||
                  (c.postcode?.toLowerCase().includes(searchTerm)) ||
                  (c.id?.toLowerCase().includes(searchTerm))
                ).slice(0, 20); // Limit results

                if (results.length === 0) {
                  actionResults.push(`🔍 No clients found matching "${query}"`);
                } else {
                  const resultList = results.map(c =>
                    `${c.id}: ${c.surgery || 'N/A'} (${c.role || 'N/A'})`
                  ).join(', ');
                  actionResults.push(`🔍 Found ${results.length} client${results.length > 1 ? 's' : ''}: ${resultList}`);
                }
                break;
              }

              default:
                console.warn(`Unknown action: ${action.action}`);
            }
          } catch (parseError) {
            console.error('Error parsing/executing action:', parseError);
          }
        }

        // Remove JSON code blocks from the answer and append results
        aiAnswer = aiAnswer.replace(/```json\s*[\s\S]*?\s*```/g, '').trim();
        if (actionResults.length > 0) {
          aiAnswer += '\n\n' + actionResults.join('\n');
        }
      }

      return {
        answer: aiAnswer,
        currentSessionId,
        conversationHistory: [], // RAG handles context now - no need for recent turns
        turnCount, // For fact extraction
        totalMatches,
        totalCandidates: candidates.length, // For stats
        totalClients: clients.length, // For stats
        candidates,
        clients,
        enrichedMatches,
        matchNotes,
        placedMatches,
        inProgressMatches,
        rejectedMatches,
        actionsExecuted: actionResults.length,
        optimization: {
          processingTime: Date.now() - startTime,
          contextOptimization: true,
          memorySystem: true,
          summaryActive: !!existingSummary,
          factsStored: Object.keys(userFacts).length,
          recentTurns: fullConversationHistory.length,
          model: 'mistral-7b-instruct-vllm',
          infrastructure: 'RunPod RTX 4090'
        }
      };
    });

    const {
      answer,
      currentSessionId,
      conversationHistory,
      turnCount,
      totalMatches,
      totalCandidates,
      totalClients,
      optimization
    } = aiResponse;

    // Save conversation to storage
    await conversationStorage.saveMessage(user.id, currentSessionId, question, answer);

    // RAG SYSTEM - Store conversation as embedding for future retrieval (async, don't await)
    const newTurnNumber = turnCount + 1;
    storeConversationEmbedding(user.id, currentSessionId, newTurnNumber, question, answer)
      .catch(err => console.error('Error storing RAG embedding:', err));

    // MEMORY SYSTEM - Extract and save facts from this turn
    const factsFromTurn = await extractFacts(question, answer, newTurnNumber);
    for (const fact of factsFromTurn) {
      await updateFact(user.id, currentSessionId, fact.fact_key, fact.fact_value, fact.source_turn);
    }

    return NextResponse.json({
      success: true,
      question,
      answer,
      sessionId: currentSessionId,
      contextInfo: {
        conversationHistory: conversationHistory.length,
        totalCandidates: totalCandidates,
        totalClients: totalClients,
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
      // Show the actual vLLM error in details
      errorDetails = error.message || 'RunPod vLLM server returned an error. Please check server logs.';
      statusCode = 503;
    } else if (error.message?.toLowerCase().includes('timeout')) {
      errorMessage = 'Request Timeout';
      errorDetails = 'GPU server took too long to respond. Please try again.';
      statusCode = 504;
    } else if (error.message?.toLowerCase().includes('fetch')) {
      errorMessage = 'Connection Error';
      errorDetails = `Cannot connect to RunPod server: ${error.message}`;
      statusCode = 503;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
        queueStats: globalAIQueue.getStats(),
        timestamp: new Date().toISOString(),
        debugInfo: {
          errorType: error.constructor.name,
          errorMessage: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
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
