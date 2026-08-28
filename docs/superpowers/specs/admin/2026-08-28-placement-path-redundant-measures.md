# The placement path: one natural-size pass per placement-changing frame

**Row:** `BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES`
**Branch:** `perf/placement-measure-memo`
**Probe evidence:** appendix A of this document. The row was filed
`**Reachability:** INFERRED, NOT PROBED`, so Task 1 was the probe and this
document is written on its output rather than on the filing.

The row names three sites. **Two are confirmed and repaired here; the third is
refuted and closed with its numbers** (§6). Sites 1 and 2 are one class in two
places: work done on the placement path whose result is already known.

## 1. What the probe measured

Three numbers, all from appendix A, all reproduced at this branch's base.

| Site | Filed claim | Measured | Disposition |
| --- | --- | --- | --- |
| 1 | every placement-changing gesture frame costs TWO measures | **2** on a changing frame, **1** on an unchanged one, on both the ancestor-scroll and the window-resize trigger | CONFIRMED, repaired in §3.1 |
| 2 | `lib/popover/naturalSize.ts:70-71` reads the scroll offsets after the cap-restore writes | **2** scroll reads land strictly after the last cap-restore write, on a panel whose held offsets are both zero | CONFIRMED, repaired in §3.2 |
| 3 | the zoom-hidden fallback can spend up to two wrap probes | **0** when `zoomed` hides at a step-1 gate, **1** on a vertical-only visual inset, **1** on the ordinary placed path | REFUTED in the reachable domain, §6 |

**A "measure" in this document is one `withNaturalSize` pass**
(`lib/popover/naturalSize.ts:31`). That is the unit the cost lives in: the pass
clears both `el.style` caps (`lib/popover/naturalSize.ts:39-40`), reads the
panel's rect,
`panel.getBoundingClientRect` (`components/admin/AnchoredPortal.tsx:143`), may
run `heightAtWidth`, which
writes a cap and reads the rect again (`lib/popover/naturalSize.ts:46-51`), and
restores both caps (`lib/popover/naturalSize.ts:68-69`). Every one of those
write-then-read pairs is a forced synchronous layout.

**It is NOT the unit the predecessor arc counted**, and the difference is the
whole reason this arc does not contradict that one. See §1.1.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| This arc does NOT change the merged `INV-3` contract. That invariant counts ANCHOR READS — one `anchor.getBoundingClientRect` per `measureAndApply` call (`components/admin/AnchoredPortal.tsx:141`) — and pins that the position-only guarantee EVALUATES exactly twice per open. After this repair the ungated effect still runs and still reads the anchor rect, so that count is unchanged at 2. What changes is what the second evaluation COSTS. | `docs/superpowers/specs/admin/2026-08-27-anchoredportal-measure-convergence.md` §2.2.1 and its INV-3 row; AC-4 below asserts the existing case stays green |
| Reaching a count of 1 for the predecessor's unit still requires the `MutationObserver` redesign that arc declined. This arc does not take it and does not claim to. | `docs/superpowers/specs/admin/2026-08-27-anchoredportal-measure-convergence.md` §2.4, §2.2.1 |
| The ungated every-commit effect is kept. It is the only shipped subscription that catches a position-only anchor move, and this repair makes it cheaper rather than rarer. | `components/admin/AnchoredPortal.tsx:251-260` (the rationale comment); the predecessor's INV-2 |
| The guard is on the ungated effect's call site ONLY, never inside `measureAndApply` for every caller. A global rect memo would swallow viewport changes that move no anchor. | §3.1, "Why the guard is not global" |
| Site 3 is refuted, not deferred. It gets no repair, no backlog row, and a re-file trigger. | §6 |
| jsdom is the instrument for a CALL-COUNT and CALL-ORDER question and a real browser is the instrument for the shipped pin. Neither substitutes for the other. | §5; orchestrator ruling 2026-08-28 |
| `lib/popover/place.ts` and `lib/popover/position.ts` are read but not modified by this arc. | §6, §8 |

## 2. Why the second measure exists, and why it is free to skip

### 2.1 Site 1, mechanically

During a scroll or pinch, every event reaches `coalescer.schedule()`
(`components/admin/AnchoredPortal.tsx:202-205`) and the rAF callback runs
`measureAndApply` (`components/admin/AnchoredPortal.tsx:201`). That is measure
one. If the anchor moved, the placement differs, `commit`
(`components/admin/AnchoredPortal.tsx:115`) stores it, React re-renders the
portal, and the ungated every-commit effect
(`components/admin/AnchoredPortal.tsx:261`) runs `measureAndApply` again. That is
measure two.

Measure two's inputs are identical to measure one's. Nothing moved the anchor
between them: the only DOM writes in between are React's style assignment for
the new placement and `withNaturalSize`'s own cap clear and restore, which cancel
inside the call. So measure two recomputes measure one's answer, `commit` drops
it, and no further render follows. **It is a whole natural-size pass spent to
learn a value already held.**

On a frame where the placement does NOT change there is no commit, so the ungated
effect never runs and the cost is one measure. That is the appendix A.1 control:
`unchangedFrameReads=1`.

### 2.2 What the ungated effect is actually for

It catches a position-only anchor move — a `router.refresh()` that reorders rows
without changing any dimension. `ResizeObserver` reports size and cannot see a
translation, so nothing else catches it.

The effect answers one question: **has the anchor moved since the last
measurement?** Today it answers by recomputing the entire placement and throwing
the answer away when it matches. It can answer the same question by reading the
anchor's rect and comparing, which is one rect read against a whole natural-size
pass.

## 3. The repair

### 3.1 Site 1 — the ungated effect skips a pass when the anchor has not moved

`measureAndApply` records the trigger rect it measured from in a ref. The ungated
effect calls it in a mode that reads the anchor rect, compares it to that ref,
and returns before `withNaturalSize` when the two are equal. The coalescer's call
site is unchanged and always measures.

Concretely:

- a `lastTriggerRef` holding the `Rect` of the most recent COMPLETED measurement,
  or `null`;
- `measureAndApply` takes one optional argument, `{ skipIfAnchorUnmoved?: boolean }`;
  the early return sits AFTER the existing null-ref guard
  (`components/admin/AnchoredPortal.tsx:131`) and AFTER the trigger-rect read
  (`components/admin/AnchoredPortal.tsx:141`), and BEFORE `withNaturalSize`
  (`components/admin/AnchoredPortal.tsx:142`);
- the ref is written on the PLACED branch only
  (`components/admin/AnchoredPortal.tsx:179`), never on a skip and never on the
  degenerate `kind === "hidden"` fallback
  (`components/admin/AnchoredPortal.tsx:157`);
- the ungated effect calls `measureAndApply({ skipIfAnchorUnmoved: true })`;
- the coalescer is constructed as `createRafCoalescer(() => measureAndApply())`,
  written as an explicit arrow so the no-skip intent is visible at the call site
  rather than resting on `createRafCoalescer`'s `run: () => void` signature
  (`lib/popover/rafCoalescer.ts:16`) passing no argument;
- the ref is reset to `null` in the same effect that discards the placement on
  close (`components/admin/AnchoredPortal.tsx:267-270`).

**Rect equality is exact numeric equality on all six fields** of `Rect`
(`lib/popover/position.ts`, the `Rect` type): `left`, `top`, `width`, `height`,
`right`, `bottom`. No epsilon. A sub-pixel anchor move is a real move and the
panel should follow it; an epsilon would introduce a drift class that does not
exist today, which is a strictly worse trade than one extra measure.

**Why the hidden branch does not record.** A measurement of a detached or
not-yet-laid-out panel commits the fallback anchor and is expected to recover
(`components/admin/AnchoredPortal.tsx:157-163`). Recording its rect would be
sound on the narrow argument that the follow-up run has byte-identical inputs and
would reach the same fallback anyway — but it would leave the ref meaning
`a rect some measurement saw`, which is not a statable invariant. **Recording only on the
placed branch gives the ref one meaning: the placement currently applied was
computed from this rect.** That is the property the guard needs, and it is the
reason to prefer it over the argument that both are safe.

The degenerate case therefore costs what it costs today: the follow-up run
measures, reaches the same fallback, and `commit` drops it, so no further render
follows and the sequence terminates. INV-J is that case.

**Why the reset on close is load-bearing, not defensive.** After the predecessor
arc the ungated effect is the SOLE measurer of the open commit. If the ref
survived a close, reopening a menu whose trigger sits at the identical rect
would skip the only measurement of that open and the panel would render at the
unplaced origin. AC-3 is that case, and it is the deciding case for the reset.

**The pre-paint guarantee is untouched.** After the predecessor arc the ungated
effect is the sole measurer of the open commit, and it is a `useLayoutEffect`, so
the placing measurement still runs before paint. The guard can only skip a run
that follows a commit — never the first one, because the close reset leaves the
ref `null`. The predecessor's INV-1 case is unmodified and stays green (AC-4).

**Why the guard is not global.** Placement is a function of the trigger rect, the
panel's natural size, AND the viewport. Inside `measureAndApply` the guard would
also gate the coalescer, and a window resize that grows the viewport downward can
change `maxHeight` while leaving the trigger's rect untouched — the guard would
skip a measurement that was needed. On the ungated effect's path that cannot
happen: viewport changes arrive as `resize` and `visualViewport` events
(`components/admin/AnchoredPortal.tsx:230-235`) and panel size changes arrive as
`ResizeObserver` callbacks (`components/admin/AnchoredPortal.tsx:236`), and all
three route through the coalescer, which does not skip. The anchor rect is the
complete key for THAT path and for no other, which is why the guard lives at that
call site.

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

| Id | Invariant | Deciding case | Mutant that reds it |
| --- | --- | --- | --- |
| INV-A | A placement-CHANGING gesture frame runs exactly one `withNaturalSize` pass | jsdom pass counter, ancestor scroll with the anchor moved | delete the `skipIfAnchorUnmoved` early return |
| INV-B | A placement-UNCHANGED gesture frame runs exactly one pass | the same case, anchor not moved | (control; reds if the coalescer path is wrongly gated) |
| INV-C | A closed to open transition still places the panel when the trigger is at the rect the previous open used | jsdom reopen case | delete the `lastTriggerRef` reset on close |
| INV-D | A position-only anchor move still re-places the panel | the merged predecessor case at `tests/components/admin/rowActions/anchoredPortal.test.tsx:266` | make the guard compare nothing, or compare only `width`/`height` |
| INV-E | The predecessor's anchor-read count on an open transition is unchanged at 2 | the merged case at `tests/components/admin/rowActions/anchoredPortal.test.tsx:404` | move the early return BEFORE the trigger-rect read |
| INV-F | An unscrolled panel's measurement reads neither scroll offset after the cap restore | `lib/popover/naturalSize.ts` order-trace case | drop either `!== 0` short-circuit |
| INV-G | A scrolled panel's offsets are still restored | the merged scroll-clamp cases | invert either short-circuit |
| INV-H | The gesture path runs one pass per placement-changing frame in a REAL browser | `tests/e2e/rowactions-geometry.spec.ts`, the gesture measure-count case | delete the early return |
| INV-I | The sequence of applied placements over a gesture is unchanged by the repair | jsdom placement-sequence case over a multi-frame gesture | make the guard skip when the anchor HAS moved |
| INV-J | A measurement that returns `kind: "hidden"` does not arm the guard, and the follow-up run terminates without a further render | jsdom degenerate-panel case | record the trigger rect on the hidden branch as well |

**INV-E is the one that keeps this arc honest with the merged contract**, and it
is why the early return is specified to sit AFTER the trigger-rect read rather
than before it. Moving it earlier would be a cheaper skip and would silently
convert the predecessor's `the guarantee evaluates twice per open` into
`it evaluates once`, which is a contract change dressed as an optimization.

## 5. What each instrument can and cannot establish

**jsdom establishes the COUNT and the ORDER.** Both confirmed claims are about
how many times a function runs and in what order reads and writes are issued.
Neither needs layout, and jsdom's absence of layout is what makes the count
observable in isolation: its `ResizeObserver` is a no-op stub
(`tests/setup.ts:70-81`), so observer-delivered measures do not contaminate the
figure. The same reason means these counts are NOT browser totals.

**jsdom cannot establish that the skipped pass would have been a forced layout.**
It computes no layout, so "this read forces a reflow" is not observable there. It
IS mechanically true of the ORDER jsdom does observe: a style write followed by a
geometry read on the same element forces synchronous layout in every engine that
implements layout invalidation. INV-F pins the order, which is the property the
repair changes; it does not pin a timing.

**The real browser is the shipped pin for the gesture path.** `INV-H` extends the
existing `PROBE:` case (`tests/e2e/rowactions-geometry.spec.ts:441`) to a scroll
of the panel's ancestor rather than an open transition. jsdom found the defect;
the browser is what pins that the repair holds on the surface an admin actually
uses, on the real placed branch rather than jsdom's degenerate fallback.

**The browser instrument counts passes, not rect reads.** The existing case's own
comment records why counting `getBoundingClientRect` in Playwright is
contaminated: Playwright's actionability checks call `getBoundingClientRect`
themselves, as the case's own comment about
`getBoundingClientRect` records (`tests/e2e/rowactions-geometry.spec.ts:429-431`).
A `withNaturalSize` pass is
instead observable from the page as its cap clear and restore on the panel's
`style` attribute, which no Playwright internal writes.

### 5.1 Documented limits of the instruments

- **The jsdom pass counter counts calls, not cost.** Two passes that each measure
  a detached panel cost far less than two that measure a laid-out one. The
  invariant is a call count and claims nothing about milliseconds.
- **The browser case pins ONE gesture, the ancestor scroll.** Pinch-zoom drives
  the same `coalescer.schedule()` through a different listener
  (`components/admin/AnchoredPortal.tsx:234`) and is not separately pinned:
  Playwright cannot drive a real pinch, and a synthetic `visualViewport` event is
  a jsdom-grade stimulus wearing a browser costume. The shared funnel is the
  reason one gesture establishes the property, and it is stated here rather than
  discovered.
- **Neither instrument pins the SUBMENU instance.** The selectors here match
  `row-actions-portal-`, not `row-action-preview-portal-`, for the reason the
  predecessor spec §9.2 gives: both sites pass identical `align` and
  `preferredSide`, so no site-dependent branch exists in the timing path.

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

`AnchoredPortal`'s props are unchanged by this arc, so the predecessor spec's §6
still holds in full. The new internal state is one ref, and its states are
enumerated here because the ref is what the repair adds:

| `lastTriggerRef.current` | When | Ungated effect's behaviour |
| --- | --- | --- |
| `null` | before any measurement, and after every close | measures; never skips |
| a `Rect` equal to the live anchor rect | the redundant re-run after a commit this component's own measure produced | skips `withNaturalSize`; the placement already held is correct |
| a `Rect` differing in any field | a position-only move, or the first commit after a close | measures |
| unchanged after a `kind: "hidden"` measurement | a detached or not-yet-laid-out panel | measures, because the hidden branch never writes the ref |

A `Rect` field is never `null`, `undefined` or `NaN` in this path: it is built by
`toRect` (`components/admin/AnchoredPortal.tsx:74`) from a live `DOMRect`. A
`NaN` field would make every comparison unequal, so the guard would never skip
and the behaviour would degrade to today's — a fail-open the placement core
already handles separately (`lib/popover/position.ts:104`).

## 8. Dimensional invariants, transition inventory

**No dimensional invariants.** This arc adds no element, no class and no layout
relationship. The panel's box is unchanged.

**No new visual states, so the predecessor's transition inventory §8 stands
unamended.** The repair removes a computation whose result was discarded; the
sequence of applied placements is identical, which is what AC-5 asserts.

## 9. Acceptance criteria

- **AC-1** — a placement-changing gesture frame runs exactly one `withNaturalSize`
  pass, in jsdom, on the ancestor-scroll trigger and on the window-resize trigger.
- **AC-2** — a placement-unchanged gesture frame runs exactly one pass.
- **AC-3** — reopening at the identical trigger rect places the panel.
- **AC-4** — the merged cases in `tests/components/admin/rowActions/anchoredPortal.test.tsx`
  stay green unchanged, including the position-only `describe`
  (`tests/components/admin/rowActions/anchoredPortal.test.tsx:266`) and the
  open-transition count case
  (`tests/components/admin/rowActions/anchoredPortal.test.tsx:404`).
- **AC-5** — the sequence of applied placements over a gesture is unchanged by the
  repair: the panel ends at the same placement it reaches today.
- **AC-6** — an unscrolled measurement reads neither scroll offset after the cap
  restore, and a scrolled measurement still restores both.
- **AC-7** — in a real browser, a scroll of the panel's ancestor runs one pass per
  placement-changing frame.
- **AC-8** — a measurement returning `kind: "hidden"` leaves the guard unarmed,
  and the commit sequence it produces terminates.

## 10. Out of scope

- `lib/popover/place.ts` and `lib/popover/position.ts` (§6 refutes the only filed
  reason to touch them).
- The `MutationObserver` redesign the predecessor arc declined.
- Pinch-zoom as a separately driven browser gesture (§5.1).
- Every popover surface other than `AnchoredPortal` that composes
  `withNaturalSize`: they inherit site 2's repair without a per-surface pin,
  because the repair is inside the shared helper.

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

That mutant is not the repair. It reaches the same count by deleting the
position-only guarantee, which INV-D forbids; it is the negative control that
proves the probe discriminates the pass it counts.

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
