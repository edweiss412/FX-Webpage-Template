import { describe, expect, test, vi } from "vitest";
import type { FinalizeRouteDeps, FinalizeRouteTx } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

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
  wizard_approved: boolean;
  wizard_approved_by_email: string | null;
  wizard_approved_at: string | null;
  triggered_review_items: unknown;
  base_modified_time: string | null;
};

type ManifestStatus =
  | "staged"
  | "hard_failed"
  | "discard_retryable"
  | "live_row_conflict"
  | "applied"
  | "defer_until_modified"
  | "permanent_ignore";

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
  manifestStatuses = new Map<string, ManifestStatus>();
  demoted: Array<{ driveFileId: string; code: string }> = [];
  stagedShadows: string[] = [];
  // F1 Task 1.4: full param capture for the shadow INSERT so the payload-shape assertions
  // compare against seeded fixture instants (anti-tautology: never a now()-window check).
  stagedShadowParams: Array<readonly unknown[]> = [];
  firstSeenApplied: string[] = [];
  auditRows: string[] = [];
  deletedPending: string[] = [];
  operations: string[] = [];
  // F1 Task 1.3: created_show_id provenance UPDATE behavior. `false` simulates a wizard-session
  // supersession committing between the core apply and the provenance UPDATE (returning 0 rows)
  // — unreachable today behind the outer app_settings FOR UPDATE, pinned as defense-in-depth.
  provenanceRecordSucceeds = true;
  provenanceRecorded: string[] = [];

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
      return {
        rows: this.checkpoint ? [this.checkpoint as T] : [],
        rowCount: this.checkpoint ? 1 : 0,
      };
    }

    if (normalized.startsWith("select count(*)::int as unresolved_count")) {
      const unresolvedFromManifest = Array.from(this.manifestStatuses.values()).filter((status) =>
        ["staged", "hard_failed", "discard_retryable", "live_row_conflict"].includes(status),
      ).length;
      return {
        rows: [{ unresolved_count: this.unresolvedManifestCount + unresolvedFromManifest } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("select count(*)::int as approved_count")) {
      return {
        rows: [{ approved_count: this.approved.filter((row) => row.wizard_approved).length } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("select drive_file_id, staged_id")) {
      const approvedRows = this.approved.filter((row) => row.wizard_approved).slice(0, 100);
      return {
        rows: approvedRows as T[],
        rowCount: approvedRows.length,
      };
    }

    if (normalized.startsWith("select exists")) {
      return {
        rows: [{ exists: this.existingShows.has(params[0] as string) } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("update public.pending_syncs")) {
      const row = this.approved.find((candidate) => candidate.drive_file_id === params[0]);
      if (row) {
        row.wizard_approved = false;
        row.wizard_approved_by_email = null;
        row.wizard_reviewer_choices = [];
        row.wizard_reviewer_choices_version = null;
      }
      this.demoted.push({ driveFileId: params[0] as string, code: params[2] as string });
      return { rows: [{ demoted: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("update public.onboarding_scan_manifest set created_show_id")) {
      if (!this.provenanceRecordSucceeds) return { rows: [], rowCount: 0 };
      this.provenanceRecorded.push(params[0] as string);
      return { rows: [{ recorded: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("update public.onboarding_scan_manifest")) {
      this.manifestStatuses.set(params[0] as string, "staged");
      return { rows: [{ updated: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("insert into public.shows_pending_changes")) {
      this.stagedShadows.push(params[0] as string);
      this.stagedShadowParams.push(params);
      return { rows: [{ show_id: "show-1" } as T], rowCount: 1 };
    }

    if (normalized.startsWith("insert into public.shows")) {
      this.firstSeenApplied.push(params[0] as string);
      return { rows: [{ show_id: "show-first-seen" } as T], rowCount: 1 };
    }

    if (normalized.startsWith("insert into public.sync_audit")) {
      this.auditRows.push(params[1] as string);
      return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
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
    if (sql.startsWith("insert into public.wizard_finalize_checkpoints"))
      return "ensure-checkpoint";
    if (sql.startsWith("select drive_file_id, staged_id")) return "select-approved";
    if (sql.startsWith("update public.pending_syncs")) return "demote-pending";
    if (sql.startsWith("insert into public.shows_pending_changes")) return "stage-shadow";
    if (sql.startsWith("insert into public.shows")) return "apply-first-seen";
    if (sql.startsWith("update public.onboarding_scan_manifest set created_show_id")) {
      return "record-provenance";
    }
    if (sql.startsWith("delete from public.pending_syncs")) return "delete-pending";
    if (sql.startsWith("update public.wizard_finalize_checkpoints")) return "advance-checkpoint";
    return "other";
  }
}

/**
 * Minimal spy SyncPipelineTx — only the methods the shared apply core touches on the first-seen
 * path. The fake-DB suites assert routing/demote behavior, not apply internals (those are
 * covered by tests/onboarding/finalizeFirstSeenFullApply.db.test.ts against the real DB).
 * deleteLivePendingIngestion THROWS: the wizard-scoped core must never reach it (spec §3.2).
 */
function fakePipelineTx(db: FakeFinalizeDb): SyncPipelineTx {
  return {
    async queryOne(sqlText: string, params: unknown[]) {
      const normalized = sqlText.replace(/\s+/g, " ").trim();
      if (/pg_locks/i.test(normalized)) return { held: true };
      if (normalized.startsWith("insert into public.sync_audit")) {
        db.auditRows.push(params[1] as string);
        return { id: "audit-1" };
      }
      throw new Error(`Unhandled SQL in fake pipeline tx: ${normalized}`);
    },
    async applyShowSnapshot(args: { driveFileId: string }) {
      db.firstSeenApplied.push(args.driveFileId);
      return {
        outcome: "updated" as const,
        showId: "show-first-seen",
        previousCrewNames: [],
        previousCrewMembers: [],
        priorRunOfShow: null,
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
    async deleteLivePendingIngestion() {
      throw new Error(
        "live partition touched from a wizard finalize (deleteLivePendingIngestion) — spec §3.2",
      );
    },
  } as unknown as SyncPipelineTx;
}

function pending(driveFileId: string, overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    drive_file_id: driveFileId,
    staged_id: `00000000-0000-4000-8000-${driveFileId.padStart(12, "0").slice(0, 12)}`,
    staged_modified_time: "2026-05-08T12:00:00.000Z",
    parse_result: parseResult(`Show ${driveFileId}`),
    wizard_reviewer_choices: [],
    wizard_reviewer_choices_version: 1,
    wizard_approved: true,
    wizard_approved_by_email: "doug@example.com",
    wizard_approved_at: "2026-05-08T12:30:00.000Z",
    triggered_review_items: [],
    base_modified_time: null,
    ...overrides,
  };
}

function deps(db: FakeFinalizeDb, overrides: Partial<FinalizeRouteDeps> = {}): FinalizeRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => fn(db),
    withRowTx: async (_driveFileId, fn) => fn(db, fakePipelineTx(db)),
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

function applyRequest(wizardSessionId: string, driveFileId: string, stagedId: string): Request {
  return new Request(
    `https://crew.fxav.test/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/apply`,
    {
      method: "POST",
      body: JSON.stringify({
        stagedId,
        reviewerChoicesVersion: 1,
        reviewerChoices: [],
      }),
      headers: { "content-type": "application/json" },
    },
  );
}

async function reapplyDemotedRow(db: FakeFinalizeDb, driveFileId: string): Promise<Response> {
  const row = db.approved.find((candidate) => candidate.drive_file_id === driveFileId);
  if (!row) throw new Error(`missing fake pending row for ${driveFileId}`);
  return await handleWizardStagedApply(
    applyRequest(W1, driveFileId, row.staged_id),
    { params: Promise.resolve({ wizardSessionId: W1, driveFileId }) },
    {
      requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
      withRowTx: vi.fn(async (_lockedDriveFileId, fn) =>
        fn({
          queryOne: vi.fn(async () => ({ held: true })),
        } as never),
      ),
      applyStaged: vi.fn(async (args) => {
        row.wizard_approved = true;
        row.wizard_approved_by_email = args.appliedByEmail;
        row.wizard_reviewer_choices = args.reviewerChoices;
        row.wizard_reviewer_choices_version = 1;
        db.manifestStatuses.set(driveFileId, "applied");
        return {
          outcome: "wizard_applied" as const,
          wizardSessionId: W1,
          stagedId: row.staged_id,
        };
      }),
    },
  );
}

describe("POST /api/admin/onboarding/finalize", () => {
  // Regression: the finalize revision-guard peer of the apply revision-race
  // false positive (M12 Phase 0.F smoke 3). `staged_modified_time` is read from
  // pending_syncs via postgres.js, which yields a JS Date (not an ISO string).
  // The route's local sameTimestamp ran Date.parse(<Date>), dropping the
  // milliseconds, so an UNEDITED sheet whose live Drive modifiedTime matched the
  // staged value to the millisecond was demoted with
  // STAGED_PARSE_REVISION_RACE_DURING_FINALIZE — blocking the publish step (the
  // existing tests never caught this because they used ".000Z", which has no ms
  // to lose). Every prior onboarding sheet would hit this once apply was fixed.
  test("does not false-fire the finalize revision guard for a Date staged_modified_time (postgres.js) at the same instant", async () => {
    const INSTANT = "2026-05-09T03:44:06.040Z"; // nonzero ms — the trigger
    const db = new FakeFinalizeDb();
    db.approved = [
      // postgres.js returns a Date for the timestamptz column.
      pending("first-seen-1", { staged_modified_time: new Date(INSTANT) as unknown as string }),
    ];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: INSTANT, // same instant, ISO string with milliseconds
          parents: ["folder-1"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [{ drive_file_id: "first-seen-1", wizard_session_id: W1, code: "OK" }],
    });
    // Published as a draft (reached the publish step), NOT demoted.
    expect(db.firstSeenApplied).toEqual(["first-seen-1"]);
    expect(db.demoted).toEqual([]);
  });

  // True-positive preserved: a genuine later edit must still demote with the
  // finalize revision-race code (the guard still fires on a real edit).
  test("still fires the finalize revision guard when the sheet was genuinely edited", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [
      pending("first-seen-1", {
        staged_modified_time: new Date("2026-05-09T03:44:06.040Z") as unknown as string,
      }),
    ];

    const response = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-09T03:45:00.000Z", // a real edit, ~1 min later
          parents: ["folder-1"],
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [
        {
          drive_file_id: "first-seen-1",
          code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
        },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "first-seen-1", code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE" },
    ]);
    expect(db.firstSeenApplied).toEqual([]);
  });

  test("processes one batch: first-seen rows apply as unpublished drafts and existing rows stage shadow changes", async () => {
    // F1 Task 1.4 fixture instants — the shadow payload must carry these VERBATIM from the
    // pending row (it is deleted right after staging, so Phase D has no other source).
    const EXISTING_ITEMS = [
      {
        id: "i-mi11",
        invariant: "MI-11",
        crew_name: "Ada",
        prior_email: "ada@old.com",
        new_email: "ada@new.com",
      },
    ];
    const EXISTING_BASE = "2026-05-06T00:00:00.000Z";
    const EXISTING_APPROVED_AT = "2026-05-08T12:34:56.789Z";

    const db = new FakeFinalizeDb();
    db.approved = [
      pending("first-seen-1"),
      pending("existing-1", {
        triggered_review_items: EXISTING_ITEMS,
        base_modified_time: EXISTING_BASE,
        wizard_approved_at: EXISTING_APPROVED_AT,
      }),
    ];
    db.existingShows.add("existing-1");

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      per_row: [
        { drive_file_id: "first-seen-1", wizard_session_id: W1, code: "OK" },
        { drive_file_id: "existing-1", wizard_session_id: W1, code: "OK" },
      ],
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(db.firstSeenApplied).toEqual(["first-seen-1"]);
    expect(db.auditRows).toEqual(["first-seen-1"]);
    expect(db.stagedShadows).toEqual(["existing-1"]);
    expect(db.deletedPending).toEqual(["first-seen-1", "existing-1"]);

    // F1 Task 1.4: the shadow payload carries triggered_review_items + base_modified_time
    // copied from pending_syncs BEFORE deleteApprovedPending, and applied_at_intent is the
    // seeded Apply-click instant (wizard_approved_at), NOT a now() window (spec §3.1 R8-1).
    expect(db.stagedShadowParams).toHaveLength(1);
    const shadowParams = db.stagedShadowParams[0]!;
    expect(shadowParams[7]).toEqual(EXISTING_ITEMS); // $8::jsonb triggered_review_items
    expect(shadowParams[8]).toBe(EXISTING_BASE); // $9::timestamptz base_modified_time
    expect(shadowParams[9]).toBe(EXISTING_APPROVED_AT); // $10::timestamptz applied_at_intent
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

  test("final real batch transitions checkpoint to all_batches_complete when it processes every approved row", async () => {
    const db = new FakeFinalizeDb();
    db.approved = Array.from({ length: 50 }, (_, index) => pending(`single-${index}`));

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(db.approved).toEqual([]);
    expect(db.deletedPending).toHaveLength(50);
  });

  test("third multi-batch finalize call transitions checkpoint to all_batches_complete after processing the remaining approved rows", async () => {
    const db = new FakeFinalizeDb();
    db.approved = Array.from({ length: 250 }, (_, index) => pending(`multi-${index}`));
    const routeDeps = deps(db);

    const first = await handleOnboardingFinalize(request(), routeDeps);
    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 150,
    });
    expect(db.checkpoint?.status).toBe("in_progress");

    const second = await handleOnboardingFinalize(request(), routeDeps);
    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 50,
    });
    expect(db.checkpoint?.status).toBe("in_progress");

    const third = await handleOnboardingFinalize(request(), routeDeps);
    expect(third.status).toBe(200);
    expect(await json(third)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(db.approved).toEqual([]);
    expect(db.deletedPending).toHaveLength(250);
  });

  test("last-row failure demotion keeps finalize in progress until the row is reapplied and finalized", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("failure-last-1"), pending("failure-last-2"), pending("failure-last-3")];
    const routeDeps = deps(db, {
      fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime:
          driveFileId === "failure-last-3"
            ? "2026-05-08T12:01:00.000Z"
            : "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      })),
    });

    const first = await handleOnboardingFinalize(request(), routeDeps);

    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 1,
      per_row: [
        { drive_file_id: "failure-last-1", code: "OK" },
        { drive_file_id: "failure-last-2", code: "OK" },
        {
          drive_file_id: "failure-last-3",
          code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/failure-last-3",
        },
      ],
    });
    expect(db.checkpoint?.status).toBe("in_progress");
    expect(db.manifestStatuses.get("failure-last-3")).toBe("staged");
    expect(db.approved.find((row) => row.drive_file_id === "failure-last-3")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });

    const reapply = await reapplyDemotedRow(db, "failure-last-3");
    expect(reapply.status).toBe(200);
    expect(await json(reapply)).toEqual({
      status: "reapplied",
      wizard_session_id: W1,
      drive_file_id: "failure-last-3",
    });

    const second = await handleOnboardingFinalize(
      request(),
      deps(db, {
        fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-05-08T12:00:00.000Z",
          parents: ["folder-1"],
        })),
      }),
    );

    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({
      status: "all_batches_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 0,
      per_row: [{ drive_file_id: "failure-last-3", code: "OK" }],
    });
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("last-row failure in the final multi-batch keeps finalize in progress", async () => {
    const db = new FakeFinalizeDb();
    db.approved = Array.from({ length: 250 }, (_, index) => pending(`multi-failure-${index}`));
    const routeDeps = deps(db, {
      fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime:
          driveFileId === "multi-failure-249"
            ? "2026-05-08T12:01:00.000Z"
            : "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      })),
    });

    await handleOnboardingFinalize(request(), routeDeps);
    await handleOnboardingFinalize(request(), routeDeps);
    const third = await handleOnboardingFinalize(request(), routeDeps);

    expect(third.status).toBe(200);
    expect(await json(third)).toMatchObject({
      status: "batch_complete",
      wizard_session_id: W1,
      remaining_count: 0,
      unresolved_manifest_count: 1,
    });
    expect(db.checkpoint?.status).toBe("in_progress");
    expect(db.manifestStatuses.get("multi-failure-249")).toBe("staged");
    expect(db.approved.find((row) => row.drive_file_id === "multi-failure-249")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });
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

  test("rejects an already-complete checkpoint when unresolved manifest rows remain", async () => {
    const db = new FakeFinalizeDb();
    db.checkpoint = {
      wizard_session_id: W1,
      status: "all_batches_complete",
      batches_completed: 3,
    };
    db.unresolvedManifestCount = 1;

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "ONBOARDING_NOT_RESOLVED",
      unresolved_manifest_count: 1,
    });
    expect(db.checkpoint.status).toBe("all_batches_complete");
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
          code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
          re_apply_url: "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/moved-1",
        },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "moved-1", code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" },
    ]);
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

  // WM-R6 — third instance of the malformed-ELEMENT class (WM-R4/WM-R5 covered the shadow
  // payload gate). Phase B's checks were array-only: a stored `[null]` element passed them
  // and threw inside validateReviewerChoices (`choice.item_id`) / the items `.map`, which the
  // route wrapper turned into ONBOARDING_FINALIZE_INTERNAL_ERROR — wedging the WHOLE batch
  // with no per-row recovery. These pin the per-row demote posture instead: typed
  // STAGED_REVIEW_ITEMS_CORRUPT, re_apply_url, siblings continue, row re-applyable.
  test("demotes a first-seen row whose wizard_reviewer_choices contain a malformed element; siblings continue; row is re-applyable", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [
      pending("corrupt-choice-1", { wizard_reviewer_choices: [null] }),
      pending("healthy-1"),
    ];

    const first = await handleOnboardingFinalize(request(), deps(db));

    expect(first.status).toBe(200);
    expect(await json(first)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "corrupt-choice-1",
          wizard_session_id: W1,
          code: "STAGED_REVIEW_ITEMS_CORRUPT",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/corrupt-choice-1",
        },
        { drive_file_id: "healthy-1", code: "OK" },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "corrupt-choice-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
    ]);
    // The sibling finished its first-seen apply; the corrupt row applied NOTHING.
    expect(db.firstSeenApplied).toEqual(["healthy-1"]);
    expect(db.deletedPending).toEqual(["healthy-1"]);
    expect(db.manifestStatuses.get("corrupt-choice-1")).toBe("staged");

    // Recovery: re-apply through the staged review page (writes fresh validated choices) …
    const reapply = await reapplyDemotedRow(db, "corrupt-choice-1");
    expect(reapply.status).toBe(200);

    // … then the next finalize batch processes the row cleanly.
    const second = await handleOnboardingFinalize(request(), deps(db));
    expect(second.status).toBe(200);
    expect(await json(second)).toMatchObject({
      status: "all_batches_complete",
      per_row: [{ drive_file_id: "corrupt-choice-1", code: "OK" }],
    });
  });

  test("demotes a first-seen row whose triggered_review_items contain a malformed element instead of 500ing the batch", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [
      pending("corrupt-items-1", { triggered_review_items: [null] }),
      pending("healthy-2"),
    ];

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "batch_complete",
      per_row: [
        {
          drive_file_id: "corrupt-items-1",
          wizard_session_id: W1,
          code: "STAGED_REVIEW_ITEMS_CORRUPT",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/corrupt-items-1",
        },
        { drive_file_id: "healthy-2", code: "OK" },
      ],
    });
    expect(db.demoted).toEqual([
      { driveFileId: "corrupt-items-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
    ]);
    expect(db.firstSeenApplied).toEqual(["healthy-2"]);
    expect(db.deletedPending).toEqual(["healthy-2"]);
    expect(db.approved.find((row) => row.drive_file_id === "corrupt-items-1")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });
  });

  test("an existing-show row with a malformed review-item element demotes at Phase B and stages NO shadow", async () => {
    const db = new FakeFinalizeDb();
    db.existingShows.add("corrupt-existing-1");
    db.approved = [
      pending("corrupt-existing-1", {
        triggered_review_items: [{ id: "i1", invariant: "MI-12" }], // missing removed_name/added_name
      }),
    ];

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [{ drive_file_id: "corrupt-existing-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" }],
    });
    expect(db.stagedShadows).toEqual([]);
    expect(db.demoted).toEqual([
      { driveFileId: "corrupt-existing-1", code: "STAGED_REVIEW_ITEMS_CORRUPT" },
    ]);
  });

  test("provenance UPDATE matching 0 rows throws FirstSeenProvenanceRaceError BEFORE deleteApprovedPending; the loop demotes with WIZARD_SESSION_SUPERSEDED", async () => {
    // Defense-in-depth (F1 Task 1.3): if a wizard-session supersession ever committed between
    // the core apply and the provenance UPDATE, the UPDATE's active-session EXISTS predicate
    // matches 0 rows. Without the returning-check, the per-row tx would still COMMIT an
    // unpublished show with NO created_show_id recorded AND consume the staging row — a
    // permanent invisible orphan (F4's reap can't identify it; Phase D's narrowed flip never
    // publishes it; no pending row left to re-apply). TODAY this interleaving is unreachable —
    // readActiveSessionForUpdate holds app_settings FOR UPDATE for the whole outer batch (the
    // lock-topology DB test pins that serialization); this unit test pins the guard against
    // future lock refactors.
    const db = new FakeFinalizeDb();
    db.approved = [pending("provenance-race-1")];
    db.provenanceRecordSucceeds = false; // simulate the FOR UPDATE being weakened/removed

    const response = await handleOnboardingFinalize(request(), deps(db));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      per_row: [
        {
          drive_file_id: "provenance-race-1",
          wizard_session_id: W1,
          code: "WIZARD_SESSION_SUPERSEDED",
          re_apply_url:
            "/admin/onboarding/staged/11111111-1111-4111-8111-111111111111/provenance-race-1",
        },
      ],
    });
    // The throw aborts the per-row transaction BEFORE the staged row is consumed — the
    // pending_syncs row survives for re-apply (spy op-order, not just absence):
    expect(db.operations).toContain("record-provenance");
    expect(db.operations).not.toContain("delete-pending");
    expect(db.deletedPending).toEqual([]);
    // …and the loop's catch demotes the row in a FRESH per-row tx with the cataloged code:
    expect(db.demoted).toEqual([
      { driveFileId: "provenance-race-1", code: "WIZARD_SESSION_SUPERSEDED" },
    ]);
    expect(db.approved.find((row) => row.drive_file_id === "provenance-race-1")).toMatchObject({
      wizard_approved: false,
      wizard_approved_by_email: null,
    });
  });

  test("never returns an empty 500 — an unexpected throw becomes a typed JSON error + console.error", async () => {
    // Failure mode this catches: the publish loop threw an uncaught error (the
    // M12 Phase 0.F smoke-3 parse_result TypeError was one instance), Next.js
    // returned a 500 with an EMPTY body, and the client's `response.json()`
    // failed with "Unexpected end of JSON input". The wrapper must turn ANY
    // unexpected throw into a parseable JSON body carrying a typed code, and log
    // the underlying message so the next failure is diagnosable from logs.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("kaboom: simulated unexpected finalize failure");
    const response = await handleOnboardingFinalize(request(), {
      requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
      withTx: async () => {
        throw boom;
      },
    });

    expect(response.status).toBe(500);
    // This line would itself throw on an empty body — that is the regression.
    const body = (await json(response)) as { ok?: boolean; code?: string };
    expect(body).toMatchObject({ ok: false, code: "ONBOARDING_FINALIZE_INTERNAL_ERROR" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("a missing-approver-email defensive throw is surfaced as a typed 500, not an empty body", async () => {
    // The DB CHECK (pending_syncs_approved_requires_full_payload) makes this
    // unreachable in practice; if it ever fires, finalize must NOT leak an empty
    // 500. The wrapper converts the throw into a diagnosable JSON 500.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeFinalizeDb();
    db.approved = [pending("missing-email-1", { wizard_approved_by_email: null })];

    const response = await handleOnboardingFinalize(request(), deps(db));
    expect(response.status).toBe(500);
    const body = (await json(response)) as { ok?: boolean; code?: string };
    expect(body).toMatchObject({ ok: false, code: "ONBOARDING_FINALIZE_INTERNAL_ERROR" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
