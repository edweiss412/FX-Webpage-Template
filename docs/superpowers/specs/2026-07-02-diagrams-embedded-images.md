# DIAGRAMS-tab embedded floor-plan images — surfacing spec

**Date:** 2026-07-02
**Status:** Draft (autonomous ship — user approved full pipeline)
**Slug:** `diagrams-embedded-images`
**Branch / worktree:** `feat/diagrams-embedded-images` / `.claude/worktrees/diagrams-embedded` (off `origin/main` @ `724478b3`)

---

## 1. Goal

Surface the floating floor-plan / venue images that live embedded on a show sheet's **DIAGRAMS** tab onto the crew Venue page. Today these images are captured by the sheet's owner but are **never displayed** — the discovery step that would list them returns nothing, so the whole downstream capture→store→serve→render pipeline (which already exists and works for linked-folder items) receives an empty embedded-image list on every sync.

One sentence: **make `diagrams.embeddedImages` actually populated from the XLSX bytes the sync already fetches, so the existing gallery renders them.**

---

## 2. Root cause (why embedded images never appear)

The crew diagram pipeline has four stages that already work end-to-end for **linked-folder** items:

1. **Discovery** — enumerate the DIAGRAMS-tab image objects (`enrichWithDrivePins` → `extractEmbeddedImages`).
2. **Capture** — download the approved bytes and upload to private Storage at Apply (`snapshotAssets`).
3. **Serve** — a signed-URL proxy over the `diagram-snapshots` bucket (`app/api/asset/diagram/[show]/[rev]/[key]/route.ts`).
4. **Render** — the crew gallery (`components/crew/DiagramsBlock.tsx`).

Stages 2–4 are fully built and exercised. **Stage 1 is the gap.** The only production `DriveClient.listSpreadsheetSheets` implementation hard-codes an empty embedded-object list:

- `lib/sync/runScheduledCronSync.ts:1765` — Sheets fields mask is `"sheets(properties(sheetId,title))"` (titles only).
- `lib/sync/runScheduledCronSync.ts:1775` — `embeddedObjects: []` is hard-coded for every sheet.

This is deliberate: Google Sheets API v4 (`spreadsheets.get`) cannot enumerate floating drawings, and a prior attempt to request a `drawings(...)` field mask produced a production 400 (filed as `BL-DIAGRAMS-EMBEDDED-SOURCE`). The current source is even pinned against regressing to it: `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:70-71` asserts `runScheduledCronSync.ts` source `.not.toMatch(/\bdrawings\b/)`.

**But the image bytes are already in hand.** Every real sync pass exports the sheet as XLSX (`fetchSheetMarkdownAndBytesAtRevision`, `lib/drive/fetch.ts:452-498`) to synthesize markdown and to run `extractSourceAnchors`. That XLSX (OOXML `.zip`) contains the embedded images at `xl/media/*`, attributable to a specific tab by walking the OOXML relationship graph. **We surface them from the XLSX bytes we already fetched — no new Sheets/Drive round-trip at extract, no `drawings` field mask.**

Confirmed by a live probe of all 7 real test shows (Drive folder `fxav-test-shows` = `1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C`): every show has a DIAGRAMS tab with 1–3 embedded images, 100% PNG/JPEG (zero EMF/WMF/SVG). Two shows' images were visually verified to be real floor plans.

---

## 3. Scope

### In scope (v1)

- New pure module `lib/drive/embeddedObjects.ts` — extract DIAGRAMS-tab image objects + their bytes from XLSX bytes via OOXML relationship walk.
- Wire XLSX bytes into `EnrichContext` and use them in `extractEmbeddedImages` when present.
- Byte re-production at Apply and at asset-recovery via a **non-pinned current XLSX re-export**, matched by content hash.
- The three real write-through extract paths (cron, onboarding, pending-ingestion retry) pass XLSX bytes.
- Add `fflate` as a direct dependency (ZIP reader; SheetJS does not expose `xl/media`).

### Out of scope (v1) — explicit non-goals

- **No UI change.** The render pipeline already consumes `embeddedImages` by `snapshotPath` / `objectId` / `mimeType` (`DiagramsBlock.tsx:67-77`); `shouldHideDiagrams` (`lib/visibility/emptyState.ts:105-110`) un-hides the moment `embeddedImages` is non-empty. No file under `app/` (except `app/api/**`, which is exempt) or `components/` is touched. **Invariant-8 impeccable dual-gate does not apply** (no UI surface in the diff). This is a data-plumbing change end to end.
- **No DB / schema change.** `shows.diagrams` JSONB already carries the `embeddedImages` shape (`PersistedEmbeddedImage`); we only populate it. No migration, no `schema-manifest` regen, no `validation-schema-parity` interaction.
- **No new §12.4 error code.** All failure modes reuse existing codes (`DIAGRAMS_EMBEDDED_NONE_FOUND`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE`, `EMBEDDED_ASSET_DRIFTED`).
- **Non-raster embedded media (EMF/WMF/SVG/BMP/TIFF) is not surfaced.** The existing render/serve allowlist (`ALLOWED_DIAGRAM_MIMES` = png/jpeg/jpg/webp/gif, `lib/data/diagrams.ts:30-36`) already excludes them (SVG = active content; EMF/WMF = non-web). We drop them at extract rather than capturing bytes that could never render. Survey shows zero such media in the real corpus. Server-side rasterization of vector floor plans is a possible future extension, not v1.
- **`#gid=` hyperlink following.** Some sheets link a DIAGRAMS cell to an external Drive folder or to another tab via `#gid=`; those are handled by the existing linked-folder path (`lib/parser/diagrams.ts`) and are unchanged. We surface only images **embedded on the DIAGRAMS tab itself**.
- **Legacy Sheets-API `contentUrl` path stays.** Callers with no XLSX bytes (dev panel with `mockDriveClient`, older tests) keep the existing `contentUrl`-based extraction unchanged.

---

## 4. Architecture & data flow

```
EXTRACT (Phase-1 enrich, xlsxBytes in-memory)
  runScheduledCronSync / runOnboardingScan / retry route
    → enrichWithDrivePins(parsed, driveClient, { …, xlsxBytes })
      → extractEmbeddedImages:
          if ctx.xlsxBytes present:
            { objectsByTab, bytesByObjectId } = extractEmbeddedObjects(ctx.xlsxBytes)   ← NEW module
            objects = objectsByTab for the DIAGRAMS tab (case-insensitive title match)
            for each object:
              bytes = bytesByObjectId.get(object.objectId)          ← in-memory, extract-time only
              embeddedFingerprint = sha256Base64Url(bytes)          ← the immutable content join key
              contentUrl = null, mediaPartName = object.mediaPartName
          else (legacy): existing diagramsSheet.embeddedObjects + getEmbeddedImageBytes(contentUrl)
    → EmbeddedImageStub[] persisted into ParseResult.diagrams.embeddedImages

APPLY (snapshotAssets, in-memory bytes GONE on the staged path)
  for each embedded entry with embeddedFingerprint & disposition!='restage_required':
    bytes = drive.fetchEmbeddedImageBytes(entry)                    ← port
      port, when entry.contentUrl==null && entry.mediaPartName set:
        re-export CURRENT xlsx for the show (memoized once per apply pass)
        find media whose sha256Base64Url == entry.embeddedFingerprint  (mediaPartName = fast-path hint)
        return those bytes  (any Drive/zip fault → null, fail-soft)
    if bytes && assetSha256(bytes)===entry.embeddedFingerprint: upload → snapshotPath   (snapshotAssets.ts:144)
    else: EMBEDDED_ASSET_DRIFTED warning / partial_failure

RECOVERY (assetRecovery, later, from persisted rows) — same port branch, driveFileId from previewShow row

SERVE + RENDER — unchanged; gallery renders once snapshotPath is populated
```

**Key design principle (resolves the two-agent design tension):** in-memory XLSX bytes are used **only at extract, only to compute the fingerprint**. They are never carried across the Apply boundary (which is a separate invocation on the staged path — the whole `ParseResult` is persisted to `pending_syncs.parse_result` JSONB and read back later, so any in-memory `Uint8Array` is gone). At Apply/recovery bytes are **re-produced by re-export**, exactly mirroring how linked-folder items are re-fetched from Drive at Apply (`snapshotFetchLinkedRevisionBytesTimed`, `lib/sync/defaultSnapshotAssetsForApply.ts:68-103`). One uniform mechanism serves both the same-pass and staged paths.

---

## 5. New module — `lib/drive/embeddedObjects.ts`

### 5.1 Signature

```ts
export type ExtractedEmbeddedObjects = {
  /** Every worksheet title in workbook order (incl. tabs with no images). */
  allTabTitles: string[];
  /** Map keyed by the exact OOXML sheet title → its embedded image objects. */
  objectsByTab: Map<string, SpreadsheetEmbeddedObject[]>;
  /** Map objectId → raw image bytes, for extract-time fingerprinting only. */
  bytesByObjectId: Map<string, Uint8Array>;
};

export function extractEmbeddedObjects(xlsx: ArrayBuffer): ExtractedEmbeddedObjects;
```

- Pure + synchronous. No Drive, no Supabase, no Storage. (This keeps it off the `_storageWriteSurfaceContract` allowlist and the `no-inline-email-normalization` surfaces.)
- Uses `fflate.unzipSync(new Uint8Array(xlsx))` to read ZIP entries.
- **Tab-agnostic + self-describing:** returns `allTabTitles` (every `<sheet name=…>` in `xl/workbook.xml`, so the caller can resolve the DIAGRAMS tab and distinguish "tab missing" from "tab present, no images" **without any Sheets-API call**) plus `objectsByTab` keyed by title. This keeps the module free of DIAGRAMS-specific policy and independently testable, and — critically — makes the extract path independent of `DriveClient.listSpreadsheetSheets`, which the onboarding client does not implement (`runOnboardingScan.ts:48`).

### 5.2 OOXML relationship walk (per tab)

For each worksheet, resolve its images by walking:

1. `xl/workbook.xml` → `<sheet name="…" r:id="rIdN"/>` (title → workbook relationship id).
2. `xl/_rels/workbook.xml.rels` → `rIdN` → `worksheets/sheetM.xml` (the worksheet part).
3. `xl/worksheets/sheetM.xml` → `<drawing r:id="rIdD"/>` (0 or 1 drawing per sheet; if absent, the sheet has no embedded objects).
4. `xl/worksheets/_rels/sheetM.xml.rels` → `rIdD` → `../drawings/drawingK.xml`.
5. `xl/drawings/_rels/drawingK.xml.rels` → each image relationship → `../media/imageX.<ext>`.
6. Bytes at `xl/media/imageX.<ext>` (the ZIP entry).

Attribution is **strictly per-tab via this graph** — this is what excludes INFO-tab logos and any other tab's images. Media is only associated with the DIAGRAMS tab if the DIAGRAMS worksheet's drawing references it.

Parsing approach: attribute-targeted regular expressions over the specific elements above (`<sheet …>`, `<Relationship …>`, `<drawing …>`). Acceptable because the input is **machine-generated by Google's XLSX exporter** (regular, stable markup), not arbitrary user XML, and extraction is best-effort (see 5.5). This mirrors the proven survey probe used to de-risk the corpus.

### 5.3 MIME derivation & raster filter

Media parts carry a file extension, not a MIME type. Map extension → canonical MIME:

| ext | mimeType |
|---|---|
| `png` | `image/png` |
| `jpg`, `jpeg` | `image/jpeg` |
| `gif` | `image/gif` |
| `webp` | `image/webp` |

Any other extension (`emf`, `wmf`, `svg`, `bmp`, `tiff`, …) → **not returned** (dropped). Only raster types in `ALLOWED_DIAGRAM_MIMES` are emitted, so we never capture bytes that the serve/render allowlist would reject.

### 5.4 `SpreadsheetEmbeddedObject` shape & `objectId` synthesis

Each returned object:

```ts
{
  objectId: string,          // synthesized stable id (see below)
  mimeType: string,          // canonical raster MIME from 5.3
  mediaPartName: string,     // e.g. "xl/media/image3.png" — Apply/recovery fast-path hint
  // alt: omitted (OOXML embedded images carry no alt text in Google exports)
}
```

**`objectId` derivation:** the content fingerprint is the only stable identity available (there is no Sheets object id on this path). Derive `objectId = "x-" + sha256Base64Url(bytes).slice(0, 24)` — deterministic, URL-safe (base64url has no `/` or `.`), stable across re-export (content-addressed). This makes the Storage asset key (`embedded-${objectId}.${ext}`, `snapshotAssets.ts:139`) content-addressed and idempotent. Two byte-identical images on the tab collapse to one key (harmless — same content).

`bytesByObjectId` is keyed by the same synthesized `objectId`.

### 5.5 Guard conditions

- `xlsx` is empty / not a ZIP / `unzipSync` throws → **return empty maps** (caught by the caller's best-effort wrapper; never throws to the sync).
- No `xl/workbook.xml`, or a worksheet with no `<drawing>` → that tab contributes no objects.
- A `<drawing>` relationship pointing at a missing media part → skip that object.
- A media part with an unmapped extension → skip (raster filter).
- Duplicate byte-identical images → same `objectId` (dedup), each still returned once per media relationship but collapsing on key.

---

## 6. Type changes

Three optional-field additions. All are `?:` optional and set via conditional spread (`...(x ? { x } : {})`) so `exactOptionalPropertyTypes` treats them as **absent** (not `undefined`) on the legacy path — existing `toEqual` fixtures that don't mention them stay valid.

1. `SpreadsheetEmbeddedObject` (`lib/sync/enrichWithDrivePins.ts:54-59`) — add `mediaPartName?: string`.
2. `EmbeddedImageStub` (`lib/parser/types.ts:248-262`) — add `mediaPartName?: string`. Comment: "Set only on the XLSX-media extraction path; the Apply/recovery byte re-fetch uses it as a fast-path hint, with `embeddedFingerprint` as the authoritative content join." Its mirror `PersistedEmbeddedImage` (`types.ts:317-319`) inherits it via `Omit`/`&`.
3. `EnrichContext` (`lib/sync/enrichWithDrivePins.ts:127-146`) — add `xlsxBytes?: ArrayBuffer`. Comment: "The already-fetched XLSX export bytes for this pass. When present, `extractEmbeddedImages` discovers DIAGRAMS-tab embedded images from the OOXML media parts instead of the (empty) Sheets-API embedded-object list."

`objectId` on `EmbeddedImageStub` stays `string`; its doc comment (`types.ts:250`, "Sheets API object id") is updated to note the XLSX-media path synthesizes a content-derived id.

---

## 7. Extract-time change — `extractEmbeddedImages` (`enrichWithDrivePins.ts:160-246`)

The current function has two hard dependencies on the Drive client — the early-return gate `if (!ctx.sheets && !driveClient.listSpreadsheetSheets) return []` (`:166`) and the revision fetch `driveClient.getSpreadsheetRevisionId?.(…)` (`:201`). **Neither is satisfiable on the onboarding path**, whose client implements only `getFile`/`listFolder` (`runOnboardingScan.ts:48,223`). So merely adding `xlsxBytes` is insufficient — the function must branch into a **fully self-sufficient XLSX path** that derives the tab, the objects, and the revision token from `ctx.xlsxBytes` + `ctx.fileMeta` alone, touching no Sheets-API method.

```ts
// Replaces the body from the :166 gate onward:
if (ctx.xlsxBytes) {
  // ---- self-sufficient XLSX path: no listSpreadsheetSheets, no getSpreadsheetRevisionId ----
  let extracted: ExtractedEmbeddedObjects = { allTabTitles: [], objectsByTab: new Map(), bytesByObjectId: new Map() };
  try {
    extracted = extractEmbeddedObjects(ctx.xlsxBytes);          // best-effort; malformed → empty
  } catch {
    /* treat as no embedded objects */
  }
  // DIAGRAMS tab resolved from OOXML titles, mirroring the live case-insensitive match (:170):
  const diagramsTitle = extracted.allTabTitles.find(
    (t) => t.localeCompare("diagrams", undefined, { sensitivity: "accent" }) === 0,
  );
  if (!diagramsTitle) {
    warnings.push(warning("DIAGRAMS_TAB_MISSING", "No DIAGRAMS tab was found in the spreadsheet."));
    return [];
  }
  const imageObjects = (extracted.objectsByTab.get(diagramsTitle) ?? []).filter(isImageLike);
  if (imageObjects.length === 0) {
    if (!parsed.diagrams.linkedFolder) warnings.push(warning("DIAGRAMS_EMBEDDED_NONE_FOUND", …));
    return [];
  }
  const keptObjects = imageObjects.slice(0, MAX_TOTAL_DIAGRAM_ITEMS);
  if (imageObjects.length > keptObjects.length) warnings.push(warning("DIAGRAMS_EMBEDDED_CAP_EXCEEDED", …));

  // Revision token from fileMeta (always present — DriveFileMeta.headRevisionId is required, :42),
  // NOT getSpreadsheetRevisionId. sheetsRevisionId is an approval/identity token only; it is NOT
  // used for the Apply re-export (§8.3), so its exact token space is immaterial.
  const sheetsRevisionId = ctx.fileMeta.headRevisionId;

  const embeddedImages: EmbeddedImageStub[] = [];
  for (const object of keptObjects) {
    const bytes = extracted.bytesByObjectId.get(object.objectId) ?? null;  // always present on this path
    embeddedImages.push({
      sheetTab: diagramsTitle,
      objectId: object.objectId,
      mimeType: object.mimeType,
      ...(object.alt ? { alt: object.alt } : {}),
      contentUrl: null,
      ...(object.mediaPartName ? { mediaPartName: object.mediaPartName } : {}),
      sheetsRevisionId,
      embeddedFingerprint: bytes ? sha256Base64Url(bytes) : null,          // non-null on this path
      recovery_disposition: bytes ? "normal" : "restage_required",         // "normal" on this path
      snapshotPath: null,
    });
  }
  return embeddedImages;
}
// ---- legacy Sheets-API path (UNCHANGED: existing :166 gate + :168-245 body) ----
if (!ctx.sheets && !driveClient.listSpreadsheetSheets) return [];
// …existing listSpreadsheetSheets → diagramsSheet → getSpreadsheetRevisionId → contentUrl bytes …
```

- The legacy branch is byte-for-byte the current `:166-245` logic (Sheets list, `getSpreadsheetRevisionId`, `getEmbeddedImageBytes(contentUrl)`), preserving all existing tests. It runs only when `ctx.xlsxBytes` is absent (dev panel / mocks).
- On the XLSX path, `bytes` is always present for a returned object (it exists precisely because its bytes were in `xl/media`), so `embeddedFingerprint` is non-null and `recovery_disposition === "normal"`. The null-fingerprint / `restage_required` state is reachable only on the legacy path.
- Because the XLSX path owns tab resolution, cap, and revision itself, the `MAX_TOTAL_DIAGRAM_ITEMS` cap and the `DIAGRAMS_TAB_MISSING` / `DIAGRAMS_EMBEDDED_NONE_FOUND` / `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` warnings are reproduced (same codes, no new codes). `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE` (`:202-210`) and `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` (`:224-229`) are legacy-path-only.

---

## 8. Byte re-production at Apply / recovery (the crux)

### 8.1 Apply port branch

The Apply upload loop (`snapshotAssets.ts:136-157`) is unchanged: it gates on `entry.embeddedFingerprint && recovery_disposition!=='restage_required'`, calls `args.drive.fetchEmbeddedImageBytes(entry)`, and verifies `assetSha256(bytes) === entry.embeddedFingerprint` (`:144`) before uploading. Only the **port** changes.

`snapshotFetchEmbeddedImageBytesTimed` (`defaultSnapshotAssetsForApply.ts:37-60`) currently returns `null` when `!entry.contentUrl` (`:41`). Add one dep and one branch: extend its deps from `{ fetch?, getAccessToken?, timeoutMs? }` to `{ fetch?, getAccessToken?, timeoutMs?, fetchXlsxBytes? }`, and when `entry.contentUrl` is falsy **and** `entry.mediaPartName` is set, re-produce the bytes from a current XLSX re-export (thunk supplied by the wiring so memoization is owned there — §8.2).

Wiring at `defaultSnapshotAssetsForApply.ts:114-137` gains a per-apply-pass memoized current-export thunk over the show's Drive id + client (both in closure scope — `args.driveFileId` `:117`, `drive` `:113`):

```ts
// inside the returned async (args) => …, before snapshotAssets({...}):
let xlsxOnce: Promise<ArrayBuffer> | null = null;
const fetchXlsxBytes = () => (xlsxOnce ??= fetchCurrentSheetXlsxBytes(args.driveFileId, { drive }));
// …
drive: {
  fetchEmbeddedImageBytes: (entry) => snapshotFetchEmbeddedImageBytesTimed(entry, { fetchXlsxBytes }),
  fetchLinkedRevisionBytes: (entry) => snapshotFetchLinkedRevisionBytesTimed(entry, { drive }),
},
```

Port body (XLSX branch, inserted before the existing `if (!entry.contentUrl) return null;` at `:41`):

```ts
if (!entry.contentUrl) {
  if (!entry.mediaPartName || !deps.fetchXlsxBytes) return null;
  try {
    const xlsx = await deps.fetchXlsxBytes();             // memoized current export, once per pass (§8.2)
    return findMediaByFingerprint(xlsx, entry.mediaPartName, entry.embeddedFingerprint);
  } catch {
    return null;                                          // Drive fault OR unzip/parse throw → fail-soft
  }
}
// …existing contentUrl branch unchanged…
```

**The `try` wraps BOTH the export and `findMediaByFingerprint`** — a malformed-XLSX unzip throw inside the finder must return `null` (fail-soft, `partial_failure`), never propagate. If it escaped the port, `snapshotAssets` would `markPendingSnapshotDeleteStarted` and rethrow (`snapshotAssets.ts:193-195`), aborting the entire Apply — the opposite of the promised partial-failure degradation.

`findMediaByFingerprint(xlsx, partHint, fingerprint)`:
- unzip once; try `partHint` first; if its `sha256Base64Url` === `fingerprint`, return those bytes;
- else scan all `xl/media/*` and return the first whose hash === `fingerprint`;
- else return `null`.

Because Apply re-verifies at `snapshotAssets.ts:144`, `findMediaByFingerprint` returning the fingerprint-matched bytes always passes the verify; a drifted image (no media matches) → `null` → no upload → `partial_failure` (self-heals next sync). This is the **same content-hash posture as the linked-folder md5 re-verify** (`snapshotAssets.ts:164`).

### 8.2 Current XLSX re-export, memoized

Add an exported helper to `lib/drive/fetch.ts`:

```ts
export async function fetchCurrentSheetXlsxBytes(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<ArrayBuffer>;
```

It does `fetchFileForExport(driveFileId)` → `bindingToken(before)` → `fetchXlsxExportBytes(exportLinks[xlsx], …)` → `fetchFileForExport` after → assert token unchanged (mid-edit guard, throws on concurrent edit). It reuses the existing internals of `fetchSheetMarkdownAndBytesAtRevision` (`:452-498`) minus the caller-supplied revisionId and minus `synthesizeMarkdownFromXlsx`. **It does not require an externally-supplied revision token** (see §8.3).

The **wiring** (not the port) memoizes the export **once per Apply pass per show** via the `xlsxOnce` promise cache in §8.1, so N embedded images cost one export, not N. (The `makeSnapshotAssetsForApply` returned function is per-show-apply, so the memo is naturally scoped and never leaks across shows.)

### 8.3 Why a non-pinned current export (not `entry.sheetsRevisionId`)

`entry.sheetsRevisionId` is captured via `getSpreadsheetRevisionId` = `revisions.list(...).at(-1).id` (`runScheduledCronSync.ts:1792-1793`). The revision-pinned export helper (`fetchSheetMarkdownAndBytesAtRevision`) compares its `revisionId` arg against `bindingToken(file) = file.headRevisionId ?? modifiedTime` (`fetch.ts:374-380`). **These two token spaces differ** — a `revisions.list` id is not the `files.get` `headRevisionId` for a native Google Sheet. Feeding `sheetsRevisionId` into the pinned export would throw "revision token changed" on every Apply, breaking the feature.

Resolution: **export the current sheet and let `embeddedFingerprint` be the sole drift fence.** This is:
- **Correct** — a matching content hash proves the bytes are Doug's approved bytes; a mismatch means the image drifted → not snapshotted → re-approval on next sync. Same fence linked-folder items already use (md5).
- **Robust** — independent of any token-space compatibility question.
- **Strictly better UX** — if the floor-plan image is unchanged but *other* sheet cells were edited between extract and Apply, the current export still contains the approved image bytes, so it snapshots correctly. Revision-pinning would spuriously reject the whole export.

### 8.4 Recovery port branch

`assetRecovery.ts` `collectVerifiedAssets` (`:300-387`) calls `deps.drive.fetchEmbeddedImageBytes(entry, { onChunk })` (`:343`); the default wiring is `fetchEmbeddedImageBytesTimed(entry, options)` (`:761`). The show's `driveFileId` is **not** in `collectVerifiedAssets`'s scope but **is** available at the recovery entry as `previewShow.driveFileId` (read from the row in `defaultReadPreviewShow`, `.select("id,drive_file_id,diagrams")`, `:687-699`; used at `:455`,`:496`).

Wire the recovery `fetchEmbeddedImageBytes` port (at `:761`) to build the same per-run memoized `fetchXlsxBytes` thunk over `previewShow.driveFileId` + `getDriveClient()`, and add the identical `!entry.contentUrl && entry.mediaPartName` re-export branch to `fetchEmbeddedImageBytesTimed` (`:192-219`) — deps extended to include `fetchXlsxBytes?`. Legacy `contentUrl` entries are unaffected: the new branch is entered only when `contentUrl` is falsy **and** `mediaPartName` is set, so a null-`contentUrl` legacy `restage_required` entry (no `mediaPartName`) still early-returns `null` exactly as at `:197` today.

---

## 9. Write-through completeness matrix (extract paths)

Every path that produces a ParseResult which can be **applied** (snapshotted) must reach the XLSX path with bytes in scope. The self-sufficient extract path (§7) means a caller needs only to (a) have XLSX bytes and (b) pass them as `ctx.xlsxBytes` — no Sheets-client capability is required.

| Caller | File:line | Bytes available? | Action |
|---|---|---|---|
| Scheduled cron sync | `runScheduledCronSync.ts:2581` | Yes — `xlsxBytes` @ `:2491`/`:2511` | Add `...(xlsxBytes !== undefined ? { xlsxBytes } : {})` to the ctx |
| Onboarding scan (main) | `runOnboardingScan.ts:947` | Yes — `bytes` @ `:945`; default `fetchSheetMarkdownWithBinding` returns `bytes` (`fetch.ts:522,566`) | Add `...(bytes ? { xlsxBytes: bytes } : {})` to the ctx; **update the DI callback ctx type** at `:161-165` to include `xlsxBytes?: ArrayBuffer` (MEDIUM #2) |
| Wizard revision-race restage | `applyStaged.ts:1596-1607` (injects `fetchMarkdownWithBinding`) | **No** — injected fetch returns `{ binding, markdown }` only (`fetchSheetAsMarkdownAtRevision`, `:1603`) | Swap the injected fetch to `fetchSheetMarkdownAndBytesAtRevision`, return `{ binding, markdown, bytes }` so `prepareOne` (`:945`) has `bytes` |
| Pending-ingestion retry | `.../pending-ingestions/[id]/retry/route.ts:170` | **No** — fetches markdown only (`fetchSheetAsMarkdownAtRevision`, `:159`) | Swap to `fetchSheetMarkdownAndBytesAtRevision`; pass `xlsxBytes: result.bytes` to the ctx |
| Dev panel preview | `app/admin/dev/actions.ts:139` | No — `mockDriveClient`, preview-only, never applied | N/A — legacy path (embedded images empty in preview; harmless) |

**Why self-sufficiency is load-bearing here:** onboarding's client (`runOnboardingScan.ts:48,223`) and the wizard-restage path both run through `prepareOnboardingFiles`/`enrichWithDrivePins` with a client that has no `listSpreadsheetSheets`/`getSpreadsheetRevisionId`. Without §7's self-sufficient path, adding `xlsxBytes` alone would still yield `[]` (early return at the old `:166` gate). With §7, bytes are the only requirement.

Apply side is a single chokepoint — all three Apply callers (`applyStaged.ts:1261`, `runManualStageForFirstSeen.ts:89/94`, `runScheduledCronSync.ts:2798`) route through `makeSnapshotAssetsForApply`, so the §8.1 port wiring reaches every one. The wizard restage's ParseResult is applied through this same chokepoint.

---

## 10. Storage key & asset-route compatibility

- Apply asset key: `embedded-${entry.objectId}.${extForMime(entry.mimeType)}` (`snapshotAssets.ts:139`). With `objectId = "x-<b64url-24>"`, the key is `embedded-x-<…>.png` — URL-safe, no `/` or `.` in the id (base64url), same `<prefix>-<id>.<ext>` mold the linked path already uses for Drive ids containing `-`/`_`.
- `snapshotPath = diagram-snapshots/shows/${showId}/${rev}/${assetKey}` (`snapshotAssets.ts:91-93,148`).
- The gallery builds `/api/asset/diagram/<show>/<rev>/<key>` where `<key>` is the last path segment of `snapshotPath` (`DiagramsBlock.tsx:56-65`); the route matches `entry.snapshotPath === canonicalPath(show,rev,key)` (`route.ts:66-83`) and signs the Storage object for 60s. No route change needed — matching is generic on `snapshotPath`.
- `available = entry.snapshotPath !== null && isAllowedDiagramMime(entry.mimeType)` (`DiagramsBlock.tsx:75`). Our raster-only MIME filter guarantees `isAllowedDiagramMime` passes.

---

## 11. Guard conditions (every input state)

| State | Behavior |
|---|---|
| `ctx.xlsxBytes` absent (dev/mocks) | Legacy `contentUrl` extraction; unchanged. |
| `xlsxBytes` present but not a valid ZIP / `unzipSync` throws | `extractEmbeddedObjects` returns empty maps (best-effort try/catch in caller); `imageObjects=[]` → `DIAGRAMS_EMBEDDED_NONE_FOUND` (if no linked folder). No throw to sync. |
| DIAGRAMS tab present, no `<drawing>` / no media | `imageObjects=[]` → existing none-found warning. |
| DIAGRAMS tab has only non-raster media (emf/wmf/svg) | Those are dropped at extract → `imageObjects=[]` → none-found warning (no new code). |
| `> 60` embedded images | Existing cap: keep 60, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` (`:190-199`). |
| DIAGRAMS tab title casing (corpus `DIagrams` typo) | Resolved from `allTabTitles` via `localeCompare("diagrams", undefined, { sensitivity: "accent" })` — **case-insensitive** (handles the capitalization typo). This is accent-SENSITIVE and does not trim whitespace, exactly mirroring the live match at `:170`; matching that existing behavior is intentional (no scope creep into accent/whitespace normalization). |
| Apply: current export fails (Drive fault) | Port returns `null` → no upload → `partial_failure` → retried next sync. |
| Apply: image drifted since extract (no media hashes to fingerprint) | Port returns `null` → `partial_failure`; unrelated cell edits do NOT cause this (§8.3). |
| Recovery: `driveFileId` unavailable / export fails | Port returns `null`; entry stays unresolved for a later pass. Legacy `restage_required` entries are still skipped by recovery's existing filter. |
| Two byte-identical images on the tab | Same `objectId` → one Storage key; both render pointing at identical content. |

---

## 12. Dependency

Add `fflate` (`unzipSync`) to `package.json` **dependencies**. Rationale: SheetJS `xlsx@0.18.5` (already present) does its own internal ZIP/CFB parsing but **does not expose `xl/media/*` image parts** (`lib/drive/sourceAnchors.ts:192`, `lib/drive/exportSheetToMarkdown.ts:186` both use `XLSX.read` for cells only); Node has no built-in ZIP reader. `fflate` is MIT, zero-dependency, and already present transitively — this promotes it to a direct dependency. Commit the updated `pnpm-lock.yaml`.

---

## 13. Test plan (TDD, per task)

Concrete failure mode stated for each.

1. **`extractEmbeddedObjects` — real OOXML fixture.** Build a committed XLSX fixture (or reuse a captured test-show export trimmed to DIAGRAMS + INFO tabs) with ≥1 PNG on DIAGRAMS and ≥1 image on INFO. Assert: DIAGRAMS objects returned, INFO objects **excluded** (attribution correctness — catches "dump all `xl/media`" bug); `bytesByObjectId` bytes hash to the objects' `objectId` suffix; a non-raster media part is dropped (catches raster-filter bug); malformed input → empty maps, no throw.
2. **`extractEmbeddedImages` dual-path + self-sufficiency.** With `ctx.xlsxBytes` set (fixture) **and a Drive client that implements only `getFile`/`listFolder` (onboarding shape — no `listSpreadsheetSheets`, no `getSpreadsheetRevisionId`)** → entries are still produced, carrying `contentUrl: null`, non-null `embeddedFingerprint`, `mediaPartName`, `recovery_disposition: "normal"`, `sheetTab` = the resolved DIAGRAMS title, and `sheetsRevisionId` = `fileMeta.headRevisionId`. This is the direct HIGH-#1 regression guard: it fails if the XLSX path early-returns on the missing Sheets method. Also assert `DIAGRAMS_TAB_MISSING` when the OOXML has no diagrams-titled tab and `DIAGRAMS_EMBEDDED_NONE_FOUND` when the tab exists but has no raster media. Without `xlsxBytes` (existing `clientWithEmbedded` mock, `tests/sync/embeddedImages.test.ts:55-140`) → **byte-identical existing behavior** (legacy-path regression; expected-entry `toEqual` at `:117-140` unchanged because `mediaPartName` is absent, not `undefined`).
3. **Apply port re-export.** Given a persisted entry with `contentUrl:null` + `mediaPartName` + `embeddedFingerprint`, inject `fetchXlsxBytes` returning a fixture whose media matches the fingerprint → upload happens, `snapshotPath` set (catches "port returns null for XLSX-media → never snapshots"). Fingerprint-mismatch fixture → `null` → no upload, `partial_failure` (catches drift handling). Assert re-export is memoized (one `fetchXlsxBytes` call for N entries).
4. **Recovery port re-export.** `driveFileId` sourced from `previewShow` → an unresolved XLSX-media entry re-exports and resolves; legacy `restage_required` entries stay skipped.
5. **Retry route byte wiring.** After the swap, the retry path produces embedded-image entries from a fixture export (catches "retry silently drops diagrams").
6. **Existing contracts still green (regression guard, not new behavior):** `defaultDriveClientSheetsFieldsMask.test.ts` (fields mask titles-only, `embeddedObjects:[]`, source has no `drawings`); `realSheetsListSpreadsheetSheetsSmoke.test.ts` (`embeddedObjects===[]`); `_storageWriteSurfaceContract.test.ts` (new module not a storage-write surface); `driveClientImplCompleteness.test.ts` (no DriveClient shape change).
7. **Live smoke (opt-in, gsheets-gated).** Against a real test show, `extractEmbeddedObjects(export)` yields ≥1 DIAGRAMS-tab raster object whose bytes hash-match — proves the extractor works on genuine Google exporter output, not just a hand-built fixture (guards the "mocked-only tautological pass" class).

Anti-tautology: fixture expectations derive from the fixture's actual media bytes/hashes, never hardcoded; the INFO-exclusion assertion is the load-bearing one and is asserted against the returned map, not the render.

---

## 14. Meta-test inventory

- **Creates:** none new.
- **Constrains the design (must keep passing):**
  - `_storageWriteSurfaceContract.test.ts:7-13` — the new `lib/drive/embeddedObjects.ts` performs no Storage write; re-export lives in the Drive port and returns bytes. The upload stays in `snapshotAssets.ts`. No new surface.
  - `defaultDriveClientSheetsFieldsMask.test.ts:70-71` — the OOXML rels walk (the only place the word "drawings" appears) lives in `embeddedObjects.ts`; **`runScheduledCronSync.ts` and `runOnboardingScan.ts` source must not contain `drawings`** (they reference only `extractEmbeddedObjects`/`xlsxBytes`).
- **Not applicable:** Supabase call-boundary (`_metaInfraContract`) — the new module makes no Supabase calls; advisory-lock topology — no new lock (extract/Apply run inside existing holders); `admin_alerts` catalog — no alert; §12.4 catalog — no new code.

---

## 15. Watchpoints / do-not-relitigate (for the reviewer)

Cite these to pre-empt re-derivation:

1. **Content-hash is the sole Apply/recovery drift fence — by design, not an oversight.** Revision-pinning is impossible here because `sheetsRevisionId` (`revisions.list.at(-1).id`, `runScheduledCronSync.ts:1792`) and the pinned-export token (`bindingToken = headRevisionId`, `fetch.ts:374`) are different token spaces. `embeddedFingerprint` re-verify at `snapshotAssets.ts:144` is the same fence linked-folder md5 uses at `:164`. §8.3.
2. **In-memory bytes are extract-only.** They are never threaded across the Apply boundary; the staged path persists `ParseResult` to JSONB and re-invokes, so re-export is mandatory, not a stylistic choice. §4.
3. **Separate module for the OOXML walk is mandatory**, not cosmetic — `defaultDriveClientSheetsFieldsMask.test.ts:70-71` fails if `drawings` appears in the cron source. §14.
4. **No UI surface in the diff.** Render/serve already consume `embeddedImages`; `shouldHideDiagrams` un-hides automatically. Invariant-8 impeccable gate is correctly skipped. §3.
5. **No DB change, no new §12.4 code.** The JSONB shape and all failure codes pre-exist. §3.
6. **Raster-only is intentional scope**, aligned with the pre-existing `ALLOWED_DIAGRAM_MIMES` allowlist; non-raster media is dropped at extract rather than captured-then-rejected downstream. §3, §5.3.
7. **`fflate` as a direct dep is required** — SheetJS does not expose `xl/media`. §12.
8. **Legacy `contentUrl` path is retained** for byte-less callers (dev panel/mocks); it is not dead code and its tests must stay green. §7.
9. **The XLSX extract path is deliberately self-sufficient** — it derives the DIAGRAMS tab from `extractEmbeddedObjects(...).allTabTitles` and the revision from `ctx.fileMeta.headRevisionId`, using **no** `listSpreadsheetSheets`/`getSpreadsheetRevisionId`. This is required, not optional: the onboarding and wizard-restage clients implement only `getFile`/`listFolder` (`runOnboardingScan.ts:48,223`), so a Sheets-API-dependent extract would silently yield `[]` there. §7, §9. (This was the round-1 HIGH finding; the fix is structural.)

---

## 16. Citation appendix (verified against the live worktree)

- `lib/parser/types.ts:248-262` `EmbeddedImageStub`; `:317-319` `PersistedEmbeddedImage`; fingerprint contract `:233-247`.
- `lib/sync/enrichWithDrivePins.ts:54-59` `SpreadsheetEmbeddedObject`; `:61-65` `SpreadsheetSheet`; `:127-146` `EnrichContext`; `:152-158` `isImageLike`/`isImageMimeType`; `:160-246` `extractEmbeddedImages` (tab resolve `:169-171`, cap `:190-199`, revision `:201-210`, per-object `:212-243`); `:27` `sha256Base64Url` import; `:31` `MAX_TOTAL_DIAGRAM_ITEMS = 60`.
- `lib/sync/snapshotAssets.ts:64-69` `extForMime`; `:119-197` `snapshotAssets` (embedded loop `:136-157`, key `:139`, verify `:144`, linked md5 verify `:164`, prefixes `:91-97`).
- `lib/sync/defaultSnapshotAssetsForApply.ts:37-60` `snapshotFetchEmbeddedImageBytesTimed` (`:41` null-contentUrl); `:68-103` linked revision port; `:105-138` `makeSnapshotAssetsForApply` (drive wiring `:132-136`, `args.driveFileId` `:117`).
- `lib/sync/assetRecovery.ts:192-219` `fetchEmbeddedImageBytesTimed` (`:197` null-contentUrl); `:300-387` `collectVerifiedAssets` (call `:343`); port wiring `:761`; `defaultReadPreviewShow` `:687-699`; `previewShow.driveFileId` `:455`/`:496`.
- `lib/drive/fetch.ts:374-381` `bindingToken`; `:383-403` `fetchFileForExport`; `:452-498` `fetchSheetMarkdownAndBytesAtRevision`; `:479` `fetchXlsxExportBytes`.
- `lib/data/diagrams.ts:30-41` `ALLOWED_DIAGRAM_MIMES`/`isAllowedDiagramMime`.
- `lib/sync/runScheduledCronSync.ts:1753-1778` `listSpreadsheetSheets` (mask `:1765`, `embeddedObjects:[]` `:1775`); `:1782-1794` `getSpreadsheetRevisionId`; `:2491`/`:2511` `xlsxBytes`; `:2580-2586` enrich ctx; `:2617-2621` `extractSourceAnchors`; `:2798` Apply wiring.
- `lib/sync/runOnboardingScan.ts:48` reduced-client doc ("only `getFile` + `listFolder`"); `:161-165` `RunOnboardingScanDeps.enrichWithDrivePins` DI ctx type (`{driveFileId, fileMeta, binding}` — needs `xlsxBytes?`); `:223` local `defaultDriveClient`; `:920-951` `prepareOnboardingFiles`/`prepareOne`; `:945` `bytes`; `:947-951` enrich ctx; `:961-980` `extractSourceAnchors` (try/catch).
- `lib/drive/fetch.ts:513-567` `fetchSheetMarkdownWithBinding` (returns `{ binding, markdown, bytes }`, `:522`,`:566`).
- `lib/sync/applyStaged.ts:1596-1607` wizard revision-race restage (injected `fetchMarkdownWithBinding` returns markdown-only, `:1601-1605`); `:1261` Apply chokepoint.
- `lib/sync/enrichWithDrivePins.ts:40-47` `DriveFileMeta` (`headRevisionId: string` required, `:42`).
- `app/api/admin/pending-ingestions/[id]/retry/route.ts:150-182` `prepareFirstSeenStage` (markdown-only `:159`, enrich `:170`).
- `components/crew/DiagramsBlock.tsx:56-88` gallery mapping; `:103` `shouldHideDiagrams`. `app/api/asset/diagram/[show]/[rev]/[key]/route.ts:66-83` match; `lib/visibility/emptyState.ts:105-110` `shouldHideDiagrams`.
- Tests: `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:51-52,59-62,70-71`; `tests/sync/realSheetsListSpreadsheetSheetsSmoke.test.ts:26-32`; `tests/sync/embeddedImages.test.ts:55-140`; `tests/sync/_storageWriteSurfaceContract.test.ts:7-13,28-44`; `tests/sync/driveClientImplCompleteness.test.ts:16-25`.
- `package.json:71` `xlsx@^0.18.5`; `fflate`/`jszip`/`adm-zip` absent as direct deps.
