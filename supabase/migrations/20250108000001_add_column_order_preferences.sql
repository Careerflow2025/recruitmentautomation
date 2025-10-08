-- Create table to store user's column order preferences
CREATE TABLE IF NOT EXISTS column_order_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('candidates', 'clients')),
  column_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, table_name)
);

-- Create index for faster queries
CREATE INDEX idx_column_order_user_table ON column_order_preferences(user_id, table_name);

-- Enable Row Level Security
ALTER TABLE column_order_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own column order"
  ON column_order_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own column order"
  ON column_order_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own column order"
  ON column_order_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own column order"
  ON column_order_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_column_order_preferences_updated_at BEFORE UPDATE ON column_order_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
