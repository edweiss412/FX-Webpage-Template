import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleResolveBlocker } from "@/app/api/admin/onboarding/resolve-blocker/route";
import { SHOW_ARCHIVED_IMMUTABLE } from "@/lib/sync/lifecycleGuards";

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
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "6a6a6a6a-1111-4111-8111-6a6a6a6a6a6a";
const OTHER_SESSION = "6b6b6b6b-2222-4222-8222-6b6b6b6b6b6b";
const DRIVE_FILE_ID = "resolve-blocker-guard-drive-file";
const ADMIN_EMAIL = "admin@example.com";

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
  const probe = postgres(LOCAL_URL, { max: 2, idle_timeout: 2, connect_timeout: 3, prepare: false });
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

async function seedShow(): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version, published, last_sync_status)
       values ($1, $2, 'Resolve Blocker Guard', 'Client', 'v4', true, 'ok')
       returning id`,
      [DRIVE_FILE_ID, `slug-${DRIVE_FILE_ID}`],
    ),
  );
  return row.id;
}

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
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
    ["missing action", { wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID, code: SHOW_ARCHIVED_IMMUTABLE }],
    ["missing code", { wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID, action: "unarchive" }],
    ["missing driveFileId", { wizardSessionId: SESSION, code: SHOW_ARCHIVED_IMMUTABLE, action: "unarchive" }],
    ["missing wizardSessionId", { driveFileId: DRIVE_FILE_ID, code: SHOW_ARCHIVED_IMMUTABLE, action: "unarchive" }],
    [
      "empty-string wizardSessionId",
      { wizardSessionId: "", driveFileId: DRIVE_FILE_ID, code: SHOW_ARCHIVED_IMMUTABLE, action: "unarchive" },
    ],
    [
      "non-string code",
      { wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID, code: 5, action: "unarchive" },
    ],
    [
      "unrecognized action",
      { wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID, code: SHOW_ARCHIVED_IMMUTABLE, action: "delete" },
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
    "valid unarchive request (matching session + existing show) reaches the placeholder → not_currently_blocked",
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
