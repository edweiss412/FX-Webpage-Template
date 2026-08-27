# Plan: the two admin wizard diagram sites render through the diagram loader

**Row:** `BL-ADMIN-DIAGRAM-NEXT-IMAGE` (`BACKLOG.md:35`). **Branch:** `perf/admin-diagram-next-image`. **Base:** `66c9857f5`.
**No spec.** The crew gallery's shipped shape is the design; `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md` §6 is the contract this plan reuses without amending.

Every task is TDD per invariant 1: failing test, minimal implementation, passing test, one commit. Each marker's `red=` is the command that must be observed failing before the implementation and passing after.

Plan round 1 returned six findings, all accepted and all repaired below; §13 records them and what changed.

## Pre-draft code-verification pass

Run before drafting. Every line, symbol, prop, fixture and command below was read or executed on this base. Six things it settled, recorded because each changes what the tasks say:

- **There is only ONE raw `<img>` element in the file**, at `components/admin/wizard/step3ReviewSections.tsx:3833`, inside the shared `DiagramTile`. The brief anticipated this. The second site is not an element: it is the published-mode **src builder**, the `buildSrc` prop `PublishedDiagramsBreakdown` passes at `components/admin/wizard/step3ReviewSections.tsx:4031`, which feeds that same element. The staged site is the default `resolveSrc` at `components/admin/wizard/step3ReviewSections.tsx:3874-3876`. Both sites therefore reach the DOM through one component, and the repair is one prop plus two callers.
- **The comment at `components/admin/wizard/step3ReviewSections.tsx:3784-3785` is stale.** It cites `components/diagrams/Gallery.tsx:130-144` as the raw-`<img>` precedent. The crew gallery has carried `next/image` with a custom loader since the private-image-pipeline arc; its only `<img>` mentions today are in prose at `components/diagrams/Gallery.tsx:59` and `components/diagrams/Gallery.tsx:386`, and the render is `<Image>` at `components/diagrams/Gallery.tsx:397`. The comment claims a documented revert that has been reversed. Task 1 rewrites it.
- **`variants` lives on the PERSISTED entry types only.** `PersistedDiagramFields` (`lib/parser/types.ts:446-451`) is mixed into `PersistedEmbeddedImage` (`lib/parser/types.ts:453`) and `PersistedLinkedFolderItem` (`lib/parser/types.ts:458`). `EmbeddedImageStub` hard-codes `snapshotPath: null` and carries no variant field, so the staged site can never have a ladder. "Both sites request a width-matched variant when the manifest carries one" is therefore vacuously satisfied on the staged side and substantively satisfied on the published side; the plan says which is which rather than implying parity.
- **`next/image` warns when the loader returns the `src` it was given.** In next's installed `get-img-props`, lines 454-466, the warning fires when the loader's output equals `src`, or when the parsed URL's pathname equals `src` with no query. The crew gallery dodges this by passing `src={item.key}` — an identity string the loader ignores — while the loader emits the route URL (`components/diagrams/Gallery.tsx:398-405`). Our staged loader is width-independent by construction, so passing the URL as `src` would warn on every staged tile. The tile therefore takes the identity and the href as separate props. This is the difference between copying the gallery's shape and copying its API.
- **`DiagramTile` has exactly one caller outside its own file**, `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:1071-1081`, which renders it directly with `src=` to assert the anchor's accessible name. Retiring `src` breaks that render, so Task 1 updates it. The assertion itself does not move: what changes is the prop names it passes, and the accessible-name expectation is unchanged.
- **The layout spec belongs to the standalone Playwright config, not the default one.** `tests/e2e/step3-review-modal.layout.spec.ts` is named only in `tests/e2e/standalone.config.ts:86`; the default `playwright.config.ts:97` project does not match it, so a bare `playwright test <that file>` collects nothing and exits green. Every runnable command this plan names is listed and settled in the command sweep below.

Baselines at this head, so a later regression is attributable: `pnpm typecheck` clean; `pnpm exec eslint .` 0 errors, 71 warnings; `pnpm format:check` clean; the four suites these tasks touch green at 137 tests (`tests/components/admin/wizard/step3ReviewSections.test.tsx`, `tests/components/admin/review/publishedNoStagedTraffic.test.tsx`, `tests/components/diagrams/Gallery.test.tsx`, `tests/images/diagramLoader.test.ts`).

## Command sweep, authored AND run at plan time

Every runnable command named anywhere in this plan, extracted mechanically and settled. Round 1's finding 1 was a command that could not collect what it claimed, so the sweep is derived rather than remembered:

```
grep -noE '`(pnpm|node|npx|sh -c|git|grep -r)[^`]*`' docs/superpowers/plans/2026-08-27-admin-diagram-next-image.md
```

| Command | Settled how |
|---|---|
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | The three the `quality` job runs, read from `.github/workflows/quality.yml` rather than remembered. All three run; baselines below. |
| `grep -rn "<img" app/ components/` | Run; output is the sweep table below. |
| `pnpm vitest run tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` | Authored red — the file does not exist yet. Collection proven by the wiring declaration above and by the sibling `tests/components/admin/wizard/step3ReviewSections.test.tsx` collecting in the baseline run. |
| `pnpm vitest run tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx` | Same. |
| `pnpm vitest run tests/components/admin/wizard/step3DiagramTile.published.test.tsx` | Same. |
| `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts` | `--list` run at plan time: collects, `Total: 35 tests in 1 file`. The `--config` flag is load-bearing; without it the file matches no project and the run exits green having collected nothing. |
| `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/published-review-modal.layout.spec.ts` | `--list` run at plan time: collects, `Total: 48 tests in 1 file`. Same `--config` requirement. |
| `pnpm vitest run tests/components/a11y/newTabAnnouncementBehavior.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx` | Run; green in the baseline. |
| Task 4's and Task 5's `sh -c` gates | Both run at plan time; both exit 1 on the current tree, and Task 4's is additionally probed red under both of the mutants that defeated its earlier versions. All five `red=` commands parse-check clean under `sh -nc`. |
| `pnpm heavy pnpm test`, `pnpm heavy pnpm exec playwright test …` | Wrapper form per the heavy-phase rule; the inner commands are the rows above. |

## Test-file collection and CI wiring

Declared per `docs/agents/writing-plans.md:27`, verified on this base.

- Three new Vitest files land under `tests/components/admin/wizard/`: step3DiagramTile.staged.test.tsx (Task 1), step3DiagramTile.reconcile.test.tsx (Task 2), step3DiagramTile.published.test.tsx (Task 3). `BASE_INCLUDE` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) and the DB-free parallel project's glob list carries `tests/components/**/*.test.{ts,tsx}` (`vitest.projects.ts:105`), so all three are collected by `pnpm test` and by the `unit-suite` CI job with **no new entry to add**. None appears in the serial-only exclusion lists.
- The `unit-suite` workflow trigger is unfiltered by path (`.github/workflows/unit-suite.yml:90-94`), so no path filter needs widening.
- Both e2e files this plan touches already exist and are already matched by `tests/e2e/standalone.config.ts:86`: `step3-review-modal.layout.spec.ts` (Task 1) and `published-review-modal.layout.spec.ts` (Task 3). The first has a committed alias, the `test:e2e:modal-header` script at package.json line 66. No config edit is owed for either.

## The loader contract this plan consumes

`makeDiagramLoader({ showId, rev, key, variants, pinOriginal? })` (`lib/images/diagramLoader.ts:112`) returns a `next/image` `ImageLoader`. Read on this base:

- `validVariants` (`lib/images/diagramLoader.ts:60`) drops any row that is not an object, any non-finite or non-positive `width`, and any `key` the route's own `isSafeDiagramKey` rejects, then sorts ascending. A wholly malformed `variants` value degrades to `[]`. It never throws.
- `servingVariants` (`lib/images/diagramLoader.ts:85`) additionally drops a row whose `key` equals the original's, so "never the original" holds at every width, not only above the ladder.
- With no serving rows the returned loader is a constant returning `diagramAssetUrl(showId, rev, key)` (`lib/images/diagramLoader.ts:52`), which percent-encodes the key segment.
- With rows, the loader picks the smallest tier at or above the requested width, else the largest tier. `quality` is ignored.
- `hasVariantTier(variants, originalKey)` (`lib/images/diagramLoader.ts:108`) is exported so callers never re-derive "is there something smaller to serve". This plan does not need it: the tile has no zoom pin.

Ingest ladder: `DIAGRAM_VARIANT_WIDTHS = [256, 512, 1024]` (`lib/sync/diagramVariants.ts:13`), no upscaling.

## Class sweep, derived rather than listed

The defect shape is *an image whose src is built from a diagram manifest entry that can carry a `variants` ladder, rendered so the browser is never offered a width-matched candidate*. The derived cover is every site that constructs an asset-route diagram URL or consumes the loader, which is the complete set of places the shape can exist:

```
grep -rn "api/asset/diagram\|makeDiagramLoader\|diagramAssetUrl" app/ components/ lib/ | grep -v "^app/api/asset/diagram/"
```

Run on this base, the render surfaces it returns are exactly three: `components/diagrams/Gallery.tsx` (loader-driven already), `components/diagrams/GalleryLightbox.tsx:974` and `components/diagrams/GalleryLightbox.tsx:1153` (loader-driven already), and `components/admin/wizard/step3ReviewSections.tsx:4031` (this arc). `components/crew/DiagramsBlock.tsx` appears in prose only; it projects `variants` down into `GalleryItem` and renders nothing itself. `lib/data/diagrams.ts` and `lib/data/getShowForViewer.ts` are producers. `lib/audit/trustDomains.ts:73` is a registry row.

The staged site does not appear in that cover, because it builds no asset-route URL — which is the mechanical statement of why it has no ladder.

**Every other raw `<img>` in the tree, and why none is an instance.** The sweep `grep -rn "<img" app/ components/` returns five element sites:

| Site | Why it is not an instance of this shape |
|---|---|
| `app/auth/sign-in/SignInButton.tsx:53` | The committed brand SVG at public/brand/google-signin-button.svg, 175×40. No manifest, no ladder, and SVG has no raster tiers. |
| `app/auth/sign-in/page.tsx:192` | The committed wordmark at public/brand/fxav-wordmark.png, already resampled to 192×205 for a 96px target (comment at `app/auth/sign-in/page.tsx:185-190`). No manifest, no ladder. |
| `app/help/_components/Screenshot.tsx:34` | A `<picture>` with a `prefers-color-scheme` `<source>` over two committed WebPs. Its bytes are pinned by the screenshots-drift byte-comparison gate; a loader would move them. No manifest, no ladder. |
| `components/admin/wizard/VenueMapTile.tsx:100` | A static-map proxy stream at `/api/admin/venue-map?q=…&theme=…`. Query-param proxy, not a keyed asset route; no manifest and no ladder exists for it. |
| `components/admin/wizard/step3ReviewSections.tsx:3833` | **This arc.** |

No peer is deferred, because no peer is an instance. Nothing here goes to a ledger row.

## Guard conditions, per input the sites read

Stated per the brief's requirement, because the row's own ship-and-forget posture means most published shows have no `variants` today and get them at their next snapshot. Every row names the case that covers it, so an enumerated condition with no case is visible rather than implied.

Round 2 corrected the ownership column: `snapshotPath`, `mimeType` and `snapshot_revision_id` are PUBLISHED-mode inputs. `hasStagedPreviewSource` (`lib/admin/stagedDiagramGuards.ts:57-63`) reads `contentUrl` and the XLSX media pair and nothing else, so Task 1 could not have covered them and the first draft's assignment was simply wrong.

| Input | Value | Rendered result | Covered by |
|---|---|---|---|
| `variants` | absent (old manifest, the common case today) | `validVariants(undefined)` → `[]` → constant loader → the original asset URL at every candidate width. | Task 3 case 2 |
| `variants` | `[]` (GIF, generation failure) | Same as absent. | Task 3 case 3 |
| `variants` | a non-array (`42`) | `validVariants` returns `[]`. Same as absent. Never throws. | Task 3 case 3 |
| `variants` | rows present but every row malformed | Same as absent. | Task 3 case 3 |
| `variants` | one row naming the original key | `servingVariants` drops it; falls back to the original. Never a variant URL that resolves to original bytes. | Task 3 case 3 |
| `variants` | a valid ladder | Smallest tier ≥ the requested width; above the ladder, the largest tier. | Task 3 case 1 |
| `variants` | absent, then a ladder on a later render (the show's next snapshot) | The mounted image's srcset moves from original to variants in place. | Task 3 case 4 |
| `variants` | a ladder, then absent on a later render (a regenerated snapshot whose variant stage failed) | The mounted image's srcset moves back to the original in place. | Task 3 case 5 |
| `snapshotPath` | `null` | The published servability gate is false → the placeholder branch renders and NO image element mounts. | Task 3 case 7 |
| `mimeType` | not in the allowed set | Same gate, same result (`isAllowedDiagramMime`, `components/admin/wizard/step3ReviewSections.tsx:4036-4039`). | Task 3 case 7 |
| `snapshot_revision_id` | `""` (a malformed row past the resolver gate) | The published servability gate is false → placeholder, no image element. Round 3 probed the earlier answer and it was wrong: `diagramAssetUrl(show, "", key)` yields a doubled slash, which the consequence bound calls malformed. A row with no revision has no fetchable bytes at any width, so the tile stops asking. | Task 3 case 8 |
| staged `contentUrl` | `null` with no media pair (restage-only) | The staged predicate is false → placeholder, no element. | Task 1's staged suite |
| staged `contentUrl` | an UNTRUSTED host string | The staged predicate is false → placeholder, no element. | Task 1's staged suite |
| runtime fetch | 4xx/5xx on whichever candidate the browser chose | `onError` → `failed` → the placeholder. | Task 1's staged suite |
| `hasPreviewSource` | flips false → true on a later render, same key | The placeholder must yield to a live image. Broken today: `failed` is initialised once and never reconciled. | Task 2 case 1 |
| `hasPreviewSource` | flips true → false on a later render, same key | The image must yield to the placeholder immediately, not wait for a fetch to fail. Broken today, same cause. | Task 2 case 2 |
| `href` / `sourceKey` | change after a runtime failure, same key | A new, good source must clear the failure. Broken today, same cause. | Task 2 case 3 |
| `variants` | a serving ladder arrives while the tile is already failed, same asset key | The tile must recover and render the variant. Serving variants exist and none renders otherwise, which the consequence bound forbids in its own words. | Task 2 case 4 |

The consequence bound the reviews converge against: **each of the two sites renders the variant URL when serving variants exist and the original otherwise, and never an empty or malformed src.** The domain is finite: the manifest shapes the ingest ladder writes, plus the absent/empty/malformed cases enumerated above.

## Transition inventory

Round 1 corrected this section once and round 2 corrected it again, both times in the same direction: the first draft reasoned about initial candidate selection, the second still reasoned only about the states a MOUNT can reach. Tiles carry a stable React key (`components/admin/wizard/step3ReviewSections.tsx:3911`, `key={`${stub.objectId}-${i}`}`), so every prop the tile derives state from can change under one mounted element.

**The component cannot express three of these today, and that is a defect this arc must fix rather than an inventory row it may omit.** `const [failed, setFailed] = useState(!hasPreviewSource)` (`components/admin/wizard/step3ReviewSections.tsx:3798`) initialises once, and the only later write is `setFailed(true)` (`components/admin/wizard/step3ReviewSections.tsx:3838`). So an unavailable tile that becomes available stays a placeholder forever, an available tile that becomes unavailable keeps rendering an image until some request fails, and a tile that failed on source A stays failed when handed a good source B. All three are reachable from ordinary ingest output under the stable key.

There is no `AnimatePresence` and no framer-motion anywhere in `DiagramTile`, and none is added.

| Pair | Treatment |
|---|---|
| unavailable at mount → (nothing) | Terminal for that render. `failed` starts true; no element mounts. |
| image → placeholder (runtime error) | Instant. `onError` sets `failed`; the next render swaps the anchor for the span. No animation, and none is wanted: the swap reports a failure, and a fade would read as a load. |
| placeholder → image (`hasPreviewSource` false → true, same key) | Instant. Requires the reconciliation Task 1 adds; today it never happens. |
| image → placeholder (`hasPreviewSource` true → false, same key) | Instant, and immediately — not deferred until a fetch fails. Same reconciliation. |
| failed on source A → image on source B (`href`/`sourceKey` change, same key) | Instant. Same reconciliation; the failure belongs to the source that failed, not to the slot. |
| failed → image when only the MANIFEST moved (a ladder arrives, same asset key) | Instant. The loader is a fresh closure each render, so it cannot be the comparison; `sourceKey` carries the ladder, which is what makes this row expressible at all. Round 3 found the round-2 record claiming `loader` reconciled while the design compared three props that could not see it. |
| original → variant (rerender: the show's next snapshot lands a ladder) | Instant, in place. Same key, same element; only `srcset` and `src` move. Pins against a loader memoised on mount. |
| variant → original (rerender: a later snapshot whose variant stage failed, or a GIF) | Instant, in place, the same mechanism in the other direction. |
| COMPOUND: a runtime error AFTER a successful load | Instant, and distinct from the plain error row: the element has already fired `load`, so this is the late-5xx-on-refetch path rather than a first-fetch failure. Round 2 found the first draft's "compound" case traced the same events as the plain one and therefore added no state coverage. |
| COMPOUND: a source change arriving while the tile is already failed | Covered by the failed-A → B row above, which is the compound case that matters: two state machines (failure, identity) moving in one commit. |

## Dimensional invariants

`fill` makes the image `position: absolute; inset: 0`, so its box is the PADDING box of its nearest **positioned** ancestor. Today's anchor is `class="block"`, which is `position: static`. If the `relative` class is omitted the image escapes to the modal panel, which IS positioned (`components/admin/review/ReviewModalShell.tsx:624`), and one thumbnail covers the whole dialog. jsdom computes no layout and cannot see this.

**Padding box, not border box, and the assertion has to say so.** Round 2 caught the first draft asserting `img.getBoundingClientRect()` equals the anchor's while ALSO moving a 1px border onto the anchor: `getBoundingClientRect` returns the BORDER box, so the two rects differ by twice the border width on each axis and no 0.5px tolerance absorbs it. The committed assertion deflates the anchor's rect by its own computed border widths, read with `getComputedStyle` so no token literal enters the test:

```
anchor.width  - borderLeft - borderRight  === img.width   (±0.5px)
anchor.height - borderTop  - borderBottom === img.height  (±0.5px)
```

The crew gallery records a second, sharper version of the containing-block trap: `relative` had to live on the grid CELL rather than on the interactive `<button>`, because WebKit resolves a child's `height: 100%` against the aspect-ratio BORDER box, and a `fill` image containing-blocked by that button came out 2px taller than the cell's content box (`components/diagrams/Gallery.tsx:338-344`). **That shape cannot occur here**: the grid child IS the anchor, it carries `aspect-4/3` directly, and no descendant uses `height: 100%`. Named so a reviewer does not rediscover it, and pinned by the measurement rather than by this paragraph.

| Parent | Child | Relationship | Guaranteed by |
|---|---|---|---|
| `<a data-testid=…-diagram-tile-N>` | the `next/image` `<img>` | img border box === anchor border box deflated by the anchor's computed border widths, both axes, ±0.5px | `relative` on the anchor plus `fill` on the image |
| the grid cell | `<a>` | anchor keeps the 4:3 ratio and the grid-cell width | `aspect-4/3 w-full` moves from the image to the anchor |
| the grid cell | the placeholder `<span>` | the unavailable branch keeps the SAME box as the available branch | both branches carry `aspect-4/3 w-full`; the span already does today |

## The `sizes` string, the layout model behind it, and the browser-authoritative oracle

Three review rounds landed here and each found the previous repair incomplete in a different way. Round 1: two 20px paddings and the panel-card border were missing. Round 2: the modal's own outer padding was still missing, and three sample viewports cannot expose a tier mistake living between them. Round 3: the oracle itself could not observe what it claimed — the only real-browser harness renders STAGED mode, where the loader is width-independent and every srcset descriptor maps to one URL, so `img.currentSrc` names no tier at all.

That third finding is the one that matters, and the repair is not another correction of the arithmetic. **The oracle moves to a harness that has a ladder.**

**The full chain**, every term read on this base:

| Term | Value | Source |
|---|---|---|
| modal outer padding | 24px each side, from `sm` (640px) up | `sm:p-6` on the dialog, `components/admin/review/ReviewModalShell.tsx:588` |
| panel width | `min(viewport − outer, 1024)` | `w-full sm:max-w-5xl`, `components/admin/review/ReviewModalShell.tsx:624` |
| side rail | 240px, only at `lg` (≥1024px) | `hidden w-60 … lg:flex`, `components/admin/review/ShowReviewSurface.tsx:865` |
| content scroller padding | 20px each side | `p-tile-pad`, `components/admin/review/ShowReviewSurface.tsx:1028`; `--spacing-tile-pad: 20px`, `app/globals.css:240` |
| panel-card padding + border | 20px each side + 1px each side | `p-tile-pad` + `border`, `components/admin/wizard/step3ReviewSections.tsx:1052` |
| grid | 3 columns below `sm`, 4 at and above, 8px gaps | `grid grid-cols-3 gap-2 sm:grid-cols-4`, `components/admin/wizard/step3ReviewSections.tsx:3908` |

**The model ships as code.** `diagramTileWidthAt(viewportPx)` is exported beside the grid it describes, built from one named constant per row above:

```
panel = min(vw − (vw >= 640 ? 48 : 0), 1024)
main  = vw >= 1024 ? panel − 240 : panel
card  = main − 40 − 42
tile  = (card − 8 × (cols − 1)) / cols,  cols = vw >= 640 ? 4 : 3
```

74.00 at 320, 97.33 at 390, 180.33 at 639, 121.50 at 640, 161.50 at 800, 217.25 at 1023, 157.50 at 1024, and 169.50 from 1072 up — **constant only from 1072**, because the panel does not reach its 1024px cap until the outer padding is paid.

**Declared**, exact rather than approximate:

```
(min-width: 1072px) 169.5px,
(min-width: 1024px) calc(25vw - 98.5px),
(min-width: 640px) calc(25vw - 38.5px),
calc(33.3333vw - 32.6667px)
```

Probed at plan time over every integer viewport 320–1600 at DPR 1, 2 and 3 — 3,843 points — importing `imageConfigDefault` from next and `DIAGRAM_VARIANT_WIDTHS` from the ingest module: the tier the declared string selects equals the tier the model's width selects at every one. The round-1 approximation fails 215 of them in both directions.

**`calc()` is deliberate and its interaction with next is checked.** `getWidths` (next's `get-img-props`, lines 50–69) scans `sizes` with `/(^|\s)(1?\d?\d)vw/g`; inside `calc(25vw` the digits are preceded by `(`, so nothing matches and next falls back to the FULL `allSizes` candidate list. The browser then evaluates the calc precisely. Were a future next to parse inside `calc`, the candidate list would only be filtered below 256px — under the ladder's smallest tier — so no tier selection moves either way.

### The oracle, and the harness it needs

- **It runs in PUBLISHED mode**, in `tests/e2e/published-review-modal.layout.spec.ts`, whose harness renders the real `PublishedReviewModal` to static markup and today passes `diagrams: null` (`tests/e2e/_publishedReviewModalHarness.tsx:129`). Task 3 gives it a persisted manifest carrying the full three-tier ingest ladder and serves real bytes for the original and each variant key. Only there does `img.currentSrc` name a tier, because only there do the srcset descriptors map to different URLs. The staged harness keeps the geometry assertions, which do not need a ladder.
- **The viewport set is derived and TWO-SIDED.** Round 3 found the first version sampled each tier-transition viewport but not its predecessor, so a transition that fired one pixel early escaped. The set is every viewport at which the model's tier changes, PLUS the pixel before each, per DPR, computed from `diagramTileWidthAt` ∪ `imageConfigDefault` ∪ `DIAGRAM_VARIANT_WIDTHS` and recomputed rather than pasted. On this base the one-sided set is 12 points and the two-sided set is 21 — one at DPR 1 (320), eleven at DPR 2 (320, 482/483, 639/640, 666/667, 922/923, 1023/1024) and nine at DPR 3 (320, 354/355, 482/483, 639/640, 666/667). The probe that motivated the second side, nudging the ≥640px slot by +0.25px, moves exactly the viewports (666 and 922) that only a predecessor sample can see.
- **At each point, two assertions the plan cannot make for itself:** the measured tile width equals `diagramTileWidthAt(viewport)` within 0.5px, which validates the model against real layout; and `img.currentSrc` names the ladder tier that measured width warrants, which validates the declared string end to end. No `sizes` parser is written and no tier arithmetic is duplicated — the browser selects, exactly as in production.
- **Documented limit:** DPR is a browser-context option, so each distinct DPR costs its own context. The suite runs DPR 1 and 2 over their whole two-sided sets — 12 points across two contexts — and DPR 3 only at its sub-640 sheet points (320, 354, 355, 482, 483, 639; six of its nine), because DPR 3 on a desktop admin surface is the phone-width case. The three DPR-3 points at and above 640 are therefore uncovered, so a DPR-3 desktop regression at 640/666/667 is not caught here; recorded rather than silently uncovered.

## Meta-test inventory

Mandatory per `docs/agents/writing-plans.md:21`, which accepts "none applies" only with the reason declared.

**This plan creates no structural meta-test and extends none.** The five registries that rule names are Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`), sentinel hiding in optional text (`tests/components/tiles/_metaSentinelHidingContract.test.ts`), `admin_alerts.upsert` catalog completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`), advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`), and no-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`). This diff touches no Supabase call, no DB write, no advisory lock, no `admin_alerts` row and no email path, so none has a new member to register. Invariant 10 is likewise untouched: no mutating route handler and no `"use server"` action is added or changed.

**Deliberately not proposing a "no raw `<img>` on diagram surfaces" walker.** After this diff the population of diagram render surfaces is three, all loader-driven, all directly asserted by their own suites. A walker over a population of three whose done condition is a property of the walker rather than a number anyone would notice moving is exactly what the 2026-08-25 process freeze declines. The four non-instances in the sweep table above would each need an exemption row, which is the maintenance cost with none of the benefit.

## Mutation enrolment

`grep -n sourcePath tests/mutation/source/registry.ts` on this base returns no row under `components/`, `app/` or `lib/images/`. **No enrolled surface is touched**, so no round-1 diff brief carries a `GUARD SURFACE:` line and no score is owed. Nothing is enrolled under review pressure.

## The two mandatory task types

`docs/agents/writing-plans.md:8-9` makes a layout-dimensions task and a transition-audit task mandatory for surfaces of this shape. **Both are their own TDD tasks below**, and the earlier drafts' argument that they could not be — that their assertions would be green the moment they were authored — was wrong. Round 3 found the disproof in one line: the layout assertion includes `getComputedStyle(anchor).position === "relative"`, and the live anchor is `className="block"` (`components/admin/wizard/step3ReviewSections.tsx:3829`), which is statically positioned. The assertion fails today, for exactly the production defect it pins. Recorded mutants are a supplement to that cycle, never a substitute for it.

Task 1 is the layout-dimensions task. Task 2 is the transition-audit task. Neither borrows the other's red, and neither is a later task whose assertion would already be green — round 4 found exactly that defect in a third task and it was merged into Task 3 rather than argued around.

## Task 1: the element and its box (the mandatory layout-dimensions task)

<!-- task: red=`pnpm heavy pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts` ac=AC-1,AC-5 -->

**What is red and why.** New assertions in `tests/e2e/step3-review-modal.layout.spec.ts` require the tile anchor to be a positioned containing block and the image to fill it. The production line that makes them fail is `components/admin/wizard/step3ReviewSections.tsx:3829`, `className="block"` — statically positioned, so `getComputedStyle(anchor).position` reads `static` today. This is a real red on the live tree for the exact defect the assertions pin, which is why this is a task and not a recorded mutant.

RED, in the staged layout spec, at each of its three existing modes (390 sheet, 800 popup, 1280 two-pane):

1. `getComputedStyle(anchor).position === "relative"`.
2. The image's rect equals the anchor's rect **deflated by the anchor's own computed border widths** on both axes, within 0.5px. `fill` insets against the PADDING box while `getBoundingClientRect` returns the BORDER box; round 2 caught the first draft comparing the two directly, which no tolerance absorbs. Border widths come from `getComputedStyle`, so no token literal enters the test.
3. The anchor's width/height ratio is 4:3 within 0.5px, and the placeholder branch's box equals the live branch's at the same grid position.
4. Zero requests to `/_next/image` — the admin twin of the crew AC-3 pin.

The harness needs one servable stub for an image to mount at all: `tests/e2e/_step3ReviewModalHarness.tsx:69-75` gains an XLSX-media entry (`contentUrl: null` plus a `mediaPartName` and a non-null `embeddedFingerprint`, which `hasStagedPreviewSource` accepts, `lib/admin/stagedDiagramGuards.ts:57-63`), and the spec's node:http server (`tests/e2e/step3-review-modal.layout.spec.ts:170-181`) gains an `/api/`-prefixed branch serving a real 4:3 PNG. The harness comment at `tests/e2e/_step3ReviewModalHarness.tsx:59-62` is updated to say why one stub is now servable. Tile count and the "+N more" note are untouched: the fixture still holds cap+3 stubs. **The harness change alone cannot turn the red green** — the position assertion is about production CSS — so this is not a test-local red.

GREEN, in `components/admin/wizard/step3ReviewSections.tsx`:

- `DiagramTile` takes `href` (the full-resolution URL the anchor opens), `sourceKey` (see Task 2 — it is both the `next/image` `src` identity and the reconciliation key), `loader` (an `ImageLoader`), and `sizes`, alongside today's `alt`, `testId`, `hasPreviewSource`. The single `src` prop is retired: two strings that both look like sources is the reader-load defect this API shape exists to avoid.
- The anchor gains `relative aspect-4/3 w-full overflow-hidden`, and the chrome moves with the box: `rounded-md border border-text-faint bg-surface-sunken` leave the image for the anchor, and only `object-cover` stays on the image (the crew gallery's arrangement, `components/diagrams/Gallery.tsx:351`). **The two branches keep their DISTINCT border tokens**: `border-text-faint` on the live tile, `border-border` on the placeholder span.

  **DISPROVED, recorded rather than softened.** This bullet used to say the move was "required rather than cosmetic" because "a `fill` image is inset against the anchor's PADDING box, so a border left on the image would no longer bound the tile." That mechanism is FALSE. Measured during Task 1 execution by planting exactly it — border removed from the anchor, `rounded-md border border-text-faint` put back on the image — and the whole layout suite passed, 44 of 44, including the geometry row. The reason is elementary once run: with no border on the anchor its padding box IS its border box, so `fill` insets to the same rectangle and both arrangements render identically. Four review rounds did not catch it, because prose cannot certify a claim about layout; one mutant did. The move stays, on CONSISTENCY: one arrangement across the two diagram surfaces is worth having. It does not stay because the alternative breaks.
- The image becomes `<Image fill sizes={sizes} className="object-cover" …>`, keeping `alt=""` and the `onError` handler. `loading="lazy"` and `decoding="async"` are `next/image` defaults and are dropped as explicit attributes.
- `DiagramsBreakdown` supplies the staged default loader, `(stub) => () => resolveSrc(stub)` — width-independent, derived from the existing `resolveSrc` so the staged URL is defined in one place — and passes the exported `DIAGRAM_TILE_SIZES`.
- Two exports beside the grid they describe: `DIAGRAM_TILE_SIZES` and `diagramTileWidthAt(viewportPx)`, per the section above.
- The `eslint-disable-next-line @next/next/no-img-element` at `components/admin/wizard/step3ReviewSections.tsx:3830-3832` goes with the element it exempted, and the stale comment at `components/admin/wizard/step3ReviewSections.tsx:3784-3785` is rewritten to state what is now true: the crew gallery is loader-driven, the `/_next/image` optimizer is never reached because the loader emits our own asset-route URLs, and cookies therefore survive.
- `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:1071-1081` moves to the new prop names with its `toHaveAccessibleName` expectation untouched. That suite owns the new-tab suffix contract, not the image contract; changing its expectation would be a gate edit, not a call-site update.

**Authored in the same commit, red recorded alongside**: the staged jsdom suite tests/components/admin/wizard/step3DiagramTile.staged.test.tsx, whose subject is the originals-only branch — width-keyed srcset candidates that are all the staged route URL (`premiseHolds` an image mounted, `premise` more than one candidate, none containing `@`, `/_next/image` or `/api/asset/diagram`); the absence of next's missing-loader-width warning, with the spy installed before that case's own render and a `objectId` unique in the file, because `warnOnce` is process-global and keyed on a message embedding `src`; the anchor's sole accessible name with the image decorative; the href, target and rel; the rendered `sizes` equal to the exported constant; both staged non-servable shapes (restage-only, and an untrusted-host `contentUrl`) rendering the placeholder with no image element; error-to-placeholder; and the compound case, which is an error AFTER a successful load — round 2 found the first draft's compound case traced the same events as the plain one.

**Mutant record, in the commit message.** Every one of these was RUN, and one of them refuted the plan.

- (a) Drop `relative`: 4 failed at 44. The honest red for this task.
- (b) Move the border back onto the image: **44 passed — ORPHANED as originally designed**, and that is what disproved the mechanism claim above. It is NOT rescued by fitting a guard to it. The suite now carries a non-zero anchor-border assertion added on its OWN merits — removing the border from a bordered grid of thumbnails is a visible regression nothing else here would notice — and (b) incidentally trips it. What (b) now demonstrates is that the anchor keeps its border, never the padding-box mechanism, which stays recorded as false.
- (c) Point the harness stub back at `contentUrl: null`: 9 failed, the premise firing first, so the suite reports "no image mounted" rather than passing on an empty selector.
- (d) Set `sourceKey` to the URL: 1 failed of 9, the missing-loader-width case, and nothing else.
- (e) Drop `sizes`: 1 failed of 9, the sizes case, and nothing else.

## Task 2: failure state reconciles under a stable key (the mandatory transition-audit task)

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx` ac=AC-6 -->

**What is red and why.** `const [failed, setFailed] = useState(!hasPreviewSource)` (`components/admin/wizard/step3ReviewSections.tsx:3798`) initialises once, and the only later write is `setFailed(true)` (`components/admin/wizard/step3ReviewSections.tsx:3838`). The tile key is stable (`components/admin/wizard/step3ReviewSections.tsx:3911`), so every prop the tile derives state from can change under one component instance and none of them is reconciled. Three transitions are unreachable today and a new tests/components/admin/wizard/step3DiagramTile.reconcile.test.tsx asserts all of them.

RED, four cases, each rerendering with a STABLE key:

1. **Unavailable → available.** Placeholder yields to a live image.
2. **Available → unavailable.** Image yields to the placeholder immediately, not on a failed fetch.
3. **Failed on source A → a good source B.** The failure belongs to the source that failed, not to the slot.
4. **Failed, then a loader-only manifest change.** The tile has failed; a later render brings a serving ladder with the SAME asset key. Serving variants now exist and none renders — the consequence bound's own words. Round 3 found this one: the round-2 record claimed `loader` reconciled while the design compared only three props.

**Two anti-tautology constraints, both of which an earlier draft got wrong** and which round 3 named:

- **Case 3 must move the href without moving the key.** The key is `${stub.objectId}-${i}`, so varying `objectId` REMOUNTS, `failed` resets for free, and the case passes against the unrepaired component. In staged mode the URL is built from `wizardSessionId`/`dfid`/`objectId`, so the case varies the WIZARD SESSION: same objectId, same key, same testid, different href, with a `premiseHolds` that the href actually moved.
- **Node identity is not the proof for cases 1 and 2.** The placeholder is a `<span>` and the live tile is an `<a>`, so the two are necessarily different DOM nodes and an identity check cannot hold. The proof is that the swap happens at all: the key is stable, React keeps the component instance, and `failed` starts true and is only ever set true — without a reset, that render is still the placeholder.

GREEN: the tile keeps the inputs it last rendered and, during render, resets `failed` to `!hasPreviewSource` when `hasPreviewSource`, `href` or `sourceKey` differs from that record — React's documented adjust-state-during-render form, no effect and no extra commit.

**`sourceKey` is what makes case 4 expressible, and it is why the prop exists.** The loader is a fresh closure on every render, so comparing it resets `failed` constantly and destroys the error state; comparing nothing misses a manifest change. `sourceKey` is a caller-derived string naming the bytes this tile can serve, and it is deliberately NOT URL-shaped — staged: `staged:<wizardSessionId>:<dfid>:<objectId>`; published (Task 3): the asset key joined with the serving ladder's `width:key` rows. It doubles as `next/image`'s `src` identity, which retires the separate `imageKey` prop. **The not-URL-shaped part is load-bearing rather than stylistic:** next warns when the loader returns the `src` it was handed, and the staged loader returns the staged URL, so a `sourceKey` set to that URL would warn on every staged tile — the exact trap Task 1's warning case exists to catch, walked into by the prop meant to avoid it.

**Mutant record.** Delete the reconciliation branch: all four cases fail. Reconcile on `hasPreviewSource` alone: cases 3 and 4 fail. Reconcile on the loader function identity: the error-to-placeholder case in Task 1's staged suite fails, because every render clears the failure.

## Task 3: the published site serves width-matched variants, proved in jsdom and in a browser

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.published.test.tsx` ac=AC-2,AC-3,AC-4,AC-5 -->

Round 4 found the previous split unexecutable: a separate later task for the browser oracle would have been green the moment it was authored, because Task 1 already ships `DIAGRAM_TILE_SIZES` and this task ships `buildLoader`. The two halves have ONE production cause — no ladder reaches the browser — so they are one task with two test files, and the ordering defect disappears rather than being argued around.

**What is red and why.** `components/admin/wizard/step3ReviewSections.tsx:4031`: `buildSrc` constructs one original URL and nothing conveys `variants` to the tile, so after Tasks 1 and 2 the published site still renders the constant staged-shaped loader. Both files fail on that one line — the jsdom suite because every candidate is the original, the browser oracle because every srcset descriptor maps to one URL and `currentSrc` can name no tier.

### RED, part one: tests/components/admin/wizard/step3DiagramTile.published.test.tsx

Nine cases, every expected URL composed from the fixture's own `showId`, `snapshot_revision_id`, `snapshotPath` and `variants` rows. **Every case carries two premises** — an image mounted, and more than one srcset candidate — because a set equality over an empty candidate list is vacuously satisfiable.

1. **Ladder present.** The distinct candidate set EQUALS the set of the fixture's variant URLs; the original appears in none; every candidate contains `@`. A third premise guards this row: the fixture ladder holds more than one serving row and none names the original. Equality rather than containment, because a loader falling through to the original above the ladder — what `makeDiagramLoader` deliberately does not do (`lib/images/diagramLoader.ts:1-8`) — adds the original and fails here while containment still passed.
2. **No ladder** (`variants` omitted): the original at every candidate.
3. **Degenerate and malformed ladders**, one `test.each` row per guard-table value: `[]`, `42`, `[{}, { width: "big", key: 5 }, null]`, and a row naming the original itself. Each renders the original and none throws.
4. **Rerender absent → ladder**, on a held element reference: the same mounted `<img>` moves from the original to the variant set. Here node identity IS the right proof — the element persists and only its srcset moves.
5. **Rerender ladder → absent**, the same mechanism in the other direction.
6. **The href does not drift.** `pathOf(href)` equals `diagramAssetUrl(showId, rev, key)` with a Slides-style colon in the object id — legal after the first character and inside the minted-key alphabet (`lib/images/diagramKey.ts:25`). The claim is byte-NEUTRALITY: `encodeKeySegment` decodes `%40` and `%3A` back (`lib/images/diagramLoader.ts:36-50`), so on every key the ingest ladder writes the shared builder is byte-identical to the template it replaces.
7. **The published servability gate**: `snapshotPath: null` and a `mimeType` outside `isAllowedDiagramMime` each render the placeholder with no image element (`components/admin/wizard/step3ReviewSections.tsx:4036-4039`).
8. **An empty `snapshot_revision_id` renders the placeholder, not a URL.** Round 3 probed the first draft's answer and it was wrong: `diagramAssetUrl("show-1", "", key)` yields `/api/asset/diagram/show-1//key`, a doubled slash, which the consequence bound calls malformed. The case also asserts no rendered `src`/`href` anywhere in the tile contains the doubled segment.
9. **Failed, then a ladder arrives — THROUGH THE REAL `buildSourceKey`.** Round 4 found the reconciliation had no integration case: Task 2 case 4 could be satisfied by a hand-changed prop, and this task's cases 4 and 5 keep the image healthy, so a contributor could implement `buildSourceKey` as the asset key alone and every test still passed while a failed published tile never recovered when variants arrived. This case renders `PublishedDiagramsBreakdown` with no ladder, fires `error` on the mounted image, then rerenders with the ladder present and asserts an image is mounted again with a variant in its srcset. A `sourceKey` that ignored `variants` leaves it on the placeholder.

### RED, part two: the browser oracle, in the harness that has a ladder

The staged harness cannot exhibit a tier: its loader is width-independent, so every descriptor maps to one URL. The oracle therefore runs in `tests/e2e/published-review-modal.layout.spec.ts`, whose harness renders the real `PublishedReviewModal` and today passes `diagrams: null` (`tests/e2e/_publishedReviewModalHarness.tsx:129`).

- The harness gains a persisted manifest carrying **the FULL three-tier ladder** the ingest stage writes (`DIAGRAM_VARIANT_WIDTHS = [256, 512, 1024]`, `lib/sync/diagramVariants.ts:13`), and the spec's static server serves real bytes for the original and for each variant key at its true intrinsic width. Round 4 caught the earlier two-tier fixture: with only 256 and 512 there is no 512→1024 transition, so six of the derived boundary points do not exist and the mutant that depends on 922/923 cannot fire. The fixture is the ordinary ingest ladder, not a reduced one, and a `premise` asserts the fixture's serving-row count equals `DIAGRAM_VARIANT_WIDTHS.length` so a reduced fixture reds instead of silently shrinking the cover.
- Over the DERIVED TWO-SIDED viewport set (21 points; DPR 1 and 2 in full, DPR 3 at its sub-640 points): the measured tile width equals `diagramTileWidthAt(viewport)` within 0.5px, and `img.currentSrc` names the ladder tier that measured width warrants at that context's DPR.
- The set is COMPUTED in the spec from `diagramTileWidthAt` ∪ `imageConfigDefault` ∪ `DIAGRAM_VARIANT_WIDTHS`, never pasted, with a `premise` that it is non-empty and contains at least one predecessor/transition PAIR — without which two-sidedness is a claim rather than a fact.

### GREEN, in `PublishedDiagramsBreakdown`

- One local `keyOf(stub)` wrapping `diagramAssetKeyFromPath((stub as PersistedEmbeddedImage).snapshotPath, stub.objectId)` (`lib/data/diagrams.ts:72`), so the key is derived once and href and loader cannot disagree.
- `buildSrc={(stub) => diagramAssetUrl(showId, rev, keyOf(stub))}`, replacing the inline template at `components/admin/wizard/step3ReviewSections.tsx:4031-4034`.
- `buildLoader={(stub) => makeDiagramLoader({ showId, rev, key: keyOf(stub), variants: (stub as PersistedEmbeddedImage).variants })}`.
- `buildSourceKey={(stub) => [keyOf(stub), ...servingRows(stub).map((r) => `${r.width}:${r.key}`)].join("|")}` — Task 2's reconciliation key. Case 9 is what forces the ladder into it.
- **`previewSourceFor` additionally requires a non-empty `rev`.** One condition, in the site this arc owns, and it is what makes the consequence bound TRUE rather than excused: a row whose revision did not survive the resolver gate has no fetchable bytes at any width, so it takes the same placeholder branch as a null `snapshotPath`. The comment at `components/admin/wizard/step3ReviewSections.tsx:4021-4022` is updated from "the asset route 410s it" to say the tile no longer asks.

`red=` is the jsdom command because that is the cycle on one command. The browser oracle runs in the same task by `pnpm heavy pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/published-review-modal.layout.spec.ts`, and its observed red is recorded in the commit alongside the jsdom red — same production cause, one commit, no ordering claim to get wrong.

**Mutant record, in the commit message.** (a) Implement `buildSourceKey` as the asset key alone: case 9 fails and nothing else does, which is the finding that put it there. (b) Replace `DIAGRAM_TILE_SIZES` with the round-1 approximation: `currentSrc` names the wrong tier at the DPR-2 483 and 923 boundaries, confirming sweep and browser agree. (c) Nudge the ≥640px slot by +0.25px: 666 and 922 fail, and only because the set is two-sided. (d) Reduce the harness ladder to two tiers: the fixture premise reds rather than the cover silently shrinking.

**Regression check, per the fix-round regression budget.** `tests/components/admin/review/publishedNoStagedTraffic.test.tsx` asserts the published tile resolves through the asset route; its fixture carries no `variants`, so the PATH must not move. Run it explicitly and record the result.

  **What an earlier draft said here, and why it is gone.** It read: "it must still hold byte-for-byte. If it moves, the encoder or the loader wiring is wrong, not the test." That sentence PRE-COMMITS THE VERDICT on a failure that has not happened yet, and it was wrong when the failure arrived: `next/image` writes an absolute `src`, so the path was byte-identical with the jsdom document origin prepended — not a wiring bug, and not something byte equality could distinguish. A plan cannot know what a future red means, and a sentence that says otherwise removes the executor's judgement at the moment it is most needed. The repair made the assertion stronger than the literal it replaced: path and origin are now pinned SEPARATELY, where one conflated string pinned neither on its own. Probed — a loader emitting a third-party origin fails the origin row, which is the leak this whole pipeline exists to prevent.

## Task 4: invariant-8 dual gate

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-27-admin-diagram-next-image.md; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" $P || exit 1; F=$(awk "/^### Findings and dispositions/{f=1;next} f&&/^#/{exit} f" $P); C=$(awk "/^### Pre-code checklist result/{f=1;next} f&&/^#/{exit} f" $P); printf "%s" "$F" | grep -qE "^\| *P[0-3] " || printf "%s" "$F" | grep -qF "No P0 or P1 findings." || exit 1; for t in "em dash" "tap target" "token" "contrast"; do printf "%s" "$C" | grep -qi "$t" || exit 1; done; printf "%s%s" "$F" "$C" | grep -qi "pending" && exit 1; exit 0'` ac=AC-7 -->

`/impeccable critique` and `/impeccable audit` on the diff, both with the canonical v3 setup gates (the skill's context.mjs load over PRODUCT.md + DESIGN.md, then the register reference read). P0 and P1 findings are fixed in-branch; per the standing directive on this arc nothing is deferred to a ledger row, so anything not fixed is recorded in §12 and named in the readiness message under "Unfixed peers".

**The gate checks POSITIVE content, and two rounds were spent getting there.** Round 3 found the first version passing with both sections reading "Pending" under real headings. Round 4 found the repaired version passing on the findings table's HEADER row (`| Tier |` satisfies a "has a table row" predicate) and with no positive requirement at all on the pre-code section, so an empty section passed by containing no "pending". The gate now requires a findings row whose first cell is a P-tier, OR the literal sentence `No P0 or P1 findings.` for a genuinely clean pair; requires the pre-code section to name all four mechanical checklist items (em dash, tap target, token, contrast); and still refuses "pending" in either. Probed at plan time in three states: red on the live tree, red under round 3's mutant (valid marker over "Pending" sections), and red under round 4's mutant (valid marker, header-only table, empty checklist section).

One pre-existing condition, named before the pair sees it: the tile anchor carries no focus-visible ring today (`className="block"`), so a keyboard user gets only the browser default on a surface this arc touches. Not introduced here. If the pair returns it P0 or P1 it is fixed in-branch like any other finding.

The marker's grammar is `RAN_FORM` at `tests/docs/_invariant8Closeout.ts:45`. The marker claims a gate RESULT; it does not prove the gates ran, and the guard says so about itself at `tests/docs/_invariant8Closeout.ts:11-16`. The dispositions table is the evidence.

## Task 5: graduate the row, last commit before readiness

<!-- task: red=`sh -c 'grep -qE "^#{2,3} BL-ADMIN-DIAGRAM-NEXT-IMAGE" BACKLOG.md && exit 1; awk "/^#+ BL-ADMIN-DIAGRAM-NEXT-IMAGE/{f=1;next} f&&/^#/{f=0} f" BACKLOG-archive.md > /tmp/wizardimg-entry.txt; test -s /tmp/wizardimg-entry.txt || exit 1; grep -q "IN PROGRESS" /tmp/wizardimg-entry.txt && exit 1; for t in "Resolution:" "makeDiagramLoader" "staged" "published"; do grep -q "$t" /tmp/wizardimg-entry.txt || exit 1; done; exit 0'` ac=AC-8 -->

Move the row out of `BACKLOG.md` into `BACKLOG-archive.md` with a `**Resolution:**` naming both sites and the loader, and strip the `**Status:** IN PROGRESS · **Branch:** …` marker in the same commit. Archives categorically reject in-flight entries, so the marker cannot ride along; a marker that reaches `main` names a branch the merge just deleted and reds `tests/docs/_metaLedgerInProgress.test.ts` on main until someone clears it.

This is the PR's LAST commit, before readiness and before the merge — not a post-merge tidy.

**Citation re-verification belongs here**, because round 3 found three stale `file:line` citations after two absorbs and the class is "a citation into a file another arc edits drifts on every absorb". The step is mechanical: re-run `pnpm spec:lint` on the plan after the final absorb, disposition every advisory it reports rather than reading past it, and re-READ every line-form citation the plan makes into a file this branch does not own — `BACKLOG.md`, `docs/agents/writing-plans.md`, and the `components/`/`lib/` anchors — confirming the cited line still holds the symbol its sentence names. `RED_TARGET_INVALID` and the citation arms check that a line is in range, never what is at it.


## Acceptance criteria

Handles. No sibling spec exists for this arc, so these are the plan's own and the tasks' `ac=` markers cite them.

| Id | Handle | Tasks |
|---|---|---|
| AC-1 | The staged site renders through a loader; every candidate is the staged preview route URL | 1 |
| AC-2 | The published site renders through `makeDiagramLoader`; with a ladder every candidate is a variant URL and the original appears in none | 3 |
| AC-3 | Absent, empty, non-array, malformed and original-naming `variants` all render the original; a revision-less row renders the placeholder; never an empty or malformed src, never a throw | 3 |
| AC-4 | The anchor still opens the full-resolution original, and the shared builder is byte-neutral against the template it replaces | 3 |
| AC-5 | In a real browser: the image box equals the anchor box deflated by its computed borders and no request reaches `/_next/image` (Task 1, staged harness); and at every point of the derived two-sided boundary set the measured width equals `diagramTileWidthAt` and `img.currentSrc` names the tier that width warrants (Task 3's browser oracle, in the published harness — the only one with a ladder) | 1, 3 |
| AC-6 | Every transition-inventory pair is pinned behaviourally: the after-load compound case (Task 1), all four reconciliations including the loader-only manifest change (Task 2), and both manifest rerender directions (Task 3) | 1, 2, 3 |
| AC-7 | Both impeccable halves pass; P0 and P1 fixed in-branch; the gate command requires positive evidence content, not a heading or a table header | 4 |
| AC-8 | The row is archived with a resolution and no in-progress marker reaches main, and every line-form citation into a file this branch does not own is re-read after the final absorb | 5 |
| AC-9 | All twelve required CI checks green at a head whose merge base is `origin/main` | close-out |

AC-9 carries no task marker because no `red=` can express it: it is satisfied by real CI on the pushed branch, and a red shelling out to `gh` goes green on a stale run.

## Gates before every push

`pnpm heavy pnpm test` for the whole tree, then `pnpm typecheck`, `pnpm exec eslint .`, and `pnpm format:check`, each as its own command, never chained into the commit. Vitest strips types, so a green suite proves nothing about type errors. Stage by path; never `git add -A`.

Playwright runs non-interactively here, so the layout spec runs under `pnpm heavy`, with its standalone config: `pnpm heavy pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts`.

## The bytes number, and what it is honestly a measurement of

The done condition asks for before/after bytes for one fixture show. Recorded here rather than shipped as a script, because a permanent probe surface is process-facing work this arc does not owe.

There is no local show with diagram snapshots (`select id from shows where diagrams is not null` returns zero rows on the local stack) and no committed manifest with real variant bytes, so a Playwright network log against a seeded show is not available. The measurement is instead taken over the REAL ingest function `generateDiagramVariants` (`lib/sync/diagramVariants.ts`) applied to a real committed 1280×1776 PNG of a rendered page (`tests/e2e/section-header-visual.spec.ts-snapshots/idle-1280-light.png`, 99,456 bytes) — text, borders and gradients, which is what a Slides diagram export compresses like. Measured: tiers at 2,282 / 7,422 / 21,124 bytes. For the 12-tile grid (`DIAGRAM_TILE_CAP`) at the desktop tile width, DPR 2 selects the 512 tier: **1,193,472 bytes before, 89,064 after, 92.5% fewer**; at DPR 1 and on the 390px sheet the 256 tier gives 97.7%. The readiness message states the weaker fact verbatim: this is the ingest ladder measured on a real image, not a live show's asset route.

## Not in this plan

- The other 4,500 lines of `components/admin/wizard/step3ReviewSections.tsx`. The row's exception (c) was about the file's size, and widening past the two sites re-earns the very cost the deferral named.
- Any `blurDataURL` / `placeholder="blur"` on the wizard tile. `PersistedDiagramFields` carries the field and the crew gallery uses it, but a blur placeholder is a perceived-load change on a desktop admin surface, not a bytes change, and it adds a state to the transition inventory. Recorded here so a reviewer sees it was weighed.
- Any change to the crew gallery, the lightbox, the asset route, the ingest ladder, or the manifest shape.
- Any backfill. Existing published shows get variants at their next snapshot, ratified at `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:192`.
- Any mutation score. No enrolled surface is touched.

---

## 12. Close-out

**The `impeccable-gate:` marker line is absent on purpose, and lands in Task 4's commit.** `tests/docs/_metaInvariant8Closeout.test.ts` accepts only a well-formed marker: `critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=<n> p1=<n> dispositions=(recorded|none)`. Nothing truthful can be written there before the gates run, and a placeholder is a malformed marker line that reds §4.1.2 (probed: `impeccable-gate: PENDING` fails both §4.1.1 and §4.1.2). `PRE_GUARD_DEBT` is not the escape — it is scoped to pre-guard history, and a row for a live arc reds on its own rule the moment the marker lands.

So this plan is a declaring unit with no marker until Task 4, which means **the branch is not pushed between the plan commit and Task 4's gate commit**. The ledger's IN PROGRESS marker was pushed at Stage 0 and is what invariant 12 requires; the review dispatches read the live worktree, not origin; and CI's twelve are a close-out gate, so nothing is lost by holding. Stated here rather than discovered by a reviewer wondering why the section looks unfinished.

### Findings and dispositions

Pending Task 4.

### Pre-code checklist result

Pending Task 1. The mechanical UI checklist runs BEFORE the first UI edit, because the invariant-8 pair verifies and does not discover: em-dash ban and apostrophe literals in user-visible copy (this diff adds no user-visible string — the placeholder copy "Preview unavailable" is unchanged); 44px tap targets (the anchor is the interactive element and its box is the 4:3 tile, far past the floor at every measured breakpoint — asserted in Task 1's e2e); canonical type and token classes (no type or color class changes, and the two branches keep their distinct border tokens); no new color token, so no new contrast pin is owed.

## 13. Plan review rounds

Task numbers inside a round's record are the numbering **current at that round**. Round 4 merged the browser-oracle task into the published task, so what rounds 1 to 3 call Task 3 is now Task 2 or 3, and their Task 6 is now Task 5. The records are evidence and are not rewritten to look like they said something else; §12 and the task region carry the live numbering.

Six findings, all accepted, all repaired above. Recorded so a later round does not re-derive them, and so the classes are visible rather than the instances.

| # | Finding | Class, and the sweep it triggered | Repair |
|---|---|---|---|
| 1 | The Playwright command cannot collect the layout suite: it lives only in `tests/e2e/standalone.config.ts:86`, and the default project does not match it. BLOCKING. | *A command the plan names that cannot run what it claims.* Swept ALL of them, mechanically, with the extractor in the command-sweep section: 16 commands, each run or its collection settled. | The standalone-config flag added on both occurrences, `--list` run at plan time (35 tests), and the whole sweep table added. |
| 2 | The `sizes` derivation omitted two 20px paddings and the panel-card border, and "within the range" named no threshold and no tier oracle. BLOCKING. | *A number derived by reading classes rather than measured, and an assertion that names no oracle.* Swept every numeric literal in the plan; this was the only computed one. | Full chain table with every term cited; corrected string; a tier-equality oracle over `imageConfigDefault ∪ DIAGRAM_VARIANT_WIDTHS`, probed at plan time over 11 viewports × 3 DPRs; the string exported so test and component cannot diverge; the committed value set from the browser measurement. |
| 3 | The warning-absence case can pass for the very implementation it targets: `warnOnce` dedupes process-wide on the message, and an earlier case's render consumes it. MEDIUM. | *A test whose discriminating power is destroyed by process-global state.* Swept the file for other process-global dependencies: `console` is the only one, and no module-level cache is read. | Unique `objectId` per case across the whole file, and the spy installed before that case's own render. Both stated as required, not incidental. |
| 4 | Published cases asserted over candidate sets with no executable premise, and `variants: []` was named by AC-3 with no case. MEDIUM. | *An enumerated guard condition with no case, and an assertion that is vacuously satisfiable.* Swept by giving the guard-condition table a "covered by" column, so an uncovered row is now visible on sight. | Two premises on every published case, a third on case 1 for a non-degenerate ladder, and `[]` added as a `test.each` row. |
| 5 | The inventory mistook initial candidate selection for the lifecycle: tiles carry a stable key, so a manifest change moves a mounted image's srcset in both directions. MEDIUM. | *An inventory covering mount-time states but not prop-change rerenders.* Swept every prop the tile derives state from; `variants` is the only one that can change under a stable key. | Both directions added to the inventory and to the guard table, with Task 2 cases 4 and 5 asserting them on a held element reference. |
| 6 | No collection or CI-wiring declaration for the new Vitest files. LOW. | *A new artifact whose wiring the plan does not name.* Swept every artifact this plan creates or edits: two Vitest files, one e2e file, one harness. | A wiring section: `BASE_INCLUDE`, the parallel project glob, the unfiltered `unit-suite` trigger, and the standalone e2e config, each verified on this base. |

Also folded in, found during self-review while the round was in flight and not raised by it: the href case's claim restated as byte-neutrality rather than as a fix the real key alphabet cannot demonstrate; `premiseHolds` rather than `premise` for the boolean conditions; the border, radius and background relocating to the anchor because `fill` insets against the padding box, with the two branches' distinct tokens preserved; the crew gallery's WebKit containing-block precedent cited with why it cannot bite here; and the tile anchor's pre-existing missing focus ring named ahead of the impeccable pair.

### Round 2 (base `fb4642740622`, five findings, all accepted)

The base had moved once already; this round's repairs are folded in above and the base line now reads `66c9857f5` after a second absorb.

| # | Finding | Class, and the sweep it triggered | Repair |
|---|---|---|---|
| 1 | The `sizes` derivation still omitted the modal's own `sm:p-6` outer padding, so the panel equation was wrong from 640px up and the "constant from 1024px" claim was false until 1072px. Three sample viewports cannot expose the resulting tier mistakes; a full sweep finds 215. BLOCKING. | *A layout number derived by reading classes, and an oracle sampled at points rather than over its domain.* The second occurrence of round 1's finding 2, which is the signal the repair direction was wrong rather than the arithmetic. So the repair is not a third correction of the same paragraph: the model ships as exported code, the declared string is exact, and **the browser became the oracle** via `img.currentSrc` over a DERIVED boundary viewport set. No arithmetic in the test duplicates the model, and no `sizes` parser is written. | Chain table gains the outer-padding row; `diagramTileWidthAt` and `DIAGRAM_TILE_SIZES` exported; full integer sweep 320–1600 × DPR 1/2/3 run at plan time (clean; the old string fails 215); `calc()` interaction with next's `getWidths` regex checked; DPR-3 desktop coverage recorded as a documented limit. |
| 2 | The geometry assertion compared a border box to a padding box while the same task moved a 1px border onto the anchor — it could not pass. BLOCKING. | *An assertion whose two sides are different boxes.* Swept every dimensional row for box semantics; this was the only one, and the placeholder row is unaffected because both branches are measured the same way. | The assertion deflates the anchor's rect by its own `getComputedStyle` border widths, so no token literal enters the test. |
| 3 | The inventory still omitted every availability transition: `failed` is initialised once from `hasPreviewSource` and only ever set true, so unavailable→available never recovers, available→unavailable waits for a fetch to fail, and a failure on source A survives a move to source B. The "compound" case traced the same events as the plain error case. BLOCKING. | *An inventory reasoning about what a MOUNT can reach rather than what a stable key can reach.* Swept every prop the tile derives state from: `hasPreviewSource`, `href`, `imageKey`, `loader`. All four now reconcile. | Three rows added to the inventory and the guard table; the tile reconciles `failed` during render on identity change; staged cases 9–11 assert it on a held element reference; the compound case became error-after-load, which is genuinely distinct. This is a REPAIR of an existing defect, stated as such. |
| 4 | Three published-only guard conditions (`snapshotPath`, `mimeType`, `snapshot_revision_id`) were assigned to a staged test whose predicate never reads them. MEDIUM. | *A coverage column asserting an ownership the predicate contradicts.* Swept the whole table against the two predicates rather than fixing three rows: every row now names the mode whose gate actually reads it, and two staged-only rows were added that the first draft had left implicit. | Rows moved to Task 2 cases 7 and 8; Task 1 case 6 restated over both staged non-servable shapes. |
| 5 | The plan named a stale base. LOW. | *A fact about the live tree that goes stale on every absorb.* | `66c9857f5`, and the round record now says which base each round ran at, so the next absorb makes the drift visible rather than silent. |

### Round 3 (base `66c9857f56a5`, seven findings, all accepted)

The round that changed the plan's shape rather than its numbers. Two of its findings were disproofs of arguments the plan had been making since round 1.

| # | Finding | Class, and the sweep it triggered | Repair |
|---|---|---|---|
| 1 | The browser oracle could not observe what it claimed: the only real-browser harness renders STAGED mode, whose loader is width-independent, so every srcset descriptor maps to one URL and `img.currentSrc` names no tier. The derived viewport set was also one-sided, so a transition firing one pixel early escaped. BLOCKING. | *An oracle placed in a harness that cannot exhibit the phenomenon.* The third round in a row on `sizes`, which is the signal to stop correcting the arithmetic and check the instrument instead. The sweep: for each assertion in the plan, does the harness it runs in contain the thing it measures? Only this one failed, because only this one needs a manifest. | The oracle moves to `tests/e2e/published-review-modal.layout.spec.ts`, whose harness renders the real `PublishedReviewModal` and today passes `diagrams: null` (`tests/e2e/_publishedReviewModalHarness.tsx:129`); Task 3 gives it the full three-tier ingest ladder and serves real bytes. The viewport set becomes two-sided (21 points, computed not pasted), with a premise that it contains at least one predecessor/transition pair. The staged harness keeps the geometry assertions, which need no ladder. |
| 2 | The empty-revision case could not pass its own implementation: `diagramAssetUrl(show, "", key)` yields `/api/asset/diagram/show//key`, a doubled slash, while the plan demanded a well-formed URL. BLOCKING. | *A guard-table row whose stated outcome the GREEN path cannot produce.* Swept every row against the code path that would render it; this was the only one whose answer was a URL rather than a branch. | The published servability gate additionally requires a non-empty `rev`, so the row takes the placeholder branch. One condition, in the site this arc owns, and it makes the consequence bound TRUE rather than excused — a revision-less row has no fetchable bytes at any width, so the tile stops asking. |
| 3 | The reconciliation cases' anti-remount proof was impossible: case 11 varied `objectId`, which IS the key, so it remounts and passes against the unrepaired component; and cases 9–10 claimed a held element reference across a `<span>`↔`<a>` swap, which necessarily replaces the node. BLOCKING. | *A test whose stated proof mechanism the DOM cannot provide.* Swept every case in the plan that claims element identity: three claimed it wrongly here, and Task 3's manifest rerenders claim it correctly, because there the `<img>` genuinely persists. | Case 3 moves the href by varying the WIZARD SESSION — same objectId, same key, same testid — with a `premiseHolds` that the href actually moved. Cases 1 and 2 state the real proof: the key is stable, so React keeps the instance, and `failed` starts true and is only ever set true, so the swap cannot happen without a reset. |
| 4 | Reconciliation omitted loader-only identity changes, which Task 3 deliberately creates: a ladder arriving while the tile is already failed leaves serving variants that never render. BLOCKING. | *A sweep that named four inputs while the design compared three.* The round-2 record itself claimed `loader` reconciled — the claim and the mechanism had drifted inside one document. | `sourceKey`, a caller-derived non-URL string naming the bytes the tile can serve, replaces `imageKey` and carries the ladder. The loader itself cannot be the comparison: it is a fresh closure every render, so comparing it would clear the failure state on every render, which the mutant record now pins. |
| 5 | The layout assertion DOES have an honest red — the live anchor is `className="block"`, so `position` reads `static` — so the mandatory layout task was a real TDD task all along and the recorded-mutants substitute was unnecessary. BLOCKING. | *An argument from "this cannot be red" that one grep disproves.* Swept the same argument where it was also made for the transition-audit task: it fails there too, because three of its transitions are unreachable in the current component. | Both mandatory task types became their own TDD tasks (1 and 2), each with its own production-caused red. The plan's "why neither is a task" section became "the two mandatory task types", and says plainly that the earlier argument was wrong. Mutants stay as a supplement, never a substitute. |
| 6 | The close-out gate passed with both evidence sections still reading "Pending": it checked for a valid marker and two headings, and the headings already existed. BLOCKING. | *A gate that checks the shape of evidence rather than its presence.* Swept the plan's other declared gate, Task 6's, against the same question: it already checks content (four required tokens inside the extracted archive entry), so only this one was shape-only. | The gate requires the dispositions section to hold at least one table row and neither section to contain "pending". Probed both ways at plan time: red on the live tree, and still red under round 3's own mutant of a valid marker pasted above unfilled sections. |
| 7 | Three live-tree citations were stale after two absorbs. LOW. | *A citation into a file another arc edits drifts on every absorb, silently, because the lint arm checks that a line is IN RANGE and never what is AT it.* | Fixed, and the class is now a step rather than a hope: Task 6 re-reads every line-form citation into a file this branch does not own, after the final absorb, matching each cited line to the symbol its sentence names. |

### Round 4 (base `66c9857f56a5`, five findings, all accepted — the round cap)

Every finding was an internal-consistency defect: something the plan said contradicting something else the plan said, or a gate not doing what its own sentence claimed. None opened a new axis.

| # | Finding | Class, and the sweep it triggered | Repair |
|---|---|---|---|
| 1 | The browser-oracle task could not execute its red-green cycle in plan order: Task 1 already ships `DIAGRAM_TILE_SIZES` and Task 3 ships `buildLoader`, so authoring the oracle later would pass immediately. BLOCKING. | *A task whose red is caused by a line an EARLIER task in the same plan repairs.* Swept every task's red against the production state at the moment it runs: this was the only one whose cause was already gone. | The oracle merged into Task 3. Both halves have one production cause — no ladder reaches the browser — so they are one task with two test files, one commit, and no ordering claim to get wrong. |
| 2 | The published oracle's two-tier fixture could not exhibit the three-tier transitions the derived boundary set is computed from: with only 256 and 512 there is no 512→1024 transition, so six derived points do not exist and the 922/923 mutant cannot fire. BLOCKING. | *A fixture narrower than the domain the assertion is derived over.* Swept every fixture in the plan against the constant its assertions range over; the staged fixtures are unaffected because they range over no ladder at all. | The harness carries the full `DIAGRAM_VARIANT_WIDTHS` ladder, and a premise asserts the fixture's serving-row count equals that constant's length, so a reduced fixture reds instead of silently shrinking the cover. |
| 3 | `sourceKey` had no integration case: Task 2's case changes the prop by hand, and the published rerender cases keep the image healthy, so `buildSourceKey` implemented as the asset key alone passes everything while a failed published tile never recovers when variants arrive. BLOCKING. | *A repair unit-tested at the seam and never through the caller that computes its input.* Swept the plan's other caller-computed values — `buildSrc`, `buildLoader`, `previewSourceFor` — each of which has a case going through `PublishedDiagramsBreakdown` rather than through `DiagramTile`. `buildSourceKey` was the only one that did not. | Task 3 case 9: render published with no ladder, fail the image, rerender with the ladder, assert recovery with a variant in srcset. The mutant record pins it — implement `buildSourceKey` as the asset key alone and case 9 is the only failure. |
| 4 | The repaired close-out gate still passed without evidence: `\| Tier \|` satisfies a "has a table row" predicate, and the pre-code section had no positive requirement, so an empty section passed by containing no "pending". BLOCKING. | *The same fail-open class as round 3's finding 6, one layer in.* Two rounds on one gate is the signal to stop tightening the predicate and state what the evidence must POSITIVELY contain. | A findings row whose first cell is a P-tier, or the literal `No P0 or P1 findings.` for a genuinely clean pair; all four mechanical checklist items named in the pre-code section; "pending" still refused. Probed red in three states: live, round 3's mutant, and round 4's own. Parked as `LIM-GATE-EVIDENCE-SHAPE-ONLY` in the filing at `docs/review-rounds/perf/admin-diagram-next-image/66c9857f56a5.md`. |
| 5 | §12's close-out instructions still pointed at Task 3 for the dual gate after it became Task 5, requiring a result to be recorded before it exists. BLOCKING. | *A cross-reference by ORDINAL, which every task renumbering silently invalidates.* Swept every task ordinal in the plan outside the task region; §12 held three and the AC table held four. | All fixed, and §13 now states that a round record's task numbers are the numbering current at that round, so the historical rows stay evidence rather than being rewritten. |

**Round cap.** This is the arc's fourth plan round, `ROUND_THRESHOLD` in `lib/reviewRounds/constants.ts:11`. The filing is at `docs/review-rounds/perf/admin-diagram-next-image/66c9857f56a5.md`. A fifth round is a re-scope decision and belongs to the orchestrator, not to this plan.

