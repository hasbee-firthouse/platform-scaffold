# Build Plan: Spaces & Notes reference module (Writer / Reader)

_Prepared 2026-08-02. Implements the decisions in `docs/DECISION-framework-control-plane.md`._
_Principle: keep it simple. Every piece below exists to exercise **one** control-plane knob._

---

## What we're building

The `reference-workspace` module is redesigned (in place, renamed nouns) into a tiny
publishing domain that proves four framework knobs at once:

- **Org typing** — an org is a **Writer** or a **Reader** (chosen at onboarding).
- **Product roles** — module-defined roles grant specific functionality *within* an org type.
- **Record lifecycle** — a Note is a **draft**, then **published**.
- **Ownership authz** — you edit your own Notes, not other people's.
- **Shared plane** — a Reader org reads Notes **published** by Writer orgs (public library).

Everything else (auth, tenancy for private data, entitlements, audit, jobs, email,
terminology, theming) is inherited unchanged.

---

## The product roles (the important part)

Org **type** decides *which side of the app you see*. Your **role** decides *what you can do
on that side*. Roles are declared in the module manifest and offered on the Members screen
based on the org's type.

### Writer org — an editorial workflow

| Role | Permissions | What they can do |
|---|---|---|
| **Author** | `space.notes.read`, `space.notes.write` | Write and edit **their own** drafts. **Cannot publish.** |
| **Editor** | `+ space.notes.publish`, `space.spaces.manage` | Publish/unpublish, edit **any** Note (moderation), manage Spaces. |
| _owner / admin_ | all module permissions (built-in) | Everything, plus org administration. |

> **Example — "Daily Insights" (Writer org):** journalists are **Authors** (they draft),
> the desk editors are **Editors** (they publish). An Author drafting a Note cannot push it
> live; an Editor reviews and publishes. That draft→publish split is one product role vs.
> another — no new code path, just a different permission set.

### Reader org — read vs. engage

| Role | Permissions | What they can do |
|---|---|---|
| **Reader** | `space.notes.read`, `space.likes.write` | Browse published Notes, **like** them. |
| **Commenter** | `+ space.comments.write` | Everything a Reader can, plus **comment**. |
| _owner / admin_ | all module permissions (built-in) | Above, plus manage the org's members. |

> **Example — "Springfield High" (Reader org):** students join as **Readers** (they read and
> like), teachers join as **Commenters** (they also discuss in comments). Same org, same
> shared feed — two roles giving two levels of participation.

This is the whole point: **the framework lets a fork define roles like Author / Editor /
Reader / Commenter as pure configuration** (manifest + config), and the platform enforces
them. A marketplace fork would instead declare `Seller-Owner / Fulfiller / Buyer` the same way.

---

## Permissions (six, flat)

```
space.spaces.manage      # create / rename / delete Spaces      (Editor, admin)
space.notes.read         # read Notes                            (everyone)
space.notes.write        # create / edit draft Notes             (Author, Editor)
space.notes.publish      # publish / unpublish Notes             (Editor, admin)
space.comments.write     # post comments                         (Commenter)
space.likes.write        # like / unlike                         (Reader, Commenter)
```

Which roles are offered per org type lives in config (the org-typing knob):

```ts
// product.config.ts — illustrative
orgTypes: {
  writer: { nav: ['spaces'],  roles: ['Author', 'Editor'] },
  reader: { nav: ['library'], roles: ['Reader', 'Commenter'] },
}
```

---

## Data model — two planes, kept minimal

**Private plane** (Writer org only; org-scoped `withOrg` + RLS, exactly as today):

- `space` — was `workspace`: `id, org_id, name, created_by, timestamps`.
- `note` — was `task`: `id, org_id, space_id, title, body, status('draft'|'published'), published_at, created_by, timestamps`.

**Shared plane** (the one new, cross-org-readable surface):

- `published_note` — a projection written **on publish**: `id(=note id), writer_org_id, space_id, title, body, author_id, published_at`.
- `note_like` — `id, published_note_id, reader_org_id, user_id, created_at` · unique `(published_note_id, user_id)`.
- `note_comment` — `id, published_note_id, reader_org_id, user_id, body, timestamps`.

**Why a separate `published_note` instead of a clever RLS policy:** it is simpler and safer.
Publishing = insert one row; unpublishing = delete it. Drafts physically never reach the
shared shelf, so **you literally cannot like or comment on an unpublished Note** — there's
no shared row to attach to. That is the two-plane pattern in its most readable form.

---

## Security gates (all server-side; UI `<Can>` stays cosmetic)

1. **Tenant** — private tables via `withOrg` + RLS (unchanged). Shared tables have their own
   explicit rule: reads are **published-only**; engagement writes are **self-scoped**
   (tagged with the caller's reader org + user; you mutate only your own rows).
2. **Org type** — publishing/authoring requires `orgType = writer`; engagement requires
   `orgType = reader`. Checked before the handler.
3. **Role** — `requirePermission` per route (the existing CI check still fails any unguarded route).
4. **Ownership** — Author edits/unpublishes only Notes where `created_by = you`; Editor/admin bypass for moderation.

---

## API surface

**Writer side** (`/api/orgs/:orgId/spaces/*`, `orgType = writer`):
- Spaces: `GET` list · `POST` create · `PATCH` rename · `DELETE`
- Notes: `GET` list (own drafts + all published in the Space) · `POST` create draft ·
  `PATCH` edit · `POST :id/publish` · `POST :id/unpublish` · `DELETE`

**Reader side** (`/api/library/*`, `orgType = reader` — the cross-org surface):
- `GET /api/library` — published Notes across all Writer orgs
- `GET /api/library/:id` — a published Note + its comments
- `POST /api/library/:id/like` · `DELETE /api/library/:id/like`
- `POST /api/library/:id/comments` · `DELETE /api/library/:id/comments/:commentId` (own only)

---

## Platform primitives to add (Tier 1 — small, reusable)

1. **`requireOwnership`** in `@platform/authz` — "has this permission **and** owns the row
   (owner/admin bypass)." One function, sits beside `requirePermission`.
2. **Lifecycle/visibility convention** — a shared status enum + a repository list that filters
   by visibility (drafts → author/editor only). A pattern, not a framework.
3. **`orgTypes`** in the config schema — generalizes the existing `organization.type`
   (`personal|team`) into config-declared types with their nav + offered roles.

---

## Build steps (sequenced, test-first)

Each step is independently green; write the listed tests **first**.

0. **Primitives + config** — ✅ **done (2026-08-02).** Added `requireOwnership` to
   `@platform/authz` (+7 tests) and the optional `orgTypes` block to the config schema
   (+3 tests); typecheck + eslint clean. **Populating `product.config.ts` with the
   writer/reader types is deferred to Step 2** — declaring types nothing consumes yet would
   violate SPEC §2 ("a setting exists only if the reference module or a profile exercises it").
1. **Rename** — ✅ **done (2026-08-02).** Tables `workspace→space`, `task→note` at the DB
   layer, including `@platform/tenancy` `TENANT_TABLES` + its pinned RLS tests + the
   regenerated RLS migration (squashed to a clean baseline + custom `rls_backstop_policies`);
   seed raw SQL; UI relabelled to Space/Note via the `terminology` knob (no screen edits).
   Column names, permission ids, URL paths and internal TS symbols keep `workspace/task` for
   now — they are renamed in Step 2 where those layers are redesigned anyway. Verified:
   `-r typecheck` clean (16 pkgs), 189 unit tests green, and migrations apply to a fresh
   Postgres (`space`/`note` + their RLS policies confirmed).
   **Note:** squashing migrations means an existing dev DB must be reset (drop + recreate +
   `db:migrate`) to adopt the new baseline; a fresh DB is unaffected.
   **Deferred to Step 1b/2:** the lifecycle fields (`body`, `published_at`, `draft|published`,
   `publish/unpublish`) — kept separate to keep this a pure, green rename.

1b. **Note lifecycle** — ✅ **done (2026-08-02).** Added `body` (NOT NULL, default `''`) and
   `published_at` (nullable) to the note table; status enum `open|done` → **`draft|published`**
   (default `draft`); `complete/uncomplete` → **`publish/unpublish`** across service, routes
   (`/tasks/:id/publish` · `/unpublish`), web client, and the tasks screen (filter + buttons);
   publishing stamps `published_at`, unpublishing clears it. Full vertical updated
   (schema → contract → repo → service → view → plugin → client → screen) with all tests.
   assignee/dueDate intentionally kept (removed in Step 2). Verified: 191 unit tests green,
   `-r typecheck` clean, migration re-applied to a fresh Postgres (`note.body`,
   `note.published_at`, `status default 'draft'` confirmed).
2. **Authoring (single-plane) — product roles + permissions** ✅ **done (2026-08-02).**
   Permissions renamed to the `space.*` namespace and a fourth added:
   `space.spaces.manage`, `space.notes.read`, `space.notes.write`, **`space.notes.publish`**;
   entitlement `workspace.maxTasks` → `space.maxNotes`. Manifest now ships two **product
   roles**: **Author** (`notes.read` + `notes.write` — draft/edit, cannot publish) and
   **Editor** (all four — publish/unpublish + manage spaces). Publish/unpublish routes gated on
   `notes.publish`, so an Author is 403'd on publish while an Editor/owner/admin succeeds.
   Verified: 154 module tests green (incl. new manifest/authz/plugin role tests), `-r typecheck`
   clean, full suite green except 3 **pre-existing** b2c-router failures (stale tests from the
   b2c-sidebar refactor `b640d9a` — confirmed failing at baseline with these changes stashed).
   `orgTypes` config population stays deferred to Step 5 (once the shell consumes it).
   Reader/Commenter roles land with the shared plane (Steps 3–4).

2b. **Ownership enforcement** ✅ **done (2026-08-02).** Extracted the pure decision
   `ownsOrBypasses(callerId, ownerId, hasBypass)` into `@platform/authz` (now the shared core
   of both the `requireOwnership` preHandler and service-layer checks — so the Gap-1 primitive
   is genuinely exercised). Added a note **edit** route (`PATCH /tasks/:taskId`, notes.write)
   and ownership on **edit + delete**: an Author may modify only notes they authored; an
   Editor/owner/admin (holds `notes.publish`) moderates any. Publish/unpublish need
   `notes.publish` so they're Editor-only by construction. Verified: 216 module+authz tests
   green (service- and HTTP-level ownership: author-edits-own ✓, author-edits-other 403,
   editor-moderates ✓), `-r typecheck` clean.
3. **Shared plane** ✅ **done (2026-08-02).** Added the `published_note` shelf — a
   deliberately non-org-isolated table (no RLS policy; not in `TENANT_TABLES`; explicit
   `app_runtime` grant in the RLS migration under a labelled SHARED PLANE block). A
   `@shared-plane`-marked `shelf-repository.ts` reads/writes it outside `withOrg` (the guard
   now exempts marked files). Publish projects a note onto the shelf, unpublish/delete remove
   it, editing a published note refreshes it. New global cross-org routes `GET /api/library`
   and `GET /api/library/:id` (any authenticated user; not org-scoped). Added the
   **SPEC §9.4** section recording the approved §9.3 exception. Verified: 266 module/tenancy/
   authz tests green (incl. service shelf-sync + HTTP library round-trip: draft never appears,
   publish→visible cross-user, unpublish→gone, 404/401); `-r typecheck` clean; full suite
   932 green (only the 3 pre-existing b2c-router failures remain). **Live-DB proof:** with no
   `app.org_id` set, `app_runtime` sees shelf rows but **zero** private `note` rows —
   isolation holds while the shelf is shared.
4. **Engagement** ✅ **done (2026-08-02).** Shared-plane `note_like` + `note_comment` tables
   (no RLS; FK-cascade from `published_note`; `app_runtime` grants in the SHARED PLANE block;
   `@shared-plane` engagement repo). Permissions `space.likes.write` + `space.comments.write`
   and the **Reader** (read + like) / **Commenter** (+ comment) product roles. Engagement
   routes are org-scoped under the reader's org (`POST/DELETE /api/orgs/:orgId/library/:id/like`,
   `.../comments`) so the membership+role gate enforces Reader-vs-Commenter; the target note is
   cross-org. Library detail now returns `likeCount`+`likedByMe`; `GET /api/library/:id/comments`
   lists them. Likes idempotent (unique per user); comments self-scoped delete. Verified: 286
   module/tenancy/authz tests green (service + HTTP: Reader likes but 403 on comment, Commenter
   comments, self-scoped delete, like a draft → 404); `-r typecheck` clean; full suite 952 green
   (only the 3 pre-existing b2c-router failures). **Live-DB proof:** `app_runtime` in org-B
   liked an org-A note (cross-org engagement) and deleting the note cascaded the like away.
5. **Web** ✅ **mostly done (2026-08-02).** Added the Reader **Library screen** (cross-org feed
   of published notes; each expands to a like toggle + comments), backed by new client methods
   (`listLibrary`/`getLibraryNote`/`listComments`/`likeNote`/`unlikeNote`/`addComment`/
   `deleteComment`). Wired a second web manifest at `/o/:orgSlug/library` (its own "Library" nav)
   registered in `register-web.ts`; added a **body** field to the Writer note composer. Populated
   **`orgTypes`** in `product.config.ts` (writer→Spaces nav + Author/Editor; reader→Library nav +
   Reader/Commenter) — the Step-0 config knob is now exercised. Verified: 196 module tests green
   (incl. new library-screen tests), `-r typecheck` clean, full suite 956 green (only the 3
   pre-existing b2c-router failures). **Deferred (platform-shell follow-up):** gating nav *by org
   type* (hide Spaces for Reader orgs / Library for Writer orgs) — the shell already has `orgType`
   and now the `orgTypes` config, so it's a `moduleNavLinks` filter; today both nav entries show.
   A live SPA render wasn't done (needs a dev-DB reset per the squash caveat); screens are covered
   by unit tests.
6. **Docs** — update `SPEC.md` §19 (reference module) + new §9.x; `features.json`;
   `docs/FORKING.md` note on declaring org types + roles.

---

## Deletability (hard requirement)

The module must still delete via **one directory + one line** (`docs/FORKING.md` step 4).
The shared-plane tables live in the module's own `schema.ts` and register through the existing
seams — removing the module leaves the platform building, migrating, and passing its tests.

---

## Explicitly NOT building (so we don't over-engineer)

- **No subscribe/follow** — public library only (decision #4).
- **No org that is both** Writer and Reader (decision #3).
- **No approval/maker-checker** workflow, **no runtime-editable roles**, **no groups/departments** (deferred tiers).
- **No note versioning, rich-text, or media uploads.**
- **No new infrastructure** — reuse existing entitlements (e.g. a `space.maxNotes` cap),
  audit, the export job, and the email port.
