/**
 * tests/db/_sqlFunctionBodies.ts
 *
 * Shared migration-scanning primitives for the structural guards that inspect SQL function bodies
 * (PF11 lock order, the undo_change phantom-column guard). Two mechanical hazards motivated pulling
 * this out of the individual guards, because either one silently converts a guard into a no-op:
 *
 * 1. **The dollar-quote tag is not always `$$`.** The shipped `undo_change` body is delimited by
 *    `$function$` (pg_get_functiondef's own output form, which is what a body copied out of the live
 *    catalog looks like). A `$$`-only extractor discovers ZERO functions in such a file — and worse,
 *    in a file that mixes the two it can run its non-greedy match from one function's declaration to
 *    a LATER function's `$$`, attributing the wrong body to the right name while dropping the later
 *    function entirely. Measured on 20260804000000 before this helper existed: the `$$` scanner
 *    reported `[undo_change]` with `mi11_approve_hold`'s body, and never saw `mi11_approve_hold`.
 *    The tag here is CAPTURED and back-referenced, so each body is bounded by its own delimiter.
 *
 * 2. **A migration list is a resolution, and resolutions go stale.** `create or replace` means the
 *    file that DEFINES a function is rarely the file that SHIPS it. Resolving per FILE also cannot
 *    express the common shape where one new migration replaces a single member of an older file's
 *    function set: swapping `20260608000002` for a migration that replaces only `mi11_approve_hold`
 *    stops discovering `mi11_reject_hold`, which nothing else redefines. Resolution here is
 *    therefore per FUNCTION — for each name, the LAST migration that defines it — so a guard's
 *    discovered set is a UNION over the shipped catalog rather than whatever one file happens to
 *    hold. Migrations are timestamp-prefixed, so lexicographic order IS apply order.
 *
 * Callers pair these with a non-empty self-check: a resolution that silently finds nothing makes
 * every downstream assertion vacuous rather than red.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripCommentsForFile } from "../_shared/stripComments";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

/**
 * `create [or replace] function public.<name>(<args>) … as <tag><body><tag>`.
 *
 * Group 2 captures the opening dollar-quote tag (`$$`, `$function$`, `$body$`, …) and the closing
 * delimiter is the back-reference `\2`, so a body can never run past its own terminator into the
 * next function. The `\bas\s+` anchor is what makes the tag capture unambiguous — a dollar-quoted
 * string is the only thing that can follow `AS` in a `CREATE FUNCTION`.
 */
const FUNCTION_BLOCK_RE =
  /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?\bas\s+(\$[a-z0-9_]*\$)([\s\S]*?)\2/gi;

/** Declarations only — the ground truth a body extraction is checked against. */
const DECLARATION_RE = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)/gi;

export type SqlFunction = { name: string; body: string };

/** Every `public.` function defined in `source`, in declaration order, each with its OWN body. */
export function extractFunctionBodies(source: string): SqlFunction[] {
  const found: SqlFunction[] = [];
  for (const match of source.matchAll(FUNCTION_BLOCK_RE)) {
    const [, name, , body] = match;
    if (!name || body === undefined) continue;
    found.push({ name, body });
  }
  return found;
}

/** Every `public.` function DECLARED in `source`, in declaration order (duplicates preserved). */
export function declaredFunctionNames(source: string): string[] {
  return [...source.matchAll(DECLARATION_RE)].map((match) => match[1]!);
}

/** Repo-relative paths of every migration, in apply (== lexicographic) order. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => `supabase/migrations/${file}`);
}

/** Comment-stripped source of a repo-relative migration path. */
export function readMigrationSource(file: string): string {
  return stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file);
}

/** Repo-relative paths of every migration defining `public.<name>`, in apply order. */
export function migrationsDefining(name: string): string[] {
  return migrationFiles().filter((file) =>
    extractFunctionBodies(readMigrationSource(file)).some((fn) => fn.name === name),
  );
}

/**
 * The SHIPPED definition of `public.<name>`: the body from the LAST migration that defines it.
 * Throws rather than returning null so a renamed or deleted function fails the guard loudly instead
 * of quietly emptying it.
 */
export function shippedFunctionBody(name: string): { file: string; body: string } {
  const defining = migrationsDefining(name);
  const file = defining[defining.length - 1];
  if (!file) {
    throw new Error(
      `shippedFunctionBody(): no migration in supabase/migrations/*.sql defines public.${name} — ` +
        `was it renamed or deleted, or does its body use a delimiter the extractor does not accept?`,
    );
  }
  const body = extractFunctionBodies(readMigrationSource(file)).findLast(
    (fn) => fn.name === name,
  )?.body;
  if (body === undefined) {
    throw new Error(`shippedFunctionBody(): resolved ${file} for public.${name} but found no body`);
  }
  return { file, body };
}
