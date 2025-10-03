-- Add system column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS system TEXT;

-- Verify column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'clients' 
ORDER BY ordinal_position;
