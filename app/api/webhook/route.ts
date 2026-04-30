import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { parseIncoming, sendMessage, type WazenderWebhookPayload } from '@/lib/wazender'
import { getHistory, saveMessages } from '@/lib/supabase'

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ??
  'You are a helpful assistant. Reply concisely. Always respond in the same language as the user.'

export async function POST(req: Request) {
  const payload = (await req.json()) as WazenderWebhookPayload

  const incoming = parseIncoming(payload)
  if (!incoming) return new Response('ignored', { status: 200 })

  const { phone, text } = incoming

  const history = await getHistory(phone)

  const { text: reply } = await generateText({
    model: openrouter(process.env.AI_MODEL ?? 'anthropic/claude-sonnet-4-5'),
    system: SYSTEM_PROMPT,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: text },
    ],
  })

  await sendMessage(phone, reply)
  await saveMessages(phone, text, reply)

  return new Response('ok', { status: 200 })
}
