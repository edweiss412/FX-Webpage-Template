import { describe, it, expect, vi } from "vitest";
import { applyParseResult, type ApplyParseResultArgs } from "@/lib/sync/applyParseResult";
import type { ScheduleDay } from "@/lib/parser/types";

const titled = (start: string): ScheduleDay => ({ entries: [{ start, title: "Keynote" }], showStart: start, window: null });
const bareWindow: ScheduleDay = { entries: [], showStart: null, window: { start: "7:30am", end: "5:50pm" } };
const showStartOnly: ScheduleDay = { entries: [], showStart: "8:00 AM", window: null };
const fullyEmpty: ScheduleDay = { entries: [], showStart: null, window: null };

function makeTx() {
  const captured: { run_of_show?: Record<string, ScheduleDay> | null } = {};
  const tx = {
    deleteCrewMembersNotIn: vi.fn(), upsertCrewMembers: vi.fn(),
    provisionAddedCrewAuth: vi.fn(), revokeRemovedCrewAuth: vi.fn(),
    replaceHotelReservations: vi.fn(), replaceRooms: vi.fn(),
    replaceTransportation: vi.fn(), replaceContacts: vi.fn(),
    upsertShowsInternal: vi.fn(async (_id: string, payload: { run_of_show: Record<string, ScheduleDay> | null }) => {
      captured.run_of_show = payload.run_of_show;
    }),
    deleteLivePendingIngestion: vi.fn(),
  };
  return { tx, captured };
}
// Minimal ParseResult — only fields apply dereferences; runOfShow + warnings are the focus.
function baseArgs(runOfShow: Record<string, ScheduleDay> | undefined, prior: Record<string, ScheduleDay> | null) {
  return {
    driveFileId: "f1",
    parseResult: {
      show: { po: null, proposal: null, invoice: null, invoice_notes: null },
      crewMembers: [], hotelReservations: [], rooms: [], transportation: null,
      contacts: [], pullSheet: null,
      diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
      openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [],
      ...(runOfShow !== undefined ? { runOfShow } : {}),
    },
    snapshot: { showId: "s1", previousCrewNames: [], priorRunOfShow: prior },
  } as unknown as ApplyParseResultArgs; // tighter than `as never` so a wrong call shape still type-errors (R2 finding 4)
}

describe("applyParseResult — ScheduleDay persist predicate (§7)", () => {
  it("bare-window day AND showStart-only day BOTH survive storage (NOT entries.length>0)", async () => {
    const { tx, captured } = makeTx();
    await applyParseResult(tx, baseArgs({ "2025-06-25": bareWindow, "2025-06-26": showStartOnly }, null));
    expect(Object.keys(captured.run_of_show ?? {})).toEqual(["2025-06-25", "2025-06-26"]);
    expect(captured.run_of_show!["2025-06-25"]!.window).toEqual({ start: "7:30am", end: "5:50pm" });
    expect(captured.run_of_show!["2025-06-26"]!.showStart).toBe("8:00 AM");
  });

  it("fully-empty day (no entries/showStart/window) is dropped from storage", async () => {
    const { tx, captured } = makeTx();
    await applyParseResult(tx, baseArgs({ "2025-06-25": titled("7:15am"), "2025-06-26": fullyEmpty }, null));
    expect(Object.keys(captured.run_of_show ?? {})).toEqual(["2025-06-25"]);
  });

  it("ALL days fully-empty → run_of_show stored as null", async () => {
    const { tx, captured } = makeTx();
    await applyParseResult(tx, baseArgs({ "2025-06-25": fullyEmpty }, null));
    expect(captured.run_of_show).toBeNull();
  });

  it("AGENDA_DAY_EMPTIED fires ONLY when a prior-stored day becomes fully empty", async () => {
    const { tx } = makeTx();
    const args = baseArgs(
      { "2025-06-25": showStartOnly, "2025-06-26": fullyEmpty }, // 25 retains a time; 26 went empty
      { "2025-06-25": titled("7:15am"), "2025-06-26": titled("9:00am") }, // both were stored before
    );
    await applyParseResult(tx, args);
    const codes = (args as { parseResult: { warnings: { code: string; message: string }[] } }).parseResult.warnings.map((w) => w.code);
    const emptied = (args as { parseResult: { warnings: { code: string; message: string }[] } }).parseResult.warnings.filter((w) => w.code === "AGENDA_DAY_EMPTIED");
    expect(codes).toContain("AGENDA_DAY_EMPTIED");
    expect(emptied).toHaveLength(1); // only 2025-06-26 (25 retained a showStart → NOT emptied)
    expect(emptied[0]!.message).toContain("2025-06-26");
  });
});
