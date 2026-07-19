# Architecture technique

## Vue d'ensemble

L'application est un serveur webhook **stateless** : elle ne garde aucun état en mémoire. Chaque requête entrante est traitée de façon indépendante. La persistance des conversations est entièrement déléguée à Supabase.

```
┌─────────────────────────────────────────────────────────────────┐
│  WhatsApp (utilisateur)                                         │
└──────────────────┬──────────────────────────────────────────────┘
                   │  message envoyé
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Wazender (wasenderapi.com)                                     │
│  Gère la session WhatsApp Web, reçoit les messages,             │
│  les forward en POST vers l'URL webhook configurée              │
└──────────────────┬──────────────────────────────────────────────┘
                   │  POST /api/webhook  { event, data }
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js — Vercel Edge / Node.js                                │
│                                                                 │
│  app/api/webhook/route.ts  (adapter HTTP entrant)               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. parseIncoming()          → filtre, extrait phone+text│   │
│  │ 2. handleIncomingMessage()  → use case core/             │   │
│  │      2a. isRateLimited()    → Supabase                  │   │
│  │      2b. getHistory()       → 20 derniers msgs           │   │
│  │      2c. reply()            → LLM via OpenRouter         │   │
│  │      2d. sendMessage()      → POST wasenderapi.com/send  │   │
│  │      2e. saveMessages()     → INSERT x2 dans Supabase    │   │
│  └─────────────────────────────────────────────────────────┘   │
└───┬─────────────────────┬────────────────────────┬─────────────┘
    │                     │                        │
    ▼                     ▼                        ▼
┌────────────┐  ┌──────────────────┐  ┌───────────────────────┐
│  Supabase  │  │    OpenRouter    │  │  Wazender send API    │
│  Postgres  │  │  (LLM gateway)   │  │  POST /send-message   │
│  messages  │  │  → Claude, GPT…  │  │                       │
└────────────┘  └──────────────────┘  └───────────────────────┘
```

## Flux de traitement (séquence)

```
Utilisateur  Wazender   /api/webhook   Supabase   OpenRouter   Wazender
    │            │            │            │           │            │
    │──msg──────►│            │            │           │            │
    │            │──POST──────►│            │           │            │
    │            │            │──SELECT────►│           │            │
    │            │            │◄──history──│           │            │
    │            │            │──chat()────────────────►│            │
    │            │            │◄──reply────────────────│            │
    │            │            │──POST──────────────────────────────►│
    │            │            │──INSERT────►│           │            │
    │            │            │◄───ok──────│           │            │
    │            │◄───200─────│            │           │            │
```

## Modules

L'application suit une architecture **hexagonale** (ports & adapters) : le domaine et l'orchestration (`core/`) ne dépendent d'aucune librairie externe, seulement d'interfaces (`ports`) ; les détails d'infrastructure (Wazender, Supabase, OpenRouter) vivent dans `adapters/` et implémentent ces interfaces.

```
core/
  domain/conversation.ts                       — types du domaine (ChatMessage, IncomingMessage)
  ports/inbound/handle-incoming-message.port.ts — contrat du use case
  ports/outbound/{messaging,conversation-repository,ai-responder}.port.ts
  use-cases/handle-incoming-message.use-case.ts — orchestration pure

adapters/
  inbound/wazender/parse-incoming.ts                              — traduit le webhook Wazender en IncomingMessage
  outbound/wazender/wazender-messaging.adapter.ts                 — implémente MessagingPort
  outbound/supabase/supabase-conversation-repository.adapter.ts   — implémente ConversationRepositoryPort
  outbound/openrouter/openrouter-ai-responder.adapter.ts          — implémente AiResponderPort

config/container.ts   — composition root : câble les 3 adapters outbound au use case

app/api/webhook/route.ts   — adapter HTTP entrant (seul point qui connaît Request/Response)
```

**Règle de dépendance :** `core/` n'importe jamais depuis `adapters/`. Les adapters importent les types de `core/ports` et `core/domain`, jamais l'inverse. `config/container.ts` est le seul fichier qui connaît à la fois `core/` et `adapters/`.

### `app/api/webhook/route.ts`

Point d'entrée unique. Parse le JSON entrant, appelle `parseIncoming()`, délègue au use case `handleIncomingMessage` (importé depuis `config/container.ts`), puis mappe le résultat (`'ok' | 'rate_limited'`) vers une `Response` HTTP. Ne contient aucune logique métier.

### `core/use-cases/handle-incoming-message.use-case.ts`

Orchestre le flux via les 3 ports outbound, sans connaître Supabase, Wazender ou OpenRouter :
1. `conversationRepository.isRateLimited(phone)` → retourne `'rate_limited'` si dépassé
2. `conversationRepository.getHistory(phone)` → 20 derniers messages
3. `aiResponder.reply(history, text)` → génère la réponse
4. `messaging.sendMessage(phone, reply)` → envoie sur WhatsApp
5. `conversationRepository.saveMessages(phone, text, reply)` → persiste

Si l'étape 3 ou 4 échoue, l'erreur est loggée (`console.error`) et un message d'excuse est envoyé (échec silencieux) — le use case retourne quand même `'ok'`.

### `adapters/inbound/wazender/parse-incoming.ts`

| Fonction | Entrée | Sortie | Effet |
|---|---|---|---|
| `parseIncoming(payload)` | `WazenderWebhookPayload` | `IncomingMessage \| null` | Aucun |

Retourne `null` (et le handler répond 200 immédiatement) dans deux cas :
- `event !== "messages.received"` (heartbeats, status, etc.)
- `key.fromMe === true` (messages envoyés par le bot lui-même — évite les boucles infinies)

### `adapters/outbound/wazender/wazender-messaging.adapter.ts`

Implémente `MessagingPort.sendMessage(to, text)` — `POST wasenderapi.com/api/send-message`, lève une erreur si `res.ok === false`.

### `adapters/outbound/supabase/supabase-conversation-repository.adapter.ts`

Implémente `ConversationRepositoryPort` :

| Méthode | Requête SQL | Comportement si erreur |
|---|---|---|
| `getHistory(phone, limit=20)` | `SELECT role, content WHERE phone=? ORDER BY created_at ASC LIMIT ?` | Retourne `[]` (data ?? []) |
| `saveMessages(phone, user, assistant)` | `INSERT x2` (user + assistant en même temps) | Silencieux (pas de throw) |
| `isRateLimited(phone, max=10)` | `COUNT WHERE phone=? AND role='user' AND created_at >= now()-60s` | — |

Les erreurs Supabase sont silencieuses par design : un échec de sauvegarde ne doit pas bloquer la réponse WhatsApp.

### `adapters/outbound/openrouter/openrouter-ai-responder.adapter.ts`

Implémente `AiResponderPort.reply(history, userText)` via `generateText()` (Vercel AI SDK). Contient l'initialisation du client OpenRouter et la valeur par défaut du system prompt.

**Décisions de conception :**
- `openrouter.chat(model)` et non `openrouter(model)` : force l'endpoint `/chat/completions`. OpenRouter ne supporte pas encore `/responses` (Vercel AI SDK v6).
- Le system prompt est lu à l'initialisation du module (une fois par cold start) depuis `process.env.SYSTEM_PROMPT`.
- Aucun middleware Next.js n'est utilisé — la validation se fait dans `parseIncoming()`.

## Modèle de données

```sql
messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT        NOT NULL,               -- ex: "+221771234567"
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
)

INDEX idx_messages_phone          ON messages(phone)
INDEX idx_messages_phone_created  ON messages(phone, created_at DESC)
```

**RLS :** Politique `public_access` ouverte (`USING (true)`). Acceptable car :
- La clé anon Supabase n'est utilisée que côté serveur (variables sans `NEXT_PUBLIC_` idéalement, voir [Sécurité](./SECURITY.md))
- Le webhook n'expose pas les données des messages vers l'extérieur

## Contraintes et limites

| Limite | Valeur | Origine |
|---|---|---|
| Historique de conversation | 20 messages | `getHistory(phone, 20)` dans `adapters/outbound/supabase/supabase-conversation-repository.adapter.ts` |
| Timeout Vercel (hobby) | 10 s | Serverless function limit |
| Timeout Vercel (pro) | 60 s | Serverless function limit |
| Modèle par défaut | `anthropic/claude-sonnet-4-5` | `AI_MODEL` env var |
| Taille max réponse LLM | Dépend du modèle | Non contraint côté app |

## Services externes — contrats

### Wazender (wasenderapi.com)

- **Webhook entrant** : POST vers l'URL configurée, corps JSON (voir `WazenderWebhookPayload` dans `adapters/inbound/wazender/parse-incoming.ts`)
- **Envoi** : `POST https://www.wasenderapi.com/api/send-message` — `Authorization: Bearer <WAZENDER_API_KEY>` — corps `{ to: string, text: string }`
- **Erreur** : throw si `res.ok === false`

### OpenRouter

- **Endpoint** : `https://openrouter.ai/api/v1` (compatible OpenAI)
- **Auth** : `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Appel** : `generateText()` via Vercel AI SDK, modèle configurable via `AI_MODEL`

### Supabase

- **Client** : `@supabase/supabase-js` v2, mode anon
- **Accès** : URL + clé anon (`SUPABASE_URL` / `SUPABASE_ANON_KEY`, server-only)
