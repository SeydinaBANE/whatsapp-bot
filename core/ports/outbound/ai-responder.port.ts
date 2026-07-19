import type { ChatMessage } from '@/core/domain/conversation'

export interface AiResponderPort {
  reply(history: ChatMessage[], userText: string): Promise<string>
}
