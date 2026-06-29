/**
 * Spec §8 — finalize approval-decision race (BL-FINALIZE-APPROVAL-DECISION-RACE).
 *
 * selectFinishableCleanRows (outer tx, NO show: lock) reads approval columns at
 * select time; a concurrent approve/unapprove that commits before finalize's
 * per-row show: lock changes those columns WITHOUT bumping staged_modified_time.
 * The widened locked re-read (Task 1) + coercedRow re-point (Task 2) make finalize
 * drive the 4-branch from the LOCKED values, honoring the latest checkbox intent.
 *
 * The fake re-read returns decision columns from `rereadDecision`, deliberately
 * DIFFERENT from the outer-select row, so a regression that reads the stale `row.*`
 * fails (anti-tautology: assertions are against the re-read values, not the outer row).
 */
import { describe, expect, test, vi } from "vitest";

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

const W1 = "22222222-2222-4222-8222-222222222222";
const FOLDER = "race-folder";
const DRIVE_ID = "race-drive-file";
const STAGED_ID = "33333333-3333-4333-8333-333333333333";
const STAGED_ISO = "2026-06-01T12:00:00.000Z";

const PARSE_RESULT = {
  show: {
    title: "Approval Race Show",
    client_label: null,
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
};

type Decision = {
  wizard_approved: boolean;
  wizard_reviewer_choices: unknown[];
  wizard_reviewer_choices_version: number | null;
  wizard_approved_by_email: string | null;
  wizard_approved_at: string | null;
  last_finalize_failure_code: string | null;
};

type PendingRow = Decision & {
  drive_file_id: string;
  staged_id: string;
  staged_modified_time: string;
  parse_result: Record<string, unknown>;
  triggered_review_items: unknown;
  base_modified_time: string | null;
};

// CHECKED (approved) decision — the wizard's "publish" intent.
const CHECKED: Decision = {
  wizard_approved: true,
  wizard_reviewer_choices: [],
  wizard_reviewer_choices_version: 1,
  wizard_approved_by_email: "doug@fxav.test",
  wizard_approved_at: "2026-06-01T14:00:00.000Z",
  last_finalize_failure_code: null,
};
// UNCHECKED decision — the wizard's "leave Held" intent.
const UNCHECKED: Decision = {
  wizard_approved: false,
  wizard_reviewer_choices: [],
  wizard_reviewer_choices_version: null,
  wizard_approved_by_email: null,
  wizard_approved_at: null,
  last_finalize_failure_code: null,
};

function makeRow(decision: Decision): PendingRow {
  return {
    drive_file_id: DRIVE_ID,
    staged_id: STAGED_ID,
    staged_modified_time: STAGED_ISO,
    parse_result: PARSE_RESULT as Record<string, unknown>,
    triggered_review_items: [],
    base_modified_time: null,
    ...decision,
  };
}

class FakeDb implements FinalizeRouteTx {
  outer: PendingRow; // what selectFinishableCleanRows returns (select-time)
  reread: Decision | null; // locked re-read decision; null → 0 rows (generation-stale)
  existingShows: Set<string>;
  demoted: Array<{ driveFileId: string; code: string }> = [];
  stagedShadowParams: Array<readonly unknown[]> = [];
  firstSeenApplied: string[] = [];
  provenanceApproved: boolean[] = [];
  deletedPending: string[] = [];

  constructor(opts: { outer: Decision; reread: Decision | null; existingShows?: Set<string> }) {
    this.outer = makeRow(opts.outer);
    this.reread = opts.reread;
    this.existingShows = opts.existingShows ?? new Set();
  }

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const n = sql.replace(/\s+/g, " ").trim();
    if (n.includes("pg_try_advisory_xact_lock(hashtext('finalize:'"))
      return { rows: [{ locked: true } as T], rowCount: 1 };
    if (n.startsWith("select pending_wizard_session_id"))
      return { rows: [{ pending_wizard_session_id: W1 } as T], rowCount: 1 };
    if (n.startsWith("insert into public.wizard_finalize_checkpoints"))
      return {
        rows: [{ wizard_session_id: W1, status: "in_progress", batches_completed: 0 } as T],
        rowCount: 1,
      };
    if (n.startsWith("select status, batches_completed")) return { rows: [] as T[], rowCount: 0 };
    if (n.startsWith("update public.wizard_finalize_checkpoints"))
      return { rows: [] as T[], rowCount: 0 };
    if (n.startsWith("select pending_folder_id"))
      return { rows: [{ pending_folder_id: FOLDER } as T], rowCount: 1 };
    if (n.startsWith("select count(*)::int as unresolved_count"))
      return { rows: [{ unresolved_count: 0 } as T], rowCount: 1 };
    if (n.startsWith("select count(*)::int as remaining_count"))
      return { rows: [{ remaining_count: 0 } as T], rowCount: 1 };
    // outer finishable-clean select
    if (n.startsWith("select ps.drive_file_id, ps.staged_id"))
      return { rows: [this.outer as T], rowCount: 1 };
    // widened locked re-read
    if (n.startsWith("select parse_result, wizard_approved")) {
      if (this.reread === null) return { rows: [] as T[], rowCount: 0 };
      return {
        rows: [
          {
            parse_result: this.outer.parse_result,
            wizard_approved: this.reread.wizard_approved,
            wizard_reviewer_choices: this.reread.wizard_reviewer_choices,
            wizard_reviewer_choices_version: this.reread.wizard_reviewer_choices_version,
            wizard_approved_by_email: this.reread.wizard_approved_by_email,
            wizard_approved_at: this.reread.wizard_approved_at,
            last_finalize_failure_code: this.reread.last_finalize_failure_code,
          } as T,
        ],
        rowCount: 1,
      };
    }
    if (n.startsWith("select exists"))
      return { rows: [{ exists: this.existingShows.has(params[0] as string) } as T], rowCount: 1 };
    if (n.startsWith("update public.pending_syncs")) {
      this.demoted.push({ driveFileId: params[0] as string, code: params[2] as string });
      return { rows: [{ demoted: true } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.onboarding_scan_manifest set created_show_id")) {
      // recordCreatedShowProvenance: `set created_show_id = $3::uuid, publish_intent = $4`.
      // params[3] is publishIntent = coercedRow.wizard_approved — the locked publish decision.
      this.provenanceApproved.push(params[3] as boolean);
      return { rows: [{ recorded: true } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.onboarding_scan_manifest"))
      return { rows: [] as T[], rowCount: 0 };
    if (n.startsWith("insert into public.shows_pending_changes")) {
      this.stagedShadowParams.push(params);
      return { rows: [{ show_id: "show-existing-1" } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.shows")) {
      this.firstSeenApplied.push(params[0] as string);
      return { rows: [{ show_id: "show-first-seen-1" } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.sync_audit"))
      return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
    if (n.startsWith("delete from public.pending_syncs")) {
      this.deletedPending.push(params[0] as string);
      return { rows: [{ deleted: true } as T], rowCount: 1 };
    }
    throw new Error(`FakeDb unhandled SQL:\n${n}`);
  }
}

function fakePipeline(db: FakeDb): SyncPipelineTx {
  return {
    async queryOne(sqlText: string) {
      const n = sqlText.replace(/\s+/g, " ").trim();
      if (/pg_locks/i.test(n)) return { held: true };
      if (n.startsWith("insert into public.sync_audit")) return { id: "audit-1" };
      throw new Error(`fakePipeline.queryOne unhandled:\n${n}`);
    },
    async applyShowSnapshot(args: { driveFileId: string }) {
      db.firstSeenApplied.push(args.driveFileId);
      return {
        outcome: "updated" as const,
        showId: "show-first-seen-1",
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
      throw new Error("wizard finalize must NOT touch live partition");
    },
  } as unknown as SyncPipelineTx;
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}
function fetchMeta() {
  return vi.fn(async () => ({
    driveFileId: DRIVE_ID,
    name: "race.xlsx",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: STAGED_ISO,
    parents: [FOLDER],
  }));
}
function deps(db: FakeDb): FinalizeRouteDeps {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.test" }),
    withTx: async (fn) => fn(db),
    withRowTx: async (_dfid, fn) => fn(db, fakePipeline(db)),
    fetchDriveFileMetadata: fetchMeta(),
  } satisfies FinalizeRouteDeps;
}

describe("finalize approval-decision race (§8)", () => {
  // 8.1 — Doug UNCHECKS after select; finalize must NOT publish.
  test("8.1 checked→unchecked: existing-show D10 NO-OP, no shadow, not published", async () => {
    const db = new FakeDb({
      outer: CHECKED,
      reread: UNCHECKED,
      existingShows: new Set([DRIVE_ID]),
    });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(0); // unchecked existing-show = NO shadow
    expect(db.firstSeenApplied).toHaveLength(0);
  });

  test("8.1b checked→unchecked first-seen: created HELD (publish_intent=false)", async () => {
    const db = new FakeDb({ outer: CHECKED, reread: UNCHECKED, existingShows: new Set() });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.firstSeenApplied).toHaveLength(1);
    expect(db.provenanceApproved).toEqual([false]); // Held, not published
  });

  // 8.2 — Doug CHECKS after select; finalize must publish, using locked provenance.
  test("8.2 unchecked→checked existing-show: shadow staged (published)", async () => {
    const db = new FakeDb({
      outer: UNCHECKED,
      reread: CHECKED,
      existingShows: new Set([DRIVE_ID]),
    });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(1); // checked existing-show stages a shadow
  });

  test("8.2b unchecked→checked first-seen: provenance approved=true (published)", async () => {
    const db = new FakeDb({ outer: UNCHECKED, reread: CHECKED, existingShows: new Set() });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.firstSeenApplied).toHaveLength(1);
    expect(db.provenanceApproved).toEqual([true]);
  });

  // 8.3 — no concurrent change: behaves as plain checked (proves re-read is the source).
  test("8.3 negative regression: no race → checked path unchanged", async () => {
    const db = new FakeDb({ outer: CHECKED, reread: CHECKED, existingShows: new Set([DRIVE_ID]) });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(1);
  });

  // 8.5 — locked decision (with a DISTINCT approver email) drives the checked publish.
  // outer is UNCHECKED (email null); locked is CHECKED with a distinct email. If the 4-branch
  // read the stale `row`, it would take the unchecked path (provenanceApproved=[false]). Reading
  // the locked row takes the checked path, and requireApprovedByEmail(coercedRow) reads the
  // LOCKED email (a stale-null email on a "checked" misread would instead throw). The exact
  // applied_by_email value in sync_audit is covered by the .db.test.ts family (real DB).
  test("8.5 locked checked decision (distinct approver) → published, not the stale unchecked", async () => {
    const db = new FakeDb({
      outer: { ...UNCHECKED },
      reread: { ...CHECKED, wizard_approved_by_email: "locked-approver@fxav.test" },
      existingShows: new Set(),
    });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.firstSeenApplied).toHaveLength(1);
    expect(db.provenanceApproved).toEqual([true]); // locked-checked publish, not stale-unchecked Held
  });

  // 8.4 — guard-behavior unit test (forced; §3.2 documents no current writer reaches
  // this at the same generation). A non-finishable locked row must SKIP, not Hold.
  test("8.4 non-finishable locked row → skip (no publish, no Held, demote)", async () => {
    const db = new FakeDb({
      outer: CHECKED,
      reread: { ...UNCHECKED, last_finalize_failure_code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" },
      existingShows: new Set(),
    });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { per_row: { code: string }[] };
    expect(body.per_row[0]?.code).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(db.demoted.map((d) => d.code)).toContain("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(db.stagedShadowParams).toHaveLength(0);
    expect(db.firstSeenApplied).toHaveLength(0);
  });
});
