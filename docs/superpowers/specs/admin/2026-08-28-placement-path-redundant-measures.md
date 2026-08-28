# The placement path: a free scroll read removed, and a measure cadence parked

**Row:** `BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES` (partial disposition —
site 2 repaired here, site 1 parked, site 3 refuted)
**Branch:** `perf/placement-measure-memo`
**Probe evidence:** appendix A of this document. The row was filed
`**Reachability:** INFERRED, NOT PROBED`, so Task 1 was the probe and this
document is written on its output rather than on the filing.

The row names three sites, and each ends somewhere different. **Site 2 is
confirmed and repaired here. Site 1 is confirmed and PARKED unrepaired after six
adversarial rounds refuted two designs for it (§2). Site 3 is refuted on its own
numbers (§6).**

All three were filed as one class — work on the placement path whose result is
already known — and the class was right. What separated them is not whether the
waste is real but whether removing it can be shown safe: site 2's removal is an
argument about two lines of arithmetic, and site 1's needed a predicate that
decides, without measuring, that measuring is unnecessary.

## 1. What the probe measured

Three numbers, all from appendix A, all reproduced at this branch's base. **The
probe is the reason this arc exists in the shape it does**: the row was filed
`Reachability: INFERRED, NOT PROBED`, so measuring came before designing, and two
of the three dispositions below were settled by measurement rather than by review.

| Site | Filed claim | Measured | Disposition |
| --- | --- | --- | --- |
| 1 | every placement-changing gesture frame costs TWO measures | **2** on a changing frame, **1** on an unchanged one, on both the ancestor-scroll and the window-resize trigger | CONFIRMED, and PARKED unrepaired — §2 |
| 2 | `lib/popover/naturalSize.ts:70-71` reads the scroll offsets after the cap-restore writes | **2** scroll reads land strictly after the last cap-restore write, on a panel whose held offsets are both zero | CONFIRMED, repaired in §3.2 — the whole of what ships |
| 3 | the zoom-hidden fallback can spend up to two wrap probes | **0** when `zoomed` hides at a step-1 gate, **1** on a vertical-only visual inset, **1** on the ordinary placed path | REFUTED in the reachable domain, §6 |

**A "measure" in this document is one `withNaturalSize` pass**
(`lib/popover/naturalSize.ts:31`). That is the unit the cost lives in: the pass
clears both `el.style` caps (`lib/popover/naturalSize.ts:39-40`), reads the
panel's rect, may run `heightAtWidth`, which writes a cap and reads the rect again
(`lib/popover/naturalSize.ts:46-51`), and restores both caps
(`lib/popover/naturalSize.ts:68-69`). Every one of those write-then-read pairs is
a forced synchronous layout, and §3.2 removes two reads from the end of it on the
path almost every measurement takes.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Site 1 is PARKED, not deferred and not refuted. Its defect is confirmed and its two candidate designs were refuted across six adversarial rounds. Re-opening it requires BOTH a probe-domain measurement of the standing cost AND a design that closes the arithmetic class — not another sharpening of the same predicate. | §2; `BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES` in `BACKLOG.md`; `docs/review-rounds/perf/placement-measure-memo/b608e71b32b5.md`; orchestrator ruling 2026-08-28 |
| This arc does not touch `components/admin/AnchoredPortal.tsx` at all, so the predecessor arc's `INV-3` contract and its `MutationObserver` decision are both untouched by construction rather than by argument. | §10; `docs/superpowers/specs/admin/2026-08-27-anchoredportal-measure-convergence.md` §2.2.1, §2.4 |
| Site 3 is refuted, not deferred. It gets no repair and no backlog row, and carries a re-file trigger. | §6 |
| `lib/popover/place.ts` and `lib/popover/position.ts` are read but not modified. | §6, §10 |
| jsdom is the whole instrument for what ships. Site 2's invariant is a read/write ORDER, which jsdom observes exactly; there is no browser pin because none is needed. | §5 |

## 2. Site 1 is parked, and this section is the pointer to why

Site 1 — the second `withNaturalSize` pass on every placement-changing gesture
frame — is **confirmed, unrepaired and PARKED**. It is not refuted: the probe
reproduced it and a mutant at the probe proved the instrument discriminates
(appendix A.1, A.2).

What it lacks is a safe way to skip that pass. Two designs were carried through
six adversarial rounds and both were defeated on their own premise — an
enumeration of the causes that can move a measurement, then an observation of the
measurement itself. The full record is
`docs/review-rounds/perf/placement-measure-memo/b608e71b32b5.md`; the park entry,
with the re-file trigger, is `BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES` in
`BACKLOG.md`.

**Nothing in this spec proposes a guard for it.** The material that did — §2's
mechanism, §3.1's key, INV-A through INV-E and INV-I through INV-M, and their
criteria — was removed rather than weakened, because a design that six rounds
refuted should not survive as prose someone later mistakes for a plan. The park
entry carries what a future attempt needs.

## 3. The repair


### 3.2 Site 2 — do not read a scroll offset that cannot have changed

`lib/popover/naturalSize.ts:70-71` restores the scroll offsets by comparing the
live value against the held one. Both comparisons read the element after the cap
writes at `lib/popover/naturalSize.ts:68-69`, so both force layout.

**When the held offset is 0 the read is provably a no-op.** Clearing the caps can
only remove a scroll range, never create one, so the offset can only be clamped
DOWNWARD during the pass. From 0 there is nowhere down to go. Restoring the cap
does not move the offset back up. So `el.scrollTop` is 0 at line 70 whenever
`heldScrollTop` was 0, and the write is skipped in every case the read could
report.

The repair short-circuits on the held value:

```ts
if (heldScrollTop !== 0 && el.scrollTop !== heldScrollTop) el.scrollTop = heldScrollTop;
if (heldScrollLeft !== 0 && el.scrollLeft !== heldScrollLeft) el.scrollLeft = heldScrollLeft;
```

`&&` short-circuits, so on the unscrolled path neither `el.scrollTop` nor
`el.scrollLeft` is read at all and both forced layouts disappear. The scrolled
path is byte-for-byte the behaviour it has today.

**`scrollLeft` is repaired alongside `scrollTop` although the row names only
`scrollTop`.** It is the same defect one line down, in the same function, in the
same `finally` block. The class-sweep default is that every instance of one shape
is repaired in the same PR, and none of the three deferral exceptions applies to
a sibling line.

**The unscrolled case is the common one, not an edge.** The panel is scrolled
only when it is capped AND the user or a keyboard reveal has scrolled inside it.
Every measurement of every uncapped popover on every surface that composes this
helper takes the path this repair makes free.

## 4. Invariants

| Id  | Invariant                                                                     | Deciding case                                       | Mutant that reds it                |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| INV-F | An unscrolled panel's measurement reads neither scroll offset after the cap restore | `tests/components/naturalSize.test.ts` order-trace case | drop either `!== 0` short-circuit |
| INV-G | A scrolled panel's offsets are still restored                                 | the merged cases at `tests/components/naturalSize.test.ts:45` and `tests/components/naturalSize.test.ts:59` | invert either short-circuit |

**Two invariants, and that is the whole shipped contract.** INV-A through INV-E
and INV-H through INV-M belonged to site 1's guard and left with it (§2). They are
not weakened or deferred — the design they pinned was refuted, so keeping their
rows would describe a mechanism this spec no longer proposes.

**INV-F and INV-G are a pair on purpose.** One says a read disappears on the
unscrolled path; the other says the scrolled path is untouched. Either alone
admits a repair that satisfies it and breaks the other: deleting the restore
entirely satisfies INV-F, and leaving the function alone satisfies INV-G.

## 5. What the instrument can and cannot establish

**jsdom is the whole instrument for what ships, and that is a property of the
claim rather than a compromise.** Site 2's invariant is an ORDER — that no scroll
offset is read after the cap-restore writes — and an order over calls on one
element is exactly what jsdom observes exactly. There is no browser pin because
none would add anything: a real layout engine would not make the ordering more
true.

**What jsdom cannot establish is that the removed read was a forced layout.** It
computes no layout, so "this read forces a reflow" is not observable there. That
step is mechanical rather than measured: a style write followed by a geometry read
on the same element forces synchronous layout in every engine that implements
layout invalidation, and INV-F pins the order, which is the property the repair
changes. It does not pin a timing, and §3.2 does not claim one.

**Two browser instruments were designed for site 1 and both were refuted before
anything shipped.** They are recorded here because the next attempt will reach for
them: a panel-rect counter cannot distinguish the designs at all (today two passes
and two reads; with a guard, one pass plus the guard's own read, also two), and a
cap-clear counter counts zero on this surface because the row-actions portal FITS
and carries no cap, which the merged case asserts outright
(`tests/e2e/rowactions-geometry.spec.ts:689-697`). Both were found by review, not
by running them.

### 5.1 Documented limits

- **The suite counts calls and orders, never cost.** INV-F is a claim about which
  reads happen and when, and says nothing in milliseconds.
- **The unscrolled path is the one pinned.** INV-G asserts the scrolled path is
  UNCHANGED, which is a different and weaker statement than asserting it is
  correct; its correctness is the merged scroll-clamp suite's subject, not this
  arc's.

## 6. Site 3, refuted

The row claims `lib/popover/place.ts:120-122` can run `computePopoverPlacement`
twice on the zoom-hidden fallback path, with each call potentially invoking
`wrappedHeightAt`, for up to two extra write-read reflow pairs.

**The two-probe case exists but is not reachable, and the reason is structural.**
`computePopoverPlacement` has eight `HIDDEN` returns
(`lib/popover/position.ts:104-121`). Seven of them precede the wrap probe at
`lib/popover/position.ts:120`. The eighth, and the only one that can follow it,
fires when the wrap result is non-finite or non-positive
(`lib/popover/position.ts:121`) — a panel that is detached or not yet laid out.

So the fallback at `lib/popover/place.ts:122` is taken in two regimes and neither
costs what the row claims:

| Regime | Probes in the `zoomed` call | Probes in `legacy()` | Total |
| --- | --- | --- | --- |
| `zoomed` hides at a step-1 gate (the trigger falls outside the zoomed viewport) | 0 | 0 or 1 | at most 1 |
| `zoomed` hides on a degenerate wrap result | 1 | 0 or 1 | up to 2 |
| no fallback at all (`zoomed` is placed) | 0 or 1 | not called | at most 1 |

Measured (appendix A.3): step-1 hide **0**, vertical-only visual inset **1**,
ordinary placed control **1**. The two-probe total was reproduced only by a
fixture whose `wrappedHeightAt` returns 0 at the narrow width — the degenerate
regime, where the panel is already unplaceable and the surface recovers on the
next frame like every other hidden cause.

**A memo would not have helped even there.** The two probes ask for DIFFERENT
widths — 384 and 984 in appendix A.3 — because the two calls differ precisely in
their bounds. A width-keyed cache dedupes only when the visual and layout bounds
share a width, and in that regime `zoomed` is placed and there is no second call
to dedupe (appendix A.3 case D).

**Re-file trigger:** a `wrappedHeightAt` implementation that can return a
non-finite or non-positive height for a panel that is laid out and placeable,
which is the one input that makes the two-probe regime reachable. Constructing a
fixture that returns 0 is not that trigger; the fixture is how this refutation
was measured, and treating it as a reachability argument would be
recognizer-widening.

## 7. Guard conditions

**This arc adds no state, no prop and no branch.** `withNaturalSize`'s signature,
its callers and its return are unchanged; the repair short-circuits two
conditionals inside one `finally` block. So there is no prop table to write, and
saying so explicitly is the point rather than an omission.

The one input worth stating is the held offset itself:

| `heldScrollTop` / `heldScrollLeft` | When | Behaviour |
| --- | --- | --- |
| `0` | any panel that has not been scrolled — every uncapped popover, and every capped one the user has not scrolled inside | the offset is NOT read after the cap restore, and no write is attempted |
| non-zero | a capped panel scrolled by the user or by a keyboard reveal | byte-for-byte today's behaviour: read, compare, write back if it moved |

Neither can be `NaN`, `null` or `undefined`: both are read from a live element's
`scrollTop`/`scrollLeft` at `lib/popover/naturalSize.ts:35-36`, which the DOM
defines as numbers, and a detached element reports `0` — which takes the
short-circuit path correctly, since a detached element has no scroll range to
restore.

## 8. Dimensional invariants, transition inventory

**Neither applies, and both are checked rather than waved.** This arc adds no
element, no class, no layout relationship and no visual state — the diff is two
`&&` operands inside a helper's `finally` block, plus tests. The panel's box, its
placement and its rendered output are byte-identical before and after on every
path, which is what makes the absence a fact rather than a claim: a change that
altered any dimension would have to alter the placement, and §3.2's argument is
precisely that the removed reads cannot.

## 9. Acceptance criteria

- **AC-6** — an unscrolled measurement reads neither scroll offset after the cap
  restore, and a scrolled measurement still restores both. The two halves are one
  criterion because a repair satisfying either alone is wrong: deleting the
  restore satisfies the first, and changing nothing satisfies the second.
- **AC-10** — the invariant-8 dual gate is `N/A — no UI surface`, and that is now
  a fact rather than a dodge: with site 1 parked this arc edits
  `lib/popover/naturalSize.ts` and its tests, and nothing under `components/` or
  `app/`. Verified against the marker grammar at
  `tests/docs/_invariant8Closeout.ts:46`. The row is dispositioned in `BACKLOG.md`
  in the PR's last commit, where its `IN PROGRESS` marker also comes off.

**AC-1 through AC-5 and AC-7 through AC-9 left with site 1's guard**, along with
AC-11 through AC-14. §2 says why, and the numbering is deliberately NOT compacted:
a future attempt reading the park record and the round corpus should find the same
ids it will see cited there.

## 10. Out of scope

- **Site 1, the second pass on a gesture frame.** Parked, not deferred — §2 and
  the `BACKLOG.md` entry carry the record and the re-file trigger.
- `components/admin/AnchoredPortal.tsx`. This arc does not touch it, which is what
  makes AC-10's `N/A` true.
- `lib/popover/place.ts` and `lib/popover/position.ts` (§6 refutes the only filed
  reason to touch them).
- Every popover surface other than `AnchoredPortal` that composes
  `withNaturalSize`: they inherit site 2's repair without a per-surface pin,
  because the repair is inside the shared helper. That is the reach the shipped
  change actually has, and it is larger than the site it was filed against —
  `HoverHelp`, `PublishedToggle`, `ReSyncButton` and `ShareHub` all measure
  through it.

## Appendix A — probe transcripts

Run on branch `perf/placement-measure-memo` at base `b608e71b3`. Probe sources
are reproduced in the plan's task bodies, where they become the shipped cases.

### A.1 Site 1, the count per gesture frame, in jsdom

```
openTop=250px expectedOpenTop=250px
unchangedFrameReads=1 topAfterA=250px
changedFrameReads=2 topAfterB=190px expectedTopB=190px
changedResizeReads=2
```

The premises are asserted in the probe, not read off it: the open transition
placed the panel at the stubbed anchor, frame A changed nothing, frame B DID
change the placement. Without those a count of 2 could be two calls that both
bailed.

### A.2 The mutant at the probe

The probe was not trusted before it was broken. Gating the ungated every-commit
effect with a dependency array — the shape of the defect the probe claims to
measure — took `changedFrameReads` from 2 to 1 and `changedResizeReads` from 2 to
1, and the case red on the count assertion rather than on a premise. The mutant
was reverted and `components/admin/AnchoredPortal.tsx` verified byte-identical to
`HEAD`.

That mutant was never a candidate repair — it reaches the same count by deleting
the position-only guarantee the predecessor arc's INV-2 protects. It is the
negative control that proves the probe discriminates the pass it counts, and it is
kept here because it is the evidence site 1's defect is REAL, which is what
separates a park from a refutation.

### A.3 Sites 2 and 3

```
S2 trace=["get scrollTop","get scrollLeft","write style.maxWidth","write style.maxHeight","write style.maxWidth","write style.maxHeight","get scrollTop","get scrollLeft"]
S2 scrollTopGets=2 scrollLeftGets=2 scrollReadsAfterLastCapWrite=2

S3-A zoomedKind=hidden outKind=placed wrapCalls=0 widths=[]
S3-B zoomedKind=hidden outKind=placed wrapCalls=2 widths=[384,984]
S3-D zoomedKind=placed outKind=placed wrapCalls=1 widths=[984]
S3-C outKind=placed wrapCalls=1 widths=[384]
```

The S2 trace is the whole argument for site 2: the two held reads at the top, the
cap clear, the cap restore, and then two more scroll reads AFTER the last write.
On this element both held offsets are 0, so both trailing reads are no-ops that
force layout.

S3-A is the reachable zoom-hidden regime and it spends nothing. S3-B is the
degenerate regime, reproduced only with a `wrappedHeightAt` that returns 0 below
500px. S3-D is a vertical-only visual inset, where `zoomed` is placed and there is
no fallback. S3-C is the ordinary placed control.
