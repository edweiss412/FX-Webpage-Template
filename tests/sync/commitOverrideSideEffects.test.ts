import { describe, it, expect } from "vitest";
import {
  commitOverrideSideEffects,
  type OverrideSideEffectPort,
} from "@/lib/sync/commitOverrideSideEffects";
import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel";

// Pure dispatch of the Stage-B commit. The DB version-bump SEMANTICS (refresh must NOT bump version,
// deactivate MUST) are proven against real Postgres in tests/sync/overrideHoldOrdering.test.ts +
// tests/overrides/deactivationReason.test.ts; here we pin that each variant routes to the correct port
// method (a refresh never reaches deactivateOverride, and vice-versa) and that a port throw propagates.

type Call =
  | { kind: "refresh"; overrideId: string; sheetValue: unknown }
  | { kind: "deactivate"; overrideId: string; code: string };

function recordingPort(onThrow?: (call: Call) => void): {
  port: OverrideSideEffectPort;
  calls: Call[];
} {
  const calls: Call[] = [];
  const port: OverrideSideEffectPort = {
    async refreshOverrideSheetValue(overrideId, sheetValue) {
      const call: Call = { kind: "refresh", overrideId, sheetValue };
      calls.push(call);
      onThrow?.(call);
    },
    async deactivateOverride(overrideId, code) {
      const call: Call = { kind: "deactivate", overrideId, code };
      calls.push(call);
      onThrow?.(call);
    },
  };
  return { port, calls };
}

describe("commitOverrideSideEffects", () => {
  it("routes a sheetValue effect to refreshOverrideSheetValue ONLY (never bumps version → never deactivates)", async () => {
    // Failure mode caught: a benign chip refresh reaching the deactivate/version-bump path (R30 false-409).
    const { port, calls } = recordingPort();
    const effects: OverrideSideEffect[] = [{ overrideId: "ov1", sheetValue: "Jon" }];
    await commitOverrideSideEffects(port, effects);
    expect(calls).toEqual([{ kind: "refresh", overrideId: "ov1", sheetValue: "Jon" }]);
  });

  it("routes a deactivate effect to deactivateOverride ONLY, preserving the reason code", async () => {
    // Failure mode caught: dropping/normalizing the deactivation_code, so needs-attention loses the reason.
    const { port, calls } = recordingPort();
    const effects: OverrideSideEffect[] = [
      { overrideId: "ov2", deactivate: "target_missing" },
      { overrideId: "ov3", deactivate: "name_conflict" },
    ];
    await commitOverrideSideEffects(port, effects);
    expect(calls).toEqual([
      { kind: "deactivate", overrideId: "ov2", code: "target_missing" },
      { kind: "deactivate", overrideId: "ov3", code: "name_conflict" },
    ]);
  });

  it("mixes refresh + deactivate in one pass, each to its own port method", async () => {
    const { port, calls } = recordingPort();
    const effects: OverrideSideEffect[] = [
      { overrideId: "a", sheetValue: { start: "2026-01" } },
      { overrideId: "b", deactivate: "name_conflict" },
      { overrideId: "c", sheetValue: null },
    ];
    await commitOverrideSideEffects(port, effects);
    expect(calls).toEqual([
      { kind: "refresh", overrideId: "a", sheetValue: { start: "2026-01" } },
      { kind: "deactivate", overrideId: "b", code: "name_conflict" },
      { kind: "refresh", overrideId: "c", sheetValue: null },
    ]);
  });

  it("empty side-effects → no port calls (a no-override sync writes nothing)", async () => {
    const { port, calls } = recordingPort();
    await commitOverrideSideEffects(port, []);
    expect(calls).toEqual([]);
  });

  it("propagates a port throw (aborts the locked tx — never swallowed)", async () => {
    // Failure mode caught: catching the DB fault, letting admin_overrides diverge from the live rows.
    const { port } = recordingPort((call) => {
      if (call.kind === "deactivate") throw new Error("db fault");
    });
    await expect(
      commitOverrideSideEffects(port, [{ overrideId: "x", deactivate: "target_missing" }]),
    ).rejects.toThrow("db fault");
  });
});
