import { describe, it, expect, vi } from 'vitest'
import { createHandleIncomingMessageUseCase } from './handle-incoming-message.use-case'
import type { ConversationRepositoryPort } from '@/core/ports/outbound/conversation-repository.port'
import type { AiResponderPort } from '@/core/ports/outbound/ai-responder.port'
import type { MessagingPort } from '@/core/ports/outbound/messaging.port'

function makeDeps(overrides: Partial<{
  isRateLimited: boolean
  reply: string
  replyError: boolean
}> = {}) {
  const { isRateLimited = false, reply = 'hi', replyError = false } = overrides

  const conversationRepository: ConversationRepositoryPort = {
    getHistory: vi.fn().mockResolvedValue([]),
    saveMessages: vi.fn().mockResolvedValue(undefined),
    isRateLimited: vi.fn().mockResolvedValue(isRateLimited),
    purgeOlderThan: vi.fn().mockResolvedValue(0),
  }

  const aiResponder: AiResponderPort = {
    reply: replyError
      ? vi.fn().mockRejectedValue(new Error('llm down'))
      : vi.fn().mockResolvedValue(reply),
  }

  const messaging: MessagingPort = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }

  return { conversationRepository, aiResponder, messaging }
}

describe('handleIncomingMessage use case', () => {
  it('retourne rate_limited et ne génère pas de réponse si le numéro est limité', async () => {
    const deps = makeDeps({ isRateLimited: true })
    const useCase = createHandleIncomingMessageUseCase(deps)

    const outcome = await useCase.execute({ phone: '+221771234567', text: 'Salut', messageId: 'MSG1' })

    expect(outcome).toBe('rate_limited')
    expect(deps.aiResponder.reply).not.toHaveBeenCalled()
    expect(deps.messaging.sendMessage).not.toHaveBeenCalled()
  })

  it('envoie la réponse générée et sauvegarde la conversation', async () => {
    const deps = makeDeps({ reply: 'Bonjour !' })
    const useCase = createHandleIncomingMessageUseCase(deps)

    const outcome = await useCase.execute({ phone: '+221771234567', text: 'Salut', messageId: 'MSG1' })

    expect(outcome).toBe('ok')
    expect(deps.messaging.sendMessage).toHaveBeenCalledWith('+221771234567', 'Bonjour !')
    expect(deps.conversationRepository.saveMessages).toHaveBeenCalledWith('+221771234567', 'Salut', 'Bonjour !')
  })

  it("envoie un message d'excuse et retourne ok si le LLM échoue", async () => {
    const deps = makeDeps({ replyError: true })
    const useCase = createHandleIncomingMessageUseCase(deps)

    const outcome = await useCase.execute({ phone: '+221771234567', text: 'Salut', messageId: 'MSG1' })

    expect(outcome).toBe('ok')
    expect(deps.messaging.sendMessage).toHaveBeenCalledWith(
      '+221771234567',
      expect.stringContaining('problème technique')
    )
    expect(deps.conversationRepository.saveMessages).not.toHaveBeenCalled()
  })
})
