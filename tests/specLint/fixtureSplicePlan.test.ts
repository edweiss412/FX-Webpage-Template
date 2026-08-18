import { describe, it, expect } from "vitest";
import { parseDoc } from "@/lib/specLint/parse";
import { spliceFixturePlan } from "@/lib/specLint/fixtureContract";

describe("splice plan (spec §4.1)", () => {
  it("carries block text byte-identically, including blank and trailing-space lines", () => {
    const body = [
      'import { it } from "vitest";',
      "",
      "// trailing space next line",
      "const x = 1;  ",
    ];
    const md = ["# P", "<!-- fixture: why=`w` -->", "```ts", ...body, "```"].join("\n");
    const plan = spliceFixturePlan(parseDoc(md), "plan");
    expect(plan).toHaveLength(1);
    expect(plan[0]!.block).toBe(body.join("\n"));
    expect(plan[0]!.line).toBe(2);
  });

  it("excludes EVERY statically-flagged marker, not only the malformed ones", () => {
    // An attached marker with an empty why= is well-formed enough to attach, so
    // an implementation excluding only FIXTURE_MALFORMED still splices it --
    // running a block whose declaration the linter has already rejected.
    const md = ["# P", "<!-- fixture: why=`` -->", "```ts", "// empty why", "```"].join("\n");
    expect(spliceFixturePlan(parseDoc(md), "plan")).toEqual([]);
  });

  it("excludes statically-flagged markers and preserves doc order among the rest", () => {
    const ok = (n: string) => ["<!-- fixture: why=`" + n + "` -->", "```ts", "// " + n, "```"];
    const md = [
      "# P",
      ...ok("first"),
      "<!-- fixture: why=x -->",
      "```ts",
      "// flagged",
      "```",
      ...ok("last"),
    ].join("\n");
    const plan = spliceFixturePlan(parseDoc(md), "plan");
    expect(plan.map((e) => e.block)).toEqual(["// first", "// last"]);
    expect(plan.map((e) => e.line)).toEqual([...plan.map((e) => e.line)].sort((a, b) => a - b));
  });

  it("splices ALL THREE accepted fence kinds, not just ts", () => {
    // checkFixtureContract's attachment test (Task 1) covers the three kinds,
    // but this is a DIFFERENT export: an implementation that attaches all three
    // and then splices only `ts` passes every Task 1 case while dropping two
    // canonical population members.
    for (const info of ["ts", "tsx", "typescript"]) {
      const md = ["# P", "<!-- fixture: why=`w` -->", "```" + info, "// body", "```"].join("\n");
      const plan = spliceFixturePlan(parseDoc(md), "plan");
      expect(plan, `fence kind ${info}`).toHaveLength(1);
      expect(plan[0]!.block).toBe("// body");
    }
  });

  it("a spec-kind doc yields an empty plan", () => {
    const md = ["# S", "<!-- fixture: why=`w` -->", "```ts", "x", "```"].join("\n");
    expect(spliceFixturePlan(parseDoc(md), "spec")).toEqual([]);
  });
});
describe("splice plan — shapes the authored block leaves unpinned", () => {
  const planOf = (lines: string[]) => spliceFixturePlan(parseDoc(lines.join("\n")), "plan");

  it("an empty fence yields an entry with an empty block, not a dropped one", () => {
    // The marker is attached (fixtureContract.test.ts pins that), so dropping it
    // here would make the two derivations disagree about which blocks are
    // enrolled — and the block would then be checked by nothing at all rather
    // than drawing the advisory execution gives it.
    expect(planOf(["# P", "<!-- fixture: why=`w` -->", "```ts", "```"])).toEqual([
      { line: 2, block: "" },
    ]);
  });

  it("an unclosed fence splices to end of document", () => {
    expect(planOf(["# P", "<!-- fixture: why=`w` -->", "```ts", "// a", "// b"])).toEqual([
      { line: 2, block: "// a\n// b" },
    ]);
  });

  it("the block stops at its OWN closing fence, not at the document's last one", () => {
    // A body read as "everything after the opener" swallows the prose and the
    // second block, and the spliced file then fails to parse for a reason the
    // author never wrote.
    const out = planOf([
      "# P",
      "<!-- fixture: why=`w` -->",
      "```ts",
      "// mine",
      "```",
      "prose between",
      "```bash",
      "echo not mine",
      "```",
    ]);
    expect(out).toEqual([{ line: 2, block: "// mine" }]);
  });

  it("a marker inside a fence contributes no entry", () => {
    expect(
      planOf(["# P", "```md", "<!-- fixture: why=`w` -->", "```ts", "// b", "```", "```"]),
    ).toEqual([]);
  });
});
