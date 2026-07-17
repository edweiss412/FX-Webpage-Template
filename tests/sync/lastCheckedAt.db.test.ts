import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import { processOneFile, type ProcessOneFileDeps } from "@/lib/sync/runScheduledCronSync";

/**
 * DB-backed end-to-end validation of `shows.last_checked_at` (spec 2026-07-16-last-checked-at):
 * every NON-ERROR cron outcome (applied / pending_review-stage / shrink_held / watermark-skip)
 * bumps `last_checked_at = now()`; ERROR writers (drive_error) and the silent archived skip leave
 * it untouched; and `last_synced_at` behaviour is unchanged (bumped only where it always was).
 *
 * Harness mirrors tests/sync/resyncShrinkHold.db.test.ts verbatim (same env stubs, seedShow /
 * cronDeps / runCron / showStatus / newDrive / DRIVE_PREFIX cleanup / one() / SEED_CREW /
 * SHRUNK_CREW parse dimensions). The pipeline openers commit their own tx, so seeding is COMMITTED
 * and cleaned up by drive_file_id prefix rather than rolled back.
 *
 * Anti-tautology: assertions read the DATA SOURCE `shows` row (last_synced_at / last_checked_at),
 * never a rendering container. Seeds use hours-ago ISO strings derived from Date.now() (never a
 * hardcoded wall-clock), and freshness is asserted via msAgo(...) < 60_000 rather than an absolute
 * instant, so the test cannot pass by accident on a machine with a skewed clock.
 */

const LOCAL_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const FOLDER = "last-checked-at-folder";
const DRIVE_PREFIX = "drive-lca-";

// Absolute watermark instants: seed last_seen at T0; an applying pass lists at T1 (> T0 → the cron
// watermark gate proceeds). Non-zero ms so a ms-dropping comparison cannot accidentally pass either
// way. T0 doubles as the equal-watermark modifiedTime for the skip case (isAtOrBefore is inclusive).
const T0 = "2026-06-09T00:00:00.000Z";
const T1 = "2026-06-10T12:00:00.040Z";

type Crew = { name: string; email: string };

const SEED_CREW: Crew[] = [1, 2, 3, 4, 5].map((i) => ({
  name: `LCA Crew ${i}`,
  email: `lca${i}@x.example`,
}));
const SHRUNK_CREW: Crew[] = SEED_CREW.slice(0, 2);

function makeParse(crew: Crew[]): Record<string, unknown> {
  return {
    show: {
      title: "LCA Show",
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

/** ms since the given instant — freshness helper (bumped writes land < 60s ago). */
function msAgo(d: Date): number {
  return Date.now() - d.getTime();
}

/** N hours before now, as an ISO string. Never a hardcoded wall-clock (anti-tautology). */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function fileMeta(driveFileId: string, modifiedTime: string): DriveListedFile {
  return {
    driveFileId,
    name: "LCA Show",
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
    `delete from public.shows where drive_file_id like '${DRIVE_PREFIX}%'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

/**
 * Seed a last-good show + its crew (committed; published by default).
 * `lastSyncedAt` / `lastCheckedAt` default to now(); `archived` defaults to false.
 */
async function seedShow(opts: {
  driveFileId: string;
  crew: Crew[];
  lastSeen: string;
  lastSyncedAt?: string;
  lastCheckedAt?: string;
  published?: boolean;
  archived?: boolean;
}): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, last_synced_at, last_checked_at, published, archived, last_sync_status)
       values ($1, $2, 'LCA Show', 'Client', 'v4', $3::timestamptz,
               coalesce($4::timestamptz, now()), coalesce($5::timestamptz, now()), $6, $7, 'ok')
       returning id`,
      [
        opts.driveFileId,
        `slug-${opts.driveFileId}`,
        opts.lastSeen,
        opts.lastSyncedAt ?? null,
        opts.lastCheckedAt ?? null,
        opts.published ?? true,
        opts.archived ?? false,
      ],
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

function cronDeps(
  modifiedTime: string,
  parse: Record<string, unknown>,
  overrides: Partial<ProcessOneFileDeps> = {},
): ProcessOneFileDeps {
  return {
    captureBinding: async () => ({ bindingToken: `rev-${modifiedTime}`, modifiedTime }),
    fetchMarkdownAtRevision: async () => "# v4\nLCA Show",
    parseSheet: () => parse,
    enrichWithDrivePins: async () => parse as unknown as ParseResult,
    readRevisionRaceCooldown: async () => null,
    logSync: async () => {},
    publishShowInvalidation: async () => {},
    ...overrides,
  } as unknown as ProcessOneFileDeps;
}

async function runCron(
  driveFileId: string,
  opts: {
    modifiedTime: string;
    parse: Record<string, unknown>;
    overrides?: Partial<ProcessOneFileDeps>;
  },
) {
  const result = await processOneFile(
    driveFileId,
    "cron",
    fileMeta(driveFileId, opts.modifiedTime),
    cronDeps(opts.modifiedTime, opts.parse, opts.overrides),
  );
  if ("skipped" in result) {
    throw new Error("unexpected ConcurrentSyncSkipped — no other sync holds this show's lock");
  }
  return result;
}

/** Non-throwing variant for skip outcomes ({outcome:'skipped'} is NOT the ConcurrentSyncSkipped shape). */
async function runProcess(
  driveFileId: string,
  opts: {
    modifiedTime: string;
    parse: Record<string, unknown>;
    overrides?: Partial<ProcessOneFileDeps>;
  },
) {
  return processOneFile(
    driveFileId,
    "cron",
    fileMeta(driveFileId, opts.modifiedTime),
    cronDeps(opts.modifiedTime, opts.parse, opts.overrides),
  );
}

async function showStatus(showId: string): Promise<{
  last_sync_status: string | null;
  last_synced_at: Date;
  last_checked_at: Date;
}> {
  return one(
    await sql!.unsafe(
      `select last_sync_status, last_synced_at, last_checked_at from public.shows where id = $1`,
      [showId],
    ),
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
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  vi.stubEnv(
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    JSON.stringify({
      client_email: "last-checked-at@test.iam.gserviceaccount.com",
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

describe("shows.last_checked_at — bumped on non-error cron outcomes, not on errors (real DB)", () => {
  test.skipIf(!shouldRun)("applied: both last_synced_at AND last_checked_at bumped", async () => {
    const drive = newDrive();
    const showId = await seedShow({
      driveFileId: drive,
      crew: SEED_CREW,
      lastSeen: T0,
      lastSyncedAt: hoursAgo(3),
      lastCheckedAt: hoursAgo(3),
    });

    const result = await runCron(drive, { modifiedTime: T1, parse: FULL_PARSE });
    expect("skipped" in result ? null : result.outcome).toBe("applied");

    const after = await showStatus(showId);
    expect(after.last_sync_status).toBe("ok");
    expect(msAgo(after.last_synced_at)).toBeLessThan(60_000);
    expect(msAgo(after.last_checked_at)).toBeLessThan(60_000);
  });

  test.skipIf(!shouldRun)(
    "watermark-skip: last_synced_at frozen, last_checked_at bumped",
    async () => {
      const drive = newDrive();
      const frozen = hoursAgo(3);
      // lastSeen is a RECENT absolute watermark; modifiedTime == lastSeen ⇒ isAtOrBefore ⇒ skip.
      const showId = await seedShow({
        driveFileId: drive,
        crew: SEED_CREW,
        lastSeen: T0,
        lastSyncedAt: frozen,
        lastCheckedAt: hoursAgo(3),
      });
      const before = (await showStatus(showId)).last_synced_at.getTime();

      const result = await runProcess(drive, { modifiedTime: T0, parse: FULL_PARSE });
      expect((result as { outcome: string; reason?: string }).outcome).toBe("skipped");
      expect((result as { reason?: string }).reason).toBe("watermark");

      const after = await showStatus(showId);
      // last_synced_at is NOT touched by the skip callback (exact ms equality).
      expect(after.last_synced_at.getTime()).toBe(before);
      expect(msAgo(after.last_checked_at)).toBeLessThan(60_000);
    },
  );

  test.skipIf(!shouldRun)(
    "shrink_held: last_synced_at frozen, last_checked_at bumped",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({
        driveFileId: drive,
        crew: SEED_CREW,
        lastSeen: T0,
        lastSyncedAt: hoursAgo(3),
        lastCheckedAt: hoursAgo(3),
      });
      const before = (await showStatus(showId)).last_synced_at.getTime();

      const result = await runCron(drive, { modifiedTime: T1, parse: SHRUNK_PARSE });
      expect("skipped" in result ? null : result.outcome).toBe("shrink_held");

      const after = await showStatus(showId);
      expect(after.last_sync_status).toBe("shrink_held");
      expect(after.last_synced_at.getTime()).toBe(before); // hold never advances last_synced_at
      expect(msAgo(after.last_checked_at)).toBeLessThan(60_000);
    },
  );

  test.skipIf(!shouldRun)(
    "drive_error: last_synced_at bump PRESERVED, last_checked_at NOT touched",
    async () => {
      const drive = newDrive();
      const frozenChecked = hoursAgo(3);
      const showId = await seedShow({
        driveFileId: drive,
        crew: SEED_CREW,
        lastSeen: T0,
        lastSyncedAt: hoursAgo(3),
        lastCheckedAt: frozenChecked,
      });
      const beforeChecked = (await showStatus(showId)).last_checked_at.getTime();

      const result = await runCron(drive, {
        modifiedTime: T1,
        parse: FULL_PARSE,
        overrides: {
          captureBinding: async () => {
            throw new Error("drive down");
          },
        },
      });
      expect("skipped" in result).toBe(false);

      const after = await showStatus(showId);
      expect(after.last_sync_status).toBe("drive_error");
      // The pre-existing drive_error last_synced_at bump is preserved.
      expect(msAgo(after.last_synced_at)).toBeLessThan(60_000);
      // The error writer must NOT touch last_checked_at (exact ms equality with the seed).
      expect(after.last_checked_at.getTime()).toBe(beforeChecked);
    },
  );

  test.skipIf(!shouldRun)(
    "archived skip: neither last_synced_at nor last_checked_at written",
    async () => {
      const drive = newDrive();
      const showId = await seedShow({
        driveFileId: drive,
        crew: SEED_CREW,
        lastSeen: T0,
        lastSyncedAt: hoursAgo(3),
        lastCheckedAt: hoursAgo(3),
        archived: true,
      });
      const before = await showStatus(showId);

      const result = await runProcess(drive, { modifiedTime: T1, parse: FULL_PARSE });
      expect((result as { outcome: string }).outcome).toBe("skipped");

      const after = await showStatus(showId);
      expect(after.last_synced_at.getTime()).toBe(before.last_synced_at.getTime());
      expect(after.last_checked_at.getTime()).toBe(before.last_checked_at.getTime());
    },
  );

  // pending_review stage is driven by PostgresPipelineTx.updateShowPendingReview, which is not
  // exported for isolated driving. Pin the write structurally: the SQL block bumps last_checked_at.
  test("pending_review stage SQL bumps last_checked_at (source pin)", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    const block = src.slice(
      src.indexOf("async updateShowPendingReview("),
      src.indexOf("async updateShowPendingReview(") + 400,
    );
    expect(block).toContain("last_sync_status = 'pending_review'");
    expect(block).toContain("last_checked_at = now()");
  });
});
