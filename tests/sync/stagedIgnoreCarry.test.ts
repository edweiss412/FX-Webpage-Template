import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { runPhase1 } from "@/lib/sync/phase1";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";
import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";

/**
 * wizard-warning-ignore-controls spec §2.7 — the finalize carry.
 *
 * A FIRST-SEEN wizard row has no `shows` record while the operator reviews it, so its
 * ignore decisions live in `pending_syncs.ignored_warnings`. Finalize is where they must
 * become durable rows in `public.ignored_warnings` for the show that finalize creates or
 * updates. Miss it and the failure is quiet in the worst way: the publish succeeds, and
 * every warning the operator dismissed reappears on the published surface.
 *
 * BOTH apply paths get their own end-to-end proof, because they carry the value through
 * completely different channels:
 *
 *  (a) CREATE — the finalize locked select reads the column and forwards it straight into
 *      the apply. Proves the select and the forward, not merely the insert.
 *  (b) UPDATE — `deleteApprovedPending` consumes the pending_syncs row in the SAME
 *      transaction that stages the shadow, so by Phase D the column no longer exists
 *      anywhere except inside the shadow payload. This case runs the real chain
 *      (stageExistingShowShadow's jsonb_build_object → parseShadowPayloadForApply →
 *      applyStagedCore) and reads Postgres afterwards.
 *
 * Every expectation derives from the fixture warnings run through the REAL
 * `warningFingerprint`; a hardcoded hash would pass against a fingerprint production can
 * no longer mint.
 */

// Neither phase re-exports the sheet. If one ever does, these throw.
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

// TEST_DATABASE_URL is the VALIDATION project in this repo, and this suite writes and
// deletes rows — pin the loopback (tests/db/_metaLocalDbUrlGuard.test.ts covers the class).
const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const SESSION = "5c5c5c5c-8888-4888-9888-5c5c5c5c5c5c";
const FOLDER = "staged-ignore-carry-folder";
const DRIVE_CREATE = "drive-staged-ignore-create";
const DRIVE_UPDATE = "drive-staged-ignore-update";
const INSTANT = "2026-08-12T18:04:11.001Z";
const APPROVED_AT = "2026-08-12T18:10:00.500Z";
const STAGING_ADMIN = "doug@fxav.com";

/** Two ignorable warnings the fixture parse carries; one gets ignored, one stays active. */
const WARN_IGNORED: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized field.",
  rawSnippet: "Hotel notes | double occupancy",
};
const WARN_ACTIVE: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized field.",
  rawSnippet: "Parking | validated onsite",
};
const FP_IGNORED = warningFingerprint(WARN_IGNORED) as string;
const FP_ACTIVE = warningFingerprint(WARN_ACTIVE) as string;
/** A fingerprint matching no live warning — the orphan case (§7). */
const FP_ORPHAN = warningFingerprint({
  code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  rawSnippet: "a snippet no live warning carries",
}) as string;

type Crew = { name: string; email: string };

function makeParse(title: string, crew: Crew[]): Record<string, unknown> {
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
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: "PO-1",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: crew.map(({ name, email }) => ({
      name,
      email,
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    // One ballroom: the invariant set hard-fails a v4 parse with no rooms.
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
    warnings: [WARN_IGNORED, WARN_ACTIVE],
    hardErrors: [],
  };
}

const CREW_LIVE: Crew[] = [{ name: "Ada", email: "ada@x.example" }];
const CREW_STAGED: Crew[] = [...CREW_LIVE, { name: "Bo", email: "bo@x.example" }];

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
  for (const drive of [DRIVE_CREATE, DRIVE_UPDATE]) {
    for (const stmt of [
      `delete from public.ignored_warnings where show_id in (select id from public.shows where drive_file_id = '${drive}')`,
      `delete from public.show_change_log where drive_file_id = '${drive}'`,
      `delete from public.sync_audit where drive_file_id = '${drive}'`,
      `delete from public.shows_pending_changes where drive_file_id = '${drive}'`,
      `delete from public.shows where drive_file_id = '${drive}'`,
      `delete from public.pending_syncs where drive_file_id = '${drive}'`,
      `delete from public.pending_ingestions where drive_file_id = '${drive}'`,
      `delete from public.onboarding_scan_manifest where drive_file_id = '${drive}'`,
    ]) {
      await sql.unsafe(stmt, []).catch(() => {});
    }
  }
  for (const stmt of [
    `delete from public.deferred_ingestions where wizard_session_id = '${SESSION}'::uuid`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null, watched_folder_id = null, watched_folder_name = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

/** Stage `drive` through the REAL scan writer, then write the staged ignore entries the
 *  §2.6 action would have written, and approve it for finalize. */
async function stage(drive: string, ignoredEntries: unknown[]): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await rawTx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [drive]);
    const phase1 = await runPhase1(tx, {
      driveFileId: drive,
      mode: "onboarding_scan",
      wizardSessionId: SESSION,
      fileMeta: {
        driveFileId: drive,
        name: "fixture.gsheet",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: INSTANT,
        parents: [FOLDER],
      },
      parseResult: makeParse(`Staged Ignore ${drive}`, CREW_STAGED) as unknown as ParseResult,
      binding: { bindingToken: INSTANT, modifiedTime: INSTANT },
      sourceAnchors: {},
    });
    expect(phase1.outcome).toBe("stage");
  });

  // What the §2.6 staged ignore action writes. This UPDATE is the chronological red
  // before the migration lands: the column does not exist, so staging cannot hold a
  // decision at all.
  await sql!.unsafe(
    `update public.pending_syncs set ignored_warnings = $3::jsonb
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [drive, SESSION, ignoredEntries] as never[],
  );
  const stored = one<{ ignored_warnings: unknown[] }>(
    await sql!.unsafe(
      `select ignored_warnings from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [drive, SESSION],
    ),
  );
  // Assert the staging write landed as given, so a later failure cannot be blamed on it.
  expect(stored.ignored_warnings).toEqual(ignoredEntries);

  const staged = one<{ triggered_review_items: Array<{ id: string }> }>(
    await sql!.unsafe(
      `select triggered_review_items from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [drive, SESSION],
    ),
  );
  const choices = staged.triggered_review_items.map((item) => ({
    item_id: item.id,
    action: "apply",
  }));
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true,
            wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = $4::jsonb,
            wizard_approved_by_email = 'approver@fxav.com',
            wizard_approved_at = $3::timestamptz
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [drive, SESSION, APPROVED_AT, choices] as never[],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet', 'applied')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'applied'`,
    [FOLDER, SESSION, drive],
  );
}

/** A live published show for the UPDATE path. */
async function seedLiveShow(drive: string): Promise<string> {
  const show = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status)
       values ($1, $2, 'Staged Ignore Live', 'Client', 'v4', $3::timestamptz, true, 'ok')
       returning id`,
      [drive, `slug-${drive}`, INSTANT],
    ),
  );
  for (const member of CREW_LIVE) {
    await sql!.unsafe(
      `insert into public.crew_members (show_id, name, email, role) values ($1, $2, $3, 'A1')`,
      [show.id, member.name, member.email],
    );
  }
  return show.id;
}

function requestFor(path: string): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/${path}`, { method: "POST" });
}
function phaseBDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: INSTANT,
    }),
  };
}
function phaseDDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    subscribeToWatchedFolder: async () => undefined,
  };
}

type PerRow = { drive_file_id: string; code: string };

async function runPhaseB(drive: string): Promise<void> {
  const res = await handleOnboardingFinalize(requestFor("finalize"), phaseBDeps());
  expect(res.status).toBe(200);
  const body = (await res.json()) as { per_row: PerRow[] };
  expect(body.per_row.find((r) => r.drive_file_id === drive)?.code).toBe("OK");
}

async function runPhaseD(drive: string): Promise<void> {
  const res = await handleOnboardingFinalizeCas(requestFor("finalize-cas"), phaseDDeps());
  const body = (await res.json()) as { per_row?: PerRow[]; code?: string };
  expect(body.per_row?.find((r) => r.drive_file_id === drive)?.code).toBe("OK");
  expect(res.status).toBe(200);
  const remaining = await sql!.unsafe(
    `select 1 from public.shows_pending_changes where drive_file_id = $1`,
    [drive],
  );
  expect(remaining.length).toBe(0);
}

async function readIgnored(
  drive: string,
): Promise<Array<{ fingerprint: string; code: string; ignored_by: string }>> {
  return (await sql!.unsafe(
    `select iw.fingerprint, iw.code, iw.ignored_by
       from public.ignored_warnings iw
       join public.shows s on s.id = iw.show_id
      where s.drive_file_id = $1
      order by iw.fingerprint`,
    [drive],
  )) as unknown as Array<{ fingerprint: string; code: string; ignored_by: string }>;
}

beforeAll(() => {
  if (!dbUp) return;
  // The route openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH so the real
  // handlers under test connect to the LOCAL loopback, never validation.
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});
beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
});
afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("staged ignore decisions become durable at finalize (real DB)", () => {
  test.skipIf(!dbUp)(
    "CREATE path: staged fingerprints land on the show finalize creates, with the staging-time ignored_by",
    async () => {
      await stage(DRIVE_CREATE, [
        { fingerprint: FP_IGNORED, code: WARN_IGNORED.code, ignored_by: STAGING_ADMIN },
      ]);
      // Precondition, from the fixture: no show exists yet. This is what makes the row a
      // FIRST-SEEN one and the show id unknowable before the apply.
      expect(
        (await sql!.unsafe(`select 1 from public.shows where drive_file_id = $1`, [DRIVE_CREATE]))
          .length,
      ).toBe(0);

      await runPhaseB(DRIVE_CREATE);

      expect(await readIgnored(DRIVE_CREATE)).toEqual([
        { fingerprint: FP_IGNORED, code: WARN_IGNORED.code, ignored_by: STAGING_ADMIN },
      ]);
      // The ACTIVE warning's fingerprint must NOT be carried — otherwise the carry is
      // writing every warning rather than the ignored ones, and the assertion above
      // would pass on a fixture that proves nothing.
      expect((await readIgnored(DRIVE_CREATE)).map((r) => r.fingerprint)).not.toContain(FP_ACTIVE);
    },
    30000,
  );

  test.skipIf(!dbUp)(
    "UPDATE path: fingerprints survive the shadow round trip, which is their only channel by Phase D",
    async () => {
      await seedLiveShow(DRIVE_UPDATE);
      await stage(DRIVE_UPDATE, [
        { fingerprint: FP_IGNORED, code: WARN_IGNORED.code, ignored_by: STAGING_ADMIN },
      ]);

      await runPhaseB(DRIVE_UPDATE);

      // Read the payload out of the table, not the argument handed to the writer: an
      // implementation that accepts the parameter and forgets the jsonb_build_object
      // member must fail here.
      const shadow = one<{ carried: unknown }>(
        await sql!.unsafe(
          `select payload->'ignored_warnings' as carried
             from public.shows_pending_changes where drive_file_id = $1`,
          [DRIVE_UPDATE],
        ),
      );
      expect(shadow.carried).toEqual([
        { fingerprint: FP_IGNORED, code: WARN_IGNORED.code, ignored_by: STAGING_ADMIN },
      ]);
      // And the row they came from is gone — which is why the payload is the only channel.
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
            [DRIVE_UPDATE, SESSION],
          )
        ).length,
      ).toBe(0);

      await runPhaseD(DRIVE_UPDATE);

      expect(await readIgnored(DRIVE_UPDATE)).toEqual([
        { fingerprint: FP_IGNORED, code: WARN_IGNORED.code, ignored_by: STAGING_ADMIN },
      ]);
    },
    30000,
  );

  test.skipIf(!dbUp)(
    "an orphaned fingerprint carries without error, and re-applying adds no duplicate",
    async () => {
      await stage(DRIVE_CREATE, [
        { fingerprint: FP_IGNORED, code: WARN_IGNORED.code, ignored_by: STAGING_ADMIN },
        // Matches no live warning — the operator ignored it, then a rescan changed the
        // sheet. It must ride along harmlessly; the cron prune removes it later (§1.1.6).
        { fingerprint: FP_ORPHAN, code: "HOTEL_GUEST_SPLIT_AMBIGUOUS", ignored_by: STAGING_ADMIN },
      ]);
      await runPhaseB(DRIVE_CREATE);

      const after = await readIgnored(DRIVE_CREATE);
      expect(after.map((r) => r.fingerprint).sort()).toEqual([FP_IGNORED, FP_ORPHAN].sort());

      // Re-apply the same entries against the now-existing show: `on conflict do nothing`
      // means the row count is unchanged and no unique violation escapes.
      const showId = one<{ id: string }>(
        await sql!.unsafe(`select id from public.shows where drive_file_id = $1`, [DRIVE_CREATE]),
      ).id;
      for (const entry of after) {
        await sql!.unsafe(
          `insert into public.ignored_warnings (show_id, fingerprint, code, ignored_by)
           values ($1, $2, $3, $4)
           on conflict (show_id, fingerprint) do nothing`,
          [showId, entry.fingerprint, entry.code, entry.ignored_by],
        );
      }
      expect((await readIgnored(DRIVE_CREATE)).length).toBe(after.length);
    },
    30000,
  );
});
