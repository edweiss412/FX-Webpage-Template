/**
 * tests/onboarding/_finalizeCasFake.ts
 *
 * Shared in-memory finalize-cas test harness (FakeFinalizeCasDb + shadowPayload/deps/json/request
 * helpers), extracted verbatim from finalize-cas.test.ts so the streaming-handler test
 * (finalizeCasStream.test.ts) exercises the SAME fake without duplicating ~250 lines.
 * finalize-cas.test.ts imports these; do not re-inline them there.
 */
import { vi } from "vitest";
import type {
  FinalizeCasRouteDeps,
  FinalizeCasRouteTx,
} from "@/app/api/admin/onboarding/finalize-cas/route";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

export const W1 = "11111111-1111-4111-8111-111111111111";

export const EXISTING_SHOW_TITLE = "Existing Show";

export function parseResult() {
  return {
    show: {
      title: EXISTING_SHOW_TITLE,
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

export function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize-cas", {
    method: "POST",
  });
}

// F1 Task 1.4/1.5: shadow payloads carry the full apply contract — staged_id,
// triggered_review_items, base_modified_time. The fake live-show read returns BASE_TS so the
// equality preflight matches; CAS-fail drive ids return an ADVANCED watermark instead (the
// fake's classifier keys on the equality predicate now, not the bespoke UPDATE's rowCount).
export const BASE_TS = "2026-05-07T00:00:00.000Z";
export const ADVANCED_TS = "2026-05-09T00:00:00.000Z";

export function shadowPayload(overrides: Record<string, unknown> = {}) {
  return {
    parse_result: parseResult(),
    staged_id: "33333333-3333-4333-8333-333333333333",
    staged_modified_time: "2026-05-08T12:00:00.000Z",
    reviewer_choices: [],
    triggered_review_items: [],
    base_modified_time: BASE_TS,
    ...overrides,
  };
}

export class FakeFinalizeCasDb implements FinalizeCasRouteTx {
  activeSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  watchedFolderId: string | null = null;
  checkpoint: {
    status: "in_progress" | "all_batches_complete" | "final_cas_done";
    batches_completed: number;
  } | null = { status: "all_batches_complete", batches_completed: 1 };
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
  // WM-R9: drive ids whose live show is archived — applyShadow's lock-held re-read
  // (readShowArchived_unlocked) must refuse them with SHOW_ARCHIVED_IMMUTABLE.
  archivedDriveIds = new Set<string>();
  // Drive ids whose manifest rows carry created_show_id (the narrowed flip's locked set).
  sessionCreatedDriveIds: string[] = [];
  // WM-R7 finding 1: drive ids the legacy-ambiguity preflight reports — applied manifest
  // rows with NULL created_show_id whose published=false show carries NO provenance
  // discriminator and has NO shadow (the pre-provenance Phase B shape).
  legacyAmbiguousDriveIds: string[] = [];
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

    if (normalized.startsWith("select id, last_seen_modified_time, diagrams")) {
      // The route-level equality preflight target (F1 Task 1.5): CAS-fail drive ids return an
      // ADVANCED live watermark (≠ the shadow's base_modified_time) — the equality refusal.
      const driveFileId = params[0] as string;
      return {
        rows: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            last_seen_modified_time: this.phaseDCasFailDriveIds.has(driveFileId)
              ? ADVANCED_TS
              : BASE_TS,
            diagrams: null,
          } as T,
        ],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("select m.drive_file_id from public.onboarding_scan_manifest m")) {
      return {
        rows: this.legacyAmbiguousDriveIds.map((drive_file_id) => ({ drive_file_id }) as T),
        rowCount: this.legacyAmbiguousDriveIds.length,
      };
    }

    if (normalized.startsWith("select drive_file_id from public.onboarding_scan_manifest")) {
      return {
        rows: this.sessionCreatedDriveIds.map((drive_file_id) => ({ drive_file_id }) as T),
        rowCount: this.sessionCreatedDriveIds.length,
      };
    }

    if (normalized.includes("pg_advisory_xact_lock(hashtext('show:'")) {
      return { rows: [{} as T], rowCount: 1 };
    }

    if (normalized.startsWith("delete from public.shows_pending_changes")) {
      const driveFileId = params.find(
        (param) => typeof param === "string" && param.startsWith("existing-"),
      ) as string | undefined;
      this.shadowRows = driveFileId
        ? this.shadowRows.filter((row) => row.drive_file_id !== driveFileId)
        : [];
      return { rows: [], rowCount: 0 };
    }

    if (
      normalized.startsWith("update public.shows s") &&
      normalized.includes("set published = true")
    ) {
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
    if (sql.startsWith("select id, last_seen_modified_time, diagrams")) return "read-live-show";
    if (sql.startsWith("select m.drive_file_id from public.onboarding_scan_manifest m")) {
      return "legacy-ambiguity-preflight";
    }
    if (sql.startsWith("select drive_file_id from public.onboarding_scan_manifest")) {
      return "read-created-manifest";
    }
    if (sql.includes("pg_advisory_xact_lock(hashtext('show:'")) return "lock-show";
    if (sql.startsWith("update public.shows s") && sql.includes("set published = true")) {
      return "publish";
    }
    if (sql.startsWith("delete from public.deferred_ingestions")) return "delete-deferrals";
    if (sql.startsWith("update public.app_settings")) return "promote-settings";
    if (sql.startsWith("update public.wizard_finalize_checkpoints")) return "mark-final-cas-done";
    return "other";
  }
}

// Minimal spy SyncPipelineTx: the shared apply core adopts the per-row lock (pg_locks probe),
// runs the Phase-2 child set, and writes the audit through THIS tx — the fake records the
// applied drive ids + audit rows the old bespoke writers used to record via db.query.
export function makeFakePipelineTx(db: FakeFinalizeCasDb): SyncPipelineTx {
  return {
    async queryOne<T>(sqlText: string, params: unknown[] = []): Promise<T> {
      const normalized = sqlText.replace(/\s+/g, " ").trim();
      if (/pg_locks/i.test(normalized)) return { held: true } as T;
      if (normalized.startsWith("select archived from public.shows")) {
        return { archived: db.archivedDriveIds.has(params[0] as string) } as T;
      }
      if (normalized.startsWith("insert into public.sync_audit")) {
        db.auditRows.push(params[1] as string); // $2 = drive_file_id
        return { id: "audit-1" } as T;
      }
      throw new Error(`Unhandled pipelineTx SQL in finalize-cas fake: ${normalized}`);
    },
    holdPort() {
      return { unsafe: async () => [] };
    },
    async applyShowSnapshot(args: { driveFileId: string }) {
      db.appliedShadows.push(args.driveFileId);
      return {
        outcome: "updated" as const,
        showId: "22222222-2222-4222-8222-222222222222",
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
      // Wizard scope must NEVER reach this (withWizardScopedLivePartitionOps no-ops it).
      db.operations.push("delete-live-pending-ingestion");
    },
  } as unknown as SyncPipelineTx;
}

export function deps(
  db: FakeFinalizeCasDb,
  overrides: Partial<FinalizeCasRouteDeps> = {},
): FinalizeCasRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => fn(db),
    withRowTx: async (_driveFileId, fn) => fn(db, makeFakePipelineTx(db)),
    subscribeToWatchedFolder: vi.fn(async () => undefined),
    ...overrides,
  };
}

export async function json(response: Response): Promise<unknown> {
  return await response.json();
}
