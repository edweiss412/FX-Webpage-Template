# Role-Vocab Staging Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the role-mapping overlay in the wizard staging pipeline (post-overlay staged parses, reachable `"applied"` save state) and gate every `published=false→true` transition on a consumed-token freshness stamp.

**Architecture:** One overlay+stamp block at the `prepareOnboardingFiles` chokepoint; the stamp rides `parse_result` into `pending_syncs`/shadow payloads and persists on `shows_internal.applied_role_mappings`; one VOLATILE SQL predicate `role_mappings_stamp_satisfied` (FOR SHARE serialization) gates the wizard apply, the final-CAS flip, and the `publish_show` RPC, refusing with the new cataloged code `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`.

**Tech Stack:** Next.js 16 server routes/actions, postgres.js, Supabase (local + validation), vitest.

**Spec (canonical):** `docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md` — adversarially APPROVED (16 rounds). Where this plan and the spec disagree, the spec wins.

## Global Constraints

- TDD per task: failing test → minimal implementation → green → commit (`AGENTS.md` invariant 1). Conventional commits, one task per commit (invariant 6).
- No new advisory-lock holder anywhere (invariant 2): the predicate runs on CALLER transactions; `publish_show` keeps its existing self-lock.
- No raw error codes in UI (invariant 5): the new code renders only via `lib/messages/lookup.ts` consumers.
- Invariant 9 at the gate: DB fault → typed infra throw, NEVER `[]`-degrade, NEVER the business code.
- The staging LOADER stays best-effort (`[]` on fault) — do not conflate with the gate posture (spec §2 vs §3.5).
- Migration checklist (spec §4): local apply + tests → `pnpm gen:schema-manifest` (commit manifest) → surgical validation apply. Validation creds live in the MAIN checkout's `.env.local` (symlinked here).
- Master spec is NEVER prettier-formatted. Run `pnpm format:check` before push (hooks bypassed by `--no-verify`).
- No UI files (`app/` non-api, `components/`, CSS/tokens) may appear in the diff (spec §8). `app/api/**` and server actions are fine.

## Meta-test inventory (declared)

Per spec §7: threading walker unchanged; no observe/infra-contract/lock-topology rows; x1 `catalog-parity`, x2 `internal-code-enums`, help `_families`, and `validation-schema-parity` are all exercised by existing gates; no new meta-test (chokepoint is structural; deferred walker candidate documented in spec).

---

### Task 1: Migration — stamp column, predicate function, publish-core gate

**Files:**
- Create: `supabase/migrations/20260716210000_role_mappings_publish_freshness.sql`
- Test: `tests/db/roleMappingsStampPredicate.db.test.ts`
- Reference (read, copy body): `supabase/migrations/20260601000000_b2_show_lifecycle.sql:115-131` (`_publish_show_core`)

**Interfaces:**
- Produces: `shows_internal.applied_role_mappings jsonb NULL`; `public.role_mappings_stamp_satisfied(stamp jsonb) returns boolean` (VOLATILE, SECURITY DEFINER not required — plain function, EXECUTE granted to `service_role` and `authenticated` so both the routes' service connections and the SECURITY DEFINER RPC can call it); `_publish_show_core` refuses with `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH` before its `published = true` flip.

- [ ] **Step 1: Write the failing DB test** (loopback-guarded like sibling `.db.test.ts` files — copy the guard from `tests/db/roleMappingUndoInterplay.db.test.ts` header). Cases (spec §7 item 10, executed against the applied function): predicate(null)=true; token deleted=false; narrowed=false; equal=true; broadened=true; recognize-only + token deleted=false; malformed shapes (`'"x"'`, `'[1]'`, `'[{"grants":[]}]'`, `'[{"token":1,"grants":[]}]'`, `'[{"token":"X","grants":"A1"}]'`, `'[{"token":"X","grants":[1]}]'`, `'[{"token":"X","grants":["NOT_A_FLAG"]}]'`) all =false. Seed `role_token_mappings` rows via SQL in the test; derive expectations from those fixtures.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/db/roleMappingsStampPredicate.db.test.ts` → FAIL (function does not exist).
- [ ] **Step 3: Write the migration.** Content:

```sql
-- Role-vocab staging overlay (spec 2026-07-16): consumed-token stamp + publish freshness gate.
-- Apply-twice idempotent throughout.
alter table public.shows_internal add column if not exists applied_role_mappings jsonb;

-- VOLATILE is REQUIRED: the body row-locks via FOR SHARE, which PostgreSQL forbids in
-- STABLE/IMMUTABLE functions ("SELECT FOR UPDATE/SHARE is not allowed in non-volatile functions").
create or replace function public.role_mappings_stamp_satisfied(stamp jsonb)
returns boolean language plpgsql volatile set search_path = public, pg_temp as $$
declare entry jsonb; g jsonb; row_grants text[]; entry_grants text[];
begin
  if stamp is null then return true; end if;                       -- legacy / nothing consumed
  if jsonb_typeof(stamp) <> 'array' then return false; end if;     -- corrupt evidence: fail closed
  for entry in select * from jsonb_array_elements(stamp) loop
    if jsonb_typeof(entry) <> 'object'
       or jsonb_typeof(entry->'token') <> 'string'
       or jsonb_typeof(entry->'grants') <> 'array' then return false; end if;
    entry_grants := '{}';
    for g in select * from jsonb_array_elements(entry->'grants') loop
      if jsonb_typeof(g) <> 'string'
         or (g #>> '{}') not in ('A1','V1','L1','FINANCIALS') then return false; end if;
      entry_grants := entry_grants || (g #>> '{}');
    end loop;
    -- FOR SHARE: serializes against lockless settings DELETE/UPDATE for the caller's tx.
    select m.grants into row_grants from public.role_token_mappings m
      where m.token = (entry->>'token') for share;
    if not found then return false; end if;                        -- deleted token
    if not (row_grants @> entry_grants) then return false; end if; -- narrowed grants
  end loop;
  return true;
end $$;
revoke all on function public.role_mappings_stamp_satisfied(jsonb) from public, anon;
grant execute on function public.role_mappings_stamp_satisfied(jsonb) to authenticated, service_role;

-- _publish_show_core: same body as 20260601000000_b2_show_lifecycle.sql:115-131 with ONE added
-- gate immediately before the flip. Copy the CURRENT body verbatim (grep first to confirm no
-- later migration redefined it: `grep -ln "function public._publish_show_core" supabase/migrations`)
-- and insert:
--   if not public.role_mappings_stamp_satisfied(
--        (select applied_role_mappings from public.shows_internal where show_id = p_show_id))
--   then raise exception using errcode='P0001', message='ROLE_MAPPINGS_OUTDATED_AT_PUBLISH'; end if;
-- directly above `update public.shows set published = true where id = p_show_id;`.
```

  (The migration file carries the FULL replaced `_publish_show_core` body, not the comment — the comment above is plan shorthand. Verify `shows_internal`'s PK column name with `grep -n "shows_internal" supabase/migrations/20260501001000_internal_and_admin.sql | head` before writing the subselect; use the actual column.)
- [ ] **Step 4: Apply locally:** `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260716210000_role_mappings_publish_freshness.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "notify pgrst, 'reload schema';"`
- [ ] **Step 5: Run the DB test** → PASS.
- [ ] **Step 6: Add the RPC-gate DB test cases** to the same file: seed a Held show (`published=false`) + `shows_internal.applied_role_mappings` naming a mapping; as an admin-JWT (use the existing b2 lifecycle test helpers `tests/db/_b2Helpers.ts`) call `publish_show` → succeeds when the mapping row matches; delete the mapping row → `publish_show` raises message `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`, `published` still false; re-insert mapping → publish succeeds. Run → PASS.
- [ ] **Step 7: Gate serialization test (spec §7 item 15), same file:** two raw postgres.js connections — A: `begin; select role_mappings_stamp_satisfied('[{"token":"NEWROLE","grants":[]}]'::jsonb);` (holds FOR SHARE); B: `delete from role_token_mappings where token='NEWROLE'` with `statement_timeout=500ms` → B times out while A open; after A commits, B succeeds. Inverse: B commits first → A's predicate returns false. Run → PASS.
- [ ] **Step 8:** `pnpm gen:schema-manifest` and stage the regenerated `supabase/__generated__/schema-manifest.json`.
- [ ] **Step 9: Apply to validation** (creds via linked `.env.local`): `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260716210000_role_mappings_publish_freshness.sql` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. Confirm with `psql "$TEST_DATABASE_URL" -c "\df role_mappings_stamp_satisfied"`.
- [ ] **Step 10: Commit** `feat(db): applied_role_mappings stamp column + role_mappings_stamp_satisfied predicate + publish-core freshness gate`

### Task 2: §12.4 code lockstep — `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table — insert row near `STAGED_PARSE_OUTDATED_AT_PHASE_D`; NEVER prettier this file)
- Modify: `lib/messages/catalog.ts` (new entry, `STAGED_PARSE_OUTDATED_AT_PHASE_D` at `:3040` is the shape template)
- Generated: `lib/messages/__generated__/spec-codes.ts` (`pnpm gen:spec-codes`), internal enums (`pnpm gen:internal-code-enums`)
- Tests: existing gates `tests/messages/codes.test.ts` (x1), help `_families` test in `tests/help/`, vocabulary-ban sweep in `tests/messages/`

**Interfaces:**
- Produces: catalog code `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH` — copy (vocabulary-ban compliant, no "mapping/token/sync" standalone): dougFacing **"The roles you've added changed after setup reviewed this part, so it's on hold instead of going live."**, title **"Roles changed during setup"**, followUp **"Doug → re-scan the sheet in setup (or sync the show), then publish again"**, helpfulContext explaining: you added or changed a role's page settings after this sheet was reviewed; re-scan in setup (or use the show's sync button) to pick up the current choices, then publish. `crewFacing: null`, `resolution: "manual"`, `helpHref: "/help/errors#ROLE_MAPPINGS_OUTDATED_AT_PUBLISH"`, audience matching the `STAGED_PARSE_OUTDATED_AT_PHASE_D` row.

- [ ] **Step 1:** Run `pnpm exec vitest run tests/messages/codes.test.ts` — green baseline.
- [ ] **Step 2:** Add the §12.4 row to the master spec (columns copied from the `STAGED_PARSE_OUTDATED_AT_PHASE_D` row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — locate with grep; keep cell style identical). Run `pnpm gen:spec-codes`.
- [ ] **Step 3:** Run x1 → FAIL (catalog missing the row). Add the `lib/messages/catalog.ts` entry. Run x1 → PASS.
- [ ] **Step 4:** `pnpm gen:internal-code-enums`; run `pnpm exec vitest run tests/messages/ tests/help/` → fix any `_families`/help coverage expectations the new code requires (add the errors-help section entry if the help gate demands one). All green.
- [ ] **Step 5: Commit** `feat(report): catalog ROLE_MAPPINGS_OUTDATED_AT_PUBLISH (§12.4 3-way lockstep + enums + help)`

### Task 3: Overlay + always-written stamp at the staging chokepoint

**Files:**
- Modify: `lib/parser/types.ts` (ParseResult gains `appliedRoleMappings?: Array<{ token: string; grants: string[] }>` — optional, overlay-output only, comment saying the parser never sets it)
- Modify: `lib/sync/runOnboardingScan.ts` (dep `readRoleTokenMappings` at the `RunOnboardingScanDeps` block `:207` area; `defaultReadRoleTokenMappings` beside `defaultReadPullSheetOverride` `:279`; load once in `prepareOnboardingFiles` before `mapWithConcurrency`; overlay+stamp block in `prepareOne` after the discard branch `:1171-1174`, before `attachWarningAnchors` `:1209`)
- Test: `tests/onboarding/prepareRoleMappingOverlay.test.ts` (harness: copy the deps-stub pattern from `tests/onboarding/prepareOnboardingFilesXlsxBytes.test.ts`)

**Interfaces:**
- Consumes: `applyRoleTokenMappings`, `normalizeRoleTokenMappings`, `RoleTokenMapping` from `lib/sync/roleMappingOverlay.ts`.
- Produces: every `PreparedOnboardingFile` sheet's `parseResult.appliedRoleMappings` present (`[]` baseline); dep `readRoleTokenMappings?: () => Promise<RoleTokenMapping[]>`.

- [ ] **Step 1: Failing tests** (spec §7 items 1-5): fixture markdown with a crew row whose role includes `NEWROLE`; stub `readRoleTokenMappings` → `[{ token: "NEWROLE", grants: ["A1"], decidedBy: "a@b.c", decidedAt: "2026-07-16T00:00:00Z" }]`.
  1. warning consumed + `crewMembers[i].role_flags` includes `A1` + stamp `[{ token: "NEWROLE", grants: ["A1"] }]`;
  2. two-sheet listing → loader stub called once;
  3. stub throws → parse identical to no-mapping run, stamp `[]`, no throw;
  4. no-consumption sheet → stamp `[]` (key present);
  5. `attachWarningAnchors` spy receives a warnings array without the consumed warning (inject `listSheetGids`/bytes path or spy via module mock as the sibling test does).
  For the discard-rerun branch (spec item 4): drive the I5b path with the override + changed-tab fixture used by `tests/onboarding/rescanOverrideLockedSnapshot.test.ts` (reuse its stubs) and assert the re-parsed result is also post-overlay + stamped.
- [ ] **Step 2:** Run → FAIL (dep unknown, stamp absent).
- [ ] **Step 3: Implement.** Type first; then in `runOnboardingScan.ts`:

```ts
// deps block
readRoleTokenMappings?: () => Promise<RoleTokenMapping[]>;

// beside defaultReadPullSheetOverride — best-effort: a fault must NEVER wedge the pre-lock
// prepare (degrades to [] = no overlay; the always-written [] stamp keeps the gate silent).
async function defaultReadRoleTokenMappings(): Promise<RoleTokenMapping[]> {
  const sql = postgres(databaseUrl(), { max: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      `select coalesce(jsonb_agg(jsonb_build_object(
          'token', token, 'grants', grants, 'decided_by', decided_by, 'decided_at', decided_at)), '[]'::jsonb) as rows
         from role_token_mappings`,
    )) as Array<{ rows: unknown }>;
    return normalizeRoleTokenMappings(rows[0]?.rows ?? []);
  } catch {
    return [];
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

// in prepareOnboardingFiles, before mapWithConcurrency (ONCE per scan):
const roleTokenMappings = await (deps.readRoleTokenMappings ?? defaultReadRoleTokenMappings)();

// in prepareOne, AFTER the discardAndRerun branch and BEFORE anchor work — overlay and stamp
// are ONE inseparable block (spec §3.2): no path may produce overlay output without the stamp.
const overlaid = applyRoleTokenMappings(parseResult, roleTokenMappings);
parseResult = overlaid.result;
const stampByToken = new Map<string, { token: string; grants: string[] }>();
for (const a of overlaid.applied) stampByToken.set(a.token, { token: a.token, grants: [...a.grants] });
parseResult.appliedRoleMappings = [...stampByToken.values()];
```

- [ ] **Step 4:** Run new tests → PASS. Run `pnpm exec vitest run tests/onboarding tests/sync` → fix any staged-parse assertions the always-present key breaks (spec §7 item 8 sweep; `toEqual` on ParseResult shapes may need the new key — extend fixtures, do not weaken assertions).
- [ ] **Step 5: Commit** `feat(sync): role-mapping overlay + always-written consumed-token stamp at prepareOnboardingFiles`

### Task 4: Staged `"applied"` reachable + rescan-clean + suite sweep

**Files:**
- Test: extend `tests/admin/mapRoleTokenStagedAction.test.ts` (integration-style case) and `tests/onboarding/applyRescanDecisionUnderLock.test.ts` (consumption stays clean)

**Interfaces:** consumes Task 3's overlay behavior only — no production code expected; if a test reveals a wiring gap, fix minimally in the file the test names.

- [ ] **Step 1: Failing/green check — staged applied (spec item 6):** case where the mocked `rescanWizardSheet` resolves `{ status: "updated", ... }` AND the mocked refreshed `pending_syncs.parse_result` carries NO `UNKNOWN_ROLE_TOKEN` for the token (post-overlay shape from Task 3) → action returns `{ ok: true, state: "applied" }`. (The action logic already exists — this pins the now-reachable branch end-to-end at the action layer with the post-overlay staged shape.)
- [ ] **Step 2: Rescan-clean (spec item 7):** in `applyRescanDecisionUnderLock.test.ts`, prior staged parse WITH the warning, refreshed parse post-overlay (warning gone, flags added, stamp present) → outcome is `clean_restamped`/`clean_unchecked` (not `dirty_demoted`).
- [ ] **Step 3:** Run both files + `rg -l "UNKNOWN_ROLE_TOKEN" tests/` sweep for any test asserting staged retention post-mapping; update per spec item 8. Full targeted run green.
- [ ] **Step 4: Commit** `test(onboarding): staged applied-state reachable + overlay consumption keeps rescan clean`

### Task 5: Stamp persistence on every phase2 apply

**Files:**
- Modify: `lib/sync/phase2.ts` (`applyShowSnapshot` args interface `:43` + the call assembling them: add `appliedRoleMappings: <union>`), `lib/sync/runScheduledCronSync.ts:1766` upsert (add `applied_role_mappings` column, `use_raw_decisions` is the pattern), plus any other `applyShowSnapshot` implementer the interface change breaks (tsc will enumerate; expected: `applyStagedCore.ts`, `applyStaged.ts`, test fakes)
- Test: `tests/sync/phase2RoleMappings.test.ts` (extend — it already exercises phase2 overlay)

**Interfaces:**
- Produces: `applyShowSnapshot` args gain REQUIRED `appliedRoleMappings: Array<{ token: string; grants: string[] }> | null` (required-not-optional so every implementer is tsc-forced — the `run_of_show` precedent at `phase2.ts:72`); written to `shows_internal.applied_role_mappings`.
- Union rule (spec §3.5): stamp = dedupe-by-token of (`parseResult.appliedRoleMappings ?? []`) ∪ (phase2's own `roleMappingOutcome.applied` entries as `{token, grants}`); `null` when the union is empty.

- [ ] **Step 1: Failing test:** phase2 apply with (a) staged parse carrying a stamp and no threaded mappings → snapshot receives that stamp; (b) live parse + threaded mappings consuming a token → snapshot receives phase2's consumption; (c) neither → `null`. Assert on the `applyShowSnapshot` fake's received args (the file's existing fake pattern).
- [ ] **Step 2:** Run → FAIL (args field missing).
- [ ] **Step 3:** Implement in `phase2.ts` (compute union after the `:287` overlay call), add the column to the `:1766` upsert (both insert columns and `on conflict ... do update set`), let `pnpm typecheck` enumerate remaining implementers and thread the field through each (tests' fakes included).
- [ ] **Step 4:** Run the test file + `pnpm typecheck` → PASS. Run `pnpm exec vitest run tests/sync` → green (fix fakes flagged by the required field).
- [ ] **Step 5: Commit** `feat(sync): persist consumed-token stamp to shows_internal on every phase2 apply`

### Task 6: Wizard apply gate (both finalize routes)

**Files:**
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts` (gate before the `applyStagedCore` call `:455`, beside the override gate `:441-448`), `app/api/admin/onboarding/finalize/route.ts` (same before `:1236`)
- Create: `lib/onboarding/roleMappingsFreshnessGate.ts` — one tiny shared helper both routes call:

```ts
/** Publish freshness gate (spec 2026-07-16 §3.5). Runs on the CALLER's held-lock tx.
 * Invariant 9: a query fault THROWS (typed) — never [] degrade, never the business code. */
export async function assertRoleMappingsFresh(
  query: (sql: string, params: unknown[]) => Promise<Array<{ ok: boolean }>>,
  stamp: unknown,
): Promise<{ ok: true } | { ok: false; code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH" }> {
  // stamp == null (absent key OR explicit null — legacy rows) MUST become SQL NULL:
  // JSON.stringify(null) would send jsonb 'null', which the predicate fail-closes as
  // corrupt (non-array) and would falsely refuse every legacy row (plan-review R1 F1).
  const rows = await query(`select public.role_mappings_stamp_satisfied($1::jsonb) as ok`, [
    stamp == null ? null : JSON.stringify(stamp),
  ]);
  return rows[0]?.ok === true
    ? { ok: true }
    : { ok: false, code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH" };
}
```

  (Callers pass `parsed.parseResult.appliedRoleMappings ?? null` — UNCONDITIONALLY, spec R13. A thrown query fault propagates to each route's existing boundary. Adapt the `query` signature to each route's row-tx query helper — inspect the tx types at the two call sites and match; if they differ, accept the tx and branch, keeping ONE exported helper.)
- Test: `tests/api/onboarding/finalizeRoleMappingsGate.test.ts` (harness: copy the route-test scaffolding from `tests/api/onboarding/finalize-perrow-telemetry.test.ts`)

**Interfaces:** consumes Task 1's SQL function; produces per-row refusals that flow into the existing `blocked` branch (`finalize-cas/route.ts:864-867`).

- [ ] **Step 1: Failing tests** (spec items 11, 13, 14, 18): (a) stamped row + narrowed mapping → per-row `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`, nothing applied, run returns the blocking 409 `per_row`; (b) legacy row (no key → helper passes SQL NULL — exercise THROUGH `assertRoleMappingsFresh`, not by skipping it) applies normally, and a `[]`-stamp row applies normally; (c) mid-batch: mapping deleted between row 1 and row 2 (fake tx seam) → row 1 applied, row 2 refused; (d) infra fault (query throws / returns error) on row N → NOT the business code, route 500 `ONBOARDING_FINALIZE_INTERNAL_ERROR`, rows 1..N-1 outcome refs intact, row N staged state intact; (e) **apply-gate heal round-trip (spec item 13):** after (a)'s refusal, replace the row's staged parse with a re-staged shape (fresh stamp under the current vocabulary — warning back if deleted / grants re-derived if narrowed) and re-run → the SAME row now applies.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the helper + both route call sites (evaluate the gate INSIDE the row transaction, before `applyStagedCore`; on `{ ok: false }` return the same per-row shape the override gate returns).
- [ ] **Step 4:** Run → PASS. Also add spec item 12's round-trip leg here: a staged `parse_result` with a stamp → through `parseShadowPayloadForApply` → assert the exact `parsed.parseResult.appliedRoleMappings` object the gate receives equals the staged stamp (pins `asParseResult` pass-through).
- [ ] **Step 5: Commit** `feat(onboarding): consumed-token freshness gate on both wizard apply call sites`

### Task 7: Flip gate + completion blocking

**Files:**
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts` — `publishAppliedWizardShows` (`:538`) and its caller (`:873`)
- Test: extend `tests/api/onboarding/finalizeRoleMappingsGate.test.ts`

**Interfaces:**
- Produces: `publishAppliedWizardShows` returns `{ published: string[]; refused: Array<{ drive_file_id: string }> }`. Caller: any refusals → `errorResponse(409, "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH", { per_row })` (mirror the blocked-shadow branch at `:864-867`) BEFORE `deleteWizardDeferrals`/`promoteSettings`/`markFinalCasDone`.

- [ ] **Step 1: Failing test** (spec item 16): checked first-seen row applied Held; delete its consumed mapping; run final CAS → 409 with the code in `per_row`; assert `published=false`, `publish_intent=true` preserved, deferrals not deleted, settings not promoted, checkpoint not `final_cas_done`. Then heal: restore staging state via the row's rescan path (test seam: restage + refreshed stamp on `shows_internal`), re-run → completes, flips.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: candidate SELECT gains a join to `shows_internal` evaluating `role_mappings_stamp_satisfied(si.applied_role_mappings) as fresh` per candidate (single statement, on the outer tx, after the per-show locks are taken — keep the existing lock loop); flip UPDATE keeps `and role_mappings_stamp_satisfied(...)`; refused = candidates where `fresh=false`.
- [ ] **Step 4:** Run → PASS; re-run the whole `tests/api/onboarding/` dir → green.
- [ ] **Step 5: Commit** `feat(onboarding): freshness-gated Held-to-Live flip blocks final-CAS completion on refusal`

### Task 8: `setPublished` mapping + action-level publish gate

**Files:**
- Modify: `lib/showLifecycle/_shared.ts:13-18` (`KNOWN` gains `"ROLE_MAPPINGS_OUTDATED_AT_PUBLISH"`), plus the `LifecycleResult` code union if it enumerates codes (follow tsc)
- Test: extend the existing `_shared`/`setPublished` unit tests (locate: `rg -ln "mapRpcResult" tests/`)

- [ ] **Step 1: Failing test:** `mapRpcResult({ message: 'ROLE_MAPPINGS_OUTDATED_AT_PUBLISH' })` → `{ ok: false, code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH" }`, never `infra_error` (spec R15 F1).
- [ ] **Step 2:** Run → FAIL. **Step 3:** add the KNOWN row (+ type unions). **Step 4:** run file + `pnpm typecheck` → PASS.
- [ ] **Step 5:** Confirm `severityForFinalizeRowCode` (`lib/onboarding/finalizeRowSeverity.ts:8`) — new code is recoverable staleness → default `warn` branch, correct as-is; add one assertion pinning it.
- [ ] **Step 6: Commit** `feat(admin): map ROLE_MAPPINGS_OUTDATED_AT_PUBLISH through the lifecycle KNOWN refusal list`

### Task 9: Convergence-window pin

**Files:**
- Test: `tests/sync/perFileProcessorRoleVocabWindow.test.ts` (unit — `perFileProcessor` with mocked supabase gate rows)

- [ ] **Step 1:** (spec item 9) with `fileMeta.modifiedTime` ≤ watermark: cron/push mode → `{ outcome: "skip", reason: "watermark" }`; manual mode → `{ outcome: "proceed" }` (the `:170-172` bypass). Pure pinning test — write, run (should PASS immediately against existing code; if it fails, the claim in the spec is wrong — stop and re-verify).
- [ ] **Step 2: Commit** `test(sync): pin watermark-skip vs manual-bypass convergence window for role-vocab drift`

### Task 10: Doc closures

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md` (§8.3 `:209` amendment superseded per spec §5; §10 point 5 gains the wizard-staging exemption line per spec §6)
- Modify: `DEFERRED.md` (ROLE-VOCAB-2 resolution line), `BACKLOG.md` (BL-ROLE-VOCAB-STAGING-OVERLAY ✅ SHIPPED status; NEW `BL-ROLE-VOCAB-MAPPING-CONVERGENCE` entry with the watermark-blindness description from spec §5)
- Modify: `docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md:179` ("the new manifest column" → "the new `shows_internal` column")

- [ ] **Step 1:** Make all edits. **Step 2:** `pnpm format:check` on touched md (master spec NOT touched by this task; the 2026-07-15 spec is prettier-safe — verify `git diff` shows only intended hunks). **Step 3: Commit** `docs(plan): close ROLE-VOCAB-2 — parent amendments, backlog closures, BL-ROLE-VOCAB-MAPPING-CONVERGENCE filed`

### Task 11: Full verification gate (pre-push)

- [ ] `pnpm test` (FULL suite — scoped gates miss cross-surface regressions)
- [ ] `pnpm typecheck` && `pnpm exec eslint .` (canonical-Tailwind rule is CI-blocking) && `pnpm format:check`
- [ ] `pnpm build` (RSC/server-action boundary + client-import classes only `next build` catches)
- [ ] Re-run the two admin structural meta-tests + `tests/messages/` + `tests/auth/advisoryLockRpcDeadlock.test.ts` explicitly.
- [ ] `git diff --name-only origin/main..HEAD | grep -E "^(app/(?!api)|components/)"` → must be EMPTY (no-UI check; use `grep -v "^app/api"` if PCRE unavailable).
- [ ] Fix anything red; commit fixes with their own scoped messages.

## Self-review notes (run after drafting — completed)

- Spec coverage: §3.1-3.2→Task 3; §3.5 predicate/RPC→Task 1; apply gate→Task 6; flip→Task 7; setPublished→Task 8; stamp persistence→Task 5; §5 lockstep→Task 2; docs→Task 10; §7 items 1-18 mapped: 1-5→T3, 6-8→T4, 9→T9, 10/15/17b(RPC)→T1, 11/12/13/14/18→T6 (13 = apply-gate heal leg; the flip-side heal is inside 16), 16→T7, 17→T5, 17b(action)→T8.
- Type consistency: stamp entry `{ token: string; grants: string[] }` used identically in Tasks 3/5/6; `assertRoleMappingsFresh` return code matches Task 2's catalog code.
- Advisory-lock topology: no `pg_advisory*` additions anywhere; the predicate is lock-holder-free (FOR SHARE row locks only).
