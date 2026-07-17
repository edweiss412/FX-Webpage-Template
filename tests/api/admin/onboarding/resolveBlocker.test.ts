import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

/**
 * Task 6 — POST /api/admin/onboarding/resolve-blocker SCAFFOLD (body/session guards only).
 *
 * `resolveUnarchive`/`resolveRebuild` are safe non-throwing placeholders in this task (each
 * returns `{ ok: false, status: "not_currently_blocked" }`) — Tasks 7/8 replace their bodies.
 * The pure body-guard tests (malformed JSON, missing fields, wrong_action) need no DB — the
 * route returns before ever opening the postgres.js connection. The session-guard tests
 * (superseded/no_active_session/not_found + the placeholder dispatch) are honest
 * DB-integration tests against local Postgres (54322) — the route opens its own privileged
 * connection (mirrors finalize-cas), not an injectable withTx seam.
 *
 * Task 7 — `action: "unarchive"` real transition. `resolveUnarchive`'s body now dispatches
 * `_unarchive_show_apply` and defers a post-commit `logAdminOutcome` via `deferPostResponse`.
 * `deferPostResponse` (Next's `after()`) throws synchronously outside a request scope (see
 * `lib/async/deferPostResponse.ts`), so this file module-mocks it to capture the scheduled
 * task instead of letting it throw and roll back the transaction — the captured task is run
 * INLINE, AFTER the committed DB state is asserted, proving the emit is genuinely post-commit.
 */

const deferredTasks: Array<() => Promise<void>> = [];
const deferPostResponseMock = vi.fn((task: () => Promise<void>) => {
  deferredTasks.push(task);
});
vi.mock("@/lib/async/deferPostResponse", () => ({
  deferPostResponse: (t: () => Promise<void>) => deferPostResponseMock(t),
}));

const logAdminOutcomeMock = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: (...a: unknown[]) => logAdminOutcomeMock(...a),
}));

import { handleResolveBlocker } from "@/app/api/admin/onboarding/resolve-blocker/route";
import { SHOW_ARCHIVED_IMMUTABLE } from "@/lib/sync/lifecycleGuards";

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "6a6a6a6a-1111-4111-8111-6a6a6a6a6a6a";
const OTHER_SESSION = "6b6b6b6b-2222-4222-8222-6b6b6b6b6b6b";
const DRIVE_FILE_ID = "resolve-blocker-guard-drive-file";
const ADMIN_EMAIL = "admin@example.com";
const FOLDER_ID = "resolve-blocker-guard-folder";

function req(body?: unknown): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/resolve-blocker", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const adminDeps = { requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }) };

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
  await sql
    .unsafe(`delete from public.onboarding_scan_manifest where drive_file_id = $1`, [DRIVE_FILE_ID])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.shows where drive_file_id = $1`, [DRIVE_FILE_ID])
    .catch(() => {});
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

async function seedActiveSession(session: string): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now()
      where id = 'default'`,
    [session],
  );
}

async function seedShow(opts: { archived?: boolean } = {}): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version, published, last_sync_status, archived)
       values ($1, $2, 'Resolve Blocker Guard', 'Client', 'v4', true, 'ok', $3)
       returning id`,
      [DRIVE_FILE_ID, `slug-${DRIVE_FILE_ID}`, opts.archived ?? false],
    ),
  );
  return row.id;
}

/** A minimal onboarding_scan_manifest row proving this driveFileId is a member
 * of this wizard session's scan (spec §3.2 step 3's authz re-derivation). */
async function seedManifestRow(session: string, driveFileId: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'Resolve Blocker Sheet', 'applied')`,
    [FOLDER_ID, session, driveFileId],
  );
}

async function getShow(driveFileId: string): Promise<{ archived: boolean; picker_epoch: number }> {
  return one<{ archived: boolean; picker_epoch: number }>(
    await sql!.unsafe(`select archived, picker_epoch from public.shows where drive_file_id = $1`, [
      driveFileId,
    ]),
  );
}

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  deferredTasks.length = 0;
  deferPostResponseMock.mockClear();
  logAdminOutcomeMock.mockClear();
  if (!dbUp) return;
  await cleanup();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("POST /api/admin/onboarding/resolve-blocker — body guards (no DB)", () => {
  test("malformed JSON body returns typed bad_request at HTTP 200", async () => {
    const req_ = new Request("http://x/api/admin/onboarding/resolve-blocker", {
      method: "POST",
      body: "{not json",
    });
    const res = await handleResolveBlocker(req_, adminDeps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "bad_request" });
  });

  test.each([
    [
      "missing action",
      { wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID, code: SHOW_ARCHIVED_IMMUTABLE },
    ],
    ["missing code", { wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID, action: "unarchive" }],
    [
      "missing driveFileId",
      { wizardSessionId: SESSION, code: SHOW_ARCHIVED_IMMUTABLE, action: "unarchive" },
    ],
    [
      "missing wizardSessionId",
      { driveFileId: DRIVE_FILE_ID, code: SHOW_ARCHIVED_IMMUTABLE, action: "unarchive" },
    ],
    [
      "empty-string wizardSessionId",
      {
        wizardSessionId: "",
        driveFileId: DRIVE_FILE_ID,
        code: SHOW_ARCHIVED_IMMUTABLE,
        action: "unarchive",
      },
    ],
    [
      "non-string code",
      { wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID, code: 5, action: "unarchive" },
    ],
    [
      "unrecognized action",
      {
        wizardSessionId: SESSION,
        driveFileId: DRIVE_FILE_ID,
        code: SHOW_ARCHIVED_IMMUTABLE,
        action: "delete",
      },
    ],
    ["no body at all", undefined],
  ])("bad_request when %s", async (_label, body) => {
    const res = await handleResolveBlocker(req(body), adminDeps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "bad_request" });
  });

  test("action: unarchive with a non-SHOW_ARCHIVED_IMMUTABLE code returns wrong_action, no mutation", async () => {
    const res = await handleResolveBlocker(
      req({
        wizardSessionId: SESSION,
        driveFileId: DRIVE_FILE_ID,
        code: "STAGED_REVIEW_ITEMS_CORRUPT",
        action: "unarchive",
      }),
      adminDeps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "wrong_action" });
  });

  test("action: rebuild with a non-STAGED_*_CORRUPT code returns wrong_action, no mutation", async () => {
    const res = await handleResolveBlocker(
      req({
        wizardSessionId: SESSION,
        driveFileId: DRIVE_FILE_ID,
        code: SHOW_ARCHIVED_IMMUTABLE,
        action: "rebuild",
      }),
      adminDeps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "wrong_action" });
  });
});

describe("POST /api/admin/onboarding/resolve-blocker — session guards + placeholder dispatch (DB)", () => {
  test.skipIf(!dbUp)("pending_wizard_session_id null → no_active_session", async () => {
    // cleanup() already nulled the session; no seed needed.
    const res = await handleResolveBlocker(
      req({
        wizardSessionId: SESSION,
        driveFileId: DRIVE_FILE_ID,
        code: SHOW_ARCHIVED_IMMUTABLE,
        action: "unarchive",
      }),
      adminDeps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "no_active_session" });
  });

  test.skipIf(!dbUp)("wizardSessionId not equal to the active session → superseded", async () => {
    await seedActiveSession(OTHER_SESSION);
    const res = await handleResolveBlocker(
      req({
        wizardSessionId: SESSION,
        driveFileId: DRIVE_FILE_ID,
        code: SHOW_ARCHIVED_IMMUTABLE,
        action: "unarchive",
      }),
      adminDeps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "superseded" });
  });

  test.skipIf(!dbUp)("driveFileId resolves to no shows row → not_found", async () => {
    await seedActiveSession(SESSION);
    // No seedShow() — DRIVE_FILE_ID has no shows row.
    const res = await handleResolveBlocker(
      req({
        wizardSessionId: SESSION,
        driveFileId: DRIVE_FILE_ID,
        code: SHOW_ARCHIVED_IMMUTABLE,
        action: "unarchive",
      }),
      adminDeps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "not_found" });
  });

  test.skipIf(!dbUp)(
    "valid unarchive request (matching session + existing non-archived, non-manifest show) → not_currently_blocked (Task 7: now the real authz re-derivation, not a placeholder)",
    async () => {
      await seedActiveSession(SESSION);
      await seedShow();
      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE_FILE_ID,
          code: SHOW_ARCHIVED_IMMUTABLE,
          action: "unarchive",
        }),
        adminDeps,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
    },
  );
});

describe("POST /api/admin/onboarding/resolve-blocker — action: unarchive real transition (Task 7)", () => {
  test.skipIf(!dbUp)(
    "unrelated archived show (not in session manifest) → not_currently_blocked, no mutation",
    async () => {
      await seedActiveSession(SESSION);
      await seedShow({ archived: true }); // archived, but NO manifest row for this session
      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE_FILE_ID,
          code: SHOW_ARCHIVED_IMMUTABLE,
          action: "unarchive",
        }),
        adminDeps,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
      const row = await getShow(DRIVE_FILE_ID);
      expect(row.archived).toBe(true); // unmutated
      expect(deferPostResponseMock).not.toHaveBeenCalled();
    },
  );

  test.skipIf(!dbUp)(
    "already-unarchived show (manifest row exists, not archived) → not_currently_blocked, no mutation",
    async () => {
      await seedActiveSession(SESSION);
      await seedShow({ archived: false });
      await seedManifestRow(SESSION, DRIVE_FILE_ID);
      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE_FILE_ID,
          code: SHOW_ARCHIVED_IMMUTABLE,
          action: "unarchive",
        }),
        adminDeps,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
      const row = await getShow(DRIVE_FILE_ID);
      expect(row.archived).toBe(false); // unmutated
      expect(deferPostResponseMock).not.toHaveBeenCalled();
    },
  );

  test.skipIf(!dbUp)(
    "real archived + in-manifest show → resolved; archived flips false, picker_epoch increments, post-commit emit",
    async () => {
      await seedActiveSession(SESSION);
      const showId = await seedShow({ archived: true });
      await seedManifestRow(SESSION, DRIVE_FILE_ID);
      const before = await getShow(DRIVE_FILE_ID);

      const res = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE_FILE_ID,
          code: SHOW_ARCHIVED_IMMUTABLE,
          action: "unarchive",
        }),
        adminDeps,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, status: "resolved" });

      const after = await getShow(DRIVE_FILE_ID);
      expect(after.archived).toBe(false);
      expect(after.picker_epoch).toBe(before.picker_epoch + 1);

      // Post-commit emit: scheduled via deferPostResponse (captured, not yet run),
      // logAdminOutcome must NOT have fired synchronously during the request.
      expect(deferPostResponseMock).toHaveBeenCalledTimes(1);
      expect(logAdminOutcomeMock).not.toHaveBeenCalled();

      const task = deferredTasks.at(-1)!;
      await task();

      expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
      expect(logAdminOutcomeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "ONBOARDING_BLOCKER_UNARCHIVED",
          source: "api.admin.onboarding.resolveBlocker",
          actorEmail: ADMIN_EMAIL,
          driveFileId: DRIVE_FILE_ID,
          wizardSessionId: SESSION,
          showId,
          result: "unarchived",
        }),
      );
    },
  );

  test.skipIf(!dbUp)(
    "idempotent no-op: _unarchive_show_apply's false return is safe + non-double-mutating, and the route's response mapping is unconditional on the boolean",
    async () => {
      // The route's own authz re-derivation (spec §3.2 step 3) hard-gates on
      // readShowArchived_unlocked === true BEFORE ever calling _unarchive_show_apply
      // (step 4), inside the SAME advisory-lock transaction as the RPC call — so a
      // literal HTTP replay after a committed resolve cannot reach the RPC's `false`
      // branch through the route (it is refused earlier, at not_currently_blocked;
      // that exact regression is covered by the "already-unarchived" case above).
      // This test instead proves the two halves of spec §3.2 step 5 ("either boolean
      // -> resolved") directly: (a) the RPC itself is idempotent — a second direct
      // call after a committed transition returns false, does not throw, and does
      // not double-mutate (no second picker_epoch bump / token rotation); and (b)
      // resolveUnarchive's response mapping has no conditional branch on the
      // boolean — a single unconditional `{ ok:true, status:"resolved" }` follows
      // the RPC call — so both booleans provably produce the identical response.
      await seedActiveSession(SESSION);
      const showId = await seedShow({ archived: true });
      await seedManifestRow(SESSION, DRIVE_FILE_ID);

      const firstRes = await handleResolveBlocker(
        req({
          wizardSessionId: SESSION,
          driveFileId: DRIVE_FILE_ID,
          code: SHOW_ARCHIVED_IMMUTABLE,
          action: "unarchive",
        }),
        adminDeps,
      );
      expect(await firstRes.json()).toEqual({ ok: true, status: "resolved" });
      await deferredTasks.at(-1)!(); // drain the first resolve's deferred emit

      const afterFirst = await getShow(DRIVE_FILE_ID);
      expect(afterFirst.archived).toBe(false);

      // Direct RPC idempotency (bypasses the route's guard on purpose — see comment above).
      const applyRows = (await sql!.unsafe(
        `select public._unarchive_show_apply($1) as transitioned`,
        [showId],
      )) as Array<{ transitioned: boolean }>;
      expect(applyRows[0]?.transitioned).toBe(false);

      const afterSecond = await getShow(DRIVE_FILE_ID);
      expect(afterSecond.archived).toBe(false);
      expect(afterSecond.picker_epoch).toBe(afterFirst.picker_epoch); // no double-bump
    },
  );
});
