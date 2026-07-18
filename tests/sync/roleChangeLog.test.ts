import { describe, expect, test } from "vitest";
import { writeRoleChangeLogRows } from "@/lib/sync/changeLog/writeRoleChangeLogRows";
import type { PreviousCrewMember } from "@/lib/sync/applyParseResult";
import type { ParseResult } from "@/lib/parser/types";
import type { HoldPort } from "@/lib/sync/holds/holdPort";

// Fake port capturing each show_change_log insert (query + params).
type Insert = { query: string; params: unknown[] };
function fakePort(): { port: HoldPort; inserts: Insert[] } {
  const inserts: Insert[] = [];
  const port: HoldPort = {
    unsafe: async (query: string, params: unknown[]) => {
      inserts.push({ query, params });
      return [];
    },
  };
  return { port, inserts };
}

// Minimal crew shapes — the writer reads only `name` + `role_flags`.
function prev(name: string, flags: string[]): PreviousCrewMember {
  return { name, role_flags: flags } as unknown as PreviousCrewMember;
}
function next(name: string, flags: string[]): ParseResult["crewMembers"][number] {
  return { name, role_flags: flags } as unknown as ParseResult["crewMembers"][number];
}

async function run(
  previousCrew: PreviousCrewMember[],
  appliedCrew: ParseResult["crewMembers"],
  renames: { removedName: string; addedName: string }[] = [],
) {
  const { port, inserts } = fakePort();
  await writeRoleChangeLogRows(
    port,
    "show-1",
    "file-1",
    previousCrew,
    appliedCrew,
    renames,
    "2026-07-17T00:00:00.000Z",
  );
  // Each insert's params are [showId, driveFileId, occurredAt, summary].
  return inserts.map((i) => ({
    query: i.query,
    showId: i.params[0],
    driveFileId: i.params[1],
    summary: i.params[3] as string,
  }));
}

describe("writeRoleChangeLogRows (spec §2.4)", () => {
  test("a scope-tile role change writes ONE identifiable field_changed row (entity_ref null, member+flags in summary)", async () => {
    const rows = await run([prev("Alice", ["A1"])], [next("Alice", ["V1"])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.showId).toBe("show-1");
    expect(rows[0]!.driveFileId).toBe("file-1");
    expect(rows[0]!.query).toContain("'field_changed'");
    // entity_ref is the literal `null` in the INSERT values, not a param.
    expect(rows[0]!.query).toMatch(/'field_changed',\s*null,/);
    expect(rows[0]!.query).toContain("'auto_apply'");
    // WHO + WHAT live in the summary.
    expect(rows[0]!.summary).toContain("Alice");
    expect(rows[0]!.summary).toContain("A1");
    expect(rows[0]!.summary).toContain("V1");
  });

  test("a LEAD role change writes an identifiable row (summary shows LEAD)", async () => {
    const rows = await run([prev("Bob", ["A1"])], [next("Bob", ["A1", "LEAD"])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toContain("Bob");
    expect(rows[0]!.summary).toContain("LEAD");
  });

  test("a held-fold role change on the RETAINED (same) name is caught (no held-skip)", async () => {
    // MI-11 fold: member retained under old name, role_flags applied.
    const rows = await run([prev("Held", ["A1"])], [next("Held", ["A1", "FINANCIALS"])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toContain("Held");
    expect(rows[0]!.summary).toContain("FINANCIALS");
  });

  test("an applied rename + role change resolves the prior via the rename map; summary names the successor", async () => {
    const rows = await run(
      [prev("Old", ["A1"])],
      [next("New", ["V1"])],
      [{ removedName: "Old", addedName: "New" }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toContain("New");
    expect(rows[0]!.summary).toContain("A1"); // prior resolved via rename map
    expect(rows[0]!.summary).toContain("V1");
  });

  test("a no-op (identical role set) writes NO row", async () => {
    const rows = await run([prev("Alice", ["A1", "LEAD"])], [next("Alice", ["LEAD", "A1"])]);
    expect(rows).toHaveLength(0);
  });

  test("a genuinely-new crew member (no prior) writes NO role row (it is a crew_added)", async () => {
    const rows = await run([prev("Alice", ["A1"])], [next("Alice", ["A1"]), next("Bob", ["LEAD"])]);
    expect(rows).toHaveLength(0);
  });

  test("a removed member writes NO role row (never iterated — it is a crew_removed)", async () => {
    const rows = await run(
      [prev("Alice", ["A1"]), prev("Gone", ["LEAD"])],
      [next("Alice", ["A1"])],
    );
    expect(rows).toHaveLength(0);
  });

  test("two members changing → two rows, each naming its member", async () => {
    const rows = await run(
      [prev("Alice", ["A1"]), prev("Bob", ["V1"])],
      [next("Alice", ["V1"]), next("Bob", ["V1", "LEAD"])],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.summary).join(" ")).toContain("Alice");
    expect(rows.map((r) => r.summary).join(" ")).toContain("Bob");
  });

  test("fmt renders an empty flag set as 'none'", async () => {
    const rows = await run([prev("Alice", ["LEAD"])], [next("Alice", [])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toContain("none");
  });
});
