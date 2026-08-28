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
| The guard is on the ungated effect's call site ONLY, never inside `measureAndApply` for every caller. A global memo would swallow viewport changes that move neither the anchor nor the panel. | §3.1, "Why the guard is not global" |
| The key OBSERVES the placement's geometric inputs rather than enumerating what can change them. Rounds 1-4 enumerated causes and each was defeated by an unmodelled one; that train is the record at `docs/review-rounds/perf/placement-measure-memo/b608e71b32b5.md`, not a set of open questions. Re-raising a cause is naming an input to an observation already taken. | §3.1, "What the key must contain"; orchestrator ruling 2026-08-28 |
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

The effect answers one question: **has anything the placement depends on changed
since the last measurement?** Today it answers by recomputing the entire
placement and throwing the answer away when it matches. It can answer the same
question by comparing a KEY — one rect read plus five reference comparisons —
against a whole natural-size pass.

An earlier draft of this paragraph asked the narrower `has the ANCHOR moved?`,
and that narrowing is exactly what three review rounds were spent
widening back. The key's membership is settled in §3.1 and nowhere else.

## 3. The repair

### 3.1 Site 1 — the ungated effect skips a pass when the anchor has not moved

`measureAndApply` records the trigger rect it measured from in a ref. The ungated
effect calls it in a mode that reads the anchor rect, compares it to that ref,
and returns before `withNaturalSize` when the two are equal. The coalescer's call
site is unchanged and always measures.

Concretely:

- a `lastMeasureRef` holding the KEY of the most recent PLACED measurement, or
  `null`. The key is
  `{ anchorRect, panelSize, align, preferredSide }` — the normative definition is
  the table under "What the key must contain" below, and this bullet names its
  members rather than restating them;
- `measureAndApply` takes one optional argument, `{ skipIfUnchanged?: boolean }`;
  the early return sits AFTER the existing null-ref guard
  (`components/admin/AnchoredPortal.tsx:131`) and AFTER the trigger-rect read
  (`components/admin/AnchoredPortal.tsx:141`), and BEFORE `withNaturalSize`
  (`components/admin/AnchoredPortal.tsx:142`);
- the ref is WRITTEN on the placed branch
  (`components/admin/AnchoredPortal.tsx:179`) and CLEARED to `null` on the
  degenerate `kind === "hidden"` branch (`components/admin/AnchoredPortal.tsx:157`),
  never touched on a skip. Clearing rather than merely declining to write is
  load-bearing — see "Why hidden CLEARS" below;
- the ungated effect calls `measureAndApply({ skipIfUnchanged: true })`;
- the coalescer is constructed as `createRafCoalescer(() => measureAndApply())`,
  written as an explicit arrow so the no-skip intent is visible at the call site
  rather than resting on `createRafCoalescer`'s `run: () => void` signature
  (`lib/popover/rafCoalescer.ts:16`) passing no argument;
- the ref is reset to `null` in the same effect that discards the placement on
  close (`components/admin/AnchoredPortal.tsx:267-270`).

**What the key must contain, derived from the placement function's own
parameters.** Four drafts of this section enumerated CAUSES — which inputs can
move the measurement — and review defeated every one, each time by naming a
cause the list had not modelled: a prop with no subscription, a `ResizeObserver`
that reports the content box while the measurement reads
`getBoundingClientRect`, the component's own commit writing an attribute CSS can
select on, and CSS attribute selectors matching the serialized `style` attribute.
That train is recorded at
`docs/review-rounds/perf/placement-measure-memo/b608e71b32b5.md`, and its shape is
the point: **an enumeration of causes fails OPEN on the cause nobody thought of,
once per round, forever.** Lengthening it is not the repair; retiring it is.

**So the key does not enumerate causes at all. It observes the two things the
placement actually reads, and names the two it cannot observe.**

`PopoverPlacementInput` has exactly six fields
(`lib/popover/position.ts:39-50`): `trigger`, `naturalSize`, `wrappedHeightAt`,
`bounds`, `preferredSide` and `align`. That signature is a closed set — it cannot
grow without a change to the placement core itself, which is a different file and
a different review. Each is either observed directly or covered:

| Placement input | How the guard covers it |
| --- | --- |
| `trigger` | OBSERVED: the anchor's rect, all six fields, read fresh each run |
| `naturalSize` / `wrappedHeightAt` | OBSERVED: the panel's `width`, `height`, `scrollWidth` and `scrollHeight`, read fresh each run — the extent is what separates "overflows its cap" from "exactly at its cap", which the size alone cannot |
| `bounds` | subscribed: the `resize` and `visualViewport` listeners (`components/admin/AnchoredPortal.tsx:230-235`) and the capture-phase scroll listener (`components/admin/AnchoredPortal.tsx:229`), all of which route through the coalescer, which never skips |
| `preferredSide`, `align` | compared by `===`: they are the core's own two non-geometric parameters, passed at `components/admin/AnchoredPortal.tsx:151-152`, and no measurement can reveal a change in them |

**The key is therefore: the anchor rect, the panel's rendered size and scroll
extent, `align` and `preferredSide`.** Nothing else. `className`, `children`, the applied `side`, the
serialized `style` and `data-testid` are all GONE from it — not because they
cannot move the measurement, but because every way they move it is a change to
the panel's rendered size, which the guard now reads instead of predicting.

**This is what makes the key-completeness question die by construction rather
than by a longer list.** A transform, a scale, a side-dependent rule, a
`[style*="..."]` selector, a `data-testid` selector, a content change, a
container query, a font swap, and every mechanism not yet invented all reach the
placement through one channel: they change what the panel measures. The guard
reads that channel. A future reviewer naming a sixth cause is naming another
input to an observation already being taken.

**Only the panel's SIZE and EXTENT are compared, never its position.** The placement itself
sets the panel's `left` and `top`, so those differ on every frame that moves it
and comparing them would mean never skipping. Size is the half the placement
READS (`components/admin/AnchoredPortal.tsx:149` passes `measured.width` and
`measured.height` and nothing else), which is also why round 4 was right that a
pure translation justifies no re-measure: it changes no input.

### The capped panel, and the equality boundary that a size-only reading misses

The observed reading is the panel's CAPPED rect. `naturalSize` is its UNCAPPED
measurement. Uncapped they are the same rect and the observation is exact. Capped,
the rendered size is pinned at the cap, and a size-only reading cannot tell `content overflows the cap` from `content is exactly the cap`.

**That distinction is load-bearing, and an earlier draft of this section claimed
it was not.** The core switches on strict comparisons: `maxWidth` is written only
when `naturalSize.width > bounds.width` (`lib/popover/position.ts:118`), and a
side is taken uncapped when `height0 <= space(side)`
(`lib/popover/position.ts:128`). So a panel whose natural width SHRINKS from above
`bounds.width` to exactly `bounds.width` renders at an unchanged size while the
applied `maxWidth` must go from a number to `null`. The same holds for height at
`space(side)`. The draft's claim that a natural size shrinking back UNDER a cap always changes
the rendered size omitted the boundary case where it shrinks back
exactly TO the cap, and there the applied tuple changes with no size change at
all.

**So the observation reads the panel's SCROLL EXTENT alongside its size.**
`scrollWidth` and `scrollHeight` report the content's own extent rather than the
box the cap imposes, so they separate the two states the size cannot: a panel
overflowing its cap has an extent past its client box, and a panel exactly at its
cap does not. Both are reads on the node already being read, in the same
already-flushed layout, and neither adds a write.

The key's geometric half is therefore the panel's `width`, `height`,
`scrollWidth` and `scrollHeight`. That is not a fifth enumerated cause — it is the
same single observation, taken faithfully enough to recover the input it stands
for at the boundary where a coarser reading loses it.

### When a frame costs two passes, and why that is the design working

INV-A is scoped, and the scope is the honest consequence of the observation
design rather than an escape hatch. **If a style-dependent rule makes the
placement commit itself change what the panel measures, the follow-up run MUST
take a second pass** — the panel now measures differently than when it was
placed, so the placement it is holding was computed from a stale reading. Today's
code re-measures there too, and preserving that is the consequence bound.

AC-12's witnesses (c) and (d) are exactly this case, constructed: a
side-dependent rule fired by a flip, and a rule selecting on the `left` the
commit wrote. On those frames the count is two, and the second pass is required
work rather than the waste this arc removes.

**The two are distinguishable without judgement**, which is what keeps the scope
from swallowing the invariant: the follow-up's own reading of the panel is the
discriminator. Equal reading means the commit changed nothing measurable and the
pass is skipped; different reading means it did, and the pass is owed. So `runs exactly
one pass` and `runs two when the commit moved the panel` are the same rule
evaluated on different inputs, not two rules.

An earlier draft of this spec claimed the unqualified universal and shipped
witnesses that contradicted it — review found the contradiction, and it is fixed
by scoping the invariant rather than by weakening the witnesses.

### What this costs

The follow-up run does reads only — the anchor's rect, and the panel's rect and
scroll extent — where it previously did a whole `withNaturalSize` pass: two style
writes to clear the caps, a rect read, possibly a `heightAtWidth`
write-read-write triple, and two style writes to restore.

**What is removed is the WRITE-then-read cycling inside the pass, not every
forced layout on the path, and an earlier draft overstated this.** The guarded
run follows a commit that wrote `style` and `data-portal-side`, so its first
geometry read flushes that pending work whatever the guard decides — that cost is
the commit's, not the pass's, and it is paid today as well. What the repair
removes is the cap clear, the cap restore and any wrap probe, each of which
writes style and then reads geometry back, forcing a further synchronous layout
INSIDE the pass. Reads that follow no intervening write are served from the same
flushed layout.

**Key equality is exact.** The anchor rect compares on all six fields of `Rect`
(`lib/popover/position.ts`, the `Rect` type); the panel size on `width` and
`height`. No epsilon: a sub-pixel move is a real move and the panel should follow
it, and an epsilon would introduce a drift class that does not exist today.
`align` and `preferredSide` compare with `===`, and both are defaulted at the
destructure (`components/admin/AnchoredPortal.tsx:88-89`) so neither is ever
absent.

**Why hidden CLEARS the ref rather than merely declining to write it.** A
measurement of a detached or not-yet-laid-out panel commits the fallback anchor
and is expected to recover (`components/admin/AnchoredPortal.tsx:157-163`).

An earlier draft of this section said "record on the placed branch only," which
is not the same thing and is wrong on a reachable sequence. **Placed at key K,
then hidden at the SAME key K:** declining to write leaves K in the ref, the
fallback commits, and the follow-up run finds the key equal and skips — losing
exactly the re-measure that the recovery depends on. The panel keeps the fallback
anchor until some subscription fires. Declining to write is only safe from a
`null` start, which is the one case a naive test would exercise.

Clearing makes the ref's meaning exact and the invariant statable: **the ref
holds the key of the currently-applied PLACED placement, or `null`.** After a
hidden measurement there is no applied placed placement, so `null` is what the
ref should say. The follow-up run then always measures, which is today's
behaviour on that path.

The degenerate case therefore costs what it costs today, and INV-J is that case
in both of its shapes: from `null`, and from a placed key.

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
(`components/admin/AnchoredPortal.tsx:230-235`) and panel content-box changes
arrive as `ResizeObserver` callbacks
(`components/admin/AnchoredPortal.tsx:236`), and all three route through the
coalescer, which does not skip. The key covers what those subscriptions do not,
and it is complete for THAT path and for no other, which is why the guard lives
at that one call site.

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
| INV-A | A placement-CHANGING gesture frame whose commit does not itself change what the panel measures runs exactly one `withNaturalSize` pass (see "When a frame costs two passes") | jsdom pass counter, ancestor scroll with the anchor moved | delete the `skipIfUnchanged` early return |
| INV-B | A placement-UNCHANGED gesture frame runs exactly one pass | the same case, anchor not moved | (control; reds if the coalescer path is wrongly gated) |
| INV-C | A closed to open transition still places the panel when the trigger is at the key the previous open used | jsdom reopen case | delete the `lastMeasureRef` reset on close |
| INV-D | A position-only anchor move still re-places the panel | the merged predecessor case at `tests/components/admin/rowActions/anchoredPortal.test.tsx:266` | make the guard compare nothing, or compare only `width`/`height` |
| INV-E | The predecessor's anchor-read count on an open transition is unchanged at 2 | the merged case at `tests/components/admin/rowActions/anchoredPortal.test.tsx:404` | move the early return BEFORE the trigger-rect read |
| INV-F | An unscrolled panel's measurement reads neither scroll offset after the cap restore | `lib/popover/naturalSize.ts` order-trace case | drop either `!== 0` short-circuit |
| INV-G | A scrolled panel's offsets are still restored | the merged scroll-clamp cases | invert either short-circuit |
| INV-H | The gesture path runs one pass per placement-changing frame in a REAL browser, driven by a viewport resize | `tests/e2e/rowactions-geometry.spec.ts`, the gesture measure-count case | delete the early return |
| INV-I | Over a multi-frame gesture, each frame applies exactly the placement the placement core computes for that frame's inputs | jsdom multi-frame case: per-frame FULL applied tuple against an independent oracle | make the guard skip when the key HAS changed |
| INV-J | A measurement that returns `kind: "hidden"` leaves the guard UNARMED, from a `null` ref and from a placed one alike, and the follow-up run terminates without a further render | jsdom degenerate-panel case, run from both starting states | decline to write the ref on the hidden branch instead of clearing it |
| INV-K | A re-render that changes `preferredSide` with the anchor still re-places the panel | jsdom prop-change case through the existing `Harness`'s `preferredSide` parameter | drop `preferredSide` from the key |
| INV-L | A re-render that changes `align` with the anchor still re-places the panel | jsdom prop-change case through an `align` parameter added to the harness | drop `align` from the key |
| INV-M | **A change to the panel's rendered SIZE re-places the panel, whatever caused it** | four witnesses, each a different cause reaching the same channel: a `className` `scale()`, a `children` swap, a side-dependent rule fired by a flip, and a `[style*=…]` rule fired by the committed `left` | drop the panel-size comparison from the key |

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

**The real browser is the shipped pin for the gesture path, and the gesture is a
viewport resize.** `INV-H` extends the existing `PROBE:` case
(`tests/e2e/rowactions-geometry.spec.ts:441`) to `page.setViewportSize` rather
than an open transition. jsdom found the defect; the browser is what pins that
the repair holds on the surface an admin actually uses, on the real placed branch
rather than jsdom's degenerate fallback.

**A scroll-driven pin was the obvious choice and it is not available on this
surface.** The rows wrapper is `overflow-hidden` and height-unconstrained, so the
DOCUMENT is what scrolls, not an ancestor of the trigger
(`tests/e2e/rowactions-geometry.spec.ts:196-200`, the containment case's own
premise) — and a document scroll DISMISSES this menu rather than re-placing it,
because both call sites pass `onDismiss` (`components/admin/ShowRowActions.tsx:668`
and `components/admin/ShowRowActions.tsx:964`) and the component routes on the
event target (`components/admin/AnchoredPortal.tsx:210-218`). A scroll-driven
case would assert against a closed panel: a guard whose premise the surface
cannot satisfy. A resize reaches the same `coalescer.schedule()`
(`components/admin/AnchoredPortal.tsx:230`) and moves the right-aligned panel
because the trigger's right edge moves with the viewport, and appendix A.1
measured the resize trigger at the same cadence as the ancestor-scroll one. The
ancestor-scroll gesture stays in the jsdom cases, where an ancestor carrying a
scroll listener can be constructed.

**The browser instrument counts PANEL RECT READS, and the contamination the
existing case warns about is excluded by construction rather than by choosing a
different signal.** That case's comment records why a naive rect counter is
contaminated: Playwright's actionability checks call `getBoundingClientRect`
themselves (`tests/e2e/rowactions-geometry.spec.ts:429-431`).

**The cap clear and restore is NOT the signal, and the reason is a silent zero.**
An earlier draft counted `withNaturalSize`'s clearing of the caps on the panel's
`style` attribute. On an UNCAPPED panel that helper assigns `""` to a cap that is
already `""` (`lib/popover/naturalSize.ts:39-40` and
`lib/popover/naturalSize.ts:68-69`), leaving the serialized attribute unchanged,
so there is no edge to observe and every pass goes uncounted. Deleting the early
return would then add a pass while the counter still read the same number, and
AC-7 would stay green through the exact defect it exists to catch. The shipped
fixture supplies no premise that either cap is active, so this is not
hypothetical for it.

**The counted unit is one `withNaturalSize` pass, and in the browser a panel-rect
counter CANNOT take it.** The arithmetic refutes it outright: today a
placement-changing frame runs two passes and so two panel reads; after the repair
it runs one pass plus the guard's own key read, which is also two. An assertion of
one read fails the correct design and an assertion of two is green before it. The
signal is blind to the change it exists to detect, and no premise repairs that —
it is not a fixture problem.

**So the browser case counts `withNaturalSize`'s CAP CLEAR, on a fixture whose cap
is executably asserted to be active.** The helper clears both caps at the start of
every pass (`lib/popover/naturalSize.ts:39-40`) and restores them at the end
(`lib/popover/naturalSize.ts:68-69`). On a CAPPED panel each clear is a real
transition of the `style` attribute — a non-empty `max-height` going empty — which
a `MutationObserver` sees, and which nothing else on the page writes.

**The uncapped hole that killed an earlier draft is closed by a premise, not by
hope.** On an uncapped panel the helper assigns `""` to a cap already `""`, the
serialized attribute never changes, and every pass goes uncounted — a silent zero
that reads green through the exact defect the case exists to catch. The case
therefore asserts, before it counts anything, that the panel's applied
`max-height` is non-empty. On this fixture it is: the row menu is seeded with 14
crew per show (`tests/e2e/rowactions-geometry.spec.ts:47`) against a 720px
viewport (`tests/e2e/rowactions-geometry.spec.ts:51`). If a future fixture stops
capping, the premise reds loudly instead of the count quietly reading zero.

### 5.1 Documented limits of the instruments

- **The jsdom pass counter counts calls, not cost.** Two passes that each measure
  a detached panel cost far less than two that measure a laid-out one. The
  invariant is a call count and claims nothing about milliseconds.
- **The browser case pins ONE gesture, the viewport resize.** Pinch-zoom drives
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

| `lastMeasureRef.current` | When | Ungated effect's behaviour |
| --- | --- | --- |
| `null` | before any measurement, after every close, and after any measurement that returned `kind: "hidden"` | measures; never skips |
| a key equal to the live one | the redundant re-run after a commit this component's own measure produced | skips `withNaturalSize`; the placement already held is correct |
| a key whose anchor rect differs in any of the six fields | a position-only move | measures |
| a key whose panel SIZE differs | anything at all that changed what the panel measures — a transform, a scale, a content change, a rule keyed on the committed `style` or on `data-portal-side` | measures |
| a key whose `align` or `preferredSide` differs | a re-render that changed one of the core's two non-geometric parameters | measures |

**This table is derived from the key table in §3.1 and adds nothing to it.** One
row per member plus the two `null` and all-equal states; if the two disagree, §3.1
is normative. The second row is deliberately not a list of causes: it is one
observation, and naming examples there is illustration, not enumeration.

A `Rect` field is never `null`, `undefined` or `NaN` in this path: it is built by
`toRect` (`components/admin/AnchoredPortal.tsx:74`) from a live `DOMRect`. A
`NaN` field would make every comparison unequal, so the guard would never skip
and the behaviour would degrade to today's — a fail-open the placement core
already handles separately (`lib/popover/position.ts:104`).

`align` and `preferredSide` are never absent in the key: both have defaults at
the destructure (`components/admin/AnchoredPortal.tsx:88-89`), so the key holds
`"right"` and `"bottom"` for a caller that passes neither.

The panel size is read from the same node the measurement uses, and the guard
runs only when that node exists — the null-ref check
(`components/admin/AnchoredPortal.tsx:131`) precedes it, so there is no absent
state. A detached panel reads `0 × 0`, which is a value like any other: it differs
from whatever the last measurement saw, so the guard measures, and the placement
core then rejects it at `lib/popover/position.ts:109` and takes the fallback. That
is today's behaviour on that path, reached without a special case.

## 8. Dimensional invariants, transition inventory

**No dimensional invariants.** This arc adds no element, no class and no layout
relationship. The panel's box is unchanged.

**No new visual states, so the predecessor's transition inventory §8 stands
unamended.** The repair removes a computation whose result was discarded.

**The claim that the applied sequence is identical is pinned per frame, not at
the end**, because an end-state oracle cannot see a defect that applies a wrong
coordinate on one frame and the right one on the next — it would satisfy both the
end-state check and every pass count in this document. AC-5 therefore carries two
halves: a per-frame tuple compared against an INDEPENDENT oracle
(`placeWithinVisibleViewport` run on that frame's own inputs, not a recorded
golden from a baseline run), and a per-frame count of applied placements, so an
ADDED or REMOVED intermediate placement is caught as well as a changed one.

**Half (ii) is WITHDRAWN, and the reason is that this arc has no instrument for
it.** Two counters were proposed and both were refuted. A counting child reads 1
forever: `children` is a prop, so a re-render driven by this component's own
`setApplied` reuses the same element object and React bails out. A
`MutationObserver` on the panel's attributes cannot do it either — its
per-callback batch grain cannot separate two commits flushed in one task, which
the merged browser probe records about ITSELF in the same terms
(`tests/e2e/rowactions-geometry.spec.ts:425-427`), so an added or removed
intermediate placement is absorbed into one batch exactly as a disagreeing third
measure is there. The proposed deciding mutant fails with it: removing `commit`'s
equality check produces an equal-valued React render, and React does not rewrite
an unchanged DOM attribute, so the observer count does not move.

**So AC-5 is the per-frame tuple against an independent oracle, and nothing
else.** An ADDED or REMOVED intermediate placement within a single frame is a
DOCUMENTED LIMIT of this arc's instruments, recorded here rather than asserted
away. It is the same limit the merged probe already carries, on the same surface,
for the same reason, and inheriting a known limit honestly is the alternative to
claiming a grain the instrument does not have.

The limit is bounded, which is why it is acceptable rather than merely admitted:
half (i) compares the FULL applied tuple every frame against
`placeWithinVisibleViewport` run on that frame's own inputs, so any intermediate
placement that survives to the end of a frame is caught. What escapes is an
intermediate created and superseded inside one microtask checkpoint, which by
construction is never painted.

## 9. Acceptance criteria

- **AC-1** — a placement-changing gesture frame whose commit does not itself
  change what the panel measures runs exactly one `withNaturalSize` pass, in
  jsdom, on the ancestor-scroll trigger and on the window-resize trigger. The
  qualifier is not a hedge; it names the case §3.1's `When a frame costs two
  passes` section documents, and AC-12's witnesses (c) and (d) are instances of
  it.
- **AC-2** — a placement-unchanged gesture frame runs exactly one pass.
- **AC-3** — reopening at the identical trigger rect places the panel.
- **AC-4** — the merged cases in `tests/components/admin/rowActions/anchoredPortal.test.tsx`
  stay green unchanged, including the position-only `describe`
  (`tests/components/admin/rowActions/anchoredPortal.test.tsx:266`) and the
  open-transition count case
  (`tests/components/admin/rowActions/anchoredPortal.test.tsx:404`).
- **AC-5** — over a multi-frame gesture, after EACH frame the panel's applied
  tuple (`left`, `top`, `data-portal-side`, `max-height`, `max-width`) equals the
  tuple derived from `placeWithinVisibleViewport` on that frame's own inputs, and
  The per-frame COUNT of applied placements is deliberately NOT a criterion: §8
  records why no instrument in this arc can take it.
- **AC-6** — an unscrolled measurement reads neither scroll offset after the cap
  restore, and a scrolled measurement still restores both.
- **AC-7** — in a real browser, a viewport resize that moves the panel runs one
  `withNaturalSize` pass on the resulting placement-changing frame, counted as
  cap-clear transitions on the panel's `style` attribute, on a fixture whose cap
  is asserted active before the count is taken.
- **AC-8** — a measurement returning `kind: "hidden"` leaves the guard unarmed
  and the commit sequence it produces terminates, asserted from BOTH starting
  states: a `null` ref, and a ref holding the key of a placed placement at the
  same anchor.
- **AC-9** — a re-render that changes `preferredSide` with the anchor rect
  unchanged re-places the panel.
- **AC-11** — a re-render that changes `align` with the anchor rect unchanged
  re-places the panel. Separate from AC-9 on purpose: one criterion reading
  "`align` or `preferredSide`" is discharged by a case that exercises either, so
  an implementation keying only `preferredSide` would pass it.
- **AC-12** — a change to the panel's rendered size re-places the panel, asserted
  through FOUR witnesses whose only shared property is that channel, so the
  criterion is the observation rather than any one cause. Each witness leaves the
  anchor rect, `align` and `preferredSide` untouched: **(a)** a `className`
  carrying a `scale()`; **(b)** a `children` swap that measures differently;
  **(c)** a side-dependent rule fired by a placement flip under a STABLE
  `className`; **(d)** a rule selecting on the serialized `style` attribute
  (`[style*="left: …"]`), fired by the coordinate the commit itself wrote. (c) and
  (d) are the two round-4 cases, and they are witnesses here rather than key
  members — the design that needed them named is retired.
- **AC-13** — witness (b) re-places IN THAT COMMIT. The timing is a criterion of
  its own, not a restatement of AC-12: `ResizeObserver` would deliver a
  content-box change on a LATER frame, so a guard that waited for it leaves one
  painted frame at the old placement. Asserted synchronously after the re-render
  with no flush — jsdom's observer is a no-op stub (`tests/setup.ts:70-81`) and
  cannot rescue it either way.
- **AC-14** — a pure TRANSLATION of the panel does NOT force a re-measure. The
  negative half of AC-12, and it is a criterion because without it a guard that
  simply re-placed on every commit would pass every witness above while removing
  no work at all. Round 4 established the underlying fact: the placement reads
  `measured.width` and `measured.height` (`components/admin/AnchoredPortal.tsx:149`)
  and never the panel's position, so a translation changes no input.
- **AC-10** — the invariant-8 dual gate ran on the diff, its P0 and P1 findings
  are dispositioned, and the row is archived without an in-flight marker. Owned
  by the plan's closeout task; declared here so the sibling plan declares no
  criterion of its own and `spec:lint`'s `TASK_AC_UNDECLARED` arm stays out of
  scope for it.

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
