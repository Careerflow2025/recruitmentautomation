-- ============================================
-- EXCEL-LIKE GRID - REQUIRED DATABASE SETUP
-- ============================================
-- Run this ONCE in Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste this → Run
-- ============================================

-- 1. CREATE CUSTOM COLUMNS TABLES
-- ============================================

-- Table to store custom column definitions
CREATE TABLE IF NOT EXISTS custom_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('candidates', 'clients')),
  column_name TEXT NOT NULL,
  column_label TEXT NOT NULL,
  column_type TEXT NOT NULL DEFAULT 'text' CHECK (column_type IN ('text', 'number', 'date', 'email', 'phone', 'url')),
  column_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, table_name, column_name)
);

-- Table to store custom column data for candidates
CREATE TABLE IF NOT EXISTS candidate_custom_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  column_name TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, candidate_id, column_name)
);

-- Table to store custom column data for clients
CREATE TABLE IF NOT EXISTS client_custom_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  column_name TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, client_id, column_name)
);

-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_custom_columns_user_table
  ON custom_columns(user_id, table_name);

CREATE INDEX IF NOT EXISTS idx_candidate_custom_data_user_candidate
  ON candidate_custom_data(user_id, candidate_id);

CREATE INDEX IF NOT EXISTS idx_client_custom_data_user_client
  ON client_custom_data(user_id, client_id);

-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE custom_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_custom_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_custom_data ENABLE ROW LEVEL SECURITY;

-- 4. CREATE RLS POLICIES - custom_columns
-- ============================================

DROP POLICY IF EXISTS "Users can view their own custom columns" ON custom_columns;
CREATE POLICY "Users can view their own custom columns"
  ON custom_columns FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own custom columns" ON custom_columns;
CREATE POLICY "Users can insert their own custom columns"
  ON custom_columns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own custom columns" ON custom_columns;
CREATE POLICY "Users can update their own custom columns"
  ON custom_columns FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own custom columns" ON custom_columns;
CREATE POLICY "Users can delete their own custom columns"
  ON custom_columns FOR DELETE
  USING (auth.uid() = user_id);

-- 5. CREATE RLS POLICIES - candidate_custom_data
-- ============================================

DROP POLICY IF EXISTS "Users can view their own candidate custom data" ON candidate_custom_data;
CREATE POLICY "Users can view their own candidate custom data"
  ON candidate_custom_data FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own candidate custom data" ON candidate_custom_data;
CREATE POLICY "Users can insert their own candidate custom data"
  ON candidate_custom_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own candidate custom data" ON candidate_custom_data;
CREATE POLICY "Users can update their own candidate custom data"
  ON candidate_custom_data FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own candidate custom data" ON candidate_custom_data;
CREATE POLICY "Users can delete their own candidate custom data"
  ON candidate_custom_data FOR DELETE
  USING (auth.uid() = user_id);

-- 6. CREATE RLS POLICIES - client_custom_data
-- ============================================

DROP POLICY IF EXISTS "Users can view their own client custom data" ON client_custom_data;
CREATE POLICY "Users can view their own client custom data"
  ON client_custom_data FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own client custom data" ON client_custom_data;
CREATE POLICY "Users can insert their own client custom data"
  ON client_custom_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own client custom data" ON client_custom_data;
CREATE POLICY "Users can update their own client custom data"
  ON client_custom_data FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own client custom data" ON client_custom_data;
CREATE POLICY "Users can delete their own client custom data"
  ON client_custom_data FOR DELETE
  USING (auth.uid() = user_id);

-- 7. CREATE HELPER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. CREATE TRIGGERS FOR AUTO-TIMESTAMP
-- ============================================

DROP TRIGGER IF EXISTS update_custom_columns_updated_at ON custom_columns;
CREATE TRIGGER update_custom_columns_updated_at
  BEFORE UPDATE ON custom_columns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_candidate_custom_data_updated_at ON candidate_custom_data;
CREATE TRIGGER update_candidate_custom_data_updated_at
  BEFORE UPDATE ON candidate_custom_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_custom_data_updated_at ON client_custom_data;
CREATE TRIGGER update_client_custom_data_updated_at
  BEFORE UPDATE ON client_custom_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ✅ DONE! Your Excel-like grid is ready to use
-- ============================================
-- Go to: http://localhost:3000/candidates or /clients
-- The grid will now load without "Failed to fetch" errors
-- ============================================
