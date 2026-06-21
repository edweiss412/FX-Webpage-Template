import { describe, expect, test, vi } from "vitest";
import type {
  LivePendingIngestionRouteDeps,
  LivePendingIngestionRouteTx,
} from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import type { ParseResult } from "@/lib/parser/types";
import { handleLivePendingIngestionRetry } from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { handleLivePendingIngestionDiscard } from "@/app/api/admin/pending-ingestions/[id]/discard/route";

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
    })),
    readFinalizeOwnershipGuardUnlocked: vi.fn(async () => false),
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
