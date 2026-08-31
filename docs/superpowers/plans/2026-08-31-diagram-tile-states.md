# The diagram tile says which of three things happened: implementation plan

Spec: `docs/superpowers/specs/2026-08-31-diagram-tile-states.md`. Branch `fix/diagram-tile-states`,
worktree `/Users/ericweiss/FX-worktrees/diagtile`. Closes `DIAGRAMTILE-FAILURE-STATE-COPY-1`,
`DIAGRAMTILE-LIVE-TILE-UNLABELLED-1` and `DIAGRAMTILE-OBJECT-COVER-CROPS-1` in the repo-root
`DEFERRED.md`.

impeccable-gate: pending, this arc ships UI

## Global Constraints

- **Invariant 1 (TDD).** Every task: failing test, minimal implementation, passing test, commit. No implementation before its test.
- **Invariant 6 (commit per task).** Scope is admin wizard UI plus one crew component: `feat(admin)`, `fix(admin)`, `test(admin)`, `fix(crew-page)` for the gallery, `docs(plan)`.
- **Invariant 8 (impeccable dual gate).** `/impeccable critique` and `/impeccable audit` both run on the diff before the whole-diff review. This arc touches `components/` twice; the gate is not optional.
- **Invariant 11.** All work in `/Users/ericweiss/FX-worktrees/diagtile`. Never the main checkout.
- **Invariant 12.** The three ledger rows are marked IN PROGRESS on the branch and graduate in the PR's last commit (Task 8), never on main.
- **No new ledger row, of any facing.** Unrepaired peers stay in spec section 6 and go to bl-orch in the readiness message. Filing a `BL-`/`DEF-` row is not an available disposition for anything this arc finds.
- **The two sentences are ratified and typed exactly**, from the `DIAGRAMTILE-FAILURE-STATE-COPY-1` row body: `Not captured. Won't appear on the crew page.` and `Preview couldn't load. The diagram will still publish.` Straight apostrophes, period form, no em dash. AC-10 and `tests/styles/_metaEmDashCopy.test.ts` are the guards.
- **Type tokens are `@theme` names.** The message is `text-xs/relaxed` (the repo's wrapping-copy class); the name line is plain `text-xs` and truncates.
- **Heavy phases run under `pnpm heavy`.** Every Playwright run here is a heavy phase. Do NOT export `TEST_DATABASE_URL` (#901; the export reds validation-schema-parity locally).
- **No error code is added.** Section 12.4 is not implicated: no `pnpm gen:spec-codes` run, no `lib/messages/catalog.ts` row.

---

## Pre-draft verification record

Run at plan time against the live tree at `00c184c02`, not described for later. The enumerative and
negative claims get their own command, because a self-sweep is structurally blind to them.

**V1: the seventeen census sites, re-derived (enumerative).**

```
$ rg -c "Preview unavailable" tests components
components/admin/wizard/step3ReviewSections.tsx:1
tests/components/admin/wizard/step3DiagramTile.published.test.tsx:3
tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:5
tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:5
tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:1
tests/components/admin/wizard/step3ReviewSections.test.tsx:3
```

3+5+5+1+3 = **17 test-side sites**, matching spec section 5's table exactly, plus the one production
string. The census is current.

**V2: what actually consumes the `-diagram-tile-` prefix (enumerative, and the spec's table
re-derived rather than trusted).**

```
$ rg -n 'data-testid\^="wizard-step3-card' tests
tests/dev/publishedModalFixtureKnobs.test.tsx:228
tests/e2e/published-review-modal.layout.spec.ts:2079
tests/e2e/step3-review-modal.layout.spec.ts:544
tests/e2e/step3-review-modal.layout.spec.ts:728
```

Four CSS prefix selectors, not five. The spec's fifth row cites
`tests/components/admin/wizard/step3ReviewSections.test.tsx:749`, which is not itself a selector but
the constant the selectors in that file are built from:

```
$ rg -n "TILE_PREFIX" tests/components/admin/wizard/step3ReviewSections.test.tsx
749:  const TILE_PREFIX = `wizard-step3-card-${DFID}-diagram-tile-`;
799,867,911:  container.querySelectorAll(`[data-testid^="${TILE_PREFIX}"]`)
814,838,842,940,951,963,971:  scoped.getByTestId(`${TILE_PREFIX}<n>`)
```

So the spec's count of five prefix consumers is right and its table is better than a call-site list:
it names the one constant three prefix queries derive from. **Everything else in the corpus that
mentions `-diagram-tile-` builds an EXACT id** (`TILE(i)` in the staged, reconcile, published and
failureFocus suites, and exact `getByTestId` in `publishedNoStagedTraffic.test.tsx:216`,
`tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:893`,
`tests/e2e/step3-review-modal.layout.spec.ts:595` and
`tests/e2e/step3-review-modal.layout.spec.ts:682`).
An exact id cannot be matched by a new `-diagram-cell-` sibling, so the cap-count risk is confined to
the five prefix consumers, as the spec says. AC-9 rests on this and it holds.

**V3: is `TriangleAlert` importable where the spec puts it? (negative; Task 3 rests on it).**

```
$ rg -n "TriangleAlert|ImageOff" components/admin/wizard/step3ReviewSections.tsx
47:  ImageOff,
4158:  <ImageOff aria-hidden="true" className="size-4 text-text-subtle" />
```

`ImageOff` is imported; **`TriangleAlert` is not**. Task 3 adds it to the existing `lucide-react`
import. The spec's precedent citations both resolve:
`components/admin/IgnoredSheetsDisclosure.tsx:93` and `components/admin/BellPanel.tsx:62`, and
`components/admin/DataQualityBadge.tsx:79` is a third at `size-4`, which is the size this arc uses.

**V4: the two `object-cover` sites, and a third the spec does not name (enumerative).**

```
$ rg -n "object-cover" components/diagrams/Gallery.tsx components/admin/wizard/step3ReviewSections.tsx
components/diagrams/Gallery.tsx:757
components/admin/wizard/step3ReviewSections.tsx:4254

$ rg -n "object-cover" tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx
48   (doc comment)
98, 99, 104, 105, 112   (negative-control literals)
144  (the production assertion)
```

Two production sites, as the spec's table says. On the test side the spec names
`tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:144` and
`tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:98-112`; **line 48 of that same file
is a sixth occurrence it does not name**, inside the `CHROME_TOKEN` doc comment,
where `object-cover border size-full` is a worked example of a regex boundary bug. **Disposition:
leave it.** That comment is about the token regex's anchoring, not about what the tile ships, and
rewriting it to `object-contain` would make the worked example disagree with the bug it documents.
Task 5 states this rather than leaving a reader to wonder whether the sweep missed it.

**V5: does anything already pin the gallery's fit class? (negative; AC-12 rests on it).**

```
$ rg -n "object-cover|object-contain" tests/ | rg -i gallery
(no output)
```

Nothing. AC-12's gallery clause is the first pin on that surface, as the spec says.

**V6: the premise helper's real exports.**

```
$ rg -n "^export" tests/_shared/premise.ts
26:export function premise(description: string, actual: number, mustExceed: number): void
36:export function premiseHolds(description: string, condition: boolean): void
```

Two exports, both used by this plan. `premiseHolds` takes a boolean, `premise` a numeric
comparison; the tasks below use each on its own shape.

**V7: the premise that the restructure breaks, read rather than assumed.**
`tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:188-199` does
`premiseHolds("the tile is on the placeholder branch", within(tile).queryByText("Preview
unavailable") !== null)` and then `tile.querySelector("[title]")`. Both read the BOX element. Both
break when the caption moves to the wrapper, which is exactly the loud red spec section 5.0
predicts. Its own comment at
`tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:192-195` explains that the name node
is selected by `title` rather
than a testid precisely so the cap's prefix selector cannot count it, which is the same constraint
that makes `-diagram-cell-` the right segment for the wrapper.

## Meta-test inventory

- **Creates:** none. No new registry file.
- **Extends:** none. `tests/components/diagrams/perItemStateLifetime.probe.test.ts:27` scans only `Gallery.tsx` and `GalleryLightbox.tsx`, so renaming the tile's `failed` state touches nothing there; `tests/styles/_metaControlOutlineResidue.test.ts` censuses interactive elements and the placeholder `<span>` is not one. Both re-run as gates.
- **Mutation enrolment:** no file this arc changes is an enrolled `sourcePath` in `tests/mutation/source/registry.ts`. No surface is scored, and none is enrolled under review pressure.
- **Advisory-lock topology:** N/A. No `pg_advisory*` path, no RPC, no DB layer.

## e2e harness readiness

Tasks 6 and 7 attach Playwright, so the three mandatory declarations:

- **(a) Server boot.** Both specs run against the existing `tests/e2e/_step3ReviewModalHarness.tsx` bundle under the committed Playwright config, `--project=desktop-chromium`. No new server, no new port.
- **(b) Readiness gate.** The harness's existing hydration gate, the same one `tests/e2e/step3-review-modal.layout.spec.ts:544` already awaits before its tile queries. Never `networkidle` alone.
- **(c) Detach safety.** Every rect is read in ONE `page.evaluate` that resolves each element and returns plain numbers, never a sequence of `locator.evaluate` calls that can outlive a re-render. This is also what keeps the readability walk in AC-7b consistent: ancestor and message rects must come from the same layout frame or containment is compared across two.
## File structure

New files are written unbackticked here because they do not exist yet; a citation to an untracked
path is a lint failure, and a plan that dodges it by not naming the file is worse.

| File | Responsibility | Task |
|---|---|---|
| `components/admin/wizard/step3ReviewSections.tsx` | wrapper, name line, three-state union, two sentences, glyph split, border token, fit class | 1, 2, 4, 5 |
| tests/components/admin/wizard/step3DiagramTile.states.test.tsx (new) | AC-1 to AC-6 | 1, 2, 3 |
| `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` | census re-scope; the broken premise and `[title]` lookup | 1 |
| `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx` | census re-scope; three of the five live-negatives | 1 |
| `tests/components/admin/wizard/step3DiagramTile.published.test.tsx` | census re-scope; one live-negative | 1 |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx` | census re-scope; one live-negative; the cap count | 1 |
| `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` | census re-scope (the `.textContent` site) | 1 |
| `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` | the border pin; the fit assertion and its negative controls | 4, 5 |
| `components/diagrams/Gallery.tsx` | the crew gallery's fit class | 4 |
| tests/components/diagrams/galleryTileFit.test.tsx (new) | AC-12's first pin on the gallery | 4 |
| `tests/e2e/step3-review-modal.layout.spec.ts` | AC-7 dimensional invariants, AC-7b readability | 6, 7 |

---

<!-- tasks: depth=3 red-contract -->

### Task 1: The caption leaves the box, and the seventeen sites move with it

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx tests/components/admin/wizard/step3DiagramTile.staged.test.tsx tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx tests/components/admin/wizard/step3DiagramTile.published.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4174` why=`the name line exists only inside the failed branch, so the live tile has no name node at all and the AC-3 case finds nothing to assert on` ac=AC-3,AC-4,AC-5,AC-9,AC-11 -->

**Files:** tests/components/admin/wizard/step3DiagramTile.states.test.tsx (new), `components/admin/wizard/step3ReviewSections.tsx`.

- [ ] **Step 1: The suite, name line only.** AC-3: a live tile renders its name as visible text and that text carries `aria-hidden="true"`. AC-4: both failed states render the name WITHOUT `aria-hidden`. AC-5: with `alt` empty or whitespace, no name line renders in any state, and the anchor's `aria-label` still falls back to `Staged diagram (opens in a new tab)`.
- [ ] **Step 2: Observed red.** `components/admin/wizard/step3ReviewSections.tsx:4174` is `{strippedAlt ? (`, inside the `failed` branch that returns at `components/admin/wizard/step3ReviewSections.tsx:4152`. The live branch has no name node, so AC-3 has nothing to find and AC-4's two states share one implementation that AC-3 cannot distinguish from.
- [ ] **Step 3: The wrapper.** A `<span className="flex flex-col gap-1">` holding the box and the caption. The box keeps its exact geometry and its `data-testid`; the caption is a sibling, free to be as tall as its content.
- [ ] **Step 4: The name line, once, outside the box, in every state.** Plain `text-xs`, `truncate`, `title={strippedAlt}`. `aria-hidden="true"` in the live state only, because there the anchor already carries the name (`components/admin/wizard/step3ReviewSections.tsx:4199-4201`); in the two failed states there is no anchor, so the caption is the only accessible text and must stay announced. That is the same argument that emptied the image's `alt` at `components/admin/wizard/step3ReviewSections.tsx:4242`.
- [ ] **Step 5: Four pre-dispatch mutants** on every string-presence assertion this task adds: the value emptied; the expected content plus an appended suffix; the content present but not live (the name in an attribute only); each discriminating parameter varied in turn. Results recorded in the commit.
- [ ] **Step 6: The loud red, and it is the same commit.** Moving the caption reds thirteen existing sites at once, so the census repair CANNOT be a separate task: a task boundary here would commit a red tree. Thirteen loud failures: the ten positive `getByText` sites, the `.textContent` site at `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:903`, the premise at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:188-191`, and the `[title]` lookup at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:196-199`.
- [ ] **Step 7: Thirteen re-point from the box to the cell.**
- [ ] **Step 8: The five live-negatives get a POSITIVE discriminator, not just a re-scope (AC-11).** Each today asserts a placeholder string is ABSENT from the box; move the string to a sibling and the assertion passes whether or not the tile is a placeholder. Each instead asserts the box IS an `<a>` with a mounted `<img>`, so it fails when the tile is a placeholder. The five: `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:275`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:84`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:118`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:157`, `tests/components/admin/wizard/step3ReviewSections.test.tsx:841`.
- [ ] **Step 9: The wrapper's own handle (AC-9).** The cell carries `-diagram-cell-`, not `-diagram-tile-`, because five prefix consumers require the literal `-diagram-tile-` and would otherwise count the wrapper as a tile: the four CSS selectors in verification V2 plus the `TILE_PREFIX` constant at `tests/components/admin/wizard/step3ReviewSections.test.tsx:749` that three queries in that file derive from. Assert the `-diagram-tile-` prefix count over a full grid still equals `DIAGRAM_TILE_CAP` (`components/admin/wizard/step3ReviewSections.tsx:4077`, value 12), which is the assertion that read 24 where 12 was correct before the comment at `components/admin/wizard/step3ReviewSections.tsx:4166-4172` was written.
- [ ] **Step 10: One near miss, checked and left alone.** `tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx:375` selects `[data-testid*="diagram" i]`, a case-insensitive SUBSTRING, which the new cell id does match. It is a single `querySelector` used as a `.not.toBeNull()` premise, so an additional match cannot change its verdict.
- [ ] **Step 11: Observed green** on the new suite and all five census suites.

### Task 2: Three states, two sentences, two glyphs

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4159` why=`one string, Preview unavailable, renders for both failed states, so the absent case and the load-failed case cannot be told apart and both copy assertions fail on that one line` ac=AC-1,AC-2,AC-10 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, tests/components/admin/wizard/step3DiagramTile.states.test.tsx.

- [ ] **Step 1: The cases, both directions each.** AC-1: seeded `hasPreviewSource: false` renders `Not captured. Won't appear on the crew page.` and NOT the load-failed sentence. AC-2: a mounted image that fires a real `onError` renders `Preview couldn't load. The diagram will still publish.` and NOT the absent sentence. Asserting both directions is what catches a split that threads the state and still renders one string, which is today's defect wearing a new type.
- [ ] **Step 2: AC-2 is reached by a real error event on a mounted image**, never by seeding a `load-failed` prop. A seed-only test passes against a seed-only implementation.
- [ ] **Step 3: Observed red** against `components/admin/wizard/step3ReviewSections.tsx:4159`.
- [ ] **Step 4: The union.** `type DiagramTileState = "live" | "absent" | "load-failed"`. The seed at `components/admin/wizard/step3ReviewSections.tsx:4120` becomes `hasPreviewSource ? "live" : "absent"`; the reconcile at `components/admin/wizard/step3ReviewSections.tsx:4149` re-seeds on the same rule; the `onError` handler at `components/admin/wizard/step3ReviewSections.tsx:4245-4253` writes `"load-failed"` AFTER calling `onFailure`. That order is load-bearing and unchanged: after the flip there is no anchor left to move focus off.
- [ ] **Step 5: The glyph split.** `TriangleAlert` for `absent`, `ImageOff` for `load-failed`, both `size-4 text-text-subtle` and `aria-hidden`. Glyph carries the state, not colour. **`TriangleAlert` is not imported today** (verification V3): add it to the existing `lucide-react` import at `components/admin/wizard/step3ReviewSections.tsx:47`.
- [ ] **Step 6: Four pre-dispatch mutants per sentence**, as Task 1 step 5.
- [ ] **Step 7: Observed green**, plus `pnpm vitest run tests/styles/_metaEmDashCopy.test.ts` for AC-10.

### Task 3: Every transition in the inventory

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4149` why=`the reconcile re-seeds from hasPreviewSource alone, so a tile that reached load-failed and is handed a still-good source returns to live, and the ordered-transition cases asserting otherwise fail` ac=AC-6 -->

**Files:** tests/components/admin/wizard/step3DiagramTile.states.test.tsx.

The inventory, reproduced from spec §4.1 because the writing-plans rules require the task body to
carry it. Three states, so three unordered pairs and six ordered transitions; every one is INSTANT,
with no animation anywhere in this component.

| Ordered transition | Reachable | Driver |
|---|---|---|
| `live` to `absent` | yes | reconcile, `hasPreviewSource` goes false |
| `live` to `load-failed` | yes | `onError` on the mounted image |
| `absent` to `live` | yes | reconcile, a good source arrives |
| `load-failed` to `live` | yes | reconcile, `href` or `sourceKey` moves |
| `load-failed` to `absent` | yes | reconcile, `hasPreviewSource` goes false |
| `absent` to `load-failed` | **no** | no image mounts in `absent`, so `onError` cannot fire |

- [ ] **Step 1: All five reachable transitions, plus the sixth asserted unreachable.**
- [ ] **Step 2: Driven through a stable React key**, so a remount cannot be mistaken for a re-derivation. The grid keys tiles by `${stub.objectId}-${i}`, so a manifest change re-renders the same instance; the cases re-render rather than replace.
- [ ] **Step 3: The two compound cases from spec §4.1.** A flip while a sibling tile in the same row is mid-flip: assert the END state of both tiles and that every box in the row is still 4:3, never a single batched frame, which the spec explicitly does not guarantee. And `live` to `load-failed` while the anchor HOLDS focus: existing behaviour, asserted unchanged, because `onFailure` hands the grid the anchor before the flip (`components/admin/wizard/step3ReviewSections.tsx:4245-4253`) and `handleTileFailure` moves focus forward, then backward, then to the grid (`components/admin/wizard/step3ReviewSections.tsx:4336-4348`).
- [ ] **Step 4: Observed red, implementation, observed green.**

### Task 4: Shrink to fit, on both surfaces

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4254` why=`the admin image ships object-cover, so the changed expectation at step3DiagramTile.chrome.test.tsx:144 fails on the className equality it asserts` ac=AC-12 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, `components/diagrams/Gallery.tsx`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx`, tests/components/diagrams/galleryTileFit.test.tsx (new).

Eric ruled this at 15:10 on 2026-08-31. The product-wide scope is part of the ruling, not an
inference from it.

- [ ] **Step 1: The gallery's first pin.** Nothing under `tests/` asserts either fit class on that surface today (verification V5), so AC-12's gallery clause is new coverage rather than a moved assertion.
- [ ] **Step 2: Observed red.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:144` asserts `img!.className.trim()` equals `"object-cover"`; the new gallery pin has nothing to hold onto.
- [ ] **Step 3: Two class edits.** `components/admin/wizard/step3ReviewSections.tsx:4254` and `components/diagrams/Gallery.tsx:757`. Both letterbox against a `bg-surface-sunken` plate that already exists and already meets its contrast pin: the anchor at `components/admin/wizard/step3ReviewSections.tsx:4237` on the admin side, the cell `<li>` at `components/diagrams/Gallery.tsx:651` on the crew side. The two aspect boxes differ and that is not reconciled here: the admin tile is `aspect-4/3`, the gallery cell `aspect-square`.
- [ ] **Step 4: The negative-control literals move with it.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:98-112` embed the fit class as DATA mirroring production rather than as an assertion about it, so they move or the controls stop mirroring the thing they control for.
- [ ] **Step 5: The one occurrence that does NOT move, stated rather than left to a reader.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:48` carries the fit class inside the `CHROME_TOKEN` doc comment, as a worked example of a regex-anchoring bug. It documents the token matcher, not the shipped fit; rewriting it would make the example disagree with the bug it explains. Left alone deliberately.
- [ ] **Step 6: Nothing else moves, checked rather than assumed.** Spec §7's three non-movers, each with the oracle that settles it: the padding-box assertion at `tests/e2e/step3-review-modal.layout.spec.ts:595` and the srcset-tier assertion at `tests/e2e/published-review-modal.layout.spec.ts:2079` both run in Tasks 6 and 7 and would red if the reasoning were wrong; the blur placeholder is settled by `docs/superpowers/specs/probes/2026-08-31-next-blur-background-size-probe.mjs`, re-run in this task's commit against the version its report records.
- [ ] **Step 7: Observed green**, both unit suites plus the two e2e specs.

### Task 5: The placeholder's edge stops being the faintest thing on screen

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4156` why=`the placeholder box ships border-border, so the positive pin on border-text-faint fails and the negative pin on border-border fails with it` ac=AC-8 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx`.

- [ ] **Step 1: A POSITIVE pin, because the suite has none.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:157`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:186-192` and `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:219-225` assert the placeholder's chrome SHAPE without pinning which border token, so the restyle is unguarded in both directions today. Add both arms: carries `border-text-faint`, does not carry `border-border`.
- [ ] **Step 2: Observed red** against `components/admin/wizard/step3ReviewSections.tsx:4156`.
- [ ] **Step 3: One token.** `border-border` becomes `border-text-faint`, matching the live box: 1.22-1.27:1 light becomes 3.02:1 light, over the 3:1 non-text floor. No NEW token pairing is introduced, so no new `DESIGN.md` contrast row is owed; the pair is already pinned at `DESIGN.md:184`.
- [ ] **Step 4: Observed green.**

### Task 6: The dimensional invariants, in a real browser

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/step3-review-modal.layout.spec.ts --project=desktop-chromium -g "T-DIAGRAM-CELL"` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4156` why=`the failed tile is a bare box with no wrapper, so the cell locator resolves to zero nodes and the mixed-row case cannot select a failed cell beside a live one` ac=AC-7 -->

**Files:** `tests/e2e/step3-review-modal.layout.spec.ts`.

jsdom computes no layout, so every relationship below is asserted by `getBoundingClientRect()`
within 0.5px, at 320, 390, 640 and 1072 CSS px, **with one failed tile beside a live tile in the
same grid row** so the stretch is actually exercised. Reproduced from spec §3.3 in full, per the
writing-plans rule.

| Parent | Child | Relationship | What guarantees it |
|---|---|---|---|
| grid cell | wrapper | wrapper fills the cell's width | `flex flex-col` on a block-level wrapper |
| wrapper | box | box width equals wrapper width | `w-full` on the box, unchanged |
| wrapper | box | box height equals box width times 3/4, exactly, at every viewport | `aspect-4/3` on the box; the box is a column-flex item with no `flex-grow` |
| grid row | wrapper | a tall failed wrapper does not stretch a live SIBLING's box | the sibling's wrapper stretches, its box does not |
| live box | placeholder box | equal width AND equal height in the same grid | both `aspect-4/3 w-full`; already pinned at `tests/e2e/step3-review-modal.layout.spec.ts:682-700` |

The fourth row is the one this design exists to protect, and the fifth is a ratified contract that
growing the BOX for the failed states would have broken.

- [ ] **Step 1: One `page.evaluate` per viewport**, resolving every element and returning plain numbers. Never a sequence of `locator.evaluate` calls: a re-render between two of them compares rects from two layout frames, and auto-wait hangs on a node that has unmounted.
- [ ] **Step 2: A premise on the mixed row**, via `premiseHolds` from `tests/_shared/premise.ts`, asserting on the case's OWN inputs that the row genuinely holds one failed and one live tile. A row that degenerates to all-live satisfies every stretch assertion vacuously.
- [ ] **Step 3: Expected widths derive from `diagramTileWidthAt`** (`components/admin/wizard/diagramTileGeometry.ts:51`), never hardcoded.
- [ ] **Step 4: Harness readiness**, per the checklist above: the existing `tests/e2e/_step3ReviewModalHarness.tsx` bundle, the hydration gate `tests/e2e/step3-review-modal.layout.spec.ts:544` already awaits, never `networkidle` alone.
- [ ] **Step 5: Observed red, implementation, observed green.**

### Task 7: The message is not merely present, it is readable

<!-- task: red=`pnpm heavy npx playwright test tests/e2e/step3-review-modal.layout.spec.ts --project=desktop-chromium -g "T-DIAGRAM-READABLE"` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4159` why=`the message renders inside the overflow-hidden aspect-4/3 box, so the not-a-descendant clause fails and the ancestor-containment walk finds that box clipping it` ac=AC-7b -->

**Files:** `tests/e2e/step3-review-modal.layout.spec.ts`.

A DOM assertion that the message is present passes just as well when the message is `display:none`
at a breakpoint, clipped by an ancestor, line-clamped, or laid out at zero height, and every one of
those is one responsive class away. So for each of the two failure states, at each of the four
viewports, all five clauses:

1. the message's `getBoundingClientRect().height` exceeds one line-height;
2. its own `scrollHeight` does not exceed its own `clientHeight`;
3. its computed `display` is not `none` and its `-webkit-line-clamp` is `none`;
4. **it is not a descendant of the box** (`element.contains()` against the `-diagram-tile-` element, asserted false);
5. **no ancestor clips it either**: walk from the message to the scroll container and, for every ancestor whose computed `overflow-x` or `overflow-y` is not `visible`, assert the message's rect is contained in that ancestor's rect.

Clauses 1 to 3 alone do not catch the implementation this design most invites, because the box's own
scroll box is not the one overflowing. Clause 4 is the specific instance worth naming; clause 5 is
the general form.

- [ ] **Step 1: The name line is exempt from clauses 2 and 5 by design.** It is `truncate`, so it is SUPPOSED to clip, and its full value stays in the `title`. Its assertion is that its `title` equals the untruncated name.
- [ ] **Step 2: Same-frame reads**, as Task 6 step 1: ancestor and message rects come from one `page.evaluate`, or containment is compared across two layout frames.
- [ ] **Step 3: Detach safety.** No sampler outlives its element; every read resolves inside the evaluate.
- [ ] **Step 4: Observed red, implementation, observed green.**

<!-- tasks: end -->

### Acceptance-criteria coverage map

Criteria are declared in the spec (§5.1) and claimed here, per the coverage-map convention.

| AC | Task |
|---|---|
| AC-1, AC-2, AC-10 | Task 2 |
| AC-3, AC-4, AC-5, AC-9, AC-11 | Task 1 |
| AC-6 | Task 3 |
| AC-7 | Task 6 |
| AC-7b | Task 7 |
| AC-8 | Task 5 |
| AC-12 | Task 4 |

## 12. Closeout

impeccable-gate: `/impeccable critique` + `/impeccable audit`, dispositions recorded here before the
whole-diff review.

- [ ] **Invariant-8 dual gate**, both halves, with the canonical v3 setup gates. P0 and P1 findings fixed or deferred with a `DEFERRED.md` entry.
- [ ] **Pre-code mechanical UI checklist**, run BEFORE Task 1 rather than discovered by the gate: no em dash in user-visible copy, straight apostrophes, 44px tap targets, canonical type and token classes.
- [ ] **Graduate all three rows** into DEFERRED-archive.md and remove the `**Status:** IN PROGRESS` markers, in the PR's LAST commit. An archive categorically rejects an in-flight entry, so the marker comes off in the same commit that archives the row, and a marker that reaches main names a branch the merge just deleted.
- [ ] **Unfixed peers** into the PR body and the readiness message. No new ledger row, of any facing.
- [ ] **Readiness to bl-orch** at pane wP:p28. The arc never merges.

## Self-review record

- **Spec coverage.** Every §5.1 criterion appears in the map above, and each of §5's nine new-coverage items lands in a task: items 1 and 2 in Task 2, items 3 and 4 in Task 1, item 5 in Task 3, items 6 and 7 in Tasks 6 and 7, item 8 in Task 5, item 9 in Task 1. §5.2's five "does not apply" declarations need no task by construction.
- **Ordering.** Every task authors its tests and observes red before its production change, and the same command passes after. Task 2 is the one `red-state=live` marker and it is live only at the head of Task 1, which is stated in its `why=`: the census cannot fail until the caption has moved. No task reds on scaffolding it creates itself.
- **RED validity.** Each `red-target=` names a production line verified on the live tree at `00c184c02`: the name line at `components/admin/wizard/step3ReviewSections.tsx:4174`, the shared string at `components/admin/wizard/step3ReviewSections.tsx:4159`, the reconcile at `components/admin/wizard/step3ReviewSections.tsx:4149`, the border token at `components/admin/wizard/step3ReviewSections.tsx:4156`, the fit class at `components/admin/wizard/step3ReviewSections.tsx:4254`. None derives from a fixture the test itself writes.
- **Anti-tautology.** Task 1's five live-negatives get a positive discriminator rather than a re-scope, which is the whole of AC-11: a re-scope alone leaves them passing against a placeholder. Task 2 asserts both directions per sentence, so a split that threads the state and renders one string still fails, and reaches AC-2 by a real error event rather than a seed. Task 6 carries a premise that the mixed row genuinely holds one failed and one live tile on that case's own inputs. Task 7's clauses 4 and 5 exist precisely because clauses 1 to 3 pass against the wrong implementation.
- **Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N".
- **Not restated from the spec.** The transition inventory and the dimensional-invariant table are reproduced in Tasks 4 and 7 because the writing-plans rules require the task body to carry them. Everything else is cited.
