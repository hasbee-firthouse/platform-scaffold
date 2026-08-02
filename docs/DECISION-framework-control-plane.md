# Decision Brief: The framework control plane — which customization knobs the scaffold should expose

_Status: **DECIDED 2026-08-02** (see "Decisions recorded" below). Prepared 2026-08-01 for architect review._
_Scope: the scaffold itself (platform + reference module), not a single fork._

---

## Decisions recorded (2026-08-02)

| # | Decision | Chosen |
|---|---|---|
| 1 | Scope of first build | **Tier 1 + Tier 2 together** — build the cheap primitives *and* the shared cross-org plane in this pass |
| 2 | §9.1 exception | **Approved in principle** — shared plane is published-only + read-only, with its own tested access policy and a new SPEC section |
| 3 | Org typing | **Strictly one type** — an org is a Writer or a Reader, chosen at onboarding |
| 4 | Content reach | **Public to all Reader orgs** — one shared shelf (public library); subscribe/follow deferred |
| 5 | Groups / scoping (Gap 5) | **Deferred** to a later, second reference demonstration |
| 6 | Reference module | **Keep `reference-workspace`, rename nouns** (workspace→space, task→note, +likes/comments) — one deletable module exercises Tier 1 + Tier 2 |

Next artifact: a build plan sequenced per "Recommended sequencing" below, adjusted so the
shared plane (step 3) is now in-scope rather than gated.

---

## The question on the table

This scaffold is a **framework**, not an app. Forks turn it into different products by
**configuring**, not rebuilding: a simple B2C tool, a B2B SaaS with its own roles, a
two-sided **marketplace** (buyers/sellers), a **finance app for organizations**. The
reference module exists to **prove and exercise** each customization knob so a fork copies
a working pattern instead of inventing one.

So the question is not "what should the writer/reader app do." It is:

> **What is the minimal set of control-plane knobs that covers the common product
> archetypes — and does the reference module exercise each one?**

This brief inventories the knobs that exist today (verified in code), maps the target
archetypes onto them, names the gaps, and proposes a **tiered, minimal** set of additions.
It does **not** commit code.

---

## The principle that governs everything

`SPEC.md` §2, rule 2 is the constitution for this decision:

> **"No speculative configuration. A setting exists only if the reference module or a
> profile exercises it."**

Two consequences, and they cut in opposite directions — which is the whole tension:

1. We do **not** add a knob because a hypothetical product *might* want it.
2. Therefore, to legitimately add (say) org-typing or ownership authz to the framework,
   **the reference module must be redesigned to exercise it.** The reference module is the
   justification mechanism, not decoration.

This is why "redesign the reference module" and "extend the control plane" are the **same
project**, not two.

---

## The control plane today (verified in the code)

### Layer 1 — `product.config.ts` (the rebrand surface, SPEC §7)

One Zod-validated file; invalid config refuses to boot. Anchors: `product.config.ts`,
schema in `packages/platform-config`.

| Knob | Field | What it varies |
|---|---|---|
| **Tenancy shape** | `profile` / `capabilities` | personal-org vs team-org; self-service org creation; magic link; enterprise entitlement keys (SPEC §7.1) |
| **Branding / theming** | `branding` (token set) | colors, logo, typography, radius → CSS vars at boot (§7.2) |
| **Terminology** | `terminology` + `useTerm()` | relabel platform nouns single-locale (§7.3) |
| **Navigation** | `navigation.order/hidden` | reorder/hide module nav |
| **Email identity** | `email` | from-name / from-address |

Profiles are **presets over capability flags** (SPEC §7.1): `b2c-simple`
(personalAccounts), `b2b-standard` (organizations), `b2b-enterprise` (+ enterprise keys).
Because of **D7** (a personal account *is* an org of one), there is a **single
authorization path and isolation model** underneath all of them — profiles only show/hide
UI and allow/deny endpoints.

### Layer 2 — the module manifest (per-feature authz + limits)

Anchor: `ModuleManifest` in `modules/index.ts:33`.

| Knob | Field | What it varies |
|---|---|---|
| **Permissions** | `permissions: string[]` | dotted ids `"<module>.<resource>.<action>"` |
| **Roles** | `roles: Record<string,string[]>` | named module roles → permission ids (e.g. `Workspace Manager`) |
| **Entitlements** | `entitlements: Record<string, boolean\|number>` | feature flags + numeric limits |
| **Jobs** | `jobs: ModuleJob[]` | background work + retry policy |

### Layer 3 — the authorization core (`@platform/authz`)

- **Permission model** (`permissions.ts`): dotted-string ids; wildcards live only in
  *definitions* and are expanded to concrete sets at build time; `isReadPermission`
  drives the `member` read defaults.
- **Built-in roles** (`roles.ts:36`): `owner` = `*`; `admin` = `*` minus
  `OWNERSHIP_GUARDED_PERMISSIONS` (`org.delete`, `org.ownership.transfer`); `member` =
  read defaults + module member grants.
- **One resolver** (`resolve.ts`): `resolveRole` + `hasPermission` — every check flows
  through this single function. (This is what makes future groups a one-function change —
  see Gap 5.)
- **Enforcement**: `requirePermission` preHandler per route; a route without a permission
  or explicit `public: true` **fails CI** (SPEC §10.3 static check). Client `<Can>` is
  cosmetic (§10.3).

### Backbone (always on — not knobs)

- **Auth/session** (better-auth, SPEC §8).
- **Tenant isolation** (SPEC §9): app-layer `withOrg(orgId, tx=>…)` running
  `SET LOCAL app.org_id`, plus RLS `FORCE ROW LEVEL SECURITY` as backstop. **SPEC §9.1:
  "There is no code path that queries tenant tables outside `withOrg`."** This sentence is
  the single biggest constraint on everything below.
- **Audit** (SPEC §11), org-scoped like everything else.

### One fact that matters a lot

The `organization` table **already carries a `type` column** (`personal` | `team`) —
better-auth org extended with `type`, `deleted_at` (SPEC line 388), read today at
`modules/reference-workspace/api/roles.ts` (`schema.organization.type`,
`row.orgType === 'personal'`). **Org typing is not greenfield — it already exists as a
two-value enum used for authorization decisions.** The org-typing knob (Gap 3) is a
*generalization* of a mechanism the platform already relies on, not a new concept.

---

## What the target archetypes demand

_Legend: **✅** needed and already covered · **–** not needed for this archetype ·
**often / maybe / sometimes** needed by some products of this type, not intrinsic to it ·
**GAP N** needed and currently missing (the thing to add)._

| Need | B2C simple | B2B standard | **Marketplace** | **Finance (org)** |
|---|:--:|:--:|:--:|:--:|
| Tenancy shape | personal ✅ | team ✅ | team ✅ | team ✅ |
| RBAC (perms + roles) | minimal ✅ | ✅ | ✅ | ✅ (rich) |
| Entitlements / limits | ✅ | ✅ | ✅ | ✅ |
| Branding / terminology / nav | ✅ | ✅ | ✅ | ✅ |
| **Org typing** (buyer/seller, writer/reader, clinic/insurer) | – | – | **GAP 3** | maybe |
| **Ownership authz** (creator-only edit) | – | often | **GAP 1** | **GAP 1** |
| **Record lifecycle/visibility** (draft→published→archived) | – | often | **GAP 2** | **GAP 2** |
| **Shared cross-org plane** (read another org's content) | – | – | **GAP 4** | – |
| **Scope / groups** (department, region, branch) | – | sometimes | – | **GAP 5** |
| Approval / maker-checker | – | – | – | Tier 3 (defer) |

**Read this table as the finding:** B2C-simple and B2B-standard are **already fully
covered** — they are pure configurations of the existing plane, nothing to add. The
ambitious archetypes need **five** things, and — importantly — **three of the five
(ownership, lifecycle, org-typing) are cheap and near-universal**, not marketplace-exotic.

---

## The five gaps, and proposed additions (tiered, minimal)

### Tier 1 — cheap, near-universal, add now (each becomes a small platform primitive)

**Gap 1 — Ownership-based authorization.**
Today authz is role-only (`callerHasPermission(role, permission)` in
`reference-workspace/api/authz.ts`). But the `created_by` column already exists on every
resource table (`schema.ts:23,41`). Add a **`requireOwnership`** helper beside
`requirePermission`: "this permission, *and* you are the row's `created_by` (owner/admin
bypass for moderation)." One primitive, near-universal — orders, documents, posts,
transactions all need "edit your own, not others'." Blast radius: one new function in
`@platform/authz` + adoption at call sites that opt in. No schema change.

**Gap 2 — Record lifecycle + visibility.**
The `task.status` `open|done` pattern (`shared/task.contract.ts:13`) is already the
template: a status text column whose semantics live in a shared Zod enum. Generalize to a
declared lifecycle (`draft → published → archived`) where **visibility is filtered in the
query, not the UI** — a draft is returned only to its author/admins. Blast radius: a
convention + a repository helper; the reference module demonstrates it.

**Gap 3 — Org typing.**
Generalize the existing `organization.type` enum from `personal|team` into a
**config-declared set of org types**, each mapping to a nav profile + a permission
profile. `product.config.ts` gains an `orgTypes` block (respecting §2: only because the
reference module uses it). A fork's marketplace declares `buyer|seller`; a publisher
declares `writer|reader`; a clinic app declares `clinic|insurer`. Blast radius: config
schema + a resolver that keys nav/permissions off the caller's active-org type; the
`type` column already exists and is already migrated.

### Tier 2 — moderate, prove exactly once in the reference module

**Gap 4 — Shared cross-org data plane.**
This is the hard one and the only one that touches the backbone. The marketplace and the
publisher/reader model both require a **Reader/buyer org to see content authored in a
different org** — which SPEC §9.1 ("no query outside `withOrg`") deliberately forbids for
tenant tables. The proposal is a **two-plane** design, built **once** in the reference
module so forks copy a proven-safe pattern:

- **Private plane (unchanged):** all drafts / internal rows stay in RLS-scoped tenant
  tables. Nothing here changes; isolation is untouched.
- **Shared plane (new):** on **publish**, a **published-only** record enters a shared
  shelf with its **own explicit, tested access policy** — read-only for consumer orgs,
  self-scoped writes for engagement (a reader's like/comment is tagged with their own
  org+user; they mutate only their own; only on published rows).

This is a **new security surface** and must be reviewed as one — it is the single
deviation from §9.1 in this whole brief. Doing it once, in the reference, is the point:
forks inherit the pattern instead of each cutting an unsafe hole.

### Tier 2b — for finance/enterprise, can follow Tier 1/2

**Gap 5 — Scope / groups (activate the deferred D8).**
Finance and enterprise need sub-org scoping (department, region, branch): "an approver
sees only their branch." SPEC §10.5 already reserves this and notes permission resolution
flows through **one resolver** (`resolve.ts`), so groups change **one function, not every
call site**. Recommend deferring to a **second, smaller reference demonstration** so we
don't bloat one module trying to show everything.

### Tier 3 — DEFER (not common enough vs. cost)

- **Approval / maker-checker workflows** (finance-specific; a workflow engine is a large
  surface).
- **Runtime-editable roles** (D12 — roles stay code-defined; self-service role authoring
  is expensive and rare). Keep both explicitly out until a concrete fork needs them.

---

## How the reference module pays for these knobs (§2 compliance)

Per the constitution, each Tier 1/2 knob needs a live exerciser. A **writer/reader**
redesign of `reference-workspace` exercises **all of Tier 1 + Tier 2 in one small,
explainable domain**:

| Knob | Exercised by |
|---|---|
| Org typing (Gap 3) | **Writer org** vs **Reader org** |
| Shared cross-org plane (Gap 4) | Reader orgs read Writer orgs' **published** notes |
| Record lifecycle/visibility (Gap 2) | note **draft → published** |
| Ownership authz (Gap 1) | a Writer edits/publishes **only their own** notes |
| RBAC within org (existing) | who **inside** a Writer org may publish |
| Entitlements / audit / jobs / email / terminology (existing) | note cap, publish audit events, export job, export email, `space`/`note` nouns |

B2C-simple and B2B-standard remain demonstrated by **profiles** (unchanged). The reference
module thus graduates from "demonstrates RBAC + entitlements" to "demonstrates the full
plane including org-typing, ownership, lifecycle, and the shared plane" — which is exactly
the set the marketplace and finance forks reuse. Finance's scope/groups (Gap 5) becomes a
separate small demonstration, keeping any one module honest and deletable.

**Deletability check:** every addition must preserve SPEC's "one directory + one line"
deletion (`docs/FORKING.md` step 4). The shared-plane tables are the risk — they must live
inside the module's `schema.ts` and register through the existing seams, so deleting the
module still leaves the platform building. This is a hard acceptance criterion, not an
afterthought.

---

## SPEC deviations this brief would trigger

| Addition | SPEC impact |
|---|---|
| Ownership authz (Gap 1) | Additive — extends §10 authz; no locked decision contradicted |
| Lifecycle/visibility (Gap 2) | Additive — module convention |
| Org typing (Gap 3) | Extends §7 config + the `organization.type` usage; update §7 config schema |
| **Shared cross-org plane (Gap 4)** | **Deviates from §9.1** ("no query outside `withOrg`"). Must be a conscious, recorded exception with its own access-control spec section |
| Groups (Gap 5) | Activates deferred **D8**; §10.5 already anticipates it |
| Approvals / runtime roles | Remain deferred (D8/D12 posture unchanged) |

Gap 4 is the only one that touches a locked invariant. It should not be built as silent
drift; if accepted, it earns a new SPEC section defining the shared plane's access rules.

---

## Open decisions for the reviewing architect

1. **Scope of ambition:** commit to Tier 1 + Tier 2 now (org-typing + ownership +
   lifecycle + shared plane), or **Tier 1 only** first (cheap primitives, no §9.1
   deviation) and treat the shared plane as a separate later decision?
2. **The §9.1 deviation:** is a reviewed, published-only, read-only shared plane an
   acceptable, recorded exception to "no query outside `withOrg`"? (Everything cross-org
   hinges on this yes/no.)
3. **Org-type flexibility:** is an org **strictly one type**, or can one org be both
   (e.g. a school that also publishes)? Strict is simpler to secure; "both" complicates
   nav + anti-self-dealing rules.
4. **Content reach (if Gap 4 accepted):** published content visible to **all** consumer
   orgs (public library), or only to orgs that **subscribe/follow** a producer? The latter
   adds a relationship model + screens.
5. **Groups (Gap 5):** confirm deferral to a second reference demonstration rather than
   folding it into the writer/reader module now.
6. **Reference module identity:** keep `reference-workspace` as the exerciser (rename
   nouns to space/note), or introduce a second reference module so no single module tries
   to demonstrate everything?

---

## Recommended sequencing (if accepted)

Tiers are independently shippable; earlier steps de-risk later ones and never touch §9.1
until the deviation is explicitly approved.

1. **Tier 1 primitives** — `requireOwnership` in `@platform/authz`; lifecycle/visibility
   convention; `orgTypes` in the config schema. All additive, no backbone change.
2. **Redesign `reference-workspace`** to exercise Tier 1 (writer/reader **within** the
   org-typing dimension, still single-plane) — proves 3 of 4 knobs with zero §9.1 risk.
3. **Decision gate on Gap 4.** Only if approved: build the shared plane + its access-policy
   spec section, and light up cross-org reader consumption.
4. **Later:** groups (Gap 5) as a second small reference; revisit Tier 3 only on concrete
   demand.

---

## Appendix — key file anchors

- Config surface / profiles: `product.config.ts`, SPEC §7 / §7.1 (`SPEC.md:163-206`)
- Module manifest contract: `modules/index.ts:33`
- Built-in roles + ownership-guarded perms: `packages/platform-authz/src/roles.ts:19,36`
- Permission model + wildcard expansion: `packages/platform-authz/src/permissions.ts:20,56`
- The single resolver (why groups are a one-function change): `packages/platform-authz/src/resolve.ts`
- Route enforcement + CI static check: SPEC §10.3 (`SPEC.md:280`)
- Tenant isolation invariant (the §9.1 constraint): `SPEC.md:259`
- `organization.type` already in use for authz: `modules/reference-workspace/api/roles.ts:130-138`, SPEC line 388
- Lifecycle template (`status` enum): `modules/reference-workspace/shared/task.contract.ts:13`
- `created_by` already on resource tables: `modules/reference-workspace/api/schema.ts:23,41`
- Module role example: `modules/reference-workspace/manifest.ts:49`
- Groups reserved (D8): SPEC §10.5 (`SPEC.md:285`); roles not runtime-editable (D12): `SPEC.md:47`
- Deletability procedure the additions must preserve: `docs/FORKING.md` step 4
