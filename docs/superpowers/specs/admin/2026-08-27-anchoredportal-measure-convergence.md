# AnchoredPortal: the converged measure count on an open transition

**Row:** `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`
**Branch:** `perf/anchoredportal-measure-convergence`
**Probe evidence:** appendix A of this document.

`components/admin/AnchoredPortal.tsx` runs `measureAndApply` three times for one
closed to open transition. Two of those three are the design working; one is
not. This spec states which, what the count becomes, and what pins it.

## 1. The converged count is 2

**One closed to open transition runs `measureAndApply` exactly twice.** Run 1 is
the pre-paint placement on the open commit. Run 2 is the ungated every-commit
effect evaluating on the first commit after that placement. The third run in the
current code is removed.

**2 is the converged count UNDER THE CURRENT NOTIFICATION MECHANISM, and is not
claimed to be a floor over all mechanisms.** An earlier draft of this spec
claimed 2 was FORCED. Review refuted that (§2.1), and the claim is withdrawn
rather than softened, because a guard pinning 2 while the spec claims a floor of
2 would pin a number one above a bound nobody should still believe.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The ungated every-commit effect is a named invariant of the design, not a redundancy. It is the only shipped subscription that catches a position-only anchor move. | `components/admin/AnchoredPortal.tsx:245-253`; INV-2 |
| Run 2 of the current three is removable, and its removal is analytic rather than measured. | §2.2 |
| `IntersectionObserver` does not replace measuring per commit, in either its plain or self-rearming form. ONE reason survives review; two were struck. | §2.3 |
| `MutationObserver` could plausibly reach a count of 1. It is NOT REFUTED. It is not taken, for scope. | §2.4 |
| INV-1 is pinned in the browser, never in jsdom, and the reason is measured. | §5 |
| The `useFitWithinClip` measure-class work is merged and its count is closed. This arc does not touch `components/admin/useFitWithinClip.ts`. | Row, class-sweep exception (c) |
| The repair removes a MEASURE, not a placement. | §4, INV-4 |

## 2. Why the count is 2

### 2.1 What review refuted, and what survives

The refuted claim, stated so it is not re-derived: an earlier draft argued that
run 3 could not be removed because "nothing distinguishes" the commit after the
open placement from a refresh that reordered the rows without a measurement.
**That is false.** A `MutationObserver` distinguishes them without measuring: a
row reorder emits a `childList` record, while the placement follow-up mutates
only the portal's own `style` attribute and is filterable on its target. Its
callbacks are microtasks, so unlike `IntersectionObserver` they run before the
rendering update and CAN carry a pre-paint correction.

So the honest statement is narrower. `ResizeObserver` reports SIZE — its
`contentRect` origin is relative to the element's own padding box, so a pure
translation of the anchor changes nothing it observes — and among the
subscriptions this component actually has, the ungated effect
(`components/admin/AnchoredPortal.tsx:254`) is the only one that catches a
position-only move. It catches one by running on every commit and measuring, and
the commit after the open placement is an ordinary commit that it cannot
classify without measuring. Under THAT mechanism the count cannot go below 2.

### 2.2 Run 2 is removable, by construction

Both of the open commit's measures land in the same commit: the gated effect
(`components/admin/AnchoredPortal.tsx:191`) and the ungated one.

Nothing mutates the DOM between them. No re-render intervenes, nothing paints,
and the only style writes either makes are `withNaturalSize`'s cap clear
(`lib/popover/naturalSize.ts:39-40`) and its restore
(`lib/popover/naturalSize.ts:68-69`), which cancel inside each call. Run 2's
inputs are therefore identical to run 1's BY CONSTRUCTION, its computed placement
is identical, and `commit` (`components/admin/AnchoredPortal.tsx:115`) drops it.

This is analytic, not measured, and it survived review unchanged: React walks
both layout hooks contiguously from the component's effect list, and the
layout-effect state update flushes after the current commit phase, so no
in-scope DOM mutation or render can interleave.

### 2.3 IntersectionObserver, killed on one reason

Two forms were considered. Of the three reasons an earlier draft gave against
the stronger form, **two were struck and one survives.** The survivor is
sufficient, and the struck pair is recorded rather than deleted so neither is
re-derived.

**Plain `IntersectionObserver` on the anchor, rooted at the viewport, with any
threshold list.** IO fires on threshold CROSSINGS, not on geometry change. A row
reorder that moves a fully-visible anchor 40px down holds `intersectionRatio` at
exactly 1.0 before and after, so no threshold is crossed and no callback fires.
That is the guarantee's own case, so this form is dead on the first move it
would need to catch.

**The self-rearming position observer** (the sticky-header technique): compute
`rootMargin` from the anchor's current rect so the element sits exactly at the
root boundary, so any movement crosses it; on each fire, re-measure and re-arm.
This defeats the ratio-stays-1.0 objection by construction, and it still fails,
for one reason:

- **It cannot deliver a pre-paint guarantee.** IO queues its callback to run
  after paint, by construction. The ungated layout effect re-places in the same
  commit, before paint. An after-paint mechanism reintroduces exactly the defect
  `components/admin/AnchoredPortal.tsx:245-253` describes, for one frame: the
  panel visibly belonging to a different row. This is a correctness argument,
  not a performance one.

**Struck reason A**, that re-arming requires another anchor measurement so the
per-commit read is relocated rather than removed. False.
`IntersectionObserverEntry` already supplies `boundingClientRect`, so re-arming
needs no fresh synchronous read, and the observer fires on intersection changes
rather than on every React commit.

**Struck reason B**, that `rootMargin` quantizes to integer pixels and so leaves
a sub-pixel dead zone against an anchor measured at `top: 1251.47px`. Overstated
and never verified. Blink computes intersections in `LayoutUnit` at 1/64px, so a
fractional margin is representable and the dead zone as described does not
follow.

Both were struck because a soft reason is a liability rather than a margin of
safety: a reviewer who breaks one of three starts probing the other two.

### 2.4 MutationObserver: not refuted, not taken

Review identified `MutationObserver` as a mechanism that could plausibly reach a
count of 1, by the argument in §2.1. **It is recorded as NOT TAKEN FOR SCOPE, and
explicitly NOT as refuted.**

The row this spec closes is about three measures per open on a shipped admin
surface, and 3 to 2 delivers that. Going 2 to 1 is a redesign of the
NOTIFICATION MECHANISM rather than a removal of a redundant call: a
document-wide subtree observer, a filter deciding which records are
anchor-moving, and microtask timing interleaved with React's own scheduling.
None of those costs is established, and the filter in particular is a recognizer
over an open input space — the shape that grows one corner per review round.

**Re-file trigger:** someone willing to redesign the notification path, with the
document-wide observer's cost measured on the shows dashboard first.

## 3. The repair

Delete the gated effect's own `measureAndApply()` call
(`components/admin/AnchoredPortal.tsx:193`). The ungated effect becomes the sole
measurer. The gated effect keeps its subscription wiring and teardown unchanged.

**Rejected alternative: a ref flag** set by the gated effect and cleared by the
ungated one. It reaches the same count of 2, but only while the gated effect is
declared FIRST, which is the silent declaration-order coupling the row warns
against, and it adds state in order to remove a call.

**The pre-paint guarantee after the repair** rests on the ungated effect being a
`useLayoutEffect`. A passive effect would place after paint and return the
one-frame wrong-row defect. That property is pinned by INV-1, in the browser,
for the reason §5 gives — NOT by the dependency-array claim an earlier draft made
here, which was false: a complete dependency array still runs on the open commit,
so it does not defeat pre-paint at all.

## 4. Invariants

| Id | Invariant | Deciding case | Mutant that reds it |
| --- | --- | --- | --- |
| INV-1 | The placement is applied before paint | `PROBE:` in `tests/e2e/rowactions-geometry.spec.ts`, frame-ordering | make the sole measurer a `useEffect` |
| INV-2 | An anchor that moves without changing size re-places the panel | `tests/components/admin/rowActions/anchoredPortal.test.tsx:266` | delete the ungated effect |
| INV-3 | One closed to open transition runs `measureAndApply` exactly twice | jsdom measure counter | restore the gated effect's `measureAndApply()` call |
| INV-4 | The repair removes a measure, not a placement | `PROBE:` placement sequence | any change to the applied placement tuple |

**INV-1 and INV-4 are demonstrably not redundant, and the artifact exists rather
than the argument.** Under the passive-measurer plant, INV-1 red — mount at frame
2, placement at frame 3 — while the placement sequence stayed
`["0px|0px||", "695px|1251.47px||"]` and INV-4 stayed GREEN. A mutant that
defeats one pin while leaving the other passing settles the question of whether
either subsumes the other, which is why INV-1 needs its own case.

Every mutant named here is EXECUTED and its red observed before this spec is
resubmitted. An earlier draft named a mutant for INV-1 that does not red it,
which is the orphaned-plant defect: a guard whose plant never reds proves
nothing while reading as if it did.

## 5. Why INV-1 cannot live in jsdom

Measured, not argued. With the repair applied AND the sole measurer changed from
`useLayoutEffect` to `useEffect`, a jsdom assertion that the panel is placed
immediately after `render()` STILL PASSES (`top=250px`, expected `250px`).
Testing Library's `act` flushes passive effects synchronously before `render()`
returns, so jsdom cannot discriminate `useEffect` from `useLayoutEffect`.

The consequence generalizes beyond this arc: **any jsdom pin on pre-paint
behaviour is a tautology by construction.** It is not that one mutant was chosen
badly; every mutant is orphaned in that environment. Such a pin is green for the
wrong reason forever, which is worse than a missing pin because it reads as
covered.

INV-1 therefore lives in the browser, where the discriminator is frame ordering:
microtasks run before the rendering update, so a placement applied in the commit
that mounts the panel is observed at the same animation-frame count as the mount,
and one applied after paint cannot be. The case states that as an executable
premise on the instrument itself — a counter that never advanced would make the
comparison true for every implementation — before asserting anything with it.

## 5.1 What counts as one placement, and what counts as one measure

Both counted units are defined here, because a count whose unit is ambiguous
reds on a refactor that changes nothing observable.

**One placement is one CALLBACK BATCH's settled state.** React assigns each
changed style property separately, so a single placement emits one
`MutationRecord` for `left` and another for `top`, and the intermediate
`left: 695px; top: 0px` is a half-applied write rather than a state the panel was
ever laid out at. The ratio of records to placements is not even fixed: a
placement changing only `top` emits one record. A batch ends at a microtask
checkpoint, so its end state is a settled commit, and the half-applied value
correctly counts as neither a placement nor an extra one. Coalescing records
within a task would be the wrong grain in the other direction, since one task can
contain several checkpoints.

**One measure is one anchor-rect read**, because `measureAndApply` reads the
anchor exactly once (`components/admin/AnchoredPortal.tsx:141`). INV-3's case
establishes that 1:1 relation on its own inputs before counting with it, rather
than assuming it.

### Documented limits of the counting instrument

- **One batch is assumed to be one settled commit.** Two React commits flushed
  synchronously with no intervening microtask checkpoint would land in a single
  batch and count as one. This is REACHABLE here rather than theoretical: a
  layout-effect `setState` triggers a synchronous re-render inside the same task.
  The consequence is bounded and stated: INV-4 detects a change in the FINAL
  applied placement, and extra placements separated by a checkpoint. It does not
  distinguish a converged pair of commits from a single commit within one task.
  The convergence claim does not rest on it — that is analytic (§2.2).
  **Status: INFERRED FROM REACT'S SYNCHRONOUS FLUSH, NOT PROBED.** The probe that
  would settle it: force run 3 to compute a different placement and observe
  whether its write shares a batch with run 1's.
- **The half-applied write is never painted, and this IS probed.** On the clean
  tree the held sequence has exactly two entries, so exactly one callback batch
  carried both the `left` and the `top` write, and the mount and the placement
  were observed at the same animation-frame count. The intermediate therefore
  exists only between two synchronous property assignments inside one task, with
  no rendering opportunity between them. There is no visible half-placed frame.

## 6. Guard conditions

The repair adds no prop and changes no signature. The guards it touches:

- `open === false` or `mounted === false`: the ungated effect returns before
  measuring (`components/admin/AnchoredPortal.tsx:255`). Unchanged.
- `anchorRef.current === null` or `panelRef.current === null`:
  `measureAndApply` returns early (`components/admin/AnchoredPortal.tsx:131`).
  Unchanged, and now reached from one caller instead of two.
- A placement that cannot be computed still commits a fallback rather than
  hiding (`components/admin/AnchoredPortal.tsx:157-178`). Unchanged.

## 7. Dimensional invariants

N/A. The repair introduces no fixed-dimension parent with flex or grid children,
and changes no class.

## 8. Transition inventory

States: closed (renders nothing), open-unplaced (the origin, one commit long),
open-placed. The repair changes none, adds none, and applies no animation.

| Pair | Treatment |
| --- | --- |
| closed → open-unplaced | instant; the panel mounts at the origin for one commit and is placed before paint (INV-1) |
| open-unplaced → open-placed | instant; a style write, no transition |
| open-placed → closed | instant; the panel unmounts and `setApplied(null)` clears the placement (`components/admin/AnchoredPortal.tsx:260-263`) |

Compound: a position-only move arriving while the panel is open-placed re-places
it instantly (INV-2). No transition has a duration, so there is no mid-transition
state to interrupt.

## 9. Documented limits

- **A count of 1 may be reachable via `MutationObserver`.** §2.4. Not refuted,
  not taken, re-file trigger recorded there.
- **Pre-paint behaviour is not pinnable in jsdom at all.** §5.
- **The mutation harness cannot run this surface.**
  `tests/mutation/source/mutantOverlay.config.ts` declares `setupFiles` zero
  times, while the repo-root vitest config declares `setupFiles: ["tests/setup.ts"]`
  and `tests/setup.ts:70-81` polyfills `ResizeObserver` because jsdom lacks it.
  UNMUTATED source therefore fails its clean baseline with
  `ReferenceError: ResizeObserver is not defined`, and a surface that cannot pass
  a clean baseline cannot be enrolled. There is no per-run escape: `vitest` has
  no `--setupFiles` flag, so the fix could only be a shared-config edit changing
  the harness for all 56 enrolled surfaces at once. Not taken by this arc.
  **Re-file trigger:** a product arc actually BLOCKED from shipping by this, not
  merely re-shaped by it.
- The live probe establishes agreement between the second and third runs on the
  shipped right-aligned dashboard menu at 1280x720. It does not establish
  agreement over every viewport. The repair does not rest on it: run 2's
  redundancy is analytic (§2.2), and the run that would catch a disagreement is
  the one that stays.

## 10. Out of scope

- `components/admin/useFitWithinClip.ts` (a sibling arc's file; merged work).
- Synthetic DOM mutation outside React.

## Appendix A — probe transcripts

Task 1's evidence, kept in this document rather than a sibling so the two cannot
drift. Run on branch `perf/anchoredportal-measure-convergence` at base
`66c9857f5`.

### A.1 The count, in jsdom

The portal rendered closed, then re-rendered open, counting anchor-rect reads.

```
PROBE closedReads=0 measureRunsOnOpenCommit=3 panelReads=3 settled=(884px,250px) maxH=none
```

`closedReads=0` is the closed-renders-nothing contract holding.
`measureRunsOnOpenCommit=3` reproduces the filed claim at the head this arc
repairs, rather than inheriting it from the filing. `panelReads=3` is the cost
the row names: three `withNaturalSize` passes, so three forced synchronous
reflows per menu open.

### A.2 Whether the three agree, on the live surface

jsdom cannot answer this: it computes no layout, so the three runs are fed
identical stubbed inputs by construction.

```
PROBE-LIVE styleWrites=2 placements=2 sequence=["0px|0px||","695px|1251.47px||"]
```

One placement is applied. The third measure agreed with the second, which makes
it a convergence rather than a flake.

### A.3 Three corrections to the instrument, all found before it was trusted

**It reported a zero it had not measured.** The first cut read
`styleWrites=0 placements=1` and its own premise passed. The observer was
attached per-node from a `childList` callback, a microtask late, so React's
writes had already landed and it recorded nothing. A zero from an instrument
that never fired is indistinguishable from a real zero. The shipped case
registers a SUBTREE observer on `document.body` before the click and asserts a
non-empty log as its own premise.

**It got the right number for a reason that does not generalise.** The second cut
reconstructed history from every record's `now`, each read during the eventual
callback and so reporting the FINAL value: a synchronous `A -> B -> C` reads back
`A, C, C`. Round-1 review raised the mechanism, and the full `oldValue` chain
showed what that had eaten:

```
PROBE-LIVE styleWrites=2 placements=3 sequence=["0px|0px||","695px|0px||","695px|1251.47px||"]
```

React assigns `left` and `top` as separate property writes, so `695px|0px` is a
half-applied write. Neither reading is right, and the shipped grain is per
callback batch (§5.1). The headline figure never moved, which is the point: a
number that is right for a reason that does not generalise is not evidence, and
it survived only because the reviewer attacked the mechanism rather than the
figure.

**The pre-paint pin was inert in jsdom.** With the repair applied AND the sole
measurer changed to `useEffect`, the jsdom assertion still passed (`top=250px`,
expected `250px`). §5 states the consequence.

### A.4 The browser instrument, proved before it was trusted

Clean tree: mount frame 2, placement frame 2, green. Planted with the passive
measurer: `mount was at frame 2 and the placement at 3, so a rendering update ran
in between`, red. Plant reverted and `AnchoredPortal.tsx` verified byte-identical
to `HEAD`.
