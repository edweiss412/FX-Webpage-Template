/**
 * summarizeDataGaps — single-sourced count logic for the data-quality surfaces
 * (parse-data-quality-warnings §6). Every operator surface feeds the SAME helper
 * so the count logic is single-sourced; tests assert against the helper's INPUT
 * array (the data source), never rendered output (anti-tautology).
 */

import { describe, it, expect } from "vitest";
import {
  summarizeDataGaps,
  dataGapClassDetails,
  DATA_GAP_CLASS_LABELS,
  operatorActionableWarnings,
  OPERATOR_ACTIONABLE_ANCHORED,
  stripLegacyUnknownFieldAnchors,
  selectActionableForDisplay,
} from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

const warn = (code: string, severity: ParseWarning["severity"] = "warn"): ParseWarning => ({
  severity,
  code,
  message: `${code} message`,
});

describe("summarizeDataGaps", () => {
  it("counts each of the three data-quality classes and the total", () => {
    const warnings: ParseWarning[] = [
      warn("FIELD_UNREADABLE"),
      warn("FIELD_UNREADABLE"),
      warn("UNKNOWN_SECTION_HEADER"),
      warn("BLOCK_DISAPPEARED"),
    ];
    const out = summarizeDataGaps(warnings);
    expect(out).toEqual({
      total: 4,
      classes: {
        FIELD_UNREADABLE: 2,
        UNKNOWN_SECTION_HEADER: 1,
        BLOCK_DISAPPEARED: 1,
      },
    });
  });

  it("ignores non-data-quality warning codes (does not count them in the total)", () => {
    const warnings: ParseWarning[] = [
      warn("FIELD_UNREADABLE"),
      warn("SECTION_HEADER_NO_FIELDS"),
      warn("UNKNOWN_ROLE_TOKEN"),
    ];
    const out = summarizeDataGaps(warnings);
    expect(out.total).toBe(1);
    expect(out.classes.FIELD_UNREADABLE).toBe(1);
    expect(out.classes.UNKNOWN_SECTION_HEADER).toBe(0);
    expect(out.classes.BLOCK_DISAPPEARED).toBe(0);
  });

  it("excludes severity:'info' warnings even when the code is a data-quality class", () => {
    const warnings: ParseWarning[] = [
      warn("FIELD_UNREADABLE", "info"),
      warn("UNKNOWN_SECTION_HEADER", "warn"),
    ];
    const out = summarizeDataGaps(warnings);
    expect(out.total).toBe(1);
    expect(out.classes.FIELD_UNREADABLE).toBe(0);
    expect(out.classes.UNKNOWN_SECTION_HEADER).toBe(1);
  });

  it("returns {total:0} for an empty array", () => {
    const out = summarizeDataGaps([]);
    expect(out.total).toBe(0);
    expect(out.classes).toEqual({
      FIELD_UNREADABLE: 0,
      UNKNOWN_SECTION_HEADER: 0,
      BLOCK_DISAPPEARED: 0,
    });
  });

  it("returns {total:0} for null / undefined input", () => {
    expect(summarizeDataGaps(null).total).toBe(0);
    expect(summarizeDataGaps(undefined).total).toBe(0);
  });
});

describe("dataGapClassDetails — per-class breakdown for the UI surfaces", () => {
  it("emits one ordered entry per class with count>0, pluralizing the label", () => {
    const summary = summarizeDataGaps([
      warn("FIELD_UNREADABLE"),
      warn("FIELD_UNREADABLE"),
      warn("BLOCK_DISAPPEARED"),
    ]);
    // Derived from the input array, not a hardcoded shape (anti-tautology).
    expect(dataGapClassDetails(summary)).toEqual([
      { key: "FIELD_UNREADABLE", count: 2, label: "unreadable fields" },
      { key: "BLOCK_DISAPPEARED", count: 1, label: "removed section" },
    ]);
  });

  it("returns [] when the summary total is 0", () => {
    expect(dataGapClassDetails(summarizeDataGaps([]))).toEqual([]);
  });

  it("labels never expose the raw §12.4 code literal (invariant 5)", () => {
    for (const [code, label] of Object.entries(DATA_GAP_CLASS_LABELS)) {
      expect(label).not.toContain(code);
      expect(label).toMatch(/^[a-z ]+$/); // plain lowercase words only
    }
  });
});

describe("SCHEDULE_STRIKE_DATE_OFF_SCHEDULE — operator-actionable surfacing", () => {
  it("is a member of OPERATOR_ACTIONABLE_ANCHORED and survives the selector", () => {
    expect(OPERATOR_ACTIONABLE_ANCHORED.has("SCHEDULE_STRIKE_DATE_OFF_SCHEDULE")).toBe(true);
    const out = operatorActionableWarnings([
      {
        severity: "warn",
        code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
        message: "x",
        blockRef: { kind: "rooms", iso: "2025-05-20" },
      },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("stripLegacyUnknownFieldAnchors (Part D)", () => {
  const legacy = (): ParseWarning[] => [
    {
      severity: "warn",
      code: "UNKNOWN_FIELD",
      message: "a",
      rawSnippet: "Floor Plan | LINK",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" },
    },
    {
      severity: "warn",
      code: "UNKNOWN_FIELD",
      message: "b",
      rawSnippet: "GS Podium Type | (2) Acrylic",
      sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" },
    },
  ];

  it("clears the stale range anchor on legacy UNKNOWN_FIELD", () => {
    expect(stripLegacyUnknownFieldAnchors(legacy()).every((w) => w.sourceCell === null)).toBe(true);
  });
  it("is a NO-OP for a new single-cell anchor (A56)", () => {
    const fresh: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "a",
        sourceCell: { title: "INFO", gid: 0, a1: "A56" },
      },
    ];
    expect(stripLegacyUnknownFieldAnchors(fresh)[0]!.sourceCell).toEqual({
      title: "INFO",
      gid: 0,
      a1: "A56",
    });
  });
  it("is a NO-OP for a new UNKNOWN_FIELD with EMPTY blockRef.name + single-cell anchor (R2 edge)", () => {
    const fresh: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "a",
        blockRef: { kind: "details", name: "" },
        sourceCell: { title: "INFO", gid: 0, a1: "A56" },
      },
    ];
    expect(stripLegacyUnknownFieldAnchors(fresh)[0]!.sourceCell).toEqual({
      title: "INFO",
      gid: 0,
      a1: "A56",
    });
  });
  it("does not touch other codes carrying a range anchor", () => {
    const other: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "a",
        sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" },
      },
    ];
    expect(stripLegacyUnknownFieldAnchors(other)[0]!.sourceCell).toEqual({
      title: "INFO",
      gid: 0,
      a1: "A55:B74",
    });
  });
});

describe("selectActionableForDisplay (read-boundary seam)", () => {
  it("legacy A55-range pair → 2 items, each link-less (count corrects, no stale link)", () => {
    const items = selectActionableForDisplay([
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "a",
        rawSnippet: "Floor Plan | LINK",
        sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" },
      },
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "b",
        rawSnippet: "GS Podium Type | X",
        sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" },
      },
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((w) => w.sourceCell === null)).toBe(true);
  });
  it("fresh distinct-cell pair → 2 items keeping their anchors", () => {
    const items = selectActionableForDisplay([
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "a",
        sourceCell: { title: "INFO", gid: 0, a1: "A56" },
      },
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "b",
        sourceCell: { title: "INFO", gid: 0, a1: "A65" },
      },
    ]);
    expect(items.map((w) => w.sourceCell?.a1).sort()).toEqual(["A56", "A65"]);
  });
});
