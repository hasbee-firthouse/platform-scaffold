# syntax=docker/dockerfile:1
#
# Multi-stage build for the platform-scaffold modular monolith (SPEC §20.2, D16).
# One image: Fastify serves `/api/*` AND the built React/Vite SPA (history
# fallback) on a single port. This repo uses the internal-packages / no-build
# pattern — workspace packages resolve their TypeScript source directly and the
# API runs via `tsx` — so the runtime image ships source + node_modules and the
# only compiled artifact is the SPA bundle (`apps/web/dist`).

########## base ##########
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

########## build: install deps + build the SPA ##########
FROM base AS build
# .dockerignore keeps host node_modules / dist / .env out, so this copies source
# only; pnpm then materializes a clean, lockfile-pinned node_modules in-image.
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
# Vite build → apps/web/dist (main.ts resolves the SPA at ../../web/dist).
RUN pnpm --filter @app/web exec vite build

########## runtime: non-root, serves API + SPA ##########
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
# Bring over the fully-installed workspace (source + node_modules + built SPA).
COPY --from=build --chown=node:node /app /app
# Drop privileges: run as the image's built-in unprivileged `node` user.
USER node
EXPOSE 3000
# Run node directly with the tsx loader (NOT the `tsx` CLI wrapper, which forks a
# child) so this process is PID 1 and receives SIGTERM directly — that drives the
# app's graceful shutdown (drain, stop pg-boss, close the pool; SPEC §20.2).
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
