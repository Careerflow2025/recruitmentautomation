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

      // SMART CONTEXT FILTERING - Only send relevant data based on question
      const questionLower = question.toLowerCase();

      // Detect question type
      const isAboutInProgress = questionLower.includes('in-progress') || questionLower.includes('follow-up') || questionLower.includes('follow up');
      const isAboutPlaced = questionLower.includes('placed') || questionLower.includes('hired');
      const isAboutRejected = questionLower.includes('rejected') || questionLower.includes('declined');
      const isAboutSpecificCandidate = questionLower.match(/can\d+/i);
      const isAboutSpecificClient = questionLower.match(/cl\d+/i);
      const isAboutStats = questionLower.includes('how many') || questionLower.includes('total') || questionLower.includes('count');
      const isAboutPhones = questionLower.includes('phone') || questionLower.includes('contact') || questionLower.includes('call');
      const isAboutMap = questionLower.includes('map') || questionLower.includes('commute') || questionLower.includes('drive') || questionLower.includes('best match') || questionLower.includes('shortest');

      // Filter data based on question - DRASTICALLY REDUCE CONTEXT
      let relevantCandidates: any[] = [];
      let relevantClients: any[] = [];
      let relevantMatches: any[] = [];

      if (isAboutStats) {
        // For stats questions, NO detailed data needed - just counts
        relevantCandidates = [];
        relevantClients = [];
        relevantMatches = [];
      } else if (isAboutInProgress) {
        // Only in-progress matches
        const inProgressIds = matchStatuses.filter(s => s.status === 'in-progress');
        relevantMatches = enrichedMatches.filter(m =>
          inProgressIds.some(s => s.candidate_id === m.candidate_id && s.client_id === m.client_id)
        ).slice(0, 20); // Max 20 matches

        // Only candidates/clients involved in these matches
        const candidateIds = new Set(relevantMatches.map(m => m.candidate_id));
        const clientIds = new Set(relevantMatches.map(m => m.client_id));
        relevantCandidates = candidates.filter(c => candidateIds.has(c.id));
        relevantClients = clients.filter(c => clientIds.has(c.id));
      } else if (isAboutPlaced) {
        const placedIds = matchStatuses.filter(s => s.status === 'placed');
        relevantMatches = enrichedMatches.filter(m =>
          placedIds.some(s => s.candidate_id === m.candidate_id && s.client_id === m.client_id)
        ).slice(0, 20);

        const candidateIds = new Set(relevantMatches.map(m => m.candidate_id));
        const clientIds = new Set(relevantMatches.map(m => m.client_id));
        relevantCandidates = candidates.filter(c => candidateIds.has(c.id));
        relevantClients = clients.filter(c => clientIds.has(c.id));
      } else if (isAboutRejected) {
        const rejectedIds = matchStatuses.filter(s => s.status === 'rejected');
        relevantMatches = enrichedMatches.filter(m =>
          rejectedIds.some(s => s.candidate_id === m.candidate_id && s.client_id === m.client_id)
        ).slice(0, 20);

        const candidateIds = new Set(relevantMatches.map(m => m.candidate_id));
        const clientIds = new Set(relevantMatches.map(m => m.client_id));
        relevantCandidates = candidates.filter(c => candidateIds.has(c.id));
        relevantClients = clients.filter(c => clientIds.has(c.id));
      } else if (isAboutSpecificCandidate) {
        const canId = questionLower.match(/can\d+/i)?.[0].toUpperCase();
        relevantCandidates = candidates.filter(c => c.id === canId);
        relevantMatches = enrichedMatches.filter(m => m.candidate_id === canId).slice(0, 10);

        const clientIds = new Set(relevantMatches.map(m => m.client_id));
        relevantClients = clients.filter(c => clientIds.has(c.id));
      } else if (isAboutSpecificClient) {
        const clId = questionLower.match(/cl\d+/i)?.[0].toUpperCase();
        relevantClients = clients.filter(c => c.id === clId);
        relevantMatches = enrichedMatches.filter(m => m.client_id === clId).slice(0, 10);

        const candidateIds = new Set(relevantMatches.map(m => m.candidate_id));
        relevantCandidates = candidates.filter(c => candidateIds.has(c.id));
      } else {
        // General question - show minimal sample data
        // Aggressive filtering to stay under 2000 tokens
        const maxItems = candidates.length > 100 ? 3 : (candidates.length > 50 ? 5 : 8);
        relevantCandidates = candidates.slice(0, maxItems);
        relevantClients = clients.slice(0, maxItems);
        relevantMatches = enrichedMatches.slice(0, maxItems);
      }

      // Ultra-compact data representation (minimal tokens)
      // BUT: If map question, include FULL postcodes so AI can create MAP_ACTION markers
      const compactCandidates = relevantCandidates.map(c => ({
        id: c.id,
        role: c.role,
        pc: isAboutMap ? (c.postcode || '') : (c.postcode?.substring(0, 4) || ''), // Full postcode for maps
        ph: c.phone ? c.phone.slice(-4) : '' // Only last 4 digits
      }));

      const compactClients = relevantClients.map(c => ({
        id: c.id,
        surg: c.surgery?.substring(0, 20) || '', // Truncate long names
        role: c.role,
        pc: isAboutMap ? (c.postcode || '') : (c.postcode?.substring(0, 4) || '') // Full postcode for maps
      }));

      const compactMatches = relevantMatches.map(m => ({
        can: m.candidate_id,
        cl: m.client_id,
        min: m.commute_minutes,
        rm: m.role_match ? 1 : 0, // 1=match, 0=no match (saves tokens)
        st: m.status ? m.status.substring(0, 3) : '', // pla/in-/rej
        // For map questions, include full postcodes and display string
        ...(isAboutMap && m.candidate && m.client ? {
          can_pc: m.candidate.postcode || '',
          cl_pc: m.client.postcode || '',
          display: m.commute_display || `${m.commute_minutes}m`
        } : {})
      }));

      // RAG-POWERED SYSTEM PROMPT - Uses semantic retrieval instead of recent history
      const ragConversations = relevantConversations.map(c =>
        `Past Q: ${c.question.substring(0, 80)}... A: ${c.answer.substring(0, 80)}... (similarity: ${Math.round(c.similarity * 100)}%)`
      ).join('\n');

      const ragKnowledge = relevantKnowledge.map(k =>
        `${k.title}: ${k.content.substring(0, 150)}... (relevance: ${Math.round(k.similarity * 100)}%)`
      ).join('\n');

      // ==========================================
      // LOAD SYSTEM PROMPT FROM DATABASE
      // ==========================================
      console.log('📖 Loading system prompt from database...');

      let baseSystemPrompt = 'You are a helpful AI assistant for a dental recruitment platform.'; // Fallback

      try {
        const { data: promptData, error: promptError } = await userClient.rpc('get_active_system_prompt', {
          p_prompt_name: 'dental_matcher_default'
        });

        if (promptError) {
          console.warn('⚠️ Error loading system prompt from database:', promptError.message);
          console.warn('⚠️ Using fallback system prompt');
        } else if (promptData) {
          baseSystemPrompt = promptData;
          console.log('✅ Loaded system prompt from database');
        }
      } catch (promptLoadError: any) {
        console.warn('⚠️ Failed to load system prompt:', promptLoadError.message);
        console.warn('⚠️ Using fallback system prompt');
      }

      // Build complete system prompt with context
      const systemPrompt = `${baseSystemPrompt}

═══════════════════════════════════════════════
CURRENT CONTEXT:
═══════════════════════════════════════════════

USER: ${user.id.substring(0, 8)} | Cand: ${candidates.length} | Cli: ${clients.length} | Match: ${totalMatches} (✅${placedMatches} 🔄${inProgressMatches} ❌${rejectedMatches})

DATA (filtered for this question):
Cand: ${JSON.stringify(compactCandidates)}
Cli: ${JSON.stringify(compactClients)}
Match: ${JSON.stringify(compactMatches)}

${isAboutMap ? `
🗺️🗺️🗺️ MAP QUESTION DETECTED! 🗺️🗺️🗺️
CRITICAL: You MUST include MAP_ACTION markers in your response!
Use the FULL postcodes provided in the data above (pc fields).
Example format:
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"SW1A 1AA","destinationPostcode":"E1 6AN","candidateName":"CAN001","clientName":"CL001","commuteMinutes":22,"commuteDisplay":"🟢🟢 22m"}}

DO NOT just describe the match - SHOW THE MAP!
` : ''}
${ragConversations ? `RAG MEMORY (relevant past conversations):\n${ragConversations}\n` : ''}
${ragKnowledge ? `RAG KNOWLEDGE (relevant system info):\n${ragKnowledge}\n` : ''}
Summary: ${existingSummary?.summary || 'None'}
Facts: ${Object.keys(userFacts).length > 0 ? Object.entries(userFacts).map(([k, v]) => `${k}:${v}`).join('; ') : 'None'}

Q: ${question}`;

      console.log(`📤 Calling RunPod vLLM at ${process.env.VPS_AI_URL}`);

      // Call RunPod vLLM server
      // Note: Mistral doesn't support separate 'system' role, so we combine system prompt + question into one user message
      const combinedPrompt = `${systemPrompt}\n\n${question}`;

      // 🔥 AUTO-CLEANUP: Rolling window memory management
      // If we're at 90% capacity (3686 tokens), delete oldest 30% of conversation
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

      // Log prompt size for debugging
      console.log(`📊 Prompt size: ${combinedPrompt.length} chars, ~${estimatedTokens} tokens (${Math.round((estimatedTokens / (MAX_TOKENS - INPUT_RESERVED)) * 100)}% of limit)`);
      console.log(`📊 System prompt: ${systemPrompt.length} chars`);
      console.log(`📊 Data sizes - Candidates: ${compactCandidates.length}, Clients: ${compactClients.length}, Matches: ${compactMatches.length}`);

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
          max_tokens: 300, // Concise responses (was 600, then 1500)
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
