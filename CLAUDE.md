# platform-scaffold

A reusable scaffold for creating independent SaaS products. A new product is created by
**forking** this repository, selecting a product profile, rebranding via configuration, and
replacing the built-in `reference-workspace` module with product modules. Authentication,
sessions, organizations, membership, authorization, tenant isolation, theming, terminology,
entitlements, audit, email, jobs, and operations are **inherited and never rebuilt**.

The deliverable is a **running system, not a library of parts**: a modular monolith with one
React/Vite SPA, one TypeScript/Fastify API, and one PostgreSQL database, shipped as a single
container image plus a database. `SPEC.md` holds the locked decisions — treat it as source of truth.

## Quick Reference

**Backend:** `cd apps/api && pnpm vitest run` | `pnpm lint` | `pnpm exec tsc --noEmit`
**Frontend:** `cd apps/web && pnpm vitest run` | `pnpm lint` | `pnpm exec tsc --noEmit`
**Monorepo:** `pnpm install` | `turbo run build lint test typecheck`
**DB / migrations:** `pnpm exec drizzle-kit generate` | `pnpm exec drizzle-kit migrate`
**Full stack:** `docker compose up -d --build` (Fastify serves API + built SPA on :3000)

## Architecture

Strict layered architecture: Types → Config → Repository → Service → API → UI.
One-way dependencies only. Two intentional ports (`@platform/identity`, `@platform/email`);
everything else is called directly — no abstraction before a second implementation exists.
Tenant isolation is app-layer scoping plus PostgreSQL RLS as a backstop (`SET LOCAL` in a
transaction). `reference-workspace` must be deletable via one directory + one registration line.
See `.claude/architecture.md` for full rules.

## Where to Find Things

| What | Where |
|------|-------|
| Locked system spec | `SPEC.md` |
| Developer onboarding / architecture tour | `docs/ARCHITECTURE.md` |
| Architecture rules | `.claude/architecture.md` |
| Quality principles | `.claude/skills/code-gen/SKILL.md` |
| Testing patterns | `.claude/skills/testing/SKILL.md` |
| Evaluation rubric | `.claude/skills/evaluation/SKILL.md` |
| Sprint contract format | `.claude/skills/evaluation/references/contract-schema.json` |
| Playwright patterns | `.claude/skills/evaluation/references/playwright-patterns.md` |
| Human control knobs | `.claude/program.md` |
| Design calibration | `calibration-profile.json` |
| Project manifest | `project-manifest.json` |
| Session recovery | `claude-progress.txt` |
| Feature tracking | `features.json` |
| Learned rules | `.claude/state/learned-rules.md` |

## Pipeline Commands

| Command | Purpose |
|---------|---------|
| `/brd` | Socratic interview → BRD |
| `/spec` | BRD → stories + features.json |
| `/design` | Architecture + schemas + mockups |
| `/build` | Full 8-phase pipeline |
| `/auto` | Autonomous ratcheting loop |
| `/implement` | Code gen with agent teams |
| `/evaluate` | Run app, verify contract |
| `/review` | Evaluator + security review |
| `/test` | Test plan + Playwright E2E |
| `/deploy` | Docker Compose + init.sh |

## Code Style

- TDD mandatory: test first, then implement
- 100% meaningful coverage target, 80% floor
- Functions < 50 lines, files < 300 lines
- Static typing everywhere (zero `any`); Zod contracts at API boundaries
- Do not over-engineer: one ORM, one router, one styling system, one test runner
- See `.claude/skills/code-gen/SKILL.md` for full rules

## Git

Branch: `<type>/<description>` (e.g., `feat/user-auth`)
Commits: conventional format (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
Distribution is fork-and-diverge: no package registry, no automatic upgrades.
