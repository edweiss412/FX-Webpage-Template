import { describe, it, expect } from "vitest";
import { OPERATOR_ACTIONABLE_ANCHORED, operatorActionableWarnings } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

const anchor = { title: "INFO", gid: 0, a1: "C2" };

describe("OPERATOR_ACTIONABLE_ANCHORED + selector", () => {
  it("contains exactly the nineteen codes", () => {
    expect([...OPERATOR_ACTIONABLE_ANCHORED].sort()).toEqual([
      "AGENDA_BLOCK_UNRESOLVED",
      "AGENDA_DAY_AMBIGUOUS",
      "AGENDA_DAY_EMPTIED",
      "AGENDA_DAY_TRUNCATED",
      "AGENDA_GRID_MALFORMED",
      "COLUMN_HEADER_AUTOCORRECTED",
      "FIELD_LABEL_AUTOCORRECTED",
      "FIELD_UNREADABLE",
      "PULL_SHEET_AMBIGUOUS_FORMAT",
      "PULL_SHEET_PARSE_PARTIAL",
      "PULL_SHEET_UNKNOWN_VARIANT",
      "ROLE_TOKEN_AUTOCORRECTED",
      "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
      "SCHEDULE_TIME_UNPARSED",
      "SECTION_HEADER_AUTOCORRECTED",
      "STAGE_WORD_AUTOCORRECTED",
      "UNKNOWN_DAY_RESTRICTION",
      "UNKNOWN_FIELD",
      "UNKNOWN_ROLE_TOKEN",
    ]);
  });

  it("filters to the actionable set and drops non-members + info-severity", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "a", sourceCell: anchor },
      { severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "b" }, // not in set
      { severity: "info", code: "TYPO_NORMALIZED", message: "c" }, // info
    ];
    const out = operatorActionableWarnings(ws);
    expect(out.map((w) => w.code)).toEqual(["UNKNOWN_ROLE_TOKEN"]);
  });

  it("dedups by (code, resolved A1) — cascade collapses to one", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "LOAD IN", sourceCell: anchor },
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "STRKE", sourceCell: anchor },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(1);
  });

  it("never dedups warnings without a resolved anchor (stable, no hiding)", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        blockRef: { kind: "crew", index: 0 },
      },
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "y",
        blockRef: { kind: "crew", index: 1 },
      },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(2);
  });

  it("preserves parse order", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "1",
        sourceCell: { title: "INFO", gid: 0, a1: "A1" },
      },
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "2", sourceCell: anchor },
    ];
    expect(operatorActionableWarnings(ws).map((w) => w.message)).toEqual(["1", "2"]);
  });

  it("null/undefined/[] → []", () => {
    expect(operatorActionableWarnings(null)).toEqual([]);
    expect(operatorActionableWarnings(undefined)).toEqual([]);
    expect(operatorActionableWarnings([])).toEqual([]);
  });
});

describe("operatorActionableWarnings — UNKNOWN_FIELD per-row anchors (Part B)", () => {
  it("two distinct-label UNKNOWN_FIELD warnings with distinct per-row anchors both survive dedup", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_FIELD", message: "a", sourceCell: { title: "INFO", gid: 0, a1: "A56" } },
      { severity: "warn", code: "UNKNOWN_FIELD", message: "b", sourceCell: { title: "INFO", gid: 0, a1: "A65" } },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(2);
  });

  it("two UNKNOWN_FIELD warnings with NO sourceCell both survive (no a1 → no dedup)", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_FIELD", message: "a" },
      { severity: "warn", code: "UNKNOWN_FIELD", message: "b" },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(2);
  });
});
