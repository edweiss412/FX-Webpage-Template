import { describe, expect, test, vi } from "vitest";
import type {
  LivePendingIngestionRouteDeps,
  LivePendingIngestionRouteTx,
} from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import type { ParseResult } from "@/lib/parser/types";
import { readyPrepared } from "@/tests/_shared/preparedProcessOneFile";
import { handleLivePendingIngestionRetry } from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { handleLivePendingIngestionDiscard } from "@/app/api/admin/pending-ingestions/[id]/discard/route";

const logAdminOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));
// Unit A: this route is the fourth post-commit sink for the forensic unlanded-rename event. It needs
// its OWN emit because it calls runManualSyncForShow_unlocked, routing around processOneFile's
// post-commit tail (lib/sync/runManualSyncForShow.ts:287-288) where the other manual sink emits.
const emitUnlandedRenamesMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/emitIdentityLinkRenameUnlanded", () => ({
  emitIdentityLinkRenameUnlanded: emitUnlandedRenamesMock,
}));
// Unit C (spec §2.3): this route is a roleFlagsNotice discard site on BOTH of its branches — the
// existing-show branch calls runManualSyncForShow_unlocked (bypassing processOneFile's post-commit
// tail, where cron/manual emit) and the first-seen branch calls runManualStageForFirstSeen, which
// carries the notice out of its own lock for the route to emit. Partial mock: the module also
// exports the shared source constants and the finalize-route flush, which other modules in this
// import graph load at module scope.
const emitRoleFlagsNoticeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/sync/emitRoleFlagsNotice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sync/emitRoleFlagsNotice")>()),
  emitRoleFlagsNotice: emitRoleFlagsNoticeMock,
}));

const ID1 = "33333333-3333-4333-8333-333333333333";

class FakeLivePendingTx {
  row = {
    id: ID1,
    drive_file_id: "file-1",
    wizard_session_id: null,
    last_seen_modified_time: "2026-05-08T12:00:00.000Z",
  } as {
    id: string;
    drive_file_id: string;
    wizard_session_id: string | null;
    last_seen_modified_time: string | null;
  } | null;
  showExists = false;
  archived = false;
  watchedFolderId = "folder-1";
  slug = "show-slug";
  deferrals: Array<{ kind: string; driveFileId: string }> = [];
  deleted = false;

  async queryOne<T>(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (normalized.startsWith("select id, drive_file_id")) return this.row as T;
    if (normalized.startsWith("select exists")) return { exists: this.showExists } as T;
    if (normalized.startsWith("select archived from public.shows"))
      return { archived: this.archived } as T; // DEF-5 guard
    if (normalized.startsWith("select watched_folder_id")) {
      return { watched_folder_id: this.watchedFolderId } as T;
    }
    if (normalized.startsWith("select slug")) return { slug: this.slug } as T;
    if (normalized.startsWith("insert into public.deferred_ingestions")) {
      this.deferrals.push({ kind: params[1] as string, driveFileId: params[0] as string });
      return { upserted: true } as T;
    }
    if (normalized.startsWith("delete from public.pending_ingestions")) {
      this.deleted = true;
      return { deleted: true } as T;
    }
    throw new Error(`Unhandled live pending SQL: ${normalized}`);
  }
}

function deps(
  tx: FakeLivePendingTx,
  overrides: Partial<LivePendingIngestionRouteDeps> = {},
): LivePendingIngestionRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    readDriveFileIdForPendingIngestion: vi.fn(async () => tx.row?.drive_file_id ?? null),
    withRowTryLock: vi.fn(async (_driveFileId, fn) =>
      fn(tx as unknown as LivePendingIngestionRouteTx),
    ),
    fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
      driveFileId,
      name: `${driveFileId}.xlsx`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-08T12:00:00.000Z",
      parents: ["folder-1"],
    })),
    runManualStageForFirstSeen: vi.fn(async () => ({
      outcome: "parsed_pending_review" as const,
      stagedId: "staged-1",
    })),
    runManualSyncForShowUnlocked: vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
      parseWarnings: [],
      appliedRoleMappings: [],
    })),
    readFinalizeOwnershipGuardUnlocked: vi.fn(async () => false),
    // Census class d (spec §5): without this injection the route runs REAL preparation (Drive I/O)
    // ahead of the runner double, since `prepared` became a required sixth argument.
    prepareProcessOneFile: vi.fn(async () => readyPrepared()) as unknown as NonNullable<
      LivePendingIngestionRouteDeps["prepareProcessOneFile"]
    >,
    // Census class e (spec §5): the route-body catch emissions would otherwise open a real
    // postgres connection from a unit test.
    logSyncSink: vi.fn(async () => {}) as unknown as NonNullable<
      LivePendingIngestionRouteDeps["logSyncSink"]
    >,
    prepareFirstSeenStage: vi.fn(async (fileMeta) => ({
      fileMeta,
      binding: { bindingToken: "rev-1", modifiedTime: fileMeta.modifiedTime },
      parseResult: {
        show: {
          title: "First Seen",
          client_label: "Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: null, set: "2026-05-08", showDays: [], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
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
        archivedPullSheetTabs: [],
        hardErrors: [],
      } satisfies ParseResult,
    })),
    ...overrides,
  };
}

const context = { params: Promise.resolve({ id: ID1 }) };

function req(body: Record<string, unknown> = {}): Request {
  return new Request("https://crew.fxav.test/api/admin/pending-ingestions/id/action", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("live pending-ingestions actions", () => {
  test("retry first-seen branch uses nonblocking lock and runManualStageForFirstSeen", async () => {
    const tx = new FakeLivePendingTx();
    const routeDeps = deps(tx);

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "parsed_pending_review", stagedId: "staged-1" });
    expect(routeDeps.withRowTryLock).toHaveBeenCalledWith("file-1", expect.any(Function));
    expect(routeDeps.prepareFirstSeenStage).toHaveBeenCalledWith(
      expect.objectContaining({ driveFileId: "file-1" }),
    );
    expect(routeDeps.runManualStageForFirstSeen).toHaveBeenCalledWith(
      tx,
      "file-1",
      expect.objectContaining({ binding: expect.any(Object), parseResult: expect.any(Object) }),
    );
    expect(routeDeps.runManualSyncForShowUnlocked).not.toHaveBeenCalled();
  });

  test("retry existing-show branch fetches Drive metadata and calls runManualSyncForShow_unlocked", async () => {
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx);

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    expect(routeDeps.fetchDriveFileMetadata).toHaveBeenCalledWith("file-1");
    expect(routeDeps.runManualSyncForShowUnlocked).toHaveBeenCalledWith(
      tx,
      "file-1",
      "manual",
      expect.objectContaining({ driveFileId: "file-1" }),
      expect.any(Object),
      // Sixth argument (spec 2026-08-14 §3.1): the route now prepares inside its own held row lock
      // and threads the result through. Its absence is what made this retry throw SyncInfraError.
      expect.objectContaining({ kind: "ready" }),
    );
  });

  test("retry first-seen clean parse returns the created show slug", async () => {
    const tx = new FakeLivePendingTx();
    const routeDeps = deps(tx, {
      runManualStageForFirstSeen: vi.fn(async () => ({
        outcome: "applied",
        showId: "show-1",
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualStageForFirstSeen"]>,
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    expect(routeDeps.runManualSyncForShowUnlocked).not.toHaveBeenCalled();
  });

  test("retry existing-show branch rejects files outside watched folder", async () => {
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx, {
      fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["other-folder"],
      })),
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "SHEET_UNAVAILABLE" });
    expect(routeDeps.runManualSyncForShowUnlocked).not.toHaveBeenCalled();
  });

  test("retry existing-show branch refuses rows owned by an in-flight finalize", async () => {
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx, {
      readFinalizeOwnershipGuardUnlocked: vi.fn(async () => true),
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "FINALIZE_OWNED_SHOW" });
    expect(routeDeps.runManualSyncForShowUnlocked).not.toHaveBeenCalled();
  });

  test("DEF-5: retry refuses an archived show → 409 SHOW_ARCHIVED_IMMUTABLE, no Drive fetch / no sync", async () => {
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    tx.archived = true;
    const routeDeps = deps(tx);

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "SHOW_ARCHIVED_IMMUTABLE" });
    expect(routeDeps.fetchDriveFileMetadata).not.toHaveBeenCalled();
    expect(routeDeps.runManualSyncForShowUnlocked).not.toHaveBeenCalled();
  });

  test("DEF-5: discard refuses an archived show → 409 SHOW_ARCHIVED_IMMUTABLE, no deferral / no delete", async () => {
    const tx = new FakeLivePendingTx();
    tx.archived = true;
    const routeDeps = deps(tx);

    const response = await handleLivePendingIngestionDiscard(
      req({ kind: "permanent_ignore" }),
      context,
      routeDeps,
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "SHOW_ARCHIVED_IMMUTABLE" });
    expect(tx.deferrals).toHaveLength(0);
    expect(tx.deleted).toBe(false);
  });

  test("retry first-seen branch maps prepare failures to DRIVE_FETCH_FAILED", async () => {
    const tx = new FakeLivePendingTx();
    const routeDeps = deps(tx, {
      prepareFirstSeenStage: vi.fn(async () => {
        throw new Error("drive export failed");
      }),
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({ ok: false, code: "DRIVE_FETCH_FAILED" });
    expect(routeDeps.runManualStageForFirstSeen).not.toHaveBeenCalled();
  });

  test("retry rejects transitioned and wizard rows", async () => {
    const transitioned = new FakeLivePendingTx();
    transitioned.row = null;
    const transitionedResponse = await handleLivePendingIngestionRetry(
      req(),
      context,
      deps(transitioned, {
        readDriveFileIdForPendingIngestion: vi.fn(async () => "file-1"),
      }),
    );
    expect(transitionedResponse.status).toBe(409);
    expect(await json(transitionedResponse)).toEqual({
      ok: false,
      code: "PENDING_INGESTION_TRANSITIONED",
    });

    const wizard = new FakeLivePendingTx();
    wizard.row!.wizard_session_id = "11111111-1111-4111-8111-111111111111";
    const wizardResponse = await handleLivePendingIngestionRetry(req(), context, deps(wizard));
    expect(wizardResponse.status).toBe(409);
    expect(await json(wizardResponse)).toEqual({ ok: false, code: "LIVE_ROW_REQUIRED" });
  });

  test("discard defer_until_modified writes live deferral and deletes source row", async () => {
    const tx = new FakeLivePendingTx();

    const response = await handleLivePendingIngestionDiscard(
      req({ kind: "defer_until_modified" }),
      context,
      deps(tx),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "discarded", kind: "defer_until_modified" });
    expect(tx.deferrals).toEqual([{ driveFileId: "file-1", kind: "defer_until_modified" }]);
    expect(tx.deleted).toBe(true);
  });
});

describe("live pending-ingestions retry — PENDING_INGESTION_RETRIED telemetry", () => {
  const EXPECTED_OUTCOME = {
    code: "PENDING_INGESTION_RETRIED",
    source: "api.admin.pending-ingestions.retry",
    actorEmail: "doug@example.com",
    driveFileId: "file-1",
    showId: "show-1",
  };

  test("existing-show applied → logAdminOutcome PENDING_INGESTION_RETRIED once", async () => {
    logAdminOutcomeMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx); // default runManualSyncForShowUnlocked → applied showId show-1

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(EXPECTED_OUTCOME);
  });

  test("existing-show source_gone (still_failed but carries showId) → NOT logged (over-log guard)", async () => {
    logAdminOutcomeMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx, {
      runManualSyncForShowUnlocked: vi.fn(async () => ({
        outcome: "source_gone" as const,
        code: "SHEET_UNAVAILABLE",
        showId: "show-1",
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(await json(response)).toEqual({
      status: "still_failed",
      errorCode: "SHEET_UNAVAILABLE",
    });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("first-seen applied → logAdminOutcome PENDING_INGESTION_RETRIED once", async () => {
    logAdminOutcomeMock.mockClear();
    const tx = new FakeLivePendingTx();
    const routeDeps = deps(tx, {
      runManualStageForFirstSeen: vi.fn(async () => ({
        outcome: "applied",
        showId: "show-1",
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualStageForFirstSeen"]>,
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(EXPECTED_OUTCOME);
  });

  test("first-seen parsed_pending_review → NOT logged", async () => {
    logAdminOutcomeMock.mockClear();
    const tx = new FakeLivePendingTx();
    const routeDeps = deps(tx); // default runManualStageForFirstSeen → parsed_pending_review

    await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });
});

// Unit A sink #4 — the retry ROUTE, not the sync helper. runManualSyncForShow_unlocked runs INSIDE
// withRowTryLock, so the emit cannot live there (invariant 10) and processOneFile's tail — where the
// cron/manual sink emits — is bypassed entirely on this path. The other three sinks passing says
// nothing about this one.
describe("live pending-ingestions retry — IDENTITY_LINK_RENAME_UNLANDED emit", () => {
  const unlanded = [
    {
      pair: { removedName: "Old", addedName: "New" },
      reason: "rename_no_op" as const,
      sourceSurvived: false,
    },
  ];

  test("existing-show applied carrying an unlanded pair → emits once, after the row lock resolves", async () => {
    emitUnlandedRenamesMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const events: string[] = [];
    emitUnlandedRenamesMock.mockImplementationOnce(async () => {
      events.push("emit");
    });
    const routeDeps = deps(tx, {
      withRowTryLock: vi.fn(async (_driveFileId, fn) => {
        events.push("lock:start");
        const locked = await fn(tx as unknown as LivePendingIngestionRouteTx);
        events.push("lock:release");
        return locked;
      }) as unknown as NonNullable<LivePendingIngestionRouteDeps["withRowTryLock"]>,
      runManualSyncForShowUnlocked: vi.fn(async () => ({
        outcome: "applied" as const,
        showId: "show-1",
        parseWarnings: [],
        appliedRoleMappings: [],
        unlandedRenames: unlanded,
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(emitUnlandedRenamesMock).toHaveBeenCalledTimes(1);
    expect(emitUnlandedRenamesMock).toHaveBeenCalledWith(unlanded, {
      source: "sync.identityLink",
      showId: "show-1",
      driveFileId: "file-1",
    });
    expect(events).toEqual(["lock:start", "lock:release", "emit"]);
  });

  test("existing-show applied with no unlanded pairs → no emit", async () => {
    emitUnlandedRenamesMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;

    await handleLivePendingIngestionRetry(req(), context, deps(tx));

    expect(emitUnlandedRenamesMock).not.toHaveBeenCalled();
  });

  test("a non-applied retry never emits, even when the outcome carries a showId", async () => {
    emitUnlandedRenamesMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx, {
      runManualSyncForShowUnlocked: vi.fn(async () => ({
        outcome: "source_gone" as const,
        code: "SHEET_UNAVAILABLE",
        showId: "show-1",
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    });

    await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(emitUnlandedRenamesMock).not.toHaveBeenCalled();
  });
});

// Unit C sites #3 and #4 — the last two discard sites. Both branches of this route obtain a real
// roleFlagsNotice and emitted nothing: the existing-show branch bypasses processOneFile's tail, and
// the first-seen branch's callee builds the notice inside the row lock. The emit belongs HERE, after
// withRowTryLock resolves (invariant 10).
describe("live pending-ingestions retry — ROLE_FLAGS_NOTICE emit", () => {
  const roleFlagsNotice = {
    showId: "show-1",
    code: "ROLE_FLAGS_NOTICE" as const,
    context: {
      drive_file_id: "file-1",
      changes: [{ crew_name: "Alex Crew", prior_flags: [] as string[], new_flags: ["LEAD"] }],
    },
  };

  test("existing-show applied carrying a notice → emits once, after the row lock resolves", async () => {
    emitRoleFlagsNoticeMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const events: string[] = [];
    emitRoleFlagsNoticeMock.mockImplementationOnce(async () => {
      events.push("emit");
    });
    const routeDeps = deps(tx, {
      withRowTryLock: vi.fn(async (_driveFileId, fn) => {
        events.push("lock:start");
        const locked = await fn(tx as unknown as LivePendingIngestionRouteTx);
        events.push("lock:release");
        return locked;
      }) as unknown as NonNullable<LivePendingIngestionRouteDeps["withRowTryLock"]>,
      runManualSyncForShowUnlocked: vi.fn(async () => ({
        outcome: "applied" as const,
        showId: "show-1",
        parseWarnings: [],
        appliedRoleMappings: [],
        roleFlagsNotice,
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledTimes(1);
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledWith(roleFlagsNotice, {
      source: "sync.roleFlags",
    });
    expect(events).toEqual(["lock:start", "lock:release", "emit"]);
  });

  test("first-seen applied carrying a notice → emits once, after the row lock resolves", async () => {
    emitRoleFlagsNoticeMock.mockClear();
    const tx = new FakeLivePendingTx();
    const events: string[] = [];
    emitRoleFlagsNoticeMock.mockImplementationOnce(async () => {
      events.push("emit");
    });
    const routeDeps = deps(tx, {
      withRowTryLock: vi.fn(async (_driveFileId, fn) => {
        events.push("lock:start");
        const locked = await fn(tx as unknown as LivePendingIngestionRouteTx);
        events.push("lock:release");
        return locked;
      }) as unknown as NonNullable<LivePendingIngestionRouteDeps["withRowTryLock"]>,
      runManualStageForFirstSeen: vi.fn(async () => ({
        outcome: "applied",
        showId: "show-1",
        roleFlagsNotice,
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualStageForFirstSeen"]>,
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledTimes(1);
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledWith(roleFlagsNotice, {
      source: "sync.roleFlags",
    });
    expect(events).toEqual(["lock:start", "lock:release", "emit"]);
  });

  test("an applied retry with no notice on either branch → no emit", async () => {
    emitRoleFlagsNoticeMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;

    await handleLivePendingIngestionRetry(req(), context, deps(tx));

    const firstSeenTx = new FakeLivePendingTx();
    await handleLivePendingIngestionRetry(
      req(),
      context,
      deps(firstSeenTx, {
        runManualStageForFirstSeen: vi.fn(async () => ({
          outcome: "applied",
          showId: "show-1",
        })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualStageForFirstSeen"]>,
      }),
    );

    expect(emitRoleFlagsNoticeMock).not.toHaveBeenCalled();
  });

  test("a non-applied retry never emits, even when the outcome carries a showId", async () => {
    emitRoleFlagsNoticeMock.mockClear();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx, {
      runManualSyncForShowUnlocked: vi.fn(async () => ({
        outcome: "source_gone" as const,
        code: "SHEET_UNAVAILABLE",
        showId: "show-1",
        roleFlagsNotice,
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    });

    await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(emitRoleFlagsNoticeMock).not.toHaveBeenCalled();
  });

  // `upsertAdminAlert` throws on RPC failure and the helper deliberately does not catch it. This
  // emit is POST-COMMIT: the apply already landed, so a failing bell alert must not convert a
  // successful retry into a 500 that invites the operator to re-run it. Same fail-open posture the
  // finalize routes take through flushDeferredApplyEmits.
  test("a throwing emit leaves the committed retry's 200 response intact", async () => {
    emitRoleFlagsNoticeMock.mockClear();
    emitRoleFlagsNoticeMock.mockRejectedValueOnce(new Error("alert rpc down"));
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const routeDeps = deps(tx, {
      runManualSyncForShowUnlocked: vi.fn(async () => ({
        outcome: "applied" as const,
        showId: "show-1",
        parseWarnings: [],
        appliedRoleMappings: [],
        roleFlagsNotice,
      })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    });

    const response = await handleLivePendingIngestionRetry(req(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledTimes(1);
  });
});
