import { describe, expect, test } from "vitest";
import {
  applyRoleTokenMappings,
  normalizeRoleTokenMappings,
  type RoleTokenMapping,
} from "@/lib/sync/roleMappingOverlay";
import { buildParseResult } from "../components/admin/wizard/_step3ReviewFixture";
import type { CrewMemberRow, ParseResult, ParseWarning, RoleFlag } from "@/lib/parser/types";

const ROW = {
  token: "DRONE OP",
  grants: ["A1"],
  decided_by: "doug@fxav.com",
  decided_at: "2026-07-16T00:00:00.000Z",
};

describe("normalizeRoleTokenMappings (spec §6.2) — never throws, drops corrupt rows", () => {
  test("non-array → []", () => {
    expect(normalizeRoleTokenMappings(null)).toEqual([]);
    expect(normalizeRoleTokenMappings("x")).toEqual([]);
  });
  test("valid row passes; snake_case columns map to camelCase fields", () => {
    expect(normalizeRoleTokenMappings([ROW])).toEqual([
      {
        token: "DRONE OP",
        grants: ["A1"],
        decidedBy: "doug@fxav.com",
        decidedAt: "2026-07-16T00:00:00.000Z",
      },
    ]);
  });
  test("drops: non-canonical token, out-of-set grant, blank decidedBy, bad decidedAt", () => {
    expect(normalizeRoleTokenMappings([{ ...ROW, token: " drone op" }])).toEqual([]);
    expect(normalizeRoleTokenMappings([{ ...ROW, grants: ["LEAD"] }])).toEqual([]);
    expect(normalizeRoleTokenMappings([{ ...ROW, decided_by: "  " }])).toEqual([]);
    expect(normalizeRoleTokenMappings([{ ...ROW, decided_at: "not-a-date" }])).toEqual([]);
  });
  test("dedupes grants into stable A1,V1,L1,FINANCIALS order (spec §8.3/Codex R2 F4)", () => {
    const out = normalizeRoleTokenMappings([{ ...ROW, grants: ["FINANCIALS", "A1", "A1", "V1"] }]);
    expect(out[0]!.grants).toEqual(["A1", "V1", "FINANCIALS"]);
  });
  test("recognize-only (empty grants) is valid", () => {
    expect(normalizeRoleTokenMappings([{ ...ROW, grants: [] }])[0]!.grants).toEqual([]);
  });
  test("camelCase (already-normalized) objects are REJECTED — this boundary accepts DB-shaped snake_case rows only (plan-R5 advisory)", () => {
    expect(
      normalizeRoleTokenMappings([
        {
          token: "DRONE OP",
          grants: ["A1"],
          decidedBy: "doug@fxav.com",
          decidedAt: "2026-07-16T00:00:00.000Z",
        },
      ]),
    ).toEqual([]);
  });
});

// ── Task 6: applyRoleTokenMappings overlay (spec §6) ──────────────────────────

const MAPPING: RoleTokenMapping = {
  token: "DRONE OP",
  grants: ["A1"],
  decidedBy: "doug@fxav.com",
  decidedAt: "2026-07-16T00:00:00.000Z",
};

function crewMember(name: string, role: string, roleFlags: RoleFlag[]): CrewMemberRow {
  return {
    name,
    email: null,
    phone: null,
    role,
    role_flags: roleFlags,
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function unknownRoleWarning(
  roleToken: string,
  blockRef: ParseWarning["blockRef"],
  rawSnippet = "Drone Op",
): ParseWarning {
  const w: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `Unrecognized role "${rawSnippet}"`,
    rawSnippet,
    roleToken,
  };
  if (blockRef !== undefined) w.blockRef = blockRef;
  return w;
}

/**
 * Minimal ParseResult: ONE crew member (Marcus Webb, no flags) + ONE
 * UNKNOWN_ROLE_TOKEN warning anchored to it. Reuses buildParseResult so the
 * surrounding shape stays realistic; overrides only crew + warnings.
 */
function crewFixture(
  overrides: { roleFlags?: RoleFlag[]; warnings?: ParseWarning[] } = {},
): ParseResult {
  return buildParseResult({
    crewMembers: [crewMember("Marcus Webb", "Drone Op", overrides.roleFlags ?? [])],
    warnings: overrides.warnings ?? [
      unknownRoleWarning("DRONE OP", { kind: "crew", index: 0, name: "Marcus Webb" }),
    ],
  });
}

describe("applyRoleTokenMappings (spec §6)", () => {
  test("matched token: grants unioned (deduped) onto the crew row, warning removed, applied recorded", () => {
    const { result, applied } = applyRoleTokenMappings(crewFixture(), [MAPPING]);
    // Expected flag derived from MAPPING.grants, not hardcoded.
    expect(result.crewMembers[0]!.role_flags).toEqual(MAPPING.grants);
    expect(result.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    expect(applied).toEqual([
      {
        token: MAPPING.token,
        grants: MAPPING.grants,
        memberIndex: 0,
        memberName: "Marcus Webb",
        blockRefName: "Marcus Webb",
      },
    ]);
  });

  test("never removes existing flags; union only", () => {
    const { result } = applyRoleTokenMappings(crewFixture({ roleFlags: ["V1"] }), [MAPPING]);
    const flags = result.crewMembers[0]!.role_flags;
    // Pre-existing V1 retained; MAPPING.grants (A1) unioned in — both present.
    expect(flags).toContain("V1");
    for (const g of MAPPING.grants) expect(flags).toContain(g);
    expect(flags).toHaveLength(1 + MAPPING.grants.length);
  });

  test("recognize-only: warning removed, flags unchanged, still recorded", () => {
    const recognizeOnly: RoleTokenMapping = { ...MAPPING, grants: [] };
    const { result, applied } = applyRoleTokenMappings(crewFixture(), [recognizeOnly]);
    expect(result.crewMembers[0]!.role_flags).toEqual([]);
    expect(result.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.grants).toEqual([]);
  });

  test("legacy warning without roleToken: untouched (fail-closed)", () => {
    const legacy = unknownRoleWarning("DRONE OP", { kind: "crew", index: 0, name: "Marcus Webb" });
    delete legacy.roleToken;
    const { result, applied } = applyRoleTokenMappings(crewFixture({ warnings: [legacy] }), [
      MAPPING,
    ]);
    expect(result.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toHaveLength(1);
    expect(result.crewMembers[0]!.role_flags).toEqual([]);
    expect(applied).toEqual([]);
  });

  test("unmapped token: untouched", () => {
    const { result, applied } = applyRoleTokenMappings(crewFixture(), []);
    expect(result.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toHaveLength(1);
    expect(result.crewMembers[0]!.role_flags).toEqual([]);
    expect(applied).toEqual([]);
  });

  test("bad blockRef (index out of range / kind !== crew / missing): warning kept, nothing applied", () => {
    const outOfRange = crewFixture({
      warnings: [unknownRoleWarning("DRONE OP", { kind: "crew", index: 5, name: "Marcus Webb" })],
    });
    expect(applyRoleTokenMappings(outOfRange, [MAPPING]).applied).toEqual([]);
    expect(
      applyRoleTokenMappings(outOfRange, [MAPPING]).result.warnings.filter(
        (w) => w.code === "UNKNOWN_ROLE_TOKEN",
      ),
    ).toHaveLength(1);

    const wrongKind = crewFixture({
      warnings: [unknownRoleWarning("DRONE OP", { kind: "rooms", index: 0, name: "Marcus Webb" })],
    });
    expect(applyRoleTokenMappings(wrongKind, [MAPPING]).applied).toEqual([]);
    expect(wrongKind.crewMembers[0]!.role_flags).toEqual([]);

    const missing = crewFixture({
      warnings: [unknownRoleWarning("DRONE OP", undefined)],
    });
    expect(applyRoleTokenMappings(missing, [MAPPING]).applied).toEqual([]);
  });

  test("multi-member same token: each matched independently", () => {
    const pr = buildParseResult({
      crewMembers: [
        crewMember("Marcus Webb", "Drone Op", []),
        crewMember("Ada Cole", "Drone Op", []),
      ],
      warnings: [
        unknownRoleWarning("DRONE OP", { kind: "crew", index: 0, name: "Marcus Webb" }),
        unknownRoleWarning("DRONE OP", { kind: "crew", index: 1, name: "Ada Cole" }),
      ],
    });
    const { result, applied } = applyRoleTokenMappings(pr, [MAPPING]);
    expect(result.crewMembers[0]!.role_flags).toEqual(MAPPING.grants);
    expect(result.crewMembers[1]!.role_flags).toEqual(MAPPING.grants);
    expect(applied.map((a) => a.memberIndex)).toEqual([0, 1]);
    expect(result.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
  });

  test("multi-token same cell: two warnings, matched independently", () => {
    const gaffer: RoleTokenMapping = { ...MAPPING, token: "GAFFER", grants: ["L1"] };
    const pr = crewFixture({
      warnings: [
        unknownRoleWarning("DRONE OP", { kind: "crew", index: 0, name: "Marcus Webb" }, "Drone Op"),
        unknownRoleWarning("GAFFER", { kind: "crew", index: 0, name: "Marcus Webb" }, "Gaffer"),
      ],
    });
    const { result, applied } = applyRoleTokenMappings(pr, [MAPPING, gaffer]);
    // Both grants unioned onto the shared row.
    expect(result.crewMembers[0]!.role_flags).toEqual([...MAPPING.grants, ...gaffer.grants]);
    expect(applied.map((a) => a.token)).toEqual([MAPPING.token, gaffer.token]);
    expect(result.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toEqual([]);
  });

  test("input ParseResult is never mutated (structuredClone)", () => {
    const input = crewFixture();
    const snapshot = structuredClone(input);
    applyRoleTokenMappings(input, [MAPPING]);
    expect(input).toEqual(snapshot);
  });
});

// ── Task 7: gateAppliedRoleMappings delta gate (spec §10 point 2) ──────────────

import {
  gateAppliedRoleMappings,
  type AppliedRoleMapping,
  type GrantableFlag,
} from "@/lib/sync/roleMappingOverlay";

function applied(
  overrides: Partial<AppliedRoleMapping> & { token: string; grants: GrantableFlag[] },
): AppliedRoleMapping {
  return {
    memberIndex: 0,
    memberName: overrides.blockRefName ?? "Marcus Webb",
    blockRefName: overrides.blockRefName ?? "Marcus Webb",
    ...overrides,
  };
}

function priorWarn(roleToken: string, name: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: "m",
    roleToken,
    blockRef: { kind: "crew", index: 0, name },
  };
}

describe("gateAppliedRoleMappings (spec §10 point 2 — prior-persisted state only)", () => {
  test("same-token entries carry identical grants by construction (one row per token); the grouped entry uses them verbatim — documented, not inferred (Codex plan-R1 F5)", () => {
    const a = [
      applied({ token: "DRONE OP", grants: ["A1"], blockRefName: "Marcus Webb" }),
      applied({ token: "DRONE OP", grants: ["A1"], blockRefName: "Ada Cole" }),
    ];
    const out = gateAppliedRoleMappings(a, undefined, undefined);
    expect(out).toEqual([{ token: "DRONE OP", grants: ["A1"], newMemberCount: 2 }]);
  });

  test("grants branch: emits when a granted flag is newly present vs prior role_flags", () => {
    const a = [applied({ token: "DRONE OP", grants: ["A1", "V1"], blockRefName: "Marcus Webb" })];
    // Prior had A1 only; V1 is newly present → emit.
    const out = gateAppliedRoleMappings(a, [{ name: "Marcus Webb", role_flags: ["A1"] }], []);
    expect(out).toEqual([{ token: "DRONE OP", grants: ["A1", "V1"], newMemberCount: 1 }]);
  });

  test("grants branch: silent when the member's prior flags already include every grant (steady state)", () => {
    const a = [applied({ token: "DRONE OP", grants: ["A1"], blockRefName: "Marcus Webb" })];
    const out = gateAppliedRoleMappings(a, [{ name: "Marcus Webb", role_flags: ["A1"] }], []);
    expect(out).toEqual([]);
  });

  test("recognize-only branch: emits when prior warnings still contained (roleToken, blockRefName)", () => {
    const a = [applied({ token: "DRONE OP", grants: [], blockRefName: "Marcus Webb" })];
    const out = gateAppliedRoleMappings(a, [], [priorWarn("DRONE OP", "Marcus Webb")]);
    expect(out).toEqual([{ token: "DRONE OP", grants: [], newMemberCount: 1 }]);
  });

  test("recognize-only branch: silent when prior warnings did not contain it (already suppressed)", () => {
    const a = [applied({ token: "DRONE OP", grants: [], blockRefName: "Marcus Webb" })];
    // Prior warnings present but for a different member → not matched → silent.
    const out = gateAppliedRoleMappings(a, [], [priorWarn("DRONE OP", "Someone Else")]);
    expect(out).toEqual([]);
  });

  test("recognize-only with blockRefName null: SKIPPED fail-closed (Codex R10 F2)", () => {
    const a = [applied({ token: "DRONE OP", grants: [], blockRefName: null })];
    const out = gateAppliedRoleMappings(a, [], [priorWarn("DRONE OP", "Marcus Webb")]);
    expect(out).toEqual([]);
  });

  test("legacy prior warnings without roleToken never match (accepted carve-out, Codex R12 F4)", () => {
    const legacy = priorWarn("DRONE OP", "Marcus Webb");
    delete legacy.roleToken;
    const a = [applied({ token: "DRONE OP", grants: [], blockRefName: "Marcus Webb" })];
    // Prior warnings exist (not no-prior) but lack roleToken → no match → silent.
    const out = gateAppliedRoleMappings(a, [], [legacy]);
    expect(out).toEqual([]);
  });

  test("absent prior state (both undefined): everything is new -> emit", () => {
    const a = [
      applied({ token: "DRONE OP", grants: ["A1"], blockRefName: "Marcus Webb" }),
      applied({ token: "GAFFER", grants: [], blockRefName: "Ada Cole" }),
    ];
    const out = gateAppliedRoleMappings(a, undefined, undefined);
    expect(out).toEqual([
      { token: "DRONE OP", grants: ["A1"], newMemberCount: 1 },
      { token: "GAFFER", grants: [], newMemberCount: 1 },
    ]);
  });

  test("grouping: one entry per token, newMemberCount = gate-passing members (Codex R14 F4)", () => {
    const a = [
      applied({ token: "DRONE OP", grants: ["A1"], blockRefName: "Marcus Webb" }),
      applied({ token: "DRONE OP", grants: ["A1"], blockRefName: "Ada Cole" }),
      applied({ token: "DRONE OP", grants: ["A1"], blockRefName: "Lee Park" }),
    ];
    // Ada already steady-state (has A1) → excluded from count; Marcus + Lee new.
    const out = gateAppliedRoleMappings(a, [{ name: "Ada Cole", role_flags: ["A1"] }], []);
    expect(out).toEqual([{ token: "DRONE OP", grants: ["A1"], newMemberCount: 2 }]);
  });

  test("crew reorder does not re-emit (identity is name-based, never index)", () => {
    // Same member, different index across syncs → prior lookup is by name, so
    // steady-state stays silent regardless of index.
    const a = [
      applied({ token: "DRONE OP", grants: ["A1"], memberIndex: 7, blockRefName: "Marcus Webb" }),
    ];
    const out = gateAppliedRoleMappings(a, [{ name: "Marcus Webb", role_flags: ["A1"] }], []);
    expect(out).toEqual([]);
  });
});
