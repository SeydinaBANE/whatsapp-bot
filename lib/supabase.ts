import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type DbMessage = {
  id: string
  phone: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export async function getHistory(phone: string, limit = 20) {
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('phone', phone)
    .order('created_at', { ascending: true })
    .limit(limit)

  return (data ?? []) as { role: 'user' | 'assistant'; content: string }[]
}

export async function saveMessages(
  phone: string,
  userText: string,
  assistantText: string
) {
  await supabase.from('messages').insert([
    { phone, role: 'user', content: userText },
    { phone, role: 'assistant', content: assistantText },
  ])
}
