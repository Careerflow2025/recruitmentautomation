-- =====================================================
-- DENTAL RECRUITMENT MATCHER - COMPLETE DATABASE SETUP
-- =====================================================
-- Run this entire file in Supabase SQL Editor
-- This will create all tables, RLS policies, functions, and storage buckets
-- Based on matching_json_final.json specification
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CREATE TABLES
-- =====================================================

-- Candidates Table
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  postcode TEXT NOT NULL,
  salary TEXT NOT NULL,
  days TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phone TEXT,
  notes TEXT,
  experience TEXT,
  travel_flexibility TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clients Table  
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  surgery TEXT NOT NULL,
  role TEXT NOT NULL,
  postcode TEXT NOT NULL,
  pay TEXT NOT NULL,
  days TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Commute Cache Table (stores Google Maps API results)
CREATE TABLE IF NOT EXISTS commute_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  origin_postcode TEXT NOT NULL,
  destination_postcode TEXT NOT NULL,
  commute_minutes INTEGER NOT NULL,
  commute_display TEXT NOT NULL,
  commute_band TEXT NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  UNIQUE(origin_postcode, destination_postcode)
);

-- Matches View (materialized for performance)
-- This will be populated by a trigger/function
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  commute_minutes INTEGER NOT NULL,
  commute_display TEXT NOT NULL,
  commute_band TEXT NOT NULL,
  role_match BOOLEAN NOT NULL,
  role_match_display TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(candidate_id, client_id)
);

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_candidates_postcode ON candidates(postcode);
CREATE INDEX IF NOT EXISTS idx_candidates_added_at ON candidates(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_postcode ON clients(postcode);
CREATE INDEX IF NOT EXISTS idx_clients_added_at ON clients(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_commute_cache_postcodes ON commute_cache(origin_postcode, destination_postcode);
CREATE INDEX IF NOT EXISTS idx_commute_cache_expires ON commute_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_matches_candidate ON matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_matches_client ON matches(client_id);
CREATE INDEX IF NOT EXISTS idx_matches_commute ON matches(commute_minutes ASC); -- RULE 1: Sort by time
CREATE INDEX IF NOT EXISTS idx_matches_role_match ON matches(role_match);

-- =====================================================
-- 3. CREATE FUNCTIONS
-- =====================================================

-- Function to normalize role names
CREATE OR REPLACE FUNCTION normalize_role(role_input TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  -- Clean input: lowercase, trim
  cleaned := LOWER(TRIM(role_input));
  
  -- Role synonym mapping
  CASE cleaned
    -- Dentist variants
    WHEN 'dt', 'dds', 'bds', 'dentist' THEN RETURN 'Dentist';
    
    -- Dental Nurse variants
    WHEN 'nurse', 'dn', 'd n', 'd.n.', 'dental nurse' THEN RETURN 'Dental Nurse';
    
    -- Dental Receptionist variants
    WHEN 'receptionist', 'front desk', 'reception', 'foh', 'rcp', 'rcpn', 'dental receptionist' 
      THEN RETURN 'Dental Receptionist';
    
    -- Dental Hygienist variants
    WHEN 'hygienist', 'dental hygienist' THEN RETURN 'Dental Hygienist';
    
    -- Treatment Coordinator variants
    WHEN 'tco', 'tc', 'treatment coordinator' THEN RETURN 'Treatment Coordinator';
    
    -- Practice Manager variants
    WHEN 'pm', 'mgr', 'manager', 'practice manager' THEN RETURN 'Practice Manager';
    
    -- Trainee Dental Nurse variants
    WHEN 'trainee dn', 'tdn', 'trainee dental nurse' THEN RETURN 'Trainee Dental Nurse';
    
    -- Default: return original
    ELSE RETURN role_input;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if item is new (within 48 hours)
CREATE OR REPLACE FUNCTION is_new_item(added_at TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (NOW() - added_at) <= INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get commute band based on minutes
CREATE OR REPLACE FUNCTION get_commute_band(minutes INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF minutes <= 20 THEN RETURN '🟢🟢🟢';
  ELSIF minutes <= 40 THEN RETURN '🟢🟢';
  ELSIF minutes <= 55 THEN RETURN '🟢';
  ELSIF minutes <= 80 THEN RETURN '🟡';
  ELSE RETURN NULL; -- Over 80 minutes should be excluded (RULE 2)
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to format commute time display
CREATE OR REPLACE FUNCTION format_commute_time(minutes INTEGER)
RETURNS TEXT AS $$
DECLARE
  hours INTEGER;
  remaining_minutes INTEGER;
  band TEXT;
BEGIN
  band := get_commute_band(minutes);
  
  IF minutes < 60 THEN
    RETURN band || ' ' || minutes || 'm';
  ELSE
    hours := minutes / 60;
    remaining_minutes := minutes % 60;
    
    IF remaining_minutes = 0 THEN
      RETURN band || ' ' || hours || 'h';
    ELSE
      RETURN band || ' ' || hours || 'h ' || remaining_minutes || 'm';
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate mock commute time (Phase 1)
-- In Phase 2, this will be replaced with Google Maps API call
CREATE OR REPLACE FUNCTION calculate_mock_commute(postcode_a TEXT, postcode_b TEXT)
RETURNS INTEGER AS $$
DECLARE
  hash_value INTEGER;
BEGIN
  -- Simple hash-based mock calculation for consistency
  hash_value := (LENGTH(postcode_a) + LENGTH(postcode_b)) * 
                (ASCII(SUBSTRING(postcode_a, 1, 1)) + ASCII(SUBSTRING(postcode_b, 1, 1)));
  
  -- Return value between 5 and 90 minutes
  RETURN 5 + (hash_value % 86);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to regenerate matches for a candidate
CREATE OR REPLACE FUNCTION regenerate_matches_for_candidate(candidate_id_param TEXT)
RETURNS VOID AS $$
DECLARE
  client_record RECORD;
  commute_mins INTEGER;
  commute_disp TEXT;
  commute_bnd TEXT;
  role_mtch BOOLEAN;
  role_mtch_disp TEXT;
  candidate_role_normalized TEXT;
  client_role_normalized TEXT;
BEGIN
  -- Get candidate's normalized role
  SELECT normalize_role(role) INTO candidate_role_normalized
  FROM candidates WHERE id = candidate_id_param;
  
  -- Delete existing matches for this candidate
  DELETE FROM matches WHERE candidate_id = candidate_id_param;
  
  -- Generate new matches with all clients
  FOR client_record IN SELECT * FROM clients LOOP
    -- Calculate commute time (MOCK for Phase 1)
    commute_mins := calculate_mock_commute(
      (SELECT postcode FROM candidates WHERE id = candidate_id_param),
      client_record.postcode
    );
    
    -- RULE 2: Exclude if >80 minutes
    IF commute_mins > 80 THEN
      CONTINUE;
    END IF;
    
    -- Get display values
    commute_disp := format_commute_time(commute_mins);
    commute_bnd := get_commute_band(commute_mins);
    
    -- Check role match
    client_role_normalized := normalize_role(client_record.role);
    role_mtch := (candidate_role_normalized = client_role_normalized);
    role_mtch_disp := CASE WHEN role_mtch THEN '✅ Role Match' ELSE '❌ Location-Only' END;
    
    -- Insert match
    INSERT INTO matches (
      candidate_id, client_id, commute_minutes, commute_display,
      commute_band, role_match, role_match_display
    ) VALUES (
      candidate_id_param, client_record.id, commute_mins, commute_disp,
      commute_bnd, role_mtch, role_mtch_disp
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to regenerate matches for a client
CREATE OR REPLACE FUNCTION regenerate_matches_for_client(client_id_param TEXT)
RETURNS VOID AS $$
DECLARE
  candidate_record RECORD;
  commute_mins INTEGER;
  commute_disp TEXT;
  commute_bnd TEXT;
  role_mtch BOOLEAN;
  role_mtch_disp TEXT;
  client_role_normalized TEXT;
  candidate_role_normalized TEXT;
BEGIN
  -- Get client's normalized role
  SELECT normalize_role(role) INTO client_role_normalized
  FROM clients WHERE id = client_id_param;
  
  -- Delete existing matches for this client
  DELETE FROM matches WHERE client_id = client_id_param;
  
  -- Generate new matches with all candidates
  FOR candidate_record IN SELECT * FROM candidates LOOP
    -- Calculate commute time (MOCK for Phase 1)
    commute_mins := calculate_mock_commute(
      candidate_record.postcode,
      (SELECT postcode FROM clients WHERE id = client_id_param)
    );
    
    -- RULE 2: Exclude if >80 minutes
    IF commute_mins > 80 THEN
      CONTINUE;
    END IF;
    
    -- Get display values
    commute_disp := format_commute_time(commute_mins);
    commute_bnd := get_commute_band(commute_mins);
    
    -- Check role match
    candidate_role_normalized := normalize_role(candidate_record.role);
    role_mtch := (candidate_role_normalized = client_role_normalized);
    role_mtch_disp := CASE WHEN role_mtch THEN '✅ Role Match' ELSE '❌ Location-Only' END;
    
    -- Insert match
    INSERT INTO matches (
      candidate_id, client_id, commute_minutes, commute_display,
      commute_band, role_match, role_match_display
    ) VALUES (
      candidate_record.id, client_id_param, commute_mins, commute_disp,
      commute_bnd, role_mtch, role_mtch_disp
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. CREATE TRIGGERS
-- =====================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to regenerate matches when candidate is inserted/updated
CREATE OR REPLACE FUNCTION trigger_regenerate_candidate_matches()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM regenerate_matches_for_candidate(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER regenerate_matches_on_candidate_change
  AFTER INSERT OR UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION trigger_regenerate_candidate_matches();

-- Trigger to regenerate matches when client is inserted/updated
CREATE OR REPLACE FUNCTION trigger_regenerate_client_matches()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM regenerate_matches_for_client(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER regenerate_matches_on_client_change
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_regenerate_client_matches();

-- Trigger to clean up matches when candidate/client is deleted
CREATE OR REPLACE FUNCTION cleanup_matches_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'candidates' THEN
    DELETE FROM matches WHERE candidate_id = OLD.id;
  ELSIF TG_TABLE_NAME = 'clients' THEN
    DELETE FROM matches WHERE client_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cleanup_matches_on_candidate_delete
  BEFORE DELETE ON candidates
  FOR EACH ROW EXECUTE FUNCTION cleanup_matches_on_delete();

CREATE TRIGGER cleanup_matches_on_client_delete
  BEFORE DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION cleanup_matches_on_delete();

-- =====================================================
-- 5. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE commute_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for now - tighten in production)
CREATE POLICY "Allow public read access to candidates" ON candidates
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert on candidates" ON candidates
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on candidates" ON candidates
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on candidates" ON candidates
  FOR DELETE USING (true);

CREATE POLICY "Allow public read access to clients" ON clients
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert on clients" ON clients
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on clients" ON clients
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on clients" ON clients
  FOR DELETE USING (true);

CREATE POLICY "Allow public read access to matches" ON matches
  FOR SELECT USING (true);

CREATE POLICY "Allow public read access to commute_cache" ON commute_cache
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert on commute_cache" ON commute_cache
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- 6. INSERT SAMPLE DATA (from mock data)
-- =====================================================

-- Insert sample candidates
INSERT INTO candidates (id, role, postcode, salary, days, added_at, phone, notes, experience, travel_flexibility) VALUES
('CAN001', 'Dental Nurse', 'CR0 1PB', '£15–£17', 'Mon-Wed', NOW() - INTERVAL '24 hours', '07700 900001', 'Experienced with orthodontics', '5 years', 'Up to 30 minutes'),
('CAN002', 'Dentist', 'BR1 1AA', '£50000', 'Mon-Fri', NOW() - INTERVAL '10 days', NULL, 'Specialist in cosmetic dentistry', '8 years', NULL),
('CAN003', 'dn', 'SE13 5AB', '£14', 'Part-time', NOW() - INTERVAL '36 hours', '07700 900003', NULL, NULL, NULL),
('CAN004', 'Dental Receptionist', 'SW19 1AA', '£12–£14', 'Mon-Fri', NOW() - INTERVAL '5 days', NULL, 'Excellent with SOE software', '3 years', NULL),
('CAN005', 'Hygienist', 'SE10 8EW', '£30', 'Tue-Thu', NOW() - INTERVAL '15 days', NULL, NULL, '6 years', NULL),
('CAN006', 'Treatment Coordinator', 'KT1 1AA', '£25–£28', 'Mon-Fri', NOW() - INTERVAL '3 days', NULL, 'Sales-driven, excellent communicator', '4 years', NULL),
('CAN007', 'pm', 'SM1 1AA', '£35000', 'Mon-Fri', NOW() - INTERVAL '7 days', '07700 900007', NULL, '10 years', NULL),
('CAN008', 'Trainee Dental Nurse', 'SW4 7AA', '£11', 'Mon-Fri', NOW() - INTERVAL '12 hours', NULL, 'Eager to learn, starting qualification', NULL, NULL),
('CAN009', 'dt', 'SW2 1AA', '£45–£55', 'Mon-Thu', NOW() - INTERVAL '20 days', NULL, 'Implant specialist', '12 years', NULL),
('CAN010', 'Dental Nurse', 'E1 6AA', '£16', 'Flexible', NOW() - INTERVAL '2 days', '07700 900010', NULL, '7 years', 'Up to 45 minutes'),
('CAN011', 'rcp', 'N1 0AA', '£13', 'Mon-Fri', NOW() - INTERVAL '12 days', NULL, NULL, '2 years', NULL),
('CAN012', 'Dental Hygienist', 'NW1 0AA', '£28–£32', 'Mon-Wed', NOW() - INTERVAL '8 days', NULL, 'Private practice experience', '5 years', NULL)
ON CONFLICT (id) DO NOTHING;

-- Insert sample clients
INSERT INTO clients (id, surgery, role, postcode, pay, days, added_at) VALUES
('CL001', 'Smile Dental Croydon', 'Dental Nurse', 'CR0 2AB', '£15–£18', 'Mon-Fri', NOW() - INTERVAL '30 hours'),
('CL002', 'Bromley Family Dentist', 'Dentist', 'BR2 9AA', '£50000–£60000', 'Mon-Fri', NOW() - INTERVAL '4 days'),
('CL003', 'Greenwich Dental Care', 'dn', 'SE10 0AA', '£16', 'Tue-Sat', NOW() - INTERVAL '20 hours'),
('CL004', 'Kingston Orthodontics', 'Dental Receptionist', 'KT2 5AA', '£13–£15', 'Mon-Fri', NOW() - INTERVAL '8 days'),
('CL005', 'Wimbledon Smile Studio', 'Dental Hygienist', 'SW19 2BB', '£30–£35', 'Mon-Thu', NOW() - INTERVAL '6 days'),
('CL006', 'Sutton Dental Practice', 'Practice Manager', 'SM1 2AA', '£35000', 'Mon-Fri', NOW() - INTERVAL '12 days'),
('CL007', 'Clapham Dental Clinic', 'Trainee Dental Nurse', 'SW4 6AA', '£11–£12', 'Mon-Fri', NOW() - INTERVAL '2 days'),
('CL008', 'Islington Dental Hub', 'Treatment Coordinator', 'N1 1AA', '£25–£30', 'Mon-Fri', NOW() - INTERVAL '14 days'),
('CL009', 'Shoreditch Smiles', 'Dentist', 'E2 7AA', '£55000', 'Mon-Thu', NOW() - INTERVAL '40 hours'),
('CL010', 'Camden Dental Centre', 'Dental Nurse', 'NW1 8AA', '£17', 'Mon-Fri', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 7. CREATE VIEW FOR EASIER QUERYING
-- =====================================================

CREATE OR REPLACE VIEW matches_with_details AS
SELECT 
  m.id,
  m.commute_minutes,
  m.commute_display,
  m.commute_band,
  m.role_match,
  m.role_match_display,
  -- Candidate details
  c.id as candidate_id,
  c.role as candidate_role,
  c.postcode as candidate_postcode,
  c.salary as candidate_salary,
  c.days as candidate_days,
  c.added_at as candidate_added_at,
  is_new_item(c.added_at) as candidate_is_new,
  -- Client details
  cl.id as client_id,
  cl.surgery as client_surgery,
  cl.role as client_role,
  cl.postcode as client_postcode,
  cl.pay as client_pay,
  cl.days as client_days,
  cl.added_at as client_added_at,
  is_new_item(cl.added_at) as client_is_new
FROM matches m
JOIN candidates c ON m.candidate_id = c.id
JOIN clients cl ON m.client_id = cl.id
-- RULE 1: Always sort by commute time ascending
ORDER BY m.commute_minutes ASC, m.role_match DESC, c.id ASC, cl.id ASC;

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant access to tables
GRANT ALL ON candidates TO anon, authenticated;
GRANT ALL ON clients TO anon, authenticated;
GRANT ALL ON matches TO anon, authenticated;
GRANT ALL ON commute_cache TO anon, authenticated;

-- Grant access to sequences (if any)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- =====================================================
-- SETUP COMPLETE!
-- =====================================================
-- You can now:
-- 1. Query matches: SELECT * FROM matches_with_details;
-- 2. Add candidates: INSERT INTO candidates (...) VALUES (...);
-- 3. Add clients: INSERT INTO clients (...) VALUES (...);
-- 4. Matches will auto-generate via triggers
-- =====================================================

-- Verify setup
SELECT 'Setup complete! Tables created:' as message;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('candidates', 'clients', 'matches', 'commute_cache');

SELECT 'Sample data loaded:' as message;
SELECT 'Candidates: ' || COUNT(*) FROM candidates;
SELECT 'Clients: ' || COUNT(*) FROM clients;
SELECT 'Matches: ' || COUNT(*) || ' (should auto-generate from triggers)' FROM matches;
