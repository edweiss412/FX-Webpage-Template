import { describe, expect, test } from "vitest";

import { stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
import { operatorActionableWarnings } from "@/lib/parser/dataGaps";
import type { ParseWarning } from "@/lib/parser/types";

// Spec 2026-07-15-extend-role-scope-vocab §8.1: two unknown role tokens in the
// SAME role cell must render as two independent controls — the dedup key
// (operatorActionableWarnings) and the React-key identity (stableWarningKeys)
// both fold `roleToken` for UNKNOWN_ROLE_TOKEN. Legacy warnings without
// `roleToken` keep the old collapse behaviour (folding can only REDUCE
// collapsing, never hide a row).
describe("roleToken dedup + identity folds (§8.1)", () => {
  test("two same-cell UNKNOWN_ROLE_TOKEN warnings get distinct stable keys and both render", () => {
    const base = {
      code: "UNKNOWN_ROLE_TOKEN",
      rawSnippet: "Drone Op / Grip",
      sourceCell: { title: "Crew", gid: 1, a1: "C4" },
      blockRef: { kind: "crew", index: 0, name: "Marcus Webb" },
    };
    const a: ParseWarning = { ...base, severity: "warn", message: "", roleToken: "DRONE OP" };
    const b: ParseWarning = { ...base, severity: "warn", message: "", roleToken: "GRIP" };

    const keys = stableWarningKeys([a, b]);
    expect(new Set(keys).size).toBe(2);
    // Distinct BASE keys (roleToken folded in), NOT positional #1 suffixes —
    // reorder-stable so expanded checkbox state can't migrate between controls.
    expect(keys[0]).not.toMatch(/#1$/);
    expect(keys[1]).not.toMatch(/#1$/);

    // Dedup fold: both unknown tokens survive as separate actionable rows.
    expect(operatorActionableWarnings([a, b])).toHaveLength(2);

    // Legacy warnings without roleToken keep the a1-only collapse (unchanged).
    const legacyA = { ...a } as Record<string, unknown>;
    delete legacyA.roleToken;
    const legacyB = { ...b } as Record<string, unknown>;
    delete legacyB.roleToken;
    expect(
      operatorActionableWarnings([legacyA as ParseWarning, legacyB as ParseWarning]),
    ).toHaveLength(1);
  });
});
