# Handoff — M3: Admin upload-test

**Handed off:** 2026-05-02 by Eric Weiss
**Implementer:** Opus 4.7 / Claude Code (this session, via `superpowers:subagent-driven-development`)
**Adversarial reviewer:** GPT-5.5 / Codex
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/03-04-tiles.md` (Tasks 3.1–3.2 only — lines 7–171; M4 starts at line 175 and is **out of scope** for this milestone)

---

## 1. Spec sections in scope

Plan `03-04-tiles.md` cites: `Spec context: §17.1 milestone 3 + §15 demo wording.`

- §17.1 — Per-milestone acceptance criteria (M3 entry, including the round-46 retirement of "no auth" framing). AC-3.1, AC-3.2, AC-3.3 are defined here at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3360–3362`.
- §15 — Demo wording: "Eric (admin) uploads any fixture in a dev build and sees the parse panel; the same URL on a prod build returns 404." See spec `:3288`.

Adjacent spec sections the implementer will brush against (read but do not implement beyond the M3 surface):

- §5.2 — Phase-1 logic (canonical write-through path for `pending_syncs` / `pending_ingestions`). M3 reuses this contract scoped to `dev.*`.
- §6.8 — Minimum-invariant runner (already shipped in M1 at `lib/invariants/`).
- §6.11 — Diagrams + opening-reel parsing (Phase-0 stubs already shipped in M1 at `lib/parser/diagrams.ts`; sync-side enrichment is M6/M7).
- §6.7 — `ParseResult` vs `ParsedSheet` shape contract — M3 must respect this boundary even though the production sync layer doesn't exist yet (see §11 below).
- §7.3 — `/admin/**` route auth requirement — every `/admin/**` route requires `requireAdmin()`.

## 2. Acceptance criteria

- **AC-3.1** — `/admin/dev` is admin-gated AND only available in builds where the server-only env var `ADMIN_DEV_PANEL_ENABLED=true`. Production builds (`ADMIN_DEV_PANEL_ENABLED` unset/false) return 404 even for admins. The dev panel is a real Phase-1 write-through (writes to `dev.*` schema for isolation) AND has a destructive `TRUNCATE dev.* CASCADE` reset, both requiring admin auth.
- **AC-3.2** — A fixture with synthesized MI-7 (50% hotel drop) lands in `dev.pending_syncs` with the right `triggered_review_items`.
- **AC-3.3** — A fixture with synthesized MI-1 (no version markers) lands in `dev.pending_ingestions` with `last_error_code = "MI-1_VERSION_DETECTION_FAILED"`.

## 3. Spec amendments in scope

- [ ] Amendment 1 — listForRepo recovery contract — **N/A — only M8.**
- [ ] Amendment 2 — created_at horizon + lease-expired reaper predicate — **N/A — only M8.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — only M8.** (M2 already provisioned the columns inline in `reports`; M3 doesn't touch the report pipeline.)
- [x] Amendment 4 — §6.4 drop v3 — **applies indirectly.** Test fixtures for AC-3.3 (MI-1 trigger) must NOT use `v3` markers; the parser will hard-fail any unrecognized version.
- [x] Amendment 5 — §6.4 v4 single-marker simplification — **applies indirectly.** v4 detection uses `row:Contact Office` alone.

## 4. Pre-handoff state

- [x] Previous milestone(s) committed: **M0, M1, M2 closed.** Current head at handoff authoring is `bb84273 docs(handoff): record M2 adversarial review approval`.
- [x] Tests passing: `pnpm test && pnpm lint && pnpm typecheck` exits 0 before M3 work begins. Run this before Step 1 of Task 3.1 — if it fails, STOP and report.
- [x] Specific files present:
  - [x] `lib/parser/index.ts` (M1) — exports `parseSheet(markdown): ParsedSheet`.
  - [x] `lib/parser/types.ts` (M1) — exports `ParsedSheet`, `ParseResult`, `LinkedFolderRef`, `OpeningReelRef`, `RoleFlag`, etc.
  - [x] `lib/parser/diagrams.ts` (M1) — Phase-0 diagram stubs.
  - [x] `lib/invariants/runInvariants.ts` (M1, exact path TBD by implementer — see `lib/parser/index.ts` re-exports) — exports `runInvariants(prior, parseResult)`.
  - [x] `lib/email/canonicalize.ts` (M1) — boundary canonicalization.
  - [x] `fixtures/shows/raw/*.md` — 10 raw fixtures present. Task 3.1 Step 1 references `2026-03-rpas-central-four-seasons.md`, `2026-05-fintech-forum-cto-summit.md`, `2025-03-dci-rpas-central.md` — verify each exists before authoring tests.
  - [x] `supabase/migrations/20260501000000_initial_public_schema.sql` (M2)
  - [x] `supabase/migrations/20260501001000_internal_and_admin.sql` (M2)
  - [x] `supabase/migrations/20260501002000_rls_policies.sql` (M2) — defines `public.is_admin()` zero-arg SECURITY DEFINER helper. Use this from `requireAdmin()`.
  - [x] `supabase/seed.ts` (M2) — 10-fixture corpus loader.
  - [x] `tests/db/*.test.ts` (M2) — 7 schema/RLS test files. M3 must not regress these.
  - [x] `playwright.config.ts` (M0) — base config with `mobile-safari` + `desktop-chromium` projects. M3 will need to **add** `prod-build` + `dev-build` projects per Task 3.1 Step 1.
  - [x] `tests/e2e/sample.spec.ts` (M0) — single home-page smoke; M3 adds `tests/e2e/admin-dev.spec.ts`.
  - [ ] **`lib/sync/enrichWithDrivePins.ts` does NOT exist.** See §11 cross-milestone dependencies.
  - [ ] **`lib/auth/requireAdmin.ts` does NOT exist.** See §11.
  - [ ] **`tests/e2e/helpers/signInAs.ts` and `ADMIN_FIXTURE` / `NON_ADMIN_CREW_FIXTURE` do NOT exist.** See §11.
  - [ ] **`dev` schema and any DDL targeting it does NOT exist.** See §11.
- [x] Specific env vars set in `.env.local`: M3 introduces `ADMIN_DEV_PANEL_ENABLED` (server-only, **must NOT** start with `NEXT_PUBLIC_`). For tests, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or whatever M2's seed/test scaffolding established) must already be set; verify by running `pnpm test tests/db/` cleanly.
- [x] Database migrations applied: all M2 migrations applied to local Supabase (`pnpm dlx supabase db reset` re-applies them and re-runs `pnpm db:seed`). M3 will add at least one new migration for the `dev` schema clone.

If any required pre-flight command fails, do NOT start Task 3.1. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** — applies to both M3 tasks. Failing test → minimal implementation → passing test → commit. Self-review runs after.
- [x] **Per-show advisory lock** — applies. M3's `parseAndStage` server action mutates `dev.shows`, `dev.pending_syncs`, `dev.pending_ingestions` — every write path runs inside `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` (cron-style) or `pg_advisory_xact_lock(...)` (admin/blocking — **this is the M3 path** because the operator clicked a button and expects determinism). Tests must assert the lock is held during the action's transaction. Test command: `pnpm test tests/sync/dev-routing.test.ts` (Task 3.2) and `pnpm test:e2e --project=dev-build` (Task 3.1 Playwright).
- [x] **Email canonicalization at boundary** — applies indirectly. Fixture parsing already canonicalizes through `lib/email/canonicalize.ts` (M1). Any new code in M3 that reads raw email strings (e.g., a future `requireAdmin` allow-list lookup against an admin email) must call `canonicalize` before comparison.
- [x] **No global cursor** — applies. M3's `parseAndStage` MUST NOT introduce any `lastPollAt` field or top-level cursor. Per-show watermark is `dev.shows.last_seen_modified_time`. Verification: `! rg "lastPollAt" lib app supabase tests` must return zero matches at M3 close.
- [x] **No raw error codes in UI** — applies. The `/admin/dev` parse panel is UI. Any error surface (parse warnings, raw_unrecognized chunks, MI codes) routes through `lib/messages/lookup.ts` for user-facing copy — but `lib/messages/lookup.ts` does NOT exist yet (it's an X.* cross-cutting deliverable). For M3, **MI codes themselves are appropriate to display in the dev/admin panel** (they're operator-facing, not user-facing) — the no-raw-codes invariant exists to protect end-user crew pages, which M3 doesn't touch. Document this exemption explicitly in the panel's code (a brief comment or test name like `dev panel intentionally surfaces raw MI codes per §15 demo`).
- [x] **Commit per task** — applies. Per AGENTS.md §1.6: use `feat(admin): ...` for the `/admin/dev` page (Task 3.1) and `test(sync): ...` for the routing tests (Task 3.2). Don't batch tasks. Don't use bare `admin:` or `sync:`.

## 6. Watchpoints from prior adversarial review

M3 has not yet been implemented; no prior convergence log exists. Watchpoints below are derived from the M0/M1/M2 convergence logs and the global CLAUDE.md / AGENTS.md spec-self-review additions, filtered for M3-applicable failure modes.

- **Build-artifact gate vs runtime env-var.** Task 3.1's dual-build test is the spec author's explicit fix for a class of bug where Playwright's `env.set` only mutates runtime process state, not the actual build artifact. The implementer MUST run two **separate** `pnpm build` invocations with different env-var values and assert against both build outputs. A single build with runtime-toggled env defeats the test. (Watch: spec text at lines 13–19 of the plan is unambiguous on this; do NOT compress it.)
- **Server Action invocation model.** Task 3.1 explicitly forbids inventing fictitious `POST /admin/dev/parseAndStage` URLs. The auth-gate negative tests must exercise the **same** Server Action surface production uses — render the page, submit the form. The "defense in depth" tests that import the action directly (lines 101–125) bypass HTTP/Next.js entirely, so they MUST `await import('@/app/admin/dev/actions')` and invoke the function with a simulated non-admin auth context, NOT mock the action.
- **Pipeline parity is non-negotiable.** Earlier draft of Task 3.1 called `parseSheet → invariants → phase1` directly, skipping `enrichWithDrivePins`. The corrected pipeline is `parseSheet → enrichWithDrivePins(parsed, mockDriveClient) → runInvariants(prior, parseResult) → phase1`. **The M3 implementer must NOT collapse this back to the shorter chain** — the dev panel exists to validate the FULL production pipeline against fixtures. (Watch: `enrichWithDrivePins` does not yet exist as code — see §11.)
- **`runInvariants` signature uses `parseResult`, not `parsed`.** The plan text at line 158 is explicit: "this uses `parseResult`, not `parsed`." Don't pass `ParsedSheet` where `ParseResult` is required.
- **Phase-1 strictness.** M3 `parseAndStage` writes ONLY: `dev.pending_syncs` (insert/upsert), `dev.pending_ingestions` (insert/upsert on hard-fail), and **status-only updates on `dev.shows` if a row already exists**. It does NOT INSERT new `dev.shows` rows directly — that's Phase-2/Apply. Earlier draft conflated stage and apply; the plan at line 159 forbids this regression.
- **Schema isolation is real, not nominal.** The Playwright AC-3.1 test at lines 36–53 enumerates a comprehensive public-schema snapshot probe (row counts AND content-hash AND status-field comparison on existing rows). The implementer MUST snapshot every Phase-1 write surface in `public.*` BEFORE the test and re-assert AFTER — not just `public.shows.count`. A status-field mutation on an existing row counts as schema-isolation failure.
- **`dev` schema CHECK/RLS parity.** When cloning M2 DDL into the `dev` schema, every CHECK constraint, FK action, helper function, and (where it makes sense) RLS policy must be replicated. Otherwise dev-schema testing diverges from prod behavior and the panel's purpose is defeated. Document any deliberate omission (e.g., "dev schema does NOT enable RLS because tests run as service role and the panel is admin-only at the app layer").
- **Anti-tautology rule for tests (mandatory per CLAUDE.md / AGENTS.md).** For Task 3.2's MI-7 / MI-1 synthesis tests:
  - Don't assert that `pending_syncs.triggered_review_items` contains `MI-7_SECTION_SHRINKAGE` because the test setup INSERTed that string. Synthesize the input condition (4 hotels prior, 1 hotel next) and let the **runInvariants → phase1 routing** decide what code to emit. Then assert the emitted code matches the expected MI-7 catalog entry.
  - Don't assert against `dev.pending_ingestions.last_error_code === 'MI-1_VERSION_DETECTION_FAILED'` if the test directly INSERTed that row. The fixture must be a real markdown blob with no version markers; the `parseSheet → version detection` path must produce the hard-fail; phase1 must route to `pending_ingestions`.
- **Self-consistency sweep.** Grep the M3 code at handoff close for `'public.'` (must NOT appear in `parseAndStage` writes), `'dev.'` (must appear in every M3 write), `NEXT_PUBLIC_ADMIN_DEV_PANEL_ENABLED` (must NOT appear), `ADMIN_DEV_PANEL_ENABLED` (must appear server-side only).
- **CHECK/enum migration matrix.** The new `dev` schema migration is a fresh DDL fragment. CHECK constraints in `dev.*` must accept every spec value `public.*` accepts. Use the same CHECK definitions verbatim (or factor through a shared SQL function/template).

## 7. Test commands

- Pre-flight and final gate: `pnpm test && pnpm lint && pnpm typecheck`. The M2 baseline must remain green.
- Vitest unit / sync routing tests (Task 3.2): `pnpm test tests/sync/dev-routing.test.ts`.
- Playwright e2e (Task 3.1): `pnpm test:e2e --project=dev-build` and `pnpm test:e2e --project=prod-build`. The implementer **must** add these projects to `playwright.config.ts` (each with a different webServer command embedding the env-var value at build time).
- DB schema introspection regression (M2 baseline): `pnpm test tests/db/`.
- Supabase reset + seed: `pnpm dlx supabase db reset && pnpm db:seed` (re-applies all migrations including the new dev-schema clone).
- No layout-dimensions or transition-audit task applies in M3 (no fixed-dimension UI containers in scope; the parse panel is a vertical-stack diagnostic surface, not a tiled card layout).

## 8. Exit criteria

- [ ] Tasks 3.1 and 3.2 in `03-04-tiles.md` (lines 7–171) all checked off.
- [ ] AC-3.1, AC-3.2, AC-3.3 each have at least one passing assertion (Playwright for AC-3.1, Vitest for AC-3.2/3.3).
- [ ] `app/admin/dev/page.tsx` exists with `requireAdmin()` as the first line of its Server Component.
- [ ] `app/admin/dev/actions.ts` exists exporting `parseAndStage(filename: string)` and `resetDevSchema()`, each with `requireAdmin()` as their first line.
- [ ] At least one new migration creates the `dev` schema and clones M2's DDL into it (file naming: `supabase/migrations/2026050200xxxx_dev_schema_clone.sql` or similar timestamped pattern).
- [ ] `playwright.config.ts` has `prod-build` and `dev-build` projects, each invoking a separate build with the appropriate `ADMIN_DEV_PANEL_ENABLED` value.
- [ ] No file under `app/` outside `app/api/` or `app/admin/` is modified (M4 owns `app/show/[slug]/...`; out of scope here). UI components in `components/` are out of scope; the dev panel is a single-page Server Component without extracted reusable UI.
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0.
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0 (regression — the M0 home-page smoke must still pass).
- [ ] `pnpm test:e2e --project=dev-build` and `pnpm test:e2e --project=prod-build` exit 0.
- [ ] `! rg "lastPollAt" lib app supabase tests` returns zero matches.
- [ ] `! rg "NEXT_PUBLIC_ADMIN_DEV_PANEL" .` returns zero matches.
- [ ] All commits follow `feat(admin): ...` / `test(sync): ...` / `feat(db): ...` / `test(admin): ...` format. Per AGENTS.md §1.6, NOT bare `admin:`.
- [ ] Working tree is clean except for intentionally uncommitted handoff convergence-log updates left for the adversarial reviewer.
- [ ] Adversarial review (per `superpowers:adversarial-review` with GPT-5.5 / Codex per ROUTING.md) ran to convergence — recorded below.

## 9. Sandbox / git protocol

- [x] **Claude Code:** commits run in-session, no sandbox issue. Use `git add <specific files>` (NOT `git add -A`), then `git commit -m "feat(admin): <summary>"` per AGENTS.md §1.6.
- [ ] **Codex CLI default sandbox:** N/A — implementer is Claude Code per ROUTING.md.

## 10. Adversarial review handoff

After Tasks 3.1 and 3.2 are committed:

1. Implementer (this session, via subagent-driven-development) summarizes what was built and confirms each per-task checklist is `- [x]`.
2. The adversarial reviewer (GPT-5.5 / Codex per ROUTING.md) is invoked via `superpowers:adversarial-review`. Inputs: §17.1 + §15 of the spec, the M3 plan section (`03-04-tiles.md` lines 1–171), this handoff, and the diff `git diff <M3-base-SHA>..HEAD -- 'app/admin/**' 'lib/sync/**' 'lib/auth/**' 'tests/e2e/admin-dev.spec.ts' 'tests/sync/**' 'supabase/migrations/2026050200*'`.
3. Reviewer iterates with implementer until convergence (no new issues raised in a round) or until ambiguity requires a human decision. Round cap: 3 (per skill); user-authorized overtime if findings are concrete-fixable rather than substantive disagreements (M0/M1/M2 precedent).
4. Convergence is logged at the bottom of this file.

## 11. Cross-milestone dependencies (CRITICAL — implementer must surface as questions before Step 2 of Task 3.1)

The plan text for Task 3.1 names four functions / fixtures that **do not yet exist in the codebase**. The implementer must surface each as a question to the orchestrator before writing implementation code. The orchestrator's recommended dispositions are listed but the implementer should propose alternatives if they have a better idea after reading the surrounding code.

**(a) `enrichWithDrivePins(parsed, driveClient, ctx) → ParseResult`** — referenced in Task 3.1 Step 1 (pipeline-parity test) and Step 2 (implementation chain). Currently exists ONLY as a comment reference in `lib/parser/types.ts:275, 322` and `lib/parser/diagrams.ts:13`. The function itself is spec'd for M6 Task 7.1 / M7 Tasks 7.1–7.4.

> **Recommended disposition:** Create a minimal `lib/sync/enrichWithDrivePins.ts` in M3 that defines the `DriveClient` interface, accepts a `driveClient` parameter, and produces a `ParseResult` from a `ParsedSheet` by populating the enrichment fields (`linkedFolderItems`, `embeddedImages`, `openingReel.headRevisionId`, `openingReel.modifiedTime`, etc.) using whatever `driveClient.files.get()` / `driveClient.files.list()` return. M3 ships with a single mock implementation (`mockDriveClient` in test/fixture code) returning fixture-resident metadata. M6/M7 layer the real `googleapis` Drive client over the same interface. **This keeps the M3 panel's parity claim honest without pulling all of M6 forward.**

**(b) `requireAdmin()`** — referenced as the mandatory first line of every M3 Server Component, server action, and reset action. Currently does not exist. M5 owns the full auth scaffolding; `is_admin()` Postgres helper exists at `supabase/migrations/20260501002000_rls_policies.sql:23`.

> **Recommended disposition:** Create a minimal `lib/auth/requireAdmin.ts` that:
>
> 1. Reads the current Supabase session via `@supabase/ssr` (already a dependency).
> 2. Calls `supabase.rpc('is_admin')` (or `select public.is_admin()` via a query) to determine admin status.
> 3. Throws / `notFound()` / `forbidden()` accordingly. Use Next.js 16's built-in `notFound()` for the 404-when-flag-disabled case and `forbidden()` (or a manual 403 response) for the auth-fail case.
>    M5's full implementation will replace the implementation body; the **interface** (`requireAdmin()` signature) should remain stable so M5 doesn't break callers.

**(c) `signInAs(page, FIXTURE)` Playwright helper + `ADMIN_FIXTURE` / `NON_ADMIN_CREW_FIXTURE`** — referenced in negative-auth tests. Does not exist. M5 owns full sign-in UI.

> **Recommended disposition:** Create `tests/e2e/helpers/signInAs.ts` with a minimal implementation that authenticates the test browser by setting the cookies/session storage that the M3 `requireAdmin()` recognizes. The simplest path: `signInAs` calls a test-only `/api/test-auth/set-session` endpoint that bypasses real OAuth and stamps a session cookie. Gate this endpoint behind `process.env.NODE_ENV === 'test'` AND `ADMIN_DEV_PANEL_ENABLED === 'true'` so it cannot reach prod. `ADMIN_FIXTURE` and `NON_ADMIN_CREW_FIXTURE` are typed test-fixture constants like `{ email: 'admin@fxav.test', isAdmin: true }`. M5 replaces the implementation; the interface stays.

**(d) Dev-schema scaffolding** — Task 3.1 says "the migrations apply twice — once to `public` for production, once to `dev` for the panel" but M2's three migrations target `public` only. Nothing in `supabase/migrations/` currently creates a `dev` schema.

> **Recommended disposition:** Add a new migration `supabase/migrations/20260502000000_dev_schema_clone.sql` that:
>
> 1. Creates schema `dev` if not exists.
> 2. Clones the M2 DDL into `dev` — every table, CHECK, FK, index, helper function the dev panel exercises. Verbatim copy is acceptable; later milestones can refactor to a shared template if drift becomes painful. **Tier × domain coverage:** `dev.shows`, `dev.crew_members`, `dev.crew_member_auth`, `dev.pending_syncs`, `dev.pending_ingestions`, `dev.sync_log`, `dev.sync_audit`. Do NOT clone `dev.reports`, `dev.report_audit`, `dev.admin_alerts` etc. unless the M3 dev panel writes to them (it doesn't per the plan).
> 3. Does NOT enable RLS on `dev.*` (per the schema-isolation parity decision — document the rationale in a SQL comment at the top of the file).
> 4. Does NOT create `dev.*` versions of the SECURITY DEFINER helpers (`is_admin`, `auth_email_canonical`) — those remain in `public` and are called via `public.is_admin()` from the dev panel's `requireAdmin()`.

**Other cross-milestone references in the plan that are NOT blockers** (M3 doesn't need them):

- `applyStaged` endpoint (M6 Task 6.11) — referenced only as future context for "operator clicks Apply." Not exercised by AC-3.1/3.2/3.3. Defer fully to M6.
- Reel pin / linked-folder / embedded-image enrichment fields — populated by `enrichWithDrivePins` per (a) above. M3's mock implementation can return synthetic but well-typed values; the real Drive API integration is M6/M7's problem.

**Order of operations recommendation for the implementer:**

1. **First**, run pre-flight (`pnpm test && pnpm lint && pnpm typecheck`) and confirm green.
2. **Second**, surface (a)/(b)/(c)/(d) above as questions to the orchestrator. Do NOT skip this — the dispositions above are recommendations, not orders. If the implementer disagrees with any disposition (e.g., would rather defer enrichment-pipeline-test to M6), say so before writing code.
3. **Third**, only after orchestrator confirms dispositions, begin Task 3.1 Step 1 (failing Playwright tests).

---

## Convergence log

### Final-milestone review — Tasks 3.1 + 3.2 (2026-05-02)

Run after M3 implementation closed at SHA `6ab35d8` (later extended through R5–R7 fixes). M3 base `bb84273`; final M3 HEAD at convergence `304683b`. 8 rounds total (matches M1 precedent).

User authorized "continue until convergence" after the round-3 cap; user later restated "ignore cap, continue until convergence" before R6. Each round found progressively narrower defects:

- **Round 1 (3 HIGH):** (1.high) Build-artifact gate was a runtime check, not a true build artifact decision — `process.env.ADMIN_DEV_PANEL_ENABLED` at request time only; if `.next-prod` were started with the flag set, /admin/dev would come alive. (2.high) GET `?fixture=` triggered `parseAndStage` from Server Component render; form used `method="get"`; browser prefetch / reload could mutate `dev.pending_syncs`. (3.high) Test-auth endpoint at `app/api/test-auth/set-session/route.ts` was an arbitrary admin-session minter behind a single env-var (`ENABLE_TEST_AUTH=true`); no host check, no per-run secret, client-controlled `isAdmin`, free user mutation. Fixed in `455cea9` (POST Server Action with redirect + GET-safety regression), `5e969c9` (5-layer test-auth hardening: env + bearer secret + localhost host + email allowlist + create-only), `0fe189d` (true build-artifact gate via `scripts/with-admin-dev-flag.mjs` rename wrapper + new `prod-runtime-flip` Playwright project building flag UNSET / starting flag SET).
- **Round 2 (1 HIGH + 1 MEDIUM):** (1.high) Canonical `pnpm build` bypassed the wrapper — only Playwright webServer commands invoked it; CI/Vercel `pnpm build` still produced an artifact containing `/admin/dev`. (2.medium) Test-auth gate suite missing failure-mode tests for `ENABLE_TEST_AUTH=false` and non-localhost host. Fixed in `dc01fdb` (made `pnpm build` route through wrapper; updated all 3 Playwright projects to use `pnpm build`; added opt-in `tests/admin/build-artifact-gate.test.ts`) and `05cfd63` (split test-auth gate suite into Layer 1 deterministic 13-case + Layer 2 HTTP positive paths).
- **Round 3 (2 HIGH):** (1.high) Create-only gate (Gate 5 of 5) was in the skippable HTTP Layer 2; Round 2's "all 5 gates in Layer 1" claim was wrong. (2.high) Test-auth route did inline `body.email.trim().toLowerCase()` at an auth boundary, violating AGENTS.md §1.3 ("`lib/email/canonicalize.ts` is the only function that touches raw emails"). Fixed in `432c528` (added `vi.mock('@supabase/supabase-js')` with hoisted `createUserMode` state — Layer 1 now covers all 5 gates) and `063cdf2` (route + `signInAs` helper now import `canonicalize`; new boundary tests pin canonical form).
- **Round 4 (1 MEDIUM):** Round 3's boundary tests asserted normalization equivalence (whitespace+case → canonical) but didn't pin the dependency on `canonicalize` — refactor back to inline `trim().toLowerCase()` would still pass because canonicalize implements the same semantics. Fixed in `6ab35d8` (`vi.mock('@/lib/email/canonicalize', { spy: true })` to assert canonicalize is called with raw input; `createUser`/`signInWithPassword` mock arg capture asserts canonical form reaches Supabase; new `tests/admin/no-inline-email-normalization.test.ts` static-analysis guard reads route source as text and asserts no `.toLowerCase()/.trim()` patterns).
- **Round 5 (1 HIGH):** Outcome flips left stale rows — `dev_phase1_stage` upserted into `pending_ingestions` for hard-fail and `pending_syncs` for pass/stage but didn't delete the opposite-table live row; `getStagedResult` checks ingestions first so the panel kept showing stale hard-fail after a successful re-stage. Fixed in `642c297` (RPC now DELETEs from opposite table inside the advisory-locked transaction with `wizard_session_id IS NULL` filter; added 2 negative-controlled flip regression tests using same synthetic drive_file_id across both calls).
- **Round 6 (1 MEDIUM):** Advisory-lock invariant was commented but not asserted — AGENTS.md §1.2 explicitly says "Tests assert the lock is held"; if `pg_advisory_xact_lock` were removed from the RPC, prior tests still passed. Fixed in `a44583f` (option (b) — pg_locks query inside transaction asserts `locktype='advisory'`, `mode='ExclusiveLock'`, `granted=true`, matching `objid`; per-show granularity test asserts distinct keys for distinct drive_file_ids; both negative-controlled with lock removal).
- **Round 7 (1 MEDIUM):** Round 6's pg_locks filter matched only `objid` (low 32 bits of the bigint hashtext key). Postgres represents one-arg `pg_advisory_xact_lock(bigint)` as `(classid=high32, objid=low32, objsubid=1)`; the two-arg variant uses `objsubid=2`. Filter would falsely pass if the RPC switched to a two-arg variant whose low bits happened to match. Fixed in `304683b` (full-tuple filter: `classid` derived from `((kb >> 32) & x'FFFFFFFF'::bigint)::oid`, `objid` from `(kb & x'FFFFFFFF'::bigint)::oid`, `objsubid = 1`; verified via direct Postgres probe; both negative controls pass — lock removed AND lock replaced with two-arg variant).
- **Round 8:** Codex returned `verdict: approve`. **Convergence reached.**

909 vitest tests passing across 35 files (+5 skipped opportunistic-positive HTTP cases) at convergence. Lint 0 errors, typecheck clean. 13 active Playwright passes across `mobile-safari`, `dev-build`, `prod-build`, `prod-runtime-flip` projects. Working tree clean. Codex noted DB-backed runtime verification wasn't re-run from the Codex sandbox due to sandbox-blocked Postgres TCP, but local verification (this orchestrator session) had run all gates green between rounds.

**M3 closed.** Foundation `/admin/dev` panel ready for M4 (crew page tiles) and downstream consumers. Two non-blocking advisory items remain for future milestones:

- `supabase/migrations/20260502000000_dev_schema_clone.sql:415-462` — `dev_phase1_stage` upsert RETURNING fragility: currently correct because RETURNING fires on both INSERT and DO UPDATE branches, but a future M6 migration adding a `WHERE` to `DO UPDATE SET` that evaluates false would silently return null id. M6 should either add `ASSERT v_pending_*_id IS NOT NULL` after each RETURNING or a null-id test in `dev-routing.test.ts`.
- `tests/e2e/helpers/supabaseAdmin.ts:52-55` — `snapshotPublicSchema` selects 4 status fields from `public.shows`; plan §43 lists 5 (missing `last_sync_attempted_at`). M6 should add the missing field to the 6-surface isolation probe before any code path that mutates it lands.
