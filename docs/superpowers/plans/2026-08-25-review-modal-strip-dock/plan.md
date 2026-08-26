# Plan — review-modal StatusStrip dock, header bound, upward refusal banner

Spec: `docs/superpowers/specs/2026-08-25-review-modal-strip-dock.md`.
Row: `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED`. Branch: `feat/review-modal-strip-dock`.
Every task: failing test observed → minimal implementation → passing test → one commit (invariant 1, 6).

impeccable-gate: required — UI surface (`components/admin/**`), both halves in §12. Reads
`DESIGN.md` §1.2a, the pairing clause #890 added on 2026-08-25.

Acceptance criteria are quantified over the spec's four AXES (REAL / REPLICA / DEGENERATE /
STRUCTURAL, spec §4). This plan does not restate the axes or re-list their cells: four spec rounds
were spent on exactly that kind of second copy.

---

## Meta-test inventory (mandatory declaration)

**CREATES:** none.
**EXTENDS:** none of the registry-bearing meta-suites listed in `docs/agents/writing-plans.md`.

Justified per-registry rather than waved:

| registry | applies? |
|---|---|
| `tests/auth/_metaInfraContract.test.ts` (Supabase call boundaries) | No — no Supabase client call is added or moved. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (lock topology) | No — no `pg_advisory*` anywhere in the diff. Invariant 2 is not engaged. |
| `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10) | No — no mutating route, no `"use server"` action added or modified. `setPublished` is a PROP already bound upstream; this arc changes where its consumer renders, never the action. |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | No — no `admin_alerts` row, no §12.4 code. |
| `tests/components/admin/showpage/popoverOverlayRegistry.ts` + `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` | **EXTENDED — the arc's one registry change.** FOUR rows move `fit-within-clip` → `placement-module`, and the meta-test's `IMPORT_FOR_DISPOSITION` arm then verifies each file imports from `@/lib/popover/position`. Count reconciliation below. |
| `tests/styles/*` control-outline / tap-target / z-index registries | No — no new control, no new token, no new z-level. The pill and switch keep their classes. |

Explicitly: **no new structural meta-test is added for the stale-comment class.** Spec §2.3 states why — a recognizer over comment English is the unbounded shape, and the sweep's cover is the `rg` in AC-12.

## Registry count reconciliation (run at plan time, not described)

The mandatory posture for a plan that adds or removes registry rows. This plan REMOVES no rows and
ADDS none; it re-dispositions four. Mechanical diff of `POPOVER_OVERLAY_REGISTRY` against the tasks'
stated changes, run 2026-08-25:

```
$ rg -n 'disposition: "' tests/components/admin/showpage/popoverOverlayRegistry.ts | sort | uniq -c
```

| disposition | rows before | rows after | delta | which |
|---|---|---|---|---|
| `placement-module` | 2 | 6 | +4 | HoverHelp body, `share-hub-popover` (unchanged); `published-toggle-popover` (Task 6); `admin-resync-{error,shrink-confirm,success}` (Task 6a) |
| `fit-within-clip` | 5 | 1 | −4 | the same four move out; **`published-show-review-attention-menu` REMAINS** |
| `not-clip-constrained`, `unverified-gap` | unchanged | unchanged | 0 | untouched |

Total row count is INVARIANT at every step — no overlay is added, removed, or left undispositioned.
That invariance is the check: a plan that changes the total has either dropped an overlay from the
registry or invented one, and neither shows up in the per-disposition deltas alone.

**Running this caught a plan-time error, which is the argument for running it.** The draft asserted
`fit-within-clip` had FOUR rows and would reach zero, and reasoned at some length about why an
empty-but-retained disposition is still correct. The command says five, and the fifth is
`components/admin/showpage/AttentionMenu.tsx`'s `published-show-review-attention-menu`. It stays: its
anchor is the modal HEADER, at the TOP of the panel, which the dock does not move, so it has no
side-flip problem and no reason to migrate. `fit-within-clip` therefore ends with a live row and the
whole empty-disposition question never arises. A described-but-unrun reconciliation would have carried
both the wrong count and a paragraph of reasoning about a situation that does not occur.

## Advisory-lock topology

N/A — declared explicitly per the mandatory rule. `rg -n 'pg_advisory|advisory_xact' components app lib` returns nothing this diff touches.

## e2e harness-readiness checklist (mandatory)

(a) **Boot:** no server boot. Both live entries are bundled out-of-process with pinned esbuild, Tailwind is compiled from `app/globals.css`, and the pages are served from a tmp dir by `node:http` inside `tests/e2e/popover-clip-fit.spec.ts:56-110`. Config `tests/e2e/standalone.config.ts` (no webServer, no Supabase).
(b) **Readiness gate:** `await page.waitForFunction(() => window.__hydrated === true)`, never `networkidle` — the existing contract at `tests/e2e/popover-clip-fit.spec.ts:19`. New cases reuse it. `document.fonts.ready` is awaited first, as every existing case does, because text metrics drive every number this arc asserts.
(c) **Detach safety:** every measurement re-queries its elements INSIDE the `page.evaluate` callback and returns plain numbers; no `locator.evaluate` handle outlives a re-render. The refusal banner mounts and unmounts with React state, so a handle taken before the click would be exactly the hazard. This is the file's existing rule (`tests/e2e/popover-clip-fit.spec.ts:20-21`) and the new cases keep it.

---

## Acceptance-criteria index

Every criterion the tasks below reference, with the task that discharges it. The criteria THEMSELVES
live in the spec's §4 with their axis column; this table is the mapping, not a second copy of them —
four spec rounds went on second copies.

| criterion | axis (spec §4) | discharged by |
|---|---|---|
| AC-1 | STRUCTURAL | Task 3 |
| AC-2 | MODES ∪ REAL | Task 5 |
| AC-3 | REAL | Task 5 |
| AC-4 | REAL | Task 5 |
| AC-5 | REAL | Tasks 6, 6a, 7 |
| AC-6 | STRUCTURAL | Task 3 |
| AC-7 | REAL (375x667 x load 30) | Task 7 |
| AC-8 | REPLICA 1-4 | Tasks 6, 6c |
| AC-9 | REPLICA 1 and 3 | Task 6c |
| AC-10 | STRUCTURAL | Task 1 |
| AC-11 | DEGENERATE | Task 6 |
| AC-12 | STRUCTURAL | Task 8 |
| AC-13 | STRUCTURAL | Task 10 |
| AC-14 | REAL | Task 2 |
| AC-15 | REAL | Tasks 2, 5 |
| AC-16 | STRUCTURAL | Task 2 (asserted by NOT editing the shell) |
| AC-17 | REAL (load-30 cells) | Task 2 |
| AC-18 | STRUCTURAL | Task 2 |
| AC-19 | REAL | Task 6 |
| AC-20 | REPLICA 1-4 ∪ DEGENERATE | Tasks 6b, 6c |

<!-- tasks: depth=2 red-contract -->

## Task 1 — harness can drive a refusal through the real modal

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "refusal banner mounts through the real modal"` red-state=authored red-target=`tests/e2e/_publishedReviewModalHarness.tsx:375` why=`modalElement hardcodes setPublished: NOOP_OK, so clicking the real modal's switch resolves ok and no banner ever mounts` ac=AC-10 -->

**What is red and why.** The new case clicks `[data-testid="published-toggle"]` in the REAL modal and waits for `[data-testid="published-toggle-popover"]`. It times out because `modalElement` passes `setPublished: NOOP_OK` (`tests/e2e/_publishedReviewModalHarness.tsx:375`), which resolves `{ok:true}` — a success path that calls `router.refresh()` and renders no banner. Nothing test-local causes the failure: the production-side fact is the hardcoded prop.

**RED** — add the case to `tests/e2e/popover-clip-fit.spec.ts`, observe the timeout, record the output in the commit.

**No `-t` name filter in any `red=` on this plan, deliberately.** A filter naming a case the task has
not written yet MATCHES NOTHING and exits 0, so the command reports green from the moment it is
authored and the red is never observed — the failure `docs/agents/writing-plans.md` calls out and
`--exec-red` flags as `RED_TEST_NAME_FILTER`. Every marker runs the whole file, so the new failing
case is what makes it red.

**GREEN**
1. `tests/e2e/_publishedReviewModalHarness.tsx`: add `setPublished?: PublishedReviewModalProps["setPublished"]` to `HarnessStateOverrides` (`tests/e2e/_publishedReviewModalHarness.tsx:243`), importing
   the exported props type from `components/admin/showpage/PublishedReviewModal.tsx:96`, and resolve it as `state.setPublished ?? NOOP_OK` at `tests/e2e/_publishedReviewModalHarness.tsx:375`. Type imported from the component's exported props type — not re-declared, so a signature drift is a compile error.
2. `tests/e2e/_pillFocusLiveEntry.tsx`: add `refusalCode: string | null` to the entry's state (initially `null`) and `window.__setRefusal = (code) => setState(...)` beside the existing `window.__setItems` (`tests/e2e/_pillFocusLiveEntry.tsx:109-111`). Pass `setPublished` into `overrides` ONLY when `refusalCode !== null`.

**Byte-identical default (AC-10).** With `__setRefusal` never called the override is absent, so `modalElement` takes `NOOP_OK` and every existing consumer — `attention-pill-focus.spec.ts`, the census, the layout spec's static pages — renders exactly what it renders today. Pinned by re-running ALL THREE consumers of that entry unchanged in this task's GREEN step, enumerated from `rg -ln '_pillFocusLiveEntry' tests/`: `tests/e2e/attention-pill-focus.spec.ts` (7 `__setItems` drives), `tests/e2e/popover-clip-fit.spec.ts`, and `tests/components/admin/sheetIconLinkContainment.test.ts` — the last is a vitest consumer, easy to miss when thinking of the entry as e2e-only.

**Anti-tautology.** The case asserts the banner's `textContent` contains the catalog copy for `FINALIZE_OWNED_SHOW`, not merely that a node with that testid exists — a stub div would satisfy existence. Four pre-dispatch mutants, run and recorded in the commit: (a) `setPublished` override emptied → banner absent, case red; (b) copy plus an appended suffix → still contains, so the assertion is `toContain` on a distinctive substring rather than equality, and the suffix mutant is recorded as EXPECTED-GREEN with that reason stated; (c) the copy present but behind `showFinalize` instead of `showError` → the case must go red, proving it reads the error branch; (d) the refusal CODE varied to `PUBLISH_BLOCKED_PENDING_REVIEW` → different catalog copy, so the assertion must track the code rather than match any warning text.

## Task 2 — bound the header so the column cannot overflow

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "header height holds across attention loads"` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:952` why=`the action cluster is flex shrink-0 with no max-width, so at 30 attention items it reaches ~262px of a 335px header, starves the min-w-0 flex-1 title column, and the header grows to 560.97px inside a 567px panel` ac=AC-14,AC-15,AC-17 -->

**What is red and why.** The new case sweeps attention loads 0, 2 and 30 at 375x667 and asserts the header's height at each equals the 0-load height within 0.5px, and that the strip's and the switch's rects lie inside the panel. Measured today: `164.19 / 164.19 / 560.97`, strip `713.03..911.03` against a panel bottom of `667`. It fails on the third load, at the production line named above.

**RED** — observe `560.97 !== 164.19` and the containment failures. Spec §0 carries the pre-authored transcript of exactly this.

**GREEN** — the three parts of spec §3.0, and nothing else:
1. `components/admin/showpage/PublishedReviewModal.tsx:952` → `className="flex shrink-0 items-center gap-2 max-sm:max-w-[10rem]"`.
   **Arbitrary value, deliberately, not `max-w-40`.** Tailwind v4 does map `max-w-<n>` onto the spacing
   scale, but this repo has ZERO numeric `max-w-<n>` usage — every hit of that shape is a truncated
   `max-w-4xl`/`max-w-2xl` — while `max-w-[...]` has direct precedent
   (`components/admin/BellPanel.tsx:1271`, `components/admin/showpage/ShareHub.tsx:895`). `10rem` is
   `160px` at the root font size the spec swept at, written the way this codebase writes caps.
2. The pill button's `className` (`components/admin/showpage/PublishedReviewModal.tsx:976`) gains
   `min-w-0 max-sm:flex-wrap max-sm:justify-end`. Note the header carries THREE `-alert-pill` test ids —
   the interactive composite button (`components/admin/showpage/PublishedReviewModal.tsx:967`/`components/admin/showpage/PublishedReviewModal.tsx:976`) and two non-interactive spans, `Alerts unavailable`
   (`components/admin/showpage/PublishedReviewModal.tsx:1080`) and `In sync` (`components/admin/showpage/PublishedReviewModal.tsx:1088`). Only the button can grow wide enough to starve the title, but the
   CLUSTER cap in step 1 bounds all three, so no state is left uncapped.
3. **The pill's `relative` wrapper (`components/admin/showpage/PublishedReviewModal.tsx:966`) gains
   `min-w-0`.** Round-1 finding 5: it is a DIRECT flex item of the capped cluster, it defaults to
   `min-width: auto`, and nothing else in the chain constrains it — `items-center` is cross-axis only
   and transfers no width cap. The plan-time sweep happened to pass without it because the pill's own
   `min-w-0` + wrap made the wrapper's min-content small, but that is the pill's property propagating,
   not the wrapper's own constraint, and it is exactly the "works at the measured loads" reasoning
   this arc exists to distrust.
4. The `h2`'s inner span (`components/admin/showpage/PublishedReviewModal.tsx:913`) gains
   `max-sm:line-clamp-2`.
   **This class has NO existing usage in the repo** (`rg -n 'line-clamp-' app components` returns
   nothing), so whether it emits is a fact to establish, not assume. It is core in Tailwind v4
   (`"tailwindcss": "^4"`, the repo root `package.json`, line 151) and needs no plugin, but a class that fails to emit
   makes the clamp a SILENT no-op — the exact shape this arc exists to eliminate. The task therefore
   asserts the emitted style, not the class string: at 375px, `getComputedStyle(span).webkitLineClamp`
   is `"2"` and `display` is `"-webkit-box"`. If the utility does not emit, that assertion fails
   loudly instead of the clamp quietly doing nothing.

**Why `10rem` (160px).** Spec §3.0's swept table. `176` is the largest passing cap and `192` is the first failure, so `160` sits one step below the boundary with 32px of margin, and it clears the 2-item cluster's natural width of `147.73` so no realistic load is affected at all.

**Anti-tautology and premise.** The expected header height is READ from the 0-load measurement in the same run, never written as `164.19` — a hardcoded literal would pass against a component that broke both states equally. `premiseHolds` from `tests/_shared/premise.ts:36` — the boolean form; `premise` at `tests/_shared/premise.ts:26` takes numbers — asserts, on each case's OWN inputs, that the 30-load pill actually rendered both segments (its `textContent` matches `/\d+ issues/` AND `/\d+ monitoring/`); without that the 30-load case could pass trivially if the harness silently rendered a 2-item pill. The premise executes unconditionally relative to the assertion it guards — not inside a `.each` callback.

**AC-17 in the same case.** Assert the pill's `textContent` still contains every segment and that `pill.scrollWidth <= pill.clientWidth + 0.5` (no ellipsis, no clipped overflow). The sweep already measured `pillTrunc: false` at every capped row, so this is a pin on a measured fact, not a hope.

## Task 3 — dock the strip into the shell footer slot

<!-- task: red=`pnpm vitest run tests/components/admin/showpage/publishedReviewModal.test.tsx` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1104` why=`the modal passes the strip in the subHeader prop and passes no footer prop at all, so the shell renders no footer element and the strip is not inside one` ac=AC-1,AC-6 -->

**What is red and why.** The new case asserts the strip is inside `[data-testid="published-show-review-footer"]` and that `[data-testid="published-show-review-subheader"]` is absent. Today the modal passes `subHeader` at `components/admin/showpage/PublishedReviewModal.tsx:1104` and no `footer`, so the footer element does not exist (`ReviewModalShell.tsx:723` gates on `footer != null`).

**GREEN** — move the whole `subHeader` fragment to `footer`, verbatim, and add `w-full` to the freshness band div (`components/admin/showpage/PublishedReviewModal.tsx:1127`). The announce span, both test ids and `data-section-freshness-flash` are unchanged. `ReviewModalShell.tsx` is NOT edited.

**Also asserted here (AC-6):** `document.querySelector("#share-access")` is the strip root and is inside the footer.

**Existing cases retargeted in the same commit** — `tests/components/admin/showpage/publishedReviewModal.test.tsx:865-899`, three cases naming the band. Their intent is preserved (the strip carries no container chrome of its own; the CONTAINER supplies surface, seam and padding); only the container changes from band to footer.

## Task 4 — the loading skeleton docks with it

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/skeletonBandParity.spec.ts` red-state=authored red-target=`components/admin/showpage/ShowReviewModalSkeleton.tsx:113` why=`the skeleton still passes its band as subHeader, so after Task 3 the skeleton shows a top band and the loaded modal a bottom dock — parity case A counts 3 bands in different positions and B compares subheader classes that exist on only one side` ac=AC-1 -->

**GREEN** — move `ShowReviewModalSkeleton.tsx:113-165`'s fragment from `subHeader` to `footer`, content unchanged (both mirrors already carry `w-full`). Retarget `skeletonBandParity.spec.ts` cases A, B, D and E from `subheader` to `footer`; D measures the body→footer seam. **Tolerances unchanged** (`SEAM_TOL`, `BAND_TOL = 4`) — loosening a tolerance to make a moved assertion pass is the defect this task exists to avoid, so the commit records the measured deltas.

## Task 5 — the panel column equation (layout-dimensions task, mandatory)

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/published-review-modal.layout.spec.ts -g "panel column"` red-state=authored red-target=`tests/e2e/published-review-modal.layout.spec.ts:308` why=`the spec asserts the published modal renders NO footer element in both modes; after Task 3 it renders one, so that assertion fails and the column equation's subheader term no longer resolves` ac=AC-2,AC-3,AC-15 -->

Real-browser `getBoundingClientRect()` on every documented `data-testid` in the fixed-dimension parent. jsdom is not sufficient and is not used.

**The panel is a fixed-height flex column** (`max-h-[85vh]`, `sm:max-h-[80vh]`) with flex children, and **this repo's Tailwind v4 does not default `.flex` to `align-items: stretch`**. The spec's §5 Dimensional Invariants list is the body of this task; every row is asserted:

| parent | child | assertion |
|---|---|---|
| panel | grab | `w-full shrink-0`; height 44 in sheet, 0 at `≥sm` |
| panel | header | full width via `items-stretch`; `shrink-0` |
| panel | body | `min-h-0 flex-1`; height = remainder, and **> 0 at every load** |
| panel | footer | full width; `shrink-0`; **`footer.bottom === panel content bottom` within 0.5px** |
| footer | band div | `w-full`; width = footer content-box width within 0.5px |
| band div | strip root | `w-full`; width = band width within 0.5px |
| body | content pane | `min-w-0 flex-1 overflow-y-auto` |

Equation: sheet `grab + header + main + footer === panel.clientHeight`; `≥sm` `header + main + footer === panel.clientHeight`; both within 0.5px, at 375x812 and 1280x900 as today, PLUS **THE DOMAIN** as the spec defines it once at the head of its §4 — twelve combinations (AC-15). The plan does not re-list the viewports, for the same reason the spec stopped: a re-listed domain drifts from the declared one, which was round-1 finding 2 and then round-2 finding 3. The 0-load header height is the per-viewport baseline, since header height is width-dependent. `SUBHEADER` count becomes 0; `FOOTER` count becomes 1.

**Anti-tautology.** Every term is measured; the equation is checked as a sum against `panel.clientHeight`, so a child that silently reports 0 fails the sum rather than passing a per-child bound. The body's `> 0` assertion is the one that would have caught today's 30-item state, where `main` measures exactly `0`.

## Task 6 — migrate the refusal banner to the placement module

<!-- task: red=`pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` red-state=authored red-target=`components/admin/PublishedToggle.tsx:31` why=`the registry row for published-toggle-popover is re-dispositioned to placement-module in this task, and IMPORT_FOR_DISPOSITION then requires an import from @/lib/popover/position which the file does not have — it imports @/components/admin/useFitWithinClip instead` ac=AC-5,AC-8,AC-11 -->

**Files:** edit `components/admin/PublishedToggle.tsx`, edit
`tests/components/admin/showpage/popoverOverlayRegistry.ts` (one row's disposition + reason).
**No new module and no new hook.** `lib/popover/position.ts`, `lib/popover/place.ts`,
`lib/popover/naturalSize.ts` and `lib/popover/rafCoalescer.ts` are IMPORTED, all four already in the
tree and already unit-tested.

**Why the red is valid.** The registry row change and the import change are two halves of one edit,
and the meta-test holds them together: re-dispositioning the row first makes
`IMPORT_FOR_DISPOSITION["placement-module"]` demand `from "@/lib/popover/position"` in a file that
does not have it (`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:31-39`).
That is a production-side fact, not a test-local one.

**GREEN** — mirror `ShareHub`'s `applyPlacement` (`components/admin/showpage/ShareHub.tsx:268-400`),
which this is a strict simplification of:
1. Portal the banner into the panel via `PopoverHostContext` (`components/admin/HoverHelp.tsx:77`).
2. `placeWithinVisibleViewport(window, { hostRect, trigger, naturalSize, wrappedHeightAt, preferredSide: "bottom", align: "left" })` inside `withNaturalSize`, driven by `createRafCoalescer`.
3. Trigger = the StatusStrip root, NOT the switch — this is what preserves the CASP2-2 full-strip-width contract.
4. No caret: ignore the returned `caret` and add no caret element.
5. Swap `POPOVER_POSITION`'s `inset-x-0 top-full mt-1` for `w-full max-h-[min(50vh,20rem)]`.
   **The cap is NAMED and the value is not free** (spec round-4 finding 1): the banner has no cap
   today, `PopoverPlacementInput` has no cap FIELD, and a CSS cap acts on the algebra only through the
   measured `naturalSize`/`wrappedHeightAt` — so without a value `height0` is undefined and Task 6c's
   geometries are non-deterministic. `min(50vh,20rem)` equals Re-sync's
   (`components/admin/ReSyncButton.tsx:73`), not ShareHub's `min(70vh,30rem)`, because these two are
   siblings on one trigger and mutually exclusive by T7. `z-banner`, `overflow-y-auto`, border,
   background, focus ring and `wrap-break-word` are unchanged.
6. Drop the `useFitWithinClip` import and its `fitRef`.

**Anti-tautology.** Three escapes closed, because each of the obvious assertions passes against a
different stub: `spaceAbove > naturalHeight` alone passes against a component that never places, so
assert `data-popover-side`; the attribute alone passes against one that writes it and no coordinates,
so assert the banner's bottom is `GAP` above the trigger's top within 0.5px; containment alone is
satisfied by `max-height: 1px`, the escape cross-model review already found on the T4 block
(`tests/e2e/popover-clip-fit.spec.ts:583-586`), so assert BOTH cap branches — capped when neither side
fits, uncapped when the chosen side does.

**Explicitly NOT re-tested here:** the placement algebra's own boundaries. They are owned by
`tests/lib/popover/position.test.ts`. Re-asserting an imported pure module through a component is the
tautology this arc exists to avoid. What IS asserted is the CONSUMER's contract: `kind: "hidden"`
leaves the banner `visibility: hidden` with no `data-popover-side` and recovers next frame (AC-11).

## Task 6a — the same migration for Re-sync's three overlays

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/published-review-modal.interactions.spec.ts -g "T-OVERLAY"` red-state=authored red-target=`components/admin/ReSyncButton.tsx:73` why=`OVERLAY_PANEL is absolute inset-x-0 top-full and the component's root is a fragment, so after Task 3 all three panels resolve their containing block to the footer and open below the panel's clip edge; T-OVERLAY measures the panel against the band, which no longer exists` ac=AC-5 -->

Forced by round-1 finding 1, not chosen. Same move as Task 6, same reasons, three overlays:
`admin-resync-error`, `admin-resync-shrink-confirm`, `admin-resync-success`, all sharing
`OVERLAY_PANEL` (`components/admin/ReSyncButton.tsx:72-74`) and all three currently on
`useFitWithinClip` (`components/admin/ReSyncButton.tsx:111-113`).

`max-h-[min(50vh,20rem)]` stays as the declared cap the placement core reads. `z-overlay` stays —
`components/admin/ReSyncButton.tsx:56-62` records the `z-overlay` vs `z-banner` split as a RULE
against the shrink confirm rendering underneath the publish popover while focus sits on "Keep current
version"; the placement module writes position, never z-index, so the rule survives untouched. Assert
it still holds with BOTH overlays open, which is the state the rule exists for.

**The abut becomes a 6px gap.** `GAP` is a module constant (`lib/popover/position.ts:16`) with no
per-call override. `T-OVERLAY`'s abut assertion (`tests/e2e/published-review-modal.interactions.spec.ts:670`)
is retargeted to `GAP`, imported rather than retyped as `6`. `T-OVERLAY-BOUNDS` (`tests/e2e/published-review-modal.interactions.spec.ts:737`) keeps its
cap-and-internal-scroll assertions and retargets its band terms. This is a visible change on a shipped
surface: it goes to the invariant-8 gate in §12, named, not absorbed.

**Registry:** the three rows move to `placement-module` with Task 6's, four in total — see the count
reconciliation below.

## Task 6b — restore the dev warning the migration removes

<!-- task: red=`pnpm vitest run tests/lib/popover/placeWarning.test.ts` red-state=authored red-target=`lib/popover/place.ts:33` why=`placeWithinVisibleViewport returns hidden or a maxHeight and emits nothing; the isFloorClamped warning that closes the convergence bound belongs to useFitWithinClip, which these four overlays stop consuming` ac=AC-20 -->

**Files:** `lib/popover/place.ts` (add the warning), NEW a new `place.ts` warning suite under `tests/lib/popover/`.

Round-2 finding 4: §11's bound is closable only because an unsatisfiable geometry is SIGNALED. The
migration removes the only thing that signals. Restored at ONE site rather than four, which also
closes the same gap for `ShareHub` and `HoverHelp` — the derived cover, not an enumerated one.

**`PlaceInput` gains one optional field**, `warnKey?: object`, and the caller passes the overlay
element it already holds. Round-3 finding 3: `placeWithinVisibleViewport` receives rects and never a
node (`lib/popover/place.ts:25-31`), and callers build fresh input objects every pass, so a `WeakSet`
at that site would key on garbage — "once per element" was unimplementable as first specified. The
`WeakSet` stays at the one site; only the identity comes from the caller. Omitted, the warning fires UNDEDUPLICATED — and that means the three existing callers
(`AnchoredPortal`, `HoverHelp`, `ShareHub`) BEGIN warning in development. That is deliberate and it is
the whole argument for one site over four copies: all three have carried the same silent
unsatisfiable-geometry gap since their own migrations. Spec round-4 finding 2 caught the first draft
claiming both this and the opposite in adjacent paragraphs.

Fires on exactly two conditions: `kind === "hidden"`, and `maxHeight !== null && maxHeight < MIN_FITTED_HEIGHT`.
A plain cap is NOT warned (`ShareHub` caps legitimately on a long roster, and a warning on every cap
is one people learn to ignore). `MIN_FITTED_HEIGHT` is IMPORTED from `lib/layout/fitWithinClip.ts:51`
— importing a constant from a fenced file is not editing it, and re-deriving the floor would be two
numbers that can disagree. Dev-only, `debug` level, once per element behind a `WeakSet`, all three for
the reasons `components/admin/useFitWithinClip.ts:113-131` states.

**Arm 1 (`kind === "hidden"`) is asserted HERE, by calling `placeWithinVisibleViewport` directly with
a degenerate input — never through a component.** Spec round-4 finding 5: consumers INTERCEPT
zero-area measurements before the core sees them and deliberately leave the overlay unpositioned and
visible (`components/admin/showpage/ShareHub.tsx:293-302`), so no component path ever delivers a
`hidden` result and an arm asserted through one could never fire. The warning is a `place.ts` concern
and is tested at `place.ts`.

**Anti-tautology, and it is the whole point of this task.** A warning test that only asserts the
warning FIRES passes against a warning that always fires, which signals nothing. Four assertions, not
one: it fires for `hidden`; it fires for a sub-floor cap; it does NOT fire for a plain placement; it
does NOT fire for a cap at or above the floor, including the exact boundary `maxHeight === MIN_FITTED_HEIGHT`,
which is silent because the floor is the point at which the box is still usable. Plus a fifth for the
new field: two calls with the SAME `warnKey` warn once, two calls with DIFFERENT keys warn twice, and
calls with no key warn every time — the three behaviours the optional field defines.

## Task 6c — rebuild the replica clip entry

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "obligation 3"` red-state=authored red-target=`tests/e2e/_publishedToggleClipLiveEntry.tsx:67` why=`the entry mounts PublishedToggle with no StatusStrip and no PopoverHostContext, so after Task 6 the trigger does not exist and hostRef falls back to document.body — placement bounds by the viewport instead of the 220px clip panel, and every T4 obligation measures a banner the panel no longer constrains` ac=AC-9 -->

Round-2 finding 2. **This is not a weaker fixture after the migration, it is an inoperative one**, and
an inoperative fixture PASSES — which is why this task exists rather than being folded into Task 6.

**GREEN:** wrap the replica in a `PopoverHostContext.Provider` whose ref is the replica panel, and add
a StatusStrip-shaped trigger carrying `data-testid="show-status-strip"` so the migrated component
finds the same trigger it finds in production. Then split the fixture into three geometries, each
exercising one outcome deliberately:

| # | geometry | branch (`lib/popover/position.ts`) | outcome asserted |
|---|---|---|---|
| 1 | `spaceBelow >= height0` | `lib/popover/position.ts:126` | `side === "bottom"`, `maxHeight === null` — the ONLY place the bottom side is exercised, since production always takes the top |
| 2 | `spaceBelow < height0 <= spaceAbove` | `lib/popover/position.ts:127` | `side === "top"`, `maxHeight === null` — the flip itself, uncapped |
| 3 | `height0 >` both, larger space `>= MIN_FITTED_HEIGHT` | `lib/popover/position.ts:128-131` | a cap is written, the box scrolls internally, tab and ArrowDown reach the tail; the §3.2b warning does NOT fire |
| 4 | `height0 >` both, larger space in `(0, MIN_FITTED_HEIGHT)` | `lib/popover/position.ts:128-131`, sub-floor | same cap path; the §3.2b warning DOES fire (AC-20 arm 2) |

**Four cases covering THREE vertical branches plus a sub-floor variant of the third** — not "four
branches", which spec round-4 finding 3 corrected: cases 3 and 4 take the same `else`, differing only
in whether the cap lands under `MIN_FITTED_HEIGHT`, which is a property of the WARNING rather than of
the algebra. The variant earns its fixture anyway, because nothing else exercises arm 2. The `hidden`
gates and the width branch are covered elsewhere (the unit suite and AC-19 respectively).

**`hidden` is not a replica case, and not for the reason the first draft gave.** It claimed
a host "too small to seat the banner" yields `kind: "hidden"`. It does not: `hidden` needs a
degenerate rect, no positive overlap, or `max(spaceAbove, spaceBelow) <= 0`
(`lib/popover/position.ts:103-116`), while a merely-small host yields a PLACED result with a cap. And
no case reached a sub-floor cap, so AC-20's second arm had nothing exercising it. Both are fixed by
deriving the geometries from the branches instead of from intuition. `hidden` is exercised where it
actually occurs — the jsdom DEGENERATE axis, the case
`components/admin/showpage/ShareHub.tsx:294-302` already documents.

**The old fixture's ~80px was CHOSEN and its docblock says so** (`tests/e2e/_publishedToggleClipLiveEntry.tsx:23-29`).
The three new geometries are chosen too, and the docblock says THAT — but each is chosen to produce a
NAMED outcome of `computePopoverPlacement`, and the test asserts the outcome rather than a pixel, so
the choice is a fixture design rather than a hidden assumption. The one thing a chosen geometry still
cannot establish is real-surface reachability; that is §7's job, on the real modal.

## Task 7 — measure the anchor room and record it

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "anchor-room census"` red-state=authored red-target=`tests/e2e/popover-clip-fit.spec.ts:754` why=`the census case asserts only the structural premise and its own comment says room is deliberately not asserted; the replacement measures spaceAbove and spaceBelow through the real modal, which nothing does today` ac=AC-7 -->

Replaces `tests/e2e/popover-clip-fit.spec.ts:754-789`, **keeping its structural-premise assertion**
and adding the measurement. Not a trade. Measures in the placement module's own terms —
`spaceBelow = max(0, bounds.bottom - trigger.bottom - GAP)`,
`spaceAbove = max(0, trigger.top - bounds.top - GAP)` (`lib/popover/position.ts:114-115`) — with
`GAP` and `VIEWPORT_INSET` imported, never retyped, so the test and the implementation cannot disagree
about what "room" means.

**The fenced file's edit is a RETIREMENT, not a fill.** `lib/layout/fitWithinClip.ts:32-43` documents
the anchors the FIT hook serves. After Tasks 6 and 6a this anchor is not one of them, so filling in a
number would document a hook that no longer serves it. The entry becomes one line recording the
migration and naming where the measurement lives (this test, and the migrated registry row's reason).
That is a deletion plus a cross-reference — the arc's only edit to a fenced file, and smaller than the
draft's.

## Task 8 — class sweep: the stale anchor claim

<!-- task: red=`! grep -rniE 'sticky[[:space:]]+(status[[:space:]]?)?strip|sticky[[:space:]]+StatusStrip' app components tests lib` red-state=live why=`seven live sites assert the StatusStrip is sticky and is the banner's positioned ancestor; both halves are false today and stay false after the dock` ac=AC-12 -->

**This `red=` is a LIVE red and was RUN at plan time.** `grep -rniE`, not `rg`: the `--exec-red`
probe runs in a shell without `rg` on PATH and returned exit 127, and a gate that only works where one
optional binary is installed is not a gate. Both spellings return the same six lines on this tree.

**And it is NEGATED, which the first draft got backwards.** `--exec-red` reported `RED_ALREADY_GREEN`:
a grep that FINDS matches exits 0, so the un-negated command reported green while the defect was
present. The assertion this marker makes is "no live site calls the strip sticky", so the command is
`! grep …` — non-zero today because the sites exist, zero after Task 8 removes them. A red whose
polarity is inverted is the purest form of a gate that can never fire, and it took an executable probe
to see it.
Output, verbatim, six hits (the seventh site, `_statusStripToggleHarness.tsx:104`, says `sticky top-0`
and is deliberately outside this narrow pattern — see §2.3's triage):

```
components/admin/PublishedToggle.tsx:52
components/admin/PublishedToggle.tsx:67
tests/components/admin/PublishedToggle.test.tsx:485
tests/components/admin/showpage/popoverOverlayRegistry.ts:110
tests/e2e/popover-clip-fit.spec.ts:135
tests/e2e/statusStripToggleLayout.spec.ts:18
tests/e2e/statusStripToggleLayout.spec.ts:160
```

plus `tests/e2e/_statusStripToggleHarness.tsx:104` (`sticky top-0`), which the narrow pattern misses and the spec's §2.3 triage names. GREEN is that pattern returning zero AND that eighth site corrected.

**Also in this commit:** `tests/e2e/step3-review-modal.layout.spec.ts:301`, whose comment says the
published modal has NO footer and uses that to explain T-CORNER's coverage split — **the site spec §9's
discovery command provably cannot reach**, since the file names Step 3 and not this modal (spec §10
item 7); `tests/e2e/_shareLinkFlashLiveEntry.tsx:126` `subHeader` → `footer`; `tests/e2e/attention-modal-gallery.spec.ts:535` comment + `MODAL_BOXES` footer row; the `errorProbeHtml` comment at `tests/e2e/_statusStripToggleHarness.tsx:170-179` stating it replicates WIDTH geometry only.

**Dated `docs/` records are NOT touched** — spec §2.3.

## Task 9 — transition audit

<!-- task: red=`pnpm vitest run tests/components/admin/transitionAudit.test.tsx` red-state=authored red-target=`components/admin/PublishedToggle.tsx:60` why=`POPOVER_POSITION is a single constant hardcoding top-full; there is no POPOVER_UP arm and no direction that selects between arms, so a case asserting both arms exist and exactly one is applied cannot pass` ac=AC-5 -->

**Why this task's red is valid, stated because the obvious framing is not.** `tests/components/admin/transitionAudit.test.tsx` is a SOURCE-SCAN suite: its `SERVER_RENDERED` list (`tests/components/admin/transitionAudit.test.tsx:38-68`) already contains `components/admin/PublishedToggle.tsx` and asserts the file carries no motion library, no `AnimatePresence`, no mount animation. Adding a direction adds no motion, so **that existing case stays green and is not this task's red** — a case that passes the moment it is authored is rejected by the red contract. The red is the new case below, whose subject does not exist yet.

**The new case** enumerates spec §6's inventory and asserts:
1. Both arm constants exist and are DISJOINT — `POPOVER_DOWN` contains `top-full` and not `bottom-full`, `POPOVER_UP` the reverse. Red today: `POPOVER_UP` does not exist.
2. The banner's `className` is composed as base + exactly one arm, so no render can apply both. Red today: there is one constant and no selection.
3. A↔B and A↔C are instant BY DESIGN, not by omission: the banner element carries no `transition-`, no `animate-`, no `AnimatePresence`. This is a deliberate-instant declaration, and it is the assertion that would catch someone "improving" the flip with a fade that fights the layout-effect re-measure.
4. `components/admin/PublishedToggle.tsx` REMAINS in `SERVER_RENDERED` (`tests/components/admin/transitionAudit.test.tsx:45`). Adding `useFlipWithinClip` must not smuggle in motion; this is the regression pin on that.

**Compound cases** from spec §6, each asserted where it is observable: direction change mid-resize is covered by Task 6's coalescer test; the entrance-transform re-measure by the scoped `transitionend` listener's presence and its `propertyName === "transform"` filter; the freshness flash by asserting the flash mutates no geometry the predicate reads; AttentionMenu mutual exclusion by the existing T7 block, re-run unchanged.

**Four pre-dispatch mutants** for the string-presence assertions in 1 and 3, run and recorded: (a) `POPOVER_UP` emptied; (b) `bottom-full` present plus an appended suffix; (c) `bottom-full` present but commented out — the case must go red, proving it reads the live constant and not the file text; (d) the arm-selection ternary inverted, so the wrong arm is applied for a given direction.

<!-- tasks: end -->

<!-- tasks: depth=2 -->

## Task 10 — graduate the row


<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-13 -->

**Close-out gate, run before this commit:** `git diff --name-only origin/main...HEAD | sort` compared
to spec §9's exact filename block. A path in one and not the other is a defect in one of them, and
this is the comparison that replaced three rounds of hand-maintained blast-radius tables.

Archives `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` with the measured numbers, **removing the in-progress marker in the same commit** (invariant 12: an archive categorically rejects in-progress entries, so the marker cannot ride along). This is the PR's last commit, before any merge.

<!-- tasks: end -->

---

## Reconciliation sweeps — authored AND RUN at plan time

All three were RUN on 2026-08-25 against this branch; outputs and per-hit dispositions follow. They
are not a check to perform later.

### Sweep 1 — the derived two-condition cover (spec §9)

Superseded the draft's `subHeader` grep after that cover missed a class (round-1 finding 1) and its
replacement dropped a site (round-2 finding 6). Two conditions, both stated:

```
rg -l 'published-show-review|ReviewModalShell|PublishedReviewModal|ShowReviewModalSkeleton' \
   app components tests -g '*.ts' -g '*.tsx' > /tmp/modalfiles.txt
rg -n -i 'subheader|footer|show-status-strip|top-full' $(cat /tmp/modalfiles.txt)
```

Run 2026-08-25: **314 lines across 36 files.** Spec §9 dispositions every file; the plan does not
duplicate that table — one copy, referenced, because two copies drift. What the plan adds is the
per-task mapping below.

### On sweeps generally, after three rounds found three defects in one cover

**The plan does not carry a transcript of the discovery command's output, and neither does the spec
any more.** Three rounds found three defects in that transcript — narrower than claimed, then a repair
that dropped a held site, then a table naming a file the command does not produce while omitting two
it does. The defect is the transcript itself: nothing compares it to the command. Spec §9 now states
the command for discovery, the CHANGED set as a claim `git diff --name-only origin/main...HEAD`
settles, and everything else as unchanged-and-proved-by-its-suite. **The plan's obligation is the
first of those**: every file the tasks touch appears in §9's changed set, and close-out compares the
two. That comparison is in Task 10's gate list.

### Sweep 1a — the superseded narrow grep, kept only to show what it missed

Twelve production hits, twenty-six test hits. Dispositions, grouped because most are one class:

| site | disposition |
|---|---|
| `components/admin/review/ReviewModalShell.tsx:116, 140, 697, 702` | **Untouched.** The slot keeps existing; this arc stops USING it from one consumer. |
| `components/admin/showpage/PublishedReviewModal.tsx:1104` | Task 3 — the move itself. |
| `components/admin/showpage/PublishedReviewModal.tsx:12, 897, 1113` | Task 3 — three docblock/comment claims that the strip lives in the band. Corrected in the same commit as the move; a comment that survives its own subject is the defect Task 8 exists for. |
| `components/admin/showpage/StatusStrip.tsx:55` | Task 3 — the strip's own docblock names the band as its container and the source of its padding and seam. Now the footer. |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx:58, 113` | Task 4. |
| `tests/e2e/_shareLinkFlashLiveEntry.tsx:20, 82, 126` | Task 8 — prop plus two comments. |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx:865, 899` | Task 3 — retargeted. |
| `tests/components/admin/showpage/statusStrip.test.tsx:603` | Task 3 — a comment explaining WHY the strip carries no chrome ("the band owns it"). The reason survives; the container's name changes. |
| `tests/components/admin/review/reviewModalShell.test.tsx:56, 69, 93, 169-235, 325, 334-345` | **Untouched, and that is AC-16.** These exercise the slot against a test Host, not against this consumer. |
| `tests/e2e/published-review-modal.layout.spec.ts:24, 86, 254, 260, 278, 281` | Task 5 — the column equation. |

### Sweep 2 — `rg -n -i 'sticky\s+(status\s?)?strip|sticky\s+StatusStrip' app components tests lib`

Seven hits, listed verbatim in Task 8, plus the eighth (`sticky top-0`) the narrow pattern misses.

### Sweep 3 — `rg -n 'show-status-strip' app components tests -g '*.ts' -g '*.tsx'`

Twenty-five hits. The question this sweep answers is **which of them assert a POSITION** rather than
the strip's own internals, because only those are in the blast radius.

| site | asserts | disposition |
|---|---|---|
| `tests/e2e/published-review-modal.layout.spec.ts:387` | `band.querySelector('[data-testid="show-status-strip"]')` inside the **band-composition** case, which also asserts `bandFollowsHeader` (the band is the panel child immediately after the header), `bandBorderBottom`, and the band-vs-strip padding split. | **Task 5 retargets it.** After the dock the container is the LAST panel child and its seam is `border-TOP`, so the case becomes footer composition and the border assertion flips axis. This is the one site in the sweep whose ASSERTION changes meaning rather than just its selector — flagged here because a mechanical selector swap would leave it asserting the wrong edge. |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx:868, 888` | strip is within the panel / within the band | Task 3. |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx:551, 906` | strip exists; strip's own className | Untouched — placement-agnostic. |
| `tests/e2e/stackedBandLayout.spec.ts:84` | strip is visible on the shared parity page, then measures the strip's INTERNAL stacked rows at 390x844 | **Untouched.** It locates by testid, not through the band, and every assertion is about the strip's own children. It renders through `tests/e2e/_skeletonParityHarness.tsx`, which mounts the REAL `PublishedReviewModal` and `ShowReviewModalSkeleton`, so Tasks 3 and 4 flow into it automatically. Re-run in Task 4's GREEN step to confirm, rather than assumed. |
| `tests/e2e/statusStripToggleLayout.spec.ts:164, 184, 189, 224` | strip height and the finalize chip's containment, in the STANDALONE `_statusStripToggleHarness` page | Untouched — that harness has no clipping ancestor and no modal panel, so the dock does not reach it. Comments corrected by Task 8. |
| `tests/components/admin/showpage/statusStrip.test.tsx` (12 hits) | the strip's own children, classes and structure | Untouched — jsdom, placement-agnostic. |
| `tests/e2e/popover-clip-fit.spec.ts:136`, `tests/e2e/_statusStripToggleHarness.tsx:143` | the `STRIP` constant; the hand-rolled card replica | Tasks 7 and 8 (comments only). |

## Snippet typecheck declaration

**No implementation or test snippet is embedded in a task body**, deliberately — every task names the
file and the class change rather than pasting code, so there is nothing to typecheck at plan time and
nothing that can drift from the tree between plan and execution. The mandatory pre-draft rule is
therefore satisfied vacuously and the vacuity is declared rather than left to be inferred.

**New test files and their wiring**, since the rule pairs snippet-typecheck with CI wiring:

**One new file: a new `place.ts` warning suite under `tests/lib/popover/`** (Task 6b). It needs no config change — the
vitest default include covers `tests/**`, and `tests/lib/popover/position.test.ts` already runs from
that directory. The placement-module redesign removed the two production modules and the unit test the
draft was going to add, so every OTHER change is an edit to a file that exists.

**No new e2e SPEC FILE is created**, which matters: `tests/e2e/standalone.config.ts:85` gates by an
explicit filename alternation, so a new spec file would run nowhere and pass silently. Every e2e change
is a case added to an already-enrolled file.

**No new e2e SPEC FILE is created.** Every e2e change is a case added to an existing spec already
listed in `tests/e2e/standalone.config.ts:86`'s `testMatch` (`popover-clip-fit`,
`published-review-modal.layout`, `skeletonBandParity`). This matters: that config gates by an explicit
filename alternation, so a NEW spec file would run nowhere and pass silently. Adding cases to enrolled
files sidesteps that entirely, and it is why the plan extends rather than creates.

## Task checklist

1. Task 1 — harness refusal override
2. Task 2 — header bound
3. Task 3 — dock the strip
4. Task 4 — skeleton docks with it
5. Task 5 — panel column equation (layout-dimensions)
6. Task 6 — migrate the banner to the placement module
7. Task 6a — migrate Re-sync's three overlays (forced by round-1 finding 1)
8. Task 6b — restore the dev warning in place.ts (round-2 finding 4)
9. Task 6c — rebuild the replica clip entry (round-2 finding 2)
10. Task 7 — measure and record
11. Task 8 — class sweep
12. Task 9 — transition audit
13. Task 10 — graduate the row (PR's LAST commit, marker removed in it)
14. **Self-review** — re-run all three reconciliation sweeps, the numeric sweep, and `pnpm spec:lint` on the plan
15. **Adversarial review (cross-model)** — Codex, `--stage plan`, to APPROVE, no round budget
16. Execution handoff

## Round discipline carried into execution

- **Fix-round regression budget.** Every repair round re-greps its finding's CLASS across the surface after the patch, re-runs the relevant meta-suite, and records both in the round closure — including over the repair commit's own incidental edits, which is where two of m-wave's sharpest findings sat.
- **Same-vector recurrence.** Three consecutive rounds on one vector triggers comprehensive re-analysis of that vector before the next dispatch; a fourth means the vector is declared unresolved and the structural defense ships in that round's repair commit rather than after another round.
- **Repair direction.** After the placement-module redesign this arc ships NO recognizer of its own — the only decision surface is `computePopoverPlacement`, which it imports and does not modify. If a round proposes widening that module to suit one consumer (a per-call `GAP`, a third side, an alignment mode), the repair is a documented limit on this arc, not a change to a module four surfaces share.

## §12 Close-out

impeccable-gate: `/impeccable critique` AND `/impeccable audit` on the affected diff, both externally attested, findings and dispositions recorded here.
