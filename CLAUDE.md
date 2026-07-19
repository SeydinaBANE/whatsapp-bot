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

`npm test` (Vitest) runs the unit tests — `adapters/inbound/wazender/parse-incoming.test.ts` and `core/use-cases/handle-incoming-message.use-case.test.ts`.

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

**Minimal Next.js 16 app — no UI, only one API route — built as a hexagonal (ports & adapters) application.** See `docs/ARCHITECTURE.md` for the full breakdown.

```
app/
  api/webhook/route.ts   — POST: thin HTTP adapter, parses the request and delegates
  layout.tsx             — minimal root layout
  page.tsx               — status page only
core/
  domain/conversation.ts                       — ChatMessage, IncomingMessage
  ports/inbound/handle-incoming-message.port.ts — use case contract
  ports/outbound/{messaging,conversation-repository,ai-responder}.port.ts
  use-cases/handle-incoming-message.use-case.ts — business logic (rate limit → history → LLM → send → save)
adapters/
  inbound/wazender/parse-incoming.ts                              — WazenderWebhookPayload → IncomingMessage
  outbound/wazender/wazender-messaging.adapter.ts                 — implements MessagingPort
  outbound/supabase/supabase-conversation-repository.adapter.ts   — implements ConversationRepositoryPort
  outbound/openrouter/openrouter-ai-responder.adapter.ts          — implements AiResponderPort
config/
  container.ts           — composition root: wires the 3 outbound adapters into the use case
supabase/
  migration.sql          — single `messages` table, indexed by phone
```

Dependency rule: `core/` never imports from `adapters/`. Only `config/container.ts` knows both.

TypeScript path alias `@/` resolves to the project root.

## Documentation technique

| Fichier | Contenu |
|---|---|
| `docs/ARCHITECTURE.md` | Diagrammes, décisions de conception, limites |
| `docs/API.md` | Référence complète des endpoints et contrats externes |
| `docs/SECURITY.md` | Analyse de sécurité, points d'attention, recommandations |
| `CONTRIBUTING.md` | Workflow de dev, pre-commit, CI |
| `DOCUMENTATION.md` | Guide utilisateur (personnalisation, filtres, prompts) |

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
POST /api/webhook                          — app/api/webhook/route.ts (inbound HTTP adapter)
  → parseIncoming()                        — filter fromMe=true and non-message events
  → handleIncomingMessage.execute()        — core/use-cases/handle-incoming-message.use-case.ts
      → conversationRepository.isRateLimited(phone)
      → conversationRepository.getHistory(phone)   — last 20 messages from Supabase
      → aiResponder.reply()                        — Claude via OpenRouter with history as context
      → messaging.sendMessage(phone)                — Wazender API (wasenderapi.com)
      → conversationRepository.saveMessages()       — persist user + assistant messages to Supabase
```

## Key env vars

| Var | Used in |
|---|---|
| `WAZENDER_API_KEY` | `adapters/outbound/wazender/wazender-messaging.adapter.ts` — Bearer token for Wazender API |
| `OPENROUTER_API_KEY` | `adapters/outbound/openrouter/openrouter-ai-responder.adapter.ts` — OpenRouter auth |
| `SUPABASE_URL` + `SUPABASE_ANON_KEY` | `adapters/outbound/supabase/supabase-conversation-repository.adapter.ts` |
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
