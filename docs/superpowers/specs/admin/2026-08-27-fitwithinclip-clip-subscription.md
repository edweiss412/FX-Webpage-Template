# `useFitWithinClip` resubscribes its observed ancestors on every signal

**Date:** 2026-08-27 · **Branch:** `fix/fitwithinclip-stale-clip-subscription` · **Row:** `BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION` (`BACKLOG.md`) · **Surface:** `components/admin/useFitWithinClip.ts`

## 1. The defect

`useFitWithinClip` resolves its two observed ancestors once, at ATTACH, and wires the `ResizeObserver` from that one resolution (`components/admin/useFitWithinClip.ts:165` for the clip, `components/admin/useFitWithinClip.ts:175` for the positioned ancestor, `components/admin/useFitWithinClip.ts:181-184` for the observe calls). `apply()` re-walks the chain on every invocation (`components/admin/useFitWithinClip.ts:81-137`), so the CAP is recomputed correctly on every signal. The SUBSCRIPTION set is never recomputed.

So an ancestor that starts clipping after the attach is never observed. Its resizes deliver nothing, and the cap that was correct as of the last signal silently goes stale. The row's probe transcript is the reproduction, on the two-ancestor unit topology already in `tests/components/admin/useFitWithinClip.test.tsx`:

```
STALE ATTACH_UNCLIPPED   cap=""      liveObservers=1 targets=[["inner"]]
STALE RERENDER_NOW_CLIPS cap=""      liveObservers=1 targets=[["inner"]]
STALE AFTER_SIGNAL       cap="322px" liveObservers=1 targets=[["inner"]]
STALE NEW_CLIP_RESIZE    cap="322px" liveObservers=1 targets=[["inner"]] deliverable=0 expectedCap="222px" diagnostics=0
```

The last line is the defect: the correct cap is 222px, the written cap is 322px, nothing was delivered, and the floor-clamp diagnostic (`components/admin/useFitWithinClip.ts:122-135`) did not fire because this geometry is not floor-clamped. Neither correct nor signaled.

### 1.1 Consequence bound

Every geometry change that the hook's DECLARED signal set covers must deliver a re-measure, and every cap the hook writes after any signal equals the cap a fresh walk computes, or the floor-clamp diagnostic fires. The declared signal set is the one the hook's own header states (`components/admin/useFitWithinClip.ts:18-26`): the clip ancestor resizes, the positioned ancestor resizes, a `transform` transition on the positioned ancestor settles, the window resizes, `reapplyKey` changes.

The bound is about the hook honouring its own declared set. It is not "the hook detects every DOM change". An input whose worst case is recorded in §9 below is a documented limit, not a finding.

## 2. Resolved scope, do not relitigate

- **The measure path is closed.** `feat/fitwithinclip-measure-class` (merged) settled how many times `apply()` runs and how many times the chain is walked per attach and per signal. This arc changes the SUBSCRIPTION path only and adds no `apply()` invocation and no chain walk. Pinned by `tests/components/admin/useFitWithinClip.test.tsx:344` (h), `tests/components/admin/useFitWithinClip.test.tsx:793` (h8), `tests/components/admin/useFitWithinClip.test.tsx:615` (h15), `tests/components/admin/useFitWithinClip.test.tsx:679` (h17), `tests/components/admin/useFitWithinClip.test.tsx:722` (h13).
- **Reachability is MEDIUM, not HIGH, and the probe is the evidence.** No shipped consumer takes the transition today. The row states this as its own reachability bound. A reviewer asking for a live surface is asking for a probe the row already carries, and the arc does not owe one.
- **`AnchoredPortal.tsx` placement is a different row** (`BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`), on a disjoint file. Out of scope here.
- **Shipped-consumer count, corrected against the live tree.** The row and the arc brief say "three shipped consumers". As of `4cb585b35` exactly ONE component calls this hook.
  That consumer is the attention-menu scroller at `components/admin/showpage/AttentionMenu.tsx:72`.
  The other two migrated onto `placeWithinVisibleViewport`: `components/admin/ReSyncButton.tsx:206` and `components/admin/PublishedToggle.tsx:268`.
  The migration is recorded at `tests/components/admin/_metaPopoverViewportSource.test.ts:183`.
  The suite's three lifecycle cases (h15, h16, h17) still pin those historical SHAPES, so "unchanged on the shipped consumers" is checked against one live consumer plus three pinned shapes.

## 3. Options considered

**Option A, chosen: re-resolve the observed set inside the coalesced path, and re-target only when the resolved value differs.**

The resolution already happens. `apply()` walks the chain on every invocation and returns the clip it resolved (`components/admin/useFitWithinClip.ts:81`, `components/admin/useFitWithinClip.ts:136`), precisely so the caller does not repeat the walk. Option A uses that return value on every signal instead of only at attach, and reads `offsetParent` in the same measurement window so the positioned ancestor is resolved from the same pass.

Cost on the common path, where the resolved ancestors are the ones already observed: two identity comparisons per signal, no observer call, no extra walk, no extra reflow.

**Option B, rejected: observe the whole ancestor chain from the attach.**

Rejected on three counts, only the first of which the brief anticipated.

1. It multiplies observers by chain depth on EVERY attach, for a transition no shipped consumer takes. `AttentionMenu`'s panel sits inside the review-modal shell, so the chain to the clip edge is several nodes deep, and each observed node costs a delivered callback and a coalesced `apply()` on its own resizes.
2. It is not complete for its own class. A chain observed at attach is still a set fixed at attach: an ancestor INSERTED into the chain later, by ordinary reconciliation, is not in it. Option B trades a stale singleton for a stale set.
3. It does nothing for the positioned ancestor (§4.2), which is the same defect on the same hook and has to be repaired anyway. Option A repairs both with one rule.

## 4. The repair

### 4.1 One rule

**On every measure, re-target a subscription when the newly resolved ancestor is non-null and differs from the one currently observed. Retain the current subscription when the newly resolved value is null.**

`apply()` returns the pair it resolved, `{ clip, positioned }`, both read inside the single `withNaturalSize` window (`lib/popover/naturalSize.ts:31`) so the subscription can never be synced from a different pass than the cap.

Retain-on-null is asymmetric on purpose, and it is the half that is easy to get wrong. An observed ancestor is a SIGNAL SOURCE. Dropping one costs a signal that may never come back; holding a stale one costs at most one redundant `apply()` on that node's resizes, and `apply()` is a recomputation, not a mutation of anything but the cap it would write anyway. `offsetParent` in particular reads null for a `display: none` subtree, so a naive "unobserve when null" drops the positioned subscription the moment the overlay is hidden and never restores it, which converts a hidden-then-shown overlay into exactly the silent stale cap this arc exists to remove.

### 4.2 The positioned ancestor is the same defect

`positioned` is `node.offsetParent`, read once at attach (`components/admin/useFitWithinClip.ts:175`), observed once (`components/admin/useFitWithinClip.ts:183`), and captured by the `transitionend` listener's identity check (`components/admin/useFitWithinClip.ts:200`). If reconciliation swaps which ancestor is positioned, the hook observes a node whose resizes no longer move the overlay, does not observe the node whose resizes do, and its `transitionend` filter rejects the real ancestor's settle event. Same mechanism, same silent stale cap, same fence (ordinary consumer authoring: a `className={open ? "relative" : ""}` is enough).

Repaired in this branch under the class-sweep default. The `transitionend` listener follows the resolved positioned ancestor: removed from the old node and added to the new one in the same re-target, and its identity check reads the CURRENT positioned ancestor rather than the attach-time one.

### 4.3 Termination

Re-targeting must be conditional, and this is a correctness requirement rather than an optimisation.

`ResizeObserver.observe()` delivers an initial observation for its target. An unconditional rebuild on every measure (`disconnect()` then re-`observe()`) therefore schedules a callback, whose coalesced `apply()` rebuilds again, forever: a per-frame re-measure loop with no fixed point. The same hazard is already recorded for the measurement helper this hook calls (`lib/popover/naturalSize.ts:16-19`).

Under §4.1's rule the loop is bounded. A re-target happens only when the resolved ancestor CHANGED. The `observe()` it issues delivers one initial observation, whose `apply()` resolves the same ancestor, which is now the observed one, so no further `observe()` is issued. One extra frame per genuine change, then quiescence.

## 5. Subscription transition inventory

The clip slot and the positioned slot are independent: each re-targets from its own resolved value, so the compound cases are the product of these rows and need no separate rule. `C`, `C'` are distinct clipping ancestors; `P`, `P'` distinct positioned ancestors.

| Slot | Transition on a signal | Behaviour |
| --- | --- | --- |
| clip | `null` to `C` | `observe(C)`. The row's defect. |
| clip | `C` to `C'` | `unobserve(C)`, `observe(C')`. |
| clip | `C` to `null` | Retain `C`. Nothing clips, the cap is removed, and `C` clipping again still delivers. |
| clip | `C` to `C` | No observer call at all. The termination proof (§4.3). |
| positioned | `null` to `P` | `observe(P)`, add the `transitionend` listener to `P`. |
| positioned | `P` to `P'` | `unobserve(P)`, `observe(P')`, move the listener from `P` to `P'`. |
| positioned | `P` to `null` | Retain `P` and its listener (`offsetParent` is null for a hidden subtree, §4.1). |
| positioned | `P` to `P` | No observer call, no listener churn. |

Compound worked case: `(null, P)` to `(C, P')` on one signal issues exactly `observe(C)`, `unobserve(P)`, `observe(P')`, one listener move, and no `apply()` beyond the one that resolved the pair.

## 6. Dimensional invariants

The hook's whole output is one dimensional relationship, so it gets stated rather than assumed. The fitted node is a flex/grid-agnostic block child of a clipping ancestor; nothing here depends on `align-items`, and no parent-to-child stretch is claimed.

| Parent | Child | Relationship | What guarantees it |
| --- | --- | --- | --- |
| The resolved clipping ancestor | The fitted node (`ref={fitRef}`) | `child.bottom <= parent.bottom - 8` whenever the room below the child's top clears the 48px floor | The inline `max-height` written at `components/admin/useFitWithinClip.ts:115`, computed by `computeFittedMaxHeight` at `lib/layout/fitWithinClip.ts:75` with `DEFAULT_CLIP_GUTTER` (`lib/layout/fitWithinClip.ts:21`) |
| The resolved clipping ancestor | The fitted node | When the room is under the floor the child DELIBERATELY overhangs, and the diagnostic fires instead | `MIN_FITTED_HEIGHT` (`lib/layout/fitWithinClip.ts:54`) floors the result, and `isFloorClamped` (`lib/layout/fitWithinClip.ts:102`) gates the warning at `components/admin/useFitWithinClip.ts:122` |
| The fitted node's own CSS cap | The written cap | The written cap is never above the declared `max-h-96`, EXCEPT where the declared cap is itself under the 48px floor, in which case the floor wins and the written cap exceeds it | `Math.max(MIN_FITTED_HEIGHT, Math.min(cap, available))` at `lib/layout/fitWithinClip.ts:85`; the declared cap is read at `components/admin/useFitWithinClip.ts:98`. The exception is pre-existing, is not floor-clamped by `isFloorClamped`'s own definition (it requires `cap >= MIN_FITTED_HEIGHT`, `lib/layout/fitWithinClip.ts:110`), and is out of this arc's class. Recorded as L-5. |
| No clipping ancestor | The fitted node | No inline cap at all, so the CSS cap governs unaided | `removeProperty("max-height")` at `components/admin/useFitWithinClip.ts:111` |

This arc changes none of these. It changes only which ancestors deliver the signal that re-runs the computation, so the invariants are restated as the thing the subscription repair must not disturb, and AC-3 and AC-8 are their guard.

## 7. Guard conditions

| Input or state | Behaviour |
| --- | --- |
| `node === null` at the ref callback | Unchanged: return early, no measure, no wiring (`components/admin/useFitWithinClip.ts:155`). |
| `nodeRef.current === null` inside a coalesced measure | `apply()` returns the empty pair, no subscription call, no throw. |
| `ResizeObserver` undefined (jsdom, `components/admin/useFitWithinClip.ts:179`) | No observer is constructed, so no subscription call is ever issued. The window-resize path still re-measures, and the `transitionend` listener still follows the positioned ancestor. Must not throw. |
| `offsetParent` null or not an `Element` | Treated as unresolved, not as absent: retain (§4.1). At attach, where there is nothing to retain, nothing is observed, which is today's behaviour. |
| Clip ancestor detached from the document | The next walk resolves whatever clips now, and the re-target follows it. A retained detached node is held only until teardown disconnects the observer. |
| Teardown at any point | `observer.disconnect()`, and the `transitionend` listener is removed from the CURRENT positioned ancestor, not the attach-time one. |

## 8. Acceptance criteria

- AC-1. After any signal, the clip `apply()` resolved is in the observer's target set, unless it resolved null.
- AC-2. A signal whose resolved pair equals the observed pair issues no `observe` and no `unobserve` call. (Termination, §4.3.)
- AC-3. The attach path is unchanged: same observer count, same target set, same target order, on the clipping and the non-clipping fixture.
- AC-4. The row's probe transcript, re-run against the shipped hook, ends `deliverable=1` with `cap` equal to `expectedCap`.
- AC-5. The positioned subscription and its `transitionend` listener follow the resolved positioned ancestor, and the listener's identity check reads the current one.
- AC-6. A resolved null on either slot retains that slot's current subscription.
- AC-7. With no `ResizeObserver`, the hook does not throw and the window-resize re-measure still writes the correct cap.
- AC-8. No `apply()` invocation and no chain walk is added on any path (§2, measure path closed).

## 9. Documented limits

Recorded here rather than filed, per the arc's no-new-row rule. Each is "correct as of the last signal, and never silently wrong about a signal it declared".

- **L-1. An overflow change with no intervening signal.** Nothing in the platform reports a computed-style change. The cap stays at its last-signal value until any signal arrives, and the consumer's remedy is the `reapplyKey` argument at `components/admin/useFitWithinClip.ts:66`.
  The live consumer passes its entrance flag for exactly this reason (`components/admin/showpage/AttentionMenu.tsx:72`). Unchanged by this arc, and out of its class: this arc makes the SIGNAL deliver once it exists.
- **L-2. Adversarial DOM mutation outside React's reconciliation.** Out of the threat fence. Ordinary consumer authoring is in scope; a hand-rolled `appendChild` that reparents the overlay between signals is not.
- **L-3. The floor-clamp diagnostic stays once per element for the element's life.** `warned` is a `WeakSet` keyed by the fitted element (`components/admin/useFitWithinClip.ts:60`), so a new clip ancestor with a genuinely different overhang does not re-warn. Deliberate and unchanged: `apply()` runs on every resize frame, and a warning per frame during a drag buries the one that mattered (`components/admin/useFitWithinClip.ts:117-121`). The developer has already been told this element overhangs, so the outcome is stale, not silent.
- **L-4. A retained subscription outlives its usefulness until teardown.** Retain-on-null (§4.1) means the observer can hold a node that no longer clips, or a positioned ancestor of a hidden subtree, for the rest of the overlay's life. Bounded by the overlay's life, since teardown disconnects. The cost is at most one redundant coalesced `apply()` per retained node per resize.
- **L-5. A declared cap under the 48px floor is silently exceeded.** `computeFittedMaxHeight` floors its result at `MIN_FITTED_HEIGHT` unconditionally (`lib/layout/fitWithinClip.ts:85`), while `isFloorClamped` fires only when `cap >= MIN_FITTED_HEIGHT` (`lib/layout/fitWithinClip.ts:110`). So an overlay declaring `max-height` under 48px gets a taller cap written with no diagnostic. Pre-existing, in the MEASURE path this arc does not touch (§2), and unreachable on the one live consumer, whose declared cap is `max-h-96` (384px, `components/admin/showpage/AttentionMenu.tsx:177`). Recorded here rather than filed, per the arc's no-new-row rule; the trigger to revisit is a consumer declaring a cap under the floor.

## 10. Deciding cases

All in `tests/components/admin/useFitWithinClip.test.tsx`, which already carries the two-ancestor topology (`Harness`, `tests/components/admin/useFitWithinClip.test.tsx:86`), the held-frame stub (`flushFrames`, `tests/components/admin/useFitWithinClip.test.tsx:43`), and the geometry-derived expectation helper `expectedPx` (`tests/components/admin/useFitWithinClip.test.tsx:109`). Expected caps are derived through the real `computeFittedMaxHeight` (`lib/layout/fitWithinClip.ts:75`), never typed.

- The row's probe, as a case: mount unclipped, rerender so `outer` clips with `reapplyKey` unchanged, fire a window resize, then fire the observer callback for `outer` alone with new geometry. Asserts the cap equals `expectedPx()` for the NEW geometry and that `outer` entered the target set. This is the case the planted mutant (skip the re-target) turns red. It extends the existing `(h19)` at `tests/components/admin/useFitWithinClip.test.tsx:579`, which stops at the window-resize step.
- AC-2's case: a signal that resolves the same pair records zero `observe` and zero `unobserve` calls after the attach.
- AC-3's case: attach-time target sets on both fixtures, asserted against `(d)` at `tests/components/admin/useFitWithinClip.test.tsx:206`, `(h21)` at `tests/components/admin/useFitWithinClip.test.tsx:517` and `(h22)` at `tests/components/admin/useFitWithinClip.test.tsx:758`, which already pin `["inner"]` and the clip-plus-positioned pair.
- AC-5 and AC-6's cases: a positioned swap, and a positioned that resolves null.

## 11. Citation pass

Every `file:line` in this document was grepped against `4cb585b35` on 2026-08-27. Anchors are drafting-time locators; the symbol each names is the durable half.
