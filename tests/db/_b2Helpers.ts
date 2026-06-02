import postgres, { type Sql, type TransactionSql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Matches tests/db/admin_read_share_token.test.ts:8-12 - is_admin() reads app_metadata.role from auth.jwt().
const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});

// A signed-in NON-admin (crew) session - app_metadata.role is absent/non-admin, so is_admin() is false.
// Used to prove the R4 admin-only gates (readfinalizeowned_b2) reject non-admin PostgREST callers.
const NON_ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000099",
  email: "crew@example.com",
  app_metadata: { role: "crew" },
});

// One shared client for seeds/reads/poll; the race helper opens its own short-lived connections.
const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });
const newConn = (): Sql => postgres(DB_URL, { max: 1, prepare: false });

// Exported so the schema-introspection test (Task 1.1) and any raw-SQL db test can reuse one client
// instead of importing a nonexistent `@/tests/db/_helpers`.
export const sqlClient: Sql = sql;

/** Admin-callable lifecycle + share-token/epoch RPCs, all single-`p_show_id` (closed union -> no injection). */
type AdminRpcFn =
  | "archive_show"
  | "unarchive_show"
  | "publish_show"
  | "rotate_show_share_token"
  | "reset_picker_epoch_atomic";

async function asAdminTx<T>(conn: Sql, body: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return conn.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${ADMIN_CLAIMS}, true)`;
    return body(tx);
  }) as Promise<T>;
}

/** Call a B2 lifecycle/share-token RPC as an admin. Rejects (throws) with the RPC's RAISE message on failure. */
export async function asAdminRpc(fn: AdminRpcFn, args: { p_show_id: string }): Promise<void> {
  // `fn` is a closed union (no injection surface); tx.unsafe is used because postgres.js's identifier
  // helper would escape the dotted "public.<fn>" as a single quoted identifier, which is wrong here.
  await asAdminTx(sql, async (tx) => {
    await tx.unsafe(`select public.${fn}($1::uuid)`, [args.p_show_id]);
  });
}

/** Call unarchive_show as admin and return its boolean result (R8: true iff it performed archived→held). */
export async function unarchiveShowReturning(showId: string): Promise<boolean> {
  return asAdminTx(sql, async (tx) => {
    const [row] = await tx.unsafe(`select public.unarchive_show($1::uuid) as transitioned`, [showId]);
    return (row as unknown as { transitioned: boolean }).transitioned;
  });
}

export async function readShow(showId: string): Promise<Record<string, any>> {
  const [row] = await sql`select * from public.shows where id = ${showId}::uuid`;
  if (!row) throw new Error(`readShow: show not found (${showId})`);
  return row;
}

export async function readShareToken(showId: string): Promise<{ share_token: string }> {
  const [row] = await sql`select share_token from public.show_share_tokens where show_id = ${showId}::uuid`;
  if (!row) throw new Error(`readShareToken: token not found (${showId})`);
  return row as { share_token: string };
}

export async function scratchCount(driveFileId: string): Promise<{
  pending_syncs: number;
  pending_ingestions: number;
  deferred_ingestions: number;
}> {
  const [ps] = await sql`select count(*)::int n from public.pending_syncs      where drive_file_id = ${driveFileId}`;
  const [pi] = await sql`select count(*)::int n from public.pending_ingestions where drive_file_id = ${driveFileId}`;
  const [di] = await sql`select count(*)::int n from public.deferred_ingestions where drive_file_id = ${driveFileId}`;
  if (!ps || !pi || !di) throw new Error(`scratchCount: count query returned no row (${driveFileId})`);
  return { pending_syncs: ps.n, pending_ingestions: pi.n, deferred_ingestions: di.n };
}

type ScratchTable = "pending_syncs" | "pending_ingestions" | "deferred_ingestions";
type SeedOpts = {
  archived?: boolean;
  published?: boolean;
  archivedAtNull?: boolean; // legacy-shaped archived row (archived=true, archived_at NULL)
  requiresResync?: boolean;
  scratchTables?: ScratchTable[]; // seed EXACTLY these live non-wizard scratch rows (one per table)
  deferral?: "permanent_ignore" | "defer_until_modified"; // kind for a seeded deferred_ingestions row
  finalizeOwned?: boolean; // seed shows_pending_changes + in_progress wizard_finalize_checkpoints
};

export type SeededShow = {
  showId: string;
  driveFileId: string;
  originalToken: string;
  originalEpoch: number;
};

async function seedShow(opts: SeedOpts = {}): Promise<SeededShow> {
  const showId = randomUUID();
  const driveFileId = `drive-${randomUUID()}`;
  const archived = opts.archived ?? false;
  const published = opts.published ?? !archived; // Live by default; Archived rows are unpublished
  const archivedAt = archived && !opts.archivedAtNull ? sql`now()` : null;
  await sql`
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version,
                              archived, published, archived_at, requires_resync, picker_epoch)
    values (${showId}::uuid, ${driveFileId}, ${`slug-${showId.slice(0, 8)}`}, 'Test Show', 'Client',
            'v1', ${archived}, ${published}, ${archivedAt}, ${opts.requiresResync ?? false}, 1)`;
  // The show_share_tokens row is created by the shows_create_share_token_after_insert trigger
  // (supabase/migrations/20260523000002_show_share_tokens.sql:69-70) - do NOT insert it here (PK collision).
  const { share_token: originalToken } = await readShareToken(showId);

  const scratch = new Set(opts.scratchTables ?? []);
  if (scratch.has("pending_syncs")) {
    // warning_summary is NOT NULL with no default (internal_and_admin.sql:157); wizard_session_id=null +
    // wizard_approved=false satisfies the pending_syncs_wizard_approved_requires_session CHECK.
    await sql`insert into public.pending_syncs (drive_file_id, staged_modified_time, parse_result, source_kind, warning_summary, wizard_session_id)
              values (${driveFileId}, now(), '{}'::jsonb, 'cron', '', null)`;
  }
  if (scratch.has("pending_ingestions")) {
    await sql`insert into public.pending_ingestions (drive_file_id, drive_file_name, last_error_code, last_error_message, wizard_session_id)
              values (${driveFileId}, 'sheet.xlsx', 'PARSE_FAILED', 'boom', null)`;
  }
  if (scratch.has("deferred_ingestions")) {
    await sql`insert into public.deferred_ingestions (drive_file_id, deferred_kind, deferred_by_email, wizard_session_id)
              values (${driveFileId}, ${opts.deferral ?? "permanent_ignore"}, 'dlarson@fxav.net', null)`;
  }
  if (opts.finalizeOwned) {
    const wiz = randomUUID();
    await sql`insert into public.shows_pending_changes (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
              values (${wiz}::uuid, ${driveFileId}, ${showId}::uuid, '{}'::jsonb, 'dlarson@fxav.net', now())`;
    await sql`insert into public.wizard_finalize_checkpoints (wizard_session_id, status)
              values (${wiz}::uuid, 'in_progress')`;
  }
  return { showId, driveFileId, originalToken, originalEpoch: 1 };
}

export const seedLiveShowWithToken = (opts: { withScratch?: boolean } = {}) =>
  seedShow({
    archived: false,
    published: true,
    scratchTables: opts.withScratch
      ? ["pending_syncs", "pending_ingestions", "deferred_ingestions"]
      : [],
  });
export const seedArchivedShow = () => seedShow({ archived: true, published: false });
/**
 * A DRIFTED archived row: archived=true AND published=true (the two booleans are independent — no CHECK
 * couples them). archive_show_core always clears published, but a legacy/drifted row may carry published=true;
 * Unarchive must still land Held (published=false), not revive straight to Live. Subject of the R4 F1 regression.
 */
export const seedArchivedButPublishedShow = () => seedShow({ archived: true, published: true });
export const seedLegacyArchivedShow = (
  opts: { archivedAtNull?: boolean; withScratchAndDeferral?: boolean } = {},
) =>
  seedShow({
    archived: true,
    published: false,
    archivedAtNull: opts.archivedAtNull ?? true,
    scratchTables: opts.withScratchAndDeferral
      ? ["pending_syncs", "pending_ingestions", "deferred_ingestions"]
      : [],
  });
export const seedHeldShow = (
  opts: {
    requiresResync?: boolean;
    scratch?: ScratchTable;
    deferral?: SeedOpts["deferral"];
    sheetUnchanged?: boolean;
  } = {},
) =>
  seedShow({
    archived: false,
    published: false,
    requiresResync: opts.requiresResync ?? false,
    scratchTables: opts.scratch ? [opts.scratch] : opts.deferral ? ["deferred_ingestions"] : [],
    ...(opts.deferral ? { deferral: opts.deferral } : {}),
  });
export const seedFinalizeOwnedShow = () =>
  seedShow({ archived: false, published: false, finalizeOwned: true });

/** A Live (auto-published) show carrying a valid unpublish_token - the token-Unpublish path's subject. */
export async function seedAutoPublishedShowWithUnpublishToken(
  opts: { withScratch?: boolean } = {},
): Promise<SeededShow & { slug: string; unpublishToken: string }> {
  const seeded = await seedShow({
    archived: false,
    published: true,
    scratchTables: opts.withScratch
      ? ["pending_syncs", "pending_ingestions", "deferred_ingestions"]
      : [],
  });
  const unpublishToken = randomUUID();
  await sql`
    update public.shows
       set unpublish_token = ${unpublishToken}::uuid, unpublish_token_expires_at = now() + interval '24 hours'
     where id = ${seeded.showId}::uuid`;
  const [row] = await sql`select slug from public.shows where id = ${seeded.showId}::uuid`;
  if (!row) throw new Error(`seedAutoPublishedShowWithUnpublishToken: show not found (${seeded.showId})`);
  return { ...seeded, slug: row.slug, unpublishToken };
}

export async function deferralCount(driveFileId: string): Promise<number> {
  const [r] = await sql`select count(*)::int n from public.deferred_ingestions where drive_file_id = ${driveFileId}`;
  if (!r) throw new Error(`deferralCount: count query returned no row (${driveFileId})`);
  return r.n;
}

export async function pendingSyncCount(driveFileId: string): Promise<number> {
  const [r] = await sql`select count(*)::int n from public.pending_syncs where drive_file_id = ${driveFileId}`;
  if (!r) throw new Error(`pendingSyncCount: count query returned no row (${driveFileId})`);
  return r.n;
}

/**
 * The comparable archived end-state used by the token-Unpublish<->archive_show parity test. The literal
 * share_token is random per-show, so it cannot appear in a cross-show equality - instead derive
 * `share_token_rotated` against each show's own `originalToken`. Both seeds start at picker_epoch=1, so
 * both post-archive snapshots carry picker_epoch=2 and are deep-equal when the mutation sets match.
 */
export async function archivedStateSnapshot(s: SeededShow): Promise<Record<string, unknown>> {
  const show = await readShow(s.showId);
  const token = (await readShareToken(s.showId)).share_token;
  const scratch = await scratchCount(s.driveFileId);
  return {
    archived: show.archived,
    published: show.published,
    archived_at_set: show.archived_at != null,
    unpublish_token_null: show.unpublish_token == null,
    share_token_rotated: token !== s.originalToken,
    picker_epoch: show.picker_epoch,
    scratch,
  };
}

/** Run ONLY the migration's backfill statements (legacy-scoped, idempotent) - used by the backfill test. */
export async function applyMigrationBackfill(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`update public.show_share_tokens t set share_token = encode(extensions.gen_random_bytes(32),'hex')
               from public.shows s where s.id = t.show_id and s.archived = true and s.archived_at is null`;
    await tx`update public.shows set picker_epoch = picker_epoch + 1, picker_epoch_bumped_at = clock_timestamp(), archived_at = now()
              where archived = true and archived_at is null`;
    await tx`delete from public.pending_syncs       ps using public.shows s where s.drive_file_id = ps.drive_file_id and s.archived = true and ps.wizard_session_id is null`;
    await tx`delete from public.pending_ingestions  pi using public.shows s where s.drive_file_id = pi.drive_file_id and s.archived = true and pi.wizard_session_id is null`;
    await tx`delete from public.deferred_ingestions di using public.shows s where s.drive_file_id = di.drive_file_id and s.archived = true and di.wizard_session_id is null`;
  });
}

/**
 * Deterministically force a TOCTOU race against a committing Archive. Connection A grabs + HOLDS the
 * show's advisory lock; connection B fires `otherFn` and blocks on the lock; we poll pg_stat_activity
 * until B is genuinely Lock-waiting (no fixed sleep); A then runs archive_show (re-entrant lock) and
 * commits - freeing the lock so B proceeds with the show already archived+committed. Returns whether B
 * threw. This is the substrate for both the archive-idempotency and the DEF-1 archived-immutability
 * negative-regression tests: with the fix (re-read state AFTER the lock) B no-ops/refuses; with the bug
 * (stale pre-lock read) B mutates the now-archived show.
 */
async function raceArchiveAgainst(
  showId: string,
  otherFn: AdminRpcFn,
): Promise<{ concurrentThrew: boolean }> {
  const { drive_file_id: drive } = await readShow(showId);
  const a = newConn();
  const b = newConn();
  let concurrentThrew = false;
  try {
    let signalALocked!: () => void;
    const aLocked = new Promise<void>((r) => (signalALocked = r));
    let releaseA!: () => void;
    const aMayProceed = new Promise<void>((r) => (releaseA = r));

    const aTxn = asAdminTx(a, async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('show:' || ${drive}))`;
      signalALocked(); // A now holds the lock
      await aMayProceed; // keep the txn (and lock) open
      await tx`select public.archive_show(${showId}::uuid)`;
    });
    await aLocked;

    const bTxn = asAdminTx(b, async (tx) => {
      await tx.unsafe(`select public.${otherFn}($1::uuid)`, [showId]); // blocks on A's lock
    }).catch(() => {
      concurrentThrew = true;
    });

    // Wait until B is genuinely Lock-waiting on otherFn before releasing A (bounded; fail loud).
    const deadline = 5_000;
    for (let waited = 0; ; waited += 25) {
      const [row] = await sql`
        select count(*)::int n from pg_stat_activity
         where wait_event_type = 'Lock' and state = 'active' and query ilike ${"%" + otherFn + "%"}`;
      if (!row) throw new Error("raceArchiveAgainst: pg_stat_activity count query returned no row");
      if (row.n >= 1) break;
      if (waited >= deadline) {
        throw new Error(`raceArchiveAgainst: B never reached Lock-wait on ${otherFn}`);
      }
      await new Promise((r) => setTimeout(r, 25));
    }

    releaseA();
    await Promise.all([aTxn, bTxn]);
  } finally {
    await a.end({ timeout: 5 });
    await b.end({ timeout: 5 });
  }
  return { concurrentThrew };
}

/** A second archive_show racing a committing archive must no-op (token/epoch change exactly once). */
export async function archiveRaceExactlyOnce(showId: string): Promise<void> {
  await raceArchiveAgainst(showId, "archive_show");
}

/**
 * A rotate/reset racing a committing archive must REFUSE (DEF-1). Returns concurrentThrew=true iff the
 * post-lock immutability guard fired; a stale pre-lock guard would let it mutate the archived show.
 */
export async function archivedImmutabilityRace(
  showId: string,
  otherFn: "rotate_show_share_token" | "reset_picker_epoch_atomic",
): Promise<{ concurrentThrew: boolean }> {
  return raceArchiveAgainst(showId, otherFn);
}

/** Read the finalize-owned predicate as an ADMIN (the dashboard path). Returns the boolean result. */
export async function readFinalizeOwnedAsAdmin(showId: string): Promise<boolean> {
  return asAdminTx(sql, async (tx) => {
    const [row] = await tx.unsafe(`select public.readfinalizeowned_b2($1::uuid) as owned`, [showId]);
    return (row as unknown as { owned: boolean }).owned;
  });
}

/** Call the finalize-owned predicate as a signed-in NON-admin (crew). Rejects with the RPC's RAISE on the admin gate. */
export async function callReadFinalizeOwnedAsNonAdmin(showId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${NON_ADMIN_CLAIMS}, true)`;
    await tx.unsafe(`select public.readfinalizeowned_b2($1::uuid)`, [showId]);
  });
}

export async function closeB2Helpers(): Promise<void> {
  await sql.end({ timeout: 5 });
}
