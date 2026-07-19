import { requireEnv } from '@/config/env'
import type { MessagingPort } from '@/core/ports/outbound/messaging.port'

const BASE_URL = 'https://www.wasenderapi.com/api'
const API_KEY = requireEnv('WAZENDER_API_KEY')

export const wazenderMessagingAdapter: MessagingPort = {
  async sendMessage(to, text) {
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
  },
}
