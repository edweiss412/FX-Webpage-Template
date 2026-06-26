import { describe, it, expect } from "vitest";
import { scheduleTimeUnparsed } from "@/lib/parser/blocks/agendaWarnings";

describe("scheduleTimeUnparsed warning constructor", () => {
  // _Catches:_ a constructor that emits the wrong code/severity/blockRef, or
  // that omits the ISO from the message (operators must see WHICH day failed).
  it("returns a SCHEDULE_TIME_UNPARSED warn-severity ParseWarning carrying the ISO", () => {
    const w = scheduleTimeUnparsed(1, "2025-05-14");
    expect(w.code).toBe("SCHEDULE_TIME_UNPARSED");
    expect(w.severity).toBe("warn");
    // blockRef carries `iso` — the stable key the scan uses to attach a source-cell
    // deep-link anchor (correlated by date, not markdown row index).
    expect(w.blockRef).toEqual({ kind: "dates", index: 1, iso: "2025-05-14" });
    expect(w.message).toContain("2025-05-14");
  });
});
