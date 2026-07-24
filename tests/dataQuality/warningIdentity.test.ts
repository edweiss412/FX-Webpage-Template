import { describe, expect, test } from "vitest";
import { warningIdentityKey, stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
import { buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";

const w = (
  code: string,
  rawSnippet?: string,
  gid?: number,
  a1?: string,
  blockRef?: ParseWarning["blockRef"],
): ParseWarning => ({
  severity: "warn",
  code,
  message: "m",
  ...(rawSnippet !== undefined ? { rawSnippet } : {}),
  sourceCell:
    gid === undefined ? null : { title: "STAGE", gid, ...(a1 !== undefined ? { a1 } : {}) },
  ...(blockRef !== undefined ? { blockRef } : {}),
});

describe("warningIdentityKey / buildReportSurfaceId (AC-14)", () => {
  test("STABLE: same identity regardless of position; independent of index", () => {
    const a = w("UNKNOWN_FIELD", "Storage | x", 5, "A1");
    expect(warningIdentityKey(a)).toBe(warningIdentityKey({ ...a }));
    expect(buildReportSurfaceId("rpas", a)).toBe(buildReportSurfaceId("rpas", { ...a }));
    // whitespace-only diff normalizes to the same identity
    expect(warningIdentityKey(w("UNKNOWN_FIELD", "Storage | x"))).toBe(
      warningIdentityKey(w("UNKNOWN_FIELD", "Storage  |  x")),
    );
  });
  test("UNIQUE: distinct when code / sourceCell / content differ", () => {
    expect(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a"))).not.toBe(
      buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "b")),
    );
    expect(buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a", 1))).not.toBe(
      buildReportSurfaceId("rpas", w("UNKNOWN_FIELD", "a", 2)),
    );
    expect(buildReportSurfaceId("rpas", w("A", "x"))).not.toBe(
      buildReportSurfaceId("rpas", w("B", "x")),
    );
  });
  test("no-content reportable warnings (AGENDA_*) stay distinct via blockRef.index", () => {
    // no rawSnippet, no sourceCell — only blockRef distinguishes them (Codex plan-R3)
    const g0 = w("AGENDA_GRID_MALFORMED", undefined, undefined, undefined, {
      kind: "agenda",
      index: 0,
    });
    const g1 = w("AGENDA_GRID_MALFORMED", undefined, undefined, undefined, {
      kind: "agenda",
      index: 1,
    });
    expect(buildReportSurfaceId("rpas", g0)).not.toBe(buildReportSurfaceId("rpas", g1));
    expect(new Set(stableWarningKeys([g0, g1])).size).toBe(2);
  });
  test("stableWarningKeys: per-render unique; removing a DIFFERENT-identity sibling does not change a later key", () => {
    const A = w("UNKNOWN_FIELD", "A | 1");
    const B = w("UNKNOWN_FIELD", "B | 2");
    const both = stableWarningKeys([A, B]);
    const afterIgnoreA = stableWarningKeys([B]); // A removed
    expect(new Set(both).size).toBe(2); // unique within the render
    expect(afterIgnoreA[0]).toBe(both[1]); // B's key is unchanged (stability)
  });
  test("perfect duplicates get an occurrence suffix in keys but SHARE a surfaceId", () => {
    const d = w("UNKNOWN_FIELD", "dup"); // no sourceCell → indistinguishable
    const keys = stableWarningKeys([d, { ...d }]);
    expect(keys[0]).not.toBe(keys[1]);
    expect(buildReportSurfaceId("rpas", d)).toBe(buildReportSurfaceId("rpas", { ...d }));
  });
});

describe("FIELD_UNREADABLE field fold (crewwarn-instance-discriminator §2.1)", () => {
  const mk = (field?: string): ParseWarning =>
    w("FIELD_UNREADABLE", "n/a", 7, "B9", {
      kind: "crew",
      index: 2,
      name: "Jordan",
      ...(field !== undefined ? { field } : {}),
    });

  test("folds blockRef.field; legacy field-less key is byte-identical to today's shape", () => {
    // Byte-literal pin of the PRE-change key format for a field-less warning. If the
    // implementation changes the shared shape (e.g. appends a new "|" slot), this fails.
    expect(warningIdentityKey(mk())).toBe("FIELD_UNREADABLE|7:B9|n/a|crew:2::Jordan|");
    expect(warningIdentityKey(mk("phone"))).not.toBe(warningIdentityKey(mk("email")));
    // RAW fold, presence-delimited: empty, whitespace, and padded fields are each distinct
    // from the field-less key AND from each other (a trimming implementation, or one that
    // appends without a presence delimiter, fails this).
    const legacy = warningIdentityKey(mk());
    const variants = [mk(""), mk(" "), mk("phone"), mk(" phone ")].map(warningIdentityKey);
    expect(new Set([legacy, ...variants]).size).toBe(5);
    // Downstream wiring: report surfaceIds diverge too (no shared report draft).
    expect(buildReportSurfaceId("showx", mk("phone"))).not.toBe(
      buildReportSurfaceId("showx", mk("email")),
    );
    // stableWarningKeys: field-bearing pair needs no occurrence suffix.
    const keys = stableWarningKeys([mk("phone"), mk("email")]);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).not.toMatch(/#\d+$/);
    expect(keys[1]).not.toMatch(/#\d+$/);
  });
});
