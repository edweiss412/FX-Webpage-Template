import { describe, expect, it } from "vitest";
import { checkCitations, classifySpan } from "../../lib/specLint/citations";
import { parseDoc, splitLines } from "../../lib/specLint/parse";
import type { FileResolver } from "../../lib/specLint/types";
import { CITATION_CASES, MALFORMED_CASES } from "./citationCases";

describe("classifySpan — candidate domain + well-formedness (spec §4)", () => {
  it.each(CITATION_CASES.map((c) => [c.content, c] as const))(
    "classifies %j",
    (_label, c) => {
      expect(classifySpan(c.content)).toEqual(c.expected);
    },
  );
});

function makeResolver(files: Record<string, string | null>): {
  resolver: FileResolver;
  reads: string[];
} {
  const reads: string[] = [];
  return {
    resolver: {
      listTrackedFiles: () => Object.keys(files),
      readFileLines: (p: string) => {
        reads.push(p);
        const c = files[p];
        return c === null || c === undefined ? null : splitLines(c);
      },
    },
    reads,
  };
}

function run(docText: string, files: Record<string, string | null>) {
  const { resolver, reads } = makeResolver(files);
  const result = checkCitations(parseDoc(docText), resolver);
  return { ...result, reads };
}

const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

describe("checkCitations — resolution (spec §4)", () => {
  it("tracked slashed resolves clean", () => {
    const r = run("see `lib/a.ts:1`\n", { "lib/a.ts": "one\ntwo\n" });
    expect(r.findings).toEqual([]);
    expect(r.resolvedPaths).toEqual(["lib/a.ts"]);
  });

  it("untracked slashed → CITATION_FILE_MISSING and NO read attempted (containment spy)", () => {
    const r = run("see `zzz/nope.ts:1`\n", { "lib/a.ts": "one\n" });
    expect(codes(r)).toEqual(["CITATION_FILE_MISSING"]);
    expect(r.reads).toEqual([]);
  });

  it("bare shorthand anchors to earlier resolved full-path citation", () => {
    const r = run("`lib/deep/anchor.ts:1` then `anchor.ts:2`\n", {
      "lib/deep/anchor.ts": "a\nb\nc\n",
      "other/anchor.ts": "a\n", // 2 basename matches — only the anchor disambiguates
    });
    expect(r.findings).toEqual([]);
    expect(r.resolvedPaths).toEqual(["lib/deep/anchor.ts", "lib/deep/anchor.ts"]);
  });

  it("earlier MISSING citation does not anchor (falls to basename rule)", () => {
    const r = run("`zzz/gone.ts:1`\n`gone.ts:1`\n", { "lib/a.ts": "x\n" });
    expect(codes(r)).toEqual(["CITATION_FILE_MISSING", "CITATION_FILE_MISSING"]);
  });

  it("earlier AMBIGUOUS citation does not anchor", () => {
    const r = run("`dup.ts:1`\n`dup.ts:1`\n", {
      "a/dup.ts": "x\n",
      "b/dup.ts": "x\n",
    });
    expect(codes(r)).toEqual(["CITATION_AMBIGUOUS", "CITATION_AMBIGUOUS"]);
    expect(r.findings[0]!.detail).toContain("a/dup.ts");
    expect(r.findings[0]!.detail).toContain("b/dup.ts");
  });

  it("two earlier resolved same-basename anchors → most recent wins", () => {
    // b/util.ts (most recent anchor) has 1 line, so util.ts:3 is out of range
    // ONLY under the correct (most recent) anchor — a/util.ts has 3 lines.
    const r = run("`a/util.ts:1`\n`b/util.ts:1`\n`util.ts:3`\n", {
      "a/util.ts": "1\n2\n3\n",
      "b/util.ts": "1\n",
    });
    expect(codes(r)).toEqual(["CITATION_LINE_OUT_OF_RANGE"]);
    expect(r.findings[0]!.docLine).toBe(3);
  });

  it("unique tracked basename resolves without anchor", () => {
    const r = run("`solo.ts:1`\n", { "deep/solo.ts": "x\n" });
    expect(r.findings).toEqual([]);
    expect(r.resolvedPaths).toEqual(["deep/solo.ts"]);
  });

  it("zero basename matches → missing; ≥2 with no anchor → ambiguous", () => {
    const r1 = run("`ghost.ts:1`\n", {});
    expect(codes(r1)).toEqual(["CITATION_FILE_MISSING"]);
    const r2 = run("`dup.ts:1`\n", { "a/dup.ts": "x\n", "b/dup.ts": "x\n" });
    expect(codes(r2)).toEqual(["CITATION_AMBIGUOUS"]);
  });

  it("resolved-despite-line-failure: unreadable citation still anchors and populates resolvedPaths", () => {
    const r = run("`lib/u.ts:2`\n`u.ts:1`\n", { "lib/u.ts": null });
    expect(codes(r)).toEqual(["CITATION_UNREADABLE", "CITATION_UNREADABLE"]);
    expect(r.resolvedPaths).toEqual(["lib/u.ts", "lib/u.ts"]);
  });

  it("resolved-despite-line-failure: out-of-range citation still anchors", () => {
    const r = run("`lib/o.ts:5`\n`o.ts:1`\n", { "lib/o.ts": "only\n" });
    expect(codes(r)).toEqual(["CITATION_LINE_OUT_OF_RANGE"]);
    expect(r.resolvedPaths).toEqual(["lib/o.ts", "lib/o.ts"]);
  });

  it("bare path-only: ≥2 matches → no finding, NO resolvedPaths entry; zero → missing", () => {
    const r = run("`Button.tsx`\n", {
      "components/Button.tsx": "x\n",
      "lib/x/Button.tsx": "x\n",
    });
    expect(r.findings).toEqual([]);
    expect(r.resolvedPaths).toEqual([]);
    const r2 = run("`Ghost.tsx`\n", {});
    expect(codes(r2)).toEqual(["CITATION_FILE_MISSING"]);
  });

  it("EOF boundary: last line passes, last+1 fails; trailing-newline invariant", () => {
    for (const content of ["a\nb\n", "a\nb"]) {
      const ok = run("`lib/e.ts:2`\n", { "lib/e.ts": content });
      expect(ok.findings).toEqual([]);
      const bad = run("`lib/e.ts:3`\n", { "lib/e.ts": content });
      expect(codes(bad)).toEqual(["CITATION_LINE_OUT_OF_RANGE"]);
      expect(bad.findings[0]!.detail).toContain("2");
    }
  });

  it("inverted range; inverted AND out-of-range co-occur", () => {
    const inv = run("`lib/e.ts:2-1`\n", { "lib/e.ts": "a\nb\n" });
    expect(codes(inv)).toEqual(["CITATION_RANGE_INVERTED"]);
    const both = run("`lib/e.ts:5-3`\n", { "lib/e.ts": "a\nb\n" });
    expect(codes(both).sort()).toEqual([
      "CITATION_LINE_OUT_OF_RANGE",
      "CITATION_RANGE_INVERTED",
    ]);
  });

  it("resolver null → CITATION_UNREADABLE", () => {
    const r = run("`lib/u.ts:1`\n", { "lib/u.ts": null });
    expect(codes(r)).toEqual(["CITATION_UNREADABLE"]);
  });

  it.each(MALFORMED_CASES.map((c) => [c.content, c] as const))(
    "malformed %j → hard CITATION_MALFORMED at exact span position",
    (_label, c) => {
      const r = run("x `" + c.content + "`\n", {});
      expect(r.findings).toEqual([
        expect.objectContaining({
          check: "citations",
          code: "CITATION_MALFORMED",
          severity: "fail",
          docLine: 1,
          column: 4,
        }),
      ]);
      expect(r.candidateSpans).toHaveLength(1);
    },
  );
});

describe("checkCitations — symbol proximity (spec §4)", () => {
  const FILE = ["line one", "line two", "export function fooBar() {", "line 4", "line 5"].join(
    "\n",
  );

  it("identifier found in window → no advisory", () => {
    const r = run("see `fooBar` at `lib/p.ts:3`\n", { "lib/p.ts": FILE });
    expect(r.findings).toEqual([]);
  });

  it("identifier not found → advisory with first cited line in detail", () => {
    const r = run("see `nopeSym` at `lib/p.ts:3`\n", { "lib/p.ts": FILE });
    expect(codes(r)).toEqual(["CITATION_SYMBOL_UNMATCHED"]);
    expect(r.findings[0]!.severity).toBe("advisory");
    expect(r.findings[0]!.detail).toContain("export function fooBar() {");
  });

  it("window clamps at head (start=1) and tail (end=len)", () => {
    const head = run("see `fooBar` at `lib/p.ts:1`\n", { "lib/p.ts": FILE });
    expect(head.findings).toEqual([]); // window [1-5..1+5] clamped → includes line 3
    const tail = run("see `fooBar` at `lib/p.ts:5`\n", { "lib/p.ts": FILE });
    expect(tail.findings).toEqual([]); // window [5-5..5+5] clamped → includes line 3
  });

  it("no identifier spans on the doc line → no advisory", () => {
    const r = run("just `lib/p.ts:1` alone\n", { "lib/p.ts": FILE });
    expect(r.findings).toEqual([]);
  });

  it("citation with a hard finding gets NO proximity advisory", () => {
    const r = run("see `nopeSym` at `zzz/gone.ts:1`\n", { "lib/p.ts": FILE });
    expect(codes(r)).toEqual(["CITATION_FILE_MISSING"]);
  });
});

describe("checkCitations — output population", () => {
  it("candidateSpans includes malformed spans; resolvedPaths is the exact determinate list", () => {
    const r = run("`:22` and `lib/a.ts:1` and `some words`\n", { "lib/a.ts": "x\n" });
    expect(r.candidateSpans.map((s) => s.content)).toEqual([":22", "lib/a.ts:1"]);
    expect(r.resolvedPaths).toEqual(["lib/a.ts"]);
    expect(codes(r)).toEqual(["CITATION_MALFORMED"]);
  });
});
