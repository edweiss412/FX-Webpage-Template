# Viewer-Independent Financials Projection Alerting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (single Opus implementer pane per spec R5 routing) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the crew-page `TILE_PROJECTION_FETCH_FAILED` alert observe the financials fetch on every cache fill, for every viewer, while the returned financials value stays entitlement-gated.

**Architecture:** One mechanism change in `lib/data/getShowForViewer.ts`: the `readFinancials` query becomes unconditional in the `Promise.all` wave, and the entitlement gate moves to the return boundary inside the function. `_CrewShell` raise/resolve, the dedup RPC, and the `unstable_cache` wrapper are all untouched; both alert defects close at the documented SWR staleness contract (spec §2.3).

**Tech Stack:** Next 16 RSC data layer, Supabase service-role client, vitest.

**Spec:** `docs/superpowers/specs/2026-08-07-projection-financials-viewer-independent-design.md` (the R3 revision; read §2 and §3 before starting). Closes `BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE`.

## Global Constraints

- AGENTS.md invariants bind: TDD per task (1), conventional commits (6), Supabase call-boundary discipline (9), worktree-only work (11), ledger marker lifecycle (12). No advisory-lock surface, no mutation surface, no UI surface is touched.
- `impeccable-gate: N/A — no UI surface`
- Pre-push gates every push: full `pnpm test`, `pnpm typecheck` (vitest AND playwright configs), `pnpm lint`, `pnpm format:check`.
- Worktree: `../FX-worktrees/projection-financials-viewer-independent` (installed, env-linked, preflighted; ledger claim pushed on branch `feat/projection-financials-viewer-independent`).
- Codex review dispatches go through `codex-guard`; a `no_verdict` is an infrastructure fault, handled by the AGENTS.md skip/self-review ladder (the Codex account's usage limit resets 2026-08-11; spec R3 already took the ladder; see the spec's R3 review record).

## Meta-test inventory (declared)

None created or extended: `tests/auth/_metaInfraContract.test.ts` does not walk `lib/data/` (`tests/auth/_metaInfraContract.test.ts:258-259`; same posture as the `run_of_show` not-subject note at `lib/data/getShowForViewer.ts:681-683`); no new alert code (`tests/messages/_metaAdminAlertCatalog.test.ts` unaffected); no new mutation surface; no advisory-lock surface.

## Sweep

Spec §3 IS the census (grep-driven, per-hit dispositions, completed across review rounds R1-R3). Task 1 executes its test rows, Task 2 its doc rows, Task 3 its BACKLOG row. NO-EDIT rows are verified untouched at close (`git diff --name-only origin/main` must not include them).

<!-- tasks: depth=3 -->

### Task 1: Un-gate the fetch, gate the return (AC-1..AC-7)

<!-- task: red=`pnpm vitest run tests/data/financialsEntitlement.test.ts tests/data/getShowForViewer.parallel.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7 -->

**Files:**
- Modify: `lib/data/getShowForViewer.ts` (wave slot near `lib/data/getShowForViewer.ts:762`; `readFinancials` at `lib/data/getShowForViewer.ts:712-748`; the five comment blocks listed in Step 7c. Line numbers are drafting-time locators; anchor by quoted phrases)
- Test: `tests/data/financialsEntitlement.test.ts`, `tests/data/getShowForViewer.parallel.test.ts`

**Interfaces:**
- Consumes: `makeFinancialsClient(viewerFlags)` (module-local, `tests/data/financialsEntitlement.test.ts:95-137`), `makeDeferredClient({deferredTables, deferredRpcs, seed})` plus `harness.started` and `harness.releaseAll()` (module-local, `tests/data/getShowForViewer.parallel.test.ts`), `financialsEntitled` closure const (`lib/data/getShowForViewer.ts:380`).
- Produces: no exported-surface change. `getShowForViewer`'s signature and return type are untouched; behavior contract per spec §2.1.

- [ ] **Step 1: Extend `makeFinancialsClient` with a financials-result override (RED prep)**

In `tests/data/financialsEntitlement.test.ts`, change the factory signature (keep every existing call site working by defaulting):

```ts
function makeFinancialsClient(
  viewerFlags: string[],
  financialsResult: QueryResult = { data: { financials: FINANCIALS_ROW }, error: null },
) {
  // ... inside the shows_internal branch, replace the hardcoded financials return:
  t.select = (col: string) => {
    internalSelects.push(col);
    if (col === "financials") return thenable(financialsResult);
    return thenable({ data: { run_of_show: null }, error: null });
  };
```

- [ ] **Step 2: Rewrite the neither-entitlement test to pin the NEW contract (AC-1 issuance, AC-3 data-gate)**

Replace the body of `"viewer with NEITHER entitlement: ZERO financials reads issue, no financials on result"` (`tests/data/financialsEntitlement.test.ts:158-169`) with:

```ts
test("viewer with NEITHER entitlement: financials read ISSUES, result still carries NO financials (return-boundary gate)", async () => {
  const { client, internalSelects } = makeFinancialsClient([]);
  supabaseState.client = client;

  const viewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };
  const result = await getShowForViewer(SHOW_ID, viewer);

  // Control: the unconditional run_of_show read still fired.
  expect(internalSelects).toContain("run_of_show");
  // NEW contract (spec 2.1): the financials read issues for EVERY viewer,
  expect(internalSelects).toContain("financials");
  // but the VALUE is discarded at the return boundary. The mock seeded a real
  // FINANCIALS_ROW, so this can only pass via the gate, never vacuously.
  expect(result.financials).toBeUndefined();
});
```

Failure mode caught: the gate moving anywhere fetched data leaks into a non-entitled projection.

- [ ] **Step 3: Add the non-entitled error-path test (AC-2)**

```ts
test("viewer with NEITHER entitlement: financials query error sets tileErrors.financials (viewer-independent observability)", async () => {
  const { client, internalSelects } = makeFinancialsClient([], {
    data: null,
    error: { message: "financials boom" },
  });
  supabaseState.client = client;

  const viewer: Viewer = { kind: "crew", crewMemberId: CREW_ID };
  const result = await getShowForViewer(SHOW_ID, viewer);

  expect(internalSelects).toContain("financials");
  expect(result.tileErrors.financials).toBe("financials boom");
  expect(result.financials).toBeUndefined();
});
```

Failure mode caught: the probe silently swallowing failures (alert never fires from non-entitled traffic).

- [ ] **Step 4: Pin the entitled error path if absent (AC-5)**

Run `grep -n "tileErrors" tests/data/financialsEntitlement.test.ts`; if no LEAD-viewer error test exists, add:

```ts
test("LEAD viewer: financials query error sets tileErrors.financials (unchanged pre-existing behavior)", async () => {
  const { client } = makeFinancialsClient(["LEAD"], {
    data: null,
    error: { message: "financials boom" },
  });
  supabaseState.client = client;
  const result = await getShowForViewer(SHOW_ID, { kind: "crew", crewMemberId: CREW_ID });
  expect(result.tileErrors.financials).toBe("financials boom");
  expect(result.financials).toBeUndefined();
});
```

- [ ] **Step 5: Rewrite the parallel-file zero-read test and add the wave-membership twin (AC-1)**

In `tests/data/getShowForViewer.parallel.test.ts`:

(a) Update the header contract comment at `tests/data/getShowForViewer.parallel.test.ts:19`: "a non-LEAD viewer issues ZERO financials (shows_internal financials) reads" becomes "the financials read issues for EVERY viewer inside the wave; only the returned value is entitlement-gated (2026-08-07 spec)".

(b) Rewrite the test at `tests/data/getShowForViewer.parallel.test.ts:262` ("non-LEAD viewer issues ZERO financials reads"): assert exactly ONE financials read for a non-LEAD viewer (invert the zero count; keep its existing crew-identity `from()` override).

(c) Extract the crew-identity `from()` override used by that test (`tests/data/getShowForViewer.parallel.test.ts:280-310`) into a module-local helper `overrideCrewIdentity(harness, flags: string[])` with identical behavior (first `crew_members` call resolves the identity `maybeSingle` with the given `role_flags`; later calls fall through), and use it from both the rewritten test and the new twin below.

(d) Add the wave-membership twin, modeled on the admin concurrency test at `tests/data/getShowForViewer.parallel.test.ts:163-226`:

```ts
test("NON-tautological (non-LEAD): the financials read is INITIATED inside the wave, before release", async () => {
  const deferredTables = [
    "hotel_reservations",
    "rooms",
    "transportation",
    "contacts",
    "shows_internal:run_of_show",
    "shows_internal:financials", // NEW: deferred so a serial await would hang here
    "crew_members", // roster
  ];
  const harness = makeDeferredClient({
    deferredTables,
    deferredRpcs: [],
    seed: {
      crew_members: { data: null, error: null }, // identity overridden below
      shows: { data: showRow(), error: null },
      hotel_reservations: { data: [], error: null },
      rooms: { data: [], error: null },
      transportation: { data: null, error: null },
      contacts: { data: [], error: null },
      "shows_internal:run_of_show": { data: null, error: null },
      "shows_internal:financials": { data: null, error: null },
      "rpc:viewer_version_token": { data: "", error: null },
    },
  });
  // Crew identity resolves IMMEDIATELY with non-LEAD, non-FINANCIALS flags.
  overrideCrewIdentity(harness, ["A1"]);
  supabaseState.client = harness.client;

  const p = getShowForViewer("show-1", { kind: "crew", crewMemberId: "crew-1" });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));

  // The financials read joined the SAME wave: initiated before any deferred
  // read resolves. A serial readFinancials await before or after the wave
  // FAILS here (absent at inspection time, or the wave never started).
  expect(harness.started).toContain("shows_internal:financials");
  expect(harness.started).toContain("shows_internal:run_of_show");

  harness.releaseAll();
  await p;
});
```

- [ ] **Step 6: Run tests to verify RED**

Run: `pnpm vitest run tests/data/financialsEntitlement.test.ts tests/data/getShowForViewer.parallel.test.ts`
Expected: the Step 2/3/5 tests FAIL (the financials read never issues for non-entitled viewers under current code). Step 4's test (if added) may already pass; that is fine, it is a pin. The AC-4 entitled tests (`tests/data/financialsEntitlement.test.ts:145` and `tests/data/financialsEntitlement.test.ts:172`) still PASS.

- [ ] **Step 7: Implement — un-gate the wave slot, gate the return**

In `lib/data/getShowForViewer.ts`:

(a) Wave slot (`lib/data/getShowForViewer.ts:762`): replace `financialsEntitled ? readFinancials() : Promise.resolve(undefined),` with `readFinancials(),`

(b) Inside `readFinancials`, after the error check and before the empty/decode handling, insert the return-boundary gate:

```ts
      if (internalRes.error) {
        tileErrors["financials"] = internalRes.error.message;
        return undefined;
      }
      // Return-boundary gate (2026-08-07 spec 2.1): the read runs for EVERY
      // viewer so fetch failures are observable on any cache fill; the VALUE
      // leaves this function only for financialsEntitled viewers. RLS never
      // applied on this service-role path; the real defense lines are this
      // gate and the physical shows/shows_internal separation (spec 2.2).
      if (!financialsEntitled) return undefined;
      if (!internalRes.data?.financials) return undefined;
```

(the `catch` path stays exactly as-is: it writes `tileErrors["financials"]` for every viewer).

(c) Comment lockstep (AC-7) in the same commit; update each block that states the old zero-read contract, anchored by phrase:
- `lib/data/getShowForViewer.ts:29` "Application gate: `financialsEntitled` derivation here" header note: add "gates the RETURNED value; the read itself is unconditional (2026-08-07)".
- `lib/data/getShowForViewer.ts:78` `FinancialsRow` doc "Read only for financialsEntitled viewers" becomes "Fetched for every viewer; RETURNED only to financialsEntitled viewers".
- `lib/data/getShowForViewer.ts:713-718` "The first-line-of-defense gate ... this read is NEVER issued ... the JSONB column isn't even queried" rewritten per spec §2.2 (return-boundary gate; read unconditional for observability).
- `lib/data/getShowForViewer.ts:752-753` "When !financialsEntitled the financials slot is Promise.resolve(undefined) so ZERO financials reads issue" becomes "the financials read always joins the wave; the return value is entitlement-gated inside readFinancials".
- `lib/data/getShowForViewer.ts:822` "(the wave passed Promise.resolve(undefined), so NO shows_internal financials read issued)" becomes "(readFinancials returned undefined at the return-boundary gate)".

- [ ] **Step 8: Run tests to verify GREEN**

Run: `pnpm vitest run tests/data/`
Expected: ALL PASS, including `tests/data/getShowForViewer.cache.test.ts` untouched-green (cache contract unchanged) and the AC-4 entitled tests byte-untouched.

- [ ] **Step 9: AC-6 sweep**

Run: `rg -i -n "ZERO financials|never selected" tests/`
Expected: no hit asserting zero financials reads remains (AC-6). The only permitted matches are historical strings inside fixtures or comments that no longer assert.

- [ ] **Step 10: Full gates**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all green. (Typecheck covers vitest AND playwright configs.)

- [ ] **Step 11: Commit**

```bash
git add lib/data/getShowForViewer.ts tests/data/financialsEntitlement.test.ts tests/data/getShowForViewer.parallel.test.ts
git commit -m "feat(crew-page): financials fetch observed on every cache fill, return still entitlement-gated"
```

### Task 2: Docs amendments — execute the spec §3 census (AC-9, AC-10)

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-9,AC-10 -->

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (lines 191-193, 653, 2373, 2377, 2460), `docs/superpowers/specs/nav-perf/2026-06-22-nav-perf-phase1-data-auth.md` (lines 49, 74, 137), `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md` (§4.13 banner, A1/A2 inline pointers, line 379), `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-17-crew-page-redesign-phase2-agenda.md` (lines 25, 80, 110), `docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md` (lines 79, 297), `docs/superpowers/specs/README.md`

TDD note: prose has no new failing unit test; the red command pins the docs meta-suite green after the edits.

- [ ] **Step 1: Master spec rewords (5 sites).** Apply the spec §3 dispositions verbatim in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, each tagged `(2026-08-07 viewer-independent-probe amendment; see docs/superpowers/specs/2026-08-07-projection-financials-viewer-independent-design.md §3)`:
  - Lines 191-193 (DDL comment): "The application joins this in only when the viewer is admin or has a financials capability (LEAD OR FINANCIALS)..." becomes "The application RETURNS this data only when the viewer is admin or has a financials capability (LEAD OR FINANCIALS); the read itself issues on every fill for observability".
  - Line 653: "For non-entitled viewers, it does not query `shows_internal` at all." becomes "For non-entitled viewers, the fetched `financials` value is discarded at the return boundary; the projection never carries it (the query itself now issues on every fill so fetch failures are observable)." Keep the caller-supplied-role-forbidden sentence untouched.
  - Line 2373: "the data fetcher does not query `shows_internal` at all; `financials` is absent from the response by construction" becomes "`financials` is absent from the response by construction (return-boundary discard); the query issues for observability".
  - Line 2377: "first line of defense (omit at fetch)" becomes "first line of defense (omit from the projection at the return boundary)".
  - Line 2460: "omitted from data fetch per §7.4" plus the never-queried clause becomes "server-discarded per §7.4; fetched for observability, never returned to non-entitled viewers".
  - Verify `pnpm gen:spec-codes` produces no diff (no §12.4 rows touched; the three-lockstep does not fire).
- [ ] **Step 2: nav-perf pointers (3 sites).** In `docs/superpowers/specs/nav-perf/2026-06-22-nav-perf-phase1-data-auth.md`, one-line note at each of lines 49, 74, and 137: conditional financials omission superseded 2026-08-07 (fetch unconditional, return gated; wave parallelism preserved and pinned by the non-LEAD wave-membership test). At line 137 state explicitly: "the omit-not-discard clause is REVERSED by the 2026-08-07 arc".
- [ ] **Step 3: phase-1 banner + pointers.** In `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md`: amendment banner at the head of §4.13 (names this spec; states the uniform contract: every domain's fetch runs for every viewer; financials return-gated); inline pointer notes at the "Accepted v1 limitation" clause and the do-not-fabricate instruction; one-line pointer at line 379. Verify each spec-§3-enumerated secondary line (255-257, 352, 418, 460, 488) reads correctly under the banner.
- [ ] **Step 4: phase-2 agenda pointers (3 sites).** In `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-17-crew-page-redesign-phase2-agenda.md`, lines 25, 80, and 110: the "unlike `financials`, read only when lead" comparisons now describe RETURN gating only.
- [ ] **Step 5: vocab spec pointers (2 sites).** In `docs/superpowers/specs/admin/2026-07-15-extend-role-scope-vocab.md`: line 79 (read-issuance gate now at the return boundary) and line 297 (zero-read contract superseded 2026-08-07).
- [ ] **Step 6: specs README row.** Add this spec's index row to `docs/superpowers/specs/README.md` matching sibling format.
- [ ] **Step 7: Verify and commit**

Run: `pnpm vitest run tests/docs && pnpm format:check`
Expected: green.

```bash
git add docs/
git commit -m "docs(crew-page): amend zero-read contract prose across the ratified corpus"
```

### Task 3: Closeout

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-8 -->

- [ ] **Step 1: Archive the ledger entry (AC-8).** Move `BL-PROJECTION-ALERT-VIEWER-INDEPENDENT-PROBE` from `BACKLOG.md` to `BACKLOG-archive.md` (record: closed 2026-08-07/08 by this arc; note both defects including the S6/cache analysis and the SWR-bounded contract). Remove the `**Status:** IN PROGRESS` marker line in the SAME commit (invariant 12: archives reject in-flight entries; the marker never reaches main). This is the PR's last commit before merge.
- [ ] **Step 2: Verify NO-EDIT census rows untouched and no UI files.** Run `git diff --name-only origin/main`; it must NOT contain the docs-hygiene spec, the two historical plans from spec §3, the ledger-mass fixture, or any non-api `app/` or `components/` file. Record `impeccable-gate: N/A — no UI surface` in the PR body.
- [ ] **Step 3: Whole-diff cross-model review.** codex-guard `--stage diff --round 1`, fresh-eyes brief (REVIEWER ONLY; consequence bound and threat-model fence from spec §6; do-not-relitigate list from spec §1). If Codex is still usage-limited (resets 2026-08-11), apply the skip/self-review ladder: re-run every gate, probe the return-boundary gate with a planted leak (temporarily return the decoded row for non-entitled viewers; the AC-3 test must go RED; revert), probe the observability path with a planted swallow (drop the `tileErrors` write on the error path; the AC-2 test must go RED; revert), and record the skip plus probes in the PR body exactly as the spec's R3 review record does.
- [ ] **Step 4: Full pre-push gates, push, PR.** Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`; push; open the PR (merge-commit style; body records that preflight ran, the review record, and the impeccable line). Commit `docs/review-rounds/` corpus rows with the arc if any new dispatch rows were written.
- [ ] **Step 5: Real CI green, merge, sync.** All twelve required contexts green; `gh pr merge --merge`; then in the MAIN checkout `git pull --ff-only` and verify `git rev-list --left-right --count main...origin/main` prints `0  0`.
- [ ] **Step 6: Stage 4.4 teardown.** `CronDelete` the session nudge; `herdr pane rename "$HERDR_PANE_ID" --clear`; `herdr agent rename "$HERDR_PANE_ID" --clear`; set the worktree's gitignored ship-state marker stage to done.

<!-- tasks: end -->

## e2e/harness note

No Playwright/e2e surface (unit-level vitest only); the e2e harness-readiness checklist does not apply. No fixed-dimension or transition UI tasks (no UI surface).

## Review record

**Plan adversarial review: SKIPPED on the AGENTS.md ladder.** The Codex account's usage limit is exhausted until 2026-08-11 18:21 (demonstrated by the spec R3 dispatch this same session: three attempts, all `ERROR: You've hit your usage limit`; `status: "no_verdict"`, an infrastructure fault). A fresh dispatch would burn wrapper retries to demonstrate the same fault, so the ladder applies directly, with the R3 evidence cited. Self-verification performed in its place: every named file, symbol, harness helper, and line anchor in this plan was read first-hand in the authoring session (`makeFinancialsClient` at `tests/data/financialsEntitlement.test.ts:95-137`; the deferred-wave harness and both modeled tests at `tests/data/getShowForViewer.parallel.test.ts:163-226` and its crew-identity override at `tests/data/getShowForViewer.parallel.test.ts:280-310`; `readFinancials` and the wave slot at `lib/data/getShowForViewer.ts:712-762`); snippets are modifications inside those read files and compile-checked at each task's RED step. **This plan did not receive a formal cross-model APPROVE** — recorded here, not papered over; the whole-diff review at closeout (Task 3 Step 3) re-covers the shipped artifact, with its own ladder fallback if the limit has not reset.
