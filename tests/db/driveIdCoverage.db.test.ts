/**
 * tests/db/driveIdCoverage.db.test.ts
 *
 * The live Drive-ID coverage guard (spec
 * docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md §4.1-§4.2).
 *
 * This runs in `tests/db/`, therefore in the serial vitest project, therefore in CI's
 * `unit-suite-db` job — a worker of the REQUIRED `unit-suite` aggregator, against a real
 * all-migrations-applied database. A Drive-ID column that lands without a canonical nonblank
 * CHECK makes this RED on the PR that introduces it.
 *
 * Two assertions with different jobs:
 *   1. the production assertion — audit the untouched schema, expect no findings. This is the
 *      regression guard; it passes today and goes red when a future column slips through.
 *   2. the NEGATIVE CONTROL — drop a known constraint inside a transaction and require the audit
 *      to notice. Against a vacuous auditor (one that returns [] regardless) this FAILS, which is
 *      exactly why it, not the production assertion, is what drives the implementation.
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";

import {
  auditDriveIdCoverage,
  canonicalBare,
  canonicalNullable,
  DRIVE_ID_COVERAGE_EXEMPTIONS,
  type CoverageFinding,
  type DriveIdColumn,
  type DriveIdConstraint,
} from "@/lib/driveIdCoverage/audit";
import {
  CENSUS_COLUMN_PREDICATE,
  CENSUS_COLUMNS_SQL,
  CENSUS_CONSTRAINTS_SQL,
  CENSUS_SCHEMAS,
  toColumns,
  toConstraints,
  unreachableDbFailure,
} from "@/lib/driveIdCoverage/introspect";
import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";

const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let probeError: unknown = null;
let probe: ReturnType<typeof postgres> | null = null;
try {
  probe = postgres(LOCAL_URL, {
    max: 4,
    idle_timeout: 2,
    connect_timeout: 5,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch (e) {
  probeError = e;
  if (probe) await probe.end().catch(() => {});
  // End the PROBE handle. `sql` is only assigned after the probe succeeds, so on this path it is
  // still null and the old `if (sql)` cleanup ended nothing, leaking the handle (whole-diff R1
  // finding 9). `probe` is scoped to the try block, so it is re-derived here via the closure.
  sql = null;
  dbUp = false;
}

/**
 * FAIL, never skip, under CI (spec §4.1, adversarial R4 finding 2).
 *
 * The sibling suite guards every test with `test.skipIf(!dbUp)`, which is right locally — a
 * developer without a stack should not face a wall of red. In CI it is wrong: `unit-suite-db`
 * provides a database, but "the job provides one" is not proof this suite REACHED it. A connection
 * failure would silently skip the guard and leave `unit-suite` green, which is precisely the state
 * this guard exists to prevent.
 */
const ciFailure = unreachableDbFailure({
  dbUp,
  ci: process.env.CI,
  host: (() => {
    try {
      return new URL(LOCAL_URL).host;
    } catch {
      return "<unparseable>";
    }
  })(),
  error: probeError,
});
if (ciFailure) throw ciFailure;

afterAll(async () => {
  if (sql) await sql.end().catch(() => {});
});

describe("Drive-ID coverage guard (live)", () => {
  test.skipIf(!dbUp)("the search_path pin actually takes effect inside the tx", async () => {
    const { searchPath } = await censusInPinnedTx(sql!);
    expect(searchPath).toBe("pg_catalog, public");
  });

  test.skipIf(!dbUp)(
    "PRODUCTION ASSERTION — every Drive-ID column carries a canonical nonblank CHECK",
    async () => {
      const { columns, constraints } = await censusInPinnedTx(sql!);
      const findings = auditDriveIdCoverage(columns, constraints, DRIVE_ID_COVERAGE_EXEMPTIONS);
      expect(
        findings,
        `Drive-ID columns without a canonical nonblank CHECK:\n${findings
          .map((f) => JSON.stringify(f))
          .join("\n")}`,
      ).toEqual([]);
    },
  );

  test.skipIf(!dbUp)(
    "NEGATIVE CONTROL — dropping a known constraint makes the audit report it",
    async () => {
      // Rollback MUST survive the failing path (adversarial R2 finding 2). Written as
      // BEGIN → DROP → expect(...) → ROLLBACK, a failing assertion throws before the rollback and
      // leaves a pooled connection holding ACCESS EXCLUSIVE on public.shows — on a database shared
      // with sibling worktree sessions, wedging every later test and every migration apply.
      // So: mutate and CAPTURE inside the tx, throw a sentinel to force the rollback, and assert
      // OUTSIDE on the captured value. No assertion ever runs inside the transaction.
      let captured: CoverageFinding[] | null = null;
      try {
        await sql!.begin(async (tx) => {
          await tx.unsafe(
            "alter table public.shows drop constraint shows_opening_reel_drive_file_id_nonblank",
            [],
          );
          await tx.unsafe("set local search_path = pg_catalog, public", []);
          // Assert the pin HERE too, not just in censusInPinnedTx: this path renders constraint
          // definitions under its own transaction, so a removed/ineffective SET would leave it
          // reading under the ambient path while still passing (whole-diff R1 finding 6).
          const [{ search_path: ncPath }] = (await tx.unsafe(
            "select current_setting('search_path') as search_path",
            [],
          )) as unknown as [{ search_path: string }];
          if (ncPath !== "pg_catalog, public") {
            throw new Error(`negative control: search_path not pinned, got ${ncPath}`);
          }
          const columnRows = await tx.unsafe(CENSUS_COLUMNS_SQL, [
            CENSUS_SCHEMAS as unknown as string[],
            CENSUS_COLUMN_PREDICATE,
          ]);
          const constraintRows = await tx.unsafe(CENSUS_CONSTRAINTS_SQL, [
            CENSUS_SCHEMAS as unknown as string[],
          ]);
          captured = auditDriveIdCoverage(
            toColumns(columnRows as never),
            toConstraints(constraintRows as never),
            DRIVE_ID_COVERAGE_EXEMPTIONS,
          );
          throw new Error("__rollback__");
        });
      } catch (e) {
        if ((e as Error)?.message !== "__rollback__") throw e;
      }

      expect(captured, "the transaction body never ran").not.toBeNull();
      expect(captured).toEqual([
        {
          kind: "uncovered",
          column: {
            schema: "public",
            table: "shows",
            column: "opening_reel_drive_file_id",
            nullable: true,
          },
        },
      ]);
    },
  );

  test.skipIf(!dbUp)("the rollback restored the dropped constraint", async () => {
    // Proves the negative control left no residue — the constraint it drops is back.
    const rows = await sql!.unsafe(
      `select 1 from pg_constraint
        where conname = 'shows_opening_reel_drive_file_id_nonblank'
          and conrelid = 'public.shows'::regclass`,
      [],
    );
    expect((rows as unknown as unknown[]).length).toBe(1);
  });

  test.skipIf(!dbUp)(
    "CANARIES — the parent migration still renders as our template constants",
    async () => {
      // The templates in lib/driveIdCoverage/audit.ts are module CONSTANTS. These canaries CHECK
      // them against constraints the repo already knows are correct; they never DERIVE them.
      // Deriving would let a poisoned constraint redefine canonicality itself (spec §4.2).
      // A Postgres upgrade that changes the deparser fails these two named assertions with a clear
      // message, instead of failing every column at once for no obvious reason.
      const { constraints } = await censusInPinnedTx(sql!);
      const find = (schema: string, table: string, name: string): string | undefined =>
        constraints.find((c) => c.schema === schema && c.table === table && c.name === name)
          ?.definition;

      expect(find("public", "shows", "shows_drive_file_id_nonblank")).toBe(
        canonicalBare("drive_file_id"),
      );
      expect(find("public", "sync_log", "sync_log_drive_file_id_nonblank")).toBe(
        canonicalNullable("drive_file_id"),
      );
    },
  );

  test.skipIf(!dbUp)(
    "the census predicate is a regex, so `driveXfileYid` is out of scope",
    async () => {
      // SQL LIKE treats `_` as a wildcard: '%drive_file_id%' matches driveXfileYid. The census uses
      // the POSIX-regex operator, where `_` is literal. This pins the difference in the database
      // itself rather than trusting the operator by inspection.
      const [row] = (await sql!.unsafe(
        `select ('driveXfileYid' ~ $1) as regex_matches,
              ('driveXfileYid' like '%drive_file_id%') as like_matches`,
        [CENSUS_COLUMN_PREDICATE],
      )) as unknown as [{ regex_matches: boolean; like_matches: boolean }];
      expect(row.regex_matches, "the regex predicate must NOT match driveXfileYid").toBe(false);
      expect(row.like_matches, "LIKE does match it — which is why LIKE is not used").toBe(true);
    },
  );

  test.skipIf(!dbUp)("the census is non-empty and covers both repo-owned schemas", async () => {
    // Guards against the census silently returning nothing — every assertion above would then be
    // vacuously green. This is a floor on a LIVE query, not on a stored artifact.
    const { columns } = await censusInPinnedTx(sql!);
    expect(columns.length).toBeGreaterThan(0);
    expect(new Set(columns.map((c) => c.schema))).toEqual(new Set(["public", "dev"]));
  });
});

// ─── T1: identity module, DB-bound negative controls ────────────────────────
// Spec docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md §3.1.
// These run against the LOCAL stack, whose system_identifier ≠ the pinned validation value —
// which is exactly what makes them negative controls that run on every dev box and in CI.
import {
  assertValidationIdentity,
  withValidationIdentityGuard,
  VALIDATION_SYSTEM_IDENTIFIER,
} from "@/tests/db/_validationTargetIdentity";

describe("validation target identity (negative controls vs the local stack)", () => {
  test.skipIf(!dbUp)(
    "assertValidationIdentity(LOCAL) throws the MISMATCH shape with both identifiers",
    () => {
      // Failure mode: a compare weakened to substring/prefix, or the constant pinned to local.
      let thrown: Error | null = null;
      try {
        assertValidationIdentity(LOCAL_URL);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown, "local stack must not satisfy the validation pin").not.toBeNull();
      expect(thrown!.message).toContain("MISMATCH");
      expect(thrown!.message).toContain(VALIDATION_SYSTEM_IDENTIFIER);
      expect(thrown!.message).toMatch(/system_identifier (\d+)/);
      expect(thrown!.message).not.toContain("infra");
    },
  );

  test("an unreachable host throws the INFRA shape, never the mismatch shape", () => {
    // Failure mode: infra faults masquerading as "wrong database" (or vice versa).
    let thrown: Error | null = null;
    try {
      assertValidationIdentity("postgresql://postgres:postgres@127.0.0.1:1/postgres");
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toContain("infra");
    expect(thrown!.message).not.toContain("MISMATCH");
  });

  test.skipIf(!dbUp)(
    "a guarded statement ABORTS on the local stack — the guard rides the same connection",
    async () => {
      // Failure mode: a guard block that executes but never raises (dropped `raise`, wrong
      // comparison type), or a guard detached from the statement it protects.
      let aborted = false;
      try {
        await sql!.unsafe(withValidationIdentityGuard("select 1"), []);
      } catch (e) {
        aborted = /validation identity guard/.test(String((e as Error).message));
      }
      expect(aborted, "guarded select must abort with the guard exception").toBe(true);
    },
  );
});

// ─── T2: dual-source census cross-check (spec §3.3) ─────────────────────────
import { censusInPinnedTx, diffCensusSources } from "@/tests/db/_censusRunner";
import { CENSUS_COLUMNS_PG_CATALOG_SQL } from "@/lib/driveIdCoverage/introspect";

describe("dual-source census cross-check", () => {
  test.skipIf(!dbUp)(
    "information_schema census SET-EQUALS the pg_catalog census, in ONE pinned tx",
    async () => {
      // Failure mode: any single-site narrowing of either query — predicate, schema list,
      // added filter, relkind drift. Both censuses come from the SAME transaction, so a
      // mid-flight DDL cannot explain a mismatch away.
      const { columns, columnsPgCatalog } = await censusInPinnedTx(sql!);
      const diff = diffCensusSources(columns, columnsPgCatalog);
      expect(diff, "the two catalog paths disagree about the census").toEqual({
        onlyA: [],
        onlyB: [],
      });
      expect(columns.length, "an empty census would make the equality vacuous").toBeGreaterThan(0);
    },
  );

  test.skipIf(!dbUp)(
    "NEGATIVE CONTROL — a narrowed pg_catalog predicate is caught by the SAME comparator",
    async () => {
      // Proves the production comparison bites; goes through diffCensusSources itself, so
      // weakening the comparator breaks this too (plan-R1 finding 5).
      const narrowed = CENSUS_COLUMNS_PG_CATALOG_SQL.replace(
        "~ 'drive_file_id'",
        "~ 'drive_file_idX'",
      );
      expect(narrowed, "the substitution must have changed the query").not.toBe(
        CENSUS_COLUMNS_PG_CATALOG_SQL,
      );
      const { columns } = await censusInPinnedTx(sql!);
      const rows = (await sql!.unsafe(narrowed, [])) as unknown as {
        table_schema: string;
        table_name: string;
        column_name: string;
      }[];
      const narrowedTuples = rows.map((r) => ({
        schema: r.table_schema,
        table: r.table_name,
        column: r.column_name,
      }));
      const diff = diffCensusSources(columns, narrowedTuples);
      expect(diff.onlyA.length, "narrowing must surface as a non-empty diff").toBeGreaterThan(0);
    },
  );
});
