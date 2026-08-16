# diagram-demote-notice — closeout

Unit: `docs/superpowers/plans/2026-08-15-diagram-demote-notice/`
Branch: `feat/diagram-demote-notice` · Spec: `docs/superpowers/specs/crew/2026-08-15-diagram-demote-notice-design.md`

## Shipped

| Task | What landed |
| --- | --- |
| C1 | `DEMOTE_CHIP_VISIBLE_MS = 6000` + the DESIGN.md §5.5 row in the same commit; the session-stamped `demotedNotice: { id, nonce }` state set in the branch that announces (a bare id at first — see the review section below); `relative` on the slide figure; the `aria-hidden`, `pointer-events-none` chip in the Reset chip's token family; four clear conditions; the `openNonce` counter in the parent gallery; 17 tests. |
| C3 | Merge, full gates, impeccable dual gate, ledger archive, cross-model diff review, CI, merge. |

## Step-0 probe (recorded, per the plan)

`scanTimingSites` classifies a module-level `const DEMOTE_CHIP_VISIBLE_MS = 6000` in a
`components/**` file as `named-constant` — the accepted form, so no rename was needed. The
`setTimeout(..., DEMOTE_CHIP_VISIBLE_MS)` call site reads as `unclassified` when a snippet is
scanned in isolation but resolves through the binding in a repo scan (`311 files, 31 rows, 0
unclassified`), which is what the inventory gate reads.

## Test evidence

- `tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` — 12 new cases (AC-1 containment +
  announce lockstep, AC-2 with the ratified 5999/1 literals and the constant asserted separately,
  timer-cancel oracles, AC-3 both non-demote paths, AC-4, last-wins restart, clear-4, swipe-return
  remaining lifetime, Reset coexistence, AC-6 full class contract).
- `tests/components/diagrams/gallery.failedItem.test.tsx` — 5 session cases through the REAL parent:
  all three close initiators, the exit-window repopulation block, and the positive re-entry ordering
  (the case that fails against an effect-timed reset).
- 17 cases in total, derived from the runner rather than counted by hand: `vitest -t "demote's sighted chip"` reports 12 and `-t "never survives a dialog session"` reports 5. Sixteen were observed RED before implementation; the seventeenth (the inactive-branch clear-4 route) was added in diff review round 5 and is mutation-killed.
- `tests/docs/_metaInteractionTimingInventory.test.ts` observed failing by name
  (`DEMOTE_CHIP_VISIBLE_MS = 6000` not listed) before the §5.5 row landed; green both directions in
  the same commit.

## Spec amendment: the close gate

Spec §2.1 specified a `closingRef` boolean cleared by the render-time nonce reset. That reset writes
a ref during render, which this repo's eslint `react-hooks/refs` rule rejects as an ERROR. Shipped
as a nonce comparison instead — `closedAtNonce` state set at the close initiators, gate is
`closedAtNonce !== openNonce` — which is the same gate, self-clearing on re-open, and still closes
the R4 F1 ordering window (case 9 pins it executably). Recorded as a dated amendment in the
canonical spec, not only here, because the spec is canonical (invariant 7).

## Transition audit (folded into C1 per the plan's C2 tombstone)

Post-implementation enumeration across `components/diagrams/`: exactly ONE `AnimatePresence`
(`Gallery.tsx:454`, the session-level open/close) and zero in the lightbox — matching the plan's
pre-draft probe. The chip's own conditional branch has NO exit-presence wrapper: a deliberate
instant unmount (spec §2.3), declared rather than defaulted. Every §2.3 row has an oracle: entry
(the AC-6 full class contract), swipe-return (remaining lifetime), close (all three initiators),
clamped-tier failure, last-wins restart, Reset coexistence.

## Cross-model diff review — what it changed in the SHIPPED code

R2 raised two HIGH findings against the session tests, and both were right in a way that reached the
implementation, not just the tests:

- **The exit-window case never exercised an exit-window demote.** It reused the demote helper, so the
  second error on that slide was the CLAMPED tier failing and landed in the placeholder branch — the
  gate under test was never asked anything, and deleting it would have left the case green. Rewritten
  to reach the exit window UNDEMOTED with zoom intent pinned, so the error there is a genuine first
  failure of the original (see the R3 note below — the rewrite reached the file only on the second
  attempt, and what finally proves the gate is the mid-exit assertion, not an announcement oracle).
- **The positive re-entry case did not pin render-time behavior.** Firing the error in a later
  `act()` flushes passive effects first, so an effect-timed reset passes too. Firing it in the SAME
  `act()` turned out to be unsatisfiable for any implementation — measured: the re-entry has not
  committed at that point (`presence.exiting` is still true), so suppression there is correct. The
  discriminating window needs a COMMITTED re-entry with passive effects still pending, which is what
  `flushSync` around the re-open produces; the case now asserts the commit as its premise and then
  fires.

R3 then found that the FIRST of those repairs had never reached the file: the edit script that
rewrote the exit-window case aborted on a later assertion and wrote nothing, so the same finding was
raised twice against an unchanged test while the commit message claimed it fixed. It is applied now,
with two additions the second attempt earned: the slide reaches the exit window UNDEMOTED, and the
case asserts the gate's OWN observable — no chip paints on the retained instance mid-exit, before any
re-open — because after a re-open the session stamp would hide a leaked notice anyway, so a
post-re-open assertion alone cannot tell a working gate from a deleted one. A buffered-announcement
oracle was drafted for this case and REMOVED rather than left as a claim: after a cancelled exit,
which channel carries a buffered message is the parent's routing decision, which spec §1.1 item 3
puts out of scope here, and `Gallery — a lightbox failure inside the exit window is not lost` already
covers that contract. Probed by mutation: replacing `closedAtNonce !== openNonce` with `true` reds this
case (1 failed / 40 passed), and the tree is restored.

Fixing the second case surfaced a real defect in the implementation and changed it. The chip state
was a bare id cleared by a render-phase adjustment against a `lastNonce` state value; in the same
batch as a re-entry, that adjustment could wipe a demote set moments earlier — the live-session
demote R4 F1 exists to protect. The notice is now STAMPED with the session it belongs to
(`{ id, nonce }`) and rendered only while `nonce === openNonce`, so a stale notice is ignored by
construction and no reset step exists to race. Fewer moving parts, and the render-time property is
now structural rather than procedural.

## Mutation probes on the clear conditions (diff review R5)

R5 asked whether the clear conditions' tests can actually see their own mechanisms. Four probes, run
against the shipped tree and reverted after each:

| Mutant | Result |
| --- | --- |
| `closedAtNonce !== openNonce` → `true` (delete the exit-window gate) | KILLED — the exit-window case reds (1 failed / 40 passed). |
| `clearDemoteNotice()` removed from `handleClose` | KILLED — all three close-initiator cases red (3 failed / 38 passed), because each now asserts chip absence MID-EXIT, before the re-open where the session stamp would mask it. |
| the inactive-branch clear removed | KILLED — the new "clamped tier fails while the slide is INACTIVE" case reds (1 failed / 35 passed). |
| the unmount-cleanup effect removed | **SURVIVES — accepted gap, recorded.** In this harness the teardown path drops the pending timer regardless, so no `vi.getTimerCount()` oracle can see the effect's absence. The effect stays as a defensive backstop; the case says plainly what it can and cannot settle rather than carrying an oracle that cannot discriminate. |

R5 also found the fourth clear condition covered on ONE of its two routes: a demoted slide swiped
INACTIVE can still have its clamped request fail on the inactive branch, where the render hid the
chip via `failedKeys` while the state and its timer survived — so a swipe back would have shown a
chip over the "Image unavailable" placeholder for the rest of the window. Both branches now clear,
and the new case covers the second route.

## §12 — impeccable dual gate (invariant 8)

Both halves ran on the implementation diff after the `origin/main` merge, with the canonical v3
setup gates (`context.mjs` PRODUCT.md + DESIGN.md load, then the product register read). Critique
ran two isolated sub-agents (not degraded). Browser visualization SKIPPED in both halves, reason
recorded: the machine was under a single-run e2e mutex and a second dev server would have collided
with a live capture. Detector: the only hits are pre-existing `broken-image` false positives on raw
`<img>` elements with dynamic loader `src`, none touching this diff.

| # | Tier | Finding | Disposition |
| --- | --- | --- | --- |
| A1 | P2 | Audit: `transition-discrete` on the chip is a no-op — that variant exists for discrete properties like `display`, and this chip toggles none. It advertises an exit treatment that cannot run, since React unmounts the node outright. | **FIXED in-branch.** Class removed; the comment now states that the fade is entry-only and that the instant unmount is the spec's deliberate choice. `starting:opacity-0` + `transition-opacity` still drive the mount ramp. |
| C1 | P3 | Critique: the Reset chip centers via a flex wrapper; the demote chip centers itself with `inset-x-0 mx-auto w-fit`. Same result, different technique between two chips of one visual family. | **Accepted, with the reason.** Reset needs the wrapper because a pointer-transparent overlay has to re-enable pointer events on the button inside it; this chip is non-interactive and needs no wrapper, so adding one would be ceremony that exists only to match a shape whose cause does not apply. |
| A2 | P3 | Audit: the render-phase nonce reset cleared chip state but not `demoteTimerRef`; the orphaned timer was superseded by the next demote's own `clearTimeout`. | **OVERTAKEN and moot.** The render-phase reset no longer exists — the notice is session-stamped and filtered at render (see the review section below), so there is nothing left to half-clear. The timer is still cleared at every event-handler and effect path, with an id-guarded callback as the backstop. |
| C2 | — | Critique: the code comment said "eleven characters" for a 23-character string (inherited from spec §4 limit 1). | **FIXED in-branch** in the comment and in BOTH spec sites — §2.1's rationale and §4 limit 1, the second of which the first repair missed and cross-model diff review R1 caught. |

P0: none. P1: none. P2: one, fixed in-branch. No `DEFERRED.md` entry is required because nothing at
P0/P1 was left undone. The marker below reads `dispositions=none` for that reason and not because the
table above is empty: the grammar's cross-check ties that field to the P0/P1 count specifically
(`tests/docs/_invariant8Closeout.ts`), so `recorded` with `p0=0 p1=0` is rejected as malformed. The
P2 and P3 dispositions are recorded in the table regardless.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none

## Impeccable re-runs on post-review UI deltas (plan C3.4)

Every review repair that touched a UI file got the pair again, scoped to that delta. Recorded here
because the plan requires the trail, not just the final verdict.

| Delta | Halves | Result |
| --- | --- | --- |
| The session-stamped `{ id, nonce }` state (R2 repair) | critique + audit, one scoped run | No findings either half. The audit hand-traced demote/close/re-open, demote/swipe, two demotes in one session, a timer firing after a re-open, and a demote in the exit window, and confirmed a stale notice can only ever be suppressed by the render stamp, never leaked. |
| The inactive-branch clear (R5 repair) | critique + audit, one scoped run | No findings either half. The audit confirmed the per-`map` guard cannot clear another slide's notice, that last-demote-wins still holds when an older slide fails late, and that no branch nulls the state while leaving the timer armed. One P3 noted and declined: the guard line is duplicated across the two branches, matching the file's existing `setFailedKeys` shape. |

Neither re-run changed the gate's headline: P0 none, P1 none.

## Review economy — the arc's own record, and where it stopped

Eight diff rounds, 16 findings (derived by summing `findingCount` over the verdict rows of
`docs/review-rounds/feat/diagram-demote-notice/ba676b08d1a4.jsonl`; the filing beside it carries the
analysis). Two rounds found something the code did wrong — R2's test-validity pair and R5's
clear-condition-4 gap on the inactive slide branch. R6, R7 and R8 each returned only record drift,
and each stated plainly that no admissible behavioral defect remained under the consequence bound,
probe domain, and threat-model fence.

**Stopped at R8 by an orchestrator re-scope**, per the AGENTS.md late-arc rule: past the round
threshold, a bookkeeping finding is not a reason for another round. R8's finding was arithmetic
inside the filing itself; it is repaired by DERIVING the total from the corpus instead of restating
it, and the class bullets no longer carry counts that can drift. No behavioral finding was left
open — the last three rounds say so in their own words.

## Documented limits carried forward

Spec §4 in full: the chip names no diagram and explains nothing further; a demote inside the exit
window may show no chip; the chip does not persist across dialog sessions; simultaneous demotes
collapse to the latest.
