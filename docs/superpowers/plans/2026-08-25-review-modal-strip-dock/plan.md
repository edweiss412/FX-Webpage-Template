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
$ rg -n 'disposition: "' tests/components/admin/showpage/popoverOverlayRegistry.ts \
    | sed 's/.*disposition: //' | sort | uniq -c
      5 "fit-within-clip",
      2 "placement-module",
```

Round-3 finding 6: the first draft's command kept the line numbers, so `uniq -c` saw seven distinct
lines and printed `1` seven times — it looked mechanical and aggregated nothing. Stripping to the
disposition before sorting is what makes it a count.

| disposition | rows before | rows after | delta | which |
|---|---|---|---|---|
| `placement-module` | 2 | 6 | +4 | HoverHelp body, `share-hub-popover` (unchanged); `published-toggle-popover` (**T2**); `admin-resync-{error,shrink-confirm,success}` (**T2a**) |
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

(a) **Boot — TWO configs, not one, and the first draft's blanket "no server boot" was false
(round-1 finding 1).** This arc touches suites under both:

| suite | config | boot |
|---|---|---|
| `tests/e2e/popover-clip-fit.spec.ts`, `published-review-modal.layout.spec.ts`, `skeletonBandParity.spec.ts`, `stackedBandLayout.spec.ts` | `tests/e2e/standalone.config.ts` | none — entries bundled out-of-process with pinned esbuild, Tailwind compiled from `app/globals.css`, served from a tmp dir by `node:http` (`tests/e2e/popover-clip-fit.spec.ts:56-110`). No webServer, no Supabase. |
| `tests/e2e/published-review-modal.interactions.spec.ts`, `admin-parse-panel.spec.ts`, `published-review-modal.deeplink.spec.ts` | the DEFAULT `playwright.config.ts` | the real app, Supabase and admin authentication. `standalone.config.ts`'s `testMatch` alternation EXCLUDES these files, so running them under it matches nothing and exits 0 — a green that means "no tests ran". |

**Every `red=` below names the config its suite actually runs under.** A red command pointed at the
wrong config is not merely unrunnable; under `standalone.config.ts` it reports SUCCESS, which is the
worst available failure mode for a gate.
(b) **Readiness gate:** `await page.waitForFunction(() => window.__hydrated === true)`, never `networkidle` — the existing contract at `tests/e2e/popover-clip-fit.spec.ts:19`. New cases reuse it. `document.fonts.ready` is awaited first, as every existing case does, because text metrics drive every number this arc asserts.
(c) **Detach safety:** every measurement re-queries its elements INSIDE the `page.evaluate` callback and returns plain numbers; no `locator.evaluate` handle outlives a re-render. The refusal banner mounts and unmounts with React state, so a handle taken before the click would be exactly the hazard. This is the file's existing rule (`tests/e2e/popover-clip-fit.spec.ts:20-21`) and the new cases keep it.

---

## Acceptance-criteria index

Every criterion the tasks reference, with the task discharging it and the axis it is measured on. The
criteria themselves live in the spec's §4 — this is the mapping, not a second copy.

| criterion | axis (spec §4) | discharged by |
|---|---|---|
| AC-1 | STRUCTURAL | T5 |
| AC-2 | MODES ∪ REAL | T5 |
| AC-3 | REAL | T5 |
| AC-4 | REAL | T5 |
| AC-5 | REAL | T5 |
| AC-6 | STRUCTURAL | T5 |
| AC-7 | REAL (375x667 x load 30) | T5 |
| AC-8 | REPLICA 1-4 | T2 |
| AC-9 | REPLICA 1 and 3 | T2 |
| AC-10 | STRUCTURAL | T3 |
| AC-11 | DEGENERATE | T2 |
| AC-12 | STRUCTURAL | T6 |
| AC-13 | STRUCTURAL | T7 |
| AC-14 | REAL | T4 |
| AC-15 | REAL | T5 |
| AC-16 | STRUCTURAL | T4, T5 (asserted by NOT editing the shell) |
| AC-17 | REAL (load-30 cells) | T4 |
| AC-18 | STRUCTURAL | T4 |
| AC-19 | REAL | T2a, T5 |
| AC-20 | REPLICA 1-4 ∪ DEGENERATE | T1, T2 |

## Task boundaries — why there are eight tasks and not thirteen

**Round-1 findings 4 and 5 were one finding about boundaries; round-2 finding 1 was a third instance of it.** The first draft had thirteen tasks and
three of them left the tree RED at their own commit: docking the strip broke the skeleton parity, the
layout equation and Re-sync's overlays, each repaired by a LATER task. The plan said so in its own
prose, which is the tell. Invariant 1 requires every task to end green, and three separate REDs
pending across commits is not a TDD sequence — it is one change split at the wrong seams.

**Three** seams were wrong and all three are fixed by MERGING rather than reordering:

- **The dock is one change.** Moving the strip invalidates the skeleton's mirror, the column equation
  and every placement assertion in the same instant. T5 carries all of it: dock, skeleton, equation,
  measurement. A bigger commit, and the only one that ends green.
- **The migration is one change.** The overlays, the replica that proves their branches, and the
  behavioural assertions land together as T2. Splitting the fixture from the code it exercises is what
  made the first draft's replica task cite a test-local fixture as its own defect — the invalid RED
  shape `docs/agents/writing-plans.md` rejects.
- **The transition audit is not a task.** Its subject — a placed side attribute on one node — is
  CREATED by T2, so a separate task's case passes when authored (round-2 finding 1) or leaves the tree
  red if authored first. It lands inside T2, with the rule's purpose served and the deviation stated.

### The structural defense for the task-boundary class (fourth occurrence)

Round 3's finding 2 says it plainly: task boundaries leaving the tree red is now the **fourth**
occurrence across three rounds, and the previous three repairs were all the same move — find the
suites a task breaks, list them, fix them in that task. Round 1 listed some. Round 2 listed more.
Round 3 found three more `SUBHEADER` uses in one file (`tests/e2e/published-review-modal.interactions.spec.ts:825`, `tests/e2e/published-review-modal.interactions.spec.ts:1102`, `tests/e2e/published-review-modal.interactions.spec.ts:1143`) that all three lists
had missed. **A per-task file list is the wrong instrument**, for the same reason §9's transcript was:
it is a hand-maintained enumeration of something a command can derive.

**The defense, and it replaces every per-task list as the GREEN criterion:**

> **A task is GREEN when the whole tree is green, not when its own red command passes.** Every task's
> GREEN step runs these FOUR commands, and every one must pass. The task's `red=` selects the ONE
> command that must have been observed failing first; it is a red criterion, never the green one.
>
> ```
> pnpm typecheck
> pnpm heavy pnpm test
> pnpm heavy node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
>   tests/e2e/popover-clip-fit.spec.ts tests/e2e/published-review-modal.layout.spec.ts \
>   tests/e2e/skeletonBandParity.spec.ts tests/e2e/stackedBandLayout.spec.ts \
>   tests/e2e/statusStripToggleLayout.spec.ts
> pnpm heavy node_modules/.bin/playwright test \
>   tests/e2e/published-review-modal.interactions.spec.ts tests/e2e/admin-parse-panel.spec.ts \
>   tests/e2e/published-review-modal.deeplink.spec.ts tests/e2e/attention-modal-gallery.spec.ts \
>   tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/attention-pill-focus.spec.ts
> ```

**The e2e suites are ENUMERATED ONCE for the whole arc, not derived per task, and round-4 finding 2 is
why.** "Every suite the task's files appear in" is not a runnable instruction: the two configs use
explicit allow-lists, and a default-config suite exercises the real app **without importing the changed
component at all**, so no source-reference search can find it. A derivation that cannot see its own
inputs is worse than an enumeration, because it reads as complete. This list is fixed for the arc, every
task runs all of it, and adding a suite is a reviewed edit in one place.

The last two are heavy phases (non-interactive playwright), hence `pnpm heavy` per the semaphore rule.
The default-config run needs the app and Supabase; preflight confirmed the local stack.

Three consequences worth stating so this is not read as boilerplate:

1. **A file list can now only be wrong in the cheap direction.** Listing too few files no longer ships a
   red tree — the full run catches it before the commit. The lists that remain in each task are
   navigation aids for the implementer, explicitly NOT the completeness claim they were being read as.
2. **It costs wall clock, and that is the trade.** A full suite plus e2e per task is minutes, against a
   round per missed dependant — and this arc has spent four.
3. **It subsumes the ordering argument.** The migration-before-dock constraint below stays because it is
   still the cheapest order, but if it were violated the full run would fail at that commit rather than
   two commits later.

**The migration precedes the dock.** `T-OVERLAY` reads the band with a non-null assertion
(`document.querySelector(SUBHEADER)!`, `tests/e2e/published-review-modal.interactions.spec.ts:685-691`),
so docking first throws inside `page.evaluate` and the suite is red. Migrating first is harmless: the
overlays anchor to the band, the module picks `bottom` there, and `T-OVERLAY` is retargeted ONCE.

<!-- tasks: depth=2 red-contract -->

## T1 — the placement stack signals an unsatisfiable geometry

<!-- task: red=`pnpm vitest run tests/lib/popover/` red-state=authored red-target=`lib/popover/place.ts:33` why=`placeWithinVisibleViewport returns hidden or a maxHeight and emits nothing; the isFloorClamped warning that closes the convergence bound belongs to useFitWithinClip, which T2 makes these four overlays stop consuming` ac=AC-20 -->

**Files:** `lib/popover/place.ts`, NEW `tests/lib/popover/` warning suite.

Spec §3.2b. `PlaceInput` gains `warnKey?: object`; the caller passes the element it holds. Fires on
`kind === "hidden"` and on `maxHeight !== null && maxHeight < MIN_FITTED_HEIGHT` (imported from
`lib/layout/fitWithinClip.ts:51`, never redeclared). Dev-only, `debug` level, `WeakSet`-keyed.

**Why `place.ts` and not `position.ts`:** `position.ts` opens "pure placement algebra" and stays pure.
`place.ts` is already impure — its signature is `placeWithinVisibleViewport(win: Window, input)` and it
composes `lib/popover/viewport.ts`'s engine gate. Verified, not assumed.

**Anti-tautology — five assertions, because one proves nothing.** A test that only asserts the warning
FIRES passes against a warning that always fires. Asserted: (a) fires on `hidden`; (b) fires on a
sub-floor cap; (c) SILENT on a plain placement; (d) SILENT at the exact boundary
`maxHeight === MIN_FITTED_HEIGHT`, since the floor is where the box is still usable; (e) the `warnKey`
contract in all three of its states — same key warns once, different keys warn twice, no key warns
every time.

**Ends green:** nothing consumes the field yet, so no other suite moves.

## T2 — migrate the refusal banner to the placement stack

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` red-state=authored red-target=`components/admin/PublishedToggle.tsx:61` why=`POPOVER_POSITION is absolute inset-x-0 top-full: the banner is a CSS-anchored child of its ancestor, never portaled and never placed, so it carries no data-popover-side and its box is not bounded by the host rect` ac=AC-8,AC-9,AC-11,AC-20 -->

**Scope: the BANNER only. Re-sync's three overlays are T2a** — round-3 finding 3: the replica entry
mounts only `PublishedToggle`, so a red expressed through it is satisfied by migrating the banner
while all three Re-sync overlays keep their old implementation. One task cannot hold two migrations
when only one of them has a red. Splitting is safe: migrating the banner alone leaves Re-sync anchored
in the band and working, so this task ends green on its own.

**Files:** `components/admin/PublishedToggle.tsx`, `components/admin/ReSyncButton.tsx`,
`components/admin/showpage/StatusStrip.tsx`, `tests/components/admin/showpage/popoverOverlayRegistry.ts`,
`tests/e2e/_publishedToggleClipLiveEntry.tsx`, `tests/components/ReSyncButton.test.tsx`,
`tests/e2e/popover-clip-fit.spec.ts`, `tests/components/admin/PublishedToggle.test.tsx`.

**The RED is BEHAVIOURAL, not the registry meta-test (round-1 finding 3).** The first draft's red was
`_metaPopoverPlacementContract`, which checks only that the file contains an import matching
`from "@/lib/popover/position"` — satisfiable by an UNUSED import plus a registry row, with no portal,
no host, no trigger, no measurement, no cap and no degenerate handling. The red is now the rebuilt
replica's cases asserting `data-popover-side` and the placed geometry. The meta-test still runs, as a
SECONDARY gate in the same commit; it is a good structural guard and a worthless red.

**The migration** (spec §3.2, §3.2a): portal into the panel via `PopoverHostContext`
(`components/admin/HoverHelp.tsx:77`), place with `placeWithinVisibleViewport` inside
`withNaturalSize`, coalesced by `createRafCoalescer`. `preferredSide: "bottom"`, `align: "left"`,
`w-full` for the width, `max-h-[min(50vh,20rem)]` as the declared cap on the banner (Re-sync keeps its
existing one). No caret. Pass the overlay element as `warnKey`.

**The trigger needs a mechanism the spec names but does not supply.** Neither consumer can reach the
strip root: `PublishedToggle` is a grandchild, and `ReSyncButton`'s root is a FRAGMENT with no box
(`components/admin/ReSyncButton.tsx:50-55`). CSS resolved this by walking to the nearest positioned
ancestor; the placement module takes a RECT, so someone must hand it one. **`StatusStrip` holds a ref
on its own root and passes it to both children as a prop.** Rejected: querying
`[data-testid="show-status-strip"]` from inside the child — `tests/e2e/_skeletonParityHarness.tsx`
mounts the skeleton and the loaded modal on ONE page with the same test ids, scoped by `data-parity`,
so a global query there resolves to whichever came first.

**The replica is rebuilt in this commit** (spec §3.6): a `PopoverHostContext.Provider` on the replica
panel, a strip-shaped trigger, and four geometries derived from the algebra's branches
(`lib/popover/position.ts:126`, `lib/popover/position.ts:127`, `lib/popover/position.ts:128-131`, plus the sub-floor variant). It ships WITH the
migration because a fixture split from the code it exercises has no valid red of its own — which is
exactly what round-1 finding 5 caught in the first draft.

**Ends green:** the banner still anchors within the band, the module picks `bottom` there, and the
full-tree GREEN criterion above is what proves nothing else moved.

**Ends green:** the banner still anchors within the band, the module picks `bottom` there, and the
full-tree GREEN criterion above is what proves nothing else moved.

**The transition-audit obligation lands HERE, not in a task of its own (round-2 finding 1).**
`docs/agents/writing-plans.md` mandates a transition-audit TASK for any component with a Transition
Inventory. A separate task cannot have a valid red for this one: the subject it would assert —
`data-popover-side` on one placed node — is created by THIS task, so a source-scan case authored
afterwards passes the moment it is written, and authored beforehand leaves the tree red across a
commit boundary. Both are rejected shapes. The rule's PURPOSE is that the inventory gets asserted;
asserting it inside the task that creates the states serves that purpose, and a task whose red cannot
fire does not. Stated rather than quietly dropped.

Spec §6's inventory, every pair and every compound, asserted in this commit:

| pair | assertion |
|---|---|
| A ↔ B | instant BY DESIGN — the banner node carries no `transition-`, no `animate-`, no `AnimatePresence` |
| A ↔ C | same; only the placed coordinates differ |
| B ↔ C | exactly ONE `data-popover-side` on one node; no render path produces two banner elements |

| compound | assertion |
|---|---|
| side changes mid-resize | a resize burst produces ONE `applyPlacement` per frame (`createRafCoalescer`) |
| banner present during the panel's entrance transform | **the compound is EXERCISED, not inspected** (round-3 finding 5): open the modal with a refusal already pending so the banner mounts during the entrance, then assert the settled placement equals the placement measured after `transitionend`. Asserting a listener exists proves wiring, not behaviour. |
| banner present while the freshness flash animates | **DOCUMENTED LIMIT, not an assertion** (round-3 finding 5). The claim is that the flash mutates no property the placement reads; proving it needs a placement-count probe across an animation whose own duration is the thing being raced, and a flaky compound test is worse than a stated limit. The flash animates `background`/`color` on the band div, neither of which enters `getBoundingClientRect`. Re-file trigger: a placement observed moving during a flash. |
| banner present while the AttentionMenu opens | **NEW test, written here.** Round-3 finding 5 is right that the existing mutual-exclusion block tests AttentionMenu against ShareHub and never the banner, so citing it was citing coverage that does not exist. The new case drives a refusal, opens the menu, and asserts the banner is dismissed — the same contract, for the pair that was never covered. |
| banner present while a Re-sync overlay is open | both placed by the same module against the same host; `z-overlay` vs `z-banner` unchanged and the module writes no z-index. Asserted with BOTH open. |
| banner mounts on the first frame after the modal opens | **a DEGENERATE measurement is intercepted and the banner is left unpositioned and VISIBLE** — round-2 finding 7: the first draft's row said `visibility: hidden`, inverting AC-11 in the one place an implementer reads it as an obligation. `visibility: hidden` is reserved for a real `kind: "hidden"`. |

**The inventory assertions are WRITTEN INTO `tests/components/admin/transitionAudit.test.tsx`**, which
is therefore CHANGED by this task and is in the spec's exact changed set. Round-3 finding 4: the first
draft said that file "remains unchanged", which contradicted the set and would have failed T7's
bidirectional gate. What stays unchanged is the EXISTING case —
`components/admin/PublishedToggle.tsx` remains in `SERVER_RENDERED`
(`tests/components/admin/transitionAudit.test.tsx:45`), the regression pin against this migration
smuggling in motion — and that case is green throughout and is not this task's red.



## T2a — migrate Re-sync's three overlays

<!-- task: red=`node_modules/.bin/playwright test tests/e2e/published-review-modal.interactions.spec.ts -g "T-OVERLAY"` red-state=authored red-target=`components/admin/ReSyncButton.tsx:73` why=`OVERLAY_PANEL is absolute inset-x-0 top-full and the component root is a fragment, so the three panels are CSS-anchored to the band: they carry no data-popover-side, are not portaled into the host, and abut the band rather than sitting GAP away from the trigger` ac=AC-19 -->

**The red is the DEFAULT-config `T-OVERLAY`, not the unit suite — round-4 finding 3.** The obvious red
was rewriting `OVERLAY_TOKENS` (`tests/components/ReSyncButton.test.tsx:284`) to the migrated set. That
is exactly the escape this plan already rejected for T2: changing a shared class constant and its
expected token list turns the command green while all three overlays stay on `useFitWithinClip`, with
no portal, no host, no placement call and no side result. A token list observes a string, not a
behaviour.

`T-OVERLAY` retargeted DOES observe the behaviour: `data-popover-side` present, the panel portaled into
the host rather than a descendant of the strip, and its top edge `GAP` from the trigger rather than
abutting. None of that can pass while the component still resolves its containing block by walking up.
The unit suite's token list is updated in the same commit as a secondary structural assertion — a good
pin and a worthless red, exactly as the registry meta-test was for T2.

**`tests/components/ReSyncButton.test.tsx:284`** asserts `OVERLAY_TOKENS = ["absolute", "inset-x-0",
"top-full", "z-overlay", "overflow-y-auto"]`. `top-full` and `inset-x-0` go; `absolute`, `z-overlay`
and `overflow-y-auto` stay. Updated here, in the commit that changes them — round-1 finding 8.

**`tests/e2e/published-review-modal.interactions.spec.ts` has SEVEN `SUBHEADER` uses, not two**
(round-3 finding 2, probed): the constant at `tests/e2e/published-review-modal.interactions.spec.ts:627`, then `tests/e2e/published-review-modal.interactions.spec.ts:667`, `tests/e2e/published-review-modal.interactions.spec.ts:691`, `tests/e2e/published-review-modal.interactions.spec.ts:728`, `tests/e2e/published-review-modal.interactions.spec.ts:825`, `tests/e2e/published-review-modal.interactions.spec.ts:1102` and
`tests/e2e/published-review-modal.interactions.spec.ts:1143`. `T-OVERLAY` and `T-OVERLAY-BOUNDS` are two of them; `tests/e2e/published-review-modal.interactions.spec.ts:825` is a geometry read and `tests/e2e/published-review-modal.interactions.spec.ts:1102` /
`tests/e2e/published-review-modal.interactions.spec.ts:1143` are further band-scoped evaluates, one of which searches the band's DESCENDANTS for focus order
— so a portaled overlay vanishes from that query the instant this task lands, before the band is even
removed. All seven are retargeted in this commit, under the DEFAULT config.

That this is the third list to be incomplete is the argument for the full-tree GREEN criterion above,
not for a fourth list. Their abut becomes the module's
`GAP`, imported rather than retyped; `LONG_DETAIL`'s docblock (`tests/e2e/published-review-modal.interactions.spec.ts:629-635`) states a width figure and a
measured line count for the old band width, both retargeted.


Three overlays, three placement effects, not one shared effect with a switch: `fitErrorRef`,
`fitShrinkRef` and `fitSuccessRef` (`components/admin/ReSyncButton.tsx:111-113`) are independent nodes,
and a single ref would silently place whichever mounted last. `max-h-[min(50vh,20rem)]` stays as the
declared cap; colours and per-overlay layout classes are untouched, which is what keeps `DESIGN.md`
§1.2a out of this diff.

`ReSyncButtonProps` gains the same optional anchor ref `PublishedToggle` takes, passed by `StatusStrip`
from its own root — one mechanism for both consumers, not two.

**Ends green** by the full-tree criterion, which is what covers the default-config interaction suite
this task retargets.

## T3 — the refusal driver, and the transition inventory it makes assertable

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` red-state=authored red-target=`tests/e2e/_publishedReviewModalHarness.tsx:375` why=`modalElement hardcodes setPublished: NOOP_OK, so a click on the real modal's switch resolves ok, calls router.refresh, and no banner ever mounts` ac=AC-10 -->

**Files:** `tests/e2e/_publishedReviewModalHarness.tsx`, `tests/e2e/_pillFocusLiveEntry.tsx`,
`tests/e2e/popover-clip-fit.spec.ts`.

`HarnessStateOverrides` gains `setPublished?: PublishedReviewModalProps["setPublished"]` (the exported
type at `components/admin/showpage/PublishedReviewModal.tsx:96`, imported rather than re-declared);
`modalElement` resolves `state.setPublished ?? NOOP_OK`. `_pillFocusLiveEntry` gains
`refusalCode: string | null` and `window.__setRefusal`, passing the override only when non-null.

**Byte-identical default (AC-10).** All three consumers of that entry re-run unchanged in this
commit's GREEN step, enumerated from `rg -ln '_pillFocusLiveEntry' tests/`:
`tests/e2e/attention-pill-focus.spec.ts`, `tests/e2e/popover-clip-fit.spec.ts`, and
`tests/components/admin/sheetIconLinkContainment.test.ts` — the last is a vitest consumer, easy to
miss when thinking of the entry as e2e-only.


**Anti-tautology.** The case asserts a DISTINCTIVE substring of `FINALIZE_OWNED_SHOW`'s catalog copy —
"busy with a setup-wizard publish" (`lib/messages/catalog.ts:2279-2280`) — not that the copy is
non-empty (passes against a stub) and not equality (breaks on any catalog edit, making a copy change
look like a placement regression). Four mutants run and recorded: override emptied; copy plus a
suffix; the copy present but behind `showFinalize` instead of `showError`; and the code varied to
`PUBLISH_BLOCKED_PENDING_REVIEW`, whose copy shares no such phrase — so an assertion tracking "any
warning text" survives that mutant and this one does not.

## T4 — bound the header so the dock can hold

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:952` why=`the action cluster is flex shrink-0 with no max-width, so at 30 attention items it reaches ~262px of a 335px header, starves the min-w-0 flex-1 title column, and the header grows to 560.97px inside a 567px panel` ac=AC-14,AC-15,AC-16,AC-17,AC-18 -->

**Files:** `components/admin/showpage/PublishedReviewModal.tsx`, `tests/e2e/popover-clip-fit.spec.ts`.

**The sweep is over THE REAL AXIS, all twelve cells — not one (round-1 finding 7).** For each of
375x667, 375x844, 390x560 and 390x844 crossed with loads 0, 2 and 30: the header's height equals its
0-load height AT THAT VIEWPORT within 0.5px, and the strip's and the switch's rects lie inside the
panel. The 0-load baseline is per-viewport because header height is width-dependent. Today the
375x667 x load-30 cell measures `560.97` against a `164.19` baseline.

**GREEN** — spec §3.0's three parts:
1. `components/admin/showpage/PublishedReviewModal.tsx:952` → `flex shrink-0 items-center gap-2 max-sm:max-w-[10rem]`.
2. The pill's `relative` wrapper (`components/admin/showpage/PublishedReviewModal.tsx:966`) gains `min-w-0` — round-1 finding 5 of the SPEC round: it is
   a direct flex item defaulting to `min-width: auto`, and `items-center` transfers no width cap.
3. The pill button's `className` (`components/admin/showpage/PublishedReviewModal.tsx:976`) gains `min-w-0 max-sm:flex-wrap max-sm:justify-end`; the
   `h2`'s inner span (`components/admin/showpage/PublishedReviewModal.tsx:913`) gains `max-sm:line-clamp-2`.

`max-sm:max-w-[10rem]` is the spelling AC-18 names; `10rem` is `160px`, swept in spec §3.0 across eight
cap values and three loads.

**AC-18 requires EXACTLY ONE occurrence of that token, and round-4 finding 5 is right that nothing
inspected it.** The browser assertions measure geometry and the emitted `line-clamp`; neither can tell
`max-sm:max-w-[10rem]` from a second copy of the cap somewhere else, which is the drift AC-18 exists to
prevent. A source-scan case asserts the token occurs exactly once across `components/`, and that the
occurrence is on the action cluster element. A probe today finds it only in this plan and the spec — no
test contract at all. **`line-clamp-2` has no existing usage in this repo**, so the task asserts
the EMITTED style (`getComputedStyle(span).webkitLineClamp === "2"`), not the class string — an
un-emitted utility is a silent no-op, which is the failure class this whole arc exists to remove.

**Premise, on each case's own inputs.** `premiseHolds` (`tests/_shared/premise.ts:36`) asserts the
load-30 pill actually rendered both segments — `textContent` matching `/\d+ issues/` AND
`/\d+ monitoring/`. Measured, the pill reads `20 issues · 10 monitoring`: `_pillFocusLiveEntry` builds
`a` as actionable and `n` as `needs_look`, and `needsYou` is their union, so 10+10 = 20 issues against
10 monitoring. Without the premise the load-30 case passes trivially if the harness silently rendered a
smaller pill.

**AC-17 in full, which the first draft only part-covered (round-2 finding 4).** At each of the four
load-30 cells, five assertions, because AC-17 makes five claims:
1. every segment present in the pill's `textContent` — `20 issues`, the middot, `10 monitoring`;
2. no segment carries `display: none`;
3. no ellipsis — `pill.scrollWidth <= pill.clientWidth + 0.5`;
4. **geometric containment, which no text assertion can establish**: the pill's rect AND its `relative`
   wrapper's rect both lie within the capped cluster's rect, and the pill's rect does not intersect the
   title block's rect;
5. the dialog's accessible name still contains the COMPLETE title despite `max-sm:line-clamp-2` — read
   via the `aria-labelledby` target's `textContent`, since `line-clamp` is visual only and a clamp that
   truncated the a11y tree would be a silent regression this arc introduced.

**AC-16 in the same commit:** `components/admin/review/ReviewModalShell.tsx` is not edited, and
`tests/components/admin/review/reviewModalShell.test.tsx` passes untouched. A change needed there would
mean this task restructured the shell, which the §0 ruling forbids.

## T5 — dock the strip, and everything the dock invalidates

<!-- task: red=`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/published-review-modal.layout.spec.ts` red-state=authored red-target=`components/admin/showpage/PublishedReviewModal.tsx:1119` why=`the modal passes the strip in the subHeader prop and passes no footer prop at all, so the shell renders no footer element and the panel column has a subheader term where the docked column will have a footer one` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-15,AC-16,AC-19 -->

**This is deliberately the arc's biggest commit, and round-1 finding 4 is why.** Moving the strip
invalidates the skeleton's mirror, the column equation, the band-composition case and every
band-scoped locator IN THE SAME INSTANT. Splitting them leaves the tree red across commits.

**Files:** `components/admin/showpage/PublishedReviewModal.tsx`,
`components/admin/showpage/ShowReviewModalSkeleton.tsx`, `components/admin/showpage/StatusStrip.tsx`
(docblock), `tests/e2e/published-review-modal.layout.spec.ts`, `tests/e2e/skeletonBandParity.spec.ts`,
`tests/e2e/stackedBandLayout.spec.ts`, `tests/e2e/admin-parse-panel.spec.ts`,
`tests/e2e/published-review-modal.deeplink.spec.ts`, `tests/e2e/attention-modal-gallery.spec.ts`,
`tests/e2e/step3-review-modal.layout.spec.ts`, `tests/e2e/_shareLinkFlashLiveEntry.tsx`,
`tests/e2e/_skeletonParityHarness.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`,
`tests/components/admin/showpage/statusStrip.test.tsx`, `tests/e2e/popover-clip-fit.spec.ts`,
`lib/layout/fitWithinClip.ts`.

**`tests/components/admin/showpage/statusStrip.test.tsx` is claimed here** (round-2 finding 6's other
direction: the spec's set required it and no task mentioned it). Its comment at `tests/components/admin/showpage/statusStrip.test.tsx:603` explains the
strip carries no chrome because "the band owns it" — the reason survives, the container's name changes.
`PAGE_ONLY_CHROME` (`tests/components/admin/showpage/statusStrip.test.tsx:612-622`) is unchanged and still correct: the strip must carry no `sticky`,
`top-0`, `z-30`, `border-b`, `bg-surface` or padding of its own, and the footer supplies those exactly
as the band did.

**The dock.** `PublishedReviewModal` stops passing `subHeader` (`components/admin/showpage/PublishedReviewModal.tsx:1119`) and passes `footer`; the whole
fragment moves verbatim, and the freshness band div (`components/admin/showpage/PublishedReviewModal.tsx:1142`) gains `w-full` because its new parent is
`flex flex-wrap items-center`. `ShowReviewModalSkeleton:113-165` moves the same way. The shell is not
edited.

**The layout-dimensions assertions (mandatory shape).** Real-browser `getBoundingClientRect()` on every
documented `data-testid` in the fixed-dimension parent; jsdom computes no layout and is not used. The
panel is a fixed-height flex column (`max-h-[85vh]`, `sm:max-h-[80vh]`) with flex children, and **this
repo's Tailwind v4 does not default `.flex` to `align-items: stretch`**. Spec §5's Dimensional
Invariants list is the body of this task — **all thirteen rows, not the seven the first draft carried
(round-1 finding 6)**: panel→grab, panel→header, panel→body, panel→footer, footer→band div, band
div→strip root, strip root→trailing control, body→content pane, panel→each migrated overlay,
header→text block, text block→h2 span, cluster→pill wrapper, pill wrapper→pill button.

**Each of the thirteen rows gets a CONCRETE assertion, because enumerating them is not asserting them
(round-2 finding 5).** All measured in one `page.evaluate` per cell, from rects, with the expected
value derived rather than typed:

| # | relation | assertion |
|---|---|---|
| 1 | panel → grab | **mode-conditional, because `sm:hidden` makes the whole rect 0x0 rather than a zero-height full-width strip** (round-3 finding 1: the first draft demanded full width AND zero height in the same breath, which no implementation can satisfy at 1280x900). Sheet: `grab.width === panel.clientWidth ± 0.5` and `grab.height === 44 ± 0.5`. `≥sm`: `grab.width === 0` and `grab.height === 0`, and `getComputedStyle(grab).display === "none"` so the zero is the class doing its job rather than a missing element |
| 2 | panel → header | `header.width === panel.clientWidth ± 0.5` |
| 3 | panel → body | `body.height === panel.clientHeight - (grab + header + footer) ± 0.5`, and `> 0` |
| 4 | panel → footer | `footer.width === panel.clientWidth ± 0.5` AND `footer.bottom === panel.bottom ± 0.5` |
| 5 | footer → band div | `band.width === footer content-box width ± 0.5` |
| 6 | band div → strip root | `strip.width === band.width ± 0.5` |
| 7 | strip root → trailing control | the `ml-auto` control's `right === strip.right ± 1` (the existing T-HUB-FLUSH relation, re-anchored to the footer) |
| 8 | body → content pane | `pane.height === body.height ± 0.5`, `getComputedStyle(pane).overflowY` matches `auto\|scroll`, and `pane.scrollHeight > pane.clientHeight` at load 30 so "scrolls" is not vacuous |
| 9 | panel → each migrated overlay | AC-19's width/left relation, all four overlays |
| 10 | header → text block | `textBlock.width === header content width - cluster.width - gap ± 0.5` |
| 11 | text block → h2 span | `getComputedStyle(span).webkitLineClamp === "2"` below `sm`, and the rendered line count ≤ 2 |
| 12 | cluster → pill wrapper | `wrapper.right <= cluster.right + 0.5` AND `wrapper.left >= cluster.left - 0.5` |
| 13 | pill wrapper → pill button | `pill.right <= wrapper.right + 0.5` AND `pill.left >= wrapper.left - 0.5` |

Rows 7, 8, 10, 12 and 13 are the ones the first draft listed and never defined. Every expected value is
computed from another measured rect or an imported constant; none is a literal.

**The testid enumeration, from the source rather than from memory**
(`grep -n 'data-testid={\`\${testIdBase}-' components/admin/review/ReviewModalShell.tsx`): `-modal`
(`components/admin/review/ReviewModalShell.tsx:584`) and `-backdrop` (`components/admin/review/ReviewModalShell.tsx:598`) are the overlay wrapper and the scrim, both OUTSIDE the panel and out
of scope; `-grab` (`components/admin/review/ReviewModalShell.tsx:652`), `-header` (`components/admin/review/ReviewModalShell.tsx:671`) and `-footer` (`components/admin/review/ReviewModalShell.tsx:726`) are asserted; `-subheader`
(`components/admin/review/ReviewModalShell.tsx:699`) is asserted ABSENT. An element that must not exist is part of the enumeration, not an omission
from it.

**Equation:** sheet `grab + header + main + footer === panel.clientHeight`; `≥sm` the same without the
grab term. Within 0.5px, at the layout suite's existing `MODES` (375x812, 1280x900 — preserved so this
arc does not narrow that suite) AND at all twelve REAL cells. The body's height is asserted `> 0`,
which is the assertion that would have caught today's load-30 state where `main` measures exactly `0`.

**The band-composition case** (`tests/e2e/published-review-modal.layout.spec.ts:377-400`) asserts
`bandFollowsHeader` and `bandBorderBottom`. It becomes footer composition: the footer is the LAST panel
child and its seam is `border-TOP`. **The border assertion flips axis** — a mechanical selector swap
would leave it asserting the wrong edge.

**AC-5 over ALL TWELVE REAL cells, not one (round-2 finding 3).** The first draft measured the refusal
only at AC-7's single cell and the AC index claimed T5 owned AC-5 anyway — an instrument narrower than
the criterion it was mapped to. At each of the twelve cells: drive the refusal via `__setRefusal` plus
a click, then assert `data-popover-side="top"`, the banner's rect entirely inside the panel, and its
bottom `GAP` above the trigger's top within 0.5px. Twelve page boots; the load must be set explicitly
at each because it moves the header, which moves the footer, which moves the trigger.

**AC-19 over the same twelve, and over ALL FOUR overlays (round-2 finding 5).** The first draft
demonstrated the width relation for the refusal banner in one cell. AC-19 is a claim about every
migrated overlay: each one's rendered width equals `bounds.width` and its left edge equals
`bounds.left`, both within 0.5px, derived from the measured host rect and the imported
`VIEWPORT_INSET`. Re-sync's three are opened by stubbing `/api/admin/sync` to each of its three result
branches, the mechanism `tests/e2e/published-review-modal.interactions.spec.ts` already uses.

**The measurement (AC-7), which belongs here because here is where it is red.** Replaces
`tests/e2e/popover-clip-fit.spec.ts:754-789`, KEEPING its structural-premise assertion and adding the
numbers. Measured in the module's own terms — `spaceBelow = max(0, bounds.bottom - trigger.bottom - GAP)`,
`spaceAbove = max(0, trigger.top - bounds.top - GAP)` (`lib/popover/position.ts:114-115`), with `GAP`
and `VIEWPORT_INSET` imported, never retyped. Asserts `spaceBelow` under the banner's natural height
and `spaceAbove` above it, `data-popover-side="top"`, containment, and the width equal to
`bounds.width` (AC-19). **Pre-dock these assertions are red** — the strip sits mid-panel with room
below, so the module picks `bottom` — which is what makes them a valid red here and would have made
them vacuous in a later task.

**AC-7's registry tail gets an instrument (round-4 finding 5).** AC-7 requires the two measured room
values to appear in the migrated registry row's `reason`; T5 measured them and nothing asserted where
they landed, and the registry meta-test checks only disposition imports and non-empty reasons. A
`tests/components/admin/showpage/` case now asserts the `published-toggle-popover` row's `reason`
contains both numbers as literals. Deliberately a STRING assertion on a hand-written field: the value
of that row is that a human reading the registry sees the measurement, so what is asserted is that a
human would.

**`lib/layout/fitWithinClip.ts:38-43`**: the PublishedToggle entry is RETIRED, not filled in — the
anchor has left the set that docblock describes. One line naming the migration and where the
measurement lives. The arc's only fenced-file edit.

**The three files round-1 finding 8 found undispositioned**, all band-scoped and all repaired here:
`tests/e2e/admin-parse-panel.spec.ts:278` locates the strip through the band's test id;
`tests/e2e/published-review-modal.deeplink.spec.ts:207` names "the always-visible status band" for
`#share-access` — a claim the dock makes STRONGER, since a docked strip is visible without scrolling;
`tests/e2e/step3-review-modal.layout.spec.ts:301` says the published modal has no footer, and is the
site spec §9's discovery command provably cannot reach.

**AC-6 here:** `document.querySelector("#share-access")` is the strip root and is inside the footer.

## T6 — the stale-anchor class sweep

<!-- task: red=`! grep -rniE "sticky[[:space:]]+(status[[:space:]]?)?strip|sticky[[:space:]]+StatusStrip|strip.s .sticky top-0|positioned ancestor .{0,2}sticky" app components tests lib` red-state=live why=`eight live sites assert the StatusStrip is sticky or is the banner's positioned ancestor; both halves are false today and stay false after the dock` ac=AC-12 -->

**A LIVE red, RUN at plan time, and NEGATED.** A grep that finds matches exits 0, so the un-negated
form reported green while the defect was present — `--exec-red` caught that as `RED_ALREADY_GREEN`.
`grep -rniE`, not `rg`: the probe shell has no `rg` and returned exit 127.

Current output, **six lines** (round-1 finding 9: the first draft called this seven and the count was
wrong — `tests/e2e/popover-clip-fit.spec.ts:135` reads "The strip is the banner's positioned ancestor
(`sticky` ⇒ positioned)", which this pattern does not match):

```
components/admin/PublishedToggle.tsx:52
components/admin/PublishedToggle.tsx:67
tests/components/admin/PublishedToggle.test.tsx:485
tests/components/admin/showpage/popoverOverlayRegistry.ts:110
tests/e2e/_statusStripToggleHarness.tsx:104
tests/e2e/popover-clip-fit.spec.ts:135
tests/e2e/statusStripToggleLayout.spec.ts:18
tests/e2e/statusStripToggleLayout.spec.ts:160
```

**Two legitimate survivors are deliberately OUTSIDE the pattern**, because no regex can tell them from
the class: `components/agenda/AgendaPdfViewer.tsx:161` is a genuinely sticky element in an unrelated
component, and `tests/components/admin/showpage/publishedReviewModal.test.tsx:898` is a NEGATIVE
assertion ("the strip carries no ... sticky pin") that is correct and must stay. A wider pattern
catches both and can never go green. This is the enumeration-with-triage spec §2.3 already declared,
and it is why this red is scoped to strings rather than to the word.

**`tests/e2e/statusStripToggleLayout.spec.ts` is edited here and is now IN the spec's exact changed
set** (round-2 finding 6: the task edited a path the set omitted, so T7's bidirectional comparison
would have failed on a real edit). Its two comments describe the strip as sticky; its assertions are
about the finalize CHIP staying in flow in a standalone harness with no clipping ancestor, and are
unchanged — verify green, do not adjust.

Also here: `tests/e2e/_statusStripToggleHarness.tsx:170-179`'s `errorProbeHtml` comment, stating it
replicates WIDTH geometry only. **Dated `docs/superpowers/**/2026-07-17-casp2-*.md` records are
deliberately unchanged** — a dated record states what was true when written.

## T7 — graduate the row

<!-- task: red=`grep -A40 'BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED' BACKLOG-archive.md | grep -qE 'spaceAbove|room above'` red-state=live why=`the row is still in the open ledger, so the archive contains neither the identifier nor the measured room value and the pipeline exits 1` ac=AC-13 -->

**It has a real RED and stays INSIDE the region (round-2 finding 2).** The first draft exempted this
task as "docs, so guard-green is its contract", and that was wrong: invariant 1 says EVERY task is
failing test → minimal implementation → passing test, and closing a lint region does not amend an
invariant. The exemption was also unnecessary, which is the embarrassing part — the assertion was
there all along. `grep -q 'BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED' BACKLOG-archive.md` exits 1 today
because the row is still open, and 0 once it is archived. Red then green, same command, verified at
plan time: `grep_rc=1`.

**AC-13 requires the measured NUMBERS in the archive entry, not just the identifier (round-4 finding
5).** The red greps for the id, which an archive entry with no measurement would satisfy. It is
strengthened to require both: the identifier AND the measured `spaceAbove` value, in
`BACKLOG-archive.md`. Red today on both counts, green only when the entry carries what the row was
filed to obtain — which is the whole point of graduating this row rather than closing it.

`tests/docs/_metaLedgerInProgress.test.ts` runs beside it as the structural gate — it is what makes
removing the marker in this same commit non-optional, since archives categorically reject in-flight
entries.

**Close-out gate, run BEFORE this commit:** `git diff --name-only origin/main...HEAD | sort` compared
to spec §9's exact filename block. A path in one and not the other is a defect in one of them — the
comparison that replaced three spec rounds of hand-maintained blast-radius tables.

Archives `BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED` with the measured numbers, **removing the
in-progress marker in the same commit** (invariant 12: archives categorically reject in-progress
entries, so the marker cannot ride along). This is the PR's last commit, before any merge.

<!-- tasks: end -->

---

## Round discipline carried into execution

- **Fix-round regression budget.** Every repair round re-greps its finding's CLASS across the surface
  after the patch, re-runs the relevant meta-suite, and records both — including over the repair
  commit's own incidental edits, which is where two of m-wave's sharpest findings sat.
- **Same-vector recurrence.** Three consecutive rounds on one vector triggers comprehensive
  re-analysis before the next dispatch; a fourth means the vector is declared unresolved and the
  structural defense ships in that round's repair commit. **This arc has already spent its budget on
  two vectors during the spec stage**, so a third occurrence of either — an acceptance criterion
  drifting from its axis, or a cover missing a site — ships a defense immediately rather than a patch.
- **Repair direction.** This arc ships no recognizer of its own; the only decision surface is
  `computePopoverPlacement`, which it imports and does not modify. If a round proposes widening that
  module to suit one consumer (a per-call `GAP`, a third side, an alignment mode), the repair is a
  documented limit on this arc, not a change to a module four surfaces share.

## §12 Close-out

impeccable-gate: `/impeccable critique` AND `/impeccable audit` on the affected diff, both externally
attested, findings and dispositions recorded here.
