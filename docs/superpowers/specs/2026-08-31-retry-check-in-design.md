# A hung retry gets a soft check-in at 30 seconds — design spec (2026-08-31)

Closes `DIAGRETRY-NO-RETRY-DEADLINE-1` (DEFERRED.md). The row was deferred under class-sweep
exception (a): it needed a product decision. That decision was taken by Eric on 2026-08-31
through bl-orch and is recorded in §1.1.

This spec EXTENDS `docs/superpowers/specs/2026-08-29-diagram-failure-retry-design.md`. That
document stays canonical for everything it settled; read its §0 AS-BUILT DIVERGENCE table
before implementing anything here. Where the two touch, this one adds a state and changes
nothing else.

## 1. Problem, as the deferred row measured it

A retry carries no deadline. A request that never resolves leaves the in-flight state
permanent: `Retrying…` on screen, `aria-busy="true"` announced, and the control inert because
its `onClick` is a bare `event.preventDefault()`
(`components/diagrams/Gallery.tsx`, the `diagram-retrying-` button; `components/diagrams/GalleryLightbox.tsx`,
the `lightbox-retrying` button). Venue wifi is precisely where a request hangs rather than fails.

**The surfaces differ, and the row's own corrected evidence says which one matters.** Gallery
retry state lives in `Gallery`, which outlives the dialog, so a hung gallery retry has no exit
short of a page reload. Lightbox retry state is local to `GalleryLightbox` and dies when the
dialog unmounts, so closing the lightbox already clears it. Both are fixed here, consistently;
the gallery is the one that had no exit.

**Nothing in either component is a retry deadline today.** The lightbox has several timers,
including the demote chip's `DEMOTE_CHIP_VISIBLE_MS` visibility timer
(`components/diagrams/GalleryLightbox.tsx:130`) and a `timer(150)`. None of them watches a
retry. This is the narrow, true form of the claim; the row records that an earlier wording
of it was wrong and why.

### 1.1 Resolved scope — do not relitigate

| decision | ratification |
|---|---|
| **The check-in fires at 30 seconds.** Not 10, not 60, not a measured p99. | Eric, 2026-08-31, relayed through bl-orch, taken as the product call the row was deferred for. The number is ratified; re-deriving it under review pressure is out of bounds. |
| **The in-flight request is NEVER cancelled by the check-in.** No `AbortController`, no `src` clear, no unmount driven by the timer. | Eric, 2026-08-31 through bl-orch. It is the ratified 2026-08-29 §3.1 no-dead-ends posture applied to time: a 50 MB fetch on venue wifi may be seconds from finishing, and killing it is the failure the originals-only override exists to avoid. |
| **`aria-busy` stays `true` during the check-in.** | The deferred row objected that "a timer would make `aria-busy` lie". That objection is against FAKING COMPLETION. It does not reach reporting a state that is still true: at second 31 the request genuinely is in flight, so `aria-busy="true"` is the honest value and dropping it would be the lie. §6 states this in full. |
| **The check-in is a SUB-STATE of `retrying`, not a fifth branch that replaces it.** The `<Image>` stays mounted throughout. | §3. It is what makes a late success win (§8.1, resolve-during-check-in) and it is the mechanical form of "never cancelled". |
| **Restart is a second, deliberate user gesture, so it may cost a second request.** | §4.1. The 2026-08-29 §4.0.5 rule is "one tap is one request", a rule about not charging a crew member twice for ONE tap. A user pressing Restart is asking for a new attempt. |
| **Restart does not re-add the `attempt` counter.** | 2026-08-29 §0 forbids it in those words. §4.1 gets its fresh request from the one-commit `restarting` state genuinely unmounting the `<Image>`, not from a changed `key`. |
| **No client-visible status channel for the asset route.** The check-in cannot say WHY a request is slow. | Out of scope, and it is documented limit 1 of the 2026-08-29 spec. That limit's un-defer trigger fires for a future arc, not this one. §5.1 records the copy consequence. |
| **No automatic retry, no backoff.** The check-in offers a control; it never acts on its own. | 2026-08-29 §12, unchanged. The check-in is a UI state change and an offer, nothing else. |
| No new design tokens. | §8. Every class used already ships in the two components. |

### 1.2 UNRATIFIED — one claim this spec does not prove

**U-1: whether removing a mid-fetch `<img>` from the document causes the browser to abandon
its request.** This spec never asserts either answer. What it asserts is narrower and is under our
control: the CHECK-IN cancels nothing, and this code calls no abort API on any path. Restart
unmounts the `<Image>` as a consequence of the one-commit `restarting` state (§4.1), and what the
browser then does with that request is the browser's business.

What IS settled, and is not this claim: the old element's HANDLERS cannot fire into either
component after that unmount, because React detaches them with the node. That is a fact about
React, not about the network, and §4.1 records why it matters that the two are not confused.

Settled by the probe in the plan's first task, whose only job is to record the observed answer
in this section. No behavior below branches on it, so the answer changes the documentation and
nothing else.

## 2. What ships

1. A per-item `checkedIn` set, read only through its intersection with `retrying` (§3.1), so no
   removal path has to maintain it.
2. Two effects per component owning every check-in timer: a reconciler derived from the live
   `retrying` set rather than from a list of removal sites, and a mount-scoped guard that clears
   everything on unmount (§3.2).
3. At `RETRY_CHECK_IN_MS`, the in-flight control changes copy, drops `aria-disabled`, gains a
   working `onClick`, and announces once. `aria-busy` does not change.
4. Restart: a one-commit `restarting` state, disjoint from `retrying`, that unmounts the `<Image>`,
   followed by a layout effect that re-enters `retrying` before paint and mounts a fresh one, with a
   fresh check-in window (§4.1).
5. An announcement effect derived from the effective checked-in set, so the clock never speaks
   directly (§6.1).
6. Registry rows for every new `useState` / `useRef`, per 2026-08-29 §4.0.3.
7. `DESIGN.md` §5.5 gains one timings row (§3.3).

Both surfaces get all of it, the same way.

## 3. The check-in is a sub-state, not a branch

The 2026-08-29 state machine has four render states, in its own §4. This adds a boolean DIMENSION to
one of them plus one single-commit staging state, rather than a fifth branch:

```
                tap retry                      30s
  idle ──fail──▶ failed ────────▶ retrying ──────────▶ retrying+checked-in
                   ▲                  │                        │
                   │                  │ onLoad                 │ onLoad  (image wins)
                   │                  ▼                        ▼
                   │                idle ◀───────────────────idle
                   │                  │                        │
                   └───onError────────┴────────onError─────────┘
                                                               │ Restart
                                                               ▼
                                                          restarting
                                                               │ layout effect, same commit cycle
                                                               ▼
                                                           retrying
```

| state | membership test | renders |
|---|---|---|
| `retrying` | `item.available && retrying.has(id) && !effectiveCheckedIn.has(id)` | the `<Image>` plus the in-flight overlay, `Retrying…`, inert |
| `retrying+checked-in` | `item.available && effectiveCheckedIn.has(id)` | the SAME `<Image>`, same node, plus the same overlay element carrying check-in copy and a working Restart handler |
| `restarting` | `item.available && restarting.has(id)` | the same overlay element, `Retrying…`, inert, and NO `<Image>`. Lives for one commit cycle and is never painted (§4.1) |

Every row reads `checkedIn` ONLY as `effectiveCheckedIn` (§3.1), and the checked-in row needs no
separate `retrying` conjunct because the intersection already carries it. An earlier draft wrote
`checkedIn.has(id)` raw in both rows, which was inert in those particular expressions but
contradicted the rule two paragraphs below them; review round 3 caught the contradiction in the
normative table rather than in behaviour, which is exactly where a spec should be held to it.
`restarting` needs no "and not in `retrying`" qualifier either: the invariant below establishes it,
and repeating it in the predicate invites the two statements to drift apart.

**INVARIANT: `retrying` and `restarting` are disjoint.** The two writes that can put an id into
either set from the other are Restart's entry and the layout effect's exit, and each removes from
one set and adds to the other in the SAME update (§4.1). No other transition touches `restarting`:
`failed → retrying` cannot, because an id in `restarting` is by construction not in `failedKeys` and
so renders no retry control to press.

An earlier draft stated this as a universal rule over EVERY write, which review round 3 correctly
called internally inconsistent: it would have obliged the two shipped `failed → retrying` handlers
(`Gallery.tsx:449`, `GalleryLightbox.tsx:391`) to remove from a set they can never contain the id
in. The narrower statement is the true one and is what AC-8c asserts. The same round also caught the
draft claiming that membership in NEITHER set yields an inert overlay over no image; the render
predicates below say otherwise and they are right — an id in neither set is `idle` or `failed` by
the ordinary rules, and there is no overlay at all.

Stated as an invariant because review round 2 Both had the same consequence
and neither was visible as a missing line: an id in both sets, or in neither, leaves the cell
showing an inert `Retrying…` over no image, permanently. The two sites were Restart's entry (which
added to `restarting` without leaving `retrying`, so the replacement request inherited no deadline)
and the layout effect's exit (which returned the id to `retrying` without dropping it from
`restarting`, so the `<Image>` the whole mechanism exists to mount would never have mounted). A
per-site rule would have caught the first and missed the second, which is why this is an invariant
the implementation asserts rather than a step in two procedures.

**`restarting` is disjoint from `retrying`, and that is load-bearing rather than tidy.** Review
round 2 found the first draft of §4.1 adding an id to `restarting` without removing it from
`retrying`. Two things break if it stays: the §3.2 effect sees uninterrupted membership, so it never
retires the expired timer or starts a fresh one, and the REPLACEMENT request inherits no deadline at
all — the exact defect this arc exists to close, reintroduced by the repair for it. Leaving
`retrying` is what makes the new request a new thirty seconds.

**The render predicate `restarting` needs, stated because leaving `retrying` is not sufficient.**
Both components decide the image branch from `retrying` and `failedKeys`
(`Gallery.tsx:623-632`, `GalleryLightbox.tsx:1025-1029`), so an id that leaves `retrying` without
entering `failedKeys` would fall through to the IDLE branch and mount the image that never loaded.
Each component therefore computes an in-flight conjunct that covers both states, and gates the
`<Image>` on `restarting` being false:

- the failed branch is chosen on `failedKeys.has(id) && !(retrying.has(id) || restarting.has(id))`,
  so `restarting` is never the failed cell
- the `<Image>` mounts when the cell is available AND `!restarting.has(id)`
- the overlay mounts on `retrying.has(id) || restarting.has(id)`, which is what keeps it ONE element
  across check-in, restarting and retrying (§4.1)

**Why a sub-state and not a branch.** A fifth branch would have to decide what happens to the
`<Image>`, and every answer except "leave it exactly where it is" cancels a request the ruling says
is never cancelled. Keeping the image mounted is not an optimization; it is the mechanism.

### 3.1 `checkedIn` is intersected with `retrying` at READ time, not maintained by every writer

`checkedIn` is a `ReadonlySet<string>` like `failedKeys` and `retrying`, and it is read ONLY as

```ts
const effectiveCheckedIn = intersect(checkedIn, sweptRetrying);
```

Nothing renders from `checkedIn` directly, and no code path is asked to remember to clear it.

**This is the repair for a class review round 1 found, and it is deliberately a derivation rather
than a longer list.** The first draft required every path that removes an id from `retrying` to
clear `checkedIn` and its timer in the same handler, and then named four such paths. There are at
least
seven, and the two the draft missed are the interesting ones:

| removal path | where |
|---|---|
| `onLoad` | `handleRetrySuccess` (`Gallery.tsx:508`), the lightbox's active-image `onLoad` (`GalleryLightbox.tsx:1319`) |
| `onError` | `handleRetryFailure` (`Gallery.tsx:477`) and the lightbox equivalent |
| the availability sweep | `Gallery.tsx` `sweep`, `GalleryLightbox.tsx` `sweepSet` |
| **the gallery's RENDERED-ID sweep** | `Gallery.tsx:344`. "Show fewer", or a reorder past the twelve-item cutoff, unmounts the cell and abandons the request. It keys on `renderedIds`, not availability |
| **the lightbox's Embla `select` handler** | `GalleryLightbox.tsx:549`. Swiping away from an active slide abandons its retry and hands the id back to `failedKeys` |
| Restart | §4.1 |
| component unmount | React |

An enumeration is wrong the moment someone adds the eighth. The intersection is correct for all
seven and for the eighth, because a `checkedIn` id that is not in `retrying` RENDERS nothing.

**And rendering is the only thing it makes safe. That limit is stated here because getting it wrong
cost three review rounds.** Drafts of this section claimed a stale `checkedIn` entry was inert
"by construction", full stop. It is not. The intersection is evaluated during render, so it governs
what the render produces and nothing else. Code that runs OUTSIDE the render phase reads a snapshot
of `retrying` taken when it was scheduled, and three separate findings were instances of exactly
that:

| reader | what it saw | round |
|---|---|---|
| the timer callback | the closure from `handleRetry`, which predates the id entering `retrying` | 1 |
| the timer callback, already queued when the id left | a set that no longer contains the id, so its write to `checkedIn` outlives the reconciler's clear and poisons the NEXT retry | 3 |
| the announcement effect | the pre-`onLoad` intersection, so it can announce "is still loading" after the image succeeded | 3 |

Patching each race separately is what the first three rounds did, and the finding rate did not move
(5, 4, 5). §3.2 states the structural repair instead, and it is not a new invention: it is the
mechanism the lightbox already ships.

The set is still swept, so it does not grow without bound: the reconciling effect in §3.2 drops
ids that have left `retrying`. But nothing CORRECT depends on that sweep having run.

### 3.2 Two effects own every timer, and the split is not cosmetic

Per component, TWO effects, and the split is the whole point.

**The reconciler**, keyed on the swept `retrying` set, with NO cleanup function:

- for each id in `retrying` with no timer, start one for `RETRY_CHECK_IN_MS`
- for each timer whose id is no longer in `retrying`, clear it and drop the handle
- drop those ids from `checkedIn` and from the announced set (§6)

**The unmount guard**, empty dependency list, whose cleanup clears every live timer.

**Why two and not one, which review round 2 caught.** React runs an effect's cleanup before EVERY
dependency-driven re-run, not only on unmount. A single effect that cleared every timer in its
cleanup would restart every OTHER item's window whenever any item entered or left `retrying`: item A
waits 29 seconds, item B enters, A's timer is cleared and restarted at zero, and A checks in at
about second 59. The reconciler therefore computes the difference between the timer map and the
current set inside its BODY, and touches only the ids that actually changed. The clear-everything
path belongs to the mount-scoped effect, which runs its cleanup exactly once.

That defect is invisible to a criterion that counts timers, because A does have exactly one live
timer throughout. AC-1 is written accordingly (§10): it pins WHEN a check-in fires relative to its
own entry, with a second item entering and leaving in between.

**Why an effect and not the removal sites.** Two reasons, both from the live tree rather than from
principle. Both availability sweeps run in the RENDER phase — `Gallery.tsx` computes `sweptRetrying`
and calls `setRetrying` during render, and `GalleryLightbox.tsx` does the same through `sweepSet` —
and those bodies must not mutate a ref. And the enumeration argument of §3.1 applies to timers
exactly as it applies to membership: the effect derives what should be running from what IS
retrying, so a removal path nobody has written yet is already covered.

### 3.2a The snapshot bound, which is the contract, and the mechanism, which is not

**THE BOUND.** ANY code that runs outside the render phase may observe a STALE `retrying` snapshot.
Not "the readers listed below", not "the readers we thought of": any. A `setTimeout` callback, a
passive effect, a subscriber registered once, a handler added next month. **The mechanism must make
that harmless.** An out-of-render reader acting on a stale snapshot must produce no state write for
an item that has left `retrying`, and no announcement for one that has left or resolved.

This is stated as a bound rather than an inventory on the orchestrator's ruling of 2026-08-31, and
the reason is measured rather than stylistic. Earlier drafts of this section listed the readers,
first three and then five, and each list was the refutable surface: round 3 found readers the list of
three had missed, and round 4 found four more the list of five had missed, including the Embla
subscriber (`GalleryLightbox.tsx:559`) the same section cited as its pattern. An inventory over an
open set fails open by construction, and a criterion scoped to "the readers named here" cannot see
what the inventory missed. **A reader-census finding therefore files to
`LIM-OUT-OF-RENDER-SNAPSHOT-READ`, not to a review round.** The bound above is the contract; naming a
sixth reader does not weaken it, because the bound already ranges over all of them.

**THE MECHANISM IS A CANDIDATE, AND A TEST DECIDES IT.** Two are on the table. Neither is ratified
here, because prose has now been wrong about this twice and the deciding suite is what settles it
(§10, AC-16 and AC-18; the plan's planted-race tasks are the oracle).

**Primary candidate: the writer-side twin.** Every call site that writes `retrying` updates a mirror
SYNCHRONOUSLY in the same statement, so the mirror is current the instant the state change is
queued rather than one passive effect later. Out-of-render readers consult the mirror. What makes
this differ from the refuted version is WHO updates it: the writer set of `retrying` is CLOSED and
greppable, where the reader set is open, so the pairing is pinnable by a structural meta-assert that
walks the call sites and fails on one without its mirror write. State the writer set, never the
consultation schedule.

**Fallback candidate: fire-time re-read.** The timer callback captures nothing and re-reads current
state when it fires, through a functional state update whose `prev` argument is live by React's own
contract, no-opping when the item is gone or resolved. Narrower than the primary, because it covers
the timer and not the announcement, but it needs no mirror at all.

**What the refuted repair got wrong, recorded so neither candidate repeats it.** Round 3's repair
mirrored `retrying` into a ref synced by a PASSIVE effect. React flushes pending passive effects
before the next render, so the mirror and the reader it protects were pending from the same commit
and the mirror had not learned about a removal that was queued but not rendered. **A mechanism that
learns about a removal on the same schedule as the reader it protects protects nothing.** Both
candidates above avoid that by reading something that is current at the moment of use: the primary
because the write is synchronous with the state change, the fallback because it re-reads rather than
remembering.

### 3.3 The constant, and where it lives

```ts
export const RETRY_CHECK_IN_MS = 30_000;
```

Declared and exported from `components/diagrams/GalleryLightbox.tsx`, imported by
`components/diagrams/Gallery.tsx`. The dependency edge already runs that way (`Gallery.tsx:38`
imports `GalleryLightbox`, and the reverse would be circular), and it matches the shipped precedent
for a shared diagram timing, `DEMOTE_CHIP_VISIBLE_MS` (`GalleryLightbox.tsx:130`), asserted by value
at `tests/components/diagrams/galleryLightbox.zoomGate.test.tsx:990`.

The numeric separator is safe and is not a matter of opinion:
`tests/docs/interactionTimingScan.test.ts:69` asserts that `scan("setTimeout(f, 30_000);")[0].value`
is `30000`. An earlier draft of this section claimed the scanner had never been asked to parse that
spelling, which was false; review round 1 caught it, and the corrected claim is the one above.

A new `components/diagrams/` module for one number would add a file to save nobody a step.

`DESIGN.md` §5.5 gains one row: `RETRY_CHECK_IN_MS` | 30000 |
`components/diagrams/GalleryLightbox.tsx`. That table is derived rather than hand-listed, and
`tests/docs/_metaInteractionTimingInventory.test.ts` compares §5.5 against the scanner's reading of
the source, so the row is not optional bookkeeping: the meta-test reds until it is there.

## 4. Transitions, exactly

- **`failed` → `retrying`**: unchanged from 2026-08-29. The §3.2 effect starts the timer on the
  commit that adds the id; `handleRetry` itself gains nothing.
- **`retrying` → `retrying+checked-in`** (the timer fires): add the id to `checkedIn`. Nothing else
  changes. The `<Image>`, its `srcSet`, its handlers and its position are untouched.
- **`retrying` → `idle`** (`onLoad`): remove the id from `retrying`. Reached from both sub-states;
  from the checked-in one it is the resolve-during-check-in case, and the image wins. `checkedIn`
  and the timer follow from §3.1 and §3.2 rather than from this handler.
- **`retrying` → `failed`** (`onError`): remove the id from `retrying`, add it back to `failedKeys`.
  Reached from both sub-states.
- **`retrying+checked-in` → `restarting`** (Restart, one commit): remove the id from `retrying` and
  `checkedIn`, add it to `restarting`. The §3.2 reconciler sees the id leave and retires its timer.
- **`restarting` → `retrying`** (the layout effect, before paint): the id is removed from
  `restarting` and added to `retrying` in one update, per the disjointness invariant in §3. The
  reconciler then starts a FRESH `RETRY_CHECK_IN_MS` window, and a new `<Image>` mounts because the
  render predicate no longer gates it off. §4.1.
- **any session state → `unavailable`**: the availability sweep of 2026-08-29 §9.1 is unchanged.
  It sweeps `retrying`, and §3.1 and §3.2 carry `checkedIn` and the timer with it.

### 4.1 Restart

Restart is the only new user gesture, and it never renders a state that contradicts what is true.

1. **One commit.** Remove the id from `retrying` AND from `checkedIn`, and add it to `restarting`.
   Leaving `retrying` is what lets §3.2 retire the expired timer, so the replacement request gets a
   fresh thirty seconds; an earlier draft left the id in `retrying` and review round 2 showed the
   new request would then carry no deadline at all. The `<Image>` unmounts, because the render
   predicate of §3 gates it on `restarting` being false. The overlay stays: it is the same element,
   in the same position, so the browser keeps focus on it with no hand-off.
2. **A `useLayoutEffect`** keyed on `restarting` moves every id in it OUT of `restarting` and INTO
   `retrying`, in one update. An id left in both sets renders no image forever, since §3's predicate
   gates the `<Image>` on `restarting` being false; the disjointness invariant in §3 is what forbids
   that state rather than a caution in this step. A layout effect
   runs before the browser paints, so the imageless commit is never painted. `restarting` is swept
   by the same predicates as `retrying` — availability in both components, plus `renderedIds` in the
   gallery and the active slide in the lightbox — and the effect promotes only ids that survive that
   sweep, so an item that goes away mid-Restart is not resurrected into a request nobody wants.
3. The `retrying` commit mounts a NEW `<Image>`, which is a new request. That is where the fresh
   attempt comes from.

**Why not a bounce through `failed`, which is what the first draft specified.** Review round 1 was
right to call that critical. `failed` renders a control whose accessible name says the diagram
"could not be loaded", and the request is still pending, so the committed intermediate frame stated
something false — and the draft moved focus onto it, which is the one way to guarantee it is
announced. That is precisely the lie §6 says this design never tells. `restarting` says
`Retrying…`, which is true at every instant it exists, and no focus moves at all.

**Why a layout effect and not a passive one.** A passive effect permits the intermediate frame to
paint. Nothing false would be painted now that the copy is honest, but a visible flash of an
imageless overlay is still a flicker with no purpose, and `useLayoutEffect` costs nothing here: the
work is one set-to-set move with no layout read.

**This is not the `attempt` counter.** No `key` changes and no counter exists. The remount is the
branch actually changing, which is the ordinary behavior of the state machine that already ships.

**This is not a violation of "one tap is one request".** That rule (2026-08-29 §4.0.5) exists so a
crew member is not billed twice for one gesture. Restart is a second gesture, freely chosen, whose
entire meaning is "try again".

**What happens to the ORIGINAL request.** Nothing, by us. We call no abort. React removes the old
`<img>` from the document on the `restarting` commit and detaches its listeners with it, so its
`onLoad` and `onError` can no longer reach either component. That is the mechanism, and it is
React's, not ours.

An earlier draft credited this to "the connectedness guard" of 2026-08-29 §4.1. Review round 1
established that no such guard ships on either success path: `handleRetrySuccess`
(`Gallery.tsx:508`) removes state and announces without a connectivity check, and the lightbox's
active-image `onLoad` (`GalleryLightbox.tsx:1319`) checks only a render-captured `retrying` set.
The sibling spec asked for one and its §0 does not record the removal. Recorded here so the
citation is not re-derived: the guard is absent, the unmount is sufficient, and this spec adds no
guard because none is needed.

### 4.2 Guard conditions for every input

| input | null / empty / zero / boundary | behavior |
|---|---|---|
| `item.alt` empty | — | Neither surface can produce a nameless control, but they get there by DIFFERENT shapes and this row said otherwise until review round 3. The gallery has a `nameOf` helper (`Gallery.tsx:401`) that falls back to the 1-based visible position, and the check-in name uses it. `GalleryLightbox.tsx` has no such helper — zero occurrences — and repeats an inline `` item.alt || `Diagram ${i + 1}` `` fallback at each site; the check-in name follows that local shape. Unifying them is not this arc's work, and claiming a shared symbol that does not exist was the defect |
| `item.available` flips false mid-check-in | — | the availability sweep clears `retrying`; §3.1 makes the retained `checkedIn` id inert on the same render and §3.2 drops it and its timer on the next commit |
| the item leaves `renderedIds` mid-check-in | "Show fewer", or a reorder past the twelve-item cutoff | the gallery's rendered-ID sweep (`Gallery.tsx:344`) removes it from `retrying` and hands the failure back. Same two mechanisms carry `checkedIn` and the timer |
| an active lightbox slide is swiped away mid-check-in | — | the Embla `select` handler (`GalleryLightbox.tsx:549`) removes it from `retrying` and restores `failedKeys`. Same two mechanisms again. This is why §6 says an inactive slide cannot RENDER a check-in rather than that it can never enter one |
| the component unmounts mid-check-in | — | the §3.2 effect's cleanup clears every live timer |
| Restart double-pressed | — | the second press lands on the `restarting` overlay, whose handler is inert. If a press arrives while the id is in neither `retrying` nor `restarting`, the handler returns early |
| `RETRY_CHECK_IN_MS` reached with the tab backgrounded | timers throttle | the check-in appears late rather than never. A throttled timer is a conservative outcome and a documented limit (§9.2), not a defect |
| the timer fires in the same tick as `onLoad` | — | the write lands on an id that has left `retrying`, so it is inert by §3.1 and dropped by §3.2. No ordering guarantee is required, which is why none is specified |
| two items checked in at once | — | the state is per item and so are the timers; nothing is shared |

## 5. Copy

`DESIGN.md` §9 house rules: no em dashes (enforced by `tests/styles/_metaEmDashCopy.test.ts`),
straight apostrophes, plain words. The register is the product's calm one, named at `DESIGN.md:605`
against `PRODUCT.md`'s "not techie" anti-reference. Identical strings on both surfaces, matching the
2026-08-29 §5.1 ruling that the in-flight copy does not branch by surface.

| slot | text |
|---|---|
| in-flight, before the check-in, visible | `Retrying…` (unchanged) |
| `restarting`, visible | `Retrying…`. The same string, because it is the same truth |
| check-in, visible line 1 | `Still loading` |
| check-in, visible line 2 | `Restart` |
| check-in, accessible name | `<name> is still loading. Restart.` |
| announcement when the check-in fires | `<name> is still loading.` |

**The gallery check-in drops the `ImageOff` icon its in-flight overlay carries.** Two short lines
and no icon fit the ~117px cell at `30vw` on a 390px viewport without a third row of content, and
the icon was carrying "something is wrong", which the two lines now say in words. The lightbox
overlay has no icon in either sub-state — it is a text pill today
(`data-testid="lightbox-retrying"`) — so nothing is dropped there and the two surfaces end up with
the same content for the first time.

### 5.1 Why the copy does not name a cause

The mockup this decision was taken against read `Still loading. Slow connection.` The second
sentence does not ship, and the reason is the one 2026-08-29 §5.1 already gave for refusing to put a
byte count on the gallery cell: the app cannot know it. An `<img>` `onError` and a pending `<img>`
load expose no status, no timing and no transport state, which is documented limit 1 of the
2026-08-29 spec. A slow response can be venue wifi, a 50 MB original, or a slow route. Naming one of
them is inventing a diagnosis, and a wrong diagnosis sends a crew member to fix the wrong thing.
`Still loading` is the whole of what we know, and it is true.

Re-file trigger for the fuller copy: the asset route gaining a client-visible status channel, which
is the same trigger that closes documented limit 1 there.

## 6. Accessibility, and the `aria-busy` question the row raised

| attribute | `retrying` | `retrying+checked-in` | `restarting` |
|---|---|---|---|
| `aria-busy` | `"true"` | `"true"` | `"true"` |
| `aria-disabled` | `"true"` | ABSENT | `"true"` |
| native `disabled` | never | never | never |
| accessible name | `<name> could not be loaded. Retrying…` | `<name> is still loading. Restart.` | `<name> could not be loaded. Retrying…`, the same as `retrying` |

**On `restarting` carrying the word "loaded", which review round 2 flagged against AC-10.** The
name is the in-flight name, unchanged, and it is true: the diagram DID fail to load, and a retry is
running. What was false in the design round 1 killed was the FAILED control's name, which says the
attempt is over and offers a new one while a request is still in flight. AC-10 was written as a
phrase ban and that was the imprecise half, so §10 now states the criterion the finding was actually
about: during Restart no committed frame renders the failed control, every committed frame keeps
`aria-busy="true"`, and focus does not move. That is testable, it catches the original defect, and
it does not forbid a true sentence.

`aria-busy` is `"true"` in all three because in all three a request is in flight. This is the honest
value at second 31 exactly as it was at second 1. Dropping it would announce a completion that has
not happened, which is the lie the deferred row was guarding against. `aria-disabled` is absent only
in the check-in, because that is the only state whose control does something. The native `disabled`
attribute is never used on any of them: it ejects focus to `<body>`, outside the lightbox's
`aria-modal` dialog (2026-08-29 §7.1).

**The row's objection, answered directly.** It said a timer would make `aria-busy` lie. It would, if
the timer changed `aria-busy` — declaring a request finished because a clock said so. This design
never touches `aria-busy`. What the timer changes is what the UI OFFERS, and offering an exit from a
wait is not a claim about the wait ending.

### 6.1 Where the announcement comes from, since the clock is the wrong source

The check-in announces once per entry through the existing channel router (`routeAnnouncement`,
`Gallery.tsx:405`), so a check-in inside an open lightbox reaches the dialog-local region and one
during the exit window is buffered, exactly as failures and retry outcomes already are.

**It is emitted by an effect over the EFFECTIVE checked-in set, never by the timer callback.**
Review round 2 was right that the two cannot both hold otherwise: §3.2 promises a late timer write
is inert, and a callback that also speaks has already spoken by the time anything could make it
inert. So:

- an effect keyed on `effectiveCheckedIn` (§3.1) iterates the ids in it, and for each one **re-checks
  liveness at execution time, by whichever mechanism §3.2a's candidates resolve to** before
  announcing, then records the id in
  `announcedCheckInRef`
- the §3.2 reconciler drops an id from `announcedCheckInRef` when it leaves `retrying`, so a genuine
  second entry announces again and a re-render does not

**The execution-time re-check is not belt-and-braces; without it the effect is wrong.** A passive
effect closes over the render that scheduled it, and React flushes pending passive effects before
starting the next render. So an effect scheduled by the check-in commit still holds the pre-`onLoad`
intersection and will run even though the image has since loaded. An earlier draft claimed the
intersection alone settled this, and review round 3 refuted it: the intersection can stop an effect
created by a LATER render from speaking, but it cannot invalidate one already scheduled. The ref is
read when the effect actually runs, which is the only moment that answers the question.

The same re-check covers every sweep case for the same reason, so the two admitted races share one
mechanism rather than one rule each.

`restarting` announces nothing. It is a staging state that says `Retrying…`, which the entry already
announced, and saying it twice is noise rather than information.

**An inactive lightbox slide cannot RENDER a check-in.** The overlay is gated on
`isRetrying && isActive` (`GalleryLightbox.tsx:1062`), and the Embla `select` handler
(`GalleryLightbox.tsx:549`) removes a departing slide's id from `retrying` and restores its failure.
An earlier draft said an inactive slide "can never check in", which review round 1 showed was false:
a slide can check in while active and then be swiped away. The corrected claim is the one that
matters and the one that is true — nothing inactive paints a check-in or speaks one — and it holds
because of the gate and the handler, not because the state is unreachable.

## 7. Dimensional invariants

The check-in re-renders the SAME element as the in-flight overlay, so every relationship 2026-08-29
§8 pinned still holds by construction. What changes is the content, and content is where a
fixed-aspect parent breaks.

| parent | child | guarantee |
|---|---|---|
| gallery `<li>` `aspect-square overflow-hidden` (`Gallery.tsx:651`) | in-flight / check-in / restarting `<button>` | `absolute inset-0`, unchanged from the shipped overlay |
| check-in `<button>` | its two text lines | `flex flex-col items-center justify-center gap-1`, the shipped overlay's own classes; the two lines replace the icon-and-label pair rather than adding to it |
| check-in `<button>` | tap target | `min-h-tap-min`, already on both overlays and load-bearing here for the first time, because this is the first state in which the overlay is pressable |

The plan carries a real-browser `getBoundingClientRect` assertion that the check-in button's height
equals the gallery cell's within 0.5px, and that both text lines are inside it. jsdom computes no
layout and cannot establish either.

## 8. Transition inventory

Six render states: `idle`, `failed`, `retrying`, `retrying+checked-in`, `restarting`,
`unavailable`. That is `6*5/2 = 15` unordered pairs, and every row states BOTH directions, because
on this machine a pair is routinely reachable one way and unreachable the other.

| pair | A to B | B to A |
|---|---|---|
| idle / failed | `onError` on the image. Instant swap, unchanged from 2026-08-29 | `onLoad` never fires from `failed`, which renders no image. Reached only via `retrying` |
| idle / retrying | unreachable: `retrying` is entered only from `failed` or `restarting`, and `failed` needs a tap on a control only it renders | `onLoad`. Instant. The overlay unmounts in the same commit that reveals the image |
| idle / checked-in | unreachable: `checkedIn` is written only by a timer that only a `retrying` entry starts | `onLoad` during the check-in. Instant, and the image wins with no intermediate frame. This is the resolve-during-check-in case |
| idle / restarting | unreachable: `restarting` is entered only by pressing Restart, which exists only in the check-in | unreachable: `restarting` leaves only to `retrying`, in a layout effect, before paint |
| idle / unavailable | `item.available` flips false. Instant; `idle` holds no per-item state to sweep | flips true. Instant. The cell does not remount, so this is a real transition rather than a mount |
| failed / retrying | tap the retry control. Instant | `onError`. Instant |
| failed / checked-in | unreachable: no path writes `checkedIn` without first spending `RETRY_CHECK_IN_MS` in `retrying` | `onError` during the check-in. Instant. The check-in copy does not persist into the failed control |
| failed / restarting | unreachable: Restart exists only in the check-in | unreachable: `restarting` leaves only to `retrying`. This is the pair the first draft got wrong, and §4.1 records why |
| failed / unavailable | flips false. Instant. The availability sweep clears `failedKeys` on the way in (2026-08-29 §9.1) | flips true. Instant, and the cell returns `idle`, because the sweep already cleared the id |
| retrying / checked-in | the timer fires at `RETRY_CHECK_IN_MS`. Instant, and deliberately so: a fade would draw the eye to a control that has been sitting still for thirty seconds, and the change is a copy swap inside a node that does not move | unreachable directly: nothing removes an id from `checkedIn` while leaving it in `retrying`, except Restart, which routes through `restarting` |
| retrying / restarting | unreachable directly: Restart is offered only in the check-in, so the path out of plain `retrying` into `restarting` does not exist | the layout effect of §4.1, before paint. The id re-enters `retrying` with a fresh timer, which is what makes the replacement request carry its own deadline |
| retrying / unavailable | flips false. Instant. The sweep clears `retrying`; `checkedIn` and the timer follow by §3.1 and §3.2 | flips true. Instant, returning `idle`; the in-flight request is not resumed, because its state is gone |
| checked-in / restarting | pressing Restart. Instant, one commit, and the id leaves `retrying` in the same write | unreachable: `restarting` leaves only to `retrying`, and a new check-in needs another 30 seconds there |
| checked-in / unavailable | flips false. Instant. Same three members, same two mechanisms | flips true. Instant, returning `idle` |
| restarting / unavailable | flips false, or the item leaves `renderedIds`, or its slide goes inactive. Instant. `restarting` is swept by the same predicates as `retrying` (§4.1 step 2), so the branch is gone on that render and the layout effect finds an id the sweep dropped and promotes nothing | flips true. Instant, returning `idle`. The abandoned request is not resumed, because its state is gone |

### 8.1 Compound transitions

| compound case | behavior |
|---|---|
| the image LOADS while the check-in is on screen | the image wins, with no intermediate frame. `onLoad` removes the id from `retrying`, which makes the `checkedIn` entry inert on that same render, so the overlay unmounts in the commit that reveals the image |
| the image ERRORS while the check-in is on screen | `failed`, announced `<name> still could not be loaded.` — the string that already ships at `Gallery.tsx:503` and `GalleryLightbox.tsx:1358`. The check-in copy does not persist into the failed control |
| the item goes unavailable while the check-in is on screen | the availability sweep clears `retrying`; the placeholder renders immediately, because `item.available` gates every session state |
| the item leaves `renderedIds` while checked in | "Show fewer" or a reorder past the cutoff. The rendered-ID sweep abandons the retry and restores the failure; on re-expand the cell offers its retry control, never a resurrected check-in |
| an active slide is swiped away while checked in | the Embla handler abandons the retry and restores the failure. Swiping back shows the failed control, not a check-in for a request nobody is waiting on |
| Restart pressed, and the ORIGINAL request completes during the staging commit | the old `<img>` is out of the document and its listeners are detached, so neither handler fires. The new request decides the outcome |
| Restart pressed while ANOTHER item is 29 seconds into its own wait | that item's window is untouched. The §3.2 reconciler changes only the ids whose membership changed, and the clear-everything path is a separate mount-scoped effect. This is AC-1b |
| Restart pressed, and the item goes unavailable in the same tick | the sweep drops the id, the `restarting` branch is gone on that render, and the layout effect moves nothing |
| the timer fires in the same tick as `onLoad` | the `checkedIn` write is inert by §3.1. No ordering guarantee is needed |
| two items checked in at once | independent. Per-item state, per-item timers, two overlays |

## 9. Documented limits

Each is a conservative outcome plus a surfaced signal, never silent corruption, so each files here
rather than as a finding.

1. **The check-in cannot say why a request is slow.** No status channel exists (§5.1). Re-file
   trigger: the asset route gaining a client-visible status channel, which is documented limit 1 of
   the 2026-08-29 spec.
2. **A backgrounded tab throttles the timer, so the check-in can appear later than 30 seconds.**
   Never earlier. The conservative direction: a user who is not looking at the tab is not waiting on
   it, and when they return the check-in is there. Re-file trigger: a report of a check-in appearing
   so late that a user gave up first.
3. **Restart has no cap.** A user can Restart repeatedly. Each is user-paced and each is bounded
   exactly as a tap already is: by the 1024 tier for a laddered entry, by the route's 50 MB cap for
   an originals-only one. Same posture as limit 2 of the 2026-08-29 spec, on the same grounds.
   Re-file trigger: telemetry showing a crew member hammering a dead diagram.
4. **A request that hangs forever hangs forever.** Nothing here kills it, by ratification (§1.1).
   The user gets an exit; the socket is the browser's problem.
5. **A `checkedIn` id can outlive its `retrying` entry for one commit.** By construction, since
   §3.1 makes correctness independent of when the sweep runs. It renders nothing and means nothing
   in that window, and §3.2 drops it. Recorded because "the set is not always minimal" is true and
   should not read as an oversight.

## 10. Acceptance criteria

| id | criterion |
|---|---|
| AC-1 | An item entering `retrying` has exactly one live check-in timer, and an item leaving `retrying` by ANY of the seven paths in §3.1 has none |
| AC-1b | An item's check-in fires at `RETRY_CHECK_IN_MS` after ITS OWN entry, with a second item entering and then leaving `retrying` in between. A count of live timers cannot see this, which is why it is its own criterion |
| AC-2 | At `RETRY_CHECK_IN_MS` the overlay shows `Still loading` and `Restart`, and its accessible name is `<name> is still loading. Restart.` |
| AC-3 | `aria-busy` is `"true"` in all three in-flight states, asserted on the same element across the transitions |
| AC-4 | `aria-disabled` is present before the check-in, absent during it, and present again in `restarting` |
| AC-5 | The `<Image>` element identity is UNCHANGED across the check-in, asserted by node identity rather than by presence |
| AC-6 | `onLoad` during the check-in reaches `idle` with no intermediate frame |
| AC-7 | `onError` during the check-in reaches `failed` and announces the existing still-failed string |
| AC-8 | Restart reaches `retrying` and the second `<Image>` is a DIFFERENT node from the first |
| AC-8b | The replacement request gets its own check-in: after Restart the id is out of `retrying` for one commit and back in on the next, and a check-in fires `RETRY_CHECK_IN_MS` after THAT re-entry |
| AC-8c | `retrying` and `restarting` are never both true for one id, and never both false while the cell is in flight, asserted on every commit of a Restart. This is the disjointness invariant of §3, and it is its own criterion because both of its violations were silent |
| AC-9 | No code path in either component calls `AbortController`, `abort()`, or clears an `<img>` `src` |
| AC-10 | Across every commit of Restart: the failed control is never rendered, the overlay keeps `aria-busy="true"`, and `document.activeElement` does not change. Stated as the three observable facts rather than as a ban on a phrase, because the in-flight name legitimately contains that phrase (§6) |
| AC-11 | A `checkedIn` id whose `retrying` entry is gone renders nothing, asserted directly for the rendered-ID sweep and for the Embla swipe-away |
| AC-12 | Every new `useState` / `useRef` in both components has a `PER_ITEM_STATE_REGISTRY` row with a non-empty `clearedBy` and a sweep decision |
| AC-13 | In a real browser, with the asset request held open, the check-in appears and the check-in button's height equals the gallery cell's within 0.5px |
| AC-14 | The check-in announces once per entry through the existing channel router, and `restarting` announces nothing |
| AC-15 | No announcement is emitted for an id that has left `retrying` or resolved, asserted for the same-tick `onLoad`, for a swept item, and for the case where the announcement effect was ALREADY SCHEDULED when the image loaded. The third is the one the intersection alone does not cover, and it is the case that refuted the round-3 mechanism |
| AC-16 | A check-in timer callback that fires after its id has left `retrying` writes nothing. Asserted by driving an item out of `retrying` with the callback already queued, then re-entering `retrying` and asserting the new entry waits a full `RETRY_CHECK_IN_MS` rather than checking in at once. A stale write is invisible until the NEXT retry inherits it, so the assertion is on the next retry |
| AC-18 | THE DECIDING CASE, planted per surface. With a check-in timer pending, remove the item from `retrying` by each removal source in turn, and assert the observable outcome: no `checkedIn` write, no announcement, and a subsequent retry that waits its full window. This is what settles §3.2a's candidates; prose has been wrong about this twice and a test has not been asked yet |
| AC-17 | Whichever mechanism §3.2a resolves to is PINNED structurally. If the writer-side twin ships, a walker over every `setRetrying` call site in both components asserts each is paired with its synchronous mirror write, and a call site added later without one fails. The assertion is over the WRITER set, which is closed, never over the reader set, which is open and whose enumeration is the refuted surface |

## 11. Out of scope

- Cancelling, aborting or timing out the request itself. Ratified (§1.1).
- A client-visible status channel for the asset route. Documented limit 1 of the 2026-08-29 spec.
- Automatic retry, backoff, or a retry cap. 2026-08-29 §12, unchanged.
- A second check-in at a later deadline. One offer is an exit; two is nagging.
- Adding the connectedness guard the 2026-08-29 spec asked for and did not ship (§4.1). It is a real
  gap on the success paths and it is not this arc's; nothing here depends on it.
- Changing anything about the demote path, the zoom gate, or the failed-state copy.
