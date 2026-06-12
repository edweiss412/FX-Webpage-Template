/**
 * F5 Task 5.2 — REAL-Postgres partial-commit regression for the wizard-session
 * CAS turnover race (BL-WIZARD-SESSION-CAS-TURNOVER-RACE).
 *
 * The unit fakes (pendingIngestionsWizardActions.test.ts) prove the
 * throw-vs-return shape but cannot prove Postgres semantics:
 *   (a) the EXISTS currency subquery re-reads app_settings at STATEMENT time
 *       under READ COMMITTED — a mid-transaction committed flip IS visible to
 *       the next statement;
 *   (b) the thrown WizardSessionSupersededRollbackError actually aborts the
 *       sql.begin transaction so the already-executed manifest UPDATE does not
 *       persist.
 * A mocked test passing while the real path partial-commits is exactly the
 * "mocked-only tests invite tautological APPROVE" class.
 *
 * Contract alignment (plan R39-1/R40-1): the SQL helpers are BOOLEAN-returning;
 * the ROUTE layer converts 0-row to the typed throw. This test mirrors the
 * route's exact conversion inside its transaction rather than expecting the
 * bare helper to throw.
 *
 * DB-connection convention (plan R16-2/R19-1): LOCAL-ONLY. The route's default
 * openers resolve TEST_DATABASE_URL ?? DATABASE_URL, and in this repo
 * TEST_DATABASE_URL is the VALIDATION project (.env.local) — so BOTH env vars
 * are pinned to the assertLocalDbUrl-validated loopback URL for the whole
 * suite (originals restored in teardown). TEST_DATABASE_URL-as-validation
 * appears ONLY in explicitly labeled close-out commands, never here.
 */
import { afterAll, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import {
  deletePendingIngestion,
  handleWizardPendingIngestionAction,
  transitionManifestRow,
  upsertWizardDeferral,
} from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

// F5b (Task 5.4): the reap is imported lazily inside the tests so its module
// init can never observe the pre-pin env (its databaseUrl() resolves
// TEST_DATABASE_URL ?? DATABASE_URL at call time — both pinned above).
async function importReap() {
  const { reapStaleOnboardingSessions } = await import("@/lib/onboarding/sessionLifecycle");
  return reapStaleOnboardingSessions;
}
const REAP_ADMIN_DEPS = { requireAdminIdentity: async () => ({ email: "admin@example.com" }) };

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

// R19-1 env pinning: the route/lib default openers resolve
// TEST_DATABASE_URL ?? DATABASE_URL — deleting only one leaves the other live.
const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

const W1 = "f5f5f5f5-0001-4001-8001-f5f5f5f5f5f5";
const W2 = "f5f5f5f5-0002-4002-8002-f5f5f5f5f5f5";
const FILE = "f5-cas-race-file";
const FOLDER = "f5-cas-race-folder";

// Probe the connection at module top-level: `test.skipIf` is evaluated at
// collection time (before beforeAll), so `dbUp` must be settled before then.
let sql: ReturnType<typeof postgres> | null = null;
let superseder: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let originalSettings: {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
} | null = null;
try {
  const probe = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  const rows = (await probe.unsafe(
    `select pending_wizard_session_id, pending_folder_id from public.app_settings where id = 'default'`,
    [],
  )) as Array<{ pending_wizard_session_id: string | null; pending_folder_id: string | null }>;
  originalSettings = rows[0] ?? { pending_wizard_session_id: null, pending_folder_id: null };
  sql = probe;
  superseder = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  dbUp = true;
} catch {
  if (sql) await sql.end().catch(() => {});
  sql = null;
  superseder = null;
  dbUp = false;
}

async function cleanupFixtureRows(): Promise<void> {
  if (!sql) return;
  await sql.unsafe(`delete from public.pending_ingestions where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.deferred_ingestions where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.onboarding_scan_manifest where drive_file_id = $1`, [FILE]);
  await sql.unsafe(`delete from public.pending_syncs where drive_file_id = $1`, [FILE]);
  await sql.unsafe(
    `delete from public.admin_alerts where code = 'WIZARD_SESSION_SUPERSEDED_RACE' and context->>'drive_file_id' = $1`,
    [FILE],
  );
}

afterAll(async () => {
  if (sql && dbUp && originalSettings) {
    await cleanupFixtureRows().catch(() => {});
    await sql
      .unsafe(
        `update public.app_settings set pending_wizard_session_id = $1::uuid, pending_folder_id = $2 where id = 'default'`,
        [originalSettings.pending_wizard_session_id, originalSettings.pending_folder_id],
      )
      .catch(() => {});
  }
  if (sql) await sql.end().catch(() => {});
  if (superseder) await superseder.end().catch(() => {});
  // Restore the pinned env vars (R19-1).
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
});

type PendingIngestionRow = {
  id: string;
  drive_file_id: string;
  wizard_session_id: string;
  discovered_during_folder_id: string | null;
  last_seen_modified_time: string | null;
};

async function seed(): Promise<{ pendingIngestionId: string }> {
  await cleanupFixtureRows();
  await sql!.unsafe(
    `update public.app_settings set pending_wizard_session_id = $1::uuid, pending_folder_id = $2 where id = 'default'`,
    [W1, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'F5 race fixture', 'hard_failed')`,
    [FOLDER, W1, FILE],
  );
  const rows = (await sql!.unsafe(
    `insert into public.pending_ingestions
       (drive_file_id, drive_file_name, last_error_code, last_error_message,
        wizard_session_id, discovered_during_folder_id, last_seen_modified_time)
     values ($1, 'f5-race.xlsx', 'MI_1_MISSING_REQUIRED_TAB', 'f5 fixture',
             $2::uuid, $3, '2026-06-11T00:00:00.000Z'::timestamptz)
     returning id`,
    [FILE, W1, FOLDER],
  )) as Array<{ id: string }>;
  return { pendingIngestionId: rows[0]!.id };
}

async function readPendingIngestionRow(id: string): Promise<PendingIngestionRow | null> {
  const rows = (await sql!.unsafe(
    `select id, drive_file_id, wizard_session_id, discovered_during_folder_id, last_seen_modified_time
       from public.pending_ingestions where id = $1::uuid`,
    [id],
  )) as unknown as PendingIngestionRow[];
  return rows[0] ?? null;
}

async function readManifestRow(wizardSessionId: string, driveFileId: string) {
  const rows = (await sql!.unsafe(
    `select status from public.onboarding_scan_manifest
      where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [wizardSessionId, driveFileId],
  )) as Array<{ status: string }>;
  return rows[0]!;
}

async function readDeferralRows(driveFileId: string) {
  return (await sql!.unsafe(
    `select drive_file_id, wizard_session_id, deferred_kind from public.deferred_ingestions
      where drive_file_id = $1`,
    [driveFileId],
  )) as unknown as Array<{ wizard_session_id: string | null; deferred_kind: string }>;
}

function assertLoopbackOpenersPinned(): void {
  // Guard assertion (R19-1): the default route openers must resolve to the
  // validated loopback URL before the first route call.
  expect(assertLocalDbUrl(process.env.TEST_DATABASE_URL!)).toBe(DB_URL);
  expect(assertLocalDbUrl(process.env.DATABASE_URL!)).toBe(DB_URL);
}

async function flipSessionTo(sessionId: string): Promise<void> {
  await superseder!.unsafe(
    `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
    [sessionId],
  );
}

test.skipIf(!dbUp)(
  "manifest UPDATE succeeds, session flips, deferral predicate misses → ALL THREE rows unchanged after the abort",
  async () => {
    const { pendingIngestionId } = await seed();
    const row = (await readPendingIngestionRow(pendingIngestionId))!;

    await expect(
      withPostgresSyncPipelineLock(
        FILE,
        async (tx) => {
          const manifestTransitioned = await transitionManifestRow(
            tx as never,
            row as never,
            "defer_until_modified",
          );
          expect(manifestTransitioned).toBe(true); // statement 1 really executed in-tx
          // The race: a committed supersession lands between statement 1 and statement 2.
          await flipSessionTo(W2);
          // R40-1: helper is BOOLEAN-returning; mirror the route's exact conversion here.
          const ok = await upsertWizardDeferral(tx as never, row as never, "defer_until_modified");
          if (!ok) {
            throw new WizardSessionSupersededRollbackError({
              attemptedAction: "defer_until_modified",
              supersededSessionId: W1,
              pendingIngestionId,
              driveFileId: row.drive_file_id,
            });
          }
          throw new Error("unreachable: predicate should have missed (ok === false)");
        },
        { tryOnly: false },
      ),
    ).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);

    // Post-abort state: NOTHING committed.
    const manifest = await readManifestRow(W1, FILE);
    expect(manifest.status).toBe("hard_failed"); // statement-1's transition rolled back
    expect(await readDeferralRows(FILE)).toEqual([]); // no stale-session deferral
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull(); // row not deleted
  },
);

// F5 Task 5.3 durability: the WIZARD_SESSION_SUPERSEDED_RACE alert must be
// COMMITTED (visible from another connection) while every protected mutation
// of the aborted transaction rolled back. The alert writer is stubbed to a
// direct-SQL writer that calls the SAME RPC the production default
// (lib/adminAlerts/upsertAdminAlert.ts) calls — public.upsert_admin_alert —
// on a fresh connection, i.e. its own transaction (the post-rollback
// follow-up pattern), never inside the aborted tx.
async function directSqlAlertWriter(input: {
  showId: string | null;
  code: string;
  context: Record<string, unknown>;
}): Promise<string | null> {
  const conn = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  try {
    const rows = (await conn.unsafe(
      `select public.upsert_admin_alert($1::uuid, $2, $3::jsonb) as id`,
      // postgres.js serializes a $N::jsonb param itself — pass the raw object
      // via conn.json, never JSON.stringify (double-encode → jsonb string scalar).
      [input.showId, input.code, conn.json(input.context as never) as never],
    )) as Array<{ id: string | null }>;
    return rows[0]?.id ?? null;
  } finally {
    await conn.end({ timeout: 5 });
  }
}

test.skipIf(!dbUp)(
  "durability: the post-rollback alert COMMITS while every protected mutation rolls back (route-level, real SQL)",
  async () => {
    const { pendingIngestionId } = await seed();
    assertLoopbackOpenersPinned();

    // Drive the REAL route with the REAL per-show-locked tx; interpose only on
    // the tx handle so the committed supersession lands AFTER the manifest
    // UPDATE executed and BEFORE the deferral statement — the statement-time
    // window the typed rollback exists for.
    const withRowTxFlippingMidWindow = async <R>(
      driveFileId: string,
      fn: (tx: never) => Promise<R> | R,
    ): Promise<R> => {
      const result = await withPostgresSyncPipelineLock(
        driveFileId,
        async (tx) => {
          const wrapped = {
            queryOne: async <T>(sqlText: string, params: unknown[]): Promise<T> => {
              if (sqlText.replace(/\s+/g, " ").trim().startsWith("insert into public.deferred_ingestions")) {
                await flipSessionTo(W2); // committed mid-window, between statements 1 and 2
              }
              return await (tx as { queryOne<T2>(s: string, p: unknown[]): Promise<T2> }).queryOne<T>(
                sqlText,
                params,
              );
            },
          };
          return await fn(wrapped as never);
        },
        { tryOnly: false },
      );
      if (typeof result === "object" && result !== null && "skipped" in (result as object)) {
        throw new Error("durability test: lock unexpectedly skipped");
      }
      return result as R;
    };

    const response = await handleWizardPendingIngestionAction(
      { params: Promise.resolve({ id: pendingIngestionId }) },
      {
        requireAdminIdentity: async () => ({ email: "admin@example.com" }),
        withRowTx: withRowTxFlippingMidWindow,
        upsertAdminAlert: directSqlAlertWriter as never,
      },
      "defer_until_modified",
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });

    // The alert row EXISTS and is committed — read from a third connection.
    const alerts = (await sql!.unsafe(
      `select code, context, resolved_at from public.admin_alerts
        where code = 'WIZARD_SESSION_SUPERSEDED_RACE' and context->>'drive_file_id' = $1`,
      [FILE],
    )) as unknown as Array<{ code: string; context: Record<string, unknown> }>;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.context).toMatchObject({
      attempted_action: "defer_until_modified",
      superseded_session_id: W1,
      drive_file_id: FILE,
    });

    // ...while NONE of the three protected mutations persisted (Task 5.2 contract).
    expect((await readManifestRow(W1, FILE)).status).toBe("hard_failed");
    expect(await readDeferralRows(FILE)).toEqual([]);
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull();
  },
);

// F5 Task 5.5 S5 (R12 HIGH) — retry race. The natural window is INSIDE the
// scan (Drive I/O + staging, retrySingleFile.ts): inject a runOnboardingScan
// stub that (a) actually WRITES a W1 staging row on its own committed
// connection (runOnboardingScan runs its own transaction in production — R32
// residue contract: this is real-write residue, not a pure stub), (b) performs
// the committed flip mid-window, then (c) reports the file staged — exactly
// the sequence a real takeover produces.
test.skipIf(!dbUp)(
  "retry race: supersession lands between the app_settings read and the pending-ingestion delete → typed rollback, row survives, route 409s, alert carries attempted_action retry",
  async () => {
    const { pendingIngestionId } = await seed();
    assertLoopbackOpenersPinned();

    const response = await handleWizardPendingIngestionAction(
      { params: Promise.resolve({ id: pendingIngestionId }) },
      {
        requireAdminIdentity: async () => ({ email: "admin@example.com" }), // real withRowTx + real DB
        upsertAdminAlert: directSqlAlertWriter as never,
        retrySingleFileUnlocked: async (tx, driveFileId, wizardSessionId) =>
          (await import("@/lib/sync/retrySingleFile")).retrySingleFile_unlocked(
            tx as never,
            driveFileId,
            wizardSessionId,
            {
              fetchDriveFileMetadata: async () => ({
                driveFileId: FILE,
                name: "f5-race.xlsx",
                mimeType: "application/vnd.google-apps.spreadsheet",
                modifiedTime: "2026-06-11T00:00:00.000Z",
                parents: [FOLDER],
              }),
              runOnboardingScan: async () => {
                // The scan's own committed tx writes W1-scoped staging rows
                // BEFORE the supersession lands (real-write residue, R32-1).
                await superseder!.unsafe(
                  `insert into public.pending_syncs
                     (drive_file_id, staged_modified_time, parse_result, source_kind,
                      warning_summary, wizard_session_id, triggered_review_items)
                   values ($1, '2026-06-11T00:00:00.000Z'::timestamptz, $2::jsonb,
                           'onboarding_scan', '', $3::uuid, '[]'::jsonb)`,
                  [FILE, JSON.stringify({ show: { title: "F5 Retry Race" } }), W1],
                );
                await flipSessionTo(W2);
                return {
                  outcome: "completed" as const,
                  processed: [{ driveFileId: FILE, outcome: "staged" as const }],
                };
              },
            },
          ),
      },
      "retry",
    );
    // Concrete failure mode: pre-fix this is 200 {status:"staged"} — success
    // reported to a RETIRED wizard tab — and the W1-scoped pending_ingestions
    // row is deleted by a stale session AFTER the supersession committed.
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull(); // delete rolled back

    // R32-1 residue contract: the scan's OWN committed W1 rows are NOT rolled
    // back by the route-tx abort — they are accepted, session-scoped (inert to
    // live sync by the wizard_session_id IS NULL filter shape) residue.
    // F5b (Task 5.4) closes the F5a-deferred half below: the F4 reap sweeps it.
    const residue = (await sql!.unsafe(
      `select wizard_session_id from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [FILE, W1],
    )) as unknown as Array<{ wizard_session_id: string }>;
    expect(residue).toHaveLength(1); // documented residue — committed and visible

    // Retry-alert copy parity (plan R17-1): the persisted alert row carries
    // attempted_action "retry" — the only durable signal for the race must
    // not describe a defer/ignore click.
    const alerts = (await sql!.unsafe(
      `select context from public.admin_alerts
        where code = 'WIZARD_SESSION_SUPERSEDED_RACE' and context->>'drive_file_id' = $1
          and context->>'attempted_action' = 'retry'`,
      [FILE],
    )) as unknown as Array<{ context: Record<string, unknown> }>;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.context).toMatchObject({
      attempted_action: "retry",
      superseded_session_id: W1,
      drive_file_id: FILE,
    });

    // ── F5b (Task 5.4, F5a-deferred half): the F4 reap sweeps the S5 residue ──
    const reapStaleOnboardingSessions = await importReap();

    // FRESH residue is NOT reaped — F4's 24h activity guard working as
    // intended (the scan rows were just written: parsed_at / observed_at /
    // first_seen_at / last_attempt_at all default to now()). This protects the
    // guard from being weakened to make sweep tests pass.
    const freshRun = await reapStaleOnboardingSessions(REAP_ADMIN_DEPS);
    expect(freshRun.sessions.map((s) => s.wizardSessionId)).not.toContain(W1);
    expect(
      await sql!.unsafe(
        `select 1 from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [FILE, W1],
      ),
    ).toHaveLength(1); // residue untouched while fresh

    // Backdate EVERY W1 activity timestamp the F4 GREATEST window reads
    // (sessionLifecycle.ts freshness re-check) past 24h. W1's committed
    // surfaces after this test: the scan-residue pending_syncs row
    // (parsed_at; wizard_approved_at is NULL), the seeded manifest row
    // (observed_at, transitioned_at), and the surviving pending_ingestions
    // row (first_seen_at, last_attempt_at). No checkpoints / shadows /
    // deferrals exist for W1 here.
    await superseder!.unsafe(
      `update public.pending_syncs set parsed_at = now() - interval '25 hours'
        where wizard_session_id = $1::uuid`,
      [W1],
    );
    await superseder!.unsafe(
      `update public.onboarding_scan_manifest
          set observed_at = now() - interval '25 hours',
              transitioned_at = now() - interval '25 hours'
        where wizard_session_id = $1::uuid`,
      [W1],
    );
    await superseder!.unsafe(
      `update public.pending_ingestions
          set first_seen_at = now() - interval '25 hours',
              last_attempt_at = now() - interval '25 hours'
        where wizard_session_id = $1::uuid`,
      [W1],
    );

    // NOW the orphan-row eligibility sweeps the committed W1 scan residue
    // (W1 non-active, stale, checkpoint-less), regardless of W2's state.
    const staleRun = await reapStaleOnboardingSessions(REAP_ADMIN_DEPS);
    expect(staleRun.sessions.map((s) => s.wizardSessionId)).toContain(W1);
    expect(
      await sql!.unsafe(
        `select 1 from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [FILE, W1],
      ),
    ).toHaveLength(0); // the S5 scan residue is swept
    expect(
      await sql!.unsafe(
        `select 1 from public.onboarding_scan_manifest where wizard_session_id = $1::uuid`,
        [W1],
      ),
    ).toHaveLength(0); // the committed W1 manifest row is swept too
  },
);

test.skipIf(!dbUp)(
  "half (i): a supersession visible BEFORE any mutating statement → typed 409, nothing commits (route-level)",
  async () => {
    const { pendingIngestionId } = await seed();
    await flipSessionTo(W2);

    assertLoopbackOpenersPinned();
    const response = await handleWizardPendingIngestionAction(
      { params: Promise.resolve({ id: pendingIngestionId }) },
      { requireAdminIdentity: async () => ({ email: "admin@example.com" }) }, // real withRowTx + real DB
      "defer_until_modified",
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect((await readManifestRow(W1, FILE)).status).toBe("hard_failed");
    expect(await readDeferralRows(FILE)).toEqual([]);
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull();
  },
);

// F5b Task 5.4 — half (ii) of the two-half weakened guarantee (spec §7 R5-2,
// ratified §8: the commit window is ACCEPTED, not closed — do NOT "fix" it
// with locks/SERIALIZABLE). Half (a) — pre-statement supersession → typed 409,
// nothing commits — is already pinned by the "half (i)" route-level test above
// plus the mid-tx statement-time tests; NOT duplicated here. This test pins
// the three facts nothing else pins:
//   (a) a commit-window supersession really does leave a stale deferral row
//       (if a refactor accidentally "closes" the window, the spec contract
//       changed and we want to KNOW);
//   (b) the residue is wizard-scoped (non-NULL wizard_session_id) — invisible
//       to readLiveDeferral by shape (perFileProcessor.ts filters
//       `.is("wizard_session_id", null)`; unit pin in perFileProcessor.test.ts);
//   (c) the F4 reap removes it via orphan-row eligibility — RESPECTING the 24h
//       freshness guard: fresh residue must NOT be reaped.
test.skipIf(!dbUp)(
  "half (ii): a flip INSIDE the commit window leaves residue; the residue is wizard-scoped and the F4 reap removes it",
  async () => {
    const { pendingIngestionId } = await seed();
    const row = (await readPendingIngestionRow(pendingIngestionId))!;

    // All three statements succeed while W1 is still current; the supersession
    // commits AFTER the last predicate check and BEFORE this tx's commit — the
    // unclosable window.
    await withPostgresSyncPipelineLock(
      FILE,
      async (tx) => {
        expect(await transitionManifestRow(tx as never, row as never, "defer_until_modified")).toBe(
          true,
        );
        expect(await upsertWizardDeferral(tx as never, row as never, "defer_until_modified")).toBe(
          true,
        );
        expect(await deletePendingIngestion(tx as never, pendingIngestionId, W1)).toBe(true);
        // Commit-window flip: a bare rotation lands now (no purge — a
        // superseding purge would block on this tx's FOR UPDATE row and
        // serialize after our commit; the residue class exists precisely when
        // the superseding purge ran first or never saw us).
        await flipSessionTo(W2);
        return null; // normal return → COMMIT (this is the documented residue path)
      },
      { tryOnly: false },
    );

    // (a) Residue exists, and it is wizard-scoped — NOT a live deferral.
    const residue = await readDeferralRows(FILE);
    expect(residue).toHaveLength(1);
    expect(residue[0]!.wizard_session_id).toBe(W1); // non-NULL: invisible to readLiveDeferral by shape
    // The whole tx committed: manifest transitioned, pending_ingestions row gone.
    expect((await readManifestRow(W1, FILE)).status).toBe("defer_until_modified");
    expect(await readPendingIngestionRow(pendingIngestionId)).toBeNull();

    // (c-1) FRESH residue is NOT reaped — F4's 24-hour activity guard working
    // as intended (the rows were just written: deferred_at / transitioned_at
    // default to / are set to now()). This assertion protects the guard from
    // being weakened to make sweep tests pass.
    const reapStaleOnboardingSessions = await importReap();
    const freshRun = await reapStaleOnboardingSessions(REAP_ADMIN_DEPS);
    expect(freshRun.sessions.map((s) => s.wizardSessionId)).not.toContain(W1);
    expect(await readDeferralRows(FILE)).toHaveLength(1); // residue untouched while fresh

    // (c-2) Backdate EVERY W1 activity timestamp the F4 GREATEST window reads
    // past 24h. W1's committed surfaces after this test's tx: the deferral row
    // (deferred_at) AND the transitioned manifest row (observed_at,
    // transitioned_at) — the manifest UPDATE committed too; backdating only
    // deferred_at would leave the session "fresh" via the manifest columns.
    // (No checkpoints / shadows / pending rows exist for W1 here — the
    // pending_ingestions row was deleted by the committed tx.)
    await superseder!.unsafe(
      `update public.deferred_ingestions set deferred_at = now() - interval '25 hours'
        where wizard_session_id = $1::uuid`,
      [W1],
    );
    await superseder!.unsafe(
      `update public.onboarding_scan_manifest
          set observed_at = now() - interval '25 hours',
              transitioned_at = now() - interval '25 hours'
        where wizard_session_id = $1::uuid`,
      [W1],
    );

    // (c-3) NOW the F4 reap's orphan-row eligibility sweeps it (W1 non-active,
    // stale, checkpoint-less), regardless of the superseding session's state.
    const staleRun = await reapStaleOnboardingSessions(REAP_ADMIN_DEPS);
    expect(staleRun.sessions.map((s) => s.wizardSessionId)).toContain(W1);
    expect(await readDeferralRows(FILE)).toEqual([]);
  },
);
