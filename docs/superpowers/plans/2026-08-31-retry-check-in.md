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

## Oracle-observability self-pass

Ordered by the orchestrator after the plan cap, and run before implementation rather than per
finding. Five of this stage's 26 findings were one shape: an oracle that cannot physically observe
the thing its task asserts. FOUR of those five were introduced BY REPAIRS to earlier findings,
because the question asked each time was "what could observe this?" and never "what does this
instrument actually record?"

So every task states, in one line, WHAT ITS ORACLE OBSERVES and HOW THE SUBJECT REACHES IT. A task
that cannot answer both had its oracle fixed here, before any code.

| task | what the oracle observes | how the subject reaches it |
|---|---|---|
| 1 constant | the timing scanner's parse of `components/**` | the exported literal is read by `scripts/scan-interaction-timings.ts` and compared against `DESIGN.md` §5.5 |
| 2 shape | TypeScript's own error set, plus a source walker over both files | the type change makes every Set-shaped site a compile error; the walker reads the source text of each functional updater |
| 3 gallery check-in | a spy on `routeAnnouncement` and the rendered DOM under `@testing-library` | announcements reach the spy because the component calls that function; copy reaches the DOM because the phase renders it |
| 4 lightbox | the same two | the same two |
| 5 Restart | THREE instruments, because no one of them sees everything: `addedNodes` from a `MutationObserver` for element presence, `record.oldValue` for attribute history, and `focusin`/`focusout` listeners for focus | presence and attributes reach the observer as committed mutations; focus reaches the listeners as events, which is the ONLY way it is observable, since a `MutationObserver` records no focus at all |
| 6 transitions | the rendered DOM across state changes, plus a source scan for presence wrappers | states reach the DOM by rendering; the absence of an `AnimatePresence` is a source fact, not a runtime one |
| 7 dimensions | `getBoundingClientRect` in a real engine, against the CONTENT box | layout reaches the rect only in a browser; jsdom computes none, and the content box is the comparable rectangle because the `<li>` has a border |
| 8 e2e | the harness server's request log, the rendered DOM, and a parse of spec §1.2 | requests reach the server because the harness serves the asset; the recorded answer reaches the parser as three structured tokens, not as prose |
| 9 gates | the suites' own exit codes and the ledger meta-tests | each gate is a command whose non-zero exit is the observation |

**The two that this pass changed, and they were both still wrong after their round-3 repairs:**

- Task 3 and Task 4's unmount case asserted timer cleanup by invoking a captured callback after
  unmount and expecting no state update. React SILENTLY IGNORES a post-unmount state update, so the
  case passes whether or not the timer was cleared. Round 4 probed this against the installed stack.
  The oracle is replaced: spy on `clearTimeout` and assert it was called with the id the mount
  registered. A cleanup that happened is observable; a state update that did not happen is not.
- Task 5's focus assertion is listed above as its own instrument for the same reason. Sampling
  `document.activeElement` before and after observes only settled focus, and passes when one commit
  moves it and the next restores it.

<!-- tasks: depth=2 red-contract -->

## Task 1: the constant and its §5.5 row

<!-- task: red=`pnpm exec vitest run --project parallel tests/docs/_metaInteractionTimingInventory.test.ts` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:130` why=`scripts/scan-interaction-timings.ts reads components/** for numeric literal timings, so exporting RETRY_CHECK_IN_MS beside DEMOTE_CHIP_VISIBLE_MS makes the scanner report a constant DESIGN.md 5.5 does not list` ac=AC-D2 -->

Add `export const RETRY_CHECK_IN_MS = 30_000;` to `components/diagrams/GalleryLightbox.tsx` beside
`DEMOTE_CHIP_VISIBLE_MS` (`GalleryLightbox.tsx:130`), and import it into `Gallery.tsx`. The separator
is safe: `tests/docs/interactionTimingScan.test.ts:69` asserts the scanner reads `30_000` as `30000`.

RED: add the constant, run the meta-test, observe it fail naming the missing §5.5 row. GREEN: add
`| RETRY_CHECK_IN_MS | 30000 | components/diagrams/GalleryLightbox.tsx |` in the table's sort
position. That order is the point: adding the row first reds for the opposite reason and proves
nothing about the scanner seeing the constant.

## Task 2: the phase map on the gallery, its registry rows, and every Set-shaped site it breaks

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/perItemStateLifetime.probe.test.ts tests/components/diagrams/gallery.transitions.test.tsx tests/components/diagrams/gallery.availabilitySweep.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:126` why=`retrying is a ReadonlySet and this task makes it a ReadonlyMap, so the unclassified retryPhase declaration reds the registry probe and the transitions oracle at gallery.transitions.test.tsx:135 stops matching, since it regexes the literal setRetrying((prev) => { form` ac=AC-11,AC-12 -->

**A SHAPE TASK, deliberately separate from behaviour.** Review round 3 found the previous draft
adding declarations in one task and repairing the registry three tasks later, leaving existing
suites red across intermediate commits. That is a per-task TDD violation, and it happened because
the mechanism switched at round 2 and the task list was patched rather than rewritten. This task
carries the whole shape change and lands green.

`retrying: ReadonlySet<string>` becomes `retryPhase: ReadonlyMap<string, RetryPhase>` with
`type RetryPhase = "pending" | "checked-in" | "restarting"`. Only `"pending"` exists after this
task; the other two arrive with their behaviour in Tasks 3 and 5.

**Every Set-shaped site that breaks, DERIVED, and the previous version of this paragraph is why
the word now has to be earned.** Round 3 caught this plan claiming the sweeps were unedited. The
repair ran three greps, published what they found, and called it a derivation. Round 4 found that
none of those greps had included `new Set(`. Three greps chosen by the author cover exactly what the
author already suspected, which is an enumeration wearing a derivation's clothes.

The committed expression set, which now includes the pattern that was missing, and its attribution
pass. Run it to reproduce the table; it is one command and its output is pasted verbatim below:

    node --import tsx scripts/derive-retry-set-sites.ts

It greps `new Set(prev)`, `sweepSet(|= sweep(`, `of retrying|retrying\.has|\.\.\.retrying` and
`retryingStateRef` over both components, then walks upward from each `new Set(prev)` to the enclosing
`setX((prev) =>` to attribute it. Attribution is the part a bare count cannot give:

| file | line | enclosing setter | breaks under a Map |
|---|---|---|---|
| `Gallery.tsx` | 458 | `setFailedKeys` | no, stays a Set |
| `Gallery.tsx` | 464 | `setRetrying` | YES |
| `Gallery.tsx` | 493 | `setRetrying` | YES |
| `Gallery.tsx` | 523 | `setRetrying` | YES |
| `Gallery.tsx` | 574 | `setFailedKeys` | no |
| `GalleryLightbox.tsx` | 398 | `setWantsOriginal` | no |
| `GalleryLightbox.tsx` | 404 | `setFailedKeys` | no |
| `GalleryLightbox.tsx` | 410 | `setRetrying` | YES |
| `GalleryLightbox.tsx` | 473 | `setWantsOriginal` | no |
| `GalleryLightbox.tsx` | 553 | `setRetrying` | YES |
| `GalleryLightbox.tsx` | 562 | `setFailedKeys` | no |
| `GalleryLightbox.tsx` | 1325 | `setRetrying` | YES |
| `GalleryLightbox.tsx` | 1347 | `setRetrying` | YES |
| `GalleryLightbox.tsx` | 1353 | `setFailedKeys` | no |
| `GalleryLightbox.tsx` | 1400 | `setWantsOriginal` | no |
| `GalleryLightbox.tsx` | 1484 | `setFailedKeys` | no |
| `GalleryLightbox.tsx` | 1536 | `setFailedKeys` | no |

**SEVENTEEN `new Set(prev)` sites; SEVEN of them write the retry state and break under a Map.** The
ten that do not are `failedKeys` and `wantsOriginal`, which stay Sets. Round 4 reported six; the
attribution pass finds seven, and the count reconciles because 7 + 6 `failedKeys` + 3
`wantsOriginal` + 1 more `failedKeys` in the gallery = 17.

Plus the four non-`new Set` sites the earlier greps did find: `Gallery.tsx:370` iterating a Map
yields `[id, phase]` tuples so every in-flight retry silently reads as abandoned;
`GalleryLightbox.tsx:848` `sweepSet` is shared by three states and gets a `sweepPhases` sibling
rather than being widened; `Gallery.tsx:327` `sweep` serves only `failedKeys` and is untouched; and
`retryingStateRef` (`GalleryLightbox.tsx:340`) is retyped while its only consumer, the Embla subscriber at `GalleryLightbox.tsx:559`, calls `.has`, which `Map` also has.

**THE COUNT LIVES IN CODE, NOT IN THIS TABLE.** A pasted table goes stale the moment anyone adds a
writer, which is the same failure one level up. This task adds a new suite `retryWriterSetPin` under `tests/components/diagrams/`, created here and
so tracked only once it lands. It is red before the shape change and green after, which is why it lands HERE rather than in a later task: it walks both component sources,
enumerates every functional updater of the retry state, asserts each uses `new Map(prev)` and reads
`prev.get(...)` before writing, and asserts the enumerated count. A writer added later without the
guard fails; a writer added later WITH it updates the count deliberately rather than silently.

**Why the walker is not in the constant task**, which is where the orchestrator placed it: at that
point the code is still Set-based, so a walker asserting the Map form has no green to reach within
its own task. Landing it with the shape change preserves red-then-green on the same command, which
is what invariant 1 asks for. The intent, an executable count rather than a prose one, is unchanged.

**Registry, in this task and not later.** Six new keys, two per component plus one shared latch each,
and one edited row. The counts are stated because an earlier draft claimed eight rows and four
members, which review round 3 caught:

| key | kind | sweep |
|---|---|---|
| `retryPhase`, both files | per-item | `swept: true`. REPLACES the `retrying` row: same identity, new type |
| `announcedCheckInRef`, both files | per-item | `swept: false`, reason: the phase transition clears it, and `react-hooks/refs` forbids a ref write in render, which this file already states for another row at `perItemStateRegistry.ts:273` |
| `checkInTimersRef`, both files | per-item | `swept: false`, same reason |
| `retryingStateRef`, lightbox only, EXISTING at `perItemStateRegistry.ts:266` | not-per-item | classification unchanged, `why` updated for the map type |

**The meta-test cannot see a stale row, so assert it directly.** `perItemStateLifetime.probe.test.ts`
checks that every live DECLARATION has a key (`tests/components/diagrams/perItemStateLifetime.probe.test.ts:35`); it does not reject a key whose declaration is
gone. So the two `retrying` keys would linger and the suite would still green. This task adds one
assertion to the probe suite: every `PER_ITEM_STATE_REGISTRY` key for these two files corresponds to
a declaration the scanner actually found. Without it the registry oracle passes on an unreconciled
registry, which review round 3 raised as finding 4.

## Task 3: the gallery check-in, and the gallery deciding races

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/retryCheckInRaces.test.tsx tests/components/diagrams/gallery.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:126` why=`the phase map holds only pending after Task 2, so nothing ever transitions to checked-in and every case fails on the absent copy and the absent no-op` ac=AC-1,AC-1b,AC-2,AC-3,AC-4,AC-14,AC-15,AC-16,AC-18 -->

**The mechanism.** The timer callback is ONE functional update on the phase map, and its guard is
the whole point:

```ts
setRetryPhase((prev) => {
  if (prev.get(id) !== "pending") return prev;   // gone, resolved, or already checked in
  const next = new Map(prev);
  next.set(id, "checked-in");
  return next;
});
```

`prev` is live by React's own contract, so the callback captures nothing and no-ops when the item
has left. Spec §3.2a's bound is satisfied by construction rather than by an inventory of readers.

Render: the check-in copy of spec §5 on the same `diagram-retrying-<i>` button, `aria-busy="true"`
in every in-flight phase, `aria-disabled` present in `pending` and absent in `checked-in`, and the
`ImageOff` icon dropped in `checked-in` only.

**The announcement runs in a LAYOUT effect.** A commit showing an item `checked-in` is proof it was
checked in AT that commit, and a layout effect runs synchronously in that commit. A passive effect
cannot make that claim: React flushes pending passive effects before the next render, so one
scheduled by the check-in commit still runs after an `onLoad` that is queued but unrendered, which
is what refuted the round-3 spec mechanism. Announce once per entry via `announcedCheckInRef`,
cleared by the phase transition.

### The deciding races, gallery half, written and GREEN in this task

**Planted removal while the callback is pending.** For each source: drive the item to `pending`,
advance to just before `RETRY_CHECK_IN_MS`, remove it, then **invoke the captured callback
explicitly**. Advancing the clock instead never exercises an unconditional callback, because a
normally flushed removal clears the timer first, so the case would pass against the very mechanism it
exists to catch (review round 2, finding 3).

Sources: `onLoad`, `onError`, the availability sweep, the rendered-ID sweep (`Gallery.tsx:344`).

**Restart is NOT a row in this matrix, and its absence is reasoned.** Restart is reachable only from
`checked-in`, which requires the callback to have already fired, so a matrix row that keeps the
callback pending can never reach a Restart through the product. Review round 3 caught the previous
draft requiring exactly that. Restart's own stale-write case lives in Task 5, where the phase is
`checked-in` and the gesture is reachable.

**Unmount is NOT a row either, for the opposite reason.** Unmount destroys the map, so a stale write
cannot poison a later retry and the third assertion greens against the broken mechanism too. A
non-discriminating case in a deciding suite is worse than no case. Unmount's real obligation is timer
cleanup, and it is asserted in this task as its own case: unmount with a callback pending, then
assert the timer was cleared by SPYING ON `clearTimeout` and checking it was called with the id the
mount registered. Not by firing the callback after unmount and expecting no state update: React
silently ignores that, so the case would pass whether or not cleanup happened, which round 4 probed
against the installed stack. A cleanup that occurred is observable; a state update that did not occur
is not.

Assert per row: no check-in renders, nothing is announced, and a SUBSEQUENT retry waits a full
`RETRY_CHECK_IN_MS`.

**Late success during the check-in.** Fire `onLoad` with the check-in on screen. The image wins with
no intermediate frame, and nothing is announced after, including when the announcement would have
been scheduled at the moment the image loaded.

**Anti-tautology.** Every advance derives from the imported constant. Assertions are on the
announcement CHANNEL (`routeAnnouncement`, `Gallery.tsx:405`) via a spy, never on rendered text: a
DOM read cannot see an announcement that should not have happened. `premise` per case that the item
was `pending` with a callback captured. Each case run once against a deliberately broken mechanism
during authoring, recorded in the commit: an unconditional functional write must red the third
assertion, and a passive-effect announcement must red the late-success case.

## Task 4: the lightbox, same shape and same races

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/retryCheckInRaces.test.tsx tests/components/diagrams/galleryLightbox.retryCheckIn.test.tsx` red-state=authored red-target=`components/diagrams/GalleryLightbox.tsx:333` why=`the lightbox phase map holds only pending after Task 2, so the lightbox cases fail on the absent checked-in state` ac=AC-1,AC-2,AC-3,AC-4,AC-18 -->

The same guard, the same layout-effect announcement, on the `lightbox-retrying` overlay. Two
differences from the gallery, both from the shipped tree:

- the overlay is gated on `isRetrying && isActive` (`GalleryLightbox.tsx:1062`), so an inactive slide
  never RENDERS a check-in. It can ENTER one and be swiped away, which the spec's first draft denied
- `retryingStateRef` (`GalleryLightbox.tsx:340`) already exists for the Embla subscriber and gains no
  reader here. Task 2 retyped it; this task does not touch it

Removal sources: `onLoad`, `onError`, the availability sweep, the Embla `select` handler
(`GalleryLightbox.tsx:549`). Restart and unmount are excluded and covered exactly as in Task 3.

## Task 5: Restart, on both surfaces

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/gallery.retryCheckIn.test.tsx tests/components/diagrams/galleryLightbox.retryCheckIn.test.tsx tests/components/diagrams/retryWriterSetPin.test.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:782` why=`the in-flight overlay onClick is a bare event.preventDefault, so pressing it in the checked-in phase changes no phase and mounts no second image, and the writer-set pin does not exist yet` ac=AC-5,AC-8,AC-8b,AC-8c,AC-10,AC-17 -->

Set the phase to `restarting` in one update; render no `<Image>` in that phase; a `useLayoutEffect`
keyed on the map moves every `restarting` id back to `pending` before paint. The overlay's render
condition covers all three in-flight phases, so it is ONE element throughout and focus never moves.

AC-8c is structural now: one item holds one phase, so "both sets true" is unrepresentable. The case
stays, asserting the phase sequence, so a regression that reintroduces a second set fails loudly.

**Restart's stale-write case lives here**, because this is where the phase is `checked-in` and the
gesture is reachable: press Restart with the check-in on screen, then invoke the already-fired
callback's successor, and assert the fresh `pending` window is a full `RETRY_CHECK_IN_MS`.

**AC-17, the transposed closed-set pin, EXTENDED here rather than created.** Task 2 creates
`retryWriterSetPin` alongside the shape change, because that is where both its red and its green
live. This task extends it, and the split is not bookkeeping: at Task 2 the writers exist but only
some CONDITION on the current phase, so a blanket `prev.get` requirement would fail writers that
legitimately need nothing but `.has`. Restart's writer is the first that must read the phase before
acting, so the guard assertion lands with it.

Task 2 asserts the functional `new Map(prev)` form and the enumerated writer count. This task adds:

- every writer that CONDITIONS on the current phase reads it from `prev`, never from a captured value
- the two render-body writers (`Gallery.tsx:392`, `GalleryLightbox.tsx:861`) carry a stated exemption

The `prev.get` requirement is not decoration. Review round 3 showed that "any functional update"
accepts `setRetryPhase(prev => new Map(prev).set(id, "checked-in"))`, which omits the guard entirely
and is exactly the stale write the mechanism exists to prevent. The two render-body writers
(`Gallery.tsx:392`, `GalleryLightbox.tsx:861`) are the exemptions, recorded rather than inferred.
Derived from a filesystem walk over the two sources, never a hand list.

**AC-10's oracle, and what it can actually observe.** A `MutationObserver` records mutation FACTS and
LIVE node references, not a snapshot per commit, so `record.target.getAttribute(...)` yields the
CURRENT value. Configure `{ childList: true, subtree: true, attributes: true, attributeOldValue: true }`
and assert only on what is preserved:

- element presence from `addedNodes`: no added node is, or contains, the failed control
  (`diagram-retry-<i>` at `Gallery.tsx:817`, `lightbox-retry` at `GalleryLightbox.tsx:1571`)
- attribute history from `record.oldValue`: no record shows `aria-busy` leaving `"true"`

**Focus needs a different instrument, because a MutationObserver cannot see it.** Sampling
`document.activeElement` before and after passes when an intermediate commit moves focus and the next
one restores it, which review round 3 raised. Attach `focusin` and `focusout` listeners on the
container for the duration of the Restart and assert the recorded sequence is EMPTY. An empty event
log is the only evidence that focus never moved, as opposed to moved and returned.

The observer's record count and the listener attachment are both premises: a run that observed
nothing satisfies every "no record" assertion vacuously.

## Task 6: transition audit

<!-- task: red=`pnpm exec vitest run --project parallel tests/components/diagrams/gallery.transitions.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:755` why=`the compound cases are GREEN ON ARRIVAL once Tasks 3 to 5 ship, so the red is PLANTED: remove the phase clear from the onLoad path at this line, observe this command red, restore, observe green. The cycle is the one tests/e2e/diagram-retry-dimensions.spec.ts:9-16 documents for its own sibling assertion` ac=AC-6,AC-7 -->

Six render states, so §8's fifteen unordered pairs, plus §8.1's TEN compound cases. Enumerate every
ternary render and conditional block in the two retry regions, assert each is deliberately instant,
then test all ten compound cases including the one an earlier draft omitted: Restart pressed while
ANOTHER item is 29 seconds into its own wait, asserting that item's window is untouched.

There is no `AnimatePresence` in either retry region; the audit records that, since "no exit
animation is missing because there is no presence wrapper" is otherwise re-derived every round.

## Task 7: layout dimensions, in a real browser

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/diagram-retry-dimensions.spec.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:791` why=`the height assertion is GREEN ON ARRIVAL because the check-in button reuses the shipped overlay's absolute inset-0 at this line, so the red is PLANTED: remove that class, observe this command red, restore, observe green` ac=AC-13 -->

EXTENDS the shipped `tests/e2e/diagram-retry-dimensions.spec.ts`. With the asset request held open,
drive an item to the check-in and measure.

**Measure against the cell's CONTENT box, not its border box.** The `<li>` carries
`border border-border`, `boundingBox()` reports the BORDER box, and `absolute inset-0` resolves
against the containing block, so comparing the two directly reports a 2px gap on a component laying
out correctly. The sibling case in this same file documents that in its own AC-7 case, in the comment immediately above its `inner` computation, and
it cost that assertion a failing run. An earlier draft of this task compared the raw rects and would have failed
on the correct implementation, which review round 3 caught. Reuse the file's existing `inner`
computation rather than writing a second one.

Assert: the check-in button's height equals the cell's content-box height within 0.5px; both text
lines are inside the button's rect; the button clears the 44px tap floor.

Detach-safety: each `locator.evaluate` can outlive its element if the image resolves mid-measurement,
so the request stays held for the whole case and each evaluate is guarded.

## Task 8: the check-in appears, in a real browser, and U-1 is recorded

<!-- task: red=`pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/diagram-retry.spec.ts; node --import tsx scripts/assert-u1-recorded.ts` red-state=authored red-target=`components/diagrams/Gallery.tsx:782` why=`the overlay onClick is a bare preventDefault at this line, so Restart issues no second request and the browser case fails on the request count; the second command then fails because spec 1.2 records no observed answer. The two are joined by ; and NOT by &&: the first is SUPPOSED to red, and under && the shell would never reach the second, so its red could not be observed at all` ac=AC-2,AC-8,AC-9,AC-D3 -->

EXTENDS `tests/e2e/diagram-retry.spec.ts` and its harness. **Boot mechanism, as it actually is:** not
a Next server. `tests/e2e/_diagramRetryLiveEntry.tsx` mounts the real `<Gallery>`, `bundleLiveEntry`
and `compileEntryCss` build it out of process with a pinned esbuild, and a local `node:http` server
serves it. `test` and `expect` come from `./helpers/fontFidelityFixture`, never from
`@playwright/test` directly, which `tests/e2e/_metaFontFidelityWiring.test.ts` pins.

Readiness gate: the shipped `await expect(failedControl).toBeVisible()`, never `networkidle`.

**This case waits the real thirty seconds** with an explicit `test.setTimeout`. `RETRY_CHECK_IN_MS`
is a module constant read at call time, so shortening it needs a test-only prop; one slow case is
cheaper than that prop and cheaper than the round it would earn.

Assert the check-in copy appears and Restart is pressable. jsdom issues no requests, which is why a
browser is needed at all.

**MEASURED 2026-09-01, and this paragraph used to say something else.** It asked the case to assert
that pressing Restart issues a SECOND request while the first is unanswered. It does not:
`attemptsAfterRestart: 2`, not 3. The replacement `<img>` carries an identical URL, a request for it
is still in flight, and Chromium serves the new element from that request rather than opening a
second connection. Ruled a documented limit (design spec §1.2); the case records the number instead
of asserting a claim that is false. AC-8 is unaffected — it asks for a DIFFERENT `<Image>` node, not
for a second request, and that is asserted here and in the jsdom suite.

**U-1 is measured here and RECORDED, and the recording is gated.** Spec §1.2 leaves unratified
whether removing a mid-fetch `<img>` abandons its request. This case already holds a request open and
unmounts that `<img>` on Restart, so record from the harness server whether the socket closes, and
write the observed answer into spec §1.2. A new `assert-u1-recorded` script under `scripts/`, created by this task, is the gate and the second
half of this task's command. **It pins the PARSED ANSWER, not the phrasing.** An earlier draft
defined it as failing while §1.2 still said the claim was unsettled, which round 4 correctly showed
is satisfied by deleting or rewording that sentence without recording anything. Prose guards close by
pinning, so the script parses §1.2 for a structured record and fails unless it finds all three:

- a verdict token from a CLOSED set, `ABANDONED` or `CONTINUED`, so "it depends" or a hedge cannot
  satisfy it
- the citation of the e2e case that measured it, resolving to a real test name in
  `tests/e2e/diagram-retry.spec.ts`
- the date of the measurement

Any of the three missing is a non-zero exit. Rewording the surrounding sentence changes nothing,
because none of the three is a phrase the author chooses.

**Scope, stated rather than implied:** the harness mounts `<Gallery>` and no lightbox, so the
real-browser evidence is gallery-only. The lightbox check-in is covered by Task 4's jsdom suite and
the shared implementation, and this plan claims no browser measurement it does not take.

Then, statically over both components, AC-9: no `AbortController`, no `.abort(`, no assignment
clearing an `<img>` `src`. A source scan rather than a runtime probe, because the absence of a call
is not observable at runtime; scope it to the two files and assert the scan SAW them, so a mis-pathed
glob cannot report clean by reading nothing.

## Task 9: gates, then the ledger

<!-- task: red=`pnpm exec vitest run --project parallel tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the GRADUATED list does not contain DIAGRETRY-NO-RETRY-DEADLINE-1, so the graduation case this task adds finds the row still open in DEFERRED.md and fails until the row is archived and its id registered` ac=AC-D4 -->

In order, each its own command, never chained into a commit: `pnpm heavy pnpm test`, `pnpm typecheck`,
`pnpm exec eslint .`, `pnpm format:check`.

Then the invariant-8 dual gate over the diff, since `DESIGN.md` and two `components/` files are UI
surface. P0 and P1 findings are FIXED. This arc files no new ledger row, of any facing, so deferring
one is not available; anything unfixable goes in the PR body under "Unfixed peers" and the
orchestrator decides whether it earns a row. The gate's closeout marker line and its dispositions
land in the gate-run commit, not before: a marker written ahead of the run names halves that have not
run.

The ledger graduation is the PR's LAST commit, three edits in one:

1. move the `DIAGRETRY-NO-RETRY-DEADLINE-1` row body from `DEFERRED.md` to `DEFERRED-archive.md`. ONE
   row: the paired-chrome row split to `docs/paired-chrome-stale-text` and graduates there
2. add that one id to `GRADUATED` in `tests/docs/_metaDeferralLedgerGraduation.test.ts` with a dated
   comment naming this branch
3. remove its IN PROGRESS marker, same commit

The removal cannot be later: a marker reaching main names a branch the merge deleted and reds
`tests/docs/_metaLedgerInProgress.test.ts` there. It cannot be earlier: archives reject in-progress
entries.

Also run `tests/docs/_metaLedgerReferentialIntegrity.test.ts` and
`tests/docs/retiredIdentifierReferences.test.ts` after the move: archiving a row changes which ids any
document may still reference.

<!-- tasks: end -->

## Acceptance criteria

The spec declares AC-1 through AC-13. This plan keeps them there and carries the coverage map,
which is also what keeps every `ac=` above declared somewhere in this document:

| criterion | discharged by |
|---|---|
| AC-1 one live timer per in-flight item, none after any removal source | Task 3, Task 4 |
| AC-1b a check-in fires after ITS OWN entry, with another item entering and leaving between | Task 3 |
| AC-2 check-in copy and accessible name | Task 3, Task 4, Task 8 |
| AC-3 `aria-busy` true in every in-flight phase | Task 3, Task 4, Task 5 |
| AC-4 `aria-disabled` present, absent, present again | Task 3, Task 4, Task 5 |
| AC-5 image node identity unchanged across the check-in | Task 5 |
| AC-6 `onLoad` during the check-in reaches idle | Task 6 |
| AC-7 `onError` during the check-in reaches failed | Task 6 |
| AC-8 Restart reaches a fresh in-flight phase with a DIFFERENT image node | Task 5, Task 8 |
| AC-8b the replacement request gets its OWN full window | Task 5 |
| AC-8c one item holds one phase, structural now rather than asserted | Task 5 |
| AC-9 no abort call and no `src` clear anywhere | Task 8 |
| AC-10 no committed frame during Restart renders the failed control, `aria-busy` never leaves true, and focus never moves | Task 5 |
| AC-11 a stale phase entry renders nothing | Task 2 |
| AC-12 every declaration carries a registry row, and every row a live declaration | Task 2 |
| AC-13 real-browser check-in and its dimensions, measured against the CONTENT box | Task 7 |
| AC-14 announced once per entry, `restarting` silent | Task 3 |
| AC-15 nothing announced for an item that left or resolved, including an already-scheduled effect | Task 3 |
| AC-16 a callback firing after its item left writes nothing, asserted on the NEXT retry | Task 3 |
| AC-17 every phase write is functional AND reads `prev.get` first, or carries a stated exemption | Task 5 |
| AC-18 THE DECIDING CASE: planted removal while the callback is pending, per surface per source | Task 3, Task 4 |

This plan declares three criteria of its own. It was four until the paired-chrome row split off on
2026-08-31 and took AC-D1 with it:

- AC-D2: `DESIGN.md` §5.5 lists `RETRY_CHECK_IN_MS` at 30000 in `components/diagrams/GalleryLightbox.tsx`
- AC-D3: spec §1.2 records an observed answer for U-1, citing the e2e case that measured it
- AC-D4: `DIAGRETRY-NO-RETRY-DEADLINE-1` no longer appears in `DEFERRED.md` and carries no IN PROGRESS marker. ONE row, not two: the paired-chrome row split to `docs/paired-chrome-stale-text` and discharges its own criterion there. An earlier draft kept the two-row wording after the split, so this plan could not discharge the criterion it declared
