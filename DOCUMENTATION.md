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

**Fichiers principaux :**

| Fichier | Rôle |
|---|---|
| `app/api/webhook/route.ts` | Point d'entrée — orchestre tout le flow |
| `lib/wazender.ts` | Parse les messages entrants, envoie les réponses |
| `lib/supabase.ts` | Lit et écrit l'historique des conversations |

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

Le fichier principal est `app/api/webhook/route.ts` :

```typescript
export async function POST(req: Request) {
  const payload = await req.json()

  // 1. Parse le message entrant (retourne null si ignoré)
  const incoming = parseIncoming(payload)
  if (!incoming) return new Response('ignored', { status: 200 })

  const { phone, text } = incoming

  // 2. Récupère l'historique
  const history = await getHistory(phone)

  // 3. Génère la réponse avec Claude
  const { text: reply } = await generateText({
    model: openrouter(process.env.AI_MODEL ?? 'anthropic/claude-sonnet-4-5'),
    system: SYSTEM_PROMPT,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ],
  })

  // 4. Envoie la réponse et sauvegarde
  await sendMessage(phone, reply)
  await saveMessages(phone, text, reply)

  return new Response('ok', { status: 200 })
}
```

---

## Filtrer certains messages

Ajoute des conditions juste après `parseIncoming()` dans `app/api/webhook/route.ts`.

### Ignorer un numéro spécifique

```typescript
const incoming = parseIncoming(payload)
if (!incoming) return new Response('ignored', { status: 200 })

// Ignorer un numéro
const BLOCKED = ['+221771234567', '+33600000000']
if (BLOCKED.includes(incoming.phone)) {
  return new Response('blocked', { status: 200 })
}
```

### Répondre seulement si le message contient un mot-clé

```typescript
const KEYWORDS = ['aide', 'help', 'bonjour', 'hello', 'commande']
const hasKeyword = KEYWORDS.some(k => incoming.text.toLowerCase().includes(k))

if (!hasKeyword) return new Response('ignored', { status: 200 })
```

### Répondre seulement entre certaines heures

```typescript
const hour = new Date().getHours() // heure UTC
if (hour < 8 || hour > 18) {
  await sendMessage(incoming.phone, 'Nous sommes fermés. Nos horaires : 8h-18h du lundi au vendredi.')
  return new Response('outside hours', { status: 200 })
}
```

---

## Changer la profondeur d'historique

Par défaut le bot se souvient des **20 derniers messages**. Pour modifier, édite `lib/supabase.ts` :

```typescript
// Ligne 17 — change la valeur par défaut
export async function getHistory(phone: string, limit = 20) {
```

Ou passe la valeur manuellement dans `route.ts` :

```typescript
const history = await getHistory(phone, 10) // 10 messages seulement
```

> **Note :** Plus l'historique est long, plus chaque requête coûte de tokens. Pour un bot simple, 10-20 messages est suffisant.

---

## Ajouter des réponses automatiques

Pour certains messages simples, tu peux court-circuiter l'AI et répondre directement.

```typescript
const incoming = parseIncoming(payload)
if (!incoming) return new Response('ignored', { status: 200 })

const { phone, text } = incoming
const lower = text.toLowerCase()

// Réponses automatiques sans passer par l'AI
if (lower === 'stop' || lower === 'désabonner') {
  await sendMessage(phone, 'Vous avez été désabonné. Tapez START pour vous réabonner.')
  return new Response('ok', { status: 200 })
}

if (lower === 'horaires') {
  await sendMessage(phone, 'Nos horaires : Lun-Ven 9h-18h, Sam 9h-13h.')
  return new Response('ok', { status: 200 })
}

// Sinon → passe par l'AI
const history = await getHistory(phone)
// ... suite normale
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
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clé anon Supabase |
| `AI_MODEL` | ❌ | Modèle AI (défaut : `anthropic/claude-sonnet-4-5`) |
| `SYSTEM_PROMPT` | ❌ | Persona du bot (défaut : assistant généraliste) |
