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

## Task 2: the gallery check-in, and the gallery half of the deciding races

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/retryCheckInRaces.test.tsx tests/components/diagrams/gallery.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:126` why=`retrying is a ReadonlySet with no phase, so there is no checked-in state for the new cases to observe and every one of them fails on the absent copy and the absent no-op` ac=AC-1,AC-1b,AC-2,AC-3,AC-4,AC-14,AC-15,AC-16,AC-18 -->

**THE MECHANISM, decided and no longer open.** Spec §3.2a named two candidates. Plan review round 2
REFUTED the primary on implementability rather than taste: the writer-side twin requires every
`setRetrying` call site to update a mirror synchronously, and BOTH components call `setRetrying` in
the RENDER body (`Gallery.tsx:392`, `GalleryLightbox.tsx:861`, the availability sweeps) where
`react-hooks/refs` forbids a ref write. This repo documents that rule in its own registry
(`perItemStateRegistry.ts:273`). A literal implementer would have had to break the pin, break lint,
or keep a stale mirror.

So this plan ships the FALLBACK the spec already named, fire-time re-read, in the shape that makes
it work. The orchestrator approved the switch on 2026-08-31.

**The shape: check-in folds INTO `retrying`, one value per item.**

```ts
type RetryPhase = "pending" | "checked-in" | "restarting";
const [retryPhase, setRetryPhase] = useState<ReadonlyMap<string, RetryPhase>>(() => new Map());
```

`retrying` stops being a `ReadonlySet` and becomes this map. There is no separate `checkedIn` set,
no `restarting` set, no mirror ref, and no intersection rule. Three consequences worth stating,
because each deletes something an earlier draft had to defend:

- the timer callback is ONE functional update on the single source of truth, and its `prev` argument
  is live by React's own contract: `prev.get(id) === "pending"` decides, anything else returns `prev`
  unchanged. It captures nothing and no-ops when the item is gone or already resolved
- the disjointness invariant is GONE, not defended. One item cannot hold two phases, so the two
  violations review found in the set-based design are unrepresentable
- membership questions that needed an intersection are now `map.get(id)`

**What ships in the gallery.** The map, the phase transitions, the `RETRY_CHECK_IN_MS` timer, the
check-in copy of spec §5 rendered on the same `diagram-retrying-<i>` button, `aria-busy="true"` in
every in-flight phase, `aria-disabled` present in `pending` and absent in `checked-in`, and the
`ImageOff` icon dropped in `checked-in` only.

**The announcement runs in a LAYOUT effect, not a passive one.** A commit that shows an item
`checked-in` is proof it was checked in AT THAT COMMIT, and a layout effect runs synchronously in
that commit before anything can interleave. A passive effect cannot make that claim: React flushes
pending passive effects before the next render, so one scheduled by the check-in commit still runs
after an `onLoad` that has been queued but not rendered, which is exactly what refuted the round-3
mechanism. Announce once per entry, tracked by an `announcedCheckInRef` the phase transition clears.

### The deciding races, gallery half

Written in this task and GREEN in this task. An earlier draft made them a standalone Task 2 that was
committed red and could only go green two tasks later, which review round 2 correctly called a
per-task TDD violation.

**Planted removal-during-pending-check-in.** For each removal source, drive the item to `pending`,
advance to just before `RETRY_CHECK_IN_MS`, remove it, and then **fire the pending callback
explicitly rather than advancing the clock and hoping.** Review round 2 caught why that matters: a
normally flushed removal clears the timer before it fires, so advancing the clock never exercises an
unconditional callback and the case passes against the broken mechanism it exists to catch. Capture
the callback (`vi.useFakeTimers` plus the timer id, or a spy on `setTimeout`) and invoke it AFTER
the removal, which is the only way to prove the no-op is doing work.

Assert, per source: no check-in renders, nothing is announced, and a SUBSEQUENT retry of the same
item waits a full `RETRY_CHECK_IN_MS`.

Sources for the gallery: `onLoad`, `onError`, the availability sweep, the rendered-ID sweep
(`Gallery.tsx:344`), and Restart. **UNMOUNT IS DELIBERATELY NOT A CASE HERE**, and its absence is
the finding rather than an omission: unmounting destroys the map, so a stale write cannot poison a
later retry and the third assertion is green against the broken mechanism too. A non-discriminating
case in a deciding suite is worse than no case, because it reads as coverage. Unmount is covered
instead by the timer-cleanup assertion in Task 5, where it is discriminating.

**Late success during the check-in.** With the check-in on screen, fire `onLoad`. Assert the image
wins with no intermediate frame and nothing is announced afterwards, including when the announcement
would have been scheduled at the moment the image loaded.

**Anti-tautology.** Derive every advance from the imported `RETRY_CHECK_IN_MS`. Assert on the
announcement CHANNEL (`routeAnnouncement`, `Gallery.tsx:405`) with a spy, never on rendered text: a
DOM read cannot see an announcement that should not have happened. `premise` before each planted
case that the item was `pending` with a callback captured. And run each case once against a
deliberately broken mechanism during authoring, recorded in the commit: an unconditional functional
write must red the third assertion, and a passive-effect announcement must red the late-success case.

## Task 3: the lightbox, the same shape and the lightbox half of the races

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/retryCheckInRaces.test.tsx tests/components/diagrams/galleryLightbox.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:333` why=`retrying is a ReadonlySet with no phase here either, so the lightbox cases fail on the absent checked-in state before the map lands` ac=AC-1,AC-2,AC-3,AC-4,AC-18 -->

The same map, the same transitions, the same layout-effect announcement, on the `lightbox-retrying`
overlay. Two differences, both from the shipped tree rather than from symmetry:

- the overlay is gated on `isRetrying && isActive` (`GalleryLightbox.tsx:1062`), so an inactive slide
  never RENDERS a check-in. It can ENTER one and then be swiped away, which the spec's first draft
  denied and review refuted
- the lightbox already has `retryingStateRef` (`GalleryLightbox.tsx:340`), a whole-set mirror the
  Embla subscriber reads. It is NOT part of this mechanism and gains no new reader. It keeps
  mirroring whatever `retrying` now is, and its registry row is updated for the new type rather than
  repurposed. An earlier draft said the gallery should grow a twin of it; that twin is what round 2
  refuted, and this task adds no mirror to either surface

Lightbox removal sources for the races: `onLoad`, `onError`, the availability sweep, the Embla
`select` handler (`GalleryLightbox.tsx:549`), and Restart.

## Task 4: Restart, on both surfaces

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/gallery.retryCheckIn.test.tsx tests/components/diagrams/galleryLightbox.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:782` why=`the in-flight overlay onClick is a bare event.preventDefault, so pressing it in the checked-in phase changes no phase and mounts no second image` ac=AC-3,AC-4,AC-5,AC-8,AC-8b,AC-8c,AC-10 -->

Set the item's phase to `restarting` in one update; render no `<Image>` in that phase; a
`useLayoutEffect` keyed on the map moves every `restarting` id back to `pending` before paint, which
mounts a fresh `<Image>` and starts a fresh window. The overlay's render condition covers every
in-flight phase, so it is ONE element across `pending`, `checked-in` and `restarting` and focus never
moves.

AC-8c is now structural rather than asserted: one item holds one phase, so "both sets true" is
unrepresentable. The case remains, asserting the phase sequence, because a regression that
reintroduces a second set should fail loudly rather than silently.

**AC-10's oracle, repaired.** A `MutationObserver` records mutation FACTS and LIVE node references,
not a snapshot per commit, so reading `record.target.getAttribute(...)` yields the CURRENT value.
Review round 2 reproduced this with four synchronous attribute mutations: every record read only the
final value. So the observer is configured `{ childList: true, subtree: true, attributes: true,
attributeOldValue: true }` and the assertions use only what is PRESERVED:

- element presence from `addedNodes`, which is a preserved node list: assert no added node is, or
  contains, the failed control (`diagram-retry-<i>` at `Gallery.tsx:817`, `lightbox-retry` at
  `GalleryLightbox.tsx:1571`)
- attribute history from `record.oldValue`, asserting no record shows `aria-busy` leaving `"true"`
- focus by sampling `document.activeElement` before the press and after the effect

The record count is the premise: a run that observed nothing satisfies every "no record" assertion
vacuously.

## Task 5: the availability sweep, and the registry rows it forces

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/perItemStateLifetime.probe.test.ts` red-state=authored red-target=`tests/components/diagrams/perItemStateRegistry.ts:47` why=`the scanner enumerates every useState and useRef in both components, so the four members Tasks 3 to 5 add across two files are unclassified and the registry check reds until each of the eight rows exists` ac=AC-1,AC-11,AC-12,AC-17 -->

**AC-17: the closed-set pin, transposed to the mechanism that shipped.** The writer-side twin is
dead (Task 2), but its one good property was that the `setRetrying` writer set is CLOSED and
greppable while the reader set is open. The orchestrator kept that and transposed it on 2026-08-31.

Add `retryWriterSetPin` under `tests/components/diagrams/` (created here, tracked only after it
lands): walk both component sources for every write to the retry phase map and assert each either
uses the FUNCTIONAL form, or carries a stated render-sweep exemption naming why it cannot. The two
render-body writers (`Gallery.tsx:392`, `GalleryLightbox.tsx:861`) are the exemptions, and they are
exempt for a reason the walker records rather than infers: they run in render, where the value they
write is already derived from that render.

What the pin buys is not style. A later writer that captures state instead of reading `prev` is
exactly the stale-capture shape three review rounds chased, and this makes it fail at CI time rather
than at review time. Derived from a filesystem walk over the two sources, never a hand list.

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

Registry work, and it is SMALLER than every earlier draft because the mechanism got smaller. The
registry is keyed `<basename>:<declared name>` (`tests/components/diagrams/perItemStateRegistry.ts`).
There is no `checkedIn` set, no `restarting` set and no new mirror ref to classify: those were the
set-based design. What changes is that `retrying` becomes `retryPhase`, one row per file, plus one
new ref per file for the announcement latch.

| member | files | kind | sweep |
|---|---|---|---|
| `retryPhase` | both | per-item | `swept: true`. Replaces the `retrying` row rather than joining it: same identity, new type, and its `clearedBy` names the phase transitions plus the sweeps |
| `announcedCheckInRef` | both | per-item | `swept: false`, reason: the phase transition clears an id from it when the item leaves an in-flight phase, which is what lets a genuine second entry announce again. The availability sweep does not touch it, and `react-hooks/refs` forbids a ref write in render anyway, a rule this file already states for an existing row at `perItemStateRegistry.ts:273` |
| `checkInTimersRef` | both | per-item | `swept: false`, same reason: the timer is retired by the phase transition, and the sweeps run in render |
| `retryingStateRef` (lightbox key, existing row at `perItemStateRegistry.ts:266`) | lightbox, EXISTING | not-per-item | UNCHANGED classification, updated `why` for the new map type. It is the Embla subscriber's mirror and gains no reader from this work |

Four rows touched across two files, one of them an edit to an existing row rather than an addition.
Earlier drafts of this table had nine rows for a mirror and two sets that the round-2 mechanism
switch deleted.

The suite's own premise requires at least five per-item rows before it asserts anything
(`perItemStateLifetime.probe.test.ts:110`), and eight new rows keep that satisfied rather than
threatening it.

The two `swept: false` members both name the §3.2 effect, and that is the honest answer rather than a
convenience: the sweeps run during render and a ref write there is what this design deliberately
avoids. The probe suite requires both answers to be IN USE across the registry, so a `false` with a
real reason is a supported shape, not a workaround.

This task's red is the mechanism working as designed: adding state to a walked population reds
the guard by default. Do not narrow the walk.

## Task 6: transition audit

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

## Task 7: layout dimensions, in a real browser

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

## Task 8: the check-in appears, in a real browser

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

## Task 9: gates, then the ledger

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
| AC-1 one live timer per retrying item, none after ANY of the seven removal paths | Task 3, Task 4, Task 5 |
| AC-1b a check-in fires `RETRY_CHECK_IN_MS` after ITS OWN entry, with another item entering and leaving in between | Task 3 |
| AC-2 check-in copy and accessible name | Task 3, Task 4, Task 8 |
| AC-3 `aria-busy` true in all three in-flight states | Task 3, Task 4, Task 5 |
| AC-4 `aria-disabled` present, absent, present again | Task 3, Task 4, Task 5 |
| AC-5 image node identity unchanged across the check-in | Task 5 |
| AC-6 `onLoad` during the check-in reaches idle | Task 6 |
| AC-7 `onError` during the check-in reaches failed | Task 6 |
| AC-8 Restart reaches retrying with a DIFFERENT image node | Task 5, Task 8 |
| AC-8b the replacement request gets its OWN 30-second window | Task 5 |
| AC-8c `retrying` and `restarting` are never both true, and never both false in flight | Task 5 |
| AC-9 no abort call and no `src` clear anywhere | Task 8 |
| AC-10 no committed frame during Restart says the diagram could not be loaded, and focus does not move | Task 5 |
| AC-11 a stale `checkedIn` id renders nothing, for the rendered-ID sweep and the Embla swipe-away | Task 5 |
| AC-12 every new member carries a registry row | Task 5 |
| AC-13 real-browser check-in and its dimensions | Task 7 |
| AC-14 announced once per entry, and `restarting` announces nothing | Task 3 |
| AC-15 nothing is announced for an id that has left `retrying` or resolved, including when the announcement effect was ALREADY SCHEDULED when the image loaded | Task 2 |
| AC-16 a timer callback firing after its id left `retrying` writes nothing, asserted on the NEXT retry because that is the only place it surfaces | Task 2 |
| AC-17 whichever mechanism ships is pinned structurally over the WRITER set, never the reader set | Task 5 |
| AC-18 THE DECIDING CASE: planted removal-during-pending-check-in, per surface, per removal source | Task 2 |

AC-5 and AC-8 are deliberately opposite and share Task 5: a repair that satisfies one by breaking
the other is the failure mode, so one task owns both. AC-10 is round 1's critical finding turned
into an assertion, and it also lives in Task 5 because the mechanism it constrains is Restart's.

This plan declares three criteria of its own. It was four until the paired-chrome row split off on
2026-08-31 and took AC-D1 with it:

- AC-D2: `DESIGN.md` §5.5 lists `RETRY_CHECK_IN_MS` at 30000 in `components/diagrams/GalleryLightbox.tsx`
- AC-D3: spec §1.2 records an observed answer for U-1, citing the e2e case that measured it
- AC-D4: `DIAGRETRY-NO-RETRY-DEADLINE-1` no longer appears in `DEFERRED.md` and carries no IN PROGRESS marker. ONE row, not two: the paired-chrome row split to `docs/paired-chrome-stale-text` and discharges its own criterion there. An earlier draft kept the two-row wording after the split, so this plan could not discharge the criterion it declared
