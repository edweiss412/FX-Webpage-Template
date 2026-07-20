import { describe, expect, it } from "vitest";
import { splitLines } from "../../lib/specLint/parse";
import { exitCodeForResult, runLint } from "../../lib/specLint/run";
import type { FileResolver, LintDoc } from "../../lib/specLint/types";

function resolver(files: Record<string, string | null>): FileResolver {
  return {
    listTrackedFiles: () => Object.keys(files),
    readFileLines: (p) => {
      const c = files[p];
      return c === null || c === undefined ? null : splitLines(c);
    },
  };
}

function lint(
  text: string,
  files: Record<string, string | null> = {},
  kind: "spec" | "plan" = "plan",
) {
  const doc: LintDoc = { text, repoRelPath: "docs/x.md", kind, kindSource: "explicit" };
  return runLint(doc, resolver(files));
}

const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

describe("runLint — waiver application (spec §3)", () => {
  it("ignore suppresses the next line's hard finding; waiver is used", () => {
    const r = lint("<!-- spec-lint: ignore — known missing -->\n`zzz/gone.ts:1`\n");
    expect(codes(r)).toEqual([]);
  });

  it("ignore does NOT suppress advisories — and goes unused", () => {
    const r = lint('<!-- spec-lint: ignore — nope -->\nsay "it\'s here" ok\n');
    expect(codes(r).sort()).toEqual(["COPY_STRAIGHT_APOSTROPHE", "WAIVER_UNUSED"]);
  });

  it("empty-reason waiver's own finding survives a preceding ignore", () => {
    const r = lint("<!-- spec-lint: ignore — r -->\n<!-- spec-lint: ignore — -->\nx\n");
    expect(codes(r).sort()).toEqual(["WAIVER_MISSING_REASON", "WAIVER_UNUSED"]);
  });

  it("fence-opener waiver suppresses hard findings on DISTINCT fence lines", () => {
    const r = lint(
      ["<!-- spec-lint: ignore — demo dashes -->", "```ts", "a — b", "c — d", "```", ""].join("\n"),
    );
    expect(codes(r)).toEqual([]);
  });

  it("blank-separated ignore/not-ui/ignore sandwich shares one target — all used", () => {
    const r = lint(
      [
        "<!-- spec-lint: ignore — a -->",
        "",
        "<!-- spec-lint: not-ui — why -->",
        "<!-- spec-lint: ignore — b -->",
        "`zzz/gone.ts:1`",
        "",
      ].join("\n"),
    );
    expect(codes(r)).toEqual([]);
  });

  it("unused stack → one WAIVER_UNUSED per ignore", () => {
    const r = lint(
      ["<!-- spec-lint: ignore — a -->", "<!-- spec-lint: ignore — b -->", "clean line", ""].join(
        "\n",
      ),
    );
    expect(codes(r)).toEqual(["WAIVER_UNUSED", "WAIVER_UNUSED"]);
  });

  it("terminal ignore (EOF stack, no target) is unused", () => {
    expect(codes(lint("x\n<!-- spec-lint: ignore — tail -->\n"))).toEqual(["WAIVER_UNUSED"]);
    expect(codes(lint("x\n<!-- spec-lint: ignore — tail -->\n\n\n"))).toEqual(["WAIVER_UNUSED"]);
  });

  it("EOF ignore/blank/not-ui stack: ignore unused, not-ui still disables UI checks", () => {
    const r = lint(
      [
        "## Resolved scope",
        "cite `components/X.tsx:1` here",
        "<!-- spec-lint: ignore — tail -->",
        "",
        "<!-- spec-lint: not-ui — doc-global -->",
        "",
      ].join("\n"),
      { "components/X.tsx": "line\n" },
      "spec",
    );
    expect(codes(r)).toEqual(["WAIVER_UNUSED"]); // no SECTION_MISSING_* — not-ui active
  });

  it("duplicate not-ui waivers → first active, second WAIVER_UNUSED", () => {
    const r = lint(
      [
        "## Resolved scope",
        "cite `components/X.tsx:1` here",
        "<!-- spec-lint: not-ui — first -->",
        "<!-- spec-lint: not-ui — second -->",
        "x",
        "",
      ].join("\n"),
      { "components/X.tsx": "line\n" },
      "spec",
    );
    expect(codes(r)).toEqual(["WAIVER_UNUSED"]);
  });
});

describe("runLint — ordering + identity (spec §7)", () => {
  it("findings sorted by (check order, docLine, column, code); tuples unique", () => {
    const r = lint('bad "x — y" copy\n`zzz/gone.ts:1`\n', {}, "spec");
    expect(codes(r)).toEqual([
      "CITATION_FILE_MISSING", // citations (line 2) before copy (line 1): check order dominates
      "COPY_EM_DASH",
      "SECTION_MISSING_RESOLVED_SCOPE",
    ]);
    const tuples = r.findings.map((f) => `${f.check}|${f.docLine}|${f.column}|${f.code}`);
    expect(new Set(tuples).size).toBe(tuples.length);
  });

  it("hard finding after a leading emoji reports the UTF-16 column", () => {
    const r = lint('💥 "a — b"\n');
    expect(r.findings).toEqual([
      expect.objectContaining({ code: "COPY_EM_DASH", docLine: 1, column: 7 }),
    ]);
  });

  it("doc identity copied verbatim", () => {
    const r = lint("clean\n");
    expect(r.doc).toBe("docs/x.md");
    expect(r.kind).toBe("plan");
    expect(r.kindSource).toBe("explicit");
  });
});

describe("runLint — cross-checker plumbing", () => {
  it("numeric inside a malformed citation span produces NO inventory occurrence", () => {
    const r = lint("`x.ts:0` alone\n");
    expect(codes(r)).toEqual(["CITATION_MALFORMED"]);
    expect(r.inventory).toEqual([]);
  });

  it("resolved components/ citation triggers UI section findings (resolvedPaths plumbed)", () => {
    const r = lint(
      "## Resolved scope\ncite `components/X.tsx:1` here\n",
      { "components/X.tsx": "line\n" },
      "spec",
    );
    expect(codes(r).sort()).toEqual([
      "SECTION_MISSING_DIMENSIONAL_INVARIANTS",
      "SECTION_MISSING_TRANSITION_INVENTORY",
    ]);
  });
});

describe("exitCodeForResult", () => {
  it("advisories only → 0; any fail → 1; clean → 0", () => {
    expect(exitCodeForResult(lint('say "it\'s x" ok\n'))).toBe(0);
    expect(exitCodeForResult(lint("`zzz/gone.ts:1`\n"))).toBe(1);
    expect(exitCodeForResult(lint("clean\n"))).toBe(0);
  });
});
