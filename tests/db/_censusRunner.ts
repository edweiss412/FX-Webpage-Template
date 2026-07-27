/**
 * tests/db/_censusRunner.ts
 *
 * The shared pinned-transaction census runner + the tuple-set primitives every Drive-ID guard
 * mechanism keys by (spec 2026-07-26-driveid-guard-cluster-design §3.2/§3.3).
 *
 * ONE explicit transaction on ONE connection: `set local search_path` pin, in-tx
 * `current_setting` assert, optional preamble statements (the validation layer passes the
 * identity DO guard here), then BOTH census queries and the constraint query. Both censuses
 * coming from the SAME transaction is what makes the dual-source comparison meaningful — no
 * caller can split them across connections or interleave DDL between them.
 */
import type postgres from "postgres";

import type { DriveIdColumn, DriveIdConstraint } from "@/lib/driveIdCoverage/audit";
import {
  CENSUS_COLUMN_PREDICATE,
  CENSUS_COLUMNS_PG_CATALOG_SQL,
  CENSUS_COLUMNS_SQL,
  CENSUS_CONSTRAINTS_SQL,
  CENSUS_SCHEMAS,
  toColumns,
  toConstraints,
} from "@/lib/driveIdCoverage/introspect";

export type CensusTuple = { schema: string; table: string; column: string };

/**
 * The ONE injective tuple key. Postgres identifiers may contain dots when quoted, so
 * `schema.table.column` string-joins are NOT injective — the audit already keys by
 * JSON-encoded tuples for exactly this reason (lib/driveIdCoverage/audit.ts keyOf).
 */
export function censusTupleKey(t: CensusTuple): string {
  return JSON.stringify([t.schema, t.table, t.column]);
}

/**
 * The ONE comparator for census tuple sets. The production cross-check asserts both arrays
 * empty; the negative control asserts a non-empty diff THROUGH THIS SAME FUNCTION — weakening
 * it to a length/subset comparison breaks both (plan-R1 finding 5).
 */
export function diffCensusSources(
  a: readonly CensusTuple[],
  b: readonly CensusTuple[],
): { onlyA: CensusTuple[]; onlyB: CensusTuple[] } {
  const aKeys = new Set(a.map(censusTupleKey));
  const bKeys = new Set(b.map(censusTupleKey));
  return {
    onlyA: a.filter((t) => !bKeys.has(censusTupleKey(t))),
    onlyB: b.filter((t) => !aKeys.has(censusTupleKey(t))),
  };
}

export type CensusResult = {
  columns: DriveIdColumn[];
  columnsPgCatalog: CensusTuple[];
  constraints: DriveIdConstraint[];
  searchPath: string;
};

/**
 * Introspect inside ONE explicit transaction on ONE connection, with the search_path pinned.
 *
 * `SET LOCAL` is transaction- AND connection-scoped: issued autocommit, or followed by a query
 * that lands on a different pooled connection, it silently expires and the rendering is taken
 * under the ambient path — the very thing the pin exists to prevent. `current_setting` is
 * asserted INSIDE the transaction before any rendering is trusted.
 */
export async function censusInPinnedTx(
  sql: ReturnType<typeof postgres>,
  opts?: { preambleSql?: string[] },
): Promise<CensusResult> {
  return await sql.begin(async (tx) => {
    await tx.unsafe("set local search_path = pg_catalog, public", []);
    const [{ search_path: searchPath }] = (await tx.unsafe(
      "select current_setting('search_path') as search_path",
      [],
    )) as unknown as [{ search_path: string }];
    if (searchPath !== "pg_catalog, public") {
      throw new Error(`census runner: search_path not pinned, got ${searchPath}`);
    }
    for (const stmt of opts?.preambleSql ?? []) {
      await tx.unsafe(stmt, []);
    }
    const columnRows = await tx.unsafe(CENSUS_COLUMNS_SQL, [
      CENSUS_SCHEMAS as unknown as string[],
      CENSUS_COLUMN_PREDICATE,
    ]);
    const pgCatalogRows = (await tx.unsafe(CENSUS_COLUMNS_PG_CATALOG_SQL, [])) as unknown as {
      table_schema: string;
      table_name: string;
      column_name: string;
    }[];
    const constraintRows = await tx.unsafe(CENSUS_CONSTRAINTS_SQL, [
      CENSUS_SCHEMAS as unknown as string[],
    ]);
    return {
      columns: toColumns(columnRows as never),
      columnsPgCatalog: pgCatalogRows.map((r) => ({
        schema: r.table_schema,
        table: r.table_name,
        column: r.column_name,
      })),
      constraints: toConstraints(constraintRows as never),
      searchPath,
    };
  });
}

/**
 * The validation project's expected `dev`-slice census (spec §3.2, R1-3). Hand-maintained,
 * set-equality both directions: a missing tuple is drift (a migration that never reached
 * validation); a NEW tuple is red until this list is extended in a reviewed diff. Same
 * committed-expectation class as PUBLIC_NONBLANK_TABLES and the CHECK layer's lockstep count.
 */
export const EXPECTED_DEV_CENSUS: CensusTuple[] = [
  { schema: "dev", table: "pending_ingestions", column: "drive_file_id" },
  { schema: "dev", table: "pending_syncs", column: "drive_file_id" },
  { schema: "dev", table: "shows", column: "drive_file_id" },
  { schema: "dev", table: "shows", column: "opening_reel_drive_file_id" },
  { schema: "dev", table: "sync_audit", column: "drive_file_id" },
  { schema: "dev", table: "sync_log", column: "drive_file_id" },
];

// ─── Probe-registry hygiene (spec §3.4) ─────────────────────────────────────

import { canonicalBare, canonicalNullable } from "@/lib/driveIdCoverage/audit";

export type ProbeRegistryRow = {
  schema: "public" | "dev";
  table: string;
  column: string;
  nullable: boolean;
  /** The canonical CHECK this probe exercises — verified live, and the rejection must cite it. */
  constraintName: string;
  /** Column-list fragment for the NOT NULL siblings (plus ported extras). */
  siblings: string;
  /** Values fragment for those siblings (SQL literals/functions). */
  siblingValues: string;
  /** Optional in-tx parent insert (FK targets); rolled back with everything else. */
  setup?: string;
};

export type ProbeExemption = { schema: string; table: string; column: string; reason: string };

export type ProbeRegistryFinding =
  | { kind: "unprobed_tuple"; tuple: CensusTuple }
  | { kind: "stale_probe"; tuple: CensusTuple }
  | { kind: "constraint_mismatch"; tuple: CensusTuple; detail: string }
  | { kind: "nullable_mismatch"; tuple: CensusTuple; claimed: boolean }
  | { kind: "empty_reason"; exemption: ProbeExemption }
  | { kind: "duplicate_exemption"; key: string }
  | { kind: "stale_exemption"; exemption: ProbeExemption }
  | { kind: "probe_exemption_overlap"; key: string };

/**
 * PURE hygiene auditor for the behavioral-probe registry: census ⊆ probes ∪ exemptions, no
 * stale rows in either list, every row's constraint claim verified against the LIVE constraint
 * set (name on the claimed table AND definition exactly the canonical rendering for the claimed
 * column + nullability), and the two lists disjoint. Mirrors auditDriveIdCoverage's pure split
 * so every branch is exercisable with synthetic input.
 */
export function auditProbeRegistry(input: {
  censusColumns: readonly (CensusTuple & { nullable: boolean })[];
  censusConstraints: readonly DriveIdConstraint[];
  probes: readonly ProbeRegistryRow[];
  exemptions: readonly ProbeExemption[];
}): ProbeRegistryFinding[] {
  const findings: ProbeRegistryFinding[] = [];
  const censusByKey = new Map(input.censusColumns.map((c) => [censusTupleKey(c), c]));
  const probeKeys = new Set(input.probes.map((p) => censusTupleKey(p)));

  // exemption hygiene (auditDriveIdCoverage's rules + the overlap rule, R1-4)
  const seen = new Set<string>();
  const exemptKeys = new Set<string>();
  for (const e of input.exemptions) {
    const k = censusTupleKey(e);
    if (e.reason.trim() === "") findings.push({ kind: "empty_reason", exemption: e });
    if (seen.has(k)) {
      findings.push({ kind: "duplicate_exemption", key: k });
      continue;
    }
    seen.add(k);
    exemptKeys.add(k);
    if (probeKeys.has(k)) findings.push({ kind: "probe_exemption_overlap", key: k });
    if (e.reason.trim() !== "" && !censusByKey.has(k)) {
      findings.push({ kind: "stale_exemption", exemption: e });
    }
  }

  for (const p of input.probes) {
    const k = censusTupleKey(p);
    const censusCol = censusByKey.get(k);
    if (censusCol === undefined) {
      findings.push({ kind: "stale_probe", tuple: { schema: p.schema, table: p.table, column: p.column } });
      continue;
    }
    if (censusCol.nullable !== p.nullable) {
      findings.push({
        kind: "nullable_mismatch",
        tuple: { schema: p.schema, table: p.table, column: p.column },
        claimed: p.nullable,
      });
    }
    const live = input.censusConstraints.find(
      (c) => c.schema === p.schema && c.table === p.table && c.name === p.constraintName,
    );
    const expected = censusCol.nullable ? canonicalNullable(p.column) : canonicalBare(p.column);
    if (live === undefined) {
      findings.push({
        kind: "constraint_mismatch",
        tuple: { schema: p.schema, table: p.table, column: p.column },
        detail: `no constraint named ${p.constraintName} on ${p.schema}.${p.table}`,
      });
    } else if (live.definition !== expected) {
      findings.push({
        kind: "constraint_mismatch",
        tuple: { schema: p.schema, table: p.table, column: p.column },
        detail: `${p.constraintName} renders as ${live.definition}, expected ${expected}`,
      });
    }
  }

  for (const c of input.censusColumns) {
    const k = censusTupleKey(c);
    if (!probeKeys.has(k) && !exemptKeys.has(k)) {
      findings.push({
        kind: "unprobed_tuple",
        tuple: { schema: c.schema, table: c.table, column: c.column },
      });
    }
  }
  return findings;
}
