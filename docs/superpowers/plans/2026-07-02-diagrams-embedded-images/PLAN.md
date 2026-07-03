# DIAGRAMS-tab embedded floor-plan images — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `diagrams.embeddedImages` from the XLSX bytes the sync already fetches, so the existing capture→store→serve→render pipeline surfaces the floor-plan images embedded on a show sheet's DIAGRAMS tab onto the crew Venue page.

**Architecture:** A new pure module `lib/drive/embeddedObjects.ts` walks the OOXML relationship graph of the exported `.xlsx` to attribute `xl/media/*` images to worksheet tabs. `enrichWithDrivePins` gains a self-sufficient XLSX extraction path (driven by `ctx.xlsxBytes` + `ctx.fileMeta`, needing no Sheets-API method). Bytes are captured at Apply and re-produced at Apply/recovery via a non-pinned current XLSX re-export, matched by `embeddedFingerprint` (content hash) scoped to the DIAGRAMS tab. No UI, DB, or error-code change.

**Tech Stack:** TypeScript, Next.js 16, Vitest, `fflate` (new — ZIP reader), existing `@/lib/crypto/sha256`, `googleapis` Drive client.

**Spec:** `docs/superpowers/specs/2026-07-02-diagrams-embedded-images.md` (Codex-APPROVED, 3 rounds). Every task below implements a part of it; the spec's citation appendix (§16) is the authoritative `file:line` map.

## Global Constraints

- **TDD per task:** failing test → run it red → minimal implementation → run it green → commit. Never implementation before its test.
- **Commit per task**, conventional-commits (`feat(sync|drive|parser|assets): …`, `test(...)`, `chore(deps): …`). One task per commit; `--no-verify` (shared hooks belong to the main checkout).
- **No UI surface** is touched (no file under `app/` except `app/api/**`, no `components/`, no CSS/tokens) — invariant-8 impeccable gate does NOT apply. If any task tempts a `components/` edit, STOP: the design is wrong.
- **No DB / schema change**, no migration, no `schema-manifest` regen, no `validation-schema-parity` interaction. `shows.diagrams` JSONB already carries the `embeddedImages` shape.
- **No new §12.4 error code.** Reuse `DIAGRAMS_TAB_MISSING`, `DIAGRAMS_EMBEDDED_NONE_FOUND`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `EMBEDDED_ASSET_DRIFTED`.
- **No `drawings` literal** in `runScheduledCronSync.ts` or `runOnboardingScan.ts` source — the OOXML walk lives only in `lib/drive/embeddedObjects.ts` (pinned by `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:70-71`).
- **exactOptionalPropertyTypes:** new optional fields (`mediaPartName?`, `xlsxBytes?`, `driveFileId?`) are set via conditional spread (`...(x ? { x } : {})`), never assigned `undefined`.
- **Run the FULL suite before the final commit** (`pnpm vitest run`) and **`pnpm typecheck`** (vitest strips types). Known env-gated failures that also fail on `main` locally: `test-auth-gate` Layer-2 HTTP, `email-canonicalization` live-project, `pg-cron-coverage`; a flaky `validation-report-fixtures`/`resetValidationDataPostgrest` cluster under parallel local-DB contention that passes in isolation + CI. Verify any red test also fails at the merge-base before attributing it to this change.

## Meta-test inventory (declaration)

- **Creates:** none.
- **Constrains the design (must stay green, treated as regression gates):**
  - `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts:51-52,59-62,70-71` — fields mask stays titles-only, `embeddedObjects:[]`, cron source has no `drawings`.
  - `tests/sync/realSheetsListSpreadsheetSheetsSmoke.test.ts:26-32` — live smoke keeps `embeddedObjects===[]`.
  - `tests/sync/_storageWriteSurfaceContract.test.ts:7-13,28-44` — storage writes confined to the 4 existing lib surfaces; the new module writes no storage.
  - `tests/sync/driveClientImplCompleteness.test.ts:16-25` — no `DriveClient` shape change.
  - `tests/sync/embeddedImages.test.ts:55-140` — legacy `contentUrl` path byte-identical.
- **Advisory-lock topology:** N/A — this plan touches no `pg_advisory*` call. Extract runs inside the existing enrich step; Apply/recovery run inside their existing per-show lock holders; no lock is acquired or moved.
- **Layout-dimensions task:** N/A — no fixed-dimension parent, no rendered component is modified (the gallery already renders `embeddedImages`).
- **Transition-audit task:** N/A — no component with a Transition Inventory is modified.

## File map

| File | Change |
|---|---|
| `package.json`, `pnpm-lock.yaml` | Add `fflate` direct dependency |
| `lib/drive/embeddedObjects.ts` | **New.** `extractEmbeddedObjects`, `findMediaByFingerprint` (pure) |
| `lib/drive/fetch.ts` | **New export** `fetchCurrentSheetXlsxBytes` |
| `lib/sync/enrichWithDrivePins.ts` | `SpreadsheetEmbeddedObject.mediaPartName?`, `EnrichContext.xlsxBytes?`; self-sufficient XLSX path in `extractEmbeddedImages` |
| `lib/parser/types.ts` | `EmbeddedImageStub.mediaPartName?` |
| `lib/sync/defaultSnapshotAssetsForApply.ts` | Apply port XLSX branch + memoized `fetchXlsxBytes` wiring |
| `lib/sync/assetRecovery.ts` | Recovery port XLSX branch; `collectVerifiedAssets` gains `driveFileId`; `AssetRecoveryDrive` options type; `defaultRecover` memo |
| `lib/sync/runScheduledCronSync.ts` | Pass `xlsxBytes` into enrich ctx |
| `lib/sync/runOnboardingScan.ts` | Pass `xlsxBytes` into enrich ctx; extend DI callback ctx type |
| `app/api/admin/pending-ingestions/[id]/retry/route.ts` | Swap markdown-only fetch → markdown+bytes; pass `xlsxBytes` |
| `lib/sync/applyStaged.ts` | Wizard-restage injected fetch returns bytes |
| `tests/**` | New tests per task + a committed OOXML fixture |

---

## Task 1: `fflate` dep + `extractEmbeddedObjects` / `findMediaByFingerprint` module

**Files:**
- Modify: `package.json` (dependencies), `pnpm-lock.yaml`
- Create: `lib/drive/embeddedObjects.ts`
- Create: `tests/drive/embeddedObjects.test.ts`
- Create (fixture builder + fixture): `tests/fixtures/diagrams/buildEmbeddedSampleXlsx.ts`, `tests/fixtures/diagrams/embedded-sample.xlsx`

**Interfaces — Produces:**
```ts
export type ExtractedEmbeddedObjects = {
  allTabTitles: string[];
  objectsByTab: Map<string, SpreadsheetEmbeddedObject[]>; // SpreadsheetEmbeddedObject imported from enrichWithDrivePins
  bytesByObjectId: Map<string, Uint8Array>;
};
export function extractEmbeddedObjects(xlsx: ArrayBuffer): ExtractedEmbeddedObjects;
export function findMediaByFingerprint(
  xlsx: ArrayBuffer,
  partHint: string | undefined,
  fingerprint: string | null,
): Uint8Array | null;
```
`SpreadsheetEmbeddedObject` now carries `mediaPartName?: string` (added in Task 2; import the type — to avoid an import cycle, define `ExtractedEmbeddedObjects.objectsByTab` value type inline as `{ objectId: string; mimeType: string; alt?: string; mediaPartName: string }[]` OR import the type from `@/lib/sync/enrichWithDrivePins`. Prefer importing; if a cycle appears, keep the local structural type — it is assignable to `SpreadsheetEmbeddedObject`).

- [ ] **Step 1: Add the dependency**

Run: `pnpm add fflate`
Expected: `package.json` gains `"fflate": "^0.8.x"` under `dependencies`; `pnpm-lock.yaml` updated. Confirm: `node -e "require('fflate')"` prints nothing (exit 0).

- [ ] **Step 2: Write the fixture builder**

Create `tests/fixtures/diagrams/buildEmbeddedSampleXlsx.ts` — assembles a minimal, deterministic OOXML workbook with two worksheets (`DIAGRAMS`, `INFO`), one distinct 1×1 PNG on each, plus a third byte-identical duplicate PNG placed twice on `DIAGRAMS` (to exercise dedup) and one `.emf` media part referenced from `DIAGRAMS` (to exercise the raster filter). Use `fflate.zipSync`. The builder is deterministic (fixed bytes, no timestamps).

```ts
import { zipSync, strToU8 } from "fflate";
import { writeFileSync } from "node:fs";

// Two distinct 1x1 PNGs (different palette) + one shared PNG (placed twice on DIAGRAMS).
const PNG_A = Uint8Array.from([/* 1x1 red png bytes — inline the real byte array */]);
const PNG_B = Uint8Array.from([/* 1x1 blue png bytes */]);
const PNG_SHARED = Uint8Array.from([/* 1x1 green png bytes */]);
const EMF_JUNK = strToU8("not-a-real-emf-but-has-.emf-extension");

const files: Record<string, Uint8Array> = {
  "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`),
  "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
  "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DIAGRAMS" sheetId="1" r:id="rId1"/><sheet name="INFO" sheetId="2" r:id="rId2"/></sheets></workbook>`),
  "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`),
  "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><drawing r:id="rId1"/></worksheet>`),
  "xl/worksheets/_rels/sheet1.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`),
  "xl/worksheets/sheet2.xml": strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><drawing r:id="rId1"/></worksheet>`),
  "xl/worksheets/_rels/sheet2.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing2.xml"/></Relationships>`),
  // DIAGRAMS drawing references PNG_A, PNG_SHARED (twice), and EMF_JUNK
  "xl/drawings/drawing1.xml": strToU8(`<xdr:wsDr xmlns:xdr="x" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><a r:embed="rIdA"/><a r:embed="rIdS1"/><a r:embed="rIdS2"/><a r:embed="rIdE"/></xdr:wsDr>`),
  "xl/drawings/_rels/drawing1.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageA.png"/><Relationship Id="rIdS1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageShared.png"/><Relationship Id="rIdS2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageShared.png"/><Relationship Id="rIdE" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageJunk.emf"/></Relationships>`),
  // INFO drawing references PNG_B (the identical-image-on-other-tab test uses PNG_A copied here in a variant fixture; see test)
  "xl/drawings/drawing2.xml": strToU8(`<xdr:wsDr xmlns:xdr="x" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><a r:embed="rIdB"/></xdr:wsDr>`),
  "xl/drawings/_rels/drawing2.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/imageB.png"/></Relationships>`),
  "xl/media/imageA.png": PNG_A,
  "xl/media/imageB.png": PNG_B,
  "xl/media/imageShared.png": PNG_SHARED,
  "xl/media/imageJunk.emf": EMF_JUNK,
};

export function buildEmbeddedSampleXlsx(): Uint8Array { return zipSync(files); }

if (process.argv[1]?.endsWith("buildEmbeddedSampleXlsx.ts")) {
  writeFileSync(new URL("./embedded-sample.xlsx", import.meta.url), buildEmbeddedSampleXlsx());
}
```
Fill `PNG_A`/`PNG_B`/`PNG_SHARED` with real 1×1 PNG byte arrays (generate once, inline them). Generate the committed fixture: `pnpm tsx tests/fixtures/diagrams/buildEmbeddedSampleXlsx.ts`. Commit `embedded-sample.xlsx`. (Deterministic + non-sensitive — no real venue data.)

- [ ] **Step 3: Write the failing test**

`tests/drive/embeddedObjects.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractEmbeddedObjects, findMediaByFingerprint } from "@/lib/drive/embeddedObjects";
import { sha256Base64Url } from "@/lib/crypto/sha256";

const xlsx = () => {
  const buf = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

describe("extractEmbeddedObjects", () => {
  it("lists all tab titles including image-less tabs", () => {
    expect(extractEmbeddedObjects(xlsx()).allTabTitles).toEqual(["DIAGRAMS", "INFO"]);
  });
  it("attributes media to the owning tab (INFO image excluded from DIAGRAMS)", () => {
    const { objectsByTab } = extractEmbeddedObjects(xlsx());
    const diag = objectsByTab.get("DIAGRAMS")!;
    // PNG_A + PNG_SHARED (deduped) = 2 raster objects; EMF dropped; INFO's PNG_B not here
    expect(diag).toHaveLength(2);
    expect(diag.every((o) => o.mimeType === "image/png")).toBe(true);
    expect(objectsByTab.get("INFO")).toHaveLength(1);
  });
  it("dedups a byte-identical image placed twice on a tab", () => {
    const diag = extractEmbeddedObjects(xlsx()).objectsByTab.get("DIAGRAMS")!;
    const ids = diag.map((o) => o.objectId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate objectId
  });
  it("keys bytesByObjectId so bytes hash to the objectId suffix", () => {
    const { objectsByTab, bytesByObjectId } = extractEmbeddedObjects(xlsx());
    for (const o of objectsByTab.get("DIAGRAMS")!) {
      const bytes = bytesByObjectId.get(o.objectId)!;
      expect(o.objectId).toBe("x-" + sha256Base64Url(bytes).slice(0, 24));
    }
  });
  it("returns empty maps + [] titles for malformed input (no throw)", () => {
    const bad = new TextEncoder().encode("not a zip").buffer;
    expect(extractEmbeddedObjects(bad)).toEqual({ allTabTitles: [], objectsByTab: new Map(), bytesByObjectId: new Map() });
  });
});

describe("findMediaByFingerprint", () => {
  it("returns DIAGRAMS-tab bytes whose hash matches the fingerprint", () => {
    const { objectsByTab, bytesByObjectId } = extractEmbeddedObjects(xlsx());
    const target = objectsByTab.get("DIAGRAMS")![0];
    const fp = sha256Base64Url(bytesByObjectId.get(target.objectId)!);
    const found = findMediaByFingerprint(xlsx(), target.mediaPartName, fp);
    expect(found && sha256Base64Url(found)).toBe(fp);
  });
  it("does NOT match a fingerprint whose bytes live only on a non-DIAGRAMS tab", () => {
    const { objectsByTab, bytesByObjectId } = extractEmbeddedObjects(xlsx());
    const infoFp = sha256Base64Url(bytesByObjectId.get(objectsByTab.get("INFO")![0].objectId)!);
    expect(findMediaByFingerprint(xlsx(), undefined, infoFp)).toBeNull(); // INFO image not surfaced via DIAGRAMS
  });
  it("returns null on malformed input", () => {
    expect(findMediaByFingerprint(new TextEncoder().encode("x").buffer, "xl/media/a.png", "abc")).toBeNull();
  });
});
```

- [ ] **Step 4: Run red**

Run: `pnpm vitest run tests/drive/embeddedObjects.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 5: Implement `lib/drive/embeddedObjects.ts`**

```ts
import { unzipSync } from "fflate";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { SpreadsheetEmbeddedObject } from "@/lib/sync/enrichWithDrivePins";

export type ExtractedEmbeddedObjects = {
  allTabTitles: string[];
  objectsByTab: Map<string, SpreadsheetEmbeddedObject[]>;
  bytesByObjectId: Map<string, Uint8Array>;
};

const EMPTY: ExtractedEmbeddedObjects = { allTabTitles: [], objectsByTab: new Map(), bytesByObjectId: new Map() };
const RASTER: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const dec = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : "");

// Machine-generated OOXML from Google's exporter is regular; attribute-targeted regex is sufficient.
function relMap(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of xml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)) m.set(r[1], r[2]);
  // Attribute order varies; also handle Target-before-Id:
  for (const r of xml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"/g)) if (!m.has(r[2])) m.set(r[2], r[1]);
  return m;
}
const norm = (base: string, target: string) =>
  new URL(target, "http://x/" + base).pathname.replace(/^\//, ""); // resolve ../ against the rels' owning part

export function extractEmbeddedObjects(xlsx: ArrayBuffer): ExtractedEmbeddedObjects {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(xlsx));
  } catch {
    return EMPTY;
  }
  const wb = dec(zip["xl/workbook.xml"]);
  if (!wb) return EMPTY;
  const wbRels = relMap(dec(zip["xl/_rels/workbook.xml.rels"]));
  const allTabTitles: string[] = [];
  const objectsByTab = new Map<string, SpreadsheetEmbeddedObject[]>();
  const bytesByObjectId = new Map<string, Uint8Array>();

  for (const s of wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/g)) {
    const title = s[1];
    allTabTitles.push(title);
    const wsTarget = wbRels.get(s[2]);
    if (!wsTarget) continue;
    const wsPath = norm("xl/", wsTarget); // e.g. xl/worksheets/sheet1.xml
    const wsXml = dec(zip[wsPath]);
    const dm = wsXml.match(/<drawing\b[^>]*\br:id="([^"]+)"/);
    if (!dm) continue;
    const wsRels = relMap(dec(zip[wsPath.replace(/([^/]+)$/, "_rels/$1.rels")]));
    const drawingTarget = wsRels.get(dm[1]);
    if (!drawingTarget) continue;
    const drawingPath = norm(wsPath, drawingTarget); // xl/drawings/drawingN.xml
    const drawingRels = relMap(dec(zip[drawingPath.replace(/([^/]+)$/, "_rels/$1.rels")]));

    const seen = new Set<string>();
    const objs: SpreadsheetEmbeddedObject[] = [];
    for (const target of drawingRels.values()) {
      if (!/media\//.test(target)) continue;
      const partName = norm(drawingPath, target); // xl/media/imageN.ext
      const ext = (partName.split(".").pop() || "").toLowerCase();
      const mimeType = RASTER[ext];
      if (!mimeType) continue; // raster-only
      const bytes = zip[partName];
      if (!bytes) continue;
      const objectId = "x-" + sha256Base64Url(bytes).slice(0, 24);
      if (seen.has(objectId)) continue; // dedup identical bytes on this tab
      seen.add(objectId);
      objs.push({ objectId, mimeType, mediaPartName: partName });
      bytesByObjectId.set(objectId, bytes);
    }
    if (objs.length) objectsByTab.set(title, objs);
  }
  return { allTabTitles, objectsByTab, bytesByObjectId };
}

export function findMediaByFingerprint(
  xlsx: ArrayBuffer,
  partHint: string | undefined,
  fingerprint: string | null,
): Uint8Array | null {
  if (!fingerprint) return null;
  const { allTabTitles, objectsByTab, bytesByObjectId } = extractEmbeddedObjects(xlsx);
  const diagramsTitle = allTabTitles.find(
    (t) => t.localeCompare("diagrams", undefined, { sensitivity: "accent" }) === 0,
  );
  if (!diagramsTitle) return null;
  const objs = objectsByTab.get(diagramsTitle) ?? [];
  const ordered = partHint ? [...objs].sort((a) => (a.mediaPartName === partHint ? -1 : 0)) : objs;
  for (const o of ordered) {
    const bytes = bytesByObjectId.get(o.objectId);
    if (bytes && sha256Base64Url(bytes) === fingerprint) return bytes;
  }
  return null;
}
```
Note: `mediaPartName` is a required field on the objects returned here; it becomes optional only on the persisted `EmbeddedImageStub`. If importing `SpreadsheetEmbeddedObject` creates a cycle with `enrichWithDrivePins`, keep a local `type EmbeddedObj = { objectId: string; mimeType: string; alt?: string; mediaPartName: string }` and return that (structurally assignable). The `_storageWriteSurfaceContract` grep never matches this file (no `diagram-snapshots/shows` literal).

- [ ] **Step 6: Run green**

Run: `pnpm vitest run tests/drive/embeddedObjects.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**
```bash
git add package.json pnpm-lock.yaml lib/drive/embeddedObjects.ts tests/drive/embeddedObjects.test.ts tests/fixtures/diagrams/
git commit --no-verify -m "feat(drive): OOXML xl/media extractor with per-tab attribution + fflate"
```

---

## Task 2: Type additions (`mediaPartName?`, `xlsxBytes?`)

**Files:**
- Modify: `lib/sync/enrichWithDrivePins.ts:54-59` (`SpreadsheetEmbeddedObject`), `:127-146` (`EnrichContext`)
- Modify: `lib/parser/types.ts:248-262` (`EmbeddedImageStub`)

**Interfaces — Produces:** `SpreadsheetEmbeddedObject.mediaPartName?: string`, `EmbeddedImageStub.mediaPartName?: string`, `EnrichContext.xlsxBytes?: ArrayBuffer`.

- [ ] **Step 1: Add the fields** (no behavior yet — a type-only change; verified by `pnpm typecheck` and the Task 3 tests).

`enrichWithDrivePins.ts` `SpreadsheetEmbeddedObject`:
```ts
export type SpreadsheetEmbeddedObject = {
  objectId: string;
  mimeType: string;
  alt?: string;
  contentUrl?: string | null;
  mediaPartName?: string; // OOXML media part (e.g. "xl/media/image3.png"); set only on the XLSX-media path
};
```
`EnrichContext` — add after `sheets?`:
```ts
  /** The already-fetched XLSX export bytes for this pass. When present,
   *  extractEmbeddedImages discovers DIAGRAMS-tab embedded images from the
   *  OOXML media parts instead of the (empty) Sheets-API embedded-object list. */
  xlsxBytes?: ArrayBuffer;
```
`parser/types.ts` `EmbeddedImageStub` — add after `contentUrl?`:
```ts
  mediaPartName?: string; // XLSX-media path only; Apply/recovery re-fetch hint (embeddedFingerprint is authoritative)
```
Update the `objectId` comment at `types.ts:250` to note the XLSX-media path synthesizes a content-derived id.

- [ ] **Step 2: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no new errors). If `embeddedObjects.ts` imported `SpreadsheetEmbeddedObject`, it now resolves cleanly.

- [ ] **Step 3: Commit**
```bash
git add lib/sync/enrichWithDrivePins.ts lib/parser/types.ts
git commit --no-verify -m "feat(parser): add mediaPartName + EnrichContext.xlsxBytes for XLSX-media path"
```

---

## Task 3: Self-sufficient XLSX extraction path in `extractEmbeddedImages`

**Files:**
- Modify: `lib/sync/enrichWithDrivePins.ts:160-246`
- Modify/Create: `tests/sync/embeddedImagesXlsx.test.ts` (new — XLSX path); keep `tests/sync/embeddedImages.test.ts` green (legacy)

**Interfaces — Consumes:** `extractEmbeddedObjects` (Task 1), `EnrichContext.xlsxBytes` (Task 2). **Produces:** `EmbeddedImageStub[]` from XLSX when `ctx.xlsxBytes` is set.

- [ ] **Step 1: Write the failing test** — `tests/sync/embeddedImagesXlsx.test.ts`

Use a Drive client that implements ONLY `getFile` + `listFolder` (onboarding shape) to prove self-sufficiency. Build `parsed` via the existing test helpers (a `ParsedSheet` with `diagrams.linkedFolder = null`). Derive expectations from the fixture (do not hardcode fingerprints).
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";
import { sha256Base64Url } from "@/lib/crypto/sha256";
// import a ParsedSheet factory + a getFile/listFolder-only DriveClient from existing test utils

const xlsx = () => { const b = readFileSync(new URL("../fixtures/diagrams/embedded-sample.xlsx", import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const fileMeta = { driveFileId: "sheet-1", headRevisionId: "rev-9", md5Checksum: "m", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2026-07-01T00:00:00Z" };
const reducedClient = { getFile: async () => fileMeta, listFolder: async () => ({ folderId: "f", files: [] }) } as any; // NO listSpreadsheetSheets / getSpreadsheetRevisionId

it("produces DIAGRAMS-tab entries from xlsxBytes with a getFile/listFolder-only client", async () => {
  const parsed = makeParsedSheet({ linkedFolder: null }); // helper
  const result = await enrichWithDrivePins(parsed, reducedClient, { driveFileId: "sheet-1", fileMeta, xlsxBytes: xlsx() });
  const ex = extractEmbeddedObjects(xlsx());
  expect(result.diagrams.embeddedImages).toHaveLength(ex.objectsByTab.get("DIAGRAMS")!.length); // 2 (deduped, emf dropped)
  for (const e of result.diagrams.embeddedImages) {
    expect(e.contentUrl).toBeNull();
    expect(e.recovery_disposition).toBe("normal");
    expect(e.sheetTab).toBe("DIAGRAMS");
    expect(e.sheetsRevisionId).toBe("rev-9"); // headRevisionId
    expect(e.mediaPartName).toMatch(/^xl\/media\//);
    // fingerprint derived from the extractor's own bytes for this objectId (anti-tautology)
    expect(e.embeddedFingerprint).toBe(sha256Base64Url(ex.bytesByObjectId.get(e.objectId)!));
  }
});
it("falls back to fileMeta.modifiedTime when headRevisionId is empty", async () => {
  const parsed = makeParsedSheet({ linkedFolder: null });
  const r = await enrichWithDrivePins(parsed, reducedClient, { driveFileId: "sheet-1", fileMeta: { ...fileMeta, headRevisionId: "" }, xlsxBytes: xlsx() });
  expect(r.diagrams.embeddedImages[0]?.sheetsRevisionId).toBe(fileMeta.modifiedTime);
});
it("emits DIAGRAMS_TAB_MISSING when the OOXML has no diagrams tab", async () => { /* fixture with only INFO → warnings include DIAGRAMS_TAB_MISSING */ });
```
For the fingerprint assertion, derive it from `extractEmbeddedObjects(xlsx()).bytesByObjectId` per matching `objectId` rather than hardcoding (anti-tautology: assert against the extractor's data, not a literal).

- [ ] **Step 2: Run red** — `pnpm vitest run tests/sync/embeddedImagesXlsx.test.ts` → FAIL (XLSX path not implemented; reduced client returns `[]`).

- [ ] **Step 3: Implement the dual path** — replace `extractEmbeddedImages` body per spec §7. The XLSX branch runs first when `ctx.xlsxBytes` is set; the legacy branch (existing `:166-245` logic) is otherwise unchanged.
```ts
async function extractEmbeddedImages(parsed, driveClient, ctx, warnings): Promise<EmbeddedImageStub[]> {
  if (ctx.xlsxBytes) {
    let extracted = { allTabTitles: [] as string[], objectsByTab: new Map(), bytesByObjectId: new Map() };
    try { extracted = extractEmbeddedObjects(ctx.xlsxBytes); } catch { /* empty */ }
    const diagramsTitle = extracted.allTabTitles.find(
      (t) => t.localeCompare("diagrams", undefined, { sensitivity: "accent" }) === 0,
    );
    if (!diagramsTitle) { warnings.push(warning("DIAGRAMS_TAB_MISSING", "No DIAGRAMS tab was found in the spreadsheet.")); return []; }
    const imageObjects = (extracted.objectsByTab.get(diagramsTitle) ?? []).filter(isImageLike);
    if (imageObjects.length === 0) {
      if (!parsed.diagrams.linkedFolder) warnings.push(warning("DIAGRAMS_EMBEDDED_NONE_FOUND", "DIAGRAMS tab was found, but no embedded images or linked folder were found."));
      return [];
    }
    const keptObjects = imageObjects.slice(0, MAX_TOTAL_DIAGRAM_ITEMS);
    const dropped = imageObjects.length - keptObjects.length;
    if (dropped > 0) warnings.push(warning("DIAGRAMS_EMBEDDED_CAP_EXCEEDED", `DIAGRAMS tab has ${imageObjects.length} embedded images; dropped ${dropped} over the ${MAX_TOTAL_DIAGRAM_ITEMS} item cap.`));
    const sheetsRevisionId = ctx.fileMeta.headRevisionId || ctx.fileMeta.modifiedTime;
    const out: EmbeddedImageStub[] = [];
    for (const object of keptObjects) {
      const bytes = extracted.bytesByObjectId.get(object.objectId) ?? null;
      out.push({
        sheetTab: diagramsTitle,
        objectId: object.objectId,
        mimeType: object.mimeType,
        ...(object.alt ? { alt: object.alt } : {}),
        contentUrl: null,
        ...(object.mediaPartName ? { mediaPartName: object.mediaPartName } : {}),
        sheetsRevisionId,
        embeddedFingerprint: bytes ? sha256Base64Url(bytes) : null,
        recovery_disposition: bytes ? "normal" : "restage_required",
        snapshotPath: null,
      });
    }
    return out;
  }
  // ----- legacy path unchanged from here (existing :166-245) -----
  if (!ctx.sheets && !driveClient.listSpreadsheetSheets) return [];
  /* …existing body… */
}
```
Add `import { extractEmbeddedObjects } from "@/lib/drive/embeddedObjects";`.

- [ ] **Step 4: Run green** — `pnpm vitest run tests/sync/embeddedImagesXlsx.test.ts tests/sync/embeddedImages.test.ts` → both PASS (new XLSX path + legacy unchanged).

- [ ] **Step 5: Commit**
```bash
git add lib/sync/enrichWithDrivePins.ts tests/sync/embeddedImagesXlsx.test.ts
git commit --no-verify -m "feat(sync): self-sufficient XLSX-media extraction path in extractEmbeddedImages"
```

---

## Task 4: `fetchCurrentSheetXlsxBytes` helper

**Files:**
- Modify: `lib/drive/fetch.ts` (new export)
- Create: `tests/drive/fetchCurrentSheetXlsxBytes.test.ts`

**Interfaces — Produces:** `export async function fetchCurrentSheetXlsxBytes(driveFileId: string, options?: DriveFetchOptions): Promise<ArrayBuffer>`.

- [ ] **Step 1: Write the failing test** — inject `options.drive`, `options.fetch`, `options.getAccessToken`; assert it returns the exported bytes and throws `DriveFetchError` if the binding token changes between before/after (mirror the tests around `fetchSheetMarkdownAndBytesAtRevision`). Model the mock `drive.files.get` on the existing fetch tests.

- [ ] **Step 2: Run red** — `pnpm vitest run tests/drive/fetchCurrentSheetXlsxBytes.test.ts` → FAIL (undefined export).

- [ ] **Step 3: Implement** (mirror `fetchSheetMarkdownAndBytesAtRevision:452-498` minus the caller `revisionId` and the markdown synth):
```ts
export async function fetchCurrentSheetXlsxBytes(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<ArrayBuffer> {
  const drive = options.drive ?? getDriveClient();
  const before = await fetchFileForExport(driveFileId, drive, options.retry, options.metadataTimeoutMs);
  const token = bindingToken(before);
  const exportUrl = before.exportLinks?.[XLSX_EXPORT_MIME_TYPE];
  if (!exportUrl) throw new DriveFetchError(`Drive revision token ${token} for ${driveFileId} did not include an xlsx export link`);
  const accessToken = await (options.getAccessToken ?? getDriveAccessToken)();
  const fetchImpl = options.fetch ?? fetch;
  const bytes = await fetchXlsxExportBytes(exportUrl, accessToken, fetchImpl, options.exportTimeoutMs ?? DRIVE_EXPORT_TIMEOUT_MS, options.retry);
  const after = await fetchFileForExport(driveFileId, drive, options.retry, options.metadataTimeoutMs);
  if (bindingToken(after) !== token) throw new DriveFetchError(`Drive revision token for ${driveFileId} changed during xlsx export`);
  return bytes;
}
```

- [ ] **Step 4: Run green** — → PASS.

- [ ] **Step 5: Commit** — `feat(drive): fetchCurrentSheetXlsxBytes current-export helper`

---

## Task 5: Apply port XLSX branch + memoized wiring

**Files:**
- Modify: `lib/sync/defaultSnapshotAssetsForApply.ts:37-60` (port body), `:114-137` (wiring)
- Create: `tests/sync/snapshotAssetsXlsxMedia.test.ts`

**Interfaces — Consumes:** `findMediaByFingerprint` (Task 1), `fetchCurrentSheetXlsxBytes` (Task 4). **Produces:** `snapshotFetchEmbeddedImageBytesTimed` accepts `deps.fetchXlsxBytes?: () => Promise<ArrayBuffer>` and resolves XLSX-media entries.

- [ ] **Step 1: Write the failing test** — drive `snapshotAssets` (or the port directly) with a persisted entry `{ contentUrl: null, mediaPartName: "xl/media/imageA.png", embeddedFingerprint: <DIAGRAMS PNG_A hash>, recovery_disposition: "normal" }` and an injected `fetchXlsxBytes` returning the fixture. Assert:
  - upload happens; `snapshotPath` set;
  - an entry whose fingerprint matches ONLY an INFO-tab image (inject a variant fixture, or use the INFO fingerprint) → no upload, `snapshotPath: null` (tab-scoping);
  - `fetchXlsxBytes` throwing → port returns null, Apply not aborted;
  - `fetchXlsxBytes` called once for two XLSX-media entries (memo).

- [ ] **Step 2: Run red** → FAIL (port returns null for null-contentUrl).

- [ ] **Step 3: Implement** — port body (insert before the existing `if (!entry.contentUrl) return null;`):
```ts
export async function snapshotFetchEmbeddedImageBytesTimed(entry, deps = {}): Promise<SnapshotAssetBytes | null> {
  if (!entry.contentUrl) {
    if (!entry.mediaPartName || !deps.fetchXlsxBytes) return null;
    try {
      const xlsx = await deps.fetchXlsxBytes();
      return findMediaByFingerprint(xlsx, entry.mediaPartName, entry.embeddedFingerprint);
    } catch {
      return null;
    }
  }
  // …existing contentUrl branch unchanged…
}
```
Extend the `deps` type with `fetchXlsxBytes?: () => Promise<ArrayBuffer>`. Wiring in `makeSnapshotAssetsForApply` returned function (before `snapshotAssets({...})`):
```ts
let xlsxOnce: Promise<ArrayBuffer> | null = null;
const fetchXlsxBytes = () => (xlsxOnce ??= fetchCurrentSheetXlsxBytes(args.driveFileId, { drive }));
// …
drive: {
  fetchEmbeddedImageBytes: (entry) => snapshotFetchEmbeddedImageBytesTimed(entry, { fetchXlsxBytes }),
  fetchLinkedRevisionBytes: (entry) => snapshotFetchLinkedRevisionBytesTimed(entry, { drive }),
},
```
Imports: `findMediaByFingerprint` from `@/lib/drive/embeddedObjects`, `fetchCurrentSheetXlsxBytes` from `@/lib/drive/fetch`.

- [ ] **Step 4: Run green** → PASS. Also run `pnpm vitest run tests/sync/snapshotAssets.test.ts` (existing linked/contentUrl behavior unchanged).

- [ ] **Step 5: Commit** — `feat(assets): Apply-time XLSX-media byte re-export (tab-scoped, memoized)`

---

## Task 6: Recovery port XLSX branch + `driveFileId` threading

**Files:**
- Modify: `lib/sync/assetRecovery.ts` — `AssetRecoveryDrive.fetchEmbeddedImageBytes` options type (`:42-46`); `collectVerifiedAssets` signature (`:300-304`) + call site (`:445`) + port call (`:343`); `fetchEmbeddedImageBytesTimed` deps (`:192-196`) + XLSX branch; `defaultRecover` wiring (`:760-764`)
- Create: `tests/sync/assetRecoveryXlsxMedia.test.ts`

**Interfaces — Consumes:** `findMediaByFingerprint`, `fetchCurrentSheetXlsxBytes`. **Produces:** recovery resolves XLSX-media entries given `driveFileId`.

- [ ] **Step 1: Write the failing test** — call `assetRecovery(showId, deps)` (or `collectVerifiedAssets` directly) with a `previewShow` carrying `driveFileId` and a persisted unresolved XLSX-media entry; inject a `drive.fetchEmbeddedImageBytes` that forwards to the real `fetchEmbeddedImageBytesTimed` with an injected `fetchXlsxBytes`. Assert: the entry resolves; a run with `driveFileId` undefined does not re-export (returns null); legacy `restage_required`/null-`mediaPartName` entries stay skipped; tab-scoping holds (INFO fingerprint → null).

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement** per spec §8.4:
  1. `AssetRecoveryDrive.fetchEmbeddedImageBytes(entry, options?: { onChunk?: (n: number) => void; driveFileId?: string })`.
  2. `collectVerifiedAssets(showId: string, driveFileId: string, diagrams, deps)`; caller at `:445` passes `previewShow.driveFileId`.
  3. Port call `:343`: `deps.drive.fetchEmbeddedImageBytes(entry, { onChunk: acceptChunk, driveFileId })`.
  4. `fetchEmbeddedImageBytesTimed(entry, options, deps)` — add `deps.fetchXlsxBytes?`; XLSX branch identical to Task 5 (before the `if (!entry.contentUrl) return null;`).
  5. `defaultRecover` (`:760-764`):
```ts
const xlsxByShow = new Map<string, Promise<ArrayBuffer>>();
// …
drive: {
  fetchEmbeddedImageBytes: (entry, options) =>
    fetchEmbeddedImageBytesTimed(entry, options, {
      fetchXlsxBytes: options?.driveFileId
        ? () => {
            const id = options.driveFileId!;
            let p = xlsxByShow.get(id);
            if (!p) { p = fetchCurrentSheetXlsxBytes(id, { drive }); xlsxByShow.set(id, p); }
            return p;
          }
        : undefined,
    }),
  fetchLinkedRevisionBytes: (entry, options) => fetchLinkedRevisionBytesTimed(entry, options, { drive }),
},
```

- [ ] **Step 4: Run green** → PASS. Run `pnpm vitest run tests/sync/assetRecovery.test.ts` (existing behavior unchanged).

- [ ] **Step 5: Commit** — `feat(assets): recovery-time XLSX-media re-export via threaded driveFileId`

---

## Task 7: Write-through wiring (cron, onboarding, retry, wizard-restage)

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts:2580-2586` (cron ctx)
- Modify: `lib/sync/runOnboardingScan.ts:161-165` (DI type), `:947-951` (ctx)
- Modify: `app/api/admin/pending-ingestions/[id]/retry/route.ts:159,170-173`
- Modify: `lib/sync/applyStaged.ts:1601-1605` (wizard-restage injected fetch)
- Tests: extend the relevant existing suites (`runScheduledCronSync.test.ts`, `runOnboardingScan.test.ts`, retry-route test, `applyStaged.test.ts`) — each asserts an applied ParseResult now carries embedded images from a fixture export.

- [ ] **Step 1: Write failing tests** — one per path, each injecting the fixture bytes and asserting `parseResult.diagrams.embeddedImages.length > 0` (derive count from the fixture). For cron/onboarding, inject via the existing `deps.fetchXlsxBytes`/`fetchMarkdownWithBinding` seams. State the concrete failure each catches: "path X silently drops embedded diagrams."

- [ ] **Step 2: Run red** → FAIL.

- [ ] **Step 3: Implement**
  - **Cron** (`:2581-2586`): add `...(xlsxBytes !== undefined ? { xlsxBytes } : {})` to the ctx object. (`xlsxBytes` is in scope at `:2491`/`:2511`.)
  - **Onboarding DI type** (`:164`): `ctx: { driveFileId: string; fileMeta: DriveFileMeta; binding: Phase1Binding; xlsxBytes?: ArrayBuffer }`.
  - **Onboarding ctx** (`:947-951`): add `...(bytes ? { xlsxBytes: bytes } : {})`.
  - **Retry route** (`:159`): swap `fetchSheetAsMarkdownAtRevision` → `fetchSheetMarkdownAndBytesAtRevision` (returns `{ markdown, bytes }`); at `:170-173` add `...(bytes !== undefined ? { xlsxBytes: bytes } : {})` (destructure `bytes` from the fetch).
  - **Wizard-restage** (`applyStaged.ts:1601-1605`): change the injected `fetchMarkdownWithBinding` to use `fetchSheetMarkdownAndBytesAtRevision` and return `{ binding, markdown, bytes }`.

- [ ] **Step 4: Run green** → PASS for all four; run the full sync suite `pnpm vitest run tests/sync/` and confirm no regression.

- [ ] **Step 5: Commit** — `feat(sync): thread XLSX bytes through cron, onboarding, retry, and wizard-restage`

---

## Task 8: Regression contracts + live smoke

**Files:**
- Verify green (no edits expected): `tests/sync/defaultDriveClientSheetsFieldsMask.test.ts`, `tests/sync/realSheetsListSpreadsheetSheetsSmoke.test.ts`, `tests/sync/_storageWriteSurfaceContract.test.ts`, `tests/sync/driveClientImplCompleteness.test.ts`, `tests/sync/embeddedImages.test.ts`
- Create: `tests/drive/embeddedObjectsLiveSmoke.test.ts` (opt-in, gated behind an env flag / gsheets availability; skipped in normal CI)

- [ ] **Step 1: Run the regression contracts** — `pnpm vitest run tests/sync/defaultDriveClientSheetsFieldsMask.test.ts tests/sync/_storageWriteSurfaceContract.test.ts tests/sync/driveClientImplCompleteness.test.ts tests/sync/embeddedImages.test.ts` → all PASS. If `_storageWriteSurfaceContract` flags `embeddedObjects.ts`, the module accidentally contains a `diagram-snapshots/shows` literal — remove it. If the fields-mask source guard flags `drawings` in cron/onboarding source, move the term out.

- [ ] **Step 2: Add the live smoke** — `describe.skipIf(!process.env.FXAV_LIVE_SHEETS)('…')`: export a real test-show XLSX (folder `1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C`, a `VB`-series standardized-template show to avoid real venue data) and assert `extractEmbeddedObjects(bytes).objectsByTab` has ≥1 DIAGRAMS raster object whose bytes hash-match. This guards the mocked-only-tautology class.

- [ ] **Step 3: Commit** — `test(drive): live-sheets smoke for embedded-object extraction`

---

## Task 9: Full-suite + typecheck gate

- [ ] **Step 1:** `pnpm typecheck` → no new errors (vitest strips types; catch `exactOptional` / signature drifts here).
- [ ] **Step 2:** `pnpm vitest run` (FULL) → green except the known env-gated failures (list in Global Constraints); verify any other red also fails at the merge-base before proceeding.
- [ ] **Step 3:** No commit (verification only), unless a fix is needed — then commit it with a `fix(...)` message and its own failing-first test.

---

## Post-implementation (planning-workflow steps, not plan tasks)

- **Self-review** the diff against the spec's §16 citations + this plan.
- **Adversarial review (cross-model):** Codex whole-diff review, fresh-eyes, REVIEWER ONLY, iterate to APPROVE (no round budget). Triage via deferral discipline (land-now / `DEFERRED.md` / `BACKLOG.md`).
- **Execution handoff:** push → real CI green → `gh pr merge --merge` → fast-forward local `main` (verify `rev-list --left-right --count main...origin/main` == `0  0`).
