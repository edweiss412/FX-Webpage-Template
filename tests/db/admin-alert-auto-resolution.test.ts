import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

// S1 (docs/superpowers/specs/2026-07-03-admin-alert-auto-resolution.md#s1). Proves the
// `published` false->true row trigger resolves open SHOW_UNPUBLISHED alerts no matter which
// writer performs the flip, plus the one-time data repair for alerts stranded before the
// trigger existed. `runPsql` pattern from tests/db/b2-lifecycle-rpc-meta.test.ts:1-16.
//
// The test connection is the `postgres` superuser (databaseUrl below), which bypasses RLS and
// function EXECUTE grants outright — so publish_show's admin gate is exercised purely via
// is_admin()'s auth.jwt() claims read, not via role-switching. `request.jwt.claims` is set with
// `set local` inside an explicit `begin; ... commit;` block: under psql's default autocommit,
// each bare statement is its own implicit transaction, so a bare `set local` (no surrounding
// `begin`) silently no-ops for the next statement (confirmed via a "SET LOCAL can only be used
// in transaction blocks" warning during development) — the explicit transaction is load-bearing,
// not decorative.

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const ROOT = process.cwd();
const MIGRATION_PATH = join(
  ROOT,
  "supabase/migrations/20260703210000_admin_alert_auto_resolution.sql",
);

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function applyMigrationFile(): string {
  return execFileSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt", "-f", MIGRATION_PATH],
    { encoding: "utf8" },
  ).trim();
}

const createdShowIds: string[] = [];

// Known-minimal valid `shows` insert (mirrors tests/db/rls-runtime.test.ts:30 and
// tests/db/b2-first-published-alert-tx-boundary.test.ts:26-38's column set).
function insertShowSql(id: string, published: boolean, archived = false): string {
  const suffix = id.slice(0, 8);
  createdShowIds.push(id);
  return `
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version, published, archived)
    values ('${id}'::uuid, 'drive-aar-${suffix}', 'slug-aar-${suffix}', 'AAR Show ${suffix}', 'Client', 'v1', ${published}, ${archived});
  `;
}

// `do $$ ... perform ... $$;` (rather than a bare `select public.upsert_admin_alert(...)`)
// suppresses the returned uuid row so it doesn't pollute -qAt's tuple-only output when this is
// spliced ahead of a script's real assertion query.
function upsertOpenAlertSql(showId: string): string {
  return `do $$ begin perform public.upsert_admin_alert('${showId}'::uuid, 'SHOW_UNPUBLISHED', '{}'::jsonb); end $$;`;
}

// Calls publish_show as an admin (via the request.jwt.claims GUC — see file-header note) inside
// its own explicit transaction. The `do $$ ... perform ... $$` wrapper both suppresses void
// output and lets a raised exception propagate out of runPsql as a rejected/thrown execFileSync
// call, exactly like a bare `select public.publish_show(...)` would.
function publishShowAsAdminSql(showId: string): string {
  return `
    begin;
    set local request.jwt.claims = '{"app_metadata":{"role":"admin"}}';
    do $$ begin perform public.publish_show('${showId}'::uuid); end $$;
    commit;
  `;
}

// Scalar expression (no leading `select`, no trailing `;`) so callers can embed it inline
// alongside other columns, or wrap it standalone via alertStateSql below.
function alertStateExpr(showId: string): string {
  return `coalesce((select (resolved_at is not null)::text || '|' || coalesce(resolved_by, 'NULL')
                       from public.admin_alerts
                      where show_id = '${showId}'::uuid and code = 'SHOW_UNPUBLISHED'), 'NONE')`;
}

function alertStateSql(showId: string): string {
  return `select ${alertStateExpr(showId)};`;
}

afterAll(() => {
  if (createdShowIds.length === 0) return;
  const idList = createdShowIds.map((id) => `'${id}'::uuid`).join(", ");
  runPsql(`
    delete from public.admin_alerts where show_id in (${idList});
    delete from public.shows where id in (${idList});
  `);
});

describe("S1 — SHOW_UNPUBLISHED resolves via the published false->true row trigger", () => {
  test("raw UPDATE shows SET published=true resolves the alert (resolved_by stays NULL)", () => {
    const showId = randomUUID();
    const out = runPsql(`
      ${insertShowSql(showId, false)}
      ${upsertOpenAlertSql(showId)}
      update public.shows set published = true where id = '${showId}'::uuid;
      ${alertStateSql(showId)}
    `);
    expect(out).toBe("true|NULL");
  });

  test("publish_show RPC on an unpublished show with an open alert publishes AND resolves in the same tx", () => {
    const showId = randomUUID();
    const out = runPsql(`
      ${insertShowSql(showId, false)}
      ${upsertOpenAlertSql(showId)}
      ${publishShowAsAdminSql(showId)}
      select (select published from public.shows where id = '${showId}'::uuid)::text || '|' ||
             ${alertStateExpr(showId)};
    `);
    expect(out).toBe("true|true|NULL");
  });

  test("refused publish (archived show) raises SHOW_ARCHIVED_IMMUTABLE and leaves the alert open", () => {
    const showId = randomUUID();
    runPsql(`
      ${insertShowSql(showId, false, true)}
      ${upsertOpenAlertSql(showId)}
    `);

    expect(() => runPsql(publishShowAsAdminSql(showId))).toThrow(/SHOW_ARCHIVED_IMMUTABLE/);

    const out = runPsql(`
      select (select published from public.shows where id = '${showId}'::uuid)::text || '|' ||
             ${alertStateExpr(showId)};
    `);
    expect(out).toBe("false|false|NULL");
  });

  test("published flip on a show with no open alert touches no rows and raises no error", () => {
    const showId = randomUUID();
    const out = runPsql(`
      ${insertShowSql(showId, false)}
      update public.shows set published = true where id = '${showId}'::uuid;
      select count(*)::text from public.admin_alerts where show_id = '${showId}'::uuid;
    `);
    expect(out).toBe("0");
  });

  test("data repair: an INSERT-with-published=true stranded alert is healed by the repair UPDATE alone", () => {
    // INSERT never fires an AFTER UPDATE trigger, so this show's SHOW_UNPUBLISHED alert can only
    // be resolved by the migration's repair UPDATE, never by the trigger — proving the repair
    // block itself, not double-counting trigger coverage.
    const strandedShowId = randomUUID();
    const stillOpenShowId = randomUUID();
    runPsql(`
      ${insertShowSql(strandedShowId, true)}
      ${upsertOpenAlertSql(strandedShowId)}
      ${insertShowSql(stillOpenShowId, false)}
      ${upsertOpenAlertSql(stillOpenShowId)}
    `);

    applyMigrationFile();

    const strandedOut = runPsql(alertStateSql(strandedShowId));
    expect(strandedOut).toBe("true|NULL");

    // Unpublished show + open alert: the repair's `s.published = true` predicate must NOT touch it.
    const stillOpenOut = runPsql(alertStateSql(stillOpenShowId));
    expect(stillOpenOut).toBe("false|NULL");

    // Apply-twice idempotency: running the file again (third overall apply counting Step 4's
    // setup runs) must not error and must not disturb the already-resolved row.
    expect(() => applyMigrationFile()).not.toThrow();
    const strandedOutAfterReapply = runPsql(alertStateSql(strandedShowId));
    expect(strandedOutAfterReapply).toBe("true|NULL");
  });
});

describe("S3 — landed snapshot_status extraction (current → root, pending IGNORED)", () => {
  // Proves defaultReadLandedSnapshotStatus's path shape against real shows.diagrams JSONB rows:
  // the extraction mirrors resolveCurrentDiagrams (lib/data/diagrams.ts:54) — current wins,
  // bare-root fallback, and a `pending` 'complete' NEVER surfaces (pre-promotion, must not
  // resolve S3 alerts). `lib/sync/applyStaged.ts:defaultReadLandedSnapshotStatus`.
  const REV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const extractionSql = (id: string) =>
    `select coalesce(diagrams->'current'->>'snapshot_status', diagrams->>'snapshot_status')
       from public.shows where id = '${id}'::uuid;`;

  test("wrapped {current}, bare root, and pending-complete/current-partial rows each extract correctly", () => {
    const id = randomUUID();

    // Wrapped {current}: current status wins.
    const wrapped = runPsql(`
      ${insertShowSql(id, true)}
      update public.shows
         set diagrams = '{"current":{"snapshot_revision_id":"${REV}","snapshot_status":"complete"},"pending":null}'::jsonb
       where id = '${id}'::uuid;
      ${extractionSql(id)}
    `);
    expect(wrapped).toBe("complete");

    // Bare-root PersistedDiagrams (no wrapper): root status is read.
    const bare = runPsql(`
      update public.shows
         set diagrams = '{"snapshot_revision_id":"${REV}","snapshot_status":"complete"}'::jsonb
       where id = '${id}'::uuid;
      ${extractionSql(id)}
    `);
    expect(bare).toBe("complete");

    // Pending 'complete' but current 'partial_failure': pending is ignored → 'partial_failure'.
    const pendingComplete = runPsql(`
      update public.shows
         set diagrams = '{"current":{"snapshot_revision_id":"${REV}","snapshot_status":"partial_failure"},"pending":{"snapshot_revision_id":"${REV}","snapshot_status":"complete"}}'::jsonb
       where id = '${id}'::uuid;
      ${extractionSql(id)}
    `);
    expect(pendingComplete).toBe("partial_failure");
  });
});
