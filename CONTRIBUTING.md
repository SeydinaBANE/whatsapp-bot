# Contribuer

## Prérequis

- Node.js 20+
- Un compte [Wazender](https://wasenderapi.com) avec une session WhatsApp connectée
- Un projet [Supabase](https://supabase.com) avec la table `messages` créée (voir `supabase/migration.sql`)
- Une clé [OpenRouter](https://openrouter.ai)

## Setup local

```bash
git clone https://github.com/SeydinaBANE/whatsapp-bot.git
cd whatsapp-bot
npm install          # installe aussi husky (pre-commit hooks)
cp .env.example .env # remplis les variables
```

Créer la table Supabase : ouvre ton projet Supabase → SQL Editor → exécute `supabase/migration.sql`.

Lance le serveur :

```bash
npm run dev
# ou
make dev
```

## Workflow de développement

```
1. Crée une branche   git checkout -b feat/ma-feature
2. Code
3. Vérifie            make check   (lint + typecheck)
4. Teste en local     make webhook (simule un message entrant)
5. Commit             git commit   (le hook pre-commit vérifie automatiquement)
6. Push + PR          git push origin feat/ma-feature
```

### Pre-commit hooks

Chaque `git commit` déclenche automatiquement :

1. **lint-staged** — ESLint avec auto-fix sur les fichiers `.ts`/`.tsx` staged
2. **tsc --noEmit** — vérification des types sur tout le projet

Si l'un des deux échoue, le commit est annulé. Corrige les erreurs puis recommence.

### CI

Le pipeline GitHub Actions (`.github/workflows/ci.yml`) s'exécute sur chaque push et PR vers `main` :

```
lint → typecheck → build
```

La PR ne peut pas être mergée si la CI échoue.

## Ajouter une fonctionnalité

Le point d'entrée est `app/api/webhook/route.ts`. La logique s'intercale entre les étapes existantes :

```typescript
const incoming = parseIncoming(payload)
if (!incoming) return new Response('ignored', { status: 200 })

const { phone, text } = incoming

// ← TES RÈGLES ICI (filtres, réponses automatiques, rate limiting…)

const history = await getHistory(phone)
const { text: reply } = await generateText({ ... })

// ← OU ICI (post-traitement de la réponse)

await sendMessage(phone, reply)
await saveMessages(phone, text, reply)
```

Consulte [`DOCUMENTATION.md`](./DOCUMENTATION.md) pour des exemples concrets (filtres, horaires, réponses automatiques).

## Modifier le schéma Supabase

1. Édite `supabase/migration.sql` avec ta migration
2. Exécute-la dans le SQL Editor Supabase
3. Mets à jour les types dans `lib/supabase.ts` si nécessaire

## Structure des fichiers

```
app/api/webhook/route.ts   — orchestrateur principal (modifier ici en priorité)
lib/wazender.ts            — contrat Wazender (parseIncoming + sendMessage)
lib/supabase.ts            — contrat Supabase (getHistory + saveMessages)
supabase/migration.sql     — schéma de la base
docs/                      — documentation technique
  ARCHITECTURE.md          — diagrammes et décisions de conception
  API.md                   — référence des endpoints
  SECURITY.md              — analyse de sécurité et recommandations
```

## Ouvrir une PR

- Une PR = une fonctionnalité ou un fix
- Le titre doit suivre [Conventional Commits](https://www.conventionalcommits.org/) : `feat:`, `fix:`, `chore:`, `docs:`
- La CI doit passer (lint + typecheck + build)
- Teste manuellement avec `make webhook` avant de soumettre
