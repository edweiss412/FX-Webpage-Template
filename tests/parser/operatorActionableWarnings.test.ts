import { describe, it, expect } from "vitest";
import { OPERATOR_ACTIONABLE_ANCHORED, operatorActionableWarnings } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

const anchor = { title: "INFO", gid: 0, a1: "C2" };

describe("OPERATOR_ACTIONABLE_ANCHORED + selector", () => {
  it("contains exactly the twenty codes", () => {
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
      "UNKNOWN_STAGE_RESTRICTION",
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

  it("FIELD_UNREADABLE: distinct crew rows sharing a fallback region anchor both survive (idx32 duplicate name)", () => {
    // Duplicate crew names cannot be uniquely name-resolved, so BOTH rows degrade to the same
    // shared crew-region anchor. Without the per-row index in the FIELD_UNREADABLE dedup key
    // they collapse to one, hiding the second unreadable field. Distinct indices → both survive.
    const region = { title: "INFO", gid: 0, a1: "B7" };
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "row0",
        sourceCell: region,
        blockRef: { kind: "crew", index: 0 },
      },
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "row1",
        sourceCell: region,
        blockRef: { kind: "crew", index: 1 },
      },
    ];
    expect(operatorActionableWarnings(ws).map((w) => w.message)).toEqual(["row0", "row1"]);
  });

  it("FIELD_UNREADABLE: the SAME row (same index + shared anchor) still dedups to one", () => {
    const region = { title: "INFO", gid: 0, a1: "B7" };
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "dup",
        sourceCell: region,
        blockRef: { kind: "crew", index: 0 },
      },
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "dup",
        sourceCell: region,
        blockRef: { kind: "crew", index: 0 },
      },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(1);
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

describe("PULL_SHEET_ON_ARCHIVED_TAB decision pin (spec 2026-07-23 §2.2)", () => {
  // DECISION PIN (not TDD red/green): the published-show archived-tab include offer relies on
  // StagedReviewCard surfaces NEVER rendering this warning (they show only anchored actionable
  // items). If someone adds the code here, the catalog helpfulContext sentence ("the Gear
  // section on this page offers to include it") would render — and lie — on staged surfaces.
  // Resurfacing that would re-open the §2.2 no-change scope decision.
  it("is deliberately NOT in the operator-actionable anchored set", () => {
    expect(OPERATOR_ACTIONABLE_ANCHORED.has("PULL_SHEET_ON_ARCHIVED_TAB")).toBe(false);
  });
});

describe("FIELD_UNREADABLE field fold (crewwarn-instance-discriminator §2.1)", () => {
  const cell = { title: "II", gid: 7, a1: "B9" };
  const base = {
    severity: "warn" as const,
    code: "FIELD_UNREADABLE" as const,
    message: "m",
    sourceCell: cell,
  };

  it("same-member phone+email with one shared anchor BOTH survive (field fold)", () => {
    const ws: ParseWarning[] = [
      { ...base, rawSnippet: "no digits", blockRef: { kind: "crew", index: 2, name: "Jordan", field: "phone" } },
      { ...base, rawSnippet: "no at", blockRef: { kind: "crew", index: 2, name: "Jordan", field: "email" } },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(2);
  });

  it("fold uses the RAW field string untrimmed: padded vs unpadded field both survive", () => {
    const ws: ParseWarning[] = [
      { ...base, rawSnippet: "x", blockRef: { kind: "crew", index: 2, name: "J", field: "phone" } },
      { ...base, rawSnippet: "y", blockRef: { kind: "crew", index: 2, name: "J", field: " phone " } },
    ];
    // Raw-string fold (identity/dedup keys never trim); a trimming implementation collapses these.
    expect(operatorActionableWarnings(ws)).toHaveLength(2);
  });

  it("legacy field-less pair keeps today's collapse (backward compat)", () => {
    const ws: ParseWarning[] = [
      { ...base, rawSnippet: "x", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
      { ...base, rawSnippet: "y", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
    ];
    expect(operatorActionableWarnings(ws)).toHaveLength(1);
  });

  it("presence delimiter: field-less vs present-but-empty field are distinct keys (both survive)", () => {
    const ws: ParseWarning[] = [
      { ...base, rawSnippet: "x", blockRef: { kind: "crew", index: 2, name: "Jordan" } },
      { ...base, rawSnippet: "y", blockRef: { kind: "crew", index: 2, name: "Jordan", field: "" } },
    ];
    // The NUL delimiter makes "" a PRESENT discriminator; without it this pair aliases and collapses.
    expect(operatorActionableWarnings(ws)).toHaveLength(2);
  });
});
