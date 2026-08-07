# Arc C — quick wins (capability-loss false positive, freshness aborted-close e2e)

**Date:** 2026-08-06 · **Authoring branch:** `docs/arc-c-spec` · **Implementation branch:** `feat/backlog-quick-wins` · **Status:** DRAFT

## §0 Why this arc exists, and its scope

Two S-tier READY entries, both probe-backed, both lib+tests only: a false operator alert whose failing case is already pinned and waiting, and an e2e hole whose structural twin explicitly disclaims behavioural coverage. One implementation branch, no UI surface. Scope brief of record: the arc C scope brief in the session briefs directory (outside the repo; its ratified decisions are restated in full in §1.1, the in-repo capture of record); batch topology: the ABC authoring kickoff brief beside it.

Claimed entries (invariant 12, marked on `docs/arc-c-spec`, handed off to `feat/backlog-quick-wins` per §3):

1. `BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE` (BACKLOG.md, re-sized M→S by probe) — restore the `retainRows` symmetry at the source; archive.
2. `BL-FRESHNESS-ABORTED-CLOSE-E2E` (BACKLOG.md, S) — one Playwright case, observed RED against a mutant before its green is trusted; archive.

## §1.1 Resolved scope — do not relitigate

All ratified 2026-08-06 by the user (the arc C scope brief) unless another source is cited.

1. **Fix at the source; do NOT loosen arm (c) of `capabilityRoleChangesForNotice`** (`lib/sync/phase2.ts`, arm (c) loop). The entry's own Work section: "Restore the symmetry at the source rather than loosening arm (c). The tombstone row above is the counterweight." Any fix that silences the `crew_identity` tombstone's REAL loss is wrong.
2. **The e2e case MUST be observed failing before its green is trusted** — driven against a temporary revert/mutant of the clear-on-hide branch in `PublishedReviewModal`. The entry's own words: an e2e case pushed without ever being seen red is worse than no case.
3. **jsdom cannot drive the aborted close** — refuted in the entry (S19's two verified failure modes: the animated exit never completes in jsdom, and the self-heal un-hides during the very render that hid the surface). Do not re-attempt S19-style wiring.
4. **BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS is out of scope** — its own text is a decided terminal state; do not touch it.
5. **Autonomy: both user review gates WAIVED** (user grant 2026-08-06, kickoff brief). Stop only for a genuinely NEW question.
6. **All AGENTS.md invariants bind**; `impeccable-gate: N/A — no UI surface` (lib + tests only).

## §2 Per-entry contracts

Entry bodies in BACKLOG.md are the spec-of-record for evidence; this section states what the arc ADDS. Every code claim was grep-verified 2026-08-06 (read-only citation pass over the live tree at `a0e41551c`); anchors are file + symbol — line numbers are drafting-time locators.

### §2.1 BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE — restore the retainRows symmetry

**The defect, precisely.** The probe suite spans four hold shapes across two code paths: `mi11_pending` holds are processed in their own pass (retains at locators :287, :308, :324), and `applyUndoOverrideToMaps` (`lib/sync/holds/holdAwareApply.ts`) handles the `undo_override` shapes. Of the retaining branches, the `crew_identity` held-present restore calls `maps.protectedNames.add(hold.entity_key)` AND `maps.retainRows.set(hold.entity_key, rowFromHeldValue(held))` (locator :447-449). The `crew_email` branch (:432-440) adds `protectedNames` + `pinnedIdentity` and returns WITHOUT `retainRows.set`. Consequence chain: only `retainRows` reaches the applied crew list — `holdAwareApply` merges retained rows into `plan.crewMembers` (:389-397), `applyParseResult.ts` takes `crewMembers = plan.crewMembers` (:170) and `appliedCrewMembers = crewMembers` (:189), while `protectedNames` reaches only the delete-keep list (:171, :178). So a row protected via the `crew_email` shape survives the apply yet is absent from `appliedCrewMembers`; `capabilityRoleChangesForNotice` arm (c) (`lib/sync/phase2.ts`, loop over `previousCrewMembers` against `nextByName`, :347-356) then reports a live LEAD as having lost LEAD access — a false operator alert. The corroborating comment is already in the tree (`applyParseResult.ts` :130-133: "a surviving protected row is absent from appliedCrewMembers").

**The fix.** The `crew_email` branch gains the same retain the `crew_identity` restore branch has: `maps.retainRows.set(hold.entity_key, rowFromHeldValue(held))` (exact expression pinned at plan time against the branch's locals — the held value is in scope as `held`). Nothing else changes: arm (c) untouched (§1.1 item 1), `protectedNames`/`pinnedIdentity` behavior untouched, tombstone branch untouched.

**TDD contract (the probe suite is the RED).** `tests/sync/capabilityLossReachability.probe.test.ts` pins all FOUR hold shapes at current behaviour:

| Shape | Pinned today | After fix |
|---|---|---|
| `mi11_pending`/`crew_email` | survived yes, reported no (correct) | unchanged |
| `undo_override`/`crew_email` | survived yes, **reported yes — FALSE LOSS** (the failing case in waiting) | reported **no** |
| `undo_override`/`crew_identity` restore | survived yes, reported no (correct) | unchanged |
| `undo_override`/`crew_identity` tombstone | survived no, reported yes (REAL loss) | unchanged — **must stay reported** |

Step 1 flips the false-loss pin to the correct expectation (`reported: false`) and observes it FAIL against the unfixed tree — that failing run is the executable RED. Step 2 applies the one-line retain. Step 3: all four rows green; the tombstone row still asserting `reported: true` is the counterweight proving the fix did not overreach (its own comment: "any fix that suppresses arm (c) more aggressively must keep THIS one firing").

**Guard conditions.** The fix adds a map entry keyed by `hold.entity_key` on a branch that already dereferences `held`; no new null path (the branch's existing guards are unchanged). The retain-merge loop already skips names present in the parse (`if (seen.has(name)) continue`), so a roster that independently re-lists the member is unaffected — the retain only fills the absence that caused the false loss.

**Archive.** Entry archives (archive RED per the plan's global constraint) with the probe table updated to post-fix behaviour and the M→S resize + reachability history preserved.

### §2.2 BL-FRESHNESS-ABORTED-CLOSE-E2E — the aborted-close behavioural case

**What the case proves.** `PublishedReviewModal`'s clear-on-hide branch (locator :509-523; written over VISIBILITY, not cause: "a COMMITTED close unmounts this instance, but an ABORTED one does not") clears armed freshness state (`setArmed(EMPTY_ARMED)`, `setAnnounced(null)`, `setBandFresh(null)`, baseline reset) when `closing` goes true with state armed. Without it, a live cue survives the hide and resumes on reopen with whatever remained of its 1600ms timer (`SECTION_FRESHNESS_FLASH_MS = 1600`, `components/admin/review/sectionFreshness.ts`, keyframes `app/globals.css`). No test under `tests/e2e` currently combines an aborted close with `data-section-freshness-flash` (entry's round-3 probe; S19 in `tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx` asserts wiring only and its stale coverage claim was removed).

**The case (one Playwright case, on the ratified harness).** `tests/e2e/published-review-modal.realtime.spec.ts` (project `desktop-chromium`, gate `MODAL_REALTIME_E2E === "1"`, CI `.github/workflows/published-modal-e2e.yml`): arm a freshness cue exactly as the existing scenario does (realtime stimulus; the file's `MutationObserver` on `attributeFilter: ["data-section-freshness-flash"]` install-before-stimulus pattern), begin the modal close, abort it inside the 1600ms flash window, and on the un-hidden modal assert NO element carries `data-section-freshness-flash`. The abort drive reuses the shipped race pattern from `tests/e2e/published-review-modal.reopen.spec.ts` (locator :111-141: scrim click, mid-transition probe, same-row re-click before the `router.push` commits — the self-heal `setClosing(false)` path, `PublishedReviewModal` locator :248-250).

**Observed-RED protocol (ratified, §1.1 item 2).** Before the case's green is trusted: temporarily neuter the clear-on-hide branch in the local working tree (comment out the `closing` arm of the visibility effect), run the case, observe it FAIL (a card still carries the flash attribute on reopen), restore the branch, observe it PASS. The mutant is never committed; the task record (commit message + PR body) states both observations with their run output. This satisfies the anti-tautology rule's demand for a stated concrete failure mode: the case fails exactly when an aborted close stops clearing armed cues.

**Timing realism (plan-time verification obligations, not open questions).** The plan pins, by probe against the live harness before the case is written: (a) whether the existing scenario context's `reducedMotion: "reduce"` emulation collapses the close transition (the abort must land while `closing` is still true — the reopen spec's drive proves the race is driveable; the plan confirms under WHICH media emulation and mirrors it); (b) the arm-to-abort ordering (the cue must be armed BEFORE the close begins, within the 1600ms window when the abort lands — bounded waits per the file's existing timeout constants, never bare sleeps); (c) whether the new case lives as a second `test` in the existing `describe` (sharing `settleDashboardAdminState` and seeding) or inside the existing scenario runner — both compliant, plan picks one against the file's retry structure.

**Guard conditions.** The case runs only under the `MODAL_REALTIME_E2E` gate like its siblings (dev server + seeded DB + browsers); it changes no product code (the clear-on-hide branch already ships — the entry is a test-coverage hole, and the case's only product-affecting outcome is catching a future regression of that branch).

**Archive.** Entry archives with the observed-RED record cross-referenced.

### Transition Inventory

No new or changed visual state ships: §2.1 is a sync-plan data fix (the notice list gets one fewer false row); §2.2 is a test-only addition exercising transitions that already ship (`PublishedReviewModal`'s close/abort/self-heal and the freshness flash, both already inventoried by their own specs). No `AnimatePresence`, no exit/initial/animate props, no conditional render changes.

### Dimensional Invariants

None: no fixed-dimension parent, no rendered component changes, no layout of any kind. If implementation contradicts this, the writing-plans layout-dimensions rule fires and this section gains the relationship.

## §3 Sequencing + claim-handoff protocol

Identical protocol to arc A (handoff-by-overlap, the L-wave §3 pattern — `docs/superpowers/specs/2026-08-06-l-wave-design.md` §3):

1. `docs/arc-c-spec` (this branch) claims both entries (Stage 0 commit, pushed 2026-08-06).
2. BEFORE this branch's PR merges: worktree + branch `feat/backlog-quick-wins` off `origin/main`; from the main checkout `pnpm ledger:claims --check` for the two ids must exit 1 naming `docs/arc-c-spec` ONLY; the implementation branch marks both `**Status:** IN PROGRESS · **Branch:** feat/backlog-quick-wins`, commits, pushes.
3. THEN this branch's last pre-merge commit removes its two markers. No undeclared instant on origin.
4. This branch's PR merges first (docs-only, preflight skip declared). The Opus implementer executes from the HANDOFF doc in this arc's plan directory, AFTER finishing arc A (kickoff sequencing: one Opus pane, arcs A → C → B, unit-transition protocol between arcs).
5. Ledger contention: sibling arcs A/B and the L-wave units edit the same ledgers; claims id-disjoint; merge `origin/main` before PR and before merge, resolving per-entry, both sides preserved.

## §4 Documented limits (this arc's own)

1. **The false-loss fix covers the `undo_override`/`crew_email` shape only** — the one shape the 2026-08-04 probe found reachable. The other three shapes are pinned correct and stay pinned; a new hold shape added later must add its own probe row (the probe file's header is the inventory).
2. **The aborted-close case drives one abort path** (the reopen-click supersession race). Other hypothetical abort vectors (e.g. a navigation race variant) are out of scope; the clear-on-hide branch is visibility-keyed, so any abort that leaves the instance mounted flows through the same branch the case exercises.
3. **The observed-RED mutant is ephemeral by design** — it is a verification protocol, not a committed fixture. The permanent regression guard is the case itself plus the record of the observation.

## §5 Meta-test / registry inventory (pre-declared for the plan)

- **EXTENDS:** `tests/sync/capabilityLossReachability.probe.test.ts` (the false-loss pin flips to the fixed expectation; the other three rows unchanged); `tests/e2e/published-review-modal.realtime.spec.ts` (one new case). No new test file, so no testMatch or workflow change (`published-modal-e2e.yml` already runs the realtime spec; `desktop-chromium` testMatch already matches it).
- **CREATES:** nothing structural.
- **Registries:** invariant-9 — no new Supabase call site (the fix is in pure plan-building code; the e2e case calls existing helpers). Invariant-10 — no new mutation surface. Advisory locks — untouched (`holdAwareApply` runs inside the existing sync path's lock; no new holder). §12.4 — untouched (the false alert's copy already flows through existing notice rendering; removing a false row adds no code).

## §6 Acceptance criteria

- **AC-C1:** the probe suite's four rows all green with the false-loss row asserting `reported: false`, the tombstone row still asserting `reported: true`, and the RED (flipped pin failing against the unfixed tree) recorded; the fix is the single retain line plus any exact-expression adjustment the branch's locals require; arm (c) unmodified.
- **AC-C2:** the new e2e case green under `MODAL_REALTIME_E2E=1` on `desktop-chromium`, with the observed-RED-against-mutant and restored-green observations recorded in the task record; no element carries `data-section-freshness-flash` after the aborted close + reopen.
- **AC-C3 (process):** claim handoff per §3 with no undeclared instant; TDD per task; conventional commits; cross-model diff review APPROVE (round cap 4); real CI green (including `published-modal-e2e.yml` on the touched-path trigger) before merge; main ff'd to `0 0`; both entries archived; `impeccable-gate: N/A — no UI surface` marker in the closeout.

## §7 Impeccable gate

impeccable-gate: N/A — no UI surface (lib + tests only; if implementation unexpectedly touches an invariant-8 surface, the gate flips to the dual gate before merge)
