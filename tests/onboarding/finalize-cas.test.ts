import { describe, expect, test, vi } from "vitest";
import type {
  FinalizeCasRouteDeps,
  FinalizeCasRouteTx,
} from "@/app/api/admin/onboarding/finalize-cas/route";
import type { WizardStagedRouteTx } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";

const W1 = "11111111-1111-4111-8111-111111111111";

function parseResult() {
  return {
    show: {
      title: "Existing Show",
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
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    pullSheet: null,
  };
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize-cas", {
    method: "POST",
  });
}

class FakeFinalizeCasDb implements FinalizeCasRouteTx {
  activeSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  watchedFolderId: string | null = null;
  checkpoint:
    | { status: "in_progress" | "all_batches_complete" | "final_cas_done"; batches_completed: number }
    | null = { status: "all_batches_complete", batches_completed: 1 };
  finalizeLocked = true;
  approvedCount = 0;
  unresolvedManifestCount = 0;
  shadowRows: Array<{
    wizard_session_id: string;
    drive_file_id: string;
    show_id: string;
    applied_by_email: string;
    applied_at_intent: string;
    payload: Record<string, unknown>;
  }> = [];
  appliedShadows: string[] = [];
  auditRows: string[] = [];
  phaseDCasFailDriveIds = new Set<string>();
  published = false;
  deletedWizardDeferrals = false;
  operations: string[] = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.operations.push(this.classify(normalized));

    if (normalized.startsWith("select pending_wizard_session_id")) {
      return {
        rows: [
          {
            pending_wizard_session_id: this.activeSessionId,
            pending_folder_id: this.pendingFolderId,
            watched_folder_id: this.watchedFolderId,
          } as T,
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes("pg_try_advisory_xact_lock(hashtext('finalize:'")) {
      return { rows: [{ locked: this.finalizeLocked } as T], rowCount: 1 };
    }

    if (normalized.startsWith("select status, batches_completed")) {
      return {
        rows: this.checkpoint ? [this.checkpoint as T] : [],
        rowCount: this.checkpoint ? 1 : 0,
      };
    }

    if (normalized.startsWith("select wizard_session_id from public.wizard_finalize_checkpoints")) {
      return {
        rows: this.checkpoint?.status === "final_cas_done" ? [{ wizard_session_id: W1 } as T] : [],
        rowCount: this.checkpoint?.status === "final_cas_done" ? 1 : 0,
      };
    }

    if (normalized.startsWith("select count(*)::int as approved_count")) {
      return { rows: [{ approved_count: this.approvedCount } as T], rowCount: 1 };
    }

    if (normalized.startsWith("select count(*)::int as unresolved_count")) {
      return {
        rows: [{ unresolved_count: this.unresolvedManifestCount } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("select wizard_session_id, drive_file_id")) {
      return { rows: this.shadowRows as T[], rowCount: this.shadowRows.length };
    }

    if (normalized.startsWith("update public.shows") && normalized.includes("set title")) {
      const driveFileId = params[0] as string;
      if (this.phaseDCasFailDriveIds.has(driveFileId)) return { rows: [], rowCount: 0 };
      this.appliedShadows.push(driveFileId);
      return { rows: [{ applied: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("insert into public.sync_audit")) {
      this.auditRows.push(params[1] as string);
      return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
    }

    if (normalized.startsWith("delete from public.shows_pending_changes")) {
      const driveFileId = params.find((param) => typeof param === "string" && param.startsWith("existing-")) as
        | string
        | undefined;
      this.shadowRows = driveFileId
        ? this.shadowRows.filter((row) => row.drive_file_id !== driveFileId)
        : [];
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith("update public.shows")) {
      this.published = true;
      return { rows: [{ published: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("delete from public.deferred_ingestions")) {
      this.deletedWizardDeferrals = true;
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith("update public.app_settings")) {
      if (this.activeSessionId !== params[0]) return { rows: [], rowCount: 0 };
      this.watchedFolderId = this.pendingFolderId;
      this.activeSessionId = null;
      this.pendingFolderId = null;
      return {
        rows: [{ watched_folder_id: this.watchedFolderId } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("update public.wizard_finalize_checkpoints")) {
      if (this.checkpoint) this.checkpoint.status = "final_cas_done";
      return { rows: [this.checkpoint as T], rowCount: this.checkpoint ? 1 : 0 };
    }

    throw new Error(`Unhandled SQL in finalize-cas fake: ${normalized}`);
  }

  async queryOne<T>(): Promise<T> {
    return { held: true } as T;
  }

  private classify(sql: string): string {
    if (sql.startsWith("select pending_wizard_session_id")) return "read-session";
    if (sql.includes("pg_try_advisory_xact_lock(hashtext('finalize:'")) return "try-finalize-lock";
    if (sql.startsWith("select status, batches_completed")) return "read-checkpoint";
    if (sql.startsWith("select wizard_session_id, drive_file_id")) return "read-shadows";
    if (sql.startsWith("update public.shows") && sql.includes("set title")) return "apply-shadow";
    if (sql.startsWith("update public.shows")) return "publish";
    if (sql.startsWith("delete from public.deferred_ingestions")) return "delete-deferrals";
    if (sql.startsWith("update public.app_settings")) return "promote-settings";
    if (sql.startsWith("update public.wizard_finalize_checkpoints")) return "mark-final-cas-done";
    return "other";
  }
}

function deps(db: FakeFinalizeCasDb, overrides: Partial<FinalizeCasRouteDeps> = {}): FinalizeCasRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => fn(db),
    withRowTx: async (_driveFileId, fn) => fn(db),
    subscribeToWatchedFolder: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("POST /api/admin/onboarding/finalize-cas", () => {
  test("commits Phase D atomically then subscribes to the watched folder after commit", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [{
      wizard_session_id: W1,
      drive_file_id: "existing-1",
      show_id: "22222222-2222-4222-8222-222222222222",
      applied_by_email: "apply-admin@example.com",
      applied_at_intent: "2026-05-08T12:00:00.000Z",
      payload: { parse_result: parseResult(), staged_modified_time: "2026-05-08T12:00:00.000Z" },
    }];
    const routeDeps = deps(db);

    const response = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "finalize_complete",
      wizard_session_id: W1,
      watched_folder_id: "folder-1",
    });
    expect(db.appliedShadows).toEqual(["existing-1"]);
    expect(db.auditRows).toEqual(["existing-1"]);
    expect(db.shadowRows).toEqual([]);
    expect(db.published).toBe(true);
    expect(db.deletedWizardDeferrals).toBe(true);
    expect(db.checkpoint?.status).toBe("final_cas_done");
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
    expect(db.operations.at(-1)).toBe("mark-final-cas-done");
  });

  test("Phase D blocks final CAS when one shadow row is outdated, preserving recovery state until re-apply", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = Array.from({ length: 5 }, (_, index) => ({
      wizard_session_id: W1,
      drive_file_id: `existing-${index + 1}`,
      show_id: `22222222-2222-4222-8222-22222222222${index}`,
      applied_by_email: "apply-admin@example.com",
      applied_at_intent: "2026-05-08T12:00:00.000Z",
      payload: { parse_result: parseResult(), staged_modified_time: "2026-05-08T12:00:00.000Z" },
    }));
    db.phaseDCasFailDriveIds.add("existing-3");
    const routeDeps = deps(db);

    const blockedResponse = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(blockedResponse.status).toBe(409);
    expect(await json(blockedResponse)).toEqual({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      per_row: [
        { drive_file_id: "existing-1", code: "OK" },
        { drive_file_id: "existing-2", code: "OK" },
        { drive_file_id: "existing-3", code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" },
        { drive_file_id: "existing-4", code: "OK" },
        { drive_file_id: "existing-5", code: "OK" },
      ],
    });
    expect(db.appliedShadows).toEqual(["existing-1", "existing-2", "existing-4", "existing-5"]);
    expect(db.auditRows).toEqual(["existing-1", "existing-2", "existing-4", "existing-5"]);
    expect(db.shadowRows.map((row) => row.drive_file_id)).toEqual(["existing-3"]);
    expect(db.published).toBe(false);
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.watchedFolderId).toBeNull();
    expect(db.checkpoint?.status).toBe("all_batches_complete");
    expect(routeDeps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(db.operations).not.toContain("publish");
    expect(db.operations).not.toContain("delete-deferrals");
    expect(db.operations).not.toContain("promote-settings");
    expect(db.operations).not.toContain("mark-final-cas-done");

    const reapplyResponse = await handleWizardStagedApply(
      new Request(`https://crew.fxav.test/api/admin/onboarding/staged/${W1}/existing-3/apply`, {
        method: "POST",
        body: JSON.stringify({
          stagedId: "33333333-3333-4333-8333-333333333333",
          reviewerChoicesVersion: 1,
          reviewerChoices: [],
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ wizardSessionId: W1, driveFileId: "existing-3" }) },
      {
        requireAdminIdentity: async () => ({ email: "doug@example.com" }),
        withRowTx: async (_driveFileId, fn) => fn(db as unknown as WizardStagedRouteTx),
        applyStaged: async () => {
          db.phaseDCasFailDriveIds.delete("existing-3");
          db.shadowRows = [
            {
              wizard_session_id: W1,
              drive_file_id: "existing-3",
              show_id: "22222222-2222-4222-8222-222222222222",
              applied_by_email: "apply-admin@example.com",
              applied_at_intent: "2026-05-08T12:00:00.000Z",
              payload: {
                parse_result: parseResult(),
                staged_id: "33333333-3333-4333-8333-333333333333",
                staged_modified_time: "2026-05-08T12:00:00.000Z",
              },
            },
          ];
          return {
            outcome: "wizard_applied" as const,
            wizardSessionId: W1,
            stagedId: "33333333-3333-4333-8333-333333333333",
          };
        },
      },
    );
    expect(reapplyResponse.status).toBe(200);
    expect(await json(reapplyResponse)).toEqual({
      status: "reapplied",
      wizard_session_id: W1,
      drive_file_id: "existing-3",
    });

    const successResponse = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(successResponse.status).toBe(200);
    expect(await json(successResponse)).toEqual({
      status: "finalize_complete",
      wizard_session_id: W1,
      watched_folder_id: "folder-1",
    });
    expect(db.shadowRows).toEqual([]);
    expect(db.published).toBe(true);
    expect(db.deletedWizardDeferrals).toBe(true);
    expect(db.watchedFolderId).toBe("folder-1");
    expect(db.checkpoint?.status).toBe("final_cas_done");
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
  });

  test("reports Phase D shadow rows whose live show advanced after Phase B without final cleanup", async () => {
    const db = new FakeFinalizeCasDb();
    db.phaseDCasFailDriveIds.add("existing-1");
    db.shadowRows = [{
      wizard_session_id: W1,
      drive_file_id: "existing-1",
      show_id: "22222222-2222-4222-8222-222222222222",
      applied_by_email: "apply-admin@example.com",
      applied_at_intent: "2026-05-08T12:00:00.000Z",
      payload: { parse_result: parseResult(), staged_modified_time: "2026-05-08T12:00:00.000Z" },
    }];

    const response = await handleOnboardingFinalizeCas(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "STAGED_PARSE_OUTDATED_AT_PHASE_D",
      per_row: [
        { drive_file_id: "existing-1", code: "STAGED_PARSE_OUTDATED_AT_PHASE_D" },
      ],
    });
    expect(db.shadowRows.map((row) => row.drive_file_id)).toEqual(["existing-1"]);
    expect(db.published).toBe(false);
    expect(db.deletedWizardDeferrals).toBe(false);
    expect(db.checkpoint?.status).toBe("all_batches_complete");
  });

  test("is idempotent after settings were already promoted", async () => {
    const db = new FakeFinalizeCasDb();
    db.activeSessionId = null;
    db.pendingFolderId = null;
    db.watchedFolderId = "folder-1";
    db.checkpoint = { status: "final_cas_done", batches_completed: 2 };
    const routeDeps = deps(db);

    const response = await handleOnboardingFinalizeCas(request(), routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "finalize_complete",
      wizard_session_id: W1,
      watched_folder_id: "folder-1",
      idempotent: true,
    });
    expect(routeDeps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
  });

  test("rejects early-fire before all batches are complete", async () => {
    const db = new FakeFinalizeCasDb();
    db.checkpoint = { status: "in_progress", batches_completed: 1 };

    const response = await handleOnboardingFinalizeCas(request(), deps(db));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_FINALIZE_BATCHES_PENDING" });
  });

  test("rejects missing checkpoint or missing active wizard session", async () => {
    const missingCheckpoint = new FakeFinalizeCasDb();
    missingCheckpoint.checkpoint = null;

    await expect(json(await handleOnboardingFinalizeCas(request(), deps(missingCheckpoint)))).resolves.toEqual({
      ok: false,
      code: "WIZARD_FINALIZE_CHECKPOINT_MISSING",
    });

    const missingSession = new FakeFinalizeCasDb();
    missingSession.activeSessionId = null;

    const response = await handleOnboardingFinalizeCas(request(), deps(missingSession));
    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_FINALIZE_CHECKPOINT_MISSING" });
  });

  test("rejects when approved pending rows or unresolved manifest rows remain", async () => {
    const approved = new FakeFinalizeCasDb();
    approved.approvedCount = 1;

    const approvedResponse = await handleOnboardingFinalizeCas(request(), deps(approved));
    expect(approvedResponse.status).toBe(409);
    expect(await json(approvedResponse)).toEqual({
      ok: false,
      code: "WIZARD_FINALIZE_BATCHES_PENDING",
      approved_count: 1,
    });

    const unresolved = new FakeFinalizeCasDb();
    unresolved.unresolvedManifestCount = 1;

    const unresolvedResponse = await handleOnboardingFinalizeCas(request(), deps(unresolved));
    expect(unresolvedResponse.status).toBe(409);
    expect(await json(unresolvedResponse)).toEqual({
      ok: false,
      code: "ONBOARDING_NOT_RESOLVED",
      unresolved_manifest_count: 1,
    });
  });

  test("never returns an empty 500 — an unexpected throw becomes a typed JSON error + console.error", async () => {
    // finalize-cas coerces parse_result / reviewer_choices (which can throw a
    // typed JsonbCoercionError on a genuinely-corrupt legacy shadow payload) and
    // runs DB work that may fault. Without the wrapper that throw escaped the
    // route → Next returned an empty 500 body → the client's response.json()
    // failed with "Unexpected end of JSON input" (the M12 Phase 0.F smoke-3 class,
    // Codex R1 HIGH: the wrapper existed on /finalize but not on /finalize-cas).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeFinalizeCasDb();
    const response = await handleOnboardingFinalizeCas(request(), {
      requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
      withTx: async () => {
        throw new Error("kaboom: simulated unexpected finalize-cas failure");
      },
      withRowTx: async (_driveFileId, fn) => fn(db),
      subscribeToWatchedFolder: vi.fn(async () => undefined),
    });
    expect(response.status).toBe(500);
    // Would itself throw on an empty body — that is the regression.
    expect(await json(response)).toMatchObject({
      ok: false,
      code: "ONBOARDING_FINALIZE_INTERNAL_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
