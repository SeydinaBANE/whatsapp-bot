import type { ChatMessage } from '@/core/domain/conversation'

export interface ConversationRepositoryPort {
  getHistory(phone: string, limit?: number): Promise<ChatMessage[]>
  saveMessages(phone: string, userText: string, assistantText: string): Promise<void>
  isRateLimited(phone: string, maxPerMinute?: number): Promise<boolean>
  purgeOlderThan(days: number): Promise<number>
}
