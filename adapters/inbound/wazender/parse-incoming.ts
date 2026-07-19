import type { IncomingMessage } from '@/core/domain/conversation'

export type WazenderWebhookPayload = {
  event: string
  timestamp: number
  data: {
    messages: {
      key: {
        id: string
        fromMe: boolean
        remoteJid: string
        cleanedSenderPn: string
      }
      messageBody: string
    }
  }
}

export function parseIncoming(payload: WazenderWebhookPayload): IncomingMessage | null {
  if (payload.event !== 'messages.received') return null
  if (payload.data?.messages?.key?.fromMe) return null

  const text = payload.data?.messages?.messageBody?.trim()
  const phone = payload.data?.messages?.key?.cleanedSenderPn

  if (!text || !phone) return null

  return { phone, text, messageId: payload.data.messages.key.id }
}
