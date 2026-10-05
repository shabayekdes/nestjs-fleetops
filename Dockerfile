# Keep NODE_VERSION in sync with .nvmrc.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base

# ---- deps: full dependency tree (postinstall runs prisma generate) ----
FROM base AS deps
WORKDIR /app
# Prisma's schema engine needs libssl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---- build: compile TypeScript ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---- prod-deps: production dependencies only ----
# A fresh install, not `npm prune`. The lockfile still resolves the Prisma CLI
# (an optional peer of @prisma/client), so it is removed explicitly: the
# runtime never needs it (migrations run from the migrate target). The
# generated client is already compiled into dist, so no install scripts.
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && rm -rf node_modules/prisma node_modules/.bin/prisma \
  && npm cache clean --force

# ---- migrate: one-off release step (prisma migrate deploy), also seeds ----
FROM build AS migrate
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runtime: default target ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# "type": "module" makes dist/*.js ES modules.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Read by the readiness probe; the working directory must stay /app.
COPY prisma/migrations ./prisma/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# node is PID 1 and receives SIGTERM directly (Nest shutdown hooks).
CMD ["node", "dist/main.js"]
