import { describe, expect, test } from "vitest";
import { warningIdentityKey, stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";

const w = (code: string, rawSnippet?: string, gid?: number, a1?: string, blockRef?: ParseWarning["blockRef"]): ParseWarning => ({
  severity: "warn",
  code,
  message: "m",
  ...(rawSnippet !== undefined ? { rawSnippet } : {}),
  sourceCell: gid === undefined ? null : { title: "STAGE", gid, ...(a1 !== undefined ? { a1 } : {}) },
  ...(blockRef !== undefined ? { blockRef } : {}),
});

describe("warningIdentityKey / buildReportSurfaceId (AC-14)", () => {
  test("STABLE: same identity regardless of position; independent of index", () => {
    const a = w("UNKNOWN_FIELD", "Storage | x", 5, "A1");
    expect(warningIdentityKey(a)).toBe(warningIdentityKey({ ...a }));
    expect(buildReportSurfaceId("rpas", a)).toBe(buildReportSurfaceId("rpas", { ...a }));
    // whitespace-only diff normalizes to the same identity
    expect(warningIdentityKey(w("UNKNOWN_FIELD", "Storage | x"))).toBe(warningIdentityKey(w("UNKNOWN_FIELD", "Storage  |  x")));
  });
  test("UNIQUE: distinct when code / sourceCell / content differ", () => {
    expect(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a"))).not.toBe(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "b")));
    expect(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a", 1))).not.toBe(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a", 2)));
    expect(buildReportSurfaceId("rpas", w("A", "x"))).not.toBe(buildReportSurfaceId("rpas", w("B", "x")));
  });
  test("no-content reportable warnings (AGENDA_*) stay distinct via blockRef.index", () => {
    // no rawSnippet, no sourceCell — only blockRef distinguishes them (Codex plan-R3)
    const g0 = w("AGENDA_GRID_MALFORMED", undefined, undefined, undefined, { kind: "agenda", index: 0 });
    const g1 = w("AGENDA_GRID_MALFORMED", undefined, undefined, undefined, { kind: "agenda", index: 1 });
    expect(buildReportSurfaceId("rpas", g0)).not.toBe(buildReportSurfaceId("rpas", g1));
    expect(new Set(stableWarningKeys([g0, g1])).size).toBe(2);
  });
  test("stableWarningKeys: per-render unique; removing a DIFFERENT-identity sibling does not change a later key", () => {
    const A = w("UNKNOWN_FIELD", "A | 1"); const B = w("UNKNOWN_FIELD", "B | 2");
    const both = stableWarningKeys([A, B]);
    const afterIgnoreA = stableWarningKeys([B]); // A removed
    expect(new Set(both).size).toBe(2);           // unique within the render
    expect(afterIgnoreA[0]).toBe(both[1]);        // B's key is unchanged (stability)
  });
  test("perfect duplicates get an occurrence suffix in keys but SHARE a surfaceId", () => {
    const d = w("UNKNOWN_FIELD", "dup"); // no sourceCell → indistinguishable
    const keys = stableWarningKeys([d, { ...d }]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(buildReportSurfaceId("rpas", d)).toBe(buildReportSurfaceId("rpas", { ...d }));
  });
});
