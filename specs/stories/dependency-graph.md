# Dependency Graph

Stories are partitioned into parallel-executable groups. Group A has no dependencies; each later group depends only on earlier groups. Stories within a group are independently executable in parallel. Validated: no missing dependencies, no cycles, and every dependency resolves to an earlier group.

**Totals:** 28 stories across 10 groups (A → B → C → D → E → F → G → H → I → J).

## Group A

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E1-S1 | Monorepo, tooling & CI skeleton | Config | — |

## Group B

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E1-S2 | Product config schema, profiles & startup validation | Config | E1-S1 |
| E1-S3 | Shared contracts, error envelope & pagination | Types | E1-S1 |
| E1-S4 | Core DB client & migration runner | Repository | E1-S1 |

## Group C

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E2-S1 | API runtime & composition root | API | E1-S2, E1-S3, E1-S4 |
| E3-S1 | Theme provider (branding to CSS tokens) | UI | E1-S2 |
| E3-S3 | Terminology (useTerm + term helper) | UI | E1-S2 |
| E4-S1 | Identity port & better-auth adapter | Service | E1-S4, E1-S2 |

## Group D

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E2-S2 | Background jobs & email delivery | Service | E1-S4, E1-S2, E3-S3 |
| E2-S3 | Audit log schema, writer & platform events | Service | E1-S4, E2-S1 |
| E3-S2 | platform-ui component library | UI | E3-S1 |
| E4-S2 | Auth API mount, session middleware & /api/me | API | E4-S1, E2-S1 |

## Group E

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E3-S4 | Web app shell & route assembly | UI | E3-S2, E3-S3, E2-S1 |
| E5-S1 | Authorization model & enforcement | Service | E1-S3, E2-S1, E4-S2 |

## Group F

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E4-S3 | Auth screens & end-to-end flows | UI | E4-S2, E3-S4, E2-S2 |
| E5-S2 | Organizations & membership | Service | E4-S1, E2-S2, E5-S1 |
| E7-S1 | Entitlements & upgrade notice | Service | E1-S4, E5-S1, E3-S4 |
| E7-S3 | Audit Log viewer screen | UI | E2-S3, E5-S1, E3-S4 |

## Group G

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E5-S3 | Organization UI (switcher, members, invitations, roles) | UI | E5-S2, E3-S4 |
| E6-S1 | Scoped db factory & membership middleware | Repository | E1-S4, E5-S2 |
| E7-S2 | Operator CLI | Service | E7-S1, E2-S3 |
| E8-S1 | Reference module contracts, schema & manifest | Types | E1-S3, E5-S1, E7-S1 |

## Group H

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E6-S2 | RLS backstop policies | Repository | E6-S1 |
| E8-S2 | Workspace & task API services | Service | E8-S1, E6-S1, E2-S3 |

## Group I

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E6-S3 | Isolation & migration test suite | Service | E6-S1, E6-S2 |
| E8-S3 | Workspace web screens | UI | E8-S2, E3-S4 |
| E8-S4 | Export-workspace job & CSV email | Service | E8-S2, E2-S2 |

## Group J

| Story | Title | Layer | Depends On |
|---|---|---|---|
| E8-S5 | Deployment, deletability & fork story | Config | E8-S3, E8-S4, E2-S1 |

