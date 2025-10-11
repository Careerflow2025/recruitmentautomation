-- Enable pgvector extension for RAG (Retrieval Augmented Generation)
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- CONVERSATION MEMORY (RAG for user interactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversation_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  question_embedding vector(1536), -- OpenAI ada-002 dimensions
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata for filtering
  involves_candidate_ids TEXT[], -- Extract CAN001, CAN002 from conversation
  involves_client_ids TEXT[], -- Extract CL001, CL002
  conversation_type TEXT, -- 'query', 'action', 'analysis', etc.

  UNIQUE(user_id, session_id, turn_number)
);

-- Index for fast semantic search
CREATE INDEX conversation_embeddings_vector_idx ON conversation_embeddings
USING ivfflat (question_embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for user filtering
CREATE INDEX conversation_embeddings_user_idx ON conversation_embeddings(user_id);
CREATE INDEX conversation_embeddings_session_idx ON conversation_embeddings(user_id, session_id);

-- =====================================================
-- KNOWLEDGE BASE (RAG for app documentation)
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_embedding vector(1536),
  category TEXT NOT NULL, -- 'feature', 'rule', 'process', 'faq'
  subcategory TEXT, -- 'matching', 'commute', 'data-management', etc.
  keywords TEXT[], -- ['commute', '80 minutes', 'google maps']

  -- Metadata
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0, -- Higher priority = more important
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for semantic search
CREATE INDEX knowledge_base_vector_idx ON knowledge_base
USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for filtering
CREATE INDEX knowledge_base_category_idx ON knowledge_base(category, subcategory);
CREATE INDEX knowledge_base_active_idx ON knowledge_base(is_active);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Conversation embeddings: Users can only access their own
ALTER TABLE conversation_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversation embeddings"
  ON conversation_embeddings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own conversation embeddings"
  ON conversation_embeddings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Knowledge base: Everyone can read (app documentation)
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read knowledge base"
  ON knowledge_base FOR SELECT
  USING (is_active = TRUE);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to search similar conversations
CREATE OR REPLACE FUNCTION search_similar_conversations(
  query_embedding vector(1536),
  target_user_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  similarity FLOAT,
  turn_number INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.question,
    ce.answer,
    1 - (ce.question_embedding <=> query_embedding) AS similarity,
    ce.turn_number,
    ce.created_at
  FROM conversation_embeddings ce
  WHERE ce.user_id = target_user_id
    AND 1 - (ce.question_embedding <=> query_embedding) > match_threshold
  ORDER BY ce.question_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search knowledge base
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 3,
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.content,
    kb.category,
    1 - (kb.content_embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.is_active = TRUE
    AND 1 - (kb.content_embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR kb.category = filter_category)
  ORDER BY kb.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =====================================================
-- SEED KNOWLEDGE BASE (App Documentation)
-- =====================================================

-- This will be populated via API with actual embeddings
-- For now, just create the structure with placeholder content
INSERT INTO knowledge_base (title, content, category, subcategory, keywords, priority) VALUES
(
  'Commute Time Rules',
  'All matches must have commute time ≤ 80 minutes (1 hour 20 minutes). Matches are ALWAYS sorted by commute time in ascending order (shortest first). Uses Google Maps Distance Matrix API with driving mode and real traffic data.',
  'rule',
  'matching',
  ARRAY['commute', '80 minutes', 'google maps', 'sorting', 'driving time'],
  10
),
(
  'Role Matching System',
  'Matches are categorized as "Role Match" (exact role match between candidate and client) or "Location-Only" (proximity match without role match). Role match is indicated with ✅, location-only with ❌.',
  'rule',
  'matching',
  ARRAY['role match', 'exact match', 'location only'],
  9
),
(
  'Bulk Operations',
  'System supports bulk operations: bulk_add_candidates, bulk_add_clients, bulk_delete_candidates, bulk_delete_clients. Auto-generates IDs if not provided (CAN### for candidates, CL### for clients).',
  'feature',
  'data-management',
  ARRAY['bulk', 'multiple', 'add many', 'delete many'],
  8
),
(
  'Smart Data Parsing',
  'AI can parse unorganized mixed text and extract structured data. Use parse_and_organize action. Extracts: names, UK phone numbers, UK postcodes, roles, salaries, working days. Auto-validates and organizes into correct table columns.',
  'feature',
  'data-management',
  ARRAY['parse', 'unorganized', 'messy text', 'extract'],
  8
),
(
  'Match Status System',
  'Three statuses available: "placed" (candidate hired), "in-progress" (interview/consideration), "rejected" (declined/not suitable). Use update_match_status action to change status.',
  'feature',
  'matching',
  ARRAY['status', 'placed', 'in-progress', 'rejected', 'interview'],
  7
),
(
  'Data Access Permissions',
  'AI has full access to: add/edit/delete candidates, add/edit/delete clients, update match statuses, add notes, parse data, view map routes. All data is user-isolated via RLS (Row Level Security) - users only see their own data.',
  'feature',
  'permissions',
  ARRAY['access', 'permissions', 'RLS', 'security', 'isolation'],
  9
);

-- Note: content_embedding will be populated via API call to OpenAI embedding service
