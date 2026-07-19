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

`npm test` (Vitest) runs the unit tests — pure functions and use cases are tested in isolation (parsing, secret checks, `requireEnv`, the use case with fake adapters), colocated as `*.test.ts` next to the source file.

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

**Minimal Next.js 16 app — no UI, three API routes — built as a hexagonal (ports & adapters) application.** See `docs/ARCHITECTURE.md` for the full breakdown.

```
app/
  api/webhook/route.ts                    — POST: thin HTTP adapter, verifies ?token=, parses and delegates
  api/health/route.ts                     — GET: liveness check for external monitoring
  api/cron/purge-old-messages/route.ts    — GET: Vercel Cron, purges messages past the retention window
  layout.tsx                              — minimal root layout
  page.tsx                                — status page only
core/
  domain/conversation.ts                       — ChatMessage, IncomingMessage
  ports/inbound/handle-incoming-message.port.ts — use case contract
  ports/outbound/{messaging,conversation-repository,ai-responder}.port.ts
  use-cases/handle-incoming-message.use-case.ts — business logic (rate limit → history → LLM → send → save)
adapters/
  inbound/wazender/parse-incoming.ts                              — WazenderWebhookPayload → IncomingMessage
  inbound/wazender/verify-webhook-secret.ts                       — checks the webhook's ?token=
  inbound/cron/verify-cron-secret.ts                                — checks the cron route's Authorization header
  outbound/wazender/wazender-messaging.adapter.ts                 — implements MessagingPort
  outbound/supabase/supabase-conversation-repository.adapter.ts   — implements ConversationRepositoryPort (incl. purgeOlderThan)
  outbound/openrouter/openrouter-ai-responder.adapter.ts          — implements AiResponderPort
config/
  env.ts                 — requireEnv(): fail-fast validation for required env vars
  container.ts           — composition root: wires the 3 outbound adapters into the use case
supabase/
  migration.sql          — single `messages` table, indexed by phone and by created_at
vercel.json               — Vercel Cron schedule for the purge endpoint
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
  → isAuthorizedWebhookRequest()            — 401 if ?token= doesn't match WEBHOOK_SECRET
  → parseIncoming()                        — filter fromMe=true and non-message events
  → handleIncomingMessage.execute()        — core/use-cases/handle-incoming-message.use-case.ts
      → conversationRepository.isRateLimited(phone)
      → conversationRepository.getHistory(phone)   — last 20 messages from Supabase
      → aiResponder.reply()                        — Claude via OpenRouter with history as context
      → messaging.sendMessage(phone)                — Wazender API (wasenderapi.com)
      → conversationRepository.saveMessages()       — persist user + assistant messages to Supabase

GET /api/health                            — liveness check, no downstream calls

GET /api/cron/purge-old-messages           — Vercel Cron (daily, see vercel.json)
  → isAuthorizedCronRequest()               — 401 if Authorization header doesn't match CRON_SECRET
  → conversationRepository.purgeOlderThan(MESSAGE_RETENTION_DAYS)
```

## Key env vars

| Var | Used in |
|---|---|
| `WAZENDER_API_KEY` | `adapters/outbound/wazender/wazender-messaging.adapter.ts` — Bearer token for Wazender API |
| `OPENROUTER_API_KEY` | `adapters/outbound/openrouter/openrouter-ai-responder.adapter.ts` — OpenRouter auth |
| `SUPABASE_URL` + `SUPABASE_ANON_KEY` | `adapters/outbound/supabase/supabase-conversation-repository.adapter.ts` |
| `WEBHOOK_SECRET` | `app/api/webhook/route.ts` — required, checked against the `?token=` query param |
| `CRON_SECRET` | `app/api/cron/purge-old-messages/route.ts` — required, checked against the `Authorization: Bearer` header |
| `MESSAGE_RETENTION_DAYS` | Optional, defaults to `90` |
| `AI_MODEL` | Optional, defaults to `anthropic/claude-sonnet-4-5` |
| `SYSTEM_PROMPT` | Optional, controls bot persona |

## Supabase schema

Single table: `messages(id, phone, role, content, created_at)`.
No auth, RLS with open public policy (`USING (true)`).
History is fetched per `phone` number, last 20 messages, ordered ascending.
Messages older than `MESSAGE_RETENTION_DAYS` (default 90) are purged daily.
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
