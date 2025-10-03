-- =====================================================
-- INSERT REAL UK SAMPLE DATA
-- =====================================================
-- Real UK postcodes for testing
-- After inserting, run: POST /api/regenerate-matches
-- to calculate REAL Google Maps commute times
-- =====================================================

-- =====================================================
-- INSERT REAL CANDIDATES (Greater London area)
-- =====================================================

INSERT INTO candidates (id, role, postcode, salary, days, phone, notes, experience, travel_flexibility, added_at)
VALUES
  -- Bromley area
  ('CAN001', 'Dentist', 'BR1 1AA', '£80k-£100k', '4-5', '07700 900001', 'Experienced GDP', '8 years NHS + Private', 'Up to 45 min', NOW() - INTERVAL '1 day'),
  ('CAN002', 'Dental Nurse', 'BR1 1AA', '£24k-£28k', '5', '07700 900002', 'Qualified DN', '3 years', 'Up to 30 min', NOW() - INTERVAL '2 days'),

  -- Croydon area
  ('CAN003', 'Dental Hygienist', 'CR0 1PB', '£35k-£42k', '3-4', '07700 900003', 'Self-employed', '5 years', 'Up to 60 min', NOW() - INTERVAL '10 hours'),
  ('CAN004', 'Dentist', 'CR0 2AB', '£70k-£90k', '3', '07700 900004', 'Part-time', '6 years', 'Up to 40 min', NOW() - INTERVAL '5 days'),

  -- Greenwich area
  ('CAN005', 'Dental Nurse', 'SE10 8EW', '£22k-£26k', '5', '07700 900005', 'Trainee qualification', '2 years', 'Up to 45 min', NOW() - INTERVAL '3 days'),
  ('CAN006', 'Practice Manager', 'SE10 0AA', '£32k-£38k', '5', '07700 900006', 'SOE experience', '7 years', 'Up to 50 min', NOW() - INTERVAL '6 days'),

  -- Lewisham area
  ('CAN007', 'Dental Receptionist', 'SE13 5AB', '£20k-£24k', '4-5', '07700 900007', 'Front desk', '4 years', 'Up to 35 min', NOW() - INTERVAL '20 hours'),
  ('CAN008', 'Dental Therapist', 'SE13 6TY', '£38k-£45k', '4', '07700 900008', 'Children specialist', '4 years', 'Up to 55 min', NOW() - INTERVAL '4 days'),

  -- Wimbledon area
  ('CAN009', 'Dentist', 'SW19 1AA', '£85k-£110k', '5', '07700 900009', 'Implants & Cosmetic', '10 years', 'Up to 40 min', NOW() - INTERVAL '15 hours'),
  ('CAN010', 'Dental Nurse', 'SW19 2BB', '£23k-£27k', '3-4', '07700 900010', 'Part-time preferred', '5 years', 'Up to 30 min', NOW() - INTERVAL '7 days'),

  -- Kingston area
  ('CAN011', 'Dental Hygienist', 'KT2 5AA', '£36k-£44k', '4-5', '07700 900011', 'Perio focus', '6 years', 'Up to 50 min', NOW() - INTERVAL '2 days'),
  ('CAN012', 'Trainee Dental Nurse', 'KT1 1AA', '£18k-£22k', '5', '07700 900012', 'Recently qualified', '1 year', 'Up to 60 min', NOW() - INTERVAL '30 hours')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- INSERT REAL CLIENTS (Greater London surgeries)
-- =====================================================

INSERT INTO clients (id, surgery, role, postcode, pay, days, added_at)
VALUES
  -- Bromley surgeries
  ('CL001', 'Bromley Dental Care', 'Dentist', 'BR2 9AA', '£450-£550/day', '3-5', NOW() - INTERVAL '5 days'),
  ('CL002', 'Hayes Lane Practice', 'Dental Nurse', 'BR2 9AA', '£100-£120/day', '5', NOW() - INTERVAL '3 days'),

  -- Croydon surgeries
  ('CL003', 'Croydon Family Dentist', 'Dental Hygienist', 'CR0 2AB', '£250-£300/day', '3-4', NOW() - INTERVAL '10 hours'),
  ('CL004', 'Central Croydon Dental', 'Dentist', 'CR0 1PB', '£500-£600/day', '4', NOW() - INTERVAL '2 days'),

  -- Greenwich surgeries
  ('CL005', 'Greenwich Smile Clinic', 'Practice Manager', 'SE10 0AA', '£150-£180/day', '5', NOW() - INTERVAL '4 days'),
  ('CL006', 'Royal Greenwich Dental', 'Dental Nurse', 'SE10 9HT', '£95-£115/day', '5', NOW() - INTERVAL '20 hours'),

  -- Wimbledon surgeries
  ('CL007', 'Wimbledon Dental Spa', 'Dentist', 'SW19 2BB', '£480-£580/day', '3-5', NOW() - INTERVAL '6 days'),
  ('CL008', 'Centre Court Dentistry', 'Dental Receptionist', 'SW19 1AA', '£85-£100/day', '5', NOW() - INTERVAL '1 day'),

  -- Kingston surgeries
  ('CL009', 'Kingston Dental Studio', 'Dental Therapist', 'KT1 1AA', '£200-£250/day', '4-5', NOW() - INTERVAL '15 hours'),
  ('CL010', 'Eden Street Practice', 'Dental Hygienist', 'KT2 6AA', '£280-£320/day', '3-4', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- VERIFY DATA INSERTED
-- =====================================================

SELECT
  'candidates' AS table_name,
  COUNT(*) AS record_count
FROM candidates
UNION ALL
SELECT
  'clients',
  COUNT(*)
FROM clients;

-- =====================================================
-- NEXT STEP: Generate matches with Google Maps API
-- =====================================================
-- Run this command in your terminal:
-- curl -X POST http://localhost:3004/api/regenerate-matches
--
-- This will calculate REAL commute times using Google Maps API
-- =====================================================

SELECT 'Real data inserted! Now run: POST /api/regenerate-matches to calculate Google Maps commute times.' AS next_step;
