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
