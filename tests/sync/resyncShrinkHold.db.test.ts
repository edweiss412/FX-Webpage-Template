import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import { processOneFile, type ProcessOneFileDeps } from "@/lib/sync/runScheduledCronSync";
import {
  runManualSyncForShow,
  type RunManualSyncForShowDeps,
} from "@/lib/sync/runManualSyncForShow";

/**
 * Task 7 — DB-backed end-to-end validation of the re-sync material-shrink HOLD (audit finding #3),
 * exercising the REAL cron/manual pipeline (`processOneFile` / `runManualSyncForShow`) against a
 * live local Postgres. Only the Drive-touching steps (captureBinding / fetch / parse / enrich) are
 * injected; the phase1 shrink detection, the `updateShowShrinkHeld` write, the RESYNC_SHRINK_HELD
 * alert raise, the sync-problem recovery sweep, and the version-bound accept gate all run for real.
 *
 * Anti-tautology: every assertion reads the DATA SOURCE rows (`crew_members`, `admin_alerts`,
 * `shows`) — never a rendering container. Crew-count expectations are DERIVED from the seed
 * dimension (`SEED_CREW.length` = 5) and the reduced-parse dimension (`SHRUNK_CREW.length` = 2),
 * never a bare literal stated only in the assertion.
 *
 * DB convention mirrors tests/onboarding/finalizeCasDougEditSelfHeal.db.test.ts: the pipeline
 * openers commit their own tx (withPostgresSyncPipelineLock), so seeding is COMMITTED and cleaned
 * up by drive_file_id prefix rather than rolled back. `test.skipIf(!process.env.TEST_DATABASE_URL)`
 * gates the whole suite; a reachability probe additionally skips when no local Postgres answers.
 */

const LOCAL_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const FOLDER = "resync-shrink-hold-folder";
const DRIVE_PREFIX = "drive-rsh-";

// Instants: seed last_seen at T0; the hold pass lists at T1 (> T0 → the cron watermark gate fires);
// the clean re-sync lists at T2 (> T0, since a hold never advances last_seen). Non-zero ms so a
// ms-dropping comparison cannot accidentally pass the gate either way.
const T0 = "2026-06-09T00:00:00.000Z";
const T1 = "2026-06-10T12:00:00.040Z";
const T2 = "2026-06-11T09:30:00.250Z";

type Crew = { name: string; email: string };

// The full last-good roster (seed dimension) and the shrunk parse (MI-6 crewDrop=3). SHRUNK_CREW is
// a strict prefix of SEED_CREW so a confirmed accept keeps exactly those names.
const SEED_CREW: Crew[] = [1, 2, 3, 4, 5].map((i) => ({
  name: `RSH Crew ${i}`,
  email: `rsh${i}@x.example`,
}));
const SHRUNK_CREW: Crew[] = SEED_CREW.slice(0, 2);
const SEED_CREW_COUNT = SEED_CREW.length; // 5 — derived, never hardcoded in assertions
const SHRUNK_CREW_COUNT = SHRUNK_CREW.length; // 2

// One fixture family; expectations derive from these objects (anti-tautology rule).
function makeParse(crew: Crew[]): Record<string, unknown> {
  return {
    show: {
      title: "RSH Show",
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
    // A single room satisfies the MI-5 (rooms >= 1) hard invariant so the crew-count MI-6 shrink
    // guard is the invariant under test (a hard-fail short-circuits MI-6..14). Present in BOTH the
    // full and shrunk fixtures, so rooms never shrink (no MI-7 confound).
    rooms: [
      {
        kind: "ballroom",
        name: "Main Hall",
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

const FULL_PARSE = makeParse(SEED_CREW);
const SHRUNK_PARSE = makeParse(SHRUNK_CREW);

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

const shouldRun = Boolean(process.env.TEST_DATABASE_URL) && dbUp;

function one<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

function fileMeta(driveFileId: string, modifiedTime: string): DriveListedFile {
  return {
    driveFileId,
    name: "RSH Show",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: [FOLDER],
    headRevisionId: `rev-${modifiedTime}`,
  } as DriveListedFile;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.admin_alerts a using public.shows s
        where a.show_id = s.id and s.drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.sync_holds where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.show_change_log where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.sync_audit where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.sync_log where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.revision_race_cooldowns where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.pending_snapshot_uploads where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.shows_pending_changes where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.pending_syncs where drive_file_id like '${DRIVE_PREFIX}%'`,
    `delete from public.pending_ingestions where drive_file_id like '${DRIVE_PREFIX}%'`,
    // crew_members + admin_alerts cascade on the shows delete, but child rows above must go first.
    `delete from public.shows where drive_file_id like '${DRIVE_PREFIX}%'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

/** Seed a published last-good show + its crew (committed). `lastSyncedAt` defaults to now(). */
async function seedShow(opts: {
  driveFileId: string;
  crew: Crew[];
  lastSeen: string;
  lastSyncedAt?: string;
}): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, last_synced_at, published, last_sync_status)
       values ($1, $2, 'RSH Show', 'Client', 'v4', $3::timestamptz,
               coalesce($4::timestamptz, now()), true, 'ok')
       returning id`,
      [opts.driveFileId, `slug-${opts.driveFileId}`, opts.lastSeen, opts.lastSyncedAt ?? null],
    ),
  );
  for (const member of opts.crew) {
    await sql!.unsafe(
      `insert into public.crew_members (show_id, name, email, role, role_flags)
       values ($1, $2, $3, 'A1', '{}'::text[])`,
      [row.id, member.name, member.email],
    );
  }
  return row.id;
}

function cronDeps(modifiedTime: string, parse: Record<string, unknown>): ProcessOneFileDeps {
  return {
    captureBinding: async () => ({ bindingToken: `rev-${modifiedTime}`, modifiedTime }),
    fetchMarkdownAtRevision: async () => "# v4\nRSH Show",
    parseSheet: () => parse,
    enrichWithDrivePins: async () => parse as unknown as ParseResult,
    readRevisionRaceCooldown: async () => null,
    logSync: async () => {},
    publishShowInvalidation: async () => {},
  } as unknown as ProcessOneFileDeps;
}

async function runCron(
  driveFileId: string,
  opts: { modifiedTime: string; parse: Record<string, unknown> },
) {
  const result = await processOneFile(
    driveFileId,
    "cron",
    fileMeta(driveFileId, opts.modifiedTime),
    cronDeps(opts.modifiedTime, opts.parse),
  );
  if ("skipped" in result) {
    throw new Error("unexpected ConcurrentSyncSkipped — no other sync holds this show's lock");
  }
  return result;
}

async function runManual(
  driveFileId: string,
  opts: {
    modifiedTime: string;
    parse: Record<string, unknown>;
    acceptShrink?: boolean;
    expectedModifiedTime?: string;
  },
) {
  const deps: RunManualSyncForShowDeps = {
    processDeps: cronDeps(opts.modifiedTime, opts.parse),
    getActiveWatchedFolderId: async () => ({ folderId: FOLDER }),
    fetchDriveFileMetadata: async () => fileMeta(driveFileId, opts.modifiedTime),
    ...(opts.acceptShrink !== undefined ? { acceptShrink: opts.acceptShrink } : {}),
    ...(opts.expectedModifiedTime !== undefined
      ? { expectedModifiedTime: opts.expectedModifiedTime }
      : {}),
  };
  const result = await runManualSyncForShow(driveFileId, "manual", deps);
  if ("skipped" in result) {
    throw new Error("unexpected ConcurrentSyncSkipped — no other sync holds this show's lock");
  }
  return result;
}

async function crewCount(showId: string): Promise<number> {
  const rows = await sql!.unsafe(`select id from public.crew_members where show_id = $1`, [showId]);
  return (rows as unknown[]).length;
}

async function openAlertCodes(showId: string): Promise<string[]> {
  const rows = (await sql!.unsafe(
    `select code from public.admin_alerts where show_id = $1 and resolved_at is null`,
    [showId],
  )) as unknown as Array<{ code: string }>;
  return rows.map((r) => r.code);
}

async function showStatus(showId: string): Promise<{
  last_sync_status: string | null;
  last_synced_at: Date;
}> {
  return one(
    await sql!.unsafe(`select last_sync_status, last_synced_at from public.shows where id = $1`, [
      showId,
    ]),
  );
}

function newDrive(): string {
  return `${DRIVE_PREFIX}${randomUUID().slice(0, 12)}`;
}

beforeAll(() => {
  if (!shouldRun) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
  // perFileProcessor's service-role client must hit the LOCAL Supabase REST origin.
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  // The snapshot-assets factory + default drive client are constructed eagerly but lazily called;
  // the fixtures carry ZERO diagram assets so no Drive call ever fires. A dummy key fails loudly if
  // one unexpectedly does.
  vi.stubEnv(
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    JSON.stringify({
      client_email: "resync-shrink-hold@test.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n",
    }),
  );
});

beforeEach(async () => {
  if (!shouldRun) return;
  await cleanup();
});

afterAll(async () => {
  if (shouldRun) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("re-sync material-shrink HOLD (retain / alert / status / auto-resolve / version-bind, real DB)", () => {
  test.skipIf(!shouldRun)(
    "hold retains last-good + raises RESYNC_SHRINK_HELD + sets status='shrink_held' (no clobber)",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({ driveFileId: drive, crew: SEED_CREW, lastSeen: T0 });

      const result = await runCron(drive, { modifiedTime: T1, parse: SHRUNK_PARSE });
      expect(result.outcome).toBe("shrink_held");

      // NO clobber: the last-good roster is retained (derived from the seed dimension, not a magic 5).
      expect(await crewCount(showId)).toBe(SEED_CREW_COUNT);
      expect(await openAlertCodes(showId)).toContain("RESYNC_SHRINK_HELD");
      expect((await showStatus(showId)).last_sync_status).toBe("shrink_held");
    },
  );

  test.skipIf(!shouldRun)(
    "a REPEATED hold on an unchanged sheet does NOT advance last_synced_at (crew staleness keeps escalating)",
    async () => {
      const drive = newDrive();
      // last_synced_at seeded 7h in the past (the crew StaleFooter's >6h SEVERE-escalation window).
      const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
      const showId = await seedShow({
        driveFileId: drive,
        crew: SEED_CREW,
        lastSeen: T0,
        lastSyncedAt: sevenHoursAgo,
      });
      const before = (await showStatus(showId)).last_synced_at.getTime();

      await runCron(drive, { modifiedTime: T1, parse: SHRUNK_PARSE }); // hold #1
      await runCron(drive, { modifiedTime: T1, parse: SHRUNK_PARSE }); // hold #2 (unchanged sheet)

      const after = await showStatus(showId);
      expect(after.last_sync_status).toBe("shrink_held");
      // The clock the crew footer reads stays OLD — a persistent hold must not look perpetually fresh.
      expect(after.last_synced_at.getTime()).toBe(before);
    },
  );

  test.skipIf(!shouldRun)(
    "a clean re-sync (crew restored) auto-resolves the RESYNC_SHRINK_HELD alert via the sweep",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({ driveFileId: drive, crew: SEED_CREW, lastSeen: T0 });

      await runCron(drive, { modifiedTime: T1, parse: SHRUNK_PARSE }); // hold
      expect(await openAlertCodes(showId)).toContain("RESYNC_SHRINK_HELD");

      const clean = await runCron(drive, { modifiedTime: T2, parse: FULL_PARSE }); // clean apply
      expect(clean.outcome).toBe("applied");

      // Swept by resolveStaleSyncProblemAlerts_unlocked(..., null) on the applied tail, NOT resolveAdminAlert.
      expect(await openAlertCodes(showId)).not.toContain("RESYNC_SHRINK_HELD");
      expect(await crewCount(showId)).toBe(SEED_CREW_COUNT);
    },
  );

  test.skipIf(!shouldRun)(
    "a version-bound manual accept applies the reduced roster and resolves the alert",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({ driveFileId: drive, crew: SEED_CREW, lastSeen: T0 });

      const held = await runManual(drive, { modifiedTime: T1, parse: SHRUNK_PARSE });
      expect(held.outcome).toBe("shrink_held");
      const heldModifiedTime = (held as Extract<typeof held, { outcome: "shrink_held" }>)
        .heldModifiedTime;
      expect(await crewCount(showId)).toBe(SEED_CREW_COUNT); // still held before the accept

      const accepted = await runManual(drive, {
        modifiedTime: T1,
        parse: SHRUNK_PARSE,
        acceptShrink: true,
        expectedModifiedTime: heldModifiedTime,
      });
      expect(accepted.outcome).toBe("applied");

      // The reduced roster is now applied (derived from the shrunk-parse dimension, not a magic 2).
      expect(await crewCount(showId)).toBe(SHRUNK_CREW_COUNT);
      expect(await openAlertCodes(showId)).not.toContain("RESYNC_SHRINK_HELD");
    },
  );

  test.skipIf(!shouldRun)(
    "a manual accept with a STALE expectedModifiedTime re-holds (no clobber)",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({ driveFileId: drive, crew: SEED_CREW, lastSeen: T0 });

      const held = await runManual(drive, { modifiedTime: T1, parse: SHRUNK_PARSE });
      expect(held.outcome).toBe("shrink_held");

      // Simulate Doug editing between prompt and confirm: the accept's expectedModifiedTime no longer
      // matches the current binding.modifiedTime (T1), so the hold must re-fire — never apply.
      const restale = await runManual(drive, {
        modifiedTime: T1,
        parse: SHRUNK_PARSE,
        acceptShrink: true,
        expectedModifiedTime: "2020-01-01T00:00:00.000Z",
      });
      expect(restale.outcome).toBe("shrink_held");

      expect(await crewCount(showId)).toBe(SEED_CREW_COUNT); // still last-good
    },
  );
});

// ---------------------------------------------------------------------------------------------
// BL-CREW-RENAME-SILENT-REPLACEMENT (spec 2026-07-10) — identity-link seam, end-to-end.
// These drive the REAL sync entry points; the id-preservation assertions cannot pass under
// delete+insert (anti-tautology: ids read back from crew_members, the data source).
// ---------------------------------------------------------------------------------------------
describe("crew rename identity-link (end-to-end, real DB)", () => {
  const LINK_CREW: Crew[] = [{ name: "Link Crew A", email: "linka@x.example" }];

  async function readCrewRow(
    showId: string,
    name: string,
  ): Promise<{ id: string; name: string; email: string | null } | null> {
    const rows = (await sql!.unsafe(
      `select id, name, email from public.crew_members where show_id = $1 and name = $2`,
      [showId, name],
    )) as unknown as Array<{ id: string; name: string; email: string | null }>;
    return rows[0] ?? null;
  }

  test.skipIf(!shouldRun)(
    "MI-12 rename end-to-end: no hold, crew_members.id preserved, feed parity",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({ driveFileId: drive, crew: LINK_CREW, lastSeen: T0 });
      const before = await readCrewRow(showId, LINK_CREW[0]!.name);
      expect(before).not.toBeNull();

      // Same canonical email, new name → MI-12 → auto-link, no hold.
      const renamed: Crew[] = [{ name: "Link Crew A2", email: LINK_CREW[0]!.email }];
      const result = await runCron(drive, { modifiedTime: T1, parse: makeParse(renamed) });
      expect(result.outcome).toBe("applied");

      const after = await readCrewRow(showId, renamed[0]!.name);
      expect(after).not.toBeNull();
      expect(after!.id).toBe(before!.id); // the assertion delete+insert cannot pass
      expect(await readCrewRow(showId, LINK_CREW[0]!.name)).toBeNull();

      // FEED PARITY (spec test 12): exactly one crew_renamed auto_apply row for the pair, and no
      // crew_removed/crew_added rows naming either side.
      const feed = (await sql!.unsafe(
        `select change_kind, entity_ref from public.show_change_log
          where show_id = $1 and source = 'auto_apply'`,
        [showId],
      )) as unknown as Array<{ change_kind: string; entity_ref: string }>;
      expect(feed.filter((r) => r.change_kind === "crew_renamed")).toHaveLength(1);
      expect(
        feed.some((r) => r.change_kind === "crew_removed" && r.entity_ref === LINK_CREW[0]!.name),
      ).toBe(false);
      expect(
        feed.some((r) => r.change_kind === "crew_added" && r.entity_ref === renamed[0]!.name),
      ).toBe(false);
    },
  );

  test.skipIf(!shouldRun)(
    "MI-13 rename end-to-end: hold; STALE accept stays held; version-bound accept links",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({ driveFileId: drive, crew: LINK_CREW, lastSeen: T0 });
      const before = await readCrewRow(showId, LINK_CREW[0]!.name);

      // Name AND email both change (Levenshtein-close name) → MI-13 → hold.
      const renamed: Crew[] = [{ name: "Link Crew A2", email: "different@x.example" }];
      const held = await runManual(drive, { modifiedTime: T1, parse: makeParse(renamed) });
      expect(held.outcome).toBe("shrink_held");
      const heldModifiedTime = (held as Extract<typeof held, { outcome: "shrink_held" }>)
        .heldModifiedTime;
      // Row untouched while held.
      expect((await readCrewRow(showId, LINK_CREW[0]!.name))!.id).toBe(before!.id);

      // GUARD (plan-R2 F4): a STALE accept can never apply/link — re-holds, row untouched.
      const stale = await runManual(drive, {
        modifiedTime: T1,
        parse: makeParse(renamed),
        acceptShrink: true,
        expectedModifiedTime: "2020-01-01T00:00:00.000Z",
      });
      expect(stale.outcome).toBe("shrink_held");
      expect((await readCrewRow(showId, LINK_CREW[0]!.name))!.id).toBe(before!.id);
      expect(await readCrewRow(showId, renamed[0]!.name)).toBeNull();

      // Version-bound accept → applies AND identity-links (confirm = vouch).
      const accepted = await runManual(drive, {
        modifiedTime: T1,
        parse: makeParse(renamed),
        acceptShrink: true,
        expectedModifiedTime: heldModifiedTime,
      });
      expect(accepted.outcome).toBe("applied");
      const after = await readCrewRow(showId, renamed[0]!.name);
      expect(after).not.toBeNull();
      expect(after!.id).toBe(before!.id);
      expect(after!.email).toBe(renamed[0]!.email); // upsert refreshed the linked row's fields
      expect(await readCrewRow(showId, LINK_CREW[0]!.name)).toBeNull();
    },
  );
});
