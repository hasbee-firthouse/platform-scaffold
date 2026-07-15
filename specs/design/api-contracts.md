# API Contracts — platform-scaffold

> Derived faithfully from `SPEC.md` §15 (API conventions), §8 (auth), §9 (orgs/tenancy),
> §10 (authz), §11 (entitlements), §12 (audit), §17 (screens), §18 (reference module).
> This file is the single source that both the UI mockups and `api-contracts.schema.json`
> (OpenAPI) derive from. Field names match `data-models.md` exactly.

## Conventions (SPEC.md §15)

- Base path `/api`. Org-scoped routes: `/api/orgs/:orgId/<module>/...`. User-scoped:
  `/api/me/...`. Public: `/api/auth/*`, `/api/health`, `/api/ready`.
- Every non-public route runs the canonical pipeline: rate-limit → identity → membership →
  authz → handler → `withOrg` → audit (system-design §6).
- **Error envelope** (all non-2xx except raw better-auth internals):
  ```json
  { "error": { "code": "NOT_FOUND", "message": "human readable", "details": { } } }
  ```
  `code ∈ { UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION_FAILED, ENTITLEMENT_REQUIRED,
  CONFLICT, RATE_LIMITED, INTERNAL }`. `details` optional.
- **Cross-tenant probes return `NOT_FOUND` (404), never `FORBIDDEN`** (SPEC.md §15, §9.3).
- **Pagination**: query `limit` (default 25, max 100, min 1) + `offset` (default 0, min 0);
  response `{ "items": [...], "total": <int> }`.
- **Auth requirement legend**: `public` | `requireUser` | `membership` (member of `:orgId`) |
  `requirePermission("x.y.z")` (implies membership). All org-scoped routes imply `membership`.
- All request bodies are Zod-validated; unknown keys stripped (SPEC.md §21.1). Validation
  failures → `422 VALIDATION_FAILED` with per-field `details`.
- Standard error rows omitted per-endpoint where universal: `401 UNAUTHENTICATED` (no session on
  a non-public route), `429 RATE_LIMITED` (rate limit), `500 INTERNAL` (unexpected).

### Endpoint template
```
#### METHOD /path
- Auth: <requirement>
- Path params: ...
- Query params: ...
- Request body: ...
- Success: <status> <schema>
- Errors: <code list>
```

---

## 1. System / Health (SPEC.md §20.3)

#### GET /api/health
- Auth: public
- Path params: none
- Query params: none
- Request body: none
- Success: `200` `{ "status": "ok" }` (liveness — process is up)
- Errors: none (if the process is down it simply does not answer)

#### GET /api/ready
- Auth: public
- Request body: none
- Success: `200` `{ "status": "ready", "db": "up" }` when the DB ping succeeds
- Errors: `503` `{ "status": "unready", "db": "down" }` when the DB ping fails (readiness probe)

---

## 2. Authentication — better-auth mount (`/api/auth/*`, SPEC.md §8)

Mounted **only** by `packages/platform-identity` (F039). Request/response shapes are largely
library-owned by better-auth; documented here for completeness. Session is a cookie
(httpOnly, SameSite=Lax, Secure in prod, 30-day sliding). No JWT to the browser (§8.1).
All are `public` at the routing layer (they establish or clear identity); rate-limited tightly
(§21.4). Failed sign-ins are audited (§12, E4-S3 AC4).

#### POST /api/auth/sign-up/email
- Auth: public
- Request body: `{ "email": string(email), "password": string(min 10), "name": string }`
- Success: `200` `{ "user": UserPublic, "session"?: null }` — verification email enqueued;
  **no session** until email verified (SPEC.md §8.2.2, §21.8).
- Errors: `422 VALIDATION_FAILED` (weak password / bad email), `409 CONFLICT` (email in use).

#### POST /api/auth/sign-in/email
- Auth: public
- Request body: `{ "email": string, "password": string }`
- Success: `200` `{ "user": UserPublic }` + `Set-Cookie` session. Blocked until verified.
- Errors: `401 UNAUTHENTICATED` (bad credentials or unverified), `429 RATE_LIMITED`.
  Failed attempt writes an `auth.sign_in.failure` audit row.

#### POST /api/auth/sign-in/social
- Auth: public
- Request body: `{ "provider": "google", "callbackURL"?: string }`
- Success: `200` `{ "url": string }` (redirect URL to Google OAuth consent).
- Errors: `422 VALIDATION_FAILED`.

#### GET /api/auth/callback/google
- Auth: public
- Query params: `code`, `state` (OAuth callback from Google)
- Success: `302` redirect to `APP_URL` with `Set-Cookie` session. Account linking merges a
  Google sign-in with an existing password account sharing a verified email (§8.2.7, F042).
- Errors: `302` to an error route on failure.

#### POST /api/auth/sign-out
- Auth: requireUser (valid session cookie)
- Request body: none
- Success: `200` `{ "success": true }` + cleared cookie. Writes `auth.sign_out` audit row.
- Errors: `401 UNAUTHENTICATED`.

#### GET /api/auth/get-session
- Auth: public (returns null when unauthenticated)
- Success: `200` `{ "session": Session | null, "user": UserPublic | null }`
- Errors: none.

#### POST /api/auth/list-sessions
- Auth: requireUser
- Success: `200` `{ "sessions": Session[] }` (active sessions for the Security screen)
- Errors: `401 UNAUTHENTICATED`.

#### POST /api/auth/revoke-session
- Auth: requireUser
- Request body: `{ "token": string }` (session token to revoke)
- Success: `200` `{ "success": true }`
- Errors: `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

#### POST /api/auth/revoke-other-sessions
- Auth: requireUser
- Request body: none
- Success: `200` `{ "success": true }` — "sign out other sessions"; other sessions' subsequent
  requests return 401 (E4-S3 AC3, F048).
- Errors: `401 UNAUTHENTICATED`.

#### POST /api/auth/send-verification-email
- Auth: public
- Request body: `{ "email": string }`
- Success: `200` `{ "success": true }` — enqueues `verify-email` template.
- Errors: `422 VALIDATION_FAILED`.

#### GET /api/auth/verify-email
- Auth: public
- Query params: `token` (single-use, expiring, hashed at rest — §21.9)
- Success: `302` redirect with session established.
- Errors: `302` to error route (expired/used token).

#### POST /api/auth/forget-password
- Auth: public
- Request body: `{ "email": string, "redirectTo"?: string }`
- Success: `200` `{ "success": true }` — enqueues `reset-password` email (always 200 to avoid
  account enumeration).
- Errors: `422 VALIDATION_FAILED`.

#### POST /api/auth/reset-password
- Auth: public
- Request body: `{ "token": string, "newPassword": string(min 10) }`
- Success: `200` `{ "success": true }` — old password invalidated (E4-S3 AC2, F047).
- Errors: `422 VALIDATION_FAILED`, `401 UNAUTHENTICATED` (expired/used token).

#### POST /api/auth/change-password
- Auth: requireUser
- Request body: `{ "currentPassword": string, "newPassword": string(min 10),
  "revokeOtherSessions"?: boolean }`
- Success: `200` `{ "success": true }`
- Errors: `401 UNAUTHENTICATED`, `422 VALIDATION_FAILED`.

#### POST /api/auth/update-user
- Auth: requireUser
- Request body: `{ "name"?: string }` (profile fields; avatar-less in v1 — §17)
- Success: `200` `{ "user": UserPublic }`
- Errors: `401 UNAUTHENTICATED`, `422 VALIDATION_FAILED`.

#### POST /api/auth/sign-in/magic-link  *(only when `capabilities.magicLink` — F040)*
- Auth: public
- Request body: `{ "email": string, "callbackURL"?: string }`
- Success: `200` `{ "success": true }` — enqueues `magic-link` email.
- Errors: `404 NOT_FOUND` (route not registered when capability off), `422 VALIDATION_FAILED`.

#### GET /api/auth/magic-link/verify  *(only when `capabilities.magicLink`)*
- Auth: public
- Query params: `token`
- Success: `302` redirect with session established.
- Errors: `302` to error route.

### 2.1 Organization plugin — invitation acceptance routes (better-auth)

These are provided by better-auth's `organization` plugin (§8.1). Admin-side invitation
**management** (create/list/resend/revoke) is exposed as platform routes in §5 below; the
**invitee-facing** acceptance uses the plugin routes here.

#### POST /api/auth/organization/accept-invitation
- Auth: requireUser (invitee must have an account/session; may sign up first)
- Request body: `{ "invitationId": string }`
- Success: `200` `{ "member": Member }` — invitee becomes a member with the assigned role
  (§8.2.5, F057).
- Errors: `401 UNAUTHENTICATED`, `404 NOT_FOUND` (unknown/expired), `409 CONFLICT` (already a
  member).

#### POST /api/auth/organization/get-invitation
- Auth: public (token-scoped preview for the accept-invite screen)
- Request body: `{ "invitationId": string }`
- Success: `200` `{ "invitation": InvitationPublic }` (org name, inviter, role, email)
- Errors: `404 NOT_FOUND`.

#### POST /api/auth/organization/reject-invitation
- Auth: requireUser
- Request body: `{ "invitationId": string }`
- Success: `200` `{ "success": true }`
- Errors: `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

---

## 3. Session Bootstrap — `/api/me` (SPEC.md §10.3, E4-S2)

#### GET /api/me
- Auth: requireUser
- Request body: none
- Success: `200`
  ```json
  {
    "user": { "id": "uuid", "email": "a@b.com", "name": "Ada", "emailVerified": true },
    "orgs": [
      { "id": "uuid", "name": "Acme", "slug": "acme", "type": "team", "role": "owner" }
    ],
    "activeOrg": {
      "id": "uuid", "slug": "acme", "role": "owner",
      "permissions": ["platform.members.manage", "workspace.tasks.write", "..."]
    }
  }
  ```
  `activeOrg` is resolved from the requested org slug (or the sole/personal org). Returns the
  resolved permission set for client-side `<Can>` gating (cosmetic only — §10.3).
- Errors: `401 UNAUTHENTICATED`.

#### PATCH /api/me/profile
- Auth: requireUser
- Request body: `{ "name": string(1..120) }`
- Success: `200` `{ "user": UserPublic }`
- Errors: `401 UNAUTHENTICATED`, `422 VALIDATION_FAILED`.

---

## 4. Organizations — lifecycle (SPEC.md §9.2, E5-S2)

#### GET /api/orgs
- Auth: requireUser
- Query params: pagination (`limit`, `offset`)
- Success: `200` `{ "items": OrgSummary[], "total": int }` — the user's non-deleted orgs.
- Errors: `401 UNAUTHENTICATED`.

#### POST /api/orgs
- Auth: requireUser. **Gated by `capabilities.organizations`** (server-enforced; 403 when the
  profile forbids self-service org creation — §7.1).
- Request body: `{ "name": string(1..120), "slug"?: string(slug), "type"?: "team" }`
  (`type` defaults `team`; personal orgs are auto-created at signup, not here.)
- Success: `201` `{ "org": Organization }` — creator becomes `owner` (F055). Writes
  `org.created` audit row.
- Errors: `403 FORBIDDEN` (capability off), `409 CONFLICT` (slug taken), `422 VALIDATION_FAILED`.

#### PATCH /api/orgs/:orgId
- Auth: requirePermission("platform.org.manage")
- Path params: `orgId` (uuid)
- Request body: `{ "name"?: string, "slug"?: string }`
- Success: `200` `{ "org": Organization }`
- Errors: `404 NOT_FOUND` (non-member/cross-tenant), `403 FORBIDDEN`, `409 CONFLICT` (slug),
  `422 VALIDATION_FAILED`.

#### DELETE /api/orgs/:orgId
- Auth: requirePermission("platform.org.delete") — **owner-only** (admin lacks it — §10.2).
- Path params: `orgId`
- Request body: `{ "confirmationName": string }` (must equal the org name — §9.2)
- Success: `200` `{ "org": Organization }` with `deleted_at` set (soft delete, 30-day
  retention). Writes `org.deleted` audit row.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `422 VALIDATION_FAILED` (name mismatch).

#### POST /api/orgs/:orgId/transfer-ownership
- Auth: requirePermission("platform.org.transfer") — owner-only.
- Path params: `orgId`
- Request body: `{ "toMemberId": string(uuid) }`
- Success: `200` `{ "org": Organization }` — target member becomes `owner`; at-least-one-owner
  invariant preserved (F055). Writes `org.ownership_transferred` audit row.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `409 CONFLICT` (target not a member).

---

## 5. Members (SPEC.md §17, E5-S3)

Member roles: `owner | admin | member` (+ module roles like `Workspace Manager`).
Personal orgs expose **no** members endpoints (404) (§9.1, F054).

#### GET /api/orgs/:orgId/members
- Auth: requirePermission("platform.members.read")
- Path params: `orgId`
- Query params: pagination
- Success: `200` `{ "items": MemberView[], "total": int }` where
  `MemberView = { id, userId, email, name, role, createdAt }`.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### POST /api/orgs/:orgId/members
- Auth: requirePermission("platform.members.manage") — admin-create (§17, F059).
- Path params: `orgId`
- Request body: `{ "email": string, "name": string, "role": "admin"|"member" }`
- Success: `201` `{ "member": MemberView }` — creates the user (if new) and enqueues a
  `account-created` set-password email. Writes `member.added` audit row.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `409 CONFLICT` (already a member),
  `422 VALIDATION_FAILED`.

#### PATCH /api/orgs/:orgId/members/:memberId
- Auth: requirePermission("platform.members.manage")
- Path params: `orgId`, `memberId`
- Request body: `{ "role": "owner"|"admin"|"member" | "<module-role>" }` (exactly one role —
  §10.2)
- Success: `200` `{ "member": MemberView }`. Writes `member.role_changed` audit row.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `409 CONFLICT` (would leave zero owners — F055),
  `422 VALIDATION_FAILED`.

#### DELETE /api/orgs/:orgId/members/:memberId
- Auth: requirePermission("platform.members.manage")
- Path params: `orgId`, `memberId`
- Request body: none
- Success: `200` `{ "success": true }`. Writes `member.removed` audit row. Removing a member
  clears their task assignments per membership rules (F084).
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `409 CONFLICT` (removing the only owner).

---

## 6. Invitations (SPEC.md §9.2, §8.2.5, E5-S2/E5-S3)

Admin-side management. Token is 7-day single-use, hashed at rest (§21.9). Acceptance is via the
better-auth plugin route (§2.1) or the convenience accept route below.

#### GET /api/orgs/:orgId/invitations
- Auth: requirePermission("platform.invitations.manage")
- Path params: `orgId`
- Query params: pagination, `status?` = `pending|accepted|revoked|expired`
- Success: `200` `{ "items": Invitation[], "total": int }`
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### POST /api/orgs/:orgId/invitations
- Auth: requirePermission("platform.invitations.manage")
- Path params: `orgId`
- Request body: `{ "email": string(email), "role": "admin"|"member" }`
- Success: `201` `{ "invitation": Invitation }` — 7-day single-use token issued, `invite`
  email enqueued. Writes `invite.sent` audit row.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `409 CONFLICT` (already invited/member),
  `422 VALIDATION_FAILED`.

#### POST /api/orgs/:orgId/invitations/:invitationId/resend
- Auth: requirePermission("platform.invitations.manage")
- Path params: `orgId`, `invitationId`
- Request body: none
- Success: `200` `{ "invitation": Invitation }` — new token + re-enqueued email.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `409 CONFLICT` (not pending).

#### DELETE /api/orgs/:orgId/invitations/:invitationId
- Auth: requirePermission("platform.invitations.manage") — revoke.
- Path params: `orgId`, `invitationId`
- Success: `200` `{ "invitation": Invitation }` with `status: "revoked"`. Writes
  `invite.revoked` audit row.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### POST /api/orgs/:orgId/invitations/:invitationId/accept
- Auth: requireUser (invitee). Membership NOT pre-required (this is how one joins).
- Path params: `orgId`, `invitationId`
- Request body: none
- Success: `200` `{ "member": MemberView }`. Writes `invite.accepted` audit row.
- Errors: `404 NOT_FOUND` (unknown/expired/used), `401 UNAUTHENTICATED`,
  `409 CONFLICT` (already a member), `422 VALIDATION_FAILED` (email mismatch).

---

## 7. Roles & Permissions matrix (SPEC.md §10, §17, E5-S3)

#### GET /api/orgs/:orgId/roles
- Auth: requirePermission("platform.roles.read")
- Path params: `orgId`
- Success: `200`
  ```json
  {
    "roles": [
      { "id": "owner", "label": "Owner", "permissions": ["*"], "builtin": true },
      { "id": "admin", "label": "Admin", "permissions": ["platform.members.manage", "..."], "builtin": true },
      { "id": "member", "label": "Member", "permissions": ["workspace.tasks.read", "..."], "builtin": true },
      { "id": "workspace-manager", "label": "Workspace Manager", "permissions": ["workspace.workspaces.manage", "workspace.tasks.read", "workspace.tasks.write"], "builtin": false, "module": "reference-workspace" }
    ],
    "permissions": ["platform.members.manage", "workspace.tasks.write", "..."]
  }
  ```
  Read-only matrix of code-defined roles (D12). No write endpoint exists in v1.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

---

## 8. Audit Log (SPEC.md §12, E7-S3)

#### GET /api/orgs/:orgId/audit-logs
- Auth: requirePermission("platform.audit.read") — admin-gated (F077).
- Path params: `orgId`
- Query params: pagination + filters:
  `action?` (string), `actorUserId?` (uuid), `targetType?` (string),
  `from?` (ISO datetime), `to?` (ISO datetime)
- Success: `200` `{ "items": AuditLog[], "total": int }` — org-scoped by RLS; never leaks
  other orgs (F079).
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

---

## 9. Entitlements (SPEC.md §11, E7-S1)

#### GET /api/orgs/:orgId/entitlements
- Auth: requirePermission("platform.entitlements.read")
- Path params: `orgId`
- Success: `200`
  ```json
  { "items": [ { "key": "workspace.maxTasks", "value": 100, "source": "default" },
               { "key": "platform.sso", "value": false, "source": "override" } ],
    "total": 2 }
  ```
  `source ∈ { "default", "override" }`. Values are boolean or number.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### GET /api/orgs/:orgId/entitlements/:key
- Auth: requirePermission("platform.entitlements.read")
- Path params: `orgId`, `key` (e.g. `workspace.maxTasks`)
- Success: `200` `{ "key": string, "value": number|boolean, "source": "default"|"override" }`
- Errors: `404 NOT_FOUND` (unknown key or cross-tenant), `403 FORBIDDEN`.

> Overrides are **written only by the operator CLI** (`pnpm ops entitlement set`, §11, E7-S2),
> not via a web endpoint — the upgrade motion is sales-led (no self-serve plan changes).

---

## 10. Reference module — `reference-workspace` (SPEC.md §18, E8)

Mounted under `/api/orgs/:orgId/workspace/...`. Permissions:
`workspace.workspaces.manage`, `workspace.tasks.read`, `workspace.tasks.write`.
Both `workspace` and `task` are tenant tables (org_id + RLS). Deletable module (A8).

### 10.1 Workspaces

#### GET /api/orgs/:orgId/workspace/workspaces
- Auth: requirePermission("workspace.tasks.read")
- Path params: `orgId`
- Query params: pagination
- Success: `200` `{ "items": Workspace[], "total": int }`
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### POST /api/orgs/:orgId/workspace/workspaces
- Auth: requirePermission("workspace.workspaces.manage")
- Path params: `orgId`
- Request body: `{ "name": string(1..120) }`
- Success: `201` `{ "workspace": Workspace }`. Writes `workspace.created` audit row (F086).
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `422 VALIDATION_FAILED`.

#### PATCH /api/orgs/:orgId/workspace/workspaces/:workspaceId
- Auth: requirePermission("workspace.workspaces.manage") — rename.
- Path params: `orgId`, `workspaceId`
- Request body: `{ "name": string(1..120) }`
- Success: `200` `{ "workspace": Workspace }`
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `422 VALIDATION_FAILED`.

#### DELETE /api/orgs/:orgId/workspace/workspaces/:workspaceId
- Auth: requirePermission("workspace.workspaces.manage")
- Path params: `orgId`, `workspaceId`
- Success: `200` `{ "success": true }` — cascades tasks. Writes `workspace.deleted` audit row.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

### 10.2 Tasks

#### GET /api/orgs/:orgId/workspace/workspaces/:workspaceId/tasks
- Auth: requirePermission("workspace.tasks.read")
- Path params: `orgId`, `workspaceId`
- Query params: pagination + `status?` = `open|done` (open/done filter — F087)
- Success: `200` `{ "items": Task[], "total": int }`
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### POST /api/orgs/:orgId/workspace/workspaces/:workspaceId/tasks
- Auth: requirePermission("workspace.tasks.write")
- Path params: `orgId`, `workspaceId`
- Request body: `{ "title": string(1..500), "assigneeMemberId"?: string(uuid)|null,
  "dueDate"?: string(date)|null }`
- Success: `201` `{ "task": Task }`. **Checks `workspace.maxTasks` entitlement first** (F085).
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`,
  **`403 ENTITLEMENT_REQUIRED`** (beyond `workspace.maxTasks`),
  `422 VALIDATION_FAILED` (e.g. assignee not a current member — F084).

#### POST /api/orgs/:orgId/workspace/tasks/:taskId/complete
- Auth: requirePermission("workspace.tasks.write")
- Path params: `orgId`, `taskId`
- Success: `200` `{ "task": Task }` with `status: "done"`.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### POST /api/orgs/:orgId/workspace/tasks/:taskId/uncomplete
- Auth: requirePermission("workspace.tasks.write")
- Path params: `orgId`, `taskId`
- Success: `200` `{ "task": Task }` with `status: "open"`.
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

#### PATCH /api/orgs/:orgId/workspace/tasks/:taskId/assignee
- Auth: requirePermission("workspace.tasks.write")
- Path params: `orgId`, `taskId`
- Request body: `{ "assigneeMemberId": string(uuid)|null }`
- Success: `200` `{ "task": Task }`. Assignee must be a **current org member** (F084).
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`, `422 VALIDATION_FAILED` (non-member).

#### DELETE /api/orgs/:orgId/workspace/tasks/:taskId
- Auth: requirePermission("workspace.tasks.write")
- Path params: `orgId`, `taskId`
- Success: `200` `{ "success": true }`
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

### 10.3 Export

#### POST /api/orgs/:orgId/workspace/workspaces/:workspaceId/export
- Auth: requirePermission("workspace.tasks.read")
- Path params: `orgId`, `workspaceId`
- Request body: none (recipient defaults to the requesting user's email)
- Success: `202` `{ "jobId": string }` — enqueues the `workspace.export` pg-boss job; the
  handler builds a CSV of the workspace's tasks and emails it via the queue (Mailpit in dev)
  (E8-S4, F090/F091). Payload is Zod-validated and retried on failure (F092).
- Errors: `404 NOT_FOUND`, `403 FORBIDDEN`.

---

## 11. Endpoint Inventory (count)

| Group | Endpoints |
|---|---|
| System/health | 2 |
| Auth (better-auth core + magic-link + org plugin) | 20 |
| Session bootstrap `/api/me` | 2 |
| Organizations lifecycle | 5 |
| Members | 4 |
| Invitations | 5 |
| Roles matrix | 1 |
| Audit log | 1 |
| Entitlements | 2 |
| Reference-workspace module | 11 |
| **Total** | **53** |

(11 workspace = 4 workspaces + 6 tasks + 1 export.)
</content>
