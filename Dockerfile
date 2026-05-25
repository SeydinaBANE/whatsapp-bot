# Stage 1 — installer les dépendances
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2 — build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables placeholder pour que next build passe sans accès réseau
ENV WAZENDER_API_KEY=placeholder \
    OPENROUTER_API_KEY=placeholder \
    NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Normalise le standalone — Next.js niche server.js selon le path absolu du projet
# (ex: /app → .next/standalone/app/server.js). On le déplace à un emplacement fixe.
RUN SERVER_JS=$(find .next/standalone -name "server.js" -not -path "*/node_modules/*" | head -1) && \
    cp -r "$(dirname "$SERVER_JS")" /tmp/standalone

# Stage 3 — image de production (standalone)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /tmp/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
