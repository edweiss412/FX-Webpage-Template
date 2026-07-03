import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { extractEmbeddedObjects, findMediaByFingerprint } from "@/lib/drive/embeddedObjects";
import { sha256Base64Url } from "@/lib/crypto/sha256";

const xlsx = (): ArrayBuffer => {
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
    // PNG_A + PNG_SHARED (deduped) = 2 raster objects; the .emf is dropped; INFO's PNG_B is not here.
    expect(diag).toHaveLength(2);
    expect(diag.every((o) => o.mimeType === "image/png")).toBe(true);
    expect(diag.every((o) => o.mediaPartName?.startsWith("xl/media/"))).toBe(true);
    expect(objectsByTab.get("INFO")).toHaveLength(1);
  });

  it("dedups a byte-identical image placed twice on a tab", () => {
    const diag = extractEmbeddedObjects(xlsx()).objectsByTab.get("DIAGRAMS")!;
    const ids = diag.map((o) => o.objectId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keys bytesByObjectId so bytes hash to the objectId suffix", () => {
    const { objectsByTab, bytesByObjectId } = extractEmbeddedObjects(xlsx());
    for (const o of objectsByTab.get("DIAGRAMS")!) {
      const bytes = bytesByObjectId.get(o.objectId)!;
      expect(o.objectId).toBe("x-" + sha256Base64Url(bytes).slice(0, 24));
    }
  });

  it("returns fresh empty maps + [] titles for malformed input (no throw, no shared state)", () => {
    const bad = new TextEncoder().encode("not a zip").buffer;
    const a = extractEmbeddedObjects(bad);
    const b = extractEmbeddedObjects(bad);
    expect(a).toEqual({ allTabTitles: [], objectsByTab: new Map(), bytesByObjectId: new Map() });
    expect(a.objectsByTab).not.toBe(b.objectsByTab); // fresh instances, not shared mutable state
  });

  it("does not throw when a relationship Target is a corrupted URL-like string", () => {
    // A malformed absolute-URL Target would make new URL(...) throw inside norm();
    // the module must stay fail-soft (skip it), not propagate (whole-diff LOW).
    const files: Record<string, Uint8Array> = {
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DIAGRAMS" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><drawing r:id="rIdD"/></worksheet>`,
      ),
      "xl/worksheets/_rels/sheet1.xml.rels": strToU8(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdD" Type="drawing" Target="http://[not-a-valid-url"/></Relationships>`,
      ),
    };
    const zip = zipSync(files, { mtime: new Date("2020-01-01T00:00:00Z") });
    const buf = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
    const result = extractEmbeddedObjects(buf);
    expect(result.allTabTitles).toEqual(["DIAGRAMS"]);
    expect(result.objectsByTab.size).toBe(0); // corrupted Target skipped, no throw
  });
});

describe("findMediaByFingerprint", () => {
  it("returns DIAGRAMS-tab bytes whose hash matches the fingerprint", () => {
    const { objectsByTab, bytesByObjectId } = extractEmbeddedObjects(xlsx());
    const target = objectsByTab.get("DIAGRAMS")![0]!;
    const fp = sha256Base64Url(bytesByObjectId.get(target.objectId)!);
    const found = findMediaByFingerprint(xlsx(), target.mediaPartName, fp);
    expect(found && sha256Base64Url(found)).toBe(fp);
  });

  it("does NOT match a fingerprint whose bytes live only on a non-DIAGRAMS tab", () => {
    const { objectsByTab, bytesByObjectId } = extractEmbeddedObjects(xlsx());
    const infoFp = sha256Base64Url(bytesByObjectId.get(objectsByTab.get("INFO")![0]!.objectId)!);
    expect(findMediaByFingerprint(xlsx(), undefined, infoFp)).toBeNull();
  });

  it("returns null on malformed input or null fingerprint", () => {
    expect(
      findMediaByFingerprint(new TextEncoder().encode("x").buffer, "xl/media/a.png", "abc"),
    ).toBeNull();
    expect(findMediaByFingerprint(xlsx(), "xl/media/a.png", null)).toBeNull();
  });
});
