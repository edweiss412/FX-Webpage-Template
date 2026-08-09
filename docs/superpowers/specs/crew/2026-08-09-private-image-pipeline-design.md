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
  → promoteSnapshot moves the whole prefix (existing, unchanged)
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
};
```

- **Widths:** `[256, 512, 1024]` (single named constant, `DIAGRAM_VARIANT_WIDTHS`). A width is generated only when it is **strictly less than** the original's intrinsic width — never upscale. An original 400px wide gets only the 256 variant; a 200px original gets none (originals stay the only tier).
- **Encoding:** webp, `sharp().resize({ width }).webp({ quality: 75 })`. `image/webp` is already in the route's MIME allowlist (`ALLOWED_DIAGRAM_MIMES`, `lib/data/diagrams.ts`).
- **Variant key:** `<assetKey>@<width>.webp` (e.g. `embedded-abc123.png@512.webp`). The `@` separator cannot collide with original keys: original keys are `embedded-<objectId>.<ext>` / `folder-<driveFileId>.<ext>` (`lib/sync/snapshotAssets.ts`, `extForMime` call sites) and are never parsed back — the route matches manifest-listed paths literally (§5), so key naming is a storage convention, not a recognizer.
- **Blur:** resize to width 16, webp quality 40, base64 data URL. Expected ≲ 500 bytes each; it lives inline in the JSONB manifest.
- **Intrinsic dims:** from `sharp(bytes).metadata()`, recorded on the entry (the manifest carries no dimensions today — `PersistedEmbeddedImage` / `PersistedLinkedFolderItem`, `lib/parser/types.ts`, have none). Needed by the lightbox (§6). EXIF orientation: use `sharp(bytes, { autoOrient: false }).metadata()` raw values only if orientation handling proves moot for the corpus; otherwise apply `.rotate()` before resize and record post-rotation dims — plan task verifies against fixture bytes and picks one, recorded in the implementation.
- **GIF:** no variants, no upscaled tiers — animation would be lost (resize of animated GIF re-encode is out of scope). Blur IS generated (sharp reads the first frame by default) and dims are recorded. `mimeType === "image/gif"` short-circuits the variant loop only.
- **Failure posture (consequence bound):** any sharp throw — corrupt bytes, unsupported profile, OOM-guard — is caught **per asset**; the asset ships with `variants: []`, `blurDataURL: null`, null dims, and the stage emits `log.warn("diagram variant generation failed", { source: "sync.diagramVariants", code: "DIAGRAM_VARIANT_GENERATION_FAILED", showId, assetKey, error })`. The snapshot itself NEVER fails or degrades status because of the variant stage — `snapshot_status` semantics (`statusFor`, `lib/sync/snapshotAssets.ts`) are untouched. Every input is handled correctly or signaled, never silently wrong: correct = variants; signaled = telemetry code + original-only rendering.

**Wiring — two call sites (companion-surface census, exhaustive):**

1. `lib/sync/snapshotAssets.ts` — after fingerprint/md5 verification passes and before `storage.upload` of the original, for both loops (`embeddedImages`, `linkedFolderItems`). Variant bytes upload to the same `tempPrefix` (`diagram-snapshots/shows/<showId>/_pending/<runUuid>/<variantKey>`); `promoteSnapshot` lists the temp prefix and moves every object (`lib/sync/promoteSnapshot.ts`, `list`/`move`), so variants promote with zero promote changes. The manifest entry gains the §4 fields with `snapshotPath`-style canonical variant paths.
2. `lib/sync/assetRecovery.ts` — the recovery path uploads recovered originals directly (its `upload` dependency, and the staged-file apply path around its `uploadedPaths` handling); it runs the same stage and writes the same fields for recovered entries.

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
- **Guard conditions (every new field × degenerate value):** absent/`undefined` variants → loader returns original URL (§6); `variants: []` → same; a variants row with non-finite or ≤0 `width`, or empty `key` → the loader ignores that row (filtered on read); absent/empty `blurDataURL` → no `placeholder` prop (empty-then-image, current behavior); absent or non-finite/≤0 intrinsic dims → lightbox uses `fill` + contain fallback (§6). The client never throws on a malformed manifest row — malformed rows degrade to the absent-field path.
- `PendingDiagramsPayload` (`lib/sync/snapshotAssets.ts`) already carries `PersistedEmbeddedImage[]` / `PersistedLinkedFolderItem[]`, so the pending→current apply path propagates the fields with no shape change.

## 5. Route — variant authorization (accept-set)

`app/api/asset/diagram/[show]/[rev]/[key]/route.ts` changes in exactly one function: `findAsset` (route.ts, called from `authorizeDiagramRequest`). Today it accepts a request iff the reconstructed `canonicalPath(show, rev, key)` literally equals an entry's `snapshotPath`. It extends to ALSO accept the path iff it equals `dirname(entry.snapshotPath) + "/" + v.key` for some `v` in that entry's `variants` — i.e. **the accept-set is exactly the manifest-listed original and variant paths for the live revision; everything else remains 410** via the existing `gone()` paths. Matched variants serve `mimeType: "image/webp"` (constant — variants are always webp); originals serve the entry's stored MIME as today, still gated by `isAllowedDiagramMime`.

Unchanged by construction, pinned by existing suites: auth chain order (admin → published gate → picker session), `CACHE_CONTROL` on every response shape, Range handling (`SINGLE_RANGE_RE` + 206/416 paths), `MAX_DIAGRAM_BYTES` bounded streaming, HEAD/GET parity (the HEAD handler reuses `authorizeDiagramRequest`, so variant auth applies to HEAD for free), benign vs debuggable 410 split (`GoneReason`).

## 6. Client

<!-- spec-lint: ignore — new file this spec's implementation creates -->
**Shared loader — `lib/images/diagramLoader.ts` (new).** `makeDiagramLoader({ showId, rev, key, variants })` returns an `ImageLoader`: given `width`, pick the smallest listed variant with `variant.width >= width`; if none (or no variants), return the original URL `/api/asset/diagram/<showId>/<rev>/<key>`. Quality param ignored (encoding fixed at ingest). Pure function, unit-tested. `next/image` calls the loader once per srcset candidate; snapping collapses candidates to at most `|variants| + 1` distinct URLs, which is correct srcset behavior (duplicate URLs with different descriptors are legal; the browser picks by descriptor).

**`GalleryItem`** (`components/diagrams/Gallery.tsx`) gains `variants: Array<{width; key}>`, `blurDataURL?: string`, `intrinsicWidth?: number`, `intrinsicHeight?: number` — populated by `components/crew/DiagramsBlock.tsx` from the manifest entries it already maps (it already derives `key` via `diagramAssetKeyFromPath`, `lib/data/diagrams.ts`). Variant keys pass through as manifest data; the client never constructs variant names.

**Gallery thumbnails.** `<img>` → `<Image loader={...} fill sizes="(min-width: 640px) 25vw, 33vw" className="object-cover" ...>`. The grid cell `li` is already `aspect-square overflow-hidden` (Gallery.tsx) — `fill` requires a positioned ancestor, so the `li` (or the button inside it) gains `relative`. **Dimensional invariant:** image box === grid cell box; guaranteed by `fill` (absolute inset-0) inside the `relative aspect-square` cell. `placeholder="blur" blurDataURL={...}` only when `blurDataURL` present. `loading` stays lazy (next/image default); no `priority` anywhere — the gallery is below the fold in `VenueSection` (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, VenueSection render site).

**Lightbox** (`components/diagrams/GalleryLightbox.tsx`). Active slide: original-URL tier (loader pinned to original — zoom needs full resolution); inactive slides: loader as normal with `sizes="100vw"` (selects the 1024 variant on phone widths). When intrinsic dims present, render with `width`/`height` (correct aspect reservation); else `fill` + `object-contain` inside the existing sized slide box. The existing zoom/pan and Embla integration contracts are untouched — the migration swaps the element, not the gesture layer.

**Failure semantics preserved.** `next/image` `onError` fires for 4xx/5xx like `<img>` — both components keep their existing handlers (`failedKeys` set in Gallery; `setFailed` in the lightbox) driving the same unavailable-placeholder branches (AC-7.7 contract). Both `eslint-disable @next/next/no-img-element` blocks and their revert-rationale comments are deleted.

### Dimensional Invariants

| Parent | Child | Relationship | Guarantee |
|---|---|---|---|
| grid cell `li` (`aspect-square overflow-hidden`, Gallery.tsx) | thumbnail `Image` | image box === cell box (both axes) | `fill` (absolute `inset-0`) inside the cell's positioned ancestor — the `li`/button gains `relative` |
| lightbox slide box (existing sized container, GalleryLightbox.tsx) | slide `Image` (no-dims fallback branch) | image box === slide box, letterboxed content | `fill` + `object-contain` |
| lightbox slide box | slide `Image` (dims branch) | image scales within box preserving manifest aspect | `width`/`height` props + existing max-h/max-w constraints |

Verified with a real-browser `getBoundingClientRect` assertion (§9) — jsdom does not compute `fill` geometry.

### Transition Inventory

Gallery thumbnail states: blur-placeholder → loaded → failed; unavailable-from-manifest.

| Pair | Treatment |
|---|---|
| blur → loaded | next/image built-in placeholder swap — instant, no custom animation |
| (blur or loaded) → failed | instant swap to placeholder slot (existing `failedKeys` branch — unchanged behavior) |
| unavailable-from-manifest | never transitions; static placeholder slot (existing branch) |
| no-blur (old manifest) → loaded | empty-then-image, instant — current behavior |

Compound: lightbox open while a thumbnail is still blurred — independent components, no shared transition state; the lightbox loads its own tier.

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
- **Route** (extend the existing diagram-route suite): manifest-listed variant key → 200 webp with `CACHE_CONTROL`; unlisted-but-plausible variant key (`@2048.webp`) → 410; variant key under a stale rev → 410; HEAD parity on a variant key (reuses `authorizeDiagramRequest`, asserted not assumed).
- **Loader unit:** snapping (exact, between-tiers, above-max → original, empty/absent/malformed variants rows → original).
- **Component:** Gallery renders `next/image` with blur when present and without when absent; `onError` → placeholder branch (both components); lightbox dims vs `fill` fallback branches.
- **Real-browser layout assertion** (per writing-plans layout-dimensions rule): thumbnail image box equals its `aspect-square` cell via `getBoundingClientRect` within 0.5px — jsdom cannot verify `fill` geometry.
- **Impeccable dual gate** (invariant 8): `/impeccable critique` + `/impeccable audit` on the diff — `components/` surface. Closeout carries the `impeccable-gate:` marker line.
- **Invariant 10:** no new mutation surface (no new route/action; the variant stage runs inside already-instrumented sync paths) — the filesystem-walking meta-test stays green with no registry change.

## 10. Acceptance criteria

- AC-1: A snapshot of a fixture show with a 2000×1500 png yields storage objects `<key>@256.webp`, `<key>@512.webp`, `<key>@1024.webp` beside the original under the same revision prefix, and manifest fields per §4.
- AC-2: Crew gallery thumbnail requests on a variant-bearing show fetch variant URLs (not the original), authenticated by the picker cookie, with response `Cache-Control: private, max-age=0, must-revalidate`.
- AC-3: No request from Gallery/Lightbox ever targets `/_next/image` (assertable in the browser test's network log).
- AC-4: A show with a pre-migration manifest renders identically to today (original URLs, no blur, no errors).
- AC-5: Revoking a crew member's picker session 401s variant URLs exactly as original URLs (same `validatePickerAssetSession` path).
- AC-6: `pnpm lint` passes with zero `@next/next/no-img-element` disables in `components/diagrams/`.
