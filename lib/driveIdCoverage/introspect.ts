/**
 * lib/driveIdCoverage/introspect.ts
 *
 * The live half of the Drive-ID coverage guard: the census query
 * (spec docs/superpowers/specs/data-quality/2026-07-25-secondary-drive-id-nonblank.md §4.1).
 *
 * Deliberately tiny and deliberately boring. A narrowing of the PRIMARY census query is caught
 * mechanically by the dual-source cross-check (CENSUS_COLUMNS_PG_CATALOG_SQL below; spec
 * 2026-07-26-driveid-guard-cluster-design §3.3): the two independently-written queries must
 * return set-equal tuples, so a single-site edit goes red. Review remains the control only for
 * the residual defeat — an IDENTICAL narrowing of both literal sites in one diff (§8 item 1).
 * Keep both queries free of cleverness: no dynamic predicate construction, no options.
 */
import type { DriveIdColumn, DriveIdConstraint } from "./audit";

/** Repo-owned schemas. Vendor schemas (auth, storage, realtime, …) cannot receive our constraints. */
export const CENSUS_SCHEMAS = ["public", "dev"] as const;

/**
 * POSIX regex, NOT `LIKE`.
 *
 * SQL `LIKE` treats `_` as a single-character wildcard, so `'%drive_file_id%'` matches
 * `driveXfileYid` — measured on the local server. In a POSIX regex `_` is literal.
 */
export const CENSUS_COLUMN_PREDICATE = "drive_file_id";

/**
 * Columns whose name matches the Drive-ID pattern, on BASE TABLEs in the repo-owned schemas.
 *
 * Cross-checked set-equal against CENSUS_COLUMNS_PG_CATALOG_SQL below. DO NOT share constants
 * between the two queries (see that query's comment); a scope change edits BOTH, in one diff.
 *
 * `table_type = 'BASE TABLE'` excludes views (which appear in information_schema.columns but cannot
 * carry a table CHECK, so admitting them would manufacture permanently-uncoverable rows) and foreign
 * tables (which Postgres permits a CHECK on but does not enforce — spec §10 item 6).
 */
export const CENSUS_COLUMNS_SQL = `
select c.table_schema, c.table_name, c.column_name, c.is_nullable
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
 where c.table_schema = any($1)
   and t.table_type = 'BASE TABLE'
   and c.column_name ~ $2
 order by c.table_schema, c.table_name, c.column_name
`;

/**
 * The INDEPENDENT second census (spec §3.3). Fully literal — its own schema list, its own
 * predicate, ZERO bind parameters, a different catalog path (pg_attribute/pg_class/pg_namespace
 * vs information_schema). DO NOT deduplicate any of this with CENSUS_SCHEMAS /
 * CENSUS_COLUMN_PREDICATE / CENSUS_COLUMNS_SQL: the independence IS the mechanism — sharing a
 * constant would let one edit narrow both sources at once, silently. Narrowing the guard's
 * scope legitimately requires editing BOTH queries in one diff, and saying so.
 *
 * `relkind in ('r','p')` mirrors information_schema's BASE TABLE semantics (plain +
 * partitioned), excluding views and foreign tables exactly as the primary census does.
 */
export const CENSUS_COLUMNS_PG_CATALOG_SQL = `
select n.nspname as table_schema, c.relname as table_name, a.attname as column_name
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'dev')
   and c.relkind in ('r', 'p')
   and a.attnum > 0
   and not a.attisdropped
   and a.attname ~ 'drive_file_id'
 order by 1, 2, 3
`;

/**
 * Every CHECK constraint on the tables those columns live in, with its deparsed definition.
 *
 * Keyed on (schema, table) — never on conname. Constraint names are unique per TABLE, not per
 * schema (spec §3.1.3, measured), so a name-keyed lookup can be satisfied by another table's
 * constraint entirely.
 */
export const CENSUS_CONSTRAINTS_SQL = `
select n.nspname as table_schema, t.relname as table_name, con.conname,
       pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  join pg_namespace n on n.oid = t.relnamespace
 where con.contype = 'c'
   and n.nspname = any($1)
 order by 1, 2, 3
`;

type ColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  is_nullable: string;
};

type ConstraintRow = {
  table_schema: string;
  table_name: string;
  conname: string;
  definition: string;
};

export function toColumns(rows: readonly ColumnRow[]): DriveIdColumn[] {
  return rows.map((r) => ({
    schema: r.table_schema,
    table: r.table_name,
    column: r.column_name,
    nullable: r.is_nullable === "YES",
  }));
}

export function toConstraints(rows: readonly ConstraintRow[]): DriveIdConstraint[] {
  return rows.map((r) => ({
    schema: r.table_schema,
    table: r.table_name,
    name: r.conname,
    definition: r.definition,
  }));
}

/**
 * The CI fail-not-skip decision, extracted so it is TESTABLE (whole-diff R1 finding 2).
 *
 * Inline at module scope in the suite, nothing proved it: removing or inverting the throw left
 * healthy-DB CI runs and local skip runs both green, so an outage could silently disable the guard
 * and no test would notice. As a pure function, all four (dbUp x CI) combinations get asserted.
 *
 * Returns the Error to throw, or null when the run may proceed (skipping locally is fine — a
 * developer without a stack should not face a wall of red; skipping in CI is not).
 */
export function unreachableDbFailure(opts: {
  dbUp: boolean;
  ci: string | undefined;
  host: string;
  error: unknown;
}): Error | null {
  if (opts.dbUp) return null;
  // UNSET is the only skip condition (spec AC-6). Treating an empty string as "not CI" — as an
  // earlier draft did via `if (!opts.ci)` — means a CI wrapper that exports `CI=` silently turns
  // the guard off and the job stays green (whole-diff R2 finding 1). Presence, not truthiness.
  if (opts.ci === undefined) return null;
  return new Error(
    `driveIdCoverage.db.test.ts: CI is set but the local database at ${opts.host} is unreachable. ` +
      "This suite is the Drive-ID coverage guard — skipping it in CI would leave the gate green " +
      `while proving nothing. Underlying error: ${String(opts.error)}`,
  );
}
