# Plan — private image pipeline (BL-PRIVATE-IMAGE-PIPELINE)

**Spec:** `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md` (canonical; this plan implements it, invariant 7).
**Branch:** `feat/private-image-pipeline` · worktree `../FX-worktrees/private-image-pipeline`.
**Implementer:** Opus / Claude Code (UI surfaces — AGENTS.md hard rule; the non-UI tasks ride the same session).

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/api/diagram-asset-route.test.ts` — variant accept-set rows (§5).
- **CREATES** structural census test pinning that every original-byte upload path runs the variant stage (spec §3 wiring census: `lib/sync/snapshotAssets.ts` both loops, `lib/sync/assetRecovery.ts`).
- **Supabase call-boundary registry (invariant 9):** N/A — no new direct Supabase client call sites; variant uploads flow through the existing injected `SnapshotAssetsStorage.upload` / recovery `deps.storage.upload` interfaces whose call sites are already registered/exempt.
- **Advisory locks:** N/A — no `pg_advisory*` surface touched; the variant stage is pure compute inside existing lock-held flows, holder topology unchanged.
- **Invariant 10:** no new mutation surface (no new route/action). `tests/log/_metaMutationSurfaceObservability.test.ts` stays green without registry edits.

## Mutation-family closure (guard work in this plan)

Census test operators: (a) remove stage call from one call site; (b) add a new upload call site without the stage. Route accept-set operators: (c) unlisted variant key; (d) listed key under stale rev; (e) variant key for entry with `variants` absent. Loader operators: (f) empty variants; (g) malformed row (non-finite width / empty key); (h) width above max tier. These enumerate the closure set; a reviewer-proposed new family needs a live escaping mutant.


## AC map (spec §10 — the `ac=` ids the task markers reference)

AC-1 variant objects + manifest fields at snapshot; AC-2 thumbnails fetch variant URLs under picker auth with the private Cache-Control; AC-3 zero `/_next/image` requests; AC-4 pre-migration manifests render as today; AC-5 revocation parity on variant URLs; AC-6 zero `no-img-element` disables in `components/diagrams/`; AC-7 recovery-path variant parity; AC-8 promote integrity with variants + pagination; AC-9 no-upscale / GIF skip / failure isolation; AC-10 variant 410s + HEAD parity + malformed-manifest no-throw; AC-11 loader clamp + `pinOriginal` + malformed fallback; AC-12 lightbox tiers, blur, geometry, error branch. Full normative text: spec §10.

<!-- tasks: depth=2 -->

<!-- spec-lint: ignore — file created by this plan's implementation -->
## Task 1 — `lib/sync/diagramVariants.ts` skeleton + behavior tests
<!-- task: red=`pnpm vitest run tests/sync/diagramVariants.test.ts` ac=AC-1 -->

<!-- spec-lint: ignore — file created by this plan's implementation -->
1. Create `lib/sync/diagramVariants.ts` exporting `DIAGRAM_VARIANT_WIDTHS = [256, 512, 1024] as const`, `type DiagramVariantResult` (spec §3 shape), and `generateDiagramVariants` as a typed stub returning `{ variants: [], blurDataURL: null, intrinsicWidth: null, intrinsicHeight: null, failure: null }` — so the RED failures below derive from missing production behavior (sharp pipeline), never from an unresolved import (RED-validity rule).
<!-- spec-lint: ignore — file created by this plan's implementation -->
2. RED — `tests/sync/diagramVariants.test.ts` (fixtures: generate png/gif bytes IN-TEST with sharp itself — dims are then fixture-derived, not hardcoded):
   - 2000×1500 png → variants exactly widths [256, 512, 1024] (derived: `DIAGRAM_VARIANT_WIDTHS.filter(w => w < 2000)`), each `mimeType: "image/webp"`, key `<assetKey>@<w>.webp`, decoded width (sharp metadata on output bytes) === declared width.
   - 400×300 png → exactly [256]. 200×150 png → `variants: []` (no upscale).
   - gif → `variants: []`, but `blurDataURL` non-null and intrinsic dims recorded (spec §3 GIF rule).
   - blurDataURL is a decodable `data:image/webp;base64,` payload, decoded width ≤ 16.
   - corrupt bytes (`Uint8Array.from([1,2,3])`) → empty result with non-null `failure` discriminator (`reason: "sharp_error"`); the call resolves (no throw) and performs NO logging (spec §3 R2 F1 — log spy asserts ZERO logger calls from the pure function). Premise: `premiseHolds` that the corrupt fixture actually fails sharp (`tests/_shared/premise.ts`).
   - EXIF orientation row (spec §3 normative, R2 F5): a small JPEG with EXIF orientation 6 (fixture generated in-test via sharp `withMetadata({ orientation: 6 })`) → recorded dims AND each variant's DECODED OUTPUT dims are post-rotation (portrait). Assert by decoding output bytes — sharp `metadata().width/height` is orientation-unaware even with `.rotate()` chained (spec §3 probe).
   - blur bound rows (R2 F6): extreme-aspect fixture (1×1000) → blur decoded dims both ≤ 16 (`fit: "inside"`); the 2048-char belt exercised in isolation → field omitted + `failure.reason: "blur_oversize"`.
   - Failure-mode statement: catches silent upscaling, wrong-tier emission, unkeyed variants, sideways variants, unbounded blur payloads, throw-through into snapshot failure.
3. GREEN — implement with sharp (`.rotate()` auto-orient FIRST — normative per spec §3, then `.resize({ width })`, `.webp({ quality: 75 })`; blur: `resize({ width: 16, height: 16, fit: "inside" })` quality 40; dims from post-rotate metadata; `failure` discriminator, no logging).
4. Typecheck snippet pass (`pnpm typecheck`), commit `feat(sync): diagram variant generation stage (spec §3)`.

## Task 2 — manifest fields + read-side guards
<!-- task: red=`pnpm vitest run tests/sync/diagramVariants.test.ts tests/components/diagrams/Gallery.test.tsx` ac=AC-4 -->

1. Add optional `variants` / `blurDataURL` / `intrinsicWidth` / `intrinsicHeight` to `PersistedEmbeddedImage` + `PersistedLinkedFolderItem` (`lib/parser/types.ts`; spec §4).
2. RED: type-level + runtime rows — old-manifest object (fields absent) still satisfies `resolveCurrentDiagrams` duck-type (`isPersistedDiagrams` in `lib/data/diagrams.ts`) and renders Gallery without errors (AC-4 unit leg).
3. GREEN: types only; no validator change (duck-typing already tolerant — spec §4). Commit `feat(parser): optional variant/blur/dims manifest fields (spec §4)`.

## Task 3 — snapshotAssets wiring
<!-- task: red=`pnpm vitest run tests/sync/snapshotAssets.test.ts` ac=AC-1 -->

1. RED (extend existing `tests/sync/snapshotAssets.test.ts`): fixture entry with real png bytes through `snapshotAssets` → storage mock captured uploads at `${tempPrefix}${assetKey}@256.webp` etc. (derived from fixture dims × `DIAGRAM_VARIANT_WIDTHS`), manifest entry carries §4 fields with canonical-prefix variant paths, fields OMITTED (not null) where generation produced none (spec §4 serialization rule); corrupt-bytes entry → original uploaded, no variant uploads, entry fields ABSENT, sibling entries unaffected, `snapshot_status` UNCHANGED vs a no-variant-stage baseline; `SnapshotAssetsResult.variantFailures` carries `{assetKey, reason, message}` rows (spec §3 R2 F1 — NO in-stage logging).
2. RED (failure-signal hop census — spec §3 R3 F1 P0; one named row PER hop/sink, six surfaces): `Phase2Result` forwards `variantFailures` (`lib/sync/phase2.ts:644` region; phase2 suite); `ProcessOneFileResult` carries them to `processOneFile`'s post-commit tail which emits (`lib/sync/runScheduledCronSync.ts:395`; cron-sync suite); `ApplyStagedCoreResult`→`ApplyStagedResult`→`applyStaged` post-commit reconcile emits, rollback fixture → ZERO emits (`lib/sync/applyStaged.ts:259`; applyStaged suite); pending-ingestion retry route's bypass sink emits (`app/api/admin/pending-ingestions/[id]/retry/route.ts:375`; retry-route suite); `runManualStageForFirstSeen` return gains the rows and its caller emits (`lib/sync/runManualStageForFirstSeen.ts:43`; first-seen suite); `assetRecovery` outcome sink emits (`lib/sync/assetRecovery.ts:878`; recovery suite — Task 4). Advisory-lock invariant untouched: every emit sits outside the lock tx by construction of the existing sinks.
3. GREEN: call `generateDiagramVariants` in both loops after fingerprint/md5 verification; upload variant bytes to temp prefix; map result→entry fields with null→omit; thread `variantFailures` through every census hop; wire the post-commit emits at each census sink.
3. Commit `feat(sync): variant stage in snapshot pipeline (spec §3 wiring 1)`.

## Task 3b — promoteSnapshot expected-count + pagination (spec §3 "Promotion changes", R1 F1 P0)
<!-- task: red=`pnpm vitest run tests/sync/promoteSnapshot.test.ts` ac=AC-8 -->

1. RED (extend `tests/sync/promoteSnapshot.test.ts`; spec §9 R2 F7 — three NAMED pagination fixtures, not one generic row): pending manifest whose entries carry `variants` arrays → promote succeeds with temp/canonical listings holding originals+variants (expected count = originals + sum of variant rows); delete one variant object from the mock listing → `manifest_mismatch`; (i) `defaultStorage.list` >100-object listing fully enumerated; (ii) `removePrefix` >100-object prefix fully removed; (iii) rollback-repair path over >100-object canonical listing fully walked (paged limit/offset like `diagramGc` `listPaths`, `lib/sync/diagramGc.ts:101`).
2. GREEN: extend the expected-count SQL (`lib/sync/promoteSnapshot.ts:235` region) with `jsonb_array_length(coalesce(e->'variants','[]'::jsonb))` legs; paginate `defaultStorage.list` (`lib/sync/promoteSnapshot.ts:83`) and `removePrefix`'s listing (`lib/sync/promoteSnapshot.ts:101`).
3. Commit `fix(sync): promote counts variants + paginates storage listings (spec §3, R1 F1)`.

## Task 4 — assetRecovery wiring + structural census
<!-- task: red=`pnpm vitest run tests/sync/assetRecovery.test.ts tests/sync/_metaVariantStageCensus.test.ts` ac=AC-1 -->

1. RED: recovery path fixture → recovered original accompanied by variant uploads + manifest fields (mirror of Task 3 assertions against the recovery `deps.storage.upload` capture).
<!-- spec-lint: ignore — file created by this plan's implementation -->
2. RED: NEW `tests/sync/_metaVariantStageCensus.test.ts` — source-scan of `lib/sync/**` for `.upload(`-class call sites; each must be in the registered census or carry an inline exemption comment. Verified census at plan time (grep run 2026-08-09, pasted per authored-AND-run rule): logical sites `lib/sync/snapshotAssets.ts:145` + `lib/sync/snapshotAssets.ts:165` (the two loops) and `lib/sync/assetRecovery.ts:543` (recovery upload); adapter implementations `lib/sync/assetRecovery.ts:817` and `lib/sync/defaultSnapshotAssetsForApply.ts:149` are interface impls serving those logical paths — exemption-commented, not census rows. Failure mode: a future upload path silently shipping variant-less originals. Mutation operators (a)/(b) from the closure set run pre-dispatch and results recorded in the commit.
3. GREEN + commit `feat(sync): variant stage in asset recovery + census guard (spec §3 wiring 2)`.

## Task 5 — route variant accept-set
<!-- task: red=`pnpm vitest run tests/api/diagram-asset-route.test.ts` ac=AC-2,AC-5 -->

1. RED rows (extend `tests/api/diagram-asset-route.test.ts`): manifest-listed variant key → 200, `Content-Type: image/webp`, `Cache-Control` EXACTLY `private, max-age=0, must-revalidate`, AND the signed-URL call addressed the exact VARIANT storage path (spec §5 R1 F2; assertion style of the existing exact-path row at `tests/api/diagram-asset-route.test.ts:402`); unlisted plausible key (`@2048.webp`) → 410; listed key under stale rev → 410; entry without `variants` + variant-shaped key → 410; MALFORMED `variants` field (non-array, null rows, non-string key) → 410 with no throw (spec §4 server guards); entry with `snapshotPath: null` PLUS plausible `variants` → 410 with no throw (spec §5 R2 F2 — the null-path guard precedes dirname); HEAD on listed variant key → same status/headers as GET minus body; picker-session 401 row unchanged for variant URLs (AC-5).
2. GREEN: extend `findAsset` (route.ts) per spec §5 — entries with non-null string `snapshotPath` only; literal path equality against original `snapshotPath` OR `dirname(snapshotPath) + "/" + variants[i].key` over VALID rows; variant match RETURNS the variant path as the entry's `snapshotPath` for signing; matched variants serve `image/webp`.
3. Mutation operators (c)/(d)/(e) run pre-dispatch, recorded. Commit `feat(crew): diagram route serves manifest-listed variants (spec §5)`.

<!-- spec-lint: ignore — file created by this plan's implementation -->
## Task 6 — `lib/images/diagramLoader.ts`
<!-- task: red=`pnpm vitest run tests/images/diagramLoader.test.ts` ac=AC-2 -->

1. Stub module (same RED-validity pattern as Task 1) → RED rows (spec §6 R2 F4 — always-clamp, no width-based original fallthrough): snapping exact/between-tier; above-ladder → LARGEST variant while any valid variant exists; `pinOriginal: true` → original at EVERY width (active lightbox slide); variants absent/empty/all-invalid → original; malformed rows (width NaN/0/negative, empty key) filtered per §4; URL shape `/api/asset/diagram/<show>/<rev>/<key>` matches `diagramAssetKeyFromPath` in `lib/data/diagrams.ts` round-trip. Operators (f)/(g)/(h) pre-dispatch.
2. GREEN + commit `feat(crew): diagram image loader with variant snapping (spec §6)`.

## Task 7 — Gallery migration
<!-- task: red=`pnpm vitest run tests/components/diagrams/Gallery.test.tsx` ac=AC-4,AC-6 -->

1. RED (extend `tests/components/diagrams/Gallery.test.tsx`): item with variants+blur renders `next/image` with `placeholder="blur"`; item without blur renders no placeholder prop; `onError` still lands the item in the unavailable-placeholder branch (existing `failedKeys` contract); grid cell gains `relative` (class assertion on the button/li per spec Dimensional Invariants).
2. GREEN: migrate `<img>` → `Image` (`fill`, `sizes="(min-width: 640px) 25vw, 33vw"`, per-item `makeDiagramLoader`); extend `GalleryItem` + `components/crew/DiagramsBlock.tsx` mapping (`embeddedItem`/`linkedItem` helpers) to pass §4 fields; delete the eslint-disable + revert-rationale comment.
3. Commit `feat(crew-page): Gallery on next/image with blur variants (spec §6)`.

## Task 8 — GalleryLightbox migration
<!-- task: red=`pnpm vitest run tests/components/diagrams/GalleryLightbox.test.tsx` ac=AC-4,AC-6 -->

<!-- spec-lint: ignore — file created by this plan's implementation -->
1. RED — NEW `tests/components/diagrams/GalleryLightbox.test.tsx` (no general Lightbox suite exists today; only `GalleryLightboxPinchZoom.test.tsx`, which must stay green untouched; new file auto-covered by `BASE_INCLUDE` `tests/**/*.test.tsx`, `vitest.projects.ts:34`): active slide uses `pinOriginal` URL tier; inactive slide with variants uses a CLAMPED variant URL — never original while variants exist (spec §6); BOTH tiers render `placeholder="blur"` when `blurDataURL` present (R1 F6); dims-present entry renders `width`/`height` props; dims-absent INACTIVE branch renders `fill` + `object-contain` inside a NEW inner `relative size-full` wrapper in the figure's content area (spec R3 F2 — NOT `relative` on the `px-4` figure, whose padding box would mismatch the active branch by 32px); dims-absent ACTIVE branch renders inside the `TransformComponent` wrapper (its existing `relative` is the containing block — spec R2 F3); `onError` → existing `setFailedKeys` unavailable branch (`components/diagrams/GalleryLightbox.tsx:680`/`components/diagrams/GalleryLightbox.tsx:708`); failed item stays failed across tier swap (spec Transition Inventory compound row).
2. GREEN (includes the inner `relative size-full` wrapper for the inactive branch) + commit `feat(crew-page): GalleryLightbox on next/image tiers (spec §6)`.
3. Transition-audit step (spec Transition Inventory): enumerate `AnimatePresence`/ternary/conditional blocks in both components; assert each inventory pair's treatment (built-in blur swap = instant; failed swap = instant; no new motion). Compound: open lightbox mid-blur — no shared state, assert independent mount.

## Task 9 — e2e layout + network assertions
<!-- task: red=`pnpm playwright test tests/e2e/crew-layout-dimensions.spec.ts` ac=AC-2,AC-3 -->

1. Extend `tests/e2e/crew-layout-dimensions.spec.ts` (harness per its own docblock: `signInAs(ADMIN_FIXTURE)`, seeded Waldorf show via `lookupSeededShow`, share token from `show_share_tokens`, mobile-safari single-writer project, explicit viewports). Harness-readiness: dev-build webServer on port 3000 (existing config), hydration gate = existing suite helpers (never `networkidle` alone), samplers detach-safe.
2. Dimensional invariant: every `[data-testid^="diagram-slot-"]` cell with an image → image box === cell box within 0.5px via `getBoundingClientRect` (spec Dimensional Invariants row 1).
3. Lightbox slide geometry (spec Dimensional Invariants, R2 F3 + R3 F2 — BOTH branches, oracle reads the WRAPPER rects, never the figure's outer rect): inactive no-dims slide's image box === its inner `relative size-full` wrapper box; active no-dims slide's image box === its `TransformComponent` wrapper box; each within 0.5px.
4. Network log over the page load + gallery interaction: zero requests matching `/_next/image` (AC-3); thumbnail requests target `/api/asset/diagram/` URLs (variant-suffixed iff the seed manifest carries variants — seed extension step below).
5. Seed: extend `supabase/seed.ts` diagrams build with §4 fields + tiny real webp variant objects in the local bucket so the e2e assertions exercise variant serving (fixture-derived, committed generator not committed bytes).
5. Commit `test(e2e): gallery variant layout + no-optimizer network gate`.

## Task 10 — impeccable dual gate (invariant 8)
<!-- task: red=`pnpm lint` ac=AC-6 -->

`/impeccable critique` + `/impeccable audit` on the diff (canonical v3 setup: context.mjs PRODUCT.md+DESIGN.md load → register reference). P0/P1 fixed or DEFERRED.md-entried. Findings + dispositions to closeout §12. Then `pnpm lint` proves zero `@next/next/no-img-element` disables under `components/diagrams/` (AC-6).

## Task 11 — closeout
<!-- task: red=`pnpm test` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6 -->

1. Full pre-push gates: `pnpm test`, `pnpm typecheck` (vitest AND playwright tsconfigs), `pnpm eslint`, `pnpm format:check`.
2. File `BL-ADMIN-DIAGRAM-NEXT-IMAGE` (BACKLOG.md, spec §1.1 exception (c) text); archive `BL-PRIVATE-IMAGE-PIPELINE` with spec cross-ref; remove the invariant-12 marker in the PR's LAST commit.
3. Whole-diff cross-model review (fresh-eyes, split tight-scope briefs if >handful of files: sync surface / route surface / UI surface); CI green; merge; ff-sync main; Stage 4.4 label + cron cleanup.

<!-- tasks: end -->

## 12 — closeout markers

impeccable-gate: pending (Task 10 records the dual-gate run here)
