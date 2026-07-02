import { describe, expect, test } from "vitest";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";

describe("warningFingerprint", () => {
  test("AC-1: stable across whitespace-only differences, distinct on real content change", () => {
    const a = warningFingerprint({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" });
    const b = warningFingerprint({ code: "UNKNOWN_FIELD", rawSnippet: "Storage  |  x" });
    const c = warningFingerprint({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | y" });
    expect(a).toBe(b); // benign whitespace edit → same fingerprint (stays ignored)
    expect(a).not.toBe(c); // real content change → new fingerprint (re-surfaces)
    expect(a).toBeTypeOf("string");
  });

  test("code is part of the key (same snippet, different code → different fp)", () => {
    const r1 = warningFingerprint({ code: "ROLE_TOKEN_AUTOCORRECTED", rawSnippet: "LD" });
    const r2 = warningFingerprint({ code: "UNKNOWN_ROLE_TOKEN", rawSnippet: "LD" });
    expect(r1).not.toBe(r2);
  });

  test("AC-2: null (not ignorable) when snippet is missing or blank", () => {
    expect(warningFingerprint({ code: "AGENDA_GRID_MALFORMED" })).toBeNull();
    expect(warningFingerprint({ code: "X", rawSnippet: "   " })).toBeNull();
    expect(warningFingerprint({ code: "X", rawSnippet: undefined })).toBeNull();
  });
});
