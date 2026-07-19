import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { requireEnv } from '@/config/env'
import type { AiResponderPort } from '@/core/ports/outbound/ai-responder.port'

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: requireEnv('OPENROUTER_API_KEY'),
})

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ??
  'You are a helpful assistant. Reply concisely. Always respond in the same language as the user.'

export const openrouterAiResponder: AiResponderPort = {
  async reply(history, userText) {
    const { text } = await generateText({
      model: openrouter.chat(process.env.AI_MODEL ?? 'anthropic/claude-sonnet-4-5'),
      system: SYSTEM_PROMPT,
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userText },
      ],
    })

    return text
  },
}
