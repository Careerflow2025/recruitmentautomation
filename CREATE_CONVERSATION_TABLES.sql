-- Run this SQL in your Supabase dashboard to create conversation storage tables

-- Create conversation_sessions table
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  last_activity TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

-- Create conversation_messages table
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_id ON conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_last_activity ON conversation_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_user ON conversation_messages(session_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_timestamp ON conversation_messages(timestamp);

-- Enable Row Level Security
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for conversation_sessions
CREATE POLICY "Users can access their own sessions" ON conversation_sessions
  FOR ALL USING (user_id = auth.uid()::text);

-- Create policies for conversation_messages  
CREATE POLICY "Users can access their own messages" ON conversation_messages
  FOR ALL USING (user_id = auth.uid()::text);

-- Grant permissions to authenticated users
GRANT ALL ON conversation_sessions TO authenticated;
GRANT ALL ON conversation_messages TO authenticated;