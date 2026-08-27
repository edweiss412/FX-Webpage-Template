# Plan — private image pipeline (BL-PRIVATE-IMAGE-PIPELINE)

**Spec:** `docs/superpowers/specs/crew/2026-08-09-private-image-pipeline-design.md` (canonical; this plan implements it, invariant 7).
**Branch:** `feat/private-image-pipeline` · worktree `../FX-worktrees/private-image-pipeline`.
**Implementer:** Opus / Claude Code (UI surfaces — AGENTS.md hard rule; the non-UI tasks ride the same session).

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/api/diagram-asset-route.test.ts` — variant accept-set rows (spec §5).
- **EXTENDS** `tests/components/crew/diagramsBlock.test.tsx` — mapper carries the four new manifest fields (plan R1 F7).
<!-- spec-lint: ignore — file created by this plan's implementation -->
- **CREATES** `tests/sync/_metaVariantStageCensus.test.ts` — every original-byte upload path runs the variant stage.
<!-- spec-lint: ignore — file created by this plan's implementation -->
- **CREATES** `tests/sync/promoteSnapshotExpectedCount.realdb.test.ts` — the expected-count SQL evaluated against real Postgres (plan R1 F3; the mocked `queryOne` seam cannot exercise SQL).
- **Supabase call-boundary registry (invariant 9):** N/A — no new direct Supabase client call sites; variant uploads flow through the existing injected `SnapshotAssetsStorage.upload` / recovery `deps.storage.upload` interfaces whose call sites are already registered/exempt.
- **Advisory locks:** N/A — no `pg_advisory*` surface touched; the variant stage is pure compute inside existing lock-held flows, holder topology unchanged.
- **Invariant 10:** no new mutation surface (no new route/action). `tests/log/_metaMutationSurfaceObservability.test.ts` stays green without registry edits.

## Mutation-family closure (guard work in this plan)

Census test operators (plan R1 F9 — includes the four string-presence mutants where the guard scans source): (a) remove the stage call from one call site; (b) add a new upload call site without the stage; (c) the expected token with an appended suffix (`generateDiagramVariantsX`); (d) the token present but not live — in a comment or behind a false condition. Route accept-set operators: (e) unlisted variant key; (f) listed key under stale rev; (g) variant key for entry with `variants` absent; (h) variant key for entry with `snapshotPath: null`. Loader operators: (i) empty variants; (j) malformed row (non-finite/≤0 width, empty/non-string key); (k) width above max tier; (l) `pinOriginal` ignoring width. These enumerate the closure set; a reviewer-proposed new family needs a live escaping mutant.

## AC map (spec §10 — the `ac=` ids the task markers reference)

AC-1 variant objects + manifest fields at snapshot; AC-2 thumbnails fetch variant URLs under picker auth with the private Cache-Control; AC-3 zero `/_next/image` requests; AC-4 pre-migration manifests render as today; AC-5 revocation parity on variant URLs; AC-6 zero `no-img-element` disables in `components/diagrams/`; AC-7 recovery-path variant parity; AC-8 promote integrity with variants + pagination; AC-9 no-upscale / GIF skip / failure isolation; AC-10 variant 410s + HEAD parity + malformed-manifest no-throw; AC-11 loader clamp + `pinOriginal` + malformed fallback; AC-12 lightbox tiers, blur, geometry, error branch. Full normative text: spec §10.

Task ordering note (plan R1 F1): there is NO standalone manifest-types task — the optional fields on `PersistedEmbeddedImage`/`PersistedLinkedFolderItem` land inside Task 2's GREEN (their first behavioral consumer), because a types-only task has no valid RED: `isPersistedDiagrams` (`lib/data/diagrams.ts:45`) duck-types on `snapshot_revision_id` alone, so old-manifest acceptance passes with or without the fields. AC-4's old-manifest rows are REGRESSION PINS (added green), not REDs, and are labeled so below.

<!-- tasks: depth=2 -->

<!-- spec-lint: ignore — file created by this plan's implementation -->
## Task 1 — `lib/sync/diagramVariants.ts` skeleton + behavior tests
<!-- task: red=`pnpm vitest run tests/sync/diagramVariants.test.ts` ac=AC-9 -->

<!-- spec-lint: ignore — file created by this plan's implementation -->
1. Create `lib/sync/diagramVariants.ts` exporting `DIAGRAM_VARIANT_WIDTHS = [256, 512, 1024] as const`, `type DiagramVariantResult` (spec §3 shape, `failure` included), and `generateDiagramVariants` as a typed stub returning `{ variants: [], blurDataURL: null, intrinsicWidth: null, intrinsicHeight: null, failure: null }` — the RED failures below derive from missing production behavior (the sharp pipeline), never from an unresolved import (RED-validity rule).
<!-- spec-lint: ignore — file created by this plan's implementation -->
2. RED — `tests/sync/diagramVariants.test.ts` (fixtures generated IN-TEST with sharp itself — dims fixture-derived, not hardcoded; each row's discriminating condition stated with `premise`/`premiseHolds` from `tests/_shared/premise.ts`, unconditional relative to what it guards — plan R1 F4):
   - 2000×1500 png → variants exactly `DIAGRAM_VARIANT_WIDTHS.filter(w => w < 2000)`, each `mimeType: "image/webp"`, key `<assetKey>@<w>.webp`, decoded output width === declared width. Premise: fixture width exceeds the largest ladder tier.
   - 400×300 png → exactly [256]. 200×150 png → `variants: []` (no upscale). Premises: fixture widths straddle the 256 boundary as claimed.
   - gif (FIXTURE WIDTH > 256 — premise, else "no variants" is vacuous; plan R1 F4) → `variants: []`, `blurDataURL` non-null, dims recorded (spec §3 GIF rule).
   - EXIF row (spec §3, R2 F5): orientation-6 JPEG fixture, width chosen so ≥1 variant is emitted (premise: `variants.length > 0`, else "each variant's dims" is vacuous — plan R1 F4) → recorded dims AND each variant's DECODED OUTPUT dims are post-rotation; assertions decode output bytes, never trust input `metadata().width/height`.
   - blur happy path (plan R2 F3): result is a decodable `data:image/webp;base64,` URL — prefix asserted AND payload decodes as webp (sharp decode of the base64 body), dims ≤ 16.
   - blur bounds: extreme-aspect 1×1000 fixture → decoded blur dims BOTH ≤ 16. Belt: exercised in isolation with an injected/lowered threshold → in-memory result has `blurDataURL: null` + `failure.reason: "blur_oversize"` (IN-MEMORY NULL — omission is the Task 2 wiring-time serialization rule, not this function's contract; plan R1 F5).
   - corrupt bytes → `{ variants: [], blurDataURL: null, ... , failure: { reason: "sharp_error" } }`, resolves without throw, ZERO logger calls (spy). Premise: the corrupt fixture actually fails sharp.
   - Failure modes caught: silent upscaling, wrong-tier emission, unkeyed variants, sideways variants, unbounded blur, throw-through, in-stage logging.
3. GREEN — sharp: `.rotate()` first (normative), `.resize({ width })`, `.webp({ quality: 75 })`; blur `resize({ width: 16, height: 16, fit: "inside" }).webp({ quality: 40 })` encoded as webp and emitted with the `data:image/webp;base64,` prefix (plan R2 F3); dims from materialized rotated output; `failure` discriminator; no logging.
4. `pnpm typecheck`; commit `feat(sync): diagram variant generation stage (spec §3)`.

## Task 2 — snapshotAssets wiring + manifest fields + hop census
<!-- task: red=`pnpm vitest run tests/sync/snapshotAssets.test.ts tests/sync/phase2.test.ts tests/sync/runScheduledCronSync.test.ts tests/sync/applyStaged.test.ts tests/api/admin/pendingIngestionRetry-telemetry.test.ts tests/sync/runManualStageForFirstSeen.test.ts` ac=AC-1,AC-4 -->

1. RED (producer — extend `tests/sync/snapshotAssets.test.ts`): real png bytes through `snapshotAssets` → uploads captured at `${tempPrefix}${assetKey}@<w>.webp` (derived from fixture dims × `DIAGRAM_VARIANT_WIDTHS`); manifest entry carries the four new fields — `variants[].key` is the LAST PATH SEGMENT per spec §4 (plan R2 F1: NOT a full canonical path; the route reconstructs the full path as `dirname(snapshotPath) + "/" + key`, spec §5), with a cross-consistency row asserting each uploaded variant path's basename === its manifest `key` (so producer and route fixtures cannot drift apart) — fields OMITTED (never null) where generation produced none (spec §4 serialization); corrupt-bytes entry → original uploaded, no variant uploads, fields ABSENT, siblings unaffected, `snapshot_status` unchanged; `SnapshotAssetsResult.variantFailures` populated `{ assetKey, reason, message }`. Old-manifest REGRESSION PIN (green, not RED — see ordering note): fixture without the fields still parses and round-trips.
2. RED (hop census, spec §3 R3 F1 — the marker command runs EVERY suite listed, and each emit row pins the EXACT code `DIAGRAM_VARIANT_GENERATION_FAILED` plus the FULL payload `{ source: "sync.diagramVariants", showId, assetKey, reason, error: message }` — `error` carrying the failure message included, per spec §3 (plan R1 F2, R2 F2)): `Phase2Result` forwards rows verbatim (`tests/sync/phase2.test.ts`); `processOneFile` post-commit tail emits (`tests/sync/runScheduledCronSync.test.ts`); `applyStaged` post-commit reconcile emits, rollback fixture → ZERO emits (`tests/sync/applyStaged.test.ts`); retry route's bypass sink emits (`tests/api/admin/pendingIngestionRetry-telemetry.test.ts`; post-commit isolation via the existing `tests/api/admin/pendingIngestionRetryPostCommitIsolation.test.ts` pattern); `runManualStageForFirstSeen` return gains rows and its caller emits (`tests/sync/runManualStageForFirstSeen.test.ts`).
3. GREEN: add the optional fields to `PersistedEmbeddedImage`/`PersistedLinkedFolderItem` (`lib/parser/types.ts`); call the stage in both loops after fingerprint/md5 verification; upload variants to temp prefix; null→omit mapping; thread `variantFailures` through every census hop; wire each post-commit emit.
4. Commit `feat(sync): variant stage in snapshot pipeline + failure-signal hop census (spec §3)`.

## Task 3 — promoteSnapshot expected-count + pagination
<!-- task: red=`pnpm vitest run tests/sync/promoteSnapshot.test.ts tests/sync/promoteSnapshotExpectedCount.realdb.test.ts` ac=AC-8 -->

1. Export the expected-count SQL as a named constant from `lib/sync/promoteSnapshot.ts` (it is currently inline at `lib/sync/promoteSnapshot.ts:235`).
<!-- spec-lint: ignore — file created by this plan's implementation -->
2. RED — NEW `tests/sync/promoteSnapshotExpectedCount.realdb.test.ts` (plan R1 F3: the existing suite's `showTx.queryOne` mock returns a canned count for any `jsonb_array_elements` SQL, `tests/sync/promoteSnapshot.test.ts:43` — SQL semantics are untestable through that seam): run the exported SQL against the REAL local DB with a seeded `shows.diagrams.pending` fixture — entries with and without `variants`, plus a null-`snapshotPath` entry → count = non-null originals + their variant rows only. Premise: the fixture's variant rows number > 0 (else variant-blind SQL passes).
3. RED (extend `tests/sync/promoteSnapshot.test.ts`, mock-level flow): variant-bearing listing promotes; one missing variant object → `manifest_mismatch`; pagination pinned per surface (spec §9 R2 F7) with >100-object fixtures and an unconditional `premise(paths.length > 100)` each (plan R1 F4): (i) `defaultStorage.list` (`lib/sync/promoteSnapshot.ts:83`), (ii) `removePrefix` (`lib/sync/promoteSnapshot.ts:101`), (iii) rollback-repair over canonical (`lib/sync/promoteSnapshot.ts:430`) — paged limit/offset like `listPaths` (`lib/sync/diagramGc.ts:101`).
4. GREEN: SQL gains `jsonb_array_length(coalesce(e->'variants','[]'::jsonb))` legs (both entry types); both adapter listings paginate.
5. Commit `fix(sync): promote counts variants + paginates storage listings (spec §3)`.

## Task 4 — assetRecovery wiring + structural census
<!-- task: red=`pnpm vitest run tests/sync/assetRecovery.test.ts tests/sync/_metaVariantStageCensus.test.ts` ac=AC-7 -->

1. RED (extend `tests/sync/assetRecovery.test.ts`): recovered original accompanied by variant uploads + the four manifest fields (mirror of Task 2 producer assertions against the recovery `deps.storage.upload` capture); recovery result carries `variantFailures`; the outcome sink (`lib/sync/assetRecovery.ts:878` region) emits post-commit with the exact code + FULL payload including `error: message` (plan R2 F2).
<!-- spec-lint: ignore — file created by this plan's implementation -->
2. RED — NEW `tests/sync/_metaVariantStageCensus.test.ts`: source-scan of `lib/sync/**` for `.upload(`-class call sites; each must be census-registered or carry an inline exemption comment. Census verified at plan time (grep 2026-08-09, pasted): logical sites `lib/sync/snapshotAssets.ts:145` + `lib/sync/snapshotAssets.ts:165`, `lib/sync/assetRecovery.ts:543`; adapter impls `lib/sync/assetRecovery.ts:817`, `lib/sync/defaultSnapshotAssetsForApply.ts:149` — exemption-commented. The guard asserts a LIVE call relationship (AST-level or import-plus-call-in-function scan), not bare token presence; mutants (a)-(d) from the closure section run pre-dispatch, results recorded in the commit (plan R1 F9).
3. GREEN + commit `feat(sync): variant stage in asset recovery + census guard (spec §3)`.

## Task 5 — route variant accept-set
<!-- task: red=`pnpm vitest run tests/api/diagram-asset-route.test.ts` ac=AC-2,AC-5,AC-10 -->

1. RED rows (extend `tests/api/diagram-asset-route.test.ts`): listed variant key → 200, `Content-Type: image/webp`, `Cache-Control` exactly `private, max-age=0, must-revalidate`, signed request addressed the exact VARIANT storage path (style of `tests/api/diagram-asset-route.test.ts:402`); unlisted plausible key → 410; listed key under stale rev → 410; entry without `variants` → 410; `snapshotPath: null` + plausible `variants` → 410 no throw; **full §4 malformed matrix (plan R1 F6): non-array `variants`, null/non-object rows, non-finite width, zero/negative width, empty-string key, non-string key — each → 410 without throw**; HEAD parity on a variant key; picker-session 401 unchanged for variant URLs (AC-5).
2. GREEN: extend `findAsset` per spec §5 — non-null string `snapshotPath` gate first, then literal equality against original OR `dirname(snapshotPath) + "/" + variants[i].key` over valid rows; variant match returns the VARIANT path for signing; variants serve `image/webp`.
3. Mutants (e)-(h) pre-dispatch, recorded. Commit `feat(crew): diagram route serves manifest-listed variants (spec §5)`.

<!-- spec-lint: ignore — file created by this plan's implementation -->
## Task 6 — `lib/images/diagramLoader.ts`
<!-- task: red=`pnpm vitest run tests/images/diagramLoader.test.ts` ac=AC-11 -->

<!-- spec-lint: ignore — file created by this plan's implementation -->
1. Typed stub (Task 1 pattern) → RED rows (`tests/images/diagramLoader.test.ts`, new dir auto-covered by `BASE_INCLUDE`, `vitest.projects.ts:34`): snapping exact/between-tier; above-ladder → LARGEST variant (premise: requested width > largest tier — plan R1 F4); `pinOriginal: true` → original at every width including below-ladder; variants absent/empty/all-invalid → original; malformed rows filtered per §4 (non-finite/zero/negative width, empty/non-string key rows each individually); URL round-trips `diagramAssetKeyFromPath` in `lib/data/diagrams.ts`.
2. GREEN + mutants (i)-(l) pre-dispatch. Commit `feat(crew): diagram image loader with variant clamping (spec §6)`.

## Task 7 — Gallery migration + DiagramsBlock mapper
<!-- task: red=`pnpm vitest run tests/components/diagrams/Gallery.test.tsx tests/components/crew/diagramsBlock.test.tsx` ac=AC-4,AC-6 -->

1. RED (extend `tests/components/diagrams/Gallery.test.tsx`): variants+blur item renders `next/image` with `placeholder="blur"`; no-blur item → no placeholder prop; **empty-string and non-string `blurDataURL` → no placeholder prop; non-finite/≤0 intrinsic dims → dims path not taken (plan R1 F6)**; `onError` → unavailable branch (`failedKeys`); cell/button gains `relative` (class assertion). Old-manifest REGRESSION PIN (green): item without any new field renders as today.
2. RED (extend `tests/components/crew/diagramsBlock.test.tsx` — the REAL mapper, plan R1 F7: `Gallery.test.tsx` fixtures construct `GalleryItem` directly, so the mapper can drop every field while it passes): `embeddedItem`/`linkedItem` (`components/crew/DiagramsBlock.tsx:53` region) carry `variants`/`blurDataURL`/`intrinsicWidth`/`intrinsicHeight` from a `PersistedDiagrams` fixture into `GalleryItem`; absent fields map to absent.
3. RED (gate row, plan R2 F5): `bash -c '! grep -n no-img-element components/diagrams/Gallery.tsx'` fails NOW (the disable is present) and goes green in this task's own GREEN — the per-task failing-check → implementation → passing-check sequence lives HERE, not in Task 10.
4. GREEN: Gallery `<img>` → `Image` (`fill`, `sizes="(min-width: 640px) 25vw, 33vw"`, per-item loader); `GalleryItem` + mapper plumbing; delete the Gallery eslint-disable + revert-rationale comment.
5. Commit `feat(crew-page): Gallery on next/image with blur variants (spec §6)`.

## Task 8 — GalleryLightbox migration + transition audit
<!-- task: red=`pnpm vitest run tests/components/diagrams/GalleryLightbox.test.tsx tests/components/diagrams/GalleryLightboxPinchZoom.test.tsx` ac=AC-12 -->

<!-- spec-lint: ignore — file created by this plan's implementation -->
1. RED — NEW `tests/components/diagrams/GalleryLightbox.test.tsx` (existing `GalleryLightboxPinchZoom.test.tsx` runs in the same marker command and must stay green — plan R1 F10): active slide uses `pinOriginal` URL; inactive slide uses clamped variant URL, `sizes="100vw"` asserted on the inactive `Image` (plan R1 F6); BOTH tiers `placeholder="blur"` when present; empty/non-string blur → no placeholder; dims branch renders `width`/`height`, non-finite/≤0 dims → fill branch; inactive no-dims fill inside the NEW inner `relative size-full` wrapper (spec R3 F2); active no-dims fill inside `TransformComponent` wrapper; `onError` → `setFailedKeys` branch (`components/diagrams/GalleryLightbox.tsx:680`/`components/diagrams/GalleryLightbox.tsx:708`).
2. Transition audit — BEFORE any commit (plan R1 F10/F13), with the spec's FULL inventory tables (both copied verbatim into the test file header): enumerate every `AnimatePresence`, ternary render, and conditional block in both components; per spec table, assert each of the 10 pairs' treatment (instant / built-in / impossible-by-construction) and each of the 5 compound rows — including failed-item-stays-failed-across-tier-swap and active↔inactive src swaps.
3. RED (gate row, plan R2 F5): `bash -c '! grep -n no-img-element components/diagrams/GalleryLightbox.tsx'` fails NOW and goes green in this task's GREEN.
4. GREEN (inner wrapper included; delete both Lightbox eslint-disables) — then commit `feat(crew-page): GalleryLightbox on next/image tiers + transition audit (spec §6)`.

## Task 9 — e2e: seed variants, layout geometry, network gate, CI wiring
<!-- task: red=`CREW_E2E_ONLY=1 pnpm playwright test tests/e2e/crew-layout-dimensions.spec.ts` ac=AC-2,AC-3,AC-12 -->

1. SEED FIRST (plan R1 F8 — the REDs below must fail on missing FEATURE, not missing fixture): extend `supabase/seed.ts` so the Waldorf diagrams manifest has ≥2 AVAILABLE entries (non-null `snapshotPath`) with §4 fields, one with dims and one without (both lightbox no-dims/dims branches reachable), and upload tiny real webp variant objects + originals to the local bucket (generator in-repo, bytes not committed). Run `pnpm db:seed` and verify with a direct query before writing test rows.
2. Extend `tests/e2e/crew-layout-dimensions.spec.ts` (harness per its docblock: `signInAs(ADMIN_FIXTURE)`, `lookupSeededShow`, share token from `show_share_tokens`, mobile-safari single-writer, explicit viewports). Harness-readiness triple (plan R2 F4, per `docs/agents/writing-plans.md` e2e checklist): (a) BOOT — the existing port-3000 dev-build webServer, isolated via `CREW_E2E_ONLY=1` IN the marker command itself (plan R3 F1; `playwright.config.ts:420` — without it all five servers boot and the RED can fail on unrelated port 3001-3004 contention); (b) READINESS — before any geometry read: page-container hydration gate as the suite already uses, then per-image `complete && naturalWidth > 0` via `locator.evaluate`, and for lightbox measurements an explicit settle gate (poll the slide's bounding rect stable across two frames after open/swipe — never `networkidle` alone); (c) DETACH-SAFETY — every rect sample runs inside a try/retry wrapper and only against the CURRENT slide queried fresh after settle, never a locator captured before a swipe (Embla replaces active-slide DOM). Unconditional premises (plan R1 F8): gallery renders > 0 `Image` elements; network log holds > 0 `/api/asset/diagram/` requests — each `premise(...)`-guarded before any equality assertion.
3. Geometry: every `[data-testid^="diagram-slot-"]` image box === its cell box; lightbox inactive no-dims image box === inner `relative size-full` wrapper box; active no-dims image box === `TransformComponent` wrapper box (oracle = wrapper rects, never the figure's outer rect); each within 0.5px.
4. Network: zero `/_next/image` requests (AC-3); thumbnail requests are variant-suffixed UNCONDITIONALLY (the seed now guarantees variants — no "iff"; plan R1 F8).
5. CI wiring (plan R1 F8 — the file is currently invoked only under `-g "T-NOPHANTOM-CREW"` in `.github/workflows/phantom-gap-e2e.yml:172` and absent from the crew-e2e list at `.github/workflows/crew-e2e.yml:176`): add the new test titles under a grep-matched tag OR add the file to the crew-e2e invocation list — named edit in this task, verified by reading the workflow diff.
6. Commit `test(e2e): gallery variant layout + no-optimizer network gate`.

## Task 10 — impeccable dual gate + AC-6 proof
<!-- task: red=`bash -c '! grep -rn "no-img-element" components/diagrams/'` ac=AC-6 -->

1. `/impeccable critique` + `/impeccable audit` on the diff (canonical v3 setup gates). P0/P1 fixed or DEFERRED.md-entried; findings + dispositions to closeout §12.
2. AC-6 proof is the marker's grep command — a STANDING VERIFICATION GATE, not this task's RED (plan R2 F5): the per-task RED lives in Tasks 7/8's own gate rows, which failed before each task's GREEN; this task re-runs the whole-directory form (zero `no-img-element` matches under `components/diagrams/`) as closeout evidence, `pnpm lint` as companion. (Plan R1 F11 stands: `pnpm lint` alone exits 0 WITH disables present.)
3. Commit `chore(crew-page): impeccable dual-gate dispositions (invariant 8)` (plan R1 F13 — every task commits).

## Task 11 — closeout
<!-- task: red=`pnpm test` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9,AC-10,AC-11,AC-12 -->

1. Gates (verification, not REDs — labeled per plan R1 F13): full `pnpm test`, `pnpm typecheck` (vitest AND playwright tsconfigs), eslint, `pnpm format:check`.
2. Sharp runtime verification, PRE-MERGE halves (spec §3 requirement; plan R1 F12): (a) production-mode `pnpm build` completes with sharp resolved from the sync/apply route graph; (b) `node -e "require('sharp')"` under a pruned production install. Both recorded in closeout §12 pre-merge.
3. File `BL-ADMIN-DIAGRAM-NEXT-IMAGE` (BACKLOG.md, spec §1.1 exception (c) text); archive `BL-PRIVATE-IMAGE-PIPELINE` with spec cross-ref. Commit `docs(plan): close BL-PRIVATE-IMAGE-PIPELINE; file BL-ADMIN-DIAGRAM-NEXT-IMAGE`.
4. Whole-diff cross-model review (fresh-eyes; split tight-scope briefs: sync / route / UI) — any repair commits land here. **Any repair commit touching a UI surface (invariant 8 definition) re-runs the impeccable dual gate on the amended diff BEFORE re-review and merge, dispositions appended to §12 (plan R3 F2).**
5. ONLY after the review converges APPROVE (plan R2 F6 — so it is the ACTUAL last commit): remove the invariant-12 ledger claim marker, subject `docs(plan): drop ledger claim (invariant 12)`. Real CI green; `gh pr merge --merge`; ff-sync main to `0  0`; Stage 4.4 label + cron cleanup.
6. POST-MERGE sharp half (c) (plan R2 F6 — post-merge evidence cannot live in a pre-merge tracked commit): one validation-project sync of a diagram-bearing show shows variant objects in storage and no module-resolution telemetry; recorded as a PR comment on the merged PR, with closeout §12 pre-carrying the pointer "post-merge validation probe: see PR comment".

<!-- tasks: end -->

## 12 — closeout markers

impeccable-gate: critique=RAN audit=RAN p0=0 p1=5 dispositions=recorded

post-merge validation probe: RAN 2026-08-27, PASSES. Evidence:
https://github.com/edweiss412/FX-Webpage-Template/pull/761#issuecomment-5441921368

Both numbers Task 11 step 6 asked for land. Fact (a): 5 `@<width>.webp` variant
objects sit beside their 2 originals under the synced show's current
`snapshot_revision_id` prefix, matching a variant count predicted from the source
dimensions BEFORE the sync ran. Fact (b): 0 `DIAGRAM_VARIANT_GENERATION_FAILED`
rows for all time, so none naming a missing module, which is the deployed-runtime
half of the `sharp` resolution check that a production-only install could only
approximate.

It could not run at close-out. The probe drives the DEPLOYED validation app
(`pnpm validation:smoke` is deployed-side by construction) and Vercel refused
deployments at merge time under an account-level 24h rate limit, so there was no
app to sync against. The step survived only as text inside Task 11 of a plan whose
other ten tasks are done, which is why it was filed as
`BL-PRIVATE-IMAGE-POSTMERGE-PROBE` and scheduled from the open queue rather than
left here.

Worth keeping, because it explains why the gap was invisible for eighteen days:
the scheduled cron sync had been polling the show every five minutes and returning
`skipped:watermark` every time. The watermark gate is reachable only in automatic
mode (`lib/sync/perFileProcessor.ts:276-278`), so an unchanged sheet never reaches
the snapshot path under cron, and no amount of waiting would have produced a single
variant. Only a manual sync re-applies an unchanged sheet
(`lib/sync/runManualSyncForShow.ts:538`).

### Invariant-8 dual gate — findings and dispositions

Run at Task 10 against the UI diff (`components/diagrams/Gallery.tsx`,
`components/diagrams/GalleryLightbox.tsx`, `components/crew/DiagramsBlock.tsx`,
plus `lib/images/diagramLoader.ts` and the `VenueSection.tsx` call site the
`sizes` repair reached). Critique ran dual-agent (design review + detector /
evidence, isolated); audit ran as its own pass. Browser evidence against the
running app was UNAVAILABLE and is recorded as such rather than skipped: port
3000 belongs to a different worktree, so any capture would have been evidence
for the wrong code. The real-browser geometry claims are covered by Task 9's
Playwright gate instead.

**P0: none.**

**P1 — fixed in branch (3 of 5):**

1. *Keyboard focus was invisible, in both of its forms.* Critique found the
   outset ring on the cell button clipped by the cell's `overflow-hidden`; the
   first repair (`ring-inset`) was then refuted by the audit with box-model
   evidence — an inset shadow paints below descendants, and the `fill` image
   covers the button exactly, so the ring was occluded rather than clipped. The
   ring now lives on the cell itself, driven by `has-[button:focus-visible]`
   (an element's own ring is not clipped by its own overflow). The first
   regression row asserted the class string and passed while focus was
   invisible; it is replaced by one that pins the structure and premises both
   failure modes, and reverting to the inset-on-button form reds it.
2. *`sizes` over-declared by ~4x, so thumbnails fetched the 1024 variant where
   256 suffices* — the exact waste this pipeline exists to remove, on the crew
   path it exists for. `sizes` is now a caller-supplied prop: only the caller
   knows whether it rendered into the venue split's narrow column (~92px
   thumbnails) or the full-width branch (~268px), and a single static string is
   wrong in one branch either way.
3. *Blur placeholder painted `cover` under an `object-contain` image*, so it
   rendered stretched and full-bleed and then snapped to the letterboxed image.
   next/image derives the placeholder's `background-size` from `style.objectFit`,
   not from the class. Fixed on both lightbox tiers and pinned.

**P1 — deferred, spec-ratified (2 of 5).** Both contradict decisions the spec
already ratified, so invariant 7 applies and they file rather than land:

4. *The active lightbox slide pins the ORIGINAL with no progress affordance*,
   which on venue wifi means seconds of blur at the peak-stakes moment. Spec §6
   mandates the original pin (zoom needs full resolution). Filed as
   `BL-LIGHTBOX-ORIGINAL-PROGRESS-AFFORDANCE`.
5. *The 16px blur edge is too coarse for line-art* and, at full-viewport scale
   in dark mode, reads as a light-bomb rather than a placeholder. Spec §3 fixes
   the 16px bound. Filed as `BL-DIAGRAM-BLUR-EDGE-SIZE`.

**P2 — fixed:** the stale "next/image cannot serve these URLs" rationale, which
survived directly above the migrated `<Image>` it no longer describes.

**P2 — deferred:** runtime image failure swaps the gallery cell from `<button>`
to a non-interactive `<div>`, dropping focus to `<body>` (the lightbox already
relocates focus on the identical transition); and that swap is silent to assistive
tech. Both are pre-existing behaviours on this surface, both filed as
`BL-GALLERY-FAILED-ITEM-FOCUS-AND-ANNOUNCE`.

**P3 — fixed:** `validDims` was called twice per branch behind a non-null
assertion (hoisted to one per-slide `const`, so the two calls can no longer
disagree), and `blurProps` returned `... | object`, erasing type safety at the
spread site (now `Partial<...>`).

**Amended diff (post-gate UI repair, plan R3 F2).** Task 9's real-browser gate
then caught a WebKit-only layout defect in the same surface: with `relative` on
the cell BUTTON, WebKit resolves the button's `height: 100%` against the cell's
aspect-ratio BORDER box, so the `fill` image rendered 98x100 against a 98x98
content box and cropped 2px at the bottom — Chromium matched the content box and
hid it entirely. `relative` moved to the cell `li` (which the focus-ring repair
above had already made the ring's owner, for an independent reason). The dual
gate's mechanical half was re-run against the amended diff: component suites
75/75, typecheck clean, eslint clean, detector unchanged at the same 8 comment
false positives. The design half is unaffected — the repair moves a positioning
context between two elements that occupy the same box, changes no token, no copy,
and no visual treatment.

**Detector:** 8 `broken-image` findings, all false positives — every hit is the
token `<img>` inside a code comment, and the detector does not strip comments.
No literal `<img>` JSX remains in any of the three files, which is also what the
AC-6 whole-directory grep gate asserts.
