# The diagram tile says which of three things happened: implementation plan

Spec: `docs/superpowers/specs/2026-08-31-diagram-tile-states.md`. Branch `fix/diagram-tile-states`,
worktree `/Users/ericweiss/FX-worktrees/diagtile`. Closes `DIAGRAMTILE-FAILURE-STATE-COPY-1`,
`DIAGRAMTILE-LIVE-TILE-UNLABELLED-1` and `DIAGRAMTILE-OBJECT-COVER-CROPS-1` in the repo-root
`DEFERRED.md`.

## Global Constraints

- **Invariant 1 (TDD).** Every task: failing test, minimal implementation, passing test, commit. No implementation before its test.
- **Invariant 6 (commit per task).** Scope is admin wizard UI plus one crew component: `feat(admin)`, `fix(admin)`, `test(admin)`, `fix(crew-page)` for the gallery, `docs(plan)`.
- **Invariant 8 (the UI dual gate).** Both halves run on the diff before the whole-diff review. This arc touches `components/` twice, so the gate is not optional. The commands are deliberately NOT named here: see the marker note under Closeout.
- **Invariant 11.** All work in `/Users/ericweiss/FX-worktrees/diagtile`. Never the main checkout.
- **Invariant 12.** The three ledger rows are marked IN PROGRESS on the branch and graduate in the PR's last commit, in the closeout below, never on main.
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

**V3: is `TriangleAlert` importable where the spec puts it? (negative; the glyph task rests on it).**

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
Task 4 states this rather than leaving a reader to wonder whether the sweep missed it.

**V5: does anything already pin the gallery's fit class? (negative; AC-12 rests on it).**

The first draft of this row recorded `(no output)` for a command nobody had run, which plan review
round 1 caught. The command and its REAL output:

```
$ rg -n "object-cover|object-contain" tests/
tests/lib/maps/staticMap.test.ts:45                        prose, static-map tile sizing
tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx:1011   prose
tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx:1012   pins the LIGHTBOX image
tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:48, 98, 99, 104, 105, 112, 144
```

Ten matches in three files, not zero. The CONCLUSION survives and is now argued rather than
asserted: `GalleryLightboxPinchZoom.test.tsx:1012` asserts
`className="size-full select-none object-contain"` on the LIGHTBOX image, which is a different
element from the thumbnail this arc changes; the `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` matches are the admin tile; the
static-map match is prose about an unrelated surface. **Nothing pins the crew gallery THUMBNAIL's
fit class**, so AC-12's gallery clause is the first pin on that element, as the spec says. Task 4's
new suite scopes to `[data-testid^="diagram-slot-"] img` for exactly this reason: a document-wide
search would let the lightbox's `object-contain` satisfy a claim about the thumbnail's.

**V6: do the plan's Playwright commands actually COLLECT anything? (the class behind V5).**

A `red=` that selects zero tests exits 0 and reports green from the moment it is written. Round 1
found both of this plan's Playwright commands doing exactly that, so they are probed rather than
trusted:

```
$ npx playwright test tests/e2e/step3-review-modal.layout.spec.ts --project=desktop-chromium --list
Total: 0 tests in 0 files          # what the first draft shipped; exit 1, "No tests found"

$ npx playwright test --config tests/e2e/standalone.config.ts \
    tests/e2e/step3-review-modal.layout.spec.ts --project=standalone-chromium --list
Total: 44 tests in 1 file

$ npx playwright test --config tests/e2e/standalone.config.ts \
    tests/e2e/step3-review-modal.interactions.spec.ts --project=standalone-chromium --list
Total: 33 tests in 1 file
```

`step3-review-modal.layout` is in the explicit allow-list of `tests/e2e/standalone.config.ts:85`
under project `standalone-chromium` (`tests/e2e/standalone.config.ts:100`). The default config's
`desktop-chromium` allow-list (`playwright.config.ts:96-97`) carries
`step3-review-modal.interactions` and `published-review-modal.layout` but NOT
`step3-review-modal.layout`. Tasks 2 and 4 use the config-and-project form above.

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
- **(b) Readiness gate**, and it is NOT a hydration wait, which the first draft of this section wrongly claimed. `openHarness` (`tests/e2e/step3-review-modal.layout.spec.ts:237-249`) does two things that matter: `page.emulateMedia({ reducedMotion: "reduce" })`, which collapses the panel entrance animation through the `prefers-reduced-motion` block in `app/globals.css` so **geometry is final on load** and no animation-end wait is needed, and `await page.evaluate(() => document.fonts.ready)`, which is the actual gate. The font gate is load-bearing rather than incidental: AC-7b's first clause measures the message against ONE LINE-HEIGHT, and a fallback font resolves to a different one, so measuring before fonts settle fails in the direction that passes. Never `networkidle` alone, and there is no `networkidle` in that spec.
- **(c) Detach safety.** Every rect is read in ONE `page.evaluate` that resolves each element and returns plain numbers, never a sequence of `locator.evaluate` calls that can outlive a re-render. This is also what keeps the readability walk in AC-7b consistent: ancestor and message rects must come from the same layout frame or containment is compared across two.
- **(d) Two harnesses, because one cannot reach both failure states.** The layout spec renders through `renderToStaticMarkup` (`tests/e2e/_step3ReviewModalHarness.tsx:344`), and its own comment says so: static markup has no hydration, so `onError` is never attached (`tests/e2e/step3-review-modal.layout.spec.ts:207-212`). `absent` is seeded from props and therefore renders statically; `load-failed` is reachable ONLY by a real error event and therefore cannot exist there at all. `tests/e2e/step3-review-modal.interactions.spec.ts` builds a live page from an esbuild bundle into an empty `#root` (`tests/e2e/step3-review-modal.interactions.spec.ts:145`), so it is hydrated and interactive. AC-7b is split across the two on that boundary, in Task 2. The hydrated spec has its OWN opener, `openLive` (`tests/e2e/step3-review-modal.interactions.spec.ts:202`), which does the same reduced-motion and `document.fonts.ready` steps and then adds the gate the static spec has no need of: `await expect(page.locator(PANEL)).toBeVisible()`, which is what waits for the bundle to mount. Citing the layout spec's `openHarness` for both arms would be wrong.
## File structure

New files are written unbackticked here because they do not exist yet; a citation to an untracked
path is a lint failure, and a plan that dodges it by not naming the file is worse.

| File | Responsibility | Task |
|---|---|---|
| `components/admin/wizard/step3ReviewSections.tsx` | wrapper and cell id; caption out of the box; three-state union, sentences, glyphs; fit class; border token | 1, 2, 3, 4, 5 |
| tests/components/admin/wizard/step3DiagramTile.states.test.tsx (new) | AC-9; AC-3/4/5; AC-1/2/6 | 1, 2, 3 |
| `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` | census re-scope; the broken premise and `[title]` lookup | 2 |
| `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx` | census re-scope; three of the five live-negatives | 2 |
| `tests/components/admin/wizard/step3DiagramTile.published.test.tsx` | census re-scope; one live-negative | 2 |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx` | census re-scope; one live-negative; the cap count | 2 |
| `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` | census re-scope (the `.textContent` site) | 2 |
| `tests/e2e/step3-review-modal.layout.spec.ts` | AC-7 dimensional invariants (Task 2); AC-7b's `absent` arm, authored in 2 and green in 3 | 2, 3 |
| `tests/e2e/step3-review-modal.interactions.spec.ts` | AC-7b's `load-failed` arm, which needs hydration; authored in 2, green in 3 | 2, 3 |
| `tests/styles/tapTargetCensus.ts`, `tests/styles/subtleInteractiveExemptions.ts` | three line-keyed rows relocated by running their scanners | 2, 3 |
| `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` | the fit expectation and its negative controls; the border pin | 4, 5 |
| `components/diagrams/Gallery.tsx` | the crew thumbnail's fit class; the crew cell's border token | 4, 5 |
| tests/components/diagrams/galleryTileFit.test.tsx (new) | AC-12's first pin on the gallery thumbnail; the crew border pin | 4, 5 |

---

<!-- tasks: depth=3 red-contract -->

Five tasks. Round 2 showed the six-task shape could not satisfy its own contract: **all of the
production change sat in the first four tasks, so the two browser tasks had nothing left to make
red.** A task whose files are all tests, running after the implementation its assertions need, goes
green the moment it is authored. The decomposition below is therefore by PRODUCTION INCREMENT: each
task owns one change to shipped code, and carries every assertion that change turns green, unit and
browser alike.

### Task 1: The wrapper, and the handle the cap depends on

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4152` why=`both branches return the box element directly with no wrapper around it, so the cell testid resolves to zero nodes and every AC-9 assertion fails on an absent element` ac=AC-9 -->

**Files:** tests/components/admin/wizard/step3DiagramTile.states.test.tsx (new), `components/admin/wizard/step3ReviewSections.tsx`.

- [ ] **Step 1: The AC-9 cases.** `data-testid` stays on the box in every state; the wrapper carries a `-diagram-cell-` id; the `-diagram-tile-` prefix count over a full grid still equals `DIAGRAM_TILE_CAP` (`components/admin/wizard/step3ReviewSections.tsx:4077`, value 12); the cell contains the box and not the reverse.
- [ ] **Step 2: A premise that the grid rendered MORE stubs than the cap**, on the case's own inputs. A count of 12 against 12 stubs proves nothing about capping.
- [ ] **Step 3: Observed red.** `components/admin/wizard/step3ReviewSections.tsx:4152` returns the placeholder `<span>` directly and the live branch returns the `<a>` directly; there is no wrapper element in either, so the cell query finds nothing.
- [ ] **Step 4: The wrapper.** A `<span className="flex flex-col gap-1">` around the box. It is a grid item, so it is blockified and the flex column applies; the box keeps its width through its own `w-full` rather than through any `align-items` default, which Tailwind v4 does not give `.flex`.
- [ ] **Step 5: The cell id is a SIBLING prop, never a rewrite of the tile id.** `testId` is built inline at the call site from `dfid` and `i` (`components/admin/wizard/step3ReviewSections.tsx:4406`); the cell id is built there from the same two parts. Deriving one from the other by string substitution is what makes a prefix selector count the wrapper as a tile.
- [ ] **Step 6: Why the segment is `-diagram-cell-`.** Five prefix consumers require the literal `-diagram-tile-`: the four CSS selectors in verification V2 plus the `TILE_PREFIX` constant at `tests/components/admin/wizard/step3ReviewSections.test.tsx:749` that three queries in that file derive from. A cell id sharing the tile prefix would restore the defect the comment at `components/admin/wizard/step3ReviewSections.tsx:4166-4172` records, where the cap assertion read 24 where 12 was correct.
- [ ] **Step 7: One near miss, checked and left alone.** `tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx:375` selects `[data-testid*="diagram" i]`, a case-insensitive SUBSTRING, which the new cell id does match. It is the only one of the corpus's 27 substring selectors mentioning "diagram", and it is a single `querySelector` used as a `.not.toBeNull()` premise, so an additional match cannot change its verdict.
- [ ] **Step 8: Observed green**, plus the five census suites, which this task does not yet disturb: the caption has not moved, so every existing assertion still reads the box it was written against.

### Task 2: The caption leaves the box

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx tests/components/admin/wizard/step3DiagramTile.staged.test.tsx tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx tests/components/admin/wizard/step3DiagramTile.published.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4174` why=`the name line exists only inside the failed branch, so the live tile has no name node and every AC-3 assertion fails on an absent element` ac=AC-3,AC-4,AC-5,AC-7,AC-11 -->

**Files:** tests/components/admin/wizard/step3DiagramTile.states.test.tsx, the five census suites, `tests/e2e/step3-review-modal.layout.spec.ts`, `tests/e2e/step3-review-modal.interactions.spec.ts`, `components/admin/wizard/step3ReviewSections.tsx`.

One production change, the caption moving out of the box, and everything it turns green. The browser
oracles live HERE and not in a later task for the reason round 2 gave: after this change the message
is already outside the box, so an AC-7b authored later could never be red.

- [ ] **Step 1: The unit cases.** AC-3: a live tile renders its name as visible text carrying `aria-hidden="true"`. AC-4: both failed states render the name WITHOUT `aria-hidden`. AC-5: with `alt` empty or whitespace, no name line renders in any state and the anchor's `aria-label` still falls back to `Staged diagram (opens in a new tab)`.
- [ ] **Step 2: AC-5 constructs `DiagramTile` DIRECTLY, and the plan says why.** The grid can never hand it an empty alt: the call site falls back to `Diagram from ${stub.sheetTab}` (`components/admin/wizard/step3ReviewSections.tsx:4414`, widened from `??` to `||` after an impeccable audit P2 on nameless links), and there is exactly one `<DiagramTile>` call site in the repo. So AC-5 guards DEFENSIVE component-level behaviour, not a reachable app state. Going through the grid would render a name line and fail the case for a reason unrelated to the component. Corpus precedent for constructing it directly: `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:221` scopes to a custom `noname-tile` testid for exactly this.
- [ ] **Step 3: The browser oracles, authored now because now is when they can be red.** Both under the config and project that actually collect these files (verification V6). AC-7's five dimensional relationships, from spec §3.3, `getBoundingClientRect()` within 0.5px, with one failed tile beside a live tile so the stretch is exercised. **The four viewports need their own table, because this spec does not have them.** It parameterizes by modal MODE (`tests/e2e/step3-review-modal.layout.spec.ts:95-99`, 390 / 800 / 1280), a different axis: `components/admin/wizard/diagramTileGeometry.ts:55` flips 3 columns to 4 at 640 and `components/admin/wizard/diagramTileGeometry.ts:52` flips the outer padding at that same width, and `components/admin/wizard/diagramTileGeometry.ts:48` says the tile is constant only from 1072 up, so MODES crosses neither boundary and only 390 is shared. Add a `TILE_VIEWPORTS` table of 320 / 390 / 640 / 1072 beside MODES and leave the MODES tests untouched; the form and the 320 sample both have precedent against this same modal at `tests/e2e/step3-review-modal.agenda.spec.ts:68`. The column count at each viewport is asserted as a premise, or the table is not exercising the boundary it exists for.

| Parent | Child | Relationship | What guarantees it |
|---|---|---|---|
| grid cell | wrapper | wrapper fills the cell's width | `flex flex-col` on a blockified grid item |
| wrapper | box | box width equals wrapper width | `w-full` on the box, unchanged |
| wrapper | box | box height equals box width times 3/4, exactly, at every viewport | `aspect-4/3` on the box; a column-flex item with no `flex-grow` |
| grid row | wrapper | a tall failed wrapper does not stretch a live SIBLING's box | the sibling's wrapper stretches, its box does not |
| live box | placeholder box | equal width AND equal height in the same grid | both `aspect-4/3 w-full`; already pinned at `tests/e2e/step3-review-modal.layout.spec.ts:682-700` |

- [ ] **Step 4: AC-7b is NOT discharged here, and the reason is arithmetic.** Its first clause requires the message to exceed one line-height at every viewport, and at this task the message is still the shared 19-character `Preview unavailable`. At roughly 113px in the shipped 12px face that sits on ONE line inside the 121.5px tile at 640 and the 169.5px tile at 1072 (`components/admin/wizard/diagramTileGeometry.ts:34`), so the clause fails and no implementation in this task can make it pass. The two ratified sentences are what make it true, and they land in Task 3, which is where AC-7b is claimed and where both e2e specs are re-run. **AC-7 stays here**, because every relationship in the table above is about the BOX and is independent of how long the caption's text is; the fourth row needs only that the failed cell be TALLER than the live one, which one message line already achieves.
- [ ] **Step 5: Clause 1 depends on the font gate.** Both openers await `document.fonts.ready`; a fallback font resolves to a different line-height, so measuring early fails in the direction that passes. Reduced-motion emulation is what makes the geometry final on load in both.
- [ ] **Step 6: One `page.evaluate` per viewport**, resolving every element and returning plain numbers. Never a sequence of `locator.evaluate` calls: a re-render between two compares rects from two layout frames, and auto-wait hangs on a node that has unmounted. Expected widths derive from `diagramTileWidthAt` (`components/admin/wizard/diagramTileGeometry.ts:51`), never hardcoded.
- [ ] **Step 7: Observed red.** `components/admin/wizard/step3ReviewSections.tsx:4174` is `{strippedAlt ? (` inside the failed branch that returns at `components/admin/wizard/step3ReviewSections.tsx:4152`, so the live tile has no name node; and the message renders inside the `overflow-hidden aspect-4/3` box, so clause 4 fails and clause 5 finds that box clipping it.
- [ ] **Step 8: The name line and the message, once, outside the box.** The message carries `data-diagram-message`; the name line is addressed by its `title`, as the corpus already does at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:196`. The name line, in every state: Plain `text-xs`, `truncate`, `title={strippedAlt}`. `aria-hidden="true"` in the live state only, because there the anchor already carries the name (`components/admin/wizard/step3ReviewSections.tsx:4199-4201`); in the two failed states there is no anchor, so the caption is the only accessible text and must stay announced. Same argument that emptied the image's `alt` at `components/admin/wizard/step3ReviewSections.tsx:4242`. The message moves out with it.
- [ ] **Step 9: The loud red, same commit.** Moving the caption reds thirteen existing sites at once: the ten positive `getByText` sites, the `.textContent` site at `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:903`, the premise at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:188-191`, and the `[title]` lookup at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:196-199`. All thirteen re-point from the box to the cell. Two carry non-standard scopes and are NOT uniform: `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:221` uses a custom `noname-tile` testid (it IS the box, so it re-points), and `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:157` is scoped to a `reconcile-loader` wrapper rather than a tile.
- [ ] **Step 10: AC-11, and what it actually requires, which is less than the spec claims.** Spec §5.0 says the five live-negatives "pass SILENTLY and become vacuous". Read one at a time, that is true of none of them: each already carries an assertion that fails on a placeholder — `container.querySelectorAll("img").length` is 1 at `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:84` and `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:118`, the same plus a variant `src` at `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:157`, a non-null tile-scoped `img` plus the full srcset ladder at `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:275`, and `tagName === "A"` plus a non-null `img` at `tests/components/admin/wizard/step3ReviewSections.test.tsx:841`. What goes vacuous is the single `queryByText` LINE inside each, not the test. **So this task does NOT add discriminators.** It re-scopes each `queryByText` line to the cell so it keeps meaning, and scopes the two that count images on `container` rather than on the tile, which is a real if small improvement. **This diverges from spec §5.0 and AC-11's framing, deliberately and on the record**; the spec is canonical and is not being edited, and the divergence goes to the orchestrator rather than being silently absorbed.
- [ ] **Step 11: The verification that replaces the mutant proof round 2 refuted.** Pinning the component's failed branch kills all five, but on their PRE-EXISTING assertions, which is why a mutant count settles nothing about any new discriminator. The property AC-11 actually names is "each of the five fails when the tile is a placeholder", and the evidence is the enumeration in step 10, each read at its cited line. Record that reading, not a mutant tally.
- [ ] **Step 12: Four pre-dispatch mutants** on every string-presence assertion this task adds: the value emptied; the expected content plus an appended suffix; the content present but not live (the name in an attribute only); each discriminating parameter varied in turn.
- [ ] **Step 13: Relocate three line-keyed census rows.** This task and Task 3 both move lines in `components/admin/wizard/step3ReviewSections.tsx`. Three rows are line-keyed and shift: `tests/styles/tapTargetCensus.ts:325`, `tests/styles/subtleInteractiveExemptions.ts:79` and `tests/styles/subtleInteractiveExemptions.ts:112`. `tests/styles/controlOutlineResidue.ts:1038` is keyed by `{file, tag, paint, category, reason}` and does not move. **Relocate by running each scanner and confirming identity, never by adding a delta** — the tap-target row's own comment is a chain of eight relocations saying exactly that, and two of the three name their identity handle already (the `<a>` for the tap-target row, a unique `data-testid` for the ignored-summary row).
- [ ] **Step 14: Observed green**, on the new suite, the five census suites, both e2e specs, and the three census suites touched in step 13.

### Task 3: Three states, two sentences, two glyphs, and every transition

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx tests/components/admin/wizard/step3DiagramTile.staged.test.tsx tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx tests/components/admin/wizard/step3DiagramTile.published.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4159` why=`one string renders for both failed states, so every case asserting WHICH failed state the tile landed on fails on that line, and the shared string is short enough to sit on one line at the wider tiles so AC-7b's first clause fails with them` ac=AC-1,AC-2,AC-6,AC-7b,AC-10 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, tests/components/admin/wizard/step3DiagramTile.states.test.tsx, the five census suites, `tests/e2e/step3-review-modal.layout.spec.ts` and `tests/e2e/step3-review-modal.interactions.spec.ts`.

**This task owns the census re-TEXT, and Task 2 owned only the re-SCOPE.** Task 2 moved seventeen
assertions from the box to the cell; this task deletes the string all seventeen name. Splitting the
census by WHERE and forgetting WHAT is how a task's own production change leaves twelve suites red
that no later task owns.

The transitions live here because this is the task that makes them observable. **Precisely which
cases are red, since round 2 caught the earlier overclaim:** the cases asserting a FAILED landing
state fail, because both failed states render one string and cannot be told apart. The cases landing
on `live` pass before and after, and so does the unreachable `absent → load-failed` case; they are
coverage, not the red, and the task does not pretend otherwise.

- [ ] **Step 1: The copy cases, both directions each.** AC-1: seeded `hasPreviewSource: false` renders `Not captured. Won't appear on the crew page.` and NOT the load-failed sentence. AC-2: a mounted image that fires a real `onError` renders `Preview couldn't load. The diagram will still publish.` and NOT the absent sentence. Both directions is what catches a split that threads the state and still renders one string.
- [ ] **Step 2: AC-2 is reached by a real error event on a mounted image**, never by seeding a `load-failed` prop. A seed-only test passes against a seed-only implementation.
- [ ] **Step 3: The transition matrix (AC-6)**, from spec §4.1. Three states, six ordered transitions, every one INSTANT with no animation in this component.

| Ordered transition | Reachable | Driver | Red before the union? |
|---|---|---|---|
| `live` to `absent` | yes | reconcile, `hasPreviewSource` goes false | yes, the landing state is unnameable |
| `live` to `load-failed` | yes | `onError` on the mounted image | yes, same |
| `absent` to `live` | yes | reconcile, a good source arrives | no, lands on `live` |
| `load-failed` to `live` | yes | reconcile, `href` or `sourceKey` moves | no, lands on `live` |
| `load-failed` to `absent` | yes | reconcile, `hasPreviewSource` goes false | yes, the landing state is unnameable |
| `absent` to `load-failed` | **no** | no image mounts in `absent`, so `onError` cannot fire | no, passes throughout |

- [ ] **Step 4: Every transition driven through a stable React key.** The grid keys tiles by `${stub.objectId}-${i}`; the cases hold `objectId` fixed and re-render rather than replace. A remount would seed fresh state and every case would pass without the reconcile existing at all.
- [ ] **Step 5: The two compound cases from spec §4.1.** A flip while a sibling in the same row is mid-flip: assert the END state of both and that every box in the row is still 4:3, never a single batched frame, which the spec does not guarantee. And `live` to `load-failed` while the anchor HOLDS focus: existing behaviour, asserted unchanged, because `onFailure` hands the grid the anchor before the flip (`components/admin/wizard/step3ReviewSections.tsx:4245-4253`) and `handleTileFailure` moves focus forward, then backward, then to the grid (`components/admin/wizard/step3ReviewSections.tsx:4336-4348`).
- [ ] **Step 6: Observed red** against `components/admin/wizard/step3ReviewSections.tsx:4159`.
- [ ] **Step 7: The union.** `type DiagramTileState = "live" | "absent" | "load-failed"`. The seed at `components/admin/wizard/step3ReviewSections.tsx:4120` becomes `hasPreviewSource ? "live" : "absent"`; the reconcile at `components/admin/wizard/step3ReviewSections.tsx:4149` re-seeds on the same rule; the `onError` handler at `components/admin/wizard/step3ReviewSections.tsx:4245-4253` writes `"load-failed"` AFTER calling `onFailure`. That order is load-bearing and unchanged: after the flip there is no anchor left to move focus off.
- [ ] **Step 8: The glyph split.** `TriangleAlert` for `absent`, `ImageOff` for `load-failed`, both `size-4 text-text-subtle` and `aria-hidden`. Glyph carries the state, not colour. **`TriangleAlert` is not imported today** (verification V3): add it to the existing `lucide-react` import at `components/admin/wizard/step3ReviewSections.tsx:47`. That single line shifts every line below it, so the three line-keyed census rows from Task 2 step 13 are re-checked here by the same procedure.
- [ ] **Step 9: The census re-TEXT, twelve positives, split by the state each one sets up.** After step 7 the string these name no longer renders, so each moves to the sentence its own fixture earns. **Eight absent-state positives** take `Not captured. Won't appear on the crew page.`: `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:210` and `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:226`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:95`, `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:176`, `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:190` (the `premiseHolds`) and `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:221`, `tests/components/admin/wizard/step3ReviewSections.test.tsx:815` and `tests/components/admin/wizard/step3ReviewSections.test.tsx:843`. **Four load-failed positives** take `Preview couldn't load. The diagram will still publish.`: `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:181`, `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:233` and `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:254`, `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:903`. The state of each is read off what its test SETS UP, never off the string it currently asserts.
- [ ] **Step 10: The five live-negatives, which would otherwise pass forever on a string that can never render.** `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:275`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:84`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:118` and `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:157`, and `tests/components/admin/wizard/step3ReviewSections.test.tsx:841` each assert `Preview unavailable` is ABSENT. After this task that is true of every tile in every state, so the assertion stops discriminating in a second, worse way than Task 2 addressed. Each becomes "neither sentence renders", which keeps the both-directions discipline the copy cases use. Their existing positive discriminators (Task 2 step 10) are untouched and still carry the real weight.
- [ ] **Step 11: Four pre-dispatch mutants per sentence.**
- [ ] **Step 12: AC-7b, claimed here because the copy is what makes its first clause true.** Task 2 authored the five clauses and left them red on clause 1: the shared string sits on one line inside the 121.5px tile at 640 and the 169.5px tile at 1072. The two ratified sentences, at 44 and 53 characters, wrap at every one of the four tile widths, which is what the six-line wrap recorded in spec §3.4 is the extreme of. Both e2e specs are re-run here — the `absent` arm in the static layout spec, the `load-failed` arm in the hydrated interactions spec, per harness readiness (d) — and this is where AC-7b goes green. Clauses 2 to 5 were already satisfied by Task 2's caption move and must STAY satisfied; re-running both specs is what proves the longer copy did not push the message back into a clipping ancestor.
- [ ] **Step 13: Observed green**, on the states suite, all five census suites, both e2e specs, plus `pnpm vitest run tests/styles/_metaEmDashCopy.test.ts` for AC-10. That guard walks `components` from the filesystem, and the file's `SENTINEL_ANCHORS` entry (`tests/styles/_metaEmDashCopy.test.ts:211`) is keyed by an expression's own source text rather than by file, so the allowance cannot be inherited by new copy and the two sentences are genuinely scanned. Do not disturb the three registered anchors; a stale allowance is itself a failure.

### Task 4: Shrink to fit, on both surfaces

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx tests/components/diagrams/galleryTileFit.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:757` why=`the crew thumbnail ships object-cover with nothing pinning it, so the new gallery test fails, and step 2 flips the admin expectation to object-contain before any production edit so that assertion fails too` ac=AC-12 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, `components/diagrams/Gallery.tsx`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx`, tests/components/diagrams/galleryTileFit.test.tsx (new).

Eric ruled this at 15:10 on 2026-08-31; the product-wide scope is part of the ruling.

- [ ] **Step 1: The gallery's first pin, scoped to the thumbnail.** Verification V5 shows the only existing `object-contain` assertion in `tests/` is on the LIGHTBOX image (`tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx:1012`), a different element. The new suite scopes to `[data-testid^="diagram-slot-"] img` (the cell testid is set at `components/diagrams/Gallery.tsx:636`) and carries a premise that with the lightbox closed every rendered image IS a thumbnail, so the scope cannot silently widen.
- [ ] **Step 2: Flip the admin EXPECTATION first, before any production edit.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:144` asserts `img!.className.trim()` equals `"object-cover"` and passes today; changing the expectation to `"object-contain"` is what makes it red. Round 2 caught this ordering missing: without it only the new gallery test is red and the admin half of AC-12 rides along unproved.
- [ ] **Step 3: Observed red**, on both suites.
- [ ] **Step 4: Two class edits.** `components/admin/wizard/step3ReviewSections.tsx:4254` and `components/diagrams/Gallery.tsx:757`. Both letterbox against a `bg-surface-sunken` plate that already exists: the anchor at `components/admin/wizard/step3ReviewSections.tsx:4237`, the cell `<li>` at `components/diagrams/Gallery.tsx:651`. The two aspect boxes differ and that is not reconciled here: the admin tile is `aspect-4/3`, the gallery cell `aspect-square`.
- [ ] **Step 5: The negative-control literals move with it.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:98-112` embed the fit class as DATA mirroring production rather than as an assertion about it, so they move or the controls stop mirroring what they control for.
- [ ] **Step 6: The one occurrence that does NOT move.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:48` carries the fit class inside the `CHROME_TOKEN` doc comment as a worked example of a regex-anchoring bug. It documents the token matcher, not the shipped fit; rewriting it would make the example disagree with the bug it explains.
- [ ] **Step 7: Spec §7's three non-movers, with the oracle for each.** The padding-box assertion at `tests/e2e/step3-review-modal.layout.spec.ts:595` and the srcset-tier assertion at `tests/e2e/published-review-modal.layout.spec.ts:2079` are re-run here **unfiltered** — `pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/published-review-modal.layout.spec.ts --project=standalone-chromium`, with no `-g`, because the `-g` filters used elsewhere in this plan exclude both. Round 2 caught the earlier claim that Tasks 5 and 6 already ran them; they did not. The blur placeholder is settled by `docs/superpowers/specs/probes/2026-08-31-next-blur-background-size-probe.mjs`, re-run in this commit against the version its report records.
- [ ] **Step 8: Observed green**, both unit suites plus the two e2e specs unfiltered.

### Task 5: The faint edge, on both surfaces

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx tests/components/diagrams/galleryTileFit.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4156` why=`both boxes ship border-border, so the positive pin on border-text-faint fails on each and the negative pin on border-border fails with it` ac=AC-8 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, `components/diagrams/Gallery.tsx`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx`, tests/components/diagrams/galleryTileFit.test.tsx.

**Scope note, and it is a ruling rather than an inference.** AC-8 is written for the admin
placeholder alone. Eric ruled on 2026-08-31, after the spec was approved, that the crew gallery cell
is IN SCOPE for this arc on the same consistency argument as the letterbox ruling, the surface being
open in Task 4 already. So this task discharges AC-8 and additionally restyles
`components/diagrams/Gallery.tsx:651` under that ruling. No new ledger row, of any facing; the spec
is not edited, and the divergence is declared here rather than absorbed.

- [ ] **Step 1: A POSITIVE pin on each, because neither suite has one.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:157`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:186-192` and `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:219-225` assert the placeholder's chrome SHAPE without pinning which border token, so the restyle is unguarded in both directions today; the gallery has no border pin at all. Add both arms on both surfaces: carries `border-text-faint`, does not carry `border-border`.
- [ ] **Step 2: Observed red** against `components/admin/wizard/step3ReviewSections.tsx:4156` and `components/diagrams/Gallery.tsx:651`.
- [ ] **Step 3: One token, twice.** `border-border` becomes `border-text-faint` on both: 1.22-1.27:1 light becomes 3.02:1 light, over the 3:1 non-text floor. `DESIGN.md` §1.2a is the rule — a box filled with one of the four neutral grounds carries no visual weight of its own, so its stroke IS its boundary and takes the text ramp. No NEW token pairing is introduced on either surface, so no new `DESIGN.md` contrast row is owed; the pair is already pinned at `DESIGN.md:184`.
- [ ] **Step 4: Check the crew cell against the control rows before assuming the admin argument transfers.** The gallery cell wraps a `<button>` and carries `has-[button:focus-visible]:ring-2` (`components/diagrams/Gallery.tsx:651`), so it may sit on a different `DESIGN.md` row than the admin placeholder. The ruling settles that it changes; it does not settle which row justifies it, and the plan should not pretend otherwise. Confirm against `DESIGN.md` §1.2a and record which row applies.
- [ ] **Step 5: The remaining peer, checked and NOT swept in.** `components/admin/wizard/step3ReviewSections.tsx:2415` is a callout box with the same `bg-surface-sunken border border-border` paint. It is not a diagram surface, this arc does not otherwise open it, and no ruling covers it. `tests/styles/controlOutlineResidue.ts:1038` censuses the pack-case count PILL, a different element again, and does not move. Both stay, and both go in the PR body under "Unfixed peers".
- [ ] **Step 6: Observed green**, both suites, plus `pnpm vitest run tests/styles/_metaControlOutlineResidue.test.ts` and `tests/styles/tintedPlateOutline.test.ts` to confirm no census row was owed by either edit.

<!-- tasks: end -->

### Acceptance-criteria coverage map

Criteria are declared in the spec (§5.1) and claimed here, per the coverage-map convention.

| AC | Task |
|---|---|
| AC-9 | Task 1 |
| AC-3, AC-4, AC-5, AC-7, AC-11 | Task 2 |
| AC-1, AC-2, AC-6, AC-7b, AC-10 | Task 3 |
| AC-12 | Task 4 |
| AC-8 | Task 5 |

## 12. Closeout

**Marker convention, and why this plan names neither command.** The invariant-8 meta-test treats
the two command names as the declaration trigger (`tests/docs/_invariant8Closeout.ts:39-40`), and a
declaring unit must carry a conforming `impeccable-gate:` marker. The marker grammar has no
pending form, so a plan that names the commands before the gate has run can only carry a MALFORMED
marker. This plan therefore carries neither the trigger phrases nor a marker, and the commit that
actually runs the gate adds the phrases, the marker and the green result atomically. That is the
established convention on this fleet, not a new one invented here: the wizignore arc set the
precedent and it is recorded in fleet memory. The forcing function is the marker grammar meta-test
plus closeout review, which is an accepted cost (bl-orch ruling, 2026-08-31).

Both halves run on the diff, with the canonical v3 setup gates, and their dispositions are recorded
here before the whole-diff review.

- [x] **Invariant-8 dual gate**, both halves, with the canonical v3 setup gates. Results below.
- [x] **Pre-code mechanical UI checklist**: no em dash in user-visible copy (`tests/styles/_metaEmDashCopy.test.ts` green), straight apostrophes (ratified, spec §2), 44px tap targets (`_metaTapTargetFloor` green; the tile anchor is 74x55.5 at its narrowest and is censused), canonical type and token classes (`text-xs`, `text-xs/relaxed`, `text-text-subtle`, `border-text-faint`, `bg-surface-sunken` — no hex, no arbitrary values).

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=1 dispositions=recorded

### `/impeccable critique` — DEGRADED, and the reason

**⚠️ DEGRADED: single-context (both sub-agents ran but never returned their reports to the parent).**
Assessment A and Assessment B were dispatched as two isolated parallel sub-agents, as the command
requires. Both executed. Neither delivered its report across three retrieval attempts, going idle
each time without returning text. Rather than wait further or claim a dual-agent run, the assessments
were completed in the parent and the banner is stated here, which is what the command asks for when a
run degrades. What is NOT degraded is the evidence: the detector was run, both spec probes were run,
the contrast arithmetic was computed, and the real-browser measurements come from the arc's own
Playwright oracles at four viewports.

**Anti-patterns: PASS.** No gradient text, no glassmorphism, no side-stripe border, no hero-metric
block, no uppercase tracked eyebrow, no numbered section markers. The tile grid is not the
identical-card-grid tell — a grid of thumbnails is the correct affordance for thumbnails. The copy is
domain-specific in a way generated copy is not: "Won't appear on the crew page" and "The diagram will
still publish" name this product's consequence, where the reflex is "Image unavailable".

**Deterministic scan.** `detect.mjs --json` over both changed files: 4 findings, all
`broken-image` (severity warning), at `step3ReviewSections.tsx:4118` and `:4260` and
`Gallery.tsx:63` and `:882`. **All four are false positives, and all four the same one:** each is the
literal string `<img>` inside a code comment, matched by a text scan. None is a rendered element and
none is in this diff. Zero true findings.

**Browser evidence.** No overlay was injected and none is claimed: the Playwright MCP server failed
to connect this session, and a Next dev server on :3000 was deliberately not started because this
repo has a documented failure mode where a sibling worktree's server serves the wrong code and
several agent sessions were live on the machine. The real-browser evidence is the arc's own
oracles under `tests/e2e/standalone.config.ts`: `T-DIAGRAM-CELL` (five dimensional relationships at
0.5px), `T-DIAGRAM-MESSAGE` (AC-7b, both failure states) and `T-DIAGRAM-NAME`, each at 320 / 390 /
640 / 1072.

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 4 | The diff's whole subject; three states now distinguishable, each naming its consequence |
| 2 | Match system / real world | 4 | Copy is in Doug's vocabulary (what reaches the crew page), not the system's |
| 3 | User control and freedom | 2 | `absent` reports a problem and offers no route to fix it |
| 4 | Consistency and standards | 3 | Strong internally; the crew counterpart is a list and this grid is a div of spans |
| 5 | Error prevention | 3 | The servability predicate is shared with the serving route, so tile and route cannot disagree |
| 6 | Recognition rather than recall | 2 | The name line was cut off at three of four widths — **P1, fixed in `847d882d8`** |
| 7 | Flexibility and efficiency | 3 | No bulk affordance, but the grid is capped at 12 and this is a review surface |
| 8 | Aesthetic and minimalist design | 4 | The caption move is a structural solution, not a font-size hack |
| 9 | Error recovery | 2 | `load-failed` reassures correctly; `absent` is the actionable one and has no next step |
| 10 | Help and documentation | 3 | The copy is the documentation, and at this size that is right |
| **Total** | | **30/40** | Good |

**Cognitive load: low.** One glyph, one name, one sentence per tile, at most 12 tiles, no decision
point over four options. State is carried by SHAPE as well as text, which is the colour-blind floor
PRODUCT.md sets.

**Emotional journey.** The peak-end rule works in this diff's favour: `load-failed`'s second clause
lands reassurance at the exact moment of alarm. The valley is `absent`, which correctly alarms and
then abandons the reader (issue 2).

**What's working.** (1) Both sentences say what happened AND what it means for publishing; the second
clause is the part Doug acts on and most error copy omits it. (2) `TriangleAlert` vs `ImageOff` at
identical size and ramp — the state survives a reader who cannot separate the two colours.
(3) Moving the caption out of the aspect box rather than shrinking type solves the 320px overflow and
makes the box's 4:3 exact, pinned in a real browser.

**Priority issues.**

- **[P1] The name line was cut off at 320, 390 and 640.** Why it matters: the line exists to answer
  which diagram is dark, and two sheet tabs sharing a prefix rendered identically; `title` recovers it
  only on hover, and the venue floor has none. **FIXED in `847d882d8`** — `truncate` to a bounded
  two-line clamp, red-first against a real-browser clipping oracle.
- **[P2] The `absent` state has no route to repair.** Doug learns a diagram is missing and must leave
  the modal to work out where "captured" happens. The crew gallery has a retry affordance for its
  failure state; the admin tile has none. **Deferred** — it needs a product decision about what the
  affordance targets (the sheet tab? a rescan?), which this arc cannot settle. Unfixed peer.
- **[P3] The admin grid is a `div` of `span`s; the crew counterpart is a list.** A screen reader
  announces an item count on one surface and not the other. **Deferred** — unfixed peer.

**Persona red flags.** *Doug, venue floor, phone (primary, from PRODUCT.md):* at 390px every name
truncated and `title` needs hover — the exact question he opened the modal to answer was unanswerable.
Fixed. *Doug, desk:* at 640px a 21-character name still wrapped to two lines and truncated; better,
not solved. Fixed. *Jordan (first-timer):* reads "Not captured. Won't appear on the crew page." with no
link, button, or hint where capturing happens (issue 2). *Alex (power user):* no keyboard path to a
failed tile — correct today, since there is no action, but it also means there is nothing to reach if
one were added.

**Questions to consider.** If `absent` is the state that needs action, why is it the one with no
action? Should the two failed states look equally quiet when only one of them is the reader's problem?

### `/impeccable audit` — RAN

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | AA met everywhere measured; the grid is not a list, so no item count is announced |
| 2 | Performance | 4 | `next/image` lazy with `sizes`; reconcile adjusts state during render rather than in an effect, so no stale frame |
| 3 | Responsive design | 4 | Pinned at four viewports in a real browser at 0.5px, after the P1 repair |
| 4 | Theming | 4 | Every colour is a token; both modes verified by arithmetic, not by eye |
| 5 | Anti-patterns | 4 | No tells; the detector's four hits are all comment text |
| **Total** | | **19/20** | Excellent (minor polish) |

**Contrast, computed from `DESIGN.md` §1.1 rather than repeated from it:**

| Pair | Light | Dark | Threshold |
|---|---|---|---|
| `text-subtle` on `surface-sunken` (message, glyph plate) | 6.09 | 6.94 | ≥4.5 AA body |
| `text-subtle` on `surface` (name line under a live tile) | 6.76 | 6.35 | ≥4.5 AA body |
| `border-text-faint` vs `surface-sunken` (the box's own stroke) | 3.02 | 4.11 | ≥3.0 AA non-text |
| `border-text-faint` vs `surface` (the stroke from outside) | 3.35 | 3.76 | ≥3.0 AA non-text |
| *(retired)* `border-border` vs `surface-sunken` | **1.15** | **1.38** | ≥3.0 — this is what Task 5 fixed |

Every shipped pair passes. The caption does not reach PRODUCT.md's AAA aspiration for light-mode body
(6.09 against 7.0), but `DESIGN.md` §1.1 scopes `--color-text-subtle` to labels and captions at AA and
states its own ratios; that is the token's documented role and predates this diff.

**Findings.** P0: none. P1: one, the name-line clipping above, fixed in `847d882d8`. P2: the absent
state's missing repair route. P3: the grid-not-a-list inconsistency; `aspect-square` plus
`object-contain` letterboxes a landscape diagram to roughly 56% of the crew cell's height, which the
plan explicitly fences ("the two aspect boxes differ and that is not reconciled here"); and a marginal
over-fetch for portrait diagrams, whose `sizes` is computed from the box width the image no longer
fills.

**Positive findings to keep.** State carried by shape rather than colour. A shared servability
predicate, so the tile and the serving route cannot disagree. Every geometric claim pinned by
measurement in a real browser rather than by a class assertion.

- [ ] **Graduate all three rows** into DEFERRED-archive.md and remove the `**Status:** IN PROGRESS` markers, in the PR's LAST commit. An archive categorically rejects an in-flight entry, so the marker comes off in the same commit that archives the row, and a marker that reaches main names a branch the merge just deleted.
- [ ] **Unfixed peers** into the PR body and the readiness message. No new ledger row, of any facing.
- [ ] **Readiness to bl-orch** at pane wP:p28. The arc never merges.

## Self-review record

Round 1 returned BLOCKING with six findings, round 2 BLOCKING with three. Every one was accepted;
none was disputed. This records the plan after both.

- **What round 2 actually found, and it was structural.** Round 1's repair fixed the commands and the claims but left the DECOMPOSITION wrong: all production change sat in the first four tasks, so the two browser tasks had nothing left to make red. A task whose files are all tests, scheduled after the implementation its assertions need, goes green the moment it is authored. The plan is now decomposed by PRODUCTION INCREMENT — five tasks, each owning one change to shipped code and carrying every assertion that change turns green, unit and browser alike. That is why AC-7 and AC-7b sit in Task 2 beside the caption move rather than in tasks of their own.
- **The other two findings were overclaims, and both are now stated precisely.** Task 3's transition table has a "red before the union?" column, because only the cases naming a FAILED landing state are red; the ones landing on `live` and the unreachable `absent → load-failed` case pass throughout and are coverage, not the red. And Task 4 now flips the admin EXPECTATION before touching production, because its existing `object-cover` assertion passes and without that step only the gallery half of AC-12 is red.
- **AC-11, twice corrected.** Round 2 showed that pinning the failed branch kills all five live-negatives on their PRE-EXISTING assertions, so no mutant count can establish anything about a new discriminator. Combined with what the code shows — every one of the five already fails on a placeholder, via an `img` count, a `tagName`, or a full srcset ladder — the answer is that AC-11 needs no new discriminators at all. Task 2 step 10 re-scopes the `queryByText` lines and enumerates the existing evidence per site; step 11 records that reading instead of a mutant tally. **This diverges from spec §5.0, which overstates the exposure**, and the divergence is declared rather than absorbed. The spec is canonical and is not edited.
- **RED validity.** Each `red-target=` names a production line verified on the live tree by opening it and asking whether the `why=` sentence is true OF it, and then whether it is still true when that task RUNS: `components/admin/wizard/step3ReviewSections.tsx:4152`, both branches returning the box unwrapped (Task 1); `components/admin/wizard/step3ReviewSections.tsx:4174`, the name line only in the failed branch (Task 2); `components/admin/wizard/step3ReviewSections.tsx:4159`, one string for two states (Task 3); `components/diagrams/Gallery.tsx:757`, the unpinned thumbnail, plus a scheduled expectation flip on the admin side (Task 4); and `components/admin/wizard/step3ReviewSections.tsx:4156`, the shipped `border-border` (Task 5).
- **Every command is run, not asserted.** V5 and V6 are pasted from real runs; V6 records that the zero-collection form exits 1 with "No tests found", not 0. Task 4 step 7 runs the two e2e oracles UNFILTERED, because round 2 caught that the `-g` filters elsewhere in this plan exclude both.
- **Anti-tautology.** Task 1 premises that more stubs than the cap were rendered. Task 2's AC-5 constructs the tile directly, because the grid can never hand it an empty alt. Task 2's clauses 4 and 5 exist because 1 to 3 pass against the wrong implementation, and clause 1 rests on the font gate. Task 3 asserts both directions per sentence and drives every transition through a stable key. Task 4 scopes the gallery pin to the thumbnail slot, because the corpus's only existing `object-contain` assertion is on the lightbox image.
- **Line-keyed censuses.** Three rows shift when this arc edits the component and are relocated by running their scanners and confirming identity, never by delta: `tests/styles/tapTargetCensus.ts:325` and `tests/styles/subtleInteractiveExemptions.ts:79` and `tests/styles/subtleInteractiveExemptions.ts:112`. `tests/styles/controlOutlineResidue.ts:1038` is identity-keyed and does not move.
- **Scope added after approval, on a ruling.** The crew cell's border restyle (`components/diagrams/Gallery.tsx:651`) was filed as an unfixed peer; Eric ruled it IN SCOPE on 2026-08-31, on the same consistency argument as the letterbox ruling. It is Task 5, declared as a ruling rather than an inference from AC-8, which is written for the admin placeholder alone.
- **Unfixed peers that remain:** `components/admin/wizard/step3ReviewSections.tsx:2415`, a callout box with the same paint on a surface this arc does not open, and the pack-case count pill censused at `tests/styles/controlOutlineResidue.ts:1038`, a different element. Both to the PR body. No ledger row, of any facing.
- **Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N".
