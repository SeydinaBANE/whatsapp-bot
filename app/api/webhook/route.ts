import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { parseIncoming, sendMessage, type WazenderWebhookPayload } from '@/lib/wazender'
import { getHistory, saveMessages, isRateLimited } from '@/lib/supabase'

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ??
  'You are a helpful assistant. Reply concisely. Always respond in the same language as the user.'

export async function POST(req: Request) {
  let payload: WazenderWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const incoming = parseIncoming(payload)
  if (!incoming) return new Response('ignored', { status: 200 })

  const { phone, text } = incoming

  if (await isRateLimited(phone)) {
    return new Response('rate limited', { status: 200 })
  }

  const history = await getHistory(phone)

  try {
    const { text: reply } = await generateText({
      model: openrouter.chat(process.env.AI_MODEL ?? 'anthropic/claude-sonnet-4-5'),
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ],
    })

    await sendMessage(phone, reply)
    await saveMessages(phone, text, reply)
  } catch (err) {
    console.error('[webhook] error:', err)
    await sendMessage(phone, "Désolé, je rencontre un problème technique. Réessaie dans quelques instants.").catch(() => null)
  }

  return new Response('ok', { status: 200 })
}
