import type { IncomingMessage } from '@/core/domain/conversation'
import type {
  HandleIncomingMessageOutcome,
  HandleIncomingMessageUseCase,
} from '@/core/ports/inbound/handle-incoming-message.port'
import type { ConversationRepositoryPort } from '@/core/ports/outbound/conversation-repository.port'
import type { AiResponderPort } from '@/core/ports/outbound/ai-responder.port'
import type { MessagingPort } from '@/core/ports/outbound/messaging.port'

const FALLBACK_REPLY = 'Désolé, je rencontre un problème technique. Réessaie dans quelques instants.'

export function createHandleIncomingMessageUseCase(deps: {
  conversationRepository: ConversationRepositoryPort
  aiResponder: AiResponderPort
  messaging: MessagingPort
}): HandleIncomingMessageUseCase {
  return {
    async execute({ phone, text }: IncomingMessage): Promise<HandleIncomingMessageOutcome> {
      if (await deps.conversationRepository.isRateLimited(phone)) {
        return 'rate_limited'
      }

      const history = await deps.conversationRepository.getHistory(phone)

      try {
        const reply = await deps.aiResponder.reply(history, text)
        await deps.messaging.sendMessage(phone, reply)
        await deps.conversationRepository.saveMessages(phone, text, reply)
      } catch (err) {
        console.error('[handle-incoming-message] error:', err)
        await deps.messaging.sendMessage(phone, FALLBACK_REPLY).catch(() => null)
      }

      return 'ok'
    },
  }
}
