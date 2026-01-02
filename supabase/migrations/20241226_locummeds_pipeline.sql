-- ============================================
-- LOCUMMEDS AI RECRUITMENT PIPELINE
-- ============================================
-- Tables for automated recruitment workflow

-- UK Role Salary Reference (for 10% fee calculation)
CREATE TABLE IF NOT EXISTS uk_role_salaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,
    annual_salary_min DECIMAL(10,2),
    annual_salary_max DECIMAL(10,2),
    hourly_rate_min DECIMAL(10,2),
    hourly_rate_max DECIMAL(10,2),
    daily_rate_min DECIMAL(10,2),
    daily_rate_max DECIMAL(10,2),
    registration_required TEXT, -- 'GDC', 'NMC', 'GMC', 'NONE'
    dbs_level TEXT DEFAULT 'enhanced', -- 'basic', 'enhanced'
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role)
);

-- Insert UK healthcare salary data (2024 rates)
INSERT INTO uk_role_salaries (role, annual_salary_min, annual_salary_max, hourly_rate_min, hourly_rate_max, daily_rate_min, daily_rate_max, registration_required, dbs_level) VALUES
    ('Dental Nurse', 22000, 32000, 12.00, 18.00, 96.00, 144.00, 'GDC', 'enhanced'),
    ('Dentist', 50000, 110000, 35.00, 80.00, 280.00, 640.00, 'GDC', 'enhanced'),
    ('Dental Hygienist', 35000, 55000, 25.00, 40.00, 200.00, 320.00, 'GDC', 'enhanced'),
    ('Dental Receptionist', 20000, 28000, 11.00, 15.00, 88.00, 120.00, 'NONE', 'basic'),
    ('Practice Nurse', 28000, 42000, 15.00, 24.00, 120.00, 192.00, 'NMC', 'enhanced'),
    ('Advanced Nurse Practitioner', 45000, 65000, 25.00, 38.00, 200.00, 304.00, 'NMC', 'enhanced'),
    ('Practice Manager', 35000, 55000, 19.00, 30.00, 152.00, 240.00, 'NONE', 'basic'),
    ('Treatment Coordinator', 25000, 35000, 14.00, 19.00, 112.00, 152.00, 'NONE', 'basic'),
    ('Trainee Dental Nurse', 18000, 22000, 10.00, 12.00, 80.00, 96.00, 'GDC', 'enhanced'),
    ('GP', 70000, 120000, 50.00, 90.00, 400.00, 720.00, 'GMC', 'enhanced'),
    ('Healthcare Assistant', 20000, 26000, 11.00, 14.00, 88.00, 112.00, 'NONE', 'enhanced'),
    ('Phlebotomist', 22000, 28000, 12.00, 15.00, 96.00, 120.00, 'NONE', 'enhanced')
ON CONFLICT (role) DO UPDATE SET
    annual_salary_min = EXCLUDED.annual_salary_min,
    annual_salary_max = EXCLUDED.annual_salary_max,
    hourly_rate_min = EXCLUDED.hourly_rate_min,
    hourly_rate_max = EXCLUDED.hourly_rate_max,
    daily_rate_min = EXCLUDED.daily_rate_min,
    daily_rate_max = EXCLUDED.daily_rate_max,
    registration_required = EXCLUDED.registration_required,
    dbs_level = EXCLUDED.dbs_level,
    updated_at = NOW();

-- CV Storage
CREATE TABLE IF NOT EXISTS candidate_cvs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL,
    cv_filename TEXT,
    cv_storage_path TEXT, -- Supabase storage path
    cv_text_content TEXT, -- Extracted text from CV
    cv_parsed_data JSONB, -- Structured data extracted from CV
    anonymized_cv_path TEXT, -- Path to anonymized version
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, candidate_id)
);

-- Pipeline Status Enum
DO $$ BEGIN
    CREATE TYPE pipeline_status AS ENUM (
        'new',
        'calling',
        'no_answer',
        'available',
        'not_now',
        'callback_scheduled',
        'not_interested',
        'matched',
        'cv_sent',
        'client_approved',
        'terms_sent_client',
        'terms_accepted_client',
        'terms_sent_candidate',
        'terms_accepted_candidate',
        'interview_scheduling',
        'interview_scheduled',
        'interview_confirmed',
        'interview_completed',
        'placed',
        'rejected',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main Pipeline Table
CREATE TABLE IF NOT EXISTS locummeds_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL,
    client_id TEXT, -- NULL until matched

    -- Status
    status TEXT NOT NULL DEFAULT 'new',
    status_updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Compliance Verification
    right_to_work BOOLEAN,
    right_to_work_type TEXT, -- 'british_citizen', 'settled_status', 'visa', etc.
    dbs_valid BOOLEAN,
    dbs_certificate_date DATE,
    registration_type TEXT, -- 'GDC', 'NMC', 'GMC', 'NONE'
    registration_number TEXT,
    registration_verified BOOLEAN DEFAULT FALSE,
    registration_expiry DATE,

    -- Availability from call
    available_for_work BOOLEAN,
    available_days TEXT, -- e.g., 'Mon,Tue,Wed'
    available_start_date DATE,
    expected_hourly_rate DECIMAL(10,2),
    expected_daily_rate DECIMAL(10,2),
    preferred_areas TEXT, -- Postcodes or areas

    -- Callback scheduling
    callback_reason TEXT,
    callback_scheduled_at TIMESTAMPTZ,

    -- Matching
    match_id UUID, -- Reference to matches table if exists
    commute_minutes INT,

    -- CV
    cv_id UUID REFERENCES candidate_cvs(id),
    cv_sent_at TIMESTAMPTZ,

    -- Client approval
    client_approved_at TIMESTAMPTZ,
    client_notes TEXT,

    -- Terms (Client)
    client_terms_sent_at TIMESTAMPTZ,
    client_terms_accepted_at TIMESTAMPTZ,
    placement_fee_percentage DECIMAL(5,2) DEFAULT 10.00,
    placement_fee_amount DECIMAL(10,2), -- Calculated fee

    -- Terms (Candidate)
    candidate_terms_sent_at TIMESTAMPTZ,
    candidate_terms_accepted_at TIMESTAMPTZ,

    -- Interview
    interview_type TEXT, -- 'in_person', 'google_meet', 'phone'
    interview_scheduled_at TIMESTAMPTZ,
    interview_location TEXT,
    interview_meet_link TEXT,
    interview_confirmed_client BOOLEAN DEFAULT FALSE,
    interview_confirmed_candidate BOOLEAN DEFAULT FALSE,
    interview_completed_at TIMESTAMPTZ,
    interview_outcome TEXT, -- 'hired', 'rejected', 'pending_decision'
    interview_feedback TEXT,

    -- Follow-up
    follow_up_scheduled_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_user ON locummeds_pipeline(user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_status ON locummeds_pipeline(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_candidate ON locummeds_pipeline(candidate_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_callback ON locummeds_pipeline(callback_scheduled_at)
    WHERE callback_scheduled_at IS NOT NULL AND status = 'callback_scheduled';

-- Scheduled Calls
CREATE TABLE IF NOT EXISTS locummeds_scheduled_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pipeline_id UUID REFERENCES locummeds_pipeline(id) ON DELETE CASCADE,

    -- Call details
    call_type TEXT NOT NULL, -- 'initial_candidate', 'callback', 'client_confirm', 'client_terms', 'candidate_terms', 'interview_confirm', 'follow_up'
    phone_number TEXT NOT NULL,
    contact_name TEXT,
    is_candidate BOOLEAN DEFAULT TRUE, -- true = candidate, false = client

    -- Scheduling
    scheduled_for TIMESTAMPTZ NOT NULL,
    priority INT DEFAULT 5, -- 1=highest, 10=lowest

    -- Retry logic
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 24, -- 12 hours at 30min intervals
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,

    -- Status
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
    completed_at TIMESTAMPTZ,
    outcome TEXT, -- 'answered', 'no_answer', 'voicemail', 'busy', 'failed'

    -- Script
    script_type TEXT NOT NULL, -- 'initial_availability', 'callback', 'client_confirmation', etc.
    script_variables JSONB, -- Dynamic data for script

    -- Result
    call_duration_seconds INT,
    twilio_call_sid TEXT,
    recording_url TEXT,
    transcript TEXT,
    extracted_data JSONB, -- Parsed responses (availability, registration numbers, etc.)

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_scheduled ON locummeds_scheduled_calls(scheduled_for)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_calls_retry ON locummeds_scheduled_calls(next_retry_at)
    WHERE status = 'pending' AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_user ON locummeds_scheduled_calls(user_id);

-- Call Logs (History)
CREATE TABLE IF NOT EXISTS locummeds_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_call_id UUID REFERENCES locummeds_scheduled_calls(id),
    pipeline_id UUID REFERENCES locummeds_pipeline(id),

    -- Call details
    twilio_call_sid TEXT,
    phone_number TEXT NOT NULL,
    direction TEXT DEFAULT 'outbound', -- 'outbound', 'inbound'

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INT,

    -- Recording
    recording_url TEXT,
    recording_duration_seconds INT,

    -- Transcript
    transcript TEXT,
    transcript_confidence DECIMAL(3,2),

    -- AI Analysis
    sentiment TEXT, -- 'positive', 'neutral', 'negative'
    intent_detected TEXT,
    extracted_data JSONB,

    -- Outcome
    outcome TEXT NOT NULL, -- 'answered', 'no_answer', 'voicemail', 'busy', 'failed', 'rejected'
    outcome_details TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_pipeline ON locummeds_call_logs(pipeline_id);

-- Email Logs
CREATE TABLE IF NOT EXISTS locummeds_email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pipeline_id UUID REFERENCES locummeds_pipeline(id) ON DELETE CASCADE,

    -- Email details
    email_type TEXT NOT NULL, -- 'cv_to_client', 'terms_to_client', 'terms_to_candidate', 'interview_confirm', 'interview_cancel', 'follow_up'
    recipient_type TEXT NOT NULL, -- 'candidate', 'client'
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,

    -- Content
    subject TEXT NOT NULL,
    template_id TEXT, -- Brevo template ID
    template_variables JSONB,

    -- Brevo tracking
    brevo_message_id TEXT,

    -- Status
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    bounce_reason TEXT,

    -- Response
    response_received_at TIMESTAMPTZ,
    response_type TEXT, -- 'accepted', 'rejected', 'question', 'reschedule'
    response_content TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_pipeline ON locummeds_email_logs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_response ON locummeds_email_logs(email_type, response_received_at)
    WHERE response_received_at IS NULL;

-- Pipeline Events (Audit Log)
CREATE TABLE IF NOT EXISTS locummeds_pipeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES locummeds_pipeline(id) ON DELETE CASCADE,

    event_type TEXT NOT NULL, -- 'status_change', 'call_made', 'email_sent', 'interview_scheduled', etc.
    from_status TEXT,
    to_status TEXT,

    -- Event details
    event_data JSONB,
    triggered_by TEXT, -- 'system', 'ai', 'user', 'webhook'

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_pipeline ON locummeds_pipeline_events(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON locummeds_pipeline_events(created_at);

-- API Keys for external access (LocumMeds AI)
CREATE TABLE IF NOT EXISTS locummeds_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL, -- SHA-256 hash of API key
    key_prefix TEXT NOT NULL, -- First 8 chars for identification
    name TEXT NOT NULL,
    permissions JSONB DEFAULT '["read", "write"]',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON locummeds_api_keys(key_hash) WHERE is_active = TRUE;

-- Enable RLS
ALTER TABLE uk_role_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE locummeds_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE locummeds_scheduled_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE locummeds_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE locummeds_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE locummeds_pipeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE locummeds_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies (user can only see their own data)
CREATE POLICY "Users can view their own CVs" ON candidate_cvs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own pipeline" ON locummeds_pipeline FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own calls" ON locummeds_scheduled_calls FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own call logs" ON locummeds_call_logs FOR ALL
    USING (pipeline_id IN (SELECT id FROM locummeds_pipeline WHERE user_id = auth.uid()));
CREATE POLICY "Users can view their own email logs" ON locummeds_email_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own events" ON locummeds_pipeline_events FOR ALL
    USING (pipeline_id IN (SELECT id FROM locummeds_pipeline WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage their own API keys" ON locummeds_api_keys FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view salary data" ON uk_role_salaries FOR SELECT USING (true);

-- Function to calculate placement fee
CREATE OR REPLACE FUNCTION calculate_placement_fee(
    p_role TEXT,
    p_days_per_week INT,
    p_fee_percentage DECIMAL DEFAULT 10.00
) RETURNS TABLE (
    annual_equivalent DECIMAL,
    placement_fee DECIMAL,
    calculation_basis TEXT
) AS $$
DECLARE
    v_daily_rate DECIMAL;
    v_annual DECIMAL;
BEGIN
    -- Get average daily rate for role
    SELECT (daily_rate_min + daily_rate_max) / 2 INTO v_daily_rate
    FROM uk_role_salaries WHERE role = p_role;

    IF v_daily_rate IS NULL THEN
        -- Default to average
        v_daily_rate := 150.00;
    END IF;

    -- Calculate annual equivalent (52 weeks × days per week × daily rate)
    v_annual := 52 * p_days_per_week * v_daily_rate;

    RETURN QUERY SELECT
        v_annual,
        v_annual * (p_fee_percentage / 100),
        FORMAT('£%.2f/day × %s days/week × 52 weeks × %.1f%%', v_daily_rate, p_days_per_week, p_fee_percentage);
END;
$$ LANGUAGE plpgsql;

-- Function to get next candidates to call
CREATE OR REPLACE FUNCTION get_pending_calls(
    p_user_id UUID,
    p_limit INT DEFAULT 10
) RETURNS TABLE (
    call_id UUID,
    pipeline_id UUID,
    candidate_id TEXT,
    phone_number TEXT,
    contact_name TEXT,
    script_type TEXT,
    script_variables JSONB,
    priority INT,
    attempts INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.id,
        sc.pipeline_id,
        p.candidate_id,
        sc.phone_number,
        sc.contact_name,
        sc.script_type,
        sc.script_variables,
        sc.priority,
        sc.attempts
    FROM locummeds_scheduled_calls sc
    JOIN locummeds_pipeline p ON sc.pipeline_id = p.id
    WHERE sc.user_id = p_user_id
    AND sc.status = 'pending'
    AND sc.scheduled_for <= NOW()
    AND (sc.next_retry_at IS NULL OR sc.next_retry_at <= NOW())
    ORDER BY sc.priority ASC, sc.scheduled_for ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
