/**
 * tests/db/resetValidationDataFkAudit.test.ts (Task 2)
 *
 * Structural FK-ordering audit for public.reset_validation_data().
 *
 * Any FK child of public.shows whose ON DELETE action is NOT cascade and NOT
 * set-null (confdeltype not in ('c','n')) — i.e. NO ACTION / RESTRICT — will
 * cause `delete from public.shows` to raise a foreign_key_violation unless the
 * RPC pre-deletes that child first. Today that set is exactly {reports}.
 *
 * This test derives the non-cascade-FK-child set FROM THE LIVE DB at test time
 * and asserts every such table appears in the migration's RPC body BEFORE the
 * `delete from public.shows` statement. A future migration that adds a new
 * NO-ACTION/RESTRICT FK child of shows without a matching pre-delete fails here
 * — the regression cannot ship silently.
 */
import { afterAll, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql } from "postgres";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260622000001_validation_reset_rpc.sql";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

function stripSqlComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*--.*$/gm, "");
}

/** Extract the reset_validation_data() function body ($$ … $$) from the migration text. */
function resetRpcBody(): string {
  const source = stripSqlComments(readFileSync(join(ROOT, MIGRATION), "utf8"));
  const m = source.match(
    /create\s+(?:or\s+replace\s+)?function\s+public\.reset_validation_data\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/i,
  );
  if (!m || !m[1]) throw new Error(`could not extract reset_validation_data body from ${MIGRATION}`);
  return m[1];
}

describe("reset_validation_data() — FK-ordering audit", () => {
  test("every non-cascade/non-setnull FK child of shows is pre-deleted BEFORE `delete from public.shows`", async () => {
    const rows = await sql<{ child: string }[]>`
      select conrelid::regclass::text as child
        from pg_constraint
       where confrelid = 'public.shows'::regclass
         and contype = 'f'
         and confdeltype not in ('c', 'n')`;
    const nonCascadeChildren = rows.map((r) => r.child.replace(/^public\./, "")).sort();

    // Sanity: the audit must observe at least the known `reports` regression target.
    expect(nonCascadeChildren).toContain("reports");

    const body = resetRpcBody();
    const showsDeleteAt = body.search(/delete\s+from\s+public\.shows\b/i);
    expect(showsDeleteAt, "RPC body must contain `delete from public.shows`").toBeGreaterThan(-1);

    for (const child of nonCascadeChildren) {
      const childDeleteRe = new RegExp(`delete\\s+from\\s+public\\.${child}\\b`, "i");
      const childDeleteAt = body.search(childDeleteRe);
      expect(
        childDeleteAt,
        `non-cascade FK child "${child}" of shows must be explicit-deleted in reset_validation_data()`,
      ).toBeGreaterThan(-1);
      expect(
        childDeleteAt < showsDeleteAt,
        `"${child}" must be deleted BEFORE "delete from public.shows" (FK is NO ACTION/RESTRICT — ` +
          `deleting shows first raises a foreign_key_violation)`,
      ).toBe(true);
    }
  });
});
