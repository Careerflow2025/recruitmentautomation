# RAG (Retrieval Augmented Generation) System

## 🎯 Overview

This system uses **semantic search** to retrieve relevant context for the AI assistant:
1. **Conversation Memory**: Retrieves past conversations similar to current question
2. **Knowledge Base**: Retrieves relevant app documentation

Instead of sending **all recent conversations** (expensive, inefficient), we:
- Store conversations as **embeddings** (vector representations)
- **Semantically search** for relevant past interactions
- Only send **what's relevant** to current question

## 🏗️ Architecture

```
User asks question
       ↓
Generate embedding (OpenAI ada-002)
       ↓
Search vector database (pgvector)
       ├─→ Search past conversations (similar questions)
       └─→ Search knowledge base (relevant docs)
       ↓
Send ONLY relevant context to AI
       ↓
AI responds with context awareness
       ↓
Store new conversation as embedding
```

## 📊 Database Tables

### `conversation_embeddings`
Stores all user conversations with semantic embeddings:
- `user_id`, `session_id`, `turn_number`
- `question`, `answer`
- `question_embedding` (vector 1536 dimensions)
- `involves_candidate_ids`, `involves_client_ids`
- `conversation_type` (query, action, analysis)

### `knowledge_base`
Stores app documentation with embeddings:
- `title`, `content`
- `content_embedding` (vector 1536)
- `category` (feature, rule, process, faq)
- `subcategory`, `keywords`, `priority`

## 🚀 Setup Instructions

### 1. Run Database Migration

```bash
# Apply the RAG migration
# This creates tables and functions for vector search
psql -h your-db-host -U postgres -d your-db -f supabase/migrations/20250111_rag_vector_store.sql
```

Or via Supabase Studio:
1. Go to SQL Editor
2. Paste contents of `20250111_rag_vector_store.sql`
3. Run query

### 2. Configure OpenAI API Key

Add to your `.env.local` file:
```env
OPENAI_API_KEY=sk-your-key-here
```

This is used for generating embeddings (text → vector conversion).

### 3. Initialize Knowledge Base

After deployment, visit once to generate embeddings:
```
GET https://your-app.com/api/ai/init-knowledge
```

This generates embeddings for all knowledge base entries (runs once).

### 4. Test RAG System

Ask the AI a question. Check logs for:
```
🔍 RAG: Retrieving relevant context for question...
🔍 RAG: Found 3 relevant past conversations
📚 RAG: Found 2 relevant knowledge articles
```

## 📖 How It Works

### Example Flow:

**User asks**: "How do I add multiple candidates?"

1. **Generate Embedding**:
   ```typescript
   const embedding = await generateEmbedding(
     "How do I add multiple candidates?"
   );
   ```

2. **Search Similar Conversations** (semantic search):
   ```sql
   SELECT * FROM conversation_embeddings
   WHERE user_id = :user_id
   ORDER BY question_embedding <=> :query_embedding
   LIMIT 3;
   ```

   **Finds** (even if worded differently):
   - Past: "Can I bulk add candidates?"
   - Past: "Is there a way to add many candidates at once?"
   - Past: "How to import multiple people?"

3. **Search Knowledge Base**:
   ```sql
   SELECT * FROM knowledge_base
   WHERE content_embedding <=> :query_embedding > 0.7
   LIMIT 2;
   ```

   **Finds**:
   - Article: "Bulk Operations"
   - Article: "Smart Data Parsing"

4. **AI Gets Context**:
   ```
   RAG MEMORY (relevant past conversations):
   Past Q: Can I bulk add candidates? A: Yes, use bulk_add_candidates...
   Past Q: How to add many at once? A: Parse unorganized text...

   RAG KNOWLEDGE (relevant system info):
   Bulk Operations: System supports bulk_add_candidates, auto-generates IDs...
   Smart Parsing: AI can parse unorganized text and extract structured data...
   ```

5. **AI Responds** with full context awareness!

## 🎛️ Configuration

### In `src/lib/rag.ts`:

```typescript
// Adjust similarity thresholds
retrieveRelevantConversations(
  userId,
  question,
  limit: 5,              // Max conversations to retrieve
  similarityThreshold: 0.7  // Min similarity (0.0-1.0)
);

retrieveKnowledge(
  question,
  limit: 3,              // Max articles to retrieve
  similarityThreshold: 0.6,  // Lower threshold for docs
  category?: string      // Filter by category
);
```

### Similarity Threshold Guide:
- `0.9+`: Almost identical questions
- `0.7-0.9`: Very similar (recommended)
- `0.5-0.7`: Somewhat related
- `<0.5`: Loosely related

## 📝 Adding Knowledge Base Entries

### Via SQL:

```sql
INSERT INTO knowledge_base (title, content, category, subcategory, keywords, priority)
VALUES (
  'Feature Name',
  'Detailed description of the feature and how it works...',
  'feature',  -- or 'rule', 'process', 'faq'
  'subcategory-name',
  ARRAY['keyword1', 'keyword2', 'keyword3'],
  8  -- Priority (0-10, higher = more important)
);
```

Then regenerate embeddings:
```
GET /api/ai/init-knowledge
```

### Content Examples:

```sql
-- Rule
INSERT INTO knowledge_base VALUES (
  'Commute Time Limit Rule',
  'All matches MUST have commute time ≤ 80 minutes. System automatically excludes any match over this limit. Always sorted by commute time ascending (shortest first).',
  'rule',
  'matching',
  ARRAY['80 minutes', 'commute limit', 'time filter', 'sorting'],
  10
);

-- Feature
INSERT INTO knowledge_base VALUES (
  'Bulk Delete Operations',
  'Users can delete multiple candidates or clients at once using bulk_delete_candidates or bulk_delete_clients actions. Accepts array of IDs: {"ids": ["CAN001", "CAN002"]}',
  'feature',
  'data-management',
  ARRAY['bulk', 'delete many', 'remove multiple'],
  7
);

-- Process
INSERT INTO knowledge_base VALUES (
  'Match Status Workflow',
  'Matches go through lifecycle: assigned → in-progress → placed/rejected. Users can mark matches as in-progress during interviews, then mark as placed when hired or rejected if not suitable.',
  'process',
  'matching',
  ARRAY['workflow', 'interview', 'hiring', 'placement'],
  6
);
```

## 🔧 Maintenance

### Clear Old Conversations

```sql
-- Delete conversation embeddings older than 90 days
DELETE FROM conversation_embeddings
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Rebuild Embeddings

```sql
-- Clear existing embeddings
UPDATE knowledge_base SET content_embedding = NULL;
```

Then visit: `GET /api/ai/init-knowledge`

### Monitor Usage

```sql
-- Count conversations stored
SELECT user_id, COUNT(*) as conversation_count
FROM conversation_embeddings
GROUP BY user_id;

-- Check knowledge base size
SELECT category, COUNT(*) as article_count
FROM knowledge_base
WHERE is_active = TRUE
GROUP BY category;

-- View top similar results for a question
SELECT * FROM search_similar_conversations(
  (SELECT question_embedding FROM conversation_embeddings LIMIT 1),
  'user-uuid-here',
  0.7,
  10
);
```

## 💰 Cost Considerations

### OpenAI Embedding API:
- **Model**: text-embedding-ada-002
- **Cost**: $0.0001 per 1K tokens (~$0.0001 per question)
- **Dimensions**: 1536

### Monthly Cost Estimate:
- 1000 conversations/month = ~$0.10
- 100 knowledge articles = ~$0.01 (one-time)

**Total**: ~$1-5/month for most use cases

### Alternative (Free):
- Use local embedding model (sentence-transformers)
- Modify `generateEmbedding()` function
- Trade-off: Slightly lower quality, but free

## 🐛 Troubleshooting

### No RAG results found:
```
⚠️ Zero embedding returned - skipping RAG retrieval
```
**Fix**: Check `OPENAI_API_KEY` in environment variables

### Embeddings not working:
```sql
-- Check if embeddings exist
SELECT id, title, content_embedding IS NULL as missing_embedding
FROM knowledge_base;
```
**Fix**: Run `GET /api/ai/init-knowledge`

### Slow queries:
```sql
-- Verify indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename = 'conversation_embeddings';
```
**Fix**: Run migration again to create indexes

### RAG context too large:
Reduce limits in `src/lib/rag.ts`:
```typescript
const { relevantConversations, relevantKnowledge } = await Promise.all([
  retrieveRelevantConversations(userId, question, 2, 0.75), // Reduced from 5
  retrieveKnowledge(question, 1, 0.7) // Reduced from 3
]);
```

## 📊 Benefits

### Before RAG (Old System):
- ❌ Sent last 6 conversations (always)
- ❌ Not relevant to current question
- ❌ Wasted tokens on irrelevant context
- ❌ AI couldn't remember conversations from days ago
- ❌ No app documentation available

### After RAG (New System):
- ✅ Only sends relevant past conversations
- ✅ Semantically similar to current question
- ✅ Efficient token usage
- ✅ Long-term memory (retrieves from months ago)
- ✅ Built-in knowledge base with app docs

## 🎯 Real-World Example

**Scenario**: User asks about bulk operations multiple times over weeks

**Week 1**: "How can I add multiple candidates at once?"
→ AI explains bulk_add_candidates
→ Stored as embedding

**Week 3**: "Is there a way to import many clients?"
→ RAG finds similar question from Week 1
→ AI recalls context: "Yes, like bulk_add_candidates, use bulk_add_clients..."
→ User feels AI "remembers" them!

**Week 5**: "Can I bulk delete?"
→ RAG finds both previous conversations
→ AI knows user understands bulk operations
→ Gives concise answer: "Yes, bulk_delete_candidates/clients"

## 🚀 Future Enhancements

1. **Data Embeddings**: Embed candidate/client data for semantic search
2. **Multi-modal RAG**: Add images, PDFs, documents
3. **Hybrid Search**: Combine semantic + keyword search
4. **Fine-tuning**: Train embedding model on dental recruitment terminology
5. **Feedback Loop**: Track which retrieved contexts were most helpful

---

**Questions?** Check logs for RAG debug info or adjust thresholds in `src/lib/rag.ts`
