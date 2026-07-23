import { describe, it, expect } from "vitest";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import type { ParseWarning } from "@/lib/parser/types";

// Task 4 (plan §5.2). buildSectionWarningModel exposes warningsByCrewKey on each
// section: every ACTIVE crew-scoped warning with a non-blank canonical subject,
// keyed canonicalCrewKey(subject). Blank subjects are excluded. The model is
// render-agnostic — no CREW_CAP, no cap exclusion (that is Task 5's render concern).

const crewWarn = (subject: string | null, detected: string): ParseWarning => ({
  severity: "warn",
  code: "STAGE_WORD_AUTOCORRECTED",
  message: "internal",
  blockRef: { kind: "crew" },
  autocorrect: { subject, corrections: [{ detected, corrected: `${detected}!` }] },
});

describe("buildSectionWarningModel — warningsByCrewKey", () => {
  const warnings: ParseWarning[] = [
    crewWarn("Eric Weiss", "Strke"),
    crewWarn("Carl Fenton", "Lod"),
    crewWarn("   ", "Blank"), // blank subject → excluded
  ];

  const record = buildSectionWarningModel({
    slug: "s",
    warnings,
    ignoredFingerprints: new Set(),
    renderedSectionIds: new Set(["crew"]),
  });

  it("indexes each non-blank subject by its canonical key", () => {
    const crew = record.crew!;
    expect(crew.warningsByCrewKey).toBeDefined();
    expect(Object.keys(crew.warningsByCrewKey).sort()).toEqual(["carl fenton", "eric weiss"]);
    expect(crew.warningsByCrewKey["eric weiss"]!).toHaveLength(1);
    expect(crew.warningsByCrewKey["eric weiss"]![0]!.warning.autocorrect!.subject).toBe(
      "Eric Weiss",
    );
  });

  it("excludes blank-subject warnings from the index (they fall back to the group)", () => {
    const crew = record.crew!;
    // 3 active crew warnings total, but only 2 keyed (blank excluded).
    const keyed = Object.values(crew.warningsByCrewKey).flat();
    expect(crew.active).toHaveLength(3);
    expect(keyed).toHaveLength(2);
  });

  it("prototype-pollution key names do not crash construction (whole-diff HIGH)", () => {
    // A sheet-derived crew name canonicalizing to an Object.prototype member ("constructor",
    // "__proto__" — both already lowercase) must index safely; bracket-write on a fresh {}
    // would select the inherited fn/object and throw on .push.
    for (const bad of ["constructor", "__proto__"]) {
      const rec = buildSectionWarningModel({
        slug: "s",
        warnings: [crewWarn(bad, "X")],
        ignoredFingerprints: new Set(),
        renderedSectionIds: new Set(["crew"]),
      });
      const map = rec.crew!.warningsByCrewKey;
      // Own property holding the warning; own-key iteration is safe.
      expect(Object.keys(map)).toContain(bad);
      expect(map[bad]!).toHaveLength(1);
    }
  });

  it("is empty for a section with no crew-scoped warnings", () => {
    const rec = buildSectionWarningModel({
      slug: "s",
      warnings: [
        {
          severity: "warn",
          code: "UNKNOWN_FIELD",
          message: "m",
          rawSnippet: "X | y",
          blockRef: { kind: "venue" },
        },
      ],
      ignoredFingerprints: new Set(),
      renderedSectionIds: new Set(["venue"]),
    });
    expect(Object.keys(rec.venue!.warningsByCrewKey)).toEqual([]);
  });
});

// crew-warning-attachment T2 (spec 2026-07-23 §2A/§5.2): blockRef-crew warnings
// (FIELD_UNREADABLE etc.) now key into warningsByCrewKey via crewRowKeyForWarning —
// raw names pass through stripDayRestrictionParen so the key matches the rendered
// displayName (spec R3-F1/R4-F1). Failure modes: model still gated to the 2
// autocorrect codes, or keyed on the RAW name.
describe("buildSectionWarningModel — blockRef-crew keying (crew-warning-attachment)", () => {
  const fieldWarn = (name: string | undefined): ParseWarning =>
    ({
      severity: "warn",
      code: "FIELD_UNREADABLE",
      message: "internal",
      rawSnippet: "N/A",
      ...(name !== undefined
        ? { blockRef: { kind: "crew", index: 0, name } }
        : { blockRef: { kind: "crew", index: 0 } }),
    }) as ParseWarning;

  const record = buildSectionWarningModel({
    slug: "s",
    warnings: [
      fieldWarn("John Redcorn"),
      fieldWarn("Calvin Saller (6/24 and 6/26 ONLY)"), // raw day-restriction form
      fieldWarn("   "), // blank → excluded
      fieldWarn(undefined), // no name → excluded
    ],
    ignoredFingerprints: new Set(),
    renderedSectionIds: new Set(["crew"]),
  });

  it("keys FIELD_UNREADABLE crew warnings by canonical name", () => {
    expect(record.crew!.warningsByCrewKey["john redcorn"]!).toHaveLength(1);
  });

  it("keys a raw day-restriction name under the STRIPPED key (R4-F1: production key expression)", () => {
    const keys = Object.keys(record.crew!.warningsByCrewKey).sort();
    expect(keys).toEqual(["calvin saller", "john redcorn"]);
    // The raw form must NOT be a key — keying on the raw name would silently
    // disable under-row placement for every day-restricted row.
    expect(record.crew!.warningsByCrewKey["calvin saller (6/24 and 6/26 only)"]).toBeUndefined();
  });

  it("excludes blank-name and nameless blockRef items (they fall back to the group)", () => {
    expect(record.crew!.active).toHaveLength(4);
    expect(Object.values(record.crew!.warningsByCrewKey).flat()).toHaveLength(2);
  });
});
