/**
 * tests/messages/agendaCodes.test.ts (agenda Phase B, Task 9.5)
 *
 * The three agenda data-quality codes are Doug-facing (admin) parse warnings,
 * NOT crew-facing. Pins their presence + audience in the runtime catalog; the
 * x1-catalog-parity gate separately enforces the §12.4 ↔ generated ↔ catalog
 * three-part lockstep.
 */
import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

describe("agenda data-quality codes", () => {
  test.each([
    "AGENDA_PDF_UNREADABLE",
    "AGENDA_FILE_INACCESSIBLE",
    "AGENDA_SCHEDULE_LOW_CONFIDENCE",
    "AGENDA_SCHEDULE_TIME_ADJUSTED",
    "AGENDA_LINK_NOT_CLICKABLE",
  ])("%s exists in the catalog with Doug-facing (admin-only) copy", (code) => {
    const entry = (
      MESSAGE_CATALOG as Record<string, { dougFacing: string | null; crewFacing: string | null }>
    )[code];
    expect(entry).toBeDefined();
    expect(entry!.dougFacing).toBeTruthy();
    expect(entry!.crewFacing).toBeNull();
  });
});

// Copy-content contract for the accessibility split (spec §4.2). The
// `/agenda document/i` presence/absence pair is the R1 false-embed regression
// guard: the inaccessible code must NOT claim crew see the document; the kept
// code (branch 417 — a valid PDF) must claim they do.
describe("agenda accessibility-split copy contract", () => {
  type CopyRow = {
    dougFacing: string | null;
    crewFacing: string | null;
    helpfulContext: string | null;
    longExplanation: string | null;
  };
  const row = (code: string): CopyRow => {
    const entry = (MESSAGE_CATALOG as unknown as Record<string, CopyRow | undefined>)[code];
    expect(entry, `${code} missing from catalog`).toBeDefined();
    return entry as CopyRow;
  };

  test("AGENDA_FILE_INACCESSIBLE names every cause, hedges visibility, and never claims the embed", () => {
    const r = row("AGENDA_FILE_INACCESSIBLE");
    // Every cause class is named in dougFacing.
    expect(r.dougFacing).toMatch(/shared with us/i);
    expect(r.dougFacing).toMatch(/deleted/i);
    expect(r.dougFacing).toMatch(/non-PDF/i);
    expect(r.dougFacing).toMatch(/too large/i);
    for (const field of [r.dougFacing, r.helpfulContext, r.longExplanation]) {
      // Crew-visibility is hedged in every authored field (never a categorical "can't see").
      expect(field).toMatch(/may not be able to see/i);
      // R1 regression guard: no field claims crew see the embedded agenda document.
      expect(field).not.toMatch(/agenda document/i);
      expect(field).not.toMatch(/still opens/i);
    }
    expect(r.crewFacing).toBeNull();
  });

  test("AGENDA_PDF_UNREADABLE (kept, branch 417) claims the embed and says no action", () => {
    const r = row("AGENDA_PDF_UNREADABLE");
    expect(r.dougFacing).toMatch(/no action/i);
    expect(r.dougFacing).toMatch(/agenda document/i);
    for (const field of [r.dougFacing, r.helpfulContext, r.longExplanation]) {
      expect(field).not.toMatch(/still opens/i);
    }
    expect(r.crewFacing).toBeNull();
  });
});
