/**
 * RAG (Retrieval Augmented Generation) Service
 *
 * Handles:
 * 1. Conversation memory (semantic search of past interactions)
 * 2. Knowledge base (app documentation retrieval)
 * 3. Embeddings generation (OpenAI ada-002)
 */

import { createServiceClient } from './supabase/server';

// OpenAI embedding configuration
const OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding vector for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('⚠️ OPENAI_API_KEY not configured - RAG disabled');
    return Array(EMBEDDING_DIMENSIONS).fill(0); // Return zero vector as fallback
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: text.substring(0, 8000) // OpenAI limit
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI embedding error:', error);
      return Array(EMBEDDING_DIMENSIONS).fill(0);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return Array(EMBEDDING_DIMENSIONS).fill(0);
  }
}

/**
 * Store conversation turn in vector database for future retrieval
 */
export async function storeConversationEmbedding(
  userId: string,
  sessionId: string,
  turnNumber: number,
  question: string,
  answer: string
): Promise<void> {
  try {
    const supabase = createServiceClient();

    // Generate embedding for the question (we search based on questions)
    const embedding = await generateEmbedding(question);

    // Extract IDs mentioned in conversation
    const candidateIds = extractIds(question + ' ' + answer, 'CAN');
    const clientIds = extractIds(question + ' ' + answer, 'CL');

    // Classify conversation type
    const conversationType = classifyConversation(question);

    // Store in database
    const { error } = await supabase
      .from('conversation_embeddings')
      .upsert({
        user_id: userId,
        session_id: sessionId,
        turn_number: turnNumber,
        question,
        answer,
        question_embedding: embedding,
        involves_candidate_ids: candidateIds,
        involves_client_ids: clientIds,
        conversation_type: conversationType
      });

    if (error) {
      console.error('Error storing conversation embedding:', error);
    } else {
      console.log(`✅ Stored conversation embedding for turn ${turnNumber}`);
    }
  } catch (error) {
    console.error('Error in storeConversationEmbedding:', error);
  }
}

/**
 * Retrieve relevant past conversations based on current question
 */
export async function retrieveRelevantConversations(
  userId: string,
  question: string,
  limit: number = 5,
  similarityThreshold: number = 0.7
): Promise<Array<{
  question: string;
  answer: string;
  similarity: number;
  turn_number: number;
}>> {
  try {
    const supabase = createServiceClient();

    // Generate embedding for current question
    const questionEmbedding = await generateEmbedding(question);

    // Check if we got a valid embedding
    const isZeroVector = questionEmbedding.every(v => v === 0);
    if (isZeroVector) {
      console.warn('⚠️ Zero embedding returned - skipping RAG retrieval');
      return [];
    }

    // Search similar conversations using pgvector
    const { data, error } = await supabase.rpc('search_similar_conversations', {
      query_embedding: questionEmbedding,
      target_user_id: userId,
      match_threshold: similarityThreshold,
      match_count: limit
    });

    if (error) {
      console.error('Error retrieving conversations:', error);
      return [];
    }

    console.log(`🔍 RAG: Found ${data?.length || 0} relevant past conversations`);
    return data || [];
  } catch (error) {
    console.error('Error in retrieveRelevantConversations:', error);
    return [];
  }
}

/**
 * Retrieve relevant knowledge base articles
 */
export async function retrieveKnowledge(
  question: string,
  limit: number = 3,
  similarityThreshold: number = 0.6,
  category?: string
): Promise<Array<{
  title: string;
  content: string;
  category: string;
  similarity: number;
}>> {
  try {
    const supabase = createServiceClient();

    // Generate embedding for question
    const questionEmbedding = await generateEmbedding(question);

    // Check if we got a valid embedding
    const isZeroVector = questionEmbedding.every(v => v === 0);
    if (isZeroVector) {
      console.warn('⚠️ Zero embedding returned - skipping knowledge retrieval');
      return [];
    }

    // Search knowledge base
    const { data, error } = await supabase.rpc('search_knowledge_base', {
      query_embedding: questionEmbedding,
      match_threshold: similarityThreshold,
      match_count: limit,
      filter_category: category || null
    });

    if (error) {
      console.error('Error retrieving knowledge:', error);
      return [];
    }

    console.log(`📚 RAG: Found ${data?.length || 0} relevant knowledge articles`);
    return data || [];
  } catch (error) {
    console.error('Error in retrieveKnowledge:', error);
    return [];
  }
}

/**
 * Get comprehensive context using RAG (conversations + knowledge)
 */
export async function getRAGContext(
  userId: string,
  question: string
): Promise<{
  relevantConversations: Array<any>;
  relevantKnowledge: Array<any>;
}> {
  const [relevantConversations, relevantKnowledge] = await Promise.all([
    retrieveRelevantConversations(userId, question, 3, 0.7), // Top 3 similar conversations
    retrieveKnowledge(question, 2, 0.65) // Top 2 knowledge articles
  ]);

  return {
    relevantConversations,
    relevantKnowledge
  };
}

/**
 * Helper: Extract IDs from text (CAN001, CL002, etc.)
 */
function extractIds(text: string, prefix: string): string[] {
  const regex = new RegExp(`${prefix}\\d+`, 'gi');
  const matches = text.match(regex) || [];
  return Array.from(new Set(matches.map(m => m.toUpperCase())));
}

/**
 * Helper: Classify conversation type based on question
 */
function classifyConversation(question: string): string {
  const lowerQ = question.toLowerCase();

  if (lowerQ.includes('add') || lowerQ.includes('create') || lowerQ.includes('insert')) {
    return 'action_add';
  } else if (lowerQ.includes('delete') || lowerQ.includes('remove')) {
    return 'action_delete';
  } else if (lowerQ.includes('update') || lowerQ.includes('change') || lowerQ.includes('edit')) {
    return 'action_update';
  } else if (lowerQ.includes('how many') || lowerQ.includes('count') || lowerQ.includes('total')) {
    return 'query_stats';
  } else if (lowerQ.includes('show') || lowerQ.includes('get') || lowerQ.includes('find')) {
    return 'query_data';
  } else if (lowerQ.includes('why') || lowerQ.includes('how') || lowerQ.includes('explain')) {
    return 'query_explanation';
  } else {
    return 'general';
  }
}

/**
 * Initialize knowledge base with embeddings (run once)
 */
export async function initializeKnowledgeBase(): Promise<void> {
  console.log('📚 Initializing knowledge base embeddings...');

  const supabase = createServiceClient();

  // Get all knowledge base entries without embeddings
  const { data: entries, error } = await supabase
    .from('knowledge_base')
    .select('id, title, content')
    .is('content_embedding', null);

  if (error || !entries || entries.length === 0) {
    console.log('✅ Knowledge base already initialized');
    return;
  }

  console.log(`🔄 Generating embeddings for ${entries.length} knowledge entries...`);

  for (const entry of entries) {
    // Generate embedding for combined title + content
    const text = `${entry.title}\n${entry.content}`;
    const embedding = await generateEmbedding(text);

    // Update entry with embedding
    await supabase
      .from('knowledge_base')
      .update({ content_embedding: embedding })
      .eq('id', entry.id);

    console.log(`✅ Generated embedding for: ${entry.title}`);
  }

  console.log('🎉 Knowledge base initialization complete!');
}
