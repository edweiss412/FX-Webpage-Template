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
"validated executably at plan time" rule. **All seven product suites pass**,
which is the expected result: the tree is currently self-consistent, so every
geometry red in §4 is `red-state=authored` and is created by a task.

**One command is a LIVE red, and it is the only one.**
`tests/docs/_metaInvariant8Closeout.test.ts` fails on this plan the moment the
plan exists, because the plan declares the invariant-8 dual gate and carries no
`impeccable-gate:` marker — the marker's counts are the gate's output and cannot
be written before it runs. Task 3 carries `red-state=live` for exactly that, and
this section states it so §1 and §4 cannot disagree about whether a live red
exists.

```
tests/components/admin/_metaPopoverViewportSource.test.ts               PASS (11)
tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts   PASS (41)
tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts       PASS (35)
tests/components/admin/showpage/attentionMenu.test.tsx                  PASS (17)
tests/components/admin/useFitWithinClip.test.tsx                        PASS (48)
tests/e2e/wizard-attention-menu.spec.ts                                 PASS (9)
tests/e2e/popover-clip-fit.spec.ts                                      PASS (34, §1.1)

tests/docs/_metaInvariant8Closeout.test.ts                              FAIL (1 of 14) — LIVE RED, Task 3
  "declares the invariant-8 dual gate but carries no valid impeccable-gate
   marker line"
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
| `tests/docs/_metaInvariant8Closeout.test.ts` | **EXTENDS (new subject)** | This plan declares the invariant-8 dual gate, so the guard discovers it as a subject and reds until the marker lands. Task 3 owns that. Listed because a guard acquiring a new subject is an inventory entry, and an earlier draft omitted it. |
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

## Task 1 — the migration, and everything it falsifies, in one cycle

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts tests/e2e/wizard-attention-menu.spec.ts` red-state=authored red-target=`components/admin/showpage/AttentionMenu.tsx:405` why=`the authored eight-cell containment and width assertions fail on the six overhanging cells at the panel's live -36 left edge, produced by the viewport-sized width class at the cited line, and the SAME command passes at the end of this task's GREEN step` ac=AC-1,AC-2,AC-2b,AC-3,AC-4,AC-5,AC-6 -->

**Why this is one task, and why the previous two attempts to split it were both
wrong.** Round 1 split the assertions across three tasks and the fix into a
fourth; round 2 merged those four but still deferred the flex containment, the
`entered` re-place, the registries, the unit-test rewrite and the HTML baseline to
Tasks 2-6. Both shapes leave commits red at their own boundary, because **the
production change is indivisible**: the moment `useFitWithinClip` leaves
`components/admin/showpage/AttentionMenu.tsx:338`, the fitted-scroller cases at
`tests/e2e/popover-clip-fit.spec.ts:272-305`, three registries, the unit case at
`tests/components/admin/showpage/attentionMenu.test.tsx:336` and the HTML fixture
are ALL falsified at once. A task that fixes some of them is a broken commit, and
a later task claiming those as its own red is claiming a red it did not author.

So: one RED, one GREEN, one commit. The ordered steps below are steps, not tasks.

### RED — author every assertion, in the two EXISTING suites

**No new spec file.** `tests/e2e/standalone.config.ts:85-86` is an explicit
`testMatch` allowlist, and its own docblock warns at
`tests/e2e/standalone.config.ts:39-41` that "a new standalone spec is NOT
discovered until its name is added here. A spec file that merely exists runs
nowhere and silently proves nothing." A round-2 draft invented a matrix spec
outside that list; it would have been collected by nothing while its sibling
suites kept the command green. The eight cells go where spec §6.3 always put
them, in the two registered suites.

| Cell | Suite |
| --- | --- |
| wizard 375x667, 1280x800 | `tests/e2e/wizard-attention-menu.spec.ts` (existing loop) |
| wizard 375x844, 390x560 | same suite, two entries added to the list at `tests/e2e/wizard-attention-menu.spec.ts:201-203` |
| published 390x560 | `tests/e2e/popover-clip-fit.spec.ts:332` (existing case) |
| published 375x667, 375x844, 1280x800 | same suite, three cells added |

Every cell asserts, at rest (`scale` reads `1`, never `transform: none`):
`menu.left >= clip.left`, `menu.right <= clip.right`, `menu.bottom <= clip.bottom`,
each within 0.5px, and `menu.width > 0` first so a menu that failed to open cannot
pass by rendering nothing.

Plus, on top of the grid:

- `menu.width === 343` at 375x667 on BOTH surfaces (**AC-2b** — makes the
  ratified width-over-alignment choice falsifiable).
- `menu.width === 400` **and** `menu.left === 684` at 1280x800 on BOTH surfaces
  (**AC-5**, exact geometry, both surfaces — a round-2 draft asserted width on one
  and left on the other, leaving each half unchecked on the other surface).
- The 44px row floor at published 375x667 (**AC-4**), mirroring the wizard case at
  `tests/e2e/wizard-attention-menu.spec.ts:204`, which had no published twin.
- **Dimensional invariants** (§ below), which fail after the migration until the
  flex classes land in the same GREEN.
- **The settle assertion** (§ below) for AC-6.

Six of the eight cells fail. Record the observed numbers.

### GREEN — migrate, and repair everything the migration falsifies

1. **Placement.** Portal into the `PopoverHostContext` host (falling back to
   `document.body`), anchor to `pillRef`
   (`components/admin/showpage/AttentionMenu.tsx:75`), call
   `placeWithinVisibleViewport(window, { hostRect, trigger, naturalSize,
   wrappedHeightAt, preferredSide: "bottom", align: "right", warnKey })`, and write
   `left`/`top`/`maxWidth`/`maxHeight` to the PANEL, host-relative exactly as
   `components/admin/PublishedToggle.tsx:291-296`. Remove `right-0`,
   `top-[calc(100%+8px)]`, `w-[min(400px,calc(100vw-32px))]`, and the
   `useFitWithinClip` import and call.
2. **Flex containment**, so the fitted cap on the panel actually binds its
   scrolling child — the Dimensional Invariants below. Without this step the
   pre-existing fitted-scroller cases at
   `tests/e2e/popover-clip-fit.spec.ts:272-305` go red and stay red.
3. **The `entered` re-place**, so placement is recomputed once the scale settles.
4. **Registries**, per §2.1: the consumer list, the overlay disposition, the
   placement-contract mapping, and the shared-helper adoption rows.
5. **`tests/components/admin/showpage/attentionMenu.test.tsx:336`** rewritten to
   the new invariant — the cap lands on the panel and the scroller shrinks by
   flex — not deleted.
6. **Baselines**: the HTML fixture under `PUBLISHED_ATTENTION_CAPTURE=1` (never
   `-u`, diff reviewed line by line), and `tests/e2e/standalone-baseline.json`,
   whose `--list` output changes because this task adds cases to two registered
   suites.

**Do NOT** put `maxHeight` on the scroller, and do NOT add `scale` to the
transition list. Both are ratified (spec §3.3, §7) and both were adversarial
findings.

Re-run the marker's command and observe green.

**Pre-code mechanical checklist** (invariant 8, before the edit): em-dash ban in
user-visible copy, apostrophe literals, 44px tap targets, canonical type/token
classes. This change writes geometry and adds no user-visible copy, so the copy
arms are expected no-ops — verified, then recorded as no-ops.

### Dimensional Invariants (spec §7.1, verbatim)

| Parent → child | Relationship | Exact guarantee |
| --- | --- | --- |
| panel → itself | Receives the fitted `maxHeight`; content must not paint past it | `overflow-hidden` on the panel |
| panel → children | Heading and scroller stack and share the panel's height | `flex flex-col` on the panel |
| panel → heading | Never compressed | `shrink-0` on the heading wrapper |
| panel → scroller | Absorbs the remaining height and no more | `flex-1` **and** `min-h-0` |
| scroller → itself | Scrolls rather than grows | `overflow-y-auto`, `max-h-96` |

Real-browser assertions, each within 0.5px:

- `heading.height + scroller.height === panel.clientHeight` — **`clientHeight`,
  not the border-box rect.** The panel has `border` and no padding
  (`components/admin/showpage/AttentionMenu.tsx:405`), so a border-box comparison
  is off by exactly 2px and can never pass. Adversarial finding; do not
  "simplify" it back.
- `panel.getBoundingClientRect().height <= fittedCap`.
- `scroller.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom`
  — the one that catches a dropped `min-h-0`.

**Premise, stated executably** (`tests/_shared/premise.ts`): these discriminate
only when the cap BINDS. With few rows the scroller is shorter than the cap and
every assertion passes vacuously. The premise is that the fixture's natural
content height exceeds the fitted cap at the tested viewport, asserted on the
case's own inputs, unconditionally, never inside a `.each` callback.

### The settle assertion (AC-6)

Without an `entered`-keyed re-place, placement is computed once at mount from a
`scale-95` natural width and `menu.left` settles at `1084 - 380 = 704` instead of
684.

**Why the obvious assertion is invalid, so it is not re-proposed:** asserting the
settled width is 343 proves nothing — the rect reaches 343 when the scale reaches
1 whether or not any code ran. And at 375 both a frozen and a re-measured
placement clamp `x` to `bounds.left = 8`. The assertion is therefore at
**1280x800**, where the clamp does not fire: frozen 704, re-measured 684.

**Mutant, run before dispatch:** remove the `entered` re-place and observe 704.
Not "remove a `transitionend` listener", which changes nothing because none fires
(spec §7).

Asserted under both motion settings — the harness default (`reducedMotion` true,
probed) and `page.emulateMedia({ reducedMotion: "no-preference" })`. Equal results
are the expected outcome and are the point.

### Transition audit (the mandatory task, discharged here)

`components/admin/showpage/AttentionMenu.tsx` is already registered in the audit's
no-motion list (`tests/components/admin/transitionAudit.test.tsx:53`), and this
change adds no motion library, so that pin stays green by construction — which is
why spec §4.1 marks that file NO CHANGE.

**Inventory (spec §7)** — two states, one pair:

| From → To | Behavior |
| --- | --- |
| closed → open | `opacity-0 scale-95` → `opacity-100 scale-100`. The opacity half animates (0.12s); the scale half is INSTANT, because Tailwind v4 emits the individual `scale` property and `transition-property` lists only `opacity, transform`. Unchanged (L-6). |
| open → closed | Instant (unmount). Unchanged, deliberate. |

**Compound:** placement measured while the entrance is unsettled — the settle
assertion above.

**Every other conditional render branch**, per the transition-audit rule. All are
content ternaries with no animated property; each is *instant — no animation
needed*, and none gains one here: the nested `ariaLabel` ternary
(`components/admin/showpage/AttentionMenu.tsx:140`), optional heading (`components/admin/showpage/AttentionMenu.tsx:152`),
sheet-warning group (`components/admin/showpage/AttentionMenu.tsx:189`), judgment dot class (`components/admin/showpage/AttentionMenu.tsx:212`), judgment
screen-reader text (`components/admin/showpage/AttentionMenu.tsx:217`), monitoring group (`components/admin/showpage/AttentionMenu.tsx:229`), monitoring border class
(`components/admin/showpage/AttentionMenu.tsx:235`), leading-group rounding class (`components/admin/showpage/AttentionMenu.tsx:244`), optional second line (`components/admin/showpage/AttentionMenu.tsx:300`),
truncation class (`components/admin/showpage/AttentionMenu.tsx:302`), optional `heading` render (`components/admin/showpage/AttentionMenu.tsx:409`). The `entered`
ternary at `components/admin/showpage/AttentionMenu.tsx:406` is the one animated
branch and is the inventory row above.

### The §5 peer measurements — scaffolding, removed before the commit

Spec §5 schedules every non-defect row for runtime confirmation. In a browser,
report for `AvatarMenu`, `FinalizeButton`'s soft confirm,
`CleanupAbandonedFinalizeButton` and `ShareHub`: the panel's rect, its containing
block's rect, and the anchor-to-clip-edge distance, so §5's condition 4 is decided
by a number rather than a reading. Also assert `PopoverHostContext` resolves
NON-NULL on both review surfaces.

**Output only.** The measurements land in spec §5 replacing the static caveats and
are NOT retained as assertions: those components are outside this arc's scope, and
pinning their geometry here would create a test with no owner.

## Task 2 — retire the hook module

<!-- task: red=`pnpm heavy npx vitest run tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` red-state=authored red-target=`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:169` why=`deleting components/admin/useFitWithinClip.ts leaves the defining-module map at the cited line pointing at a path that no longer exists, which reds until the two rows naming it are removed` ac=AC-7 -->

**What is red and why:** Task 1 removed the last CALL, leaving the module unused
but present. Deleting the file falsifies the defining-module map at
`tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:169-170`, which
still maps `useFitWithinClip` and `findClippingAncestor` to it. Removing those two
rows is the GREEN.

Delete `components/admin/useFitWithinClip.ts` and
`tests/components/admin/useFitWithinClip.test.tsx`.

**Keep** `lib/layout/fitWithinClip.ts` — `MIN_FITTED_HEIGHT` is imported by
`lib/popover/place.ts:14` and is load-bearing for the whole stack's diagnostic.

**AC-7's two halves are asserted here, not assumed** (spec §9):

1. No surviving import — proven by `pnpm typecheck` resolving with the module
   deleted, since an import of a missing path cannot resolve. The command is
   named, not implied.
2. `components/admin/showpage/AttentionMenu.tsx` contains none of `100vw`,
   `100dvw`, `100svw` — a direct source assertion added to
   `tests/components/admin/showpage/attentionMenu.test.tsx`, since no existing
   guard scans CSS (L-3).

Update the stale live comment at
`tests/docs/_metaDeferralLedgerGraduation.test.ts:414`, which says the scroller
"now takes" the deleted hook. Leave the four historical-prose files in spec §4.3
untouched. Dated retirement note on
`docs/superpowers/specs/admin/2026-08-27-fitwithinclip-clip-subscription.md`.

## Task 3 — closeout

<!-- task: red=`pnpm heavy npx vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=live red-target=`docs/superpowers/plans/2026-08-28-attention-menu-clip-placement.md:1` why=`the guard walks plan files and reds on THIS file, so the plan is what causes and clears the failure, not a component line; RED AT PLAN TIME with the message declares the invariant-8 dual gate but carries no valid impeccable-gate marker line, and it goes green only when the gate has run and the marker lands with its real counts` ac=AC-7 -->

**What is red and why:** this plan declares the invariant-8 dual gate below and
carries no `impeccable-gate:` marker line. It cannot be satisfied at plan time —
the marker's counts are the gate's OUTPUT — so it is the closeout's own red by
construction.

Run **impeccable critique** and then **impeccable audit** on the affected diff —
the invariant-8 dual gate — with the canonical v3 setup gates: the context load
over PRODUCT.md and DESIGN.md, then the register reference read.

**Both half-names are written out deliberately.** `declaresGate`
(`tests/docs/_invariant8Closeout.ts:109`) folds two literal phrase matches,
`/impeccable critique/i` and `/impeccable audit/i`
(`tests/docs/_invariant8Closeout.ts:39-40`), across the unit's files. An earlier
draft wrote "impeccable critique + audit pair", which contains the first phrase
and not the second, so `declaresGate` returned false and this plan escaped the
invariant-8 machine check while appearing to declare the gate. Verified by
running the guard: 14 passed with that phrasing, where the obligation should have
red.

The marker line is written at closeout in the full form the guard requires for a
UI plan (grammar at `tests/docs/_metaInvariant8Closeout.test.ts:254`). **It is
deliberately not reproduced here, even as a fenced placeholder** — the guard
scans this file for its own prefix and reads a template as a MALFORMED marker,
which reds for the wrong reason and would make Task 3's `why=` false. Verified:
with the placeholder present the guard reported `malformed marker line`, not the
absent-marker branch this task claims.

Findings and dispositions into spec §12. Whole-diff Codex review to APPROVE.
Archive the ledger row, marker off in the PR's last commit before the merge
(invariant 12).

**THE ARC NEVER MERGES.** READY = 13 required contexts green at the shipping
40-char head + APPROVE, reported to bl-orch.

<!-- tasks: end -->

---

## 5. Acceptance criteria coverage

Every criterion in spec §9 is claimed by exactly one task marker's `ac=`, and the
owner named is where the DURABLE ASSERTION lives.

**Two corrections an earlier draft needed.** It declared `AC-P1`, which spec §9
does not contain — a plan may not mint acceptance criteria — and it double-counted
the eight cells by having three suites assert them. The matrix spec now owns the
grid outright; the other two suites keep their existing cells and gain edges, and
neither is extended across viewports the matrix already covers.

- AC-1 — `menu.left >= clip.left - TOL`, eight cells *(discharged by Task 1)*
- AC-2 — `menu.right <= clip.right + TOL`, eight cells *(discharged by Task 1)*
- AC-2b — settled width 343 at 375x667, both surfaces *(discharged by Task 1)*
- AC-3 — `menu.bottom <= clip.bottom + TOL`, eight cells *(discharged by Task 1)*
- AC-4 — `menu.width > 0` and the 44px row floor, both surfaces *(discharged by Task 1)*
- AC-5 — 1280x800 exact geometry, width 400 and left 684, both surfaces *(discharged by Task 1)*
- AC-6 — placement re-computed when the entrance settles *(discharged by Task 1)*
- AC-7 — the hook module is gone and this component carries no viewport-derived width *(discharged by Task 2, Task 3)*

**Seven criteria land on Task 1, and that is the honest count, not a
concentration to be tidied.** The migration is indivisible: every geometry
criterion is falsified by the same production change and restored by the same
one. Two earlier drafts spread these across three and then six tasks, and both
spreads were the same defect — a task claiming a red it did not author, or
committing red and leaving it red for a later task to clear.

**AC-3 moved to Task 1.** A round-2 draft assigned it to the dimensional task
while the grid also asserted it. Bottom containment is now one assertion in the
eight-cell grid, and the flex work that makes it hold is a GREEN step of the same
task rather than a task of its own.

**AC-7's two owners.** Task 2 deletes the module and adds both of the assertions
spec §9 narrowed it to — `pnpm typecheck` for the surviving-import half, a direct
source assertion for the viewport-width half. Task 3 verifies at closeout. Neither
asserts what the other asserts.

- [ ] Tasks 1-3
- [ ] Self-review
- [ ] **Adversarial review (cross-model)** — Codex, cap 4
- [ ] Execution handoff
