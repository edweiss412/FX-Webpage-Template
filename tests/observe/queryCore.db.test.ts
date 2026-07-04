import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Vitest runs with NODE_ENV=test, where @next/env deliberately SKIPS .env.local,
// so the Supabase creds never reach process.env. Minimal test-scaffolding loader:
// read .env.local directly and populate only the vars we need if unset. If they
// are already present (e.g. CI real env), this is a no-op; if .env.local is
// absent, the probe below fails and the DB tests skip (mirror of other *.db.test).
function loadLocalEnv(): void {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(
        /^\s*(SUPABASE_URL|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*)\s*$/,
      );
      if (m && m[1] && !process.env[m[1]]) {
        process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local absent → leave process.env untouched; probe will skip.
  }
}
loadLocalEnv();

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const MARK = `observe-dbtest-${Math.trunc(Date.now())}`; // unique per run; Date.now allowed in test app code

// Connectivity probe + seed run at MODULE TOP LEVEL (top-level await), NOT in
// beforeAll, because test.skipIf(!dbUp) is evaluated at collection time — before
// beforeAll would run. Mirror of tests/db/driveFileIdNonblank.db.test.ts.
let dbUp = false;
let admin: ReturnType<typeof createClient> | null = null;
try {
  admin = createClient(URL, KEY || "sb_secret_placeholder", { auth: { persistSession: false } });
  const { error } = await admin.from("app_events").select("id").limit(1);
  dbUp = !error;
} catch {
  dbUp = false;
}
if (dbUp && admin) {
  await admin.from("app_events").insert({
    level: "error",
    source: MARK,
    message: "db integration probe",
    code: "OBSERVE_DBTEST",
    context: {},
  });
}

afterAll(async () => {
  if (dbUp && admin) await admin.from("app_events").delete().eq("source", MARK);
});

describe("read-core against local Supabase", () => {
  test.skipIf(!dbUp)("queryEvents reads the seeded row back by source filter", async () => {
    const { queryEvents } = await import("@/lib/observe/query/events");
    const r = await queryEvents({ source: MARK, sinceHours: 24 });
    if (r.kind !== "ok") throw new Error(r.message);
    expect(r.events.length).toBe(1);
    expect(r.events[0]).toMatchObject({ source: MARK, code: "OBSERVE_DBTEST", level: "error" });
  });
  test.skipIf(!dbUp)("queryAlerts returns ok (shape) and never surfaces context", async () => {
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const r = await queryAlerts({ limit: 5 });
    if (r.kind !== "ok") throw new Error(r.message);
    // AlertRow has no `context` field — structural guarantee
    for (const a of r.alerts) expect(a).not.toHaveProperty("context");
  });
  test.skipIf(!dbUp)("queryChangeLog returns ok (shape) without image fields", async () => {
    const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
    const r = await queryChangeLog({ limit: 5 });
    if (r.kind !== "ok") throw new Error(r.message);
    for (const c of r.changes) {
      expect(c).not.toHaveProperty("beforeImage");
      expect(c).not.toHaveProperty("afterImage");
    }
  });
});
