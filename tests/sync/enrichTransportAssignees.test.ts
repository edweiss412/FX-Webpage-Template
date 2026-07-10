// tests/sync/enrichTransportAssignees.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CrewMemberRow, ParseResult, TransportationRow } from "@/lib/parser/types";
import {
  classifyUnmatchedAssignees,
  enrichTransportAssignees,
} from "@/lib/sync/enrichTransportAssignees";
import { namesRefer } from "@/lib/data/nameMatch";

function member(name: string): CrewMemberRow {
  return { name } as unknown as CrewMemberRow;
}
function transport(over: { driver?: string | null; assigned?: string[][] }): TransportationRow {
  const schedule = (over.assigned ?? []).map((assigned_names) => ({
    stage: "",
    date: null,
    time: null,
    assigned_names,
  }));
  return { driver_name: over.driver ?? null, schedule } as unknown as TransportationRow;
}
function classify(driver: string | null, roster: string[], assigned?: string[][]): string[] {
  // spread `assigned` only when defined — exactOptionalPropertyTypes forbids an explicit undefined
  return classifyUnmatchedAssignees(
    transport({ driver, ...(assigned !== undefined ? { assigned } : {}) }),
    roster.map(member),
  );
}

describe("classifyUnmatchedAssignees", () => {
  // Rule 4 — garbled single name (one whole roster name present, nobody resolves) — headline gap.
  it("warns a hard mis-parse that resolves to no one (Doug Larson Loadout)", () => {
    expect(classify("Doug Larson Loadout", ["Doug Larson"])).toEqual(["Doug Larson Loadout"]);
  });

  // Rule 5 — single identity the render already shows → NO warn (BL tolerance matrix).
  it("does not warn abbreviation / nickname / trim / longer-legal variants", () => {
    expect(classify("Doug", ["Doug Larson"])).toEqual([]);
    expect(classify("Douglas Larson", ["Doug Larson"])).toEqual([]);
    expect(classify("  doug larson ", ["Doug Larson"])).toEqual([]);
    expect(classify(null, ["William Werner"], [["Bill Werner"]])).toEqual([]);
  });

  // Rule 5 — unrelated external / charter driver: covers no whole roster name (coveredCount 0).
  it("does not warn an unrelated external driver", () => {
    expect(classify("ABC Charters", ["Doug Larson"])).toEqual([]);
  });

  // Rule 5 (R5 finding 2) — external company sharing ONE surname token must NOT warn. "Smith Charters"
  // shares 'smith' with "John Smith" and fails namesRefer, but does not cover the whole name ('john'
  // absent → coveredCount 0). Fails if the old "shares-a-token near-miss" gate is reintroduced.
  it("does not warn an external company sharing one surname token (Smith Charters)", () => {
    expect(classify("Smith Charters", ["John Smith"])).toEqual([]);
  });

  // Rule 3 — full-name fusion (R2): resolves to John Smith by surname yet fully contains Doug Larson too.
  it("warns a full-name fusion of two roster members (coveredCount 2)", () => {
    expect(classify("Doug Larson John Smith", ["Doug Larson", "John Smith"])).toEqual([
      "Doug Larson John Smith",
    ]);
  });

  // DOCUMENTED NON-GOAL (R4/R4b): a first-name-only fusion is undecidable — Doug Larson's surname is
  // absent, so "Doug John Smith" is indistinguishable from a person named that. Flagging it would
  // necessarily reintroduce the R4b collision false-positive. coveredCount(Doug Larson)=1 → NO warn.
  it("does NOT warn a first-name-only fusion (documented non-goal)", () => {
    expect(classify("Doug John Smith", ["Doug Larson", "John Smith"])).toEqual([]);
  });

  // Rule 5 — middle / legal name (R3): longer variant, one identity fully contained.
  it("does not warn a legitimate middle name (John Michael Smith)", () => {
    expect(classify("John Michael Smith", ["John Smith"])).toEqual([]);
  });

  // R4b — middle token collides with a DIFFERENT member's first name; must still NOT warn
  // (Michael Jones is not fully contained — 'jones' absent → coveredCount 1).
  it("does not warn a middle name that collides with another member's first name", () => {
    expect(classify("John Michael Smith", ["John Smith", "Michael Jones"])).toEqual([]);
  });

  // R4b — nickname collides with a DIFFERENT member's first name; must NOT warn
  // (Bill Werner surname-resolves to William Werner; Bill Murray not fully contained → coveredCount 0).
  it("does not warn a nickname that collides with another member's first name", () => {
    expect(classify(null, ["William Werner", "Bill Murray"], [["Bill Werner"]])).toEqual([]);
  });

  // Rule 5 — shared first name is not a fusion (John Larson not fully contained — 'larson' absent).
  it("does not warn when two roster members share a first name", () => {
    expect(classify(null, ["John Larson", "John Smith"], [["John Smith"]])).toEqual([]);
  });

  // Rule 5 (R5 finding 1) — same-surname prefix near-neighbor must NOT fuse. Under exact-token
  // `covers`, "Annie Lee" does NOT cover "Ann Lee" (annie !== ann), so coveredCount is 1 (only
  // "Annie Lee" itself) and it resolves → no warn. Fails if `covers` regresses to prefix-compat
  // (which yielded a spurious coveredCount 2 fusion).
  it("does not fuse a same-surname prefix near-neighbor (Annie Lee vs Ann Lee)", () => {
    expect(classify("Annie Lee", ["Ann Lee", "Annie Lee"])).toEqual([]);
  });

  // Rule 1 — sentinels are not assignments.
  it("skips sentinel driver names", () => {
    for (const s of ["", "TBD", "N/A", "TBA", "-", "—"]) {
      expect(classify(s, ["Doug Larson"])).toEqual([]);
    }
  });

  // Guards.
  it("returns [] for null transportation or empty roster", () => {
    expect(classifyUnmatchedAssignees(null, [member("Doug Larson")])).toEqual([]);
    expect(classify("Doug Larson Loadout", [])).toEqual([]);
  });

  // assigned_names path (leg assignee, driver clean).
  it("warns a garbled name that appears only in a schedule leg", () => {
    expect(classify("Doug Larson", ["Doug Larson"], [["Zephyr Qux Loadout"]])).toEqual([]);
    expect(
      classify("Doug Larson", ["Doug Larson", "Jane Roe"], [["Jane Roe Extra Person"]]),
    ).toEqual(["Jane Roe Extra Person"]);
  });

  // Slash-merge: each sub-name classified independently → no false fusion warning.
  it("splits slash-merged assignments and does not warn a legit two-person cell", () => {
    expect(classify("Doug / Jane", ["Doug Larson", "Jane Doe"])).toEqual([]);
  });

  // Dedup + first-seen order (driver + a leg naming the same garble).
  it("dedups a warned name that appears in both driver and a leg", () => {
    expect(classify("Doug Larson Loadout", ["Doug Larson"], [["Doug Larson Loadout"]])).toEqual([
      "Doug Larson Loadout",
    ]);
  });

  // nameMatch untouched: the one-letter-token behavior the private helper must NOT regress.
  it("preserves namesRefer one-letter/initial matching (nameMatch untouched)", () => {
    expect(namesRefer("J", "John Larson")).toBe(true); // depends solely on the one-letter token
    expect(classify("J", ["John Larson"])).toEqual([]); // resolves; sig-tokens empty → rule 2 skip
  });
});

function makeResult(roster: string[], driver: string | null, assigned?: string[][]): ParseResult {
  const schedule = (assigned ?? []).map((assigned_names) => ({
    stage: "",
    date: null,
    time: null,
    assigned_names,
  }));
  return {
    crewMembers: roster.map((name) => ({ name }) as unknown as CrewMemberRow),
    transportation: { driver_name: driver, schedule } as unknown as TransportationRow,
    warnings: [],
  } as unknown as ParseResult;
}

describe("enrichTransportAssignees (emit)", () => {
  it("pushes exactly one aggregate warn with the code and the specific name", () => {
    const result = makeResult(["Doug Larson"], "Doug Larson Loadout");
    enrichTransportAssignees(result);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      severity: "warn",
      code: "TRAVEL_TRANSPORT_NAME_UNMATCHED",
    });
    expect(result.warnings[0]!.message).toContain("Doug Larson Loadout");
    expect(result.warnings[0]!.message).not.toContain("TRAVEL_TRANSPORT_NAME_UNMATCHED"); // invariant 5
  });

  it("copy does not misdiagnose a fusion of on-roster members as missing (plan-R3)", () => {
    // Both people ARE on the roster; the fault is a merged name, not a missing crew member.
    const result = makeResult(["Doug Larson", "John Smith"], "Doug Larson John Smith");
    enrichTransportAssignees(result);
    expect(result.warnings).toHaveLength(1);
    const msg = result.warnings[0]!.message;
    expect(msg).toContain("Doug Larson John Smith");
    // Must NOT tell the operator these people are absent / to add them — they're on the crew.
    expect(msg).not.toMatch(/not on the crew list|isn't on the crew|add them to the crew/i);
    // Must give the accurate diagnosis (doesn't match / merged / typo).
    expect(msg).toMatch(/match|merged|typo/i);
  });

  it("pushes nothing when every assignee is clean", () => {
    const result = makeResult(["Doug Larson"], "Doug");
    enrichTransportAssignees(result);
    expect(result.warnings).toEqual([]);
  });

  it("caps the message at 5 names and appends ', and N more'", () => {
    const roster = ["Doug Larson"];
    // Each leg CONTAINS the whole roster name "Doug Larson" verbatim (coveredCount 1) but a trailing
    // extra token shifts the surname so namesRefer resolves to nobody → rule 4 garble → warned.
    // (Under exact-token covers, a name missing "doug" — e.g. "Aaa Larson Loadout" — covers 0 and is
    // NOT warned, so the cap names must each spell out the full roster name.)
    const legs = [
      "Doug Larson Alpha",
      "Doug Larson Bravo",
      "Doug Larson Charlie",
      "Doug Larson Delta",
      "Doug Larson Echo",
      "Doug Larson Foxtrot",
    ].map((n) => [n]);
    const result = makeResult(roster, "Doug Larson", legs); // driver "Doug Larson" resolves cleanly → no warn
    enrichTransportAssignees(result);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain(", and 1 more");
    expect(result.warnings[0]!.message).toContain('"Doug Larson Alpha"');
    expect(result.warnings[0]!.message).not.toContain('"Doug Larson Foxtrot"');
  });

  it("never throws (best-effort)", () => {
    expect(() =>
      enrichTransportAssignees({ warnings: [] } as unknown as ParseResult),
    ).not.toThrow();
  });

  it("imports significantTokens/covers from the shared module (no re-inlined copy)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/sync/enrichTransportAssignees.ts"),
      "utf8",
    );
    expect(src).toMatch(/from "@\/lib\/data\/transportOwnerResolve"/);
    expect(src).not.toMatch(/^function significantTokens/m);
    expect(src).not.toMatch(/^function covers/m);
  });
});
