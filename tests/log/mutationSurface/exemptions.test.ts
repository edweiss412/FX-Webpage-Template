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

describe("KNOWN_UNINSTRUMENTED — exactly the 6 crew/system picker fns (spec §3.1 C)", () => {
  test("exactly 6 rows", () => {
    expect(KNOWN_UNINSTRUMENTED.length).toBe(6);
  });
  test("every row carries a backlog ref", () => {
    for (const row of KNOWN_UNINSTRUMENTED)
      expect(row.backlog, `${row.file}::${row.fn}`).toBe("BL-CREW-PICKER-OBSERVABILITY");
  });
  test("the 6 rows match spec §3.1 C exactly", () => {
    const rows = KNOWN_UNINSTRUMENTED.map((r) => `${r.file}::${r.fn}`);
    expect(new Set(rows)).toEqual(
      new Set([
        "lib/auth/picker/cleanupStaleEntry.ts::cleanupStaleEntry",
        "lib/auth/picker/cleanupStaleEntry.ts::cleanupStaleEntryCore",
        "lib/auth/picker/clearIdentity.ts::clearIdentity",
        "lib/auth/picker/clearIdentity.ts::clearIdentityAndSkip",
        "lib/auth/picker/clearIdentity.ts::clearIdentityCore",
        "lib/auth/picker/selectIdentity.ts::selectIdentityCore",
      ]),
    );
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
