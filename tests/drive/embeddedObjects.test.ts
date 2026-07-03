import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
    expect(findMediaByFingerprint(new TextEncoder().encode("x").buffer, "xl/media/a.png", "abc")).toBeNull();
    expect(findMediaByFingerprint(xlsx(), "xl/media/a.png", null)).toBeNull();
  });
});
