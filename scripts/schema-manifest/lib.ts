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
 *      sorted column names, PLUS public function signatures under a reserved
 *      key). Ground truth, no SQL parsing.
 *   2. The parity test asserts the VALIDATION project is a superset of that
 *      manifest (every repo-defined public table+column AND function signature
 *      present live). THE gate. Validation extras (Phase-0 remote-only objects)
 *      are ignored.
 *   3. A DB-free tripwire (parseAlterAddColumns) derives the exact #9 vector —
 *      `alter table public.<t> add column <c>` — straight from the migration
 *      SQL and asserts the manifest already covers it, so a stale manifest
 *      can't blind the parity test in CI even when no DB is reachable.
 *
 * Public-schema only: the `dev.*` shadow schema is local-seed/test infrastructure
 * (supabase/migrations/20260502000000_dev_schema_clone.sql), not a deploy target,
 * and the app's service-role client reads `public`.
 */

/**
 * Manifest shape: table name → sorted column names (public base tables).
 *
 * The reserved `FUNCTIONS_KEY` entry carries encoded function signatures rather
 * than columns; `tablesOf` / `functionsOf` split the two so no consumer has to
 * remember which is which.
 */
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
 * public-schema (table, column) pairs that survive to FINAL STATE. This is the
 * EXACT #9 vector (columns added to an existing table). Notes:
 *   - Multiple `add column`s in one alter (comma-separated, multi-line) are all
 *     captured.
 *   - Schema-qualified non-public alters (`dev.crew_members`) are excluded; a
 *     bare table name defaults to public.
 *   - Pairs whose table is dropped by any `drop table ... <table>` are excluded
 *     (a column added then the table removed must not be demanded of the
 *     manifest, which reflects final state).
 *   - Column lifecycle is resolved ORDER-AWARE: every `add column` / `drop
 *     column` op for a `public.<table>.<column>` is walked in document order and
 *     the LAST op wins. `add` (add-only, or drop→add re-add) → the column is
 *     PRESENT and demanded of the manifest; `drop` (add→drop teardown — e.g.
 *     crew_members.sheet_name added by the admin-field-override migration and
 *     dropped by its teardown) → excluded. An order-INSENSITIVE "excluded if
 *     dropped anywhere" rule would wrongly net out a surviving re-added column
 *     and blind the parity gate to it.
 * Deliberately does NOT parse `create table` column lists — those are fragile to
 * regex and are covered instead by the table-existence side of the manifest plus
 * the local introspection-equality freshness check. New-table columns ride along
 * because the new table forces a manifest regen that captures them via DB
 * introspection.
 */
export function parseAlterAddColumns(sql: string): ExpectedColumn[] {
  const clean = stripSqlNoise(sql);
  const statements = clean.split(";");
  // Order-aware TABLE final state: a table whose last create/drop op is `drop`
  // is absent in final state, so its column ops are excluded; a table that is
  // recreated (drop→create) or never dropped is present, so its columns count.
  // Using the order-insensitive "dropped anywhere" set here would suppress the
  // columns of a re-created table (Codex R2 HIGH).
  const tableFinal = orderedPublicTableFinalOps(clean);
  // Ordered add/drop ops across the whole migration; last op per key wins.
  // Map insertion order = first-encounter order, preserving the historical
  // document-order return order for add-only migrations.
  const finalOp = new Map<string, "add" | "drop">();

  for (const stmt of statements) {
    // statement head: alter table [if exists] [only] [schema.]table
    const head = /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:(\w+)\.)?(\w+)/i.exec(stmt);
    if (!head) continue;
    const schema = head[1]?.toLowerCase();
    const table = head[2];
    if (!table) continue;
    if (schema && schema !== "public") continue; // dev.* and others excluded
    if (tableFinal.get(table) === "drop") continue; // final state: table absent

    // Collect this statement's column ops with their match position, then apply
    // them in textual order so an in-statement drop→add (or add→drop) resolves
    // correctly before moving to the next statement.
    const ops: Array<{ index: number; column: string; op: "add" | "drop" }> = [];
    const addRe = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;
    const dropRe = /\bdrop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi;
    let m: RegExpExecArray | null;
    while ((m = addRe.exec(stmt)) !== null) {
      if (m[1]) ops.push({ index: m.index, column: m[1], op: "add" });
    }
    while ((m = dropRe.exec(stmt)) !== null) {
      if (m[1]) ops.push({ index: m.index, column: m[1], op: "drop" });
    }
    ops.sort((a, b) => a.index - b.index);
    for (const o of ops) finalOp.set(`${table}.${o.column}`, o.op);
  }

  const pairs: ExpectedColumn[] = [];
  for (const [key, op] of finalOp) {
    if (op !== "add") continue; // final state = dropped → not demanded of the manifest
    const dot = key.indexOf(".");
    pairs.push({ table: key.slice(0, dot), column: key.slice(dot + 1) });
  }
  return pairs;
}

/**
 * Order-aware final create/drop state per public table across the whole (noise-
 * stripped) migration SQL. Walks every `create [unlogged] table` and `drop table`
 * op in document order; the LAST op per table wins. Map insertion order =
 * first-encounter order. The single source of truth for "does this public table
 * exist in final state" used by BOTH parseAlterAddColumns (column guard) and
 * parseCreatedPublicTables — so create→drop (absent), drop→create recreate
 * (present), and create-only (present) all resolve consistently, and no consumer
 * re-derives the answer with an order-insensitive shortcut. Tables never touched
 * by a create/drop op (pre-existing, only altered) are absent from the map and
 * treated as present by callers. `temp`/`temporary` tables are not matched (they
 * live in pg_temp, never `public`).
 */
function orderedPublicTableFinalOps(cleanSql: string): Map<string, "create" | "drop"> {
  const ops: Array<{ index: number; table: string; op: "create" | "drop" }> = [];
  const createRe =
    /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi;
  const dropRe = /\bdrop\s+table\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(cleanSql)) !== null) {
    const schema = m[1]?.toLowerCase();
    const table = m[2];
    if (!table || (schema && schema !== "public")) continue; // dev.* and others excluded
    ops.push({ index: m.index, table, op: "create" });
  }
  while ((m = dropRe.exec(cleanSql)) !== null) {
    const schema = m[1]?.toLowerCase();
    const table = m[2];
    if (!table || (schema && schema !== "public")) continue;
    ops.push({ index: m.index, table, op: "drop" });
  }
  ops.sort((a, b) => a.index - b.index);
  const finalOp = new Map<string, "create" | "drop">();
  for (const o of ops) finalOp.set(o.table, o.op);
  return finalOp;
}

/**
 * Parse `create [unlogged] table [if not exists] [public.]<table>` occurrences
 * and return the public-schema table NAMES that survive to final state (tables
 * dropped by a later `drop table` are excluded). Names only — NOT the column
 * lists (those are regex-fragile and covered by manifest regen + the local
 * freshness equality check). This closes the new-TABLE half of the freshness
 * tripwire: without it, a migration that creates a public table but skips
 * `pnpm gen:schema-manifest` contributes nothing to Layer 1 (which otherwise
 * only sees `add column`), so a stale manifest + un-applied validation lets a
 * whole new table drift silently past CI (Layer 2 compares against the stale
 * manifest; Layer 3 skips when TEST_DATABASE_URL is set). `temp`/`temporary`
 * tables are intentionally not matched (they live in pg_temp, never `public`).
 */
export function parseCreatedPublicTables(sql: string): string[] {
  // Order-aware final-state via the shared resolver: a public table survives iff
  // its LAST create/drop op is `create` (create-only, or drop→create recreate);
  // create→drop scratch tables net out. An order-insensitive "excluded if dropped
  // anywhere" rule would wrongly drop a recreated table.
  const tableFinal = orderedPublicTableFinalOps(stripSqlNoise(sql));
  return [...tableFinal.entries()]
    .filter(([, op]) => op === "create")
    .map(([t]) => t)
    .sort();
}

/**
 * `create [or replace] function [public.]<name>(` names that survive to final
 * state, for the DB-free Layer-1 tripwire.
 *
 * NAMES ONLY, and that bound is the design. The manifest keys functions by
 * (name, identity arguments), which regex cannot recover from SQL reliably —
 * defaults, `out` parameters and type aliases all differ between what the DDL
 * writes and what `pg_get_function_identity_arguments` returns. A NAME is
 * recoverable, and it answers the question Layer 1 exists to ask: did a
 * migration add a function the committed manifest has never heard of? That is
 * the #9 vector applied to functions — commit the migration, forget the regen,
 * forget the validation apply, and Layer 2 then compares two equally stale sets
 * and passes (Codex R1 HIGH).
 *
 * `drop function` is order-aware for the same reason tables are: a function
 * created and later dropped must not be demanded of the manifest.
 */
export function parseCreatedPublicFunctions(sql: string): string[] {
  const clean = stripSqlNoise(sql);
  const ops: Array<{ index: number; key: string; op: "create" | "drop" }> = [];
  // NAME **AND TYPE LIST**. Keying on the name alone was wrong in both directions
  // (Codex R3 HIGH): adding an OVERLOAD passed Layer 1 because the name was
  // already known, and a `drop function name(uuid)` erased the whole name from
  // the created set even though other overloads survived. Arity alone was not
  // enough either — two one-argument overloads collide. See `typeListOf` for
  // what this key is and where it degrades.
  const createRe = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:(\w+)\.)?(\w+)\s*\(([^)]*)\)/gi;
  const dropRe = /\bdrop\s+function\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)\s*(?:\(([^)]*)\))?/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(clean)) !== null) {
    const schema = m[1]?.toLowerCase();
    const name = m[2];
    if (!name || (schema && schema !== "public")) continue;
    ops.push({ index: m.index, key: `${name}/${typeListOf(m[3] ?? "")}`, op: "create" });
  }
  while ((m = dropRe.exec(clean)) !== null) {
    const schema = m[1]?.toLowerCase();
    const name = m[2];
    if (!name || (schema && schema !== "public")) continue;
    // A bare `drop function name` (no parens) is only legal when the name is
    // unambiguous, so it drops whatever arity exists — recorded as a wildcard.
    const args = m[3];
    ops.push({
      index: m.index,
      key: args === undefined ? `${name}/*` : `${name}/${typeListOf(args)}`,
      op: "drop",
    });
  }
  ops.sort((a, b) => a.index - b.index);
  const final = new Map<string, "create" | "drop">();
  for (const o of ops) {
    if (o.op === "drop" && o.key.endsWith("/*")) {
      const stem = o.key.slice(0, -1);
      for (const k of [...final.keys()]) if (k.startsWith(stem)) final.set(k, "drop");
      continue;
    }
    final.set(o.key, o.op);
  }
  return [...final.entries()]
    .filter(([, op]) => op === "create")
    .map(([k]) => k)
    .sort();
}

/**
 * A comparable TYPE LIST for a parameter list, from either side.
 *
 * Arity alone was not enough (Codex R3 HIGH): two one-argument overloads
 * collide, which is exactly the shape the probe used. This drops the parameter
 * NAME and any DEFAULT, keeping the type text, so `p_show uuid` and
 * `p_email text` key differently while the same signature written on either
 * side keys the same.
 *
 * DOCUMENTED LIMIT, and it fails in the conservative direction: a type spelled
 * differently on the two sides (an alias, `character varying` vs `varchar`, a
 * schema qualification) keys differently and produces a FALSE ALARM, not a
 * miss — a contributor is told to regenerate, regenerates, and the noise ends.
 * The exact comparison remains Layer 2's, against Postgres's own identity
 * encoding; this side is a DB-free tripwire, not an authority on signatures.
 */
/**
 * First words of a TYPE rather than a parameter name.
 *
 * Covers every multiword built-in (`time`/`timestamp` + with/without time zone,
 * `character`/`bit` + varying, `double precision`) plus the common single-word
 * types, so an UNNAMED parameter is never mistaken for a named one.
 *
 * Residual ambiguity, and it fails CONSERVATIVELY this time: a parameter
 * literally named after a type (`text text`) reads as a two-word type and keys
 * as "text text" rather than "text". That is a false alarm — a contributor is
 * told to regenerate — not a collision that hides an overload.
 */
const TYPE_HEADS = new Set([
  "time",
  "timestamp",
  "timestamptz",
  "timetz",
  "character",
  "bit",
  "double",
  "numeric",
  "decimal",
  "integer",
  "int",
  "int2",
  "int4",
  "int8",
  "bigint",
  "smallint",
  "boolean",
  "bool",
  "text",
  "uuid",
  "json",
  "jsonb",
  "date",
  "interval",
  "real",
  "varchar",
  "bytea",
  "float4",
  "float8",
  "money",
  "inet",
  "cidr",
  "macaddr",
  "xml",
  "tsvector",
]);

const TYPE_ALIASES = new Map<string, string>([
  ["timestamptz", "timestamp with time zone"],
  ["timestamp", "timestamp without time zone"],
  ["timetz", "time with time zone"],
  ["time", "time without time zone"],
  ["int", "integer"],
  ["int4", "integer"],
  ["int8", "bigint"],
  ["int2", "smallint"],
  ["bool", "boolean"],
  ["varchar", "character varying"],
  ["char", "character"],
  ["float8", "double precision"],
  ["float4", "real"],
  ["decimal", "numeric"],
]);

/**
 * Canonical spelling of one type, so the DDL side and Postgres's own encoding
 * agree.
 *
 * Postgres renders `timestamptz` as `timestamp with time zone` and `int` as
 * `integer`, and qualifies composite types with their schema. Without this the
 * type-list key produced NINE false alarms on the real corpus — the
 * conservative direction, but noise a contributor cannot act on is noise they
 * learn to ignore, which is how a tripwire dies.
 */
function canonicalType(t: string): string {
  const bare = t.replace(/^public\./, "").trim();
  const arraySuffix = /\[\]$/.test(bare) ? "[]" : "";
  const core = bare.replace(/\[\]$/, "").trim();
  return (TYPE_ALIASES.get(core) ?? core) + arraySuffix;
}

function typeListOf(params: string): string {
  const trimmed = params.trim();
  if (trimmed === "") return "";
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of trimmed) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts
    .map((raw) => {
      // Drop a DEFAULT clause, then the leading mode + parameter NAME.
      let t = raw.split(/\bdefault\b/i)[0] ?? "";
      t = t.replace(/=.*$/, "").trim().replace(/\s+/g, " ");
      const words = t.split(" ").filter(Boolean);
      if (words[0] && /^(in|out|inout|variadic)$/i.test(words[0])) words.shift();
      // IS THE FIRST WORD A PARAMETER NAME, OR THE HEAD OF A MULTIWORD TYPE?
      //
      // Dropping it unconditionally was WRONG and it MISSED (Codex R4 HIGH):
      // an unnamed `time with time zone` and an unnamed `timestamp with time
      // zone` both collapsed to "with time zone" and keyed identically, so
      // adding one as an overload of the other read as already-known. Same for
      // the `without time zone` and `varying` pairs. That is a miss, not the
      // conservative direction the comment claimed.
      //
      // A parameter is `[mode] [name] type`, and the NAME is present only when
      // the first token is not itself the start of a type. Postgres's multiword
      // built-ins all begin with one of a small closed set, so asking that
      // question is exact for them.
      const first = (words[0] ?? "").toLowerCase();
      const hasName = words.length > 1 && !TYPE_HEADS.has(first);
      const type = (hasName ? words.slice(1).join(" ") : words.join(" ")).toLowerCase();
      return canonicalType(type);
    })
    .join(",");
}

/** The `name/typelist` keys a manifest declares, from its encoded signature rows. */
export function functionNamesOf(manifest: SchemaManifest): Set<string> {
  // `name/arity`, matching what parseCreatedPublicFunctions returns. The
  // encoded row is `name(args) -> result [POSTURE]`, so arity is the top-level
  // comma count of the identity-arguments string.
  return new Set(
    functionsOf(manifest).map((row) => {
      const open = row.indexOf("(");
      const close = row.lastIndexOf(") -> ");
      return `${row.slice(0, open)}/${typeListOf(row.slice(open + 1, close))}`;
    }),
  );
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

/**
 * Reserved manifest key holding function signature rows.
 *
 * WHY A RESERVED KEY RATHER THAN A NEW ENVELOPE SHAPE. The manifest is
 * `table -> columns` and four test files plus a CI job already read it that way.
 * Restructuring into `{tables, functions}` would churn every one of them for no
 * gain; a reserved key adds the function tier in the same file with the existing
 * consumers untouched. The affixes make collision with a real identifier
 * implausible, and `functionsOf`/`tablesOf` keep the key out of every table-shaped
 * read rather than relying on callers to remember it.
 */
export const FUNCTIONS_KEY = "__functions__";

/** One `public` function, at the ratified signature tier. Note: NO body. */
export type FunctionRow = {
  name: string;
  /** `pg_get_function_identity_arguments(oid)` — Postgres's own identity encoding. */
  args: string;
  /** `pg_get_function_result(oid)`. */
  result: string;
  /** `prosecdef`: SECURITY DEFINER vs INVOKER. */
  definer: boolean;
};

/**
 * Encode a row as one comparable string.
 *
 * Every COMPARED dimension is in the string and nothing else is, so equality of
 * the encoded row is exactly equality at the ratified tier. Two overloads of one
 * `proname` encode differently because the identity arguments are part of the
 * text — which is what stops a name-keyed comparator collapsing them.
 */
export function encodeFunctionRow(fn: FunctionRow): string {
  return `${fn.name}(${fn.args}) -> ${fn.result} [${fn.definer ? "DEFINER" : "INVOKER"}]`;
}

/** SQL listing `public` functions at the signature tier. Bodies are never selected. */
export const INTROSPECT_PUBLIC_FUNCTIONS_SQL = `
select p.proname,
       pg_get_function_identity_arguments(p.oid),
       pg_get_function_result(p.oid),
       case when p.prosecdef then 't' else 'f' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by 1, 2;
`.trim();

/** Parse psql -qAt pipe-separated function rows. */
export function parsePsqlFunctionRows(stdout: string): FunctionRow[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("|");
      return {
        name: parts[0] ?? "",
        args: parts[1] ?? "",
        result: parts[2] ?? "",
        definer: (parts[3] ?? "f") === "t",
      };
    });
}

/** Fold function rows into a manifest alongside its tables. */
export function manifestFromFunctionRows(
  fns: FunctionRow[],
  tables: SchemaManifest = {},
): SchemaManifest {
  return { ...tables, [FUNCTIONS_KEY]: [...new Set(fns.map(encodeFunctionRow))].sort() };
}

/** The encoded function rows of a manifest (empty when the tier is absent). */
export function functionsOf(manifest: SchemaManifest): string[] {
  return manifest[FUNCTIONS_KEY] ?? [];
}

/** The TABLE entries of a manifest — the reserved key is never one. */
export function tablesOf(manifest: SchemaManifest): string[] {
  return Object.keys(manifest)
    .filter((k) => k !== FUNCTIONS_KEY)
    .sort();
}

export type ParityDiff = {
  missingTables: string[];
  missingColumns: ExpectedColumn[];
  /** Manifest function signatures absent from the live set, encoded. */
  missingFunctions: string[];
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
  // Superset semantics, same as tables: every manifest signature must be present
  // live; live extras are fine (validation carries Phase-0 remote-only objects).
  const liveFunctions = new Set(functionsOf(live));
  const missingFunctions = functionsOf(manifest).filter((f) => !liveFunctions.has(f));
  for (const table of tablesOf(manifest)) {
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
  return { missingTables, missingColumns, missingFunctions };
}
