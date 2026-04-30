# whatsapp-bot

WhatsApp AI chatbot — responds to incoming messages using Claude via OpenRouter. Conversation history stored in Supabase.

## How it works

```
WhatsApp → Wazender → POST /api/webhook → Claude → Wazender → WhatsApp
                                ↕
                        Supabase (history per phone number)
```

## Quick start

**1. Clone and install**

```bash
git clone https://github.com/SeydinaBANE/whatsapp-bot.git
cd whatsapp-bot
npm install
```

**2. Configure environment**

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `WAZENDER_API_KEY` | Session key from wasenderapi.com → Sessions → 🔑 |
| `OPENROUTER_API_KEY` | openrouter.ai/keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `AI_MODEL` | Optional — default: `anthropic/claude-sonnet-4-5` |
| `SYSTEM_PROMPT` | Optional — customize the bot persona |

**3. Create database table**

In your Supabase project → SQL Editor, run [`supabase/migration.sql`](./supabase/migration.sql).

**4. Run**

```bash
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the project on [vercel.com](https://vercel.com)
3. Add the environment variables in **Settings → Environment Variables**
4. Deploy

**5. Configure Wazender webhook**

In wasenderapi.com → your session → Webhook:
```
https://your-project.vercel.app/api/webhook
```

## Customize

**Change AI model** — edit `AI_MODEL` in env:
```
AI_MODEL=openai/gpt-4o
```

**Change bot persona** — edit `SYSTEM_PROMPT` in env:
```
SYSTEM_PROMPT=You are a customer support agent for Acme store. Be friendly and concise.
```

**Add logic** — edit `app/api/webhook/route.ts` to add filtering, routing, or custom responses.

## License

MIT
