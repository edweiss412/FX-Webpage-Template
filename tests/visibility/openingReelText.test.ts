/**
 * Unit tests for the §10 opening-reel URL-strip helper (M4 Task 4.14).
 *
 * `stripOpeningReelText` is the single source of truth for the §10 URL-strip
 * render contract. The crew DOM MUST NEVER contain `https://`, `drive.google.com`,
 * or `docs.google.com` substrings for any opening-reel cell — even when the
 * raw spreadsheet cell does.
 *
 * Rules (per the plan task 4.14 verbatim block):
 *   - Strip `https?://(drive|docs).google.com/...` URL substrings.
 *   - Trim orphaned ` - ` connectors that survive the URL strip (leading,
 *     trailing, or both).
 *   - Collapse runs of whitespace.
 *   - `null` input → empty string (caller treats empty as hide).
 *   - Pure-URL cells (entire value is a Drive URL) → empty residue → hide.
 */
import { describe, expect, test } from "vitest";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";

describe("stripOpeningReelText (§10 URL-strip render contract)", () => {
  test("strips a `YES - <drive-url>` mixed cell down to `YES`", () => {
    expect(
      stripOpeningReelText("YES - https://drive.google.com/file/d/abc/view"),
    ).toBe("YES");
  });

  test("strips a `LOOP VIDEO - <docs-url>` cell down to `LOOP VIDEO`", () => {
    expect(
      stripOpeningReelText(
        "LOOP VIDEO - https://docs.google.com/document/d/abc/edit",
      ),
    ).toBe("LOOP VIDEO");
  });

  test("returns empty string for a pure-URL cell (entire value is Drive URL)", () => {
    expect(
      stripOpeningReelText("https://drive.google.com/file/d/abc/view"),
    ).toBe("");
  });

  test("returns empty string for a pure-docs.google.com URL cell", () => {
    expect(
      stripOpeningReelText("https://docs.google.com/document/d/abc/edit"),
    ).toBe("");
  });

  test("returns the value unchanged when no URL is present", () => {
    expect(stripOpeningReelText("YES")).toBe("YES");
    expect(stripOpeningReelText("MAYBE")).toBe("MAYBE");
    expect(stripOpeningReelText("BACKUP ONLY")).toBe("BACKUP ONLY");
  });

  test("returns empty string for null", () => {
    expect(stripOpeningReelText(null)).toBe("");
  });

  test("trims surrounding whitespace", () => {
    expect(stripOpeningReelText("  YES  ")).toBe("YES");
  });

  test("strips http (not just https) URLs", () => {
    expect(
      stripOpeningReelText("YES - http://drive.google.com/file/d/abc/view"),
    ).toBe("YES");
  });

  test("strips a leading orphan connector `- YES`", () => {
    expect(stripOpeningReelText("- YES")).toBe("YES");
  });

  test("strips a trailing orphan connector left by URL-strip `YES -`", () => {
    expect(stripOpeningReelText("YES -")).toBe("YES");
  });

  test("collapses internal whitespace runs to single spaces", () => {
    // After URL-strip the cell may have multiple consecutive spaces.
    expect(
      stripOpeningReelText(
        "YES   https://drive.google.com/file/d/abc/view   PLEASE",
      ),
    ).toBe("YES PLEASE");
  });
});
