import { describe, it, expect } from "vitest";
import { autocorrectGuidance } from "@/lib/messages/autocorrectGuidance";

// Task 3 (plan 2026-07-21-warning-card-identity-placement §4). The oracle is a
// HAND-AUTHORED (input → exact output) table, each row transcribed by reading spec
// §4.2/§4.3 — NOT by re-running the composer's join logic (that would be tautological).

type AC = { subject: string | null; corrections: { detected: string; corrected: string }[] };
const ac = (subject: string | null, ...pairs: [string, string][]): AC => ({
  subject,
  corrections: pairs.map(([detected, corrected]) => ({ detected, corrected })),
});

describe("autocorrectGuidance — per-code sentences", () => {
  it("STAGE_WORD: possessive role clause", () => {
    expect(
      autocorrectGuidance("STAGE_WORD_AUTOCORRECTED", ac("Eric Weiss", ["Strke", "Strike"])),
    ).toBe("We read 'Strke' as 'Strike' in Eric Weiss's role.");
  });
  it("ROLE_TOKEN: possessive cell clause", () => {
    expect(
      autocorrectGuidance("ROLE_TOKEN_AUTOCORRECTED", ac("Jane Roe", ["Cretion", "Creation"])),
    ).toBe("We read 'Cretion' as 'Creation' in Jane Roe's cell.");
  });
  it("SECTION_HEADER: no clause, no trailing instruction", () => {
    expect(
      autocorrectGuidance(
        "SECTION_HEADER_AUTOCORRECTED",
        ac(null, ["Transportaton", "Transportation"]),
      ),
    ).toBe("We read 'Transportaton' as 'Transportation'.");
  });
  it("COLUMN_HEADER: keeps the fix instruction", () => {
    expect(autocorrectGuidance("COLUMN_HEADER_AUTOCORRECTED", ac(null, ["E-MAIL", "EMAIL"]))).toBe(
      "We read 'E-MAIL' as 'EMAIL'. Fix the header in the sheet if that guess is wrong.",
    );
  });
  it("FIELD_LABEL: keeps the fix instruction", () => {
    expect(
      autocorrectGuidance("FIELD_LABEL_AUTOCORRECTED", ac(null, ["Venue Adress", "Venue Address"])),
    ).toBe(
      "We read 'Venue Adress' as 'Venue Address'. Fix the label in the sheet if that guess is wrong.",
    );
  });
});

describe("autocorrectGuidance — correction-list joins (surviving pairs)", () => {
  it("two corrections", () => {
    expect(
      autocorrectGuidance(
        "STAGE_WORD_AUTOCORRECTED",
        ac("Amy", ["Strke", "Strike"], ["Lod Out", "Load Out"]),
      ),
    ).toBe("We read 'Strke' as 'Strike' and 'Lod Out' as 'Load Out' in Amy's role.");
  });
  it("three corrections (serial comma)", () => {
    expect(
      autocorrectGuidance(
        "STAGE_WORD_AUTOCORRECTED",
        ac("Amy", ["A", "Aa"], ["B", "Bb"], ["C", "Cc"]),
      ),
    ).toBe("We read 'A' as 'Aa', 'B' as 'Bb', and 'C' as 'Cc' in Amy's role.");
  });
  it("four corrections → first three + 'and N more'", () => {
    expect(
      autocorrectGuidance(
        "STAGE_WORD_AUTOCORRECTED",
        ac("Amy", ["A", "Aa"], ["B", "Bb"], ["C", "Cc"], ["D", "Dd"]),
      ),
    ).toBe("We read 'A' as 'Aa', 'B' as 'Bb', 'C' as 'Cc', and 1 more in Amy's role.");
  });
});

describe("autocorrectGuidance — possessive + normalization", () => {
  it("name ending in s takes 's", () => {
    expect(autocorrectGuidance("STAGE_WORD_AUTOCORRECTED", ac("Chris", ["Strke", "Strike"]))).toBe(
      "We read 'Strke' as 'Strike' in Chris's role.",
    );
  });
  it("collapses interior whitespace and trims", () => {
    expect(
      autocorrectGuidance(
        "SECTION_HEADER_AUTOCORRECTED",
        ac(null, ["  Trans\tportaton ", "Transportation"]),
      ),
    ).toBe("We read 'Trans portaton' as 'Transportation'.");
  });
});

describe("autocorrectGuidance — guards → null (fall back to helpfulContext)", () => {
  it("undefined autocorrect", () => {
    expect(autocorrectGuidance("STAGE_WORD_AUTOCORRECTED", undefined)).toBeNull();
  });
  it("code not one of the five", () => {
    expect(autocorrectGuidance("UNKNOWN_ROLE_TOKEN", ac("Eric", ["a", "b"]))).toBeNull();
  });
  it("crew-scoped code with blank subject", () => {
    expect(
      autocorrectGuidance("STAGE_WORD_AUTOCORRECTED", ac("   ", ["Strke", "Strike"])),
    ).toBeNull();
  });
  it("crew-scoped code with null subject", () => {
    expect(autocorrectGuidance("ROLE_TOKEN_AUTOCORRECTED", ac(null, ["a", "b"]))).toBeNull();
  });
  it("empty-corrected pair dropped; no survivors → null", () => {
    expect(autocorrectGuidance("SECTION_HEADER_AUTOCORRECTED", ac(null, ["x", "  "]))).toBeNull();
  });
  it("self-equal-after-normalization pair dropped ('Load  In' vs 'Load In') → null", () => {
    expect(
      autocorrectGuidance("SECTION_HEADER_AUTOCORRECTED", ac(null, ["Load  In", "Load In"])),
    ).toBeNull();
  });
  it("one invalid pair dropped, one valid survives", () => {
    expect(
      autocorrectGuidance(
        "SECTION_HEADER_AUTOCORRECTED",
        ac(null, ["x", "  "], ["Adress", "Address"]),
      ),
    ).toBe("We read 'Adress' as 'Address'.");
  });
  it("non-crew code ignores a provided subject", () => {
    expect(
      autocorrectGuidance("COLUMN_HEADER_AUTOCORRECTED", ac("Eric", ["E-MAIL", "EMAIL"])),
    ).toBe("We read 'E-MAIL' as 'EMAIL'. Fix the header in the sheet if that guess is wrong.");
  });
});
