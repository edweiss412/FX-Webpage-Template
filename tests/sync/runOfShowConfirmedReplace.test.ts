import { describe, it, expect, vi } from "vitest";
import type { AgendaEntry, ParseResult } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";
// §01 parser-owned warning factory — what parseAgenda ACTUALLY produces when runOfShow is undefined.
// (Parser owns GRID_MALFORMED/BLOCK_UNRESOLVED/DAY_AMBIGUOUS/DAY_TRUNCATED; the sync owns DAY_EMPTIED only.)
// Import from the concrete §01 module (lib/parser/blocks/agendaWarnings — where the 5 code: literals live;
// the @/lib/parser barrel is NOT guaranteed to re-export them).
import { agendaGridMalformed } from "@/lib/parser/blocks/agendaWarnings";

const d1 = "2026-05-09"; // a showDay in the base fixture below
const d2 = "2026-05-10"; // a 2nd showDay
const e1: AgendaEntry[] = [{ start: "9:00 AM", title: "Keynote A" }];
const e1b: AgendaEntry[] = [{ start: "9:00 AM", title: "Keynote A v2" }];
const e2: AgendaEntry[] = [{ start: "1:00 PM", title: "Panel B" }];

// Minimal ParseResult factory (mirror tests/sync/phase2.test.ts parseResult(); only the fields the apply reads).
function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "T",
      client_label: "c",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: [d1, d2],
        travelOut: "2026-05-11",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: "Pending",
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}

function fileMeta(modifiedTime = "2026-05-08T12:00:00.000Z"): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "S",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["f"],
  };
}

// FakePhase2Tx: captures the upsertShowsInternal payload; applyShowSnapshot returns a SEEDED priorRunOfShow.
function makeFakeTx(priorRunOfShow: Record<string, AgendaEntry[]> | null) {
  const captured: { payload?: { run_of_show: unknown; parse_warnings: ParseResult["warnings"] } } =
    {};
  const tx = {
    async applyShowSnapshot() {
      return {
        outcome: "updated" as const,
        showId: "show-1",
        previousCrewNames: [] as string[],
        previousCrewMembers: [],
        priorRunOfShow, // the field under test — modeled on the new shows_internal SELECT
      };
    },
    async deleteCrewMembersNotIn() {},
    async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal(
      _showId: string,
      payload: { run_of_show: unknown; parse_warnings: ParseResult["warnings"] },
    ) {
      captured.payload = payload;
    },
    async deleteLivePendingIngestion() {},
  };
  return { tx, captured };
}

async function runWith(
  tx: ReturnType<typeof makeFakeTx>["tx"],
  runOfShow: ParseResult["runOfShow"],
  // `seedWarnings` models the PARSER-OWNED warnings parseAgenda already put in parseResult.warnings
  // before the apply runs (e.g. agendaGridMalformed(0) when runOfShow is undefined). The sync must
  // CARRY these through unchanged and only ADD AGENDA_DAY_EMPTIED.
  opts: { showDays?: string[]; seedWarnings?: ParseResult["warnings"] } = {},
) {
  const { showDays = [d1, d2], seedWarnings = [] } = opts;
  vi.resetModules();
  const { runPhase2 } = await import("@/lib/sync/phase2");
  const base = parseResult();
  const pr = parseResult({
    warnings: seedWarnings,
    show: { ...base.show, dates: { ...base.show.dates, showDays } },
  });
  // Set runOfShow directly. Case (ii) passes undefined (grid unlocatable): under
  // exactOptionalPropertyTypes assigning undefined to the non-undefined optional property is rejected,
  // so delete it instead (the parser omits the field on the unlocatable path). Otherwise assign.
  if (runOfShow === undefined) delete pr.runOfShow;
  else pr.runOfShow = runOfShow;
  const result = await runPhase2(tx as never, {
    driveFileId: "file-1",
    mode: "cron" as const,
    fileMeta: fileMeta("2026-05-08T11:59:00.000Z"),
    binding: { bindingToken: "tok", modifiedTime: "2026-05-08T12:00:00.000Z" },
    parseResult: pr,
  });
  return result;
}

function codes(captured: ReturnType<typeof makeFakeTx>["captured"]): string[] {
  return (captured.payload?.parse_warnings ?? []).map((w) => w.code);
}

describe("sync run_of_show CONFIRMED-ONLY full replace + AGENDA_DAY_EMPTIED live plumbing (D-2 / R6 / R17/R21/R22)", () => {
  it("(i) one block unresolved (d2 absent from parse) → stored {d1:e1}, d2 NOT preserved, NO AGENDA_DAY_EMPTIED", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: e1b }); // d2 absent (unresolved block → parser already emitted AGENDA_BLOCK_UNRESOLVED)
    expect(captured.payload!.run_of_show).toEqual({ [d1]: e1b });
    expect(captured.payload!.run_of_show).not.toHaveProperty(d2);
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED"); // d2 absent, not read-empty
  });
  it("(ii) grid unlocatable (runOfShow === undefined) → stored null; the PARSER's AGENDA_GRID_MALFORMED is carried through UNCHANGED (sync adds nothing), ZERO AGENDA_DAY_EMPTIED", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 }); // both previously stored — makes the no-EMPTIED load-bearing
    // parseAgenda already emitted GRID_MALFORMED into parseResult.warnings when it returned undefined — SEED it.
    await runWith(tx, undefined, { seedWarnings: [agendaGridMalformed(0)] });
    expect(captured.payload!.run_of_show).toBeNull();
    // EXACTLY ONE GRID_MALFORMED — unchanged by the sync (proves the sync CARRIES, never RE-EMITS the parser-owned code;
    // a sync-side duplicate emit would make this 2).
    expect(codes(captured).filter((c) => c === "AGENDA_GRID_MALFORMED")).toHaveLength(1);
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED"); // conversion fault, not per-day blanking (R22)
  });
  it("(iii) previously-stored day goes read-empty → dropped + AGENDA_DAY_EMPTIED for that day", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: e1b, [d2]: [] });
    expect(captured.payload!.run_of_show).toEqual({ [d1]: e1b });
    expect(codes(captured)).toContain("AGENDA_DAY_EMPTIED");
  });
  it("(iv) all read-empty → stored null + AGENDA_DAY_EMPTIED for every previously-stored day", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: [], [d2]: [] });
    expect(captured.payload!.run_of_show).toBeNull();
    expect(codes(captured).filter((c) => c === "AGENDA_DAY_EMPTIED")).toHaveLength(2);
  });
  it("(vi) first-time read-empty (no prior) → stored null, NO AGENDA_DAY_EMPTIED", async () => {
    const { tx, captured } = makeFakeTx(null);
    await runWith(tx, { [d1]: [], [d2]: [] });
    expect(captured.payload!.run_of_show).toBeNull();
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED");
  });
  it("(vii) self-heal: a later confirmed re-sync re-stores the day", async () => {
    const { tx, captured } = makeFakeTx(null); // prior dropped
    await runWith(tx, { [d2]: e2 });
    expect(captured.payload!.run_of_show).toEqual({ [d2]: e2 });
    expect(codes(captured)).not.toContain("AGENDA_DAY_EMPTIED");
  });
  it("NO write-time date prune (R12): a confirmed day absent from dates.showDays is STILL stored", async () => {
    const { tx, captured } = makeFakeTx(null);
    await runWith(tx, { [d2]: e2 }, { showDays: [d1] }); // showDays = [d1] only; d2 confirmed by AGENDA
    expect(captured.payload!.run_of_show).toEqual({ [d2]: e2 }); // storage NOT gated by dates (hidden at read, not write)
  });
  it("CHANNEL 1 (shows_internal) — an AGENDA_DAY_EMPTIED-emitting apply puts it in the upsertShowsInternal payload (NOT proof of sync_log — see runOfShowSyncLogChannel.test.ts)", async () => {
    const { tx, captured } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    await runWith(tx, { [d1]: e1b, [d2]: [] });
    expect(captured.payload!.parse_warnings.some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(
      true,
    );
  });
  it("R6 cross-boundary: Phase2Result.applied.parseWarnings carries the apply-appended AGENDA_DAY_EMPTIED OUT of runPhase2", async () => {
    const { tx } = makeFakeTx({ [d1]: e1, [d2]: e2 });
    const result = await runWith(tx, { [d1]: e1b, [d2]: [] });
    expect(result.outcome).toBe("applied");
    // the applied result must surface the warning so the tail (PART C) can log it to sync_log
    expect(
      (result as { parseWarnings?: ParseResult["warnings"] }).parseWarnings?.some(
        (w) => w.code === "AGENDA_DAY_EMPTIED",
      ),
    ).toBe(true);
  });
});
