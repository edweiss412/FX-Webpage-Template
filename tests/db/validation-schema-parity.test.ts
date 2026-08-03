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
 *      `alter table public.<t> add column <c>` AND every `create table public.<t>`
 *      across the migrations must already appear in the committed manifest. This
 *      is what stops a STALE manifest from blinding layer 2: if a dev adds the
 *      migration but forgets `pnpm gen:schema-manifest`, this fails in CI with no
 *      DB, BEFORE the (manifest-driven) parity check could falsely pass. Covering
 *      BOTH vectors matters — without the create-table half, a whole new public
 *      table whose manifest regen was skipped would drift past CI silently (Layer
 *      2 compares against the stale manifest; Layer 3 skips when
 *      TEST_DATABASE_URL is set).
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
  assertValidationIdentity,
  execPsqlRedacted,
  withValidationIdentityGuard,
} from "@/tests/db/_validationTargetIdentity";
import {
  INTROSPECT_PUBLIC_COLUMNS_SQL,
  diffManifestAgainstLive,
  manifestFromRows,
  parseAlterAddColumns,
  parseCreatedPublicTables,
  parsePsqlRows,
  serializeManifest,
  type SchemaManifest,
} from "../../scripts/schema-manifest/lib";

const MANIFEST_PATH = "supabase/__generated__/schema-manifest.json";
const MIGRATIONS_DIR = "supabase/migrations";
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// ── Target binding (spec 2026-07-26-driveid-guard-cluster-design §3.1) ──────
// Runs BEFORE any helper below can touch the target: when this suite is pointed at validation
// (TEST_DATABASE_URL set), the connected cluster must BE validation. A mismatch fails the whole
// file at collection with the discriminable two-identifier message — no later layer runs against
// an unproven target. Locally (unset) the local target is deliberate and nothing asserts.
if (process.env.TEST_DATABASE_URL !== undefined && process.env.TEST_DATABASE_URL.trim() !== "") {
  assertValidationIdentity(process.env.TEST_DATABASE_URL);
}

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

// Hard timeouts so a slow/asleep/unreachable validation Supabase fails fast instead
// of hanging the CI job for the GitHub-Actions default (6 hours). PGCONNECT_TIMEOUT
// caps libpq's connection attempt; execFileSync `timeout` SIGTERMs a hung psql as a
// catch-all. (The `timeout-minutes` in x-audits.yml is the outer backstop.)
const PSQL_CONNECT_TIMEOUT_S = "10";
const PSQL_PROCESS_TIMEOUT_MS = 30_000;

/**
 * `guarded` binds the introspection to the validation cluster ON ITS OWN CONNECTION (the DO
 * guard aborts under ON_ERROR_STOP if a multi-host/failover DSN routed this psql elsewhere).
 * Layer 3 introspects the LOCAL stack and passes false — the local target is deliberate.
 */
function introspectManifest(dbUrl: string, guarded: boolean): SchemaManifest {
  const sql = guarded
    ? withValidationIdentityGuard(INTROSPECT_PUBLIC_COLUMNS_SQL)
    : INTROSPECT_PUBLIC_COLUMNS_SQL;
  const stdout = execPsqlRedacted(dbUrl, ["-qAt"], sql);
  return manifestFromRows(parsePsqlRows(stdout));
}

function canConnect(dbUrl: string): boolean {
  try {
    execFileSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-qAtc", "select 1"], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"],
      timeout: PSQL_PROCESS_TIMEOUT_MS,
      env: { ...process.env, PGCONNECT_TIMEOUT: PSQL_CONNECT_TIMEOUT_S },
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

  it("layer 1 — every migration `create table` (public) is reflected in the committed manifest", () => {
    const manifest = loadManifest();
    const created = parseCreatedPublicTables(allMigrationsSql());
    const stale = created.filter((table) => !(table in manifest));
    expect(
      stale,
      `Committed ${MANIFEST_PATH} is STALE — it is missing public table(s) that a ` +
        `migration creates:\n` +
        stale.map((t) => `  - ${t}`).join("\n") +
        `\nRun \`pnpm gen:schema-manifest\` (against your local stack) and commit the result.`,
    ).toEqual([]);
  });

  it("layer 1 — sanity: a real created table + the #9 columns are in the manifest (anti-tautology)", () => {
    // Guards against an empty/degenerate manifest making layer 1 vacuously pass,
    // for BOTH the create-table and add-column halves.
    const manifest = loadManifest();
    expect(Object.keys(manifest)).toEqual(
      expect.arrayContaining(["email_deliveries", "show_share_tokens"]),
    );
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
    // Guarded exactly when the target is validation (TEST_DATABASE_URL set); the local
    // fallback target is deliberate and must not be identity-bound.
    const live = introspectManifest(dbUrl, process.env.TEST_DATABASE_URL !== undefined);
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
    const fresh = serializeManifest(introspectManifest(local, false));
    expect(
      fresh,
      `${MANIFEST_PATH} does not match a fresh introspection of the local DB. ` +
        `Run \`pnpm gen:schema-manifest\` and commit.`,
    ).toEqual(committed);
  });

  // ── CHECK-constraint parity (validation-observable) ─────────────────────
  // Layers 1-2 are COLUMNS-only — they parse `add column`/`create table` and never
  // observe CHECK constraints, so a CHECK-only migration (20260702120200 drive_file_id
  // nonblank) that never reached validation would slip past them silently. This layer
  // closes that blind spot: it derives the expected public constraint-name set FROM the
  // migration (no hardcoding) and asserts the validation DB contains all of them. A
  // skipped surgical validation apply → missing constraint → red CI.
  it("CHECK parity — validation has every public *_drive_file_id_nonblank CHECK the migration defines", () => {
    // BOTH nonblank migrations: 20260702120200 declared the original 14, and 20260725000000
    // added the four columns it had left uncovered (3 public + 1 dev mirror). Parsing only the
    // first is what let the second migration's constraints go unchecked against validation.
    const NONBLANK_MIGRATIONS = [
      "20260702120200_drive_file_id_nonblank.sql",
      "20260725000000_secondary_drive_id_nonblank.sql",
    ];
    const migrationSql = NONBLANK_MIGRATIONS.map((f) =>
      readFileSync(join(MIGRATIONS_DIR, f), "utf8"),
    ).join("\n");
    // Scoped to `public.` so it does NOT match the `alter table if exists dev.<t>` lines.
    const expected = new Set<string>();
    const re = /alter\s+table\s+public\.\w+\s+add\s+constraint\s+(\w+)\s+check/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(migrationSql)) !== null) expected.add(m[1]!);

    // Non-vacuity guard (Codex plan-R1 HIGH): a drifted/empty parse would make the
    // superset check trivially pass and silently defeat the guard. `17` is the canonical
    // public count (14 + 3) and must move in lockstep with any deliberate count change.
    expect(expected.size, "migration parse must yield exactly 17 public CHECK names").toBe(17);

    // Meaningful only against the validation target. Skip when TEST_DATABASE_URL is unset
    // (local dev) — mirror the Layer-2/set-but-empty posture above.
    const raw = process.env.TEST_DATABASE_URL;
    if (raw === undefined) return; // skip locally
    if (raw.trim() === "") {
      throw new Error(
        "TEST_DATABASE_URL is set but empty — likely a GitHub Actions secret " +
          "registered with an empty value. Re-run `gh secret set " +
          "SUPABASE_TEST_DATABASE_URL` with the validation session-pooler URL.",
      );
    }
    if (!canConnect(raw)) {
      throw new Error(
        `Cannot connect to the validation DB for CHECK-constraint parity. In CI set ` +
          `TEST_DATABASE_URL to the validation session-pooler URL.`,
      );
    }
    // Guarded on its own connection: the DO block aborts before the conname read if this psql
    // landed anywhere but validation (spec §3.1).
    const stdout = execPsqlRedacted(
      raw,
      ["-qAt"],
      withValidationIdentityGuard(
        "select conname from pg_constraint where conname like " +
          "'%\\_drive\\_file\\_id\\_nonblank' and connamespace = 'public'::regnamespace " +
          "and contype = 'c'",
      ),
    );
    const live = new Set(
      stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const missing = [...expected].filter((c) => !live.has(c));
    expect(
      missing,
      `The validation project is missing drive_file_id nonblank CHECK constraint(s) — ` +
        `apply supabase/migrations/20260702120200_drive_file_id_nonblank.sql to validation ` +
        `via \`psql "$TEST_DATABASE_URL" -f <migration>\`, then \`notify pgrst, 'reload schema'\`:\n` +
        missing.map((c) => `  - ${c}`).join("\n"),
    ).toEqual([]);
  });

  // ── Status-CHECK parity (validation-observable) ─────────────────────────
  // Sibling of the block above, added for the `expired` status migration
  // (spec docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md §4.4).
  // It is a SEPARATE parse rather than an addition to NONBLANK_MIGRATIONS,
  // whose `toBe(17)` non-vacuity guard is scoped to that constraint family.
  //
  // It asserts the constraint DEFINITION, not just its name: the name
  // `drive_watch_channels_status_check` already existed in validation carrying
  // the OLD six-value list, so a name-only superset check passes whether or not
  // the migration was ever applied.
  it("status-CHECK parity — validation's drive_watch_channels status CHECK admits `expired`", () => {
    const STATUS_MIGRATION = "20260726000000_drive_watch_expired_status.sql";
    const migrationSql = readFileSync(join(MIGRATIONS_DIR, STATUS_MIGRATION), "utf8");

    const re = /alter\s+table\s+public\.\w+\s+add\s+constraint\s+(\w+)\s+check/gi;
    const parsed = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(migrationSql)) !== null) parsed.add(m[1]!);

    // Non-vacuity guard: a drifted or empty parse would make the definition
    // check below unreachable and the test trivially green.
    expect(parsed.size, "migration parse must yield exactly 1 public CHECK name").toBe(1);
    expect(parsed.has("drive_watch_channels_status_check")).toBe(true);

    const raw = process.env.TEST_DATABASE_URL;
    if (raw === undefined) return; // skip locally, like the layer above
    if (raw.trim() === "") {
      throw new Error(
        "TEST_DATABASE_URL is set but empty — likely a GitHub Actions secret " +
          "registered with an empty value.",
      );
    }
    if (!canConnect(raw)) {
      throw new Error(
        "Cannot connect to the validation DB for status-CHECK parity. In CI set " +
          "TEST_DATABASE_URL to the validation session-pooler URL.",
      );
    }
    // Guarded + redacted like every other validation-targeting statement (spec
    // 2026-07-26-driveid-guard-cluster-design §3.1).
    const def = execPsqlRedacted(
      raw,
      ["-qAt"],
      withValidationIdentityGuard(
        "select pg_get_constraintdef(oid) from pg_constraint where conname = " +
          "'drive_watch_channels_status_check' and connamespace = 'public'::regnamespace",
      ),
    ).trim();

    expect(
      def,
      "The validation project's drive_watch_channels status CHECK does not admit " +
        "`expired` — apply supabase/migrations/" +
        STATUS_MIGRATION +
        ' to validation via `psql "$TEST_DATABASE_URL" -f <migration>`.',
    ).toMatch(/=\s*ANY\s*\(ARRAY\[[^)]*'expired'/i);
    // Matching a bare /'expired'/ would also pass a constraint such as
    // `status <> 'expired'`, which REJECTS the value this gate exists to admit
    // (whole-diff finding 7).
  });
});

// ── Drive-ID audit parity (spec 2026-07-26-driveid-guard-cluster-design §3.2) ─
// The definition-based layer: run the SAME auditor the local guard runs, against validation,
// over a census taken in ONE pinned transaction whose first statement is the identity guard.
// Tuple-keyed, definition-matched, column-substituted — a same-named constraint on another
// table, or one weakened to CHECK (true), cannot satisfy it (the conname layer above stays as
// the migration-anchored complement).
describe("drive-id audit parity (definition-based, vs validation)", () => {
  it("validation's Drive-ID columns all carry canonical CHECKs; census anchored both ways", async () => {
    const raw = process.env.TEST_DATABASE_URL;
    if (raw === undefined) return; // local dev: the local guard suite covers this machine
    if (raw.trim() === "") {
      throw new Error(
        "TEST_DATABASE_URL is set but empty — likely a GitHub Actions secret " +
          "registered with an empty value.",
      );
    }
    const postgres = (await import("postgres")).default;
    const { censusInPinnedTx, censusTupleKey, diffCensusSources, EXPECTED_DEV_CENSUS } =
      await import("@/tests/db/_censusRunner");
    const { identityGuardSql } = await import("@/tests/db/_validationTargetIdentity");
    const { auditDriveIdCoverage, DRIVE_ID_COVERAGE_EXEMPTIONS } =
      await import("@/lib/driveIdCoverage/audit");
    const client = postgres(raw, { max: 1, connect_timeout: 10, prepare: false });
    try {
      const { columns, constraints } = await censusInPinnedTx(client, {
        preambleSql: [identityGuardSql()],
      });

      // Anti-vacuity 1 — manifest-derived public membership. The committed manifest is
      // BASE-TABLE/public introspection with its own layer-1 freshness tripwires; every
      // manifest column matching the census pattern must appear in validation's census.
      const manifest: Record<string, string[]> = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
      const expectedPublic = Object.entries(manifest)
        .filter(([table]) => !table.startsWith("_"))
        .flatMap(([table, cols]) =>
          cols
            .filter((c) => /drive_file_id/.test(c))
            .map((column) => ({ schema: "public", table, column })),
        );
      expect(
        expectedPublic.length,
        "a broken derivation regex would empty the expected set and pass vacuously",
      ).toBeGreaterThan(0);
      const censusKeys = new Set(columns.map((c) => censusTupleKey(c)));
      const missingFromCensus = expectedPublic.filter((t) => !censusKeys.has(censusTupleKey(t)));
      expect(
        missingFromCensus,
        "manifest-derived Drive-ID columns absent from the validation census",
      ).toEqual([]);

      // Anti-vacuity 2 — the dev slice set-equals the committed six-tuple expectation,
      // both directions (dev is not in the manifest, so the first anchor cannot see it).
      const devSlice = columns
        .filter((c) => c.schema === "dev")
        .map((c) => ({ schema: c.schema, table: c.table, column: c.column }));
      expect(
        diffCensusSources(devSlice, EXPECTED_DEV_CENSUS),
        "validation's dev census does not match the committed expectation",
      ).toEqual({ onlyA: [], onlyB: [] });

      // The audit itself: zero findings = every census column canonically covered.
      const findings = auditDriveIdCoverage(columns, constraints, DRIVE_ID_COVERAGE_EXEMPTIONS);
      expect(
        findings,
        `validation Drive-ID coverage findings:\n${findings.map((f) => JSON.stringify(f)).join("\n")}`,
      ).toEqual([]);
    } finally {
      await client.end();
    }
  });
});
