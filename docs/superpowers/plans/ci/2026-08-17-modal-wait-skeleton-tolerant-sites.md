<!-- spec-lint: not-ui — no UI surface: tasks land in tests/e2e/helpers/**, two e2e specs' wait lines, tests/ci/**, tests/mutation/source/registry.ts, and docs -->

# Modal-wait skeleton-tolerant sites — implementation plan

**Spec:** `docs/superpowers/specs/ci/2026-08-17-modal-wait-skeleton-tolerant-sites-design.md` (adversarial APPROVE, spec round 2) · **Ledger:** `BL-MODAL-WAIT-SKELETON-TOLERANT-SITES` · **Branch:** `fix/modal-wait-skeleton-tolerant`
**Implementer:** separate session (this arc is spec+plan only). Worktree, env link, and preflight already exist per invariant 11; the implementer re-runs `pnpm preflight` before Task 1.

impeccable-gate: N/A — no UI surface

## Surfaces and invariants

- Edited: `tests/e2e/helpers/openShowReviewModal.ts`, `tests/e2e/published-review-modal.deeplink.spec.ts` (one wait site), `tests/e2e/published-review-modal.realtime.spec.ts` (one wait site + one comment block), `tests/ci/modalWaitHelper/scan.ts` (`HELPER_CALL` only), `tests/ci/modalWaitHelper/disposition.ts`, `tests/ci/_metaModalWaitHelper.test.ts`, `tests/mutation/source/registry.ts` (+ `tests/mutation/source/expectedLedgerKinds.ts` on any accepted-survivor branch of Tasks 2/3 or helper enrolment, and `tests/mutation/_metaPremiseContract.test.ts` if the helper enrolls), `BACKLOG.md`/`BACKLOG-archive.md`, `docs/superpowers/plans/ci/README.md`.
- NOT edited: `enumerateCandidates` and the v2 statement machinery, `scanForViolations` + `productOpenSurfaces` (spec §1 out-of-scope; byte-unchanged), the loaded-only core's contract, `tests/ci/_metaModalWaitCandidateV2.test.ts` assertions (its fixtures never reference the new entry points), every OTHER e2e spec.
<!-- spec-lint: ignore — tests/e2e/helpers/openShowReviewFrame.unit.test.ts is created by Task 1 -->
- **Meta-test inventory:** this plan EXTENDS `tests/ci/_metaModalWaitHelper.test.ts` (pinned exemption inventory, derived member arithmetic, U-frame rule coverage), CREATES `tests/e2e/helpers/openShowReviewFrame.unit.test.ts` (frame-core unit cases, sibling file so the existing 15-case suite stays loadable through the red span), UPDATES the `modal-wait-helper-scan` row (accepted-id refresh) and possibly ADDS a helper row in `tests/mutation/source/registry.ts` (Task 4), with `tests/mutation/source/expectedLedgerKinds.ts` and `EXPECTED_ENV_TOUCHING` in `tests/mutation/_metaPremiseContract.test.ts` reconciled on the enrolment branch. No other structural registry applies: no Supabase call boundary, no advisory lock, no admin mutation surface — the diff is test-infra only.
- **Mutation-family closure:** the operator families are the registry rows' declared sets (`operators: [...OPERATOR_NAMES]`, `tests/mutation/source/registry.ts:379` and `tests/mutation/source/registry.ts:446`) — that enumeration is the closure set this arc's reviews converge against. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard (AGENTS.md convergence criterion 4).
- **e2e harness-readiness (Task 5):** (a) server boot: prod build + `pnpm start` per `playwright.config.ts`'s CI webServer command line (the realtime case REQUIRES the production server — its own header comment; dev-server render blows the 1600ms premise); local recipe = the spec §2.2 probe harness: build with the config's env flags, start on :3000, `BASELINE_SERVER_ONLY=1` so the :3000 entry reuses it and no sibling webServer boots, loopback `TEST_DATABASE_URL` (the psqlTarget refusal is the loud guard). (b) readiness gate: the deeplink case's own focus poll and the realtime case's `waitForRowHydration` are the hydration gates — no `networkidle` anywhere. (c) detach-safety: the watchdog's `.catch(() => {})` swallows the post-close rejection of its armed `waitFor` (spec §4.2); no sampler outlives its element.
- Acceptance criteria are spec §5's: **AC-1** frame core + unit cases; **AC-2** deeplink site; **AC-3** realtime site; **AC-4** census total; **AC-5** guard mechanism untouched; **AC-6** mutation duties; **AC-7** e2e verification; **AC-8** bookkeeping. AC-8's ledger half is discharged by Task 6, outside the red-contract region (bookkeeping tail, not a TDD unit).

## Plan-time probes (run 2026-08-18 in this worktree; commands + output)

- `rg -c 'awaitReviewFrameOrRecover|openShowReviewFrameAt|SKELETON_REVIEW_MODAL' tests/ lib/ scripts/` → **0 hits** — the frame API is verifiably absent from the live tree, which is what makes Task 1's authored RED valid.
- `rg -c 'awaitReviewModalOrRecover\(' tests/e2e/*.spec.ts | awk -F: '{s+=$2} END {print s}'` → **12** (matches `N_WAIT_SITES`' 12 rows; Task 3 adds the 13th).
- Baseline deciding suites: `pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` → **26 passed (26)**; `pnpm vitest run tests/ci/_metaModalWaitCandidateV2.test.ts` → **15 passed (15)**; `pnpm vitest run tests/e2e/helpers/openShowReviewModal.unit.test.ts` → **15 passed (15)**.
- Frame-timing calibration: spec §2.2 (deeplink first frame = loaded 5/5, anyAt 47-393ms) and §2.3 (realtime reopen `loadedAt == anyAt` 4/4, 359-864ms) — the probe transcripts the two adoption designs rest on.
- Census mechanics verified against live code: `d/skeleton-tolerant-click` count 1 with `/noWaitAfter/` match (`tests/ci/modalWaitHelper/disposition.ts:598-607`); `d/member-row-activation` count 8 with the `!/noWaitAfter/` arm (`tests/ci/modalWaitHelper/disposition.ts:557-559`); `PINNED_EXEMPTIONS` two rows (`tests/ci/_metaModalWaitHelper.test.ts:55-68`); arithmetic test sums the fixed three-id list (`tests/ci/_metaModalWaitHelper.test.ts:432-446`) — the fixed list is exactly what Task 2 replaces with the derived sum (spec §4.6-2, spec-review R1 finding 1).
- Scoped mutation-gate red capability: demonstrated with a constructed failing input in the parent plan (`docs/superpowers/plans/ci/2026-08-17-modal-wait-candidate-contract.md`, Task 3's corrupted-siteId probe: EXIT=1, `unaccepted-survivor: 1 survivor(s) with no ledger row`) — same command shape, same gate, same registry contract; the shard recipe and its byte-pinning caveat are the lessons-file mechanics this plan reuses verbatim.

## Red-span note

Every task below closes its own red inside the task (failing case → implementation → same command green → commit); there is no cross-task red span. Task 1 new unit cases land in a NEW sibling file so the red span never touches the existing 15-case unit suite. Spliced plan-time probes pin the red MECHANISM exactly: a missing named export does NOT fail collection or a bare reference (void-reference probe: 1 passed) — it is undefined at load, and the red lands when a case CALLS the API (call probe: TypeError awaitReviewFrameOrRecover is not a function, 1 failed). Every Task 1 case therefore calls the surface it asserts on, and no case is reference-only.

Typecheck note (writing-plans snippet rule): the fenced block below was typechecked at plan time under the repo's strict flags (`--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`) with `declare`-stub declarations standing in for the not-yet-existing frame API — `tsc` exit 0. At runtime the frame API stays absent until Task 1's green half, so the authored cases fail ON CALL (the TypeError mechanism the spliced probes above pin — never "unresolved import", which the void-reference probe showed does not red); the stub typecheck proves the snippet's own syntax and typing.

<!-- tasks: depth=3 red-contract -->

### Task 1: Frame core + watchdog + unit cases (red → green in one task)

<!-- spec-lint: ignore — tests/e2e/helpers/openShowReviewFrame.unit.test.ts is created by this task -->
<!-- task: red=`pnpm vitest run tests/e2e/helpers/openShowReviewFrame.unit.test.ts` red-state=authored red-target=`tests/e2e/helpers/openShowReviewModal.ts:43` why=`the module today exports only the loaded-only surface (LOADED_REVIEW_MODAL at :43 and the three shipped entry points; plan-time probe: 0 hits for the frame API names) — the sibling suite imports the frame API as missing named exports, which vitest/esbuild leaves undefined at load (spliced probe: a void-reference PASSES), so every FakePage case RUNS and fails the moment it calls the API (spliced probe: TypeError awaitReviewFrameOrRecover is not a function, 1 failed) and the jsdom cardinality case reds on toHaveLength(1) because querySelectorAll(undefined) matches nothing — every case fails until this task green half lands the exports` ac=AC-1 -->

<!-- spec-lint: ignore — tests/e2e/helpers/openShowReviewFrame.unit.test.ts is created by this task -->
**Files:** `tests/e2e/helpers/openShowReviewModal.ts`, new `tests/e2e/helpers/openShowReviewFrame.unit.test.ts` (matched by the unit-suite include — same mechanism that already collects `openShowReviewModal.unit.test.ts` beside it; no wiring task).

RED half — author the spec §4.5 cases in the sibling file on the existing FakePage harness (`tests/e2e/helpers/openShowReviewModal.unit.test.ts:40-104`; import the builder or copy it — the harness is module-local, so copy, as `waitForRowHydration` precedent does):

1. **Race composition:** `awaitReviewFrameOrRecover` waits on an `.or` chain whose recorded selector string contains all three selectors, `.first()`-scoped, with `timeoutMs` normalization (non-finite/≤0 → 30_000). Failure mode caught: a two-way race that silently drops the skeleton or boundary arm.
2. **Loaded return:** loaded visible → `{ frame: "loaded" }`, returned locator UNSCOPED `LOADED_REVIEW_MODAL`. Catches: `.first()` leaking into the return (parent §4.1 strictness contract).
3. **Skeleton return + watchdog arm:** skeleton visible, loaded not → `{ frame: "skeleton" }`, unscoped `SKELETON_REVIEW_MODAL` locator, AND a recorded `waitFor` whose selector EQUALS the bare boundary selector — exact string equality, never `.includes(…)`, because the initial race's `.or` chain ALSO contains the boundary substring and an includes-filter passes with no watchdog at all (plan review R2 finding 1's probe: `proposedAssertion: true` under a no-watchdog build; the watchdog's own `page.locator(BOUNDARY_SELECTOR).waitFor` is the only call whose recorded selector is the bare string). Catches: a watchdog that never arms.
4. **Loaded-priority tiebreak + watchdog NOT armed:** BOTH shapes visible (the streaming-swap overlap window) → `{ frame: "loaded" }`, and the converse watchdog assertion — ZERO recorded `waitFor` calls whose selector equals the bare boundary selector (same exact-equality filter). The loaded-only case 2 carries the same zero assertion. Catches: a skeleton-first check that lies during the swap, AND a watchdog armed unconditionally (the other escape R2 finding 1 named — AC-1 claims skeleton-ONLY arming).
5. **Twin-frame cardinality — jsdom, NOT FakePage** (plan review R1 finding 4): FakePage mints a fresh object per `page.locator` call and owns no selector engine, so a FakePage version passes for ANY two selector strings — tautological. The case instead extends the existing jsdom cardinality precedent (`tests/e2e/helpers/openShowReviewModal.unit.test.ts:235-254`, which proves `LOADED_REVIEW_MODAL` via `querySelectorAll` against a real twin-frame DOM): in a DOM holding a bare skeleton `…-modal` (with the `…-loading` child) and a loaded `…-modal:has(…-title)`, `document.querySelectorAll(SKELETON_REVIEW_MODAL)` and `document.querySelectorAll(LOADED_REVIEW_MODAL)` each return length 1 and the two matched nodes are `!==` — selector disjointness proven by a real selector engine, which is what makes `frame` truthful.
6. **Starve:** nothing visible → error names all three selectors and `show_review_snapshot_failed`. Catches: a starve message that loses the grep target the ledger row exists to add.
7. **`openShowReviewFrameAt` delegation:** goto called with exact url + `gotoOptions` pass-through + label fallback `url=…` (mirrors `tests/e2e/helpers/openShowReviewModal.unit.test.ts:123-137`).

Anti-tautology: each FakePage case's discriminating premise is the `visible` callback the case itself configures — expected values derive from the case's own fixture wiring, never from the module under test; case 5 runs on jsdom's real selector engine precisely because FakePage cannot discriminate selectors at all.

Observe red: `pnpm vitest run tests/e2e/helpers/openShowReviewFrame.unit.test.ts` fails on every case, by two mechanisms (plan review R2 finding 3): the FakePage cases throw `TypeError: … is not a function` at their first call of the absent API (the call-form red the spliced probe pinned; collection succeeds), while the jsdom cardinality case reds on `toHaveLength(1)` — the missing export leaves `SKELETON_REVIEW_MODAL` undefined and `querySelectorAll(undefined)` matches nothing rather than throwing. Meanwhile `pnpm vitest run tests/e2e/helpers/openShowReviewModal.unit.test.ts` stays 15 passed.

GREEN half — implement spec §4.1-§4.2 in `openShowReviewModal.ts`: `SKELETON_REVIEW_MODAL`, `ReviewFrame`/`AwaitFrameResult`, `awaitReviewFrameOrRecover` (three-way race; loaded checked before skeleton; boundary → annotate + retry-click + one re-race; starve → named error), the fire-and-forget watchdog (armed only on skeleton return, `infra-recovery` type, both promise arms swallowed), `openShowReviewFrameAt`, and the module-header paragraph extension. No top-level `@playwright/test` value import (the unit suite runs under vitest — the existing import-discipline case pins it).

Sketch (typechecked shape, not the full block):

```ts
import { expect, test } from "vitest";

import {
  awaitReviewFrameOrRecover,
  openShowReviewFrameAt,
  SKELETON_REVIEW_MODAL,
} from "./openShowReviewModal";

test("skeleton visible and loaded absent returns the skeleton frame and arms the watchdog", async () => {
  const fake = makeFakePage({ visible: (sel) => sel === SKELETON_REVIEW_MODAL });
  const result = await awaitReviewFrameOrRecover(fake.page, { label: "case:skeleton" });
  expect(result.frame).toBe("skeleton");
  expect(result.locator.scoped).toBe(false);
  // EXACT equality: the race's .or chain also CONTAINS the boundary substring,
  // so an includes-filter is satisfied with no watchdog at all (R2 finding 1).
  const watchdogWaits = fake.waitForCalls.filter(
    (c) => c.selector === '[data-testid="admin-route-error-boundary"]',
  );
  expect(watchdogWaits.length).toBe(1);
});
```

Verify: new suite green, existing unit suite 15 passed unchanged, `pnpm typecheck` green. Commit: `test(ci): frame-reporting modal wait core + watchdog (unit-first)`.

### Task 2: Deeplink adoption + census vocabulary (red → green on the meta suite)

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/ci/_metaModalWaitHelper.test.ts:55` why=`PINNED_EXEMPTIONS at :55 pins two exemption rows, so the moment this task rewrites the deeplink site (marker deleted, goto folded into the helper) the inventory assertion observes 1 exemption against the 2-row pin and fails; that red alone cannot certify the census vocabulary, so the task stages a SECOND observed red on the same command — the U-frame rule added BEFORE the HELPER_CALL alternation fails the every-rule-matches-at-least-one assertion, pinning that a pin-only edit cannot reach green — and the command passes only once the full vocabulary (HELPER_CALL alternations at scan.ts:135, U-frame rule, derived arithmetic, one-row pin) lands` ac=AC-2,AC-4,AC-6 -->

**Files:** `tests/e2e/published-review-modal.deeplink.spec.ts` (site rewrite per spec §4.3), `tests/ci/modalWaitHelper/scan.ts` (`HELPER_CALL` + same-commit mutation ledger refresh), `tests/ci/modalWaitHelper/disposition.ts` (U-frame rule), `tests/ci/_metaModalWaitHelper.test.ts` (pin + derived arithmetic), `tests/mutation/source/registry.ts`, `tests/mutation/source/expectedLedgerKinds.ts` (accepted-survivor branch only — see step 4).

1. RED 1 (the marker's why=, first arm): rewrite the deeplink site — delete the `modal-wait-exempt` marker and the goto+wait lines, insert `openShowReviewFrameAt` with label `"deeplink-esc:any-frame"`, extend the helper import. Observe `pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red on the exemption-inventory assertion (found 1, pinned 2).
2. RED 2 (plan review R1 finding 3's closure — the vocabulary cannot be skipped): add the `f/member-shape-U-frame` rule (both names, shape "U", count 1, spec §4.6-2) BEFORE touching `HELPER_CALL`, and observe the same command red on the every-rule-matches-≥1 assertion — the rule exists but no candidate does, proving a pin-only edit cannot reach green while `openShowReviewFrameAt` stays census-invisible.
3. GREEN: `HELPER_CALL` gains both alternations (spec §4.6-1) AND `callsHelper` in `disposition.ts` (`tests/ci/modalWaitHelper/disposition.ts:254`, its only use is `a/member-helper-call`'s match) gains `openShowReviewFrameAt` — the rewritten site's URL literal stays an origin-(a) candidate independent of `HELPER_CALL` (plan review R3 finding 1), so the `a/member-helper-call` count moves 8 → 9 and `a/exempt-declared` moves 2 → 1 (the deleted marker was one of its two matches); `PINNED_EXEMPTIONS` drops the `/skeleton-tolerant/` row; the arithmetic test rewritten to the DERIVED sum over all origin-(f) member rules with per-id pins retained and total 52 at this task's end (53 lands with Task 3's N row; state the intermediate number in the commit body — the derivation makes the update mechanical; origin-(a) member rows are the same sites seen through the route-literal origin and are deliberately OUTSIDE the origin-(f) sum, exactly as #840 left them).
<!-- spec-lint: ignore — tests/mutation/guardSurfaces.shardX.test.ts is a transient file created and deleted within the task; deliberately never tracked -->
4. **Same-commit mutation re-score, BOTH edited surfaces** (the registry NOTE, `tests/mutation/source/registry.ts:415-421`, and spec §4.6-6's same-commit disposition duty — plan review R1 finding 2): this commit edits `scan.ts` AND `disposition.ts`, so the scoped shard (temporary `guardSurfaces.shardX.test.ts` filtered to BOTH `modal-wait-helper-scan` and `modal-wait-disposition`, `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shardX.test.ts`, DELETE the temp file before commit — `_metaSourceShardIntegrity` pins the shard set) runs before the commit. Refresh both scan siteIds; repay or per-row-accept any new survivor on either surface — and any ACCEPTED row changes that surface's per-kind counts, so `EXPECTED_LEDGER_KINDS` in `tests/mutation/source/expectedLedgerKinds.ts` is reconciled in the SAME commit (the scoring gate compares kind counts exactly, `tests/mutation/source/surfaceCases.ts:59` — plan review R2 finding 4); record both scores + survivor sets in the commit body.
5. Verify: meta suite green, candidate-v2 suite 15 passed (its fixtures reference neither new name), `pnpm typecheck`.

Commit: `fix(e2e): deeplink Esc site adopts the frame-reporting wait; census learns the frame entry (both mutation ledgers re-scored same-commit)`.

### Task 3: Realtime adoption + N-wait registry row (red → green on the meta suite)

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/ci/modalWaitHelper/disposition.ts:110` why=`N_WAIT_SITES at :110 holds 12 rows — so the moment this task rewrites the realtime wait into awaitReviewModalOrRecover the census reds TWICE on the same command (plan review R2 finding 2's probe): the exact-match assertion names the undeclared 13th triple, and f/member-shape-N reds 13 observed against its registry-derived expectedCount of 12; the unchanged noWaitAfter click still matches the live d/skeleton-tolerant-click rule during the red, so THAT rule does not drift (R1 finding 5b); the same command passes once the registry row, the rule retirement, and the row-activation re-claim land in this task's green half` ac=AC-3,AC-4,AC-6 -->

**Files:** `tests/e2e/published-review-modal.realtime.spec.ts` (site rewrite + the `published-review-modal.realtime.spec.ts:54-58` comment rewrite per spec §4.4), `tests/ci/modalWaitHelper/disposition.ts` (retire `d/skeleton-tolerant-click`; drop the `!/noWaitAfter/` arm from `d/member-row-activation`, count 8 → 9; `N_WAIT_SITES` +1), `tests/ci/_metaModalWaitHelper.test.ts` (derived total 52 → 53), `tests/mutation/source/expectedLedgerKinds.ts` (accepted-survivor branch only — see step 4).

1. RED: rewrite the realtime wait to `awaitReviewModalOrRecover(page, { timeoutMs: MODAL_OPEN_TIMEOUT_MS, label: "reopen:aborted-close" })` and rewrite the stale `MODAL_ANY` rationale comment to the spec §4.4 text (probe-cited). Observe the meta suite red on BOTH arms (R2 finding 2): the registry exact-match names the undeclared 13th triple, and `f/member-shape-N` reads 13 against its derived `expectedCount` of 12. The unchanged click keeps its live `d/skeleton-tolerant-click` match through this step.
2. GREEN: `N_WAIT_SITES` row (file, scope title from `published-review-modal.realtime.spec.ts:747`, labelSource `"reopen:aborted-close"`, protects prose naming the re-click); retire `d/skeleton-tolerant-click`; drop the exclusion arm (8 → 9); derived total now 53.
3. **Reconciliation (run and paste in the commit body):** `rg -c 'awaitReviewModalOrRecover\(' tests/e2e/*.spec.ts` sum = 13 = `N_WAIT_SITES.length`; rule inventory diff = −1 (`d/skeleton-tolerant-click`) +1 (`f/member-shape-U-frame`, Task 2) net 0 against #840's 26; `undisposed === []`, `ambiguous === []` from the suite run.
4. **Same-commit `modal-wait-disposition` re-score** (spec §4.6-6; plan review R1 finding 2): the scoped shard filtered to `modal-wait-disposition`, run before this commit, score + survivor set in the commit body (`accepted: []` — any survivor repaid with a deciding case or per-row accepted, never silently; an accepted row also reconciles `EXPECTED_LEDGER_KINDS` in `tests/mutation/source/expectedLedgerKinds.ts` in the SAME commit, per the exact kind-count comparison at `tests/mutation/source/surfaceCases.ts:59` — R2 finding 4), temp shard deleted.

Commit: `fix(e2e): realtime aborted-close reopen adopts the loaded-only wait; N-wait registry gains its row`.

### Task 4: Helper enrolment decision (both census re-scores landed same-commit in Tasks 2/3)

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:280` why=`adding the helper GUARD_SURFACES row leaves EXPECTED_LEDGER_KINDS (:280 block) without the new key, and the gates suite pins whole-registry key-set equality (guardSurfaces.gates.test.ts:19-24) — a PERSISTENT file, so the SAME command is observed red the moment the row lands and passes on either branch: keep (key + accepted rows + EXPECTED_ENV_TOUCHING reconciled) or not-expressible (probe row removed again) — plan review R1 finding 1: the earlier transient-shard command could never go green on the removal branch (probe: No test files found, exit 1)` ac=AC-6 -->

<!-- spec-lint: ignore — tests/mutation/guardSurfaces.shardX.test.ts is a transient file this task creates and deletes; deliberately never tracked -->
**Files:** `tests/mutation/source/registry.ts`, `tests/mutation/source/expectedLedgerKinds.ts`, `tests/mutation/_metaPremiseContract.test.ts` (enrolment branch only); temporary `guardSurfaces.shardX.test.ts` for the SCORING run only (created, DELETED before commit — the marker's red/green command is the persistent gates suite, never the shard).

1. **Helper enrolment probe** (spec §4.6-7): add the candidate `GuardSurface` row for `tests/e2e/helpers/openShowReviewModal.ts` (suitePaths = both unit suites; `operators: [...OPERATOR_NAMES]`; provisional floor; a `control` anchored in the frame race — flipping the loaded/skeleton priority check is the candidate, since unit case 4 notices; `accepted: []`). Observe the GATES suite red — the whole-registry key-set assertion (`tests/mutation/guardSurfaces.gates.test.ts:19-24`) sees the new id with no `EXPECTED_LEDGER_KINDS` key; the per-surface kind-count comparison inside a scoring run reds at `tests/mutation/source/surfaceCases.ts:48-60`, not in the gates file (plan review R1 finding 5c — the two failures live in different suites and the marker claims only the gates one). Run the scoped SCORING gate via the temp shard and decide:
   - **Keep:** survivors confined to the dynamic-import shadow (recovery + watchdog fire) and prose strings → per-row accepted entries with reasons, floor set to the observed tier, `EXPECTED_LEDGER_KINDS` key added, `EXPECTED_ENV_TOUCHING` row for any new deciding suite (`tests/mutation/_metaPremiseContract.test.ts:32`, key-set equality at `tests/mutation/_metaPremiseContract.test.ts:325`).
   - **Not expressible / floor unreachable:** remove the row, record the probe-backed disposition as a dated comment at the registry insertion point (step3 precedent — honest, never symbolic); the gates suite returns green on removal, completing the same-command cycle.
2. Delete the temp shard; gates suite green (the marker's command); `pnpm heavy pnpm test:fast` for collateral. The Task 2 and Task 3 recorded scores plus this task's outcome are the numbers the implementation round-1 diff brief states (AGENTS.md criterion 4 + the codex-guard `GUARD SURFACE:` line).

Commit: `test(mutation): helper enrolment disposition (probe-backed)`.

<!-- tasks: end -->

### Task 5: e2e verification, foreground under the heavy wrapper (AC-7; outside the red-contract region — an execution gate, not a TDD unit)

Gate-red capability is demonstrated, not asserted: the spec §2 probe runs used exactly this command shape and produced BOTH observed failures (the psqlTarget loopback refusal, `EXIT=1`, five reps failing before the env fix; the realtime premise red at 5492ms) and observed passes — so a non-zero exit here is a real signal, never a vacuous gate.

1. Deeplink: `BASELINE_SERVER_ONLY=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm heavy playwright test tests/e2e/published-review-modal.deeplink.spec.ts -g "Esc during load" --repeat-each=3 --reporter=list` against the §2.2 harness (prod build + `pnpm start` on :3000 with the config's env flags; the server starts OUTSIDE the wrapper per the semaphore rule).
2. Realtime: same harness + `MODAL_REALTIME_E2E=1`, `-g "ABORTED"`, `--repeat-each=3`. Known environmental flake at this case (spec §2.3: cold-start premise red, phase-i invalidation-frame) — a red is triaged against those two signatures before it is read as a regression; the wait-adoption signature (starve/boundary) is the one this arc owns.
3. Transcripts (filtered per the lessons file's stream-noise rule) recorded in the task commit body or PR body.

### Task 6: Ledger graduation red-first, whole-diff review, merge tail (outside the red-contract region — bookkeeping tail per the parent-plan precedent)

1. Red-first graduation exactly as the parent plan's Task 4: add the `{ id: "BL-MODAL-WAIT-SKELETON-TOLERANT-SITES", provenance: "fix/modal-wait-skeleton-tolerant" }` row to `BACKLOG_GRADUATED` while the entry still sits in `BACKLOG.md` and OBSERVE `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` red ("missing from BACKLOG-archive.md" — the archive-presence assertion runs first); green lands when the entry moves to the archive with the `IN PROGRESS` marker removed in the same commit (invariant 12; splice per the lessons-file archive seam rules). The graduation commit is STAGED and LANDS as the declared bookkeeping-only tail after the final diff-review round.
2. Whole-diff cross-model review per the parent plan's Task 5 mechanics (codex-guard, `--stage diff`, fresh out dir per round, backgrounded; round-1 brief carries the `GUARD SURFACE:` lines with BOTH census scores — plus the helper's if enrolled — the spec §6 bound/domain/fence, REVIEWER ONLY, and the do-not-relitigate list). Findings → class-sweep → repair → next round; APPROVE → bookkeeping tail → push → `gh pr merge --merge --auto` armed only after the tail lands (the #838 lesson) → re-arm after every push → required contexts by NAME → `0  0` → CronDelete + label clears.


## Execution notes for the implementation session

- Diff-review briefs: guard surface — every brief carries the spec §6 consequence bound, `PROBE DOMAIN:` line, threat fence; round 1 adds `GUARD SURFACE:` + `MUTATION SCORE:` lines (the Task 2 and Task 3 same-commit runs, plus Task 4's enrolment outcome). The convergence-gate hook additionally requires the literal acceptance-posture phrasing ("correct or signaled, never silently wrong") in the brief body.
- Do-not-relitigate for diff briefs: spec §1.1 verbatim, plus the spec-review R1 disposition (derived member sum — a finding proposing to re-fix the arithmetic with a wider literal list relitigates it).
- Same-axis watch: if two consecutive diff rounds land on frame-selector or census-rule grammar, stop patching per-instance — the repair direction is NARROWING (undisposed fall-through, documented limit) per AGENTS.md, never a wider recognizer.
- The two spec sites are the ONLY e2e edits; any third spec file appearing in the diff is scope creep and re-enters review.
