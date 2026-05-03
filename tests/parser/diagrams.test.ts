import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseDiagrams } from "@/lib/parser/diagrams";

const ALL_FIXTURES = [
  "fixtures/shows/raw/2024-05-east-coast-family-office.md",
  "fixtures/shows/raw/2025-03-dci-rpas-central.md",
  "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
  "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
  "fixtures/shows/raw/2025-06-ria-investment-forum.md",
  "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
  "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
  "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
] as const;

// ── Synthetic: folder URL detection ───────────────────────────────────────────
describe("parseDiagrams — folder URL extraction", () => {
  it("extracts driveFolderId and driveFolderUrl from a Drive folders URL", () => {
    const md = `| DIagrams | https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt/view |`;
    const result = parseDiagrams(md);
    expect(result.linkedFolder).toEqual({
      driveFolderId: "1AbCdEfGhIjKlMnOpQrSt",
      driveFolderUrl: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt/view",
    });
  });

  it("extracts driveFolderId from URL embedded in longer cell text", () => {
    const md = `| DIagrams | LINK: https://drive.google.com/drive/folders/folderXYZ123?usp=sharing |`;
    const result = parseDiagrams(md);
    expect(result.linkedFolder?.driveFolderId).toBe("folderXYZ123");
    expect(result.linkedFolder?.driveFolderUrl).toContain("folderXYZ123");
  });

  it("handles 'Diagrams' alias (capital D variant)", () => {
    const md = `| Diagrams | https://drive.google.com/drive/folders/diagAliasId/view |`;
    const result = parseDiagrams(md);
    expect(result.linkedFolder?.driveFolderId).toBe("diagAliasId");
  });

  it("handles 'DIAGRAMS' alias (all-caps variant)", () => {
    const md = `| DIAGRAMS | https://drive.google.com/drive/folders/diagCapsId/view |`;
    const result = parseDiagrams(md);
    expect(result.linkedFolder?.driveFolderId).toBe("diagCapsId");
  });
});

// ── No DIagrams tab / no URL: returns null linkedFolder ───────────────────────
describe("parseDiagrams — no DIagrams cell", () => {
  it("returns linkedFolder: null when markdown has no DIagrams row", () => {
    const result = parseDiagrams("| Some Label | Some Value |");
    expect(result.linkedFolder).toBeNull();
  });

  it("returns linkedFolder: null for empty string", () => {
    const result = parseDiagrams("");
    expect(result.linkedFolder).toBeNull();
  });

  it("returns linkedFolder: null when DIagrams cell contains only 'LINK' (no URL)", () => {
    const md = `| DIagrams | LINK |`;
    const result = parseDiagrams(md);
    expect(result.linkedFolder).toBeNull();
  });
});

// ── embeddedImages always empty (never[]) ─────────────────────────────────────
describe("parseDiagrams — embeddedImages always []", () => {
  it("embeddedImages is [] when folder URL present", () => {
    const md = `| DIagrams | https://drive.google.com/drive/folders/abc123/view |`;
    expect(parseDiagrams(md).embeddedImages).toEqual([]);
  });

  it("embeddedImages is [] when no DIagrams row", () => {
    expect(parseDiagrams("| Other | Value |").embeddedImages).toEqual([]);
  });
});

// ── linkedFolderItems always empty (never[]) ──────────────────────────────────
describe("parseDiagrams — linkedFolderItems always []", () => {
  it("linkedFolderItems is [] when folder URL present", () => {
    const md = `| DIagrams | https://drive.google.com/drive/folders/abc123/view |`;
    expect(parseDiagrams(md).linkedFolderItems).toEqual([]);
  });

  it("linkedFolderItems is [] when no DIagrams row", () => {
    expect(parseDiagrams("| Other | Value |").linkedFolderItems).toEqual([]);
  });
});

// ── Corpus coverage: embeddedImages + linkedFolderItems always [] ─────────────
// None of the corpus fixtures have an actual Drive folder URL in the DIagrams cell.
// Corpus values are "LINK" (placeholder text) or the field is absent.
// These tests verify: (1) no crash on real fixtures, (2) arrays always empty.
describe("parseDiagrams — corpus coverage", () => {
  for (const fixturePath of ALL_FIXTURES) {
    describe(fixturePath.split("/").pop()!, () => {
      const md = readFileSync(fixturePath, "utf8");
      const result = parseDiagrams(md);

      it("returns a valid shape", () => {
        expect(result).toHaveProperty("linkedFolder");
        expect(result).toHaveProperty("embeddedImages");
        expect(result).toHaveProperty("linkedFolderItems");
      });

      it("embeddedImages is always []", () => {
        expect(result.embeddedImages).toEqual([]);
      });

      it("linkedFolderItems is always []", () => {
        expect(result.linkedFolderItems).toEqual([]);
      });

      it("linkedFolder is null (no real URL in corpus)", () => {
        // All corpus DIagrams cells contain "LINK" (placeholder) or are absent — never a real URL
        expect(result.linkedFolder).toBeNull();
      });
    });
  }
});
