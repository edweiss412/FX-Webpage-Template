import { describe, expect, test } from "vitest";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import {
  warningCodes,
  buildWarning,
  tier1WarningScenarios,
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
    .filter(([, v]) => (v as { source: string }).source.split(",").includes("parse_warnings.code"))
    .map(([k]) => k);
}

describe("tier 1 warning scenarios", () => {
  test("includes every generated parse_warnings code", () => {
    const codes = warningCodes();
    for (const code of generatedWarningCodes()) {
      expect(codes, code).toContain(code);
    }
  });

  test("includes every former residue code, from the generator alone", () => {
    // These four were hand-listed in EXTRA_WARNING_CODES because the old scan
    // missed them. The type-aware producer reaches every one, so the residue is
    // gone; this asserts the generator carries them rather than a side list.
    for (const code of [
      "AGENDA_SCHEDULE_LOW_CONFIDENCE",
      "AGENDA_SCHEDULE_TIME_ADJUSTED",
      "PULL_SHEET_ON_ARCHIVED_TAB",
      "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
    ]) {
      expect(generatedWarningCodes(), code).toContain(code);
      expect(warningCodes(), code).toContain(code);
    }
  });

  test("includes the codes that were dark before the type-aware scan", () => {
    // Emitted by factories whose return type never spells ParseWarning
    // (lib/sync/applyStaged.ts, lib/sync/phase2.ts) or by `warning()` helpers the
    // old name-keyed rule could not see. Each is a real §12.4 catalog row.
    for (const code of [
      "DIAGRAMS_TAB_MISSING",
      "DIAGRAMS_EMBEDDED_NONE_FOUND",
      "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
      "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
      "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      "LINKED_FOLDER_OVERFLOW_TRUNCATED",
      "EMBEDDED_ASSET_DRIFTED",
      "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
      "REEL_DRIFTED",
      "OPENING_REEL_PERMISSION_DENIED",
      "OPENING_REEL_NOT_VIDEO",
    ]) {
      expect(warningCodes(), code).toContain(code);
    }
  });

  test("admits no admin-alert or hard-error code", () => {
    // Naive root-widening mis-attributed these; recognition by TYPE excludes the
    // whole class by construction rather than by an exclusion list.
    for (const code of [
      "DRIVE_FETCH_FAILED",
      "ROLE_FLAGS_NOTICE",
      "SHOW_FIRST_PUBLISHED",
      "RESYNC_SHRINK_HELD",
      "IDEMPOTENCY_IN_FLIGHT",
      "REPORT_HORIZON_EXPIRED",
    ]) {
      expect(warningCodes(), code).not.toContain(code);
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
