import { describe, expect, test } from "vitest";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import {
  warningCodes,
  buildWarning,
  tier1WarningScenarios,
  EXTRA_WARNING_CODES,
  scenarioIdForCode,
} from "@/lib/dev/attentionScenarios/tier1";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";

/**
 * The warning universe (spec §3.2). No single runtime module enumerates it: the
 * generated enum under-covers because its producer only scans files matching a
 * heuristic, and the tests-only copy registry is not a superset either and
 * cannot be imported from lib/. So the catalog uses the generated enum plus an
 * enumerated residue, de-duplicated.
 */
function generatedWarningCodes(): string[] {
  return Object.entries(INTERNAL_CODE_ENUMS)
    .filter(([, v]) => (v as { source: string }).source === "parse_warnings.code")
    .map(([k]) => k);
}

describe("tier 1 warning scenarios", () => {
  test("includes every generated parse_warnings code", () => {
    const codes = warningCodes();
    for (const code of generatedWarningCodes()) {
      expect(codes, code).toContain(code);
    }
  });

  test("includes the residue the generator's scan heuristic misses", () => {
    // Each of these is emitted from a file the generator does not scan; without
    // the explicit list the gallery would silently omit them.
    expect(EXTRA_WARNING_CODES.length).toBeGreaterThan(0);
    for (const code of EXTRA_WARNING_CODES) {
      expect(warningCodes(), code).toContain(code);
    }
  });

  test("de-duplicates, so a later generator fix cannot double-render a code", () => {
    const codes = warningCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("the universe is at least as large as the generated set", () => {
    expect(warningCodes().length).toBeGreaterThanOrEqual(generatedWarningCodes().length);
  });

  test("a built warning NEVER embeds its own raw code in the message", () => {
    // Warnings materialize verbatim, so a code in the message reaches the real
    // modal and escapes the §1.1 exception scope. The validator enforces this
    // too; this asserts the builder itself never produces one.
    for (const code of warningCodes()) {
      expect(buildWarning(code).message, code).not.toContain(code);
    }
  });

  test("a built warning is warn severity with a non-blank message", () => {
    for (const code of warningCodes()) {
      const w = buildWarning(code);
      expect(w.severity, code).toBe("warn");
      expect(w.code, code).toBe(code);
      expect(w.message.trim().length, code).toBeGreaterThan(0);
    }
  });

  test("UNKNOWN_ROLE_TOKEN always carries roleToken, and others never do", () => {
    // Absence of roleToken is what discriminates on every other code
    // (lib/parser/types.ts), so setting it broadly would be a real fidelity bug.
    if (warningCodes().includes("UNKNOWN_ROLE_TOKEN")) {
      expect(buildWarning("UNKNOWN_ROLE_TOKEN").roleToken).toBeTypeOf("string");
    }
    for (const code of warningCodes().filter((c) => c !== "UNKNOWN_ROLE_TOKEN")) {
      expect(buildWarning(code).roleToken, code).toBeUndefined();
    }
  });

  test("one scenario per warning code, each valid and warnings-declaring", () => {
    const all = tier1WarningScenarios();
    expect(all).toHaveLength(warningCodes().length);
    for (const s of all) {
      expect(validateScenario(s), `${s.id}: ${validateScenario(s).join("; ")}`).toEqual([]);
      expect(s.tier, s.id).toBe(1);
      expect(s.alerts, s.id).toHaveLength(0);
      // Unlike tier-1 ALERT scenarios, these DO declare warnings - that is the
      // whole point, and it is what makes them write the column on materialize.
      expect(s.warnings, s.id).toHaveLength(1);
    }
  });

  test("warning scenario ids use the warn namespace", () => {
    const first = warningCodes()[0]!;
    expect(tier1WarningScenarios().map((s) => s.id)).toContain(scenarioIdForCode("warn", first));
  });
});
