# Learned Rules
<!-- Monotonic — rules are NEVER deleted. Only add new rules. -->
<!-- Format: Each rule includes Impact, Pattern, Mistake description, Anti-Pattern code, Better Approach code, Rule, and Applied-in fields. See .claude/skills/auto/SKILL.md SECTION 12 for full format. -->

## LR-001 — Pin `fastify-type-provider-zod@4.0.2` while zod is pinned to v3

- **Impact:** High — a wrong pin compiles and imports fine, then throws at request time.
- **Pattern:** dependency compatibility (zod major ↔ fastify-type-provider-zod major).
- **Mistake:** Assuming a peer-range match means runtime compatibility. `fastify-type-provider-zod@7` fails to even import under ESM with `zod@3.25.76` (`SyntaxError: 'zod/v4/core' has no export 'safeEncode'`). Downgrading to `@5.1.0` imports fine and its peer says `zod: >=3.25.67`, but it routes validation through `zod/v4/core/parse.js`, which is incomplete in zod 3.25.x's *transitional* v4-core bundle → `TypeError: Cannot read properties of undefined (reading 'run')` on the first validated request.
- **Anti-Pattern:** `"fastify-type-provider-zod": "^7.0.0"` (or `^5`) alongside `"zod": "^3.25.76"`.
- **Better Approach:** `"fastify-type-provider-zod": "4.0.2"` — the last major built against the classic zod-3 API (peer `zod: ^3.14.2`); `serializerCompiler`/`validatorCompiler`/`jsonSchemaTransform`/`ZodTypeProvider` are all still exported. The v5+ line is for zod v4 proper.
- **Rule:** With zod v3 pinned (SPEC decision), use fastify-type-provider-zod v4.x. Only move to v5+ if/when the whole repo migrates to zod v4. Always prove a validator/serializer change with a runtime request test, not just tsc + import.
- **Applied-in:** E2-S1 (apps/api app.ts/swagger.ts/error-handler.ts), verified by the "validates a Zod request-body schema" test in app.test.ts.

## LR-002: Emailed URLs must be bound to registered SPA routes (server↔client contract)

- **Impact:** High — silently broken onboarding. Both invitation-accept and
  admin-created-member set-password emails shipped links to paths the SPA router
  does not register, so users landed on the client-rendered "Page not found".
- **Pattern:** cross-layer integration gap (API email builder ↔ SPA router).
- **Mistake:** Each side was unit-tested in isolation and both passed — the API
  test asserted the URL string contained "set-password"/used `inviteAcceptUrl`;
  the router test asserted `/accept-invite` and `/reset-password` exist — but
  nothing asserted the emitted URL MATCHES a registered route. Server emitted
  `/orgs/:orgId/invitations/:invitationId/accept` and `/auth/set-password?email=`
  while the SPA registers `/accept-invite?invitationId=` and `/reset-password
  ?token=`. Found only by live browser E2E.
- **Better Approach:** derive emailed links from the SAME route definitions the
  SPA registers (shared route constants/builders), or add a test that walks every
  server-generated onboarding URL and asserts the SPA router resolves it to a
  real screen (not the not-found route). Prefer a single source of truth for the
  path + the query-param names the screen reads.
- **Also:** the set-password flow additionally minted no token, but `/reset-
  password` needs one — an admin-created member has no way to authenticate. The
  identity port currently exposes only `handler`+`getSession`; a proper fix must
  mint a reset token. Tracked as an OPEN defect.
- **Applied-in:** fixed invite-accept URL (deps.ts `inviteAcceptUrl`), commit
  796c106; set-password remains open.
