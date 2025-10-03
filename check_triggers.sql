-- Check if the auto-match triggers still exist

SELECT
  trigger_name,
  event_object_table,
  action_statement,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name IN (
  'regenerate_matches_on_candidate_change',
  'regenerate_matches_on_client_change'
);

-- Check if the trigger functions still exist
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'trigger_regenerate_candidate_matches',
  'trigger_regenerate_client_matches'
)
AND routine_schema = 'public';

-- List ALL triggers on candidates and clients tables
SELECT
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table IN ('candidates', 'clients');
