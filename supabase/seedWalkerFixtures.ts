/**
 * supabase/seedWalkerFixtures.ts — M12.12 Task 12 walker-only locked seed
 * extension.
 *
 * The deep-link affordance walker (tests/e2e/deep-link-walker.spec.ts) is
 * READ-ONLY on locked tables (plan-wide invariant 2). The show-state /
 * first-seen / per-show-alert fixtures it depends on are seeded HERE, inside
 * one transaction that takes the per-show advisory lock for every
 * drive_file_id it mutates — in drive_file_id-sorted (ascending) order,
 * matching the base seed's `_locked_seed_ids` sweep (supabase/seed.ts) so the
 * two seeders can't deadlock under concurrent runs.
 *
 * Wired into tests/e2e/help-docs-setup.ts AFTER `pnpm db:seed`; the base
 * seed's prefix-wide `seed-fixture:%` cleanup removes these rows on the next
 * `pnpm db:seed`, so a base-seed-only run leaves NO walker rows behind
 * (capture isolation — Step 12.4).
 *
 * Standalone tsx script: `pnpm dlx tsx supabase/seedWalkerFixtures.ts`.
 * NOTE: do NOT import from supabase/seed.ts — it runs main() (psql side
 * effects) at import time. The small SQL helpers are duplicated instead.
 */
import { execFileSync } from "node:child_process";

// Same databaseUrl resolution as supabase/seed.ts:11-13.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// The FOUR locked drive_file_ids this script mutates, in drive_file_id-sorted
// (ascending) order. Locks are acquired in EXACTLY this order — pinned by
// tests/db/seed-restage-fixture.test.ts (set + order).
const WALKER_DRIVE_FILE_IDS = [
  "seed-fixture:walker-archived",
  "seed-fixture:walker-drive-error",
  "seed-fixture:walker-first-seen",
  "seed-fixture:walker-pending-review",
] as const;

// Runtime guard mirroring the structural pin: the lock order IS the sorted
// order. A reordered edit fails loud here before touching the DB.
for (let i = 1; i < WALKER_DRIVE_FILE_IDS.length; i += 1) {
  const prev = WALKER_DRIVE_FILE_IDS[i - 1];
  const curr = WALKER_DRIVE_FILE_IDS[i];
  // `undefined` is unreachable under the loop bounds; folding it into the
  // throw keeps noUncheckedIndexedAccess satisfied without a `!` assertion.
  if (prev === undefined || curr === undefined || prev >= curr) {
    throw new Error(
      "WALKER_DRIVE_FILE_IDS must stay drive_file_id-sorted ascending — " +
        "the advisory locks are acquired in array order (deadlock-order contract).",
    );
  }
}

// Fixed staged UUID the walker looks up (tests/e2e/deep-link-walker.spec.ts:15).
const FIRST_SEEN_STAGED_ID = "11111111-1111-4111-8111-111111111111";

// Base-seed RPAS fixture slug — the show the walker's per-show matrix rows
// navigate (tests/e2e/deep-link-walker.spec.ts:21).
const RPAS_SLUG = "2026-03-retirement-plan-advisor-institute-central-2026";

// Catalog code PerShowAlertSection actually renders: DRIVE_FETCH_FAILED has a
// non-null dougFacing with NO <…> placeholders (lib/messages/catalog.ts:57-69),
// so safeDougFacing() in components/admin/PerShowAlertSection.tsx returns real
// copy and the alerts section (and its help affordance) materializes.
const WALKER_ALERT_CODE = "DRIVE_FETCH_FAILED";

const SEED_TIMESTAMP = "2026-03-24T15:00:00.000Z";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlJson(value: unknown): string {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function sqlTimestamp(value: string): string {
  return `${sqlString(value)}::timestamptz`;
}

type WalkerShow = {
  driveFileId: (typeof WALKER_DRIVE_FILE_IDS)[number];
  slug: string;
  title: string;
  lastSyncStatus: string;
  lastSyncError: string | null;
  archived: boolean;
  published: boolean;
  archivedAt: string | null;
};

// Distinct slugs + per-state lifecycle triples. INSERT column list starts
// from showInsertSql (supabase/seed.ts:192-244) for the NOT-NULL/payload
// columns, EXTENDED with explicit archived / published / archived_at —
// copying showInsertSql verbatim would seed the archived fixture as active
// (schema defaults archived=false, published=true).
const WALKER_SHOWS: WalkerShow[] = [
  {
    driveFileId: "seed-fixture:walker-pending-review",
    slug: "walker-pending-review-2026",
    title: "Walker Pending Review Fixture 2026",
    lastSyncStatus: "pending_review",
    lastSyncError: null,
    archived: false,
    published: true,
    archivedAt: null,
  },
  {
    driveFileId: "seed-fixture:walker-archived",
    slug: "walker-archived-2026",
    title: "Walker Archived Fixture 2026",
    lastSyncStatus: "ok",
    lastSyncError: null,
    archived: true,
    published: false,
    archivedAt: SEED_TIMESTAMP,
  },
  {
    driveFileId: "seed-fixture:walker-drive-error",
    slug: "walker-drive-error-2026",
    title: "Walker Drive Error Fixture 2026",
    lastSyncStatus: "drive_error",
    lastSyncError: "DRIVE_FETCH_FAILED",
    archived: false,
    published: true,
    archivedAt: null,
  },
];

const walkerDates = {
  travelIn: "2026-03-23",
  set: "2026-03-24",
  showDays: ["2026-03-25", "2026-03-26"],
  travelOut: "2026-03-27",
};

function walkerShowInsertSql(show: WalkerShow): string {
  return `
    insert into public.shows (
      drive_file_id,
      slug,
      title,
      client_label,
      client_contact,
      template_version,
      venue,
      dates,
      event_details,
      agenda_links,
      diagrams,
      opening_reel_drive_file_id,
      opening_reel_drive_modified_time,
      opening_reel_head_revision_id,
      opening_reel_mime_type,
      coi_status,
      pull_sheet,
      last_synced_at,
      last_sync_status,
      last_sync_error,
      last_seen_modified_time,
      archived,
      published,
      archived_at
    )
    values (
      ${sqlString(show.driveFileId)},
      ${sqlString(show.slug)},
      ${sqlString(show.title)},
      'Walker Fixture Client',
      null,
      'v1',
      null,
      ${sqlJson(walkerDates)},
      ${sqlJson({})},
      ${sqlJson([])},
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      ${sqlTimestamp(SEED_TIMESTAMP)},
      ${sqlString(show.lastSyncStatus)},
      ${show.lastSyncError == null ? "null" : sqlString(show.lastSyncError)},
      ${sqlTimestamp(SEED_TIMESTAMP)},
      ${show.archived ? "true" : "false"},
      ${show.published ? "true" : "false"},
      ${show.archivedAt == null ? "null" : sqlTimestamp(show.archivedAt)}
    );
  `;
}

// First-seen pending_syncs fixture — PRODUCTION-SHAPE: mirrors the cron
// writer's insert column list (lib/sync/runScheduledCronSync.ts:663-670 —
// drive_file_id, base_modified_time, staged_modified_time, parse_result,
// triggered_review_items, prior_last_sync_status, prior_last_sync_error,
// staged_id, source_kind, warning_summary, wizard_session_id). The writer's
// on-conflict upsert semantics are replaced by this transaction's
// delete-then-insert. parse_result shape follows the pre-394b7984 walker
// fixture payload (git show 394b7984~1:tests/e2e/deep-link-walker.spec.ts).
function firstSeenInsertSql(): string {
  return `
    insert into public.pending_syncs (
      drive_file_id,
      base_modified_time,
      staged_modified_time,
      parse_result,
      triggered_review_items,
      prior_last_sync_status,
      prior_last_sync_error,
      staged_id,
      source_kind,
      warning_summary,
      wizard_session_id
    )
    values (
      'seed-fixture:walker-first-seen',
      null,
      ${sqlTimestamp(SEED_TIMESTAMP)},
      ${sqlJson({ show: { title: "Walker first-seen affordance fixture" } })},
      ${sqlJson([{ id: "walker-first-seen", invariant: "FIRST_SEEN_REVIEW" }])},
      null,
      null,
      ${sqlString(FIRST_SEEN_STAGED_ID)}::uuid,
      'cron',
      'First-seen review fixture for deep-link affordance walker',
      null
    );
  `;
}

// One unresolved per-show admin alert on the base-seed RPAS show. Idempotent:
// the prior fixture alert is deleted by the stable (show_id, code) pair first
// (unresolved rows only — the admin_alerts_one_unresolved_idx partial unique
// index is scoped to resolved_at IS NULL). admin_alerts is NOT in the per-show
// advisory-lock table set (plan-wide invariant 2) — no lock needed. Column
// shape mirrors the live producer insert (lib/reports/submit.ts:574-576:
// show_id, code, context).
function alertSeedSql(): string {
  return `
    do $$
    begin
      if not exists (select 1 from public.shows where slug = ${sqlString(RPAS_SLUG)}) then
        raise exception 'base-seed show ${RPAS_SLUG} missing — run pnpm db:seed before seedWalkerFixtures';
      end if;
    end $$;

    delete from public.admin_alerts
     where code = ${sqlString(WALKER_ALERT_CODE)}
       and resolved_at is null
       and show_id in (select id from public.shows where slug = ${sqlString(RPAS_SLUG)});

    insert into public.admin_alerts (show_id, code, context)
    select id, ${sqlString(WALKER_ALERT_CODE)}, ${sqlJson({ seed_fixture: "walker" })}
      from public.shows
     where slug = ${sqlString(RPAS_SLUG)};
  `;
}

function walkerSeedSql(): string {
  // Insert-side per-show advisory locks, drive_file_id-sorted ascending
  // (deterministic order matching the base seed's _locked_seed_ids sweep).
  const locks = WALKER_DRIVE_FILE_IDS.map(
    (driveFileId) =>
      `select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));`,
  ).join("\n");

  const idList = WALKER_DRIVE_FILE_IDS.map(sqlString).join(", ");

  return `
    begin;

    ${locks}

    delete from public.pending_syncs where drive_file_id in (${idList});
    delete from public.pending_ingestions where drive_file_id in (${idList});
    delete from public.sync_audit where drive_file_id in (${idList});
    delete from public.shows where drive_file_id in (${idList});

    ${firstSeenInsertSql()}

    ${WALKER_SHOWS.map(walkerShowInsertSql).join("\n")}

    ${alertSeedSql()}

    commit;
  `;
}

function main(): void {
  // Same psql application pattern as supabase/seed.ts:186.
  execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: walkerSeedSql(),
    encoding: "utf8",
  });
  process.stdout.write(
    `Seeded walker fixtures: ${WALKER_SHOWS.length} shows + 1 first-seen pending_sync + 1 ${WALKER_ALERT_CODE} alert.\n`,
  );
}

main();
