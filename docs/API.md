# Référence API

## `POST /api/webhook`

Point d'entrée unique de l'application. Reçoit les événements Wazender et déclenche le flow de réponse IA.

### Authentification

Protégé par un secret partagé passé en query param : `?token=<WEBHOOK_SECRET>`. Vérifié par `isAuthorizedWebhookRequest()` (`adapters/inbound/wazender/verify-webhook-secret.ts`) avant même le parsing du corps — retourne `401` si absent ou incorrect. C'est une mitigation applicative en attendant que Wazender supporte une signature HMAC (voir [Sécurité](./SECURITY.md#1-pas-de-validation-de-signature-webhook)).

### Requête

**Headers requis :**
```
Content-Type: application/json
```

**Corps (JSON) :**

```typescript
{
  event: string                  // Seul "messages.received" est traité
  timestamp: number              // Unix timestamp (ms)
  data: {
    messages: {
      key: {
        id: string               // ID unique du message
        fromMe: boolean          // true = ignoré (évite les boucles)
        remoteJid: string        // JID WhatsApp complet
        cleanedSenderPn: string  // Numéro E.164 ex: "+221771234567"
      }
      messageBody: string        // Contenu du message
    }
  }
}
```

### Réponses

| Statut | Corps | Condition |
|---|---|---|
| `401` | `unauthorized` | `?token=` absent ou différent de `WEBHOOK_SECRET` |
| `400` | `bad request` | Corps JSON invalide |
| `200 OK` | `ignored` | `event !== "messages.received"` ou `fromMe === true` ou corps vide |
| `200 OK` | `rate limited` | Numéro au-delà de la limite (10 msg/min par défaut) |
| `200 OK` | `ok` | Message traité et réponse envoyée (ou erreur LLM/Wazender avalée avec message d'excuse) |

> Le webhook retourne toujours 200 pour les cas ignorés. Wazender réessaie les envois si le serveur répond autre chose que 2xx.

### Exemple — message entrant valide

```bash
curl -X POST "https://ton-projet.vercel.app/api/webhook?token=$WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.received",
    "timestamp": 1748000000000,
    "data": {
      "messages": {
        "key": {
          "id": "ABCDEF123456",
          "fromMe": false,
          "remoteJid": "221771234567@s.whatsapp.net",
          "cleanedSenderPn": "+221771234567"
        },
        "messageBody": "Bonjour, quels sont vos horaires ?"
      }
    }
  }'
```

Réponse : `ok` (200)

### Exemple — événement ignoré

```bash
curl -X POST "https://ton-projet.vercel.app/api/webhook?token=$WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "event": "connection.update", "timestamp": 1748000000000, "data": {} }'
```

Réponse : `ignored` (200)

### Exemple — token absent ou invalide

```bash
curl -X POST https://ton-projet.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{ "event": "messages.received", ... }'
```

Réponse : `unauthorized` (401)

### Exemple — test en local avec Make

```bash
make webhook
```

---

## `GET /api/health`

Endpoint de liveness pour le monitoring externe (UptimeRobot, Vercel Monitoring…). Aucune authentification, aucun appel réseau vers Wazender/Supabase/OpenRouter.

```bash
curl https://ton-projet.vercel.app/api/health
```

Réponse : `{ "status": "ok" }` (200)

---

## `GET /api/cron/purge-old-messages`

Supprime les messages plus vieux que `MESSAGE_RETENTION_DAYS` jours (défaut : 90). Déclenché quotidiennement par Vercel Cron (`vercel.json`), à 03:00 UTC.

### Authentification

Header `Authorization: Bearer <CRON_SECRET>`, vérifié par `isAuthorizedCronRequest()` (`adapters/inbound/cron/verify-cron-secret.ts`). Sur Vercel, le header est injecté automatiquement par le scheduler Cron si `CRON_SECRET` est défini dans les variables d'environnement du projet.

### Réponses

| Statut | Corps | Condition |
|---|---|---|
| `401` | `unauthorized` | Header `Authorization` absent ou incorrect |
| `200 OK` | `{ "purged": <n> }` | `n` messages supprimés |

### Exemple

```bash
curl https://ton-projet.vercel.app/api/cron/purge-old-messages \
  -H "Authorization: Bearer $CRON_SECRET"
```

> Déploiement Docker/self-host : Vercel Cron n'existe pas en dehors de Vercel — il faut déclencher cet endpoint soi-même (crontab système, scheduler externe…).

---

## Wazender — Send Message

Utilisé par `wazenderMessagingAdapter.sendMessage()` dans `adapters/outbound/wazender/wazender-messaging.adapter.ts`.

```
POST https://www.wasenderapi.com/api/send-message
Authorization: Bearer <WAZENDER_API_KEY>
Content-Type: application/json

{ "to": "+221771234567", "text": "Bonjour ! Je peux vous aider." }
```

L'application lève une erreur si `res.ok === false`, ce qui fait échouer la requête webhook avec un 500.

---

## OpenRouter — Chat Completions

Utilisé par `generateText()` via Vercel AI SDK.

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json

{
  "model": "<AI_MODEL>",
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT>" },
    { "role": "user",      "content": "message 1" },
    { "role": "assistant", "content": "réponse 1" },
    ...
    { "role": "user",      "content": "message actuel" }
  ]
}
```

> Toujours appeler `openrouter.chat(model)` et non `openrouter(model)` — voir [Architecture](./ARCHITECTURE.md#adaptersoutboundopenrouteropenrouter-ai-responderadapterts).
