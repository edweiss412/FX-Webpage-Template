# Phase 0.B follow-up — postgrest-dml-lockdown Layers 2+3 close-out (2026-05-27)

**Status:** DONE. Code + CI wiring landed; real-CI verification PASSED at run `26540100553`.

**Executor:** Opus 4.7 / Claude Code (same session as Phase 0.B).

**Dispatch context:** Orchestrator follow-up to the Phase 0.B close-out escalation §1 (JWT-bearing PostgREST surface probes for the postgrest-dml-lockdown structural meta-test). Scope contract: validation_state only; class-wide extension to crew_members deferred to a later follow-up.

## Commit chain

| SHA | Type | Summary |
|---|---|---|
| `819eca7` | feat(test) | Layers 2+3 JWT-bearing 403 probes (initial) + .env.local.example doc + x-audits.yml `postgrest-dml-lockdown` job |
| `3fb1e66` | fix(test) | Real-CI repair — use publishable key as `apikey` (the validation project's API gateway rejected the self-signed JWT); add `SUPABASE_TEST_PUBLISHABLE_KEY` env var; explicit empty-string detection on `TEST_DATABASE_URL` (the prior `gh secret set` had persisted empty, falling psql back to local socket) |

(Layer 1 from `81d6c0c` and Phase 0.B remain in place; Layers 2+3 extend the existing file, not replace it.)

## Verification snapshot — local

- Full test file: **8/8 passed** (2 Layer 1 + 3 Layer 2 + 3 Layer 3) against the live validation_state migration applied to local Supabase
- TDD-red→GREEN cycle confirmed (initial run before the REVOKE block was authored failed; post-REVOKE run passed)
- **Negative-regression confirmed:** temporarily ran `GRANT INSERT, UPDATE, DELETE ON public.validation_state TO authenticated, anon;` → reran test → **7/8 FAILED** (Layer 1 INSERT/UPDATE/DELETE flipped true; Layer 2 surfaced 201 Created; Layer 3 surfaced 204 No Content). Restored REVOKE → **8/8 PASSED** again. This proves all three layers catch the regression class.

## Live execution finding worth surfacing — PostgREST HTTP code by role

The M12 plan §0.B.2 Step 8 R61 F51 amendment prescribed **403 Forbidden** for both anon and authenticated roles on POST/PATCH/DELETE under the REVOKE'd table. At execution time the live PostgREST behavior diverges:

| Role | HTTP status | PG SQLSTATE | Body message |
|---|---|---|---|
| `authenticated` | **403** | 42501 | "permission denied for table validation_state" |
| `anon` | **401** | 42501 | "permission denied for table validation_state" |

Both responses carry the same underlying PostgreSQL `permission_denied` SQLSTATE (`42501`); PostgREST maps the same DB-layer denial to different HTTP codes based on JWT role. Source: directly observed against local Supabase v2-line PostgREST.

**Mitigation in the test:** the assertion shape is now:
1. HTTP code matches `HTTP_STATUS_BY_ROLE = {authenticated: 403, anon: 401}` (role-specific)
2. Body parses as JSON with `code === "42501"` (the load-bearing structural signal — proves the lockdown actually fired at the DB layer)
3. Body `message` contains the literal `"permission denied for table <name>"` substring (distinguishes table-grant denial from RLS-policy denial)

This is stronger than the original bare-403 assertion. A future regression that ships a 403 from an unrelated middleware (without ever reaching the table-grant layer) would falsely pass the original; the SQLSTATE+message assertion catches that class.

## Scope refinements vs original dispatch brief

1. **`jose` was already a production dependency at `^6.2.3`** (`app/api/realtime/subscriber-token/route.ts:33`). The dispatch brief's "Add `jose` (preferred over `jsonwebtoken`)" instruction to `pnpm add -D jose@^5` would have silently DOWNGRADED the production dep from `^6` to `^5` and moved it to devDependencies. I caught this on the first `pnpm add -D` (which removed `jose ^6.2.3` from dependencies and added `^5.10.0` to devDependencies), reverted via `pnpm remove jose && pnpm add jose@^6`, and used the existing `^6.2.3` dep. No net `package.json` / `pnpm-lock.yaml` change. The test imports `SignJWT` from `jose` directly.

2. **3rd CI secret added beyond the brief's 2.** The dispatch brief named `SUPABASE_TEST_JWT_SECRET` (secret) + `SUPABASE_TEST_REST_URL` (variable). Layer 1's `has_table_privilege` probe requires a Postgres connection via `TEST_DATABASE_URL` — local default `127.0.0.1` won't resolve in CI. To satisfy the brief's "all 3 layers green in real CI" verification gate, I added a 3rd CI secret `SUPABASE_TEST_DATABASE_URL` that the workflow maps to `TEST_DATABASE_URL` in the test step's env block. The brief's "If you get stuck → surface" path applies: surfaced here for orchestrator awareness.

3. **HTTP 401 for anon vs the brief's prescribed 403.** Documented above; assertion shape updated to match observed PostgREST behavior with the SQLSTATE assertion as the load-bearing structural signal.

4. **Supabase API gateway rejects self-signed JWTs as apikey (real-CI finding).** Plan-time the brief positioned `apikey` and `Authorization` as interchangeable from a self-signed JWT. Local Supabase's gateway is lenient and accepted any HS256-signed JWT with the local secret. The validation project's gateway is stricter — `apikey` MUST be a Supabase-issued publishable or legacy anon key. Mid-execution the user surfaced a dashboard message: "Legacy JWT secret has been migrated to new JWT Signing Keys… It is used to only verify JSON Web Tokens by Supabase products." That confirmed the PostgREST-side JWT verification (Authorization Bearer) still uses the legacy secret — so our self-signed JWT works there — but the gateway-side apikey validation is independent of that and rejects self-signed keys regardless. Fix landed in `3fb1e66`: separate `SUPABASE_TEST_PUBLISHABLE_KEY` env var for the apikey; the Authorization Bearer keeps using our self-signed JWT. This is the cleaner long-term shape anyway — it doesn't depend on the legacy JWT secret remaining the apikey verification path.

5. **`gh secret set` interactive paste landed empty.** First real-CI run (`26539451690`) surfaced psql falling back to local socket. Root cause: the operator's prior `gh secret set SUPABASE_TEST_DATABASE_URL` had persisted an empty value (likely a wrong-window paste). The test code's `process.env.X ?? default` passed the empty string through to psql, which treats empty conninfo as a local-default DB name. Fix in `3fb1e66` introduces an explicit `resolveDatabaseUrl()` that distinguishes "unset" (use local default) from "set but empty" (fail loud with diagnostic). Operator re-ran `gh secret set` between runs; second real-CI run `26540100553` passed.

## CI wiring (DONE)

Four items now live in the repo (`edweiss412/FX-Webpage-Template`):

| Item | Type | Value |
|---|---|---|
| `SUPABASE_TEST_JWT_SECRET` | secret | Legacy JWT Secret from `supabase.com/dashboard/project/vzakgrxqwcalbmagufjh/settings/jwt` |
| `SUPABASE_TEST_DATABASE_URL` | secret | Session-pooler URL `postgresql://postgres.vzakgrxqwcalbmagufjh:<PWD>@aws-1-us-east-2.pooler.supabase.com:5432/postgres` |
| `SUPABASE_TEST_REST_URL` | variable | `https://vzakgrxqwcalbmagufjh.supabase.co/rest/v1` |
| `SUPABASE_TEST_PUBLISHABLE_KEY` | variable | Project publishable key (added after the `3fb1e66` repair) |

## Real-CI verification (DONE)

| Run | Outcome | Notes |
|---|---|---|
| `26539451690` | FAIL | Surfaced two repair-needs: psql empty-socket fall-through + apikey gateway rejection. Both addressed in `3fb1e66`. |
| `26539645719` | FAIL (expected) | Push auto-triggered the workflow before `SUPABASE_TEST_PUBLISHABLE_KEY` was wired; fail-loud guard fired exactly as designed. |
| `26540100553` | **PASS — all 8 jobs green including `postgrest-dml-lockdown`** | https://github.com/edweiss412/FX-Webpage-Template/actions/runs/26540100553 |

## Posture at handback

- HEAD: `3fb1e66` on main, origin synced, working tree clean
- Local 8/8 verified + negative-regression confirmed across all 3 layers
- Real-CI 8/8 verified at run `26540100553`
- Class-wide extension to crew_members (other RPC-gated tables) explicitly out of scope; future follow-up

## Watchpoints for the next dispatch

- **`crew_members` Layer 2+3 extension** is the natural follow-up. The test file's `LOCKED_TABLES` registry already includes `crew_members` (Layer 1 covers it). Extending the Layer 2+3 `describe.each` from `[validation_state]` to `[validation_state, crew_members]` is mostly mechanical, BUT each table needs:
  - A valid POST body (the test currently hardcodes a `validation_state` body shape)
  - Knowledge of its `?<col>=eq.<sentinel>` row filter for PATCH/DELETE
  - Confirmation that the table has the same REVOKE posture (which `crew_members` does per `supabase/migrations/20260521000000_signed_link_admin_table_grants.sql:80`)
- **`afterAll` cleanup** in the test file currently DELETEs by `seeded_by = 'postgrest-dml-lockdown-test'`. Best-effort wrapping (try/catch) so the cleanup doesn't fail in CI environments that don't have a `tests/db/validation-state.test.ts`-aware schema. If the class-wide extension lands, add per-table cleanup queries.
- **HTTP 401 vs 403 documentation in AGENTS.md.** The dispatch brief specified 403 for both roles. The live execution-time finding (anon = 401) should be reflected in AGENTS.md's "PostgREST DML lockdown for RPC-gated tables" cross-cutting section so future readers don't repeat the assumption. Worth a small doc PR.
- **Supabase JWT signing keys migration.** The Supabase docs reference a new asymmetric signing-keys system that supersedes the legacy HS256 JWT secret. If the validation project migrates away from the symmetric secret, the `SignJWT(...).sign(secretBytes)` flow breaks. Worth monitoring; pin to the legacy secret as long as it exists.
