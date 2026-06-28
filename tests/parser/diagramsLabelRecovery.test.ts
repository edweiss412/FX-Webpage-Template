import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser/index";

// Minimal v4 EVENT DETAILS block: header row + one [label, value] row.
// (Same builder shape as tests/parser/blocks/event.test.ts:145.)
const sheet = (label: string, value: string) => `| EVENT DETAILS | |\n| ${label} | ${value} |\n`;

const FOLDER_URL = "https://drive.google.com/drive/folders/RECOVERED123/view";

describe("PR-D5 — diagrams folder link recovers on a misspelled DIagrams label", () => {
  it("misspelled label → linkedFolder recovered, exactly one FIELD_LABEL_AUTOCORRECTED warn, event_details populated", () => {
    // "Diagrms" is Damerau-1 of "DIAGRAMS" (single deletion) and ≥5 chars → fuzzy-recovers.
    const r = parseSheet(sheet("Diagrms", FOLDER_URL));

    // (a) the folder-pins feature recovers the folder id from the typo-recovered value
    expect(r.diagrams.linkedFolder?.driveFolderId).toBe("RECOVERED123");

    // (b) NO double-warn: only parseEventDetails warns this cell — exactly one actionable autocorrect
    const autocorrects = r.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(autocorrects.length).toBe(1);
    expect(autocorrects[0]?.blockRef?.kind).toBe("details");

    // (c) the sibling text field was recovered too (the source of the fallback)
    expect(r.show.event_details.diagrams).toContain("RECOVERED123");
  });

  it("exact label → linkedFolder via parseDiagrams (fallback not needed), no autocorrect warn", () => {
    const r = parseSheet(sheet("Diagrams", FOLDER_URL));
    expect(r.diagrams.linkedFolder?.driveFolderId).toBe("RECOVERED123");
    expect(r.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED").length).toBe(0);
  });

  it("too-short typo (< minLen) → no fuzzy recovery → linkedFolder stays null", () => {
    // "Dgms" (4 chars) is below the gate's minLen:5 → event parser does not recover it,
    // so eventDetails.diagrams is empty and the fallback has nothing to derive from.
    const r = parseSheet(sheet("Dgms", FOLDER_URL));
    expect(r.diagrams.linkedFolder).toBeNull();
  });
});
