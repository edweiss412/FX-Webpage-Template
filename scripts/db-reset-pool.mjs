#!/usr/bin/env node
// db-reset-pool.mjs — terminate leaked/idle connections on the LOCAL Supabase
// Postgres so a full test run stops failing on "too many clients" / pool
// exhaustion after a long probing session.
//
// WHY: one local Postgres (max_connections 100) is shared by every worktree, dev
// server, and psql session on the box, and sits at ~28 backends before any test
// runs -- mostly Supabase's own services (PostgREST, realtime, pg_cron, pg_net),
// though that split was observed, not audited. This reaps stranded connections
// without a full `supabase stop && start` (seconds, not a container bounce). Run
// before the final full-suite verification pass.
//
// An earlier version of this comment blamed module-level postgres.js clients
// with no idle_timeout accumulating across the serial run. That was measured
// false on 2026-07-24 and the matching BL-TEST-PG-CLIENT-TEARDOWN backlog entry
// is withdrawn: vitest terminates each file's worker when the file finishes
// (isolate:true, the default), closing its sockets, and postgres.js opens
// connections lazily so a `max: N` pool rarely holds N. Across the full suite
// (1603 files) postgres.js peaked at 5 backends of 100 with no growth over the
// run.
//
// That removes the explanation the entry gave. It does not identify what DOES
// strand connections here — concurrent load is the plausible remainder, not a
// measured conclusion — and it says nothing about runs configured differently
// (e.g. --fileParallelism). See BACKLOG.md's withdrawn entry for the numbers,
// and tests/cross-cutting/db-test-connection-hygiene.test.ts for the guard that
// keeps the isolation from being switched off.
//
// HARD SAFETY GUARD: refuses to run against anything but a loopback host. It
// will NEVER touch the validation or prod database — even if TEST_DATABASE_URL
// is pointed at a remote pooler.
//
// Usage:
//   node scripts/db-reset-pool.mjs                 # reap idle backends on local
//   node scripts/db-reset-pool.mjs --all           # also terminate ACTIVE (not just idle)
//   pnpm db:reset-pool
//
// Exit: 0 reaped (or nothing to reap) · 1 refused (non-loopback) · 2 psql error

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load TEST_DATABASE_URL from .env.local if not already exported (shell wins).
const envPath = join(repoRoot, ".env.local");
if (process.env.TEST_DATABASE_URL === undefined && existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("TEST_DATABASE_URL=")) {
      let v = line.slice("TEST_DATABASE_URL=".length).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env.TEST_DATABASE_URL = v;
      break;
    }
  }
}

// Default to the local Supabase Postgres, NOT whatever TEST_DATABASE_URL points
// at — this tool only ever operates on local. If TEST_DATABASE_URL is loopback
// we honor it (custom local port); otherwise we ignore it and use the default.
const DEFAULT_LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOOPBACK = /^postgres(?:ql)?:\/\/[^@]+@(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i;

const candidate = process.env.TEST_DATABASE_URL ?? DEFAULT_LOCAL;
const dbUrl = LOOPBACK.test(candidate) ? candidate : DEFAULT_LOCAL;

if (!LOOPBACK.test(dbUrl)) {
  console.error(
    `db-reset-pool: REFUSED — resolved URL is not loopback (${dbUrl.replace(/:[^:@/]+@/, ":***@")}).\n` +
      `  This tool only operates on the local database. Nothing done.`,
  );
  process.exit(1);
}

const all = process.argv.includes("--all");

// Terminate this DB's backends other than our own session. Default: only idle
// ones, because a stranded connection is never mid-query -- but note the
// converse does NOT hold: `idle` also covers healthy pools between queries, so
// the default WILL drop a running dev server's or app pool's connections. They
// reconnect; that is the trade this script makes. --all additionally kills
// backends that are mid-query.
const stateFilter = all ? "" : "and state = 'idle'";
const sql = `
  select count(*)::int as reaped from (
    select pg_terminate_backend(pid)
      from pg_stat_activity
     where datname = current_database()
       and pid <> pg_backend_pid()
       and usename = current_user
       and application_name <> 'db-reset-pool'
       ${stateFilter}
  ) t;
`;

const psql = spawnSync(
  "psql",
  [dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", `set application_name = 'db-reset-pool'; ${sql}`],
  { encoding: "utf8", timeout: 10_000 },
);

if (psql.error?.code === "ENOENT") {
  console.error("db-reset-pool: psql not on PATH.");
  process.exit(2);
}
if (psql.status !== 0) {
  console.error(
    `db-reset-pool: psql failed against ${dbUrl.replace(/:[^:@/]+@/, ":***@")}\n` +
      `  ${(psql.stderr || "").trim().split("\n").pop() || "no output"}\n` +
      `  Is local Supabase up?  supabase status  ·  supabase start`,
  );
  process.exit(2);
}

const reaped = (psql.stdout || "").trim().split("\n").pop() || "0";
console.log(
  `db-reset-pool: terminated ${reaped} ${all ? "" : "idle "}backend(s) on local Postgres. ` +
    `Pool clear for the next test run.`,
);
