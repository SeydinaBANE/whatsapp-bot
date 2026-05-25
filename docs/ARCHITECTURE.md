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
│  app/api/webhook/route.ts                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. parseIncoming()   → filtre, extrait phone + text     │   │
│  │ 2. getHistory()      → 20 derniers msgs (phone)         │   │
│  │ 3. generateText()    → appel LLM via OpenRouter         │   │
│  │ 4. sendMessage()     → POST wasenderapi.com/send        │   │
│  │ 5. saveMessages()    → INSERT x2 dans Supabase          │   │
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

### `app/api/webhook/route.ts`

Point d'entrée unique. Orchestre les 5 étapes du flux. Contient aussi l'initialisation du client OpenRouter et la valeur par défaut du system prompt.

**Décisions de conception :**
- `openrouter.chat(model)` et non `openrouter(model)` : force l'endpoint `/chat/completions`. OpenRouter ne supporte pas encore `/responses` (Vercel AI SDK v6).
- Le system prompt est lu à l'initialisation du module (une fois par cold start) depuis `process.env.SYSTEM_PROMPT`.
- Aucun middleware Next.js n'est utilisé — la validation se fait dans `parseIncoming()`.

### `lib/wazender.ts`

Deux responsabilités :

| Fonction | Entrée | Sortie | Effet |
|---|---|---|---|
| `parseIncoming(payload)` | `WazenderWebhookPayload` | `IncomingMessage \| null` | Aucun |
| `sendMessage(to, text)` | `string, string` | `void` | POST wasenderapi.com |

`parseIncoming` retourne `null` (et le handler répond 200 immédiatement) dans deux cas :
- `event !== "messages.received"` (heartbeats, status, etc.)
- `key.fromMe === true` (messages envoyés par le bot lui-même — évite les boucles infinies)

### `lib/supabase.ts`

Deux fonctions sur une seule table :

| Fonction | Requête SQL | Comportement si erreur |
|---|---|---|
| `getHistory(phone, limit=20)` | `SELECT role, content WHERE phone=? ORDER BY created_at ASC LIMIT ?` | Retourne `[]` (data ?? []) |
| `saveMessages(phone, user, assistant)` | `INSERT x2` (user + assistant en même temps) | Silencieux (pas de throw) |

Les erreurs Supabase sont silencieuses par design : un échec de sauvegarde ne doit pas bloquer la réponse WhatsApp.

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
| Historique de conversation | 20 messages | `getHistory(phone, 20)` dans `lib/supabase.ts` |
| Timeout Vercel (hobby) | 10 s | Serverless function limit |
| Timeout Vercel (pro) | 60 s | Serverless function limit |
| Modèle par défaut | `anthropic/claude-sonnet-4-5` | `AI_MODEL` env var |
| Taille max réponse LLM | Dépend du modèle | Non contraint côté app |

## Services externes — contrats

### Wazender (wasenderapi.com)

- **Webhook entrant** : POST vers l'URL configurée, corps JSON (voir `WazenderWebhookPayload` dans `lib/wazender.ts`)
- **Envoi** : `POST https://www.wasenderapi.com/api/send-message` — `Authorization: Bearer <WAZENDER_API_KEY>` — corps `{ to: string, text: string }`
- **Erreur** : throw si `res.ok === false`

### OpenRouter

- **Endpoint** : `https://openrouter.ai/api/v1` (compatible OpenAI)
- **Auth** : `Authorization: Bearer <OPENROUTER_API_KEY>`
- **Appel** : `generateText()` via Vercel AI SDK, modèle configurable via `AI_MODEL`

### Supabase

- **Client** : `@supabase/supabase-js` v2, mode anon
- **Accès** : URL + clé anon (`NEXT_PUBLIC_SUPABASE_*`)
