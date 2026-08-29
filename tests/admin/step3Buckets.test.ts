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
      address: "hotel name and address",
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

// ── wizard-warning-ignore-controls spec §2.4 choke point 1 — Task 10 ───────────
//
// Every row-level bucket derivation already routes through the single private
// accessor `gapWarnings`. Teaching THAT one function about the ignored partition
// makes the card border, the Review/View label, the judgment chip and both summary
// counts active-aware at once — no per-surface edit, and no surface left behind.
//
// The failure this prevents is chrome contradicting the list under it: an operator
// dismisses the only gap warning, the panel shows nothing needing a look, and the
// card still wears its amber "needs a look" border.

describe("gapWarnings reads the ACTIVE partition (§2.4 choke point 1)", () => {
  /** Two non-ambiguity gap warnings; index 0 ignored, index 1 active. */
  const TWO_GAPS = [w(NON_AMBIGUITY_GAP), w(NON_AMBIGUITY_GAP)];
  const IGNORE_FIRST = {
    active: [{ index: 1, reportSurfaceId: "sid-1" }],
    ignored: [{ index: 0, reportSurfaceId: "sid-0" }],
  };

  test("nonAmbiguityGapTotal drops exactly the ignored row's contribution", () => {
    const withoutModel = nonAmbiguityGapTotal(row(TWO_GAPS));
    const withModel = nonAmbiguityGapTotal(row(TWO_GAPS, { warningModel: IGNORE_FIRST }));
    // Both numbers derive from the fixture: two gap warnings, one ignored.
    expect(withoutModel).toBe(TWO_GAPS.length);
    expect(withModel).toBe(TWO_GAPS.length - IGNORE_FIRST.ignored.length);
  });

  test("an ABSENT model leaves every number byte-identical (published and standalone)", () => {
    // The regression pin. `gapWarnings` is on the path of every wizard card and both
    // summary counts, so a model-less row must behave exactly as it always has.
    for (const warnings of [
      [w(NON_AMBIGUITY_GAP)],
      [w(AMBIGUITY_GAP)],
      [w(NON_GAP_WARN)],
      [w(NON_AMBIGUITY_GAP), w(AMBIGUITY_GAP), w(NON_GAP_WARN, "info")],
      [],
    ]) {
      // The key is OMITTED, not set to undefined: exactOptionalPropertyTypes, and
      // omission is the shape a published or standalone row actually has.
      expect(nonAmbiguityGapTotal(row(warnings))).toBe(nonAmbiguityGapTotal(row(warnings, {})));
    }
  });

  test("rowIsJudgment flips when the only non-ambiguity warn is ignored", () => {
    // Needs-look outranks judgment, so with the gap ACTIVE this row is needs-look and
    // NOT judgment. Ignoring it demotes the row to judgment on the surviving ambiguity
    // warning — a precedence change, not just a smaller number.
    const warnings = [w(NON_AMBIGUITY_GAP), w(AMBIGUITY_GAP)];
    const active = row(warnings);
    expect(rowNeedsLookPure(active)).toBe(true);
    expect(rowIsJudgment(active)).toBe(false);

    const ignoredGap = row(warnings, {
      warningModel: {
        active: [{ index: 1, reportSurfaceId: "sid-1" }],
        ignored: [{ index: 0, reportSurfaceId: "sid-0" }],
      },
    });
    expect(rowNeedsLookPure(ignoredGap)).toBe(false);
    expect(rowIsJudgment(ignoredGap)).toBe(true);
  });

  test("deriveStep3Buckets counts follow the partition", () => {
    const warnings = [w(NON_AMBIGUITY_GAP), w(AMBIGUITY_GAP)];
    const before = deriveStep3Buckets([row(warnings)]);
    expect(before).toMatchObject({ needsLook: 1, judgment: 0, clean: 0 });

    const after = deriveStep3Buckets([
      row(warnings, {
        warningModel: {
          active: [{ index: 1, reportSurfaceId: "sid-1" }],
          ignored: [{ index: 0, reportSurfaceId: "sid-0" }],
        },
      }),
    ]);
    expect(after).toMatchObject({ needsLook: 0, judgment: 1, clean: 0 });
  });

  test("an out-of-range ignored index is ignored rather than dropping a live warning", () => {
    // A model built against a longer array. Skipping the bad index must not shift the
    // remaining ones, or the wrong warning silently stops counting.
    const warnings = [w(NON_AMBIGUITY_GAP)];
    expect(
      nonAmbiguityGapTotal(
        row(warnings, {
          warningModel: { active: [], ignored: [{ index: 9, reportSurfaceId: "sid-9" }] },
        }),
      ),
    ).toBe(1);
  });
});
