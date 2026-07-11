/**
 * Task 6 — "use the sheet's raw value" overlay wired through runPhase2 + both apply
 * paths (persistence + STALE change-log). DB-free: a fake Phase2Tx + fake holdPort
 * captures the persisted rooms/hotels rows, the shows_internal.use_raw_decisions
 * payload, and every show_change_log insert, so the test runs with an empty
 * TEST_DATABASE_URL (no Postgres).
 *
 * The crux (test 4): the STALE change-log write is its OWN branch guarded only by
 * `port && invalidated.length > 0` — a first-seen finalize (no previousCrewMembers,
 * no notableItems, so the crew-diff auto-apply block is skipped) STILL writes it. A
 * mis-placement inside the crew-diff guard fails test 4.
 */
import { describe, expect, test, vi } from "vitest";
import type { CrewMemberRow, ParseResult, ParseWarning, RoomRow } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { messageFor, plainCatalogText } from "@/lib/messages/lookup";

// ---- Fixtures -----------------------------------------------------------------

const ROOM_HASH = "room-content-hash-abc";
const DATE_HASH = "date-content-hash-ghi";
const GONE_HASH = "no-current-warning-matches-this";

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

// The room whose transform (name/dims/floor) matches the resolvable warning's `parsed`.
function ballroom(): RoomRow {
  return {
    kind: "gs",
    name: "Ballroom A",
    dimensions: "40x60",
    floor: "2",
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
  };
}

// The RAW value the room becomes after the overlay applies the replacement.
const RAW_ROOM_NAME = "Ballroom A 40x60 Floor 2";

function roomWarning(): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "room header split ambiguous",
    resolution: {
      resolvable: true,
      contentHash: ROOM_HASH,
      parsed: { kind: "rooms", name: "Ballroom A", dimensions: "40x60", floor: "2" },
      replacement: { kind: "rooms", name: RAW_ROOM_NAME, dimensions: null, floor: null },
    },
  };
}

function dateWarning(): ParseWarning {
  return {
    severity: "warn",
    code: "DATE_ORDER_SUGGESTS_DMY",
    message: "date order suggests DMY",
    resolution: {
      resolvable: true,
      contentHash: DATE_HASH,
      parsed: {
        kind: "dates",
        dates: {
          travelIn: "2026-05-07",
          set: "2026-05-08",
          showDays: ["2026-05-09"],
          travelOut: "2026-05-10",
        },
      },
      replacement: {
        kind: "dates",
        dmyDates: {
          travelIn: "2026-07-05",
          set: "2026-08-05",
          showDays: ["2026-09-05"],
          travelOut: "2026-10-05",
        },
      },
    },
  };
}

function parseResult(warnings: ParseWarning[]): ParseResult {
  return {
    show: {
      title: "Show Title",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
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
    crewMembers: [crew("Alice")],
    hotelReservations: [
      {
        ordinal: 1,
        hotel_name: "Hotel A",
        hotel_address: null,
        names: ["Alice"],
        confirmation_no: null,
        check_in: null,
        check_out: null,
        notes: null,
      },
    ],
    rooms: [ballroom()],
    transportation: {
      driver_name: null,
      driver_phone: null,
      driver_email: null,
      loadout_name: null,
      loadout_phone: null,
      loadout_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [],
      notes: null,
    },
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings,
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

const DECISION_BASE = {
  applied: true,
  decidedAt: "2026-07-11T00:00:00.000Z",
  decidedBy: "admin@fxav",
};

function rawRoomDecision(): UseRawDecision {
  return {
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    contentHash: ROOM_HASH,
    target: { kind: "rooms", name: "Ballroom A" },
    preference: "raw",
    ...DECISION_BASE,
  };
}

function invalidatedHotelDecision(): UseRawDecision {
  return {
    code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
    contentHash: GONE_HASH, // matches no current warning → invalidated
    target: { kind: "hotels", index: 0 },
    preference: "raw",
    ...DECISION_BASE,
  };
}

function revertedDateDecision(): UseRawDecision {
  return {
    code: "DATE_ORDER_SUGGESTS_DMY",
    contentHash: DATE_HASH,
    target: { kind: "dates" },
    preference: "transform", // reverted regardless of match
    ...DECISION_BASE,
  };
}

// ---- Fake tx + holdPort (records everything in memory) ------------------------

type ChangeLogInsert = { sql: string; params: unknown[] };

function makeTx(opts: { firstSeen?: boolean } = {}) {
  const changeLogInserts: ChangeLogInsert[] = [];
  let unsafeCalls = 0;
  const capture = {
    showSnapshotParseResult: null as ParseResult | null,
    rooms: null as ParseResult["rooms"] | null,
    hotels: null as ParseResult["hotelReservations"] | null,
    showsInternalPayload: null as Record<string, unknown> | null,
    changeLogInserts,
    get unsafeCalls() {
      return unsafeCalls;
    },
  };

  const port = {
    async unsafe(sql: string, params: unknown[]): Promise<unknown[]> {
      unsafeCalls += 1;
      if (sql.includes("insert into public.show_change_log")) {
        changeLogInserts.push({ sql, params });
      }
      // readOpenHolds select + any other read → no rows.
      return [];
    },
  };

  const tx = {
    holdPort() {
      return port;
    },
    async applyShowSnapshot(args: { parseResult: ParseResult }) {
      capture.showSnapshotParseResult = args.parseResult;
      return {
        outcome: "updated" as const,
        showId: "show-1",
        previousCrewNames: opts.firstSeen ? [] : ["Alice"],
        ...(opts.firstSeen ? {} : { previousCrewMembers: [] }),
        priorRunOfShow: null,
      };
    },
    async deleteCrewMembersNotIn() {},
    async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations(_showId: string, rows: ParseResult["hotelReservations"]) {
      capture.hotels = rows;
    },
    async replaceRooms(_showId: string, rows: ParseResult["rooms"]) {
      capture.rooms = rows;
    },
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal(_showId: string, payload: Record<string, unknown>) {
      capture.showsInternalPayload = payload;
    },
    async deleteLivePendingIngestion() {},
  };

  return { tx, capture, port };
}

const baseArgs = {
  driveFileId: "file-1",
  mode: "cron" as const,
  fileMeta: {
    driveFileId: "file-1",
    name: "Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
  },
  binding: { bindingToken: "tok", modifiedTime: "2026-05-08T12:00:00.000Z" },
  verifyReelOnApply: false as const,
};

async function run(txLike: unknown, overrides: Record<string, unknown>) {
  vi.resetModules();
  const { runPhase2 } = await import("@/lib/sync/phase2");
  return runPhase2(txLike as never, { ...baseArgs, ...overrides } as never);
}

// ---- Tests --------------------------------------------------------------------

describe("Task 6 — use-raw overlay wired into runPhase2 + persistence + STALE change-log", () => {
  test("1. matched raw decision → persisted rooms carry the raw value AND shows_internal.use_raw_decisions holds it applied:true", async () => {
    const { tx, capture } = makeTx();
    const result = await run(tx, {
      parseResult: parseResult([roomWarning()]),
      useRawDecisions: [rawRoomDecision()],
    });
    expect(result).toMatchObject({ outcome: "applied" });

    // Persisted rooms row carries the RAW value (overlay applied before both writes).
    const persistedRoom = capture.rooms?.[0];
    expect(persistedRoom?.name).toBe(RAW_ROOM_NAME);
    expect(persistedRoom?.dimensions).toBeNull();
    expect(persistedRoom?.floor).toBeNull();

    // shows_internal.use_raw_decisions carries the kept decision, applied:true.
    const kept = capture.showsInternalPayload?.use_raw_decisions as UseRawDecision[];
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      contentHash: ROOM_HASH,
      preference: "raw",
      applied: true,
    });

    // No STALE change-log row (nothing invalidated).
    expect(capture.changeLogInserts).toHaveLength(0);
  });

  test("2. invalidated decision → one use_raw_stale change-log row (plain summary, no raw code) AND pruned from kept", async () => {
    const { tx, capture } = makeTx();
    await run(tx, {
      // roomWarning present (so a room decision could match), but the HOTEL decision's
      // hash matches nothing → invalidated.
      parseResult: parseResult([roomWarning()]),
      useRawDecisions: [rawRoomDecision(), invalidatedHotelDecision()],
    });

    expect(capture.changeLogInserts).toHaveLength(1);
    const ins = capture.changeLogInserts[0]!;
    // Column order (writeAutoApplyChanges mirror): show_id, drive_file_id, occurred_at,
    // change_kind, entity_ref, summary, before_image, after_image.
    expect(ins.sql).toContain("'auto_apply'");
    expect(ins.sql).toContain("'use_raw_stale'");
    expect(ins.sql).toContain("'applied'");
    expect(ins.sql).toContain("'system'");
    const summary = ins.params.find(
      (p) => typeof p === "string" && p.includes("raw text"),
    ) as string;
    // Plain-language summary derived from the catalog; NEVER the raw code.
    const expected = plainCatalogText(messageFor("USE_RAW_DECISION_STALE").dougFacing ?? "", {
      target: "hotel reservation 1",
    });
    expect(summary).toBe(expected);
    expect(summary).not.toContain("USE_RAW_DECISION_STALE");

    // The invalidated decision is NOT in the persisted kept set (GC'd); only the room kept.
    const kept = capture.showsInternalPayload?.use_raw_decisions as UseRawDecision[];
    expect(kept.map((d) => d.code)).toEqual(["ROOM_HEADER_SPLIT_AMBIGUOUS"]);
  });

  test("3. reverted (preference:transform) decision → transform value persisted, decision GC'd, NO change-log row", async () => {
    const { tx, capture } = makeTx();
    await run(tx, {
      parseResult: parseResult([dateWarning()]),
      useRawDecisions: [revertedDateDecision()],
    });

    // Transform (MDY) dates stand — the overlay applied nothing.
    expect(capture.showSnapshotParseResult?.show.dates.travelIn).toBe("2026-05-07");
    // Reverted decisions are neither kept nor written as STALE.
    const kept = capture.showsInternalPayload?.use_raw_decisions as UseRawDecision[];
    expect(kept).toHaveLength(0);
    expect(capture.changeLogInserts).toHaveLength(0);
  });

  test("4. CRUX — first-seen finalize (no previousCrewMembers) STILL writes the use_raw_stale row", async () => {
    const { tx, capture } = makeTx({ firstSeen: true });
    await run(tx, {
      parseResult: parseResult([]),
      useRawDecisions: [invalidatedHotelDecision()],
      // NO notableItems → the crew-diff auto-apply block is skipped. The STALE branch
      // must fire independently.
    });
    expect(capture.changeLogInserts).toHaveLength(1);
    expect(capture.changeLogInserts[0]!.sql).toContain("'use_raw_stale'");
  });

  test("5. lock-held — the STALE write rides the caller's JS-held show lock via tx.holdPort().unsafe (no separate client)", async () => {
    const { tx, capture, port } = makeTx();
    const unsafeSpy = vi.spyOn(port, "unsafe");
    await run(tx, {
      parseResult: parseResult([]),
      useRawDecisions: [invalidatedHotelDecision()],
    });
    // The change-log insert went through the same locked-tx port that runPhase2 obtained
    // from tx.holdPort() — not a fresh service-role connection.
    const insertCall = unsafeSpy.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("insert into public.show_change_log"),
    );
    expect(insertCall).toBeDefined();
    expect(capture.unsafeCalls).toBeGreaterThan(0);
  });
});
