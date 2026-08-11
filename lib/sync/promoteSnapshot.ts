import postgres from "postgres";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { revalidateShow } from "@/lib/data/showCacheTag";
import { log } from "@/lib/log";
import { withPromoteLock } from "@/lib/sync/lockedPromoteTx";
import { withShowLock } from "@/lib/sync/lockedShowTx";

const DIAGRAM_BUCKET = "diagram-snapshots";

type PendingPromotionRow = {
  id: string;
  show_id: string;
  drive_file_id: string;
  temp_prefix: string;
  snapshot_revision_id: string;
  asset_count: number;
  claim_token?: string | null;
};

export type PromoteSnapshotStorage = {
  list(prefix: string): Promise<string[]>;
  move(fromPath: string, toPath: string): Promise<void>;
  removePrefix?(prefix: string): Promise<void>;
};

/** Bounded name diagnostics on a comparison-derived `manifest_mismatch`
 *  (spec §4.3). Absent on the rollback-failure and lock-skipped mismatches —
 *  no comparison ran there. */
export type PromoteManifestDeltas = {
  missing: string[];
  extra: string[];
  duplicated: string[];
  mispathed: string[];
  truncated: boolean;
};

export type PromoteSnapshotResult =
  | { outcome: "promoted"; snapshotRevisionId: string }
  | { outcome: "already_promoted"; snapshotRevisionId: string }
  | { outcome: "not_found" }
  | { outcome: "manifest_mismatch"; snapshotRevisionId: string; deltas?: PromoteManifestDeltas }
  | { outcome: "no_pending_payload"; snapshotRevisionId: string };

export type PromoteSnapshotDeps = {
  storage?: PromoteSnapshotStorage;
};

export type RepairSnapshotRollbackResult =
  | { outcome: "repaired"; snapshotRevisionId: string }
  | { outcome: "not_found" }
  | { outcome: "not_stuck"; snapshotRevisionId: string }
  | { outcome: "promote_in_flight"; snapshotRevisionId: string };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("promoteSnapshotUpload requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

/**
 * Required object names for a pending snapshot
 * (spec docs/superpowers/specs/2026-08-10-promote-identity-validation.md §4.1):
 * for every entry with a non-null `snapshotPath`, one `kind='original'` row
 * carrying the FULL `snapshotPath` (path binding applies to every original) plus
 * one `kind='variant'` row per listed variant key (variant keys ARE storage
 * basenames by construction — lib/sync/diagramVariants.ts).
 *
 * Exported because the mocked show-tx seam in the unit suite returns canned rows
 * for ANY `jsonb_array_elements` SQL — SQL semantics are untestable through it,
 * so the real-DB suite evaluates THIS text against Postgres. A copy of the query
 * in the test would prove only that two copies agree.
 *
 * One row per required name, multiplicities preserved (`union all`, no
 * distinct): the `duplicated` delta class is computed from repeated rows. A
 * non-array `variants` value contributes zero names instead of throwing, so the
 * typed mismatch signal is still produced for malformed manifests.
 */
export const EXPECTED_ASSET_NAMES_SQL = `
        select kind, name from (
          select 'original' as kind, e->>'snapshotPath' as name
            from public.shows s,
                 jsonb_array_elements(coalesce(s.diagrams->'pending'->'embeddedImages', '[]'::jsonb)) e
           where s.id = $1::uuid
             and e->>'snapshotPath' is not null
          union all
          select 'variant' as kind, v->>'key' as name
            from public.shows s,
                 jsonb_array_elements(coalesce(s.diagrams->'pending'->'embeddedImages', '[]'::jsonb)) e,
                 jsonb_array_elements(
                   case when jsonb_typeof(e->'variants') = 'array'
                        then e->'variants' else '[]'::jsonb end) v
           where s.id = $1::uuid
             and e->>'snapshotPath' is not null
          union all
          select 'original' as kind, l->>'snapshotPath' as name
            from public.shows s,
                 jsonb_array_elements(coalesce(s.diagrams->'pending'->'linkedFolderItems', '[]'::jsonb)) l
           where s.id = $1::uuid
             and l->>'snapshotPath' is not null
          union all
          select 'variant' as kind, v->>'key' as name
            from public.shows s,
                 jsonb_array_elements(coalesce(s.diagrams->'pending'->'linkedFolderItems', '[]'::jsonb)) l,
                 jsonb_array_elements(
                   case when jsonb_typeof(l->'variants') = 'array'
                        then l->'variants' else '[]'::jsonb end) v
           where s.id = $1::uuid
             and l->>'snapshotPath' is not null
        ) required_names
      `;

export type ExpectedAssetNameRow = { kind: "original" | "variant"; name: string };

function canonicalPrefix(showId: string, snapshotRevisionId: string): string {
  return `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Each delta list is bounded to this many names — diagnostics, not a dump. */
const DELTA_NAME_BOUND = 10;

function boundedDeltas(lists: {
  missing: string[];
  extra: string[];
  duplicated: string[];
  mispathed: string[];
}): PromoteManifestDeltas {
  const truncated = Object.values(lists).some((names) => names.length > DELTA_NAME_BOUND);
  const bound = (names: string[]): string[] => [...names].sort().slice(0, DELTA_NAME_BOUND);
  return {
    missing: bound(lists.missing),
    extra: bound(lists.extra),
    duplicated: bound(lists.duplicated),
    mispathed: bound(lists.mispathed),
    truncated,
  };
}

/** The required-name view of the pending manifest (spec §4.2): basenames for the
 *  set comparison, plus the `duplicated` class (two manifest entries claiming one
 *  basename — unsatisfiable as a set, its own named failure, never `missing`). */
function requiredNameSet(rows: ExpectedAssetNameRow[]): {
  requiredSet: Set<string>;
  duplicated: string[];
} {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.kind === "original" ? basename(row.name) : row.name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    requiredSet: new Set(counts.keys()),
    duplicated: [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  };
}

function listingDeltas(
  requiredSet: Set<string>,
  listedPaths: string[],
): { missing: string[]; extra: string[] } {
  const listedSet = new Set(listedPaths.map(basename));
  return {
    missing: [...requiredSet].filter((name) => !listedSet.has(name)),
    extra: [...listedSet].filter((name) => !requiredSet.has(name)),
  };
}

function storageErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Strip the `<bucket>/` prefix so a path built with `canonicalPrefix`/`tempPrefix`
 *  (which embed `diagram-snapshots/`) becomes the object key the bucket-scoped
 *  client expects. `move` and `removePrefix` already do this; `list` did not,
 *  so it listed a doubled `diagram-snapshots/diagram-snapshots/…` prefix and
 *  returned zero objects — making the promote manifest check always fail and
 *  every diagram-bearing apply roll back (never promote). */
function toObjectKey(path: string): string {
  return path.startsWith(`${DIAGRAM_BUCKET}/`) ? path.slice(DIAGRAM_BUCKET.length + 1) : path;
}

/**
 * The SDK's `list` defaults to 100 objects per call and silently truncates —
 * the live cap is 60 diagrams (MAX_TOTAL_DIAGRAM_ITEMS) x (1 original + up to 3
 * variants) = up to 240 objects, so an unpaginated listing would under-count
 * every variant-bearing snapshot and fail its manifest check. Same limit/offset
 * page loop diagramGc's listPaths already uses.
 */
const STORAGE_PAGE_SIZE = 100;

async function listAllObjectNames(
  bucket: {
    list: (
      prefix: string,
      options: { limit: number; offset: number },
    ) => Promise<{ data: Array<{ name: string }> | null; error: unknown }>;
  },
  objectPrefix: string,
): Promise<string[]> {
  const names: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await bucket.list(objectPrefix, {
      limit: STORAGE_PAGE_SIZE,
      offset,
    });
    if (error) throw error;
    const page = data ?? [];
    for (const entry of page) {
      if (entry.name) names.push(entry.name);
    }
    if (page.length < STORAGE_PAGE_SIZE) break;
    offset += page.length;
  }
  return names;
}

export function defaultStorage(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient> = createSupabaseServiceRoleClient(),
): PromoteSnapshotStorage {
  const bucket = supabase.storage.from(DIAGRAM_BUCKET);
  return {
    async list(prefix) {
      // List by the stripped object key, but return the caller-facing path
      // (with the bucket prefix) so `move` — which re-strips — sees the shape
      // it expects. Paginated: this listing feeds the promote manifest check and
      // the rollback-repair rewind, both of which must see EVERY object.
      const names = await listAllObjectNames(bucket, toObjectKey(prefix));
      return names.map((name) => `${prefix}${name}`);
    },
    async move(fromPath, toPath) {
      const fromObject = fromPath.startsWith(`${DIAGRAM_BUCKET}/`)
        ? fromPath.slice(DIAGRAM_BUCKET.length + 1)
        : fromPath;
      const toObject = toPath.startsWith(`${DIAGRAM_BUCKET}/`)
        ? toPath.slice(DIAGRAM_BUCKET.length + 1)
        : toPath;
      const { error } = await bucket.move(fromObject, toObject);
      if (error) throw error;
    },
    async removePrefix(prefix) {
      const objectPrefix = prefix.startsWith(`${DIAGRAM_BUCKET}/`)
        ? prefix.slice(DIAGRAM_BUCKET.length + 1)
        : prefix;
      const objectPaths = (await listAllObjectNames(bucket, objectPrefix)).map(
        (name) => `${objectPrefix}${name}`,
      );
      if (objectPaths.length === 0) return;
      const { error: removeError } = await bucket.remove(objectPaths);
      if (removeError) throw removeError;
    },
  };
}

async function readRow(snapshotRevisionId: string): Promise<PendingPromotionRow | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = await sql<PendingPromotionRow[]>`
      select p.id::text, p.show_id::text, p.drive_file_id, p.temp_prefix,
             p.snapshot_revision_id::text, p.asset_count
        from public.pending_snapshot_uploads p
       where p.snapshot_revision_id = ${snapshotRevisionId}::uuid
       limit 1
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function emitRollbackStuckAlert(
  showId: string,
  snapshotRevisionId: string,
  error: unknown,
): Promise<void> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    await sql`
      select public.upsert_admin_alert(
        ${showId}::uuid,
        'PENDING_SNAPSHOT_ROLLBACK_STUCK',
        ${sql.json({
          snapshot_revision_id: snapshotRevisionId,
          error: storageErrorMessage(error),
        })}::jsonb
      )
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function promoteSnapshotUpload(
  snapshotRevisionId: string,
  deps: PromoteSnapshotDeps = {},
): Promise<PromoteSnapshotResult> {
  const initial = await readRow(snapshotRevisionId);
  if (!initial) return { outcome: "not_found" };

  const storage = deps.storage ?? defaultStorage();
  const result: PromoteSnapshotResult = await withPromoteLock(
    initial.show_id,
    async (promoteTx): Promise<PromoteSnapshotResult> => {
      const clearRolledBack = async (row: PendingPromotionRow): Promise<void> => {
        await promoteTx.queryOne<{ ok: boolean }>(
          `
          with cleared_show as (
            update public.shows s
               set diagrams = jsonb_set(s.diagrams, '{pending}', 'null'::jsonb)
	             where s.id = $1::uuid
	               and coalesce(
	                 s.diagrams->'pending'->>'revision_id',
	                 s.diagrams->'pending'->>'snapshot_revision_id'
	               ) = $2
             returning s.id
          ),
          cleared_ledger as (
            update public.pending_snapshot_uploads p
               set promote_started_at = null,
                   claim_token = null,
                   claimed_at = null,
                   claim_expires_at = null
             where p.id = $3::uuid
               and p.delete_started_at is null
               and p.promoted_at is null
               and p.claim_token = $4::uuid
             returning p.id
          )
          select true as ok
        `,
          [row.show_id, row.snapshot_revision_id, row.id, row.claim_token],
        );
        // S4 (docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md#s4):
        // clearRolledBack completing is the automatic-retry rollback-completion code point —
        // resolve PENDING_SNAPSHOT_ROLLBACK_STUCK via the same promoteTx, after the ledger
        // reset above has succeeded.
        await promoteTx.queryOne(
          `update public.admin_alerts set resolved_at = now()
            where show_id = $1::uuid and code = 'PENDING_SNAPSHOT_ROLLBACK_STUCK' and resolved_at is null`,
          [row.show_id],
        );
      };
      const row = await promoteTx.queryOne<
        (PendingPromotionRow & { promoted_at: string | null }) | null
      >(
        `
        update public.pending_snapshot_uploads
           set claim_token = gen_random_uuid(),
               claimed_at = now(),
               claim_expires_at = now() + interval '5 minutes',
               promote_started_at = now()
         where snapshot_revision_id = $1::uuid
           and claim_token is null
           and delete_started_at is null
           and promote_started_at is null
         returning id::text, show_id::text, drive_file_id, temp_prefix, snapshot_revision_id::text,
                   promoted_at::text, asset_count, claim_token::text
      `,
        [snapshotRevisionId],
      );

      if (!row) return { outcome: "not_found" };
      if (row.promoted_at) return { outcome: "already_promoted", snapshotRevisionId };
      const promoted = await withShowLock(
        row.drive_file_id,
        async (tx) => {
          const requiredRows = await tx.queryRows<ExpectedAssetNameRow>(EXPECTED_ASSET_NAMES_SQL, [
            row.show_id,
          ]);

          const canonical = canonicalPrefix(row.show_id, row.snapshot_revision_id);

          // Path binding BEFORE any listing comparison (spec §4.2): every
          // original's dirname must equal this revision's canonical prefix —
          // the asset route serves only complete canonical paths, so a
          // stale-revision snapshotPath would pass a basename check, cut over,
          // and 410 at serve time. A slash-less path is mispathed by
          // definition. Variant keys are basenames by construction and take no
          // path check.
          const mispathed = requiredRows
            .filter((required) => required.kind === "original")
            .map((required) => required.name)
            .filter((path) => path.slice(0, path.lastIndexOf("/") + 1) !== canonical);
          if (mispathed.length > 0) {
            await clearRolledBack(row);
            return {
              outcome: "manifest_mismatch",
              snapshotRevisionId,
              deltas: boundedDeltas({ missing: [], extra: [], duplicated: [], mispathed }),
            };
          }

          const { requiredSet, duplicated } = requiredNameSet(requiredRows);
          const paths = await storage.list(row.temp_prefix);
          const preMove = listingDeltas(requiredSet, paths);
          if (preMove.missing.length > 0 || preMove.extra.length > 0 || duplicated.length > 0) {
            await clearRolledBack(row);
            return {
              outcome: "manifest_mismatch",
              snapshotRevisionId,
              deltas: boundedDeltas({ ...preMove, duplicated, mispathed: [] }),
            };
          }

          const renamed: Array<{ from: string; to: string }> = [];
          const rollback = async (): Promise<void> => {
            for (const entry of renamed.toReversed()) {
              await storage.move(entry.to, entry.from);
            }
          };

          try {
            for (const path of paths) {
              const to = `${canonical}${basename(path)}`;
              await storage.move(path, to);
              renamed.push({ from: path, to });
            }

            const canonicalPaths = await storage.list(canonical);
            const postMove = listingDeltas(requiredSet, canonicalPaths);
            if (postMove.missing.length > 0 || postMove.extra.length > 0) {
              await rollback();
              await clearRolledBack(row);
              return {
                outcome: "manifest_mismatch",
                snapshotRevisionId,
                deltas: boundedDeltas({ ...postMove, duplicated, mispathed: [] }),
              };
            }

            const cutover = await tx.queryOne<{ updated: boolean }>(
              `
        with target as (
          select s.id
            from public.shows s
            join public.pending_snapshot_uploads p on p.show_id = s.id
           where p.snapshot_revision_id = $1::uuid
             and coalesce(
               s.diagrams->'pending'->>'revision_id',
               s.diagrams->'pending'->>'snapshot_revision_id'
             ) = p.snapshot_revision_id::text
           for update of s, p
        ),
        update_show as (
          update public.shows s
             set diagrams = jsonb_set(
               jsonb_set(s.diagrams, '{current}', s.diagrams->'pending'),
               '{pending}',
               'null'::jsonb
             )
            from target
           where s.id = target.id
           returning s.id
        ),
        update_ledger as (
          update public.pending_snapshot_uploads p
             set promoted_at = now(),
                 claim_token = null,
                 claimed_at = null,
                 claim_expires_at = null
           from update_show
           where p.snapshot_revision_id = $1::uuid
             and p.claim_token = $2::uuid
           returning p.id
        )
        select exists(select 1 from update_ledger) as updated
      `,
              [snapshotRevisionId, row.claim_token],
            );

            if (!cutover?.updated) {
              await rollback();
              await clearRolledBack(row);
              return { outcome: "no_pending_payload", snapshotRevisionId };
            }
            return { outcome: "promoted", snapshotRevisionId };
          } catch (error) {
            try {
              await rollback();
              await clearRolledBack(row);
            } catch (rollbackError) {
              await emitRollbackStuckAlert(row.show_id, row.snapshot_revision_id, rollbackError);
              return { outcome: "manifest_mismatch" as const, snapshotRevisionId };
            }
            throw error;
          }
        },
        { tx: promoteTx, assertInDev: false },
      );
      if ("skipped" in promoted) {
        return { outcome: "manifest_mismatch" as const, snapshotRevisionId };
      }
      return promoted as PromoteSnapshotResult;
    },
  );
  // nav-perf tag-caching (Task 7): the cutover writes shows.diagrams (projected at
  // getShowForViewer.ts:709). Revalidate the show's data-cache tag POST-COMMIT — after
  // withPromoteLock resolves (the show-lock cutover tx committed), NEVER inside the lock.
  if (result.outcome === "promoted") {
    revalidateShow(initial.show_id);
  }
  // Invariant-10 code-carrying emit for this non-admin surface (spec §4.3): all
  // three production callers discard resolved mismatches, so the one place every
  // caller shares emits it — POST-COMMIT, after withPromoteLock resolved, outside
  // the advisory lock. Only comparison-derived mismatches carry deltas; the
  // rollback-failure branch keeps its own PENDING_SNAPSHOT_ROLLBACK_STUCK alert
  // and the lock-skipped branch ran no comparison, so neither warns here.
  // Basenames derive from embedded object IDs and Drive file IDs this pipeline
  // already logs — not secrets, not user content.
  if (result.outcome === "manifest_mismatch" && result.deltas) {
    // Variant keys embed `@<width>` (`x.png@256.webp`), which the logger's
    // email-redaction safety net (lib/log/sanitize.ts) would collapse to
    // `[email-redacted]` — destroying exactly the name this warn exists to
    // report. `[at]` is a reversible, documented encoding for the emit only;
    // the returned result's deltas stay raw.
    const redactionSafe = (names: string[]): string[] =>
      names.map((name) => name.replaceAll("@", "[at]"));
    void log.warn("snapshot promote manifest mismatch", {
      source: "sync",
      code: "SNAPSHOT_PROMOTE_MANIFEST_MISMATCH",
      showId: initial.show_id,
      snapshotRevisionId,
      deltas: {
        missing: redactionSafe(result.deltas.missing),
        extra: redactionSafe(result.deltas.extra),
        duplicated: redactionSafe(result.deltas.duplicated),
        mispathed: redactionSafe(result.deltas.mispathed),
        truncated: result.deltas.truncated,
      },
    });
  }
  return result;
}

export async function repairSnapshotRollback(
  ledgerId: string,
  deps: PromoteSnapshotDeps = {},
): Promise<RepairSnapshotRollbackResult> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  let row:
    | (PendingPromotionRow & {
        promote_started_at: string | null;
        delete_started_at: string | null;
      })
    | null;
  try {
    const rows = await sql<
      (PendingPromotionRow & {
        promote_started_at: string | null;
        delete_started_at: string | null;
      })[]
    >`
      select id::text, show_id::text, drive_file_id, temp_prefix, snapshot_revision_id::text,
             asset_count, promote_started_at::text, delete_started_at::text
        from public.pending_snapshot_uploads
       where id = ${ledgerId}::uuid
       limit 1
    `;
    row = rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
  if (!row) return { outcome: "not_found" };
  if (!row.promote_started_at && !row.delete_started_at) {
    return { outcome: "not_stuck", snapshotRevisionId: row.snapshot_revision_id };
  }
  const started = Date.parse(row.promote_started_at ?? row.delete_started_at ?? "");
  if (row.promote_started_at && Number.isFinite(started) && Date.now() - started < 15 * 60 * 1000) {
    return { outcome: "promote_in_flight", snapshotRevisionId: row.snapshot_revision_id };
  }

  const storage = deps.storage ?? defaultStorage();
  const repairResult: RepairSnapshotRollbackResult = await withPromoteLock(
    row.show_id,
    async (promoteTx): Promise<RepairSnapshotRollbackResult> => {
      const repaired = await withShowLock(
        row.drive_file_id,
        async (tx) => {
          const locked = await tx.queryOne<{ promoted_at: string | null } | null>(
            "select promoted_at::text from public.pending_snapshot_uploads where id = $1::uuid",
            [ledgerId],
          );
          if (!locked) return { outcome: "not_found" } satisfies RepairSnapshotRollbackResult;
          if (locked.promoted_at) {
            return {
              outcome: "not_stuck",
              snapshotRevisionId: row.snapshot_revision_id,
            } satisfies RepairSnapshotRollbackResult;
          }
          if (row.delete_started_at && !row.promote_started_at) {
            await storage.removePrefix?.(row.temp_prefix);
            await tx.queryOne<{ ok: boolean }>(
              `
              delete from public.pending_snapshot_uploads
               where id = $1::uuid
                 and promoted_at is null
                 and delete_started_at is not null
              returning true as ok
            `,
              [ledgerId],
            );
            return {
              outcome: "repaired",
              snapshotRevisionId: row.snapshot_revision_id,
            } satisfies RepairSnapshotRollbackResult;
          }
          const canonical = canonicalPrefix(row.show_id, row.snapshot_revision_id);
          for (const path of await storage.list(canonical)) {
            await storage.move(path, `${row.temp_prefix}${basename(path)}`);
          }
          await tx.queryOne<{ ok: boolean }>(
            `
            with cleared_show as (
              update public.shows s
                 set diagrams = jsonb_set(s.diagrams, '{pending}', 'null'::jsonb)
               where s.id = $1::uuid
                 and coalesce(
                   s.diagrams->'pending'->>'revision_id',
                   s.diagrams->'pending'->>'snapshot_revision_id'
                 ) = $3
               returning s.id
            ),
            cleared_ledger as (
              update public.pending_snapshot_uploads p
                 set promote_started_at = null,
                     claim_token = null,
                     claimed_at = null,
                     claim_expires_at = null
               where p.id = $2::uuid
                 and promoted_at is null
               returning p.id
            )
            select true as ok
          `,
            [row.show_id, ledgerId, row.snapshot_revision_id],
          );
          // S4 (docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md#s4): the
          // catalog-prescribed manual-repair rollback-completion code point — the same
          // ledger-reset shape as clearRolledBack, so it resolves ROLLBACK_STUCK the same way,
          // via the closure's promoteTx (not the inner show-lock `tx`).
          await promoteTx.queryOne(
            `update public.admin_alerts set resolved_at = now()
              where show_id = $1::uuid and code = 'PENDING_SNAPSHOT_ROLLBACK_STUCK' and resolved_at is null`,
            [row.show_id],
          );
          return {
            outcome: "repaired",
            snapshotRevisionId: row.snapshot_revision_id,
          } satisfies RepairSnapshotRollbackResult;
        },
        { tx: promoteTx, assertInDev: false },
      );
      if ("skipped" in repaired) {
        return { outcome: "promote_in_flight", snapshotRevisionId: row.snapshot_revision_id };
      }
      return repaired;
    },
  );
  // nav-perf tag-caching (Task 7): the rollback-repair branch clears shows.diagrams->pending
  // (a projected-data write). Revalidate POST-COMMIT (after withPromoteLock resolves) on the
  // `repaired` outcome. (The `not_stuck`/`not_found`/`promote_in_flight` outcomes wrote no shows
  // row; the delete-only repair removes a pending_snapshot_uploads row, not shows — but `repaired`
  // covers both repair shapes, and revalidating an unchanged tag is a safe no-op.)
  if (repairResult.outcome === "repaired") {
    revalidateShow(row.show_id);
  }
  return repairResult;
}
