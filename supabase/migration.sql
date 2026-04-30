-- Run in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
CREATE INDEX IF NOT EXISTS idx_messages_phone_created ON messages(phone, created_at DESC);

-- RLS: open access
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_access" ON messages FOR ALL USING (true) WITH CHECK (true);
