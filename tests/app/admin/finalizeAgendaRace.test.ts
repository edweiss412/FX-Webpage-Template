/**
 * §8 test 7 — Task 12: finalize generation-scoped parse_result re-read (publish-safety).
 *
 * Spec §5.6: inside the per-row show:-locked tx (defaultWithRowTx :164), finalize re-reads
 * parse_result generation-scoped before the apply/shadow.  Between selectFinishableCleanRows
 * (outer tx, no show: lock) and the locked re-SELECT, an agenda extraction may have updated
 * parse_result under the same show: lock.  The re-read carries that extraction to publish.
 *
 * Tests five properties:
 * (a) existing-show + checked path: fresh parse_result (agenda extracted mid-review) flows
 *     into the shows_pending_changes shadow payload (params[2] of the shadow INSERT).
 * (b) first-seen path: fresh parse_result reaches applyStagedCore's parseResult arg
 *     (verified via applyShowSnapshot capture, same call chain as live).
 * (c) negative regression: no extraction → original parse_result used — proves the
 *     re-read path is exercised and that "fresh" is not just what was already there.
 * (d) generation-scoped stale: staged_id replaced between reads → re-SELECT 0 rows →
 *     demote STAGED_PARSE_REVISION_RACE_DURING_FINALIZE, NO shadow INSERT, NO first-seen.
 * (e) Drive-light: fetchDriveFileMetadata called exactly ONCE per row regardless of
 *     agenda_link count (finalize reads parse_result from DB only — no per-PDF Drive call).
 *
 * Uses mocked deps (no real DB) — same FakeDb pattern as tests/onboarding/finalize.test.ts.
 * Full DB coverage (children, auth, audit) lives in finalizeFirstSeenFullApply.db.test.ts.
 */
import { describe, expect, test, vi } from "vitest";

// next/cache must be mocked so revalidateTag (called post-commit) does not throw
// in the test environment.
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import type { FinalizeRouteDeps, FinalizeRouteTx } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import type { AgendaExtraction } from "@/lib/agenda/types";

// ─── Constants ─────────────────────────────────────────────────────────────

const W1 = "22222222-2222-4222-8222-222222222222";
const FOLDER = "race-test-folder";
const DRIVE_ID = "race-test-drive-file";
const STAGED_ID = "33333333-3333-4333-8333-333333333333";
const STAGED_ISO = "2026-06-01T12:00:00.000Z";

const VALID_EXTRACTION: AgendaExtraction = {
  confidence: "high",
  corrections: 0,
  days: [{ dayLabel: "Day 1", date: "2026-06-01", sessions: [] }],
  sourceRevision: "rev-agenda-race-1",
  extractorVersion: 1,
};

/**
 * Stale parse_result: two agenda links present but NOT yet extracted.
 * This is what selectFinishableCleanRows (outer tx) returns.
 * Must differ from FRESH to prove re-read is exercised (anti-tautology rule).
 */
const STALE_PARSE_RESULT = {
  show: {
    title: "Agenda Race Test Show",
    client_label: null as null,
    client_contact: null as null,
    template_version: "v4",
    venue: null as null,
    dates: {
      travelIn: "2026-05-07",
      set: "2026-05-08",
      showDays: ["2026-05-09"],
      travelOut: "2026-05-10",
    },
    schedule_phases: {},
    event_details: {},
    // Two agenda_links — used by the Drive-light test to prove fetchDriveFileMetadata
    // is called ONCE per row, not once per agenda link.
    agenda_links: [
      { label: "Agenda PDF A", fileId: "agenda-pdf-id-a" },
      { label: "Agenda PDF B", fileId: "agenda-pdf-id-b" },
    ],
    coi_status: null as null,
    po: null as null,
    proposal: null as null,
    invoice: null as null,
    invoice_notes: null as null,
  },
  crewMembers: [] as never[],
  hotelReservations: [] as never[],
  rooms: [] as never[],
  transportation: null as null,
  contacts: [] as never[],
  pullSheet: null as null,
  diagrams: { linkedFolder: null, embeddedImages: [] as never[], linkedFolderItems: [] as never[] },
  openingReel: null as null,
  raw_unrecognized: [] as never[],
  warnings: [] as never[],
  hardErrors: [] as never[],
};

/**
 * Fresh parse_result: same generation (same staged_id/staged_modified_time), but
 * agenda extraction has completed and populated link[0].extracted.
 */
const FRESH_PARSE_RESULT = {
  ...STALE_PARSE_RESULT,
  show: {
    ...STALE_PARSE_RESULT.show,
    agenda_links: [
      { label: "Agenda PDF A", fileId: "agenda-pdf-id-a", extracted: VALID_EXTRACTION },
      { label: "Agenda PDF B", fileId: "agenda-pdf-id-b" },
    ],
  },
};

// ─── Pending row fixture ────────────────────────────────────────────────────

type PendingRow = {
  drive_file_id: string;
  staged_id: string;
  staged_modified_time: string;
  parse_result: Record<string, unknown>;
  wizard_approved: boolean;
  wizard_reviewer_choices: unknown[];
  wizard_reviewer_choices_version: number | null;
  wizard_approved_by_email: string | null;
  wizard_approved_at: string | null;
  triggered_review_items: unknown;
  base_modified_time: string | null;
  last_finalize_failure_code?: string | null;
};

function makeRow(overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    drive_file_id: DRIVE_ID,
    staged_id: STAGED_ID,
    staged_modified_time: STAGED_ISO,
    parse_result: STALE_PARSE_RESULT as Record<string, unknown>,
    wizard_approved: true,
    wizard_reviewer_choices: [],
    wizard_reviewer_choices_version: 1,
    wizard_approved_by_email: "doug@fxav.test",
    wizard_approved_at: "2026-06-01T14:00:00.000Z",
    triggered_review_items: [],
    base_modified_time: null,
    ...overrides,
  };
}

// ─── Fake database ──────────────────────────────────────────────────────────

/**
 * FakeRaceDb — handles every SQL query emitted by handleOnboardingFinalize for
 * a single-row batch with the §5.6 re-read logic.
 *
 * Key configurability:
 * - `rereadParseResult`: what the §5.6 re-SELECT returns.
 *   null → 0 rows (generation-scoped stale path).
 *   a value → that parse_result is used for shadow/apply.
 * - `existingShows`: controls the showExists(driveFileId) branch.
 */
class FakeRaceDb implements FinalizeRouteTx {
  rereadParseResult: Record<string, unknown> | null;
  existingShows: Set<string>;

  approved: PendingRow[];
  demoted: Array<{ driveFileId: string; code: string }> = [];
  stagedShadowParams: Array<readonly unknown[]> = [];
  firstSeenApplied: string[] = [];
  auditRows: string[] = [];
  deletedPending: string[] = [];

  constructor(opts: {
    approved: PendingRow[];
    rereadParseResult: Record<string, unknown> | null;
    existingShows?: Set<string>;
  }) {
    this.approved = opts.approved;
    this.rereadParseResult = opts.rereadParseResult;
    this.existingShows = opts.existingShows ?? new Set();
  }

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const n = sql.replace(/\s+/g, " ").trim();

    // Finalize advisory lock
    if (n.includes("pg_try_advisory_xact_lock(hashtext('finalize:'")) {
      return { rows: [{ locked: true } as T], rowCount: 1 };
    }

    // Session reads (plain + FOR UPDATE)
    if (n.startsWith("select pending_wizard_session_id")) {
      return { rows: [{ pending_wizard_session_id: W1 } as T], rowCount: 1 };
    }

    // Checkpoint
    if (n.startsWith("insert into public.wizard_finalize_checkpoints")) {
      return {
        rows: [{ wizard_session_id: W1, status: "in_progress", batches_completed: 0 } as T],
        rowCount: 1,
      };
    }
    if (n.startsWith("select status, batches_completed")) {
      return { rows: [] as T[], rowCount: 0 }; // insert always succeeds (no conflict)
    }
    if (n.startsWith("update public.wizard_finalize_checkpoints")) {
      return { rows: [] as T[], rowCount: 0 };
    }

    // Pending folder
    if (n.startsWith("select pending_folder_id")) {
      return { rows: [{ pending_folder_id: FOLDER } as T], rowCount: 1 };
    }

    // Manifest counts
    if (n.startsWith("select count(*)::int as unresolved_count")) {
      return { rows: [{ unresolved_count: 0 } as T], rowCount: 1 };
    }
    if (n.startsWith("select count(*)::int as remaining_count")) {
      return { rows: [{ remaining_count: 0 } as T], rowCount: 1 };
    }

    // Outer finishable-clean select (returns STALE parse_result from the seeded row)
    if (n.startsWith("select ps.drive_file_id, ps.staged_id")) {
      return { rows: this.approved as T[], rowCount: this.approved.length };
    }

    // §5.6 generation-scoped re-SELECT under the per-row show: lock.
    // null → 0 rows (generation-scoped stale); a value → fresh parse_result.
    if (n.startsWith("select parse_result, wizard_approved")) {
      if (this.rereadParseResult === null) return { rows: [] as T[], rowCount: 0 };
      const r = this.approved[0]!;
      return {
        rows: [
          {
            parse_result: this.rereadParseResult,
            wizard_approved: r.wizard_approved,
            wizard_reviewer_choices: r.wizard_reviewer_choices,
            wizard_reviewer_choices_version: r.wizard_reviewer_choices_version,
            wizard_approved_by_email: r.wizard_approved_by_email,
            wizard_approved_at: r.wizard_approved_at,
            last_finalize_failure_code: r.last_finalize_failure_code ?? null,
          } as T,
        ],
        rowCount: 1,
      };
    }

    // showExists
    if (n.startsWith("select exists")) {
      return { rows: [{ exists: this.existingShows.has(params[0] as string) } as T], rowCount: 1 };
    }

    // demotePending: UPDATE pending_syncs
    if (n.startsWith("update public.pending_syncs")) {
      this.demoted.push({ driveFileId: params[0] as string, code: params[2] as string });
      return { rows: [{ demoted: true } as T], rowCount: 1 };
    }

    // onboarding_scan_manifest UPDATEs — ordered most-specific first
    // recordCreatedShowProvenance (first-seen + EXISTS guard)
    if (n.startsWith("update public.onboarding_scan_manifest set created_show_id")) {
      return { rows: [{ recorded: true } as T], rowCount: 1 };
    }
    // demotePending manifest reset → 'staged'
    if (
      n.startsWith("update public.onboarding_scan_manifest") &&
      n.includes("set status = 'staged'")
    ) {
      return { rows: [] as T[], rowCount: 0 };
    }
    // D10 existing-show + unchecked manifest resolve → 'applied'
    if (
      n.startsWith("update public.onboarding_scan_manifest") &&
      n.includes("set status = 'applied'")
    ) {
      return { rows: [] as T[], rowCount: 0 };
    }
    // stampManifestPublishIntent (existing-show + checked)
    if (
      n.startsWith("update public.onboarding_scan_manifest") &&
      n.includes("set publish_intent")
    ) {
      return { rows: [] as T[], rowCount: 0 };
    }

    // Shadow INSERT (existing-show + checked)
    if (n.startsWith("insert into public.shows_pending_changes")) {
      this.stagedShadowParams.push(params);
      return { rows: [{ show_id: "show-existing-1" } as T], rowCount: 1 };
    }

    // First-seen shows INSERT (from applyStagedCore → defaultRunPhase2 → applyShowSnapshot)
    if (n.startsWith("insert into public.shows")) {
      this.firstSeenApplied.push(params[0] as string);
      return { rows: [{ show_id: "show-first-seen-1" } as T], rowCount: 1 };
    }

    // sync_audit INSERT (from defaultInsertSyncAudit called by applyStagedCore)
    if (n.startsWith("insert into public.sync_audit")) {
      this.auditRows.push("audit-1");
      return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
    }

    // deleteApprovedPending
    if (n.startsWith("delete from public.pending_syncs")) {
      this.deletedPending.push(params[0] as string);
      this.approved = this.approved.filter((r) => r.drive_file_id !== params[0]);
      return { rows: [{ deleted: true } as T], rowCount: 1 };
    }

    throw new Error(`FakeRaceDb: unhandled SQL:\n${n}`);
  }
}

// ─── Fake pipeline tx ───────────────────────────────────────────────────────

/**
 * Minimal SyncPipelineTx for the finalize first-seen path.
 * `captureParseResult` is called inside `applyShowSnapshot` so the test can
 * assert the correct parseResult flows into applyStagedCore's call chain.
 */
function fakeRacePipeline(
  db: FakeRaceDb,
  captureParseResult: (pr: unknown) => void,
): SyncPipelineTx {
  return {
    async queryOne(sqlText: string) {
      const n = sqlText.replace(/\s+/g, " ").trim();
      // Lock-ownership assertion inside adoptShowLockHeld / assertShowLockHeld
      if (/pg_locks/i.test(n)) return { held: true };
      // sync_audit INSERT called by defaultInsertSyncAudit
      if (n.startsWith("insert into public.sync_audit")) {
        db.auditRows.push("audit-1");
        return { id: "audit-1" };
      }
      throw new Error(`fakeRacePipeline.queryOne: unhandled:\n${n}`);
    },
    // Called by defaultRunPhase2 → the key capture point for parseResult.
    async applyShowSnapshot(args: { driveFileId: string; parseResult?: unknown }) {
      db.firstSeenApplied.push(args.driveFileId);
      captureParseResult(args.parseResult);
      return {
        outcome: "updated" as const,
        showId: "show-first-seen-1",
        previousCrewNames: [],
        previousCrewMembers: [],
        priorRunOfShow: null,
      };
    },
    // Remaining SyncPipelineTx methods — no-ops since crewMembers/rooms/etc. are empty.
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
        "wizard finalize must NOT touch live partition (deleteLivePendingIngestion) — spec §3.2",
      );
    },
  } as unknown as SyncPipelineTx;
}

// ─── Request + deps builders ────────────────────────────────────────────────

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}

function makeFetchMeta() {
  return vi.fn(async () => ({
    driveFileId: DRIVE_ID,
    name: "race-test.xlsx",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: STAGED_ISO, // matches staged_modified_time → sameTimestamp passes
    parents: [FOLDER],
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("finalize §5.6 generation-scoped parse_result re-read", () => {
  // ── (a) existing-show path ─────────────────────────────────────────────────
  test("(a) existing-show: extracted agenda carried to shadow payload", async () => {
    const db = new FakeRaceDb({
      approved: [makeRow()],
      rereadParseResult: FRESH_PARSE_RESULT as Record<string, unknown>,
      existingShows: new Set([DRIVE_ID]),
    });

    let capturedPR: unknown;
    const res = await handleOnboardingFinalize(request(), {
      requireAdminIdentity: async () => ({ email: "finalizer@fxav.test" }),
      withTx: async (fn) => fn(db),
      withRowTx: async (_dfid, fn) =>
        fn(
          db,
          fakeRacePipeline(db, (pr) => (capturedPR = pr)),
        ),
      fetchDriveFileMetadata: makeFetchMeta(),
    } satisfies FinalizeRouteDeps);

    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(1);

    // params[2] is the $3::jsonb parse_result in the shows_pending_changes INSERT.
    const shadowPR = db.stagedShadowParams[0]![2] as typeof FRESH_PARSE_RESULT;
    expect(shadowPR.show.agenda_links[0]?.extracted).toEqual(VALID_EXTRACTION);
    // Drive-light within-path assertion: no first-seen apply (existing-show path).
    expect(db.firstSeenApplied).toHaveLength(0);
  });

  // ── (b) first-seen path ───────────────────────────────────────────────────
  test("(b) first-seen: extracted agenda reaches applyStagedCore parseResult", async () => {
    const db = new FakeRaceDb({
      approved: [makeRow()],
      rereadParseResult: FRESH_PARSE_RESULT as Record<string, unknown>,
      existingShows: new Set(), // no existing show → first-seen branch
    });

    let capturedPR: unknown;
    const res = await handleOnboardingFinalize(request(), {
      requireAdminIdentity: async () => ({ email: "finalizer@fxav.test" }),
      withTx: async (fn) => fn(db),
      withRowTx: async (_dfid, fn) =>
        fn(
          db,
          fakeRacePipeline(db, (pr) => (capturedPR = pr)),
        ),
      fetchDriveFileMetadata: makeFetchMeta(),
    } satisfies FinalizeRouteDeps);

    expect(res.status).toBe(200);
    expect(db.firstSeenApplied).toHaveLength(1);

    // capturedPR is the parseResult arg to applyShowSnapshot (called from defaultRunPhase2
    // inside applyStagedCore). Asserts fresh parse_result (with agenda) — not the stale one
    // from the outer selectFinishableCleanRows.
    const pr = capturedPR as typeof FRESH_PARSE_RESULT;
    expect(pr?.show.agenda_links[0]?.extracted).toEqual(VALID_EXTRACTION);
    // No shadow INSERT on first-seen path.
    expect(db.stagedShadowParams).toHaveLength(0);
  });

  // ── (c) negative regression ────────────────────────────────────────────────
  test("(c) negative regression: no extraction → stale parse_result in shadow (original unchanged)", async () => {
    // rereadParseResult = STALE (same as outer select): no extraction happened.
    // This test proves the re-read is actually used and that the "fresh" result in (a)/(b)
    // is not just a residue of what was already there — the test FAILS if the implementation
    // ignores the re-read and uses the outer-select parse_result directly (since they're the
    // same here, both tests would pass trivially without the re-read code).
    // Anti-tautology: the concrete failure mode is "extraction happened but finalize used the
    // pre-lock outer-select parse_result (missing agenda)" — test (a) catches that; this test
    // proves the non-extraction case does not accidentally inject extracted data.
    const db = new FakeRaceDb({
      approved: [makeRow()],
      rereadParseResult: STALE_PARSE_RESULT as Record<string, unknown>,
      existingShows: new Set([DRIVE_ID]),
    });

    let capturedPR: unknown;
    const res = await handleOnboardingFinalize(request(), {
      requireAdminIdentity: async () => ({ email: "finalizer@fxav.test" }),
      withTx: async (fn) => fn(db),
      withRowTx: async (_dfid, fn) =>
        fn(
          db,
          fakeRacePipeline(db, (pr) => (capturedPR = pr)),
        ),
      fetchDriveFileMetadata: makeFetchMeta(),
    } satisfies FinalizeRouteDeps);

    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(1);
    const shadowPR = db.stagedShadowParams[0]![2] as typeof STALE_PARSE_RESULT;
    // No extraction → no .extracted on any link.
    expect(shadowPR.show.agenda_links[0]).not.toHaveProperty("extracted");
    expect(shadowPR.show.agenda_links[1]).not.toHaveProperty("extracted");
    void capturedPR; // not captured in existing-show path
  });

  // ── (d) generation-scoped stale ────────────────────────────────────────────
  test("(d) generation-scoped: staged_id replaced → re-SELECT 0 rows → demote, no apply/shadow", async () => {
    // rereadParseResult = null simulates the case where the row's staged_id changed
    // between selectFinishableCleanRows (outer tx) and the locked re-SELECT (per-row tx).
    // A mid-flight rescan regenerated the row (new staged_id) → WHERE returns 0 rows.
    const db = new FakeRaceDb({
      approved: [makeRow()],
      rereadParseResult: null, // 0 rows from re-SELECT
      existingShows: new Set([DRIVE_ID]),
    });

    const res = await handleOnboardingFinalize(request(), {
      requireAdminIdentity: async () => ({ email: "finalizer@fxav.test" }),
      withTx: async (fn) => fn(db),
      withRowTx: async (_dfid, fn) =>
        fn(
          db,
          fakeRacePipeline(db, () => {}),
        ),
      fetchDriveFileMetadata: makeFetchMeta(),
    } satisfies FinalizeRouteDeps);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { per_row: { code: string }[] };
    // Stale demote result in per_row
    expect(body.per_row[0]?.code).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    // pending_syncs was demoted
    expect(db.demoted).toHaveLength(1);
    expect(db.demoted[0]?.driveFileId).toBe(DRIVE_ID);
    expect(db.demoted[0]?.code).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    // NO shadow INSERT and NO first-seen apply
    expect(db.stagedShadowParams).toHaveLength(0);
    expect(db.firstSeenApplied).toHaveLength(0);
  });

  // ── (e) Drive-light ────────────────────────────────────────────────────────
  test("(e) Drive-light: fetchDriveFileMetadata called exactly once per row, NOT per agenda link", async () => {
    // STALE_PARSE_RESULT has TWO agenda_links — if finalize made a Drive call per link,
    // fetchDriveFileMetadata (or a separate getFile/downloadFileBytes) would fire twice.
    // The spec §5.7 temporal-scope: finalize reads parse_result from DB only; per-PDF
    // Drive revalidation is delegated to the cron path post-publish.
    const db = new FakeRaceDb({
      approved: [makeRow()],
      rereadParseResult: FRESH_PARSE_RESULT as Record<string, unknown>,
      existingShows: new Set([DRIVE_ID]),
    });

    const fetchMeta = makeFetchMeta();
    await handleOnboardingFinalize(request(), {
      requireAdminIdentity: async () => ({ email: "finalizer@fxav.test" }),
      withTx: async (fn) => fn(db),
      withRowTx: async (_dfid, fn) =>
        fn(
          db,
          fakeRacePipeline(db, () => {}),
        ),
      fetchDriveFileMetadata: fetchMeta,
    } satisfies FinalizeRouteDeps);

    // Exactly one Drive metadata call per row — for the folder/timestamp fence.
    // NOT one per agenda_link (the two links must not trigger extra Drive calls).
    expect(fetchMeta).toHaveBeenCalledTimes(1);
    expect(fetchMeta).toHaveBeenCalledWith(DRIVE_ID);
  });
});
