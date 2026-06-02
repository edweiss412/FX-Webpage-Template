import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// Structural meta-test (R5 recurrence defense). The "archived show ⇒ crew-unreachable" invariant lives
// in EVERY crew_read RLS policy: a matching crew member must only read a show (and its child rows) when
// the joined show is published=true AND archived=false. R4 F1 + R5 were both this same vector
// (archived/published independence at the crew-read trust boundary). Rather than re-audit each policy by
// hand every round, this test walks ALL crew_read policies in pg_policies and asserts each gates on BOTH
// `published` and `archived` — so a NEW crew-readable child table that forgets the archived clause (or a
// future edit that drops it) fails here at CI time, not in an adversarial round.

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

describe("crew_read RLS policies must gate on archived=false (R5 structural defense)", () => {
  test("every crew_read policy's USING expression references BOTH published and archived", () => {
    // Collapse the (multi-line) qual to a single line so one policy == one output row.
    const out = runPsql(
      "select tablename, regexp_replace(coalesce(qual,''), '\\s+', ' ', 'g') from pg_policies where policyname = 'crew_read' order by tablename;",
    );
    const rows = out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [tablename, qual] = line.split("\t");
        return { tablename, qual: (qual ?? "").toLowerCase() };
      });

    // Sanity: the known crew-readable surface (shows + 5 child tables). If a new crew_read policy is
    // added, this count drifts and prompts a deliberate update — but the per-row assertions below are
    // what actually enforce the invariant for whatever set exists.
    expect(rows.length).toBeGreaterThanOrEqual(6);

    const offenders = rows.filter(
      (r) => !(r.qual.includes("published") && r.qual.includes("archived")),
    );
    expect(
      offenders,
      `crew_read policies missing a published/archived gate: ${offenders.map((o) => o.tablename).join(", ")}`,
    ).toEqual([]);

    // Spot-check the canonical pair on `shows` itself (published = true AND archived = false).
    const shows = rows.find((r) => r.tablename === "shows");
    expect(shows, "no crew_read policy on public.shows").toBeDefined();
    expect(shows!.qual).toContain("published = true");
    expect(shows!.qual).toContain("archived = false");
  });
});
