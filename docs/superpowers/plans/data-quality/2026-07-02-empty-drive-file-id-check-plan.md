# Empty/whitespace `drive_file_id` DB CHECK — Implementation Plan

> **For agentic workers:** TDD per task (failing test → minimal impl → passing test → commit). Steps use `- [ ]`.

**Goal:** Make an empty/whitespace `drive_file_id` impossible to persist (DB CHECK on all 14 public `drive_file_id` columns + 5 dev-mirror) and reject the one reachable-empty untrusted-input write path (extract-agenda route → HTTP 400).

**Spec:** `docs/superpowers/specs/data-quality/2026-07-02-empty-drive-file-id-check-design.md` (Codex-APPROVE'd, 2 rounds).

**Architecture:** One new migration adds `<table>_drive_file_id_nonblank` CHECKs (predicate `~ '[^[:space:]]'`, nullable form `is null or …`). A route guard fails fast with 400. Enforcement is verified by: static parse (schema.test.ts, CI/DB-free), behavioral `.db.test` (local Postgres), and a validation-observable Layer-3 CHECK-parity assertion (CI, via `TEST_DATABASE_URL`).

## Global Constraints
- Predicate is single-sourced: SQL `~ '[^[:space:]]'` ≡ JS `/\S/`. Every DDL row + test uses it verbatim.
- Migration `20260702120200_drive_file_id_nonblank.sql` sorts after `20260702120100_ignored_warnings_rls.sql`. Apply-twice idempotent (`DROP CONSTRAINT IF EXISTS` + `ADD`).
- No `supabase/tables/` dir exists — the migration is the only DDL surface.
- Commits: `--no-verify`, conventional-commits, one per task. `feat(db):` / `test(db):` / `fix(admin):` scopes.
- `TEST_DATABASE_URL` for validation apply + Layer-3 lives in MAIN `.env.local`: `export TEST_DATABASE_URL="$(grep '^TEST_DATABASE_URL=' /Users/ericweiss/FX-Webpage-Template/.env.local | cut -d= -f2-)"`.
- Local DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

### Task 1: Migration + static-parse test + behavioral `.db.test`

**Files:**
- Create: `supabase/migrations/20260702120200_drive_file_id_nonblank.sql`
- Modify: `tests/db/schema.test.ts` (new `describe`)
- Create: `tests/db/driveFileIdNonblank.db.test.ts`

**Interfaces produced:** the 14 public constraint names `<table>_drive_file_id_nonblank` (shows, pending_syncs, pending_ingestions, sync_audit, deferred_ingestions, onboarding_scan_manifest, pending_snapshot_uploads, revision_race_cooldowns, shows_pending_changes, show_change_log, sync_holds, agenda_extract_leases, sync_log, app_events) + 5 dev-mirror (dev.shows/pending_syncs/pending_ingestions/sync_audit/sync_log).

- [ ] **Step 1 — static-parse test (RED).** In `tests/db/schema.test.ts`, add `describe("drive_file_id nonblank CHECK migration")` modeled on the transportation-loadout block (`:260-290`): read `20260702120200_drive_file_id_nonblank.sql`, `.replace(/\s+/g," ")`, and for each of the 14 public tables assert the file contains `alter table public.<t> drop constraint if exists <name>` AND `alter table public.<t> add constraint <name> … check ( drive_file_id ~ '[^[:space:]]' )` (whitespace-insensitive regex; nullable tables `sync_log`/`app_events` assert the `is null or` form). Loop `[public, dev]` only for the 5 dev-subset tables — **the dev assertions must REQUIRE the `alter table if exists dev.<t>` form** (mandatory `if exists`, e.g. `alter table if exists dev\.<t>` — NOT optional; a DB-free test that accepted a bare `alter table dev.<t>` would let an implementer ship a dev block that errors on any target lacking the dev clone). Run `pnpm vitest run tests/db/schema.test.ts` → RED (file absent).
- [ ] **Step 2 — behavioral test (RED).** Create `tests/db/driveFileIdNonblank.db.test.ts` (postgres.js against local DB; skip if unreachable, mirror an existing `.db.test`). Assertions: (a) `agenda_extract_leases` insert of `''`, `'   '`, `'\t'` → `check_violation` (23514), valid id → ok; (b) `shows` blank `drive_file_id` → 23514 (reuse the held-show insert shape from `tests/onboarding/finalizeHeldCreation.db.test.ts`), valid → ok; (c) `app_events` NULL → ok, `''` → 23514, valid → ok; (d) introspect `pg_constraint` and assert all 14 public `*_drive_file_id_nonblank` constraints exist. Run → RED (constraints not applied yet).
- [ ] **Step 3 — write migration.** Create the migration with all 14 public + 5 dev constraints per spec §4 (header comment: purpose + idempotency + faithful-`/\S/` rationale). Public: `alter table public.<t> drop constraint if exists <name>; alter table public.<t> add constraint <name> check (<predicate>);`. Dev (5): **`alter table if exists dev.<t> …`** (the `if exists` makes the dev block a no-op on any target lacking the dev clone — e.g. a validation project without it — so the migration shape is fixed and never rewritten per-target).
- [ ] **Step 4 — static parse GREEN.** `pnpm vitest run tests/db/schema.test.ts` → PASS.
- [ ] **Step 5 — pre-apply detector (local).** Run the §6 public detector AND dev detector against local (`psql $LOCAL -f` or `-c`). MUST return 0 rows. If any row → STOP, investigate (do not auto-heal).
- [ ] **Step 6 — apply locally + idempotency.** `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702120200_drive_file_id_nonblank.sql` then `psql … -c "notify pgrst, 'reload schema';"`. Re-run the same `-f` apply a SECOND time → must succeed with no error (proves apply-twice idempotency).
- [ ] **Step 7 — behavioral GREEN.** `pnpm vitest run tests/db/driveFileIdNonblank.db.test.ts` → PASS.
- [ ] **Step 8 — commit.** `git add -A && git commit --no-verify -m "feat(db): reject empty/whitespace drive_file_id via CHECK on all 14 public columns + dev mirror"`

---

### Task 2: Extract-agenda route guard (HTTP 400)

**Files:**
- Modify: `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (after `:212`)
- Modify/Create: the route's test file (locate existing; else create `tests/…/extractAgendaRouteGuard.test.ts`)

- [ ] **Step 1 — guard test (RED).** Assert the route returns **400** for a whitespace-only `driveFileId` (e.g. `" "`), and that `claimExtractLease` is **NOT** called (spy/mock it). Model the invalid-input set on `tests/drive/invalidDriveFileId.test.ts`. Run → RED.
- [ ] **Step 2 — add guard.** Immediately after `const { wizardSessionId, driveFileId } = await context.params;` (`:212`), before `claimExtractLease`: `if (!/\S/.test(driveFileId)) { return NextResponse.json({ error: "invalid driveFileId" }, { status: 400 }); }`. Conform to the exact error-body shape used by sibling early returns in this file.
- [ ] **Step 3 — GREEN.** Run the guard test → PASS.
- [ ] **Step 4 — commit.** `git add -A && git commit --no-verify -m "fix(admin): reject whitespace driveFileId at extract-agenda entry with HTTP 400 before lease insert"`

---

### Task 3: Layer-3 validation-parity CHECK assertion

**Files:**
- Modify: `tests/db/validation-schema-parity.test.ts` (new Layer 3)

- [ ] **Step 1 — write Layer 3.** Add a describe/it that: (a) reads `supabase/migrations/20260702120200_drive_file_id_nonblank.sql`, extracts every `alter table public.<t> add constraint (<name>) … check` → expected public constraint-name set (auto-derived, scoped to `public.` so it does NOT match the `if exists dev.` lines); (b) **non-vacuity guard (Codex plan-R1 HIGH):** `expect(expected.size).toBe(14)` BEFORE any validation query — a drifted/empty parse would otherwise make the superset check trivially pass and silently defeat the guard; the `14` is the spec §10 canonical public count and must move in lockstep with any deliberate count change; (c) when `TEST_DATABASE_URL` is set, runs `psql "$TEST_DATABASE_URL" -qAtc "select conname from pg_constraint where conname like '%\_drive\_file\_id\_nonblank' and connamespace='public'::regnamespace"` and asserts the returned set ⊇ expected set; (d) skips when `TEST_DATABASE_URL` unset (mirror the existing Layer-2 skip at `:166-204`). Reuse the file's existing `execFileSync("psql", …)` helper + connect-guard.
- [ ] **Step 2 — local run (skips).** `pnpm vitest run tests/db/validation-schema-parity.test.ts` with `TEST_DATABASE_URL` UNSET → Layer 3 skips; existing layers unaffected. PASS/skip.
- [ ] **Step 3 — commit.** `git add -A && git commit --no-verify -m "test(db): Layer-3 validation-observable CHECK-constraint parity for drive_file_id nonblank"`

---

### Task 4: Validation-project apply + manifest + Layer-3 GREEN

**Files:** none new (verification + possible manifest regen)

- [ ] **Step 1 — export creds.** `export TEST_DATABASE_URL="$(grep '^TEST_DATABASE_URL=' /Users/ericweiss/FX-Webpage-Template/.env.local | cut -d= -f2-)"`.
- [ ] **Step 2 — Layer-3 RED against validation (pre-apply).** Run `pnpm vitest run tests/db/validation-schema-parity.test.ts` WITH `TEST_DATABASE_URL` → Layer 3 should FAIL (constraints not yet in validation). This confirms the guard actually detects a missing apply. **If it unexpectedly PASSES:** STOP — validation already has these constraints from a prior/manual apply. The RED proof is lost, so verify the guard another way (e.g. drop one constraint on validation, re-run → RED, re-add) and document the pre-existing validation state in the PR body; do not silently continue as if the guard were proven.
- [ ] **Step 3 — pre-apply detector (validation).** Run the §6 public detector against `$TEST_DATABASE_URL` → 0 rows. Then `select to_regclass('dev.shows')`: if non-NULL, also run the dev detector → 0 rows. **The migration shape is NOT touched here** — the dev block already uses `alter table if exists dev.<t>` (Task 1 step 3), so it applies cleanly whether or not validation has the dev clone; no rewrite, no static-parse-test breakage.
- [ ] **Step 4 — apply to validation + idempotency.** `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260702120200_drive_file_id_nonblank.sql`; then `notify pgrst,'reload schema';`. Apply a SECOND time → no error.
- [ ] **Step 5 — manifest.** `pnpm gen:schema-manifest` → expect ZERO diff (CHECK-only). If it produced a diff, investigate + commit it.
- [ ] **Step 6 — Layer-3 GREEN.** Re-run `pnpm vitest run tests/db/validation-schema-parity.test.ts` WITH `TEST_DATABASE_URL` → all layers PASS.
- [ ] **Step 7 — commit (only if files changed).** If the manifest changed (unexpected for a CHECK-only migration), commit: `git add -A && git commit --no-verify -m "chore(db): validation apply parity for drive_file_id nonblank"`. Else no commit (this is a verification-only task — the migration is already committed with the fixed `if exists dev` shape).

---

### Task 5: BACKLOG entries for deferred columns

**Files:** Modify `BACKLOG.md`

- [ ] **Step 1 — add entries.** Add `BL-OPENING-REEL-DRIVE-ID-NONBLANK` (shows.opening_reel_drive_file_id, non-reachable-empty, source returns non-empty-or-null) and `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK` (wizard_finalize_checkpoints.last_processed_drive_file_id, cursor copy of already-CHECK'd id). Reference the spec §9.
- [ ] **Step 2 — commit.** `git add -A && git commit --no-verify -m "docs(plan): backlog the 2 secondary-name Drive-ID columns (out of nonblank scope)"`

---

### Task 6: Whole-diff review + ship

- [ ] **Step 1 — typecheck + full suite.** `pnpm typecheck` (vitest strips types — mandatory) then `pnpm vitest run` (note any pre-existing env-bound `.db.test` failures vs merge-base; the new tests must pass).
- [ ] **Step 2 — whole-diff Codex adversarial-review to APPROVE.** Bounded prompt (inline the diff; ban repo-wide greps). Iterate until `===CDXV=== APPROVE`.
- [ ] **Step 3 — push + PR.** `git push -u origin fix/empty-drive-file-id-db-check`; `gh pr create`.
- [ ] **Step 4 — real CI green.** Monitor PR checks (Monitor tool, count `bucket=="fail"`); confirm `mergeStateStatus==CLEAN`. The `validation-schema-parity` job must be green (Layer 3 now runs there).
- [ ] **Step 5 — merge + ff.** `gh pr merge --merge`; verify server-side merged; ff local `main`; `rev-list --left-right --count main...origin/main` == `0 0`; remove worktree + delete branch.

---

## Self-review checklist
- Spec coverage: §2 scope → Task 1; §5 route guard → Task 2; §6 detector → Task 1 step 5 + Task 4 step 3; §7 validation apply → Task 4; §8.1 static → Task 1; §8.2 behavioral → Task 1; §8.3 route test → Task 2; §8.4 Layer 3 → Task 3+4; §9 BACKLOG → Task 5. ✓
- TDD: every code task has RED before impl. Task 4 step 2 proves the Layer-3 guard goes RED pre-apply. ✓
- Meta-test inventory: EXTENDS schema.test.ts + validation-schema-parity.test.ts (declared). ✓
- Advisory-lock topology: no `pg_advisory*` change (CHECK-only). ✓
