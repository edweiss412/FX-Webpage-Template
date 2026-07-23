import { describe, it, expect } from "vitest";
import { crewRowKeyForWarning } from "@/lib/admin/crewRowKey";
import {
  extractDayRestriction,
  stripDayRestrictionParen,
} from "@/lib/parser/personalization";
import type { ParseWarning } from "@/lib/parser/types";

// Spec 2026-07-23-crew-warning-attachment §2A/§5.1 — the single source for
// "which crew row does this warning belong under". Failure modes pinned:
//  - silently widening the 2 legacy autocorrect codes to blockRef keying
//    (changes shipped placement),
//  - keying blockRef names RAW so a day-restricted row's warning never matches
//    its stripped rendered name (silently disabling under-row placement for
//    every day-restricted row, spec R3-F1).

const base = { severity: "warn", message: "m" } as const;

const autocorrectWarning = (over: Partial<ParseWarning>): ParseWarning =>
  ({
    ...base,
    code: "STAGE_WORD_AUTOCORRECTED",
    autocorrect: { subject: "Eric Weiss", corrections: [{ detected: "Strke", corrected: "Strike" }] },
    blockRef: { kind: "crew", index: 0, name: "Eric Weiss" },
    ...over,
  }) as ParseWarning;

const blockRefWarning = (over: Partial<ParseWarning>): ParseWarning =>
  ({
    ...base,
    code: "FIELD_UNREADABLE",
    blockRef: { kind: "crew", index: 4, name: "John Redcorn" },
    ...over,
  }) as ParseWarning;

describe("crewRowKeyForWarning — legacy autocorrect codes (subject-only, backward-compat pin)", () => {
  it("keys off autocorrect.subject", () => {
    expect(crewRowKeyForWarning(autocorrectWarning({}))).toBe("eric weiss");
  });

  it("blank subject → null even when a crew blockRef exists (never widens to blockRef)", () => {
    expect(
      crewRowKeyForWarning(
        autocorrectWarning({ autocorrect: { subject: "   ", corrections: [] } }),
      ),
    ).toBeNull();
  });

  it("autocorrect object present but subject missing → null", () => {
    expect(
      crewRowKeyForWarning(
        autocorrectWarning({ autocorrect: { corrections: [] } as never }),
      ),
    ).toBeNull();
  });

  it("autocorrect object missing entirely → null (distinct runtime shape)", () => {
    const w = autocorrectWarning({});
    delete (w as { autocorrect?: unknown }).autocorrect;
    expect(crewRowKeyForWarning(w)).toBeNull();
  });
});

describe("crewRowKeyForWarning — blockRef-keyed codes", () => {
  it("keys off blockRef.name for kind crew", () => {
    expect(crewRowKeyForWarning(blockRefWarning({}))).toBe("john redcorn");
  });

  it("strips the raw day-restriction paren so the key matches the rendered displayName (R3-F1)", () => {
    expect(
      crewRowKeyForWarning(
        blockRefWarning({
          blockRef: { kind: "crew", index: 1, name: "Calvin Saller (6/24 and 6/26 ONLY)" },
        }),
      ),
    ).toBe("calvin saller");
  });

  it("name that is ONLY a paren marker strips to empty → null", () => {
    expect(
      crewRowKeyForWarning(
        blockRefWarning({ blockRef: { kind: "crew", index: 2, name: "(6/24 ONLY)" } }),
      ),
    ).toBeNull();
  });

  it("kind !== crew → null", () => {
    expect(
      crewRowKeyForWarning(blockRefWarning({ blockRef: { kind: "hotel", name: "Four Seasons" } })),
    ).toBeNull();
  });

  it("blank/whitespace name → null", () => {
    expect(
      crewRowKeyForWarning(blockRefWarning({ blockRef: { kind: "crew", index: 3, name: "   " } })),
    ).toBeNull();
  });

  it("missing name → null", () => {
    expect(
      crewRowKeyForWarning(blockRefWarning({ blockRef: { kind: "crew", index: 3 } })),
    ).toBeNull();
  });

  it("missing blockRef → null", () => {
    const w = blockRefWarning({});
    delete (w as { blockRef?: unknown }).blockRef;
    expect(crewRowKeyForWarning(w)).toBeNull();
  });

  it("trims surrounding spaces", () => {
    expect(
      crewRowKeyForWarning(
        blockRefWarning({ blockRef: { kind: "crew", index: 5, name: "  Kari Rose  " } }),
      ),
    ).toBe("kari rose");
  });
});

describe("stripDayRestrictionParen — parity with extractDayRestriction's cleanedNameCell", () => {
  // Single-source refactor pin (spec §2A): the display transform and the keying
  // transform cannot drift for the corpus name forms.
  const corpusNames = [
    "Calvin Saller (6/24 and 6/26 ONLY)",
    "Kari Rose (10/7 ONLY)",
    "Doug Larson",
    "Eric Weiss ",
  ];
  for (const nameCell of corpusNames) {
    it(`cleanedNameCell === stripDayRestrictionParen for ${JSON.stringify(nameCell)}`, () => {
      expect(extractDayRestriction({ nameCell, roleCell: "" }).cleanedNameCell.trim()).toBe(
        stripDayRestrictionParen(nameCell),
      );
    });
  }
});
