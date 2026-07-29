# AWS Deployment

_Last reviewed: 2026-07-28. Scope: a single product fork of this scaffold._

## The app's shape (drives every decision below)

- **One container** — Fastify serves `/api/*` and the built SPA on port `3000`.
- **One Postgres** — auth, orgs, audit, entitlements, and the pg-boss job queue. No Redis.
- **Email is SMTP** → maps directly onto Amazon SES.
- **Must stay warm** — pg-boss runs in-process, so you need ≥1 always-on instance. No Lambda / scale-to-zero. _(Under review: `DECISION-serverless-email-offload.md` proposes dropping the in-process worker to unlock scale-to-zero. This doc describes the current, shipped architecture.)_
- **Migrations run at container start** — safe with one instance; races (benign) with more.

## Blockers before real traffic

| Fix before... | Gap | Action |
|---|---|---|
| Any deploy | Compose secrets are dev placeholders | Generate real `BETTER_AUTH_SECRET` (`openssl rand -base64 48`) + `APP_RUNTIME_PASSWORD`; inject from SSM |
| Any deploy | `init.sh` health-checks `/health`, route is `/api/health` | One-line fix |
| Paying multi-tenant customers | **Live RLS** — app still connects as DB owner (`BYPASSRLS`); RLS is proven by tests but not defending the running app | Route tenant-table pool to `app_runtime` role |
| Paying multi-tenant customers | **Compiled build** — API runs via `tsx` (dev tooling) on TS source in prod | Add `tsc`/`esbuild` build step, run compiled JS |

Everything else (E2E tests, richer CI, metrics/APM) is quality debt, not a deploy blocker. For an internal tool / beta / demo, only the first two rows matter.

## Pick an option

| | Monthly | Best for | Trade-off |
|---|---|---|---|
| **A. EC2 (Graviton) + Docker + Caddy** | ~$12–20 | Beta / demo / tight budget | You own Postgres backups + patching; single node |
| **B. Lightsail container + managed Postgres** | ~$25–40 | Flat billing, low ops | Fewer knobs; still small-scale |
| **C. ECS Fargate + RDS + ALB** | ~$55–90 | Real customers, managed DB, HA path | ALB (~$16/mo) + RDS dominate cost |

> Skip App Runner / Lambda — their savings come from scaling to zero, which kills the in-process pg-boss worker. _(This constraint is exactly what `DECISION-serverless-email-offload.md` proposes to remove; if that's accepted, App Runner becomes the recommended host.)_

Cost levers that apply to all three: **ARM/Graviton** (`t4g`, ~20% cheaper — `docker buildx build --platform linux/arm64`), **SES** for mail (~$0.10/1k), **SSM Parameter Store** SecureStrings for secrets (free vs. Secrets Manager's $0.40/secret/mo), **gp3** volumes, **single-AZ RDS** until you need HA, **cap CloudWatch log retention** (14–30 days).

## Option A — steps (the budget default)

One `t4g.small` runs both the app container and Postgres.

1. **Build & push (arm64):**
   ```bash
   aws ecr create-repository --repository-name platform-scaffold
   aws ecr get-login-password --region us-east-1 \
     | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
   docker buildx build --platform linux/arm64 \
     -t <acct>.dkr.ecr.us-east-1.amazonaws.com/platform-scaffold:$(git rev-parse --short HEAD) --push .
   ```
2. **Launch EC2** — `t4g.small`, Amazon Linux 2023, Elastic IP, separate gp3 EBS volume for Postgres data. Security group: `443`+`80` from anywhere (80 for ACME), `22` from your IP only.
3. **IAM role on the instance** — allow `ecr:GetAuthorizationToken`/pull + `ssm:GetParameters` scoped to `/platform/*`. No static keys on disk.
4. **Store secrets in SSM** as SecureStrings under `/platform/*`: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_RUNTIME_PASSWORD`, DB password, SES SMTP creds.
5. **Compose file on the box** — Postgres (data on the mounted volume) + the app image:
   ```
   NODE_ENV=production
   APP_URL=https://app.yourdomain.com
   DATABASE_URL=postgres://postgres:<pw>@db:5432/platform
   APP_RUNTIME_DATABASE_URL=postgres://app_runtime:<pw>@db:5432/platform
   BETTER_AUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET=<from SSM>
   SMTP_URL=smtp://<ses-user>:<ses-pass>@email-smtp.us-east-1.amazonaws.com:587
   ```
   The entrypoint provisions the `app_runtime` role and runs migrations automatically.
6. **Caddy** for automatic HTTPS:
   ```
   app.yourdomain.com {
       reverse_proxy localhost:3000
   }
   ```
7. **DNS** — Route 53 A record → Elastic IP. Set the Google OAuth redirect URI to `https://app.yourdomain.com/api/auth/callback/google`.
8. **Backups** — nightly `pg_dump` to S3 + scheduled EBS snapshots (Data Lifecycle Manager). Test a restore once.

**Option B**: Lightsail Containers ($10–20/mo) runs the image with built-in HTTPS (no Caddy) — pair with Lightsail Managed Postgres (~$15/mo) to close Option A's backup gap.

**Option C**: Route 53 → ACM → ALB (`/api/health` check) → Fargate task (0.5 vCPU/1 GB, arm64) → RDS `db.t4g.micro` single-AZ gp3. Reference SSM params in the task-def `secrets` block. **Keep it in public subnets — no NAT gateway** (~$32/mo silent cost). Don't use Aurora Serverless v2 (0.5-ACU floor ~$43/mo > RDS here).

## Pre-deploy checklist

- [ ] Real `BETTER_AUTH_SECRET` + `APP_RUNTIME_PASSWORD`, all placeholder secrets replaced.
- [ ] `NODE_ENV=production`, `APP_URL=https://<real domain>` (drives Secure cookies + CSRF).
- [ ] Google OAuth redirect URI updated to prod domain.
- [ ] SES: domain verified (DKIM), **out of sandbox**, `SMTP_URL` set.
- [ ] Postgres backups configured **and a restore tested**.
- [ ] `pnpm test:isolation` passes against the target DB.
- [ ] Decide on live RLS (app-layer scoping only until the pool uses `app_runtime` — OK for beta).
- [ ] CloudWatch log retention capped; uptime alert on `/api/health`.
- [ ] Fix `init.sh` `/health` → `/api/health`.

## Scaling past one instance

- **Migrations race** — move them to a one-shot ECS task per deploy; app instances skip migrate.
- **pg-boss** — safe in every instance (Postgres row locks), but each polls the DB. Split workers into a dedicated always-on service if job volume grows.
- **Sessions are DB-backed** — no sticky sessions; any instance serves any request.
- **SPA assets** — put CloudFront in front of the ALB, cache `/assets/*`.

## Bottom line

Cheap to host because it's deliberately simple: one warm container, one Postgres, SES. Legitimate beta for **~$15/mo** (Option A), managed customer-ready for **~$60–90/mo** (Option C). The two things separating "beta" from "paying multi-tenant customers" are the **compiled build** and **live RLS** — neither is a rewrite.
