-- Check candidates
SELECT 'candidates' AS table_name, COUNT(*) AS count,
       STRING_AGG(DISTINCT postcode, ', ') AS postcodes
FROM candidates
UNION ALL
-- Check clients
SELECT 'clients' AS table_name, COUNT(*) AS count,
       STRING_AGG(DISTINCT postcode, ', ') AS postcodes
FROM clients
UNION ALL
-- Check matches
SELECT 'matches' AS table_name, COUNT(*) AS count,
       NULL AS postcodes
FROM matches;

-- Show sample candidates
SELECT 'Sample Candidates:' AS info;
SELECT id, role, postcode, added_at FROM candidates LIMIT 5;

-- Show sample clients
SELECT 'Sample Clients:' AS info;
SELECT id, surgery, role, postcode FROM clients LIMIT 5;
