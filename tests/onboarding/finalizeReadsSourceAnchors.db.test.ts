/**
 * REAL-DB: the Step-3 finalize reads pending_syncs.source_anchors (persisted at scan) and copies
 * it onto the created show, performing NO Drive XLSX export. Authoritative no-export guard: the
 * Drive export functions are vi.mock'd to THROW — if finalize ever tried to export, the publish
 * would fail here (R3-F2). Also pins the best-effort coerce: a CORRUPT jsonb scalar in the column
 * must NOT wedge a publish (falls back to {}).
 *
 * Runs against local Supabase; skips cleanly if Postgres is unreachable.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";

// The Step-3 finalize must NOT export XLSX. If a regression re-introduces any export call these
// throw and the publish fails loudly. fetchDriveFileMetadata (the freshness get) stays real.
vi.mock("@/lib/drive/fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drive/fetch")>();
  const boom = () => {
    throw new Error("finalize must not export XLSX");
  };
  return {
    ...actual,
    fetchSheetMarkdownWithBinding: boom,
    fetchSheetAsMarkdown: boom,
    fetchSheetAsMarkdownAtRevision: boom,
    fetchSheetMarkdownAndBytesAtRevision: boom,
  };
});

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "7c7c7c7c-6666-4666-8666-7c7c7c7c7c7c";
const FOLDER = "finalize-reads-sa-folder";
const DRIVE_FILE_ID = "finalize-reads-sa-file";
const STAGED_INSTANT = "2026-05-09T03:44:06.040Z";
const TITLE = "Finalize Reads SA Fixture";

const KNOWN_ANCHORS = {
  schedule: { title: "AGENDA", gid: 1490737099, a1: "A1:X999" },
  venue: { title: "INFO", gid: 0, a1: "A1:E10" },
};

const PARSE_RESULT = {
  show: {
    title: TITLE,
    client_label: "Acme Corp",
    client_contact: null,
    template_version: "v4",
    venue: { name: "Grand Hall" },
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

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(databaseUrl, {
    max: 1,
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

function first<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const table of [
    "onboarding_scan_manifest",
    "sync_audit",
    "shows",
    "pending_syncs",
    "shows_pending_changes",
  ]) {
    await sql
      .unsafe(`delete from public.${table} where drive_file_id = $1`, [DRIVE_FILE_ID])
      .catch(() => {});
  }
  await sql
    .unsafe(`delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`, [
      SESSION,
    ])
    .catch(() => {});
  await sql
    .unsafe(
      `update public.app_settings set pending_wizard_session_id = null,
          pending_wizard_session_at = null, pending_folder_id = null where id = 'default'`,
    )
    .catch(() => {});
}

async function activateSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(), pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet', 'applied')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'applied'`,
    [FOLDER, SESSION, DRIVE_FILE_ID],
  );
}

async function writeApprovedRow(sourceAnchors?: Record<string, unknown>): Promise<void> {
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
      ...(sourceAnchors !== undefined
        ? { sourceAnchors: sourceAnchors as Record<string, never> }
        : {}),
    });
  });
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true, wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = '[]'::jsonb, wizard_approved_by_email = 'doug@example.com',
            wizard_approved_at = now()
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE_FILE_ID, SESSION],
  );
}

function finalizeDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "doug@example.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: STAGED_INSTANT,
    }),
  };
}

async function finalize(): Promise<Response> {
  return handleOnboardingFinalize(
    new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" }),
    finalizeDeps(),
  );
}

beforeAll(async () => {
  if (dbUp) await cleanup();
});
beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await activateSession();
});
afterEach(async () => {
  if (dbUp) await cleanup();
});
afterAll(async () => {
  if (sql) await sql.end().catch(() => {});
});

describe("finalize reads persisted source_anchors (no Drive export)", () => {
  test.skipIf(!dbUp)(
    "copies the persisted anchors onto the show (export fns mocked to throw)",
    async () => {
      await writeApprovedRow(KNOWN_ANCHORS);

      const response = await finalize();
      expect(response.status).toBe(200);
      const body = (await response.json()) as { per_row: Array<{ code: string }> };
      expect(body.per_row[0]?.code).toBe("OK"); // published without ever hitting a (throwing) export fn

      const rows = await sql!.unsafe(
        `select source_anchors from public.shows where drive_file_id = $1`,
        [DRIVE_FILE_ID],
      );
      expect(first<{ source_anchors: unknown }>(rows).source_anchors).toEqual(KNOWN_ANCHORS);
    },
  );

  test.skipIf(!dbUp)(
    "a CORRUPT jsonb scalar in the column does NOT wedge the publish (→ {})",
    async () => {
      await writeApprovedRow();
      // Seed a legal-but-corrupt jsonb STRING SCALAR directly (the column is jsonb, no CHECK).
      await sql!.unsafe(
        `update public.pending_syncs set source_anchors = to_jsonb('oops'::text)
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [DRIVE_FILE_ID, SESSION],
      );
      const seed = await sql!.unsafe(
        `select jsonb_typeof(source_anchors) as t from public.pending_syncs where drive_file_id = $1`,
        [DRIVE_FILE_ID],
      );
      expect(first<{ t: string }>(seed).t).toBe("string"); // guard: really a scalar

      const response = await finalize();
      expect(response.status).toBe(200);
      const body = (await response.json()) as { per_row: Array<{ code: string }> };
      expect(body.per_row[0]?.code).toBe("OK"); // best-effort coerce swallowed the corrupt value

      const rows = await sql!.unsafe(
        `select source_anchors from public.shows where drive_file_id = $1`,
        [DRIVE_FILE_ID],
      );
      expect(first<{ source_anchors: unknown }>(rows).source_anchors).toEqual({});
    },
  );
});
