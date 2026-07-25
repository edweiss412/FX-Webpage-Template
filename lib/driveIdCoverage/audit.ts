/**
 * lib/driveIdCoverage/audit.ts
 *
 * The pure Drive-ID coverage auditor
 * (spec docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md §4.1-§4.5).
 *
 * Given a census of Drive-ID-bearing columns, the CHECK constraints that exist, and the
 * exemption list, return every reason the schema is NOT fully covered. Empty result = green.
 *
 * PURE by contract: no database handle, no environment read, no filesystem, no clock. The live
 * introspection that feeds it lives in lib/driveIdCoverage/introspect.ts, and the two halves are
 * tested separately — that split is what lets every branch here be exercised with synthetic input,
 * including states no real schema produces.
 */

/** A column whose name matches the Drive-ID pattern, as returned by the census query. */
export type DriveIdColumn = {
  schema: string;
  table: string;
  column: string;
  nullable: boolean;
};

/**
 * A CHECK constraint, keyed on the TABLE it belongs to.
 *
 * `name` is carried for diagnostics and for tests that need to construct a same-name-different-table
 * case — coverage matching deliberately IGNORES it. Constraint names are unique per TABLE, not per
 * schema (spec §3.1.3, measured), so a name-keyed match can be satisfied by an unrelated table's
 * constraint, and a constraint renamed `…_nonblank` but weakened to `CHECK (true)` would pass.
 */
export type DriveIdConstraint = {
  schema: string;
  table: string;
  name: string;
  definition: string;
};

/** A deliberate, reviewed exception to the coverage rule. */
export type CoverageExemption = {
  schema: string;
  table: string;
  column: string;
  reason: string;
};

export type CoverageFinding =
  | { kind: "uncovered"; column: DriveIdColumn }
  | { kind: "stale_exemption"; exemption: CoverageExemption; why: "now_covered" | "column_absent" }
  | { kind: "empty_reason"; exemption: CoverageExemption }
  | { kind: "duplicate_exemption"; key: string };

/**
 * The two canonical renderings, as Postgres's deparser actually emits them — measured against the
 * local server, not predicted (spec §3.1.2).
 *
 * These are CONSTANTS, deliberately. An earlier design derived them at runtime from a "known-good"
 * constraint so a Postgres upgrade could not break every row at once; adversarial review showed that
 * hands an attacker the definition of canonicality itself — poison the calibrator with
 * `CHECK (col IS NULL OR true)` and every nullable column then "matches" while accepting blanks
 * (spec §4.2, R3 finding 3). The direction is inverted here: these constants are what a reviewer sees
 * in a diff, and the live suite runs two CANARIES asserting the parent migration's own constraints
 * still render as these strings. The canaries check the constants; they never derive them.
 */
export function canonicalBare(column: string): string {
  return `CHECK ((${column} ~ '[^[:space:]]'::text))`;
}

export function canonicalNullable(column: string): string {
  return `CHECK (((${column} IS NULL) OR (${column} ~ '[^[:space:]]'::text)))`;
}

/**
 * Deliberate exceptions to the coverage rule. Ships EMPTY: after migration
 * 20260725000000, all 23 census columns carry a canonical CHECK.
 *
 * The mechanism exists because a future Drive-ID-bearing column may legitimately not want a scalar
 * nonblank CHECK (a non-text type cannot match either canonical rendering, for instance), and the
 * alternative to an exemption row is an untracked failing gate.
 *
 * Its limit is stated plainly in spec §10 item 3: the rules below catch STALE and MALFORMED rows,
 * never UNJUSTIFIED ones. Nothing mechanical distinguishes "this column genuinely cannot carry a
 * CHECK" from "I wanted the gate green." The list ships empty and every future row lands in a
 * reviewable diff — that is the whole control.
 */
export const DRIVE_ID_COVERAGE_EXEMPTIONS: CoverageExemption[] = [];

function keyOf(t: { schema: string; table: string; column: string }): string {
  return `${t.schema}.${t.table}.${t.column}`;
}

function tableKey(t: { schema: string; table: string }): string {
  return `${t.schema}.${t.table}`;
}

/**
 * A column is covered iff some constraint on its OWN (schema, table) has a definition
 * string-equal to one of the two canonical renderings FOR THAT COLUMN NAME.
 *
 * Three properties, each load-bearing and each pinned by a test:
 *   - keyed on the table, so another table's constraint cannot satisfy it;
 *   - matched on the definition, so a `…_nonblank` name over a weakened predicate cannot;
 *   - the column name is substituted into the template, so a canonical constraint for a
 *     DIFFERENT column on the same table cannot.
 */
function isCovered(column: DriveIdColumn, byTable: Map<string, DriveIdConstraint[]>): boolean {
  const candidates = byTable.get(tableKey(column)) ?? [];
  const bare = canonicalBare(column.column);
  const nullable = canonicalNullable(column.column);
  // BOTH forms are accepted for a column of EITHER nullability: a CHECK fails only on FALSE and
  // `NULL ~ '…'` is NULL, so the two are behaviorally identical (spec §1.1 item 3). Requiring the
  // stylistically-matching form would produce false failures with no safety gain.
  return candidates.some((c) => c.definition === bare || c.definition === nullable);
}

export function auditDriveIdCoverage(
  columns: DriveIdColumn[],
  constraints: DriveIdConstraint[],
  exemptions: CoverageExemption[],
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];

  const byTable = new Map<string, DriveIdConstraint[]>();
  for (const c of constraints) {
    const k = tableKey(c);
    const bucket = byTable.get(k);
    if (bucket === undefined) byTable.set(k, [c]);
    else bucket.push(c);
  }

  const censusKeys = new Set(columns.map(keyOf));
  const coveredKeys = new Set(columns.filter((c) => isCovered(c, byTable)).map(keyOf));

  // ── exemption hygiene ────────────────────────────────────────────────────
  // Reported BEFORE the uncovered sweep so a malformed exemption is never silently honoured:
  // a row with an empty reason still suppresses its column below, but it is also reported, so
  // the run is red either way.
  const seen = new Set<string>();
  const exemptKeys = new Set<string>();
  for (const e of exemptions) {
    const k = keyOf(e);
    if (seen.has(k)) {
      findings.push({ kind: "duplicate_exemption", key: k });
      continue;
    }
    seen.add(k);
    exemptKeys.add(k);

    if (e.reason.trim() === "") {
      findings.push({ kind: "empty_reason", exemption: e });
      continue;
    }
    if (!censusKeys.has(k)) {
      // The column is gone (dropped or renamed) — a live exemption for it is dead weight that
      // would silently start covering a NEW column if that name were ever reused.
      findings.push({ kind: "stale_exemption", exemption: e, why: "column_absent" });
      continue;
    }
    if (coveredKeys.has(k)) {
      // The gap this exemption was written for has been repaired. Left in place it would blind
      // the column forever, including against a future regression that removes the CHECK again.
      findings.push({ kind: "stale_exemption", exemption: e, why: "now_covered" });
    }
  }

  // ── the coverage sweep ───────────────────────────────────────────────────
  // Every uncovered column is reported, not just the first: an early return would make a partial
  // repair look complete.
  for (const column of columns) {
    const k = keyOf(column);
    if (coveredKeys.has(k) || exemptKeys.has(k)) continue;
    findings.push({ kind: "uncovered", column });
  }

  return findings;
}
