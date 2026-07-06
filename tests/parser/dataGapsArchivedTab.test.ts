/**
 * PULL_SHEET_ON_ARCHIVED_TAB — the archived-tab pull-sheet gap class (spec §5.2,
 * §13). Task 4: this warn-severity code joins GAP_CLASSES so the data-quality
 * surfaces (badge, Step-3 card, per-show panel) count it like any other gap.
 * Fail-first: before the GAP_CLASSES edit the code is not a member and
 * summarizeDataGaps ignores it (allow-list).
 */

import { describe, it, expect } from "vitest";
import { GAP_CLASSES, DATA_GAP_CODES, summarizeDataGaps } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

describe("PULL_SHEET_ON_ARCHIVED_TAB data-gap class", () => {
  it("is a member of GAP_CLASSES with a plain-language label (invariant 5)", () => {
    const entry = GAP_CLASSES.find((g) => g.code === "PULL_SHEET_ON_ARCHIVED_TAB");
    expect(entry).toBeDefined();
    expect(entry!.label.length).toBeGreaterThan(0);
    expect(entry!.label).not.toBe(entry!.code); // never the raw code
    expect(entry!.label).not.toContain("_"); // no snake_case
  });

  it("is in DATA_GAP_CODES and counted by summarizeDataGaps", () => {
    expect(DATA_GAP_CODES.has("PULL_SHEET_ON_ARCHIVED_TAB")).toBe(true);
    const summary = summarizeDataGaps([
      { severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB", message: "x" } as ParseWarning,
    ]);
    expect(summary.classes["PULL_SHEET_ON_ARCHIVED_TAB" as keyof typeof summary.classes]).toBe(1);
    expect(summary.total).toBe(1);
  });
});
