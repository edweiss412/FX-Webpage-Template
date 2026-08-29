# Plan — the attention menu joins the placement stack

**Spec:** `docs/superpowers/specs/admin/2026-08-28-attention-menu-clip-placement.md`
(4 adversarial rounds, 15 findings, all accepted).
**Row:** `BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW` · **Branch:** `fix/attention-panel-left-overflow`

Read the spec first. This plan does not restate its design, its declined
alternatives, or its documented limits, and where the two could drift the spec
wins.

---

## 1. Baseline — every task command run at the unmodified head

Run at `b74345848` on 2026-08-28, before any code. bl-orch's directive, and the
"validated executably at plan time" rule. **Every one passes**, which is the
expected and necessary result: this migration has no live red, because the tree
is currently self-consistent. Every red in §4 is `red-state=authored` and is
created by a task.

```
tests/components/admin/_metaPopoverViewportSource.test.ts               PASS (11)
tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts   PASS (41)
tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts       PASS (35)
tests/components/admin/showpage/attentionMenu.test.tsx                  PASS (17)
tests/components/admin/useFitWithinClip.test.tsx                        PASS (48)
tests/e2e/wizard-attention-menu.spec.ts                                 PASS (9)
tests/e2e/popover-clip-fit.spec.ts                                      PASS (34, §1.1)
```

**A plan defect this baseline rules out.** Had any of these exited non-zero
today, a `red-state=live` marker citing it would be claiming a red the tree
already has for an unrelated reason. None does.

**The honest shape of this arc's reds, stated because it is not textbook TDD.**
Three of the suites above are STRUCTURAL REGISTRIES that pass today, go red when
the production change lands, and are returned to green by editing the registry in
the same task. That is green → red → green, not red → green. It is still a real
red — the registry is a claim about the tree that the production change falsifies
— but a task marker that presented it as an ordinary TDD red would be
mis-describing it. Each such task states which of the two shapes it is.

### 1.1 popover-clip-fit baseline

Run detached (the suite exceeds a 10-minute foreground window): **34 passed**.

---

## 2. Meta-test inventory (mandatory)

| Meta-test | CREATES / EXTENDS / N-A | What |
| --- | --- | --- |
| `tests/components/admin/_metaPopoverViewportSource.test.ts` | EXTENDS | Its `toEqual` consumer list gains a sixth file. |
| `tests/components/admin/showpage/popoverOverlayRegistry.ts` | EXTENDS | AttentionMenu's row changes disposition. |
| `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` | EXTENDS | The `fit-within-clip` → hook-import mapping loses its last subject. |
| `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` | EXTENDS | Four hook rows retire. |
| `tests/components/admin/useFitWithinClip.test.tsx` | RETIRES | Deleted with its subject. |
| Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) | **N/A** | This plan touches no `pg_advisory*` path, no DB, no RPC. Declared explicitly per the rule. |
| Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`) | **N/A** | No Supabase call is added or moved. |
| Mutation registry (`tests/mutation/source/registry.ts`) | **N/A** | The subject is a React component's geometry, not a lib module or script whose defect class is "reports OK while the output moved". The spec's convergence criterion is the four-viewport probe domain, not a mutation score. |

**No new meta-test is created.** The class this arc closes is already covered by
a derived cover (`popoverOverlayRegistry`, an AST walk held both ways), and §5 of
the spec ratifies that adding a CSS-scanning arm is process-facing work under the
mint freeze, recorded as L-3 rather than filed.

## 2.1 Registry reconciliation, run at plan time

```
_metaPopoverViewportSource.test.ts:173-193   consumers, toEqual, fail-by-default
  current (5): HoverHelp.tsx, showpage/ShareHub.tsx, AnchoredPortal.tsx,
               PublishedToggle.tsx, ReSyncButton.tsx
  after   (6): + components/admin/showpage/AttentionMenu.tsx

popoverOverlayRegistry.ts   disposition counts
  current: placement-module 6, fit-within-clip 1
  after:   placement-module 7, fit-within-clip 0

_metaPopoverPlacementContract.test.ts
  :32  "placement-module": /from "@\/lib\/popover\/position"/
  :37  "fit-within-clip":  /from "@\/components\/admin\/useFitWithinClip"/
  after: the :37 mapping has NO subject (fit-within-clip count reaches 0) and
         its regex names a deleted module — retired with the disposition.

_metaSharedHelperAdoption.test.ts   rows naming the hook
  :123-126  consumer AttentionMenu.tsx -> helper useFitWithinClip   REMOVE
  :142      consumer useFitWithinClip.ts (consumes createRafCoalescer) REMOVE
  :155-156  "useFitWithinClip", "findClippingAncestor" in the helper list REMOVE
  :169-170  defining-module map entries for both REMOVE
  :27, :60, :161-165  docblock prose naming the hook  UPDATE
```

**Note the count that is easy to get wrong:** the spec's §2.2 table lists FIVE
consumer files but SIX overlays — `ReSyncButton.tsx` carries three overlays in
one file, as `popoverOverlayRegistry.ts:96` records. The viewport-source registry
is keyed by FILE (5 → 6); the overlay registry is keyed by OVERLAY (6 → 7).

---

## 3. e2e harness-readiness checklist (mandatory)

| Item | Answer |
| --- | --- |
| **(a) Server boot** | No app boot and no database. Both suites are standalone: each bundles its entry out-of-process with pinned esbuild, compiles real Tailwind CSS, and serves from a tmp dir over `node:http` (`tests/e2e/wizard-attention-menu.spec.ts:10`, `tests/e2e/popover-clip-fit.spec.ts:11-18`). Config `tests/e2e/standalone.config.ts`. |
| **(b) Readiness gate** | `window.__hydrated`, never `networkidle` (`tests/e2e/popover-clip-fit.spec.ts:18`). The wizard suite drives a static page and waits on the menu locator's `visible` state. **New for this arc:** every geometry assertion additionally waits for the entrance to settle — `scale` reading `1`, NOT `transform: none`, which spec §7 shows is permanently true on this element and therefore waits for nothing. |
| **(c) Detach-safety** | Every measurement re-queries its elements INSIDE the `page.evaluate` callback, so no handle outlives a re-render (`tests/e2e/popover-clip-fit.spec.ts:20-21`). New assertions follow the same shape; no `locator.evaluate` on a node that can unmount. |
| **(d) Motion, new** | The harness runs `reducedMotion: true` by default — `tests/e2e/standalone.config.ts` sets no `reducedMotion` and the page reports `matchMedia("(prefers-reduced-motion: reduce)").matches === true` (probed). Any case asserting motion-branch behavior sets it explicitly via `page.emulateMedia`. |

---

## 4. Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — probe: close every measurement the spec owes

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-clip-matrix.spec.ts` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:405` why=`the new matrix spec asserts containment and width across all eight cells; six of them fail at the panel's live -36 left edge, produced by the viewport-sized width class at the cited line, and the SAME command passes after Task 4` ac=AC-P1,AC-2b,AC-5 -->

**What is red and why:** a new throwaway probe spec asserts containment on BOTH
modals at ALL FOUR probe-domain viewports and fails on the six cells that
currently overhang, because `components/admin/showpage/AttentionMenu.tsx:405`
sizes the panel against the viewport.

Spec §1.3 measured the wizard at two viewports. The declared probe domain is four
viewports × two modals = eight cells, and §5's peer dispositions are static reads
the spec now schedules for runtime confirmation. This task closes both gaps
before any production change.

Measure and record, at rest (`scale` reads `1`) and mid-entrance:

1. Eight cells: `{wizard, published} × {375x667, 375x844, 390x560, 1280x800}` —
   `menu.left/right/width`, `clip.left/right/width`, `pill.right`.
2. `PopoverHostContext` resolves NON-NULL on both surfaces. The spec asserts the
   host is `ReviewModalShell`'s `panelRef`
   (`components/admin/review/ReviewModalShell.tsx:643`) and that Step3ReviewModal
   uses the same shell; assert it rather than assume it.
3. Every §5 non-defect row, in a browser: for `AvatarMenu`, `FinalizeButton`'s
   soft confirm, `CleanupAbandonedFinalizeButton` and `ShareHub`, report the
   panel's rect, its containing block's rect, and the anchor-to-clip-edge
   distance — so condition 4 is decided by a number, not a reading.

**GREEN:** the new matrix spec this task creates under tests/e2e/ (named in the marker's red= command) **PERSISTS.** An earlier
draft deleted it in this task's own GREEN step, which is the explicitly rejected
marker shape — the SAME command can never pass once its target is gone — and it
also stranded three acceptance criteria with no durable assertion (see §5). The
matrix suite is the durable home for:

- the eight-cell containment matrix (AC-1, AC-2 on both surfaces),
- `menu.width === 343` at 375x667 (**AC-2b**, the assertion that makes the
  ratified width-over-alignment choice falsifiable),
- `menu.width === 400` and `menu.left === 684` at 1280x800 (**AC-5**).

Item 3 below (the §5 peer dispositions) is a one-shot measurement, not a
contract: its OUTPUT lands in spec §5 replacing the static caveats, and it is
NOT retained as an assertion — those components are outside this arc's scope and
pinning their geometry here would create a test with no owner.

**Anti-tautology:** expected values are derived from the measured clip rect,
never hardcoded. Each cell asserts `menu.width > 0` first, so a menu that failed
to open cannot report containment by rendering nothing.

## Task 2 — the horizontal edge popover-clip-fit never asserted

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "containment"` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:405` why=`the case at popover-clip-fit.spec.ts:332 reads only panelBottom and menuBottom; adding menu.left >= panel.left fails at -36 on the published surface, produced by the width class at the cited line` ac=AC-1,AC-2 -->

**What is red and why:** `tests/e2e/popover-clip-fit.spec.ts:332` is named "the
menu never crosses the panel's clip edge" and asserts one dimension of that. It
gains `menu.left >= panel.left` and `menu.right <= panel.right`, measured at
rest, and the left assertion fails at -36.

This is the PUBLISHED surface's carrier red. The wizard file provides the
wizard's.

**Cells, stated because an earlier draft extended only 390x560 and the coverage
map then claimed more than the tasks retained.** This suite's attention-menu
containment case runs at 390x560; the published cells at 375x667, 375x844 and
1280x800 are added here, and the 1280x800 cell asserts the RIGHT edge (AC-2), not
only the left. Together with Task 1's matrix, all eight cells carry both
horizontal edges.

**Anti-tautology:** the assertion is scoped to the menu's own rect, not to a
container that also renders the pill; expected bounds come from the measured
panel rect.

## Task 3 — the wizard case measures at rest, and stops characterizing

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-attention-menu.spec.ts -g "stays inside the modal clip"` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:405` why=`deleting the w===375 characterization branch at wizard-attention-menu.spec.ts:265 leaves both viewports on the toBeGreaterThanOrEqual form at :270, which fails at -36 until the width class at the cited line is replaced` ac=AC-1,AC-2,AC-4 -->

**What is red and why:** the `w === 375` branch at
`tests/e2e/wizard-attention-menu.spec.ts:265` currently asserts
`menu.left < clip.left` — a characterization the file's own comment at `tests/e2e/wizard-attention-menu.spec.ts:262`
says to delete when the row is fixed. Deleting it puts 375 on the containment
assertion at `tests/e2e/wizard-attention-menu.spec.ts:270`, which fails at -36.

Two changes in one case, per spec §6.1:

1. Wait for the entrance to settle before measuring. Today it measures
   mid-entrance and therefore records -18.85, which is `0.95 × 343` against a
   right edge pinned at 307 — 5% short of the real overhang.
2. Delete the branch so both viewports share the containment form.

The viewport list at `tests/e2e/wizard-attention-menu.spec.ts:201-203` gains
`375x844` and `390x560` (spec §6.3).

## Task 4 — migrate the frame onto the placement stack

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts tests/e2e/wizard-attention-menu.spec.ts` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:338` why=`Tasks 2 and 3 leave both suites failing on the left edge; they go green only when the hook call at the cited line is replaced by placeWithinVisibleViewport writing left/top/maxWidth/maxHeight` ac=AC-1,AC-2,AC-2b,AC-3,AC-5 -->

**What is red and why:** the assertions from Tasks 2 and 3. This is the task that
turns them green.

Per spec §3.1-3.3, and following the ShareHub precedent
(`components/admin/showpage/ShareHub.tsx:876-882`):

- Portal into the `PopoverHostContext` host, falling back to `document.body`.
- Anchor to `pillRef` (already a prop,
  `components/admin/showpage/AttentionMenu.tsx:75`).
- `placeWithinVisibleViewport(window, { hostRect, trigger, naturalSize,
  wrappedHeightAt, preferredSide: "bottom", align: "right", warnKey })`.
- Write `left`/`top`/`maxWidth`/`maxHeight` to the PANEL. Host-relative
  conversion exactly as `components/admin/PublishedToggle.tsx:291-296`.
- Remove `right-0`, `top-[calc(100%+8px)]`,
  `w-[min(400px,calc(100vw-32px))]`, and the `useFitWithinClip` import and call.

**Do NOT** apply `maxHeight` to the scroller, and do NOT add `scale` to the
transition list. Both are ratified in the spec (§3.3, §7) and both were
adversarial findings.

**Pre-code mechanical checklist** (invariant 8, before the edit, not after):
em-dash ban in user-visible copy, apostrophe literals, 44px tap targets,
canonical type/token classes. This change writes geometry and adds no
user-visible copy, so the copy arms are expected no-ops rather than skipped —
verified, then recorded as no-ops.

## Task 5 — the dimensional invariants, in a real browser

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "dimensional"` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:426` why=`the new assertion scroller.bottom <= panel.bottom fails while the scroller at the cited line keeps min-height auto under a max-height parent, which is the state Task 4 leaves it in` ac=AC-3 -->

**What is red and why:** Task 4 puts a fitted `maxHeight` on the panel while the
scroller still has flex-default `min-height: auto`, so the scroller keeps its
content height and paints past the panel. `scroller.bottom <= panel.bottom`
fails until `flex-1 min-h-0` lands.

Mandatory layout-dimensions task. **The spec's exact Dimensional Invariants list
(§7.1):**

| Parent → child | Relationship | Exact guarantee |
| --- | --- | --- |
| panel → itself | Receives the fitted `maxHeight`; content must not paint past it | `overflow-hidden` on the panel |
| panel → children | Heading and scroller stack and share the panel's height | `flex flex-col` on the panel |
| panel → heading | Never compressed | `shrink-0` on the heading wrapper |
| panel → scroller | Absorbs the remaining height and no more | `flex-1` **and** `min-h-0` |
| scroller → itself | Scrolls rather than grows | `overflow-y-auto`, `max-h-96` |

Assertions, each within 0.5px, via `getBoundingClientRect()` in a real browser:

- `heading.height + scroller.height === panel.clientHeight` — **`clientHeight`,
  not the border-box rect.** The panel has `border` and no padding
  (`components/admin/showpage/AttentionMenu.tsx:405`), so a border-box comparison
  is off by exactly 2px and can never pass. This was an adversarial finding;
  do not "simplify" it back.
- `panel.getBoundingClientRect().height <= fittedCap`.
- `scroller.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom`
  — the one that catches a dropped `min-h-0`.

**Premise, stated executably** (`tests/_shared/premise.ts`): these assertions
discriminate only when the cap actually BINDS — with few enough rows the scroller
is shorter than the cap and every assertion passes vacuously. The premise is that
the fixture's natural content height exceeds the fitted cap at the tested
viewport, asserted on the case's own inputs, unconditionally, never inside a
`.each` callback.

## Task 6 — placement is re-computed when the entrance settles

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts -g "re-place"` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:338` why=`without an entered-keyed re-place at the cited line, placement is computed once at mount from a scale-95 natural width and menu.left settles at 704 instead of 684 at 1280x800` ac=AC-6 -->

**What is red and why:** Task 4's placement runs at mount, when the panel is
still `scale-95`, so `naturalSize.width` reads 380 instead of 400 and
`menu.left` is `1084 - 380 = 704`. The assertion wants 684.

**One signal, not two.** Spec §7: Tailwind v4 compiles `scale-*` to the
individual `scale` property, `scale` is not in this panel's
`transition-property` (`opacity, transform`), so the scale change is INSTANT in
both motion modes and no `transitionend` for it ever fires. `entered` is the only
signal, and it covers both motion preferences for that reason.

**Why the obvious assertion is invalid, so it is not re-proposed:** asserting the
settled width is 343 proves nothing — the rect reaches 343 when the scale reaches
1 whether or not any code ran. And at 375 both a frozen and a re-measured
placement clamp `x` to `bounds.left = 8`. The assertion must therefore be at
**1280x800**, where the clamp does not fire and `x` tracks
`trigger.right - effectiveWidth`: frozen 704, re-measured 684.

**Mutant, run before dispatch:** remove the `entered` re-place and observe 704.
Not "remove a `transitionend` listener", which changes nothing because none
fires.

Asserted under both motion settings — the harness default (`reducedMotion` true)
and `page.emulateMedia({ reducedMotion: "no-preference" })`. Equal results are
the expected outcome and are the point.

### 6.1 Transition audit (the mandatory task, folded in here)

**Why this is not its own task.** An earlier draft made it Task 9, pointing its red at the
transition-audit suite with a negative assertion that `scale` is absent
from the transition list. That assertion is TRUE today and Task 4 preserves it,
so the test would pass the moment it was authored — the explicitly rejected
marker shape. Rather than invent a red for it, the audit rides on the task that
owns the settle semantics and has a real one. `AttentionMenu.tsx` is already
registered in that suite's no-motion list
(`tests/components/admin/transitionAudit.test.tsx:53`), and this change adds no
motion library, so that pin stays green by construction.

**The spec's Transition Inventory (§7)** — two states, one pair:

| From → To | Behavior |
| --- | --- |
| closed → open | `opacity-0 scale-95` → `opacity-100 scale-100`, motion-safe. The opacity half animates (0.12s); the scale half is INSTANT, because Tailwind v4 emits the individual `scale` property and `transition-property` lists only `opacity, transform`. Unchanged by this arc (L-6). |
| open → closed | Instant (unmount). Unchanged, deliberate. |

**Compound:** placement measured while the entrance is unsettled — the red above.

**Every other conditional render branch, enumerated and dispositioned**, per the
transition-audit rule. All are content ternaries with no animated property; each
is *instant — no animation needed*, and none gains one here:

| Branch | Site |
| --- | --- |
| nested `ariaLabel` ternary | `components/admin/showpage/AttentionMenu.tsx:140` |
| optional heading | `components/admin/showpage/AttentionMenu.tsx:152` |
| sheet-warning group | `components/admin/showpage/AttentionMenu.tsx:189` |
| judgment dot class | `components/admin/showpage/AttentionMenu.tsx:212` |
| judgment screen-reader text | `components/admin/showpage/AttentionMenu.tsx:217` |
| monitoring group | `components/admin/showpage/AttentionMenu.tsx:229` |
| monitoring border class | `components/admin/showpage/AttentionMenu.tsx:235` |
| leading-group rounding class | `components/admin/showpage/AttentionMenu.tsx:244` |
| optional second line | `components/admin/showpage/AttentionMenu.tsx:300` |
| truncation class | `components/admin/showpage/AttentionMenu.tsx:302` |
| optional `heading` render | `components/admin/showpage/AttentionMenu.tsx:409` |

The `entered` ternary at `components/admin/showpage/AttentionMenu.tsx:406` is the
one branch that IS animated, and it is the inventory row above.

**Ratified pin, carried in Task 4's diff rather than a test:** this change does
not add `scale` to the transition list (spec §7, L-6). Adding it would make the
geometry animate and require a settle signal that does not exist.

## Task 7 — registries follow the migration

<!-- task: red=`pnpm heavy npx vitest run tests/components/admin/_metaPopoverViewportSource.test.ts tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:32` why=`Task 4 removed the import at the cited line and added a placeWithinVisibleViewport consumer, which falsifies the toEqual consumer list at _metaPopoverViewportSource.test.ts:173-193 and the adoption rows at _metaSharedHelperAdoption.test.ts:123-126` ac=AC-7 -->

**Red shape: green → red → green, not red → green.** These three suites pass at
the unmodified head (§1) and are falsified by Task 4's production change. That is
a real red — a registry claim the change made false — but it is not a test
written before its implementation, and this marker does not pretend otherwise.

Apply the §2.1 reconciliation exactly. Every row is derived from the command
output pasted there, not from memory.

## Task 8 — retire the hook

<!-- task: red=`pnpm heavy npx vitest run tests/components/admin/showpage/attentionMenu.test.tsx` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:422` why=`the case at attentionMenu.test.tsx:336 asserts the scroller receives the hook's fitted INLINE cap via the ref at the cited line; Task 4 moved the cap to the panel, so the assertion fails until it is rewritten to the new invariant` ac=AC-7 -->

Delete `components/admin/useFitWithinClip.ts` and
`tests/components/admin/useFitWithinClip.test.tsx`. Rewrite
`tests/components/admin/showpage/attentionMenu.test.tsx:336` to the new invariant
rather than deleting it.

**Keep** `lib/layout/fitWithinClip.ts` — `MIN_FITTED_HEIGHT` is imported by
`lib/popover/place.ts:14` and is load-bearing for the whole stack's diagnostic.

Update the stale live comment at
`tests/docs/_metaDeferralLedgerGraduation.test.ts:414`, which says the scroller
"now takes" the deleted hook. Leave the four historical-prose files in spec §4.3
untouched.

Dated retirement note on
`docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md`.

## Task 9 — baselines

<!-- task: red=`pnpm heavy npx vitest run tests/components/admin/showpage/publishedAttentionBaseline.test.tsx` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:405` why=`the fixture at __fixtures__/published-attention-menu-baseline.html captures the exact class string at the cited line, including w-[min(400px,calc(100vw-32px))] and right-0, both of which Task 4 removes` ac=AC-7 -->

**TWO baselines move, not three.** Spec §4.2 and the arc brief both name a
"published screenshot byte baseline" requiring regeneration from the pinned
Playwright Docker image. **No such baseline covers this surface**, verified three
ways: neither e2e suite calls `screenshot()` or `toHaveScreenshot()`; no tracked
screenshot artifact names the attention menu; and the only `needs-attention`
webps (`public/help/screenshots/needs-attention-mobile-{dark,light}.webp`) are
captures of the `/admin/needs-attention` PAGE via
`[data-testid=admin-needs-attention-page]`
(`scripts/help-screenshots.manifest.ts:80-85`), a different surface that does not
render this component. No entry in that manifest opens a review modal.

The byte baseline that genuinely moves is the HTML fixture in item 1 — which IS
a byte baseline, just not a screenshot one. The spec is corrected to match, and
the Docker/`--platform linux/amd64` instruction is dropped as describing work
that does not exist here. **It is not dropped as a rule**: it still binds any
arc that does move a screenshot baseline.

1. `published-attention-menu-baseline.html` — regenerate under
   `PUBLISHED_ATTENTION_CAPTURE=1`, never `-u`. **Review the diff line by line**
   and record in the commit what changed and why each change is expected.
2. `tests/e2e/standalone-baseline.json` — a Playwright `--list` baseline, so only
   tasks that change the PLAYWRIGHT case set touch it: Task 1 (new matrix spec),
   Task 2, Task 3 and Task 5. Tasks 7 and 8 edit Vitest files and cannot affect
   it; an earlier draft attributed it to them.

## Task 10 — closeout

<!-- task: red=`pnpm heavy npx vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-28-attention-menu-clip-placement.md:1` why=`the guard walks plan files and reds on THIS file, so the plan is what causes and clears the failure, not a component line; VERIFIED RED at plan time with the message declares the invariant-8 dual gate but carries no valid impeccable-gate marker line, and it goes green only when the gate has run and the marker lands with its real counts` ac=AC-7 -->

**What is red and why:** this plan declares the invariant-8 dual gate below, and
carries no `impeccable-gate:` marker line. `tests/docs/_metaInvariant8Closeout.test.ts`
reds on exactly that. It cannot be satisfied at plan time — the marker's counts
are the gate's OUTPUT — so it is the closeout's own red by construction, and it
goes green when the line below is filled in with real numbers.

Run **impeccable critique** and then **impeccable audit** on the affected diff —
the invariant-8 dual gate — with the canonical v3 setup gates: the context load
over PRODUCT.md and DESIGN.md, then the register reference read.

**Both half-names are written out deliberately.** `declaresGate`
(`tests/docs/_invariant8Closeout.ts:109`) folds two literal phrase matches,
`/impeccable critique/i` and `/impeccable audit/i`
(`tests/docs/_invariant8Closeout.ts:39-40`), across the unit's files. An earlier
draft of this task wrote "impeccable critique + audit pair", which contains the
first phrase and not the second, so `declaresGate` returned false, no marker was
required, and this plan escaped the invariant-8 machine check while appearing to
declare the gate. Verified by running the guard: 14 passed with that phrasing,
where the obligation should have red.
Findings and dispositions into spec §12. This arc HAS a UI surface
(`components/admin/showpage/AttentionMenu.tsx`), so `N/A — no UI surface` is not
available.

The marker line is written at closeout and not before, in the full form the guard
requires for a UI plan (grammar at
`tests/docs/_metaInvariant8Closeout.test.ts:254`): the two gate halves, the p0 and
p1 counts, and the dispositions field. **It is deliberately not reproduced here,
even as a fenced placeholder** — the guard scans the plan for its own prefix and
reads a template as a MALFORMED marker, which reds for the wrong reason and would
make Task 10's `why=` false. Verified: with the placeholder present the guard
reported `malformed marker line`, not the absent-marker branch this task claims.

Whole-diff Codex review to APPROVE. Archive the ledger row, marker off in the
PR's last commit before the merge (invariant 12).

**THE ARC NEVER MERGES.** READY = 13 required contexts green at the shipping
40-char head + APPROVE, reported to bl-orch.

<!-- tasks: end -->

---

## 5. Acceptance criteria coverage

Every criterion in spec §9 is claimed by a task marker's `ac=`, and the owner
named is where the DURABLE ASSERTION lives, not which task turns it green. AC-2b
and AC-5 sit in Task 1's matrix suite; Task 4 is what makes them pass. An earlier
draft named Task 4 for both, which described the fix rather than the coverage —
and that is how three criteria came to have no persistent assertion at all when
Task 1's suite was still being deleted.

- AC-P1 — probe measurements complete over the declared domain *(discharged by Task 1)*
- AC-1 — `menu.left >= clip.left - TOL` *(discharged by Task 2)*
- AC-2 — `menu.right <= clip.right + TOL` *(discharged by Task 2)*
- AC-2b — settled width 343 at 375x667, the choice enforced *(discharged by Task 1)*
- AC-3 — `menu.bottom <= clip.bottom + TOL` *(discharged by Task 5)*
- AC-4 — `menu.width > 0`, 44px row floor holds *(discharged by Task 3)*
- AC-5 — 1280x800 geometry identical to today *(discharged by Task 1)*
- AC-6 — placement re-computed when the entrance settles *(discharged by Task 6)*
- AC-7 — no `useFitWithinClip` in the tree, no `100vw`-derived width on a clipped non-portaled overlay *(discharged by Task 8)*

## 6. Checklist

- [ ] Pre-draft code-verification pass — done, §1, §2.1
- [ ] Baseline commands at unmodified head — done, §1
- [ ] Tasks 1-10
- [ ] Self-review
- [ ] **Adversarial review (cross-model)** — Codex, cap 4
- [ ] Execution handoff
