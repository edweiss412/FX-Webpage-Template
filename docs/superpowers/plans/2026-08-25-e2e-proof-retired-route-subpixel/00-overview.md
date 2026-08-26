# Plan: re-target the empty-state proof, settle the tap-target read

Spec: `docs/superpowers/specs/2026-08-25-e2e-proof-retired-route-subpixel-design.md`
Branch: `fix/e2e-proof-retired-route-subpixel`
Closes: `BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE`, `BL-TAP-TARGET-LAYOUT-SUBPIXEL-TOLERANCE`

impeccable-gate: N/A — no UI surface

The diff touches `tests/**`, `.github/workflows/**`, `playwright.config.ts` and `docs/**` only. No file under `app/` outside `app/api/**`, none under `components/`, no design token file, no `DESIGN.md`. Section 4 records the one place where a product-code edit was considered and declined.

## 1. Shape of the work, and how the order actually went

The task list below is written FROM `git log`, not from intention, and it is regenerated whenever a review round adds a commit. Every e2e command runs through `pnpm heavy` wrapping the outermost invocation. No task edits product code, so invariant 8 does not arm; invariant 6 (one conventional commit per task) holds throughout.

**Invariant 1 is NOT claimed clean.** §1.1 records where TDD was violated, and an earlier draft of this paragraph claimed test-first for every task while §1.1 admitted otherwise. Recording the history rather than rewriting it is the disposition; claiming compliance on top of the record is not, so the claim is gone.

The evidence each task rests on was gathered before the spec was written, because the alternative is a spec whose test section asserts oracles nobody ran. Four tasks exist only because a run disproved the obvious design: the identity §8.3's category 1 lives on, the viewer the route accepts, the cache that swallows a direct DB write, and the shape of "no dates" the shell survives. Each is recorded at its task.

### 1.1 Three process defects, recorded rather than hidden

Plan review round 1 was right about the commit order, and this section says so instead of presenting an order the history does not have.

**Defect one: the locked path landed after the writes it protects.** Task 1 (`ddf0d83fb`) shipped the rewritten spec with unlocked service-role `shows` writes. `tests/help/walker-routes.test.ts` was RED at that commit, because the file's frozen locked-table count no longer matched. Task 8 (`d6602335c`) then moved those writes onto the per-show lock and removed the frozen row. The correct order was Task 8 first, and the branch passed through a state that violated invariant 2.

**Defect two: the lock proof landed after the lock.** `d6602335c` added `lockedShowCopy.ts`; its executable proof did not arrive until `95d69f052`, one review round later, and only because the reviewer showed that `walker-routes` is green with the lock deleted. That is a TDD-per-task violation on the one task where the invariant is strictest.

**Defect three, the same shape one layer down.** `86738ee32` added both cleanup success checks with no failing test and no mutant, so either could have been deleted with every green test staying green. Plan review round 2 caught it. The repair (Task 15) gives the delete predicate negative proofs and removes the second check entirely rather than proving it.

Both are recorded, not rewritten. The final tree satisfies invariants 1, 2, 6 and 9, every gate below is green on it, and rewriting twelve commits across a merge to manufacture a tidier history would trade a real record for a fictional one. **The lesson, stated so it is reusable: when a task's first action is a write to an invariant-2 table, the locked path is task zero, and its structural proof is written before the helper it proves.** A guard that already exists is not evidence the invariant is covered; check what that guard actually discriminates first.

## 2. Meta-test inventory

| Meta-test | Why it is in scope | Expected movement |
|---|---|---|
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | Task 5 wires the spec into `app-e2e.yml`; its shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:296`) then FORCES the `UNSEEN` row out | red between wiring and row removal, green after; that coupling is the point |
| `tests/e2e/_metaFontWaitCoverage.test.ts` | Task 6 adds documented limits to its header; `CALLERS` is deliberately NOT extended | unchanged and green — a row for a file this analyzer cannot see a navigation in would pass vacuously |
| `tests/help/walker-routes.test.ts` | Task 8 moves the `shows` writes onto the locked path | red until the frozen `EXEMPT_PREEXISTING` count for this spec is REMOVED at 0 |
| `tests/e2e/helpers/lockedShowCopy.unit.test.ts` (new) | invariant 2's "tests assert the lock is held", which walker-routes provably cannot do | new and green: no recognizer, an exact-text comparison through the real callers, plus eight predicate cases (five negative) on the delete signal |
| `tests/ci/_metaModalWaitHelper.test.ts` (owning `tests/ci/modalWaitHelper/disposition.ts`) | the rewrite's `gotoSection` adds a non-literal-goto candidate | census count rises; resolved to the UNION (19) after `origin/main` bumped it for a different site the same day |
| `tests/cross-cutting/app-e2e-ci-wiring.test.ts` | it, NOT the coverage meta-test, owns `REQUIRED` parity for `scripts/check-app-e2e-executed.mjs` | green once the spec's `REQUIRED` row lands at 4 |
| `tests/docs/_metaDeferralLedgerGraduation.test.ts` | Task 12 graduates two rows, and each owes a `BACKLOG_GRADUATED` registry row with this branch as provenance | two new registry rows |
| `tests/docs/_metaInvariant8Closeout.test.ts` | the plan carries the `impeccable-gate` marker | green with the marker on its own line |
| `tests/cross-cutting/lifecycle-layout-e2e-ci-wiring.test.ts` | Task 2 adds a case to the tap-target spec, so its executed floor moves | red until `check-lifecycle-layout-executed.mjs` goes 5 → 6 |
| `tests/cross-cutting/replacementString.test.ts` | the lock proof builds mutants with `.replace` | red on an interpolated replacement string; green on a replacer function |
| `tests/docs/_metaLedgerInProgress.test.ts` | Task 0 marks both rows in progress; Task 16 removes the markers and archives | green throughout: markers name a branch that exists on origin until the last commit removes them |
| `tests/docs/_metaLedgerMintBar.test.ts` | This arc files NO new row, so nothing new is subject to the bar | unchanged |

**Advisory-lock holder topology (Task 8).** The branch DOES touch a lock surface: `tests/e2e/helpers/lockedShowCopy.ts` acquires `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` for each fixture `shows` write. Single holder, at exactly one layer: the psql transaction itself. No JS-side wrapper, no RPC, and no nesting — one acquisition per transaction, asserted as such. Cleanup takes one transaction per show rather than one lock standing in for several.

## 3. Tasks, in commit order

Each row names the commit that carries it and the verification that was actually run.

### Task 0 — ledger markers (`cd493bbdb`)

Both rows marked `**Status:** IN PROGRESS · **Branch:** fix/e2e-proof-retired-route-subpixel`, committed and pushed so the claim is visible to other sessions (invariant 12). `pnpm ledger:claims --check` reported no collision first.

### Task 1 — rewrite `empty-state-reachability.spec.ts` against live identities (`ddf0d83fb`)

Test-first by construction: the deliverable IS the test, and the "before" state is four cases failing at `toBeVisible` on testids no product file defines. Per-test show copies (spec §6.1), `ADMIN_FIXTURE` (spec §6.2), the four categories re-expressed (spec §6.3), the four `toHaveScreenshot` calls and their four `-darwin.png` baselines deleted (spec §6.4).

Six runs shaped it, each `CI=1 BASELINE_SERVER_ONLY=1 … --project=mobile-safari --retries=0` under `pnpm heavy`:

| Run | Outcome | What it forced |
|---|---|---|
| 1 | 4 failed at `crew-shell` | the crew identity bounces through `/api/auth/picker-bootstrap`; WebKit will not store the `__Host-` picker cookie over http. Switch to `ADMIN_FIXTURE`. |
| 2 | 4 failed on the contracts | direct DB writes never reach the render: `cachedShowData` is tagged per show with `revalidate: 300`. Switch to per-test show copies. |
| 3 | 4 failed inserting a share token | `show_share_tokens` is minted by the DB on show insert. Read the minted token. |
| 4 | 2 passed, 2 failed | `dates: {}` breaks the shell above the section's try/catch; a fresh `last_checked_at` still renders a subtle-tier footer. |
| 5 | 3 passed, 1 failed | `showDays: []` alone leaves travel/set/strike day cards. Empty the four fields `aggregateDays` reads. |
| 6 | **4 passed (28.6s)** | green |

**This commit is where ordering defect one lands** (§1.1): its `shows` writes were unlocked and `walker-routes` was red until Task 8.

### Task 2 — the tap-target barrier premise test, RED (`17ca1e35b`)

Verified RED before the fix: **6 repeats, 6 failures**, each naming `step3-details-sheet-rise` and reporting three running animations.

Verification: `pnpm heavy pnpm exec playwright test tests/e2e/tap-target-inline-controls.layout.spec.ts --project=mobile-safari --retries=0 --repeat-each=6 -g "premise + barrier"`.

### Task 3 — the barrier, GREEN (`76d62b5ff`)

`settleReviewPanelEntrance` in `tests/e2e/helpers/devCaptureStaged.ts`, between `waitForSelector` and the helper's `return`. Placed on the helper, not the call sites, so every caller inherits it (spec §4.1). No tolerance in any assertion changes.

Verification: the whole file at `--repeat-each=40 --retries=0` — 6 cases, **240 runs, 240 passed**. The pre-fix rate on the sites 6/7 case alone was 1 in 20, then 3 in 39.

### Task 4 — delete the dead layout helper (`dc064c4d5`)

The e2e layout helper had no importers anywhere in the repo and all three exports were unreferenced; two encoded retired identities. Deleted whole (spec §7.1).

Verification: a repo-wide search for that helper path returned only the file's own header before deletion and nothing after; `pnpm typecheck` clean.

### Task 5 — wire the spec, and let the meta-test force the allowlist row out (`f3c628421`)

Spec added to `app-e2e.yml`'s run-step file list; removed from the desktop-chromium `testMatch` (spec §6.5); `UNSEEN` row removed; `ENV_KEY_ALLOWLIST`'s `governs` lists updated across all 18 rows the job's env keys govern, which the relocation-reds assertion caught.

Verification: `pnpm exec vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` — 97 passed. The coupling is mechanical, not remembered: the shadowing assertion fails on an allowlisted spec that has become covered. Probed independently by the plan reviewer: `{"covered":true,"rejected":[],"shadowing":["tests/e2e/empty-state-reachability.spec.ts"]}`.

### Task 6 — record the two documented limits (`4a597f71a`, marker fix `0909afe87`)

The `lifecycle-layout-e2e.yml` header gets the corrected dark-on-`main` mechanism, the decision not to add `push:`, and a re-file trigger (spec §5). The `_metaFontWaitCoverage.test.ts` header gets the analyzer's single-file blind spot and the enumerated `CALLERS` limit, both with probe numbers and a re-file trigger (spec §7.3). Neither files a ledger row.

Verification: `pnpm exec vitest run tests/e2e/_metaFontWaitCoverage.test.ts` — 27 passed. `0909afe87` puts the `impeccable-gate` marker on its own line; `pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts` — 14 passed.

### Task 7 — the modal-wait census (`60454587c`, conflict-resolved in the merge)

`gotoSection` navigates the crew route through a `url` variable, so the non-literal-goto census gained a candidate. `origin/main` bumped the same count for a different site the same day; the merge resolves to the UNION (19), not either side's 18.

Verification: `pnpm exec vitest run tests/ci/_metaModalWaitHelper.test.ts tests/ci/_metaModalWaitCandidateV2.test.ts` — 41 passed.

### Task 8 — route the fixture `shows` writes through the per-show lock (`d6602335c`)

`tests/e2e/helpers/lockedShowCopy.ts`, the `shows` sibling of `lockedCrewRestriction.ts`: one psql transaction per show, `begin` → `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` → the write → `returning id` → `commit`. The clone is generic over the column list (`to_jsonb(s) || overrides`, then `jsonb_populate_record`), so a column added to `shows` tomorrow is copied rather than silently dropped.

Verification: `pnpm exec vitest run tests/help/walker-routes.test.ts` — 7 passed. The file's frozen `EXEMPT_PREEXISTING` count went 7 → 0, so the row is REMOVED rather than shrunk, in the same commit, per the guard's shrink-only contract. **This is where ordering defect one is repaired and where defect two begins** (§1.1): the proof came a round later.

### Task 9 — prove the lock is held, and finish the call boundary (`95d69f052`)

`walker-routes` recognizes PostgREST mutation syntax and is green with the lock deleted (probed: `mutantWalkerHits: 0`, `lockPresentMutant: false`), so it cannot discharge invariant 2's "tests assert the lock is held". The transaction shape is exported and proved without a database in `tests/e2e/helpers/lockedShowCopy.unit.test.ts`, whose analyzer classifies statement ORDER rather than containment and carries four positive controls asserted RED: lock deleted, lock after the write, a commit between the two, a nested second acquisition.

Same commit closes invariant 9: both remaining calls take `{ data, error }` and USE the data.

Verification, both halves of §5's locked-helper budget: `pnpm exec vitest run tests/help/walker-routes.test.ts tests/e2e/helpers/lockedShowCopy.unit.test.ts`, plus the spec re-run — 4 passed.

### Task 10 — the executed-count floor (`9550de901`)

`app-e2e.yml` named the spec while `scripts/check-app-e2e-executed.mjs` had no `REQUIRED` row, so a runtime skip of all four cases would have left the job green having proved nothing. The floor is the spec's FULL executable set (4), not a floor of 1, per that table's contract.

Verification: `pnpm exec vitest run tests/cross-cutting/app-e2e-ci-wiring.test.ts tests/ci/appE2eAnnotationPrint.test.ts` — 8 passed. That wiring test, not the coverage meta-test, is what owns `REQUIRED` parity.

### Task 11 — derive the schedule placeholder copy from its owning component (`02ccedd03`)

`NO_DATES_COPY` was a transcribed literal, which makes the assertion "the page renders the string this test remembers": green after the component's copy changes, red on a copy edit that is not a defect. It is now extracted from `components/crew/sections/ScheduleSection.tsx` at test start, with a premise that throws by name if no `<EmptyState label="…"/>` is found. The contract becomes what the component DECLARES is what the page RENDERS.

Verification: the spec re-run under CI posture — 4 passed.

### Task 12 — rebuild the lock analyzer as a whitelist (`e33b76d78`, superseded by Task 15)

Spec review round 3 walked four unsafe transactions through the index-based analyzer. This replaced it with a statement whitelist and eight mutant controls. Round 4 then walked six MORE through the whitelist, which is what made Task 14 a redesign rather than a seventh pattern.

Same commit converted every interpolated replacement string in the proof to a replacer function, which `tests/cross-cutting/replacementString.test.ts` had flagged: `$1` inside an interpolated template is re-interpreted by `String.replace`.

Verification: `pnpm exec vitest run tests/e2e/helpers/lockedShowCopy.unit.test.ts tests/cross-cutting/replacementString.test.ts` — 54 passed. It did NOT re-run `walker-routes.test.ts`, which §5's budget requires of any change to the locked helper; Task 15 runs both.

### Task 13 — check that both cleanup layers removed rows (`86738ee32`, superseded by Task 15)

`deleteShowsLocked` read its `RETURNING id` output; the reservation cleanup compared a removed count against a derived total. **Both landed without a negative proof and with no verification recorded at all**, which §1.1 records as defect three. Task 15 gives the first a predicate with five negative cases and deletes the second.

### Task 14 — raise the lifecycle oracle floor (`2cd730dde`)

The tap-target spec gained a case and its executed floor did not, so `tests/cross-cutting/lifecycle-layout-e2e-ci-wiring.test.ts` failed exactly as designed: an oracle below the live count is calibrated to a partially dark run. 5 → 6.

Verification: `pnpm exec vitest run tests/cross-cutting/lifecycle-layout-e2e-ci-wiring.test.ts tests/cross-cutting/app-e2e-ci-wiring.test.ts` — 15 passed.

### Task 15 — replace the recognizer with an exact-SQL proof, and prove the joins (`5bd2001d4`)

Spec review round 4 found six more escapes in the whitelist (`where false` and `limit 0` run the lock zero times; `generate_series` and two calls in one select run it twice; a lock on another show's key; a delete broad enough to touch other shows). Widening again was the ratchet AGENTS.md tells arcs to refuse, so **the recognizer is gone**.

`copyShowLocked` and `deleteShowsLocked` now take an injectable executor. The proof drives the REAL functions, captures the SQL they emit, and compares it character-for-character with the text it declares. Every escape found so far, and every one not yet imagined, changes that text. It also closes the three production joins a hand-composed assertion never touched (plan review R2 F3): that the copy locks the NEW show rather than the template, that the delete locks each show it removes, and that `runLocked` forwards the key it was given.

Same task fixes the vacuous cleanup check (spec R4 F2): `psql -At` still prints the command status, so a zero-row delete returned the non-empty string `DELETE 0` and the check reported success. The executor gains `-q`, and `assertDeletedRows` is a pure predicate requiring an actual id line — with eight negative proofs, including `DELETE 0`, `DELETE 1`, a bare NOTICE and whitespace.

And the reservation cleanup is DELETED rather than proved: `hotel_reservations_show_id_fkey` and `show_share_tokens_show_id_fkey` are both `ON DELETE CASCADE`, so removing the show removes both. One cleanup signal, already proved, instead of three to keep right.

Verification, both halves of §5's locked-helper budget: `pnpm exec vitest run tests/help/walker-routes.test.ts tests/e2e/helpers/lockedShowCopy.unit.test.ts` — 23 passed (7 + 16); the spec re-run — 4 passed; plus a post-run `select count(*) from shows where drive_file_id like 'empty-state-spec:%'` returning 0, which is what confirms the cascade leaves no residue.

### Task 15b — stop the seam where the repo stops it

Diff review rounds 3, 4 and 5 walked the test seam down: `SqlExecutor`, a `Spawn` closure, then Node's own `execFileSync`. The last shape is the one `tests/cross-cutting/psqlStartupFileSuppression.test.ts` forbids — it requires psql to reach a literal `execFileSync` as a literal argv[0] so its scanner can read the flags, reports zero indirections tree-wide, and fails a new one by default. It went red on the branch, along with 15 sibling cases, which is how the collision surfaced.

The seam is back at `SqlExecutor`, which is what proves the SQL, the per-show keys and the caller joins. `psqlExecutor` is covered by the live e2e run instead, and the helper's header states what no unit test there proves. **This is the repo's boundary, not the arc's**, and recording that distinction is the point: the reviewer's direction was sound and a shipped guard rules it out.

Verification: `pnpm exec vitest run tests/e2e/helpers/lockedShowCopy.unit.test.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts` — 1063 passed; both halves of §5's locked-helper budget re-run.

### Task 16 — graduate both rows (LAST commit of the PR, not yet made)

Archive both entries with their measured outcomes, and remove both in-progress markers in the same commit, before the merge (invariant 12). A graduation also owes a `BACKLOG_GRADUATED` row in `tests/docs/_metaDeferralLedgerGraduation.test.ts:99`, one per id, each carrying `provenance: "fix/e2e-proof-retired-route-subpixel"`.

At the time of writing both entries are still `**Status:** IN PROGRESS` in `BACKLOG.md` and appear in neither the archive nor the registry, which is correct: this task is the PR's last commit by design.

Verification: `pnpm heavy pnpm exec vitest run tests/docs` — the graduation, in-progress and mint-bar meta-tests all green.

## 4. The product-code edit that was considered and declined

Category 2 locates the Power row by a `dt` whose text is exactly `Power`, scoped inside `section-venue`. A `testId: "venue-power"` on the fact row (`VenueSection.tsx:290`) would be marginally more robust, and the primitive that owns the row, `components/crew/primitives/FactRows.tsx:41`, already supports a per-row `data-testid` (`components/crew/primitives/FactRows.tsx:97`) — `venue-room`, `venue-wifi-ssid` and `venue-wifi-notes` use it. (An earlier draft credited `KeyValueRows`; `VenueSection.tsx:52` imports `FactRows` for these rows.)

Declined. It is a change under `components/`, so it arms invariant 8 and buys a full impeccable dual-gate cycle for a locator that is already scoped and non-tautological. Recorded here so the review does not read its absence as an oversight, and so a future need can add it knowing the cost.

## 5. Regression budget

Any fix round re-runs the affected task's own verification command, named in §3, not a narrower one. Two of those are easy to get wrong and are called out:

- A change to the barrier re-runs the **240-repeat whole-file sweep**, not the single case, because the defect it repairs is a RATE rather than an outcome.
- A change to the locked helper re-runs **both** `walker-routes.test.ts` and `lockedShowCopy.unit.test.ts`. The first alone is insufficient by measurement: it is green with the lock deleted.
- **A change to the tap-target spec's CASE COUNT re-runs `lifecycle-layout-e2e-ci-wiring.test.ts`**, which the 240-repeat sweep cannot substitute for. The sweep is the right instrument for a rate; it says nothing about an execution oracle calibrated below the live count, and that oracle is what stands between a runtime skip and a green job.
