import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";

/**
 * Audit idx40/#180 — a first-seen show THIS session created Held that reaches the
 * finalize D10 no-op via a CLEAN UNCHECKED rescan must stay LINKED, not orphaned.
 *
 * Lifecycle the fix defends: session S creates a Held show (first-seen finalize) →
 * `onboarding_scan_manifest.created_show_id` points at it, status='applied',
 * pending_syncs/shadow consumed, session STILL active (cleared only in
 * finalize-cas). A clean rescan re-stages the sheet UNCHECKED (capturePriorState
 * sees priorReady=false — no pending_syncs/shadow), manifest heals to 'staged'
 * with created_show_id STILL set. Next Publish: selectFinishableCleanRows picks the
 * unchecked row, showExists=true → D10 no-op.
 *
 * Pre-fix D10 set `created_show_id = null`, breaking the provenance join
 * (`m.created_show_id = s.id`, sessionLifecycle cleanup + audit) → the Held show
 * was stranded/orphaned. Post-fix D10 PRESERVES created_show_id: the show stays a
 * valid linked Held row (recoverable), and publish_intent=false keeps it Held (the
 * finalize-cas flip requires publish_intent=true, so it is never published here).
 *
 * The sibling external-Live-show D10 case (created_show_id already NULL → stays
 * NULL) is pinned by finalizeHeldCreation.db.test.ts case (c); unaffected here.
 *
 * DB-connection convention: TEST_DATABASE_URL is the VALIDATION project, so both
 * env vars are pinned to local loopback (the route's databaseUrl() prefers
 * TEST_DATABASE_URL ?? DATABASE_URL). CI-validated — not run against shared local.
 */
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "40d40d40-1180-4180-8180-40d40d40d40d";
const FOLDER = "d10-created-show-folder";
const FILE = "d10-created-show-file";
const STAGED_INSTANT = "2026-06-20T07:30:00.040Z";
const FINALIZER_EMAIL = "finalizer@fxav.com";

// Minimal production-true first-seen parse fixture (child-table fidelity is pinned
// elsewhere; this test only needs the row to stage + reach the D10 branch).
function parseResultFor(title: string) {
  return {
    show: {
      title,
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
        email: "Ada@Example.com",
        phone: null,
        role: "A1",
        role_flags: [],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
    hotelReservations: [],
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
      `update public.app_settings
          set pending_wizard_session_id = null, pending_wizard_session_at = null,
              pending_folder_id = null
        where id = 'default'`,
      [],
    )
    .catch(() => {});
}

async function setActiveSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
}

// Seed the HELD show THIS session created: published=false + wizard_created_session_id=SESSION
// (the provenance discriminator the cleanup/flip joins require).
async function seedHeldShow(): Promise<string> {
  const row = one(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          published, wizard_created_session_id, last_seen_modified_time, last_sync_status)
       values ($1, $2, 'Held Created Show', 'Acme Corp', 'v4',
               false, $3::uuid, $4::timestamptz, 'ok')
       returning id`,
      [FILE, `held-${FILE}`, SESSION, STAGED_INSTANT],
    ),
  ) as { id: string };
  return row.id;
}

// Manifest row already carrying the created_show_id provenance pointer (the post-
// first-finalize state) + publish_intent=false (Held). status='staged' mirrors the
// rescan heal; selectFinishableCleanRows accepts 'staged'|'applied' either way.
async function stageManifestLinked(createdShowId: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status,
        created_show_id, publish_intent)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet',
             'staged', $4::uuid, false)
     on conflict (wizard_session_id, drive_file_id) do update set
       status = excluded.status,
       created_show_id = excluded.created_show_id,
       publish_intent = excluded.publish_intent`,
    [FOLDER, SESSION, FILE, createdShowId],
  );
}

// Re-stage the UNCHECKED clean rescan row via the real wizard-staging writer.
async function stageUncheckedPending(): Promise<void> {
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await tx.upsertLivePendingSync({
      driveFileId: FILE,
      wizardSessionId: SESSION,
      baseModifiedTime: STAGED_INSTANT,
      stagedModifiedTime: STAGED_INSTANT,
      parseResult: parseResultFor("Held Created Show") as never,
      triggeredReviewItems: [],
      priorLastSyncStatus: null,
      priorLastSyncError: null,
      sourceKind: "onboarding_scan",
      warningSummary: "",
    });
  });
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}

function deps() {
  return {
    requireAdminIdentity: async () => ({ email: FINALIZER_EMAIL }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: STAGED_INSTANT,
    }),
  };
}

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await setActiveSession();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("audit idx40 — D10 preserves created_show_id for a session-created Held show (real DB)", () => {
  test.skipIf(!dbUp)(
    "a clean unchecked rescan of a session-created Held show stays LINKED (created_show_id preserved) and NOT published",
    async () => {
      const heldShowId = await seedHeldShow();
      await stageManifestLinked(heldShowId);
      await stageUncheckedPending();

      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        per_row: Array<{ drive_file_id: string; code: string }>;
      };
      expect(body.per_row.find((r) => r.drive_file_id === FILE)?.code).toBe("OK");

      // THE FIX: created_show_id is PRESERVED (pre-fix D10 nulled it → orphan).
      const manifest = one(
        await sql!.unsafe(
          `select status, created_show_id, publish_intent
             from public.onboarding_scan_manifest
            where wizard_session_id = $1::uuid and drive_file_id = $2`,
          [SESSION, FILE],
        ),
      ) as { status: string; created_show_id: string | null; publish_intent: boolean };
      expect(manifest.created_show_id).toBe(heldShowId); // linked, not orphaned
      expect(manifest.status).toBe("applied"); // resolved → non-blocking
      expect(manifest.publish_intent).toBe(false); // flip-excluded → stays Held

      // The Held show is UNCHANGED and still Held (finalize-cas flip needs
      // publish_intent=true; this row is false, so it is never published).
      const show = one(
        await sql!.unsafe(`select id, published from public.shows where drive_file_id = $1`, [
          FILE,
        ]),
      ) as { id: string; published: boolean };
      expect(show.id).toBe(heldShowId);
      expect(show.published).toBe(false);

      // Provenance join intact — the exact shape sessionLifecycle cleanup + the
      // audit surface use. Pre-fix (created_show_id null) this returned 0 rows.
      const linked = await sql!.unsafe(
        `select 1
           from public.onboarding_scan_manifest m
           join public.shows s
             on m.created_show_id = s.id
            and m.drive_file_id = s.drive_file_id
            and s.wizard_created_session_id = m.wizard_session_id
          where m.wizard_session_id = $1::uuid and m.drive_file_id = $2`,
        [SESSION, FILE],
      );
      expect(linked.length).toBe(1);

      // The re-staged pending row is consumed (no leak).
      expect(
        (await sql!.unsafe(`select 1 from public.pending_syncs where drive_file_id = $1`, [FILE]))
          .length,
      ).toBe(0);
    },
  );
});
