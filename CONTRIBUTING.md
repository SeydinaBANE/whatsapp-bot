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

Le projet suit une architecture hexagonale (ports & adapters) — voir [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) pour le détail des couches. Le point d'entrée HTTP est `app/api/webhook/route.ts`, mais la logique métier vit dans `core/use-cases/handle-incoming-message.use-case.ts` :

```typescript
async execute({ phone, text }: IncomingMessage): Promise<HandleIncomingMessageOutcome> {
  if (await deps.conversationRepository.isRateLimited(phone)) {
    return 'rate_limited'
  }

  const history = await deps.conversationRepository.getHistory(phone)

  // ← TES RÈGLES ICI (filtres, réponses automatiques…)

  try {
    const reply = await deps.aiResponder.reply(history, text)
    await deps.messaging.sendMessage(phone, reply)
    await deps.conversationRepository.saveMessages(phone, text, reply)
  } catch (err) {
    // ...
  }

  return 'ok'
}
```

Pour ajouter une nouvelle intégration externe (ex: un second canal de messagerie), crée un nouvel adapter sous `adapters/outbound/` qui implémente le port correspondant (`core/ports/outbound/`), puis câble-le dans `config/container.ts` — le use case n'a rien à changer.

Consulte [`DOCUMENTATION.md`](./DOCUMENTATION.md) pour des exemples concrets (filtres, horaires, réponses automatiques).

## Modifier le schéma Supabase

1. Édite `supabase/migration.sql` avec ta migration
2. Exécute-la dans le SQL Editor Supabase
3. Mets à jour les types dans `adapters/outbound/supabase/supabase-conversation-repository.adapter.ts` si nécessaire

## Structure des fichiers

```
app/api/webhook/route.ts                                          — adapter HTTP entrant (thin)
core/
  domain/conversation.ts                                          — types du domaine
  ports/{inbound,outbound}/*.ts                                    — interfaces (contrats)
  use-cases/handle-incoming-message.use-case.ts                    — logique métier (modifier ici en priorité)
adapters/
  inbound/wazender/parse-incoming.ts                               — traduction webhook Wazender → domaine
  outbound/wazender/wazender-messaging.adapter.ts                  — envoi WhatsApp
  outbound/supabase/supabase-conversation-repository.adapter.ts    — historique + rate limit
  outbound/openrouter/openrouter-ai-responder.adapter.ts           — génération LLM
config/container.ts        — composition root (câble les adapters au use case)
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
