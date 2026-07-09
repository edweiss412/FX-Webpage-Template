import { describe, expect, test } from "vitest";
import { NO_TELEMETRY_RE, ADMIN_SURFACE_EXEMPTIONS, KNOWN_UNINSTRUMENTED } from "./exemptions";

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

describe("ADMIN_SURFACE_EXEMPTIONS — shape (populated in Task 17)", () => {
  test("every row has a valid kind", () => {
    for (const row of ADMIN_SURFACE_EXEMPTIONS)
      expect(["delegator", "read-only"]).toContain(row.kind);
  });
});
