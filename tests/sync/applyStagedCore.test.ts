import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { runPhase2, type Phase2Tx } from "@/lib/sync/phase2";
import { makeSyncPipelineTx, type SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  applyStagedCore,
  MISSING_REVIEWER_CHOICE,
  type ApplyStagedCoreArgs,
  type ApplyStagedCoreDeps,
} from "@/lib/sync/applyStagedCore";

function parseResult(crewNames: string[] = ["Ada", "Bo"]): ParseResult {
  return {
    show: {
      title: "Show",
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
      coi_status: null,
      po: "PO-1",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: crewNames.map((name) => ({
      name,
      email: `${name.toLowerCase()}@example.com`,
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    rooms: [
      {
        kind: "ballroom",
        name: "Main",
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
      },
    ],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  } as unknown as ParseResult;
}

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "drive-core-1",
    name: "Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-06-10T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "h1",
  } as DriveListedFile;
}

type SpyTx = LockedShowTx<SyncPipelineTx> & { ops: string[]; sql: string[] };

function spyTx(): SpyTx {
  const tx = {
    ops: [] as string[],
    sql: [] as string[],
    async queryOne<T>(sql: string, _params: unknown[]) {
      tx.sql.push(sql.replace(/\s+/g, " ").trim());
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      throw new Error(`unexpected queryOne SQL: ${sql}`);
    },
    holdPort() {
      return {
        unsafe: async (q: string) => {
          tx.sql.push(q);
          return [];
        },
      };
    },
    async applyShowSnapshot() {
      tx.ops.push("applyShowSnapshot");
      return {
        outcome: "updated" as const,
        showId: "show-1",
        previousCrewNames: ["Ada"],
        previousCrewMembers: [],
      };
    },
    async deleteCrewMembersNotIn() {
      tx.ops.push("deleteCrewMembersNotIn");
    },
    async upsertCrewMembers() {
      tx.ops.push("upsertCrewMembers");
    },
    async provisionAddedCrewAuth(_id: string, names: string[]) {
      tx.ops.push(`provisionAddedCrewAuth:${names.join(",")}`);
    },
    async revokeRemovedCrewAuth() {
      tx.ops.push("revokeRemovedCrewAuth");
    },
    async replaceHotelReservations() {
      tx.ops.push("replaceHotelReservations");
    },
    async replaceRooms() {
      tx.ops.push("replaceRooms");
    },
    async replaceTransportation() {
      tx.ops.push("replaceTransportation");
    },
    async replaceContacts() {
      tx.ops.push("replaceContacts");
    },
    async upsertShowsInternal() {
      tx.ops.push("upsertShowsInternal");
    },
    async deleteLivePendingIngestion() {
      tx.ops.push("deleteLivePendingIngestion");
    },
  } as unknown as SpyTx;
  return tx;
}

function coreArgs(tx: SpyTx, overrides: Partial<ApplyStagedCoreArgs> = {}): ApplyStagedCoreArgs {
  void tx;
  return {
    sourceScope: "live",
    driveFileId: "drive-core-1",
    show: { showId: "show-1", lastSeenModifiedTime: "2026-06-09T00:00:00.000Z", diagrams: null },
    parseResult: parseResult(),
    triggeredReviewItems: [],
    reviewerChoices: [],
    stagedId: "33333333-3333-4333-8333-333333333333",
    stagedModifiedTime: "2026-06-10T12:00:00.000Z",
    baseModifiedTime: "2026-06-09T00:00:00.000Z",
    appliedByEmail: "doug@fxav.com",
    appliedAt: null,
    auditSource: "staged_apply",
    fileMeta: fileMeta(),
    mi11Items: [],
    skipDiagramsWrite: false,
    feedPolicy: { kind: "none" }, // R37-1: required field, no API default — choice_aware cases override explicitly
    ...overrides,
  };
}

describe("applyStagedCore", () => {
  test("live apply runs the full Phase-2 child set, audits with source+crewCount, deletes the live staged row", async () => {
    const tx = spyTx();
    const insertSyncAudit = vi.fn<NonNullable<ApplyStagedCoreDeps["insertSyncAudit"]>>(
      async () => "audit-1",
    );
    const deleteLivePendingSync = vi.fn(async () => {});
    const result = await applyStagedCore(tx, coreArgs(tx), {
      insertSyncAudit,
      deleteLivePendingSync,
    });
    // R36-1: coreArgs() includes feedPolicy: { kind: "none" } by default; choice_aware cases override explicitly.
    expect(result).toMatchObject({ outcome: "applied", showId: "show-1", syncAuditId: "audit-1" });
    // Child set derived from the ApplyParseResultTx contract, not hardcoded ops:
    for (const op of [
      "upsertCrewMembers",
      "replaceHotelReservations",
      "replaceRooms",
      "replaceTransportation",
      "replaceContacts",
      "upsertShowsInternal",
    ]) {
      expect(tx.ops.some((o) => o.startsWith(op))).toBe(true);
    }
    // provisionAddedCrewAuth called with the ADDED names derived from the fixture
    // (previous=["Ada"], next fixture crew minus Ada):
    expect(tx.ops).toContain("provisionAddedCrewAuth:Bo");
    const auditRow = insertSyncAudit.mock.calls[0]![1];
    expect(auditRow.parseResultSummary).toMatchObject({
      source: "staged_apply",
      crewCount: parseResult().crewMembers.length,
      roomCount: parseResult().rooms.length,
    });
    expect(auditRow.appliedAt).toBeNull();
    expect(deleteLivePendingSync).toHaveBeenCalledWith(
      tx,
      "drive-core-1",
      "33333333-3333-4333-8333-333333333333",
    );
  });

  test("core never acquires a lock — only the pg_locks ownership probe", async () => {
    const tx = spyTx();
    await applyStagedCore(tx, coreArgs(tx), {
      insertSyncAudit: vi.fn(async () => null),
      deleteLivePendingSync: vi.fn(),
    });
    const lockSql = tx.sql.filter((s) => /pg_(try_)?advisory/i.test(s));
    expect(lockSql).toEqual([]);
    expect(tx.sql.some((s) => /pg_locks/i.test(s))).toBe(true);
  });

  test("stale baseline (live watermark moved past the reviewer's base) refuses BEFORE any mutation", async () => {
    const tx = spyTx();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, { baseModifiedTime: "2026-06-08T00:00:00.000Z" }), // show says 06-09 → mismatch
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync: vi.fn() },
    );
    expect(result).toEqual({ outcome: "stale_baseline" });
    expect(tx.ops).toEqual([]); // nothing mutated
  });

  test("missing reviewer choice is refused with the exact existing code", async () => {
    const tx = spyTx();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, {
        triggeredReviewItems: [{ id: "i1", invariant: "MI-7", section: "rooms" } as never],
        reviewerChoices: [],
      }),
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync: vi.fn() },
    );
    expect(result).toEqual({ outcome: "invalid_request", code: MISSING_REVIEWER_CHOICE });
    expect(tx.ops).toEqual([]);
  });

  test("reject choice dispatches to discarded_by_choice BEFORE any mutation — no Phase 2, no audit, no floors", async () => {
    // Mirrors the live contract (applyStaged.ts:1327-1339; tests/sync/applyStaged.test.ts:1118-1147).
    const tx = spyTx();
    const insertSyncAudit = vi.fn(async () => null);
    const deleteLivePendingSync = vi.fn();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, {
        triggeredReviewItems: [
          {
            id: "mi12",
            invariant: "MI-12",
            removed_name: "Bob",
            added_name: "Robert",
            email: "bob@test.test",
          } as never,
        ],
        reviewerChoices: [{ item_id: "mi12", action: "reject" }],
      }),
      { insertSyncAudit, deleteLivePendingSync },
    );
    expect(result).toEqual({ outcome: "discarded_by_choice" });
    expect(tx.ops).toEqual([]); // runPhase2 never reached
    expect(insertSyncAudit).not.toHaveBeenCalled(); // live contract: no audit on reject
    expect(deleteLivePendingSync).not.toHaveBeenCalled(); // staged-row consumption is the CALLER's mapping
  });

  test("reject with no existing show is INVALID_REVIEWER_ACTION (live first-seen contract :1150-1186)", async () => {
    const tx = spyTx();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, {
        show: null,
        baseModifiedTime: null,
        triggeredReviewItems: [
          {
            id: "mi12",
            invariant: "MI-12",
            removed_name: "Bob",
            added_name: "Robert",
            email: "bob@test.test",
          } as never,
        ],
        reviewerChoices: [{ item_id: "mi12", action: "reject" }],
      }),
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync: vi.fn() },
    );
    expect(result).toEqual({ outcome: "invalid_request", code: "INVALID_REVIEWER_ACTION" });
    expect(tx.ops).toEqual([]);
  });

  test("feedPolicy is REQUIRED — an args object without it throws (R37-1: no silent default)", async () => {
    const tx = spyTx();
    const { feedPolicy: _omitted, ...withoutFeedPolicy } = coreArgs(tx);
    await expect(
      applyStagedCore(tx, withoutFeedPolicy as unknown as ApplyStagedCoreArgs, {
        insertSyncAudit: vi.fn(async () => null),
        deleteLivePendingSync: vi.fn(),
      }),
    ).rejects.toThrow(/feedPolicy/);
    expect(tx.ops).toEqual([]);
  });
});

describe("firstSeenPublished + wizardCreatedSessionId threading (R30-1 + R65-1)", () => {
  const SESSION = "44444444-4444-4444-8444-444444444444";

  function fakePg() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
      calls,
      async unsafe(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        if (/select id from public\.shows/i.test(sql)) return [];
        if (/insert into public\.shows/i.test(sql)) return [{ id: "show-new" }];
        return [];
      },
    };
  }

  async function captureFirstSeenInsert(
    extra: Partial<Parameters<SyncPipelineTx["applyShowSnapshot"]>[0]> = {},
  ) {
    const pg = fakePg();
    const tx = makeSyncPipelineTx(pg);
    await tx.applyShowSnapshot({
      driveFileId: "drive-fs-1",
      modifiedTime: "2026-06-10T12:00:00.000Z",
      staleGuard: "less_than_or_equal",
      parseResult: parseResult(),
      slug: "show",
      skipDiagramsWrite: false,
      ...extra,
    });
    const insert = pg.calls.find((call) => /insert into public\.shows/i.test(call.sql));
    expect(insert).toBeDefined();
    return insert!;
  }

  test("flags absent → first-seen INSERT SQL is unchanged (no published / wizard_created_session_id)", async () => {
    const insert = await captureFirstSeenInsert();
    expect(insert.sql).not.toMatch(/\bpublished\b/);
    expect(insert.sql).not.toMatch(/wizard_created_session_id/);
    expect(insert.params).toHaveLength(20);
  });

  test("firstSeenPublished=false alone → INSERT carries published=false, byte-stable elsewhere", async () => {
    const baseline = await captureFirstSeenInsert();
    const insert = await captureFirstSeenInsert({ firstSeenPublished: false });
    const sql = insert.sql.replace(/\s+/g, " ");
    expect(sql).toContain("last_sync_error, published )");
    expect(sql).toContain("now(), 'ok', null, false)");
    expect(insert.sql).not.toMatch(/wizard_created_session_id/);
    expect(insert.params).toEqual(baseline.params);
  });

  test("wizardCreatedSessionId alone → INSERT carries wizard_created_session_id = $21::uuid with the value", async () => {
    const insert = await captureFirstSeenInsert({ wizardCreatedSessionId: SESSION });
    const sql = insert.sql.replace(/\s+/g, " ");
    expect(sql).toContain("last_sync_error, wizard_created_session_id )");
    expect(sql).toContain("now(), 'ok', null, $21::uuid)");
    expect(insert.sql).not.toMatch(/\bpublished\b/);
    expect(insert.params).toHaveLength(21);
    expect(insert.params[20]).toBe(SESSION);
  });

  test("both flags set → INSERT carries published=false AND wizard_created_session_id", async () => {
    const insert = await captureFirstSeenInsert({
      firstSeenPublished: false,
      wizardCreatedSessionId: SESSION,
    });
    const sql = insert.sql.replace(/\s+/g, " ");
    expect(sql).toContain("last_sync_error, published, wizard_created_session_id )");
    expect(sql).toContain("now(), 'ok', null, false, $21::uuid)");
    expect(insert.params).toHaveLength(21);
    expect(insert.params[20]).toBe(SESSION);
  });

  test("runPhase2 forwards both fields into applyShowSnapshot", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const tx = {
      async applyShowSnapshot(args: Record<string, unknown>) {
        captured.push(args);
        return {
          outcome: "updated" as const,
          showId: "show-1",
          previousCrewNames: [],
          previousCrewMembers: [],
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
      async upsertShowsInternal() {},
      async deleteLivePendingIngestion() {},
    } as unknown as Phase2Tx;
    await runPhase2(tx, {
      driveFileId: "drive-fs-1",
      mode: "manual",
      fileMeta: fileMeta(),
      parseResult: parseResult(),
      verifyReelOnApply: false,
      firstSeenPublished: false,
      wizardCreatedSessionId: SESSION,
      binding: {
        bindingToken: "2026-06-10T12:00:00.000Z",
        modifiedTime: "2026-06-10T12:00:00.000Z",
      },
    });
    expect(captured[0]).toMatchObject({
      firstSeenPublished: false,
      wizardCreatedSessionId: SESSION,
    });
  });

  test("core forwards firstSeenPublished + wizardCreatedSessionId into runPhase2 (wizard first-seen)", async () => {
    const tx = spyTx();
    const runPhase2Spy = vi.fn<NonNullable<ApplyStagedCoreDeps["runPhase2"]>>(async () => ({
      outcome: "applied" as const,
      showId: "show-9",
    }));
    await applyStagedCore(
      tx,
      coreArgs(tx, {
        sourceScope: "wizard",
        show: null,
        baseModifiedTime: null,
        auditSource: "onboarding_finalize",
        firstSeenPublished: false,
        wizardCreatedSessionId: SESSION,
      }),
      {
        runPhase2: runPhase2Spy,
        insertSyncAudit: vi.fn(async () => null),
        deleteLivePendingSync: vi.fn(),
      },
    );
    expect(runPhase2Spy).toHaveBeenCalledTimes(1);
    expect(runPhase2Spy.mock.calls[0]![1]).toMatchObject({
      firstSeenPublished: false,
      wizardCreatedSessionId: SESSION,
    });
  });
});
