const BASE_URL = 'https://www.wasenderapi.com/api'
const API_KEY = process.env.WAZENDER_API_KEY!

export type IncomingMessage = {
  phone: string
  text: string
  messageId: string
}

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

export async function sendMessage(to: string, text: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Wazender send failed: ${res.status} — ${body}`)
  }
}
