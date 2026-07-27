// Backoff spec §6 class 18 (real-DB half): a seeded drive_watch_reconcile_state
// row round-trips through the REAL readWatchSurfaceState against the local
// stack. Guard: seeding local while the service-role client reads a REMOTE
// ambient SUPABASE_URL would silently split the test across environments, so
// the ambient host must be loopback before the helper runs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "./_localDbUrl";

// The service-role client defaults its URL to local loopback
// (lib/supabase/server.ts) and the universal local dev keys; pin the ambient
// pair BEFORE the helper import so a shell that exported a REMOTE project can
// never be read against locally-seeded rows.
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SECRET_KEY ??=
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

import { readWatchSurfaceState } from "@/lib/admin/watchSurfaceState";

const databaseUrl = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });

const RUN = `plan-t8-${process.pid}-${Date.now()}`;
const FOLDER = `${RUN}-folder`;
const cleanup = () =>
  sql`delete from drive_watch_reconcile_state where watched_folder_id like ${RUN + "%"}`;

function ambientSupabaseIsLoopback(): boolean {
  try {
    const host = new URL(process.env.SUPABASE_URL ?? "").hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
}

describe("readWatchSurfaceState against the real local stack (class 18)", () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await sql.end();
  });

  it("a seeded row round-trips with camelCase values and ISO-string nextAttemptAt", async () => {
    if (!ambientSupabaseIsLoopback()) {
      throw new Error(
        "ambient SUPABASE_URL is not loopback — this suite seeds the LOCAL DB and must read it back through the LOCAL PostgREST (backoff plan review r3 finding 2)",
      );
    }
    await sql`insert into drive_watch_reconcile_state
                (watched_folder_id, consecutive_failures, next_attempt_at, last_attempt_outcome)
              values (${FOLDER}, 2, now() + interval '15 minutes', 'failed')`;

    const state = await readWatchSurfaceState(FOLDER);

    expect(state).not.toBeNull();
    if (state === null || "kind" in state!) throw new Error("expected a mapped row");
    expect(state.consecutiveFailures).toBe(2);
    expect(state.lastAttemptOutcome).toBe("failed");
    expect(typeof state.nextAttemptAt).toBe("string");
    expect(Number.isFinite(Date.parse(state.nextAttemptAt!))).toBe(true);
  });

  it("no row → null", async () => {
    const state = await readWatchSurfaceState(`${RUN}-missing`);
    expect(state).toBeNull();
  });
});
