import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractOpeningReel } from "@/lib/parser/opening-reel";

// ── AC-7.23: substring anywhere in cell ───────────────────────────────────────
describe("extractOpeningReel — AC-7.23 substring extraction", () => {
  it("extracts fileId when URL appears after text prefix", () => {
    expect(
      extractOpeningReel("YES - LOOP VIDEO https://drive.google.com/file/d/abc123/view"),
    ).toEqual({ driveFileId: "abc123" });
  });

  it("extracts fileId when URL appears at start of cell", () => {
    expect(extractOpeningReel("https://drive.google.com/file/d/abc123/view")).toEqual({
      driveFileId: "abc123",
    });
  });

  it("extracts fileId when URL appears surrounded by other text", () => {
    expect(
      extractOpeningReel(
        "Link: https://drive.google.com/file/d/XYZ_789-abc/view?usp=sharing (approved)",
      ),
    ).toEqual({ driveFileId: "XYZ_789-abc" });
  });
});

// ── AC-7.22: null for text-only or empty/null cells ───────────────────────────
describe("extractOpeningReel — AC-7.22 null returns", () => {
  it("returns null for 'MAYBE'", () => {
    expect(extractOpeningReel("MAYBE")).toBeNull();
  });

  it("returns null for 'MAYBE - LOOP VIDEO'", () => {
    expect(extractOpeningReel("MAYBE - LOOP VIDEO")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractOpeningReel("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(extractOpeningReel(null)).toBeNull();
  });

  it("returns null for 'N/A'", () => {
    expect(extractOpeningReel("N/A")).toBeNull();
  });

  it("returns null for 'TBD'", () => {
    expect(extractOpeningReel("TBD")).toBeNull();
  });
});

// ── docs.google.com URL handling ──────────────────────────────────────────────
describe("extractOpeningReel — docs.google.com variant", () => {
  it("extracts fileId from docs.google.com /d/ URL", () => {
    expect(extractOpeningReel("https://docs.google.com/file/d/xyz/edit")?.driveFileId).toBe("xyz");
  });

  it("extracts fileId from docs.google.com presentation /d/ URL", () => {
    expect(extractOpeningReel("https://docs.google.com/presentation/d/pptId123/edit")).toEqual({
      driveFileId: "pptId123",
    });
  });
});

// ── Corpus coverage ────────────────────────────────────────────────────────────
// No fixture in the corpus contains an actual Drive URL in the Opening Reel cell.
// The corpus values are: "MAYBE", "MAYBE - LOOP VIDEO", or the field is absent.
// Synthetic tests above cover URL extraction behavior.
// These corpus tests verify that real fixture values return null (no false positives).
describe("extractOpeningReel — corpus coverage (no spurious Drive URL detection)", () => {
  const FIXTURE_REEL_VALUES = [
    "MAYBE", // 2026-03-rpas-central-four-seasons
    "MAYBE - LOOP VIDEO", // 2026-04-asset-mgmt-cfo-coo-waldorf
  ] as const;

  for (const val of FIXTURE_REEL_VALUES) {
    it(`returns null for corpus value "${val}"`, () => {
      expect(extractOpeningReel(val)).toBeNull();
    });
  }
});
