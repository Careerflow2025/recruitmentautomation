// AI Memory Management - The "Big Company Trick"
// Handles unlimited conversation length without context overflow

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ConversationTurn {
  question: string;
  answer: string;
  turn: number;
}

interface AISummary {
  summary: string;
  turn_count: number;
}

interface AIFact {
  fact_key: string;
  fact_value: string;
  source_turn?: number;
}

/**
 * Get or create summary for a session
 */
export async function getSummary(userId: string, sessionId: string): Promise<AISummary | null> {
  const { data, error } = await supabase
    .from('ai_summary')
    .select('summary, turn_count')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found (ok)
    console.error('Error loading summary:', error);
    return null;
  }

  return data;
}

/**
 * Update or create summary
 */
export async function updateSummary(
  userId: string,
  sessionId: string,
  summary: string,
  turnCount: number
): Promise<void> {
  const { error } = await supabase
    .from('ai_summary')
    .upsert({
      user_id: userId,
      session_id: sessionId,
      summary,
      turn_count: turnCount,
      last_updated: new Date().toISOString()
    });

  if (error) {
    console.error('Error updating summary:', error);
  }
}

/**
 * Get all facts for a session
 */
export async function getFacts(userId: string, sessionId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('ai_facts')
    .select('fact_key, fact_value')
    .eq('user_id', userId)
    .eq('session_id', sessionId);

  if (error) {
    console.error('Error loading facts:', error);
    return {};
  }

  const facts: Record<string, string> = {};
  data?.forEach(f => {
    facts[f.fact_key] = f.fact_value;
  });

  return facts;
}

/**
 * Update or add a fact
 */
export async function updateFact(
  userId: string,
  sessionId: string,
  factKey: string,
  factValue: string,
  sourceTurn?: number
): Promise<void> {
  const { error } = await supabase
    .from('ai_facts')
    .upsert({
      user_id: userId,
      session_id: sessionId,
      fact_key: factKey,
      fact_value: factValue,
      source_turn: sourceTurn,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error updating fact:', error);
  }
}

/**
 * Generate compressed summary from conversation history
 * Uses AI to compress old turns into < 500 tokens
 */
export async function generateSummary(
  conversationHistory: ConversationTurn[],
  existingSummary?: string
): Promise<string> {
  if (conversationHistory.length === 0) {
    return existingSummary || '';
  }

  // Build summary prompt (use vLLM to compress)
  const turnsToCompress = conversationHistory.slice(0, -6); // Compress all but last 6

  if (turnsToCompress.length === 0) {
    return existingSummary || '';
  }

  const conversationText = turnsToCompress
    .map(t => `Turn ${t.turn}: USER: ${t.question}\nAI: ${t.answer}`)
    .join('\n\n');

  const summaryPrompt = `Compress this conversation history into a brief summary (max 400 tokens):

${existingSummary ? `PREVIOUS SUMMARY:\n${existingSummary}\n\n` : ''}NEW TURNS TO ADD:
${conversationText}

Create a concise summary covering:
- Key topics discussed
- Important facts mentioned (names, IDs, dates, preferences)
- Actions taken (placements, updates, etc)
- Current context

SUMMARY (max 400 tokens):`;

  try {
    const vllmUrl = process.env.VPS_AI_URL;
    const vllmSecret = process.env.VPS_AI_SECRET;

    if (!vllmUrl || !vllmSecret) {
      return existingSummary || '';
    }

    const response = await fetch(`${vllmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vllmSecret}`
      },
      body: JSON.stringify({
        model: '/workspace/models/mistral-7b-instruct',
        messages: [
          { role: 'user', content: summaryPrompt }
        ],
        max_tokens: 500,
        temperature: 0.3, // Lower temperature for consistent summaries
        stream: false
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      return existingSummary || '';
    }

    const data = await response.json();
    const newSummary = data.choices?.[0]?.message?.content || existingSummary || '';

    return newSummary.trim();
  } catch (error) {
    console.error('Error generating summary:', error);
    return existingSummary || '';
  }
}

/**
 * Extract facts from a conversation turn
 * Returns key-value pairs to store in ai_facts
 */
export async function extractFacts(
  question: string,
  answer: string,
  turnNumber: number
): Promise<AIFact[]> {
  const facts: AIFact[] = [];

  // Pattern matching for common facts
  const questionLower = question.toLowerCase();
  const answerLower = answer.toLowerCase();

  // Extract candidate IDs mentioned
  const canIds = (question + ' ' + answer).match(/CAN[\w_]+/gi);
  if (canIds && canIds.length > 0) {
    canIds.forEach((id, idx) => {
      if (idx < 5) { // Max 5 per turn
        facts.push({
          fact_key: `mentioned_candidate_${idx + 1}`,
          fact_value: id,
          source_turn: turnNumber
        });
      }
    });
  }

  // Extract client IDs mentioned
  const clIds = (question + ' ' + answer).match(/CL[\w_]+/gi);
  if (clIds && clIds.length > 0) {
    clIds.forEach((id, idx) => {
      if (idx < 5) {
        facts.push({
          fact_key: `mentioned_client_${idx + 1}`,
          fact_value: id,
          source_turn: turnNumber
        });
      }
    });
  }

  // Extract phone numbers mentioned
  const phones = (question + ' ' + answer).match(/0\d{9,10}/g);
  if (phones && phones.length > 0) {
    phones.forEach((phone, idx) => {
      if (idx < 3) {
        facts.push({
          fact_key: `phone_${idx + 1}`,
          fact_value: phone,
          source_turn: turnNumber
        });
      }
    });
  }

  // Detect preferences
  if (questionLower.includes('prefer') || answerLower.includes('prefer')) {
    if (answerLower.includes('dental nurse')) {
      facts.push({ fact_key: 'preferred_role', fact_value: 'Dental Nurse', source_turn: turnNumber });
    } else if (answerLower.includes('dentist')) {
      facts.push({ fact_key: 'preferred_role', fact_value: 'Dentist', source_turn: turnNumber });
    }
  }

  // Detect status focus
  if (questionLower.includes('in-progress')) {
    facts.push({ fact_key: 'last_viewed_status', fact_value: 'in-progress', source_turn: turnNumber });
  } else if (questionLower.includes('placed')) {
    facts.push({ fact_key: 'last_viewed_status', fact_value: 'placed', source_turn: turnNumber });
  }

  return facts;
}

/**
 * Check if we need to regenerate summary (every 10 turns)
 */
export function shouldRegenerateSummary(turnCount: number): boolean {
  return turnCount > 0 && turnCount % 10 === 0;
}

/**
 * Get recent conversation context (last N turns)
 */
export function getRecentContext(
  conversationHistory: ConversationTurn[],
  maxTurns: number = 6
): ConversationTurn[] {
  return conversationHistory.slice(-maxTurns);
}
