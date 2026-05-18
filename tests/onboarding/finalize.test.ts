import { describe, expect, test, vi } from "vitest";
import type {
  FinalizeRouteDeps,
  FinalizeRouteTx,
} from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";

const W1 = "11111111-1111-4111-8111-111111111111";

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", {
    method: "POST",
  });
}

type PendingRow = {
  drive_file_id: string;
  staged_id: string;
  staged_modified_time: string;
  parse_result: Record<string, unknown>;
  wizard_reviewer_choices: unknown[];
  wizard_reviewer_choices_version: number | null;
  wizard_approved_by_email: string | null;
};

function parseResult(title: string): Record<string, unknown> {
  return {
    show: {
      title,
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
      event_details: {},
      agenda_links: [],
      coi_status: null,
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
  };
}

class FakeFinalizeDb implements FinalizeRouteTx {
  activeSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  finalizeLocked = true;
  checkpoint: {
    wizard_session_id: string;
    status: "in_progress" | "all_batches_complete" | "final_cas_done";
    batches_completed: number;
  } | null = null;
  approved: PendingRow[] = [];
  unresolvedManifestCount = 0;
  existingShows = new Set<string>();
  demoted: Array<{ driveFileId: string; code: string }> = [];
  stagedShadows: string[] = [];
  firstSeenApplied: string[] = [];
  deletedPending: string[] = [];
  operations: string[] = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.operations.push(this.classify(normalized));

    if (normalized.includes("pg_try_advisory_xact_lock(hashtext('finalize:'")) {
      return { rows: [{ locked: this.finalizeLocked } as T], rowCount: 1 };
    }

    if (normalized.startsWith("select pending_wizard_session_id")) {
      return {
        rows: [{ pending_wizard_session_id: this.activeSessionId } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("select pending_folder_id")) {
      return {
        rows: [{ pending_folder_id: this.pendingFolderId } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("insert into public.wizard_finalize_checkpoints")) {
      if (!this.checkpoint && this.activeSessionId) {
        this.checkpoint = {
          wizard_session_id: this.activeSessionId,
          status: "in_progress",
          batches_completed: 0,
        };
      }
      return { rows: [this.checkpoint as T], rowCount: this.checkpoint ? 1 : 0 };
    }

    if (normalized.startsWith("select status, batches_completed")) {
      return { rows: this.checkpoint ? [this.checkpoint as T] : [], rowCount: this.checkpoint ? 1 : 0 };
    }

    if (normalized.startsWith("select count(*)::int as unresolved_count")) {
      return {
        rows: [{ unresolved_count: this.unresolvedManifestCount } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("select drive_file_id, staged_id")) {
      return {
        rows: this.approved.slice(0, 100) as T[],
        rowCount: Math.min(this.approved.length, 100),
      };
    }

    if (normalized.startsWith("select exists")) {
      return {
        rows: [{ exists: this.existingShows.has(params[0] as string) } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("update public.pending_syncs")) {
      this.demoted.push({ driveFileId: params[0] as string, code: params[2] as string });
      return { rows: [{ demoted: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("update public.onboarding_scan_manifest")) {
      return { rows: [{ updated: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("insert into public.shows_pending_changes")) {
      this.stagedShadows.push(params[0] as string);
      return { rows: [{ show_id: "show-1" } as T], rowCount: 1 };
    }

    if (normalized.startsWith("insert into public.shows")) {
      this.firstSeenApplied.push(params[0] as string);
      return { rows: [{ show_id: "show-first-seen" } as T], rowCount: 1 };
    }

    if (normalized.startsWith("delete from public.pending_syncs")) {
      this.deletedPending.push(params[0] as string);
      this.approved = this.approved.filter((row) => row.drive_file_id !== params[0]);
      return { rows: [{ deleted: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("update public.wizard_finalize_checkpoints")) {
      if (this.checkpoint) {
        this.checkpoint.status = params[1] as "in_progress" | "all_batches_complete";
        this.checkpoint.batches_completed += 1;
      }
      return { rows: [this.checkpoint as T], rowCount: this.checkpoint ? 1 : 0 };
    }

    throw new Error(`Unhandled SQL in finalize fake: ${normalized}`);
  }

  private classify(sql: string): string {
    if (sql.includes("pg_try_advisory_xact_lock(hashtext('finalize:'")) return "try-finalize-lock";
    if (sql.startsWith("select pending_wizard_session_id")) return "read-session";
    if (sql.startsWith("insert into public.wizard_finalize_checkpoints")) return "ensure-checkpoint";
    if (sql.startsWith("select drive_file_id, staged_id")) return "select-approved";
    if (sql.startsWith("update public.pending_syncs")) return "demote-pending";
    if (sql.startsWith("insert into public.shows_pending_changes")) return "stage-shadow";
    if (sql.startsWith("insert into public.shows")) return "apply-first-seen";
    if (sql.startsWith("delete from public.pending_syncs")) return "delete-pending";
    if (sql.startsWith("update public.wizard_finalize_checkpoints")) return "advance-checkpoint";
    return "other";
  }
}

function pending(driveFileId: string, overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    drive_file_id: driveFileId,
    staged_id: `00000000-0000-4000-8000-${driveFileId.padStart(12, "0").slice(0, 12)}`,
    staged_modified_time: "2026-05-08T12:00:00.000Z",
    parse_result: parseResult(`Show ${driveFileId}`),
    wizard_reviewer_choices: [],
    wizard_reviewer_choices_version: 1,
    wizard_approved_by_email: "doug@example.com",
    ...overrides,
  };
}

function deps(db: FakeFinalizeDb, overrides: Partial<FinalizeRouteDeps> = {}): FinalizeRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => fn(db),
    withRowTx: async (_driveFileId, fn) => fn(db),
    fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
      driveFileId,
      name: `${driveFileId}.xlsx`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-08T12:00:00.000Z",
      parents: ["folder-1"],
    })),
    ...overrides,
  };
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("POST /api/admin/onboarding/finalize", () => {
  test("processes one batch: first-seen rows apply as unpublished drafts and existing rows stage shadow changes", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1"), pending("existing-1")];
    db.existingShows.add("existing-1");

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      per_row: [
        { drive_file_id: "first-seen-1", wizard_session_id: W1, code: "OK" },
        { drive_file_id: "existing-1", wizard_session_id: W1, code: "OK" },
      ],
    });
    expect(db.firstSeenApplied).toEqual(["first-seen-1"]);
    expect(db.stagedShadows).toEqual(["existing-1"]);
    expect(db.deletedPending).toEqual(["first-seen-1", "existing-1"]);
  });

  test("returns all_batches_complete only after approved rows and unresolved manifest rows are gone", async () => {
    const db = new FakeFinalizeDb();

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("rejects early completion when unresolved manifest rows remain", async () => {
    const db = new FakeFinalizeDb();
    db.unresolvedManifestCount = 1;

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "ONBOARDING_NOT_RESOLVED",
      unresolved_manifest_count: 1,
    });
  });

  test("returns CONCURRENT_FINALIZE_IN_FLIGHT when the session finalize lock is held elsewhere", async () => {
    const db = new FakeFinalizeDb();
    db.finalizeLocked = false;

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "CONCURRENT_FINALIZE_IN_FLIGHT" });
    expect(db.operations).toEqual(["read-session", "try-finalize-lock"]);
  });

  test("demotes a row when Drive head modifiedTime changed between approval and finalize", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("race-1")];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:01:00.000Z",
          parents: ["folder-1"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "race-1",
          wizard_session_id: W1,
          code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
          re_apply_url: "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/race-1",
        },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "race-1", code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE" },
    ]);
    expect(db.deletedPending).toEqual([]);
  });

  test("demotes a row when Drive head is outside the pending folder", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("moved-1")];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:00:00.000Z",
          parents: ["other-folder"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "moved-1",
          wizard_session_id: W1,
          code: "DRIVE_FETCH_FAILED",
          re_apply_url: "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/moved-1",
        },
      ],
    });
    expect(db.demoted).toEqual([{ driveFileId: "moved-1", code: "DRIVE_FETCH_FAILED" }]);
    expect(db.deletedPending).toEqual([]);
  });

  test("demotes unsupported reviewer-choice payloads instead of finalizing them", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("version-1", { wizard_reviewer_choices_version: 2 })];

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [
        {
          drive_file_id: "version-1",
          wizard_session_id: W1,
          code: "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED",
          re_apply_url: "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/version-1",
        },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "version-1", code: "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED" },
    ]);
  });
});
