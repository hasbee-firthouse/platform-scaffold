#!/bin/bash
set -euo pipefail

echo "=== Bootstrapping dev environment ==="

# Workspace dependencies (pnpm installs all workspaces: apps/api + apps/web + packages/*)
corepack enable && corepack prepare pnpm@latest --activate 2>/dev/null || true
pnpm install --frozen-lockfile

# Frontend is installed via pnpm workspaces above — no separate install needed.

# Environment
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example — add your secrets (OAuth, SMTP, DATABASE_URL)"
fi

# Docker services (Postgres + Mailpit + the single app image serving API + built SPA)
docker compose up -d --build

# Health checks
echo "Waiting for services..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
    echo "app healthy at http://localhost:3000/health"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: app did not become healthy at http://localhost:3000/health" >&2
    docker compose logs --tail=50 app >&2 || true
    exit 1
  fi
  sleep 2
done

echo "=== Environment ready ==="
echo "  App / SPA : http://localhost:3000"
echo "  API       : http://localhost:3000/api"
echo "  Mailpit   : http://localhost:8025"
