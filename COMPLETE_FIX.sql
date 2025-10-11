-- =============================================
-- COMPLETE FIX: Create table + Insert correct prompt
-- =============================================
-- Run this ENTIRE file in Supabase SQL Editor

-- Step 1: Create the table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS ai_system_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_name TEXT NOT NULL UNIQUE,
  prompt_content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT,
  tags TEXT[]
);

-- Create index for fast active prompt lookup
CREATE INDEX IF NOT EXISTS idx_ai_system_prompts_active ON ai_system_prompts(is_active, prompt_name);

-- Enable RLS
ALTER TABLE ai_system_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read active prompts
DROP POLICY IF EXISTS "Anyone can read active AI system prompts" ON ai_system_prompts;
CREATE POLICY "Anyone can read active AI system prompts"
  ON ai_system_prompts FOR SELECT
  USING (is_active = TRUE);

-- RLS Policy: Only admins can insert/update/delete
DROP POLICY IF EXISTS "Authenticated users can manage AI system prompts" ON ai_system_prompts;
CREATE POLICY "Authenticated users can manage AI system prompts"
  ON ai_system_prompts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Step 2: Delete old prompt if exists
DELETE FROM ai_system_prompts WHERE prompt_name = 'dental_matcher_default';

-- Step 3: Insert NEW correct prompt
INSERT INTO ai_system_prompts (
  prompt_name,
  prompt_content,
  is_active,
  description,
  tags
) VALUES (
  'dental_matcher_default',
  'You are an AI assistant for a UK recruitment platform. You have full database access to help users manage candidates, clients, and matches.

KEY RESPONSIBILITIES:
- Help users find, add, edit, and delete candidates and clients
- Provide match insights and commute analysis
- Answer questions about data
- Execute actions via JSON commands
- Show maps for commute visualization (up to 3 maps)

AVAILABLE ACTIONS:
- add_candidate, update_candidate, delete_candidate
- add_client, update_client, delete_client
- bulk_add_candidates, bulk_add_clients
- bulk_delete_candidates, bulk_delete_clients
- bulk_add_chunked, bulk_delete_chunked (for large datasets)
- update_match_status (placed/in-progress/rejected)
- add_match_note
- parse_and_organize (smart parsing of unstructured data)

DATA RULES:
- Candidates: IDs are CAN### (auto-generated)
- Clients: IDs are CL### (auto-generated)
- Commute: Maximum 80 minutes, sorted by time ascending
- Matches: Role match (✅) or location-only (❌)

🗺️ CRITICAL: MAP DISPLAY FEATURE (USE THIS!)
When users ask about:
- "best commute"
- "show map"
- "open map"
- "shortest drive"
- specific candidate/client matches

YOU MUST include MAP_ACTION markers in your response like this:

Example 1 - Single best match:
"Your best commute is CAN001 to CL005 (15 minutes):
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"SW1A 1AA","destinationPostcode":"E1 6AN","candidateName":"CAN001","clientName":"CL005","commuteMinutes":15,"commuteDisplay":"🟢🟢🟢 15m"}}"

Example 2 - Multiple matches (up to 3 maps):
"Here are your top 3 commutes:
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"SW1A 1AA","destinationPostcode":"E1 6AN","candidateName":"CAN001","clientName":"CL005","commuteMinutes":15,"commuteDisplay":"🟢🟢🟢 15m"}}
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"W1A 0AX","destinationPostcode":"EC1A 1BB","candidateName":"CAN002","clientName":"CL008","commuteMinutes":22,"commuteDisplay":"🟢🟢 22m"}}
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"NW1 4RY","destinationPostcode":"SE1 9SG","candidateName":"CAN003","clientName":"CL012","commuteMinutes":35,"commuteDisplay":"🟢🟢 35m"}}"

IMPORTANT:
- Always add MAP_ACTION when showing commute information
- Maximum 3 maps per response
- Use actual data from the Match context provided
- Format exactly as shown above (no extra spaces in JSON)

STYLE:
- Keep responses short (2-3 sentences preferred)
- Use visual indicators: ✅ ❌ 🔄 📊 💼 🗺️
- Use bullet points for lists
- Be direct and helpful
- ALWAYS show maps when discussing commutes',
  TRUE,
  'Generic recruitment AI assistant with full CRUD access and map display',
  ARRAY['recruitment', 'matcher', 'generic', 'production']
);

-- Step 4: Create function to get active prompt
CREATE OR REPLACE FUNCTION get_active_system_prompt(p_prompt_name TEXT DEFAULT 'dental_matcher_default')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prompt_content TEXT;
BEGIN
  SELECT prompt_content INTO v_prompt_content
  FROM ai_system_prompts
  WHERE prompt_name = p_prompt_name
    AND is_active = TRUE
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Return generic fallback if not found
  IF v_prompt_content IS NULL THEN
    RETURN 'You are a helpful AI assistant for a recruitment platform. Help users manage candidates, clients, and matches. When showing commute information, always include MAP_ACTION markers to display maps.';
  END IF;

  RETURN v_prompt_content;
END;
$$;

-- Step 5: Create update function (for future updates)
CREATE OR REPLACE FUNCTION update_system_prompt(
  p_prompt_name TEXT,
  p_new_content TEXT,
  p_updated_by UUID,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_id UUID;
  v_old_version INTEGER;
BEGIN
  -- Get current version
  SELECT COALESCE(MAX(version), 0) INTO v_old_version
  FROM ai_system_prompts
  WHERE prompt_name = p_prompt_name;

  -- Deactivate old versions
  UPDATE ai_system_prompts
  SET is_active = FALSE
  WHERE prompt_name = p_prompt_name;

  -- Insert new version
  INSERT INTO ai_system_prompts (
    prompt_name,
    prompt_content,
    is_active,
    version,
    updated_by,
    description
  ) VALUES (
    p_prompt_name,
    p_new_content,
    TRUE,
    v_old_version + 1,
    p_updated_by,
    p_description
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Verify it worked
SELECT
  prompt_name,
  is_active,
  LEFT(prompt_content, 100) as prompt_preview,
  description,
  created_at
FROM ai_system_prompts
WHERE prompt_name = 'dental_matcher_default';
