# Arc C implementation plan — quick wins

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point, reached after arc A completes). The spec is `docs/superpowers/specs/2026-08-06-arc-c-quick-wins.md`; this plan carries its own adversarial-review gate below.

**Goal:** land both entry dispositions — the `retainRows` symmetry fix with its four-shape probe suite flipped-and-green, and the aborted-close freshness e2e case observed RED before trusted — on one implementation branch to a merged PR.

**Architecture:** `docs/arc-c-spec` (this branch: spec + plan + HANDOFF + claim handoff) merges first; then `feat/backlog-quick-wins` (worktree `../FX-worktrees/backlog-quick-wins`, created off `origin/main` with claims pushed BEFORE this branch merges, per spec §3) implements Q1–Q3 in order.

**Date:** 2026-08-06 · **Spec:** `docs/superpowers/specs/2026-08-06-arc-c-quick-wins.md` · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants this arc exercises: 1 (TDD), 6 (conventional commits), 11 (worktree-only), 12 (claims). No UI surface: `impeccable-gate: N/A — no UI surface` (spec §7); if implementation contradicts this, the gate flips before merge.
- The archive RED, used by both archive steps: move the entry body to `BACKLOG-archive.md` WITH its flight marker intact, run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`, observe the named failure, strip the marker, rerun to GREEN.
- The worktree runs `pnpm install && pnpm worktree:link-env && pnpm preflight` before any test (the branch runs unit suites AND a gated e2e — the docs-only preflight exemption is NOT invoked).

## Pre-draft verification pass (writing-plans rule)

Grep-verified 2026-08-06 (read-only citation pass over the tree at `a0e41551c`); anchors file + symbol, line numbers drafting-time locators.

- `applyUndoOverrideToMaps` (`lib/sync/holds/holdAwareApply.ts`, signature :418-431): `crew_email` branch :432-440 adds `maps.protectedNames.add(hold.entity_key)` + `maps.pinnedIdentity.set(hold.entity_key, {name, email})`, returns with NO `retainRows.set`; sibling `crew_identity` restore :447-449 does `maps.protectedNames.add(hold.entity_key); maps.retainRows.set(hold.entity_key, rowFromHeldValue(held));`; `held` is in scope in the `crew_email` branch (it dereferences the held value for `pinnedIdentity`). Retain-merge loop :389-397 (`for (const [name,row] of retainRows) { if (seen.has(name)) continue; … }`) feeds `plan.crewMembers` :409.
- `applyParseResult.ts`: `crewMembers = plan.crewMembers` :170; `deleteProtectedNames = [...plan.protectedNames]` :171; `deleteKeepNames` :178; `appliedCrewMembers = crewMembers` :189 (comment :130-133 pins the asymmetry consequence).
- `capabilityRoleChangesForNotice` (`lib/sync/phase2.ts` :271): arm (c) loop :347-356 over `previousCrewMembers` vs `nextByName` (:306); call site :613-616 diffs `snapshot.previousCrewMembers` against `applyOutcome.appliedCrewMembers`.
- `tests/sync/capabilityLossReachability.probe.test.ts` (302 lines, describe :221): the false-loss pin :244-263 asserts `{ label: "undo_override/crew_email", survived: true, reported: true, reportedFlags: LEAD }` with the comment "pinned at CURRENT behaviour so a future fix has a failing case waiting for it"; the tombstone counterweight :283-301 asserts `{ survived: false, reported: true, reportedFlags: LEAD }` with "any fix that suppresses arm (c) more aggressively must keep THIS one firing"; the other two rows :222 (mi11_pending) and :266 (restore) pin `reported: false`.
- `PublishedReviewModal` (`components/admin/showpage/PublishedReviewModal.tsx`): clear-on-hide branch :509-523 (`if (closing && (armed.size > 0 || announced !== null || seen.baseline)) { setArmed(EMPTY_ARMED); … }`), arming gate `!isBaseline && !closing` :531, self-heal `if (closing && !closePending && committedShow === slug) setClosing(false);` :248-250, shell visibility `open={!closing}` :885, band attribute :1129.
- Realtime e2e harness (`tests/e2e/published-review-modal.realtime.spec.ts`, 655 lines): gate `test.skip(process.env.MODAL_REALTIME_E2E !== "1", …)` :61-64; single `describe` :636 with `settleDashboardAdminState()` before/after :637-642 and ONE `test` :644 (240s timeout) running `runScenario(browser)` with a bounded flake retry; context `reducedMotion: "reduce"` :137; freshness observation = `MutationObserver` with `attributeFilter: ["data-section-freshness-flash"]` installed before the stimulus :357-384, teardown :541-545; `SECTION_FRESHNESS_FLASH_MS = 1600` (`components/admin/review/sectionFreshness.ts` :108; keyframes `app/globals.css` :1077-1090).
- Abort-drive precedent: `tests/e2e/published-review-modal.reopen.spec.ts` :111-141 — scrim click :128, mid-transition href probe :135-138, same-row re-click :141.
- Wiring: project `desktop-chromium` (`playwright.config.ts` :79) whose testMatch regex names the realtime modal spec (the alternation includes a published-review-modal realtime arm); CI `.github/workflows/published-modal-e2e.yml` (env `MODAL_REALTIME_E2E: "1"` :111, run step :149 lists the modal specs). No new test file anywhere in this plan — no testMatch or workflow change.

## Meta-test inventory (declared per writing-plans rule)

- **EXTENDS:** `tests/sync/capabilityLossReachability.probe.test.ts` (one pin flipped); `tests/e2e/published-review-modal.realtime.spec.ts` (one case added).
- **CREATES:** nothing structural.
- **Registries:** invariant-9 — no new Supabase call site (Q1 is pure plan-building code; Q2's helpers exist). Invariant-10 — no new mutation surface. Advisory locks — untouched (no new holder; `holdAwareApply` runs inside the existing sync path's lock topology). §12.4 — untouched.

## Unit tasks — `feat/backlog-quick-wins`

### Task Q1 — retainRows symmetry (spec §2.1)

1. **RED:** flip the false-loss pin at `tests/sync/capabilityLossReachability.probe.test.ts` :258-263 to the correct expectation — `reported: false`, `reportedFlags` expectation updated to match (exact literal pinned against the row's `Outcome` type at execution) — AND add the staleness assertion (spec §2.1 / R2): after the apply, `readCrew` (:203) shows the live row's non-identity fields intact (the testkit's seeded row deliberately diverges from `heldRow`'s `phone: "555-OLD"`, :144-153 vs :180-181), so a frozen-snapshot retain fails by name. Run `pnpm vitest run tests/sync/capabilityLossReachability.probe.test.ts` — observe the flipped row FAIL against the unfixed tree (the executable RED), the other three rows still green.
2. **GREEN (live-row retain, spec §2.1 corrected mechanics):** extend `HoldAwareApplyArgs` with optional `previousCrewMembers` (rows, not just names — plumbed from `snapshot.previousCrewMembers` at the sole call site, `applyParseResult.ts` :161-170); in the `crew_email` branch, retain the MATCHING live row (`maps.retainRows.set(hold.entity_key, <row from previousCrewMembers>)`; no match → no retain, today's behavior). Never `rowFromHeldValue(held)` here — the R2 mutant probe reverted six live fields through the full-column upsert (`runScheduledCronSync.ts` :1653-1685). Arm (c) untouched; tombstone untouched. Rerun: all four rows + staleness assertion green — the tombstone row still asserting `reported: true` is the overreach counterweight. Run the wider sync suites (`pnpm vitest run tests/sync/`); any pin of the old notice output updates in this commit with its reason (class-sweep at round 0). Commit `fix(sync): retain the live surviving crew_email hold row so a live LEAD is not reported as a capability loss`.
3. **File the class-sweep sibling** (spec §2.1, deferral exception (a)): new BACKLOG entry `BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE` (S) — the mi11 genuine-removal fallback (`holdAwareApply.ts` :324) retains the frozen snapshot while a live row survives, same stale-overwrite shape, shipping today; cites the R2 mutant probe and the :394-397 rename-fold contrast; the design ruling (defect vs intended hold semantics, given WM-F6 :308 deliberately prefers held values) is the entry's first step. `pnpm vitest run tests/docs/` green. Commit `docs(backlog): file BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE — the fallback retain's stale-overwrite shape, probed`.
4. Archive the entry (archive RED) with the probe table updated to post-fix behaviour and the M→S resize + reachability history preserved. Commit `docs(backlog): archive BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE — live-row retain restores the survivor signal`.

### Task Q2 — aborted-close freshness e2e (spec §2.2)

1. **Plan-fixed probes, run at execution before writing the case** (each answer recorded in the task record; all outcomes compliant, none is an ambiguity): (a) confirm the reopen spec's drive works under the realtime spec's `reducedMotion: "reduce"` context (grep `emulateMedia` in `published-review-modal.reopen.spec.ts`; if it runs without reduce, first verify the abort race is still driveable under reduce — the self-heal is state-keyed (`closing`/`closePending`/`committedShow`), not animation-keyed, so the expectation is yes; if the close commits too fast under reduce to abort, the new case creates its own context without the reduce emulation, mirroring the reopen spec); (b) decide placement — a second `test` in the existing `describe` (sharing `settleDashboardAdminState`) vs a step inside `runScenario` — against the file's retry structure; a second `test` with its own seeded show is the default (keeps the flake-retry scenario untouched).
2. **RED (mutant protocol, spec §1.1 item 2):** write the case — seed + sign in + open the modal per the file's pattern; install the `MutationObserver` freshness recorder; fire the realtime stimulus and wait for the armed cue (bounded by the file's timeout constants); begin the close (scrim click) and abort inside the 1600ms window (same-row re-click per the reopen-spec pattern); after the self-heal un-hides the modal, assert NO element carries `data-section-freshness-flash` (page-wide attribute query). Then temporarily neuter the clear-on-hide branch (`components/admin/showpage/PublishedReviewModal.tsx` :509-523, comment out the `closing` arm) in the local tree, run the case, observe FAIL (attribute present on reopen); restore the branch, run, observe PASS. Record both run outputs in the task record. Concrete failure mode caught: a regression of the clear-on-hide branch lets an armed cue survive an aborted close and resume its timer on reopen.
3. Commit `test(admin): pin that an aborted modal close clears armed freshness cues (observed red against a clear-on-hide mutant)`.
4. Archive the entry (archive RED) cross-referencing the observed-RED record. Commit `docs(backlog): archive BL-FRESHNESS-ABORTED-CLOSE-E2E — behavioural case landed, seen red first`.

### Task Q3 — close the branch

1. Whole-diff codex-guard review `--stage diff` to APPROVE (round cap 4; REVIEWER ONLY; CONSEQUENCE BOUND / THREAT MODEL FENCE with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; spec §1.1 do-not-relitigate list).
2. Merge `origin/main` (ledger contention: sibling arcs + L-wave units; per-entry resolution, both sides preserved); strip any surviving marker in the last pre-merge commit (both entries archive in Q1/Q2, shedding markers in their moves — terminal check: `grep -c 'Branch:\*\* feat/backlog-quick-wins' BACKLOG.md DEFERRED.md` returns 0). PR (body notes preflight ran and links the observed-RED record); real CI green including `published-modal-e2e.yml`; `gh pr merge --merge` same turn; ff main `0 0`.

## Adversarial review (cross-model)

- This plan: self-review (checklist below) → codex-guard `--stage plan --round <n>` to APPROVE before the HANDOFF is finalized.
- Implementation branch: whole-diff `--stage diff` review per Q3.

## Execution handoff

Per spec §3: the impl worktree + branch + claims land BEFORE this branch's PR merges (handoff-by-overlap; `pnpm ledger:claims --check` from the main checkout must name `docs/arc-c-spec` only); this branch strips its two markers in its last pre-merge commit; the Opus pane executes Q1–Q3 from `HANDOFF.md` in this directory after arc A completes (kickoff sequencing), with the arc-transition protocol (fresh marker, register-then-delete nudge, labels) at the boundary.

## Impeccable gate (this authoring branch)

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped (pre-draft pass above; re-verify any task edited during review rounds).
- [ ] Anti-tautology: Q1's RED is the flipped pin failing against the unfixed tree (not a new assertion that passes vacuously); the tombstone counterweight stays asserting `reported: true`; Q2's case is observed failing against the mutant before its green is trusted.
- [ ] No new test file — both cases land in wired suites (verified above).
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-06-arc-c-quick-wins/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round (counts: 4 probe rows, 1 flipped pin, 1600ms window, 2 entries).
