// @vitest-environment jsdom
/**
 * DataQualityBadge coverage for PULL_SHEET_ON_ARCHIVED_TAB (spec §3, §15 test 11).
 *
 * Folded into Task 4 so it is genuinely FAIL-FIRST: the expected count is DERIVED
 * from summarizeDataGaps (the data source, per the anti-tautology rule), NOT
 * hardcoded. Before GAP_CLASSES has the code, summarizeDataGaps(...).total === 0,
 * the badge early-returns null (its clean state), and the "counts the archived-tab
 * warning" intent fails (the testid element is absent). After the Task 4 edit the
 * total is 1 and the badge renders that count in its accessible name.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
import { summarizeDataGaps } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

describe("DataQualityBadge — PULL_SHEET_ON_ARCHIVED_TAB", () => {
  it("counts a PULL_SHEET_ON_ARCHIVED_TAB warning (derived from summarizeDataGaps, not hardcoded)", () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "PULL_SHEET_ON_ARCHIVED_TAB", message: "x" } as ParseWarning,
    ];
    const summary = summarizeDataGaps(warnings);
    const expectedTotal = summary.total; // 0 before the class exists, 1 after
    render(<DataQualityBadge slug="arch-tab" dataGaps={summary} />);
    // Fail-first: when expectedTotal === 0 the badge is null and getByTestId throws.
    const badge = screen.getByTestId("shows-data-quality-arch-tab");
    const label = badge.getAttribute("aria-label") ?? "";
    expect(label).toContain(String(expectedTotal));
    expect(label).toContain("pull sheet on archived tab"); // plain-language label, not the raw code
  });
});
