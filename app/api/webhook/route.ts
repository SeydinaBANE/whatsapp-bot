import { requireEnv } from '@/config/env'
import { parseIncoming, type WazenderWebhookPayload } from '@/adapters/inbound/wazender/parse-incoming'
import { isAuthorizedWebhookRequest } from '@/adapters/inbound/wazender/verify-webhook-secret'
import { handleIncomingMessage } from '@/config/container'

const WEBHOOK_SECRET = requireEnv('WEBHOOK_SECRET')

export async function POST(req: Request) {
  if (!isAuthorizedWebhookRequest(new URL(req.url), WEBHOOK_SECRET)) {
    return new Response('unauthorized', { status: 401 })
  }

  let payload: WazenderWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const incoming = parseIncoming(payload)
  if (!incoming) return new Response('ignored', { status: 200 })

  const outcome = await handleIncomingMessage.execute(incoming)

  if (outcome === 'rate_limited') {
    return new Response('rate limited', { status: 200 })
  }

  return new Response('ok', { status: 200 })
}
