# Plan: the two admin wizard diagram sites render through the diagram loader

**Row:** `BL-ADMIN-DIAGRAM-NEXT-IMAGE` (`BACKLOG.md:68`). **Branch:** `perf/admin-diagram-next-image`. **Base:** `5fccaaac7`.
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

Every runnable command named anywhere in this plan, extracted mechanically and settled. The extractor:

```
grep -noE '`(pnpm|node|npx|sh -c|git|grep -r)[^`]*`' docs/superpowers/plans/2026-08-27-admin-diagram-next-image.md
```

| Command | Settled how |
|---|---|
| `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check` | Run; baselines above. |
| `grep -rn "<img" app/ components/` | Run; output is the sweep table below. |
| `pnpm vitest run tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` | Authored red — the file does not exist yet. Collection is proven by the wiring declaration below and by the sibling `tests/components/admin/wizard/step3ReviewSections.test.tsx` collecting in the baseline run. |
| `pnpm vitest run tests/components/admin/wizard/step3DiagramTile.published.test.tsx` | Same. |
| `pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts` | `--list` run at plan time: collects, `Total: 35 tests in 1 file`. The `--config` flag is load-bearing; without it the file matches no project and the run exits green having collected nothing. `pnpm test:e2e:modal-header` (the `test:e2e:modal-header` script, package.json line 66) is the committed alias that carries the same flag. |
| `pnpm vitest run tests/components/a11y/newTabAnnouncementBehavior.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx` | Run; green in the baseline. |
| Task 3's and Task 4's `sh -c` gates | Both run at plan time; both exit 1 on the current tree. All four `red=` commands parse-check clean under `sh -nc`. |
| `pnpm heavy pnpm test`, `pnpm heavy pnpm exec playwright test …` | Wrapper form per the heavy-phase rule; the inner commands are the rows above. |

## Test-file collection and CI wiring

Declared per `docs/agents/writing-plans.md:27`, verified on this base.

- Both new Vitest files live under `tests/components/admin/wizard/`. `BASE_INCLUDE` is `["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`) and the DB-free parallel project's glob list carries `tests/components/**/*.test.{ts,tsx}` (`vitest.projects.ts:105`), so both are collected by `pnpm test` and by the `unit-suite` CI job with **no new entry to add**. Neither appears in the serial-only exclusion lists.
- The `unit-suite` workflow trigger is unfiltered by path (`.github/workflows/unit-suite.yml:90-94`), so no path filter needs widening.
- The e2e additions land in an existing file already matched by `tests/e2e/standalone.config.ts:86`, and its committed alias `pnpm test:e2e:modal-header` (the `test:e2e:modal-header` script, package.json line 66) already names it. No config edit is owed.

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

| Input | Value | Rendered result | Covered by |
|---|---|---|---|
| `variants` | absent (old manifest, the common case today) | `validVariants(undefined)` → `[]` → constant loader → the original asset URL at every candidate width. | Task 2 case 2 |
| `variants` | `[]` (GIF, generation failure) | Same as absent. | Task 2 case 3 |
| `variants` | a non-array (`42`) | `validVariants` returns `[]`. Same as absent. Never throws. | Task 2 case 3 |
| `variants` | rows present but every row malformed | Same as absent. | Task 2 case 3 |
| `variants` | one row naming the original key | `servingVariants` drops it; falls back to the original. Never a variant URL that resolves to original bytes. | Task 2 case 3 |
| `variants` | a valid ladder | Smallest tier ≥ the requested width; above the ladder, the largest tier. | Task 2 case 1 |
| `variants` | absent, then a ladder on a later render (the show's next snapshot) | The mounted image's srcset moves from original to variants in place. | Task 2 case 4 |
| `variants` | a ladder, then absent on a later render (a regenerated snapshot whose variant stage failed) | The mounted image's srcset moves back to the original in place. | Task 2 case 5 |
| `snapshotPath` | `null` | `previewSourceFor` is false → the placeholder branch renders and NO image element mounts. Unchanged from today. | Task 1 case 6 |
| `mimeType` | not in the allowed set | Same as above: placeholder, no element. Unchanged. | Task 1 case 6 (same branch) |
| `snapshot_revision_id` | `""` (a malformed row past the resolver gate) | Original and variant URLs both carry `""` as `<rev>` and the asset route 410s both. The error branch below is what the user sees. Unchanged from today's behaviour, which the comment at `components/admin/wizard/step3ReviewSections.tsx:4021-4022` already records. | Task 1 case 7 (the error branch) |
| runtime fetch | 4xx/5xx on whichever candidate the browser chose | `onError` → `failed` → the placeholder. | Task 1 cases 7, 8 |

The consequence bound the reviews converge against: **each of the two sites renders the variant URL when serving variants exist and the original otherwise, and never an empty or malformed src.** The domain is finite: the manifest shapes the ingest ladder writes, plus the absent/empty/malformed cases enumerated above.

## Transition inventory

Round 1 corrected this section: the first draft called original-to-variant "not a state transition", reasoning only about initial candidate selection. Tiles carry a stable React key (`components/admin/wizard/step3ReviewSections.tsx:3911`, `key={`${stub.objectId}-${i}`}`), so a persisted-prop change rerenders the SAME mounted image and its srcset moves. Both directions are real and both are now in the inventory.

There is no `AnimatePresence` and no framer-motion anywhere in `DiagramTile`, and none is added.

| Pair | Treatment |
|---|---|
| unavailable-at-mount → (none) | Terminal. `useState(!hasPreviewSource)` starts `failed` true; no element ever mounts and nothing can move it. |
| image → placeholder (runtime error) | Instant. `onError` sets `failed`; the next render swaps the anchor for the span. No animation, and none is wanted: the swap reports a failure, and a fade would read as a load. |
| original → variant (rerender: the show's next snapshot lands a ladder) | Instant, in place. Same key, same element; only `srcset` and `src` move. The defect this pins is a loader memoised on mount, which would leave the original in place forever. |
| variant → original (rerender: a later snapshot whose variant stage failed, or a GIF) | Instant, in place, the same mechanism in the other direction. |
| COMPOUND: an error arriving while the image is still lazy-pending | Instant, same branch. jsdom-testable by dispatching `error` before any load event; the state machine has no intermediate. |

## Dimensional invariants

`fill` makes the image `position: absolute; inset: 0`, so its box is the padding box of its nearest **positioned** ancestor. Today's anchor is `class="block"`, which is `position: static`. If the `relative` class is omitted the image escapes to the modal panel, which IS positioned (`components/admin/review/ReviewModalShell.tsx:624`), and one thumbnail covers the whole dialog. jsdom computes no layout and cannot see this.

The crew gallery records a second, sharper version of the same trap: `relative` had to live on the grid CELL rather than on the interactive `<button>`, because WebKit resolves a child's `height: 100%` against the aspect-ratio BORDER box, and a `fill` image containing-blocked by that button came out 2px taller than the cell's content box (`components/diagrams/Gallery.tsx:338-344`). **That shape cannot occur here**: the grid child IS the anchor, it carries `aspect-4/3` directly, and no descendant uses `height: 100%`. Named so a reviewer does not rediscover it, and pinned by the measurement below rather than by this paragraph.

| Parent | Child | Relationship | Guaranteed by |
|---|---|---|---|
| `<a data-testid=…-diagram-tile-N>` | the `next/image` `<img>` | `img` border box === anchor padding box, both axes, ±0.5px | `relative` on the anchor plus `fill` on the image |
| the grid cell | `<a>` | anchor keeps the 4:3 ratio and the grid-cell width | `aspect-4/3 w-full` moves from the image to the anchor |
| the grid cell | the placeholder `<span>` | the unavailable branch keeps the SAME box as the available branch | both branches carry `aspect-4/3 w-full`; the span already does today |

## The `sizes` string, its derivation, and the tier oracle that guards it

Round 1 found the first draft's derivation omitted two nested 20px paddings and the panel-card border, and that "within the range the declared string resolves to" named no threshold and no tier oracle. Both are repaired here.

**The full chain**, every term read on this base:

| Term | Value | Source |
|---|---|---|
| panel width | `min(viewport, 1024)` | `w-full sm:max-w-5xl`, `components/admin/review/ReviewModalShell.tsx:624` |
| side rail | 240px, only at `lg` (≥1024px) | `hidden w-60 … lg:flex`, `components/admin/review/ShowReviewSurface.tsx:865` |
| content scroller padding | 20px each side | `p-tile-pad`, `components/admin/review/ShowReviewSurface.tsx:1028`; `--spacing-tile-pad: 20px`, `app/globals.css:240` |
| panel-card padding + border | 20px each side + 1px each side | `p-tile-pad` + `border`, `components/admin/wizard/step3ReviewSections.tsx:1052` |
| grid | 3 columns below `sm`, 4 at and above, 8px gaps | `grid grid-cols-3 gap-2 sm:grid-cols-4`, `components/admin/wizard/step3ReviewSections.tsx:3908` |

which gives `tile = (min(vw,1024) − (vw ≥ 1024 ? 240 : 0) − 40 − 42 − 8×(cols−1)) / cols`: **97.3px at 390, 173.5px at 800, 169.5px at 1280** (constant at 169.5 for every viewport ≥ 1024, because the panel caps there).

**Declared:** `(min-width: 1024px) 170px, (min-width: 640px) 23vw, 25vw`. The breakpoints are the two real layout switches — `sm` (the 3→4 column change) and `lg` (the rail appearing) — not round numbers.

**The tier oracle, because closeness in pixels is not the claim.** What matters is whether the declared string ever makes the browser select a LARGER ladder tier than the measured width would. That is computable and closed: for a needed device width, next offers the smallest candidate in `imageConfigDefault.imageSizes ∪ deviceSizes` that covers it, and the shipped loader clamps that candidate to the smallest ladder tier at or above it. Probed at plan time over 11 viewports × DPR 1/2/3, importing `imageConfigDefault` from next and `DIAGRAM_VARIANT_WIDTHS` from the ingest module rather than pasting either:

```
vw= 320 measured=  74.0 declared=  80.0 over=   8.1%  dpr1 256==256  dpr2 256==256  dpr3 256==256
vw= 390 measured=  97.3 declared=  97.5 over=   0.2%  dpr1 256==256  dpr2 256==256  dpr3 512==512
vw= 430 measured= 110.7 declared= 107.5 over=  -2.9%  dpr1 256==256  dpr2 256==256  dpr3 512==512
vw= 639 measured= 180.3 declared= 159.8 over= -11.4%  dpr1 256==256  dpr2 512==512  dpr3 1024==1024
vw= 640 measured= 133.5 declared= 147.2 over=  10.3%  dpr1 256==256  dpr2 512==512  dpr3 1024==1024
vw= 800 measured= 173.5 declared= 184.0 over=   6.1%  dpr1 256==256  dpr2 512==512  dpr3 1024==1024
vw=1023 measured= 229.3 declared= 235.3 over=   2.6%  dpr1 256==256  dpr2 1024==1024  dpr3 1024==1024
vw=1024 measured= 169.5 declared= 170.0 over=   0.3%  dpr1 256==256  dpr2 512==512  dpr3 1024==1024
vw=1280 measured= 169.5 declared= 170.0 over=   0.3%  dpr1 256==256  dpr2 512==512  dpr3 1024==1024
ALL TIERS MATCH
```

Percentage closeness is deliberately NOT the assertion: 10.3% at 640 is harmless and a 2% error can cross a tier boundary. **The committed assertion, in Task 1's e2e, is tier equality at the three MEASURED widths** — the arithmetic above is a derivation, and the browser is the authority. If the measurement disagrees with the table, the declared string is set from the measurement and this section is corrected in the same commit; that is why the string is exported from the component and read by the test rather than pasted into it.

## Meta-test inventory

Mandatory per `docs/agents/writing-plans.md:19`, which accepts "none applies" only with the reason declared.

**This plan creates no structural meta-test and extends none.** The five registries that rule names are Supabase call boundaries (`tests/auth/_metaInfraContract.test.ts`), sentinel hiding in optional text (`tests/components/tiles/_metaSentinelHidingContract.test.ts`), `admin_alerts.upsert` catalog completeness (`tests/messages/_metaAdminAlertCatalog.test.ts`), advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`), and no-inline-email-normalization (`tests/admin/no-inline-email-normalization.test.ts`). This diff touches no Supabase call, no DB write, no advisory lock, no `admin_alerts` row and no email path, so none has a new member to register. Invariant 10 is likewise untouched: no mutating route handler and no `"use server"` action is added or changed.

**Deliberately not proposing a "no raw `<img>` on diagram surfaces" walker.** After this diff the population of diagram render surfaces is three, all loader-driven, all directly asserted by their own suites. A walker over a population of three whose done condition is a property of the walker rather than a number anyone would notice moving is exactly what the 2026-08-25 process freeze declines. The four non-instances in the sweep table above would each need an exemption row, which is the maintenance cost with none of the benefit.

## Mutation enrolment

`grep -n sourcePath tests/mutation/source/registry.ts` on this base returns no row under `components/`, `app/` or `lib/images/`. **No enrolled surface is touched**, so no round-1 diff brief carries a `GUARD SURFACE:` line and no score is owed. Nothing is enrolled under review pressure.

## The two mandatory task types, and why each lands where it does

`docs/agents/writing-plans.md:12-13` makes a layout-dimensions task and a transition-audit task mandatory for surfaces of this shape. Both assertions are in this plan; **neither is its own task**, and the reason is the RED-validity rule two bullets below them.

A separate later task's red would be **green the moment it is authored**: once Task 1 has landed `relative` on the anchor, an assertion that the anchor is positioned passes immediately, and the writing-plans rule rejects exactly that marker. Ordering it before Task 1 is worse — there is no `fill` child yet, so the assertion would be about a raw `<img>` whose box already equals its anchor's, which is true before and after and discriminates nothing.

So both land inside Task 1, in the commit that creates the parent-child relationship they constrain, and their discriminating power is established by **recorded mutants** rather than by a fake cycle: Task 1's commit message carries the observed failure of each assertion against a deliberately broken tree. That is the "four pre-dispatch mutants" posture of the same rule set, applied to a pin that cannot honestly be a red.

<!-- tasks: depth=2 -->

## Task 1: the tile renders through a caller-supplied loader, and the staged site supplies the original-only one

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` ac=AC-1,AC-3,AC-5,AC-6 -->

**What is red and why.** A new test file, tests/components/admin/wizard/step3DiagramTile.staged.test.tsx, asserts that a staged diagram tile offers the browser width-keyed srcset candidates and that every one of them is the staged preview route URL. The production line that makes it fail is `components/admin/wizard/step3ReviewSections.tsx:3833`, a raw `<img src={src}>` with no `srcSet` attribute at all: the candidate list is empty, and the `premise` guarding the row reports the assertion as unreachable rather than letting it pass on nothing.

RED, eight cases in the new file, all rendering `DiagramsBreakdown` in staged mode through the existing `wizardSessionId`/`dfid` props. **Every stub carries its OWN `objectId`, unique across the whole file** — the reason is case 2.

1. **Width-keyed candidates, all original.** Parse `srcset`, split on `,`, take the URL of each entry, compare pathnames (jsdom resolves `img.src` against the document origin — the gallery suite's `pathOf` helper at `tests/components/diagrams/Gallery.test.tsx:246-248` is the precedent). `premiseHolds` that an image element mounted, then `premise("next/image emitted more than one srcset candidate", candidates.length, 1)`. Every candidate equals the staged route URL built from the fixture's own `wizardSessionId`, `dfid` and `objectId`; none contains `@`; none contains `/_next/image`; none contains `/api/asset/diagram`. The expected URL is composed from the fixture values in the test, never pasted.
2. **`src` identity is not the URL**, asserted by the ABSENCE of next's missing-loader-width warning: spy on `console.warn`, render, assert no call whose first argument contains `does not implement width`. This is the case that catches passing the URL as the identity, which is the obvious wrong port of the gallery pattern and is silent in every other assertion.

   **Round 1 found this case can pass for the exact implementation it targets.** Next dedupes through `warnOnce`, which is process-global and keyed on the message string, and the message embeds `src`. An earlier case rendering the same fixture would consume the warning, and the spy — installed afterwards — would see nothing. Two things make the case discriminating, and both are required: the spy is installed BEFORE this case's own render, and this case's stub carries an `objectId` used by no other case in the file, so its warning is a message no earlier render could have emitted.
3. **The anchor keeps its sole accessible name and the image stays decorative.** `getAttribute("aria-label")` on the anchor is `${alt} (opens in a new tab)`, derived from the fixture's `alt`; the image's `alt` is `""`. This is the a11y contract at `components/admin/wizard/step3ReviewSections.tsx:3810-3818` and it must survive the element swap.
4. **The href is the full-resolution original**, unchanged: the anchor's `href` is the staged route URL, `target="_blank"`, `rel="noopener noreferrer"`.
5. **The declared `sizes` reaches the element.** The rendered `sizes` attribute equals the constant the component exports, read from the module rather than pasted, so the e2e's tier oracle and the DOM cannot disagree about which string shipped.
6. **Unavailable at mount → placeholder, no image element.** Covers the `snapshotPath: null` and disallowed-MIME rows of the guard table via their shared staged predicate (`contentUrl: null` with no media pair). Already covered for one shape at `tests/components/admin/wizard/step3ReviewSections.test.tsx:793-801`; restated here because this file owns the inventory.
7. **Image → placeholder on a runtime error**, in one step: `fireEvent.error` removes the image and renders "Preview unavailable" in the same testid slot.
8. **COMPOUND: an error arriving before any load event** takes the same single step. No `AnimatePresence` and no motion component appears in the rendered tree in any of cases 6-8.

GREEN, in `components/admin/wizard/step3ReviewSections.tsx`:

- `DiagramTile` takes `href` (the full-resolution URL the anchor opens), `imageKey` (the `next/image` `src` identity, ignored by every loader), `loader` (an `ImageLoader`), and `sizes`, alongside today's `alt`, `testId`, `hasPreviewSource`. The single `src` prop is retired: two strings that both look like sources is the reader-load defect this API shape exists to avoid.
- The anchor gains `relative aspect-4/3 w-full overflow-hidden`, and the chrome moves with the box: `rounded-md border border-text-faint bg-surface-sunken` leave the image for the anchor, and only `object-cover` stays on the image. This is the crew gallery's arrangement (`components/diagrams/Gallery.tsx:351`), and it is required rather than cosmetic — a `fill` image is inset against the anchor's PADDING box, so a border left on the image would no longer bound the tile. **The two branches keep their DISTINCT border tokens** as they are today: `border-text-faint` on the live tile, `border-border` on the placeholder span. Unifying them under cover of the move would be an undeclared visual change.
- The image becomes `<Image fill sizes={sizes} className="object-cover" …>` and keeps `alt=""` and the `onError` handler. `loading="lazy"` and `decoding="async"` are `next/image` defaults and are dropped as explicit attributes.
- The `eslint-disable-next-line @next/next/no-img-element` at `components/admin/wizard/step3ReviewSections.tsx:3830-3832` is removed with the element it exempted, and the stale comment at `components/admin/wizard/step3ReviewSections.tsx:3784-3785` is rewritten to state what is now true: the crew gallery is loader-driven, the `/_next/image` optimizer is never reached because the loader emits our own asset-route URLs, and cookies therefore survive.
- `DiagramsBreakdown` gains an optional `buildLoader?: (stub: EmbeddedImageStub) => ImageLoader`. Its default is `(stub) => () => resolveSrc(stub)` — the width-independent staged loader, derived from the existing `resolveSrc` so the staged URL is defined in exactly one place.
- The `sizes` string is an EXPORTED constant `DIAGRAM_TILE_SIZES = "(min-width: 1024px) 170px, (min-width: 640px) 23vw, 25vw"`, declared beside the grid it describes, with the derivation table above condensed into its comment. Exported so both the jsdom case 5 and the e2e tier oracle read the shipped value.
- `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:1071-1081` is updated to the new prop names — `href`, `imageKey`, and a one-line constant `loader` — with its `toHaveAccessibleName` expectation untouched. That suite owns the new-tab suffix contract, not the image contract; changing its expectation would be a gate edit, not a call-site update.

**Same commit, the two mandatory assertions, each verified by a recorded mutant** (see the section above for why they are not separate tasks). In `tests/e2e/step3-review-modal.layout.spec.ts`, whose harness already renders `HARNESS_DIAGRAM_STUB_COUNT` staged stubs and already measures tile widths at 390/800/1280 (`tests/e2e/step3-review-modal.layout.spec.ts:481-523`):

- `tests/e2e/_step3ReviewModalHarness.tsx:69-75` gains ONE servable stub, so an image element actually mounts. The servable shape is the XLSX-media pair — `contentUrl: null` with a `mediaPartName` and a non-null `embeddedFingerprint`, which `hasStagedPreviewSource` accepts (`lib/admin/stagedDiagramGuards.ts:57-63`); the jsdom case at `tests/components/admin/wizard/step3ReviewSections.test.tsx:800-826` is the precedent that this shape mounts the element. The harness's own comment (`tests/e2e/_step3ReviewModalHarness.tsx:59-62`, "ALL `contentUrl: null` … zero network, stable geometry") is updated to say why one stub is now servable, and the spec's node:http server (`tests/e2e/step3-review-modal.layout.spec.ts:170-181`) gains an `/api/`-prefixed branch serving a real 4:3 PNG so the load is deterministic rather than a 404. The tile count and the "+N more" note are untouched: the fixture still holds cap+3 stubs.
- New assertions, at each of 390/800/1280: `getComputedStyle(anchor).position === "relative"`; the image's `getBoundingClientRect()` equals the anchor's on both axes within 0.5px; the anchor's width/height ratio is 4:3 within 0.5px; and the **tier oracle** — for dpr ∈ {1,2,3}, the ladder tier selected for the MEASURED tile width equals the tier selected for the width the exported `sizes` string resolves to at that viewport, with `imageConfigDefault` imported from next and `DIAGRAM_VARIANT_WIDTHS` from the ingest module. Plus `declared >= measured` at every breakpoint, since under-declaring ships a blurry thumbnail. Plus a page-level assertion that zero requests were made to `/_next/image`, the admin twin of the crew AC-3 pin.
- **Mutant record, in the commit message.** (a) Drop `relative` from the anchor: the box-equality assertion fails at every breakpoint. (b) Change the exported `sizes` to a plausible over-declaration (`33vw` on the sheet branch): the tier oracle fails at 390 DPR 2, where 256 becomes 512. (c) Point the harness stub back at `contentUrl: null`: the premise reports no image element rather than the suite passing green on an empty selector.

`red=` is the jsdom command because that is the assertion with an honest red-then-green cycle on one command. The e2e file is run in the same task by `pnpm heavy pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts` and its result recorded in the commit. The `--config` flag is not optional: without it the file matches no project and the run exits green having collected nothing.

**Regression checks inside Task 1, per the fix-round regression budget.** `pnpm vitest run tests/components/a11y/newTabAnnouncementBehavior.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx` — the first is the retired-prop call site, the second owns the placeholder and cap behaviour the swap must not disturb.

## Task 2: the published site builds its loader from the manifest

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.published.test.tsx` ac=AC-2,AC-3,AC-4 -->

**What is red and why.** A new test file, tests/components/admin/wizard/step3DiagramTile.published.test.tsx, renders `PublishedDiagramsBreakdown` over a persisted manifest whose entry carries a two-tier ladder, and asserts that every srcset candidate is one of that fixture's variant URLs. The production line that makes it fail is `components/admin/wizard/step3ReviewSections.tsx:4031`: `buildSrc` constructs one original URL and nothing conveys `variants` to the tile, so after Task 1 the published site still renders the constant staged-shaped loader and every candidate is the original.

RED, six cases, every expected URL composed from the fixture's own `showId`, `snapshot_revision_id`, `snapshotPath` and `variants` rows — never pasted, so a fixture edit extends the cover instead of stranding it. **Every case carries two premises**, because a set-equality over an empty candidate list is vacuously satisfiable: `premiseHolds` that an image element mounted, and `premise` that more than one srcset candidate was emitted. Case 1 carries a third, `premise` that the fixture's ladder holds more than one serving row and that none names the original — without it a degenerate fixture would make "every candidate is a variant" true by having one candidate.

1. **Ladder present.** The distinct candidate set EQUALS the set of the fixture's variant URLs; the original URL appears in no candidate; every candidate contains `@`. Snapping collapses next's device-width candidates onto the ladder, so equality is the right relation: a loader that fell through to the original above the ladder — precisely what `makeDiagramLoader` deliberately does not do (`lib/images/diagramLoader.ts:1-8`) and what a hand-rolled port would — adds the original URL and fails here while a containment assertion still passed.
2. **No ladder** (`variants` omitted): the original at every candidate. This is the guard the row's ship-and-forget posture makes the common case.
3. **Degenerate and malformed ladders**, one `test.each` row per guard-table value: `[]`, `42`, `[{}, { width: "big", key: 5 }, null]`, and `[{ width: 256, key: <the original key> }]`. Each renders the original at every candidate and none throws. Asserted through the component rather than against `makeDiagramLoader` directly — `tests/images/diagramLoader.test.ts` already owns the unit contract; what is unproven is that this call site reaches it with the right arguments. The `[]` row exists because round 1 found AC-3 named it and no case covered it.
4. **Rerender absent → ladder.** Render with `variants` omitted, assert the original; rerender the SAME tree with the ladder present and assert the candidate set becomes the variant set. The tile's key is stable (`components/admin/wizard/step3ReviewSections.tsx:3911`), so this is one mounted element moving, not a remount — asserted by holding the element reference across the rerender and checking it is still `isConnected`. Catches a loader memoised on mount, which would strand every already-open review on original bytes after the show's next snapshot.
5. **Rerender ladder → absent**, the same mechanism in the other direction: a regenerated snapshot whose variant stage failed, or a GIF, must fall back in place rather than keep pointing at variant keys the new revision never wrote.
6. **The anchor's full-resolution href does not drift.** `pathOf(href)` equals `diagramAssetUrl(showId, rev, key)` for the fixture's key, with a Slides-style colon in the object id — legal after the first character and inside the minted-key alphabet (`lib/images/diagramKey.ts:25`). **The claim is byte-NEUTRALITY, not a fix**: `encodeKeySegment` decodes `%40` back to the at-sign and `%3A` back to the colon (`lib/images/diagramLoader.ts:36-50`), so on every key the ingest ladder actually writes the shared builder is byte-identical to the inline template it replaces. A key carrying a space or `#` would discriminate between them, but such a key is outside this arc's threat fence and probe domain, and the encoder's out-of-domain behaviour is the shipped loader's own contract, not something this arc proves.

GREEN, in `PublishedDiagramsBreakdown`:

- One local `keyOf(stub)` wrapping the existing `diagramAssetKeyFromPath((stub as PersistedEmbeddedImage).snapshotPath, stub.objectId)` (`lib/data/diagrams.ts:72`), so the key is derived once and the href and the loader cannot disagree about it.
- `buildSrc={(stub) => diagramAssetUrl(showId, rev, keyOf(stub))}`, replacing the inline template at `components/admin/wizard/step3ReviewSections.tsx:4031-4034`.
- `buildLoader={(stub) => makeDiagramLoader({ showId, rev, key: keyOf(stub), variants: (stub as PersistedEmbeddedImage).variants })}`.
- `imageKey` for the published tile is `stub.objectId`, which is never the URL, so the missing-loader-width warning cannot fire on the no-ladder path either.

**Regression check inside this task, per the fix-round regression budget.** `tests/components/admin/review/publishedNoStagedTraffic.test.tsx:211-220` asserts the tile's `src` attribute is exactly the original asset URL; its fixture carries no `variants`, so the assertion must still hold byte-for-byte after this change. Run it explicitly and record the result. If it moves, the encoder or the loader wiring is wrong, not the test.

## Task 3: invariant-8 dual gate

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-27-admin-diagram-next-image.md; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" $P || exit 1; grep -q "^### Findings and dispositions" $P || exit 1; grep -q "^### Pre-code checklist result" $P || exit 1; exit 0'` ac=AC-7 -->

`/impeccable critique` and `/impeccable audit` on the diff, both with the canonical v3 setup gates (the skill's context.mjs load over PRODUCT.md + DESIGN.md, then the register reference read). P0 and P1 findings are fixed in-branch; per the standing directive on this arc nothing is deferred to a ledger row, so anything not fixed is recorded in §12 below and named in the readiness message under "Unfixed peers".

One pre-existing condition is worth naming before the gate sees it: the tile anchor carries no focus-visible ring today (`className="block"`), so a keyboard user gets only the browser default on a surface this arc touches. Not introduced here. If the pair returns it P0 or P1 it is fixed in-branch like any other finding.

The marker line's grammar is `RAN_FORM` at `tests/docs/_invariant8Closeout.ts:45`. What the marker claims is a gate RESULT; it does not prove the gates ran, and the guard says so about itself at `tests/docs/_invariant8Closeout.ts:11-16`. The dispositions table is the evidence.

## Task 4: graduate the row, last commit before readiness

<!-- task: red=`sh -c 'grep -qE "^#{2,3} BL-ADMIN-DIAGRAM-NEXT-IMAGE" BACKLOG.md && exit 1; awk "/^#+ BL-ADMIN-DIAGRAM-NEXT-IMAGE/{f=1;next} f&&/^#/{f=0} f" BACKLOG-archive.md > /tmp/wizardimg-entry.txt; test -s /tmp/wizardimg-entry.txt || exit 1; grep -q "IN PROGRESS" /tmp/wizardimg-entry.txt && exit 1; for t in "Resolution:" "makeDiagramLoader" "staged" "published"; do grep -q "$t" /tmp/wizardimg-entry.txt || exit 1; done; exit 0'` ac=AC-8 -->

Move the row out of `BACKLOG.md` and into `BACKLOG-archive.md` with a `**Resolution:**` naming both sites and the loader, and strip the `**Status:** IN PROGRESS · **Branch:** …` marker in the same commit. Archives categorically reject in-flight entries, so the marker cannot ride along; and a marker that reaches `main` names a branch the merge just deleted and reds `tests/docs/_metaLedgerInProgress.test.ts` on main until someone clears it.

This is the PR's LAST commit, before readiness and before the merge — not a post-merge tidy.

<!-- tasks: end -->

## Acceptance criteria

Handles. No sibling spec exists for this arc, so these are the plan's own and the tasks' `ac=` markers cite them.

| Id | Handle | Tasks |
|---|---|---|
| AC-1 | The staged site renders through a loader; every candidate is the staged preview route URL | 1 |
| AC-2 | The published site renders through `makeDiagramLoader`; with a ladder every candidate is a variant URL and the original appears in none | 2 |
| AC-3 | Absent, empty, non-array, malformed and original-naming `variants` all render the original, never an empty or malformed src, never a throw | 1, 2 |
| AC-4 | The anchor still opens the full-resolution original, and the shared builder is byte-neutral against the template it replaces | 2 |
| AC-5 | The image box equals the anchor box at 390/800/1280 in a real browser, the declared `sizes` selects the same ladder tier the measured width does at DPR 1/2/3, and no request reaches `/_next/image` | 1 |
| AC-6 | Every transition-inventory pair is pinned behaviourally, including both rerender directions and the compound case | 1, 2 |
| AC-7 | Both impeccable halves pass; P0 and P1 fixed in-branch | 3 |
| AC-8 | The row is archived with a resolution and no in-progress marker reaches main | 4 |
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

**The `impeccable-gate:` marker line is absent on purpose, and lands in Task 3's commit.** `tests/docs/_metaInvariant8Closeout.test.ts` accepts only a well-formed marker: `critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=<n> p1=<n> dispositions=(recorded|none)`. Nothing truthful can be written there before the gates run, and a placeholder is a malformed marker line that reds §4.1.2 (probed: `impeccable-gate: PENDING` fails both §4.1.1 and §4.1.2). `PRE_GUARD_DEBT` is not the escape — it is scoped to pre-guard history, and a row for a live arc reds on its own rule the moment the marker lands.

So this plan is a declaring unit with no marker until Task 3, which means **the branch is not pushed between the plan commit and Task 3's gate commit**. The ledger's IN PROGRESS marker was pushed at Stage 0 and is what invariant 12 requires; the review dispatches read the live worktree, not origin; and CI's twelve are a close-out gate, so nothing is lost by holding. Stated here rather than discovered by a reviewer wondering why the section looks unfinished.

### Findings and dispositions

Pending Task 3.

### Pre-code checklist result

Pending Task 1. The mechanical UI checklist runs BEFORE the first UI edit, because the invariant-8 pair verifies and does not discover: em-dash ban and apostrophe literals in user-visible copy (this diff adds no user-visible string — the placeholder copy "Preview unavailable" is unchanged); 44px tap targets (the anchor is the interactive element and its box is the 4:3 tile, far past the floor at every measured breakpoint — asserted in Task 1's e2e); canonical type and token classes (no type or color class changes, and the two branches keep their distinct border tokens); no new color token, so no new contrast pin is owed.

## 13. Plan review round 1

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
