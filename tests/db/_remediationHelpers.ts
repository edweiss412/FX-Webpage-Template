import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";

const LOCAL_DEFAULT = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * DESTRUCTIVE-SUITE GUARD (adversarial R9 HIGH). This suite applies the full
 * remediation migration, INCLUDING the F4 purge keyed to 30 REAL validation
 * wizard-session ids. It must never connect to a remote host:
 *   - NO TEST_DATABASE_URL / DATABASE_URL fallback — in this repo
 *     TEST_DATABASE_URL is the validation project (.env.local);
 *   - the URL host must be loopback, asserted BEFORE postgres() is invoked
 *     (URL parse only — no connection is ever attempted on refusal).
 * Validation access for this migration lives ONLY in the plan's Task 2.5
 * surgical-apply close-out commands — never in any test run.
 */
export function assertLocalDbUrl(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`_remediationHelpers: unparseable database URL (${url})`);
  }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]" && host !== "::1") {
    throw new Error(
      `_remediationHelpers: REFUSING non-local database host "${host}". ` +
        "This suite applies the destructive F2/F4 remediation migration and only " +
        "runs against local Supabase. Set LOCAL_TEST_DATABASE_URL to a " +
        "127.0.0.1/localhost URL (TEST_DATABASE_URL is the validation project " +
        "and is intentionally ignored by this helper).",
    );
  }
  return url;
}

const DB_URL = assertLocalDbUrl(process.env.LOCAL_TEST_DATABASE_URL ?? LOCAL_DEFAULT);

export const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });
export const newConn = (): Sql => postgres(DB_URL, { max: 1, prepare: false });

export const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260611000001_onboarding_fixups_remediation.sql",
);
export const MARKER_KEY = "onboarding_fixups_watermark_reset";

// One of the 30 synthetic validation session ids the F4 purge enumerates
// (Task 2.1 re-capture 2026-06-12 — the plan's original 18 grew to 30).
// Seeding rows under it locally proves the purge actually deletes by EXACT
// id — and that a non-listed id survives.
export const PURGED_SESSION_ID = "02304ebb-1d29-4a7e-b042-86b893247240";

/**
 * Run the WHOLE migration file (marker table + windowed reset + purge). One "pass".
 * The file carries an explicit `begin;`/`commit;` wrap (R59-2 — the psql deploy path
 * autocommits per statement), and postgres.js rejects explicit transaction control on
 * a pooled connection (UNSAFE_TRANSACTION: "Only use sql.begin, sql.reserved or
 * max: 1"). Each pass therefore runs on a dedicated max-1 connection; callers may
 * pass their own (the R12-2 race test supplies one so it can observe lock-blocking).
 */
export async function runRemediationPass(conn?: Sql): Promise<void> {
  const file = readFileSync(MIGRATION_PATH, "utf8");
  if (conn) {
    await conn.unsafe(file);
    return;
  }
  const c = newConn();
  try {
    await c.unsafe(file);
  } finally {
    await c.end();
  }
}

/** Delete all pass markers → the next run is "pass 1" (prev_pass IS NULL). */
export async function resetPassMarkers(): Promise<void> {
  await sql`delete from public.data_migration_markers where key = ${MARKER_KEY}`;
}

/** Simulate a historical pass at now() - <interval> without sleeping. */
export async function seedPassMarker(agoInterval: string): Promise<void> {
  await sql.unsafe(
    `insert into public.data_migration_markers (key, executed_at)
       values ($1, now() - $2::interval)`,
    [MARKER_KEY, agoInterval],
  );
}

export type SeededShow = { id: string; driveFileId: string };

export async function seedShow(opts: { watermark: string | null }): Promise<SeededShow> {
  const driveFileId = `remed-${randomUUID()}`;
  const rows = await sql<{ id: string }[]>`
    insert into public.shows
      (drive_file_id, slug, title, client_label, template_version, last_seen_modified_time)
    values
      (${driveFileId}, ${`remed-${randomUUID()}`}, 'Remediation Fixture', 'Client', 'v1',
       ${opts.watermark})
    returning id`;
  return { id: rows[0]!.id, driveFileId };
}

export async function seedCrew(showId: string): Promise<void> {
  await sql`insert into public.crew_members (show_id, name, role)
            values (${showId}, ${`Crew ${randomUUID()}`}, 'A1')`;
}

/** Audit summary shapes (verified against the live writers — see file header). */
export const BROKEN_FIRST_SEEN = { title: "x", source: "onboarding_finalize" };
export const BROKEN_CAS = { title: "x", source: "onboarding_finalize_cas" };
export const F1_CAS = {
  title: "x",
  source: "onboarding_finalize_cas",
  crewCount: 6,
  roomCount: 7,
  warningCount: 0,
};
export const NON_WIZARD = { title: "x", crewCount: 6, roomCount: 7, warningCount: 0 };

export async function seedAudit(opts: {
  showId: string;
  driveFileId: string;
  summary: Record<string, string | number>;
  stagedModifiedTime: string;
  /** sync_audit.applied_at = now() - this interval (default '0 seconds'). */
  appliedAtAgo?: string;
}): Promise<void> {
  await sql.unsafe(
    `insert into public.sync_audit
       (show_id, drive_file_id, applied_at, applied_by, staged_id,
        triggered_review_items, reviewer_choices, derived_side_effects,
        parse_result_summary, staged_modified_time)
     values ($1::uuid, $2, now() - $3::interval, 'remediation-test@example.com',
             gen_random_uuid(), '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
             $4::jsonb, $5::timestamptz)`,
    [
      opts.showId,
      opts.driveFileId,
      opts.appliedAtAgo ?? "0 seconds",
      // sql.json(raw object), NOT JSON.stringify — postgres.js serializes a
      // $N::jsonb param itself; a pre-stringified value double-encodes to a jsonb
      // STRING scalar, so `parse_result_summary->>'source'` reads null and every
      // Arm A/B predicate silently never matches (postgres.js jsonb double-encode).
      sql.json(opts.summary),
      opts.stagedModifiedTime,
    ],
  );
}

export async function readWatermark(showId: string): Promise<string | null> {
  const rows = await sql<{ last_seen_modified_time: Date | null }[]>`
    select last_seen_modified_time from public.shows where id = ${showId}`;
  return rows[0]!.last_seen_modified_time?.toISOString() ?? null;
}

export async function setWatermark(showId: string, ts: string | null): Promise<void> {
  await sql`update public.shows set last_seen_modified_time = ${ts} where id = ${showId}`;
}
