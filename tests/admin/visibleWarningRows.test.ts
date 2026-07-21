import { describe, expect, it } from "vitest";
import { visibleWarningRows } from "@/lib/admin/visibleWarningRows";
import type { ParseWarning } from "@/lib/parser/types";

/**
 * tests/admin/visibleWarningRows.test.ts
 * (plan docs/superpowers/plans/2026-07-20-warning-surface-trim/plan.md Task 1;
 *  spec docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md §3.2)
 *
 * The single predicate both the Parse warnings panel body and its rail count
 * consume. Two readers, one filter, so the two can never disagree.
 *
 * Anti-tautology: the fixture carries ASYMMETRIC severity counts (2 info, 3
 * warn), so a filter that keeps the wrong arm cannot coincidentally produce a
 * right-looking cardinality. Expectations are derived from the fixture, never
 * written as literals.
 */
function warning(code: string, severity: ParseWarning["severity"]): ParseWarning {
  return { severity, code, message: `${code} message` } as ParseWarning;
}

// 2 info, 3 warn — deliberately unequal (see header).
const FIXTURE: ParseWarning[] = [
  warning("UNKNOWN_FIELD", "warn"),
  warning("AGENDA_PDF_UNREADABLE", "info"),
  warning("UNKNOWN_ROLE_TOKEN", "warn"),
  warning("AGENDA_SCHEDULE_LOW_CONFIDENCE", "info"),
  warning("DATE_ORDER_SUGGESTS_DMY", "warn"),
];

const infoCodes = FIXTURE.filter((w) => w.severity !== "warn").map((w) => w.code);
const warnCodes = FIXTURE.filter((w) => w.severity === "warn").map((w) => w.code);

describe("visibleWarningRows", () => {
  it("gate false returns the input unchanged, same identities in the same order", () => {
    const rows = visibleWarningRows(FIXTURE, false);
    // OBJECT IDENTITY, not codes (whole-diff review B12). Comparing code strings
    // lets either arm clone rows or drop `message` / `rawSnippet` / `blockRef`
    // while every assertion passes — and downstream, `warningFingerprint` reads
    // `rawSnippet` and the routing reads `blockRef`, so a lossy copy would
    // silently unignorable-ify or misroute the row.
    expect(rows.length).toBe(FIXTURE.length);
    rows.forEach((row, i) => expect(row).toBe(FIXTURE[i]));
  });

  it("gate true drops every warn row and keeps every non-warn row, unmodified", () => {
    const rows = visibleWarningRows(FIXTURE, true);
    expect(rows.map((w) => w.code)).toEqual(infoCodes);
    for (const code of warnCodes) {
      expect(rows.map((w) => w.code)).not.toContain(code);
    }
    // The survivors are the SAME objects, in fixture order.
    const survivors = FIXTURE.filter((w) => w.severity !== "warn");
    rows.forEach((row, i) => expect(row).toBe(survivors[i]));
  });

  it("the two arms are different sizes, so neither result could stand in for the other", () => {
    // Guards the fixture itself: if someone later balances the counts, a
    // wrong-arm filter would start passing the assertions above.
    expect(infoCodes.length).not.toBe(warnCodes.length);
  });

  it("empty input returns empty under both gates", () => {
    expect(visibleWarningRows([], false)).toEqual([]);
    expect(visibleWarningRows([], true)).toEqual([]);
  });

  it("an all-warn input returns empty when gated, and everything when not", () => {
    const allWarn = FIXTURE.filter((w) => w.severity === "warn");
    expect(visibleWarningRows(allWarn, true)).toEqual([]);
    expect(visibleWarningRows(allWarn, false).map((w) => w.code)).toEqual(warnCodes);
  });
});
