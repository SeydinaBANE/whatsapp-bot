# whatsapp-bot

Chatbot WhatsApp propulsé par l'AI — répond automatiquement aux messages entrants avec un contexte de conversation. Personnalisable sans toucher au code, déployable sur Vercel ou Docker en quelques minutes.

[![CI](https://github.com/SeydinaBANE/whatsapp-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/SeydinaBANE/whatsapp-bot/actions/workflows/ci.yml)
[![Docker](https://github.com/SeydinaBANE/whatsapp-bot/actions/workflows/docker.yml/badge.svg)](https://github.com/SeydinaBANE/whatsapp-bot/actions/workflows/docker.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![Docker Image](https://ghcr-badge.egpl.dev/seydinabane/whatsapp-bot/size)](https://github.com/SeydinaBANE/whatsapp-bot/pkgs/container/whatsapp-bot)

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
| Déploiement | Vercel · Docker (ghcr.io) |
| CI/CD | GitHub Actions · Dependabot |

## Démarrage rapide

**Prérequis :** Node.js 20+, un compte [Wazender](https://wasenderapi.com) avec une session WhatsApp connectée, un compte [OpenRouter](https://openrouter.ai), un projet [Supabase](https://supabase.com).

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
# ou
make dev
```

**5. Tester le webhook**

```bash
make webhook
# équivalent curl vers http://localhost:3000/api/webhook
```

## Déploiement

### Option A — Vercel (recommandé)

1. Pousse le repo sur GitHub
2. Importe le projet sur [vercel.com/new](https://vercel.com/new)
3. Ajoute les variables d'environnement dans **Settings → Environment Variables**
4. Déploie — Vercel redéploiera automatiquement à chaque `git push`

### Option B — Docker (self-hosted)

```bash
# Récupérer l'image depuis GitHub Container Registry
docker pull ghcr.io/seydinabane/whatsapp-bot:main

# Lancer avec les vraies variables d'environnement
docker run -p 3000:3000 --env-file .env ghcr.io/seydinabane/whatsapp-bot:main

# Ou builder localement
make docker-build && make docker-run
```

**Configurer le webhook dans Wazender**

Après déploiement, copie l'URL de ton serveur et colle-la dans wasenderapi.com → ta session → Webhook :

```
https://ton-projet.vercel.app/api/webhook
# ou
https://ton-domaine.com/api/webhook
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

## Documentation

| Document | Contenu |
|---|---|
| [`DOCUMENTATION.md`](./DOCUMENTATION.md) | Guide d'utilisation — personnalisation, filtres, horaires, modèles |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Workflow de développement, setup local, ouvrir une PR |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Architecture technique, diagrammes, décisions de conception |
| [`docs/API.md`](./docs/API.md) | Référence des endpoints — schémas, codes de retour, exemples curl |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Analyse de sécurité et recommandations |

## Contribuer

Voir [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Licence

MIT
