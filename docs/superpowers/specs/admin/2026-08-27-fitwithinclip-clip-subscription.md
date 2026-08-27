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

Two clauses, and the second one carries a restriction that spec review round 1 forced.

1. **Every cap the hook writes after any signal equals the cap a fresh walk computes, or the floor-clamp diagnostic fires.** This already holds today and must survive the repair.
2. **Every signal arriving from a source the hook has ALREADY resolved delivers a re-measure AND refreshes the subscription.** The declared sources are the hook header's three (`components/admin/useFitWithinClip.ts:18-26`: the clip ancestor resizes, the positioned ancestor resizes, a `transform` transition on the positioned ancestor settles) plus `reapplyKey` and the window resize wired at `components/admin/useFitWithinClip.ts:206`. The header does not name the window listener; that is a documented gap in the header, not in the set.

**Why clause 2 is restricted to already-resolved sources, stated so a later round does not read it as a retreat.** A source becomes observable only once a measure has resolved it, and a measure happens only on a signal. So no design can deliver the FIRST signal that originates from a source it has not yet resolved: to subscribe to the node you must already have walked to it. The unrestricted form of clause 2 is not a stronger bound, it is an unsatisfiable one, and writing it would have made every design fail it forever. What is left over is real and is recorded as L-6, with the mechanism that would close it and the trigger to build that mechanism.

Both clauses range over the finite declared source set above, so the bound is closable. An input whose worst case is recorded in §9 is a documented limit, not a finding.

## 2. Resolved scope, do not relitigate

- **The measure path is closed.** `feat/fitwithinclip-measure-class` (merged) settled how many times `apply()` runs and how many times the chain is walked per attach and per signal in the STEADY STATE, which is every signal the shipped consumer takes today. Pinned by the counting cases at `tests/components/admin/useFitWithinClip.test.tsx:344` (h), `tests/components/admin/useFitWithinClip.test.tsx:793` (h8), `tests/components/admin/useFitWithinClip.test.tsx:615` (h15), `tests/components/admin/useFitWithinClip.test.tsx:679` (h17), `tests/components/admin/useFitWithinClip.test.tsx:722` (h13). This arc preserves every one of those counts. It adds exactly one coalesced apply on a transition that arc never exercised, bounded and asserted in §4.3.
- **Reachability is MEDIUM, not HIGH.** No shipped consumer takes the overflow transition today. The backlog row carries the probe transcript as its evidence. Asking for a live surface is asking for a probe the row already has.
- **`AnchoredPortal.tsx` is a different row** (`BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`), on a disjoint file. Out of scope.
- **This arc files no new ledger row of any facing.** Peers it cannot repair go to §9 and to the PR body. "This should be a backlog entry" is not an admissible finding.
- **Shipped-consumer count, corrected against the live tree.** The row and the arc brief say "three shipped consumers". As of `4cb585b35` exactly ONE component calls this hook.
  That consumer is the attention-menu scroller at `components/admin/showpage/AttentionMenu.tsx:72`.
  The other two migrated onto `placeWithinVisibleViewport`: `components/admin/ReSyncButton.tsx:206` and `components/admin/PublishedToggle.tsx:268`.
  The migration is recorded at `tests/components/admin/_metaPopoverViewportSource.test.ts:183`.
  The suite's three lifecycle cases (h15, h16, h17) still pin those historical SHAPES, so "unchanged on the shipped consumers" is checked against one live consumer plus three pinned shapes.

## 3. Options considered

**Option A, chosen: re-resolve the observed set inside the coalesced path, and re-target only when the resolved value differs.**

The resolution already happens. `apply()` walks the chain on every invocation and returns the clip it resolved (`components/admin/useFitWithinClip.ts:81`, `components/admin/useFitWithinClip.ts:136`), precisely so the caller does not repeat the walk. Option A uses that return value on every signal instead of only at attach, and reads `offsetParent` in the same measurement window so the positioned ancestor is resolved from the same pass.

Cost in the steady state, where the resolved ancestors are the ones already observed: building a two-element set and comparing it, no observer call, no extra walk, no extra reflow, no extra apply.

**Option B, rejected: observe the whole ancestor chain from the attach.**

Round 1 sharpened this, because option B is genuinely stronger on one axis and the first draft did not say so.

1. **Where option B wins.** For an ancestor that is already in the chain at attach and later starts clipping, option B delivers that ancestor's OWN first resize, which option A cannot (§1.1 clause 2, L-6). That is a real difference, not a rounding error.
2. **What it costs to buy that.** Observers multiply by chain depth on EVERY attach, for a transition no shipped consumer takes. `AttentionMenu`'s scroller sits inside the review-modal shell, so the chain to the clip edge is several nodes deep, and each observed node delivers an initial observation on attach and a coalesced `apply()` on each of its own resizes for the overlay's whole life. The row's own done condition is that the repair costs nothing on the common path, which option B cannot satisfy.
3. **It is still incomplete for its own class.** A chain observed at attach is a set fixed at attach. An ancestor INSERTED into the chain later by ordinary reconciliation is not in it, so option B trades a stale singleton for a stale set and still owes L-6 in the insertion case.
4. **It does nothing for the positioned ancestor** (§4.2), which is the same defect on the same hook and has to be repaired anyway.

The trade taken: option A everywhere, with the residue of point 1 recorded as L-6 rather than paid for on every attach forever.

## 4. The repair

### 4.1 Roles are re-resolved; the target set is DERIVED from the roles and diffed as a set

Two levels, and keeping them apart is what makes the repair correct rather than merely plausible.

**Roles.** The hook holds two roles, `observedClip` and `observedPositioned`. On every measure a role is re-targeted when the newly resolved ancestor is non-null and differs from the role's current value. A resolved null RETAINS the role.

Retain-on-null is asymmetric on purpose, and it is the half that is easy to get wrong. An observed ancestor is a SIGNAL SOURCE. Dropping one costs a signal that may never come back; holding a stale one costs at most one redundant `apply()` on that node's resizes, and `apply()` recomputes rather than mutating anything but the cap it would write anyway. `offsetParent` reads null for a `display: none` subtree, so a naive "unobserve when null" drops the positioned subscription the moment the overlay is hidden and never restores it, which converts every hide-then-show into exactly the silent stale cap this arc exists to remove.

**Targets.** The observer's target set is not two independent subscriptions. It is ONE flat set of elements, so it is derived from the roles and reconciled by set difference: unobserve every target no longer wanted, observe every wanted target not yet held.

**This is the whole of round 1 finding 2, and it is a live bug the slot-by-slot version would have shipped.** `ResizeObserver` stores element targets, not role-scoped subscriptions, so `unobserve(X)` removes X outright. If one element holds BOTH roles, which is the likely real configuration for a `position: relative; overflow: clip` modal panel, then re-targeting one role calls `unobserve` on an element the other role still needs, and the other role goes silently dark. Set difference cannot express that mistake: an element wanted by either role is in the desired set, so it is never unobserved.

`apply()` returns the pair it resolved, `{ clip, positioned }`, both read inside the single `withNaturalSize` window (`lib/popover/naturalSize.ts:31`) so the subscription can never be synced from a different pass than the cap. `positioned` is normalized through `instanceof Element` inside `apply()`, because unstubbed jsdom returns `undefined` rather than null and a `!== null` test would treat that as a live ancestor.

### 4.2 The positioned ancestor is the same defect

`positioned` is `node.offsetParent`, read once at attach (`components/admin/useFitWithinClip.ts:175`), observed once (`components/admin/useFitWithinClip.ts:183`), and captured by the `transitionend` listener's identity check (`components/admin/useFitWithinClip.ts:200`). If reconciliation swaps which ancestor is positioned, the hook observes a node whose resizes no longer move the overlay, does not observe the node whose resizes do, and its `transitionend` filter rejects the real ancestor's settle event. Same mechanism, same silent stale cap, same fence: ordinary consumer authoring, where a `className={open ? "relative" : ""}` is enough.

Repaired in this branch under the class-sweep default. The `transitionend` listener follows the POSITIONED ROLE: removed from the old node and added to the new one in the same re-target, with the identity check reading the current role rather than the attach-time value. The listener is role-scoped even though the observer target set is not, because a listener is attached per node and carries no aliasing hazard.

### 4.3 Termination, and the one apply it costs

Re-targeting must be conditional, and this is a correctness requirement rather than an optimisation.

`ResizeObserver.observe()` delivers an initial observation for its target. An unconditional rebuild on every measure (`disconnect()` then re-`observe()`) therefore schedules a callback, whose coalesced `apply()` rebuilds again, forever: a per-frame re-measure loop with no fixed point. The same hazard is already recorded for the measurement helper this hook calls (`lib/popover/naturalSize.ts:16-19`).

Under §4.1's rule the loop is bounded. A target is observed only when the derived set actually gained it. The `observe()` it issues delivers one initial observation at the next rendering opportunity, whose coalesced `apply()` derives the same set, so the difference is empty and no further `observe()` is issued. The coalescer clears its pending frame before running (`lib/popover/rafCoalescer.ts:22`), so that follow-up observation schedules its own frame rather than being swallowed, which is exactly why the extra apply is one and not zero.

**So a genuine re-target costs exactly one additional coalesced `apply()`, and §2's closed counts are not violated.** Round 1 was right that the first draft's AC-8 said "no apply added on any path" while §4.3 admitted an extra one. The counts `feat/fitwithinclip-measure-class` closed are the attach count and the steady-state per-signal count; a transition that changes the resolved set is neither, and that arc's cases never drive one. The bound is stated as AC-8 and asserted, rather than left as prose: unchanged set means zero extra, changed set means exactly one, never more, because the follow-up cannot change the set again.

## 5. Transition inventory

### 5.1 Role transitions

`C`, `C'` are distinct clipping ancestors; `P`, `P'` distinct positioned ancestors. This table is about the ROLES. What the observer is told is §5.2.

| Role | Transition on a signal | Role update | Listener |
| --- | --- | --- | --- |
| clip | `null` to `C` | `observedClip = C`. The row's defect. | none |
| clip | `C` to `C'` | `observedClip = C'`. | none |
| clip | `C` to `null` | Retain `C`. Nothing clips, the cap is removed, and `C` clipping again still delivers. | none |
| clip | `C` to `C` | No change. | none |
| positioned | `null` to `P` | `observedPositioned = P`. | add to `P` |
| positioned | `P` to `P'` | `observedPositioned = P'`. | remove from `P`, add to `P'` |
| positioned | `P` to `null` | Retain `P` (`offsetParent` is null for a hidden subtree, §4.1). | none |
| positioned | `P` to `P` | No change. | none |

### 5.2 Target-set reconciliation, including the aliasing families

The desired target set is `{observedClip, observedPositioned}` with nulls dropped, so it holds one element when the roles alias and two when they do not. The observer calls are the set difference against what is currently held, and NOT a per-role unobserve. Rows written as `(clip, positioned)` over element names.

| Roles before | Roles after | Held before | Desired after | Calls |
| --- | --- | --- | --- | --- |
| `(A, B)` | `(A, B)` | `{A, B}` | `{A, B}` | none. The termination proof (§4.3). |
| `(null, B)` | `(A, B)` | `{B}` | `{A, B}` | `observe(A)` |
| `(A, B)` | `(A', B)` | `{A, B}` | `{A', B}` | `unobserve(A)`, `observe(A')` |
| `(A, A)` | `(B, A)` | `{A}` | `{B, A}` | `observe(B)` ONLY. `A` still holds the positioned role, so a per-role `unobserve(A)` here would silence it. |
| `(A, A)` | `(A, B)` | `{A}` | `{A, B}` | `observe(B)` ONLY, for the mirrored reason. |
| `(A, B)` | `(B, A)` | `{A, B}` | `{B, A}` | none. The roles swapped and the target set did not, so a sequential per-role reconcile would have left one target alive and the other dropped depending on operation order. |
| `(A, B)` | `(A, A)` | `{A, B}` | `{A}` | `unobserve(B)` |
| `(A, B)` | `(A, null)` | `{A, B}` | `{A, B}` | none. Retain-on-null keeps the positioned role at `B`, so `B` stays desired. |

Compound changes are the same mechanism: both roles update, then ONE set difference runs, so a compound transition issues at most the calls its own before-and-after sets differ by, and never a call that a per-slot order would have produced.

## 6. Dimensional invariants

The hook's whole output is one dimensional relationship, so it gets stated rather than assumed. The fitted node is a block child of a clipping ancestor; nothing here depends on `align-items`, and no parent-to-child stretch is claimed.

| Parent | Child | Relationship | What guarantees it |
| --- | --- | --- | --- |
| The resolved clipping ancestor | The fitted node (`ref={fitRef}`) | `child.bottom <= parent.bottom - 8` whenever the room below the child's top clears the 48px floor | The inline `max-height` written at `components/admin/useFitWithinClip.ts:115`, computed by `computeFittedMaxHeight` at `lib/layout/fitWithinClip.ts:75` with `DEFAULT_CLIP_GUTTER` (`lib/layout/fitWithinClip.ts:21`) |
| The resolved clipping ancestor | The fitted node | When the room is under the floor the child DELIBERATELY overhangs, and the diagnostic fires instead | `MIN_FITTED_HEIGHT` (`lib/layout/fitWithinClip.ts:54`) floors the result, and `isFloorClamped` (`lib/layout/fitWithinClip.ts:102`) gates the warning at `components/admin/useFitWithinClip.ts:122` |
| The fitted node's own CSS cap | The written cap | The written cap is never above the declared `max-h-96`, EXCEPT where the declared cap is itself under the 48px floor, in which case the floor wins and the written cap exceeds it | `Math.max(MIN_FITTED_HEIGHT, Math.min(cap, available))` at `lib/layout/fitWithinClip.ts:85`; the declared cap is read at `components/admin/useFitWithinClip.ts:98`. The exception is pre-existing, is not floor-clamped by `isFloorClamped`'s own definition, which requires `cap >= MIN_FITTED_HEIGHT` (`lib/layout/fitWithinClip.ts:110`), and is out of this arc's class. Recorded as L-5. |
| No clipping ancestor | The fitted node | No inline cap at all, so the CSS cap governs unaided | `removeProperty("max-height")` at `components/admin/useFitWithinClip.ts:111` |

This arc changes none of these. It changes only which ancestors deliver the signal that re-runs the computation, so the invariants are restated as the thing the subscription repair must not disturb, and AC-3 and AC-8 are their guard.

## 7. Guard conditions

| Input or state | Behaviour |
| --- | --- |
| `node === null` at the ref callback | Unchanged: return early, no measure, no wiring (`components/admin/useFitWithinClip.ts:155`). |
| `nodeRef.current === null` inside a coalesced measure | `apply()` returns the empty pair. Both roles retain, the desired set is unchanged, no observer call, no throw. |
| `ResizeObserver` undefined (jsdom, `components/admin/useFitWithinClip.ts:179-180`) | No observer is constructed, so no `observe` or `unobserve` is ever issued and the reconcile is skipped whole. Roles still update, so the `transitionend` listener still follows the positioned ancestor, and the window-resize path still re-measures. Must not throw. |
| `offsetParent` null, or `undefined` under unstubbed jsdom | Normalized to null inside `apply()`, then treated as unresolved rather than absent: retain (§4.1). At attach, where there is nothing to retain, the role stays null and nothing is observed for it, which is today's behaviour. |
| Both roles resolve to the SAME element | The desired set holds one element and the observer is told once. Today's code issues two `observe` calls for that element, which the platform treats as re-observing it, so the delivered behaviour is unchanged and the call count drops by one. |
| Clip ancestor detached from the document | The next walk resolves whatever clips now and the set difference follows it. A retained detached node is held only until teardown disconnects the observer. |
| Teardown at any point | `observer.disconnect()`, and the `transitionend` listener is removed from the CURRENT positioned role, not the attach-time value. |

## 8. Acceptance criteria

- AC-1. After any signal, the clip `apply()` resolved is in the observer's target set, unless it resolved null.
- AC-2. A signal whose derived target set equals the held set issues no `observe` and no `unobserve` call. (Termination, §4.3.)
- AC-3. The attach path is unchanged on the non-aliasing fixtures: same observer count, same target set, same target order.
- AC-4. The row's probe transcript, re-run against the shipped hook, ends `deliverable=1` with `cap` equal to `expectedCap`.
- AC-5. The positioned role and its `transitionend` listener follow the resolved positioned ancestor, and the listener's identity check reads the current role.
- AC-6. A resolved null on either role retains that role, and therefore retains its target.
- AC-7. With no `ResizeObserver`, the hook does not throw at any reconcile site and the window-resize re-measure still writes the correct cap.
- AC-8. No apply and no chain walk is added on any signal whose derived set is unchanged, which is every signal the shipped consumer takes today. A signal that CHANGES the set costs exactly one additional coalesced apply, never more.
- AC-9. An element holding both roles is never unobserved while either role still wants it, across all four aliasing families of §5.2.

## 9. Documented limits

Recorded here rather than filed, per the arc's no-new-row rule. Each is "correct as of the last signal, and never silently wrong about a signal it declared".

- **L-1. An overflow change bridged only by an already-observed source.** Nothing in the platform reports a computed-style change, so the cap stays at its last-signal value until a signal arrives from a source the hook ALREADY observes: the window, the current clip role, the current positioned role, or a `reapplyKey` change. The general-purpose remedy is the `reapplyKey` argument (`components/admin/useFitWithinClip.ts:66`).
  Stated precisely because round 1 caught the first draft claiming "until any signal arrives", which is false: a signal from a source the hook has not yet resolved cannot arrive, and that residue is L-6 rather than part of this limit.
  The live consumer does pass a `reapplyKey`, but for its own reason, the scale-95 entrance settling (`components/admin/showpage/AttentionMenu.tsx:69`), not for overflow recovery. No shipped consumer uses it for this.
- **L-6. The first signal originating from a newly resolved source is not delivered.** Structural, and the reason is in §1.1: subscribing to a node requires having walked to it, and the walk requires a signal. So for clip `null` to `C`, clip `C` to `C'`, positioned `null` to `P` and positioned `P` to `P'`, a resize or `transform` transitionend on the NEW node, arriving before any other source has fired, is lost. Every later signal from that node is delivered, so the window is one signal wide and closes at the first bridging signal of L-1.
  What would close it: a `MutationObserver` on the ancestor chain's `style` and `class` attributes, which is what actually changes under the declared threat fence (an ancestor whose overflow or position is driven by React state). That is a second observer, a second lifecycle, and its own design; it is not smuggled into a subscription-freshness repair. **Trigger to build it:** a consumer whose clip or positioned ancestor changes from state AND whose only signal source is that ancestor itself, or any observed instance of a stale cap surviving a bridging signal.
- **L-2. Adversarial DOM mutation outside React's reconciliation.** Out of the threat fence. Ordinary consumer authoring is in scope; a hand-rolled `appendChild` that reparents the overlay between signals is not.
- **L-3. The floor-clamp diagnostic stays once per element for the element's life.** `warned` is a `WeakSet` keyed by the fitted element (`components/admin/useFitWithinClip.ts:60`), so a new clip ancestor with a genuinely different overhang does not re-warn. Deliberate and unchanged: `apply()` runs on every resize frame, and a warning per frame during a drag buries the one that mattered (`components/admin/useFitWithinClip.ts:117-121`). The developer has already been told this element overhangs, so the outcome is stale, not silent.
- **L-4. A retained subscription outlives its usefulness until teardown.** Retain-on-null (§4.1) means the observer can hold a node that no longer clips, or the positioned ancestor of a hidden subtree, for the rest of the overlay's life. Bounded by the overlay's life, since teardown disconnects. The cost is at most one redundant coalesced `apply()` per retained node per resize.
- **L-5. A declared cap under the 48px floor is silently exceeded.** `computeFittedMaxHeight` floors its result at `MIN_FITTED_HEIGHT` unconditionally (`lib/layout/fitWithinClip.ts:85`), while `isFloorClamped` fires only when `cap >= MIN_FITTED_HEIGHT` (`lib/layout/fitWithinClip.ts:110`). So an overlay declaring `max-height` under 48px gets a taller cap written with no diagnostic. Pre-existing, in the MEASURE path this arc does not touch (§2), and unreachable on the one live consumer, whose declared cap is `max-h-96` (384px, `components/admin/showpage/AttentionMenu.tsx:177`). **Trigger:** a consumer declaring a cap under the floor.
- **L-7. The hook header does not name the window-resize listener.** It says "Three signals re-measure" (`components/admin/useFitWithinClip.ts:18`) while the implementation wires a fourth at `components/admin/useFitWithinClip.ts:206`. A documentation gap, not a behaviour gap, found by round 1 while checking §1.1's citation. The repair commit corrects the header, since the header is the thing §1.1 quotes as the declared source set.

## 10. Deciding cases

All in `tests/components/admin/useFitWithinClip.test.tsx`, which already carries the two-ancestor topology (`Harness`, `tests/components/admin/useFitWithinClip.test.tsx:86`), the held-frame stub (`flushFrames`, `tests/components/admin/useFitWithinClip.test.tsx:43`), and the geometry-derived expectation helper `expectedPx` (`tests/components/admin/useFitWithinClip.test.tsx:109`). Expected caps are derived through the real `computeFittedMaxHeight` (`lib/layout/fitWithinClip.ts:75`), never typed.

The suite's existing stubs fire at whatever target a test names, so a case that resizes an unobserved node re-measures anyway and any subscription assertion built on them is decorative. The new stub keeps a target `Set` and delivers ONLY to members, and its `resize(target)` returns false without firing when the target is absent. That boolean is the probe transcript's `deliverable` field promoted to an assertion.

- The row's probe, as a case: mount unclipped, rerender so `outer` clips with `reapplyKey` unchanged, fire a window resize, then resize `outer` alone. Asserts `outer` entered the target set and that the cap moved to `expectedPx()` for the new geometry. Extends `(h19)` at `tests/components/admin/useFitWithinClip.test.tsx:579`, which stops at the window-resize step.
- AC-9's cases, one per aliasing family of §5.2, on a fixture where one element holds both roles. This is the family the existing harness cannot reach: it keeps the two ancestors distinct on purpose (`tests/components/admin/useFitWithinClip.test.tsx:8`), so the aliasing fixture is new.
- AC-2 and AC-8's cases: observe and unobserve call logs, apply counts and walk counts, across a signal that does not change the set and a signal that does.
- AC-3's case: attach-time target sets on both non-aliasing fixtures, asserted alongside the existing `(d)` at `tests/components/admin/useFitWithinClip.test.tsx:206`, `(h21)` at `tests/components/admin/useFitWithinClip.test.tsx:517` and `(h22)` at `tests/components/admin/useFitWithinClip.test.tsx:758`.
- AC-5, AC-6 and AC-7's cases: a positioned swap, a null on each role, and the absent-constructor path.

L-6 gets no case, deliberately. Asserting that a lost signal stays lost pins a structural limit as if it were a contract, and the limit's whole point is that it is closed by a mechanism this arc does not build.

## 11. Citation pass

Every `file:line` in this document was resolved and READ against `4cb585b35` on 2026-08-27, and each cited line matched to the claim its sentence makes. Confirming that a citation resolves establishes nothing on its own; round 1 found two that resolved cleanly while their sentences said more than the line did, and both are corrected above (§1.1's declared-source claim, now split across the header and the window listener, and L-1's `reapplyKey` claim, now stated as what `AttentionMenu`'s comment actually says). Anchors are drafting-time locators; the symbol each names is the durable half.
