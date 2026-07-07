#!/usr/bin/env node
// preflight-env.mjs — fail LOUD and EXPLICIT before a DB/e2e run when local
// secrets are missing or the local DB is unreachable.
//
// WHY: a missing `.env.local` (fresh worktree) or an exhausted local Supabase
// pool (after a long probing session) surfaces as dozens of cryptic downstream
// test failures — and you burn a session proving they're environmental, not
// real. This turns that 30-minute triage into one legible line:
//   ENV MISSING: HASH_FOR_LOG_PEPPER
//   DB UNREACHABLE: postgresql://...54322  (is `supabase start` running?)
//
// Zero deps. Reads .env.local itself (vitest does NOT auto-load it) but NEVER
// overwrites an already-exported process.env value — shell exports still win.
//
// Usage:
//   node scripts/preflight-env.mjs         # env checks + DB probe (if psql present)
//   node scripts/preflight-env.mjs --no-db # skip the DB round-trip
//   pnpm preflight
//
// Exit: 0 ok · 1 missing/invalid env · 2 DB unreachable

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipDb = process.argv.includes("--no-db");

// --- load .env.local (present-value wins; never clobber a real shell export) ---
const envPath = join(repoRoot, ".env.local");
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
} else {
  console.error(
    `preflight: no .env.local at ${envPath}\n` +
      `  Fresh worktree? Run:  pnpm worktree:link-env  (symlinks it from the main checkout)`,
  );
}

// key -> optional validator (returns error string, or null when ok)
const HARD = {
  HASH_FOR_LOG_PEPPER: (v) => (v.length >= 32 ? null : `must be >= 32 chars (got ${v.length})`),
  PICKER_COOKIE_SIGNING_KEY: null,
  NEXT_PUBLIC_SUPABASE_URL: null,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: null,
  SUPABASE_URL: null,
  SUPABASE_SERVICE_ROLE_KEY: null,
  SUPABASE_ANON_KEY: null,
  GOOGLE_SERVICE_ACCOUNT_JSON: (v) => {
    try {
      return JSON.parse(v).client_email ? null : "JSON lacks client_email";
    } catch {
      return "not valid JSON";
    }
  },
};

const missing = [];
const invalid = [];
for (const [key, validate] of Object.entries(HARD)) {
  const v = process.env[key];
  if (v === undefined || v === "") {
    missing.push(key);
    continue;
  }
  const err = validate ? validate(v) : null;
  if (err) invalid.push(`${key}: ${err}`);
}

for (const k of missing) console.error(`ENV MISSING: ${k}`);
for (const m of invalid) console.error(`ENV INVALID: ${m}`);

if (missing.length || invalid.length) {
  console.error(
    `\npreflight FAILED — ${missing.length} missing, ${invalid.length} invalid.\n` +
      `Fresh worktree fix:  pnpm worktree:link-env`,
  );
  process.exit(1);
}

// --- DB round-trip: distinguishes "pool exhausted / supabase down" from real failures ---
const dbUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (skipDb) {
  console.log(`preflight: env ✓  (DB probe skipped)`);
  process.exit(0);
}

const psql = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", "select 1"], {
  encoding: "utf8",
  timeout: 10_000,
});

if (psql.error?.code === "ENOENT") {
  console.warn(`preflight: env ✓  (psql not on PATH — DB probe skipped)`);
  process.exit(0);
}
if (psql.status !== 0) {
  console.error(
    `DB UNREACHABLE: ${dbUrl}\n` +
      `  ${(psql.stderr || "").trim().split("\n").pop() || "no output"}\n` +
      `  Is local Supabase up?  supabase status  ·  supabase start\n` +
      `  Pool exhausted after a long session?  supabase stop && supabase start`,
  );
  process.exit(2);
}

console.log(`preflight: env ✓  DB ✓  (${dbUrl.replace(/:[^:@/]+@/, ":***@")})`);
