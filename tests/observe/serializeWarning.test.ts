import { describe, expect, it } from "vitest";
import {
  serializeParseWarning,
  serializeWarningArray,
  emitClassDCode,
} from "@/lib/observe/query/serializeWarning";

const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890"; // 34 chars, matches sanitizer TOKEN class
const EMAIL = "doug@example.com";

describe("serializeParseWarning", () => {
  it("allowlists and sanitizes a real warning", () => {
    const w = serializeParseWarning(
      {
        severity: "warn",
        code: "AGENDA_DAY_EMPTIED",
        message: `contact ${EMAIL} token ${TOKEN}`,
        iso: "2026-07-15",
        field: "dims",
        rawSnippet: `SECRET ${TOKEN} ${EMAIL}`,
        blockRef: { kind: "agenda", name: `leak ${EMAIL}` },
        sourceCell: { tab: "x" },
      },
      { includePii: false },
    );
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("AGENDA_DAY_EMPTIED"); // source parse_warnings.code — passes
    expect(w.message).not.toContain(TOKEN);
    expect(w.message).not.toContain(EMAIL);
    expect(w.iso).toBe("2026-07-15");
    expect(w.field).toBe("dims");
    // dropped fields never appear anywhere
    expect(JSON.stringify(w)).not.toContain("rawSnippet");
    expect(JSON.stringify(w)).not.toContain(TOKEN);
    expect(JSON.stringify(w)).not.toContain(EMAIL);
  });
  it("reveals email in message only with includePii", () => {
    const w = serializeParseWarning(
      { severity: "info", code: "AGENDA_DAY_EMPTIED", message: `by ${EMAIL}` },
      { includePii: true },
    );
    expect(w.message).toContain(EMAIL);
  });
  it("rejects token-shaped values that pass naive shape regexes (Codex R3 F1)", () => {
    const w = serializeParseWarning(
      {
        severity: "warn",
        code: "AAAAAAAAAAAAAAAAAAAAAAAA", // 24 A's — code-shaped, not an enum member
        message: "m",
        field: "abcdefghijklmnopqrstuvwxyz", // 26 chars > 23-cap
        iso: "not-a-date",
      },
      { includePii: false },
    );
    expect(w.code).toBe("");
    expect(w.field).toBeUndefined();
    expect(w.iso).toBeUndefined();
  });
  it("rejects cross-domain enum members in code (Codex R7 F1)", () => {
    // ADMIN_SESSION_LOOKUP_FAILED is in INTERNAL_CODE_ENUMS with source admin_alerts.code
    const w = serializeParseWarning(
      { severity: "warn", code: "ADMIN_SESSION_LOOKUP_FAILED", message: "m" },
      { includePii: false },
    );
    expect(w.code).toBe("");
  });
  it("rejects malformed severity and non-object elements", () => {
    expect(
      serializeParseWarning(
        { severity: "info<script>", code: "X", message: "m" },
        { includePii: false },
      ).severity,
    ).toBe("");
    expect(serializeParseWarning("scalar", { includePii: false })).toEqual({
      severity: "",
      code: "",
      message: "",
    });
    expect(serializeParseWarning(null, { includePii: false })).toEqual({
      severity: "",
      code: "",
      message: "",
    });
  });
});

describe("serializeWarningArray", () => {
  it("maps arrays, returns [] for non-arrays (live scalar jsonb case)", () => {
    expect(serializeWarningArray("oops", { includePii: false })).toEqual([]);
    expect(serializeWarningArray({ a: 1 }, { includePii: false })).toEqual([]);
    expect(serializeWarningArray(null, { includePii: false })).toEqual([]);
    expect(
      serializeWarningArray([{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m" }], {
        includePii: false,
      }),
    ).toHaveLength(1);
  });
});

describe("emitClassDCode (INTERNAL_CODE_ENUMS ∪ message catalog)", () => {
  it("passes internal-enum codes", () => {
    expect(emitClassDCode("AGENDA_DAY_EMPTIED")).toEqual({
      code: "AGENDA_DAY_EMPTIED",
      unrecognized: false,
    });
  });
  it("passes catalog-only codes verbatim (Codex R6 F1 — RESCAN_REVIEW_REQUIRED)", () => {
    expect(emitClassDCode("RESCAN_REVIEW_REQUIRED")).toEqual({
      code: "RESCAN_REVIEW_REQUIRED",
      unrecognized: false,
    });
  });
  it("rejects non-members, token-shaped, and non-strings", () => {
    expect(emitClassDCode(TOKEN)).toEqual({ code: "", unrecognized: true });
    expect(emitClassDCode(EMAIL)).toEqual({ code: "", unrecognized: true });
    expect(emitClassDCode(42)).toEqual({ code: "", unrecognized: true });
  });
  it("rejects inherited/prototype property names (Codex plan-R1 F1)", () => {
    for (const name of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(emitClassDCode(name)).toEqual({ code: "", unrecognized: true });
      expect(
        serializeParseWarning({ severity: "warn", code: name, message: "m" }, { includePii: false })
          .code,
      ).toBe("");
    }
  });
});
