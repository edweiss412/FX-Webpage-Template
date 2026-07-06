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
  DATA_GAP_CODES,
  GAP_CLASSES,
  formatDataGapBreakdown,
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

// A summary whose `classes` has every GAP_CLASSES key at 0 EXCEPT the given
// overrides — derived from the registry so the expectation tracks the real set
// (anti-tautology: never hardcode the 23-key shape).
const classesWith = (overrides: Record<string, number>): Record<string, number> =>
  Object.fromEntries(GAP_CLASSES.map((g) => [g.code, overrides[g.code] ?? 0]));

describe("GAP_CLASSES registry (single source of truth)", () => {
  it("has exactly 23 entries and includes the newly-counted codes", () => {
    expect(GAP_CLASSES).toHaveLength(23);
    expect(DATA_GAP_CODES.size).toBe(23);
    for (const c of [
      "UNKNOWN_FIELD",
      "SCHEDULE_TIME_UNPARSED",
      "AGENDA_LINK_NOT_CLICKABLE",
      "UNKNOWN_STAGE_RESTRICTION",
    ]) {
      expect(DATA_GAP_CODES.has(c)).toBe(true);
    }
  });

  it("labels satisfy invariant 5 — no raw code token ever renders", () => {
    for (const { code, label } of GAP_CLASSES) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(code); // not the raw code
      expect(label).not.toContain("_"); // no snake_case
      expect(label).not.toMatch(/[A-Z0-9]{2,}_/); // no SCREAMING_SNAKE token
      expect(label[0]).toBe(label[0]!.toLowerCase()); // starts lowercase (mid-sentence)
      // Plain-language acronyms like "PDF" ARE allowed (Codex plan R1): do NOT assert lowercase-only.
    }
    expect(DATA_GAP_CLASS_LABELS.AGENDA_PDF_UNREADABLE).toContain("PDF");
  });
});

describe("summarizeDataGaps", () => {
  it("counts the full gap class, keyed by code", () => {
    const warnings: ParseWarning[] = [
      warn("FIELD_UNREADABLE"),
      warn("FIELD_UNREADABLE"),
      warn("UNKNOWN_SECTION_HEADER"),
      warn("BLOCK_DISAPPEARED"),
      warn("UNKNOWN_FIELD"),
      warn("SCHEDULE_TIME_UNPARSED"),
    ];
    const out = summarizeDataGaps(warnings);
    expect(out.total).toBe(6);
    expect(out.classes).toEqual(
      classesWith({
        FIELD_UNREADABLE: 2,
        UNKNOWN_SECTION_HEADER: 1,
        BLOCK_DISAPPEARED: 1,
        UNKNOWN_FIELD: 1,
        SCHEDULE_TIME_UNPARSED: 1,
      }),
    );
  });

  it("counts EVERY gap class once when given one warn per code (derived from registry)", () => {
    const oneEach = GAP_CLASSES.map((g) => warn(g.code));
    const out = summarizeDataGaps(oneEach);
    expect(out.total).toBe(GAP_CLASSES.length); // 23
    for (const { code } of GAP_CLASSES) expect(out.classes[code]).toBe(1);
  });

  it("does NOT count benign warn-severity autocorrects, info codes, or asset codes (allow-list, not severity)", () => {
    const out = summarizeDataGaps([
      warn("UNKNOWN_FIELD"), // counted gap
      warn("STAGE_WORD_AUTOCORRECTED"), // warn autocorrect — benign, NOT counted
      warn("DAY_RESTRICTION_DOUBLE_LOCATION", "info"), // info — NOT counted
      warn("REEL_DRIFTED"), // warn asset — NOT counted
    ]);
    expect(out.total).toBe(1); // only UNKNOWN_FIELD
    expect(out.classes.UNKNOWN_FIELD).toBe(1);
  });

  it("excludes severity:'info' warnings even when the code is a gap class", () => {
    const out = summarizeDataGaps([
      warn("FIELD_UNREADABLE", "info"),
      warn("UNKNOWN_SECTION_HEADER"),
    ]);
    expect(out.total).toBe(1);
    expect(out.classes.FIELD_UNREADABLE).toBe(0);
    expect(out.classes.UNKNOWN_SECTION_HEADER).toBe(1);
  });

  it("counts a gap code whose warning is MISSING severity (preserves #289 contract: skip only info)", () => {
    const out = summarizeDataGaps([
      { code: "UNKNOWN_FIELD", message: "x" } as unknown as ParseWarning,
    ]);
    expect(out.total).toBe(1);
  });

  it("returns {total:0, all keys 0} for empty / null / undefined", () => {
    expect(summarizeDataGaps([])).toEqual({ total: 0, classes: classesWith({}) });
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
    expect(dataGapClassDetails(summary)).toEqual([
      { key: "FIELD_UNREADABLE", count: 2, label: "unreadable fields" },
      { key: "BLOCK_DISAPPEARED", count: 1, label: "removed section" },
    ]);
  });

  it("orders by registry position and pluralizes acronym labels correctly", () => {
    const summary = summarizeDataGaps([
      warn("AGENDA_PDF_UNREADABLE"),
      warn("AGENDA_PDF_UNREADABLE"),
    ]);
    expect(dataGapClassDetails(summary)).toEqual([
      { key: "AGENDA_PDF_UNREADABLE", count: 2, label: "unreadable agenda PDFs" },
    ]);
  });

  it("returns [] when the summary total is 0", () => {
    expect(dataGapClassDetails(summarizeDataGaps([]))).toEqual([]);
  });

  it("labels never expose the raw §12.4 code literal (invariant 5)", () => {
    for (const [code, label] of Object.entries(DATA_GAP_CLASS_LABELS)) {
      expect(label).not.toContain(code);
      expect(label).not.toContain("_");
    }
  });
});

describe("formatDataGapBreakdown — bounded, single-sourced breakdown string", () => {
  it("joins classes count-desc then registry order, no cap when <= cap", () => {
    const summary = summarizeDataGaps([
      warn("UNKNOWN_SECTION_HEADER"),
      warn("FIELD_UNREADABLE"),
      warn("FIELD_UNREADABLE"),
    ]);
    expect(formatDataGapBreakdown(summary)).toBe("2 unreadable fields, 1 unknown section");
  });

  it("caps at `cap` classes and appends '+N more' when there are more", () => {
    // 6 distinct classes, each count 1 → cap 4 → 4 listed + '+2 more'
    const codes = GAP_CLASSES.slice(0, 6).map((g) => g.code);
    const summary = summarizeDataGaps(codes.map((c) => warn(c)));
    const out = formatDataGapBreakdown(summary, 4);
    expect(out).toMatch(/, \+2 more$/);
    // exactly 4 class-phrases before the "+N more"
    expect(out.split(", +")[0]!.split(", ")).toHaveLength(4);
  });

  it("breaks count ties by registry order (deterministic)", () => {
    // FIELD_UNREADABLE precedes UNKNOWN_SECTION_HEADER in GAP_CLASSES; equal counts
    const summary = summarizeDataGaps([warn("UNKNOWN_SECTION_HEADER"), warn("FIELD_UNREADABLE")]);
    expect(formatDataGapBreakdown(summary)).toBe("1 unreadable field, 1 unknown section");
  });

  it("returns '' for total 0 or cap<=0", () => {
    expect(formatDataGapBreakdown(summarizeDataGaps([]))).toBe("");
    expect(formatDataGapBreakdown(summarizeDataGaps([warn("UNKNOWN_FIELD")]), 0)).toBe("");
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
