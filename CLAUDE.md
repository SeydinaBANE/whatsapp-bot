# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical: Next.js 16 Breaking Changes

This project runs **Next.js 16.2.4**. Always read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js-specific code.

## Commands

```bash
npm run dev      # Start dev server (port 3000 or next available)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture

**Minimal Next.js app — no UI, only one API route.**

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

## Flow

```
POST /api/webhook
  → parseIncoming()       — filter fromMe=true and non-message events
  → getHistory(phone)     — last 20 messages from Supabase
  → generateText()        — Claude via OpenRouter with history as context
  → sendMessage(phone)    — Wazender API
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
No auth, RLS with public access policy.
History is fetched per `phone` number, last 20 messages, ordered ascending.

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
