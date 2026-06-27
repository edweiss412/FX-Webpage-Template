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
    "AGENDA_SCHEDULE_LOW_CONFIDENCE",
    "AGENDA_SCHEDULE_TIME_ADJUSTED",
  ])("%s exists in the catalog with Doug-facing (admin-only) copy", (code) => {
    const entry = (
      MESSAGE_CATALOG as Record<string, { dougFacing: string | null; crewFacing: string | null }>
    )[code];
    expect(entry).toBeDefined();
    expect(entry!.dougFacing).toBeTruthy();
    expect(entry!.crewFacing).toBeNull();
  });
});
