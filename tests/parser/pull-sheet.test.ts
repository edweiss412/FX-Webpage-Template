/**
 * Tests for parsePullSheet (§6.10, AC-4.7..4.11)
 *
 * Fixture verification (read independently before writing these assertions):
 *
 * 2024-05 line 207: header row — all 5 cells contain "PULL SHEET/East Coast Single Family Office Symposium..."
 *   Col order: [packed_flag, qty, item, sub_cat, cat]
 *   Line 209: | FALSE | 1 | FOH Rack | (blank) | FOH |
 *   Line 215: | FALSE | 2 | Ultimate Speaker Stands w Black Scrim | SPEAKERS / MONITOR | AUDIO |
 *
 * 2025-05 line 360: header row — all 5 cells contain "PULL SHEET/RIA - CHICAGO, IL..."
 *   Col order: [qty, item, sub_cat, cat, packed_flag]  (packed_flag LAST — different from 2024-05)
 *   Line 362: | 1 | FOH Rack | (blank) | FOH | FALSE |
 *
 * 2025-06 line 366: | QTY | PULLED | INITAL | CAT | SUB CAT | ITEM | NOTES | — GEAR table, NOT pull sheet
 *
 * 2026-03: no "PULL SHEET" text anywhere in file
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parsePullSheet } from "@/lib/parser/pull-sheet";

// ── Test 1: 2024-05 real pull sheet ──────────────────────────────────────────
describe("parsePullSheet — 2024-05 east coast family office", () => {
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const result = parsePullSheet(md);

  it("returns non-null result", () => {
    expect(result.pullSheet).not.toBeNull();
  });

  it("returns at least one case", () => {
    expect(result.pullSheet!.length).toBeGreaterThanOrEqual(1);
  });

  it("first case label matches /East Coast/i", () => {
    expect(result.pullSheet![0]!.caseLabel).toMatch(/East Coast/i);
  });

  it("first case has non-empty items", () => {
    expect(result.pullSheet![0]!.items.length).toBeGreaterThan(0);
  });

  it("first data row (FOH Rack) parses correctly — qty:1, item:'FOH Rack', subCat:null, cat:'FOH'", () => {
    // Fixture line 209: | FALSE | 1 | FOH Rack | (blank) | FOH |
    const firstItem = result.pullSheet![0]!.items[0]!;
    expect(firstItem.qty).toBe(1);
    expect(firstItem.item).toBe("FOH Rack");
    expect(firstItem.subCat).toBeNull();
    expect(firstItem.cat).toBe("FOH");
  });

  it("row with subCat (Ultimate Speaker Stands) parses correctly", () => {
    // Fixture line 215: | FALSE | 2 | Ultimate Speaker Stands w Black Scrim | SPEAKERS / MONITOR | AUDIO |
    const items = result.pullSheet![0]!.items;
    const found = items.find((i) => i.item === "Ultimate Speaker Stands w Black Scrim");
    expect(found).toBeDefined();
    expect(found!.qty).toBe(2);
    expect(found!.subCat).toBe("SPEAKERS / MONITOR");
    expect(found!.cat).toBe("AUDIO");
  });

  it("emits no warnings for clean fixture", () => {
    expect(result.warnings).toHaveLength(0);
  });
});

// ── Test 2: 2025-05 pull sheet (different column order) ──────────────────────
describe("parsePullSheet — 2025-05 redefining fixed income private credit", () => {
  const md = readFileSync(
    "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
    "utf8",
  );
  const result = parsePullSheet(md);

  it("returns non-null result", () => {
    expect(result.pullSheet).not.toBeNull();
  });

  it("returns at least one case", () => {
    expect(result.pullSheet!.length).toBeGreaterThanOrEqual(1);
  });

  it("first case label contains 'RIA'", () => {
    // Fixture line 360: header contains "PULL SHEET/RIA - CHICAGO, IL..."
    expect(result.pullSheet![0]!.caseLabel).toMatch(/RIA/i);
  });

  it("first case has non-empty items", () => {
    expect(result.pullSheet![0]!.items.length).toBeGreaterThan(0);
  });

  it("first data row (FOH Rack) parses correctly", () => {
    // Fixture line 362: | 1 | FOH Rack | (blank) | FOH | FALSE |
    const firstItem = result.pullSheet![0]!.items[0]!;
    expect(firstItem.qty).toBe(1);
    expect(firstItem.item).toBe("FOH Rack");
    expect(firstItem.subCat).toBeNull();
    expect(firstItem.cat).toBe("FOH");
  });
});

// ── Test 3: no PULL SHEET tab (2026-03) ──────────────────────────────────────
describe("parsePullSheet — no PULL SHEET tab (2026-03)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  const result = parsePullSheet(md);

  it("returns null when no PULL SHEET tab present", () => {
    expect(result.pullSheet).toBeNull();
  });

  it("emits no warnings", () => {
    expect(result.warnings).toHaveLength(0);
  });
});

// ── Test 4: GEAR table rejection (2025-06) ────────────────────────────────────
describe("parsePullSheet — GEAR table rejection (2025-06)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
  const result = parsePullSheet(md);

  it("returns null — GEAR table has PULLED+INITAL header, not a pull sheet", () => {
    // Fixture line 366: | QTY | PULLED | INITAL | CAT | SUB CAT | ITEM | NOTES |
    expect(result.pullSheet).toBeNull();
  });

  it("emits no warnings (GEAR rejection is silent)", () => {
    expect(result.warnings).toHaveLength(0);
  });
});

// ── Test 5: partial parse — unparseable qty emits PULL_SHEET_PARSE_PARTIAL ───
describe("parsePullSheet — partial parse (synthetic fixture)", () => {
  const md = [
    "| PULL SHEET/Partial Test | PULL SHEET/Partial Test | PULL SHEET/Partial Test | PULL SHEET/Partial Test | PULL SHEET/Partial Test |",
    "| :-: | :-: | :-: | :-: | :-: |",
    "| FALSE | 1 | Good Item | | CAT1 |",
    "| FALSE | abc | Bad Qty Item | SUB1 | CAT2 |",
    "| FALSE | 3 | Another Good Item | | CAT3 |",
  ].join("\n");

  const result = parsePullSheet(md);

  it("returns non-null result (partial parse proceeds)", () => {
    expect(result.pullSheet).not.toBeNull();
  });

  it("case label is 'Partial Test'", () => {
    expect(result.pullSheet![0]!.caseLabel).toBe("Partial Test");
  });

  it("Good Item row parses qty correctly", () => {
    const items = result.pullSheet![0]!.items;
    const good = items.find((i) => i.item === "Good Item");
    expect(good).toBeDefined();
    expect(good!.qty).toBe(1);
    expect(good!.rawSnippet).toBeUndefined();
  });

  it("Bad Qty Item row has qty:null and rawSnippet populated", () => {
    const items = result.pullSheet![0]!.items;
    const bad = items.find((i) => i.item === "Bad Qty Item");
    expect(bad).toBeDefined();
    expect(bad!.qty).toBeNull();
    expect(bad!.rawSnippet).toBeDefined();
    expect(bad!.rawSnippet).toContain("abc");
  });

  it("emits PULL_SHEET_PARSE_PARTIAL warning", () => {
    const warning = result.warnings.find((w) => w.code === "PULL_SHEET_PARSE_PARTIAL");
    expect(warning).toBeDefined();
  });

  it("PULL_SHEET_PARSE_PARTIAL warning has severity 'warn'", () => {
    const warning = result.warnings.find((w) => w.code === "PULL_SHEET_PARSE_PARTIAL");
    expect(warning!.severity).toBe("warn");
  });
});

// ── Test 6: ambiguous format — non-5-column data rows emit PULL_SHEET_AMBIGUOUS_FORMAT ─
describe("parsePullSheet — ambiguous format (synthetic fixture)", () => {
  const md = [
    "| PULL SHEET/Test | PULL SHEET/Test | PULL SHEET/Test | PULL SHEET/Test | PULL SHEET/Test |",
    "| :-: | :-: | :-: | :-: | :-: |",
    // 7-column data rows (ambiguous)
    "| FALSE | 1 | Item A | SUB | CAT | EXTRA1 | EXTRA2 |",
    "| FALSE | 2 | Item B | SUB | CAT | EXTRA1 | EXTRA2 |",
  ].join("\n");

  const result = parsePullSheet(md);

  it("returns non-null (falls back to raw-snippet rendering)", () => {
    expect(result.pullSheet).not.toBeNull();
  });

  it("case label is 'Test' (ambiguous format does NOT replace the caseLabel)", () => {
    // Ambiguous format falls back to raw-snippet rendering but preserves
    // the original caseLabel extracted from the header — it does NOT replace
    // it with a generic "Unparsed" string.
    expect(result.pullSheet![0]!.caseLabel).toBe("Test");
  });

  it("items rendered as raw snippets (all have rawSnippet)", () => {
    const items = result.pullSheet![0]!.items;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.rawSnippet).toBeDefined();
    }
  });

  it("emits PULL_SHEET_AMBIGUOUS_FORMAT warning", () => {
    const warning = result.warnings.find((w) => w.code === "PULL_SHEET_AMBIGUOUS_FORMAT");
    expect(warning).toBeDefined();
  });

  it("PULL_SHEET_AMBIGUOUS_FORMAT warning has severity 'warn'", () => {
    const warning = result.warnings.find((w) => w.code === "PULL_SHEET_AMBIGUOUS_FORMAT");
    expect(warning!.severity).toBe("warn");
  });
});

// ── Test 7: multi-sub-tab — two PULL SHEET headers produce two PullSheetCases ─
describe("parsePullSheet — multi-sub-tab (synthetic fixture)", () => {
  it("emits one PullSheetCase per sub-tab when multiple PULL SHEET headers present (synthetic)", () => {
    // Synthetic two-table fixture: header A then header B, back to back.
    const md = [
      "| PULL SHEET/Case A | PULL SHEET/Case A | PULL SHEET/Case A | PULL SHEET/Case A | PULL SHEET/Case A |",
      "| :---: | :---: | :---: | :---: | :---: |",
      "| FALSE | 1 | Item A1 | | CAT_A |",
      "",
      "| PULL SHEET/Case B | PULL SHEET/Case B | PULL SHEET/Case B | PULL SHEET/Case B | PULL SHEET/Case B |",
      "| :---: | :---: | :---: | :---: | :---: |",
      "| FALSE | 2 | Item B1 | SUB_B | CAT_B |",
    ].join("\n");
    const { pullSheet, warnings } = parsePullSheet(md);
    expect(pullSheet).not.toBeNull();
    expect(pullSheet).toHaveLength(2);
    expect(pullSheet![0]!.caseLabel).toBe("Case A");
    expect(pullSheet![1]!.caseLabel).toBe("Case B");
    expect(pullSheet![0]!.items).toHaveLength(1);
    expect(pullSheet![1]!.items).toHaveLength(1);
    expect(pullSheet![0]!.items[0]!.item).toBe("Item A1");
    expect(pullSheet![1]!.items[0]!.item).toBe("Item B1");
    expect(warnings).toHaveLength(0);
  });
});

// ── Test 8: unknown variant — all packed_flag cells empty (edge-case pin) ─────
describe("parsePullSheet — unknown variant: no packed_flag in any row (synthetic fixture)", () => {
  // No cell in col[0] or col[4] of any data row matches /^(TRUE|FALSE)$/i, so
  // detectVariant returns "unknown" for every row and parseDataRows defaults to
  // Variant A [packed_flag, qty, item, sub_cat, cat] (pull-sheet.ts:218-230).
  const md = [
    "| PULL SHEET/No Flags | PULL SHEET/No Flags | PULL SHEET/No Flags | PULL SHEET/No Flags | PULL SHEET/No Flags |",
    "| :-: | :-: | :-: | :-: | :-: |",
    "|  | 2 | Item X | SUB1 | CATX |",
    "|  | 4 | Item Y |  | CATY |",
  ].join("\n");

  const result = parsePullSheet(md);

  it("emits exactly one PULL_SHEET_UNKNOWN_VARIANT warning with severity 'warn'", () => {
    const matches = result.warnings.filter((w) => w.code === "PULL_SHEET_UNKNOWN_VARIANT");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.severity).toBe("warn");
    expect(matches[0]!.blockRef).toEqual({ kind: "pull_sheet" });
  });

  it("parses rows under the Variant A column mapping (col[1]=qty, col[2]=item, col[3]=subCat, col[4]=cat)", () => {
    expect(result.pullSheet).not.toBeNull();
    const items = result.pullSheet![0]!.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ qty: 2, cat: "CATX", subCat: "SUB1", item: "Item X" });
    // blank sub_cat cell → subCat:null
    expect(items[1]).toEqual({ qty: 4, cat: "CATY", subCat: null, item: "Item Y" });
  });

  it("does NOT emit PULL_SHEET_PARSE_PARTIAL or PULL_SHEET_AMBIGUOUS_FORMAT (rows are clean 5-col)", () => {
    const codes = result.warnings.map((w) => w.code);
    expect(codes).not.toContain("PULL_SHEET_PARSE_PARTIAL");
    expect(codes).not.toContain("PULL_SHEET_AMBIGUOUS_FORMAT");
  });
});

// ── Test 9: negative and fractional quantities (edge-case pin) ───────────────
describe("parsePullSheet — negative and fractional qty values (synthetic fixture)", () => {
  // PINS current behavior (pull-sheet.ts:251-259): qty parses via Number() with
  // only a Number.isFinite gate — no sign or integrality validation. Negative
  // ("-5") and fractional ("3.5") quantities are accepted verbatim with NO
  // warning. A suspect-qty warning would be a NEW warning code, which on this
  // project requires the §12.4 three-lockstep update (spec prose + gen:spec-codes
  // + catalog.ts row, enforced by the x1-catalog-parity gate) — not a trivial
  // pin-task change, so current acceptance is pinned instead. If qty validation
  // is ever added, these assertions document exactly what loosens.
  const md = [
    "| PULL SHEET/Qty Edge | PULL SHEET/Qty Edge | PULL SHEET/Qty Edge | PULL SHEET/Qty Edge | PULL SHEET/Qty Edge |",
    "| :-: | :-: | :-: | :-: | :-: |",
    "| FALSE | -5 | Negative Qty Item |  | CAT1 |",
    "| FALSE | 3.5 | Fractional Qty Item |  | CAT1 |",
  ].join("\n");

  const result = parsePullSheet(md);

  it("accepts negative qty -5 verbatim (no clamp to 0 or null)", () => {
    const item = result.pullSheet![0]!.items.find((i) => i.item === "Negative Qty Item");
    expect(item).toBeDefined();
    expect(item!.qty).toBe(-5);
    expect(item!.rawSnippet).toBeUndefined(); // not routed through the partial-parse path
  });

  it("accepts fractional qty 3.5 verbatim (no rounding)", () => {
    const item = result.pullSheet![0]!.items.find((i) => i.item === "Fractional Qty Item");
    expect(item).toBeDefined();
    expect(item!.qty).toBe(3.5);
    expect(item!.rawSnippet).toBeUndefined();
  });

  it("emits no warnings — suspect numeric values are currently accepted silently", () => {
    expect(result.warnings).toHaveLength(0);
  });
});
