/**
 * tests/onboarding/finalizeRevalidate.test.ts (nav-perf tag-caching, plan Task 6)
 *
 * Asserts the onboarding finalize + finalize-cas routes call
 * `revalidateTag(showCacheTag(showId), { expire: 0 })` POST-COMMIT — after the
 * outer `deps.withTx` resolves (the finalize transaction committed), once per
 * affected show, and NEVER inside the per-row / outer transaction.
 *
 * Ordering proof: the injected `withTx` pushes a `committed` marker onto a shared
 * `order` log when it RESOLVES; `revalidateTag` is a spy that pushes
 * `revalidate:<tag>`. The test asserts every `revalidate` follows `committed`.
 *
 * finalize/route.ts: only the FIRST-SEEN branch writes public.shows (the
 * existing-show branch merely STAGES a shadow → no rendered-data write until
 * finalize-cas), so exactly the first-seen created show ids revalidate.
 * finalize-cas/route.ts: applied existing-show shadows + the publish flip both
 * mutate rendered show data, so both revalidate.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { showCacheTag } from "@/lib/data/showCacheTag";
import type { FinalizeRouteDeps, FinalizeRouteTx } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import type {
  FinalizeCasRouteDeps,
  FinalizeCasRouteTx,
} from "@/app/api/admin/onboarding/finalize-cas/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

const order: string[] = [];
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn((tag: string) => {
    order.push(`revalidate:${tag}`);
  }),
  revalidatePath: vi.fn(),
}));

const W1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  order.length = 0;
  (revalidateTag as unknown as ReturnType<typeof vi.fn>).mockClear();
});

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

// ---------------------------------------------------------------------------
// finalize/route.ts — first-seen apply
// ---------------------------------------------------------------------------

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
  // Task B2: a demoted-not-yet-reapplied row (wizard_approved=false AND this non-null) is excluded
  // by selectFinishableCleanRows / countRemainingCleanRows until re-apply flips wizard_approved=true.
  last_finalize_failure_code?: string | null;
};

function pending(driveFileId: string): PendingRow {
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
  };
}

class FakeFinalizeDb implements FinalizeRouteTx {
  activeSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  finalizeLocked = true;
  checkpoint: { wizard_session_id: string; status: string; batches_completed: number } | null =
    null;
  approved: PendingRow[] = [];
  existingShows = new Set<string>();
  firstSeenApplied: string[] = [];
  manifestStatuses = new Map<string, string>();

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const n = sql.replace(/\s+/g, " ").trim();
    if (n.includes("pg_try_advisory_xact_lock(hashtext('finalize:'")) {
      return { rows: [{ locked: this.finalizeLocked } as T], rowCount: 1 };
    }
    if (n.startsWith("select pending_wizard_session_id")) {
      return { rows: [{ pending_wizard_session_id: this.activeSessionId } as T], rowCount: 1 };
    }
    if (n.startsWith("select pending_folder_id")) {
      return { rows: [{ pending_folder_id: this.pendingFolderId } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.wizard_finalize_checkpoints")) {
      if (!this.checkpoint && this.activeSessionId) {
        this.checkpoint = {
          wizard_session_id: this.activeSessionId,
          status: "in_progress",
          batches_completed: 0,
        };
      }
      return { rows: [this.checkpoint as T], rowCount: this.checkpoint ? 1 : 0 };
    }
    if (n.startsWith("select status, batches_completed")) {
      return {
        rows: this.checkpoint ? [this.checkpoint as T] : [],
        rowCount: this.checkpoint ? 1 : 0,
      };
    }
    if (n.startsWith("select count(*)::int as unresolved_count")) {
      return { rows: [{ unresolved_count: 0 } as T], rowCount: 1 };
    }
    // Task B2: a row is FINISHABLE-clean when it is not a demoted-not-yet-reapplied failure
    // (wizard_approved=true OR last_finalize_failure_code is null). Both selectFinishableCleanRows
    // and countRemainingCleanRows share this predicate.
    const isFinishableClean = (row: PendingRow): boolean =>
      row.wizard_approved === true || row.last_finalize_failure_code == null;
    if (n.startsWith("select count(*)::int as remaining_count")) {
      return {
        rows: [{ remaining_count: this.approved.filter(isFinishableClean).length } as T],
        rowCount: 1,
      };
    }
    if (n.startsWith("select ps.drive_file_id, ps.staged_id")) {
      const rows = this.approved.filter(isFinishableClean).slice(0, 100);
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (n.startsWith("select exists")) {
      return { rows: [{ exists: this.existingShows.has(params[0] as string) } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.onboarding_scan_manifest set created_show_id")) {
      return { rows: [{ recorded: true } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.onboarding_scan_manifest")) {
      return { rows: [{ updated: true } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.shows_pending_changes")) {
      return { rows: [{ show_id: "show-1" } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.shows")) {
      this.firstSeenApplied.push(params[0] as string);
      return { rows: [{ show_id: "show-first-seen" } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.sync_audit")) {
      return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
    }
    if (n.startsWith("delete from public.pending_syncs")) {
      this.approved = this.approved.filter((r) => r.drive_file_id !== params[0]);
      return { rows: [{ deleted: true } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.wizard_finalize_checkpoints")) {
      if (this.checkpoint) {
        this.checkpoint.status = params[1] as string;
        this.checkpoint.batches_completed += 1;
      }
      return { rows: [this.checkpoint as T], rowCount: this.checkpoint ? 1 : 0 };
    }
    throw new Error(`Unhandled SQL in finalize fake: ${n}`);
  }
}

function fakePipelineTx(db: FakeFinalizeDb): SyncPipelineTx {
  return {
    async queryOne(sqlText: string) {
      const n = sqlText.replace(/\s+/g, " ").trim();
      if (/pg_locks/i.test(n)) return { held: true };
      if (n.startsWith("insert into public.sync_audit")) return { id: "audit-1" };
      throw new Error(`Unhandled SQL in fake pipeline tx: ${n}`);
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
      throw new Error("live partition touched from a wizard finalize");
    },
  } as unknown as SyncPipelineTx;
}

function finalizeDeps(db: FakeFinalizeDb): FinalizeRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => {
      const r = await fn(db);
      order.push("committed");
      return r;
    },
    withRowTx: async (_driveFileId, fn) => fn(db, fakePipelineTx(db)),
    fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
      driveFileId,
      name: `${driveFileId}.xlsx`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-08T12:00:00.000Z",
      parents: ["folder-1"],
    })),
  };
}

describe("onboarding finalize (first-seen) post-commit revalidate", () => {
  test("revalidates the created show AFTER withTx commits; not the existing-show shadow", async () => {
    const db = new FakeFinalizeDb();
    db.approved = [pending("first-seen-1"), pending("existing-1")];
    db.existingShows.add("existing-1");

    const response = await handleOnboardingFinalize(
      new Request("https://x/finalize", { method: "POST" }),
      finalizeDeps(db),
    );
    expect(response.status).toBe(200);
    expect(db.firstSeenApplied).toEqual(["first-seen-1"]);

    // Exactly one revalidate — the first-seen created show. The existing-show row only staged a
    // shadow (no rendered-data write here), so it does NOT revalidate in this route.
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("show-first-seen"), { expire: 0 });
    // Post-commit ordering: revalidate AFTER the withTx `committed`.
    expect(order).toEqual(["committed", `revalidate:${showCacheTag("show-first-seen")}`]);
  });

  test("does NOT revalidate when nothing applied (no approved rows)", async () => {
    const db = new FakeFinalizeDb();
    const response = await handleOnboardingFinalize(
      new Request("https://x/finalize", { method: "POST" }),
      finalizeDeps(db),
    );
    expect(response.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// finalize-cas/route.ts — existing-show shadow apply + publish flip
// ---------------------------------------------------------------------------

const BASE_TS = "2026-05-07T00:00:00.000Z";

function shadowPayload() {
  return {
    parse_result: parseResult("Existing Show"),
    staged_id: "33333333-3333-4333-8333-333333333333",
    staged_modified_time: "2026-05-08T12:00:00.000Z",
    reviewer_choices: [],
    triggered_review_items: [],
    base_modified_time: BASE_TS,
  };
}

class FakeFinalizeCasDb implements FinalizeCasRouteTx {
  activeSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  watchedFolderId: string | null = null;
  checkpoint: { status: string; batches_completed: number } | null = {
    status: "all_batches_complete",
    batches_completed: 1,
  };
  finalizeLocked = true;
  shadowRows: Array<{
    wizard_session_id: string;
    drive_file_id: string;
    show_id: string;
    applied_by_email: string;
    applied_at_intent: string;
    payload: Record<string, unknown>;
  }> = [];
  sessionCreatedDriveIds: string[] = [];
  publishedShowIds: string[] = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const n = sql.replace(/\s+/g, " ").trim();
    if (n.startsWith("select pending_wizard_session_id")) {
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
    if (n.includes("pg_try_advisory_xact_lock(hashtext('finalize:'")) {
      return { rows: [{ locked: this.finalizeLocked } as T], rowCount: 1 };
    }
    if (n.startsWith("select wizard_session_id from public.wizard_finalize_checkpoints")) {
      return { rows: [], rowCount: 0 };
    }
    if (n.startsWith("select status, batches_completed")) {
      return {
        rows: this.checkpoint ? [this.checkpoint as T] : [],
        rowCount: this.checkpoint ? 1 : 0,
      };
    }
    if (n.startsWith("select count(*)::int as approved_count")) {
      return { rows: [{ approved_count: 0 } as T], rowCount: 1 };
    }
    if (n.startsWith("select count(*)::int as unresolved_count")) {
      return { rows: [{ unresolved_count: 0 } as T], rowCount: 1 };
    }
    if (n.startsWith("select m.drive_file_id")) {
      // legacyAmbiguousManifestRows — none.
      return { rows: [], rowCount: 0 };
    }
    if (n.startsWith("select wizard_session_id, drive_file_id, show_id")) {
      return { rows: this.shadowRows as T[], rowCount: this.shadowRows.length };
    }
    if (n.startsWith("select id, last_seen_modified_time, diagrams")) {
      const row = this.shadowRows.find((r) => r.drive_file_id === params[0]);
      return {
        rows: row
          ? [{ id: row.show_id, last_seen_modified_time: BASE_TS, diagrams: null } as T]
          : [],
        rowCount: row ? 1 : 0,
      };
    }
    if (n.startsWith("delete from public.shows_pending_changes")) {
      return { rows: [], rowCount: 0 };
    }
    if (n.startsWith("select drive_file_id from public.onboarding_scan_manifest")) {
      // publishAppliedWizardShows lock-set discovery.
      return {
        rows: this.sessionCreatedDriveIds.map((d) => ({ drive_file_id: d })) as T[],
        rowCount: this.sessionCreatedDriveIds.length,
      };
    }
    if (n.includes("pg_advisory_xact_lock(hashtext('show:'")) {
      return { rows: [], rowCount: 0 };
    }
    if (n.startsWith("update public.shows s set published = true")) {
      return {
        rows: this.publishedShowIds.map((id) => ({ id })) as T[],
        rowCount: this.publishedShowIds.length,
      };
    }
    if (n.startsWith("delete from public.deferred_ingestions")) {
      return { rows: [], rowCount: 0 };
    }
    if (n.startsWith("update public.app_settings")) {
      return { rows: [{ watched_folder_id: "folder-1" } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.wizard_finalize_checkpoints")) {
      return { rows: [{ status: "final_cas_done", batches_completed: 1 } as T], rowCount: 1 };
    }
    throw new Error(`Unhandled SQL in finalize-cas fake: ${n}`);
  }
}

function casPipelineTx(): SyncPipelineTx {
  return {
    async queryOne(sqlText: string) {
      const n = sqlText.replace(/\s+/g, " ").trim();
      if (/pg_locks/i.test(n)) return { held: true };
      if (/select archived/i.test(n) || n.includes("from public.shows")) return { archived: false };
      if (n.startsWith("insert into public.sync_audit")) return { id: "audit-1" };
      return null;
    },
    async applyShowSnapshot() {
      return {
        outcome: "updated" as const,
        showId: "ignored",
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
    async deleteLivePendingIngestion() {},
  } as unknown as SyncPipelineTx;
}

function casDeps(db: FakeFinalizeCasDb): FinalizeCasRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withTx: async (fn) => {
      const r = await fn(db);
      order.push("committed");
      return r;
    },
    withRowTx: async (_driveFileId, fn) => fn(db, casPipelineTx()),
    subscribeToWatchedFolder: vi.fn(async () => undefined),
  };
}

describe("onboarding finalize-cas post-commit revalidate", () => {
  test("revalidates each published first-seen show AFTER withTx commits", async () => {
    const db = new FakeFinalizeCasDb();
    db.sessionCreatedDriveIds = ["fs-1"];
    db.publishedShowIds = ["pub-show-1"];

    const response = await handleOnboardingFinalizeCas(
      new Request("https://x/finalize-cas", { method: "POST" }),
      casDeps(db),
    );
    expect(response.status).toBe(200);

    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("pub-show-1"), { expire: 0 });
    expect(order).toEqual(["committed", `revalidate:${showCacheTag("pub-show-1")}`]);
  });

  test("revalidates an applied existing-show shadow AND the publish flip", async () => {
    const db = new FakeFinalizeCasDb();
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "existing-1",
        show_id: "existing-show-1",
        applied_by_email: "doug@example.com",
        applied_at_intent: "2026-05-08T12:34:56.789Z",
        payload: shadowPayload(),
      },
    ];
    db.sessionCreatedDriveIds = ["fs-1"];
    db.publishedShowIds = ["pub-show-1"];

    const response = await handleOnboardingFinalizeCas(
      new Request("https://x/finalize-cas", { method: "POST" }),
      casDeps(db),
    );
    expect(response.status).toBe(200);

    // Both the existing-show apply and the publish flip revalidate.
    const tags = (revalidateTag as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(tags).toContain(showCacheTag("existing-show-1"));
    expect(tags).toContain(showCacheTag("pub-show-1"));
    // All revalidates fire AFTER the single withTx commit.
    expect(order[0]).toBe("committed");
    expect(order.filter((o) => o === "committed")).toHaveLength(1);
    expect(order.slice(1).every((o) => o.startsWith("revalidate:"))).toBe(true);
  });

  test("does NOT revalidate when there is nothing to apply or publish", async () => {
    const db = new FakeFinalizeCasDb();
    const response = await handleOnboardingFinalizeCas(
      new Request("https://x/finalize-cas", { method: "POST" }),
      casDeps(db),
    );
    expect(response.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  // whole-diff R1 CRITICAL regression guard — mixed-batch PARTIAL commit.
  //
  // Per-row shadow applies commit via their OWN `withRowTx` (independent of the outer
  // result). So a batch where an EARLY row applies (its withRowTx commits, its show id lands
  // in affectedShowIds) AND a LATER row is BLOCKED returns a 409 Response — yet the early
  // show's data DID durably change. The handler MUST revalidate affectedShowIds BEFORE the
  // `if (result instanceof Response) return result` check; otherwise the committed show's data
  // cache stays stale until the 300s TTL backstop.
  //
  // Non-tautological: this FAILS if the revalidate loop sat AFTER the Response check — the 409
  // short-circuits, the early committed show is never revalidated, and the toHaveBeenCalledWith
  // below would not match. The blocked row guarantees the result is a Response, so the only way
  // the committed show gets revalidated is the pre-Response-check loop being correct.
  test("revalidates an EARLY committed show even though a LATER blocked row yields a 409", async () => {
    const db = new FakeFinalizeCasDb();
    // Row order is `order by drive_file_id`, so "aa-early" sorts before "zz-blocked".
    db.shadowRows = [
      {
        wizard_session_id: W1,
        drive_file_id: "aa-early",
        show_id: "committed-show-1",
        applied_by_email: "doug@example.com",
        applied_at_intent: "2026-05-08T12:34:56.789Z",
        payload: shadowPayload(),
      },
      {
        wizard_session_id: W1,
        drive_file_id: "zz-blocked",
        show_id: "blocked-show-1",
        applied_by_email: "doug@example.com",
        applied_at_intent: "2026-05-08T12:34:56.789Z",
        payload: shadowPayload(),
      },
    ];
    // No publish flip in this scenario — isolate the per-row commit guard.
    db.sessionCreatedDriveIds = [];
    db.publishedShowIds = [];

    // The `select id, last_seen_modified_time, diagrams` live-show probe inside applyShadow
    // resolves ONLY for the early row; the blocked row finds no live row → returns
    // STAGED_PARSE_OUTDATED_AT_PHASE_D (code !== "OK") → runFinalizeCas returns the 409.
    const origQuery = db.query.bind(db);
    db.query = async function <T>(sql: string, params: readonly unknown[] = []) {
      const n = sql.replace(/\s+/g, " ").trim();
      if (n.startsWith("select id, last_seen_modified_time, diagrams")) {
        if (params[0] === "aa-early") {
          return {
            rows: [
              { id: "committed-show-1", last_seen_modified_time: BASE_TS, diagrams: null } as T,
            ],
            rowCount: 1,
          };
        }
        // zz-blocked: no live show row → applyShadow blocks this sibling.
        return { rows: [], rowCount: 0 };
      }
      return origQuery<T>(sql, params);
    } as typeof db.query;

    const response = await handleOnboardingFinalizeCas(
      new Request("https://x/finalize-cas", { method: "POST" }),
      casDeps(db),
    );

    // The overall result is a 409 (STAGED_PARSE_OUTDATED_AT_PHASE_D) because zz-blocked failed.
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");

    // CRITICAL: despite the 409, the EARLY committed show IS revalidated with { expire: 0 }.
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("committed-show-1"), { expire: 0 });
    // The blocked sibling never committed, so it is NOT revalidated.
    expect(
      (revalidateTag as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]),
    ).not.toContain(showCacheTag("blocked-show-1"));
  });
});
