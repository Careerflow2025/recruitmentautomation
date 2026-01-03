-- Migration: Client Email Campaigns
-- Description: Add tables for bulk client email campaigns

-- Client Email Campaigns table
CREATE TABLE IF NOT EXISTS client_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  candidate_id UUID,  -- Optional: for CV attachment
  attach_cv BOOLEAN DEFAULT FALSE,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Recipients table
CREATE TABLE IF NOT EXISTS client_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES client_email_campaigns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  client_email TEXT NOT NULL,
  surgery_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  brevo_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_campaigns_user_id ON client_email_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_client_campaigns_status ON client_email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_client_campaigns_created_at ON client_email_campaigns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON client_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON client_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_client_id ON client_campaign_recipients(client_id);

-- RLS Policies
ALTER TABLE client_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Users can only see their own campaigns
CREATE POLICY "Users can view own campaigns"
  ON client_email_campaigns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
  ON client_email_campaigns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON client_email_campaigns
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON client_email_campaigns
  FOR DELETE
  USING (auth.uid() = user_id);

-- Recipients inherit access from campaign
CREATE POLICY "Users can view campaign recipients"
  ON client_campaign_recipients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_email_campaigns
      WHERE client_email_campaigns.id = client_campaign_recipients.campaign_id
      AND client_email_campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert campaign recipients"
  ON client_campaign_recipients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_email_campaigns
      WHERE client_email_campaigns.id = client_campaign_recipients.campaign_id
      AND client_email_campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update campaign recipients"
  ON client_campaign_recipients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM client_email_campaigns
      WHERE client_email_campaigns.id = client_campaign_recipients.campaign_id
      AND client_email_campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete campaign recipients"
  ON client_campaign_recipients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM client_email_campaigns
      WHERE client_email_campaigns.id = client_campaign_recipients.campaign_id
      AND client_email_campaigns.user_id = auth.uid()
    )
  );

-- Updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at on campaigns
DROP TRIGGER IF EXISTS update_client_email_campaigns_updated_at ON client_email_campaigns;
CREATE TRIGGER update_client_email_campaigns_updated_at
  BEFORE UPDATE ON client_email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add ai_email_logs table if not exists (for tracking AI-generated emails)
CREATE TABLE IF NOT EXISTS ai_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID,
  client_id UUID,
  email_type TEXT,
  generated_subject TEXT,
  generated_body TEXT,
  model_used TEXT,
  tokens_used INTEGER,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add email_sends table if not exists (for tracking sent emails)
CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID,
  client_id UUID,
  recipient_email TEXT NOT NULL,
  recipient_type TEXT CHECK (recipient_type IN ('candidate', 'client')),
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  has_attachment BOOLEAN DEFAULT FALSE,
  attachment_count INTEGER DEFAULT 0,
  brevo_message_id TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ai_email_logs
CREATE INDEX IF NOT EXISTS idx_ai_email_logs_user_id ON ai_email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_email_logs_client_id ON ai_email_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_email_logs_candidate_id ON ai_email_logs(candidate_id);

-- Indexes for email_sends
CREATE INDEX IF NOT EXISTS idx_email_sends_user_id ON email_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_client_id ON email_sends(client_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_recipient_email ON email_sends(recipient_email);

-- RLS for ai_email_logs
ALTER TABLE ai_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_email_logs"
  ON ai_email_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_email_logs"
  ON ai_email_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai_email_logs"
  ON ai_email_logs FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS for email_sends
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email_sends"
  ON email_sends FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email_sends"
  ON email_sends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE client_email_campaigns IS 'Stores bulk email campaigns targeting multiple clients';
COMMENT ON TABLE client_campaign_recipients IS 'Stores individual recipients and their send status for each campaign';
COMMENT ON TABLE ai_email_logs IS 'Logs AI-generated email content for tracking and analytics';
COMMENT ON TABLE email_sends IS 'Logs all sent emails for tracking and analytics';
