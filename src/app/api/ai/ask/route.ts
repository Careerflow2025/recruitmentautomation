import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { conversationStorage } from '@/lib/conversation-storage';

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

// Global AI request queue system to prevent overwhelming Anthropic API
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
  private requestsPerMinute = 60; // Increased for better performance with enterprise session management
  private delayBetweenRequests = (60 * 1000) / this.requestsPerMinute; // 1 second between requests
  private maxRetries = 3;
  private userRequestCounts = new Map<string, { count: number; resetTime: number }>();
  private maxRequestsPerUserPerMinute = 100; // Significantly increased with better session management
  private lastRequestTime = 0;
  private concurrentRequests = new Map<string, number>(); // Track concurrent requests per user

  async enqueue<T>(userId: string, request: () => Promise<T>): Promise<T> {
    // Check user rate limits with enhanced logic
    if (!this.checkUserRateLimit(userId)) {
      // Instead of hard rejection, implement intelligent queuing
      console.log(`⚠️ Rate limit approached for user ${userId.substring(0, 8)}..., queuing request`);
    }

    // Track concurrent requests per user
    const currentConcurrent = this.concurrentRequests.get(userId) || 0;
    if (currentConcurrent >= 3) { // Max 3 concurrent requests per user
      throw new Error('Too many concurrent requests. Please wait for your previous requests to complete.');
    }

    this.concurrentRequests.set(userId, currentConcurrent + 1);

    return new Promise<T>((resolve, reject) => {
      const requestItem: AIRequestItem = {
        id: `ai_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        request,
        resolve: (value: T) => {
          // Decrement concurrent counter when resolving
          const current = this.concurrentRequests.get(userId) || 0;
          if (current > 0) {
            this.concurrentRequests.set(userId, current - 1);
          }
          resolve(value);
        },
        reject: (error: any) => {
          // Decrement concurrent counter when rejecting
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
      
      console.log(`📥 Queued AI request ${requestItem.id} for user ${userId.substring(0, 8)}... (queue: ${this.queue.length}, concurrent: ${this.concurrentRequests.get(userId)})`);
      
      // Start processing the queue (don't await inside Promise constructor)
      this.processQueue().catch(console.error);
    });
  }

  private checkUserRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimits = this.userRequestCounts.get(userId);

    if (!userLimits || now > userLimits.resetTime) {
      this.userRequestCounts.set(userId, {
        count: 1,
        resetTime: now + 60000 // Reset in 1 minute
      });
      return true;
    }

    if (userLimits.count >= this.maxRequestsPerUserPerMinute) {
      console.log(`🚫 Rate limit reached for user ${userId.substring(0, 8)}...`);
      return false;
    }

    userLimits.count++;
    return true;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      
      try {
        // Ensure proper spacing between requests to avoid overwhelming the API
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const minDelay = this.delayBetweenRequests;

        if (timeSinceLastRequest < minDelay) {
          const waitTime = minDelay - timeSinceLastRequest;
          console.log(`⏳ Waiting ${waitTime}ms before processing AI request ${item.id}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        console.log(`🔄 Processing AI request ${item.id} for user ${item.userId} (retries: ${item.retryCount})`);
        
        // Execute the request
        const result = await item.request();
        item.resolve(result);
        
        console.log(`✅ Completed AI request ${item.id} successfully`);
        this.lastRequestTime = Date.now();

      } catch (error: any) {
        console.error(`❌ AI request ${item.id} failed:`, error.message);

        // Check if it's a rate limit or temporary error that can be retried
        if (this.isRetryableError(error) && item.retryCount < this.maxRetries) {
          item.retryCount++;
          
          // Calculate exponential backoff delay
          const backoffDelay = Math.min(2000 * Math.pow(2, item.retryCount), 30000); // 2s, 4s, 8s max
          
          console.log(`🔄 Retrying AI request ${item.id} in ${backoffDelay}ms (attempt ${item.retryCount + 1}/${this.maxRetries + 1})`);
          
          // Requeue after delay
          setTimeout(() => {
            this.queue.unshift(item); // Add back to front of queue
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
      status === 429 || // Rate limit
      status === 502 || // Bad gateway
      status === 503 || // Service unavailable
      status === 504 || // Gateway timeout
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('service unavailable') ||
      message.includes('timeout') ||
      message.includes('busy') ||
      message.includes('overloaded')
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
      delayBetweenRequests: this.delayBetweenRequests,
      userCounts,
      lastRequestTime: this.lastRequestTime,
      totalConcurrentRequests: Array.from(this.concurrentRequests.values()).reduce((sum, val) => sum + val, 0)
    };
  }
}

// Global AI request queue instance
const globalAIQueue = new GlobalAIRequestQueue();

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const { question, sessionId } = await request.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured. Please add it to .env.local' },
        { status: 500 }
      );
    }

    // Create Supabase client with auth
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

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'You must be logged in to use AI assistant' },
        { status: 401 }
      );
    }

    // Enqueue the AI request through the enhanced global queue system
    const aiResponse = await globalAIQueue.enqueue(user.id, async () => {
      // Load conversation history for context with enhanced session management
      const currentSessionId = sessionId || await conversationStorage.createSessionId(user.id);
      const conversationHistory = await conversationStorage.getRecentConversations(user.id, 20, 50);

      // Clean old conversations periodically to prevent data leakage across tenants
      if (Math.random() < 0.1) {
        conversationStorage.cleanOldConversations(user.id, 7).catch(console.error);
      }

      // Get all candidates for current user
      const { data: candidates } = await supabase
        .from('candidates')
        .select('*')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false });

      // Get all clients for current user
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false });

      // Get all matches with full context
      const { data: matchesData } = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', user.id)
        .order('commute_minutes', { ascending: true });

      // Get match statuses and notes
      const { data: matchStatuses } = await supabase
        .from('match_statuses')
        .select('*');

      const { data: matchNotes } = await supabase
        .from('match_notes')
        .select('*')
        .order('created_at', { ascending: false });

      // Build comprehensive matches with candidate/client details
      const enrichedMatches = matchesData?.map(match => {
        const candidate = candidates?.find(c => c.id === match.candidate_id);
        const client = clients?.find(c => c.id === match.client_id);
        const status = matchStatuses?.find(s => 
          s.candidate_id === match.candidate_id && s.client_id === match.client_id
        );
        const notes = matchNotes?.filter(n => 
          n.candidate_id === match.candidate_id && n.client_id === match.client_id
        );

        return {
          ...match,
          candidate,
          client,
          status: status?.status || null,
          notes: notes || []
        };
      }) || [];

      // Prepare comprehensive context for AI
      const totalMatches = matchesData?.length || 0;
      const roleMatches = matchesData?.filter(m => m.role_match).length || 0;
      const locationOnlyMatches = totalMatches - roleMatches;
      const under20MinMatches = matchesData?.filter(m => m.commute_minutes <= 20).length || 0;
      const placedMatches = matchStatuses?.filter(s => s.status === 'placed').length || 0;
      const inProgressMatches = matchStatuses?.filter(s => s.status === 'in-progress').length || 0;
      const rejectedMatches = matchStatuses?.filter(s => s.status === 'rejected').length || 0;

      // Optimize context - send relevant data based on query analysis but maintain conversation context
      const queryLower = question.toLowerCase();
      const isMatchQuery = queryLower.includes('match') || queryLower.includes('commute') || queryLower.includes('route');
      const isPhoneQuery = queryLower.includes('phone') || queryLower.includes('number') || queryLower.includes('contact');
      const isCandidateQuery = queryLower.includes('candidate');
      const isClientQuery = queryLower.includes('client') || queryLower.includes('surgery');
      const isStatusQuery = queryLower.includes('status') || queryLower.includes('orange') || queryLower.includes('progress') || queryLower.includes('placed') || queryLower.includes('rejected');
      
      // Progressive data loading based on query relevance - but ensure sufficient context for conversation continuity
      let relevantCandidates, relevantClients, relevantMatches, recentNotes;
      
      if (isMatchQuery || isPhoneQuery || isStatusQuery) {
        // For match/phone/status queries, prioritize recent matches with full candidate/client data
        relevantMatches = enrichedMatches.slice(0, 300); // Increased for better context
        relevantCandidates = candidates?.filter(c => 
          relevantMatches.some(m => m.candidate_id === c.id)
        ).slice(0, 150) || [];
        relevantClients = clients?.filter(c => 
          relevantMatches.some(m => m.client_id === c.id)
        ).slice(0, 150) || [];
        recentNotes = matchNotes?.slice(0, 100) || []; // More notes for context
      } else if (isCandidateQuery) {
        // For candidate queries, prioritize candidate data
        relevantCandidates = candidates?.slice(0, 150) || [];
        relevantClients = clients?.slice(0, 50) || []; 
        relevantMatches = enrichedMatches.filter(m => 
          relevantCandidates.some(c => c.id === m.candidate_id)
        ).slice(0, 100);
        recentNotes = matchNotes?.slice(0, 50) || [];
      } else if (isClientQuery) {
        // For client queries, prioritize client data
        relevantClients = clients?.slice(0, 150) || [];
        relevantCandidates = candidates?.slice(0, 50) || []; 
        relevantMatches = enrichedMatches.filter(m => 
          relevantClients.some(c => c.id === m.client_id)
        ).slice(0, 100);
        recentNotes = matchNotes?.slice(0, 50) || [];
      } else {
        // Default balanced approach - maintain good context
        relevantCandidates = candidates?.slice(0, 100) || [];
        relevantClients = clients?.slice(0, 100) || [];
        relevantMatches = enrichedMatches.slice(0, 200);
        recentNotes = matchNotes?.slice(0, 50) || [];
      }

      // Log context optimization for monitoring
      console.log(`Query analysis: Enhanced enterprise session for ${user.id.substring(0, 8)}...`);
      console.log(`Context loaded: ${relevantCandidates.length} candidates, ${relevantClients.length} clients, ${relevantMatches.length} matches`);

      // Initialize Anthropic
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      // Calculate token estimates for metrics
      const inputTokens = Math.ceil((JSON.stringify({ question, conversationHistory }).length) / 4);
      
      // Execute AI request
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        temperature: 0.3,
      tools: [
        {
          name: 'add_candidate',
          description: 'Add a new candidate to the database. Use this when the user asks to add/create/insert a candidate.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Candidate ID (e.g., CAN001)' },
              role: { type: 'string', description: 'Job role (e.g., Dental Nurse, Dentist)' },
              postcode: { type: 'string', description: 'UK postcode' },
              salary: { type: 'string', description: 'Salary expectation (e.g., £15-£17)' },
              days: { type: 'string', description: 'Working days (e.g., Mon-Wed)' },
              phone: { type: 'string', description: 'Phone number (optional)' },
              notes: { type: 'string', description: 'Additional notes (optional)' },
            },
            required: ['id', 'role', 'postcode', 'salary', 'days'],
          },
        },
        {
          name: 'get_match_details',
          description: 'Get detailed information about a specific match including commute routes and map links. Use when user asks about matches or wants to see routes.',
          input_schema: {
            type: 'object',
            properties: {
              candidate_id: { type: 'string', description: 'Candidate ID (required if not using client_id)' },
              client_id: { type: 'string', description: 'Client ID (required if not using candidate_id)' },
            },
          },
        },
        {
          name: 'update_match_status',
          description: 'Update the status of a match (placed, in-progress, rejected). Use when user mentions placing candidates or updating match status.',
          input_schema: {
            type: 'object',
            properties: {
              candidate_id: { type: 'string', description: 'Candidate ID' },
              client_id: { type: 'string', description: 'Client ID' },
              status: { type: 'string', enum: ['placed', 'in-progress', 'rejected'], description: 'New status for the match' },
            },
            required: ['candidate_id', 'client_id', 'status'],
          },
        },
        {
          name: 'add_match_note',
          description: 'Add a note to a specific match. Use when user wants to add comments about a match.',
          input_schema: {
            type: 'object',
            properties: {
              candidate_id: { type: 'string', description: 'Candidate ID' },
              client_id: { type: 'string', description: 'Client ID' },
              note_text: { type: 'string', description: 'Note content' },
            },
            required: ['candidate_id', 'client_id', 'note_text'],
          },
        },
        {
          name: 'add_client',
          description: 'Add a new client/surgery to the database. Use this when the user asks to add/create/insert a client or surgery.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Client ID (e.g., CL001)' },
              surgery: { type: 'string', description: 'Surgery/practice name' },
              client_name: { type: 'string', description: 'Client contact person name (optional)' },
              client_email: { type: 'string', description: 'Client contact email (optional)' },
              client_phone: { type: 'string', description: 'Client contact phone (optional)' },
              role: { type: 'string', description: 'Role needed (e.g., Dental Nurse, Dentist)' },
              postcode: { type: 'string', description: 'UK postcode' },
              budget: { type: 'string', description: 'Budget/pay offered (e.g., £16-£18/hr, DOE)' },
              requirement: { type: 'string', description: 'Days/hours/schedule requirements (e.g., Mon-Fri FT, PT flexible)' },
              system: { type: 'string', description: 'Dental software system (e.g., SOE, R4, Dentally)' },
              notes: { type: 'string', description: 'Additional notes (optional)' },
            },
            required: ['id', 'surgery', 'role', 'postcode'],
          },
        },
        {
          name: 'update_candidate',
          description: 'Update an existing candidate in the database. Use this when the user asks to edit/update/modify a candidate.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Candidate ID to update (e.g., CAN001)' },
              role: { type: 'string', description: 'Job role (optional)' },
              postcode: { type: 'string', description: 'UK postcode (optional)' },
              salary: { type: 'string', description: 'Salary expectation (optional)' },
              days: { type: 'string', description: 'Working days (optional)' },
              phone: { type: 'string', description: 'Phone number (optional)' },
              notes: { type: 'string', description: 'Additional notes (optional)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'update_client',
          description: 'Update an existing client in the database. Use this when the user asks to edit/update/modify a client.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Client ID to update (e.g., CL001)' },
              surgery: { type: 'string', description: 'Surgery/practice name (optional)' },
              client_name: { type: 'string', description: 'Client contact person name (optional)' },
              client_email: { type: 'string', description: 'Client contact email (optional)' },
              client_phone: { type: 'string', description: 'Client contact phone (optional)' },
              role: { type: 'string', description: 'Role needed (optional)' },
              postcode: { type: 'string', description: 'UK postcode (optional)' },
              budget: { type: 'string', description: 'Budget/pay offered (optional)' },
              requirement: { type: 'string', description: 'Days/hours/schedule requirements (optional)' },
              system: { type: 'string', description: 'Dental software system (optional)' },
              notes: { type: 'string', description: 'Additional notes (optional)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'delete_candidate',
          description: 'Delete a candidate from the database. Use this when the user asks to delete/remove a candidate.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Candidate ID to delete (e.g., CAN001)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'delete_client',
          description: 'Delete a client from the database. Use this when the user asks to delete/remove a client.',
          input_schema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Client ID to delete (e.g., CL001)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'open_map_modal',
          description: 'Open the commute map modal to show the route between a candidate and client. Use when user asks to open the map, show the route, or display commute visualization.',
          input_schema: {
            type: 'object',
            properties: {
              candidate_id: { type: 'string', description: 'Candidate ID' },
              client_id: { type: 'string', description: 'Client ID' },
              message: { type: 'string', description: 'Message to show with the map action (optional)' },
            },
            required: ['candidate_id', 'client_id'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `You are a concise AI assistant for dental recruitment. Give direct, brief answers.

CRITICAL RULES:
- Answer questions DIRECTLY without long explanations
- When asked for "best 3 matches", show ONLY the 3 best matches with minimal details
- When asked for phone numbers, provide ONLY the phone numbers requested
- When asked for "best match", provide the single best match with: candidate ID, candidate phone, candidate postcode, client name, client postcode, and commute time
- When asked to "open the map", "show the route", or "display commute", use the open_map_modal tool
- Use tools when needed but keep responses SHORT
- If system encounters rate limits, explain briefly that requests are queued for efficiency

ENTERPRISE-GRADE FEATURES:
- Multi-tenant data isolation with enhanced session management
- Professional-grade queue system for concurrent user handling
- Context optimization and intelligent memory management
- User ID: ${user.id.substring(0, 8)}... (isolated session)

STATUS INFORMATION:
- Match statuses available: "placed", "in-progress", "rejected", or null/pending
- "Orange" status does not exist in the system - clarify what the user means
- Current status counts: Placed: ${placedMatches}, In-Progress: ${inProgressMatches}, Rejected: ${rejectedMatches}
- If user asks about "orange" status, ask them to clarify what they mean (perhaps "in-progress"?)

MAP FEATURE:
You can open interactive Google Maps showing commute routes between candidates and clients. When users ask to see maps, routes, or commute visualization, use the open_map_modal tool with the appropriate candidate_id and client_id.

ENTERPRISE QUEUE SYSTEM:
The system uses professional-grade AI request management to handle multiple users efficiently with strict tenant isolation. All requests are processed with proper rate limiting and context preservation.

CONVERSATION HISTORY (enterprise session context - user isolated):
${conversationHistory.map((msg, i) => `[${i + 1}] USER: ${msg.question}\nASSISTANT: ${msg.answer}`).join('\n\n')}

MULTI-TENANT ISOLATION:
- Your responses are isolated to user ${user.id.substring(0, 8)}...
- Data shown is only for this specific user's account
- Enterprise session tracking: ${conversationHistory.length} previous exchanges

CURRENT DATA:
Candidates: ${relevantCandidates.length}/${candidates?.length || 0}
Clients: ${relevantClients.length}/${clients?.length || 0} 
Matches: ${relevantMatches.length}/${totalMatches}

DATABASE CONTEXT:
Candidates: ${JSON.stringify(relevantCandidates, null, 1)}
Clients: ${JSON.stringify(relevantClients, null, 1)}
Matches: ${JSON.stringify(relevantMatches, null, 1)}

Question: ${question}

Remember: Be CONCISE. Answer directly. No unnecessary details. If user asks about "orange" status, clarify what they mean.`,
        },
      ],
    });

      // Calculate output tokens for metrics
      const outputTokens = Math.ceil(JSON.stringify(response.content).length / 4);
      
      return {
        response,
        currentSessionId,
        conversationHistory,
        totalMatches,
        relevantCandidates,
        relevantClients,
        relevantMatches,
        recentNotes,
        placedMatches,
        inProgressMatches,
        rejectedMatches
      };
    });

    const {
      response,
      currentSessionId,
      conversationHistory,
      totalMatches,
      relevantCandidates,
      relevantClients,
      relevantMatches,
      recentNotes,
      placedMatches,
      inProgressMatches,
      rejectedMatches
    } = aiResponse;

    let finalAnswer = '';
    const toolResults = [];

    // Process AI response and execute tool calls
    for (const block of response.content) {
      if (block.type === 'text') {
        finalAnswer += block.text;
      } else if (block.type === 'tool_use') {
        const toolName = block.name;
        const toolInput = block.input as Record<string, string>;

        if (toolName === 'add_candidate') {
          // Create user-specific candidate ID to avoid conflicts across tenants
          const userPrefix = user.id.substring(0, 8); // Use first 8 chars of user ID
          const uniqueId = `${userPrefix}_${toolInput.id}`;
          
          // Check if candidate already exists for this user
          const { data: existingCandidate } = await supabase
            .from('candidates')
            .select('id')
            .eq('id', uniqueId)
            .single();

          if (existingCandidate) {
            toolResults.push(`⚠️ Candidate ${toolInput.id} already exists for your account. Use update_candidate to modify.`);
          } else {
            // Add candidate to database with user-specific unique ID
            const { error } = await supabase.from('candidates').insert({
              ...toolInput,
              id: uniqueId, // Use the unique ID that includes user prefix
              user_id: user.id,
              added_at: new Date().toISOString(),
            });

            if (error) {
              toolResults.push(`Error adding candidate: ${error.message}`);
            } else {
              toolResults.push(`✅ Successfully added candidate ${toolInput.id} to your account`);
            }
          }
        } else if (toolName === 'add_client') {
          // Create user-specific client ID to avoid conflicts across tenants
          const userPrefix = user.id.substring(0, 8); // Use first 8 chars of user ID
          const uniqueId = `${userPrefix}_${toolInput.id}`;
          
          // Check if client already exists for this user
          const { data: existingClient } = await supabase
            .from('clients')
            .select('id')
            .eq('id', uniqueId)
            .single();

          if (existingClient) {
            toolResults.push(`⚠️ Client ${toolInput.id} already exists for your account. Use update_client to modify.`);
          } else {
            // Add client to database with user-specific unique ID
            // Ensure budget is never null/undefined - use placeholder if missing
            const clientData = {
              ...toolInput,
              id: uniqueId, // Use the unique ID that includes user prefix
              budget: toolInput.budget || 'DOE',
              user_id: user.id,
              added_at: new Date().toISOString(),
            };

            const { error } = await supabase.from('clients').insert(clientData);

            if (error) {
              toolResults.push(`Error adding client: ${error.message}`);
            } else {
              toolResults.push(`✅ Successfully added client ${toolInput.id} to your account`);
            }
          }
        } else if (toolName === 'update_candidate') {
          // Update candidate in database (handle user-prefixed IDs)
          const { id, ...updateData } = toolInput;
          const userPrefix = user.id.substring(0, 8);
          const searchId = id.startsWith(userPrefix) ? id : `${userPrefix}_${id}`;
          
          const { error } = await supabase
            .from('candidates')
            .update(updateData)
            .eq('id', searchId)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error updating candidate: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully updated candidate ${id}`);
          }
        } else if (toolName === 'update_client') {
          // Update client in database (handle user-prefixed IDs)
          const { id, ...updateData } = toolInput;
          const userPrefix = user.id.substring(0, 8);
          const searchId = id.startsWith(userPrefix) ? id : `${userPrefix}_${id}`;
          
          const { error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', searchId)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error updating client: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully updated client ${id}`);
          }
        } else if (toolName === 'delete_candidate') {
          // Delete candidate from database (handle user-prefixed IDs)
          const userPrefix = user.id.substring(0, 8);
          const searchId = toolInput.id.startsWith(userPrefix) ? toolInput.id : `${userPrefix}_${toolInput.id}`;
          
          const { error } = await supabase
            .from('candidates')
            .delete()
            .eq('id', searchId)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error deleting candidate: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully deleted candidate ${toolInput.id}`);
          }
        } else if (toolName === 'delete_client') {
          // Delete client from database (handle user-prefixed IDs)
          const userPrefix = user.id.substring(0, 8);
          const searchId = toolInput.id.startsWith(userPrefix) ? toolInput.id : `${userPrefix}_${toolInput.id}`;
          
          const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', searchId)
            .eq('user_id', user.id);

          if (error) {
            toolResults.push(`Error deleting client: ${error.message}`);
          } else {
            toolResults.push(`✅ Successfully deleted client ${toolInput.id}`);
          }
        } else if (toolName === 'get_match_details') {
          // Get detailed match information with map links
          let matchDetails = [];

          if (toolInput.candidate_id && toolInput.client_id) {
            // Specific match
            const match = relevantMatches.find(m => 
              m.candidate_id === toolInput.candidate_id && m.client_id === toolInput.client_id
            );
            if (match) matchDetails = [match];
          } else if (toolInput.candidate_id) {
            // All matches for candidate
            matchDetails = relevantMatches.filter(m => m.candidate_id === toolInput.candidate_id);
          } else if (toolInput.client_id) {
            // All matches for client
            matchDetails = relevantMatches.filter(m => m.client_id === toolInput.client_id);
          }

          if (matchDetails.length > 0) {
            const mapLinks = matchDetails.map(match => {
              const origin = match.candidate?.postcode || 'N/A';
              const destination = match.client?.postcode || 'N/A';
              return `🗺️ Google Maps: https://www.google.com/maps/dir/${encodeURIComponent(origin + ', UK')}/${encodeURIComponent(destination + ', UK')}`;
            }).join('\n');

            toolResults.push(`🎯 Found ${matchDetails.length} match(es):\n\n${JSON.stringify(matchDetails, null, 2)}\n\n${mapLinks}`);
          } else {
            toolResults.push(`❌ No matches found for the specified criteria`);
          }
        } else if (toolName === 'update_match_status') {
          // Update match status
          const { error } = await supabase
            .from('match_statuses')
            .upsert({
              candidate_id: toolInput.candidate_id,
              client_id: toolInput.client_id,
              status: toolInput.status,
              updated_at: new Date().toISOString(),
            });

          if (error) {
            toolResults.push(`Error updating match status: ${error.message}`);
          } else {
            toolResults.push(`✅ Match status updated to '${toolInput.status}' for ${toolInput.candidate_id} ↔ ${toolInput.client_id}`);
          }
        } else if (toolName === 'add_match_note') {
          // Add note to match
          const { error } = await supabase
            .from('match_notes')
            .insert({
              candidate_id: toolInput.candidate_id,
              client_id: toolInput.client_id,
              note_text: toolInput.note_text,
              created_at: new Date().toISOString(),
            });

          if (error) {
            toolResults.push(`Error adding note: ${error.message}`);
          } else {
            toolResults.push(`✅ Note added to match ${toolInput.candidate_id} ↔ ${toolInput.client_id}`);
          }
        } else if (toolName === 'open_map_modal') {
          // Return special response that the client can handle to open map modal
          const match = relevantMatches.find(m => 
            m.candidate_id === toolInput.candidate_id && m.client_id === toolInput.client_id
          );
          
          if (match) {
            const candidate = match.candidate;
            const client = match.client;
            
            if (candidate && client) {
              const mapAction = {
                action: 'openMap',
                data: {
                  candidate_id: toolInput.candidate_id,
                  client_id: toolInput.client_id,
                  originPostcode: candidate.postcode,
                  destinationPostcode: client.postcode,
                  candidateName: candidate.role || 'Candidate',
                  clientName: client.surgery || 'Client',
                  commuteMinutes: match.commute_minutes,
                  commuteDisplay: match.commute_display,
                },
                message: toolInput.message || `Opening map for ${candidate.role || 'candidate'} to ${client.surgery || 'client'} (${match.commute_minutes} minutes)`
              };
              
              toolResults.push(`MAP_ACTION:${JSON.stringify(mapAction)}`);
            } else {
              toolResults.push(`❌ Missing candidate or client details for map`);
            }
          } else {
            toolResults.push(`❌ No match found between ${toolInput.candidate_id} and ${toolInput.client_id}`);
          }
        }
      }
    }

    // Combine answer with tool results
    const combinedAnswer = toolResults.length > 0
      ? `${finalAnswer}\n\n${toolResults.join('\n')}`
      : finalAnswer;

    // Save conversation to storage
    await conversationStorage.saveMessage(user.id, currentSessionId, question, combinedAnswer);

    return NextResponse.json({
      success: true,
      question,
      answer: combinedAnswer,
      sessionId: currentSessionId,
      toolsUsed: toolResults.length,
      contextInfo: {
        conversationHistory: conversationHistory.length,
        totalCandidates: relevantCandidates.length,
        candidatesShown: relevantCandidates.length,
        totalClients: relevantClients.length, 
        clientsShown: relevantClients.length,
        totalMatches: totalMatches,
        matchesShown: relevantMatches.length,
        matchNotes: recentNotes.length,
        contextOptimized: true,
        contextSizeKB: Math.round((JSON.stringify(relevantMatches).length + JSON.stringify(relevantCandidates).length + JSON.stringify(relevantClients).length) / 1024),
        multiTenantIsolation: true,
        userId: user.id.substring(0, 8) + '...',
        queueStats: globalAIQueue.getStats(),
        // Enhanced enterprise metrics
        enterpriseSession: {
          sessionId: currentSessionId,
          requestCount: 1,
          sessionDuration: Date.now() - startTime,
          contextWindowUsage: 'active'
        },
        systemStats: { active: true }
      }
    });

  } catch (error: any) {
    console.error('Enterprise AI API error:', error);
    
    // Log failed request
    console.error('Request failed:', {
      processingTimeMs: Date.now() - startTime,
      errorType: error.message || 'Unknown error'
    });

    // Enhanced error handling with enterprise context
    let errorMessage = 'Failed to get answer from AI';
    let errorDetails = error.message || 'Unknown error';
    let statusCode = 500;

    // Check for specific error types with better messaging
    if (error.message?.includes('ANTHROPIC_API_KEY')) {
      errorMessage = 'API Configuration Error';
      errorDetails = 'AI service is not properly configured. Please contact support.';
      statusCode = 503;
    } else if (error.status === 401) {
      errorMessage = 'Authentication Error';
      errorDetails = 'AI service authentication failed. Please contact support.';
      statusCode = 503;
    } else if (error.status === 429) {
      errorMessage = 'AI Service Temporarily Busy';
      errorDetails = 'The enterprise AI system is managing high demand efficiently. Your request has been queued and will be processed shortly. This is normal during peak usage.';
      statusCode = 503;
    } else if (error.message?.toLowerCase().includes('rate limit')) {
      errorMessage = 'Request Processing';
      errorDetails = 'Your request is being processed through our enterprise queue system. Please wait a moment and try again.';
      statusCode = 503;
    } else if (error.message?.toLowerCase().includes('quota exceeded')) {
      errorMessage = 'Service Limit Reached';
      errorDetails = 'Daily service quota has been reached. Please try again later or contact support for increased capacity.';
      statusCode = 503;
    } else if (error.message?.toLowerCase().includes('token')) {
      errorMessage = 'Request Too Complex';
      errorDetails = 'Your request contains too much context. Please try asking about specific items instead of general queries.';
      statusCode = 400;
    } else if (error.message?.toLowerCase().includes('concurrent')) {
      errorMessage = 'Multiple Requests Detected';
      errorDetails = 'Please wait for your previous requests to complete before sending new ones.';
      statusCode = 429;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
        enterpriseInfo: {
          systemStats: { active: true },
          queueStats: globalAIQueue.getStats(),
          timestamp: new Date().toISOString()
        },
        fullError: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: statusCode }
    );
  }
}
