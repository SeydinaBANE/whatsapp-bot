# whatsapp-bot

Chatbot WhatsApp propulsé par l'AI — répond automatiquement aux messages entrants avec un contexte de conversation. Personnalisable sans toucher au code, déployable sur Vercel en quelques minutes.

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)

## Comment ça fonctionne

```
Message WhatsApp entrant
        ↓
   Wazender (reçoit & transmet)
        ↓
POST /api/webhook  ←── ton serveur
        ↓
   Supabase → récupère l'historique (20 derniers messages)
        ↓
   Claude via OpenRouter → génère une réponse contextuelle
        ↓
   Wazender → envoie la réponse sur WhatsApp
        ↓
   Supabase → sauvegarde message + réponse
```

## Fonctionnalités

- **Mémoire de conversation** — le bot se souvient des échanges précédents par numéro
- **Détection de langue** — répond dans la langue de l'utilisateur par défaut
- **Persona configurable** — system prompt modifiable sans redéploiement
- **Modèle interchangeable** — change de Claude à GPT-4o en modifiant une variable
- **Zéro UI** — uniquement un endpoint webhook, pas de surface d'attaque inutile

## Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (API Route uniquement) |
| AI | Vercel AI SDK v6 + OpenRouter |
| WhatsApp | [Wazender](https://wasenderapi.com) |
| Base de données | Supabase (Postgres) |
| Déploiement | Vercel |

## Démarrage rapide

**Prérequis :** Node.js 18+, un compte [Wazender](https://wasenderapi.com) avec une session WhatsApp connectée, un compte [OpenRouter](https://openrouter.ai), un projet [Supabase](https://supabase.com).

**1. Cloner et installer**

```bash
git clone https://github.com/SeydinaBANE/whatsapp-bot.git
cd whatsapp-bot
npm install
```

**2. Configurer les variables d'environnement**

```bash
cp .env.example .env
```

| Variable | Obligatoire | Description |
|---|---|---|
| `WAZENDER_API_KEY` | ✅ | wasenderapi.com → Sessions → clique sur 🔑 |
| `OPENROUTER_API_KEY` | ✅ | openrouter.ai/keys |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL de ton projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clé anon Supabase |
| `AI_MODEL` | ❌ | Défaut : `anthropic/claude-sonnet-4-5` |
| `SYSTEM_PROMPT` | ❌ | Défaut : assistant généraliste multilingue |

**3. Créer la table en base**

Dans ton projet Supabase → SQL Editor, exécute [`supabase/migration.sql`](./supabase/migration.sql).

**4. Lancer en local**

```bash
npm run dev
```

**5. Tester le webhook**

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.received",
    "timestamp": 1234567890,
    "data": {
      "messages": {
        "key": { "id": "TEST1", "fromMe": false, "remoteJid": "test@s.whatsapp.net", "cleanedSenderPn": "+221700000000" },
        "messageBody": "Bonjour !"
      }
    }
  }'
```

## Déploiement sur Vercel

1. Pousse le repo sur GitHub
2. Importe le projet sur [vercel.com/new](https://vercel.com/new)
3. Ajoute les variables d'environnement dans **Settings → Environment Variables**
4. Déploie — Vercel redéploiera automatiquement à chaque `git push`

**Configurer le webhook dans Wazender**

Après déploiement, copie l'URL générée et colle-la dans wasenderapi.com → ta session → Webhook :

```
https://ton-projet.vercel.app/api/webhook
```

## Personnaliser le bot

**Changer la personnalité** — modifie `SYSTEM_PROMPT` dans Vercel sans redéployer :

```
Tu es un assistant commercial pour une boutique de vêtements. Sois chaleureux, concis, réponds toujours en français. Si tu ne sais pas, propose de contacter un conseiller.
```

**Changer le modèle AI** — modifie `AI_MODEL` :

```
AI_MODEL=openai/gpt-4o
AI_MODEL=google/gemini-2.0-flash-001
AI_MODEL=meta-llama/llama-3.3-70b-instruct
```

**Ajouter des règles** — édite `app/api/webhook/route.ts` après `parseIncoming()` :

```ts
// Ignorer certains numéros
if (incoming.phone === '+221700000000') return new Response('ignored', { status: 200 })

// Répondre hors horaires
const heure = new Date().getHours()
if (heure < 8 || heure > 18) {
  await sendMessage(incoming.phone, 'Nous sommes fermés. Horaires : 8h-18h, lun-ven.')
  return new Response('ok', { status: 200 })
}
```

Consulte [`DOCUMENTATION.md`](./DOCUMENTATION.md) pour tous les cas d'usage détaillés.

## Problème connu

Avec `@ai-sdk/openai` v3+, utilise `.chat()` pour forcer l'endpoint `/chat/completions` — OpenRouter ne supporte pas encore `/responses` :

```ts
// ✅ correct
model: openrouter.chat('anthropic/claude-sonnet-4-5')

// ❌ erreur 400 Invalid Responses API request
model: openrouter('anthropic/claude-sonnet-4-5')
```

## Contribuer

Les PRs sont les bienvenues. Ouvre une issue pour discuter d'une nouvelle fonctionnalité avant de coder.

## Licence

MIT
