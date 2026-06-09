/**
 * scripts/schema-manifest/lib.ts
 *
 * Shared logic for the validation-schema-parity gate (catches the class where a
 * committed migration's tables/columns never reach the persistent validation
 * Supabase project — the #9 "couldn't read this setting" incident: B3 migration
 * 20260602000003 added app_settings notify columns to the repo + local + CI-
 * fresh, but `supabase db push` is blocked on validation, so a surgical apply
 * was required and one sibling migration was skipped).
 *
 * Three mechanisms, all built from this module:
 *   1. gen:schema-manifest introspects the LOCAL all-migrations-applied DB and
 *      writes supabase/__generated__/schema-manifest.json (public base tables →
 *      sorted column names). Ground truth, no SQL parsing.
 *   2. The parity test asserts the VALIDATION project is a superset of that
 *      manifest (every repo-defined public table+column is present live). THE
 *      gate. Validation extras (Phase-0 remote-only objects) are ignored.
 *   3. A DB-free tripwire (parseAlterAddColumns) derives the exact #9 vector —
 *      `alter table public.<t> add column <c>` — straight from the migration
 *      SQL and asserts the manifest already covers it, so a stale manifest
 *      can't blind the parity test in CI even when no DB is reachable.
 *
 * Public-schema only: the `dev.*` shadow schema is local-seed/test infrastructure
 * (supabase/migrations/20260502000000_dev_schema_clone.sql), not a deploy target,
 * and the app's service-role client reads `public`.
 */

/** Manifest shape: table name → sorted list of column names (public base tables). */
export type SchemaManifest = Record<string, string[]>;

/** A column the migrations add to a public table via `alter ... add column`. */
export type ExpectedColumn = { table: string; column: string };

/**
 * Strip SQL comments and string-literal CONTENTS so keyword scans never match
 * inside prose or data. `CREATE TABLE` in a `--` comment and `ADD COLUMN` inside
 * a `RAISE EXCEPTION '...'` string both occur in this repo's migrations and must
 * NOT be treated as DDL. String bodies are blanked (kept as empty quotes) rather
 * than deleted so statement structure/positions are preserved.
 */
export function stripSqlNoise(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    // line comment -- ... \n
    if (c === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    // block comment /* ... */ (not nested in standard SQL)
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // single-quoted string literal '...'; '' is an escaped quote
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out += "''"; // collapse body to an empty literal
      continue;
    }
    // dollar-quoted string $tag$ ... $tag$ (used by plpgsql function bodies)
    if (c === "$") {
      const tagMatch = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) {
          // unterminated — drop the rest defensively
          out += " ";
          break;
        }
        i = end + tag.length;
        out += " "; // collapse the whole dollar-quoted body
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Parse `alter table [if exists] [only] [public.]<table> ... add column
 * [if not exists] <column> ...` occurrences across migration SQL and return the
 * public-schema (table, column) pairs. This is the EXACT #9 vector (columns
 * added to an existing table). Notes:
 *   - Multiple `add column`s in one alter (comma-separated, multi-line) are all
 *     captured.
 *   - Schema-qualified non-public alters (`dev.crew_members`) are excluded; a
 *     bare table name defaults to public.
 *   - Pairs whose table is dropped by any `drop table ... <table>` are excluded
 *     (a column added then the table removed must not be demanded of the
 *     manifest, which reflects final state).
 * Deliberately does NOT parse `create table` column lists — those are fragile to
 * regex and are covered instead by the table-existence side of the manifest plus
 * the local introspection-equality freshness check. New-table columns ride along
 * because the new table forces a manifest regen that captures them via DB
 * introspection.
 */
export function parseAlterAddColumns(sql: string): ExpectedColumn[] {
  const clean = stripSqlNoise(sql);
  const statements = clean.split(";");
  const dropped = collectDroppedPublicTables(clean);
  const pairs: ExpectedColumn[] = [];
  const seen = new Set<string>();

  for (const stmt of statements) {
    // statement head: alter table [if exists] [only] [schema.]table
    const head = /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:(\w+)\.)?(\w+)/i.exec(stmt);
    if (!head) continue;
    const schema = head[1]?.toLowerCase();
    const table = head[2];
    if (!table) continue;
    if (schema && schema !== "public") continue; // dev.* and others excluded
    if (dropped.has(table)) continue;

    const addRe = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;
    let m: RegExpExecArray | null;
    while ((m = addRe.exec(stmt)) !== null) {
      const column = m[1];
      if (!column) continue;
      const key = `${table}.${column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ table, column });
    }
  }
  return pairs;
}

/** Public tables removed by `drop table [if exists] [public.]<table>`. */
export function collectDroppedPublicTables(cleanSql: string): Set<string> {
  const dropped = new Set<string>();
  const re = /\bdrop\s+table\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleanSql)) !== null) {
    const schema = m[1]?.toLowerCase();
    const table = m[2];
    if (!table) continue;
    if (schema && schema !== "public") continue;
    dropped.add(table);
  }
  return dropped;
}

/** SQL that lists public base tables and their columns (one row per column). */
export const INTROSPECT_PUBLIC_COLUMNS_SQL = `
select c.table_name, c.column_name
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
order by c.table_name, c.column_name;
`.trim();

/**
 * Build a deterministic manifest from `table_name|column_name` rows (psql
 * -qAt output, pipe-separated). Columns sorted; tables emitted in sorted key
 * order by serializeManifest.
 */
export function manifestFromRows(rows: Array<[string, string]>): SchemaManifest {
  const manifest: SchemaManifest = {};
  for (const [table, column] of rows) {
    (manifest[table] ??= []).push(column);
  }
  for (const table of Object.keys(manifest)) {
    manifest[table] = [...new Set(manifest[table])].sort();
  }
  return manifest;
}

/** Parse psql -qAt pipe-separated output into [table, column] rows. */
export function parsePsqlRows(stdout: string): Array<[string, string]> {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const idx = line.indexOf("|");
      return [line.slice(0, idx), line.slice(idx + 1)] as [string, string];
    });
}

/** Stable, pretty JSON with sorted table keys + trailing newline (git-diff friendly). */
export function serializeManifest(manifest: SchemaManifest): string {
  const sorted: SchemaManifest = {};
  for (const table of Object.keys(manifest).sort()) {
    sorted[table] = [...(manifest[table] ?? [])].sort();
  }
  return JSON.stringify(sorted, null, 2) + "\n";
}

export type ParityDiff = {
  missingTables: string[];
  missingColumns: ExpectedColumn[];
};

/**
 * Compare an expected manifest against a live schema (same shape). Reports every
 * manifest table absent from `live` and every manifest column absent from a
 * present live table. `live` extras are intentionally ignored (validation may
 * carry Phase-0 remote-only objects; the gate only asserts the repo's schema is
 * PRESENT, not that nothing else exists).
 */
export function diffManifestAgainstLive(
  manifest: SchemaManifest,
  live: SchemaManifest,
): ParityDiff {
  const missingTables: string[] = [];
  const missingColumns: ExpectedColumn[] = [];
  for (const table of Object.keys(manifest).sort()) {
    const liveCols = live[table];
    if (!liveCols) {
      missingTables.push(table);
      continue;
    }
    const liveSet = new Set(liveCols);
    for (const column of manifest[table] ?? []) {
      if (!liveSet.has(column)) missingColumns.push({ table, column });
    }
  }
  return { missingTables, missingColumns };
}
