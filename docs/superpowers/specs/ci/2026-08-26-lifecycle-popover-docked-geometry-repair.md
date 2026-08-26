# Lifecycle popover geometry after the dock: what ShareHub can still reach

Hotfix spec for `fix/popover-place-regression`. One page, because the repair is three test cases and
the interesting content is one piece of arithmetic.

## 1. What broke, and what did not

`lifecycle-layout-e2e` has been red on every head since #905 (`feat/review-modal-strip-dock`) merged at
`999d77d3b`: 3 failed / 26 passed, reproduced locally byte-identical. The check is not among the
required twelve, which is how it merged.

`lib/popover/place.ts` is not the cause. #905's only change to it (`14ca176a4`) adds
`warnUnsatisfiable` and threads a `warnKey`; it computes no placement differently. The placer is
correct and this arc does not touch it.

The cause is the dock itself, working as ratified. `PublishedReviewModal` moved `StatusStrip` from
the `subHeader` slot to the `footer` slot (2026-08-25-review-modal-strip-dock §3.1), which puts
ShareHub's trigger on the panel floor. Measured across nine viewport heights on the seeded held show,
`spaceBelow` is **-2 at every one of them**, so the module picks `top` everywhere. That is the module
adapting to a moved anchor, which is the behaviour the arc migrated four overlays to obtain.

#905 saw this coming and enumerated the stale sites in its §9.2 changed set: `tests/e2e/admin-lifecycle-layout.spec.ts:662`,
`tests/e2e/admin-lifecycle-layout.spec.ts:694-696` and `tests/e2e/admin-lifecycle-layout.spec.ts:905-907`. It repaired those three. It missed three more in the same file,
which is why the gate is red: **the enumeration was the cover, and it covered half the class.**

## 2. The docked geometry, as a formula

Fitted from measurement at 390x{500,560,620,640,680,720,844,955} (held show, ShareHub open):

| quantity | value |
| --- | --- |
| `spaceAbove` (room on the chosen side) | `0.85·vh - 70` |
| idle body natural height | `min(0.7·vh, 471)` |
| armed body natural height | `min(0.7·vh, 480)` |

`0.7·vh` is the class cap `max-h-[min(70vh,30rem)]`; 471 and 480 are the two bodies' true naturals,
480 being the `30rem` ceiling. The room grows at 0.85 per viewport pixel and the body at 0.7, so the
room outruns the body and keeps doing so.

**Consequence A — the "grew past its room" state is unreachable through ShareHub, at every viewport.**
The state needs the idle body to fit uncapped (`spaceAbove >= idleNatural`) while the armed body does
not (`spaceAbove < armedNatural`). Three regimes exhaust the domain:

- `0.7·vh <= 471` (vh <= 673): the class cap clamps BOTH bodies to the same `0.7·vh`, so the two
  conditions are `spaceAbove >= 0.7·vh` and `spaceAbove < 0.7·vh`.
- `471 < 0.7·vh < 480` (673 < vh < 686): `armedNatural < 480`, but `spaceAbove > 502`.
- `0.7·vh >= 480` (vh >= 686): `armedNatural = 480`, and `spaceAbove >= 513`.

Every regime is a contradiction. This is a derivation over the whole domain, not a sweep of chosen
heights, so no viewport restores it.

**Consequence B — a different placement boundary IS reachable.** The module writes an inline cap when
`spaceAbove < natural`, i.e. when `0.85·vh - 70 < min(0.7·vh, 480)`, which for the clamped regime is
`vh < 467`. Measured: cap `''` at 560, `321px` at 460, `288.296875px` at 420. Crossing 467 makes the
module return a materially different answer, and that crossing is what a re-place witness can be built
on now that the side flip is gone.

## 3. The invariant the placer must satisfy for both callers

For any caller, `placeWithinVisibleViewport` returns a placement whose written box fits the room on the
side it chose, or a cap that says how much room there was. It is not required to prefer a side, and no
test may assert a side as a proxy for "placement ran". A caller whose anchor sits on a clip edge gets
the only side with room, permanently; a caller whose anchor floats gets whichever side fits. Both are
correct, and a test that pins a literal side pins the ANCHOR's position, not the placer's behaviour.
That is precisely the coupling that made these three cases stale.

## 4. The three repairs

Each is re-derived from §2, and each keeps a premise assertion that fails loudly if the geometry moves
again, rather than passing quietly.

- **`tests/e2e/admin-lifecycle-layout.spec.ts:449`, SHARELINK-CUE-VISIBILITY-1.** The premise is that the URL row can be scrolled out of view
  before the rotation. `rowBottom` is 127 (content-determined, unchanged by the dock); `maxScrollTop`
  is 97 at 390x560, so the premise cannot hold there any more. It is 168 at 390x460. The viewport
  moves to 390x460 and the premise assertion stays exactly as it is. A premise that cannot hold is not
  a premise.
- **`tests/e2e/admin-lifecycle-layout.spec.ts:558`, T-REGROW.** The selection rung is removed, because §2 Consequence A proves it cannot
  succeed. What remains reachable through ShareHub is asserted instead: the docked room exceeds the
  body's cap, so the grown body is absorbed by the popover's own scroller and stays inside the clip
  rect without a re-place. The room-exceeds-cap fact becomes an explicit premise assertion, so an
  un-dock or a panel change that reintroduces the overhang fails here. The forced-re-place branch is
  covered where it can be driven directly: `tests/e2e/popover-clip-fit.spec.ts` §3.6.
- **`tests/e2e/admin-lifecycle-layout.spec.ts:1191`, T-TRANSITION.** The side flip is unreachable (§2). The resize target moves from 560 to a
  height across the cap boundary of Consequence B, and the witness that placement re-ran becomes the
  cap the module wrote: uncapped before, capped after, with the cap equal to the room. The armed-state
  assertions (still open, still mounted, same node, still contained) are untouched.

## 5. Resolved scope — do not relitigate

No `BL-`/`DEF-` row. This is a hotfix of a merged regression, and the freeze of 2026-08-25 puts a
process-facing row out of the queue regardless. The coverage genuinely lost is bottom-side placement
THROUGH ShareHub, which #905 already recorded at `tests/e2e/admin-lifecycle-layout.spec.ts:694-696` and `tests/e2e/admin-lifecycle-layout.spec.ts:905-907`; this spec adds that the
growth-forced re-place is lost through ShareHub too, for the reason derived in §2.

`lib/popover/place.ts` is not enrolled in `tests/mutation/source/registry.ts` and this arc does not
enrol it: the arc changes no source file, so there is nothing new to score.
