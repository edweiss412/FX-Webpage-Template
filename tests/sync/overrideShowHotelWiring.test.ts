import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { CrewMemberRow, HotelReservationRow, ParseResult, ShowRow } from "@/lib/parser/types";
import { loadActiveOverrides, LoadActiveOverridesInfraError } from "@/lib/sync/loadActiveOverrides";
import type { ActiveOverrideRow } from "@/lib/sync/overrideShowHotel";

// ---- fixtures -------------------------------------------------------------

const PARSED_DATES: ShowRow["dates"] = {
  travelIn: "2026-05-07",
  set: "2026-05-08",
  showDays: ["2026-05-09"],
  travelOut: "2026-05-10",
};
const OVERRIDE_DATES: ShowRow["dates"] = {
  travelIn: "2026-09-01",
  set: "2026-09-02",
  showDays: ["2026-09-03"],
  travelOut: "2026-09-04",
};

function hotel(ordinal: number, hotel_name: string): HotelReservationRow {
  return {
    ordinal,
    hotel_name,
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
  };
}

function crew(name: string): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: null,
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function parseResult(): ParseResult {
  return {
    show: {
      title: "Show Title",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: PARSED_DATES,
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [crew("Alice")],
    hotelReservations: [hotel(1, "Parsed Hotel")],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

function fileMeta(modifiedTime: string): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
  };
}

// ---- fake tx --------------------------------------------------------------

class WiringFakeTx {
  loadCalls = 0;
  activeOverrides: ActiveOverrideRow[] = [];
  snapshotParse: ParseResult | null = null;
  hotelRowsWritten: HotelReservationRow[] | null = null;
  operations: string[] = [];

  async loadActiveOverrides(_driveFileId: string) {
    this.loadCalls += 1;
    return { data: this.activeOverrides, error: null };
  }

  async applyShowSnapshot(args: {
    driveFileId: string;
    modifiedTime: string;
    parseResult: ParseResult;
  }) {
    this.snapshotParse = args.parseResult;
    this.operations.push("applyShowSnapshot");
    return {
      outcome: "updated" as const,
      showId: "show-1",
      previousCrewNames: ["Alice"],
      previousCrewMembers: [{ ...crew("Alice"), id: "crew-1", claimed_via_oauth_at: null }],
      priorRunOfShow: null,
    };
  }

  async deleteCrewMembersNotIn() {}
  async upsertCrewMembers() {}
  async provisionAddedCrewAuth() {}
  async revokeRemovedCrewAuth() {}
  async replaceHotelReservations(_showId: string, rows: HotelReservationRow[]) {
    this.hotelRowsWritten = rows;
    this.operations.push("replaceHotelReservations");
  }
  async replaceRooms() {}
  async replaceTransportation() {}
  async replaceContacts() {}
  async upsertShowsInternal() {}
  async deleteLivePendingIngestion() {}
}

const baseArgs = {
  driveFileId: "file-1",
  mode: "cron" as const,
  fileMeta: fileMeta("2026-05-08T11:59:00.000Z"),
  binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
  parseResult: parseResult(),
};

async function runWith(tx: WiringFakeTx) {
  vi.resetModules();
  const { runPhase2 } = await import("@/lib/sync/phase2");
  return runPhase2(tx as never, { ...baseArgs, parseResult: parseResult() });
}

// ---- wiring (SYNC-1) ------------------------------------------------------

describe("runPhase2 override wiring (SYNC-1)", () => {
  test("BOTH applyShowSnapshot AND applyParseResult consume the OVERRIDDEN parse", async () => {
    const tx = new WiringFakeTx();
    tx.activeOverrides = [
      {
        id: "ov-show",
        domain: "show",
        field: "dates",
        match_key: "",
        override_value: OVERRIDE_DATES,
      },
      {
        id: "ov-hotel",
        domain: "hotel",
        field: "hotel_name",
        match_key: "Parsed Hotel",
        override_value: "Overridden Hotel",
      },
    ];

    const result = await runWith(tx);

    expect(result.outcome).toBe("applied");
    // applyShowSnapshot (phase2.ts:288) saw the overridden show.dates, not the parsed dates.
    expect(tx.snapshotParse?.show.dates).toBe(OVERRIDE_DATES);
    expect(tx.snapshotParse?.show.dates).not.toBe(PARSED_DATES);
    // applyParseResult (phase2.ts:368) → replaceHotelReservations saw the overridden hotel_name.
    expect(tx.hotelRowsWritten?.[0]?.hotel_name).toBe("Overridden Hotel");
    // one locked-tx read of active overrides (SYNC-1: single read).
    expect(tx.loadCalls).toBe(1);
  });

  test("show/hotel side effects are surfaced on the applied result for Stage B", async () => {
    const tx = new WiringFakeTx();
    tx.activeOverrides = [
      {
        id: "ov-show",
        domain: "show",
        field: "dates",
        match_key: "",
        override_value: OVERRIDE_DATES,
      },
    ];

    const result = await runWith(tx);

    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") throw new Error("expected applied");
    expect(result.showHotelSideEffects).toContainEqual({
      overrideId: "ov-show",
      sheetValue: PARSED_DATES,
    });
  });

  test("no override-read port → transform skipped, parsed values written unchanged", async () => {
    // A tx without loadActiveOverrides (legacy callers) must behave exactly as before.
    class LegacyTx extends WiringFakeTx {}
    const tx = new LegacyTx();
    // strip the port so the optional wiring is skipped.
    (tx as { loadActiveOverrides?: unknown }).loadActiveOverrides = undefined;

    const result = await runWith(tx);

    expect(result.outcome).toBe("applied");
    expect(tx.snapshotParse?.show.dates).toBe(PARSED_DATES);
    expect(tx.hotelRowsWritten?.[0]?.hotel_name).toBe("Parsed Hotel");
    expect(tx.loadCalls).toBe(0);
  });
});

// ---- loadActiveOverrides {data,error} discipline --------------------------

describe("loadActiveOverrides — Supabase call-boundary discipline", () => {
  test("returns rows on the happy path", async () => {
    const rows: ActiveOverrideRow[] = [
      { id: "a", domain: "show", field: "dates", match_key: "", override_value: {} },
    ];
    const port = { loadActiveOverrides: async () => ({ data: rows, error: null }) };

    await expect(loadActiveOverrides(port, "file-1")).resolves.toEqual(rows);
  });

  test("null data → empty array (no rows, not an error)", async () => {
    const port = { loadActiveOverrides: async () => ({ data: null, error: null }) };
    await expect(loadActiveOverrides(port, "file-1")).resolves.toEqual([]);
  });

  test("returned error → typed infra error (not silent)", async () => {
    const port = {
      loadActiveOverrides: async () => ({ data: null, error: { message: "boom" } }),
    };
    await expect(loadActiveOverrides(port, "file-1")).rejects.toBeInstanceOf(
      LoadActiveOverridesInfraError,
    );
  });

  test("thrown error → typed infra error (distinguished from returned error)", async () => {
    const port = {
      loadActiveOverrides: async () => {
        throw new Error("network down");
      },
    };
    await expect(loadActiveOverrides(port, "file-1")).rejects.toBeInstanceOf(
      LoadActiveOverridesInfraError,
    );
  });
});
