import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { CrewMemberRow, ParseResult, RoomRow } from "@/lib/parser/types";

type FakeShow = {
  id: string;
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  crewNames: string[];
  crewMembers?: CrewMemberRow[];
};

type FakeCrewAuth = {
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

function crew(name: string, email = `${name.toLowerCase()}@example.com`): CrewMemberRow {
  return {
    name,
    email,
    phone: null,
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function crewWithFlags(name: string, roleFlags: CrewMemberRow["role_flags"]): CrewMemberRow {
  return {
    ...crew(name),
    role: roleFlags.join("/"),
    role_flags: roleFlags,
  };
}

function room(name = "General Session"): RoomRow {
  return {
    kind: "gs",
    name,
    dimensions: null,
    floor: null,
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

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
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
      po: "PO-1",
      proposal: "Proposal-1",
      invoice: "Invoice-1",
      invoice_notes: "Notes",
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
    rooms: [room()],
    transportation: {
      driver_name: "Driver",
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [],
      notes: null,
    },
    contacts: [{ kind: "venue", name: "Venue", email: null, phone: null, notes: null }],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [{ block: "x", key: "unknown", value: "raw" }],
    warnings: [{ severity: "warn", code: "WARN", message: "warning" }],
    hardErrors: [],
    ...overrides,
  };
}

function fileMeta(modifiedTime = "2026-05-08T12:00:00.000Z"): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
  };
}

class FakePhase2Tx {
  shows = new Map<string, FakeShow>();
  crewAuth = new Map<string, FakeCrewAuth>();
  hotelReservations: unknown[] = ["old hotel"];
  rooms: unknown[] = ["old room"];
  transportation: unknown = "old transportation";
  contacts: unknown[] = ["old contact"];
  showsInternal: unknown = null;
  pendingIngestions = new Set<string>();
  operations: string[] = [];
  lastShowSnapshotArgs: {
    parseResult: ParseResult;
  } | null = null;

  async applyShowSnapshot(args: {
    driveFileId: string;
    modifiedTime: string;
    staleGuard: "strict_less_than" | "less_than_or_equal";
    parseResult: ParseResult;
    slug: string;
  }) {
    this.lastShowSnapshotArgs = { parseResult: args.parseResult };
    this.operations.push(`applyShowSnapshot:${args.staleGuard}`);
    const show = this.shows.get(args.driveFileId);
    const incoming = Date.parse(args.modifiedTime);
    if (show?.lastSeenModifiedTime) {
      const current = Date.parse(show.lastSeenModifiedTime);
      const allowed =
        args.staleGuard === "strict_less_than" ? current < incoming : current <= incoming;
      if (!allowed) return { outcome: "stale" as const };
    }

    const nextShow: FakeShow = show ?? {
      id: "show-1",
      driveFileId: args.driveFileId,
      lastSeenModifiedTime: null,
      lastSyncStatus: null,
      lastSyncError: null,
      crewNames: [],
    };
    const previousCrewNames = [...nextShow.crewNames];
    const previousCrewMembers = nextShow.crewMembers
      ? nextShow.crewMembers.map((member) => ({ ...member, role_flags: [...member.role_flags] }))
      : previousCrewNames.map((name) => crew(name));
    nextShow.lastSeenModifiedTime = args.modifiedTime;
    nextShow.lastSyncStatus = "ok";
    nextShow.lastSyncError = null;
    this.shows.set(args.driveFileId, nextShow);
    return {
      outcome: "updated" as const,
      showId: nextShow.id,
      previousCrewNames,
      previousCrewMembers,
    };
  }

  async deleteCrewMembersNotIn(showId: string, names: string[]) {
    this.operations.push(`deleteCrewMembersNotIn:${showId}:${names.join(",")}`);
    const show = [...this.shows.values()].find((row) => row.id === showId);
    if (show) show.crewNames = show.crewNames.filter((name) => names.includes(name));
  }

  async upsertCrewMembers(showId: string, members: CrewMemberRow[]) {
    this.operations.push(`upsertCrewMembers:${showId}`);
    const show = [...this.shows.values()].find((row) => row.id === showId);
    if (show) {
      show.crewNames = members.map((member) => member.name);
      show.crewMembers = members.map((member) => ({
        ...member,
        role_flags: [...member.role_flags],
      }));
    }
  }

  async provisionAddedCrewAuth(_showId: string, names: string[]) {
    this.operations.push(`provisionAddedCrewAuth:${names.join(",")}`);
    for (const name of names) {
      const existing = this.crewAuth.get(name) ?? {
        current_token_version: 1,
        max_issued_version: 1,
        revoked_below_version: 0,
      };
      existing.revoked_below_version = existing.max_issued_version;
      existing.current_token_version = existing.max_issued_version;
      this.crewAuth.set(name, existing);
    }
  }

  async revokeRemovedCrewAuth(_showId: string, names: string[]) {
    this.operations.push(`revokeRemovedCrewAuth:${names.join(",")}`);
    for (const name of names) {
      const existing = this.crewAuth.get(name);
      if (existing) existing.revoked_below_version = existing.current_token_version;
    }
  }

  async replaceHotelReservations(_showId: string, rows: unknown[]) {
    this.operations.push("replaceHotelReservations");
    this.hotelReservations = rows;
  }

  async replaceRooms(_showId: string, rows: unknown[]) {
    this.operations.push("replaceRooms");
    this.rooms = rows;
  }

  async replaceTransportation(_showId: string, row: unknown) {
    this.operations.push("replaceTransportation");
    this.transportation = row;
  }

  async replaceContacts(_showId: string, rows: unknown[]) {
    this.operations.push("replaceContacts");
    this.contacts = rows;
  }

  async upsertShowsInternal(_showId: string, payload: unknown) {
    this.operations.push("upsertShowsInternal");
    this.showsInternal = payload;
  }

  async deleteLivePendingIngestion(driveFileId: string) {
    this.operations.push(`deleteLivePendingIngestion:${driveFileId}:wizard_session_id IS NULL`);
    this.pendingIngestions.delete(driveFileId);
  }
}

const baseArgs = {
  driveFileId: "file-1",
  mode: "cron" as const,
  fileMeta: fileMeta("2026-05-08T11:59:00.000Z"),
  binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
  parseResult: parseResult(),
};

async function runWith(tx: FakePhase2Tx, overrides = {}) {
  vi.resetModules();
  const { runPhase2 } = await import("@/lib/sync/phase2");
  return runPhase2(tx, { ...baseArgs, ...overrides });
}

describe("runPhase2 destructive snapshot", () => {
  test("cron uses a strict less-than guard and rejects same-modtime writes", async () => {
    const tx = new FakePhase2Tx();
    tx.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T12:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      crewNames: ["Alice"],
    });

    await expect(runWith(tx)).resolves.toEqual({ outcome: "stale", code: "STALE_WRITE_ABORTED" });
    expect(tx.operations).toEqual(["applyShowSnapshot:strict_less_than"]);
  });

  test("push uses a strict less-than guard and reports STALE_PUSH_ABORTED", async () => {
    const tx = new FakePhase2Tx();
    tx.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T12:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      crewNames: ["Alice"],
    });

    await expect(runWith(tx, { mode: "push" })).resolves.toEqual({
      outcome: "stale",
      code: "STALE_PUSH_ABORTED",
    });
  });

  test("manual allows same-modtime replay but rejects older writes", async () => {
    const same = new FakePhase2Tx();
    same.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T12:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      crewNames: ["Alice"],
    });
    await expect(runWith(same, { mode: "manual" })).resolves.toMatchObject({
      outcome: "applied",
    });

    const older = new FakePhase2Tx();
    older.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T12:01:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      crewNames: ["Alice"],
    });
    await expect(runWith(older, { mode: "manual" })).resolves.toEqual({
      outcome: "stale",
      code: "STALE_MANUAL_REPLAY_ABORTED",
    });
  });

  test("recovery allows same-modtime replay and clears sheet_unavailable", async () => {
    const tx = new FakePhase2Tx();
    tx.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T12:00:00.000Z",
      lastSyncStatus: "sheet_unavailable",
      lastSyncError: "missing",
      crewNames: ["Alice"],
    });

    await expect(runWith(tx, { mode: "recovery" })).resolves.toMatchObject({ outcome: "applied" });
    expect(tx.shows.get("file-1")).toMatchObject({ lastSyncStatus: "ok", lastSyncError: null });
  });

  test("stamps shows.last_seen_modified_time from binding.modifiedTime, not stale fileMeta.modifiedTime", async () => {
    const tx = new FakePhase2Tx();

    await runWith(tx, {
      mode: "manual",
      fileMeta: fileMeta("2026-05-08T11:59:00.000Z"),
      binding: { bindingToken: "token-2", modifiedTime: "2026-05-08T12:05:00.000Z" },
    });

    expect(tx.shows.get("file-1")?.lastSeenModifiedTime).toBe("2026-05-08T12:05:00.000Z");
  });

  test("cron phase2 re-verifies opening reel pins before writing the live snapshot", async () => {
    const tx = new FakePhase2Tx();
    const result = await runWith(tx, {
      parseResult: parseResult({
        openingReel: {
          driveFileId: "reel-1",
          drive_modified_time: "2026-05-08T12:00:00.000Z",
          headRevisionId: "rev-1",
          mimeType: "video/mp4",
        },
      }),
      verifyReelOnApply: async () => ({
        openingReel: null,
        warningCode: "REEL_DRIFTED" as const,
        driftReason: "REVISION_MISMATCH" as const,
      }),
    });

    expect(result).toMatchObject({ outcome: "applied" });
    expect(tx.lastShowSnapshotArgs?.parseResult.openingReel).toBeNull();
    expect(tx.lastShowSnapshotArgs?.parseResult.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "REEL_DRIFTED" })]),
    );
  });

  test("crew members are deleted before upsert to avoid same-email rename collisions", async () => {
    const tx = new FakePhase2Tx();
    tx.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      crewNames: ["Alice Old"],
    });

    await runWith(tx, {
      parseResult: parseResult({ crewMembers: [crew("Alice New", "same@example.com")] }),
    });

    expect(tx.operations.indexOf("deleteCrewMembersNotIn:show-1:Alice New")).toBeLessThan(
      tx.operations.indexOf("upsertCrewMembers:show-1"),
    );
  });

  test("newly-added crew auth rows enter no-live-link state", async () => {
    const tx = new FakePhase2Tx();
    tx.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      crewNames: ["Alice"],
    });

    await runWith(tx, { parseResult: parseResult({ crewMembers: [crew("Alice"), crew("Bob")] }) });

    expect(tx.crewAuth.get("Bob")).toEqual({
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 1,
    });
  });

  test.each([
    {
      label: "department changes while LEAD remains set",
      priorFlags: ["LEAD", "A1"] as CrewMemberRow["role_flags"],
      newFlags: ["LEAD", "V1"] as CrewMemberRow["role_flags"],
    },
    {
      label: "non-LEAD capability is added",
      priorFlags: ["A1"] as CrewMemberRow["role_flags"],
      newFlags: ["A1", "BO"] as CrewMemberRow["role_flags"],
    },
  ])(
    "auto-applied non-LEAD role flag changes return deferred ROLE_FLAGS_NOTICE intent: $label",
    async ({ priorFlags, newFlags }) => {
      const tx = new FakePhase2Tx();
      tx.shows.set("file-1", {
        id: "show-1",
        driveFileId: "file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        crewNames: ["Alice"],
        crewMembers: [crewWithFlags("Alice", priorFlags)],
      });

      const result = await runWith(tx, {
        parseResult: parseResult({ crewMembers: [crewWithFlags("Alice", newFlags)] }),
      });

      expect(result).toEqual({
        outcome: "applied",
        showId: "show-1",
        roleFlagsNotice: {
          showId: "show-1",
          code: "ROLE_FLAGS_NOTICE",
          context: {
            drive_file_id: "file-1",
            changes: [
              {
                crew_name: "Alice",
                prior_flags: priorFlags,
                new_flags: newFlags,
              },
            ],
          },
        },
      });
    },
  );

  test("removed crew auth floors are lifted to current_token_version", async () => {
    const tx = new FakePhase2Tx();
    tx.shows.set("file-1", {
      id: "show-1",
      driveFileId: "file-1",
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "ok",
      lastSyncError: null,
      crewNames: ["Alice", "Charlie"],
    });
    tx.crewAuth.set("Charlie", {
      current_token_version: 5,
      max_issued_version: 5,
      revoked_below_version: 0,
    });

    await runWith(tx, { parseResult: parseResult({ crewMembers: [crew("Alice")] }) });

    expect(tx.crewAuth.get("Charlie")?.revoked_below_version).toBe(5);
  });

  test("replaces hotel, room, transportation, and contact snapshots", async () => {
    const tx = new FakePhase2Tx();

    await runWith(tx);

    expect(tx.hotelReservations).toEqual(baseArgs.parseResult.hotelReservations);
    expect(tx.rooms).toEqual(baseArgs.parseResult.rooms);
    expect(tx.transportation).toEqual(baseArgs.parseResult.transportation);
    expect(tx.contacts).toEqual(baseArgs.parseResult.contacts);
  });

  test("upserts shows_internal financials, parse warnings, and raw_unrecognized", async () => {
    const tx = new FakePhase2Tx();

    await runWith(tx);

    expect(tx.showsInternal).toEqual({
      financials: {
        po: "PO-1",
        proposal: "Proposal-1",
        invoice: "Invoice-1",
        invoice_notes: "Notes",
      },
      parse_warnings: baseArgs.parseResult.warnings,
      raw_unrecognized: baseArgs.parseResult.raw_unrecognized,
    });
  });

  test("first-seen apply deletes matching live pending_ingestions row", async () => {
    const tx = new FakePhase2Tx();
    tx.pendingIngestions.add("file-1");

    await runWith(tx);

    expect(tx.pendingIngestions.has("file-1")).toBe(false);
    expect(tx.operations).toContain("deleteLivePendingIngestion:file-1:wizard_session_id IS NULL");
  });

  test("does not acquire advisory locks or transaction boundaries itself", async () => {
    const tx = new FakePhase2Tx();

    await runWith(tx);

    expect(tx.operations.join("\n")).not.toMatch(/pg_.*advisory|BEGIN|COMMIT|ROLLBACK/i);
  });

  test("snapshots diagram assets before writing the pending diagrams sub-payload", async () => {
    const tx = new FakePhase2Tx();
    let snapshotCallCount = 0;
    const linkedItem = {
      driveFileId: "linked-1",
      mimeType: "image/png",
      drive_modified_time: "2026-05-01T00:00:00.000Z",
      headRevisionId: "rev-linked-1",
      md5Checksum: "a".repeat(32),
      snapshotPath: null,
    };
    const result = await runWith(tx, {
      parseResult: parseResult({
        diagrams: {
          linkedFolder: null,
          embeddedImages: [],
          linkedFolderItems: [linkedItem],
        },
      }),
      snapshotAssetsForApply: async (snapshotArgs: { diagrams: ParseResult["diagrams"] }) => {
        snapshotCallCount += 1;
        expect(snapshotArgs.diagrams.linkedFolderItems).toEqual([linkedItem]);
        return {
          snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          runUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          tempPrefix:
            "diagram-snapshots/shows/show-1/_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/",
          warnings: [],
          pending: {
            revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            snapshot_status: "complete",
            linkedFolder: null,
            embeddedImages: [],
            linkedFolderItems: [
              {
                ...linkedItem,
                snapshotPath:
                  "diagram-snapshots/shows/show-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.png",
              },
            ],
          },
        };
      },
    });

    expect(result).toMatchObject({ outcome: "applied" });
    expect(snapshotCallCount).toBe(1);
    expect(tx.lastShowSnapshotArgs?.parseResult.diagrams).toEqual({
      current: null,
      pending: {
        revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        snapshot_status: "complete",
        linkedFolder: null,
        embeddedImages: [],
        linkedFolderItems: [
          {
            ...linkedItem,
            snapshotPath:
              "diagram-snapshots/shows/show-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.png",
          },
        ],
      },
    });
    const written = tx.operations.find((operation) => operation.startsWith("applyShowSnapshot"));
    expect(written).toContain("strict_less_than");
  });
});
