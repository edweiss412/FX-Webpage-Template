/**
 * tests/onboarding/_finalizeFake.ts
 *
 * Shared in-memory finalize test harness (FakeFinalizeDb + deps/pending/json/request helpers),
 * extracted verbatim from finalize.test.ts so the streaming-handler tests
 * (finalizeStream.test.ts, finalizeCasStream.test.ts) exercise the SAME fake without
 * duplicating ~380 lines. finalize.test.ts imports these; do not re-inline them there.
 */
import { vi } from "vitest";
import type { FinalizeRouteDeps, FinalizeRouteTx } from "@/app/api/admin/onboarding/finalize/route";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

export const W1 = "11111111-1111-4111-8111-111111111111";

export function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", {
    method: "POST",
  });
}

export type PendingRow = {
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
  // Task B2: set by demotePending; a demoted-not-yet-reapplied row (wizard_approved=false AND this
  // non-null) is excluded by selectFinishableCleanRows until re-apply flips wizard_approved=true.
  last_finalize_failure_code?: string | null;
};

export type ManifestStatus =
  | "staged"
  | "hard_failed"
  | "discard_retryable"
  | "live_row_conflict"
  | "applied"
  | "defer_until_modified"
  | "permanent_ignore";

export function parseResult(title: string): Record<string, unknown> {
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

export class FakeFinalizeDb implements FinalizeRouteTx {
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
  // Task B2: per-drive-file publish_intent stamped at finalize (true=checked → CAS flip to Live).
  manifestPublishIntent = new Map<string, boolean>();

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

    // Task B2: a row is FINISHABLE-clean when its manifest is non-blocking (absent in the legacy
    // seed, or 'staged'/'applied') AND it is not a demoted-not-yet-reapplied failure
    // (wizard_approved=true OR last_finalize_failure_code is null). Both selectFinishableCleanRows
    // and countRemainingCleanRows share this predicate.
    const isFinishableClean = (row: PendingRow): boolean => {
      const status = this.manifestStatuses.get(row.drive_file_id);
      const manifestClean = status === undefined || status === "staged" || status === "applied";
      const notDemoted = row.wizard_approved === true || row.last_finalize_failure_code == null;
      return manifestClean && notDemoted;
    };

    if (normalized.startsWith("select count(*)::int as remaining_count")) {
      return {
        rows: [{ remaining_count: this.approved.filter(isFinishableClean).length } as T],
        rowCount: 1,
      };
    }

    if (normalized.startsWith("select ps.drive_file_id, ps.staged_id")) {
      // Honor the actual SQL LIMIT ($2 = runtime.batchCap) so tests can inject a small
      // batchCap to exercise multi-batch flow without seeding hundreds of rows. Default
      // batchCap is 100, so pre-existing suites (which don't inject it) are unchanged.
      const limit = Number(params[1] ?? 100);
      const cleanRows = this.approved.filter(isFinishableClean).slice(0, limit);
      return {
        rows: cleanRows as T[],
        rowCount: cleanRows.length,
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
        // Task B2: demote stamps last_finalize_failure_code → the row is now "demoted, awaiting
        // re-apply" and is excluded from the finishable-clean selector/count until re-applied.
        row.last_finalize_failure_code = params[2] as string;
      }
      this.demoted.push({ driveFileId: params[0] as string, code: params[2] as string });
      return { rows: [{ demoted: true } as T], rowCount: 1 };
    }

    if (normalized.startsWith("update public.onboarding_scan_manifest set created_show_id")) {
      // Task B2: provenance UPDATE now also stamps publish_intent ($4) in the same statement.
      if (!this.provenanceRecordSucceeds) return { rows: [], rowCount: 0 };
      this.provenanceRecorded.push(params[0] as string);
      this.manifestPublishIntent.set(params[0] as string, params[3] as boolean);
      return { rows: [{ recorded: true } as T], rowCount: 1 };
    }

    // Task B2: existing-show-unchecked D10 no-op resolves the manifest to 'applied'
    // (created_show_id=null, publish_intent=false) — distinguished by the 'applied' literal.
    if (
      normalized.startsWith("update public.onboarding_scan_manifest") &&
      normalized.includes("set status = 'applied'")
    ) {
      this.manifestStatuses.set(params[0] as string, "applied");
      this.manifestPublishIntent.set(params[0] as string, false);
      return { rows: [{ updated: true } as T], rowCount: 1 };
    }

    // Task B2: existing-show-checked stamps publish_intent without touching status/created_show_id.
    if (
      normalized.startsWith("update public.onboarding_scan_manifest") &&
      normalized.includes("set publish_intent")
    ) {
      this.manifestPublishIntent.set(params[0] as string, params[2] as boolean);
      return { rows: [{ updated: true } as T], rowCount: 1 };
    }

    // Remaining onboarding_scan_manifest UPDATE is demotePending's status → 'staged'.
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

    // §5.6 generation-scoped re-select of parse_result under the per-row show: lock.
    // Returns the current parse_result for the seeded row (matched by drive_file_id + staged_id).
    // 0 rows → the stale path in processApprovedRow (staged_id regenerated mid-flight).
    if (normalized.startsWith("select parse_result, wizard_approved")) {
      const foundRow = this.approved.find(
        (candidate) => candidate.drive_file_id === params[1] && candidate.staged_id === params[2],
      );
      if (!foundRow) return { rows: [], rowCount: 0 };
      return {
        rows: [
          {
            parse_result: foundRow.parse_result,
            wizard_approved: foundRow.wizard_approved,
            wizard_reviewer_choices: foundRow.wizard_reviewer_choices,
            wizard_reviewer_choices_version: foundRow.wizard_reviewer_choices_version,
            wizard_approved_by_email: foundRow.wizard_approved_by_email,
            wizard_approved_at: foundRow.wizard_approved_at,
            last_finalize_failure_code: foundRow.last_finalize_failure_code ?? null,
          } as T,
        ],
        rowCount: 1,
      };
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
    if (sql.startsWith("select parse_result, wizard_approved")) return "reread-parse-result";
    if (sql.startsWith("select ps.drive_file_id, ps.staged_id")) return "select-approved";
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
export function fakePipelineTx(db: FakeFinalizeDb): SyncPipelineTx {
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

export function pending(driveFileId: string, overrides: Partial<PendingRow> = {}): PendingRow {
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

export function deps(db: FakeFinalizeDb, overrides: Partial<FinalizeRouteDeps> = {}): FinalizeRouteDeps {
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

export async function json(response: Response): Promise<unknown> {
  return await response.json();
}
