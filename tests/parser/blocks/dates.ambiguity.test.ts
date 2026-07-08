import { describe, it, expect } from "vitest";
import { parseDates, collectDateTokens, checkDateOrder } from "@/lib/parser/blocks/dates";
import { newAggregator } from "@/lib/parser/warnings";
import type { ParseWarning } from "@/lib/parser/types";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Map bare date strings → prefix rows, collect + run the check, return warnings. */
function run(cells: string[]): ParseWarning[] {
  const agg = newAggregator();
  const tokens = collectDateTokens(cells.map((cell) => ({ kind: "prefix" as const, cell })));
  checkDateOrder(tokens, agg);
  return agg.warnings;
}

// ── collectDateTokens — prefix rows (≤1 leading token, ALL families) ──────────

describe("collectDateTokens — prefix rows", () => {
  it("collects at most ONE leading token from a prefix row (trailing dates are phantom)", () => {
    // A TRAVEL/SET cell the parser reads via normalizeDate — only the LEADING date
    // is ever consumed; a trailing date in the same cell was never parsed.
    const tokens = collectDateTokens([{ kind: "prefix", cell: "10/3/2026 - 11/3/2026" }]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.raw).toBe("10/3/2026");
  });

  it("dual-reads a numeric slash token (a-as-month → mdyIso, b-as-month → dmyIso)", () => {
    const [t] = collectDateTokens([{ kind: "prefix", cell: "10/3/2026" }]);
    expect(t).toMatchObject({ raw: "10/3/2026", mdyIso: "2026-10-03", dmyIso: "2026-03-10" });
  });

  it("PREFIX numeric-DASH (4-digit-year) is collected with BOTH readings populated", () => {
    // 10-3-2026 / 11-3-2026 / 1-4-2026 are the numeric-dash twins of the slash trio.
    const tokens = collectDateTokens([
      { kind: "prefix", cell: "10-3-2026" },
      { kind: "prefix", cell: "11-3-2026" },
      { kind: "prefix", cell: "1-4-2026" },
    ]);
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toMatchObject({
      raw: "10-3-2026",
      mdyIso: "2026-10-03",
      dmyIso: "2026-03-10",
    });
    expect(tokens[1]).toMatchObject({
      raw: "11-3-2026",
      mdyIso: "2026-11-03",
      dmyIso: "2026-03-11",
    });
    expect(tokens[2]).toMatchObject({
      raw: "1-4-2026",
      mdyIso: "2026-01-04",
      dmyIso: "2026-04-01",
    });
  });

  it("the numeric-dash prefix trio triggers the check exactly like its slash twin", () => {
    const agg = newAggregator();
    const tokens = collectDateTokens([
      { kind: "prefix", cell: "10-3-2026" },
      { kind: "prefix", cell: "11-3-2026" },
      { kind: "prefix", cell: "1-4-2026" },
    ]);
    checkDateOrder(tokens, agg);
    expect(agg.warnings).toHaveLength(1);
    expect(agg.warnings[0]!.rawSnippet).toBe("1-4-2026");
  });

  it("2-digit-year dash (10-3-26) is NOT a token (dash family requires a 4-digit year)", () => {
    expect(collectDateTokens([{ kind: "prefix", cell: "10-3-26" }])).toEqual([]);
  });

  it("a symmetric token (5/5/2026) has mdyIso === dmyIso (de-facto fixed point)", () => {
    const [t] = collectDateTokens([{ kind: "prefix", cell: "5/5/2026" }]);
    expect(t!.mdyIso).toBe("2026-05-05");
    expect(t!.dmyIso).toBe("2026-05-05");
  });

  it("an ISO token is a fixed point in BOTH hypotheses", () => {
    const [t] = collectDateTokens([{ kind: "prefix", cell: "2026-03-10" }]);
    expect(t).toMatchObject({ raw: "2026-03-10", mdyIso: "2026-03-10", dmyIso: "2026-03-10" });
  });

  it("an MDY-invalid numeric (25/3/2026) has mdyIso null but a valid dmyIso", () => {
    const [t] = collectDateTokens([{ kind: "prefix", cell: "25/3/2026" }]);
    expect(t!.mdyIso).toBeNull();
    expect(t!.dmyIso).toBe("2026-03-25");
  });
});

// ── collectDateTokens — multi rows (every match, offset order, NO dash) ───────

describe("collectDateTokens — multi rows", () => {
  it("collects EVERY match in within-cell offset order", () => {
    const tokens = collectDateTokens([{ kind: "multi", cell: "11/3/2026 - 1/4/2026" }]);
    expect(tokens.map((t) => t.raw)).toEqual(["11/3/2026", "1/4/2026"]);
  });

  it("SHOW-cell numeric-DASH is EXCLUDED (multi rows have no numeric-dash family)", () => {
    expect(collectDateTokens([{ kind: "multi", cell: "10-3-2026" }])).toEqual([]);
  });
});

// ── checkDateOrder — the emit-rule matrix ─────────────────────────────────────

describe("checkDateOrder — emit-rule matrix", () => {
  it("DMY sheet, day<=12: MDY reading ↓, DMY reading ↑ → 1 warning", () => {
    // MDY: Oct3, Nov3, Jan4 (decreases); DMY: Mar10, Mar11, Apr1 (non-decreasing).
    expect(run(["10/3/2026", "11/3/2026", "1/4/2026"])).toHaveLength(1);
  });

  it("rawSnippet = the FIRST out-of-order raw token", () => {
    const w = run(["10/3/2026", "11/3/2026", "1/4/2026"]);
    expect(w[0]!.rawSnippet).toBe("1/4/2026");
    expect(w[0]!.blockRef).toMatchObject({ kind: "dates", field: "order" });
  });

  it("US typo (3/25 → dmyIso null) kills the DMY hypothesis → 0", () => {
    expect(run(["3/25/2026", "3/20/2026"])).toHaveLength(0);
  });

  it("both readings broken → 0 (sheet is just out of order)", () => {
    // MDY [Nov3, Oct3] decreases; DMY [Mar11, Mar10] also decreases.
    expect(run(["11/3/2026", "10/3/2026"])).toHaveLength(0);
  });

  it("fewer than 2 parseable dates → 0", () => {
    expect(run(["10/3/2026"])).toHaveLength(0);
    expect(run([])).toHaveLength(0);
  });

  it("MDY-invalid token participates in the DMY sequence (keeps it non-decreasing) → 1", () => {
    // 25/4/2026: mdyIso null (skipped in MDY scan) but dmyIso 2026-04-25 keeps DMY ↑.
    const w = run(["10/3/2026", "1/4/2026", "25/4/2026"]);
    expect(w).toHaveLength(1);
    expect(w[0]!.rawSnippet).toBe("1/4/2026");
  });

  it("an MDY-invalid token that BREAKS the DMY sequence suppresses the warning → 0", () => {
    // 25/1/2026: dmyIso 2026-01-25 makes the DMY seq [03-10, 04-01, 01-25] decrease.
    expect(run(["10/3/2026", "1/4/2026", "25/1/2026"])).toHaveLength(0);
  });

  it("a well-ordered US sheet (MDY ↑) → 0", () => {
    expect(run(["3/20/2026", "3/25/2026", "4/1/2026"])).toHaveLength(0);
  });

  it("no-ops when agg is undefined (aggregator optional)", () => {
    const tokens = collectDateTokens(
      ["10/3/2026", "11/3/2026", "1/4/2026"].map((cell) => ({ kind: "prefix" as const, cell })),
    );
    expect(() => checkDateOrder(tokens, undefined)).not.toThrow();
  });
});

// ── Step 1b: integration through the real parseDates entry (per version) ──────

describe("parseDates — DATE_ORDER_SUGGESTS_DMY end-to-end", () => {
  const v1FixtureWithDmyDates = [
    "| DATES | |",
    "| :---: | :---: |",
    "| Travel | 10/3/2026 |",
    "| Show | 11/3/2026 |",
    "| Show | 1/4/2026 |",
  ].join("\n");

  const v2FixtureWithDmyDates = [
    "| DATES | | | | |",
    "| :-: | :-: | :-: | :-: | :-: |",
    "| | TRAVEL IN | | 10/3/2026 | |",
    "| | SHOW DAY 1 | | 11/3/2026 | |",
    "| | SHOW DAY 2 | | 1/4/2026 | |",
  ].join("\n");

  it("v1: DMY-ordered sheet lands DATE_ORDER_SUGGESTS_DMY in agg.warnings", () => {
    const agg = newAggregator();
    parseDates(v1FixtureWithDmyDates, "v1", agg);
    const w = agg.warnings.filter((x) => x.code === "DATE_ORDER_SUGGESTS_DMY");
    expect(w).toHaveLength(1);
    expect(w[0]!.blockRef).toMatchObject({ kind: "dates", field: "order" });
    expect(w[0]!.rawSnippet).toBe("1/4/2026");
  });

  it("v2/v4: same, through the v2/v4 walker", () => {
    const agg = newAggregator();
    parseDates(v2FixtureWithDmyDates, "v2", agg);
    const w = agg.warnings.filter((x) => x.code === "DATE_ORDER_SUGGESTS_DMY");
    expect(w).toHaveLength(1);
    expect(w[0]!.blockRef).toMatchObject({ kind: "dates", field: "order" });
    expect(w[0]!.rawSnippet).toBe("1/4/2026");
  });

  it("a well-ordered US sheet emits nothing (negative)", () => {
    const usSheet = [
      "| DATES | | | | |",
      "| :-: | :-: | :-: | :-: | :-: |",
      "| | TRAVEL IN | | 3/20/2026 | |",
      "| | SHOW DAY 1 | | 3/24/2026 | |",
      "| | SHOW DAY 2 | | 3/25/2026 | |",
    ].join("\n");
    const agg = newAggregator();
    parseDates(usSheet, "v4", agg);
    expect(agg.warnings.filter((x) => x.code === "DATE_ORDER_SUGGESTS_DMY")).toEqual([]);
  });
});

// ── Step 4: placement proof — dates SORT clean but ENCOUNTER dirty ────────────
//
// The two SHOW dates (11/3, 1/4) sort ASCENDING into showDays, so a post-sort
// implementation reading result.showDays sees [Jan4, Nov3] = no MDY decrease and
// MISSES the violation. Only a pre-`showDays.sort()` collector, walking encounter
// order [Nov3, Jan4], sees the decrease. These tests fail a post-sort impl.

describe("parseDates — pre-sort placement proof", () => {
  it("v1 walker: showDays sort clean yet the encounter-order violation still fires", () => {
    const md = [
      "| DATES | |",
      "| :---: | :---: |",
      "| Show | 11/3/2026 |",
      "| Show | 1/4/2026 |",
    ].join("\n");
    const agg = newAggregator();
    const d = parseDates(md, "v1", agg);
    // showDays are sorted ASCENDING (the sort ran, masking row order)
    expect(d.showDays).toEqual(["2026-01-04", "2026-11-03"]);
    // but the pre-sort collector still caught the encounter-order violation
    const w = agg.warnings.filter((x) => x.code === "DATE_ORDER_SUGGESTS_DMY");
    expect(w).toHaveLength(1);
    expect(w[0]!.rawSnippet).toBe("1/4/2026");
  });

  it("v2/v4 walker: showDays sort clean yet the encounter-order violation still fires", () => {
    const md = [
      "| DATES | | | | |",
      "| :-: | :-: | :-: | :-: | :-: |",
      "| | SHOW DAY 1 | | 11/3/2026 | |",
      "| | SHOW DAY 2 | | 1/4/2026 | |",
    ].join("\n");
    const agg = newAggregator();
    const d = parseDates(md, "v4", agg);
    expect(d.showDays).toEqual(["2026-01-04", "2026-11-03"]);
    const w = agg.warnings.filter((x) => x.code === "DATE_ORDER_SUGGESTS_DMY");
    expect(w).toHaveLength(1);
    expect(w[0]!.rawSnippet).toBe("1/4/2026");
  });
});
