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

### Points d'attention

#### 1. Pas de validation de signature webhook

Wazender ne fournit pas (encore) de mécanisme de signature HMAC sur les webhooks. N'importe qui connaissant l'URL peut envoyer un payload forgé et déclencher un appel LLM + une réponse WhatsApp.

**Mitigation temporaire :** l'URL du webhook n'est pas publique (Vercel génère une URL non-devinable). Ne pas exposer cette URL publiquement.

**Mitigation à terme :** si Wazender ajoute la signature, implémenter la vérification dans `route.ts` avant `parseIncoming()` :

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

#### 3. Pas de rate limiting

Un utilisateur ou un script peut envoyer des milliers de messages et générer autant d'appels LLM (coût OpenRouter) + d'écritures Supabase.

**Mitigation simple** à ajouter dans `route.ts` :

```typescript
// Limite par numéro : max 10 msg/minute via Supabase
const recent = await supabase
  .from('messages')
  .select('id', { count: 'exact', head: true })
  .eq('phone', phone)
  .eq('role', 'user')
  .gte('created_at', new Date(Date.now() - 60_000).toISOString())

if ((recent.count ?? 0) >= 10) {
  return new Response('rate limited', { status: 200 })
}
```

#### 4. Pas de gestion des erreurs LLM vers l'utilisateur

Si `generateText()` échoue (timeout, quota dépassé), le webhook retourne 500. Wazender va réessayer, potentiellement en boucle. L'utilisateur ne reçoit aucun message d'erreur.

**Amélioration recommandée :**

```typescript
try {
  const { text: reply } = await generateText({ ... })
  await sendMessage(phone, reply)
  await saveMessages(phone, text, reply)
} catch {
  await sendMessage(phone, "Désolé, je rencontre un problème technique. Réessaie dans quelques instants.")
}
return new Response('ok', { status: 200 })
```

## Dépendances — état de l'audit

```
npm audit : 1 vulnérabilité moderate (postcss, transitif via next)
```

Le fix postcss nécessiterait de rétrograder Next.js vers 9.x — non applicable. La vulnérabilité (XSS via CSS stringify) n'est pas exploitable ici : aucune entrée CSS utilisateur dans l'application.

Pour surveiller : `npm audit` avant chaque déploiement.
