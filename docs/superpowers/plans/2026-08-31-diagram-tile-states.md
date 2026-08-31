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
Total: 0 tests in 0 files          # what the first draft shipped

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
`step3-review-modal.layout`. Tasks 5 and 6 use the config-and-project form above.

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
- **(d) Two harnesses, because one cannot reach both failure states.** The layout spec renders through `renderToStaticMarkup` (`tests/e2e/_step3ReviewModalHarness.tsx:344`), and its own comment says so: static markup has no hydration, so `onError` is never attached (`tests/e2e/step3-review-modal.layout.spec.ts:207-212`). `absent` is seeded from props and therefore renders statically; `load-failed` is reachable ONLY by a real error event and therefore cannot exist there at all. `tests/e2e/step3-review-modal.interactions.spec.ts` builds a live page from an esbuild bundle into an empty `#root` (`tests/e2e/step3-review-modal.interactions.spec.ts:145`), so it is hydrated and interactive. AC-7b is split across the two on that boundary, in Task 6.
## File structure

New files are written unbackticked here because they do not exist yet; a citation to an untracked
path is a lint failure, and a plan that dodges it by not naming the file is worse.

| File | Responsibility | Task |
|---|---|---|
| `components/admin/wizard/step3ReviewSections.tsx` | wrapper, name line, three-state union, two sentences, glyph split, border token, fit class | 1, 2, 3, 4 |
| tests/components/admin/wizard/step3DiagramTile.states.test.tsx (new) | AC-1 to AC-6 | 1, 2 |
| `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` | census re-scope; the broken premise and `[title]` lookup | 1 |
| `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx` | census re-scope; three of the five live-negatives | 1 |
| `tests/components/admin/wizard/step3DiagramTile.published.test.tsx` | census re-scope; one live-negative | 1 |
| `tests/components/admin/wizard/step3ReviewSections.test.tsx` | census re-scope; one live-negative; the cap count | 1 |
| `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` | census re-scope (the `.textContent` site) | 1 |
| `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` | the fit assertion and its negative controls; the border pin | 3, 4 |
| `components/diagrams/Gallery.tsx` | the crew gallery's fit class | 3 |
| tests/components/diagrams/galleryTileFit.test.tsx (new) | AC-12's first pin on the gallery THUMBNAIL | 3 |
| `tests/e2e/step3-review-modal.layout.spec.ts` | AC-7 dimensional invariants; AC-7b's `absent` arm | 5, 6 |
| `tests/e2e/step3-review-modal.interactions.spec.ts` | AC-7b's `load-failed` arm, which needs hydration | 6 |

---

<!-- tasks: depth=3 red-contract -->

Six tasks, not the seven the first draft carried. Plan review round 1 showed the transition task
could not be red: by the time it ran, the task before it had already implemented the reconcile it
claimed was broken, so its cases would have gone green the moment they were authored. The
transitions are proved by the same red as the copy split and belong in that task.

### Task 1: The caption leaves the box, and the seventeen sites move with it

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx tests/components/admin/wizard/step3DiagramTile.staged.test.tsx tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx tests/components/admin/wizard/step3DiagramTile.published.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4174` why=`the name line exists only inside the failed branch, so the live tile has no name node at all and the AC-3 case finds nothing to assert on` ac=AC-3,AC-4,AC-5,AC-9,AC-11 -->

**Files:** tests/components/admin/wizard/step3DiagramTile.states.test.tsx (new), `components/admin/wizard/step3ReviewSections.tsx`, and the five census suites.

- [ ] **Step 1: The suite, name line only.** AC-3: a live tile renders its name as visible text and that text carries `aria-hidden="true"`. AC-4: both failed states render the name WITHOUT `aria-hidden`. AC-5: with `alt` empty or whitespace, no name line renders in any state, and the anchor's `aria-label` still falls back to `Staged diagram (opens in a new tab)`.
- [ ] **Step 2: Observed red.** `components/admin/wizard/step3ReviewSections.tsx:4174` is `{strippedAlt ? (`, inside the `failed` branch that returns at `components/admin/wizard/step3ReviewSections.tsx:4152`. The live branch has no name node, so AC-3 has nothing to find.
- [ ] **Step 3: The wrapper.** A `<span className="flex flex-col gap-1">` holding the box and the caption. The box keeps its exact geometry and its `data-testid`; the caption is a sibling, free to be as tall as its content.
- [ ] **Step 4: The name line, once, outside the box, in every state.** Plain `text-xs`, `truncate`, `title={strippedAlt}`. `aria-hidden="true"` in the live state only, because there the anchor already carries the name (`components/admin/wizard/step3ReviewSections.tsx:4199-4201`); in the two failed states there is no anchor, so the caption is the only accessible text and must stay announced. Same argument that emptied the image's `alt` at `components/admin/wizard/step3ReviewSections.tsx:4242`.
- [ ] **Step 5: Four pre-dispatch mutants** on every string-presence assertion this task adds: the value emptied; the expected content plus an appended suffix; the content present but not live (the name in an attribute only); each discriminating parameter varied in turn. Results recorded in the commit.
- [ ] **Step 6: The loud red, and it is the same commit.** Moving the caption reds thirteen existing sites at once, so the census repair CANNOT be a separate task: a boundary here commits a red tree. Thirteen loud failures: the ten positive `getByText` sites, the `.textContent` site at `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:903`, the premise at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:188-191`, and the `[title]` lookup at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:196-199`.
- [ ] **Step 7: Thirteen re-point from the box to the cell.**
- [ ] **Step 8: The five live-negatives get a POSITIVE discriminator, not just a re-scope (AC-11).** Each today asserts a placeholder string is ABSENT from the box; move the string to a sibling and the assertion passes whether or not the tile is a placeholder. Each instead asserts the box IS an `<a>` with a mounted `<img>`. The five: `tests/components/admin/wizard/step3DiagramTile.published.test.tsx:275`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:84`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:118`, `tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx:157`, `tests/components/admin/wizard/step3ReviewSections.test.tsx:841`.
- [ ] **Step 9: AC-11 is discharged by EXECUTED mutants, and this step is where they run.** The five discriminators pass both before and after the restructure, which is exactly the property that makes them worth nothing until proved; step 5's four mutants cover string-presence assertions and do not touch these. So: force the component onto the placeholder branch (seed `hasPreviewSource: false`), run each of the five sites, and record that each FAILS. A discriminator that still passes against a placeholder tile is the defect AC-11 names, and nothing else in this plan can catch it. Verify each mutation applied before reading the result, because a mutation that silently fails to apply reports exactly what a surviving mutant reports.
- [ ] **Step 10: The wrapper's own handle (AC-9).** The cell carries `-diagram-cell-`, not `-diagram-tile-`, because five prefix consumers require the literal `-diagram-tile-` and would otherwise count the wrapper as a tile: the four CSS selectors in verification V2 plus the `TILE_PREFIX` constant at `tests/components/admin/wizard/step3ReviewSections.test.tsx:749` that three queries in that file derive from. Assert the `-diagram-tile-` prefix count over a full grid still equals `DIAGRAM_TILE_CAP` (`components/admin/wizard/step3ReviewSections.tsx:4077`, value 12), which is the assertion that read 24 where 12 was correct.
- [ ] **Step 11: One near miss, checked and left alone.** `tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx:375` selects `[data-testid*="diagram" i]`, a case-insensitive SUBSTRING, which the new cell id does match. It is the only one of the corpus's 27 substring selectors mentioning "diagram", and it is a single `querySelector` used as a `.not.toBeNull()` premise, so an additional match cannot change its verdict.
- [ ] **Step 12: Observed green** on the new suite and all five census suites.

### Task 2: Three states, two sentences, two glyphs, and every transition

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.states.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4159` why=`one string, Preview unavailable, renders for both failed states, so absent and load-failed are indistinguishable and every copy case and every transition case that names a landing state fails on that one line` ac=AC-1,AC-2,AC-6,AC-10 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, tests/components/admin/wizard/step3DiagramTile.states.test.tsx.

The transitions live here rather than in a task of their own **because they cannot be red anywhere
else**. Once the union exists and writes the right value on each path, every ordered transition
lands correctly; a later task asserting them would go green the moment it was authored, which the
red contract rejects. Before the union, the two failed states render one string and no transition
case can tell which one it landed on. That is one red, and it covers both.

- [ ] **Step 1: The copy cases, both directions each.** AC-1: seeded `hasPreviewSource: false` renders `Not captured. Won't appear on the crew page.` and NOT the load-failed sentence. AC-2: a mounted image that fires a real `onError` renders `Preview couldn't load. The diagram will still publish.` and NOT the absent sentence. Both directions is what catches a split that threads the state and still renders one string.
- [ ] **Step 2: AC-2 is reached by a real error event on a mounted image**, never by seeding a `load-failed` prop. A seed-only test passes against a seed-only implementation.
- [ ] **Step 3: The transition matrix (AC-6)**, reproduced from spec §4.1 per the writing-plans rule. Three states, three unordered pairs, six ordered transitions, every one INSTANT with no animation anywhere in this component.

| Ordered transition | Reachable | Driver |
|---|---|---|
| `live` to `absent` | yes | reconcile, `hasPreviewSource` goes false |
| `live` to `load-failed` | yes | `onError` on the mounted image |
| `absent` to `live` | yes | reconcile, a good source arrives |
| `load-failed` to `live` | yes | reconcile, `href` or `sourceKey` moves |
| `load-failed` to `absent` | yes | reconcile, `hasPreviewSource` goes false |
| `absent` to `load-failed` | **no** | no image mounts in `absent`, so `onError` cannot fire |

- [ ] **Step 4: Every transition driven through a stable React key**, so a remount cannot be mistaken for a re-derivation. The grid keys tiles by `${stub.objectId}-${i}`; the cases hold `objectId` fixed and re-render rather than replace. A remount would seed fresh state and every case would pass without the reconcile existing at all.
- [ ] **Step 5: The two compound cases from spec §4.1.** A flip while a sibling tile in the same row is mid-flip: assert the END state of both and that every box in the row is still 4:3, never a single batched frame, which the spec explicitly does not guarantee. And `live` to `load-failed` while the anchor HOLDS focus: existing behaviour, asserted unchanged, because `onFailure` hands the grid the anchor before the flip (`components/admin/wizard/step3ReviewSections.tsx:4245-4253`) and `handleTileFailure` moves focus forward, then backward, then to the grid (`components/admin/wizard/step3ReviewSections.tsx:4336-4348`).
- [ ] **Step 6: Observed red** against `components/admin/wizard/step3ReviewSections.tsx:4159`.
- [ ] **Step 7: The union.** `type DiagramTileState = "live" | "absent" | "load-failed"`. The seed at `components/admin/wizard/step3ReviewSections.tsx:4120` becomes `hasPreviewSource ? "live" : "absent"`; the reconcile at `components/admin/wizard/step3ReviewSections.tsx:4149` re-seeds on the same rule; the `onError` handler at `components/admin/wizard/step3ReviewSections.tsx:4245-4253` writes `"load-failed"` AFTER calling `onFailure`. That order is load-bearing and unchanged: after the flip there is no anchor left to move focus off.
- [ ] **Step 8: The glyph split.** `TriangleAlert` for `absent`, `ImageOff` for `load-failed`, both `size-4 text-text-subtle` and `aria-hidden`. Glyph carries the state, not colour. **`TriangleAlert` is not imported today** (verification V3): add it to the existing `lucide-react` import at `components/admin/wizard/step3ReviewSections.tsx:47`.
- [ ] **Step 9: Four pre-dispatch mutants per sentence**, as Task 1 step 5.
- [ ] **Step 10: Observed green**, plus `pnpm vitest run tests/styles/_metaEmDashCopy.test.ts` for AC-10.

### Task 3: Shrink to fit, on both surfaces

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx tests/components/diagrams/galleryTileFit.test.tsx` red-state=authored red-target=`components/diagrams/Gallery.tsx:757` why=`both surfaces ship object-cover, so the admin equality at step3DiagramTile.chrome.test.tsx:144 fails on the changed expectation and the new gallery pin fails on the thumbnail class` ac=AC-12 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, `components/diagrams/Gallery.tsx`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx`, tests/components/diagrams/galleryTileFit.test.tsx (new).

Eric ruled this at 15:10 on 2026-08-31. The product-wide scope is part of the ruling, not an
inference from it. **Both files are in the red command**, because a command naming only the admin
suite goes green with `Gallery.tsx` still on `object-cover`, which is half the criterion unproved.

- [ ] **Step 1: The gallery's first pin, scoped to the thumbnail.** Verification V5 shows the only existing `object-contain` assertion in `tests/` is on the LIGHTBOX image (`tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx:1012`), a different element. The new suite therefore scopes to `[data-testid^="diagram-slot-"] img` (the cell testid is set at `components/diagrams/Gallery.tsx:636`), and carries a premise that with the lightbox closed every rendered image IS a thumbnail, so the scope cannot silently widen.
- [ ] **Step 2: Observed red** on both: `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:144` asserts `img!.className.trim()` equals `"object-cover"`; the gallery pin fails on the shipped thumbnail class.
- [ ] **Step 3: Two class edits.** `components/admin/wizard/step3ReviewSections.tsx:4254` and `components/diagrams/Gallery.tsx:757`. Both letterbox against a `bg-surface-sunken` plate that already exists and already meets its contrast pin: the anchor at `components/admin/wizard/step3ReviewSections.tsx:4237` on the admin side, the cell `<li>` at `components/diagrams/Gallery.tsx:651` on the crew side. The two aspect boxes differ and that is not reconciled here: the admin tile is `aspect-4/3`, the gallery cell `aspect-square`.
- [ ] **Step 4: The negative-control literals move with it.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:98-112` embed the fit class as DATA mirroring production rather than as an assertion about it, so they move or the controls stop mirroring the thing they control for.
- [ ] **Step 5: The one occurrence that does NOT move, stated rather than left to a reader.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:48` carries the fit class inside the `CHROME_TOKEN` doc comment as a worked example of a regex-anchoring bug. It documents the token matcher, not the shipped fit; rewriting it would make the example disagree with the bug it explains. Left alone deliberately.
- [ ] **Step 6: Nothing else moves, checked rather than assumed.** Spec §7's three non-movers, each with its oracle: the padding-box assertion at `tests/e2e/step3-review-modal.layout.spec.ts:595` and the srcset-tier assertion at `tests/e2e/published-review-modal.layout.spec.ts:2079` both run in Tasks 5 and 6 and would red if the reasoning were wrong; the blur placeholder is settled by `docs/superpowers/specs/probes/2026-08-31-next-blur-background-size-probe.mjs`, re-run in this task's commit against the version its report records.
- [ ] **Step 7: Observed green**, both unit suites plus the two e2e specs.

### Task 4: The placeholder's edge stops being the faintest thing on screen

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4156` why=`the placeholder box ships border-border, so the positive pin on border-text-faint fails and the negative pin on border-border fails with it` ac=AC-8 -->

**Files:** `components/admin/wizard/step3ReviewSections.tsx`, `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx`.

- [ ] **Step 1: A POSITIVE pin, because the suite has none.** `tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:157`,
`tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:186-192` and
`tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx:219-225` assert the placeholder's chrome SHAPE without pinning which border token, so the restyle is unguarded in both directions today. Add both arms: carries `border-text-faint`, does not carry `border-border`.
- [ ] **Step 2: Observed red** against `components/admin/wizard/step3ReviewSections.tsx:4156`.
- [ ] **Step 3: One token.** `border-border` becomes `border-text-faint`, matching the live box: 1.22-1.27:1 light becomes 3.02:1 light, over the 3:1 non-text floor. No NEW token pairing, so no new `DESIGN.md` contrast row is owed; the pair is already pinned at `DESIGN.md:184`.
- [ ] **Step 4: Observed green.**
- [ ] **Step 5: The peer this task does NOT repair, and why.** `components/diagrams/Gallery.tsx:651` is the same shape: an `aspect-square overflow-hidden rounded-sm border border-border bg-surface-sunken` cell on a neutral ground, on the crew surface Task 3 already opens. After this task the admin pair agrees and the crew cell is the odd one out. It is NOT repaired here, under class-sweep exception (a): the parallel change to that same surface, the fit, required Eric's explicit ruling before this arc could touch it, and a contrast-token change to a crew-facing cell is a second product call nobody has made. Two things are genuinely unsettled and are not pre-empted here: whether that cell counts as a control (it wraps a `<button>` and carries `has-[button:focus-visible]:ring-2`, which may put it on a different `DESIGN.md` row) and whether the callout at `components/admin/wizard/step3ReviewSections.tsx:2415` is in the class at all. Goes to the PR body under "Unfixed peers" and to the orchestrator. No ledger row, of any facing.

### Task 5: The dimensional invariants, in a real browser

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts --project=standalone-chromium -g "T-DIAGRAM-CELL"` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4156` why=`the failed tile is a bare box with no wrapper, so the cell locator resolves to zero nodes and the mixed-row case cannot select a failed cell beside a live one` ac=AC-7 -->

**Files:** `tests/e2e/step3-review-modal.layout.spec.ts`.

The config and project are the ones that actually collect this file (verification V6): the default
config's `desktop-chromium` selects **0 tests in 0 files** for it, which the first draft shipped.

jsdom computes no layout, so every relationship below is asserted by `getBoundingClientRect()`
within 0.5px, at 320, 390, 640 and 1072 CSS px, **with one failed tile beside a live tile in the
same grid row**. Reproduced from spec §3.3 in full, per the writing-plans rule.

| Parent | Child | Relationship | What guarantees it |
|---|---|---|---|
| grid cell | wrapper | wrapper fills the cell's width | `flex flex-col` on a block-level wrapper |
| wrapper | box | box width equals wrapper width | `w-full` on the box, unchanged |
| wrapper | box | box height equals box width times 3/4, exactly, at every viewport | `aspect-4/3` on the box; a column-flex item with no `flex-grow` |
| grid row | wrapper | a tall failed wrapper does not stretch a live SIBLING's box | the sibling's wrapper stretches, its box does not |
| live box | placeholder box | equal width AND equal height in the same grid | both `aspect-4/3 w-full`; already pinned at `tests/e2e/step3-review-modal.layout.spec.ts:682-700` |

The fourth row is what this design exists to protect; the fifth is a ratified contract that growing
the BOX for the failed states would have broken.

- [ ] **Step 1: One `page.evaluate` per viewport**, resolving every element and returning plain numbers. Never a sequence of `locator.evaluate` calls: a re-render between two of them compares rects from two layout frames, and auto-wait hangs on a node that has unmounted.
- [ ] **Step 2: A premise on the mixed row**, via `premiseHolds` from `tests/_shared/premise.ts`, asserting on the case's OWN inputs that the row genuinely holds one failed and one live tile. A row that degenerates to all-live satisfies every stretch assertion vacuously.
- [ ] **Step 3: The failed tile here is `absent`, and only `absent`.** This harness is `renderToStaticMarkup` with no hydration (harness readiness (d)), so `absent` is the only failure state that can exist in it. That is sufficient for AC-7, whose claims are about the BOX, which both failed states share.
- [ ] **Step 4: Expected widths derive from `diagramTileWidthAt`** (`components/admin/wizard/diagramTileGeometry.ts:51`), never hardcoded.
- [ ] **Step 5: Observed red, implementation, observed green.**

### Task 6: The message is not merely present, it is readable

<!-- task: red=`pnpm heavy npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/step3-review-modal.interactions.spec.ts --project=standalone-chromium -g "T-DIAGRAM-READABLE"` red-state=authored red-target=`components/admin/wizard/step3ReviewSections.tsx:4159` why=`the message renders inside the overflow-hidden aspect-4/3 box, so the not-a-descendant clause fails and the ancestor-containment walk finds that box clipping it` ac=AC-7b -->

**Files:** `tests/e2e/step3-review-modal.layout.spec.ts`, `tests/e2e/step3-review-modal.interactions.spec.ts`.

**AC-7b needs BOTH failure states, and no single harness can reach both.** Per harness readiness
(d): the layout spec is static markup with no hydration, so `onError` never attaches and
`load-failed` cannot exist in it; the interactions spec builds a live hydrated page, so a real error
event is reachable there. The criterion is therefore split on that boundary, and both specs are in
the red command:

| Failure state | Spec | Why there |
|---|---|---|
| `absent` | `tests/e2e/step3-review-modal.layout.spec.ts` | seeded from props, renders in static markup |
| `load-failed` | `tests/e2e/step3-review-modal.interactions.spec.ts` | needs hydration and a real `onError` |

For each state, at each of the four viewports, all five clauses:

1. the message's `getBoundingClientRect().height` exceeds one line-height;
2. its own `scrollHeight` does not exceed its own `clientHeight`;
3. its computed `display` is not `none` and its `-webkit-line-clamp` is `none`;
4. **it is not a descendant of the box** (`element.contains()` against the `-diagram-tile-` element, asserted false);
5. **no ancestor clips it either**: walk from the message to the scroll container and, for every ancestor whose computed `overflow-x` or `overflow-y` is not `visible`, assert the message's rect is contained in that ancestor's rect.

Clauses 1 to 3 alone do not catch the implementation this design most invites, because the box's own
scroll box is not the one overflowing. Clause 4 is the specific instance; clause 5 is the general
form.

- [ ] **Step 1: The name line is exempt from clauses 2 and 5 by design.** It is `truncate`, so it is SUPPOSED to clip, and its full value stays in the `title`. Its assertion is that its `title` equals the untruncated name.
- [ ] **Step 2: Clause 1 depends on the font gate**, `await page.evaluate(() => document.fonts.ready)` in `openHarness`: a fallback font resolves to a different line-height, so measuring early fails in the direction that passes.
- [ ] **Step 3: Same-frame reads**, as Task 5 step 1. Ancestor and message rects come from one `page.evaluate`, or containment is compared across two layout frames.
- [ ] **Step 4: Detach safety.** No sampler outlives its element; every read resolves inside the evaluate.
- [ ] **Step 5: Observed red, implementation, observed green**, on both specs.

<!-- tasks: end -->

### Acceptance-criteria coverage map

Criteria are declared in the spec (§5.1) and claimed here, per the coverage-map convention.

| AC | Task |
|---|---|
| AC-1, AC-2, AC-6, AC-10 | Task 2 |
| AC-3, AC-4, AC-5, AC-9, AC-11 | Task 1 |
| AC-7 | Task 5 |
| AC-7b | Task 6 |
| AC-8 | Task 4 |
| AC-12 | Task 3 |

## 12. Closeout

impeccable-gate: `/impeccable critique` + `/impeccable audit`, dispositions recorded here before the
whole-diff review.

- [ ] **Invariant-8 dual gate**, both halves, with the canonical v3 setup gates. P0 and P1 findings fixed or deferred with a `DEFERRED.md` entry.
- [ ] **Pre-code mechanical UI checklist**, run BEFORE Task 1 rather than discovered by the gate: no em dash in user-visible copy, straight apostrophes, 44px tap targets, canonical type and token classes.
- [ ] **Graduate all three rows** into DEFERRED-archive.md and remove the `**Status:** IN PROGRESS` markers, in the PR's LAST commit. An archive categorically rejects an in-flight entry, so the marker comes off in the same commit that archives the row, and a marker that reaches main names a branch the merge just deleted.
- [ ] **Unfixed peers** into the PR body and the readiness message. No new ledger row, of any facing.
- [ ] **Readiness to bl-orch** at pane wP:p28. The arc never merges.

## Self-review record

Round 1 returned BLOCKING with six findings, every one accepted. The record below is what the plan
says AFTER those repairs, not what the first draft claimed.

- **Spec coverage.** Every §5.1 criterion appears in the map above, and each of §5's nine new-coverage items lands in a task: items 1 and 2 in Task 2, items 3 and 4 in Task 1, item 5 in Task 2, items 6 and 7 in Tasks 5 and 6, item 8 in Task 4, item 9 in Task 1. §5.2's five "does not apply" declarations need no task by construction.
- **The class round 1 found, and the derivation that closes it.** Five of the six findings were one shape: **a claim about a task's execution context that nothing had executed.** Task 3's `why=` described correct post-Task-2 behaviour as a defect; two Playwright commands named a project whose `testMatch` excludes their file; Task 7 named a harness that cannot reach one of the two states it had to measure; V5 recorded `(no output)` for a command nobody ran. The repair is not four corrections, it is a rule with a probe behind it: **every command this plan records is RUN and its real output pasted** (V5, V6), and **every `why=` is true at its task's execution point, not at the merge base**. V6 is the mechanised half, and it is what turns "the command works" from a belief into `Total: 44 tests in 1 file`.
- **Ordering, re-derived.** Six tasks, not seven. Task 3 of the first draft could not be red: by the time it ran, Task 2 had implemented the reconcile it called broken, so its cases would have passed the moment they were authored. The transitions moved into Task 2, where the same red covers them, because before the union the two failed states are indistinguishable and no transition case can name its landing state.
- **RED validity.** Each `red-target=` names a production line verified on the live tree at `00c184c02` by opening the line and asking whether the `why=` sentence is true OF it: `components/admin/wizard/step3ReviewSections.tsx:4174` the name line inside the failed branch, `components/admin/wizard/step3ReviewSections.tsx:4159` the shared string, `components/admin/wizard/step3ReviewSections.tsx:4156` the placeholder's `border-border`, and `components/diagrams/Gallery.tsx:757` the thumbnail's `object-cover`. None derives from a fixture the test itself writes, and none is now stated against a tree that an earlier task has already changed.
- **Anti-tautology.** Task 1's AC-11 is discharged by EXECUTED mutants in its own step 9, not implied by its red: the five discriminators pass before and after, so nothing else in the plan can catch a vacuous one, and the mutation is verified to have applied before the result is read. Task 2 asserts both directions per sentence and drives every transition through a stable key, so a remount cannot be mistaken for a reconcile. Task 3's red names BOTH suites, because a command naming only the admin one goes green with the gallery still cropping. Task 3's gallery pin scopes to the thumbnail slot, because the corpus's only existing `object-contain` assertion is on the lightbox image. Task 5 carries a premise that the mixed row really holds one failed and one live tile. Task 6's clauses 4 and 5 exist precisely because 1 to 3 pass against the wrong implementation.
- **Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N".
- **Unfixed peer, declared rather than discovered later.** `components/diagrams/Gallery.tsx:651` carries `border-border` on a neutral ground, the same shape Task 4 repairs on the admin placeholder, on the crew surface Task 3 already opens. Task 4 step 5 states it, names class-sweep exception (a), and sends it to the PR body and the orchestrator. No ledger row, of any facing.
