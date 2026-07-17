import { describe, expect, test } from "vitest";
import { writeRoleChangeLogRows } from "@/lib/sync/changeLog/writeRoleChangeLogRows";
import type { PreviousCrewMember } from "@/lib/sync/applyParseResult";
import type { ParseResult } from "@/lib/parser/types";
import type { HoldPort } from "@/lib/sync/holds/holdPort";

/**
 * Structural pin (spec §2.4 coverage principle): the change-log writer's row set MUST equal exactly
 * the set of has-a-prior members whose applied `role_flags` differ (rename-resolved) — i.e. the
 * notice producer's existing-member arm (a) with the capability filter removed. No held-skip, no
 * path-skip, no invariant gate, no divergent rename source; roster arms (b) new-crew and (c)
 * removed-member are excluded (they are crew_added/crew_removed, not role changes). Any future edit
 * that diverges the writer from this rule fails here.
 */
type Crew = { name: string; role_flags: string[] };
type Rename = { removedName: string; addedName: string };

function capturingPort(): { port: HoldPort; names: string[] } {
  const names: string[] = [];
  const port: HoldPort = {
    unsafe: async (_q: string, params: unknown[]) => {
      // summary is params[3]: "Crew member <name> role assignment changed: ..."
      const summary = params[3] as string;
      const m = summary.match(/^Crew member (.+?) role assignment changed:/);
      if (m) names.push(m[1]!);
      return [];
    },
  };
  return { port, names };
}

// Reference oracle — the set of member names that SHOULD get a row, computed independently of the
// writer: a member present in BOTH prior (rename-resolved) and applied whose flag SET differs.
function expectedMembers(prior: Crew[], applied: Crew[], renames: Rename[]): Set<string> {
  const prevByName = new Map(prior.map((m) => [m.name, m]));
  const priorNameForAdded = new Map(renames.map((r) => [r.addedName, r.removedName]));
  const out = new Set<string>();
  for (const next of applied) {
    const priorName = priorNameForAdded.get(next.name) ?? next.name;
    const prev = prevByName.get(priorName);
    if (!prev) continue;
    const same =
      prev.role_flags.length === next.role_flags.length &&
      prev.role_flags.every((f) => next.role_flags.includes(f));
    if (!same) out.add(next.name);
  }
  return out;
}

async function writerMembers(prior: Crew[], applied: Crew[], renames: Rename[]): Promise<Set<string>> {
  const { port, names } = capturingPort();
  await writeRoleChangeLogRows(
    port,
    "show-1",
    "file-1",
    prior as unknown as PreviousCrewMember[],
    applied as unknown as ParseResult["crewMembers"],
    renames,
    "2026-07-17T00:00:00.000Z",
  );
  return new Set(names);
}

const FIXTURES: { label: string; prior: Crew[]; applied: Crew[]; renames: Rename[] }[] = [
  {
    label: "scope-tile + capability changes on existing members",
    prior: [{ name: "A", role_flags: ["A1"] }, { name: "B", role_flags: ["LEAD"] }, { name: "C", role_flags: ["V1"] }],
    applied: [{ name: "A", role_flags: ["V1"] }, { name: "B", role_flags: ["LEAD"] }, { name: "C", role_flags: ["V1", "FINANCIALS"] }],
    renames: [],
  },
  {
    label: "held-fold (retained name) role change",
    prior: [{ name: "Held", role_flags: ["A1"] }],
    applied: [{ name: "Held", role_flags: ["A1", "FINANCIALS"] }],
    renames: [],
  },
  {
    label: "applied rename + role change (successor)",
    prior: [{ name: "Old", role_flags: ["A1"] }],
    applied: [{ name: "New", role_flags: ["V1"] }],
    renames: [{ removedName: "Old", addedName: "New" }],
  },
  {
    label: "staged-shaped: empty renames, name change degrades to remove+add",
    prior: [{ name: "Old", role_flags: ["LEAD"] }],
    applied: [{ name: "New", role_flags: ["LEAD"] }], // no rename map → New has no prior → no row
    renames: [],
  },
  {
    label: "new-crew (roster arm b) — no role row",
    prior: [{ name: "A", role_flags: ["A1"] }],
    applied: [{ name: "A", role_flags: ["A1"] }, { name: "New", role_flags: ["LEAD"] }],
    renames: [],
  },
  {
    label: "removed-capability-member (roster arm c) — no role row",
    prior: [{ name: "A", role_flags: ["A1"] }, { name: "Gone", role_flags: ["FINANCIALS"] }],
    applied: [{ name: "A", role_flags: ["A1"] }],
    renames: [],
  },
];

describe("writeRoleChangeLogRows coverage parity (spec §2.4)", () => {
  test.each(FIXTURES)("writer row set == has-a-prior role-delta set: $label", async ({ prior, applied, renames }) => {
    const writer = await writerMembers(prior, applied, renames);
    const expected = expectedMembers(prior, applied, renames);
    expect(writer).toEqual(expected);
  });
});
