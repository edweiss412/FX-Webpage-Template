/**
 * tests/admin/step3Buckets.test.ts (Task 9 — spec §7.2 / §7.3a / §10)
 *
 * Pure derivation tests for the wizard's row-level tri-state (clean / judgment /
 * needs-look) and the FIELD_LABELS lookup. These target the extracted pure
 * functions (NOT rendered chrome) so Task 11 keeps its render red-phase intact.
 *
 * Universe note (spec §7.1): row-level needs-look/judgment derives ONLY from the
 * GAP_CLASSES-member warnings (summarizeDataGaps semantics) — the SAME universe
 * rowNeedsLook consumes today. Section status (§7.1, tested in
 * step3SectionStatus.test.ts) derives from ALL warn-severity warnings, so a row
 * can be judgment at the summary while one of its sections is flagged. The
 * asymmetry test below pins that (imports sectionStatus).
 */
import { describe, expect, test } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";
import {
  nonAmbiguityGapTotal,
  rowNeedsLookPure,
  rowIsJudgment,
  deriveStep3Buckets,
  fieldLabelFor,
  FIELD_LABELS,
  type Step3RowLike,
} from "@/lib/admin/step3Buckets";
import { sectionStatus } from "@/lib/admin/step3SectionStatus";

// Concrete codes (verified against lib/parser/dataGaps.ts + ambiguityCodes.ts):
//  - AMBIGUITY_GAP: a gap class that IS an ambiguity code (judgment universe).
//  - NON_AMBIGUITY_GAP: a gap class that is NOT ambiguity (forces needs-look).
//  - NON_GAP_WARN: warn-severity but NOT a gap class (invisible to summarizeDataGaps).
const AMBIGUITY_GAP = "ROOM_HEADER_SPLIT_AMBIGUOUS";
const NON_AMBIGUITY_GAP = "FIELD_UNREADABLE";
const NON_GAP_WARN = "SECTION_HEADER_AUTOCORRECTED";

function w(code: string, severity: "warn" | "info" = "warn"): ParseWarning {
  return { severity, code, message: code };
}

// A row WITH a reviewable preview (parseResult.show present) carrying `warnings`.
function row(warnings: ParseWarning[], extra: Partial<Step3RowLike> = {}): Step3RowLike {
  return { parseResult: { show: { title: "S" }, warnings }, ...extra };
}

describe("nonAmbiguityGapTotal", () => {
  test("counts non-ambiguity gap classes only", () => {
    expect(nonAmbiguityGapTotal(row([w(NON_AMBIGUITY_GAP)]))).toBe(1);
  });

  test("excludes ambiguity gap classes", () => {
    expect(nonAmbiguityGapTotal(row([w(AMBIGUITY_GAP)]))).toBe(0);
  });

  test("excludes non-gap warns (not in GAP_CLASSES)", () => {
    expect(nonAmbiguityGapTotal(row([w(NON_GAP_WARN)]))).toBe(0);
  });

  test("mixed: counts only the non-ambiguity gap", () => {
    expect(nonAmbiguityGapTotal(row([w(NON_AMBIGUITY_GAP), w(AMBIGUITY_GAP)]))).toBe(1);
  });

  test("info-severity gap does not count", () => {
    expect(nonAmbiguityGapTotal(row([w(NON_AMBIGUITY_GAP, "info")]))).toBe(0);
  });

  test("no parseResult → 0", () => {
    expect(nonAmbiguityGapTotal({})).toBe(0);
  });
});

describe("rowNeedsLookPure", () => {
  test("non-ambiguity gap → needs-look", () => {
    expect(rowNeedsLookPure(row([w(NON_AMBIGUITY_GAP)]))).toBe(true);
  });

  test("ambiguity-only gap → NOT needs-look", () => {
    expect(rowNeedsLookPure(row([w(AMBIGUITY_GAP)]))).toBe(false);
  });

  test("clean (no warnings) → NOT needs-look", () => {
    expect(rowNeedsLookPure(row([]))).toBe(false);
  });

  test("missing preview (no parseResult.show) stays needs-look despite ambiguity", () => {
    expect(rowNeedsLookPure({ parseResult: { warnings: [w(AMBIGUITY_GAP)] } })).toBe(true);
  });

  test("finalize-failure stays needs-look despite ambiguity", () => {
    expect(
      rowNeedsLookPure(row([w(AMBIGUITY_GAP)], { lastFinalizeFailureCode: "DRIVE_FETCH_FAILED" })),
    ).toBe(true);
  });
});

describe("rowIsJudgment", () => {
  test("ambiguity-only gap → judgment", () => {
    expect(rowIsJudgment(row([w(AMBIGUITY_GAP)]))).toBe(true);
  });

  test("mixed-warning row: non-gap warn + ambiguity gap → judgment (non-gap warn invisible to needs-look)", () => {
    expect(rowIsJudgment(row([w(NON_GAP_WARN), w(AMBIGUITY_GAP)]))).toBe(true);
  });

  test("gap-mixed precedence: non-ambiguity gap + ambiguity gap → needs-look, NOT judgment", () => {
    const r = row([w(NON_AMBIGUITY_GAP), w(AMBIGUITY_GAP)]);
    expect(rowNeedsLookPure(r)).toBe(true);
    expect(rowIsJudgment(r)).toBe(false);
  });

  test("clean row → NOT judgment", () => {
    expect(rowIsJudgment(row([]))).toBe(false);
  });

  test("missing-preview row with ambiguity → NOT judgment (needs-look wins)", () => {
    expect(rowIsJudgment({ parseResult: { warnings: [w(AMBIGUITY_GAP)] } })).toBe(false);
  });

  test("info-severity ambiguity does not make a row judgment", () => {
    expect(rowIsJudgment(row([w(AMBIGUITY_GAP, "info")]))).toBe(false);
  });
});

describe("deriveStep3Buckets", () => {
  test("M=0 ⇒ showJudgmentBucket === false", () => {
    const rows = [row([]), row([w(NON_AMBIGUITY_GAP)])];
    const b = deriveStep3Buckets(rows);
    expect(b.judgment).toBe(0);
    expect(b.showJudgmentBucket).toBe(false);
  });

  test("M>0 ⇒ showJudgmentBucket === true", () => {
    const b = deriveStep3Buckets([row([w(AMBIGUITY_GAP)])]);
    expect(b.judgment).toBe(1);
    expect(b.showJudgmentBucket).toBe(true);
  });

  test("N+M+K === publishRows.length across a mixed grid", () => {
    const rows: Step3RowLike[] = [
      row([]), // clean
      row([w(AMBIGUITY_GAP)]), // judgment
      row([w(NON_GAP_WARN), w(AMBIGUITY_GAP)]), // judgment (non-gap warn invisible)
      row([w(NON_AMBIGUITY_GAP)]), // needs-look
      row([w(NON_AMBIGUITY_GAP), w(AMBIGUITY_GAP)]), // needs-look (precedence)
      { parseResult: { warnings: [w(AMBIGUITY_GAP)] } }, // missing preview → needs-look
      row([w(AMBIGUITY_GAP)], { lastFinalizeFailureCode: "DRIVE_FETCH_FAILED" }), // finalize fail → needs-look
    ];
    const b = deriveStep3Buckets(rows);
    expect(b.clean).toBe(1);
    expect(b.judgment).toBe(2);
    expect(b.needsLook).toBe(4);
    expect(b.clean + b.judgment + b.needsLook).toBe(rows.length);
  });

  test("empty grid → all zero, no judgment bucket", () => {
    expect(deriveStep3Buckets([])).toEqual({
      clean: 0,
      judgment: 0,
      needsLook: 0,
      showJudgmentBucket: false,
    });
  });

  test("precedence: a needs-look row with ambiguity counts once as needs-look, never judgment", () => {
    const b = deriveStep3Buckets([row([w(NON_AMBIGUITY_GAP), w(AMBIGUITY_GAP)])]);
    expect(b.needsLook).toBe(1);
    expect(b.judgment).toBe(0);
    expect(b.clean).toBe(0);
  });
});

describe("FIELD_LABELS / fieldLabelFor", () => {
  test("known fields map to plain-language labels", () => {
    expect(fieldLabelFor("dims")).toBe("dimensions");
    expect(fieldLabelFor("name")).toBe("room name");
    expect(fieldLabelFor("guests")).toBe("guest list");
    expect(fieldLabelFor("order")).toBe("date order");
  });

  test("exact map shape (spec §7.3)", () => {
    expect(FIELD_LABELS).toEqual({
      dims: "dimensions",
      name: "room name",
      guests: "guest list",
      order: "date order",
    });
  });

  test("unknown/empty/undefined field → null (omit the phrase)", () => {
    expect(fieldLabelFor("zzz_future")).toBeNull();
    expect(fieldLabelFor("")).toBeNull();
    expect(fieldLabelFor(undefined)).toBeNull();
    expect(fieldLabelFor(null)).toBeNull();
  });
});

describe("§7.1 asymmetry: same row is judgment while its section is flagged", () => {
  test("non-gap warn + ambiguity gap → row judgment, section flagged", () => {
    const warnings = [w(NON_GAP_WARN), w(AMBIGUITY_GAP)];
    // Row level (GAP universe): non-gap warn invisible → only ambiguity gap → judgment.
    expect(rowIsJudgment(row(warnings))).toBe(true);
    // Section level (ALL warn-severity): the non-gap warn is not ambiguity → flagged.
    expect(sectionStatus(warnings)).toBe("flagged");
  });
});
