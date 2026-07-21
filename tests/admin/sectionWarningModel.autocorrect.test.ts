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
    expect(crew.warningsByCrewKey["eric weiss"]![0]!.warning.autocorrect!.subject).toBe("Eric Weiss");
  });

  it("excludes blank-subject warnings from the index (they fall back to the group)", () => {
    const crew = record.crew!;
    // 3 active crew warnings total, but only 2 keyed (blank excluded).
    const keyed = Object.values(crew.warningsByCrewKey).flat();
    expect(crew.active).toHaveLength(3);
    expect(keyed).toHaveLength(2);
  });

  it("is empty for a section with no crew-scoped warnings", () => {
    const rec = buildSectionWarningModel({
      slug: "s",
      warnings: [
        { severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet: "X | y", blockRef: { kind: "venue" } },
      ],
      ignoredFingerprints: new Set(),
      renderedSectionIds: new Set(["venue"]),
    });
    expect(Object.keys(rec.venue!.warningsByCrewKey)).toEqual([]);
  });
});
