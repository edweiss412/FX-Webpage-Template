/**
 * lib/drive/embeddedObjects.ts
 *
 * Extracts DIAGRAMS-tab embedded images from an exported Google Sheet's XLSX
 * (OOXML) bytes by walking the relationship graph:
 *   workbook.xml (sheet name → r:id)
 *     → workbook.xml.rels (r:id → worksheets/sheetN.xml)
 *       → sheetN.xml (<drawing r:id>) → sheetN.xml.rels (→ drawings/drawingM.xml)
 *         → drawingM.xml.rels (image rels → media/imageX.<ext>) → xl/media/imageX.<ext>
 *
 * Attribution is strictly per-tab via this graph, which is what excludes
 * INFO-tab logos and any other tab's images. Pure + synchronous: no Drive, no
 * Supabase, no Storage (so it stays off the storage-write-surface contract and
 * the Sheets-API `drawings` field-mask guard). Best-effort: malformed input
 * yields empty results, never throws.
 *
 * Google's XLSX exporter emits regular, machine-generated OOXML, so
 * attribute-targeted regex parsing is sufficient (the input is not arbitrary
 * user XML). The extractor is the single source of both extract-time discovery
 * (enrichWithDrivePins) and Apply/recovery byte re-production
 * (findMediaByFingerprint), so tab attribution can never drift between them.
 */
import { unzipSync } from "fflate";
import { sha256Base64Url } from "@/lib/crypto/sha256";

export type EmbeddedObject = {
  objectId: string; // "x-" + sha256Base64Url(bytes).slice(0,24) — content-addressed, URL-safe
  mimeType: string; // canonical raster MIME
  mediaPartName: string; // e.g. "xl/media/image3.png"
};

export type ExtractedEmbeddedObjects = {
  allTabTitles: string[]; // every worksheet title, in workbook order (incl. image-less tabs)
  objectsByTab: Map<string, EmbeddedObject[]>; // keyed by exact OOXML sheet title
  bytesByObjectId: Map<string, Uint8Array>; // objectId → raw image bytes (extract-time fingerprinting)
};

// Fresh instances per call — never share mutable Maps across malformed results (purity).
const emptyResult = (): ExtractedEmbeddedObjects => ({
  allTabTitles: [],
  objectsByTab: new Map(),
  bytesByObjectId: new Map(),
});

const RASTER: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const dec = (b?: Uint8Array): string => (b ? new TextDecoder().decode(b) : "");

/** Parse an OOXML `.rels` part into an Id → Target map (attribute order agnostic). */
function relMap(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const el of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = el[0].match(/\bId="([^"]+)"/)?.[1];
    const target = el[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) m.set(id, target);
  }
  return m;
}

/**
 * Resolve an OOXML relative Target (e.g. "../media/x.png") against the rels'
 * owning part. Returns "" for a malformed Target (e.g. a corrupted absolute
 * URL-like string) so the caller skips it — upholds the module's never-throws
 * contract even on a corrupted workbook.
 */
function norm(base: string, target: string): string {
  try {
    return new URL(target, "http://x/" + base).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

/** Path of the `.rels` companion for a part (e.g. xl/worksheets/sheet1.xml → xl/worksheets/_rels/sheet1.xml.rels). */
function relsPathFor(partPath: string): string {
  return partPath.replace(/([^/]+)$/, "_rels/$1.rels");
}

export function extractEmbeddedObjects(xlsx: ArrayBuffer): ExtractedEmbeddedObjects {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(xlsx));
  } catch {
    return emptyResult();
  }
  const wb = dec(zip["xl/workbook.xml"]);
  if (!wb) return emptyResult();
  const wbRels = relMap(dec(zip["xl/_rels/workbook.xml.rels"]));

  const result = emptyResult();
  for (const sheetEl of wb.matchAll(/<sheet\b[^>]*?\/?>/g)) {
    const el = sheetEl[0];
    const name = el.match(/\bname="([^"]*)"/)?.[1];
    if (name === undefined) continue;
    result.allTabTitles.push(name);
    const rid = el.match(/\br:id="([^"]+)"/)?.[1];
    if (!rid) continue;
    const wsTarget = wbRels.get(rid);
    if (!wsTarget) continue;
    const wsPath = norm("xl/", wsTarget); // xl/worksheets/sheetN.xml
    const wsXml = dec(zip[wsPath]);
    const drawingRid = wsXml.match(/<drawing\b[^>]*\br:id="([^"]+)"/)?.[1];
    if (!drawingRid) continue;
    const wsRels = relMap(dec(zip[relsPathFor(wsPath)]));
    const drawingTarget = wsRels.get(drawingRid);
    if (!drawingTarget) continue;
    const drawingPath = norm(wsPath, drawingTarget); // xl/drawings/drawingM.xml
    const drawingRels = relMap(dec(zip[relsPathFor(drawingPath)]));

    const seen = new Set<string>();
    const objs: EmbeddedObject[] = [];
    for (const target of drawingRels.values()) {
      if (!/(^|\/)media\//.test(target)) continue;
      const partName = norm(drawingPath, target); // xl/media/imageX.ext
      const ext = (partName.split(".").pop() ?? "").toLowerCase(); // canonicalize-exempt: OOXML media file-extension case-fold for the raster MIME map, not email
      const mimeType = RASTER[ext];
      if (!mimeType) continue; // raster-only (drops emf/wmf/svg/etc.)
      const bytes = zip[partName];
      if (!bytes) continue;
      const objectId = "x-" + sha256Base64Url(bytes).slice(0, 24);
      if (seen.has(objectId)) continue; // dedup byte-identical placements on this tab
      seen.add(objectId);
      objs.push({ objectId, mimeType, mediaPartName: partName });
      result.bytesByObjectId.set(objectId, bytes);
    }
    if (objs.length) result.objectsByTab.set(name, objs);
  }
  return result;
}

/**
 * DIAGRAMS-tab-scoped byte lookup for Apply/recovery re-export. Re-extracts,
 * resolves the DIAGRAMS tab (same case-insensitive match as extract), and
 * returns the bytes of the tab object whose content hash equals `fingerprint`
 * (`partHint` is a fast-path preference only; the fingerprint is authoritative).
 * Scoping to the tab prevents a byte-identical image on INFO/another tab from
 * being snapshotted as if it were the DIAGRAMS image. Returns null on malformed
 * input, missing tab, or no match. Never throws (callers rely on fail-soft).
 */
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
  const ordered = partHint
    ? [...objs].sort((a, b) =>
        a.mediaPartName === partHint ? -1 : b.mediaPartName === partHint ? 1 : 0,
      )
    : objs;
  for (const o of ordered) {
    const bytes = bytesByObjectId.get(o.objectId);
    if (bytes && sha256Base64Url(bytes) === fingerprint) return bytes;
  }
  return null;
}
