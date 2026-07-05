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

describe("ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER — hardcoded literal, exactly 30 {file,fn} units", () => {
  test("exactly 30 rows, all distinct", () => {
    expect(ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.length).toBe(30);
    const keys = ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.map((r) => `${r.file}::${r.fn}`);
    expect(new Set(keys).size).toBe(30);
  });
  test("24 rows are route POSTs; 6 are the pre-existing admin action functions", () => {
    const routeRows = ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.filter((r) => r.fn === "POST");
    expect(routeRows.length).toBe(24);
    const actionFns = new Set(
      ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.filter((r) => r.fn !== "POST").map((r) => r.fn),
    );
    expect(actionFns).toEqual(
      new Set([
        "archiveShowAction",
        "unarchiveShowAction",
        "setShowPublishedAction",
        "mi11ApproveAction",
        "mi11RejectAction",
        "undoChangeAction",
      ]),
    );
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
