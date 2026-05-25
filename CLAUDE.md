# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (port 3000 or next available)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run typecheck  # tsc --noEmit
npm run check      # lint + typecheck
```

Raccourcis Makefile disponibles : `make dev`, `make build`, `make lint`, `make check`, `make webhook` (envoie un curl de test au webhook local).

No test suite is configured. There is no `test` script.

## Pre-commit hooks

`husky` + `lint-staged` sont configurés. À chaque commit :
1. `lint-staged` — ESLint avec auto-fix sur les `.ts`/`.tsx` staged
2. `tsc --noEmit` — vérification des types sur tout le projet

Pour bypasser (à éviter) : `git commit --no-verify`.

## CI/CD

`.github/workflows/ci.yml` s'exécute sur push et PR vers `main` :
- `npm run lint`
- `npm run typecheck`
- `npm run build` (avec des variables d'env placeholder — le build ne fait pas d'appels réseau)

Le déploiement en production est géré par **Vercel** directement depuis GitHub (pas de workflow deploy dans le repo).

## Architecture

**Minimal Next.js 16 app — no UI, only one API route.**

```
app/
  api/webhook/route.ts   — POST: receives Wazender webhooks, calls Claude, replies on WhatsApp
  layout.tsx             — minimal root layout
  page.tsx               — status page only
lib/
  wazender.ts            — parseIncoming() + sendMessage()
  supabase.ts            — getHistory(phone) + saveMessages(phone, user, assistant)
supabase/
  migration.sql          — single `messages` table, indexed by phone
```

TypeScript path alias `@/` resolves to the project root.

## AI Stack

Uses **Vercel AI SDK** (`ai` v6) with the `@ai-sdk/openai` adapter pointed at OpenRouter:

```ts
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})
```

**Critical**: always call `openrouter.chat(modelId)` — not `openrouter(modelId)`. Using the bare form bypasses Chat Completions and breaks the API call (past bug, fixed in commit `32d5da0`).

## Flow

```
POST /api/webhook
  → parseIncoming()       — filter fromMe=true and non-message events
  → getHistory(phone)     — last 20 messages from Supabase
  → generateText()        — Claude via OpenRouter with history as context
  → sendMessage(phone)    — Wazender API (wasenderapi.com)
  → saveMessages()        — persist user + assistant messages to Supabase
```

## Key env vars

| Var | Used in |
|---|---|
| `WAZENDER_API_KEY` | `lib/wazender.ts` — Bearer token for Wazender API |
| `OPENROUTER_API_KEY` | `app/api/webhook/route.ts` — OpenRouter auth |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase.ts` |
| `AI_MODEL` | Optional, defaults to `anthropic/claude-sonnet-4-5` |
| `SYSTEM_PROMPT` | Optional, controls bot persona |

## Supabase schema

Single table: `messages(id, phone, role, content, created_at)`.
No auth, RLS with open public policy (`USING (true)`).
History is fetched per `phone` number, last 20 messages, ordered ascending.
Run `supabase/migration.sql` in the Supabase SQL editor to initialize.

## Wazender webhook payload

```json
{
  "event": "messages.received",
  "data": {
    "messages": {
      "key": { "fromMe": false, "cleanedSenderPn": "+1234567890" },
      "messageBody": "Hello"
    }
  }
}
```

Events where `fromMe=true` or `event !== "messages.received"` are ignored (returns 200 immediately).
`sendMessage` posts to `POST https://www.wasenderapi.com/api/send-message` with `{ to, text }`.
