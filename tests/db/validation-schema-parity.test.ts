/**
 * tests/db/validation-schema-parity.test.ts
 *
 * The validation-schema-parity gate. Catches the class where a committed
 * migration's public tables/columns never reach the persistent validation
 * Supabase project (the #9 "couldn't read this setting" incident: B3 migration
 * 20260602000003 added app_settings notify columns to the repo + local + CI-
 * fresh DB, but `supabase db push` is blocked on validation so a surgical apply
 * was required — and one sibling migration was skipped, leaving the live notify
 * toggles reading a column that didn't exist → infra_error → degraded UI).
 *
 * THREE layers (see scripts/schema-manifest/lib.ts for the shared logic):
 *
 *   1. MANIFEST FRESHNESS TRIPWIRE (DB-free, ALWAYS runs, incl. CI): every
 *      `alter table public.<t> add column <c>` across the migrations — the exact
 *      #9 vector — must already appear in the committed manifest. This is what
 *      stops a STALE manifest from blinding layer 2: if a dev adds the migration
 *      but forgets `pnpm gen:schema-manifest`, this fails in CI with no DB,
 *      BEFORE the (manifest-driven) parity check could falsely pass.
 *
 *   2. VALIDATION PARITY (runs against TEST_DATABASE_URL): the validation
 *      project must be a SUPERSET of the manifest — every repo-defined public
 *      table+column present live. Validation extras (Phase-0 remote-only
 *      objects) are ignored. In CI this targets the validation project; locally
 *      (TEST_DATABASE_URL unset) it targets the local stack the manifest came
 *      from (trivially passing — the meaningful run is CI).
 *
 *   3. LOCAL FRESHNESS EQUALITY (skips if no LOCAL db reachable): re-introspect
 *      the local all-migrations-applied DB and assert it serializes byte-for-byte
 *      to the committed manifest. Robust (no SQL parsing) and runs where the
 *      migration was authored + tested. Skips in the CI parity job (no local
 *      stack there); layer 1 is the CI-side freshness backstop.
 *
 * Env mirrors tests/db/postgrest-dml-lockdown.test.ts: TEST_DATABASE_URL is the
 * validation session-pooler URL in CI; unset → local fallback; set-but-empty →
 * loud mis-config error.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTROSPECT_PUBLIC_COLUMNS_SQL,
  diffManifestAgainstLive,
  manifestFromRows,
  parseAlterAddColumns,
  parsePsqlRows,
  serializeManifest,
  type SchemaManifest,
} from "../../scripts/schema-manifest/lib";

const MANIFEST_PATH = "supabase/__generated__/schema-manifest.json";
const MIGRATIONS_DIR = "supabase/migrations";
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function loadManifest(): SchemaManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

/** All migration SQL concatenated in apply order (so cross-file drops resolve). */
function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

function resolveParityDbUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (raw === undefined) return LOCAL_DB_URL;
  if (raw.trim() === "") {
    throw new Error(
      "TEST_DATABASE_URL is set but empty — likely a GitHub Actions secret " +
        "registered with an empty value. Re-run `gh secret set " +
        "SUPABASE_TEST_DATABASE_URL` with the validation session-pooler URL.",
    );
  }
  return raw;
}

function localFreshnessDbUrl(): string {
  return process.env.SCHEMA_MANIFEST_DB_URL?.trim() || LOCAL_DB_URL;
}

function introspectManifest(dbUrl: string): SchemaManifest {
  const stdout = execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: INTROSPECT_PUBLIC_COLUMNS_SQL,
    encoding: "utf8",
  });
  return manifestFromRows(parsePsqlRows(stdout));
}

function canConnect(dbUrl: string): boolean {
  try {
    execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-qAtc", "select 1"], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

describe("validation-schema-parity", () => {
  // ── Layer 1: manifest freshness tripwire (DB-free, always) ──────────────
  it("layer 1 — every migration `add column` is reflected in the committed manifest", () => {
    const manifest = loadManifest();
    const expected = parseAlterAddColumns(allMigrationsSql());
    const stale = expected.filter(({ table, column }) => !manifest[table]?.includes(column));
    expect(
      stale,
      `Committed ${MANIFEST_PATH} is STALE — it is missing column(s) that a ` +
        `migration adds:\n` +
        stale.map((s) => `  - ${s.table}.${s.column}`).join("\n") +
        `\nRun \`pnpm gen:schema-manifest\` (against your local stack) and commit the result.`,
    ).toEqual([]);
  });

  it("layer 1 — sanity: the #9 columns are present in the manifest (anti-tautology)", () => {
    // Guards against an empty/degenerate manifest making layer 1 vacuously pass.
    const manifest = loadManifest();
    expect(manifest.app_settings ?? []).toEqual(
      expect.arrayContaining([
        "alert_on_sync_problems",
        "daily_review_digest",
        "sync_cron_heartbeat_at",
      ]),
    );
  });

  // ── Layer 2: validation parity (vs TEST_DATABASE_URL) ───────────────────
  it("layer 2 — the validation project is a superset of the committed manifest", () => {
    const dbUrl = resolveParityDbUrl();
    if (!canConnect(dbUrl)) {
      // Only reached when no DB is reachable at all (no local stack AND no
      // validation secret). The CI parity job sets the secret; a developer
      // box runs the local stack. A hard skip here would hide a mis-wired CI
      // secret, so fail loudly instead.
      throw new Error(
        `Cannot connect to the parity target DB. In CI set TEST_DATABASE_URL to ` +
          `the validation session-pooler URL; locally start the Supabase stack.`,
      );
    }
    const manifest = loadManifest();
    const live = introspectManifest(dbUrl);
    const { missingTables, missingColumns } = diffManifestAgainstLive(manifest, live);

    const report = [
      ...missingTables.map((t) => `  - MISSING TABLE: ${t}`),
      ...missingColumns.map((c) => `  - MISSING COLUMN: ${c.table}.${c.column}`),
    ].join("\n");

    expect(
      { missingTables, missingColumns },
      `The validation project is missing schema the repo's migrations define ` +
        `(apply the outstanding migration(s) to validation via ` +
        `\`supabase db query --linked\` or \`psql "$TEST_DATABASE_URL" -f <migration>\`, ` +
        `then \`notify pgrst, 'reload schema'\`):\n${report}`,
    ).toEqual({ missingTables: [], missingColumns: [] });
  });

  // ── Layer 3: local freshness equality (skip if no local DB) ─────────────
  it("layer 3 — committed manifest equals a fresh introspection of the local DB", () => {
    const local = localFreshnessDbUrl();
    // Only meaningful against the LOCAL all-migrations-applied stack. In the CI
    // parity job the local stack isn't running (TEST_DATABASE_URL points at
    // validation); skip rather than compare validation to the manifest here —
    // that comparison is layer 2's job and would false-fail on Phase-0 extras.
    if (process.env.TEST_DATABASE_URL || !canConnect(local)) {
      return; // skip
    }
    const committed = readFileSync(MANIFEST_PATH, "utf8");
    const fresh = serializeManifest(introspectManifest(local));
    expect(
      fresh,
      `${MANIFEST_PATH} does not match a fresh introspection of the local DB. ` +
        `Run \`pnpm gen:schema-manifest\` and commit.`,
    ).toEqual(committed);
  });
});
