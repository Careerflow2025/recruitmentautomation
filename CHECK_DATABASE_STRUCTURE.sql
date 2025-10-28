-- =====================================================
-- CHECK EXACT DATABASE STRUCTURE
-- Run this in Supabase SQL Editor to see all fields
-- =====================================================

-- 1. Show EXACT structure of candidates table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'candidates'
ORDER BY ordinal_position;

-- 2. Show EXACT structure of clients table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;

-- 3. Show sample data from candidates (first 5 rows)
SELECT * FROM candidates LIMIT 5;

-- 4. Show sample data from clients (first 5 rows)
SELECT * FROM clients LIMIT 5;

-- 5. Show all column names in one line for easy copying
SELECT
  'CANDIDATES FIELDS: ' || string_agg(column_name, ', ' ORDER BY ordinal_position) as fields
FROM information_schema.columns
WHERE table_name = 'candidates';

SELECT
  'CLIENTS FIELDS: ' || string_agg(column_name, ', ' ORDER BY ordinal_position) as fields
FROM information_schema.columns
WHERE table_name = 'clients';