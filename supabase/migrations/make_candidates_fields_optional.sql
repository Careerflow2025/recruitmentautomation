-- Make candidate fields optional (except id, role, postcode which are truly required)
-- This allows adding candidates with partial information

ALTER TABLE candidates
  ALTER COLUMN salary DROP NOT NULL,
  ALTER COLUMN days DROP NOT NULL;

-- Same for clients - make optional fields truly optional
ALTER TABLE clients
  ALTER COLUMN budget DROP NOT NULL,
  ALTER COLUMN requirement DROP NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN candidates.salary IS 'Optional: Salary expectation or range';
COMMENT ON COLUMN candidates.days IS 'Optional: Preferred working days/availability';
COMMENT ON COLUMN clients.budget IS 'Optional: Budget/pay offered';
COMMENT ON COLUMN clients.requirement IS 'Optional: Required days/availability';
