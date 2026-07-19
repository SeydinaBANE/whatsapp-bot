# Sécurité

## Posture actuelle

### Ce qui est sécurisé

| Point | Statut | Détail |
|---|---|---|
| Secrets en env vars | ✅ | Aucune clé dans le code, `.env` dans `.gitignore` |
| Boucles infinies | ✅ | `fromMe === true` ignoré dans `parseIncoming()` |
| Dépendances | ✅ | `npm audit` : 0 vulnérabilité high/critical |
| TypeScript strict | ✅ | `"strict": true` dans `tsconfig.json` |
| CI bloquante | ✅ | Lint + typecheck sur chaque PR |
| Secret partagé sur le webhook | ✅ | `?token=<WEBHOOK_SECRET>`, voir point 1 |
| Rate limiting | ✅ | Voir point 3 |
| Erreurs LLM/Wazender gérées | ✅ | Voir point 4 |
| Endpoint de purge protégé | ✅ | `CRON_SECRET` obligatoire, voir point 5 |

### Points d'attention

#### 1. Pas de validation de signature webhook — partiellement mitigé

Wazender ne fournit pas (encore) de mécanisme de signature HMAC sur les webhooks. Sans protection, n'importe qui connaissant l'URL pourrait envoyer un payload forgé et déclencher un appel LLM + une réponse WhatsApp.

**Mitigation en place :** un secret partagé (`WEBHOOK_SECRET`) est vérifié en query param (`?token=`) avant tout traitement du payload (`adapters/inbound/wazender/verify-webhook-secret.ts`, appelé dans `route.ts`). C'est la seule valeur configurable côté Wazender (l'URL de destination). Combiné à une URL non-devinable, cela réduit le risque à la divulgation du token lui-même.

**Limite connue :** ce n'est pas une signature du corps du message (HMAC), donc pas de garantie d'intégrité — seulement d'authentification de la source. Si Wazender ajoute un jour une signature HMAC, la migrer serait préférable :

```typescript
// Exemple si Wazender ajoute X-Wazender-Signature
const sig = req.headers.get('x-wazender-signature')
const body = await req.text()
const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET!).update(body).digest('hex')
if (sig !== expected) return new Response('unauthorized', { status: 401 })
```

#### 2. Variables `NEXT_PUBLIC_` côté serveur — résolu

Les variables Supabase étaient nommées `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, alors qu'elles ne sont utilisées que côté serveur (`adapters/outbound/supabase/supabase-conversation-repository.adapter.ts`, importé uniquement via `config/container.ts`, jamais côté client). Le préfixe `NEXT_PUBLIC_` les aurait exposées inutilement au bundle client JavaScript.

**Statut :** renommées en `SUPABASE_URL` / `SUPABASE_ANON_KEY` (voir `CHANGELOG.md` — v1.1.0). Impact réel avant correction : nul, car la clé `anon` Supabase est de toute façon faite pour être publique (soumise aux politiques RLS) et la politique actuelle est ouverte (`USING (true)`).

#### 3. Pas de rate limiting — résolu

Un utilisateur ou un script pourrait envoyer des milliers de messages et générer autant d'appels LLM (coût OpenRouter) + d'écritures Supabase.

**Statut :** `conversationRepository.isRateLimited(phone)` (max 10 msg/minute par numéro) est vérifié en tout premier dans `core/use-cases/handle-incoming-message.use-case.ts`, avant tout appel LLM (voir `CHANGELOG.md` — v1.1.0).

#### 4. Pas de gestion des erreurs LLM vers l'utilisateur — résolu

Si `aiResponder.reply()` ou `messaging.sendMessage()` échoue (timeout, quota dépassé, Wazender indisponible), l'erreur est loggée (`console.error`) et un message d'excuse est envoyé à l'utilisateur — le webhook répond quand même `200 ok` pour éviter que Wazender ne rejoue la requête en boucle (voir `core/use-cases/handle-incoming-message.use-case.ts`, `CHANGELOG.md` — v1.1.0).

#### 5. Endpoint de purge des messages — protégé par design

`/api/cron/purge-old-messages` (voir [Architecture](./ARCHITECTURE.md) et [API](./API.md#get-apicronpurge-old-messages)) supprime des données — un endpoint destructeur ne doit jamais tourner sans authentification. `CRON_SECRET` est obligatoire (`requireEnv`, pas de valeur par défaut) : sans cette variable, le module ne charge pas et l'endpoint est indisponible plutôt que de tourner en clair.

## Dépendances — état de l'audit

```
npm audit : 1 vulnérabilité moderate (postcss, transitif via next)
```

Le fix postcss nécessiterait de rétrograder Next.js vers 9.x — non applicable. La vulnérabilité (XSS via CSS stringify) n'est pas exploitable ici : aucune entrée CSS utilisateur dans l'application.

Pour surveiller : `npm audit` avant chaque déploiement.
