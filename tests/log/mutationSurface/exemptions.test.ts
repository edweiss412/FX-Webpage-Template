import { describe, expect, test } from "vitest";
import {
  NO_TELEMETRY_RE,
  ADMIN_SURFACE_EXEMPTIONS,
  KNOWN_UNINSTRUMENTED,
  ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER,
} from "./exemptions";

describe("NO_TELEMETRY_RE", () => {
  test("rejects a bare `// no-telemetry:` with no reason text", () => {
    expect(NO_TELEMETRY_RE.test("// no-telemetry:")).toBe(false);
  });
  test("accepts `// no-telemetry: <reason>`", () => {
    expect(NO_TELEMETRY_RE.test("// no-telemetry: test-only scaffolding")).toBe(true);
  });
});

describe("KNOWN_UNINSTRUMENTED — empty (BL-CREW-PICKER-OBSERVABILITY closed 2026-07-05)", () => {
  test("the ledger is empty; the 6 crew picker fns are now instrumented", () => {
    // The 6 non-admin crew picker fns emit the auth.picker.* crew-telemetry codes
    // (PICKER_IDENTITY_SELECTED / PICKER_IDENTITY_CLEARED / PICKER_STALE_ENTRY_CLEANED)
    // and their wrappers carry `// no-telemetry:` delegation comments, so the debt
    // ledger is closed. A NEW uninstrumented picker mutation is caught by the discovery
    // floor, not this ledger.
    expect(KNOWN_UNINSTRUMENTED).toHaveLength(0);
  });
});

describe("ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER — hardcoded literal, exactly 24 {file,fn} units after Batch 1", () => {
  test("exactly 24 rows, all distinct", () => {
    expect(ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.length).toBe(24);
    const keys = ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.map((r) => `${r.file}::${r.fn}`);
    expect(new Set(keys).size).toBe(24);
  });
  test("all 24 remaining rows are route POSTs; the 6 pre-existing action functions graduated to inline proof (Batch 1)", () => {
    const routeRows = ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.filter((r) => r.fn === "POST");
    expect(routeRows.length).toBe(24);
    // Batch 1 (BL-ADMIN-OUTCOME-BEHAVIOR) graduated the 6 per-show admin action functions
    // (archive/unarchive/setPublished/feed×3) to inline observeSuccessCodes proof in
    // adminOutcomeBehavior.test.ts, so NO non-POST (action-function) rows remain grandfathered.
    const actionRows = ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.filter((r) => r.fn !== "POST");
    expect(actionRows).toEqual([]);
  });
  test("regression (Codex plan-R3 F4 scope bound): manifest/ignore + reap-stale-sessions are NOT grandfathered — they are seeded now, not pre-existing", () => {
    const keys = new Set(ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.map((r) => `${r.file}::${r.fn}`));
    expect(
      keys.has(
        "app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts::POST",
      ),
    ).toBe(false);
    expect(keys.has("app/api/admin/onboarding/reap-stale-sessions/route.ts::POST")).toBe(false);
  });
});

describe("ADMIN_SURFACE_EXEMPTIONS — shape (populated in Task 17)", () => {
  test("every row has a valid kind", () => {
    for (const row of ADMIN_SURFACE_EXEMPTIONS)
      expect(["delegator", "read-only"]).toContain(row.kind);
  });
});
