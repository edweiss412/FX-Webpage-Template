import { describe, expect, it } from "vitest";
import { parseDoc, splitLines } from "../../lib/specLint/parse";

const B3 = "```";
const B4 = "````";

describe("splitLines", () => {
  it("drops exactly one trailing empty element for a final newline", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
  });

  it("normalizes CRLF", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
  });

  it("keeps interior empty lines", () => {
    expect(splitLines("a\n\nb\n")).toEqual(["a", "", "b"]);
  });
});

describe("parseDoc — document guards", () => {
  it("empty doc → EMPTY_DOC at docLine 1 col 1", () => {
    const m = parseDoc("");
    expect(m.documentFindings).toEqual([
      expect.objectContaining({
        check: "document",
        code: "EMPTY_DOC",
        severity: "fail",
        docLine: 1,
        column: 1,
      }),
    ]);
  });

  it("blank-only doc → EMPTY_DOC", () => {
    const m = parseDoc("\n   \n\t\n");
    expect(m.documentFindings.map((f) => f.code)).toEqual(["EMPTY_DOC"]);
  });

  it("non-empty doc → no document findings", () => {
    const m = parseDoc("hello\n");
    expect(m.documentFindings).toEqual([]);
  });
});

describe("parseDoc — fences", () => {
  it("bare backtick fence opens and closes; interior lines carry info", () => {
    const m = parseDoc([B3, "code", B3, "after"].join("\n"));
    expect(m.fencedInfo[0]).toBeNull(); // opener delimiter
    expect(m.fencedInfo[1]).toBe(""); // interior, empty info
    expect(m.fencedInfo[2]).toBeNull(); // closer delimiter
    expect(m.fencedInfo[3]).toBeUndefined(); // not fenced
  });

  it("tilde fence works", () => {
    const m = parseDoc(["~~~", "x", "~~~"].join("\n"));
    expect(m.fencedInfo[1]).toBe("");
  });

  it("info string trimmed, lowercased, first word only", () => {
    const m1 = parseDoc([B3 + "TS ", "x", B3].join("\n"));
    expect(m1.fencedInfo[1]).toBe("ts");
    const m2 = parseDoc([B3 + "ts title=x", "x", B3].join("\n"));
    expect(m2.fencedInfo[1]).toBe("ts");
  });

  it("4-backtick fence survives 3-backtick lines until ≥4 closer", () => {
    const m = parseDoc([B4, B3, "inner", B3, B4, "out"].join("\n"));
    expect(m.fencedInfo[1]).toBe(""); // the ``` line is interior content
    expect(m.fencedInfo[2]).toBe("");
    expect(m.fencedInfo[3]).toBe("");
    expect(m.fencedInfo[4]).toBeNull(); // the ```` closer
    expect(m.fencedInfo[5]).toBeUndefined();
  });

  it("closer must be same char", () => {
    const m = parseDoc([B3, "~~~", "x", B3].join("\n"));
    expect(m.fencedInfo[1]).toBe(""); // tilde line is interior
    expect(m.fencedInfo[3]).toBeNull(); // backtick closer
  });

  it("unterminated fence → fenced to EOF", () => {
    const m = parseDoc([B3 + "ts", "a", "b"].join("\n"));
    expect(m.fencedInfo[1]).toBe("ts");
    expect(m.fencedInfo[2]).toBe("ts");
  });

  it("≤3-space indent recognized, 4-space not", () => {
    const m3 = parseDoc(["   " + B3, "x", "   " + B3, "out"].join("\n"));
    expect(m3.fencedInfo[1]).toBe("");
    expect(m3.fencedInfo[3]).toBeUndefined();
    const m4 = parseDoc(["    " + B3, "x"].join("\n"));
    expect(m4.fencedInfo[0]).toBeUndefined(); // indented code, not a fence
    expect(m4.fencedInfo[1]).toBeUndefined();
  });
});

describe("parseDoc — inline spans", () => {
  it("single-backtick span with correct UTF-16 column", () => {
    const m = parseDoc("see `lib/x.ts:12` here\n");
    expect(m.spans).toEqual([{ line: 1, column: 6, content: "lib/x.ts:12" }]);
  });

  it("double-backtick span containing a single backtick", () => {
    const m = parseDoc("a `` x ` y `` b\n");
    expect(m.spans).toEqual([{ line: 1, column: 5, content: " x ` y " }]);
  });

  it("unclosed backtick run is literal — no span", () => {
    const m = parseDoc("a `unclosed here\n");
    expect(m.spans).toEqual([]);
  });

  it("no spans collected on fenced lines", () => {
    const m = parseDoc([B3, "`x`", B3].join("\n"));
    expect(m.spans).toEqual([]);
  });

  it("column counts UTF-16 units (astral char = 2 units)", () => {
    const m = parseDoc("💥 `x`\n"); // emoji = 2 units + space = 3, backtick at 4, content at 5
    expect(m.spans).toEqual([{ line: 1, column: 5, content: "x" }]);
  });

  it("two spans on one line", () => {
    const m = parseDoc("`a` and `b`\n");
    expect(m.spans).toEqual([
      { line: 1, column: 2, content: "a" },
      { line: 1, column: 10, content: "b" },
    ]);
  });
});

describe("parseDoc — headings", () => {
  it("collects ATX headings with depth and text", () => {
    const m = parseDoc(["# One", "###### Six", "text"].join("\n"));
    expect(m.headings).toEqual([
      { line: 1, depth: 1, text: "One" },
      { line: 2, depth: 6, text: "Six" },
    ]);
  });

  it("heading-looking line inside fence ignored", () => {
    const m = parseDoc([B3, "# not a heading", B3].join("\n"));
    expect(m.headings).toEqual([]);
  });
});

describe("parseDoc — waivers", () => {
  it("both kinds parsed with reason", () => {
    const m = parseDoc(
      [
        "<!-- spec-lint: ignore — demo reason -->",
        "<!-- spec-lint: not-ui — pure CLI -->",
        "x",
      ].join("\n"),
    );
    expect(m.waivers).toEqual([
      { line: 1, kind: "ignore", reason: "demo reason" },
      { line: 2, kind: "not-ui", reason: "pure CLI" },
    ]);
    expect(m.documentFindings).toEqual([]);
  });

  it("indented waiver recognized after trim", () => {
    const m = parseDoc("  <!-- spec-lint: ignore — why -->\nx\n");
    expect(m.waivers).toEqual([{ line: 1, kind: "ignore", reason: "why" }]);
  });

  it("waiver with trailing prose on the line is NOT a waiver", () => {
    const m = parseDoc("<!-- spec-lint: ignore — why --> trailing\nx\n");
    expect(m.waivers).toEqual([]);
    expect(m.documentFindings).toEqual([]);
  });

  it("waiver-shaped text inside a fence is inert", () => {
    const m = parseDoc([B3, "<!-- spec-lint: ignore — why -->", B3].join("\n"));
    expect(m.waivers).toEqual([]);
  });

  it("empty reason → hard WAIVER_MISSING_REASON at that line", () => {
    const m = parseDoc("<!-- spec-lint: ignore — -->\nx\n");
    expect(m.waivers).toEqual([]);
    expect(m.documentFindings).toEqual([
      expect.objectContaining({
        check: "document",
        code: "WAIVER_MISSING_REASON",
        severity: "fail",
        docLine: 1,
        column: 1,
      }),
    ]);
  });
});
