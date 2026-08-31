# Plan: a hung retry gets a soft check-in at 30 seconds (2026-08-31)

Spec: `docs/superpowers/specs/2026-08-31-retry-check-in-design.md`. It extends
`docs/superpowers/specs/2026-08-29-diagram-failure-retry-design.md`, whose §0 AS-BUILT
DIVERGENCE table outranks every later mention of the mechanisms it retires.

Branch `fix/lightbox-pair-and-retry-checkin`, worktree `../FX-worktrees/lightboxpair`.

Closes ONE `DEFERRED.md` row: `DIAGRETRY-NO-RETRY-DEADLINE-1`.

`CONTROLOUTLINE-PAIRED-CHROME-WEIGHT-1` was this arc's second row and SPLIT OFF on 2026-08-31 by the
orchestrator's ruling. Its design shipped six days earlier in `e6408222c`, so what remained was
docs-only prose sharing no surface with the check-in; it moves to branch
`docs/paired-chrome-stale-text` and is driven to readiness independently.

## Meta-test inventory

| meta-test | this plan |
|---|---|
| `tests/components/diagrams/perItemStateLifetime.probe.test.ts` + `tests/components/diagrams/perItemStateRegistry.ts` | EXTENDS. Every new `useState` / `useRef` in either component gets a registry row. The suite reds by default on an unclassified declaration, which is the mechanism, not a courtesy (Task 6) |
| `tests/docs/_metaInteractionTimingInventory.test.ts` | EXTENDS via data. It compares `DESIGN.md` §5.5 against `scripts/scan-interaction-timings.ts` reading `components/**`, so `RETRY_CHECK_IN_MS` reds it until §5.5 carries the row (Task 1) |
| `tests/styles/pairedChromeOutline.test.ts` | N/A. It belonged to the row that split off to `docs/paired-chrome-stale-text` on 2026-08-31 |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | N/A. This plan touches no `pg_advisory*` path, no RPC, and no DB |
| `tests/auth/_metaInfraContract.test.ts` | N/A. No Supabase client call is added or moved |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | N/A. No mutating route handler and no `"use server"` action is added or changed |

## Mutation enrolment

No file this plan changes is an enrolled `sourcePath` in `tests/mutation/source/registry.ts`.
The nearest enrolled surface is `tests/components/diagrams/perItemStateScanner.ts`, which this
plan does NOT edit; Task 6 edits `perItemStateRegistry.ts`, which that surface's `suitePaths`
entry does not name. No surface is enrolled under review pressure.

## Task list

<!-- tasks: depth=2 red-contract -->

## Task 1: the constant and its §5.5 row

<!-- task: red=`pnpm exec vitest run --project parallel tests/docs/_metaInteractionTimingInventory.test.ts` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:130` why=`scripts/scan-interaction-timings.ts reads components/** for numeric literal timings, so exporting RETRY_CHECK_IN_MS makes the scanner report a constant DESIGN.md 5.5 does not list` ac=AC-D2 -->

Add `export const RETRY_CHECK_IN_MS = 30_000;` to `components/diagrams/GalleryLightbox.tsx`,
beside `DEMOTE_CHIP_VISIBLE_MS` (`GalleryLightbox.tsx:130`), and import it into
`components/diagrams/Gallery.tsx`. The separator is safe:
`tests/docs/interactionTimingScan.test.ts:69` asserts the scanner reads `30_000` as `30000`. An
earlier draft of the spec claimed otherwise and review round 1 refuted it, which is why the plan
states the citation rather than the habit.

RED: add the constant, run the meta-test, observe it fail naming the missing §5.5 row.
GREEN: add the row `| RETRY_CHECK_IN_MS | 30000 | components/diagrams/GalleryLightbox.tsx |`
to `DESIGN.md` §5.5 in the table's existing sort position, and re-run the SAME command.

The order matters and is the point: adding the row first would make the meta-test red for the
opposite reason and would not prove the scanner sees the constant.

## Task 2: the deciding suite, which judges the mechanism

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/retryCheckInRaces.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:126` why=`neither component has a check-in at all, so every case in the new file fails on the absent state before any mechanism exists to judge` ac=AC-15,AC-16,AC-18 -->

Spec §3.2a names TWO candidate mechanisms and ratifies neither, because prose has been wrong about
this axis twice and the orchestrator ruled after the round cap that a test decides it rather than
another round. This task writes that test FIRST, before either candidate is built, which is why it
sits ahead of the implementation tasks rather than after them.

**The bound it enforces, quoted from the spec so the file carries its own contract:** any code that
runs outside the render phase may observe a stale `retrying` snapshot, and the mechanism must make
that harmless. The suite does not care WHICH candidate ships. It asserts observable outcomes, so the
writer-side twin and the fire-time re-read are judged by the same cases, and a third mechanism
nobody has thought of is judged by them too.

**Planted removal-during-pending-check-in, per surface, per removal source.** Drive an item into
`retrying`, advance to just before `RETRY_CHECK_IN_MS`, remove it by one source with the timer
callback pending, then advance past the deadline. Assert three things every time:

1. no check-in renders for that item
2. nothing is announced for it
3. a SUBSEQUENT retry of the same item waits a full `RETRY_CHECK_IN_MS` rather than checking in at
   once. This is the one that catches a stale write, because a stale `checkedIn` entry is invisible
   until the next entry inherits it

Removal sources, both surfaces unless noted: `onLoad`, `onError`, the availability sweep, Restart,
unmount, the gallery's rendered-ID sweep (`Gallery.tsx:344`, gallery only), and the lightbox's Embla
`select` handler (`GalleryLightbox.tsx:549`, lightbox only).

**Late success during the check-in.** With the check-in on screen, fire `onLoad`. Assert the image
wins with no intermediate frame, and that no "is still loading" announcement is emitted afterwards,
including when the announcement effect was ALREADY SCHEDULED at the moment the image loaded. That
last case is the one that refuted the round-3 mechanism, and it is the reason this assertion is on
the announcement channel rather than on the rendered copy.

**Anti-tautology, and this suite needs it more than any other in the plan.** Every case must be able
to FAIL on a mechanism that does nothing:

- derive every advance from the imported `RETRY_CHECK_IN_MS`, never a literal
- assert on the announcement CHANNEL (`routeAnnouncement`, `Gallery.tsx:405`) with a spy, not on
  rendered text, because the check-in copy and the announcement are different surfaces and a test
  reading the DOM cannot see an announcement that should not have happened
- `premise` before each planted case that the item WAS in `retrying` with a timer pending, since a
  case whose retry never started satisfies every "nothing happened" assertion vacuously
- run each case against a deliberately broken mechanism once during authoring, recorded in the
  commit: a callback that writes unconditionally must red case 3, and an announcement without the
  liveness check must red the late-success case. A case that stays green against both is measuring
  nothing

**What this task does NOT do.** It does not assert the SHAPE of a mechanism. It says what the
product must do, and Task 6 pins the shape separately.

**But the plan does decide, and this task is red until Task 3 makes it green.** Review round 1 was
right that a plan which writes an oracle and then defers both candidates has no task that can turn
the oracle green, which is a TDD violation dressed as flexibility. So: **the writer-side twin is the
mechanism this plan implements**, chosen by the orchestrator on 2026-08-31 from this arc's own
filing. Task 3 implements it on the gallery and this suite's gallery cases go green there; Task 4
does the lightbox and the rest go green.

The fire-time re-read remains a documented FALLBACK, not a branch in the task list. If the twin
fails a case here during implementation, that is an ordinary TDD failure: switch to the fallback,
record the switch and the failing case in the closeout, and Task 6's pin follows the mechanism that
actually shipped. Naming a fallback is not the same as leaving the choice open, and this plan does
not leave it open.

## Task 3: gallery: the check-in state, its timer, and its copy

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/gallery.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:126` why=`Gallery.tsx has no checkedIn set and no check-in timer, so advancing fake timers past RETRY_CHECK_IN_MS leaves the overlay showing Retrying and aria-disabled true` ac=AC-1,AC-1b,AC-2,AC-3,AC-4,AC-14,AC-15 -->

Add to `components/diagrams/Gallery.tsx`, per spec §3.1 and §3.2:

- a `checkedIn` `ReadonlySet<string>`, READ ONLY through its intersection with `sweptRetrying`.
  Nothing renders from it directly
- a `checkInTimersRef` `Map<string, ReturnType<typeof setTimeout>>`
- an `announcedCheckInRef` `Set<string>`, so the announcement fires once per entry (§6.1)
- TWO effects, per spec §3.2. A reconciler keyed on the swept `retrying` set, with NO cleanup
  function: start a timer for any retrying id without one, clear and drop any timer whose id has
  left, and drop those ids from `checkedIn` and from the announced set. Separately, a mount-scoped
  effect with an empty dependency list whose cleanup clears every live timer.
- an announcement effect keyed on the EFFECTIVE checked-in set, which announces for ids not yet in
  `announcedCheckInRef` and records them. The timer callback never announces

No handler starts or stops a timer, and no removal site is edited to maintain `checkedIn`. That is
the point of the design, and it is what round 1's second and third findings cost: the first draft
edited handlers and missed two of the seven removal paths.

The timer callback writes `checkedIn` and checks nothing. A write for an id that has already left
`retrying` is inert by the intersection, so the callback needs no live membership source, which the
gallery does not have (no `retryingStateRef`).

**AC-1b is the case a timer COUNT cannot see, and it is why the effects are split.** Drive item A
into `retrying`, advance 29 seconds, put item B into `retrying`, then take B out, then advance the
remaining second and assert A checks in. On a single effect whose cleanup clears every timer, A's
window restarts when B arrives and A checks in at about 59 seconds, while a count of A's live timers
reads exactly one the whole way through. Derive both advances from `RETRY_CHECK_IN_MS`, never from
literals, so the test moves with the constant.

**AC-15 is the announcement's own anti-tautology case.** Assert that nothing is announced when the
timer fires in the same tick as `onLoad`, and nothing when the item is swept. A test that only
checks the happy path passes on a callback that announces directly, which is the design round 2
refuted.

Render: the SAME `diagram-retrying-<i>` button, with the check-in copy of spec §5 when the id is in
the EFFECTIVE checked-in set. `aria-busy="true"` in every in-flight state; `aria-disabled` present
before the check-in and absent during it; drop the `ImageOff` icon in the check-in only.

Announce once through `routeAnnouncement` (`Gallery.tsx:405`). `restarting` announces nothing
(AC-14), because it would say `Retrying…` a second time.

**Anti-tautology.** Assert `aria-busy` on the element returned by `getByTestId`, before and
after `vi.advanceTimersByTime(RETRY_CHECK_IN_MS)`, comparing the SAME node, not a re-query
that could match a different element. Derive the advance from the imported constant, never a
hardcoded 30000, so a constant change moves the test with it. Scope the copy assertion to the
overlay button, not to the cell, because the cell also renders the thumbnail button's
accessible name and would satisfy a container-level text match.

**Premise.** Above the post-advance assertions, `premise` that the id was in `retrying` and NOT
in `checkedIn` immediately before the advance. Without it, a test whose retry never started
passes vacuously: `Retrying…` absent and check-in copy absent are both "not the old state".

**Four pre-dispatch mutants**, results recorded in the commit: (a) empty the check-in string;
(b) append a suffix to it; (c) put the string in a comment and behind a false condition;
(d) vary `RETRY_CHECK_IN_MS` and the item id in turn.

## Task 4: lightbox: the same state, the same way

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/galleryLightbox.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:333` why=`GalleryLightbox.tsx has no checkedIn set and no check-in timer, so the lightbox-retrying overlay keeps its inert Retrying label past RETRY_CHECK_IN_MS` ac=AC-1,AC-2,AC-3,AC-4 -->

The same four members, the same two timer effects, the same announcement effect and the same render
change, in `components/diagrams/GalleryLightbox.tsx`, on the `lightbox-retrying` overlay. The code
is parallel by design; the tests are not copies, because two of the differences below are real.

Three differences from Task 3, all from the shipped tree:

- the lightbox overlay carries no icon in either sub-state, so nothing is dropped there
- the lightbox already HAS a `retryingStateRef` (`GalleryLightbox.tsx:340`) and the gallery does
  not. It stays unused by this work: §3.2's design makes a live membership source unnecessary on
  both surfaces, and reaching for it here would make the two implementations diverge for no gain
- the overlay is gated on `isRetrying && isActive` (`GalleryLightbox.tsx:1062`), so an inactive
  slide never RENDERS a check-in. It can ENTER one and then be swiped away, which the first draft
  of the spec denied and round 1 refuted; the Embla `select` handler
  (`GalleryLightbox.tsx:549`) removes the departing id from `retrying`, and the intersection makes
  its `checkedIn` entry inert on that same render. The test asserts the swipe-away case directly,
  not just that an always-inactive slide stays quiet

Same anti-tautology, premise and four-mutant discipline as Task 3.

## Task 5: Restart, on both surfaces

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/gallery.retryCheckIn.test.tsx tests/components/diagrams/galleryLightbox.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:782` why=`the in-flight overlay onClick is a bare event.preventDefault, so pressing it after the check-in changes no state and mounts no second image` ac=AC-3,AC-4,AC-5,AC-8,AC-8b,AC-8c,AC-10 -->

Implement spec §4.1 on both surfaces: a `restarting` `ReadonlySet<string>`, the one-commit write on
press (`checkedIn` out, `restarting` in), a branch that renders the overlay with `Retrying…` and NO
`<Image>`, and a `useLayoutEffect` keyed on `restarting` that moves every id in it to `retrying`.

**The overlay's render condition must cover both states, or the "same element" claim is false.**
Today the lightbox gates it on `isRetrying && isActive` (`GalleryLightbox.tsx:1062`) and the gallery
on `isRetrying` alone. If `restarting` is a set disjoint from `retrying`, then entering it makes
`isRetrying` false, the ternary unmounts the overlay, and focus drops. So both conditions become
`(isRetrying || isRestarting)`, keeping ONE element across check-in, restarting and retrying.

**There is a live mechanism that makes this observable rather than theoretical.**
`GalleryLightbox.tsx:783` is a root-scoped focus rescue in a `useLayoutEffect` that fires on EVERY
control-removal path, precisely because an unmounted control drops focus to `<body>` outside a
trapping dialog. If the overlay unmounted during Restart, that rescue would fire and move focus.
AC-10's assertion that focus does not move is therefore also an assertion that the element survived,
which is why the two are one criterion and not two.

**The layout effect is an established pattern in these exact files, not a new trick.** React is
19.2.4 (`package.json`). `Gallery.tsx:283` and `Gallery.tsx:304` are already `useLayoutEffect`, and
`GalleryLightbox.tsx:783` carries a comment reasoning about why it must be one rather than a passive
effect. So the mechanism §4.1 specifies has precedent in the two files it lands in, and the
implementer follows a local convention instead of inventing one.

**Not the failed bounce the first draft specified.** Round 1 found it critical: the `failed`
control's accessible name says the diagram could not be loaded, and the request is still pending,
so the committed intermediate frame stated something false and the draft moved focus onto it.
`restarting` says `Retrying…`, which is true at every instant it exists, and the overlay is the same
element throughout so no focus moves at all.

**The disjointness invariant is asserted, not assumed (AC-8c).** Spec §3 requires that `retrying`
and `restarting` are never both true for an id, and never both false while the cell is in flight.
Two violations of it have already been found in this arc, one by review and one by the sweep that
followed, and both were silent: an id in both sets renders an inert `Retrying…` over no image
forever. Assert it on every commit of a Restart rather than at the end, since the end state is
correct in both defective designs.

**AC-8b: the replacement request gets its own window.** After Restart, advance
`RETRY_CHECK_IN_MS` from the RE-ENTRY and assert a second check-in appears. On the design round 2
refuted, the id never left `retrying`, so the reconciler never retired the expired timer and no
second check-in could ever fire. This is the assertion that would have caught it.

**Three more assertions, and two of them are opposite on purpose.**

- AC-8: capture the `<img>` before Restart and after the layout effect, assert they are DIFFERENT
  nodes. A presence assertion passes on a design that never remounted and so never made a new
  request, which is the defect this task exists to avoid.
- AC-5: assert the element is the SAME node across the check-in itself. A repair satisfying one of
  these by breaking the other is the failure mode, so one task owns both.
- AC-10, as the spec now states it after round 2 sharpened it: across every commit of Restart, the
  FAILED CONTROL is never rendered, the overlay keeps `aria-busy="true"`, and `document.activeElement`
  does not change. Assert absence by testid, `diagram-retry-<i>` (`Gallery.tsx:817`) and
  `lightbox-retry` (`GalleryLightbox.tsx:1571`), NOT by scanning for the phrase "could not be
  loaded": the in-flight overlay's own accessible name legitimately contains that phrase
  (`Gallery.tsx:836` is the failed control's, and the in-flight one reads the same way), so a phrase
  scan would fail on correct behaviour. That imprecision is exactly what round 2's finding 4 caught
  in the criterion itself.

For AC-10, observe COMMITTED FRAMES, which means DOM mutations. Review round 1 refuted the first
proposal here: a spy on rendered props records render ATTEMPTS, including renders React abandons,
and cannot establish what was committed; the overlay is also a host `<button>` with no prop-spy seam
to attach to.

The oracle is a `MutationObserver` on the cell, connected before the Restart press and disconnected
after the layout effect settles, with `subtree: true` and `attributes: true`. A mutation record IS a
committed frame, which is exactly the thing AC-10 quantifies over. From the recorded sequence assert:

- no record ever contains the failed control, by testid: `diagram-retry-<i>` (`Gallery.tsx:817`) or
  `lightbox-retry` (`GalleryLightbox.tsx:1571`). Assert on the TESTID, never on the phrase "could not
  be loaded", because the in-flight overlay's own accessible name legitimately contains it, which is
  what round 2 of the spec review caught in the criterion itself
- `aria-busy` is `"true"` on the overlay in every record that includes it
- `document.activeElement` is the same node before the press and after the effect, sampled at both
  ends rather than inferred

Record the observer's record COUNT in the commit. A run that observed zero mutations proves nothing
and would satisfy every "no record contains" assertion vacuously, so the count is the premise.

The command carries NO `-t` filter, deliberately. A name filter that matches nothing exits 0 and
reports green from the moment it is written, so a `red=` carrying one cannot express a red at all;
`spec:lint` draws `RED_TEST_NAME_FILTER` on exactly this and review round 1 raised it here.

## Task 6: the availability sweep, and the registry rows it forces

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/perItemStateLifetime.probe.test.ts` red-state=authored red-target=`tests/components/diagrams/perItemStateRegistry.ts:47` why=`the scanner enumerates every useState and useRef in both components, so the four members Tasks 3 to 5 add across two files are unclassified and the registry check reds until each of the eight rows exists` ac=AC-1,AC-11,AC-12,AC-17 -->

**AC-17: pin the writer set, unconditionally.** Task 2 names the writer-side twin as the mechanism
this plan implements, so this pin is not a branch. Add a suite named `retryWriterSetPin` under
`tests/components/diagrams/` (created here, so tracked only after it lands): walk both component
sources for every `setRetrying` call site and assert each is paired with its synchronous mirror
write in the same statement, so a call site added later without one fails. Derived from a filesystem
walk over the two sources, never a hand list of call sites.

The assertion is over the WRITER set because it is closed and greppable. Asserting over the reader
set is the shape spec §3.2a deleted after three drafts of it were refuted, and a plan reintroducing
it would have reintroduced the refuted surface.

**If the fallback shipped instead** (Task 2 records the switch), this pin is replaced by one that
asserts the timer callback both captures nothing AND no-ops on a live-membership check. Review round
1 caught that "captures no state" alone is satisfied by an unconditional functional write, which is
precisely the defect the mechanism exists to prevent, so the capture assertion never ships alone.

**The availability sweeps are NOT edited.** Spec §3.1 and §3.2 are what carry `checkedIn` and the
timers, at every removal site including the two round 1 found. This task proves that, rather than
adding a third mechanism.

Assert AC-11 directly, on the two paths the first draft missed:

- the gallery's rendered-ID sweep (`Gallery.tsx:344`): check an item in, hit "Show fewer", re-expand,
  and assert the cell offers its retry control and renders no check-in
- the lightbox's Embla `select` handler (`GalleryLightbox.tsx:549`): check an active slide in, swipe
  away, swipe back, and assert the same

Both are the anti-tautology case for the intersection: a test that only exercises `onLoad` and
`onError` would pass on the enumerated design that round 1 refuted.

Add one `PER_ITEM_STATE_REGISTRY` row per new member per file. The registry is keyed
`<basename>:<declared name>` (`tests/components/diagrams/perItemStateRegistry.ts`). NINE rows, and
the asymmetry is the point: the lightbox already ships the live-membership ref and already has its
registry row, so only the gallery gains one.

| member | files | kind | sweep |
|---|---|---|---|
| `checkedIn` | both | per-item | `swept: true` |
| `restarting` | both | per-item | `swept: true`, by the same predicates as `retrying` (spec §4.1 step 2) |
| `checkInTimersRef` | both | per-item | `swept: false`, reason: reconciled by §3.2's effect against the live `retrying` set, not by the availability sweep, and `react-hooks/refs` forbids writing a ref in render anyway (`perItemStateRegistry.ts:272` states that rule for an existing row) |
| `announcedCheckInRef` | both | per-item | `swept: false`, reason: §3.2's reconciler drops an id from it when the id leaves `retrying`, which is what lets a genuine second entry announce again |
| `retryingStateRef` | GALLERY ONLY | not-per-item | n/a. It is a whole-set mirror, not a per-item slot, and its `why` copies the classification the lightbox's twin already carries at `perItemStateRegistry.ts:266` |

Name the gallery's ref `retryingStateRef`, matching `GalleryLightbox.tsx:340` exactly. Spec §3.2a
argues its entire case on adopting the sibling's shipped pattern, so giving it a different name
would undercut the argument and leave two names for one mechanism.

The suite's own premise requires at least five per-item rows before it asserts anything
(`perItemStateLifetime.probe.test.ts:110`), and eight new rows keep that satisfied rather than
threatening it.

The two `swept: false` members both name the §3.2 effect, and that is the honest answer rather than a
convenience: the sweeps run during render and a ref write there is what this design deliberately
avoids. The probe suite requires both answers to be IN USE across the registry, so a `false` with a
real reason is a supported shape, not a workaround.

This task's red is the mechanism working as designed: adding state to a walked population reds
the guard by default. Do not narrow the walk.

## Task 7: transition audit

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/gallery.transitions.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:760` why=`the compound cases this task adds are GREEN ON ARRIVAL once Tasks 3 to 5 have shipped, so the red is PLANTED: remove the check-in clear from the onLoad path, observe this command red, restore, observe green. Recorded per the discipline tests/e2e/diagram-retry-dimensions.spec.ts:9-16 already documents for its own sibling assertion` ac=AC-6,AC-7 -->

EXTENDS the shipped `tests/components/diagrams/gallery.transitions.test.tsx` rather than adding
a sibling suite; that file already owns this class for these components.

The spec's §8 inventory is FIFTEEN unordered pairs across six states (`idle`, `failed`, `retrying`,
`retrying+checked-in`, `restarting`, `unavailable`), plus §8.1's TEN compound cases. It was ten
over five until round 1's redesign added `restarting`.

This task enumerates every ternary render and conditional block in the two components' retry regions
and asserts each is deliberately instant, then tests all TEN compound cases. An earlier draft
claimed nine and listed nine, which review round 1 caught against the spec: the case it omitted is
the last row below, and an audit declaring itself exhaustive while missing one is worse than an
audit that declares nothing:

- image loads while the check-in is on screen: reaches `idle`, no intermediate frame
- image errors while the check-in is on screen: reaches `failed`, announces the existing
  still-failed string (`Gallery.tsx:503`, `GalleryLightbox.tsx:1358`), check-in copy does not persist
- item goes unavailable while checked in: placeholder immediately
- item leaves `renderedIds` while checked in ("Show fewer", then re-expand)
- an active slide is swiped away while checked in, then swiped back
- Restart pressed, and the original request completes during the staging commit
- Restart pressed, and the item goes unavailable in the same tick
- the timer firing in the same tick as `onLoad`
- two items checked in at once, independently
- Restart pressed while ANOTHER item is 29 seconds into its own wait, asserting that item's window is
  untouched. This is AC-1b at the compound level, and it is the case a timer COUNT cannot see

There is no `AnimatePresence` in either retry region; the audit records that, since "no exit
animation is missing because there is no presence wrapper" is a finding waiting to be
re-derived otherwise.

## Task 8: layout dimensions, in a real browser

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/diagram-retry-dimensions.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:651` why=`the height assertion is GREEN ON ARRIVAL because the check-in button reuses the shipped overlay's absolute inset-0, so the red is PLANTED: remove that class from the overlay, observe this command red, restore, observe green. Same cycle the file's existing AC-7 case records at tests/e2e/diagram-retry-dimensions.spec.ts:9-16` ac=AC-13 -->

jsdom computes no layout, so this is Playwright. EXTENDS the shipped
`tests/e2e/diagram-retry-dimensions.spec.ts`. With the asset request held open, drive an item
to the check-in and assert with `getBoundingClientRect()`:

| parent | child | assertion |
|---|---|---|
| gallery `<li>` `aspect-square overflow-hidden` (`Gallery.tsx:651`) | check-in `<button>` | heights equal within 0.5px |
| check-in `<button>` | its two text lines | both rects are inside the button's rect |
| check-in `<button>` | tap target | height at or above the 44px floor |

Detach-safety: every `locator.evaluate` here can outlive its element if the image resolves
mid-measurement, so the request stays held open for the whole case and each evaluate is guarded.

**The red here must be PLANTED, and this file already says so about its own sibling assertion.**
`tests/e2e/diagram-retry-dimensions.spec.ts:9-16` records that its AC-7 case was green the moment it
was authored, because the classes it measures were already on the control, and that the author
therefore removed `size-full`, observed the command red, restored it, and observed green. The
check-in button has the same exposure: it reuses the shipped overlay's `absolute inset-0`, so a
height assertion on it may well pass on arrival. Run the same cycle, and record the observed red in
the commit. A guard that cannot be observed failing is decorative, whatever its `red-state` says.

## Task 9: the check-in appears, in a real browser

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/diagram-retry.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:760` why=`the AC-9 source scan is GREEN ON ARRIVAL, since no abort call is ever added, so the red is PLANTED for that half: add an AbortController line to one component, observe this command red, remove it, observe green. The browser half reds honestly against Tasks 3 and 5 only if this task runs before them, which it does not, so both halves are declared planted rather than one being claimed as a natural red` ac=AC-2,AC-8,AC-9,AC-D3 -->

EXTENDS the shipped `tests/e2e/diagram-retry.spec.ts` and its harness.

**Boot mechanism, as it actually is.** Not a Next server. `tests/e2e/_diagramRetryLiveEntry.tsx`
mounts the real `<Gallery>`, `bundleLiveEntry` and `compileEntryCss`
(`tests/e2e/helpers/liveEntryToolchain`) build it out of process with a version-pinned esbuild,
and a local `node:http` server serves it. `test` and `expect` come from
`./helpers/fontFidelityFixture`, never from `@playwright/test` directly: binding the bare import
silently drops the font-readiness oracle, which `tests/e2e/_metaFontFidelityWiring.test.ts` pins
and which caught exactly that in this file.

**Readiness gate:** the one the shipped spec already uses, `await expect(failedControl).toBeVisible()`
on the retry control, never `networkidle`.

**Held open, not aborted.** The harness's own server decides the asset response, so the check-in
case simply never answers that request. An abort produces `failed`, a different state, and would
test nothing here.

**Scope, stated rather than implied:** the harness mounts `<Gallery>` and no lightbox, so the
real-browser evidence is gallery-only. The lightbox check-in is covered by Task 4's jsdom suite
plus the shared implementation, and this plan does not claim a browser measurement it does not
take.

Assert the check-in copy appears in a real engine after the wait, that Restart is pressable, and
that pressing it issues a SECOND request for the asset while the first is still unanswered. The
request count is the reason this is a browser test at all: jsdom issues none, so AC-8's "a new
request" is invisible to every jsdom assertion. The shipped spec's own count window already
demonstrates the technique.

**U-1 is measured here, not in a task of its own.** Spec §1.2 leaves one claim unratified: whether
removing a mid-fetch `<img>` makes the browser abandon its request. This case already holds a
request open and then presses Restart, which unmounts that `<img>`, so the answer is one network
assertion away. Record from the harness server whether the first request's socket is closed or stays
open after the Restart commit, and write the observed answer into spec §1.2 with a pointer to this
case. An earlier draft of this plan spent a separate script and a second browser boot on a synthetic
version of the same question; measuring it on the product path is both cheaper and better evidence.

Then, statically over both components, AC-9: no `AbortController`, no `.abort(`, and no assignment
clearing an `<img>` `src`. That one is a source scan rather than a runtime probe because the absence
of a call is not observable at runtime. Scope it to the two component files and assert the scan
SAW them, so a mis-pathed glob cannot report a clean by reading nothing.

**This case waits the real thirty seconds, and says so rather than hiding it.** `RETRY_CHECK_IN_MS`
is a module constant the component reads at call time, so a browser test cannot shorten it without
adding a prop that exists only for tests. One 30-second case with an explicit `test.setTimeout` is
cheaper than that prop and cheaper than the review round the prop would earn. Playwright's default
action timeout is 30s, so the timeout is raised deliberately at the case rather than left to expire
and read as a flake. The jsdom suites in Tasks 4 to 8 use fake timers and carry the fast coverage;
this one case exists to prove the real clock drives it.

## Task 10: gates, then the ledger

<!-- task: red=`pnpm exec vitest run --project parallel tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the GRADUATED list does not contain DIAGRETRY-NO-RETRY-DEADLINE-1, so the graduation case this task adds finds the row still open in DEFERRED.md and fails until the row is archived and its id registered. The command below RUNS that file, which an earlier draft did not: its red named a case in _metaDeferralLedgerGraduation.test.ts while executing only _metaLedgerInProgress.test.ts` ac=AC-D4 -->

In order, each as its own command, never chained into a commit: `pnpm heavy pnpm test`,
`pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.

Then the invariant-8 dual gate over the diff, since `DESIGN.md` and two `components/` files are
UI surface. Findings at P0 and P1 are FIXED. This arc files no new ledger row, of any facing,
under any exception clause, so deferring one with a `DEFERRED.md` entry is not available here and an
earlier draft of this line was wrong to offer it; anything unfixable goes in the PR body under
"Unfixed peers" and the orchestrator decides whether it earns a row. The gate's
own closeout marker line and its dispositions land in the gate-run commit, not before: a
marker written ahead of the run names halves that have not run.

The ledger graduation is the PR's LAST commit, and it is three edits in that one commit:

1. move the `DIAGRETRY-NO-RETRY-DEADLINE-1` row body from `DEFERRED.md` to `DEFERRED-archive.md`.
   ONE row, not two: the paired-chrome row split to `docs/paired-chrome-stale-text` on 2026-08-31
   and graduates there. An earlier draft archived both, which review round 1 caught as a
   half-applied split; a literal implementer would have archived a row whose prose repair lives on
   another branch
2. add that ONE id to the `GRADUATED` list in `tests/docs/_metaDeferralLedgerGraduation.test.ts`,
   with a dated comment naming this branch and how it graduated: the product decision it was blocked
   on was taken on 2026-08-31, and the check-in ships here
3. remove its IN PROGRESS marker, in this same commit

The marker removal cannot be a later commit. A marker that reaches main names a branch the merge
deleted and reds `tests/docs/_metaLedgerInProgress.test.ts` on main. It cannot be an earlier one
either: an archive categorically rejects an in-progress entry, so the marker comes off in the
same commit that archives it.

Also run the referential-integrity and retired-identifier suites
(`tests/docs/_metaLedgerReferentialIntegrity.test.ts`, `tests/docs/retiredIdentifierReferences.test.ts`)
after the move: archiving the row changes which ids any document may still reference.

<!-- tasks: end -->

## Acceptance criteria

The spec declares AC-1 through AC-13. This plan keeps them there and carries the coverage map,
which is also what keeps every `ac=` above declared somewhere in this document:

| criterion | discharged by |
|---|---|
| AC-1 one live timer per retrying item, none after ANY of the seven removal paths | Task 3, Task 4, Task 6 |
| AC-1b a check-in fires `RETRY_CHECK_IN_MS` after ITS OWN entry, with another item entering and leaving in between | Task 3 |
| AC-2 check-in copy and accessible name | Task 3, Task 4, Task 9 |
| AC-3 `aria-busy` true in all three in-flight states | Task 3, Task 4, Task 5 |
| AC-4 `aria-disabled` present, absent, present again | Task 3, Task 4, Task 5 |
| AC-5 image node identity unchanged across the check-in | Task 5 |
| AC-6 `onLoad` during the check-in reaches idle | Task 7 |
| AC-7 `onError` during the check-in reaches failed | Task 7 |
| AC-8 Restart reaches retrying with a DIFFERENT image node | Task 5, Task 9 |
| AC-8b the replacement request gets its OWN 30-second window | Task 5 |
| AC-8c `retrying` and `restarting` are never both true, and never both false in flight | Task 5 |
| AC-9 no abort call and no `src` clear anywhere | Task 9 |
| AC-10 no committed frame during Restart says the diagram could not be loaded, and focus does not move | Task 5 |
| AC-11 a stale `checkedIn` id renders nothing, for the rendered-ID sweep and the Embla swipe-away | Task 6 |
| AC-12 every new member carries a registry row | Task 6 |
| AC-13 real-browser check-in and its dimensions | Task 8 |
| AC-14 announced once per entry, and `restarting` announces nothing | Task 3 |
| AC-15 nothing is announced for an id that has left `retrying` or resolved, including when the announcement effect was ALREADY SCHEDULED when the image loaded | Task 2 |
| AC-16 a timer callback firing after its id left `retrying` writes nothing, asserted on the NEXT retry because that is the only place it surfaces | Task 2 |
| AC-17 whichever mechanism ships is pinned structurally over the WRITER set, never the reader set | Task 6 |
| AC-18 THE DECIDING CASE: planted removal-during-pending-check-in, per surface, per removal source | Task 2 |

AC-5 and AC-8 are deliberately opposite and share Task 5: a repair that satisfies one by breaking
the other is the failure mode, so one task owns both. AC-10 is round 1's critical finding turned
into an assertion, and it also lives in Task 5 because the mechanism it constrains is Restart's.

This plan declares three criteria of its own. It was four until the paired-chrome row split off on
2026-08-31 and took AC-D1 with it:

- AC-D2: `DESIGN.md` §5.5 lists `RETRY_CHECK_IN_MS` at 30000 in `components/diagrams/GalleryLightbox.tsx`
- AC-D3: spec §1.2 records an observed answer for U-1, citing the e2e case that measured it
- AC-D4: neither ledger row remains in `DEFERRED.md`, and neither carries an IN PROGRESS marker
