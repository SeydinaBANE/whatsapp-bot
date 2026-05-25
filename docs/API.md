# Référence API

## `POST /api/webhook`

Point d'entrée unique de l'application. Reçoit les événements Wazender et déclenche le flow de réponse IA.

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
| `200 OK` | `ignored` | `event !== "messages.received"` ou `fromMe === true` ou corps vide |
| `200 OK` | `ok` | Message traité et réponse envoyée |
| `500` | — | Erreur non gérée (LLM timeout, Wazender indisponible…) |

> Le webhook retourne toujours 200 pour les cas ignorés. Wazender réessaie les envois si le serveur répond autre chose que 2xx.

### Exemple — message entrant valide

```bash
curl -X POST https://ton-projet.vercel.app/api/webhook \
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
curl -X POST https://ton-projet.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{ "event": "connection.update", "timestamp": 1748000000000, "data": {} }'
```

Réponse : `ignored` (200)

### Exemple — test en local avec Make

```bash
make webhook
```

---

## Wazender — Send Message

Utilisé par `sendMessage()` dans `lib/wazender.ts`.

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

> Toujours appeler `openrouter.chat(model)` et non `openrouter(model)` — voir [Architecture](./ARCHITECTURE.md#apiapiwebhookroutets).
