-- =============================================
-- AI System Prompts Table
-- =============================================
-- Stores the AI system prompt in database
-- Auto-loaded when AI chat opens
-- Allows dynamic updates without code changes

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
CREATE INDEX idx_ai_system_prompts_active ON ai_system_prompts(is_active, prompt_name);

-- Enable RLS
ALTER TABLE ai_system_prompts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read active prompts
CREATE POLICY "Anyone can read active AI system prompts"
  ON ai_system_prompts FOR SELECT
  USING (is_active = TRUE);

-- RLS Policy: Only admins can insert/update/delete
-- For now, allow all authenticated users (you can tighten this later)
CREATE POLICY "Authenticated users can manage AI system prompts"
  ON ai_system_prompts FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Insert default system prompt
INSERT INTO ai_system_prompts (
  prompt_name,
  prompt_content,
  is_active,
  description,
  tags
) VALUES (
  'dental_matcher_default',
  'You are an AI assistant for a UK dental recruitment platform. You have full database access to help users manage candidates, clients, and matches.

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

MULTI-MAP FEATURE:
To show maps, add MAP_ACTION markers to your response (max 3):
MAP_ACTION:{"action":"openMap","data":{"originPostcode":"SW1A 1AA","destinationPostcode":"E1 6AN","candidateName":"CAN001","clientName":"CL001","commuteMinutes":25,"commuteDisplay":"🟢🟢 25m"}}

STYLE:
- Keep responses short (2-3 sentences preferred)
- Use visual indicators: ✅ ❌ 🔄 📊 💼
- Use bullet points for lists
- Be direct and helpful',
  TRUE,
  'Default system prompt for dental recruitment AI assistant',
  ARRAY['dental', 'recruitment', 'matcher', 'production']
);

-- Function to get active system prompt
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

  -- Return default if not found
  IF v_prompt_content IS NULL THEN
    RETURN 'You are a helpful AI assistant for a dental recruitment platform.';
  END IF;

  RETURN v_prompt_content;
END;
$$;

-- Function to update system prompt (with versioning)
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

-- Audit log for system prompt changes
CREATE TABLE IF NOT EXISTS ai_system_prompt_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES ai_system_prompts(id) ON DELETE CASCADE,
  prompt_name TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_type TEXT NOT NULL -- 'create', 'update', 'delete', 'activate', 'deactivate'
);

-- Enable RLS on audit log
ALTER TABLE ai_system_prompt_audit ENABLE ROW LEVEL SECURITY;

-- RLS: Anyone can read audit log
CREATE POLICY "Anyone can read AI system prompt audit"
  ON ai_system_prompt_audit FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Trigger to log changes
CREATE OR REPLACE FUNCTION log_system_prompt_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO ai_system_prompt_audit (
      prompt_id,
      prompt_name,
      new_content,
      changed_by,
      change_type
    ) VALUES (
      NEW.id,
      NEW.prompt_name,
      NEW.prompt_content,
      NEW.created_by,
      'create'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.prompt_content <> OLD.prompt_content THEN
      INSERT INTO ai_system_prompt_audit (
        prompt_id,
        prompt_name,
        old_content,
        new_content,
        changed_by,
        change_type
      ) VALUES (
        NEW.id,
        NEW.prompt_name,
        OLD.prompt_content,
        NEW.prompt_content,
        NEW.updated_by,
        'update'
      );
    ELSIF NEW.is_active <> OLD.is_active THEN
      INSERT INTO ai_system_prompt_audit (
        prompt_id,
        prompt_name,
        changed_by,
        change_type
      ) VALUES (
        NEW.id,
        NEW.prompt_name,
        NEW.updated_by,
        CASE WHEN NEW.is_active THEN 'activate' ELSE 'deactivate' END
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO ai_system_prompt_audit (
      prompt_id,
      prompt_name,
      old_content,
      changed_by,
      change_type
    ) VALUES (
      OLD.id,
      OLD.prompt_name,
      OLD.prompt_content,
      OLD.updated_by,
      'delete'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER ai_system_prompts_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON ai_system_prompts
FOR EACH ROW
EXECUTE FUNCTION log_system_prompt_changes();

-- Comment
COMMENT ON TABLE ai_system_prompts IS 'Stores AI system prompts that are loaded automatically when AI chat opens';
COMMENT ON FUNCTION get_active_system_prompt IS 'Returns the active system prompt for the AI assistant';
COMMENT ON FUNCTION update_system_prompt IS 'Updates system prompt with versioning and audit logging';
