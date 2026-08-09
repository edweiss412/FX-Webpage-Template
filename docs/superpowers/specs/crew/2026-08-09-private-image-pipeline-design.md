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

**Telemetry ownership (R1 F8):** `generateDiagramVariants` itself never logs — it has no `showId` and its input contract stays byte-local. The `failure` discriminator is how CALLERS own the emit: both §3 wiring sites (which hold `showId` + `assetKey`) emit `log.warn("diagram variant generation failed", { source: "sync.diagramVariants", code: "DIAGRAM_VARIANT_GENERATION_FAILED", showId, assetKey, reason, error: message })` when `failure` is non-null. Unit tests spy the log at the CALLER level (snapshotAssets / assetRecovery suites), and assert the pure function performs no logging.

- **Widths:** `[256, 512, 1024]` (single named constant, `DIAGRAM_VARIANT_WIDTHS`). A width is generated only when it is **strictly less than** the original's intrinsic width — never upscale. An original 400px wide gets only the 256 variant; a 200px original gets none (originals stay the only tier).
- **Encoding:** webp, `sharp().resize({ width }).webp({ quality: 75 })`. `image/webp` is already in the route's MIME allowlist (`ALLOWED_DIAGRAM_MIMES`, `lib/data/diagrams.ts`).
- **Variant key:** `<assetKey>@<width>.webp` (e.g. `embedded-abc123.png@512.webp`). The `@` separator cannot collide with original keys: original keys are `embedded-<objectId>.<ext>` / `folder-<driveFileId>.<ext>` (`lib/sync/snapshotAssets.ts`, `extForMime` call sites) and are never parsed back — the route matches manifest-listed paths literally (§5), so key naming is a storage convention, not a recognizer.
- **Blur:** `resize({ width: 16, height: 16, fit: "inside" })` — BOTH dimensions bounded ≤ 16 regardless of aspect ratio (R1 F9: a width-only resize of a 1×1000 png probe produced a 16×16000 webp, a 9,347-byte data URL, ~560 KB of inline JSONB at the 60-diagram corpus cap `MAX_DIAGRAM_COUNT`, `lib/sync/enrichWithDrivePins.ts:33`) — webp quality 40, base64 data URL. Belt on top of the bound: an encoded data URL longer than 2048 characters is dropped (field omitted) and signaled with the same telemetry code, reason `blur_oversize`. Within these bounds the expected payload is ≲ 500 bytes per asset.
- **Intrinsic dims:** recorded on the entry (the manifest carries no dimensions today — `PersistedEmbeddedImage` / `PersistedLinkedFolderItem`, `lib/parser/types.ts`, have none). Needed by the lightbox (§6). **EXIF orientation is normative, not deferred (R1 F4):** every pipeline (variants, blur, dims) applies `.rotate()` (sharp auto-orient from EXIF) before resize, and recorded dims are POST-rotation. R1 probe evidence: a 40×20 JPEG with EXIF orientation 6 yields a sideways 16×8 webp without `.rotate()` (silent wrong rendering vs the browser's oriented original) and a correct 16×32 with it.
- **GIF:** no variants, no upscaled tiers — animation would be lost (resize of animated GIF re-encode is out of scope). Blur IS generated (sharp reads the first frame by default) and dims are recorded. `mimeType === "image/gif"` short-circuits the variant loop only.
- **Failure posture (consequence bound):** any sharp throw — corrupt bytes, unsupported profile, OOM-guard — is caught **per asset**; the asset's result carries `variants: []`, null blur/dims, and a non-null `failure`, which the caller signals per the telemetry-ownership rule above. The snapshot itself NEVER fails or degrades status because of the variant stage — `snapshot_status` semantics (`statusFor`, `lib/sync/snapshotAssets.ts`) are untouched. Every input is handled correctly or signaled, never silently wrong: correct = variants; signaled = telemetry code + original-only rendering.

**Wiring — two call sites (companion-surface census, exhaustive):**

1. `lib/sync/snapshotAssets.ts` — after fingerprint/md5 verification passes and before `storage.upload` of the original, for both loops (`embeddedImages`, `linkedFolderItems`). Variant bytes upload to the same `tempPrefix` (`diagram-snapshots/shows/<showId>/_pending/<runUuid>/<variantKey>`). The manifest entry gains the §4 fields with `snapshotPath`-style canonical variant paths.

2. `lib/sync/assetRecovery.ts` — the recovery path uploads recovered originals directly (its `upload` dependency, and the staged-file apply path around its `uploadedPaths` handling); it runs the same stage and writes the same fields for recovered entries.

### Promotion changes — REQUIRED, not zero (R1 F1, P0)

`promoteSnapshot` verifies object counts against an expected count computed by SQL over the pending manifest — entries with non-null `snapshotPath` only (`lib/sync/promoteSnapshot.ts:235-276`: `expectedAssetCount`, compared to both the temp listing at `lib/sync/promoteSnapshot.ts:255` and the canonical listing at `lib/sync/promoteSnapshot.ts:276`) — so any variant object would trip `manifest_mismatch` before cutover. Two mandated edits:

- **(a) Expected-count SQL counts variants too:** each of the two `jsonb_array_elements` legs adds `jsonb_array_length(coalesce(e->'variants', '[]'::jsonb))` (resp. `l->'variants'`) summed over entries with non-null `snapshotPath`, so expected = originals + their listed variants. Integrity semantics preserved: a missing or extra object still mismatches, now against the variant-inclusive count.
- **(b) The storage adapter paginates:** `defaultStorage.list` (`lib/sync/promoteSnapshot.ts:83`) and the `removePrefix` internal listing (`lib/sync/promoteSnapshot.ts:101`) each issue ONE unpaginated SDK call, which defaults to 100 objects — while the live corpus cap of 60 diagrams (`MAX_DIAGRAM_COUNT`, `lib/sync/enrichWithDrivePins.ts:33`) × (1 original + up to 3 variants) = up to 240 objects. Both switch to the limit/offset page loop already used by `diagramGc`'s `listPaths` (`lib/sync/diagramGc.ts:101`). This also covers the rollback-repair path (`lib/sync/promoteSnapshot.ts:430`) and `removePrefix`'s pre-existing >100-object truncation, which the same adapter serves — swept via `grep -n "\.list(" lib/sync/*.ts` 2026-08-09: the only unpaginated storage listings are these promoteSnapshot adapter sites (diagramGc paginates; `applyStaged`/`runScheduledCronSync` hits are Drive revisions APIs, not storage).

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

`app/api/asset/diagram/[show]/[rev]/[key]/route.ts` changes in exactly one function: `findAsset` (route.ts, called from `authorizeDiagramRequest`). Today it accepts a request iff the reconstructed `canonicalPath(show, rev, key)` literally equals an entry's `snapshotPath`. It extends to ALSO accept the path iff it equals `dirname(entry.snapshotPath) + "/" + v.key` for some valid `v` in that entry's `variants` (§4 guards applied — malformed rows skipped) — i.e. **the accept-set is exactly the manifest-listed original and variant paths for the live revision; everything else remains 410** via the existing `gone()` paths.

**A variant match RETURNS THE VARIANT'S OWN PATH (R1 F2):** `findAsset`'s returned `snapshotPath` — the value `authorizeDiagramRequest` turns into `storageObjectPath` and signs (route.ts:196-206) — is the matched VARIANT canonical path, never the original's. The signed Storage URL therefore addresses the variant object; serving original bytes under a variant URL is a spec violation, and the §9 route test asserts the exact signed object path (the assertion style already used at `tests/api/diagram-asset-route.test.ts:402`), not just status + MIME. Matched variants serve `mimeType: "image/webp"` (constant — variants are always webp); originals serve the entry's stored MIME as today, still gated by `isAllowedDiagramMime`.

Unchanged by construction, pinned by existing suites: auth chain order (admin → published gate → picker session), `CACHE_CONTROL` on every response shape, Range handling (`SINGLE_RANGE_RE` + 206/416 paths), `MAX_DIAGRAM_BYTES` bounded streaming, HEAD/GET parity (the HEAD handler reuses `authorizeDiagramRequest`, so variant auth applies to HEAD for free), benign vs debuggable 410 split (`GoneReason`).

## 6. Client

<!-- spec-lint: ignore — new file this spec's implementation creates -->
**Shared loader — `lib/images/diagramLoader.ts` (new).** `makeDiagramLoader({ showId, rev, key, variants, clampToVariants? })` returns an `ImageLoader`: given `width`, pick the smallest valid listed variant with `variant.width >= width`. Above the ladder, DEFAULT mode returns the original URL `/api/asset/diagram/<showId>/<rev>/<key>` (thumbnails — `sizes` keeps candidates small); `clampToVariants: true` returns the LARGEST variant instead (inactive lightbox slides, R1 F3). No variants (or none valid per §4 guards) → original URL in both modes. Quality param ignored (encoding fixed at ingest). Pure function, unit-tested. `next/image` calls the loader once per srcset candidate; snapping collapses candidates to at most `|variants| + 1` distinct URLs, which is correct srcset behavior (duplicate URLs with different descriptors are legal; the browser picks by descriptor).

**`GalleryItem`** (`components/diagrams/Gallery.tsx`) gains `variants: Array<{width; key}>`, `blurDataURL?: string`, `intrinsicWidth?: number`, `intrinsicHeight?: number` — populated by `components/crew/DiagramsBlock.tsx` from the manifest entries it already maps (it already derives `key` via `diagramAssetKeyFromPath`, `lib/data/diagrams.ts`). Variant keys pass through as manifest data; the client never constructs variant names.

**Gallery thumbnails.** `<img>` → `<Image loader={...} fill sizes="(min-width: 640px) 25vw, 33vw" className="object-cover" ...>`. The grid cell `li` is already `aspect-square overflow-hidden` (Gallery.tsx) — `fill` requires a positioned ancestor, so the `li` (or the button inside it) gains `relative`. **Dimensional invariant:** image box === grid cell box; guaranteed by `fill` (absolute inset-0) inside the `relative aspect-square` cell. `placeholder="blur" blurDataURL={...}` only when `blurDataURL` present. `loading` stays lazy (next/image default); no `priority` anywhere — the gallery is below the fold in `VenueSection` (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, VenueSection render site).

**Lightbox** (`components/diagrams/GalleryLightbox.tsx`). Active slide: original-URL tier (loader pinned to original — zoom needs full resolution). **Inactive slides use a CLAMPED loader, not generic snapping (R1 F3):** when variants exist, requested widths above the largest tier clamp to the LARGEST listed variant (1024 for a full ladder) — never fall through to the original; only variant-less entries serve the original. R1 probe evidence: with `sizes="100vw"` and the generic above-max→original rule, Next's device-width candidates (`deviceSizes` up to 3840 per Next's default image config — upstream constant, probed live in R1) produce `original@1080w, original@1200w, …`, so a 360-430 CSS-px 3× phone selects the ORIGINAL — violating the §1.1 inactive-tier contract. The clamp is a loader mode (`makeDiagramLoader({ ..., clampToVariants: true })`), unit-tested. **Both lightbox branches carry `placeholder="blur"` when `blurDataURL` is present (R1 F6)** — the §1 goal promises blur on both components, active and inactive slides alike. When intrinsic dims present, render with `width`/`height` (correct aspect reservation); else `fill` + `object-contain` inside the slide box, whose positioned-ancestor guarantee is the Dimensional Invariants table's (R1 F5): the slide `figure` (currently non-positioned, `components/diagrams/GalleryLightbox.tsx:488`) gains `relative` so `fill` resolves against the SLIDE, not the outer lightbox viewport (`components/diagrams/GalleryLightbox.tsx:432`). The existing zoom/pan and Embla integration contracts are untouched — the migration swaps the element, not the gesture layer.

**Failure semantics preserved.** `next/image` `onError` fires for 4xx/5xx like `<img>` — both components keep their existing handlers (the `failedKeys`/`setFailedKeys` sets in BOTH components: Gallery.tsx, and GalleryLightbox.tsx:185 with its two error branches at :680/:708 — R1 F11) driving the same unavailable-placeholder branches (AC-7.7, master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3889`). Both `eslint-disable @next/next/no-img-element` blocks and their revert-rationale comments are deleted.

### Dimensional Invariants

| Parent | Child | Relationship | Guarantee |
|---|---|---|---|
| grid cell `li` (`aspect-square overflow-hidden`, Gallery.tsx) | thumbnail `Image` | image box === cell box (both axes) | `fill` (absolute `inset-0`) inside the cell's positioned ancestor — the `li`/button gains `relative` |
| lightbox slide `figure` (GalleryLightbox.tsx:488 — gains `relative`, R1 F5) | slide `Image` (no-dims fallback branch) | image box === slide box, letterboxed content | `relative` on the `figure` + `fill` + `object-contain` — without the `relative`, `fill` resolves against the outer lightbox viewport (`components/diagrams/GalleryLightbox.tsx:432`) |
| lightbox slide `figure` | slide `Image` (dims branch) | image scales within box preserving manifest aspect | `width`/`height` props + existing max-h/max-w constraints |

Verified with a real-browser `getBoundingClientRect` assertion (§9) covering BOTH a thumbnail cell AND a lightbox slide — jsdom does not compute `fill` geometry.

### Transition Inventory

Gallery thumbnail states: blur-placeholder → loaded → failed; unavailable-from-manifest. Lightbox slide states (R1 F6): blur-placeholder → loaded → failed, per slide, active and inactive.

| Pair | Treatment |
|---|---|
| thumbnail blur → loaded | next/image built-in placeholder swap — instant, no custom animation |
| thumbnail (blur or loaded) → failed | instant swap to placeholder slot (existing `failedKeys` branch — unchanged behavior) |
| thumbnail unavailable-from-manifest | never transitions; static placeholder slot (existing branch) |
| thumbnail no-blur (old manifest) → loaded | empty-then-image, instant — current behavior |
| lightbox slide blur → loaded | next/image built-in swap — instant; applies per slide, both tiers |
| lightbox slide (blur or loaded) → failed | instant swap to the existing unavailable branch (`setFailedKeys`, GalleryLightbox.tsx:680/:708) |
| lightbox inactive → active (Embla) | existing Embla slide transition, unchanged; tier swap (variant → original URL) rides the active-slide render — instant src change, no custom animation |

Compound: lightbox open while a thumbnail is still blurred — independent components, no shared transition state; the lightbox loads its own tier. Slide becomes active while its inactive tier is still loading — the active render swaps to the original-tier URL; blur placeholder (when present) covers the gap, else empty-then-image (current behavior).

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
- **Ingest unit** (`tests/sync/diagramVariants.test.ts`, new): width ladder from fixture-derived intrinsic sizes (no upscale — 400px fixture yields exactly [256]); GIF short-circuit; blur is a decodable `data:image/webp;base64,` URL; dims match fixture bytes; per-asset failure isolation (corrupt fixture → `variants: []` + null blur + the log code, sibling assets unaffected, `snapshot_status` unchanged). Anti-tautology: expected variant sets derived from fixture dimensions, never hardcoded to match implementation output.
- **Structural census:** both §3 call sites invoke the stage — a registry-style test walking the two upload paths.
- **Promote** (extend `tests/sync/promoteSnapshot.test.ts`): a variant-bearing pending manifest promotes cleanly (expected count includes variants — R1 F1); a missing variant object still yields `manifest_mismatch`; the paginated adapter is exercised with a >100-object listing fixture.
- **Route** (extend the existing diagram-route suite): manifest-listed variant key → 200 webp with `CACHE_CONTROL` AND the signed request addressed the exact variant Storage path (R1 F2, assertion style of `tests/api/diagram-asset-route.test.ts:402`); unlisted-but-plausible variant key (`@2048.webp`) → 410; variant key under a stale rev → 410; variant-shaped key against an entry with malformed/absent `variants` → 410 without throwing (R1 F7); HEAD parity on a variant key (reuses `authorizeDiagramRequest`, asserted not assumed).
- **Loader unit:** snapping (exact, between-tiers); default mode above-max → original; `clampToVariants` mode above-max → largest variant (R1 F3); empty/absent/malformed variants rows → original.
- **Component:** Gallery renders `next/image` with blur when present and without when absent; `onError` → placeholder branch (both components); lightbox dims vs `fill` fallback branches; lightbox blur on BOTH tiers when present (R1 F6); active slide original tier vs inactive clamped tier (R1 F3).
- **Real-browser layout assertion** (per writing-plans layout-dimensions rule): thumbnail image box equals its `aspect-square` cell AND lightbox slide image box equals its `relative` slide `figure` (no-dims branch), both via `getBoundingClientRect` within 0.5px (R1 F5) — jsdom cannot verify `fill` geometry.
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
- AC-11 (R1 F10): loader default mode falls back to the original above the ladder; clamp mode never leaves the ladder while variants exist; malformed rows degrade to the original URL.
- AC-12 (R1 F10): lightbox active slide fetches the original tier, inactive slides fetch the clamped variant tier, both show blur when present, `onError` lands in the unavailable branch, and the no-dims `fill` branch measures equal to its `relative` slide `figure` in a real browser.
