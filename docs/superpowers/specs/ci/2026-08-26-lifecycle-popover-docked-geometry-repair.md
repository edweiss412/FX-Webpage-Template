# Lifecycle popover geometry after the dock: what ShareHub can still reach

Hotfix spec for `fix/popover-place-regression`. One page, because the repair is three test cases and
the interesting content is one piece of arithmetic and one invariant that was missing before the dock
ever landed.

## 1. What broke, and what did not

`lifecycle-layout-e2e` has been red on main since #905 (`feat/review-modal-strip-dock`) merged at
`999d77d3b`: 3 failed / 26 passed, reproduced locally byte-identical. The check is not among the
required twelve, which is how it merged.

`lib/popover/place.ts` is not the cause. #905's only change to it (`14ca176a4`) adds
`warnUnsatisfiable` and threads a `warnKey`; it computes no placement differently. The placer is
correct and this arc does not touch it.

The cause is the dock, working as ratified. `PublishedReviewModal` moved `StatusStrip` from the
`subHeader` slot to the `footer` slot (2026-08-25-review-modal-strip-dock §3.1), which puts ShareHub's
trigger on the panel floor. Measured across eight viewport heights on the seeded held show,
`spaceBelow` is **-2 at every one of them**, so the module picks `top` everywhere. That is the module
adapting to a moved anchor, which is the behaviour the arc migrated four overlays to obtain.

#905 saw this coming and enumerated the stale sites in its §9.2 changed set:
`tests/e2e/admin-lifecycle-layout.spec.ts:662`, `tests/e2e/admin-lifecycle-layout.spec.ts:694-696`
and `tests/e2e/admin-lifecycle-layout.spec.ts:905-907`. It repaired those three. It missed three more
in the same file, which is why the gate is red: **the enumeration was the cover, and it covered half
the class.**

## 2. The docked geometry, measured

Measured on the seeded held show with ShareHub open, at width 390. All values px, rounded to integer
by the probe:

| vh | room on chosen side | idle body | armed body | inline cap |
| --- | --- | --- | --- | --- |
| 500 | 355 | 350 | 350 | none |
| 560 | 406 | 392 | 392 | none |
| 620 | 457 | 434 | 434 | none |
| 640 | 474 | 448 | 448 | none |
| 680 | 508 | 471 | 476 | none |
| 720 | 542 | 471 | 480 | none |
| 844 | 647 | 471 | 480 | none |
| 955 | 742 | 471 | 480 | none |

And on the seeded published show, which is what the share-link case drives:

| vh | room | body | inline cap | max scrollTop | URL row bottom |
| --- | --- | --- | --- | --- | --- |
| 420 | 288 | 294 | `288.296875px` | 201 | 127 |
| 460 | 321 | 322 | `321px` | 168 | 127 |
| 560 | 406 | 392 | none | 97 | 127 |
| 620 | 457 | 434 | none | 55 | 127 |
| 700 | 525 | 480 | none | 0 | 127 |

**The line `room = 0.85·vh - 70` is a FIT, not an identity.** Residual is at most 1px against every
row above, which is within the probe's own integer rounding. It is used below to explain a trend and
to choose viewports; **no test asserts it**, and the boundary it suggests is stated as a measured
bracket rather than an exact threshold. The one apparent discrepancy is not one: the 420 cap
`288.296875px` matches the MEASURED room (288 after rounding), not the fitted 287 — the module writes
the room it actually had, which the tests check directly.

Against that, the body is capped by the class `max-h-[min(70vh,30rem)]`, so it grows at 0.7·vh until
it saturates: the idle body at 471 and the armed body at the `30rem` ceiling of 480.

**Consequence A, and the weight it can carry.** The room grows at roughly 0.85 per viewport pixel and
the body at 0.7, so the room outruns the body. The state the old T-REGROW ladder hunted — idle fits its
side uncapped while armed does not — does not occur at any measured height, and the trend gives no
reason to expect it between them. Splitting on the fitted line:

- `0.7·vh <= 471`, i.e. `vh <= 672.86`: the class cap clamps BOTH bodies to the same `0.7·vh`, so the
  two conditions become `room >= 0.7·vh` and `room < 0.7·vh` at once.
- `471 < 0.7·vh < 480`, i.e. `672.86 < vh < 685.71`: the armed body is under 480, and the room is
  already above 502.
- `0.7·vh >= 480`, i.e. `vh >= 685.71`: the armed body is exactly 480, and the room is above 512.8.

**This is an argument, not a proof, and nothing depends on it being one.** The bounds come from
extrapolating a fitted line through eight points; eight measurements do not settle every height
between them, least of all the narrow 672.86–685.71 band. It is stated because it is the reason the
ladder was not worth re-tuning — the rungs would land somewhere the measurements give no reason to
expect the state either. Every assertion in §4 is written against the module's CONTRACT (§3) rather
than against this arithmetic, precisely so that a wrong extrapolation costs a paragraph and not a
gate.

**What Consequence A does NOT say, and the correction it forced.** At the measured heights the growth
does not change the chosen SIDE and does not introduce a CAP. It does not show that re-placement is unnecessary, and
that reading would be wrong. `lib/popover/position.ts:135` places a `top` body at
`y = trigger.top - GAP - effectiveHeight`. The coordinate is a function of the height, so a body that
grows from 471 to 480 without re-placing keeps its old `y` and its bottom moves from `trigger.top - 6`
to `trigger.top + 3`, eating the gap and overlapping the trigger. **Containment cannot see this** —
the overhang is into the trigger, not out of the clip rect, so the body stays inside the panel
throughout. Re-placement on growth is necessary **wherever the growth changes the body's BOX** —
which, per the table above, is 680 and 844, where the idle body is unclamped at 471 and the armed one
reaches 476 and 480. At 420 and 560 the class cap holds both states at the same size, so there is
nothing to re-place and the gap cannot move. `ShareHub.tsx`'s `bodyObserver` is the mechanism that
supplies the re-place where it is needed, and the planted-defect run in §4 fails at 390x680 — not
before it, which is the same split stated from the other side.

**Consequence B — a second reachable boundary.** The module writes an inline cap exactly when the room
is short of the body. Measured: no cap at 560 (room 406, body 392), a cap at 460 (321 vs 322, one
pixel inside the regime) and at 420 (288 vs 294). The crossing sits between 460 and 560. No exact
threshold is claimed or asserted.

## 3. Dimensional Invariants — what the placer must satisfy for both callers

For any caller, `placeWithinVisibleViewport` returns a placement that, for the size the body actually
has:

1. keeps the body inside the clip rect;
2. preserves `GAP` between the body and the trigger on the chosen side — `body.bottom = trigger.top - GAP`
   for `top`, `body.top = trigger.bottom + GAP` for `bottom`;
3. writes an inline cap exactly when the room is short of the body, and when written the cap IS the
   room.

Point 2 is the one this arc adds, and it is the positional half that containment alone never covered.

The placer is not required to prefer a side, and **no test may assert a side as a proxy for "placement
ran"**. A caller whose anchor sits on a clip edge gets the only side with room, permanently; a caller
whose anchor floats gets whichever side fits. A test that pins a literal side pins the ANCHOR's
position, not the placer's behaviour — which is exactly the coupling that made three cases stale.

## 4. The three repairs, and the negative control for each

Each is re-derived from §2, and each was proved to still fail by planting a defect and observing red.

- **`tests/e2e/admin-lifecycle-layout.spec.ts:449`, SHARELINK-CUE-VISIBILITY-1.** The premise is that
  the URL row can be scrolled out of view before the rotation, i.e. `maxScrollTop > rowBottom`.
  `rowBottom` is 127 and untouched by the dock; `maxScrollTop` fell to 97 at 390x560 because a popover
  with more room caps less and so overflows less. It is 168 at 390x460. The viewport moves to 390x460
  and the premise assertion is unchanged — a premise that cannot hold is not a premise.
  _Negative control:_ restore 560, and the premise fails with the same assertion the original
  regression reproduced.

- **`tests/e2e/admin-lifecycle-layout.spec.ts:558`, T-REGROW.** The selection ladder is removed,
  because the state it hunted occurs at no measured height (§2 Consequence A) and re-tuning its three
  rungs would only move them somewhere the measurements give no reason to expect it either.
  What replaces it is stronger than what it replaced: the ladder found ONE height and asserted
  containment, whereas the case now asserts the full §3 contract at four heights spanning both
  regimes — 420 (capped) and 560, 680, 844 (uncapped) — with the `GAP` assertion of §3 point 2 as the
  witness that placement re-ran. That witness is load-bearing at 680 and 844 ONLY: at 420 and 560 the
  cap holds the idle and armed boxes at one size, so a missing re-place would not move the gap. Those
  two rungs are carried for clause 3 of §3, the branch they do exercise. The negative control below
  fails at 390x680 and not before it, which is that split measured rather than asserted.
  The case also CANCELS at each height, because the box shrinking back to 471 is the mirror defect:
  a stale placement then OPENS the gap instead of closing it, and every assertion in the arming leg
  ran while the body was still large. An ordinary edit that schedules the body observer only when
  `scrollHeight` INCREASES passes the arming leg and T-TRANSITION and breaks only this one. A sweep-level anti-vacuity check requires at least one swept height
  to actually grow the body's BOX, so the case cannot quietly stop exercising re-placement.
  No premise asserts that a regime is reachable: a panel change that moves a height into the capped
  regime is HANDLED by the contract rather than falsifying an assumption.
  _Negative control:_ stop `ShareHub.tsx`'s `bodyObserver` observing the panel — one ordinary edit, and
  the defect the case exists for — and the `GAP` assertion fails.

- **`tests/e2e/admin-lifecycle-layout.spec.ts:1191`, T-TRANSITION.** The side flip is unreachable
  (§2), so the resize target moves from 560 to 420, crossing the cap boundary of Consequence B, and
  the witness that placement re-ran becomes the cap the module wrote — checked against the room it
  had, so a stale or hardcoded non-empty value cannot pass. Every armed-state assertion is unchanged.
  The case then resizes BACK to 844 and asserts the cap is cleared, because ShareHub writes the cap in
  one branch and clears it in another (`removeProperty("max-height")`, `ShareHub.tsx:354`). Without
  that leg the clear branch is reachable by no case in this file — T-REGROW opens every height on a
  fresh page, so it never starts from a capped state — and deleting it would leave the suite green.
  _Negative controls:_ restore the 560 target, which crosses no boundary, and the uncapped answer from
  844 survives the resize, failing "the resize did not re-place: no cap was written"; and delete the
  `removeProperty` branch, and the resize back fails "the cap was not CLEARED when the room came
  back".

## 4a. Transition Inventory

The popover has two independent state axes, and the placement contract of §3 must hold in every cell
and across every move between them. Axis one is the body's content: **idle** (a 44px action row) or
**armed** (the confirm block). Axis two is the module's answer: **uncapped** (the room covers the body)
or **capped** (it does not).

| move | what changes | animated? | who covers it |
| --- | --- | --- | --- |
| idle → armed, box grows | `y` must be recomputed or `GAP` is eaten | instant — no animation; the re-place is a layout write | T-REGROW at 680 and 844, the only measured heights where the box grows |
| idle → armed, box does not grow | a cap or the class cap already binds, so the scroller absorbs the content and the placement is already correct | instant — no animation | T-REGROW at 420 (inline cap) and 560 (class cap) |
| uncapped → capped, by resize | a cap appears and equals the new room | the popover transitions; the case settles on the computed style holding still across two frames | T-TRANSITION, 844 → 420 |
| capped → uncapped, by resize | the cap is CLEARED through a different branch — `body.style.removeProperty("max-height")`, `ShareHub.tsx:354` — than the one that writes it | as above, same settle | T-TRANSITION, 420 → 844 back |
| armed, viewport resize while armed | the armed confirm must survive without remounting | as above | T-TRANSITION asserts the confirm node identity across the move |
| armed → idle, box shrinks | Cancel (`ArchiveShowButton.tsx:336`) returns the body to 471, so `y` must be recomputed or the `GAP` OPENS — 11px at 680, 15px at 844 | instant — no animation | T-REGROW's cancel leg at every swept height; load-bearing at 680 and 844 |
| idle, at rest | the placement must already satisfy all three clauses of §3 before anything is armed | not a move | T-REGROW asserts the full contract on the idle measurement at all four heights |

**One cell is deliberately unowned, and it is named rather than absorbed.** An idle popover resized
across the cap boundary — capped ↔ uncapped while NOT armed — has no case. What that sequence would
execute is the same pair of branches the armed resize already drives: `applyPlacement` writes
`body.style.maxHeight` or calls `removeProperty("max-height")` (`ShareHub.tsx:353-354`) and does not
branch on armed-ness anywhere. So the BRANCHES are covered and the SEQUENCE is not. That distinction
is the one this spec got wrong once already — the clear branch was excused as "the same code path"
when in fact no case executed it at all — so it is stated as a limit with the line numbers that make
it checkable, not as an equivalence.

The compound case — a viewport resize landing WHILE the body is mid-growth — is not constructed, and
the reason first written here was wrong. It claimed both signals collapse into ONE placement pass
because they share a coalescer. They do share one (`lib/popover/rafCoalescer.ts`), but it clears its
pending flag BEFORE running (`rafCoalescer.ts:21`) precisely so a signal arriving during the pass
schedules another frame, and its unit test pins two registrations for that order. So the compound case
produces one pass or two, depending on timing.

The reason it is still not constructed is different and does not depend on the count. Each pass places
from the CURRENT measured geometry — `applyPlacement` reads live rects rather than applying a queued
delta — so one pass and two passes land on the same answer, the one the final geometry implies. Every
assertion in the table above is on the settled result, and the settle predicates wait for the computed
style to hold still across two frames, which a second pass would disturb and therefore extend rather
than escape. What is genuinely untested is an intermediate frame, and the contract makes no claim
about intermediate frames.

## 5. Resolved scope — do not relitigate

No `BL-`/`DEF-` row. This is a hotfix of a merged regression, and the freeze of 2026-08-25 puts a
process-facing row out of the queue regardless.

The coverage genuinely lost is bottom-side placement THROUGH ShareHub, which #905 already recorded at
`tests/e2e/admin-lifecycle-layout.spec.ts:694-696` and
`tests/e2e/admin-lifecycle-layout.spec.ts:905-907`. Its compensating coverage is
`tests/e2e/popover-clip-fit.spec.ts` §3.6, which drives the side selection against a controlled
anchor. That compensation is for the SIDE branch only; growth-driven re-placement through ShareHub is
covered by T-REGROW above and is not delegated anywhere.

`lib/popover/place.ts` is not enrolled in `tests/mutation/source/registry.ts` and this arc does not
enrol it: the arc changes no source file, so there is nothing new to score. The subject is Playwright
e2e cases, which the registry cannot express, so the negative controls in §4 are the discrimination
evidence in a score's place.
