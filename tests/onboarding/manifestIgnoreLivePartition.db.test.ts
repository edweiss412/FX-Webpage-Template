import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleWizardManifestIgnore } from "@/app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route";

/**
 * DS3-1 — the C1-equivalent proof for the NO-pendingIngestionId path (the core
 * risk the DEFERRED note flagged). The `live_row_conflict` and `discard_retryable`
 * Step-3 rows have NO `pending_ingestions` and NO `pending_syncs` row; the only
 * durable key is (wizard_session_id, drive_file_id) + onboarding_scan_manifest.name.
 *
 * Asserts, against a real DB (probe + skipIf), for each blocking status:
 *   (a) a LIVE deferred_ingestions row exists (wizard_session_id IS NULL,
 *       deferred_kind='permanent_ignore', drive_file_name = the seeded manifest
 *       name, deferred_by_email LOWERCASED per email-canon, deferred_at_modified_time
 *       NULL);
 *   (b) the manifest row status flipped to 'permanent_ignore' (NOT deleted);
 *   (c) the row is no longer counted by finalize-cas's unresolvedManifestCount —
 *       finish is unblocked (the exact query from finalize-cas/route.ts:260-288);
 *   (d) the deferral SURVIVES a purgeWizardRows-style delete of wizard-scoped rows.
 *
 * Plus the supersession-rollback: when the active wizard session is swapped out
 * BETWEEN the deferral write and the manifest transition, the route 409s AND the
 * just-written deferral is rolled back (absent) — the load-bearing tx-ordering
 * guarantee.
 *
 * Anti-tautology: the live-deferral assertions read back from the DB by partition
 * (wizard_session_id IS NULL); the manifest-name + lowercased-email assertions use
 * the seeded fixture values; the unresolved-count uses the production SQL.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "d531d531-1111-4111-8111-d531d531d531";
const OTHER_SESSION = "d531d531-2222-4222-8222-d531d531d531";
const FOLDER = "ds31-folder";
const ADMIN_EMAIL = "Doug.Larson@FXAV.com"; // mixed-case → canonicalize must lowercase it

type Fixture = {
  driveFileId: string;
  sheetName: string;
  status: "live_row_conflict" | "discard_retryable";
};

const CONFLICT: Fixture = {
  driveFileId: "ds31-live-conflict",
  sheetName: "Live Conflict Sheet.gsheet",
  status: "live_row_conflict",
};
const RETRYABLE: Fixture = {
  driveFileId: "ds31-discard-retryable",
  sheetName: "Discard Retryable Sheet.gsheet",
  status: "discard_retryable",
};
const ALL = [CONFLICT, RETRYABLE];

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
  for (const f of ALL) {
    for (const stmt of [
      `delete from public.pending_ingestions where drive_file_id = '${f.driveFileId}'`,
      `delete from public.pending_syncs where drive_file_id = '${f.driveFileId}'`,
      `delete from public.onboarding_scan_manifest where drive_file_id = '${f.driveFileId}'`,
      `delete from public.deferred_ingestions where drive_file_id = '${f.driveFileId}'`,
    ]) {
      await sql.unsafe(stmt, []).catch(() => {});
    }
  }
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

async function setActiveSession(sessionId: string): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [sessionId, FOLDER],
  );
}

async function seed(): Promise<void> {
  await setActiveSession(SESSION);
  // Seed BOTH blocking statuses as manifest rows with NO pending_ingestions and NO
  // pending_syncs row (the whole point: the existing Ignore routes are unreachable).
  for (const f of ALL) {
    await sql!.unsafe(
      `insert into public.onboarding_scan_manifest
         (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
       values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', $4, $5)
       on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status`,
      [FOLDER, SESSION, f.driveFileId, f.sheetName, f.status],
    );
  }
}

// The EXACT unresolved-count query from finalize-cas/route.ts:260-288 (the gate
// that blocks finish). permanent_ignore is excluded, so an ignored row must drop out.
async function unresolvedManifestCount(sessionId: string): Promise<number> {
  const row = one<{ unresolved_count: number }>(
    await sql!.unsafe(
      `
      select count(*)::int as unresolved_count
        from public.onboarding_scan_manifest m
        left join public.pending_syncs ps
          on ps.wizard_session_id = m.wizard_session_id and ps.drive_file_id = m.drive_file_id
       where m.wizard_session_id = $1::uuid
         and (
           m.status in ('hard_failed', 'live_row_conflict', 'discard_retryable')
           or (m.status = 'staged' and ps.last_finalize_failure_code is not null)
         )
      `,
      [sessionId],
    ),
  );
  return row.unresolved_count ?? 0;
}

function context(f: Fixture) {
  return {
    params: Promise.resolve({ wizardSessionId: SESSION, driveFileId: f.driveFileId }),
  };
}

function req(f: Fixture): Request {
  return new Request(
    `https://crew.fxav.test/api/admin/onboarding/manifest/${SESSION}/${f.driveFileId}/ignore`,
    { method: "POST" },
  );
}

beforeAll(() => {
  if (!dbUp) return;
  // Route openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH to local loopback.
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await seed();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("DS3-1 — manifest-keyed ignore writes the durable live partition (real DB, no pendingIngestionId)", () => {
  for (const f of ALL) {
    test.skipIf(!dbUp)(
      `${f.status}: ignore writes a LIVE permanent_ignore deferral (with sheet name + lowercased email) and flips the manifest, unblocking finish`,
      async () => {
        // Sanity: the seeded row is counted as unresolved BEFORE the ignore.
        expect(await unresolvedManifestCount(SESSION)).toBeGreaterThanOrEqual(1);

        const response = await handleWizardManifestIgnore(req(f), context(f), {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
        });
        expect(response.status).toBe(200);
        expect((await response.json()) as Record<string, unknown>).toEqual({
          status: "ignored",
          drive_file_id: f.driveFileId,
          wizard_session_id: SESSION,
        });

        // (a) The LIVE-partition deferral row exists with the right shape.
        const deferral = one(
          await sql!.unsafe(
            `select wizard_session_id, deferred_kind, deferred_by_email, drive_file_name,
                    deferred_at_modified_time
               from public.deferred_ingestions
              where drive_file_id = $1`,
            [f.driveFileId],
          ),
        ) as {
          wizard_session_id: string | null;
          deferred_kind: string;
          deferred_by_email: string | null;
          drive_file_name: string | null;
          deferred_at_modified_time: string | null;
        };
        expect(deferral.wizard_session_id).toBeNull(); // LIVE partition
        expect(deferral.deferred_kind).toBe("permanent_ignore");
        expect(deferral.deferred_by_email).toBe(ADMIN_EMAIL.toLowerCase()); // canonicalized
        expect(deferral.drive_file_name).toBe(f.sheetName); // D11 — written from manifest.name
        expect(deferral.deferred_at_modified_time).toBeNull();

        // (b) The manifest row was FLIPPED to permanent_ignore, NOT deleted.
        const manifest = one(
          await sql!.unsafe(
            `select status from public.onboarding_scan_manifest
              where wizard_session_id = $1::uuid and drive_file_id = $2`,
            [SESSION, f.driveFileId],
          ),
        ) as { status: string };
        expect(manifest.status).toBe("permanent_ignore");

        // (c) finalize-cas no longer counts this row → finish is unblocked for it.
        // (Seeding both fixtures means the other still counts; assert THIS row left
        // the unresolved set by status.)
        const stillCounted = one(
          await sql!.unsafe(
            `select count(*)::int as n from public.onboarding_scan_manifest
              where wizard_session_id = $1::uuid and drive_file_id = $2
                and status in ('hard_failed','live_row_conflict','discard_retryable')`,
            [SESSION, f.driveFileId],
          ),
        ) as { n: number };
        expect(stillCounted.n).toBe(0);

        // (d) The deferral SURVIVES the finalize purge of wizard-scoped rows.
        await sql!.unsafe(
          `delete from public.deferred_ingestions where wizard_session_id is not null`,
          [],
        );
        const surviving = await sql!.unsafe(
          `select 1 from public.deferred_ingestions
            where drive_file_id = $1 and wizard_session_id is null`,
          [f.driveFileId],
        );
        expect(surviving.length).toBe(1); // durable across finalize
      },
    );
  }

  test.skipIf(!dbUp)(
    "both rows ignored → finalize-cas unresolvedManifestCount drops to 0 (finish fully unblocked)",
    async () => {
      for (const f of ALL) {
        const response = await handleWizardManifestIgnore(req(f), context(f), {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
        });
        expect(response.status).toBe(200);
      }
      expect(await unresolvedManifestCount(SESSION)).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "supersession BETWEEN the deferral write and the manifest transition rolls back the deferral",
    async () => {
      // Drive a real supersession: swap the active wizard session to a DIFFERENT id
      // AFTER the deferral upsert's EXISTS predicate passes but BEFORE the manifest
      // transition's predicate runs. The manifest transition CAS reads the OLD
      // session in its predicate AND the active-session EXISTS now points at
      // OTHER_SESSION, so it matches 0 rows → the route throws → the tx rolls back.
      //
      // We inject the swap via a deps.withRowTx that runs the route's callback inside
      // a real transaction, but flips app_settings (on a SEPARATE connection, so the
      // change is visible to the EXISTS subqueries) right after the deferral write.
      const f = CONFLICT;

      // A side connection used to flip the active session mid-transaction.
      const side = postgres(LOCAL_URL, { max: 1, idle_timeout: 1, prepare: false });
      try {
        let flipped = false;
        const withRowTx = async <R>(
          driveFileId: string,
          fn: (tx: never) => Promise<R> | R,
        ): Promise<R> => {
          const { withPostgresSyncPipelineLock } = await import(
            "@/lib/sync/runScheduledCronSync"
          );
          const result = await withPostgresSyncPipelineLock(
            driveFileId,
            async (tx) => {
              // Wrap the locked tx so that immediately after the deferral upsert
              // (the INSERT INTO deferred_ingestions), we supersede the session on a
              // separate connection — the manifest transition that follows then
              // misses its active-session predicate.
              const realTx = tx as unknown as {
                queryOne<T>(sqlText: string, params: unknown[]): Promise<T>;
              };
              const wrapped = {
                async queryOne<T>(sqlText: string, params: unknown[]): Promise<T> {
                  const out = await realTx.queryOne<T>(sqlText, params);
                  if (!flipped && /insert into public\.deferred_ingestions/i.test(sqlText)) {
                    flipped = true;
                    await side.unsafe(
                      `update public.app_settings
                          set pending_wizard_session_id = $1::uuid
                        where id = 'default'`,
                      [OTHER_SESSION],
                    );
                  }
                  return out;
                },
              };
              return await fn(wrapped as never);
            },
            { tryOnly: false },
          );
          if (typeof result === "object" && result !== null && "skipped" in result) {
            throw new Error("unexpected skipped lock");
          }
          return result as R;
        };

        const response = await handleWizardManifestIgnore(req(f), context(f), {
          requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
          withRowTx,
          upsertAdminAlert: async () => null,
          readCurrentWizardSessionId: async () => OTHER_SESSION,
        });

        expect(response.status).toBe(409);
        expect((await response.json()) as { code: string }).toMatchObject({
          code: "WIZARD_SESSION_SUPERSEDED",
        });

        // The deferral that was written mid-tx MUST be gone — the tx rolled back.
        const deferralRows = await sql!.unsafe(
          `select 1 from public.deferred_ingestions where drive_file_id = $1`,
          [f.driveFileId],
        );
        expect(deferralRows.length).toBe(0);

        // And the manifest row was NOT flipped (still the original blocking status).
        const manifest = one(
          await sql!.unsafe(
            `select status from public.onboarding_scan_manifest where drive_file_id = $1`,
            [f.driveFileId],
          ),
        ) as { status: string };
        expect(manifest.status).toBe(f.status);
      } finally {
        await side.end({ timeout: 5 }).catch(() => {});
      }
    },
  );
});
