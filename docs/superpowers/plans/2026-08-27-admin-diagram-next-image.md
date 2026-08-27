# Plan: the two admin wizard diagram sites render through the diagram loader

**Row:** `BL-ADMIN-DIAGRAM-NEXT-IMAGE` (`BACKLOG.md:68`). **Branch:** `perf/admin-diagram-next-image`. **Base:** `5fccaaac7`.
**No spec.** The crew gallery's shipped shape is the design; `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md` §6 is the contract this plan reuses without amending.

Every task is TDD per invariant 1: failing test, minimal implementation, passing test, one commit. Each marker's `red=` is the command that must be observed failing before the implementation and passing after.

## Pre-draft code-verification pass

Run before drafting. Every line, symbol, prop, testid and fixture below was read on this base. Four things it settled, recorded because each changes what the tasks say:

- **There is only ONE raw `<img>` element in the file**, at `components/admin/wizard/step3ReviewSections.tsx:3833`, inside the shared `DiagramTile`. The brief anticipated this. The second site is not an element: it is the published-mode **src builder**, the `buildSrc` prop `PublishedDiagramsBreakdown` passes at `components/admin/wizard/step3ReviewSections.tsx:4031`, which feeds that same element. The staged site is the default `resolveSrc` at `components/admin/wizard/step3ReviewSections.tsx:3874-3876`. Both sites therefore reach the DOM through one component, and the repair is one prop plus two callers.
- **The comment at `components/admin/wizard/step3ReviewSections.tsx:3784-3785` is stale.** It cites `components/diagrams/Gallery.tsx:130-144` as the raw-`<img>` precedent. The crew gallery has carried `next/image` with a custom loader since the private-image-pipeline arc; its only `<img>` mentions today are in prose at `components/diagrams/Gallery.tsx:59` and `components/diagrams/Gallery.tsx:386`, and the render is `<Image>` at `components/diagrams/Gallery.tsx:397`. The comment claims a documented revert that has been reversed. Task 1 rewrites it.
- **`variants` lives on the PERSISTED entry types only.** `PersistedDiagramFields` (`lib/parser/types.ts:446-451`) is mixed into `PersistedEmbeddedImage` (`lib/parser/types.ts:453`) and `PersistedLinkedFolderItem` (`lib/parser/types.ts:458`). `EmbeddedImageStub` hard-codes `snapshotPath: null` and carries no variant field, so the staged site can never have a ladder. "Both sites request a width-matched variant when the manifest carries one" is therefore vacuously satisfied on the staged side and substantively satisfied on the published side; the plan says which is which rather than implying parity.
- **`next/image` warns when the loader returns the `src` it was given** (next's own get-img-props, lines 464-466 of the installed package: the warning fires when `urlStr === src`, or when the parsed URL's pathname equals `src` with no query). The crew gallery dodges this by passing `src={item.key}` — an identity string the loader ignores — while the loader emits the route URL (`components/diagrams/Gallery.tsx:398-405`). Our staged loader is width-independent by construction, so passing the URL as `src` would warn on every staged tile. The tile therefore takes the identity and the href as separate props. This is the difference between copying the gallery's shape and copying its API.

- **`DiagramTile` has exactly one caller outside its own file**, `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:1071-1081`, which renders it directly with `src=` to assert the anchor's accessible name. Retiring `src` breaks that render, so Task 1 updates it. The assertion itself does not move: what changes is the prop names it passes, and the accessible-name expectation is unchanged. Recorded here because a plan that retires a prop without naming its callers is a plan that discovers them in CI.

Baselines at this head, so a later regression is attributable: `pnpm typecheck` clean; `pnpm exec eslint .` 0 errors, 71 warnings; `pnpm format:check` clean; the four suites these tasks touch green at 137 tests (`tests/components/admin/wizard/step3ReviewSections.test.tsx`, `tests/components/admin/review/publishedNoStagedTraffic.test.tsx`, `tests/components/diagrams/Gallery.test.tsx`, `tests/images/diagramLoader.test.ts`).

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
| `app/auth/sign-in/SignInButton.tsx:53` | The committed brand SVG at public/brand/google-signin-button.svg, 175×40. No manifest, no ladder, and SVG has no raster tiers to pick from. |
| `app/auth/sign-in/page.tsx:192` | The committed wordmark at public/brand/fxav-wordmark.png, already resampled to 192×205 for a 96px target (comment at `app/auth/sign-in/page.tsx:185-190`). No manifest, no ladder. |
| `app/help/_components/Screenshot.tsx:34` | A `<picture>` with a `prefers-color-scheme` `<source>` over two committed WebPs. Its bytes are pinned by the screenshots-drift byte-comparison gate; a loader would move them. No manifest, no ladder. |
| `components/admin/wizard/VenueMapTile.tsx:100` | A static-map proxy stream at `/api/admin/venue-map?q=…&theme=…`. Query-param proxy, not a keyed asset route; no manifest and no ladder exists for it. |
| `components/admin/wizard/step3ReviewSections.tsx:3833` | **This arc.** |

No peer is deferred, because no peer is an instance. Nothing here goes to a ledger row.

## Guard conditions, per input the sites read

Stated per the brief's requirement, because the row's own ship-and-forget posture means most published shows have no `variants` today and get them at their next snapshot.

| Input | Value | Rendered result |
|---|---|---|
| `variants` | absent (old manifest, the common case today) | `validVariants(undefined)` → `[]` → constant loader → the original asset URL at every candidate width. |
| `variants` | `[]` (GIF, generation failure) | Same as absent. |
| `variants` | a non-array (`42`, `{}`, `null`) | `validVariants` returns `[]`. Same as absent. Never throws. |
| `variants` | rows present but every row malformed | Same as absent. |
| `variants` | one row naming the original key | `servingVariants` drops it; falls back to the original. Never a variant URL that resolves to original bytes. |
| `variants` | a valid ladder | Smallest tier ≥ the requested width; above the ladder, the largest tier. |
| `snapshotPath` | `null` | `previewSourceFor` is false → the placeholder branch renders and NO image element mounts. Unchanged from today. |
| `mimeType` | not in the allowed set | Same as above: placeholder, no element. Unchanged. |
| `snapshot_revision_id` | `""` (a malformed row past the resolver gate) | Original and variant URLs both carry `""` as `<rev>` and the asset route 410s both. The error branch below is what the user sees. Unchanged from today's behaviour, which the comment at `components/admin/wizard/step3ReviewSections.tsx:4021-4022` already records. |
| runtime fetch | 4xx/5xx on whichever candidate the browser chose | `onError` → `failed` → the placeholder. |

The consequence bound the reviews converge against: **each of the two sites renders the variant URL when serving variants exist and the original otherwise, and never an empty or malformed src.** The domain is finite: the manifest shapes the ingest ladder writes, plus the absent/empty/malformed cases enumerated above.

## Transition inventory

Three states, so three pairs. There is no `AnimatePresence` and no framer-motion anywhere in `DiagramTile`, and none is added.

| Pair | Treatment |
|---|---|
| unavailable-at-mount → (none) | Terminal. `useState(!hasPreviewSource)` starts `failed` true; no element ever mounts and nothing can move it. |
| image → placeholder (runtime error) | Instant. `onError` sets `failed`; the next render swaps the anchor for the span. No animation, and none is wanted: the swap reports a failure, and a fade would read as a load. |
| original → variant | Not a state transition. The browser picks ONE srcset candidate and fetches it; there is no moment at which the tile holds the original and then replaces it. Recorded here because the brief names it, and naming it as a non-transition is the accurate answer. |
| COMPOUND: an error arriving while the image is still lazy-pending | Instant, same branch. jsdom-testable by dispatching `error` before any load event; the state machine has no intermediate. |

## Dimensional invariants

`fill` makes the image `position: absolute; inset: 0`, so its box is the box of its nearest **positioned** ancestor. Today's anchor is `class="block"`, which is `position: static`. If the `relative` class is omitted the image escapes to the modal panel, which IS positioned (`components/admin/review/ReviewModalShell.tsx:624`, `className="relative …"`), and one thumbnail covers the whole dialog. jsdom computes no layout and cannot see this.

| Parent | Child | Relationship | Guaranteed by |
|---|---|---|---|
| `<a data-testid=…-diagram-tile-N>` | the `next/image` `<img>` | `img` border box === anchor border box, both axes, ±0.5px | `relative` on the anchor plus `fill` on the image |
| the grid cell | `<a>` | anchor keeps the 4:3 ratio and the grid-cell width | `aspect-4/3 w-full` moves from the image to the anchor |
| the grid cell | the placeholder `<span>` | the unavailable branch keeps the SAME box as the available branch | both branches carry `aspect-4/3 w-full`; the span already does today |

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

RED, five cases in the new file, all rendering `DiagramsBreakdown` in staged mode through the existing `wizardSessionId`/`dfid` props:

1. **Width-keyed candidates, all original.** Parse `srcset`, split on `,`, take the URL of each entry, compare pathnames (jsdom resolves `img.src` against the document origin — the gallery suite's `pathOf` helper at `tests/components/diagrams/Gallery.test.tsx:246-248` is the precedent). `premise("next/image emitted srcset candidates", candidates.length, 1)`. Every candidate equals the staged route URL built from the fixture's own `wizardSessionId`, `dfid` and `objectId`; none contains `@`; none contains `/_next/image`; none contains `/api/asset/diagram`. The expected URL is composed from the fixture values in the test, never pasted.
2. **`src` identity is not the URL.** The rendered `src` attribute resolves to the staged route URL, and the `next/image` `src` prop is the stub's `objectId` — asserted indirectly and non-tautologically by the ABSENCE of the missing-loader-width console warning: spy on `console.warn`, render, and assert no call whose first argument contains `does not implement width`. This is the case that catches passing the URL as the identity, which is the obvious wrong port of the gallery pattern and is silent in every other assertion.
3. **The anchor keeps its accessible name and the image stays decorative.** `getAttribute("aria-label")` on the anchor is `${alt} (opens in a new tab)`, derived from the fixture's `alt`; the image's `alt` is `""`. This is the a11y contract at `components/admin/wizard/step3ReviewSections.tsx:3810-3818` and it must survive the element swap.
4. **The href is the full-resolution original**, unchanged: the anchor's `href` is the staged route URL, `target="_blank"`, `rel="noopener noreferrer"`.
5. **Transition inventory, all three rows.** Unavailable-at-mount → placeholder, no image element (already covered for the `contentUrl: null` shape at `tests/components/admin/wizard/step3ReviewSections.test.tsx:793-801`; this file adds the two that are covered nowhere today). Runtime error → `fireEvent.error` on the image swaps to the placeholder and removes the image. Compound → dispatch `error` before any load event and assert the same single-step swap. No `AnimatePresence` and no motion component appears in the rendered tree.

GREEN, in `components/admin/wizard/step3ReviewSections.tsx`:

- `DiagramTile` takes `href` (the full-resolution URL the anchor opens), `imageKey` (the `next/image` `src` identity, ignored by every loader), `loader` (an `ImageLoader`), and `sizes`, alongside today's `alt`, `testId`, `hasPreviewSource`. The single `src` prop is retired: two strings that both look like sources is the reader-load defect this API shape exists to avoid.
- The anchor gains `relative aspect-4/3 w-full`; the image becomes `<Image fill sizes={sizes} className="object-cover" …>` and keeps `alt=""` and the `onError` handler. `loading="lazy"` and `decoding="async"` are `next/image` defaults and are dropped as explicit attributes.
- The `eslint-disable-next-line @next/next/no-img-element` at `components/admin/wizard/step3ReviewSections.tsx:3830-3832` is removed with the element it exempted, and the stale comment at `components/admin/wizard/step3ReviewSections.tsx:3784-3785` is rewritten to state what is now true: the crew gallery is loader-driven, the `/_next/image` optimizer is never reached because the loader emits our own asset-route URLs, and cookies therefore survive.
- `DiagramsBreakdown` gains an optional `buildLoader?: (stub: EmbeddedImageStub) => ImageLoader`. Its default is `(stub) => () => resolveSrc(stub)` — the width-independent staged loader, derived from the existing `resolveSrc` so the staged URL is defined in exactly one place.
- `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:1071-1081` is updated to the new prop names — `href`, `imageKey`, and a one-line constant `loader` — with its `toHaveAccessibleName` expectation untouched. That suite owns the new-tab suffix contract, not the image contract, and it must keep asserting exactly what it asserted before; a change to its expectation would be a gate edit, not a call-site update.
- `sizes` is declared by `DiagramsBreakdown` for the grid it owns, not by the tile: `"(min-width: 640px) 184px, 30vw"`. Derivation, from the classes rather than from taste: the panel is `sm:max-w-5xl` (64rem = 1024px) at `components/admin/review/ReviewModalShell.tsx:624`; the two-pane rail is 240px (`tests/e2e/step3-review-modal.layout.spec.ts:22`); the grid is `grid-cols-3` below 640px and `sm:grid-cols-4` above, `gap-2` (8px). That puts a desktop tile near 180px and a 390px-sheet tile near 114px. The real-browser check below MEASURES all three breakpoints and fails if the declared string over-declares — over-declaring makes every thumbnail fetch a 1024 tier where 256 would do, which is the waste this arc exists to remove.

**Same commit, the two mandatory assertions, each verified by a recorded mutant** (see the section above for why they are not separate tasks). In `tests/e2e/step3-review-modal.layout.spec.ts`, whose harness already renders `HARNESS_DIAGRAM_STUB_COUNT` staged stubs and already measures tile widths at 390/800/1280 (`tests/e2e/step3-review-modal.layout.spec.ts:481-523`):

- `tests/e2e/_step3ReviewModalHarness.tsx:69-75` gains ONE servable stub, so an image element actually mounts. The servable shape that needs no network is the XLSX-media pair — `contentUrl: null` with a `mediaPartName` and a non-null `embeddedFingerprint` — which `hasStagedPreviewSource` (`lib/admin/stagedDiagramGuards.ts:57`) accepts; the existing jsdom case at `tests/components/admin/wizard/step3ReviewSections.test.tsx:800-826` is the precedent that this shape mounts the element. The harness renders static markup with no hydration, so `onError` is never attached and a 404 leaves the element in place with its box intact.
- New assertions, at each of 390/800/1280: `getComputedStyle(anchor).position === "relative"`; the image's `getBoundingClientRect()` equals the anchor's on both axes within 0.5px; the anchor's width/height ratio is 4:3 within 0.5px; and the measured anchor width is within the range the declared `sizes` string resolves to at that viewport. Plus a page-level assertion that zero requests were made to `/_next/image`, the admin twin of the crew AC-3 pin.
- **Mutant record, in the commit message.** (a) Drop `relative` from the anchor: the box-equality assertion fails at every breakpoint. (b) Drop `sizes`: the over-declaration assertion fails, and `next/image` additionally warns about `fill` without `sizes`. (c) Point the harness stub back at `contentUrl: null`: the `premise` reports no image element rather than the suite passing green on an empty selector.

`red=` is the jsdom command because that is the assertion with an honest red-then-green cycle on one command. The e2e file is run in the same task by `pnpm heavy pnpm exec playwright test tests/e2e/step3-review-modal.layout.spec.ts` and its result recorded in the commit.

## Task 2: the published site builds its loader from the manifest

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.published.test.tsx` ac=AC-2,AC-3,AC-4 -->

**What is red and why.** A new test file, tests/components/admin/wizard/step3DiagramTile.published.test.tsx, renders `PublishedDiagramsBreakdown` over a persisted manifest whose entry carries a two-tier ladder, and asserts that every srcset candidate is one of that fixture's variant URLs. The production line that makes it fail is `components/admin/wizard/step3ReviewSections.tsx:4031`: `buildSrc` constructs one original URL and nothing conveys `variants` to the tile, so after Task 1 the published site still renders the constant staged-shaped loader and every candidate is the original.

RED, four cases, every expected URL composed from the fixture's own `showId`, `snapshot_revision_id`, `snapshotPath` and `variants` rows — never pasted, so a fixture edit extends the cover instead of stranding it:

1. **Ladder present.** Every srcset candidate is a variant URL from the fixture's rows; the original URL appears in NO candidate. The distinct candidate set equals the set of the fixture's variant URLs — snapping collapses the device-width candidates onto the ladder, so this is an equality, not a containment. This is the case that catches a loader that falls through to the original above the ladder, which the shipped `makeDiagramLoader` deliberately does not do (`lib/images/diagramLoader.ts:1-8`) and which a hand-rolled port would.
2. **No ladder.** The same fixture with `variants` omitted renders the original at every candidate. This is the guard the row's ship-and-forget posture makes the common case: most published shows have no ladder until their next snapshot.
3. **Malformed rows.** `variants: 42`, `variants: [{}]`, and a row whose `key` names the original itself each render the original and never throw. Asserted through the component rather than against `makeDiagramLoader` directly — `tests/images/diagramLoader.test.ts` already owns the unit contract; what is unproven is that this call site reaches it with the right arguments.
4. **The href is the original, and it is encoded.** The anchor's `href` equals `diagramAssetUrl(showId, rev, key)` for the fixture's key. Includes one key containing a character `encodeKeySegment` acts on, so the assertion discriminates between the encoder and the raw template it replaces.

GREEN, in `PublishedDiagramsBreakdown`:

- One local `keyOf(stub)` wrapping the existing `diagramAssetKeyFromPath((stub as PersistedEmbeddedImage).snapshotPath, stub.objectId)` (`lib/data/diagrams.ts:72`), so the key is derived once and the href and the loader cannot disagree about it.
- `buildSrc={(stub) => diagramAssetUrl(showId, rev, keyOf(stub))}`, replacing the inline template at `components/admin/wizard/step3ReviewSections.tsx:4031-4034`. `diagramAssetUrl` percent-encodes the key segment (`lib/images/diagramLoader.ts:36-50`) where the template interpolated it raw; the route decodes its params before comparing, so an ordinary key is byte-identical and an exotic one stops being reinterpreted by URL parsing.
- `buildLoader={(stub) => makeDiagramLoader({ showId, rev, key: keyOf(stub), variants: (stub as PersistedEmbeddedImage).variants })}`.
- `imageKey` for the published tile is `stub.objectId`, which is never the URL, so the missing-loader-width warning cannot fire on the no-ladder path either.

**Regression checks inside Task 1, per the fix-round regression budget.** `pnpm vitest run tests/components/a11y/newTabAnnouncementBehavior.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx` — the first is the retired-prop call site, the second owns the placeholder and cap behaviour the swap must not disturb (137 tests green across the four baseline suites at the pre-implementation head).

**Regression check inside this task, per the fix-round regression budget.** `tests/components/admin/review/publishedNoStagedTraffic.test.tsx:211-220` asserts the tile's `src` attribute is exactly the original asset URL; its fixture carries no `variants`, so the assertion must still hold byte-for-byte after this change. Run it explicitly and record the result. If it moves, the encoder or the loader wiring is wrong, not the test.

## Task 3: invariant-8 dual gate

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-27-admin-diagram-next-image.md; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" $P || exit 1; grep -q "^### Findings and dispositions" $P || exit 1; grep -q "^### Pre-code checklist result" $P || exit 1; exit 0'` ac=AC-7 -->

`/impeccable critique` and `/impeccable audit` on the diff, both with the canonical v3 setup gates (the skill's context.mjs load over PRODUCT.md + DESIGN.md, then the register reference read). P0 and P1 findings are fixed in-branch; per the standing directive on this arc nothing is deferred to a ledger row, so anything not fixed is recorded in §12 below and named in the readiness message under "Unfixed peers".

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
| AC-3 | Absent, empty and malformed `variants` render the original, never an empty or malformed src, never a throw | 1, 2 |
| AC-4 | The anchor still opens the full-resolution original, now through the shared encoder | 2 |
| AC-5 | The image box equals the anchor box at 390/800/1280 in a real browser, and no request reaches `/_next/image` | 1 |
| AC-6 | Every transition-inventory pair is pinned behaviourally, including the compound case | 1 |
| AC-7 | Both impeccable halves pass; P0 and P1 fixed in-branch | 3 |
| AC-8 | The row is archived with a resolution and no in-progress marker reaches main | 4 |
| AC-9 | All twelve required CI checks green at a head whose merge base is `origin/main` | close-out |

AC-9 carries no task marker because no `red=` can express it: it is satisfied by real CI on the pushed branch, and a red shelling out to `gh` goes green on a stale run.

## Gates before every push

`pnpm heavy pnpm test` for the whole tree, then `pnpm typecheck`, `pnpm exec eslint .`, and `pnpm format:check`, each as its own command, never chained into the commit. Vitest strips types, so a green suite proves nothing about type errors. Stage by path; never `git add -A`.

Playwright runs non-interactively here, so `tests/e2e/step3-review-modal.layout.spec.ts` runs under `pnpm heavy`.

## The bytes number, and what it is honestly a measurement of

The done condition asks for before/after bytes for one fixture show. Recorded here rather than shipped as a script, because a permanent probe surface is process-facing work this arc does not owe.

There is no local show with diagram snapshots (`select id from shows where diagrams is not null` returns zero rows on the local stack) and no committed manifest with real variant bytes, so a Playwright network log against a seeded show is not available. The measurement is instead taken over the REAL ingest function `generateDiagramVariants` (`lib/sync/diagramVariants.ts`) applied to a real committed 1280×1776 PNG of a rendered page (`tests/e2e/section-header-visual.spec.ts-snapshots/idle-1280-light.png`, 99,456 bytes) — text, borders and gradients, which is what a Slides diagram export compresses like. The recorded line states the original bytes, the bytes of the tier a wizard tile requests at the measured desktop width, and both multiplied by `DIAGRAM_TILE_CAP` (12), which is the grid's worst case. The command and its output land in §12 and in the readiness message, and the readiness message states the weaker fact verbatim: this is the ingest ladder measured on a real image, not a live show's asset route.

## Not in this plan

- The other 4,500 lines of `components/admin/wizard/step3ReviewSections.tsx`. The row's exception (c) was about the file's size, and widening past the two sites re-earns the very cost the deferral named.
- Any `blurDataURL` / `placeholder="blur"` on the wizard tile. `PersistedDiagramFields` carries the field and the crew gallery uses it, but a blur placeholder is a perceived-load change on a desktop admin surface, not a bytes change, and it adds a fourth state to a three-state transition inventory. Recorded here so a reviewer sees it was weighed.
- Any change to the crew gallery, the lightbox, the asset route, the ingest ladder, or the manifest shape.
- Any backfill. Existing published shows get variants at their next snapshot, ratified at `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md:192`.
- Any mutation score. No enrolled surface is touched.

---

## 12. Close-out

impeccable-gate: PENDING

### Findings and dispositions

Pending Task 3.

### Pre-code checklist result

Pending Task 1. The mechanical UI checklist runs BEFORE the first UI edit, because the invariant-8 pair verifies and does not discover: em-dash ban and apostrophe literals in user-visible copy (this diff adds no user-visible string — the placeholder copy "Preview unavailable" is unchanged); 44px tap targets (the anchor is the interactive element and its box is the 4:3 tile, far past the floor at every measured breakpoint — asserted in Task 1's e2e); canonical type and token classes (no type or color class changes); no new color token, so no new contrast pin is owed.
