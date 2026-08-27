# Probe: what AnchoredPortal's three measures per open actually do

Evidence for `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`, Task 1. Run on branch
`perf/anchoredportal-measure-convergence` at base `66c9857f5`, 2026-08-27.

The row is filed PROBED, but against `449f29fab`. Both runs below re-establish
it at the head this arc repairs, before anything is changed.

## 1. The count, in jsdom

Harness: the portal rendered closed, then re-rendered open, with
`getBoundingClientRect` counted per element. One anchor read is one
`measureAndApply` (`components/admin/AnchoredPortal.tsx:141`).

```
PROBE closedReads=0 measureRunsOnOpenCommit=3 panelReads=3 settled=(884px,250px) maxH=none
```

`closedReads=0` is the closed-renders-nothing contract holding.
`measureRunsOnOpenCommit=3` reproduces the filed claim exactly.
`panelReads=3` is the cost the row names: three `withNaturalSize` passes, each
clearing the panel's caps and re-reading its rect, so three forced synchronous
reflows per menu open.

## 2. Whether those three agree, on the live surface

jsdom cannot answer this. It computes no layout, so every rect is a stub and the
three runs are fed identical inputs by construction. The question needs a real
browser: does the third run, which measures the panel at the placement the first
one applied, compute something the second did not?

Case: `tests/e2e/rowactions-geometry.spec.ts`, `PROBE:` (desktop-chromium, 7.9s).

It records the panel's applied placement history rather than counting rect
reads, because counting here would be contaminated by Playwright's own
actionability checks calling `getBoundingClientRect` on the trigger. `left` and
`top` are written only by React from `applied`; `withNaturalSize` touches only
the max-\* caps. So the distinct `left`/`top` values the style attribute holds
are exactly the placement commits.

```
PROBE-LIVE styleWrites=2 placements=2 sequence=["0px|0px","695px|1251.47px"]
held=["position: absolute; left: 0px; top: 0px;",
      "position: absolute; left: 695px; top: 1251.47px;",
      "position: absolute; left: 695px; top: 1251.47px;"]
```

**One placement is applied.** The panel goes from its unplaced origin to
`(695, 1251.47)` and stays there. The third measure agreed with the second.

The second style write carries an identical `left`/`top`; it is a
`withNaturalSize` cap clear-and-restore artifact from the third measure, not a
second placement. Either reading leaves the placement sequence unchanged, which
is what the case asserts.

### What this does and does not license

It licenses: the third measure changed no placement on this open.

It does NOT license deleting it. The ungated effect is the only subscription
that catches a position-only anchor move, and the way it catches one is by
running on every commit and measuring. The commit after the open placement is an
ordinary commit; the effect cannot know it is "the settle" rather than "a
refresh that reordered the rows" without measuring to find out. The probe shows
it looked and found nothing, which is not the same as it being dead weight.

## 3. A note on the instrument

The first cut of the live probe reported `styleWrites=0 placements=1` and its
own premise passed. It was wrong: the observer was attached per-node from a
`childList` callback, which is a microtask late, so React's writes had already
landed and it recorded nothing. A zero from an instrument that never fired is
indistinguishable from a real zero.

The shipped case registers a SUBTREE attribute observer on `document.body`
before the click, which covers descendants added afterwards, and asserts a
non-empty write log as its own premise before reading anything from it.
