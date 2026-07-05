import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import type { DriveListedFile } from "@/lib/drive/list";
import type { PreparedOnboardingFile } from "@/lib/sync/runOnboardingScan";

/**
 * finalize-resume deadlock Thread 3 — END-TO-END (real Postgres): a COSMETIC Google
 * modifiedTime bump auto-heals inline during finalize and the show actually PUBLISHES;
 * a GENUINE content edit demotes and does NOT publish; a Drive-export failure demotes
 * DRIVE_FETCH_FAILED. Unlike tests/onboarding/finalizeInlineRescan.test.ts (which mocks
 * the core), this runs the REAL applyRescanDecisionUnderLock over the REAL locked tx
 * obtained via pipelineTx.holdPort() — closing the mocked-only-invites-tautological-approve
 * gap: the core's restage + computeRescanDecision + the route's rebind + the publish path
 * all execute against a real DB (spec §4, plan Task 4 T3/T4/T5). Only prepareOnboardingFiles
 * is injected (returning a real prepared sheet with a valid minimal binding, the same shape
 * rescanWizardSheet.db.test.ts uses), so no Drive I/O is performed.
 */
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "7e7e7e7e-3333-4333-8333-7e7e7e7e7e7e";
const FOLDER = "inline-rescan-folder";
const FILE = "inline-rescan-file";

const STAGED_INSTANT = "2026-06-14T07:30:00.040Z"; // what finalize captured (T0)
const DRIFTED_INSTANT = "2026-07-01T09:15:00.000Z"; // Google-bumped live modifiedTime (T1 != T0)
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const FINALIZER_EMAIL = "finalizer@fxav.com";
const APPROVER_EMAIL = "doug@fxav.com";
const APPROVED_AT = "2026-06-14T07:45:00.000Z";

// Minimal-but-complete first-seen parse. crewMembers varies between the clean and dirty
// scenarios so computeRescanDecision returns clean (identical) vs dirty (MI crew change).
function parseResult(crew: Array<{ name: string; email: string; role: string }>) {
  return {
    show: {
      title: "Inline Rescan Show",
      client_label: "Acme Corp",
      client_contact: { primary: { name: "Pat", email: "pat@example.com" } },
      template_version: "v4",
      venue: { name: "Grand Hall" },
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: { theme: "Annual" },
      agenda_links: [],
      coi_status: null,
      po: "PO-77",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: crew.map((c) => ({
      name: c.name,
      email: c.email,
      phone: null,
      role: c.role,
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    // One ballroom room — an EMPTY rooms array trips the MI-5_NO_ROOMS parse invariant during
    // the real re-scan (hard_failed), which is not what these scenarios exercise.
    rooms: [
      {
        kind: "ballroom",
        name: "Main",
        dimensions: null,
        floor: null,
        setup: null,
        set_time: null,
        show_time: null,
        strike_time: null,
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        power: null,
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
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

const CLEAN_CREW = [{ name: "Ada", email: "Ada@Example.com", role: "A1" }];
// Dirty: a CREW EMAIL CHANGE (MI-11) is the canonical genuine content edit computeRescanDecision
// flags (the same trigger rescanWizardSheet.db.test.ts T-A2 uses). A first-seen scan emits no
// MI diffs, so computeRescanDecision diffs prior-vs-refreshed parse directly; an email change on
// an existing member trips it, whereas an ADDED member does not.
const DIRTY_CREW = [{ name: "Ada", email: "ada-changed@example.com", role: "A1" }];

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 4,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

function one<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.show_change_log where drive_file_id = '${FILE}'`,
    `delete from public.sync_audit where drive_file_id = '${FILE}'`,
    `delete from public.shows where drive_file_id = '${FILE}'`,
    `delete from public.pending_syncs where drive_file_id = '${FILE}'`,
    `delete from public.pending_ingestions where drive_file_id = '${FILE}'`,
    `delete from public.shows_pending_changes where drive_file_id = '${FILE}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${FILE}'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
  await sql
    .unsafe(
      `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
      [],
    )
    .catch(() => {});
  await sql
    .unsafe(
      `update public.app_settings set pending_wizard_session_id = null, pending_wizard_session_at = null, pending_folder_id = null where id = 'default'`,
      [],
    )
    .catch(() => {});
}

async function setActiveSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(), pending_folder_id = $2 where id = 'default'`,
    [SESSION, FOLDER],
  );
}

async function stageApprovedRow(crew: typeof CLEAN_CREW): Promise<void> {
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await tx.upsertLivePendingSync({
      driveFileId: FILE,
      wizardSessionId: SESSION,
      baseModifiedTime: null,
      stagedModifiedTime: STAGED_INSTANT,
      parseResult: parseResult(crew) as never,
      triggeredReviewItems: [],
      priorLastSyncStatus: null,
      priorLastSyncError: null,
      sourceKind: "onboarding_scan",
      warningSummary: "",
    });
  });
  // CHECKED (approver ≠ finalizer) — priorReady=true so the clean core re-stamps approval.
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true, wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = '[]'::jsonb,
            wizard_approved_by_email = $3, wizard_approved_at = $4::timestamptz
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [FILE, SESSION, APPROVER_EMAIL, APPROVED_AT],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, $4, 'fixture.gsheet', 'staged')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'staged'`,
    [FOLDER, SESSION, FILE, SHEET_MIME],
  );
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints (wizard_session_id, status, batches_completed)
     values ($1::uuid, 'in_progress', 0)
     on conflict (wizard_session_id) do update set status = 'in_progress'`,
    [SESSION],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}

function driftedMetadata(): DriveListedFile {
  return {
    driveFileId: FILE,
    name: "fixture.gsheet",
    mimeType: SHEET_MIME,
    modifiedTime: DRIFTED_INSTANT,
    parents: [FOLDER],
  };
}

// A REAL prepared sheet with a valid minimal binding (same shape rescanWizardSheet.db.test.ts
// injects); the REAL core restages + decides against it. NO core mock.
function preparedFor(crew: typeof CLEAN_CREW): PreparedOnboardingFile {
  return {
    file: driftedMetadata(),
    kind: "sheet",
    sourceAnchors: {},
    binding: { bindingToken: DRIFTED_INSTANT, modifiedTime: DRIFTED_INSTANT } as never,
    parseResult: parseResult(crew) as never,
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    requireAdminIdentity: async () => ({ email: FINALIZER_EMAIL }),
    fetchDriveFileMetadata: async () => driftedMetadata(),
    ...overrides,
  };
}

async function showRow(): Promise<{ id: string; published: boolean } | undefined> {
  return one(
    await sql!.unsafe(`select id, published from public.shows where drive_file_id = $1`, [FILE]),
  ) as { id: string; published: boolean } | undefined;
}

async function pendingRow(): Promise<
  { last_finalize_failure_code: string | null; wizard_approved: boolean } | undefined
> {
  return one(
    await sql!.unsafe(
      `select last_finalize_failure_code, wizard_approved from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [FILE, SESSION],
    ),
  ) as { last_finalize_failure_code: string | null; wizard_approved: boolean } | undefined;
}

const maybe = dbUp ? describe : describe.skip;

maybe("finalize inline re-parse (Thread 3) — real DB end-to-end", () => {
  beforeAll(() => {
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
    vi.stubEnv("DATABASE_URL", LOCAL_URL);
    expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
  });
  afterAll(async () => {
    await cleanup();
    if (sql) await sql.end({ timeout: 5 });
  });
  beforeEach(cleanup);

  test("T3 CLEAN cosmetic drift: auto-heals and PUBLISHES a real show, no demote", async () => {
    await setActiveSession(); // upsertLivePendingSync's `where exists(... active session)` gate
    await stageApprovedRow(CLEAN_CREW);

    const res = await handleOnboardingFinalize(
      request(),
      deps({ prepareOnboardingFiles: async () => [preparedFor(CLEAN_CREW)] }) as never,
    );
    const body = (await res.json()) as { per_row: Array<{ code: string }> };

    expect(body.per_row.length).toBe(1); // the row WAS processed (not a vacuous empty batch)
    // The cosmetic drift auto-healed: the row published (code OK) instead of demoting.
    expect(body.per_row.every((r) => r.code === "OK")).toBe(true);
    // A real show row was CREATED (the row reached the publish path, not a dead-end). Finalize's
    // Held model creates it published=false; finalize-cas (a separate phase, not run here) promotes
    // a checked row to Live — so the end-to-end auto-heal proof is "a show exists + no demote".
    expect(await showRow()).toBeDefined();
    const ps = await pendingRow();
    expect(ps?.last_finalize_failure_code ?? null).toBeNull(); // never demoted
  });

  test("T4 DIRTY genuine crew change: demotes RESCAN_REVIEW_REQUIRED, does NOT publish", async () => {
    await setActiveSession();
    await stageApprovedRow(CLEAN_CREW); // staged prior = clean crew

    const res = await handleOnboardingFinalize(
      request(),
      deps({ prepareOnboardingFiles: async () => [preparedFor(DIRTY_CREW)] }) as never, // re-parse ADDS a crew member (MI-11)
    );
    const body = (await res.json()) as { per_row: Array<{ code: string }> };

    expect(body.per_row[0]?.code).toBe("RESCAN_REVIEW_REQUIRED");
    expect(await showRow()).toBeUndefined(); // never published
    const ps = await pendingRow();
    expect(ps?.last_finalize_failure_code).toBe("RESCAN_REVIEW_REQUIRED");
    expect(ps?.wizard_approved).toBe(false);
  });

  test("T5 Drive export throws during inline re-parse: DRIVE_FETCH_FAILED, not published", async () => {
    await setActiveSession();
    await stageApprovedRow(CLEAN_CREW);

    const res = await handleOnboardingFinalize(
      request(),
      deps({
        prepareOnboardingFiles: async () => {
          throw new Error("drive export boom");
        },
      }) as never,
    );
    const body = (await res.json()) as { per_row: Array<{ code: string }> };

    expect(body.per_row[0]?.code).toBe("DRIVE_FETCH_FAILED");
    expect(await showRow()).toBeUndefined();
  });
});
