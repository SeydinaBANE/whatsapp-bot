# Changelog

Toutes les modifications notables sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

---

## [1.1.0] — 2026-05-25

### Ajouté
- Gestion d'erreurs dans le webhook : try-catch autour de l'appel LLM, message d'excuse envoyé à l'utilisateur si erreur
- Rate limiting par numéro de téléphone : max 10 messages/minute via requête Supabase
- Tests unitaires avec Vitest (`lib/wazender.test.ts` — 6 cas pour `parseIncoming`)
- Step `test` dans la CI GitHub Actions (lint → typecheck → **test** → build)
- Security headers HTTP : `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- `make test` et `make clean` dans le Makefile
- `CHANGELOG.md`

### Modifié
- Variables Supabase renommées : `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `SUPABASE_ANON_KEY` (server-only, non exposées dans le bundle client)
- `.env.example` amélioré : commentaires + liens vers les sources de chaque variable
- Gestion du JSON malformé dans le webhook : `req.json()` maintenant dans un try-catch

### Sécurité
- Rate limiting implémente la recommandation de `docs/SECURITY.md`
- La variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` n'est plus préfixée NEXT_PUBLIC — élimine l'exposition inutile

---

## [1.0.0] — 2026-05-25

### Ajouté
- Webhook POST `/api/webhook` — reçoit les messages Wazender, appelle Claude via OpenRouter, répond sur WhatsApp
- Mémoire de conversation par numéro (20 derniers messages via Supabase)
- Détection automatique de la langue (via system prompt)
- System prompt configurable via variable d'environnement (sans redéploiement)
- Modèle AI interchangeable via `AI_MODEL` (compatible tout modèle OpenRouter)
- Déploiement Vercel (CI/CD automatique sur push)
- Déploiement Docker — image publiée sur `ghcr.io/seydinabane/whatsapp-bot`
- CI GitHub Actions : lint → typecheck → build
- Pre-commit hooks : lint-staged + tsc
- Documentation technique : `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY.md`
- Makefile avec targets `dev`, `build`, `check`, `webhook`, `docker-*`
- Dependabot (mises à jour npm + GitHub Actions hebdomadaires)
- Licence MIT
