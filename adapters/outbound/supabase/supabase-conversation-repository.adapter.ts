import { createClient } from '@supabase/supabase-js'
import { requireEnv } from '@/config/env'
import type { ChatMessage } from '@/core/domain/conversation'
import type { ConversationRepositoryPort } from '@/core/ports/outbound/conversation-repository.port'

const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_ANON_KEY')
)

export const supabaseConversationRepository: ConversationRepositoryPort = {
  async getHistory(phone, limit = 20) {
    const { data } = await supabase
      .from('messages')
      .select('role, content')
      .eq('phone', phone)
      .order('created_at', { ascending: true })
      .limit(limit)

    return (data ?? []) as ChatMessage[]
  },

  async saveMessages(phone, userText, assistantText) {
    await supabase.from('messages').insert([
      { phone, role: 'user', content: userText },
      { phone, role: 'assistant', content: assistantText },
    ])
  },

  async isRateLimited(phone, maxPerMinute = 10) {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('role', 'user')
      .gte('created_at', new Date(Date.now() - 60_000).toISOString())

    return (count ?? 0) >= maxPerMinute
  },

  async purgeOlderThan(days) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('messages')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)

    return count ?? 0
  },
}
