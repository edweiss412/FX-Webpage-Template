import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import {
  handleUnignore,
  type UnignoreRouteDeps,
} from "@/app/api/admin/ignored-sheets/[driveFileId]/unignore/route";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

/**
 * Task C2 — un-ignore route: deletes the LIVE permanent_ignore deferral for a drive
 * file under the per-show advisory lock, idempotently. Admin-gated.
 *
 * Real DB (local 54322): asserts the live row is gone after POST, a second POST is an
 * idempotent 200 no-op, and a non-admin caller gets 403 without touching the row.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const DRIVE_FILE_ID = "c2-unignore-drive-file";
const ADMIN_EMAIL = "doug@fxav.com";

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

async function cleanup(): Promise<void> {
  if (!sql) return;
  await sql
    .unsafe(`delete from public.deferred_ingestions where drive_file_id = '${DRIVE_FILE_ID}'`, [])
    .catch(() => {});
}

async function seedLiveIgnore(): Promise<void> {
  await sql!.unsafe(
    `insert into public.deferred_ingestions
       (drive_file_id, deferred_kind, deferred_by_email, drive_file_name, wizard_session_id)
     values ($1, 'permanent_ignore', $2, 'C2 Fixture.gsheet', null)`,
    [DRIVE_FILE_ID, ADMIN_EMAIL],
  );
}

async function liveRowCount(): Promise<number> {
  return (
    await sql!.unsafe(
      `select 1 from public.deferred_ingestions
        where drive_file_id = $1 and wizard_session_id is null`,
      [DRIVE_FILE_ID],
    )
  ).length;
}

const context = { params: Promise.resolve({ driveFileId: DRIVE_FILE_ID }) };

function req(): Request {
  return new Request(`https://crew.fxav.test/api/admin/ignored-sheets/${DRIVE_FILE_ID}/unignore`, {
    method: "POST",
  });
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

describe("Task C2 — un-ignore route (real DB)", () => {
  test.skipIf(!dbUp)("POST deletes the live permanent_ignore deferral", async () => {
    await seedLiveIgnore();
    expect(await liveRowCount()).toBe(1);

    const response = await handleUnignore(req(), context, {
      requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unignored" });

    expect(await liveRowCount()).toBe(0);
  });

  test.skipIf(!dbUp)("a second POST is an idempotent 200 no-op (no row present)", async () => {
    await seedLiveIgnore();

    const first = await handleUnignore(req(), context, {
      requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
    });
    expect(first.status).toBe(200);

    // Row already gone — un-ignoring again must still succeed.
    const second = await handleUnignore(req(), context, {
      requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: "unignored" });
    expect(await liveRowCount()).toBe(0);
  });

  test.skipIf(!dbUp)("a non-admin caller gets 403 and the row is untouched", async () => {
    await seedLiveIgnore();

    const response = await handleUnignore(req(), context, {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_FORBIDDEN" };
      },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });

    // The ignore row survives — a rejected caller must not be able to mutate it.
    expect(await liveRowCount()).toBe(1);
  });
});

// Success-outcome telemetry (audit finding #15b). DB-free: an injected withRowTx that RESOLVES
// stands in for the committed locked delete, so the emit path is exercised without local postgres.
// A committed un-ignore leaves a durable IGNORED_SHEET_UNIGNORED audit row (hashed actor,
// driveFileId); a 403 (no mutation) and an infra throw (rolled back → 500) leave NONE. Failure
// modes caught: (1) a committed un-ignore with no durable audit row; (2) a rejected/failed
// un-ignore logging a false success.
describe("un-ignore success-outcome telemetry (injected tx, no DB)", () => {
  afterEach(() => resetLogSink());
  function capture(): LogRecord[] {
    const sink: LogRecord[] = [];
    setLogSink((r) => {
      sink.push(r);
    });
    return sink;
  }
  // A locked-tx stub whose deleteLiveDeferral resolves (committed) — the route emits POST-resolve.
  // The route only touches tx.deleteLiveDeferral, so a partial tx cast to the full shape suffices.
  const okTx: NonNullable<UnignoreRouteDeps["withRowTx"]> = async (_driveFileId, fn) =>
    fn({ deleteLiveDeferral: async () => {} } as unknown as Parameters<typeof fn>[0]);

  test("committed un-ignore → durable IGNORED_SHEET_UNIGNORED (hashed actor, driveFileId)", async () => {
    const sink = capture();
    const response = await handleUnignore(req(), context, {
      requireAdminIdentity: async () => ({ email: "Doug@FXAV.com" }),
      withRowTx: okTx,
    });
    expect(response.status).toBe(200);
    const rec = sink.filter((r) => r.code === "IGNORED_SHEET_UNIGNORED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("api.admin.ignoredSheets.unignore");
    expect(typeof rec[0]!.actorHash).toBe("string"); // hashed, never raw
    expect(rec[0]!.actorHash).not.toBe("Doug@FXAV.com");
    expect(rec[0]!.driveFileId).toBe(DRIVE_FILE_ID);
  });

  test("non-admin 403 → NO IGNORED_SHEET_UNIGNORED row", async () => {
    const sink = capture();
    const response = await handleUnignore(req(), context, {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_FORBIDDEN" };
      },
      withRowTx: okTx,
    });
    expect(response.status).toBe(403);
    expect(sink.some((r) => r.code === "IGNORED_SHEET_UNIGNORED")).toBe(false);
  });

  test("infra throw (rolled back → 500) → NO IGNORED_SHEET_UNIGNORED row", async () => {
    const sink = capture();
    const response = await handleUnignore(req(), context, {
      requireAdminIdentity: async () => ({ email: "Doug@FXAV.com" }),
      withRowTx: async () => {
        throw new Error("db down");
      },
    });
    expect(response.status).toBe(500);
    expect(sink.some((r) => r.code === "IGNORED_SHEET_UNIGNORED")).toBe(false);
  });
});
