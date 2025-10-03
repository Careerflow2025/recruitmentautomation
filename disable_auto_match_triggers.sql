-- Disable automatic match regeneration triggers
-- These were causing updates to candidates/clients to regenerate matches
-- which would overwrite the updated postcodes

-- Drop the triggers
DROP TRIGGER IF EXISTS regenerate_matches_on_candidate_change ON candidates;
DROP TRIGGER IF EXISTS regenerate_matches_on_client_change ON clients;

-- Optionally drop the trigger functions too
DROP FUNCTION IF EXISTS trigger_regenerate_candidate_matches();
DROP FUNCTION IF EXISTS trigger_regenerate_client_matches();

SELECT 'Auto-match triggers disabled. Updates to candidates/clients will NO LONGER auto-regenerate matches.' AS status;
SELECT 'To regenerate matches, use the "Generate Matches" button in the UI.' AS note;
