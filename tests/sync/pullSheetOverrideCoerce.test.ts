import { describe, expect, test } from "vitest";
import {
  coerceOverrideSnapshotFromRow,
  coercePullSheetOverride,
  overrideSnapshot,
} from "@/lib/sync/pullSheetOverride";

const FULL = {
  tabName: "OLD A",
  fingerprint: "fp1",
  acceptedBy: "u@x.co",
  acceptedAt: "2026-07-17T00:00:00Z",
};

describe("coercePullSheetOverride (full audit shape)", () => {
  test("accepts the full 4-string shape", () => {
    expect(coercePullSheetOverride(FULL)).toEqual(FULL);
  });
  test.each([
    ["missing acceptedBy", { tabName: "OLD A", fingerprint: "fp1", acceptedAt: "t" }],
    ["missing acceptedAt", { tabName: "OLD A", fingerprint: "fp1", acceptedBy: "u" }],
    ["non-string fingerprint", { ...FULL, fingerprint: 5 }],
    ["null", null],
    ["array", [FULL]],
    ["string", "x"],
  ])("rejects %s -> null", (_label, value) => {
    expect(coercePullSheetOverride(value as unknown)).toBeNull();
  });
});

describe("coerceOverrideSnapshotFromRow (durable -> snapshot, finalize-parity)", () => {
  test("full shape -> reduced snapshot (audit fields dropped)", () => {
    expect(coerceOverrideSnapshotFromRow(FULL)).toEqual({ tabName: "OLD A", fingerprint: "fp1" });
  });
  test("partial audit shape -> null (agrees with coercePullSheetOverride)", () => {
    const partial = { tabName: "OLD A", fingerprint: "fp1" };
    expect(coerceOverrideSnapshotFromRow(partial)).toBeNull();
    expect(coercePullSheetOverride(partial)).toBeNull();
  });
  test("null / non-object -> null", () => {
    expect(coerceOverrideSnapshotFromRow(null)).toBeNull();
    expect(coerceOverrideSnapshotFromRow(42)).toBeNull();
  });

  // §4.2 compositional-parity contract: the reducer IS overrideSnapshot∘coercePullSheetOverride
  // for every representative input — pins the extraction against future drift.
  test("equals overrideSnapshot(coercePullSheetOverride(v)) for a representative set", () => {
    const cases: unknown[] = [
      FULL,
      { tabName: "OLD A", fingerprint: "fp1" }, // partial
      { tabName: "OLD A", fingerprint: "fp1", acceptedBy: "u" }, // partial
      { ...FULL, fingerprint: 5 }, // bad type
      null,
      42,
      [FULL],
      {},
    ];
    for (const v of cases) {
      expect(coerceOverrideSnapshotFromRow(v)).toEqual(
        overrideSnapshot(coercePullSheetOverride(v)),
      );
    }
  });
});
