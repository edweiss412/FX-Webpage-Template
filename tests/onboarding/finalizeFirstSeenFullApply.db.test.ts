import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import {
  handleOnboardingFinalize,
  type FinalizeRouteTx,
} from "@/app/api/admin/onboarding/finalize/route";
import { makeSyncPipelineTx, type SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

/**
 * F1 Task 1.3 — Phase B first-seen finalize runs the FULL Phase-2 apply (real DB).
 *
 * Negative regression against THE origin incident (testing-spine item 2): the bespoke
 * applyFirstSeenDraft persisted ONLY `shows` columns — 0 crew / 0 rooms / no shows_internal —
 * while writing last_sync_status='ok'. The shared core (lib/sync/applyStagedCore.ts) must
 * persist children + shows_internal + auth-contract calls, keep published=false, record
 * created_show_id provenance + the wizard_created_session_id discriminator (R57-2/R65-1),
 * write REAL audit provenance (approving admin + Apply-click instant, R8-1), and write ZERO
 * show_change_log rows (feedPolicy "none" — the feed documents changes to LIVE shows).
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1), because the
// route's databaseUrl() prefers TEST_DATABASE_URL ?? DATABASE_URL.
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "6f6f6f6f-4444-4444-8444-6f6f6f6f6f6f";
const OTHER_SESSION = "9b9b9b9b-5555-4555-8555-9b9b9b9b9b9b";
const FOLDER = "first-seen-full-apply-folder";
const DRIVE_FILE_ID = "first-seen-full-apply-file";
const STAGED_INSTANT = "2026-06-10T07:30:00.040Z";
const APPROVED_AT = "2026-06-10T09:15:00.000Z";

// Fixture: 2 crewMembers (Ada A1, Bo TD), 2 rooms, 1 hotelReservation, 1 transportation,
// 1 contact, po "PO-77", 1 warning, 1 raw_unrecognized. ALL expectations below derive from
// this object (counts + field values), never hardcoded numerals (anti-tautology rule).
const PARSE_RESULT = {
  show: {
    title: "First Seen Full Apply Fixture",
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
  crewMembers: [
    {
      name: "Ada",
      email: "Ada@Example.com", // mixed case — pins email canonicalization at the boundary
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    },
    {
      name: "Bo",
      email: "Bo@Example.com",
      phone: null,
      role: "TD",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    },
  ],
  hotelReservations: [
    {
      ordinal: 1,
      hotel_name: "Hotel One",
      hotel_address: "1 Main St",
      names: ["Ada", "Bo"],
      confirmation_no: "CONF-1",
      check_in: "2026-05-07",
      check_out: "2026-05-10",
      notes: null,
    },
  ],
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
    {
      kind: "breakout",
      name: "Side",
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
  transportation: {
    driver_name: "Sam",
    driver_phone: "555-0100",
    driver_email: "sam@example.com",
    vehicle: "Sprinter",
    license_plate: "FX-001",
    color: "black",
    parking: null,
    schedule: [{ label: "Load in", time: "08:00" }],
    notes: null,
  },
  contacts: [
    { kind: "venue", name: "Venue Ops", email: "ops@example.com", phone: null, notes: null },
  ],
  pullSheet: null,
  diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
  openingReel: null,
  raw_unrecognized: [{ sheet: "Crew", row: 9 }],
  warnings: [{ severity: "warn", code: "W1", message: "w" }],
  hardErrors: [],
};

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 2,
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
    `delete from public.show_change_log where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.sync_audit where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.shows where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.pending_syncs where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.pending_ingestions where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.shows_pending_changes where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

async function seed(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  // Seed via the REAL wizard-staging writer so parse_result jsonb shape is production-true.
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await tx.upsertLivePendingSync({
      driveFileId: DRIVE_FILE_ID,
      wizardSessionId: SESSION,
      baseModifiedTime: null,
      stagedModifiedTime: STAGED_INSTANT,
      parseResult: PARSE_RESULT as never,
      triggeredReviewItems: [],
      priorLastSyncStatus: null,
      priorLastSyncError: null,
      sourceKind: "onboarding_scan",
      warningSummary: "",
    });
  });
  // Approval seeding (clean first-seen): approver ≠ finalizer, Apply-click instant pinned.
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true,
            wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = '[]'::jsonb,
            wizard_approved_by_email = 'approver@fxav.com',
            wizard_approved_at = $3::timestamptz
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE_FILE_ID, SESSION, APPROVED_AT],
  );
  // Manifest row — the created_show_id provenance UPDATE target.
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet', 'applied')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'applied'`,
    [FOLDER, SESSION, DRIVE_FILE_ID],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}

function deps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: STAGED_INSTANT,
    }),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(() => {
  if (!dbUp) return;
  // The route openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH (plan R19-1) so
  // the real handlers under test connect to the LOCAL loopback, never validation.
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await seed();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("Phase B first-seen finalize — full Phase-2 apply (real DB)", () => {
  test.skipIf(!dbUp)(
    "persists the FULL parse: children + shows_internal, published=false, provenance + audit",
    async () => {
      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { per_row: Array<{ code: string }> }).per_row[0]!.code,
      ).toBe("OK");

      const show = one(
        await sql!.unsafe(
          `select id, published, last_seen_modified_time, last_sync_status, wizard_created_session_id
             from public.shows where drive_file_id = $1`,
          [DRIVE_FILE_ID],
        ),
      ) as {
        id: string;
        published: boolean;
        last_sync_status: string;
        wizard_created_session_id: string | null;
      };
      expect(show.published).toBe(false); // interim invisibility preserved (§3.1 flag lifecycle)
      expect(show.last_sync_status).toBe("ok");

      // Children equal the staged parse (derived from the fixture object):
      const crew = (await sql!.unsafe(
        `select name, email, role from public.crew_members where show_id = $1 order by name`,
        [show.id],
      )) as unknown as Array<{ name: string; email: string; role: string }>;
      expect(crew.map((c) => c.name)).toEqual(PARSE_RESULT.crewMembers.map((m) => m.name).sort());
      expect(crew.map((c) => c.email)).toEqual(
        PARSE_RESULT.crewMembers.map((m) => m.email.toLowerCase()).sort(),
      ); // canonicalized boundary
      expect(
        (await sql!.unsafe(`select 1 from public.rooms where show_id = $1`, [show.id])).length,
      ).toBe(PARSE_RESULT.rooms.length);
      expect(
        (await sql!.unsafe(`select 1 from public.hotel_reservations where show_id = $1`, [show.id]))
          .length,
      ).toBe(PARSE_RESULT.hotelReservations.length);
      expect(
        (await sql!.unsafe(`select 1 from public.transportation where show_id = $1`, [show.id]))
          .length,
      ).toBe(PARSE_RESULT.transportation ? 1 : 0);
      expect(
        (await sql!.unsafe(`select 1 from public.contacts where show_id = $1`, [show.id])).length,
      ).toBe(PARSE_RESULT.contacts.length);

      const internal = one(
        await sql!.unsafe(
          `select financials, parse_warnings, raw_unrecognized
             from public.shows_internal where show_id = $1`,
          [show.id],
        ),
      ) as { financials: unknown; parse_warnings: unknown; raw_unrecognized: unknown };
      expect(internal.financials).toMatchObject({ po: PARSE_RESULT.show.po });
      expect(internal.parse_warnings).toEqual(PARSE_RESULT.warnings); // finally persisted (§3.1)
      expect(internal.raw_unrecognized).toEqual(PARSE_RESULT.raw_unrecognized);

      // created_show_id provenance recorded in the SAME per-row transaction:
      const manifest = one(
        await sql!.unsafe(
          `select created_show_id from public.onboarding_scan_manifest
            where wizard_session_id = $1::uuid and drive_file_id = $2`,
          [SESSION, DRIVE_FILE_ID],
        ),
      ) as { created_show_id: string | null };
      expect(manifest.created_show_id).toBe(show.id);
      // R66-1 hard discriminator assertion — the flip/cleanup/reap join on it:
      expect(show.wizard_created_session_id).toBe(SESSION);

      // feedPolicy "none": a first-seen apply writes ZERO show_change_log rows (R35-1).
      expect(
        (
          await sql!.unsafe(`select 1 from public.show_change_log where drive_file_id = $1`, [
            DRIVE_FILE_ID,
          ])
        ).length,
      ).toBe(0);

      // Audit provenance (R8-1): actor = APPROVING admin, applied_at = Apply-click instant,
      // real items/choices/derived, shared summary shape + source:
      const audit = one(
        await sql!.unsafe(
          `select applied_by, applied_at, triggered_review_items,
                  reviewer_choices, derived_side_effects, parse_result_summary,
                  staged_modified_time
             from public.sync_audit where drive_file_id = $1`,
          [DRIVE_FILE_ID],
        ),
      ) as {
        applied_by: string;
        applied_at: string | Date;
        triggered_review_items: unknown;
        derived_side_effects: unknown;
        parse_result_summary: unknown;
      };
      expect(audit.applied_by).toBe("approver@fxav.com"); // NOT finalizer@fxav.com
      expect(new Date(audit.applied_at).toISOString()).toBe(APPROVED_AT); // NOT now()
      expect(audit.triggered_review_items).toEqual([]); // real (empty) array, from the row
      expect(audit.derived_side_effects).toEqual({ revokeFloorForNames: [] });
      expect(audit.parse_result_summary).toMatchObject({
        source: "onboarding_finalize",
        crewCount: PARSE_RESULT.crewMembers.length, // F2 Arm B marker
        roomCount: PARSE_RESULT.rooms.length,
      });
    },
  );

  test.skipIf(!dbUp)(
    "pending_syncs row is consumed and the wizard apply never touched the live partition",
    async () => {
      // A LIVE pending_ingestions failure record for the same drive file (wizard_session_id IS
      // NULL) — class op #1 (deleteLivePendingIngestion) must NOT erase it from a wizard apply.
      await sql!.unsafe(
        `insert into public.pending_ingestions
           (drive_file_id, drive_file_name, last_error_code, last_error_message)
         values ($1, 'fixture.gsheet', 'PARSE_FAILED', 'live failure record')`,
        [DRIVE_FILE_ID],
      );

      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { per_row: Array<{ code: string }> }).per_row[0]!.code,
      ).toBe("OK");

      expect(
        (
          await sql!.unsafe(`select 1 from public.pending_syncs where drive_file_id = $1`, [
            DRIVE_FILE_ID,
          ])
        ).length,
      ).toBe(0);
      // The LIVE failure record survived (spec §3.2 source-scoped live-partition ops):
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.pending_ingestions
              where drive_file_id = $1 and wizard_session_id is null`,
            [DRIVE_FILE_ID],
          )
        ).length,
      ).toBe(1);
    },
  );

  test.skipIf(!dbUp)(
    "lock-topology proof: the app_settings FOR UPDATE serializes supersession against the Phase B loop",
    async () => {
      // The live topology makes the in-loop provenance race UNREACHABLE: handleOnboardingFinalize
      // takes SELECT … FOR UPDATE on app_settings (after tryFinalizeLock, post-R29-1) and the
      // outer withTx holds that row lock for the WHOLE batch — so a concurrent supersession
      // (scan/cleanup flipping pending_wizard_session_id) BLOCKS until finalize commits. This
      // test proves the serialization rather than simulating an impossible interleaving. The
      // returning-checked provenance UPDATE + FirstSeenProvenanceRaceError is defense-in-depth
      // for future lock refactors (unit pin in tests/onboarding/finalize.test.ts).
      const slowWithRowTx = async <R>(
        driveFileId: string,
        fn: (tx: FinalizeRouteTx, pipelineTx: SyncPipelineTx) => Promise<R>,
      ): Promise<R> => {
        const conn = postgres(LOCAL_URL, { max: 1, idle_timeout: 1, prepare: false });
        try {
          return (await conn.begin(async (rawTx) => {
            const unsafe = rawTx as unknown as {
              unsafe(q: string, params?: unknown[]): Promise<unknown[]>;
            };
            const tx: FinalizeRouteTx = {
              async query<T>(q: string, params: readonly unknown[] = []) {
                const rows = (await unsafe.unsafe(q, [...params])) as T[];
                return { rows, rowCount: rows.length };
              },
            };
            await tx.query(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
            await delay(300); // hold the per-row apply mid-flight (outer app_settings lock held)
            return await fn(tx, makeSyncPipelineTx(unsafe));
          })) as R;
        } finally {
          await conn.end({ timeout: 5 });
        }
      };

      // NOTE (deviation from the plan's literal completion-order array): the flip unblocks at
      // the outer COMMIT, but the finalize PROMISE resolves only after the route's
      // `sql.end({ timeout: 5 })` connection teardown — promise-resolution order is therefore a
      // racy proxy for lock serialization. Assert the load-bearing contract directly instead:
      // the flip is BLOCKED for (at least) the per-row delay window, and the finalize batch
      // completed normally with provenance recorded BEFORE the supersession landed.
      const finalize = handleOnboardingFinalize(request(), {
        ...deps(),
        withRowTx: slowWithRowTx,
      });
      await delay(50); // finalize is inside the batch, holding the app_settings row lock
      const flipFiredAt = Date.now();
      let flipBlockedMs = -1;
      const flip = sql!
        .unsafe(
          `update public.app_settings
              set pending_wizard_session_id = $1::uuid
            where id = 'default'`,
          [OTHER_SESSION],
        )
        .then(() => {
          flipBlockedMs = Date.now() - flipFiredAt;
        });
      const [finalizeResponse] = await Promise.all([finalize, flip]);

      // The per-row apply held the batch open ~300ms after the flip fired at ~50ms; an
      // unblocked flip completes in single-digit ms. ≥200ms proves it waited on the
      // app_settings row lock until the finalize transaction committed.
      expect(flipBlockedMs).toBeGreaterThanOrEqual(200);
      expect(finalizeResponse.status).toBe(200);
      // And the finalize batch completed normally — provenance recorded, nothing demoted:
      expect(
        (
          one(
            await sql!.unsafe(
              `select created_show_id from public.onboarding_scan_manifest
                where drive_file_id = $1`,
              [DRIVE_FILE_ID],
            ),
          ) as { created_show_id: string | null }
        ).created_show_id,
      ).not.toBeNull();
    },
  );
});
