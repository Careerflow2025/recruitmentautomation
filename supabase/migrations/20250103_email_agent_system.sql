-- ============================================
-- Email Agent System Migration
-- Created: 2025-01-03
-- Purpose: Tables for AI-powered email system
-- ============================================

-- Email Templates (user-defined and system templates)
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('cv_submission', 'interview', 'terms', 'follow_up', 'marketing', 'custom')),
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,
    variables JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Campaigns (for bulk email marketing)
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'cancelled')),
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    target_criteria JSONB,
    selected_candidate_ids TEXT[],
    total_recipients INT DEFAULT 0,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    sent_count INT DEFAULT 0,
    delivered_count INT DEFAULT 0,
    opened_count INT DEFAULT 0,
    clicked_count INT DEFAULT 0,
    bounced_count INT DEFAULT 0,
    unsubscribed_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign Recipients (individual tracking per recipient)
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'failed')),
    brevo_message_id TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    bounce_reason TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Unsubscribes (for compliance - GDPR, CAN-SPAM)
CREATE TABLE IF NOT EXISTS email_unsubscribes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    reason TEXT,
    source TEXT CHECK (source IN ('brevo', 'manual', 'campaign', 'api')),
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, email)
);

-- AI Email Generation Logs (for auditing and improvement)
CREATE TABLE IF NOT EXISTS ai_email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    candidate_id TEXT,
    client_id TEXT,
    email_type TEXT NOT NULL CHECK (email_type IN ('cv_submission', 'interview', 'terms', 'follow_up', 'marketing', 'custom')),
    prompt_context JSONB,
    generated_subject TEXT,
    generated_body TEXT,
    model_used TEXT DEFAULT 'claude-3-haiku',
    tokens_used INT,
    approved BOOLEAN,
    edited BOOLEAN DEFAULT FALSE,
    final_subject TEXT,
    final_body TEXT,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual Email Sends (for tracking all emails sent)
CREATE TABLE IF NOT EXISTS email_sends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    ai_log_id UUID REFERENCES ai_email_logs(id) ON DELETE SET NULL,
    candidate_id TEXT,
    client_id TEXT,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    email_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    brevo_message_id TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    bounce_reason TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CV Redaction tracking (add columns to existing candidate_cvs table)
DO $$
BEGIN
    -- Add redacted_cv_path if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'redacted_cv_path') THEN
        ALTER TABLE candidate_cvs ADD COLUMN redacted_cv_path TEXT;
    END IF;

    -- Add redacted_cv_filename if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'redacted_cv_filename') THEN
        ALTER TABLE candidate_cvs ADD COLUMN redacted_cv_filename TEXT;
    END IF;

    -- Add redaction_status if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'redaction_status') THEN
        ALTER TABLE candidate_cvs ADD COLUMN redaction_status TEXT DEFAULT 'pending'
            CHECK (redaction_status IN ('pending', 'processing', 'completed', 'error'));
    END IF;

    -- Add redaction_timestamp if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'redaction_timestamp') THEN
        ALTER TABLE candidate_cvs ADD COLUMN redaction_timestamp TIMESTAMPTZ;
    END IF;

    -- Add redaction_template if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'redaction_template') THEN
        ALTER TABLE candidate_cvs ADD COLUMN redaction_template TEXT DEFAULT 'professional';
    END IF;

    -- Add detected_contacts if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'detected_contacts') THEN
        ALTER TABLE candidate_cvs ADD COLUMN detected_contacts JSONB;
    END IF;

    -- Add redacted_content if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'redacted_content') THEN
        ALTER TABLE candidate_cvs ADD COLUMN redacted_content JSONB;
    END IF;

    -- Add redaction_error if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'candidate_cvs' AND column_name = 'redaction_error') THEN
        ALTER TABLE candidate_cvs ADD COLUMN redaction_error TEXT;
    END IF;
END $$;

-- CV Templates (for professional formatting)
CREATE TABLE IF NOT EXISTS cv_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    html_template TEXT NOT NULL,
    css_styles TEXT NOT NULL,
    header_html TEXT,
    footer_html TEXT,
    watermark_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CV Redaction Audit Log
CREATE TABLE IF NOT EXISTS cv_redaction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cv_id UUID NOT NULL REFERENCES candidate_cvs(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('started', 'contact_detected', 'redacted', 'formatted', 'completed', 'error')),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for Performance
-- ============================================

-- Email templates
CREATE INDEX IF NOT EXISTS idx_email_templates_user_category ON email_templates(user_id, category);
CREATE INDEX IF NOT EXISTS idx_email_templates_system ON email_templates(is_system) WHERE is_system = TRUE;

-- Email campaigns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_status ON email_campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled ON email_campaigns(scheduled_at) WHERE status = 'scheduled';

-- Campaign recipients
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(campaign_id, status);

-- Email unsubscribes
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_user_email ON email_unsubscribes(user_id, email);

-- AI email logs
CREATE INDEX IF NOT EXISTS idx_ai_email_logs_user ON ai_email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_email_logs_candidate ON ai_email_logs(candidate_id);

-- Email sends
CREATE INDEX IF NOT EXISTS idx_email_sends_user ON email_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_candidate ON email_sends(candidate_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status);

-- CV redaction
CREATE INDEX IF NOT EXISTS idx_candidate_cvs_redaction ON candidate_cvs(redaction_status);
CREATE INDEX IF NOT EXISTS idx_cv_redaction_log_cv ON cv_redaction_log(cv_id);
CREATE INDEX IF NOT EXISTS idx_cv_templates_active ON cv_templates(is_active) WHERE is_active = TRUE;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_redaction_log ENABLE ROW LEVEL SECURITY;

-- Email templates policies
CREATE POLICY "Users manage own templates" ON email_templates
    FOR ALL USING (user_id = auth.uid() OR is_system = TRUE);

-- Email campaigns policies
CREATE POLICY "Users manage own campaigns" ON email_campaigns
    FOR ALL USING (user_id = auth.uid());

-- Campaign recipients policies
CREATE POLICY "Users view own campaign recipients" ON campaign_recipients
    FOR ALL USING (campaign_id IN (SELECT id FROM email_campaigns WHERE user_id = auth.uid()));

-- Email unsubscribes policies
CREATE POLICY "Users manage own unsubscribes" ON email_unsubscribes
    FOR ALL USING (user_id = auth.uid());

-- AI email logs policies
CREATE POLICY "Users view own ai_email_logs" ON ai_email_logs
    FOR ALL USING (user_id = auth.uid());

-- Email sends policies
CREATE POLICY "Users view own email_sends" ON email_sends
    FOR ALL USING (user_id = auth.uid());

-- CV templates policies (everyone can read, admin can write)
CREATE POLICY "Everyone can view active templates" ON cv_templates
    FOR SELECT USING (is_active = TRUE);

-- CV redaction log policies
CREATE POLICY "Users view own redaction logs" ON cv_redaction_log
    FOR SELECT USING (cv_id IN (SELECT id FROM candidate_cvs WHERE user_id = auth.uid()));

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Insert default CV template
INSERT INTO cv_templates (name, display_name, description, html_template, css_styles, footer_html)
VALUES (
    'professional',
    'LocumMeds Professional',
    'Clean professional template with agency branding',
    '<!DOCTYPE html>
<html>
<head><style>{{styles}}</style></head>
<body>
<div class="cv-container">
  <header class="cv-header">
    <h1>{{candidateReference}}</h1>
    <p class="role">{{role}}</p>
    <p class="location">Based in {{generalArea}}</p>
  </header>

  {{#if summary}}
  <section class="summary">
    <h2>Professional Summary</h2>
    <p>{{summary}}</p>
  </section>
  {{/if}}

  {{#if skills}}
  <section class="skills">
    <h2>Key Skills</h2>
    <ul class="skills-list">
      {{#each skills}}<li>{{this}}</li>{{/each}}
    </ul>
  </section>
  {{/if}}

  {{#if experience}}
  <section class="experience">
    <h2>Professional Experience</h2>
    {{#each experience}}
    <div class="job">
      <h3>{{role}}</h3>
      <p class="duration">{{duration}}</p>
      <p class="setting">{{setting}}</p>
      {{#if responsibilities}}
      <ul>{{#each responsibilities}}<li>{{this}}</li>{{/each}}</ul>
      {{/if}}
    </div>
    {{/each}}
  </section>
  {{/if}}

  {{#if education}}
  <section class="education">
    <h2>Education & Qualifications</h2>
    {{#each education}}
    <div class="qualification">
      <h3>{{qualification}}</h3>
      {{#if institution}}<p>{{institution}} {{#if year}}({{year}}){{/if}}</p>{{/if}}
    </div>
    {{/each}}
  </section>
  {{/if}}

  {{#if registrations}}
  <section class="registrations">
    <h2>Professional Registrations</h2>
    <ul>{{#each registrations}}<li>{{this}}</li>{{/each}}</ul>
  </section>
  {{/if}}
</div>
<footer>{{footer}}</footer>
<div class="watermark">LOCUMMEDS</div>
</body>
</html>',
    '* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; }
.cv-container { max-width: 800px; margin: 0 auto; }
.cv-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
.cv-header h1 { color: #1e40af; font-size: 28px; margin-bottom: 5px; }
.cv-header .role { color: #2563eb; font-size: 18px; font-weight: 600; }
.cv-header .location { color: #6b7280; font-size: 14px; }
section { margin-bottom: 25px; }
section h2 { color: #1e40af; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 15px; }
.skills-list { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; }
.skills-list li { background: #eff6ff; color: #1e40af; padding: 6px 14px; border-radius: 20px; font-size: 13px; }
.job { margin-bottom: 20px; padding-left: 15px; border-left: 3px solid #2563eb; }
.job h3 { color: #374151; font-size: 15px; margin-bottom: 4px; }
.job .duration { color: #2563eb; font-size: 13px; font-weight: 500; }
.job .setting { color: #6b7280; font-size: 13px; font-style: italic; margin-bottom: 8px; }
.job ul { padding-left: 20px; margin-top: 8px; }
.job li { font-size: 13px; margin-bottom: 4px; color: #4b5563; }
.qualification h3 { font-size: 14px; color: #374151; }
.qualification p { font-size: 13px; color: #6b7280; }
.registrations ul { list-style: none; }
.registrations li { font-size: 14px; padding: 4px 0; color: #059669; }
.registrations li:before { content: "✓ "; color: #059669; font-weight: bold; }
footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
.watermark { position: fixed; bottom: 50px; right: 50px; font-size: 60px; color: rgba(37, 99, 235, 0.08); transform: rotate(-15deg); font-weight: bold; letter-spacing: 5px; }',
    '<p>CV provided by LocumMeds | Contact details available upon successful placement</p>'
) ON CONFLICT (name) DO UPDATE SET
    html_template = EXCLUDED.html_template,
    css_styles = EXCLUDED.css_styles,
    footer_html = EXCLUDED.footer_html,
    updated_at = NOW();

-- Insert default email templates
INSERT INTO email_templates (user_id, name, category, subject_template, body_template, is_system, variables)
VALUES
(NULL, 'CV Submission to Client', 'cv_submission',
 'Candidate Referral: {{candidate_role}} for {{client_surgery}}',
 '<p>Dear {{client_name}},</p>
<p>I am pleased to introduce <strong>{{candidate_name}}</strong>, an experienced {{candidate_role}} who would be an excellent fit for your practice.</p>
<h3>Candidate Highlights:</h3>
<ul>
{{#each candidate_skills}}<li>{{this}}</li>{{/each}}
</ul>
<p>Please find their CV attached. Their commute to your practice would be approximately <strong>{{commute_minutes}} minutes</strong>.</p>
<p>I would be happy to arrange an interview at your earliest convenience.</p>
<p>Best regards,<br>{{sender_name}}<br>LocumMeds</p>',
 TRUE,
 '["candidate_name", "candidate_role", "candidate_skills", "client_name", "client_surgery", "commute_minutes", "sender_name"]'::jsonb),

(NULL, 'Interview Invitation', 'interview',
 'Interview Invitation: {{candidate_role}} Position at {{client_surgery}}',
 '<p>Dear {{candidate_name}},</p>
<p>Great news! <strong>{{client_surgery}}</strong> would like to invite you for an interview for the {{candidate_role}} position.</p>
<h3>Interview Details:</h3>
<ul>
<li><strong>Date:</strong> {{interview_date}}</li>
<li><strong>Time:</strong> {{interview_time}}</li>
<li><strong>Location:</strong> {{client_address}}</li>
</ul>
<p>Please confirm your attendance by replying to this email.</p>
<p>Best regards,<br>{{sender_name}}<br>LocumMeds</p>',
 TRUE,
 '["candidate_name", "candidate_role", "client_surgery", "interview_date", "interview_time", "client_address", "sender_name"]'::jsonb),

(NULL, 'Follow Up', 'follow_up',
 'Following Up: {{candidate_role}} Opportunity',
 '<p>Dear {{recipient_name}},</p>
<p>I hope this email finds you well. I wanted to follow up regarding {{subject_matter}}.</p>
<p>{{follow_up_message}}</p>
<p>Please let me know if you have any questions or would like to discuss further.</p>
<p>Best regards,<br>{{sender_name}}<br>LocumMeds</p>',
 TRUE,
 '["recipient_name", "subject_matter", "follow_up_message", "sender_name"]'::jsonb)

ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE email_templates IS 'Email templates for various communication types. System templates (is_system=true) are shared, user templates are private.';
COMMENT ON TABLE email_campaigns IS 'Bulk email campaigns with Brevo integration for marketing and outreach.';
COMMENT ON TABLE campaign_recipients IS 'Individual recipients for each campaign with delivery tracking.';
COMMENT ON TABLE email_unsubscribes IS 'Email addresses that have unsubscribed for GDPR/CAN-SPAM compliance.';
COMMENT ON TABLE ai_email_logs IS 'Logs of AI-generated emails for auditing and continuous improvement.';
COMMENT ON TABLE email_sends IS 'All individual email sends with delivery tracking via Brevo.';
COMMENT ON TABLE cv_templates IS 'Templates for professional CV reformatting with agency branding.';
COMMENT ON TABLE cv_redaction_log IS 'Audit log for CV redaction operations.';

COMMENT ON COLUMN candidate_cvs.redacted_cv_path IS 'Storage path for redacted (contact-free) version of CV.';
COMMENT ON COLUMN candidate_cvs.detected_contacts IS 'JSON of all contact information detected and removed during redaction.';
COMMENT ON COLUMN candidate_cvs.redacted_content IS 'Structured content of redacted CV for template rendering.';
