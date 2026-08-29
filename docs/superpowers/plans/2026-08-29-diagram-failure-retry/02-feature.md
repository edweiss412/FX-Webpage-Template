# Tasks 1-10 — the retry affordance

Runs only after Tasks P1-P6 and the spec amendment they produce. Every task: RED observed →
minimal implementation → GREEN on the SAME command → commit.

## Acceptance criteria

Spec §11 declares AC-1 through AC-17. This file maps them; it does not restate them.

- AC-1 the retry re-requests and the loaded node survives. (discharged by Task 3)
- AC-2 one tap, one request, candidate set unchanged. (discharged by Task 3)
- AC-3 both outcomes announced by name on the audible channel. (discharged by Task 5)
- AC-4 in-flight control is `aria-busy`/`aria-disabled`, never native `disabled`, and keeps
  focus. (discharged by Task 2)
- AC-5 no control on a parse-time-unavailable item; a control on an originals-only item, and
  `Full size.` on its active-slide variant. (discharged by Task 2)
- AC-6 focus stays on the control; never `<body>` on any removal path. (discharged by Task 4)
- AC-7 real-browser box equality within 0.5px. (discharged by Task 9)
- AC-8 the demote path is untouched. (discharged by Task 6)
- AC-9 a retry never requests the original. (discharged by Task 6)
- AC-10 a second failure after a successful retry is not swallowed. (discharged by Task 1)
- AC-11 an item going unavailable and back returns to idle. (discharged by Task 8)
- AC-12 no control on an inactive lightbox slide. (discharged by Task 7)
- AC-13 a retry does not write `demotedRef`. (discharged by Task 6)
- AC-14 no demote chip over an unavailable slide. (discharged by Task 8)
- AC-15 `successorTo` is gone and no successor-hop returns. (discharged by Task 4)
- AC-16 a slide swiped away mid-retry does not return disabled-and-stranded. (discharged by Task 7)
- AC-17 every per-item member is classified. (discharged by Task P5)

<!-- tasks: depth=2 red-contract -->

## Task 1 — `failedKeys` becomes clearable, and `pendingFailuresRef` clears with it

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failureRecovery.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:122` why=`failedKeys has no remover anywhere in either component, verified by grep at plan time: the only next.delete is GalleryLightbox.tsx:1040, inside setWantsOriginal on the demote path. So nothing can return a failed item to idle, and the new cases asserting a second failure re-announces cannot pass` ac=AC-10 -->

Adds the `retrying` set and the `attempt` counter. Entering `retrying` removes the id from
`failedKeys` AND from `pendingFailuresRef` (spec §4.0.1) — without the second, a later
failure of a recovered item is discarded at `Gallery.tsx:280` and the diagram breaks again
silently. AC-10's case drives failure, retry, success, then failure again, and asserts the
second announcement exists. Asserting only that the control returns would pass on a cell that
never spoke.

## Task 2 — render the control, with the copy split and the right disabled semantics

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failureRecovery.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:416` why=`one placeholder div serves both the runtime-failed and the parse-time-unavailable case, so no branch can carry a control for only one of them, and there is no control on which an attribute could be asserted` ac=AC-4,AC-5 -->

Splits the shared branch so `!item.available` keeps the inert `<div>`. Copy per spec §5 and
§5.1: the thumbnail says `Tap to retry` with the full string as its accessible name; the
active slide adds `Full size.` only when `hasVariantTier` is false.

**AC-4 asserts the native attribute is ABSENT**, not merely that focus survived. Asserting
focus alone would pass on a browser that did not eject, which is exactly the assumption P1
exists to test — the test must pin the mechanism the probe justified, not the symptom.

**Four pre-dispatch mutants** for the string-presence assertions, each result recorded in the
commit message: the label emptied; the label with a suffix appended; the label present but on
a `hidden` element; and `item.alt` varied, proving the name comes from the item rather than a
constant.

## Task 3 — one tap, one request, one node

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:398` why=`the Image has an onError handler and no onLoad, no overlay and no attempt key, so there is no transition across which node identity or request count could be asserted` ac=AC-1,AC-2 -->

The `<Image>` mounts once in its final position with the overlay above it (spec §4.0.5).
`onLoad` removes the overlay; the image element does not change. AC-1 asserts node identity
across the transition by tagging the element and re-reading it, not by asserting an image is
present — a remounted image is also present. AC-2 counts requests via `page.route`.

Sets `loading="eager"` while retrying, subject to P3's result.

## Task 4 — focus targets the control, and `successorTo` is deleted

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failedItem.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:287` why=`focus is aimed at successorTo(item.id), a sibling thumbnail, so it cannot land on the failed cell's own control; the nine relocation cases assert the sibling and will fail against the new target` ac=AC-6,AC-15 -->

All nine relocation cases change expectation. They build items through the shared helper at
`tests/components/diagrams/gallery.failedItem.test.tsx:264-273`, which sets `variants: []` —
under the ratified §3.1 that is the control case, so focus stays. The case at line 470,
which relocates to the gallery list when no control remains, has an unreachable premise and is
rewritten as the positive claim rather than deleted. The case at line 480, which asserts
focus never lands on `<body>`, is unchanged and becomes stronger.

Focus moves from a ref callback on the retry button gated by a per-item `focusOnMount` flag,
never synchronously in the handler — the button has not mounted when the handler runs. The
flag is NOT set while `lightboxOpenRef` is true (spec §7.1), or a thumbnail failing behind an
open dialog would steal focus out of the modal.

`successorTo` is deleted in its own commit with the zero-caller grep pasted. AC-15 is a
source scan as well as behavioral, because a behavioral test passes if the helper is
reintroduced unused.

## Task 5 — announce both outcomes

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failureRecovery.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:411` why=`no onLoad handler exists on either component, verified by grep at plan time, so a successful retry is unobservable and no announcement can be emitted for it` ac=AC-3 -->

`<name> loaded.` and `<name> still could not be loaded.`, routed through `routeAnnouncement`
(`Gallery.tsx:239`) so the dialog-open and exit-window cases follow. Each oracle is
before/after on the SAME region node, matching the existing suite's posture. The exit-window
case is pinned, not assumed.

## Task 6 — lightbox active slide, and the tier it must not request

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failedItem.test.tsx tests/components/diagrams/GalleryLightbox.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:1121` why=`the active-slide onError only adds to failedKeys, so a slide that dies is terminal and there is no retry whose requested tier could be asserted` ac=AC-8,AC-9,AC-13 -->

Entering `retrying` clears `wantsOriginal` and **does not write `demotedRef`** (spec §4.0.2).
AC-9 drives the full path — zoom, swipe away, fail inactive, swipe back, retry — and asserts
the REQUESTED URL, not merely that something loaded. AC-13 then re-pinches and asserts the
original is reachable, which is the half that would silently disappear if `demotedRef` were
written. AC-8 is the negative: an original-tier failure with a smaller tier still demotes and
never reaches the retry branch.

## Task 7 — inactive slides carry no control

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failedItem.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:1173` why=`the inactive-slide onError only adds to failedKeys and there is no control on any slide yet, so neither the absence assertion nor the swipe-away-mid-retry case can be expressed` ac=AC-12,AC-16 -->

AC-12 asserts absence, and asserts it against the focus trap's own collector
(`lib/a11y/dialogFocus.ts:26-43`) rather than by querying for a button — the hazard is that
the trap collects it, so the assertion runs where the hazard lives. AC-16 swipes away
mid-retry and asserts the slide does not return holding a stranded `Retrying…`, and that
focus reached Close rather than `<body>`.

## Task 8 — the unavailable boundary

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.availabilitySweep.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:789` why=`the demote chip predicate tests demotedNotice, its nonce and failedKeys but not item.available, so a demoted slide going unavailable keeps its chip until the timer expires` ac=AC-11,AC-14 -->

The sweep is keyed on the rendered id set, not on `item.available` — an item removed from
`items` never flips that prop (spec §9.1). The chip predicate also gains `item.available`
directly, so no frame can paint it over an unavailable slide. Both, deliberately: the
predicate fixes the frame, the sweep fixes the timer.

## Task 9 — layout dimensions, real browser

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry-dimensions.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:416` why=`the placeholder is a div, not a button, so the spec's parent-to-child dimension relationships have no child to measure` ac=AC-7 -->

Spec §8's table verbatim: `<li>` `aspect-square` → retry `<button>` `size-full`; button → icon
and label column; button → the 44px floor. `getBoundingClientRect()` on each documented
`data-testid`, equality within 0.5px. jsdom cannot establish this.

**e2e harness readiness**, per the writing-plans rule: (a) the repo's existing Playwright
`webServer` config boots the server, never a hand-started `pnpm dev` — a server already
listening is REUSED and keeps whatever database it was started with; (b) the gate awaited
before the first assertion is the gallery's own hydration signal, never `networkidle` alone;
(c) every `locator.evaluate` sampling a cell is detach-safe, because the cell under
measurement is exactly the one that swaps branches.

Setup is `page.route` aborting the diagram asset request, per §10.6's retraction.

## Task 10 — transition audit

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.transitions.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:353` why=`the availability ternary has two branches and no retrying state, so the failed-to-retrying and retrying-to-idle pairs the inventory names cannot be exercised` ac=AC-4 -->

Walks every `AnimatePresence`, ternary and conditional block in both components against spec
§9. Asserts every row of §7.1's focus-destination table rather than sampling, and exercises
all five compound transitions §9 names.

<!-- tasks: end -->

## Task 11 — the invariant-8 UI quality gate, and closeout

No `red=`, so outside the region. This arc touches `components/diagrams/**`, so it is a UI
surface and AGENTS.md invariant 8 applies in full: both halves of the impeccable v3 gate run
on the affected diff, each with the canonical v3 setup gates (the skill's own context load of
PRODUCT.md and DESIGN.md, then the register reference read). P0 and P1 findings are fixed or
explicitly deferred with a `DEFERRED.md` entry. Findings and dispositions go into §12 of the
handoff.

**Deliberately not naming the two half-commands here.** `declaresGate`
(`tests/docs/_invariant8Closeout.ts:109-118`) treats any plan unit whose files mention both
half-names as DECLARING the gate, and a declaring unit must carry a well-formed
`impeccable-gate:` marker line. There is no legal "pending" form, so naming both halves now
would red `tests/docs/_metaInvariant8Closeout.test.ts` for the whole life of the branch. The
half-names and the marker land together, in the commit that runs the gate, which is the only
point at which the marker can state what actually happened.

Also run before the gate rather than discovered by it, per the pre-code mechanical UI
checklist: em-dash ban on user-visible copy, apostrophe literals, the 44px tap floor
(`min-h-tap-min`), and canonical type and token classes. The gate is a verifier, not a
discovery mechanism.

## Adversarial review (cross-model)

Between plan self-review and execution handoff. Codex, since the implementer is Claude.
