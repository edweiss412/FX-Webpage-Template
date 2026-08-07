/**
 * tests/planFences/baselineGuard.test.ts — the shrink-only decision, exercised.
 *
 * R3 finding 2: the refusal was correct and untested, so deleting it left every
 * suite green. A rule nothing exercises is a rule the next person removes.
 */
import { describe, expect, it } from "vitest";
import { decideRegeneration } from "@/lib/planFences/baselineGuard";

const committed = (rows: number, total: number): string =>
  `export const FROZEN_ROWS = ${rows};\nexport const FROZEN_TOTAL = ${total};\n`;

describe("shrink-only baseline decision", () => {
  it("allows the first generation when no baseline is committed", () => {
    expect(decideRegeneration("", 100, 120)).toMatchObject({ ok: true });
  });

  it("allows a shrink", () => {
    expect(decideRegeneration(committed(100, 120), 90, 110)).toMatchObject({ ok: true });
  });

  it("allows an unchanged regeneration", () => {
    expect(decideRegeneration(committed(100, 120), 100, 120)).toMatchObject({ ok: true });
  });

  it("REFUSES a row raise", () => {
    const d = decideRegeneration(committed(100, 120), 101, 120);
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toContain("shrink-only");
  });

  it("REFUSES a total raise even when the row count holds", () => {
    // The two ceilings are not redundant: a count bump on an existing row leaves
    // the row count untouched.
    const d = decideRegeneration(committed(100, 120), 100, 121);
    expect(d.ok).toBe(false);
  });

  it("FAILS CLOSED when a committed baseline's ceilings cannot be parsed", () => {
    // The bypass this closes: reformat the constants (a type annotation, a
    // numeric separator), and an Infinity default turns the refusal off.
    const reformatted =
      "export const FROZEN_ROWS: number = 1_00;\nexport const FROZEN_TOTAL = 120;\n";
    const d = decideRegeneration(reformatted, 999, 999);
    expect(d.ok).toBe(false);
    expect(d.ok === false && d.reason).toContain("unreadable ceiling is not an absent one");
  });

  it("treats an ABSENT file differently from an unreadable one", () => {
    // Deleting the baseline is the documented way to raise it deliberately, and
    // it is visible in the diff. Corrupting it is not.
    expect(decideRegeneration("", 999, 999).ok).toBe(true);
    expect(decideRegeneration("nonsense", 999, 999).ok).toBe(false);
  });
});
