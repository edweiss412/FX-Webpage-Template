# AnchoredPortal: the converged measure count on an open transition

**Row:** `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`
**Branch:** `perf/anchoredportal-measure-convergence`
**Probe evidence:** [`docs/superpowers/specs/admin/probes/2026-08-27-anchoredportal-measure-convergence-probe.md`](./probes/2026-08-27-anchoredportal-measure-convergence-probe.md)

`components/admin/AnchoredPortal.tsx` runs `measureAndApply` three times for one
closed to open transition. Two of those three are the design working; one is
not. This spec states which, why the number cannot go lower, and what pins it.

## 1. The converged count is 2

Stated first because everything else is its derivation.

**One closed to open transition runs `measureAndApply` exactly twice.** Run 1 is
the pre-paint placement on the open commit. Run 2 is the ungated every-commit
effect evaluating on the first commit after that placement. The third run in the
current code is removed.

Two is a floor met by a ceiling, not a target chosen for it.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The ungated every-commit effect is a named invariant of the design, not a redundancy. It is the only subscription that catches a position-only anchor move. | `components/admin/AnchoredPortal.tsx:245-253`; INV-2 below |
| The count is 2 and not 1. Run 3 is not separable from the position-only guarantee. | §2.1 |
| `IntersectionObserver` does not replace measuring per commit, in either its plain or self-rearming form. | §2.3 |
| The `useFitWithinClip` measure-class work is merged and its count is closed. This arc does not touch `components/admin/useFitWithinClip.ts`. | Row `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`, class-sweep exception (c) |
| The repair removes a MEASURE, not a placement. The applied placement sequence is unchanged, and the live case asserts that. | §4, INV-4 |
| No enrolled mutation surface is touched. `tests/mutation/source/registry.ts` holds no `sourcePath` for `AnchoredPortal.tsx` or `lib/popover/**`. | Verified at Stage 0 |

## 2. Why 2 is forced

### 2.1 The floor is 2

`ResizeObserver` reports SIZE. Its `contentRect` origin is relative to the
element's own padding box, so a pure translation of the anchor changes nothing
it observes. A background `router.refresh()` that reorders rows without changing
any dimension therefore moves the anchor under a panel that is a `document.body`
child holding absolute document coordinates, and no size-based subscription
fires.

The ungated effect (`useLayoutEffect` with no dependency array,
`components/admin/AnchoredPortal.tsx:254`) is the only thing that catches this,
and the way it catches it is by running on every commit and measuring. The
commit immediately after the open placement is an ORDINARY commit. Nothing
distinguishes it from a refresh that reordered the rows except a measurement.

So the third run is not a convergence step sitting beside the guarantee that
could be dropped while keeping it. It IS the guarantee, evaluated on the first
commit after the open. The floor is one pre-paint measure plus that one.

### 2.2 The ceiling is 2

The open commit carries both measures: the gated effect
(`components/admin/AnchoredPortal.tsx:191`) and the ungated one both cover it.

Nothing mutates the DOM between them. No re-render intervenes, nothing paints,
and the only style writes either makes are `withNaturalSize`'s cap clear
(`lib/popover/naturalSize.ts:39-40`) and its restore (`lib/popover/naturalSize.ts:68-69`), which cancel
inside each call. Run 2's inputs are therefore identical to run 1's BY
CONSTRUCTION, its computed placement is identical, and `commit`
(`components/admin/AnchoredPortal.tsx:115`) drops it.

This is analytic, not measured. It holds for any surface, viewport and fixture.
The probes showed 3 on two configurations; this explains why 2 is enough on all
of them.

Ceiling meets floor, so 2 is determined.

### 2.3 The alternatives, killed by name

Both are fenced here so a reviewer verifies them instead of re-deriving them.

**Plain `IntersectionObserver` on the anchor, rooted at the viewport, with any
threshold list.** IO fires on threshold CROSSINGS, not on geometry change. A row
reorder that moves a fully-visible anchor 40px down holds `intersectionRatio` at
exactly 1.0 before and after, so no threshold is crossed and no callback fires.
That is the guarantee's own case, so this form is dead on the first move it
would need to catch.

**The self-rearming position observer** (the sticky-header technique): compute
`rootMargin` from the anchor's current rect so the element sits exactly at the
root boundary, so any movement in any direction crosses it; on each fire,
re-measure and re-arm with a fresh margin. This defeats the ratio-stays-1.0
objection by construction, and it still fails, for three independent reasons:

1. **It cannot deliver a pre-paint guarantee.** IO queues its callback to run
   after paint, by construction. The ungated layout effect re-places in the same
   commit, before paint. An after-paint mechanism reintroduces exactly the defect
   `components/admin/AnchoredPortal.tsx:245-253` describes, for one frame: the
   panel visibly belonging to a different row. This is a correctness argument,
   not a performance one, and it alone is decisive.
2. **Re-arming requires a measurement.** Each fire must read the anchor's rect to
   compute the next `rootMargin`. The per-commit read is relocated, not removed,
   and the observer additionally fires on scroll, where the existing coalesced
   scroll listener already re-places.
3. **`rootMargin` quantizes to integer pixels** against a sub-pixel anchor. The
   live probe measured the panel at `top: 1251.47px`. A hugging margin is then
   either permanently short of ratio 1.0, firing continuously, or leaves a dead
   zone up to 1px in which an anchor drift goes undetected. A 1px misalignment is
   visible on a menu that must line up with a row.

Underneath all three: the anchor move IS a React commit. IO would be a second,
worse notification channel for an event React already reports synchronously.
Measuring per commit is not merely necessary, it is the natural place to do it.

## 3. The repair

Delete the gated effect's own `measureAndApply()` call
(`components/admin/AnchoredPortal.tsx:193`). The ungated effect becomes the sole
measurer. The gated effect keeps its subscription wiring and teardown unchanged.

**Rejected alternative: a ref flag** set by the gated effect and cleared by the
ungated one, so the ungated one skips the commit the gated one already measured.
It reaches the same count of 2, but only while the gated effect is declared
FIRST. That is precisely the silent declaration-order coupling the row warns
against, and it adds state in order to remove a call.

**The pre-paint guarantee after the repair.** It rests on the ungated effect
having no dependency array — a single named property of one effect, not a
relationship between two. A `useLayoutEffect` with no deps runs in every commit's
layout phase, including the one that mounts the panel, so the placement is
applied before paint wherever that effect is declared. Reordering the two effects
changes neither the count nor the timing.

That property is load-bearing and a reader could plausibly delete it by adding a
dependency array as an optimization, so INV-1 pins it behaviorally rather than
leaving it to the comment.

## 4. Invariants, each with its own case

| Id | Invariant | Deciding case | Mutant that reds it |
| --- | --- | --- | --- |
| INV-1 | On the open commit the panel is placed before paint | jsdom: placement observable synchronously after render, no frame flushed | give the ungated effect a dependency array |
| INV-2 | An anchor that moves without changing size re-places the panel | jsdom position-only move | delete the ungated effect |
| INV-3 | One closed to open transition runs `measureAndApply` exactly twice | jsdom measure counter | restore the gated effect's `measureAndApply()` call |
| INV-4 | The repair removes a measure, not a placement | live `PROBE:` case in `tests/e2e/rowactions-geometry.spec.ts` | any change to the applied placement sequence |

INV-2 already has a case at
`tests/components/admin/rowActions/anchoredPortal.test.tsx:266`; this arc keeps
it and adds the mutant proof the brief requires.

## 5. Guard conditions

The repair adds no prop and changes no signature, so the prop guard table is
unchanged. The one guard the repair touches is the effect body's own:

- `open === false` or `mounted === false`: the ungated effect returns before
  measuring (`components/admin/AnchoredPortal.tsx:255`). Unchanged.
- `anchorRef.current === null` or `panelRef.current === null`:
  `measureAndApply` returns early (`components/admin/AnchoredPortal.tsx:131`). Unchanged, and now reached from one
  caller instead of two.
- A placement that cannot be computed still commits a fallback rather than
  hiding (`components/admin/AnchoredPortal.tsx:157-178`). Unchanged.

## 6. Dimensional invariants

N/A. The repair introduces no fixed-dimension parent with flex or grid children,
and changes no class. The panel's `maxHeight`/`maxWidth` continue to come from
the placement core.

## 7. Transition inventory

The component's visual states are: closed (renders nothing), open-unplaced (the
origin, one commit long), open-placed. The repair changes none of them, adds
none, and applies no animation. Every pair is instant, as today:

| Pair | Treatment |
| --- | --- |
| closed → open-unplaced | instant; the panel mounts at the origin for one commit and is placed before paint (INV-1) |
| open-unplaced → open-placed | instant; a style write, no transition |
| open-placed → closed | instant; the panel unmounts and `setApplied(null)` clears the placement (`components/admin/AnchoredPortal.tsx:260-263`) |

Compound: a position-only move arriving while the panel is open-placed re-places
it instantly (INV-2). There is no mid-transition state for it to interrupt,
because no transition has a duration.

## 8. Documented limits

- The live probe establishes that run 3 agreed with run 2 on the shipped
  right-aligned dashboard menu at a 1280x720 viewport. It does not establish
  agreement over every viewport. This does not weaken the repair: the repair
  removes run 2, whose redundancy is analytic (§2.2), and keeps the run that
  would catch a disagreement.
- The count is asserted for a closed to open transition. Commits that follow,
  driven by scroll, resize or a refresh, each measure once by design; bounding
  those is not this arc's subject and the existing family-C case already pins
  that the cadence is not per-frame.

## 9. Out of scope

- `components/admin/useFitWithinClip.ts` (a sibling arc's file; merged work).
- Synthetic DOM mutation outside React.
