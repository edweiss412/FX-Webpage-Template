# Private image pipeline — ingest-time variants + `next/image` custom loader

**Date:** 2026-08-09 · **Ledger:** `BL-PRIVATE-IMAGE-PIPELINE` (BACKLOG.md) · **Branch:** `feat/private-image-pipeline`
**Origin:** DEFERRED M7-D3, re-deferred at M9 C6b after a P0 revert (`components/diagrams/Gallery.tsx`, comment block above the `<img>`: `/_next/image` (a) does not forward auth cookies to the upstream asset route and (b) rewrites `private` Cache-Control to public).

## 1. Problem and goal

The crew diagrams gallery (`components/diagrams/Gallery.tsx`, `components/diagrams/GalleryLightbox.tsx`) renders raw `<img loading="lazy" decoding="async">` against `/api/asset/diagram/<show>/<rev>/<key>`. Every thumbnail in the 3–4 column grid downloads the **full original bytes** (route cap 50MB, `MAX_DIAGRAM_BYTES`, `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`) into a ~120px square, on venue 4G.

**Goal (ratified in the design session):** full `next/image` adoption on both components — blur-up placeholders, `sizes`-driven responsive selection, the platform-canonical component — backed by a byte pipeline that preserves the shipped auth + private-cache + revocation contract unchanged.

**Mechanism:** ingest-time webp variants + per-component custom `loader`. With a `loader` prop, `next/image` never routes through `/_next/image`: the loader's return value is the URL the **browser** fetches directly, so the `__Host-fxav_picker` cookie (`lib/auth/picker/validatePickerAssetSession.ts`, `pickerCookieFromRequest`) and admin session cookies flow exactly as they do for `<img>` today.

<!-- spec-lint: ignore — upstream vercel/next.js source citations, not repo files -->
Framework contract verified against Next.js source, not assumed: `packages/next/src/shared/lib/get-img-props.ts` (`isDefaultLoader` check — a user-supplied loader replaces the default loader entirely), `packages/next/src/server/next-server.ts` (the `/_next/image` endpoint is a separate code path our URLs never hit), and the `next/image` docs' own note that the default optimizer "does not forward headers when fetching the `src` image" — the documented form of the M9 P0.

## 1.1 Resolved scope — do not relitigate

| Decision | Resolution | Where ratified |
|---|---|---|
| Byte pipeline | **A: ingest-time variants.** Runtime per-request transform (B) rejected: `private, max-age=0, must-revalidate` means every view re-transforms on serverless against up-to-50MB origins, and the blur requirement forces the ingest sharp pass anyway. Supabase CDN transform URLs (C) rejected: hands the client an unauthenticated URL (revocation weakens to TTL) and public CDN cache headers — the same contract violation class that killed the M9 attempt. | Design session 2026-08-09, user-selected |
| `next/image` adoption is the goal | Not merely bandwidth or lint debt — component adoption with blur + `sizes`. | Design session, user-selected |
| Blur placeholders | **Yes**, generated at ingest, stored in manifest. | Design session, user-selected |
| Backfill | **None.** Old snapshots serve originals with no blur (current behavior) until the show's next Drive-edit-triggered snapshot mints a new revision with variants. No backfill job, no admin action. | Design session, "Approved as presented" |
| Lightbox resolution tiers | Active slide: original. Inactive slides: 1024 variant (fallback original). | Design session, "Approved as presented" |
| Route cache contract | `Cache-Control: private, max-age=0, must-revalidate` (`CACHE_CONTROL`, route.ts) stays byte-identical for variants. This spec does not revisit the contract (e.g. no `immutable` on rev-addressed URLs). Loosening it is a separate future entry if ever wanted. | M7/M9 shipped contract; this session keeps it |
| Admin peer surfaces deferred | `components/admin/wizard/step3ReviewSections.tsx` has two same-shape `<img>` sites (staged-diagram preview ~line 3722; published breakdown building `/api/asset/diagram/` srcs ~line 3915). Deferred to a new `BL-ADMIN-DIAGRAM-NEXT-IMAGE` entry under class-sweep exception **(c)**: the repair lands inside a ~4000-line admin wizard file the PR does not otherwise touch, blowing review scope; the value driver (crew 4G bandwidth) does not apply to the desktop admin surface. The loader/variant infrastructure this spec ships is reusable there as-is. | This spec §1.1; AGENTS.md class-sweep disposition rule |
| No new §12.4 / ParseWarning code | Variant-generation failure degrades silently for users (originals still render) and emits a **telemetry-only** `log.warn` with a durable `code:` field (invariant 10 style), NOT a `ParseWarning`. Rationale: a missing variant is pure perf degradation — no crew/admin action exists, so a warning card would be noise, and skipping `ParseWarning` avoids the §12.4 three-lockstep + `WARNING_CARD_COPY_CODES` fan-out for a non-actionable event. | This spec §3 |
| `next.config.ts` untouched | Per-component `loader` needs no `images` block, no `remotePatterns`, no `loaderFile`. The M9 plan's step "declare the proxy origin in `images.remotePatterns`" is obsolete under the custom-loader design. | Next source, §1 citations |

## 2. Architecture

```
sync (per new snapshot revision)
  fetchBytes → verify fingerprint (existing, lib/sync/snapshotAssets.ts)
  → NEW sharp stage (lib/sync/diagramVariants.ts):
      webp variants @ 256 / 512 / 1024 (skip widths ≥ original width)
      + blurDataURL (tiny inline webp, base64)
      + intrinsic {width, height}
  → upload original + variants to the SAME temp prefix
  → promoteSnapshot moves the whole prefix (expected-count + pagination edits, §3)
  → manifest entry records variants/blur/dims (optional fields)

client
  next/image (Gallery, GalleryLightbox)
  → per-item custom loader snaps requested width to nearest listed variant
  → browser GET /api/asset/diagram/<show>/<rev>/<variant-key>  (cookies flow)

route
  authorize variant keys from the manifest entry (accept-set: listed paths only)
  → same signed-URL streaming, same CACHE_CONTROL, Range, caps, HEAD parity
```

No new HTTP route, no server action, no DB DDL — manifest changes are optional fields inside the existing `shows.diagrams` JSONB.

<!-- spec-lint: ignore — new file this spec's implementation creates -->
## 3. Ingest stage — `lib/sync/diagramVariants.ts` (new)

**Contract.** `generateDiagramVariants(input: { bytes: Uint8Array; mimeType: string; assetKey: string }): Promise<DiagramVariantResult>` where

```ts
type DiagramVariantResult = {
  variants: Array<{ width: number; key: string; bytes: Uint8Array; mimeType: "image/webp" }>;
  blurDataURL: string | null;   // data:image/webp;base64,... ; null on any generation failure
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
  failure: { reason: "sharp_error" | "blur_oversize"; message: string } | null; // R1 F8: explicit discriminator
};
```

**Telemetry ownership (R1 F8; POST-COMMIT per R2 F1, P0):** `generateDiagramVariants` itself never logs — it has no `showId` and its input contract stays byte-local. And the WIRING SITES may not log either: the Apply path invokes `snapshotAssetsForApply` inside the show advisory-lock transaction (`lib/sync/phase2.ts:425`, lock asserted at `lib/sync/applyStagedCore.ts:549`), and `log.warn` is durable (`lib/log/logger.ts:21`) — an in-lock emit would persist a failure record for an Apply that later rolls back, violating invariant 10's post-commit rule. Instead, failures travel as DATA: `SnapshotAssetsResult` (and the recovery path's result) gains `variantFailures: Array<{ assetKey: string; reason: "sharp_error" | "blur_oversize"; message: string }>`, populated from each asset's `failure` discriminator, and every consuming surface's post-commit sink emits one `log.warn("diagram variant generation failed", { source: "sync.diagramVariants", code: "DIAGRAM_VARIANT_GENERATION_FAILED", showId, assetKey, reason, error: message })` per row AFTER the transaction commits. A rolled-back Apply emits nothing.

**Failure-signal hop census (R3 F1, P0 — `snapshotAssets` is only the in-lock PRODUCER; the rows must cross every real commit boundary, enumerated exhaustively):**

1. **Phase2 hop:** `runPhase2` consumes `SnapshotAssetsResult` (`lib/sync/phase2.ts:425`) and builds `Phase2Result` (`lib/sync/phase2.ts:644`) — `Phase2Result` gains `variantFailures` and forwards the rows verbatim.
2. **Cron / push / ordinary manual surface:** `ProcessOneFileResult` carries the rows to `processOneFile`'s post-commit tail (`lib/sync/runScheduledCronSync.ts:395`), which emits.
3. **Dashboard Apply surface:** `ApplyStagedCoreResult` → `ApplyStagedResult` → `applyStaged`'s post-commit reconcile (`lib/sync/applyStaged.ts:259`, the same carry-out pattern as identity-link pairs at `lib/sync/applyStaged.ts:268-273`), which emits.
4. **Existing-show pending-ingestion retry:** `app/api/admin/pending-ingestions/[id]/retry/route.ts:375` explicitly BYPASSES the `processOneFile` post-commit tail — its own post-commit point emits the rows itself.
5. **First-seen pending-ingestion retry:** `runManualStageForFirstSeen` returns only `{ showId, roleFlagsNotice }` today (`lib/sync/runManualStageForFirstSeen.ts:43`) — its return type gains `variantFailures`, and its calling surface's post-commit point emits.
6. **Recovery surface:** `assetRecovery`'s own outcome sink (`lib/sync/assetRecovery.ts:878`), as before.

A hop or sink omitted from this census is a spec violation: the consequence bound is "signaled, never silently dropped", and each hop above gets its own named test row (§9).

Tests: the pure suite asserts `generateDiagramVariants` performs zero logging; each census surface's suite asserts the rows survive its hop chain and emit post-commit only (rollback fixture → no emit).

- **Widths:** `[256, 512, 1024]` (single named constant, `DIAGRAM_VARIANT_WIDTHS`). A width is generated only when it is **strictly less than** the original's intrinsic width — never upscale. An original 400px wide gets only the 256 variant; a 200px original gets none (originals stay the only tier).
- **Encoding:** webp, `sharp().resize({ width }).webp({ quality: 75 })`. `image/webp` is already in the route's MIME allowlist (`ALLOWED_DIAGRAM_MIMES`, `lib/data/diagrams.ts`).
- **Variant key:** `<assetKey>@<width>.webp` (e.g. `embedded-abc123.png@512.webp`). The `@` separator cannot collide with original keys: original keys are `embedded-<objectId>.<ext>` / `folder-<driveFileId>.<ext>` (`lib/sync/snapshotAssets.ts`, `extForMime` call sites) and are never parsed back — the route matches manifest-listed paths literally (§5), so key naming is a storage convention, not a recognizer.
- **Blur:** `resize({ width: 16, height: 16, fit: "inside" })` — BOTH dimensions bounded ≤ 16 regardless of aspect ratio (R1 F9: a width-only resize of a 1×1000 png probe produced a 16×16000 webp, a 9,347-byte data URL, ~560 KB of inline JSONB at the 60-diagram corpus cap `MAX_TOTAL_DIAGRAM_ITEMS`, `lib/sync/enrichWithDrivePins.ts:33`) — webp quality 40, base64 data URL. Belt on top of the bound: an encoded data URL longer than 2048 characters is dropped (field omitted) and signaled with the same telemetry code, reason `blur_oversize`. Within these bounds the expected payload is ≲ 500 bytes per asset.
- **Intrinsic dims:** recorded on the entry (the manifest carries no dimensions today — `PersistedEmbeddedImage` / `PersistedLinkedFolderItem`, `lib/parser/types.ts`, have none). Needed by the lightbox (§6). **EXIF orientation is normative, not deferred (R1 F4):** every pipeline (variants, blur, dims) applies `.rotate()` (sharp auto-orient from EXIF) before resize, and recorded dims are POST-rotation. **Sharp's `metadata().width/height` are orientation-UNAWARE even after `.rotate()` is chained (R2 F5 probe: orientation-6 input reported 40×20 from both `sharp(input).metadata()` and `sharp(input).rotate().metadata()`, while the materialized rotated output was 20×40)** — so recorded dims MUST come from the materialized rotated pipeline output (or sharp's explicitly oriented metadata fields), never from raw input metadata. R1 probe evidence: a 40×20 JPEG with EXIF orientation 6 yields a sideways 16×8 webp without `.rotate()` (silent wrong rendering vs the browser's oriented original) and a correct 16×32 with it.
- **GIF:** no variants, no upscaled tiers — animation would be lost (resize of animated GIF re-encode is out of scope). Blur IS generated (sharp reads the first frame by default) and dims are recorded. `mimeType === "image/gif"` short-circuits the variant loop only.
- **Failure posture (consequence bound):** any sharp throw — corrupt bytes, unsupported profile, OOM-guard — is caught **per asset**; the asset's result carries `variants: []`, null blur/dims, and a non-null `failure`, which the caller signals per the telemetry-ownership rule above. The snapshot itself NEVER fails or degrades status because of the variant stage — `snapshot_status` semantics (`statusFor`, `lib/sync/snapshotAssets.ts`) are untouched. Every input is handled correctly or signaled, never silently wrong: correct = variants; signaled = telemetry code + original-only rendering.

**Wiring — two call sites (companion-surface census, exhaustive):**

1. `lib/sync/snapshotAssets.ts` — after fingerprint/md5 verification passes and before `storage.upload` of the original, for both loops (`embeddedImages`, `linkedFolderItems`). Variant bytes upload to the same `tempPrefix` (`diagram-snapshots/shows/<showId>/_pending/<runUuid>/<variantKey>`). The manifest entry gains the §4 fields with `snapshotPath`-style canonical variant paths.

2. `lib/sync/assetRecovery.ts` — the recovery path uploads recovered originals directly (its `upload` dependency, and the staged-file apply path around its `uploadedPaths` handling); it runs the same stage and writes the same fields for recovered entries.

### Promotion changes — REQUIRED, not zero (R1 F1, P0)

`promoteSnapshot` verifies object counts against an expected count computed by SQL over the pending manifest — entries with non-null `snapshotPath` only (`lib/sync/promoteSnapshot.ts:235-276`: `expectedAssetCount`, compared to both the temp listing at `lib/sync/promoteSnapshot.ts:255` and the canonical listing at `lib/sync/promoteSnapshot.ts:276`) — so any variant object would trip `manifest_mismatch` before cutover. Two mandated edits:

- **(a) Expected-count SQL counts variants too:** each of the two `jsonb_array_elements` legs adds `jsonb_array_length(coalesce(e->'variants', '[]'::jsonb))` (resp. `l->'variants'`) summed over entries with non-null `snapshotPath`, so expected = originals + their listed variants. Integrity semantics preserved: a missing or extra object still mismatches, now against the variant-inclusive count.
- **(b) The storage adapter paginates:** `defaultStorage.list` (`lib/sync/promoteSnapshot.ts:83`) and the `removePrefix` internal listing (`lib/sync/promoteSnapshot.ts:101`) each issue ONE unpaginated SDK call, which defaults to 100 objects — while the live corpus cap of 60 diagrams (`MAX_TOTAL_DIAGRAM_ITEMS`, `lib/sync/enrichWithDrivePins.ts:33`) × (1 original + up to 3 variants) = up to 240 objects. Both switch to the limit/offset page loop already used by `diagramGc`'s `listPaths` (`lib/sync/diagramGc.ts:101`). This also covers the rollback-repair path (`lib/sync/promoteSnapshot.ts:430`) and `removePrefix`'s pre-existing >100-object truncation, which the same adapter serves — swept via `grep -n "\.list(" lib/sync/*.ts` 2026-08-09: the only unpaginated storage listings are these promoteSnapshot adapter sites (diagramGc paginates; `applyStaged`/`runScheduledCronSync` hits are Drive revisions APIs, not storage).

A structural test pins that both call sites invoke the stage (a new upload path that skips it fails by name), per the invariant-9-style registry pattern.

**GC:** zero changes, with proof rather than assumption — `runDiagramGc` retains by **revision prefix**, not per-file: the `retained` set holds revision IDs and any object whose `revisionFromPath` is retained survives (`lib/sync/diagramGc.ts`, `runDiagramGc`). Variants live under the same revision prefix as their original.

**Runtime environment:** `sharp` is already a direct dependency (`package.json`, `"sharp": "^0.34.5"`). The plan carries a verification task that the deployed sync path (Vercel Node runtime) resolves sharp's platform binary — a build-time/deploy-time check, not a spec assumption.

## 4. Manifest fields

`PersistedEmbeddedImage` and `PersistedLinkedFolderItem` (`lib/parser/types.ts`) each gain four **optional** fields:

```ts
variants?: Array<{ width: number; key: string }>; // key = last path segment, same convention as snapshotPath keys
blurDataURL?: string;
intrinsicWidth?: number;
intrinsicHeight?: number;
```

- **Optionality is the migration.** `resolveCurrentDiagrams` duck-types on `snapshot_revision_id` only (`lib/data/diagrams.ts`, `isPersistedDiagrams`) — old manifests without the fields and new manifests with them both pass. No DB migration, no backfill, no CHECK/enum change (the tier×domain and CHECK matrices are N/A: no DDL of any kind).
- **Serialization rule (R1 F7):** persisted JSONB uses OMISSION, never null — a failed/absent value writes NO field. `DiagramVariantResult`'s nulls are the in-memory form; the §3 wiring sites map null → field omitted when building the entry. Persisted optional types therefore stay `field?: T` with no `| null` arm, and old/new manifests are distinguished only by field presence.
- **Guard conditions (every new field × degenerate value, CLIENT and SERVER — R1 F7):** absent/`undefined` variants → loader returns original URL (§6); `variants: []` → same; non-array `variants`, null/non-object rows, non-finite or ≤0 `width`, non-string or empty `key` → that row (or the whole malformed field) is skipped as if absent; absent/empty/non-string `blurDataURL` → no `placeholder` prop (empty-then-image, current behavior); absent or non-finite/≤0 intrinsic dims → lightbox uses `fill` + contain fallback (§6). These guards apply identically in the ROUTE's accept-set traversal (§5) — a malformed manifest field can never make `findAsset` throw; it shrinks the accept-set toward originals-only. Neither client nor server ever throws on a malformed manifest row.
- `PendingDiagramsPayload` (`lib/sync/snapshotAssets.ts`) already carries `PersistedEmbeddedImage[]` / `PersistedLinkedFolderItem[]`, so the pending→current apply path propagates the fields with no shape change.

## 5. Route — variant authorization (accept-set)

`app/api/asset/diagram/[show]/[rev]/[key]/route.ts` changes in exactly one function: `findAsset` (route.ts, called from `authorizeDiagramRequest`). Today it accepts a request iff the reconstructed `canonicalPath(show, rev, key)` literally equals an entry's `snapshotPath`. It extends to ALSO accept the path iff **the entry's `snapshotPath` is a non-null string** (R2 F2: `snapshotPath: string | null` is a valid persisted shape, `lib/parser/types.ts:424`, and `resolveCurrentDiagrams` validates only the top-level revision id — a null-path entry with plausible-looking `variants` must be skipped BEFORE any dirname derivation, never reached by it) and the path equals `dirname(entry.snapshotPath) + "/" + v.key` for some valid `v` in that entry's `variants` (§4 guards applied — malformed rows skipped) — i.e. **the accept-set is exactly the manifest-listed original and variant paths for the live revision, over entries with non-null paths; everything else remains 410** via the existing `gone()` paths.

**A variant match RETURNS THE VARIANT'S OWN PATH (R1 F2):** `findAsset`'s returned `snapshotPath` — the value `authorizeDiagramRequest` turns into `storageObjectPath` and signs (route.ts:196-206) — is the matched VARIANT canonical path, never the original's. The signed Storage URL therefore addresses the variant object; serving original bytes under a variant URL is a spec violation, and the §9 route test asserts the exact signed object path (the assertion style already used at `tests/api/diagram-asset-route.test.ts:402`), not just status + MIME. Matched variants serve `mimeType: "image/webp"` (constant — variants are always webp); originals serve the entry's stored MIME as today, still gated by `isAllowedDiagramMime`.

Unchanged by construction, pinned by existing suites: auth chain order (admin → published gate → picker session), `CACHE_CONTROL` on every response shape, Range handling (`SINGLE_RANGE_RE` + 206/416 paths), `MAX_DIAGRAM_BYTES` bounded streaming, HEAD/GET parity (the HEAD handler reuses `authorizeDiagramRequest`, so variant auth applies to HEAD for free), benign vs debuggable 410 split (`GoneReason`).

## 6. Client

<!-- spec-lint: ignore — new file this spec's implementation creates -->
**Shared loader — `lib/images/diagramLoader.ts` (new).** `makeDiagramLoader({ showId, rev, key, variants, pinOriginal? })` returns an `ImageLoader`. **Variant-clamping is the ONLY width-responsive behavior (R2 F4):** when valid variants exist (§4 guards), pick the smallest with `variant.width >= width`, else the LARGEST variant — never fall through to the original on width. R2 probe evidence for why: with the thumbnail `sizes` string, Next's device-width candidates include 1080w-3840w, so an "above-ladder → original" rule would ship original bytes to large/high-DPR viewports — the exact waste this spec exists to kill, and a direct contradiction of AC-2. The original URL `/api/asset/diagram/<showId>/<rev>/<key>` is returned in exactly two cases: no valid variants exist (old manifests, GIFs, generation failures), or `pinOriginal: true` (the active lightbox slide, which needs full resolution for zoom and ignores `width` entirely). Quality param ignored (encoding fixed at ingest). Pure function, unit-tested. `next/image` calls the loader once per srcset candidate; snapping collapses candidates to at most `|variants| + 1` distinct URLs, which is correct srcset behavior (duplicate URLs with different descriptors are legal; the browser picks by descriptor).

**`GalleryItem`** (`components/diagrams/Gallery.tsx`) gains `variants: Array<{width; key}>`, `blurDataURL?: string`, `intrinsicWidth?: number`, `intrinsicHeight?: number` — populated by `components/crew/DiagramsBlock.tsx` from the manifest entries it already maps (it already derives `key` via `diagramAssetKeyFromPath`, `lib/data/diagrams.ts`). Variant keys pass through as manifest data; the client never constructs variant names.

**Gallery thumbnails.** `<img>` → `<Image loader={...} fill sizes="(min-width: 640px) 25vw, 33vw" className="object-cover" ...>`. The grid cell `li` is already `aspect-square overflow-hidden` (Gallery.tsx) — `fill` requires a positioned ancestor, so the `li` (or the button inside it) gains `relative`. **Dimensional invariant:** image box === grid cell box; guaranteed by `fill` (absolute inset-0) inside the `relative aspect-square` cell. `placeholder="blur" blurDataURL={...}` only when `blurDataURL` present. `loading` stays lazy (next/image default); no `priority` anywhere — the gallery is below the fold in `VenueSection` (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, VenueSection render site).

**Lightbox** (`components/diagrams/GalleryLightbox.tsx`). Active slide: original-URL tier via `pinOriginal: true` (zoom needs full resolution). **AMENDED by `docs/superpowers/specs/2026-08-10-diagram-viewing-polish.md` §4.1 (ratified 2026-08-10):** the active slide passes `pinOriginal` only AFTER that slide shows zoom intent, and opens on the clamped tier like an inactive slide; the loader's `pinOriginal` semantics are unchanged, only WHEN the lightbox passes it. Read every active-slide claim in this section, and the inactive-to-active row in the transition inventory below, as conditional on that slide's `wantsOriginal`. Inactive slides: the standard clamping loader with `sizes="100vw"` — clamping (R1 F3, folded into the single loader behavior above after R2 F4) guarantees they select the largest variant (1024 on a full ladder) and never the original; only variant-less entries serve the original. R1 probe evidence: with `sizes="100vw"` and an above-max→original rule, Next's device-width candidates (`deviceSizes` up to 3840 per Next's default image config — upstream constant, probed live in R1) produce `original@1080w, original@1200w, …`, so a 360-430 CSS-px 3× phone would have selected the ORIGINAL — violating the §1.1 inactive-tier contract. **Both lightbox branches carry `placeholder="blur"` when `blurDataURL` is present (R1 F6)** — the §1 goal promises blur on both components, active and inactive slides alike. When intrinsic dims present, render with `width`/`height` (correct aspect reservation); else `fill` + `object-contain`, with a positioned-ancestor guarantee PER BRANCH (R1 F5, corrected R2 F3, re-corrected R3 F2): the slide `figure` carries `px-4` (`components/diagrams/GalleryLightbox.tsx:488`), and absolute `inset-0` resolves against a positioned ancestor's PADDING box — so putting `relative` on the padded figure would make the inactive image span the 32px horizontal padding while the active image fills the `TransformComponent` wrapper inside the figure's flex CONTENT area (`components/diagrams/GalleryLightbox.tsx:629`): a silent 32px size jump between tiers, potentially under the navigation chrome. Therefore: **inactive** no-dims `fill` images (today direct children of the figure, `components/diagrams/GalleryLightbox.tsx:691`) are wrapped in a NEW dedicated `relative size-full` inner container occupying the figure's content area — structurally parallel to where `TransformComponent` sits in the active branch — and the invariant is image box === that inner wrapper box === the figure's CONTENT box; **active** `fill` images keep `TransformComponent`'s wrapper (already `position: relative`) as their containing block. The two branches' boxes now agree by construction (both are the content-area box). Both branches appear as separate Dimensional Invariants rows and both get real-browser geometry assertions (§9) whose oracle compares the image rect to the INNER wrapper / TransformComponent wrapper rect respectively — never to the figure's outer rect, which would re-encode the padding-box error the assertion exists to catch. The existing zoom/pan and Embla integration contracts are untouched — the migration swaps the element, not the gesture layer.

**Failure semantics preserved.** `next/image` `onError` fires for 4xx/5xx like `<img>` — both components keep their existing handlers (the `failedKeys`/`setFailedKeys` sets in BOTH components: Gallery.tsx, and GalleryLightbox.tsx:185 with its two error branches at :680/:708 — R1 F11) driving the same unavailable-placeholder branches (AC-7.7, master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3889`). Both `eslint-disable @next/next/no-img-element` blocks and their revert-rationale comments are deleted.

### Dimensional Invariants

| Parent | Child | Relationship | Guarantee |
|---|---|---|---|
| grid cell `li` (`aspect-square overflow-hidden`, Gallery.tsx) | thumbnail `Image` | image box === cell box (both axes) | `fill` (absolute `inset-0`) inside the cell's positioned ancestor — the `li`/button gains `relative` |
| NEW inner `relative size-full` wrapper in the figure's content area (R3 F2 — NOT `relative` on the `px-4` figure itself: `inset-0` resolves against the padding box, a 32px branch mismatch) | INACTIVE slide `Image` (no-dims fallback branch; today a direct child of the figure, `components/diagrams/GalleryLightbox.tsx:691`) | image box === inner wrapper box === figure CONTENT box, letterboxed content | inner wrapper `relative size-full` + `fill` + `object-contain`; without any positioned slide ancestor, `fill` would resolve against the outer lightbox viewport (`components/diagrams/GalleryLightbox.tsx:432`) |
| `TransformComponent` wrapper (already `position: relative`; `components/diagrams/GalleryLightbox.tsx:629`) | ACTIVE slide `Image` (no-dims fallback branch) — R2 F3: the wrapper, NOT the figure, is the nearer containing block; wrapper box ≠ figure box (figure horizontal padding, `components/diagrams/GalleryLightbox.tsx:488`) | image box === TransformComponent wrapper box | wrapper's existing `relative` + `fill` + `object-contain` |
| lightbox slide `figure` | slide `Image` (dims branch, either tier) | image scales within box preserving manifest aspect | `width`/`height` props + existing max-h/max-w constraints |

Verified with real-browser `getBoundingClientRect` assertions (§9) covering a thumbnail cell AND BOTH lightbox no-dims branches (active and inactive — R2 F3) — jsdom does not compute `fill` geometry.

### Transition Inventory

Per-item visual states, both components (R2 F8 — full enumeration): **blur** (placeholder showing), **empty** (no blur available, image not yet loaded), **loaded**, **failed** (runtime `onError`), **unavailable** (manifest `available: false` / null path). Lightbox items additionally carry a **tier** axis: inactive (clamped variant) vs active (`pinOriginal`).

All N·(N-1)/2 = 10 state pairs, each component:

| Pair | Thumbnail treatment | Lightbox treatment |
|---|---|---|
| blur → loaded | next/image built-in swap — instant | same, both tiers |
| blur → failed | instant swap to placeholder slot (`failedKeys`) | instant swap to unavailable branch (`setFailedKeys`, GalleryLightbox.tsx:680/:708) |
| blur → empty | impossible — blur presence is per-item manifest data, fixed for the render | impossible — same reason |
| empty → loaded | instant paint (current behavior) | same, both tiers |
| empty → failed | instant swap to placeholder slot | instant swap to unavailable branch |
| empty → blur | impossible (as blur → empty) | impossible |
| loaded → failed | impossible — `onError` fires during load, never after successful paint of the SAME src; a TIER SWAP creates a new load cycle (compound row below) | lightbox: possible via tier swap only — see compound rows |
| loaded → blur / empty | impossible — no reverse transitions; item identity is stable per render | impossible except via unmount/remount (Embla keeps slides mounted) |
| failed → any | terminal per item: `failedKeys` is per-item id and never cleared this session — a failed item renders the placeholder in BOTH tiers (tier swap does not retry) | same — declared, not incidental |
| unavailable → any | never transitions; static placeholder (existing branch) | same |

Compound transitions:

| Compound | Treatment |
|---|---|
| lightbox opens while a thumbnail is still in blur/empty | independent components, no shared state; lightbox loads its own tier |
| slide inactive → active (Embla) while inactive tier still loading | active render swaps to the `pinOriginal` URL — a NEW load cycle; blur (when present) covers the gap, else empty-then-image |
| slide active → inactive (swipe away) | src returns to the clamped variant URL — browser-cached from the inactive render, instant; no custom animation |
| tier swap on a FAILED item | no retry: the item stays in the unavailable branch in both directions (failure is per-item, not per-tier — declared) |
| tier swap after active-tier load, back and forth | both URLs browser-cached after first load of each; instant src swaps, no animation |

## 7. Rollout

Ship-and-forget. New/edited shows get variants at their next snapshot (new `snapshot_revision_id` → new prefix → new manifest). Existing published shows keep exactly today's behavior — original bytes, no blur — indefinitely, until Drive edits re-snapshot them. Ratified: no backfill (§1.1).

## 8. Documented limits

1. **Old snapshots stay unoptimized until their next Drive edit** (§1.1 no-backfill). Un-limit trigger: operator feedback that a long-lived static show needs optimization → a re-snapshot admin action is the fix, filed then.
2. **GIFs serve original bytes at every tier** (animation preservation, §3). Blur + dims still generated.
3. **Admin wizard diagram `<img>` sites keep the old pattern** — `BL-ADMIN-DIAGRAM-NEXT-IMAGE`, exception (c), §1.1.
4. **Variant-generation failure is telemetry-only** (`DIAGRAM_VARIANT_GENERATION_FAILED` log code, §3) — no admin card. Un-limit trigger: telemetry shows a recurring corpus-wide failure class.
5. **No CDN / shared-cache layer.** Every image request transits the auth route per user. This is the shipped privacy contract, unchanged; variant bytes just make each transit small.

## 9. Testing

<!-- spec-lint: ignore — new test file this spec's implementation creates -->
- **Ingest unit** (`tests/sync/diagramVariants.test.ts`, new) — PURE-function suite only (R2 F1: no log assertions here; the function does not log, and the suite asserts exactly that — zero logger calls): width ladder from fixture-derived intrinsic sizes (no upscale — 400px fixture yields exactly [256]); GIF short-circuit; per-asset failure result (corrupt fixture → `variants: []`, null blur/dims, non-null `failure` with `reason: "sharp_error"`). **EXIF row (R2 F5):** an orientation-6 JPEG fixture (generated in-test, `withMetadata({ orientation: 6 })`) — recorded intrinsic dims AND each variant's DECODED output dims are post-rotation (portrait); the assertion decodes the OUTPUT bytes, never trusts input `metadata().width/height`, which sharp reports orientation-unaware even with `.rotate()` chained (R2 probe). **Blur-bound rows (R2 F6):** extreme-aspect fixture (1×1000) → decoded blur dims BOTH ≤ 16; the 2048-char belt is exercised (belt check unit-testable in isolation) → field omitted + `failure.reason: "blur_oversize"`; the happy-path blur remains a decodable `data:image/webp;base64,` URL. Anti-tautology: expected variant sets derived from fixture dimensions, never hardcoded to match implementation output.
- **Producer + hop suites (R2 F1, expanded R3 F1):** `tests/sync/snapshotAssets.test.ts` owns failure isolation (corrupt sibling → its entry field-less, siblings unaffected, `snapshot_status` unchanged) and asserts `SnapshotAssetsResult.variantFailures` is populated — the PRODUCER row only. Each §3 hop-census surface then gets its own named row: `Phase2Result` forwards the rows (phase2 suite); `processOneFile`'s post-commit tail emits them (cron-sync suite); `applyStaged`'s post-commit reconcile emits them and a rolled-back Apply emits nothing (applyStaged suite); the pending-ingestion retry route's bypass sink emits (retry-route suite); `runManualStageForFirstSeen` returns them and its caller emits (first-seen suite); `assetRecovery`'s outcome sink emits (recovery suite). A census surface without a row is a plan defect.
- **Structural census:** both §3 call sites invoke the stage — a registry-style test walking the two upload paths.
- **Promote** (extend `tests/sync/promoteSnapshot.test.ts`) — every repaired surface pinned by name (R2 F7): a variant-bearing pending manifest promotes cleanly (expected count includes variants — R1 F1); a missing variant object still yields `manifest_mismatch`; pagination is asserted SEPARATELY for (i) `defaultStorage.list` with a >100-object listing, (ii) `removePrefix` with a >100-object prefix (all pages removed), and (iii) the rollback-repair path over a >100-object canonical listing — three named fixtures, not one generic adapter row.
- **Route** (extend the existing diagram-route suite): manifest-listed variant key → 200 webp with `CACHE_CONTROL` AND the signed request addressed the exact variant Storage path (R1 F2, assertion style of `tests/api/diagram-asset-route.test.ts:402`); unlisted-but-plausible variant key (`@2048.webp`) → 410; variant key under a stale rev → 410; variant-shaped key against an entry with malformed/absent `variants` → 410 without throwing (R1 F7); **entry with `snapshotPath: null` plus plausible `variants` → 410 without throwing (R2 F2)**; HEAD parity on a variant key (reuses `authorizeDiagramRequest`, asserted not assumed).
- **Loader unit:** snapping (exact, between-tiers); above-ladder → LARGEST variant (clamp — R2 F4); `pinOriginal` → original at every width; no/invalid variants → original; malformed rows filtered per §4.
- **Component:** Gallery renders `next/image` with blur when present and without when absent; `onError` → placeholder branch (both components); lightbox dims vs `fill` fallback branches; lightbox blur on BOTH tiers when present (R1 F6); active slide `pinOriginal` tier vs inactive clamped tier (R1 F3).
- **Real-browser layout assertion** (per writing-plans layout-dimensions rule): thumbnail image box === its `aspect-square` cell; lightbox INACTIVE no-dims image box === its NEW inner `relative size-full` wrapper box (equivalently the figure's CONTENT box — the oracle reads the inner wrapper rect, never the figure's outer rect, R3 F2); lightbox ACTIVE no-dims image box === its `TransformComponent` wrapper box (R2 F3 — both branches, different containing blocks); all via `getBoundingClientRect` within 0.5px — jsdom cannot verify `fill` geometry.
- **Impeccable dual gate** (invariant 8): `/impeccable critique` + `/impeccable audit` on the diff — `components/` surface. Closeout carries the `impeccable-gate:` marker line.
- **Invariant 10:** no new mutation surface (no new route/action; the variant stage runs inside already-instrumented sync paths) — the filesystem-walking meta-test stays green with no registry change.

## 10. Acceptance criteria

- AC-1: A snapshot of a fixture show with a 2000×1500 png yields storage objects `<key>@256.webp`, `<key>@512.webp`, `<key>@1024.webp` beside the original under the same revision prefix, and manifest fields per §4.
- AC-2: Crew gallery thumbnail requests on a variant-bearing show fetch variant URLs (not the original), authenticated by the picker cookie, with response `Cache-Control: private, max-age=0, must-revalidate`.
- AC-3: No request from Gallery/Lightbox ever targets `/_next/image` (assertable in the browser test's network log).
- AC-4: A show with a pre-migration manifest renders identically to today (original URLs, no blur, no errors).
- AC-5: Revoking a crew member's picker session 401s variant URLs exactly as original URLs (same `validatePickerAssetSession` path).
- AC-6: `pnpm lint` passes with zero `@next/next/no-img-element` disables in `components/diagrams/`.
- AC-7 (R1 F10): the asset-recovery path produces the same variant objects and manifest fields for a recovered entry as the snapshot path does for a fresh one.
- AC-8 (R1 F10): a variant-bearing snapshot PROMOTES — expected-count integrity passes with variants present, still fails (`manifest_mismatch`) when any expected object is missing, and listings above 100 objects are fully enumerated.
- AC-9 (R1 F10): no-upscale (a 400px original yields only the 256 tier; a 200px original yields none), GIF variant skip, and per-asset failure isolation (corrupt sibling degrades alone, `snapshot_status` unchanged, caller-emitted `DIAGRAM_VARIANT_GENERATION_FAILED`) all hold in the ingest unit suite.
- AC-10 (R1 F10): unlisted variant keys, stale-rev variant keys, and malformed-`variants` entries all 410 without a server throw, and HEAD returns GET-identical status/headers for variant keys.
- AC-11 (R1 F10, revised R2 F4): while valid variants exist the loader NEVER returns the original at any requested width (clamps to the largest tier above the ladder); `pinOriginal` returns the original at every width; no/invalid variants degrade to the original URL.
- AC-12 (R1 F10, revised R2 F3): lightbox active slide fetches the original tier, inactive slides fetch the clamped variant tier, both show blur when present, `onError` lands in the unavailable branch, and BOTH no-dims `fill` branches measure equal to their containing blocks in a real browser (inactive → the inner `relative size-full` wrapper in the figure's content area; active → the `TransformComponent` wrapper — R3 F2).
