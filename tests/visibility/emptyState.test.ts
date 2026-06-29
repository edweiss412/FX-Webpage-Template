/**
 * Unit tests for the per-field empty-state predicate table (M4 Task 4.14).
 *
 * `lib/visibility/emptyState.ts` exposes:
 *   - `shouldHideOpeningReel(value)`  — opening_reel-specific (treats `TBD`
 *      and any cell that URL-strips to empty as hide; preserves `N/A`,
 *      `MAYBE`, `BACKUP ONLY`, etc., per §10).
 *   - `shouldHideGenericOptional(value)` — generic optional fields (power,
 *      internet, keynote_requirements, scenic, ...). Hides `''`, `'TBD'`,
 *      `'N/A'`, `'TBA'` (case-insensitive after trim).
 *
 * Why two predicates? The plan task 4.14 explicitly calls out that the
 * blanket "hide all sentinels" rule is wrong for `opening_reel`: spec §10
 * says `N/A` is a documented status that MUST render as
 * "Opening reel: N/A".
 */
import { describe, expect, test } from "vitest";
import {
  shouldHideDiagrams,
  shouldHideGenericOptional,
  shouldHideOpeningReel,
} from "@/lib/visibility/emptyState";

describe("shouldHideOpeningReel", () => {
  test("null is hidden", () => {
    expect(shouldHideOpeningReel(null)).toBe(true);
  });

  test("empty string is hidden", () => {
    expect(shouldHideOpeningReel("")).toBe(true);
    expect(shouldHideOpeningReel("   ")).toBe(true);
  });

  test("`TBD` is hidden (case-insensitive)", () => {
    expect(shouldHideOpeningReel("TBD")).toBe(true);
    expect(shouldHideOpeningReel("tbd")).toBe(true);
    expect(shouldHideOpeningReel(" Tbd ")).toBe(true);
  });

  test("`YES`, `MAYBE`, `BACKUP ONLY`, `LOOP VIDEO` render (not hidden)", () => {
    expect(shouldHideOpeningReel("YES")).toBe(false);
    expect(shouldHideOpeningReel("MAYBE")).toBe(false);
    expect(shouldHideOpeningReel("BACKUP ONLY")).toBe(false);
    expect(shouldHideOpeningReel("LOOP VIDEO")).toBe(false);
  });

  test("`N/A` and `TBA` are NAMED statuses per §10 — render, NOT hidden", () => {
    // Critical: this is the documented diff from `shouldHideGenericOptional`.
    expect(shouldHideOpeningReel("N/A")).toBe(false);
    expect(shouldHideOpeningReel("TBA")).toBe(false);
  });

  test("URL-stripped residue drives hide vs render", () => {
    // YES + URL → residue `YES` → render
    expect(shouldHideOpeningReel("YES - https://drive.google.com/file/d/abc/view")).toBe(false);
    // pure URL → residue empty → hide
    expect(shouldHideOpeningReel("https://drive.google.com/file/d/abc/view")).toBe(true);
    // pure docs.google.com URL → residue empty → hide
    expect(shouldHideOpeningReel("https://docs.google.com/document/d/abc/edit")).toBe(true);
  });
});

describe("shouldHideGenericOptional", () => {
  test("null/empty/whitespace are hidden", () => {
    expect(shouldHideGenericOptional(null)).toBe(true);
    expect(shouldHideGenericOptional("")).toBe(true);
    expect(shouldHideGenericOptional("  ")).toBe(true);
  });

  test("`TBD`, `N/A`, `TBA` are hidden (case-insensitive after trim)", () => {
    expect(shouldHideGenericOptional("TBD")).toBe(true);
    expect(shouldHideGenericOptional("tbd")).toBe(true);
    expect(shouldHideGenericOptional("N/A")).toBe(true);
    expect(shouldHideGenericOptional("n/a")).toBe(true);
    expect(shouldHideGenericOptional("TBA")).toBe(true);
    expect(shouldHideGenericOptional(" tba ")).toBe(true);
  });

  test("dash placeholders `-` and `—` are hidden (gear-parser-fidelity Task 7)", () => {
    expect(shouldHideGenericOptional("-")).toBe(true);
    expect(shouldHideGenericOptional("—")).toBe(true);
    expect(shouldHideGenericOptional(" - ")).toBe(true);
  });

  test("real content renders (not hidden)", () => {
    expect(shouldHideGenericOptional("House power, 20A")).toBe(false);
    expect(shouldHideGenericOptional("Wi-Fi: FXAV-Show / pw fxav2026")).toBe(false);
    expect(shouldHideGenericOptional("Black drape, 24x12")).toBe(false);
  });
});

describe("shouldHideDiagrams (M9 C6 / M7-D5)", () => {
  // Agenda relocated to the Schedule section (§4.6) — Diagrams now hides on
  // diagram content ALONE; `agenda_links` no longer factors in (single-arg).
  test("no diagram content → hide (whole-tile-missing)", () => {
    expect(shouldHideDiagrams(null)).toBe(true);
    expect(shouldHideDiagrams({ embeddedImages: [], linkedFolderItems: [] })).toBe(true);
  });

  test("diagrams.embeddedImages non-empty → render (don't hide)", () => {
    expect(shouldHideDiagrams({ embeddedImages: [{}], linkedFolderItems: [] })).toBe(false);
  });

  test("diagrams.linkedFolderItems non-empty → render (don't hide)", () => {
    expect(shouldHideDiagrams({ embeddedImages: [], linkedFolderItems: [{}] })).toBe(false);
  });

  test("undefined diagrams fields tolerated", () => {
    expect(shouldHideDiagrams({})).toBe(true);
  });
});
