# Plan — the placement path runs one natural-size pass per placement-changing frame

**Spec:** `docs/superpowers/specs/admin/2026-08-28-placement-path-redundant-measures.md`
**Row:** `BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES`
**Branch:** `perf/placement-measure-memo`

**Files:**

- `components/admin/AnchoredPortal.tsx` (edited — the memo key, the props ref
  that keeps it fresh, the hidden-branch clear and the close reset)
- `lib/popover/naturalSize.ts` (edited — the scroll-restore short-circuit)
- `tests/components/admin/rowActions/anchoredPortal.test.tsx` (extended — INV-A,
  INV-B, INV-C, INV-D on the placed branch, INV-I, INV-J, INV-K, INV-L and
  INV-M; its `Harness` gains `align`, `className` and `children` parameters
  alongside the `preferredSide` one it already has — the last two not because
  they are key members, which they are not, but because INV-M's witnesses drive
  the panel's rendered size through them)
- `tests/components/naturalSize.test.ts` (extended — INV-F; INV-G is the two
  merged cases in that file, at `tests/components/naturalSize.test.ts:45` and
  `tests/components/naturalSize.test.ts:59`, asserted to stay green rather than
  rewritten)
- `tests/e2e/rowactions-geometry.spec.ts` (extended — INV-H)
- `BACKLOG.md` and `BACKLOG-archive.md` (the row graduates in the PR's last
  commit, which is also where its `IN PROGRESS` marker comes off)
- this plan (edited at closeout — the `impeccable-gate:` line and §12's
  dispositions; the spec is NOT touched at closeout, since both live here)

No production file outside the two named above is touched, and no DB, migration,
route handler or server action is involved at all.

## Meta-test inventory

**None applies, and the reason is that no registry this repo keeps has a row shape for this change.** Checked explicitly:

- `tests/auth/_metaInfraContract.test.ts` — Supabase call boundaries. No Supabase call is added or moved.
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — advisory-lock topology. No `pg_advisory*` call is touched; there is no DB write on this path at all.
- `tests/log/_metaMutationSurfaceObservability.test.ts` — mutation surfaces. No route handler and no `"use server"` action is added or edited.
- `tests/components/admin/_metaPopoverViewportSource.test.ts` — the one meta-test that DOES walk this subtree. It pins how popover surfaces obtain the viewport. This change adds no viewport read; the guard's population and every assertion are unaffected. **Task 1 runs it and records the result**, because a walked-population guard can red from a membership change rather than from a behaviour change.
- `tests/components/_metaScrollNeutralMeasurement.test.ts` — pins that no call site clears a cap itself. The site-2 repair changes the RESTORE inside the helper and adds no call-site cap clearing. **Task 5 runs it and records the result.**

## e2e harness readiness (mandatory checklist for the Playwright task)

Task 5 attaches to the EXISTING `tests/e2e/rowactions-geometry.spec.ts` describe block, so all three answers are inherited rather than invented:

- **(a) Server boot.** The workflow's own server; the spec never boots one. The route is warmed once in `beforeAll` outside any timed assertion (`tests/e2e/rowactions-geometry.spec.ts:168-173`), with `SETUP_TIMEOUT_MS = 300_000` and `CASE_TIMEOUT_MS = 180_000` (`tests/e2e/rowactions-geometry.spec.ts:145-146`) because `/admin` compiles on first request locally and is a cold prod build on a 2-core runner.
- **(b) Readiness gate.** `lastSeededTrigger` (`tests/e2e/rowactions-geometry.spec.ts:118`), never `networkidle`: it waits for `shows-find-input` to be visible, filters to the seeded prefix, and asserts the trigger count settles at `SEEDED_SHOWS`. The count settling is the proof that React hydrated, because the Find box is client state.
- **(c) Detach safety.** Between installing the counter and reading it the case holds NO Playwright handle on the panel at all: its only calls there are `page.setViewportSize` and `page.evaluate`, and the latter reads `window.__passProbe`, a plain object, plus a raw `document.querySelector` inside the page. No `locator.evaluate`, no `expect(locator)`, so nothing can auto-wait on a node that unmounted. That is the same property the contamination argument rests on, which is why it is one rule here rather than two.

**CI wiring: nothing new is needed, verified rather than assumed.** Both edited production files are already named in the workflow's `pull_request.paths` — `components/admin/AnchoredPortal.tsx` (`.github/workflows/admin-layout-e2e.yml:64`) and `lib/popover/naturalSize.ts` (`.github/workflows/admin-layout-e2e.yml:74`) — as is the spec file itself (`.github/workflows/admin-layout-e2e.yml:58`). A PR touching either production file fires the gate.

## The browser gesture is a viewport resize, not a scroll (already carried into the spec)

**On the shipped surface there is no scrolling ancestor of the trigger.** The rows wrapper is `overflow-hidden` and height-unconstrained, so the DOCUMENT is what scrolls (`tests/e2e/rowactions-geometry.spec.ts:196-200`, the containment case's own premise). And a document scroll DISMISSES the menu rather than re-placing it: both call sites pass `onDismiss` (`components/admin/ShowRowActions.tsx:668` and `components/admin/ShowRowActions.tsx:964`), which `AnchoredPortal` routes on the event target (`components/admin/AnchoredPortal.tsx:210-218`).

So a browser pin driven by a page scroll would assert against a closed menu. The gesture Task 5 drives is `page.setViewportSize`, a real browser resize that reaches the same `coalescer.schedule()` through `components/admin/AnchoredPortal.tsx:230` and moves the right-aligned panel because the trigger's right edge moves with the viewport. The jsdom probe measured the resize trigger at the same cadence as the ancestor-scroll trigger (`changedResizeReads=2`, appendix A.1), so it is the same property on a stimulus this surface can actually produce.

**This landed in the spec's round-1 repair commit (`5f771d7f6`), not in a task here.** It was found by plan-time verification rather than by review: the round-1 draft's INV-H named an ancestor scroll, and a case driven that way would have asserted against a closed panel — a guard whose premise the surface cannot satisfy. The ancestor-scroll path stays in the jsdom cases, where an ancestor carrying a scroll listener can be constructed.

## Coverage map

| Spec AC | Task |
| --- | --- |
| AC-1 | Task 1 |
| AC-2 | Task 1 |
| AC-3 | Task 3 |
| AC-4 | gate command in Tasks 1, 2, 3, 4 and 5 |
| AC-5 | Task 1 |
| AC-6 | Task 5 |
| AC-7 | Task 6 |
| AC-8 | Task 4 |
| AC-9 | Task 2 |
| AC-10 | Task 7 |
| AC-11 | Task 2 |
| AC-12 | Task 2 |
| AC-13 | Task 2 |
| AC-14 | Task 2 |

## Tasks

<!-- tasks: depth=2 -->

## Task 1 — one natural-size pass per placement-changing gesture frame

<!-- task: red=`pnpm exec vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` ac=AC-1,AC-2,AC-4,AC-5 -->

**What is red and why.** A new case in the existing file drives an ancestor
scroll and a window resize with the anchor stub MOVED, and asserts one
`withNaturalSize` pass per frame. It fails at 2, because
`components/admin/AnchoredPortal.tsx:142` runs `withNaturalSize` unconditionally
on every `measureAndApply` call and the ungated every-commit effect
(`components/admin/AnchoredPortal.tsx:261`) calls it again after the commit the
first pass produced. **The production line whose absence makes this red is the
early return this task adds between the trigger-rect read
(`components/admin/AnchoredPortal.tsx:141`) and the `withNaturalSize` call
(`components/admin/AnchoredPortal.tsx:142`)** — it does not exist on the live
tree, verified by reading those two lines.

**The counted unit is one panel-rect read, and the fixture makes that exact.**
Each pass reads the panel's rect once (`components/admin/AnchoredPortal.tsx:143`)
and reads it a SECOND time only when `heightAtWidth` runs
(`lib/popover/naturalSize.ts:48`), which happens only when the panel is wider
than the bounds (`lib/popover/position.ts:118-120`). The fixture stubs a panel
260px wide against jsdom's 1024px `window.innerWidth`, so the bounds are 1008px
wide after `VIEWPORT_INSET` (`lib/popover/position.ts:17`), `maxWidth` is `null`
and `heightAtWidth` never runs.

**And on a skipped call the panel is not read at all** — the early return sits
before `withNaturalSize`, which owns the only panel read
(`components/admin/AnchoredPortal.tsx:143`). That is what makes panel reads the
exact unit here rather than an approximation of it, and it is why this task
counts panel reads while the merged case counts anchor reads. Both halves are stated with `premiseHolds` from
`tests/_shared/premise.ts`: that the stub width is under the viewport width, and
that one pass is one panel read, the latter established by driving exactly one
pass through a single window resize and asserting the count is 1 — the same
idiom the merged case uses for anchor reads
(`tests/components/admin/rowActions/anchoredPortal.test.tsx:441-447`).

**Cases.**

- placement-CHANGING ancestor-scroll frame: 1 pass (AC-1).
- placement-CHANGING window-resize frame: 1 pass (AC-1).
- placement-UNCHANGED frame: 1 pass (AC-2). The control. It is 1 before AND
  after the repair, and it is here because a repair that gated the coalescer
  would take it to 0 and no other case would notice.
- a POSITION-ONLY move on the PLACED branch re-places the panel (INV-D). This
  case is added here rather than left to the merged one, and the reason is a
  coverage hole in the merged one rather than belt-and-braces: its anchor sits at
  `top: 900` in a 768px jsdom viewport
  (`tests/components/admin/rowActions/anchoredPortal.test.tsx:269`), so the
  trigger does not overlap the bounds, `computePopoverPlacement` returns
  `kind: "hidden"` at `lib/popover/position.ts:112`, and the assertion lands on
  the FALLBACK anchor — which happens to equal the below-the-trigger coordinate
  a real placement would give. So the merged case exercises the branch where this
  repair CLEARS the ref, never the branch where it writes one. This case keeps
  the anchor inside the viewport, asserts the placement is `placed` through the
  same oracle AC-5 uses, and then moves it without changing its size. The
  predecessor spec already recorded that jsdom cases can land on the degenerate
  branch (`docs/superpowers/specs/admin/2026-08-27-anchoredportal-measure-convergence.md:441-444`);
  this is that hazard hitting a specific invariant.
- the placement-sequence claim (AC-5, INV-I), in the two halves spec round 1
  forced. **(i)** After each frame
  the panel's full applied tuple — `left`, `top`, `data-portal-side`,
  `max-height`, `max-width` — equals the tuple derived from
  `placeWithinVisibleViewport` run on THAT frame's own stub inputs. The oracle is
  independent, not a golden recorded from a pre-repair run: a golden freezes
  today's answer including any defect in it, while the core computes the answer
  from first principles and is the same code the component consults. **(ii)** A
  per-frame count of APPLIED placements: exactly one on a changing frame, zero on
  an unchanged one. Counted with a `MutationObserver` on the panel's
  `style` and `data-portal-side`, sampled per CALLBACK BATCH — React assigns each
  style property separately, so a per-write count reports one placement as
  several. Half (ii) is what catches an ADDED or REMOVED intermediate placement;
  half (i) alone would not, and an end-state check catches neither.

  **Not a counting child, and the reason is a silent zero rather than a
  preference.** `children` is a prop of `AnchoredPortal`, so when the component
  re-renders from its own `setApplied` the child element object is the same
  reference the parent last created; React bails out of re-rendering it and the
  counter reads 1 forever. That reads GREEN while proving nothing, which is the
  shape the anti-tautology rule exists to catch. A `MutationObserver` on the
  panel's own attributes has no such bailout.

  **Half (ii)'s deciding mutant is the tuple comparison inside `commit`
  (`components/admin/AnchoredPortal.tsx:115`), not an added `setApplied` call.**
  An added call carrying the same tuple is dropped by that comparison, and React
  may batch it with the frame's real update, so it need not move the count at all
  — a mutant that can leave the number untouched decides nothing. Removing the
  comparison makes every measurement apply a placement, which moves the count
  directly. Run before the review dispatch, result recorded in the commit.

**GREEN, deliberately minimal.** Add `lastMeasureRef` keyed on the trigger RECT
alone, the optional `{ skipIfUnchanged }` argument, the early return after the
trigger-rect read, and the ref write on the placed branch
(`components/admin/AnchoredPortal.tsx:179`). The ungated effect passes the flag;
the coalescer is rewritten as `createRafCoalescer(() => measureAndApply())`.

**Three pieces the spec requires are deliberately NOT added here**, each because
adding it would leave the task that owns it with a case that passes the moment it
is authored — which the plan contract rejects: the `align`/`preferredSide` key
members (Task 2), the close reset (Task 3), and the hidden-branch clear (Task 4).
Each of those tasks reds against exactly what this task leaves out.

**Gate commands, run and recorded in the commit:**

- `pnpm exec vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` — the merged position-only case (`tests/components/admin/rowActions/anchoredPortal.test.tsx:266`) and the merged open-transition anchor-read count (`tests/components/admin/rowActions/anchoredPortal.test.tsx:404`) stay green (AC-4, INV-D, INV-E).
- `pnpm exec vitest run tests/components/admin/_metaPopoverViewportSource.test.ts` — the one walked-population guard over this subtree.

## Task 2 — the key observes the panel, and gains the core's two non-geometric parameters

<!-- task: red=`pnpm exec vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` ac=AC-9,AC-11,AC-12,AC-13,AC-14,AC-4 -->

**What is red and why.** After Task 1 the key is the anchor rect alone. **The
production lines whose absence makes these red are the panel-size comparison and
the `align`/`preferredSide` comparison this task adds to the key**, both verified
absent after Task 1.

**Two members, six cases, and the split matters.** `align` and `preferredSide`
are compared because no measurement can reveal a change in them; the panel's size
is OBSERVED because every other way the measurement can move runs through it.
Rounds 1-4 enumerated those other ways and were defeated four times; the record is
`docs/review-rounds/perf/placement-measure-memo/b608e71b32b5.md` and the axis is
fenced in the spec's §1.1.

- **`preferredSide` (INV-K, AC-9).** Render open with `"bottom"`, rerender with
  `"top"`, assert `data-portal-side` flips. The existing `Harness` already takes
  the prop (`tests/components/admin/rowActions/anchoredPortal.test.tsx:91`).
  Premises derive space above and below from `window.innerHeight` and the fixture,
  the idiom the merged cases use
  (`tests/components/admin/rowActions/anchoredPortal.test.tsx:162` and
  `tests/components/admin/rowActions/anchoredPortal.test.tsx:194`), so the flip is
  driven by the prop rather than by a lack of room.
- **`align` (INV-L, AC-11).** The harness gains an `align` parameter. `"left"` to
  `"right"`, assert `left` moves to `anchor.right - panel.width`. Premise: the two
  alignments must differ for this fixture, which they do not when the panel is
  exactly the trigger's width.
- **Panel size, four witnesses (INV-M, AC-12).** Each leaves the anchor rect,
  `align` and `preferredSide` untouched, and each reaches the guard through the
  same channel: **(a)** a `className` carrying `scale()`; **(b)** a `children`
  swap that measures differently; **(c)** a side-dependent rule fired by a flip
  under a STABLE `className`; **(d)** a rule selecting on the serialized `style`
  attribute, fired by the `left` the commit itself wrote. jsdom computes no
  layout, so each witness supplies its effect through the rect stub — (c) and (d)
  read the panel's live `data-portal-side` and `style` at stub time, which is what
  a CSS rule keyed on them does.

  **The witnesses are not four key members.** They are four causes proving ONE
  observation discriminates, which is the whole point of the redesign: dropping
  the panel-size comparison reds all four at once, and no witness has a mutant of
  its own.
- **Timing (AC-13).** Witness (b) asserts SYNCHRONOUSLY after `rerender`, no
  flush. A real `ResizeObserver` delivers a content-box change a frame later, so a
  guard waiting for it leaves one painted frame stale; jsdom's stub
  (`tests/setup.ts:70-81`) cannot rescue it either way.
- **The negative case (AC-14).** A pure TRANSLATION of the panel must NOT force a
  re-measure. Without it, a guard that re-placed on every commit would pass all
  four witnesses while removing no work — the tautology this criterion exists to
  refuse. Assert the pass count is unchanged across a translation-only stub change.

**GREEN, and it is two changes rather than one.** Widen the key to
`{ anchorRect, panelSize, align, preferredSide }` — the panel's size read from the
same node the measurement uses, the two props compared with `===` — AND introduce
the props ref that lets the comparing code see current values at all. Task 1's key
is the anchor rect, which `measureAndApply` already closes over freshly; `align`
and `preferredSide` are stale the moment the callback outlives a prop change.

`propsRef` is synced in a `useLayoutEffect` declared BEFORE the subscriptions
effect, so every later layout effect on the commit sees current props and the
coalescer's animation-frame callback sees them too. `measureAndApply` reads it for
the key AND for the placement inputs, so there is one source and the two cannot
diverge. Adding the props to `measureAndApply`'s dep array instead re-creates the
callback on every parent re-render, which re-subscribes the `ResizeObserver` and
delivers an initial callback — adding a measure per parent re-render while
removing one per gesture frame.

**Ordering is load-bearing**: the props-sync effect declared after the ungated one
would compare against the PREVIOUS commit's props and re-place a prop change one
commit late. Every case above asserts immediately after `rerender` with no
intervening flush, which is what pins it.

## Task 3 — reopening at the identical trigger rect still places the panel

<!-- task: red=`pnpm exec vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` ac=AC-3,AC-4 -->

**What is red and why.** Open, close, reopen with the anchor stub unchanged, and
assert the panel is placed. After Task 1 the ref survives the close, so the
ungated effect — the sole measurer of the open commit — skips the only
measurement of that open and the panel renders at its unplaced origin. **The
production line whose absence makes this red is the `lastMeasureRef.current =
null` reset this task adds to the close effect
(`components/admin/AnchoredPortal.tsx:267-270`)**, verified absent after Task 1.

The assertion is on the panel's `style.top` against the value derived from the
stub rect and `GAP`, never on "the panel exists": a panel at the origin exists.

**GREEN.** Reset the ref in the close effect.

## Task 4 — a hidden measurement leaves the memo unarmed, from either starting state

<!-- task: red=`pnpm exec vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` ac=AC-8,AC-4 -->

**What is red and why.** After Task 1 the ref is written on the common path, so a
`kind: "hidden"` measurement ARMS the memo and the follow-up run skips the
recovery. **The production line whose absence makes this red is the
`lastMeasureRef.current = null` this task adds to the hidden branch
(`components/admin/AnchoredPortal.tsx:157`)**, verified absent after Task 1.

**Two cases, because the invariant has two starting states and only one of them
is obvious.** Spec round 1 found this: "record on the placed branch only" reads
like it discharges INV-J and does not — it leaves a stale key behind on the
placed-then-hidden sequence.

- **Case A, from a `null` ref.** The panel's rect stub varies BY READ INDEX: zero
  area on the first panel read, which the placement core rejects
  (`lib/popover/position.ts:109`), and laid out on every read after it. That
  models the real reason the ungated re-measure exists — a panel not yet laid out
  when first measured, laid out by the time the commit settles.
- **Case B, from a ref holding a PLACED key at the same anchor.** Place normally
  first, then flip the stub to zero area and drive one coalescer pass (the
  coalescer never skips, so the hidden measurement definitely runs), with the
  read-index stub laying the panel out again for every read after that one. Under
  "decline to write" the ref still holds the placed key, the fallback commits, the
  follow-up finds the key equal and skips, and the panel keeps the fallback
  anchor. Under CLEAR it measures and recovers. **Case A passes under
  decline-to-write and Case B does not, which is exactly why one case is not
  enough.**

**Both cases discriminate on the applied placement, not on a pass count, and the
first draft of Case A was tautological.** It drove the recovery with a window
resize, which reaches `measureAndApply` through the coalescer — and the coalescer
never skips, so it measured and recovered in BOTH states. The defect is reachable
only where the ungated effect is the sole measurer. The assertion is a written
`max-height`, a value the fallback can never produce because it commits
`maxHeight: null` (`components/admin/AnchoredPortal.tsx:174`); the premise that
the relaid panel overflows the viewport is what makes a real placement write one.

The second half of INV-J — that the sequence terminates — is asserted by
requiring the rAF queue to have drained after the flush, not by a timeout.

**GREEN.** Clear the ref on the hidden branch; keep the write on the placed one.

## Task 5 — an unscrolled measurement does not read the scroll offsets

<!-- task: red=`pnpm exec vitest run tests/components/naturalSize.test.ts` ac=AC-6 -->

**What is red and why.** A new case installs counting getters for `scrollTop`
and `scrollLeft` and a `style` proxy recording cap writes, runs `withNaturalSize`
on an element whose offsets are both 0, and asserts no scroll read follows the
last cap-restore write. It fails at 2 reads, because
`lib/popover/naturalSize.ts:70-71` reads both unconditionally. **The production
lines whose defect makes this red are those two**, read on the live tree and
carrying no `!== 0` guard.

**GREEN.** Add the `heldScrollTop !== 0 &&` and `heldScrollLeft !== 0 &&`
short-circuits.

**Gate commands, run and recorded in the commit:**

- `pnpm exec vitest run tests/components/naturalSize.test.ts` — the merged
  scrolled-restore case (`tests/components/naturalSize.test.ts:45`) and the
  merged no-spurious-write case (`tests/components/naturalSize.test.ts:59`) stay
  green. Both hold non-zero offsets, so both take the unchanged branch (INV-G).
- `pnpm exec vitest run tests/components/_metaScrollNeutralMeasurement.test.ts`.

## Task 6 — the browser pin on the gesture path

<!-- task: red=`pnpm heavy pnpm exec playwright test --project=desktop-chromium tests/e2e/rowactions-geometry.spec.ts -g "placement-changing resize frame"` ac=AC-7 -->

**What is red and why.** A new case in the existing describe opens the last
seeded row's menu, installs a page-side counter for `withNaturalSize` passes,
drives `page.setViewportSize` to a narrower width, and asserts one pass on the
resulting placement-changing frame. Run against a tree with Task 1 reverted it
counts two. **The production line is the same early return Task 1 adds**; this
case is the browser's independent statement of it, on the real placed branch
rather than jsdom's degenerate fallback.

**The page-side counter observes the cap clear and restore on the panel's
`style` attribute, never `getBoundingClientRect`.** Playwright's actionability
checks call `getBoundingClientRect` themselves
(`tests/e2e/rowactions-geometry.spec.ts:429-431`), so a rect counter is
contaminated by the harness; nothing in Playwright writes `max-height` on the
portal.

**Premise, executed before anything it guards:** the resize must actually change
the placement. The panel's `left` before and after must differ, asserted from
the recorded batches, or the case proves nothing.

**The command is DERIVED from CI, not invented.** The workflow runs this spec as
`pnpm exec playwright test --reporter=list,json --project=desktop-chromium ... tests/e2e/rowactions-geometry.spec.ts`
(`.github/workflows/admin-layout-e2e.yml:178`). The `--project=desktop-chromium`
selector is load-bearing and is carried through; only the reporter and the
sibling spec files are dropped, and `-g` narrows to this case. The whole command
is wrapped in `pnpm heavy`, which is mandatory for a non-interactive Playwright
run.

**Requires the DB slot.** The spec's `beforeAll` seeds 16 shows with 14 crew each
and pins `app_settings` through `settleDashboardAdminState`
(`tests/e2e/rowactions-geometry.spec.ts:151-167`, its `beforeAll`), and the workflow boots local
Supabase and runs `pnpm db:seed` first
(`.github/workflows/admin-layout-e2e.yml:157-163`). Requested from bl-orch before
the run and released when the last DB-touching process has exited, verified.

**Detach safety, restated for this case's own calls** (the file-level checklist
above covers the inherited ones): between installing the counter and reading it
the case makes NO Playwright call that touches the panel — no locator, no
`expect(locator)`, no `locator.evaluate`, only `page.setViewportSize` and
`page.evaluate` with a raw `querySelector`. That is what keeps Playwright's own
actionability rect reads out of the count, and a zero-count control window
asserts it held rather than assuming it.

## Task 7 — closeout: the invariant-8 dual gate, and the row graduates

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-28-placement-path-redundant-measures.md; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" $P || exit 1; grep -qE "^#{2,3} BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES" BACKLOG.md && exit 1; awk "/^#+ BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES/{f=1;next} f&&/^#/{f=0} f" BACKLOG-archive.md > /tmp/ppm-entry.txt; test -s /tmp/ppm-entry.txt || exit 1; grep -q "IN PROGRESS" /tmp/ppm-entry.txt && exit 1; exit 0'` ac=AC-10 -->

**The impeccable dual gate is NOT waived.** `components/admin/AnchoredPortal.tsx`
is under `components/`, which invariant 8 defines as a UI surface regardless of
whether the diff renders anything new. The predecessor arc edited the same file
and ran both halves (`docs/superpowers/plans/2026-08-27-anchoredportal-measure-convergence.md:243`,
its closeout marker's grammar). This arc runs `/impeccable critique` and
`/impeccable audit` on the diff with the canonical v3 setup gates, records every
P0 and P1 with its disposition in this plan's §12, and writes the
`impeccable-gate:` line.

**What is red and why.** At the start of this task the plan carries no
`impeccable-gate:` line and `BL-POPOVER-PLACEMENT-PATH-REDUNDANT-MEASURES` is
still a heading in `BACKLOG.md`, so the command exits 1 on its first condition.
It passes only once both gate halves have run, the marker line is written, and
the row has moved to `BACKLOG-archive.md` with its `IN PROGRESS` field removed.

**The row graduates whole.** All three of its sites are dispositioned: sites 1
and 2 repaired, site 3 refuted with its numbers and a re-file trigger carried
into the archived entry. Per invariant 12 the `IN PROGRESS` marker comes off in
the same commit that archives the row, which is this PR's last commit.

**The `red=` here is a string-presence guard, so it gets the four pre-dispatch
mutants** before the whole-diff review dispatch, each result recorded in the
commit: (a) the `impeccable-gate:` line emptied; (b) the line plus an appended
suffix, which the end-anchored `$` in the pattern must reject; (c) the line
present but not live — indented, or inside a fenced block — which the `^` anchor
must reject; (d) each of the five declared fields varied in turn, so a pattern
that matches on `critique=` alone is caught. The BACKLOG conditions get the same
treatment: the row present in `BACKLOG.md` under a different heading depth, and
an archived entry that still carries `IN PROGRESS`.

<!-- tasks: end -->

## Where the acceptance criteria live

**Every criterion this plan's markers cite is declared in the sibling spec, and
this plan declares none of its own.** That is deliberate rather than incidental:
`spec:lint`'s `TASK_AC_UNDECLARED` fires only in a plan that declares at least
one criterion, so a plan that declared a single extra id would put all nine
spec-declared ids into scope and draw nine findings. The closeout criterion is
therefore AC-10 in the spec, next to the other nine, and this plan carries the
coverage map above instead.

**Verified against the implementation, not inferred from the guidance.** The
coverage map is a TABLE, and `lib/specLint/taskContract.ts:466-478` declines any
id on a structured line — the comment there records that without the decline the
arm reds 9 plans and 71 ids on the live corpus, "one incidental list item
beginning with an id opts a whole plan in while its real criteria sit in a table
or a coverage line." A table row is exactly that shape, so this plan opts in
nowhere and the arm stays silent. `pnpm spec:lint` on this plan is run at
authoring time and its report attached to the review dispatch, which is how that
reading is confirmed rather than trusted.

## Pre-push gates

Run in full before the whole-diff review dispatch and again before the push that
CI reads, because a review of a red tree finds none of the red. All four are
separate gates rather than one: each has caught something the others do not see.

| Gate | Command | Why it is here |
| --- | --- | --- |
| full unit suite | `pnpm heavy pnpm test` | a scoped run misses regressions in files this diff does not name; `pnpm heavy` is mandatory for a full-suite run |
| typecheck | `pnpm typecheck` | vitest strips types, so a type error survives a green suite |
| lint | `pnpm exec eslint .` | this diff moves entries OUT of a `useCallback` dep array (`components/admin/AnchoredPortal.tsx:186`), which is exactly what `react-hooks/exhaustive-deps` adjudicates |
| format | `pnpm format:check` | the arc commits with `--no-verify`, which bypasses the Prettier hook |

The lint gate is not boilerplate here. After the props-ref change
`measureAndApply` no longer references `align` or `preferredSide` in its body, so
`[anchorRef, commit]` is the correct array and the rule should be satisfied; if it
is not, the reading of the change is wrong and that is worth learning before a
reviewer says so.

## Self-review, adversarial review, closeout

1. Self-review: citation pass over every `file:line` in this plan, numeric
   sweep, and the four pre-dispatch mutants on any string-presence assertion.
2. **Adversarial review (cross-model)** — Codex, `--stage plan --round 1`.
3. Whole-diff Codex review after implementation, on a tree whose full suite is
   green — never on a red one.
4. Closeout per Task 7.

## 12. Invariant-8 findings and dispositions

Filled by Task 7.
