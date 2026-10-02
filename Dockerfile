# syntax=docker/dockerfile:1

# Frontend image for EC2. Next.js in standalone mode: the runtime layer carries .next/standalone,
# which holds server.js and only the node_modules the traced server actually imports, instead of a
# full install with devDependencies and Playwright's browsers.

ARG NODE_VERSION=20.20

# --- dependencies -----------------------------------------------------------------------------
# Kept as its own stage so a source-only edit does not re-run npm ci. The lockfile is copied alone
# so this layer's cache key is dependency state: change any dependency and this rebuilds, change a
# component and it does not.
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Playwright is a devDependency that downloads a browser on install. Nothing in the build or the
# server uses it — the E2E suites run on a workstation — and skipping the download keeps this stage
# fast and the builder free of ~400 MB of Chromium.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- build ------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Type-checked as part of the image build. A type error must fail here, where the offending line is
# in the build output, rather than on EC2 after a deploy.
RUN npx tsc --noEmit

# Deliberately no DATABASE_URL, SESSION_SECRET or ADMIN_* in this stage. lib/env.ts resolves
# configuration lazily on first request precisely so that the build needs no secrets, which means
# no credential ever exists inside a build layer or in this image's history. Every route is
# server-rendered on demand, so nothing is prerendered against a live database.
RUN npm run build

# --- runtime ----------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# public/ and .next/static are deliberately absent from the standalone output and must be copied in
# beside it. Omitting .next/static is the classic standalone mistake: the server runs, every page
# returns 200, and the browser then 404s on every JS chunk.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Migrations and the seed ship with the image so schema changes are an explicit operator step
# (`docker compose run --rm app node db/migrate.mjs`) rather than something a booting container does
# to the database on its own. Nothing runs them at start. pg and its dependencies are already present
# in the traced node_modules, so these scripts resolve without a second install.
COPY --from=builder --chown=node:node /app/db ./db

# The `node` user ships in the base image (uid 1000). Running as root would give a compromised
# request handler a shell with write access to the whole filesystem.
USER node

EXPOSE 3000

# Uses Node's built-in fetch rather than installing curl or wget purely for a health probe — busybox
# wget would work but adds nothing this does not already have. start-period covers the first boot's
# module loading; retries tolerate a database that is still coming up.
#
# Note this checks reachability of the database, not just that the process is alive, because every
# route in this app reads PostgreSQL. See app/api/health/route.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Server.js handles SIGTERM itself and closes in-flight requests. `--init` (compose) or
# `--init` (docker run) makes this PID 1's reaper forward signals rather than orphaning them.
CMD ["node", "server.js"]
