/**
 * tests/db/_resetRpcSource.ts
 *
 * Shared helper: finds the LATEST migration that defines (or replaces)
 * public.reset_validation_data() and returns its $$ … $$ function body.
 *
 * Migrations are timestamp-prefixed, so sorting filenames descending and
 * taking the first match guarantees we parse the SHIPPED definition even
 * when a hotfix migration does `create or replace function`. A future
 * replace-function migration will automatically supersede the previous one.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

function stripSqlComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*--.*$/gm, "");
}

const BODY_RE =
  /create\s+(?:or\s+replace\s+)?function\s+public\.reset_validation_data\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/i;

/**
 * Returns the $$ … $$ body of the LATEST definition of
 * public.reset_validation_data() across all supabase/migrations/*.sql files.
 *
 * Throws if no defining migration is found, so audit tests fail loudly
 * rather than silently skipping.
 */
export function latestResetValidationDataBody(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse(); // DESC — newest timestamp-prefixed file first

  for (const filename of files) {
    const fullPath = join(MIGRATIONS_DIR, filename);
    const source = stripSqlComments(readFileSync(fullPath, "utf8"));
    const m = source.match(BODY_RE);
    if (m && m[1]) {
      return m[1];
    }
  }

  throw new Error(
    "latestResetValidationDataBody(): no migration in supabase/migrations/*.sql defines " +
      "`create or replace function public.reset_validation_data` — " +
      "was the migration deleted or renamed?",
  );
}
