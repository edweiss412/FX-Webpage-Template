# Plan: re-target the empty-state proof, settle the tap-target read

Spec: `docs/superpowers/specs/2026-08-25-e2e-proof-retired-route-subpixel-design.md`
Branch: `fix/e2e-proof-retired-route-subpixel`
Closes: `BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE`, `BL-TAP-TARGET-LAYOUT-SUBPIXEL-TOLERANCE`

impeccable-gate: N/A — no UI surface

The diff touches `tests/**`, `.github/workflows/**`, `playwright.config.ts` and `docs/**` only. No file under `app/` outside `app/api/**`, none under `components/`, no design token file, no `DESIGN.md`. Section 4 records the one place where a product-code edit was considered and declined.

## 1. Shape of the work

Eight tasks. Every task is test-first against a real browser, and every e2e command runs through `pnpm heavy` wrapping the outermost invocation. No task edits product code, so invariant 8 does not arm; invariants 1 (TDD) and 6 (one conventional commit per task) apply throughout.

The evidence each task rests on was gathered before the spec was written, because the alternative is a spec whose test section asserts oracles nobody ran. Four of the seven tasks exist only because a run disproved the obvious design: the identity the catalog's category 1 lives on, the viewer the route accepts, the cache that swallows a direct DB write, and the shape of "no dates" the shell survives. Each is recorded at its task.

## 2. Meta-test inventory

| Meta-test | Why it is in scope | Expected movement |
|---|---|---|
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | Task 5 wires the spec into `app-e2e.yml`; its shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:296`) then FORCES the `UNSEEN` row out | red between wiring and row removal, green after; that coupling is the point |
| `tests/e2e/_metaFontWaitCoverage.test.ts` | Task 6 adds documented limits to its header; `CALLERS` is deliberately NOT extended | unchanged and green — a row for a file this analyzer cannot see a navigation in would pass vacuously |
| `tests/docs/_metaLedgerInProgress.test.ts` | Task 0 marks both rows in progress; Task 7 removes the markers and archives | green throughout: markers name a branch that exists on origin until the last commit removes them |
| `tests/docs/_metaLedgerMintBar.test.ts` | This arc files NO new row, so nothing new is subject to the bar | unchanged |

No advisory-lock surface is touched, so no holder topology is declared.

## 3. Tasks

### Task 0 — ledger markers (done at Stage 0)

Both rows carry `**Status:** IN PROGRESS · **Branch:** fix/e2e-proof-retired-route-subpixel`, committed and pushed so the claim is visible to other sessions (invariant 12). `pnpm ledger:claims --check` reported no collision before the marker was written.

Commit: `docs(ledger): mark ... in progress` (already on the branch).

### Task 1 — rewrite `empty-state-reachability.spec.ts` against live identities

Test-first by construction: the deliverable IS the test, and the "before" state is four cases failing at `toBeVisible` on testids no product file defines.

Per-test show copies (spec §6.1), `ADMIN_FIXTURE` (spec §6.2), the four categories re-expressed (spec §6.3), the four `toHaveScreenshot` calls and their four `-darwin.png` baselines deleted (spec §6.4).

**Verification, and the runs that shaped it.** Six runs, each `CI=1 BASELINE_SERVER_ONLY=1 ... --project=mobile-safari --retries=0` under `pnpm heavy`:

| Run | Outcome | What it forced |
|---|---|---|
| 1 | 4 failed at `crew-shell` | the crew identity bounces through `/api/auth/picker-bootstrap`; WebKit will not store the `__Host-` picker cookie over http. Switch to `ADMIN_FIXTURE`. |
| 2 | 4 failed on the contracts | direct DB writes never reach the render: `cachedShowData` is tagged per show with `revalidate: 300`. Switch to per-test show copies. |
| 3 | 4 failed inserting a share token | `show_share_tokens` is minted by the DB on show insert. Read the minted token. |
| 4 | 2 passed, 2 failed | `dates: {}` breaks the shell above the section's try/catch; a fresh `last_checked_at` still renders a subtle-tier footer. |
| 5 | 3 passed, 1 failed | `showDays: []` alone leaves travel/set/strike day cards. Empty the four fields `aggregateDays` reads. |
| 6 | **4 passed (28.6s)** | green |

Commit: `test(crew-page): re-target the §8.3 empty-state proof onto the redesigned CrewShell`

### Task 2 — the tap-target barrier premise test (RED)

Add `premise + barrier — openStep3Modal returns only after the entrance settles` to `tests/e2e/tap-target-inline-controls.layout.spec.ts`. It asserts a live premise (the panel DECLARES an entrance animation at this viewport, so the guard cannot outlive the thing it guards) and then the barrier (nothing under the panel is still running when the helper hands the page back).

**Verified RED before the fix, 6 repeats, 6 failures**, each naming `step3-details-sheet-rise` and reporting three running animations. That is the mechanism in §3.3 observed directly rather than inferred.

Commit: `test(admin): assert openStep3Modal returns only after the panel entrance settles`

### Task 3 — the barrier (GREEN)

`settleReviewPanelEntrance` in `tests/e2e/helpers/devCaptureStaged.ts`, called between `waitForSelector` and the helper's `return`. Awaits `getAnimations({subtree:true})` `.finished` on the panel with a 5s loud-failure ceiling, then `document.fonts.ready`.

Placed on the helper, not the call sites, so every caller inherits it (spec §4.1). No tolerance in any assertion changes.

**Verification: the whole file at `--repeat-each=40`, `--retries=0`** — 6 cases, 240 runs, zero failures required. The pre-fix rate on the sites 6/7 case alone was 1 in 20 and 3 in 39.

Commit: `fix(admin): settle the step-3 panel entrance before any measurement`

### Task 3b — route the fixture `shows` writes through the per-show advisory lock

Invariant 2 covers e2e fixture writes, and `tests/help/walker-routes.test.ts` enforces it: no file under `tests/e2e/` may reach a locked table through the service-role PostgREST client. The rewrite's show copy and its cleanup are `shows` DML, so they move into `tests/e2e/helpers/lockedShowCopy.ts`, the `shows` sibling of `lockedCrewRestriction.ts`: one psql transaction per show, `begin` → `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` → the write → `returning id` → `commit`.

Single-holder rule: that transaction is the only lock holder on this path. No JS wrapper and no RPC wraps the call, so nothing nests.

The clone is generic over the column list (`to_jsonb(s) || overrides` then `jsonb_populate_record`), so a column added to `shows` tomorrow is copied without touching the helper — an enumerated INSERT would silently start dropping it.

Verification: `pnpm exec vitest run tests/help/walker-routes.test.ts`. The file's frozen `EXEMPT_PREEXISTING` count went 7 → 0, so the exemption row is REMOVED rather than shrunk, in the same commit, per the guard's shrink-only contract.

Commit: `test(crew-page): route the empty-state fixture show writes through the per-show lock`

### Task 4 — delete the dead layout helper

The e2e layout helper had no importers anywhere in the repo and all three of its exports were unreferenced; two encoded retired identities (`tile-grid`, and `/show/${slug}?crew=${crewId}`). Deleted whole (spec §7.1).

Verification: a repo-wide search for that helper path returned only the file's own header before deletion and nothing after; `pnpm typecheck` clean.

Commit: `test(crew-page): delete the unreferenced layout helper and its retired identities`

### Task 5 — wire the spec, and let the meta-test force the allowlist row out

Add the spec to `app-e2e.yml`'s run-step file list; remove `empty-state-reachability` from the desktop-chromium `testMatch` (spec §6.5); remove the `UNSEEN` row.

Verification: `pnpm heavy pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` green. The ordering is load-bearing and is asserted by the run, not by intent: with the wiring but not the row removal the shadowing assertion fails, which is what makes the two impossible to drift apart.

Commit: `ci(e2e): wire the empty-state reachability proof into app-e2e`

### Task 6 — record the two documented limits

The `lifecycle-layout-e2e.yml` header gets the corrected dark-on-`main` mechanism, the decision not to add `push:`, and a re-file trigger (spec §5). The `_metaFontWaitCoverage.test.ts` header gets the analyzer's single-file blind spot and the enumerated `CALLERS` limit, both with their probe numbers and a re-file trigger (spec §7.3).

Neither files a ledger row, per Eric's directive of 2026-08-25.

Verification: `pnpm heavy pnpm vitest run tests/e2e/_metaFontWaitCoverage.test.ts` green; `actionlint`/`yaml` parse via the workflow-coverage meta-test, which loads every workflow.

Commit: `docs(ci): record the dark-on-main and font-wait guard limits on their owning surfaces`

### Task 7 — graduate both rows (LAST commit of the PR)

Archive both entries with their measured outcomes, and remove both in-progress markers in the same commit, before the merge (invariant 12).

Commit: `docs(ledger): graduate the empty-state proof and tap-target flake rows`

## 4. The product-code edit that was considered and declined

Category 2 locates the Power row by a `dt` whose text is exactly `Power`, scoped inside `section-venue`. A `testId: "venue-power"` on the fact row (`VenueSection.tsx:290`) would be marginally more robust, and `KeyValueRows` already supports per-row test ids — `venue-room`, `venue-wifi-ssid` and `venue-wifi-notes` use them.

Declined. It is a change under `components/`, so it arms invariant 8 and buys a full impeccable dual-gate cycle for a locator that is already scoped and non-tautological. Recorded here so the review does not read its absence as an oversight, and so a future need can add it knowing the cost.

## 5. Regression budget

Any fix round re-runs the affected task's own verification command, not a narrower one. Specifically: a change to the barrier re-runs the 240-repeat sweep, not the single case, because the defect it repairs is a rate rather than an outcome.
