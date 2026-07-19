import { createHandleIncomingMessageUseCase } from '@/core/use-cases/handle-incoming-message.use-case'
import { wazenderMessagingAdapter } from '@/adapters/outbound/wazender/wazender-messaging.adapter'
import { supabaseConversationRepository } from '@/adapters/outbound/supabase/supabase-conversation-repository.adapter'
import { openrouterAiResponder } from '@/adapters/outbound/openrouter/openrouter-ai-responder.adapter'

export const handleIncomingMessage = createHandleIncomingMessageUseCase({
  conversationRepository: supabaseConversationRepository,
  aiResponder: openrouterAiResponder,
  messaging: wazenderMessagingAdapter,
})
