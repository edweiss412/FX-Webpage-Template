# Tasks 1-10 — the retry affordance

Runs after Tasks P1-P5 and the five spec amendments they produce. Every task: RED observed →
minimal implementation → GREEN on the SAME command → commit.

## Task order is a correctness constraint, not a preference

Round 1 of plan review found that several tasks cited a red-target that an EARLIER task had
already repaired. A `red-state=authored` task must be red at ITS execution point, not merely
at today's head, so the order below is derived from what each task leaves behind:

| after | this exists | so this task's red must not depend on its absence |
|---|---|---|
| Task 1 | the control renders | anything asserting "no control exists" |
| Task 1 | the control renders on BOTH the gallery cell and the lightbox's shared failed branch | Task 6's red is that leak onto inactive slides, introduced HERE |
| Task 2 | `onLoad`, the `attempt` key, `failedKeys` clearing, the overlay | Task 3's announcement red is a DEFECT in Task 2's handler, not its absence |
| Task 4 | focus targets the control; `successorTo` is gone | Task 4 must run after Task 2, or the success-removal path it asserts does not exist yet |

Each task below states its red against the tree AS THE TASK RUNS. Where that red is a defect
in code an earlier task wrote rather than an absence, it says so.

## New Playwright specs are a config fan-out

`playwright.config.ts` projects carry explicit `testMatch` allowlists, and the config's own
comment says a spec absent from the regex "runs NOWHERE and silently proves nothing". Two new
specs land here, one from Task 2 driving the retry itself and one from Task 8 measuring its
geometry, and **each task's first step adds its own basename to the `desktop-chromium`
`testMatch` in `playwright.config.ts:97`, with the task not done until a run reports the
spec collected.** Neither is a standalone-config member: both drive the real crew page.

## Acceptance criteria

Spec §11 declares AC-1 through AC-17. This maps them.

- AC-1 the retry re-requests and the loaded node survives. (discharged by Task 2)
- AC-2 one tap one request, `srcSet` set unchanged and free of the original. (discharged by Task 2)
- AC-3 both outcomes announced by name on the audible channel. (discharged by Task 3)
- AC-4 in-flight control is `aria-busy`/`aria-disabled`, never native `disabled`, and keeps
  focus. (discharged by Task 1)
- AC-5 no control on a parse-time-unavailable item; a control on an originals-only item with
  `Full size.` on its active-slide variant. (discharged by Task 1)
- AC-6 focus never reaches `<body>` on ANY removal path in the §7.1 table. (discharged by Task 4)
- AC-7 real-browser box equality within 0.5px. (discharged by Task 8)
- AC-8 the demote path is untouched. (discharged by Task 5)
- AC-9 a retry never requests the original. (discharged by Task 5)
- AC-10 a second failure after a successful retry is not swallowed. (discharged by Task 2)
- AC-11 an item going unavailable and back returns to idle. (discharged by Task 7)
- AC-12 no retry control is RENDERED on an inactive lightbox slide. (discharged by Task 6)
- AC-13 a retry does not write `demotedRef`. (discharged by Task 5)
- AC-14 no demote chip over an unavailable slide. (discharged by Task 7)
- AC-15 `successorTo` is gone and no successor-hop returns. (discharged by Task 4)
- AC-16 a slide swiped away mid-retry does not return disabled-and-stranded. (discharged by Task 6)
- AC-17 every per-item member is classified and carries a clear path. (discharged by Task P5)

<!-- tasks: depth=2 red-contract -->

## Task 1 — render the control, with the copy split and the right disabled semantics

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failureRecovery.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:416` why=`one placeholder div serves both the runtime-failed and the parse-time-unavailable case, so no branch can carry a control for only one of them and there is no element on which the attribute and copy assertions could be made` ac=AC-4,AC-5 -->

Splits the shared branch so `!item.available` keeps the inert `<div>`. Copy per spec §5 and
§5.1: the thumbnail says `Tap to retry` with the full string as its accessible name; the
active slide adds `Full size.` only when `hasVariantTier` is false.

**AC-4 asserts the native attribute is ABSENT**, not merely that focus survived — the test
pins the mechanism Task P1 justified, not the symptom. Asserting focus alone would pass on a
browser that did not eject.

**Four pre-dispatch mutants** for the string-presence assertions, each recorded in the commit:
the label emptied; the label with a suffix appended; the label present but on a `hidden`
element; `item.alt` varied, proving the name comes from the item and not a constant.

**This task knowingly leaves one defect for Task 6.** The lightbox's failed branch is shared
by the active and inactive slides, so rendering the control there puts one on every inactive
failed slide — which spec §2 forbids. Scoping it to the active slide here would leave Task 6
with nothing to be red about except a missing test, which is not a valid red. So the leak is
introduced deliberately and visibly, and Task 6 closes it against the focus trap where the
hazard actually lives. The order matters and it is not an oversight.

## Task 2 — the retry mechanism: one tap, one request, one node

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:122` why=`the control from Task 1 renders but has no handler: failedKeys has no remover anywhere in either component (the only next.delete is GalleryLightbox.tsx:1040, inside setWantsOriginal on the demote path) and no onLoad exists on either surface, so tapping does nothing and no transition exists to count requests across` ac=AC-1,AC-2,AC-10 -->

Lands the whole mechanism, because P2 and P3 have already settled its shape: the `retrying`
set, the `attempt` key, `onLoad`/`onError`, and the same-node overlay. **No `loading`
override**: Task P3 refuted the mechanism that motivated one, and a tap implies the cell is in
the viewport, so the image loads on its own. Entering `retrying` clears `failedKeys` AND `pendingFailuresRef` (spec §4.0.1) —
without the second, a later failure of a recovered item is discarded at `Gallery.tsx:280` and
the diagram breaks again in silence, which is AC-10.

**AC-1 asserts node identity** by tagging the element before the retry and re-reading the same
tag after, not by asserting an image is present — a remounted image is also present. **AC-2
asserts three things**, which round 1 found the earlier draft short of: one request counted
via `page.route`, the `srcSet` attribute equal across the transition, and no original-tier URL
in it.

**e2e harness readiness.** Server boot is the repo's Playwright `webServer` config, never a
hand-started `pnpm dev` — a server already listening is REUSED and keeps whatever database it
was started with. The gate awaited before the first click is the gallery's own hydration
signal, never `networkidle` alone, because a pre-hydration click would determine the result
instead of the behaviour. Every `locator.evaluate` sampling a cell is detach-safe, since the
cell under measurement is the one that swaps branches.

## Task 3 — announce both outcomes

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failureRecovery.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:411` why=`Task 2's onLoad handler clears the retrying set and does NOT call routeAnnouncement, so a successful retry changes the DOM silently; this red is a defect in code Task 2 wrote, not an absence` ac=AC-3 -->

`<name> loaded.` and `<name> still could not be loaded.`, routed through `routeAnnouncement`
(`Gallery.tsx:239`) so the dialog-open and exit-window cases follow. Each oracle is
before/after on the SAME region node, matching the existing suite's posture. The exit-window
case is pinned, not assumed.

## Task 4 — focus targets the control, and `successorTo` is deleted

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failedItem.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:287` why=`focus is still aimed at successorTo(item.id), a sibling thumbnail, so it cannot land on the failed cell's own control; the nine relocation cases assert the sibling and fail against the new target` ac=AC-6,AC-15 -->

Runs after Task 2 deliberately: AC-6 asserts EVERY row of spec §7.1's focus-destination table,
and the success-removal path only exists once Task 2 has landed. The rows are the failure
transition, the success transition, the unavailable transition, and the active-slide removal.

All nine relocation cases change expectation. They build items through the shared helper at
`tests/components/diagrams/gallery.failedItem.test.tsx:264-273`, which sets `variants: []` —
under the ratified §3.1 that is the control case, so focus stays. The case at line 470, which
relocates to the gallery list when no control remains, has an unreachable premise and is
rewritten as the positive claim rather than deleted. The case at line 480, focus never landing
on `<body>`, is unchanged and becomes stronger.

Focus moves from a ref callback on the retry button gated by a per-item `focusOnMount` flag,
never synchronously in the handler — the button has not mounted when the handler runs. The flag
is NOT set while `lightboxOpenRef` is true (spec §7.1), or a thumbnail failing behind an open
dialog would steal focus out of the modal.

`successorTo` is deleted in its own commit with the zero-caller grep pasted. AC-15 is a source
scan as well as behavioural, because a behavioural test passes if the helper is reintroduced
unused.

## Task 5 — lightbox active slide, and the tier it must not request

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failedItem.test.tsx tests/components/diagrams/GalleryLightbox.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:1121` why=`the active-slide onError only adds to failedKeys and nothing clears wantsOriginal, so a slide that dies is terminal and a retry after a zoom would request the original` ac=AC-8,AC-9,AC-13 -->

Entering `retrying` clears `wantsOriginal` and **does not write `demotedRef`** (spec §4.0.2).
AC-9 drives the full path — zoom, swipe away, fail inactive, swipe back, retry — and asserts
the REQUESTED URL, not merely that something loaded. AC-13 then re-pinches and asserts the
original is reachable, which is the half that would silently disappear if `demotedRef` were
written. AC-8 is the negative: an original-tier failure with a smaller tier still demotes and
never reaches the retry branch.

## Task 6 — inactive slides render no control

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.failedItem.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:1173` why=`Task 1 rendered the control on the lightbox's failed branch, which Embla shares between the active and inactive slides, so every inactive failed slide renders one too; the red is that leak, and it is a defect introduced by Task 1 rather than an absence` ac=AC-12,AC-16 -->

**AC-12 asserts DOM absence first** — no retry control is rendered on an inactive slide, full
stop — and then additionally asserts the focus trap's own collector
(`lib/a11y/dialogFocus.ts:26-43`) returns none. Round 1 was right that the collector alone is
the weaker oracle: a rendered control that the collector happens not to pick up would pass it
while violating the criterion as written. Absence is the claim; the collector is corroboration
at the site where the hazard lives.

AC-16 swipes away mid-retry and asserts the slide does not return holding a stranded
`Retrying…`, and that focus reached Close rather than `<body>`.

## Task 7 — the unavailable boundary

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.availabilitySweep.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:789` why=`the demote chip predicate tests demotedNotice, its nonce and failedKeys but not item.available, so a demoted slide going unavailable keeps its chip until the timer expires; and no sweep exists, so session state survives the round trip` ac=AC-11,AC-14 -->

Absorbs what an earlier draft called probe P6: this is feature behaviour, not a mechanism
claim, so it lives where its implementation does. Spec §1.4's U-6 row names this task.

The sweep is keyed on the rendered id set, not on `item.available` — an item removed from
`items` never flips that prop (spec §9.1). The chip predicate also gains `item.available`
directly, so no frame can paint it over an unavailable slide. Both, deliberately: the
predicate fixes the frame, the sweep fixes the timer.

Every case asserts the FIRST render after the flip rather than a settled state, because the
defect §9.1 repairs is a single frame. The `retrying` case additionally asserts NO request is
issued, since the visible symptom of the wrong ordering is an unrequested retry rather than a
wrong pixel. The removal case uses a stable id that returns, which is the only way retained
state becomes visible.

## Task 8 — layout dimensions, real browser

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/diagram-retry-dimensions.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:416` why=`Task 1's control inherits the placeholder div's flex classes and no size-full, and this project's Tailwind v4 does not default .flex to align-items stretch, so the button's box does not equal the aspect-square cell's; the geometry assertion fails on that until the sizing lands. The testMatch entry is the task's first step because without it the run collects zero tests and expresses no verdict either way` ac=AC-7 -->

Spec §8's table verbatim: `<li>` `aspect-square` → retry `<button>` `size-full`; button → icon
and label column; button → the 44px floor. `getBoundingClientRect()` on each documented
`data-testid`, equality within 0.5px. jsdom cannot establish this.

**e2e harness readiness**, same three points as Task 2: the repo's `webServer` config boots
the server; the gallery's hydration signal is awaited before the first measurement; every
`locator.evaluate` is detach-safe. Setup is `page.route` aborting the diagram asset request,
per spec §10.6's retraction.

## Task 9 — transition audit

<!-- task: red=`npx vitest run tests/components/diagrams/gallery.transitions.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:353` why=`the availability ternary now has a retrying branch from Task 2 but no test enumerates the pairs, so the five compound transitions spec §9 names are unexercised and the new cases fail on the unasserted ones` ac=AC-6 -->

Walks every `AnimatePresence`, ternary and conditional block in both components against spec
§9. Asserts every row of §7.1's focus-destination table rather than sampling, and exercises
all five compound transitions §9 names.

<!-- tasks: end -->

## Task 10 — the invariant-8 UI quality gate, and closeout

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
half-names and the marker land together, in the commit that runs the gate.

Run before the gate rather than discovered by it, per the pre-code mechanical UI checklist:
em-dash ban on user-visible copy, apostrophe literals, the 44px tap floor (`min-h-tap-min`),
and canonical type and token classes. The gate is a verifier, not a discovery mechanism.

## Adversarial review (cross-model)

Between plan self-review and execution handoff. Codex, since the implementer is Claude.
