# Documentation — WhatsApp Bot

## Table des matières
1. [Comment ça fonctionne](#comment-ça-fonctionne)
2. [Changer le system prompt](#changer-le-system-prompt)
3. [Changer le modèle AI](#changer-le-modèle-ai)
4. [Modifier la logique du bot](#modifier-la-logique-du-bot)
5. [Filtrer certains messages](#filtrer-certains-messages)
6. [Changer la profondeur d'historique](#changer-la-profondeur-dhistorique)
7. [Ajouter des réponses automatiques](#ajouter-des-réponses-automatiques)
8. [Déployer une modification](#déployer-une-modification)
9. [Tester en local](#tester-en-local)
10. [Variables d'environnement](#variables-denvironnement)

---

## Comment ça fonctionne

```
Utilisateur WhatsApp
       ↓
   Wazender (reçoit le message)
       ↓
POST /api/webhook  (ton serveur)
       ↓
   Supabase → récupère l'historique des 20 derniers messages
       ↓
   Claude (via OpenRouter) → génère une réponse
       ↓
   Wazender → envoie la réponse sur WhatsApp
       ↓
   Supabase → sauvegarde le message + la réponse
```

**Fichiers principaux** (architecture hexagonale — voir [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)) :

| Fichier | Rôle |
|---|---|
| `app/api/webhook/route.ts` | Point d'entrée HTTP — parse la requête, délègue, mappe la réponse |
| `core/use-cases/handle-incoming-message.use-case.ts` | Logique métier — orchestre le flow (c'est ici qu'on ajoute des règles) |
| `adapters/inbound/wazender/parse-incoming.ts` | Traduit le webhook Wazender en message du domaine |
| `adapters/outbound/wazender/wazender-messaging.adapter.ts` | Envoie les réponses sur WhatsApp |
| `adapters/outbound/supabase/supabase-conversation-repository.adapter.ts` | Lit et écrit l'historique des conversations |

---

## Changer le system prompt

Le system prompt définit la **personnalité et le rôle** du bot.

### Option 1 — Via Vercel (sans toucher au code)

1. Va sur [vercel.com](https://vercel.com) → ton projet → **Settings → Environment Variables**
2. Modifie `SYSTEM_PROMPT`
3. Clique **Save** puis **Redeploy**

### Option 2 — Via le fichier `.env` en local

```env
SYSTEM_PROMPT=Tu es un assistant commercial pour une boutique de mode. Réponds toujours en français, sois chaleureux et concis.
```

### Exemples de prompts

**Support client e-commerce :**
```
Tu es un assistant support client pour une boutique en ligne. Réponds toujours en français. Aide les clients avec leurs commandes, livraisons et retours. Si tu ne connais pas la réponse, dis-le et propose de transférer à un humain.
```

**Assistant médical (prise de RDV) :**
```
Tu es un assistant pour un cabinet médical. Aide les patients à prendre rendez-vous, rappelle les horaires d'ouverture (Lun-Ven 8h-18h), et oriente les urgences vers le 15. Ne donne jamais de conseils médicaux.
```

**Bot de vente immobilière :**
```
Tu es un agent immobilier virtuel. Qualifie les prospects en posant des questions sur leur budget, leur localisation souhaitée et le type de bien. Reste professionnel et concis.
```

---

## Changer le modèle AI

Modifie la variable `AI_MODEL` avec n'importe quel modèle disponible sur [openrouter.ai/models](https://openrouter.ai/models).

```env
# Rapide et économique
AI_MODEL=anthropic/claude-haiku-4-5

# Le plus intelligent
AI_MODEL=anthropic/claude-opus-4-7

# Alternative OpenAI
AI_MODEL=openai/gpt-4o

# Alternative gratuite
AI_MODEL=meta-llama/llama-3.3-70b-instruct
```

---

## Modifier la logique du bot

`app/api/webhook/route.ts` ne fait que parser la requête et déléguer — la logique métier vit dans `core/use-cases/handle-incoming-message.use-case.ts` :

```typescript
async execute({ phone, text }: IncomingMessage): Promise<HandleIncomingMessageOutcome> {
  // 1. Rate limiting
  if (await deps.conversationRepository.isRateLimited(phone)) {
    return 'rate_limited'
  }

  // 2. Récupère l'historique
  const history = await deps.conversationRepository.getHistory(phone)

  try {
    // 3. Génère la réponse avec Claude (via l'adapter OpenRouter)
    const reply = await deps.aiResponder.reply(history, text)

    // 4. Envoie la réponse et sauvegarde
    await deps.messaging.sendMessage(phone, reply)
    await deps.conversationRepository.saveMessages(phone, text, reply)
  } catch (err) {
    console.error('[handle-incoming-message] error:', err)
    await deps.messaging.sendMessage(phone, FALLBACK_REPLY).catch(() => null)
  }

  return 'ok'
}
```

`deps` regroupe les 3 adapters câblés dans `config/container.ts` (`conversationRepository`, `aiResponder`, `messaging`). Pour changer un comportement, modifie cette fonction plutôt que `route.ts`.

---

## Filtrer certains messages

### Ignorer un numéro spécifique, ou répondre seulement sur mot-clé

Ces filtres n'ont besoin que du message parsé (`incoming`), pas d'envoyer de message — ils peuvent rester dans `app/api/webhook/route.ts`, juste après `parseIncoming()` :

```typescript
const incoming = parseIncoming(payload)
if (!incoming) return new Response('ignored', { status: 200 })

// Ignorer un numéro
const BLOCKED = ['+221771234567', '+33600000000']
if (BLOCKED.includes(incoming.phone)) {
  return new Response('blocked', { status: 200 })
}
```

```typescript
const KEYWORDS = ['aide', 'help', 'bonjour', 'hello', 'commande']
const hasKeyword = KEYWORDS.some(k => incoming.text.toLowerCase().includes(k))

if (!hasKeyword) return new Response('ignored', { status: 200 })
```

### Répondre seulement entre certaines heures

Cette règle envoie un message WhatsApp — c'est une décision métier, elle va donc dans `core/use-cases/handle-incoming-message.use-case.ts`, en tête de `execute()` :

```typescript
async execute({ phone, text }: IncomingMessage): Promise<HandleIncomingMessageOutcome> {
  const hour = new Date().getHours() // heure UTC
  if (hour < 8 || hour > 18) {
    await deps.messaging.sendMessage(phone, 'Nous sommes fermés. Nos horaires : 8h-18h du lundi au vendredi.')
    return 'ok'
  }

  // ... suite normale (rate limit, historique, LLM, envoi, sauvegarde)
}
```

---

## Changer la profondeur d'historique

Par défaut le bot se souvient des **20 derniers messages**. Pour modifier, édite `adapters/outbound/supabase/supabase-conversation-repository.adapter.ts` :

```typescript
// change la valeur par défaut
async getHistory(phone, limit = 20) {
```

Ou passe la valeur manuellement dans `core/use-cases/handle-incoming-message.use-case.ts` :

```typescript
const history = await deps.conversationRepository.getHistory(phone, 10) // 10 messages seulement
```

> **Note :** Plus l'historique est long, plus chaque requête coûte de tokens. Pour un bot simple, 10-20 messages est suffisant.

---

## Ajouter des réponses automatiques

Pour certains messages simples, tu peux court-circuiter l'AI et répondre directement — toujours dans `core/use-cases/handle-incoming-message.use-case.ts` :

```typescript
async execute({ phone, text }: IncomingMessage): Promise<HandleIncomingMessageOutcome> {
  const lower = text.toLowerCase()

  // Réponses automatiques sans passer par l'AI
  if (lower === 'stop' || lower === 'désabonner') {
    await deps.messaging.sendMessage(phone, 'Vous avez été désabonné. Tapez START pour vous réabonner.')
    return 'ok'
  }

  if (lower === 'horaires') {
    await deps.messaging.sendMessage(phone, 'Nos horaires : Lun-Ven 9h-18h, Sam 9h-13h.')
    return 'ok'
  }

  // Sinon → suite normale (rate limit, historique, LLM, envoi, sauvegarde)
  if (await deps.conversationRepository.isRateLimited(phone)) {
    return 'rate_limited'
  }
  // ...
}
```

---

## Déployer une modification

```bash
# 1. Modifie les fichiers en local
# 2. Teste (voir section "Tester en local")
# 3. Push sur GitHub → Vercel redéploie automatiquement

git add .
git commit -m "description du changement"
git push
```

Vercel détecte le push et redéploie en ~1 minute. Tu peux suivre le déploiement sur [vercel.com](https://vercel.com).

**Pour changer seulement une variable d'environnement** (system prompt, modèle…) : modifie directement dans Vercel → Settings → Environment Variables → Redeploy. Pas besoin de push.

---

## Tester en local

Lance le serveur :
```bash
npm run dev
```

Simule un message WhatsApp entrant :
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.received",
    "timestamp": 1234567890,
    "data": {
      "messages": {
        "key": {
          "id": "TEST001",
          "fromMe": false,
          "remoteJid": "221771234567@s.whatsapp.net",
          "cleanedSenderPn": "+221771234567"
        },
        "messageBody": "Bonjour, tu peux maider?"
      }
    }
  }'
```

Vérifie que le bot a répondu et que les messages sont en base :
```bash
# Voir les messages sauvegardés
curl http://localhost:3000/api/webhook  # → page de statut
```

---

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `WAZENDER_API_KEY` | ✅ | Clé de session Wazender (wasenderapi.com → Sessions → 🔑) |
| `OPENROUTER_API_KEY` | ✅ | Clé OpenRouter (openrouter.ai/keys) |
| `SUPABASE_URL` | ✅ | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | ✅ | Clé anon Supabase |
| `AI_MODEL` | ❌ | Modèle AI (défaut : `anthropic/claude-sonnet-4-5`) |
| `SYSTEM_PROMPT` | ❌ | Persona du bot (défaut : assistant généraliste) |
