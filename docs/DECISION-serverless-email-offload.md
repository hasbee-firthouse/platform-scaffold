# Decision Brief: Drop the always-on job worker → unlock serverless (scale-to-zero)

_Status: **proposed, not decided.** Prepared 2026-07-28 for architect review._
_Scope: a single product fork of this scaffold, low email/notification volume expected._

---

## The question on the table

Today the app **must run an always-on instance** because pg-boss (the job queue) runs a worker
*inside the API process* and that worker must keep polling Postgres to drain the queue. That single
constraint rules out scale-to-zero serverless hosting (Lambda, App Runner idle).

The product owner expects **low daily volume** for invitations, notifications, and all other email.
So the question is:

> Can we change email/jobs from **always-on** to **on-demand**, so the app can run on a
> **scale-to-zero** serverless platform (specifically **AWS App Runner**)?

This brief lays out the current design, the proposed change ("Path 1"), its blast radius, the risks,
and the **open decisions** the reviewing architect needs to make. It does **not** commit code.

---

## Current architecture (verified in the code)

**Everything runs on one Postgres and one warm container.** Fastify serves `/api/*` and the built
SPA on port 3000. The job queue is pg-boss, backed by the same Postgres — no Redis, no SQS.

**The email port is enqueue-only.** `EmailPort.send` never transports synchronously; it enqueues an
`email-delivery` job that a worker later drains. This is a deliberate SPEC decision:

- `SPEC.md:310` — _"All sends go through the job queue (Section 14) with retry; direct synchronous
  send is not exposed."_
- `SPEC.md:316` — _"Workers run **in the API process** in v1 ... a separate worker deployment is a
  future ops choice, not a code change."_

**Four jobs exist:**

| Job | Where | Status |
|---|---|---|
| `email-delivery` — every transactional email | `packages/platform-email/src/port.ts:67` | Live, on the critical auth path |
| `workspace.export` — CSV export → emailed | `modules/reference-workspace/api/export.job.ts:85` | Live (reference module) |
| `invite-expiry-sweep` — cron | `packages/platform-jobs/src/shipped-jobs.ts:14` | **Stubbed** (`TODO(E5)`) |
| `soft-deleted-org-purge` — cron | `packages/platform-jobs/src/shipped-jobs.ts:25` | **Stubbed** (`TODO(E4)`) |

**The five email producers** — all flow through the one `EmailPort.send` choke point:

| Producer | Site | Urgency |
|---|---|---|
| verify / reset / magic-link | `apps/api/src/main.ts:90-95` (better-auth callbacks) | **Interactive** — user waiting on-screen |
| invite | `apps/api/src/routes/orgs/deps.ts:46` | Fire-and-forget |
| account-created | `account-created` template, admin-created member | Fire-and-forget |
| workspace export CSV | `modules/reference-workspace/api/export.job.ts:89` | Fire-and-forget |

**Wiring / lifecycle:**
- Composition root builds jobs + email port and starts the workers: `apps/api/src/main.ts:70-115`.
- `jobs` is threaded through the request context: `apps/api/src/context.ts:85`, `:94`.
- Module job workers register through a dedicated seam: `modules/register-apis.ts:77`.
- Graceful shutdown stops pg-boss: `apps/api/src/shutdown.ts:44-46`.
- Migrations + role provisioning run at container start: `scripts/entrypoint.sh:16-23`.

---

## What the queue actually buys (so we know what we'd give up)

1. **Async offload** — signup/invite return immediately instead of blocking on SES latency.
2. **Retries with backoff** — transient SES failures re-run instead of losing the email.
3. **Durability** — jobs are Postgres rows; a mid-send restart re-runs them.
4. **Cron** — the two housekeeping sweeps run on a schedule with no external scheduler.
5. **Zero new infrastructure** — all of the above on the Postgres we already run.

At **low volume**, (1) has little value (nothing is overwhelmed) and (4) is trivially replaced by a
platform scheduler. The real thing we trade away is **(2)+(3): durable retries.**

---

## The proposal — "Path 1": synchronous send, no worker

Swap the **one factory** `createEmailPort` (`packages/platform-email/src/port.ts:100`) from
"enqueue the delivery job" to "render + `adapter.transport` **inline**." The render+transport logic
already exists in `createEmailDeliveryJob` (`port.ts:67`) — we call it directly instead of through a
queue. **The five producer call sites do not change.**

To actually reach scale-to-zero, *all four* jobs must leave the in-process worker (keeping pg-boss
"just for export" still forces an always-on worker and defeats the purpose):

- **Email** (verify/reset/magic-link/invite/account-created) → inline transport.
- **Export** → inline (build CSV + send in-request) **or** move to a scheduled drain.
- **Two cron sweeps** → **EventBridge Scheduler → a protected internal endpoint**. They're just
  scheduled SQL; they never needed pg-boss. (Both are stubs today, so near-zero code.)

Paired host: **AWS App Runner** with scale-to-zero — least-change serverless path because it keeps
the single-container "Fastify serves API + SPA" model. (Lambda would save marginally more but forces
splitting the SPA to S3/CloudFront and the API to Lambda — a bigger restructure.)

---

## Blast radius — files

| File | Change | Ripple |
|---|---|---|
| `packages/platform-email/src/port.ts` | `createEmailPort` transports inline (deps become `config`+`adapter`, not `enqueue`) | Core change, ~1 function |
| `packages/platform-email/src/port.test.ts` | **Inverts.** Line 78 asserts _"send enqueues, never transports (AC #3)"_ — must now assert it transports | ~3 tests rewritten |
| `apps/api/src/main.ts` | `createEmailPort({config, adapter})`; drop `registerWorker(deliveryJob)` (`:111`) and `jobs.start()` | Small |
| `modules/reference-workspace/api/plugin.ts` | Export endpoint (`:279`) returns **202 Accepted** today; sync → returns 200 and blocks on CSV+email | **API contract change → frontend touch** |
| cron stubs | `inviteExpirySweep`/`softDeletedOrgPurge` workers (`main.ts:112-113`) move to EventBridge → internal endpoint | Low code today; **new auth surface** for that endpoint |

### The pg-boss decision fork (wide but shallow)

To truly scale to zero, `jobs.start()` and all worker registrations go away. Then choose:

- **(A) Keep `@platform/jobs` dormant** — email inline, export inline, cron on EventBridge; the
  package sits unused. **Least ripple.** _Recommended for the first cut._
- **(B) Remove pg-boss entirely** — cleaner, but `jobs` is threaded through `PlatformContext`
  (`context.ts:85`), `BuildContextOptions` (`:94`), and the module seam (`register-apis.ts:52,56,77`).
  Removing it ripples into **~6 context-building test files** (`app.test.ts`, `context.test.ts`,
  `isolation.spec.ts`, `lib/session.test.ts`, `routes/me.test.ts`, `plugins/auth.test.ts`), plus
  `shutdown.ts` (drops `jobs.stop()`). Mechanical and compiler-guided, but a wide diff.

Recommendation: **(A) now, (B) later** once you're sure durable jobs won't be wanted back.

---

## The real risk isn't files — it's the auth path

The verify/reset/magic-link senders are `await`ed **inside better-auth's own request handling**
(`main.ts:90-95`). Today they enqueue and return in ~1ms. Synchronous, they block the auth request
on an SES round-trip. Two non-negotiables:

1. **Non-throwing senders.** If better-auth propagates a sender error, a transient SES blip becomes a
   **failed sign-up**, not just a delayed email. Wrap each sender: catch → log → resolve. Accept
   "email may be lost" over "signup fails." **(Verify better-auth's error-propagation behavior before
   building this.)**
2. **Bounded transport.** Add an SMTP timeout + 2–3 retry cap *inside* the request, or a hung SES
   connection hangs the auth request.

Invite/export/account-created are fire-and-forget and tolerate the latency. Durability loss is
mitigated by inline retry + structured logging + existing resend affordances (invite resend exists;
users can re-request password resets).

---

## App Runner implications — it forces two otherwise-deferrable changes

The image already fits: single port 3000, non-root, arm64, `/api/health` exists, DB-backed sessions
(no sticky sessions). But scale-to-zero breaks two current assumptions:

1. **Migrations-at-boot must move.** `scripts/entrypoint.sh:16-20` runs role-provisioning + migrate
   on *every* container start — safe only with exactly one always-on instance. App Runner controls
   instance count and cold-starts containers on scale events, so this **races** and adds seconds to
   every scale-from-zero. Extract migrations into a **one-shot deploy step** (GitHub Action /
   CodeBuild against RDS before flipping traffic); the entrypoint becomes just `exec node`.
   *(Option A/EC2 let you defer this; App Runner does not.)*
2. **The compiled-build gap (G1) hurts more.** `entrypoint.sh:23` runs `node --import tsx` on TS
   source. On an always-on box you pay transpile once; on scale-to-zero you pay it on **every cold
   start**. The `tsc`/`esbuild` build step matters more here.

Smaller ones:
- **Cold-start + synchronous SES stack up.** A magic-link click after idle = container cold start
  *plus* the now-synchronous send. If unacceptable, set min-instances=1 — but then you're not at
  zero, and you're back to the cost question.
- **Connection storms.** Each App Runner instance opens its own Postgres pool; `db.t4g.micro` caps
  ~100 connections. Cap the per-instance pool; RDS Proxy if it bursts (adds cost). Fine at low volume.
- **Secrets.** App Runner references **Secrets Manager** natively, not SSM Parameter Store — minor
  drift from the deployment doc's recommendation.

---

## Cost reality check (read before optimizing for cost)

- **The database can't scale to zero cheaply, and it dominates the bill.** RDS bills 24/7. Aurora
  Serverless v2 has a floor (~$43/mo even idle; its newer auto-pause-to-0-ACU helps). Scaling the
  *app* to zero while the *DB* bills all month saves little.
- **Always-on is already near-free at this scale.** `t4g.micro` is free-tier-eligible for 12 months;
  `t4g.small` is ~$12/mo. This change's honest win is **ops simplicity (no server to patch, cleaner
  model)**, not near-zero dollars.
- If the goal is genuinely near-zero *cost*, the DB is the real target (Aurora Serverless v2
  auto-pause, or an external scale-to-zero Postgres like Neon) — a bigger shift than this brief.

---

## SPEC deviation flag

This proposal contradicts two locked SPEC decisions (`SPEC.md:310` enqueue-only email; `SPEC.md:316`
in-process workers). It is a legitimate change on a fork — and `SPEC.md:316` explicitly anticipates
"a separate worker deployment is a future ops choice" — but it **must be a conscious, recorded
decision**, not a silent drift. If accepted, update SPEC §13/§14 accordingly.

---

## Open decisions for the reviewing architect

1. **Goal:** is this for **lower ops** (clear win) or **lower cost** (marginal — DB dominates)? This
   determines whether the change is even worth it.
2. **Durability tolerance:** is "an email can be lost on an SES outage, mitigated by inline retry +
   resend" acceptable for this product? (Password reset & invite are the sensitive ones.)
3. **pg-boss fate:** keep dormant (A) or remove entirely (B)?
4. **Export:** synchronous in-request, or moved to a scheduled EventBridge drain? (Affects the 202→200
   contract change and frontend copy.)
5. **Cold-start UX:** accept multi-second cold starts on interactive auth, or pin min-instances=1
   (giving up true zero)?
6. **Host:** App Runner (least change) vs. Lambda (more savings, SPA/API split) vs. staying on
   always-on EC2 (free tier, zero migration)?

---

## Recommended sequencing (if accepted)

Steps 1–2 are reversible and independently shippable **even on the current always-on host** — they
de-risk before any hosting change.

1. **Inline, non-throwing, timeout-bounded senders** + invert `port.test.ts`. Test the auth path hard.
2. **Export → sync** (or EventBridge) + **cron sweeps → EventBridge internal endpoint**.
3. **Extract migrations** to a one-shot deploy step + **compiled build** (`tsc`/`esbuild`).
4. **Flip to App Runner** (scale-to-zero), or keep the door open per decision #6.

---

## Appendix — key file anchors

- Email port (the choke point): `packages/platform-email/src/port.ts:67` (delivery job), `:100` (port factory)
- Enqueue-only test to invert: `packages/platform-email/src/port.test.ts:78`
- Composition root / worker startup: `apps/api/src/main.ts:70-115`
- `jobs` in context: `apps/api/src/context.ts:85`, `:94`
- Module worker seam: `modules/register-apis.ts:77`
- Export endpoint (202 Accepted): `modules/reference-workspace/api/plugin.ts:279`
- Graceful shutdown stops pg-boss: `apps/api/src/shutdown.ts:44-46`
- Migrate-at-boot entrypoint: `scripts/entrypoint.sh:16-23`
- Cron job stubs: `packages/platform-jobs/src/shipped-jobs.ts:14`, `:25`
- SPEC decisions to amend: `SPEC.md:310`, `SPEC.md:316`
