import { describe, expect, test } from "vitest";
import { normalizeRoleTokenMappings } from "@/lib/sync/roleMappingOverlay";

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
