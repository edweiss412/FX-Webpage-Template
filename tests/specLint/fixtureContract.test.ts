import { describe, it, expect } from "vitest";
import { parseDoc } from "@/lib/specLint/parse";
import { checkFixtureContract } from "@/lib/specLint/fixtureContract";

const codes = (md: string, kind: "spec" | "plan" = "plan") =>
  checkFixtureContract(parseDoc(md), kind).map((f) => `${f.code}@${f.docLine}`);

describe("fixture marker grammar (spec §3.1, §3.2)", () => {
  const block = '```ts\nimport { it } from "vitest";\n```';

  it("the declared shape parses clean", () => {
    const md = ["# P", "<!-- fixture: why=`the live matcher opens here` -->", block].join("\n");
    expect(codes(md)).toEqual([]);
  });

  it("every malformation draws FIXTURE_MALFORMED, including the retired expect= field", () => {
    for (const bad of [
      "<!-- fixture: -->",
      "<!-- fixture: why=x -->",
      "<!-- fixture: why=`x` extra=`y` -->",
      "<!-- fixture: why=`x` --> trailing",
      "<!-- fixture: expect=`green` why=`x` -->",
    ]) {
      expect(codes(["# P", bad, block].join("\n"))).toEqual([`FIXTURE_MALFORMED@2`]);
    }
  });

  it("an empty or whitespace why= draws FIXTURE_WHY_EMPTY, not MALFORMED", () => {
    for (const why of ["``", "`   `"]) {
      const md = ["# P", `<!-- fixture: why=${why} -->`, block].join("\n");
      expect(codes(md)).toEqual([`FIXTURE_WHY_EMPTY@2`]);
    }
  });

  it("attachment holds for the three accepted info strings and fails for everything else", () => {
    for (const info of ["ts", "tsx", "typescript"]) {
      const md = ["# P", "<!-- fixture: why=`w` -->", "```" + info, "x", "```"].join("\n");
      expect(codes(md)).toEqual([]);
    }
    for (const next of ["```bash", "```md", "", "ordinary prose"]) {
      const md = ["# P", "<!-- fixture: why=`w` -->", next].join("\n");
      expect(codes(md)).toEqual([`FIXTURE_UNATTACHED@2`]);
    }
    // marker as the final line: no next line at all
    expect(codes(["# P", "<!-- fixture: why=`w` -->"].join("\n"))).toEqual([
      "FIXTURE_UNATTACHED@2",
    ]);
  });

  it("FIXTURE_UNATTACHED names the offending line in its detail", () => {
    // Without this the code is a dead end for the author: every non-attaching
    // shape reports identically and none of them says what was found instead.
    const findingFor = (next: string) =>
      checkFixtureContract(
        parseDoc(["# P", "<!-- fixture: why=`w` -->", next].join("\n")),
        "plan",
      )[0]!;
    expect(findingFor("```bash").detail).toContain("```bash");
    expect(findingFor("ordinary prose").detail).toContain("ordinary prose");
    // and the two must not report the same detail
    expect(findingFor("```bash").detail).not.toBe(findingFor("ordinary prose").detail);
  });

  it("a marker inside a fence is inert, and a spec-kind doc draws nothing", () => {
    const fenced = ["# P", "```md", "<!-- fixture: why=`` -->", "```"].join("\n");
    expect(codes(fenced)).toEqual([]);
    const inSpec = ["# S", "<!-- fixture: why=`` -->", "prose"].join("\n");
    expect(codes(inSpec, "spec")).toEqual([]);
  });
});
describe("fixture marker grammar — shapes the authored block leaves unpinned", () => {
  it("an EMPTY ts fence is still attached", () => {
    // The info string of an empty fence appears on no inside line, so an
    // implementation reading it from the fence BODY reports this attached
    // block as unattached. Emptiness is settled by execution (spec §4.3 —
    // "No test suite found in file" draws the advisory), never by pretending
    // the marker opened no fence.
    const md = ["# P", "<!-- fixture: why=`w` -->", "```ts", "```"].join("\n");
    expect(codes(md)).toEqual([]);
  });

  it("attachment is decided by the info string, not by the delimiter character or its case", () => {
    for (const open of ["~~~ts", "```TS", "```TypeScript", "```ts  "]) {
      const md = [
        "# P",
        "<!-- fixture: why=`w` -->",
        open,
        "// b",
        open.startsWith("~") ? "~~~" : "```",
      ].join("\n");
      expect(codes(md), `opener ${JSON.stringify(open)}`).toEqual([]);
    }
  });

  it("a marker indented up to three spaces is live; four spaces is not a marker", () => {
    const at = (pad: string) =>
      ["# P", `${pad}<!-- fixture: why=x -->`, "```ts", "// b", "```"].join("\n");
    for (const pad of ["", " ", "   "])
      expect(codes(at(pad)), `pad ${pad.length}`).toEqual(["FIXTURE_MALFORMED@2"]);
    // Four spaces is an indented code block in CommonMark, so it is prose here.
    expect(codes(at("    "))).toEqual([]);
  });

  it("each marker draws AT MOST ONE code, in the precedence MALFORMED > WHY_EMPTY > UNATTACHED", () => {
    // Both defects at once. Without a fixed precedence an implementation is
    // free to emit two findings for one marker, which makes the spec §4.1
    // splice exclusion ambiguous about what "the marker's finding" is.
    expect(codes(["# P", "<!-- fixture: why=`` -->", "ordinary prose"].join("\n"))).toEqual([
      "FIXTURE_WHY_EMPTY@2",
    ]);
    expect(codes(["# P", "<!-- fixture: why=x -->", "ordinary prose"].join("\n"))).toEqual([
      "FIXTURE_MALFORMED@2",
    ]);
  });

  it("every marker in a doc is scanned, not just the first", () => {
    // A scan that returns on its first match reports one defect per document
    // and silently blesses the rest.
    const md = [
      "# P",
      "<!-- fixture: why=x -->",
      "```ts",
      "// b",
      "```",
      "<!-- fixture: why=`w` -->",
      "prose",
    ].join("\n");
    expect(codes(md)).toEqual(["FIXTURE_MALFORMED@2", "FIXTURE_UNATTACHED@6"]);
  });

  it("findings are anchored at the marker line, column 1, under check taskContract", () => {
    const md = ["# P", "", "", "<!-- fixture: why=x -->", "```ts", "// b", "```"].join("\n");
    const [f] = checkFixtureContract(parseDoc(md), "plan");
    expect(f!.docLine).toBe(4);
    expect(f!.column).toBe(1);
    expect(f!.check).toBe("taskContract");
    expect(f!.severity).toBe("fail");
  });
});

describe("fixture marker grammar — sites a green suite would otherwise leave free", () => {
  it("a marker on the document's FIRST line is scanned", () => {
    // A scan starting at index 1 skips line 1 entirely, and every other case in
    // this file puts a heading above the marker.
    expect(codes(["<!-- fixture: why=x -->", "```ts", "// b", "```"].join("\n"))).toEqual([
      "FIXTURE_MALFORMED@1",
    ]);
  });

  it("a marker as the LAST line says so, rather than describing a line that is not there", () => {
    // The end-of-document guard and the not-a-fence guard both emit
    // FIXTURE_UNATTACHED, so a code-only assertion cannot tell them apart: an
    // off-by-one there reads `lines[len]` and renders "next line is: undefined".
    const last = checkFixtureContract(
      parseDoc(["# P", "<!-- fixture: why=`w` -->"].join("\n")),
      "plan",
    );
    expect(last.map((f) => f.code)).toEqual(["FIXTURE_UNATTACHED"]);
    expect(last[0]!.detail).toContain("(end of document)");
    expect(last[0]!.detail).not.toContain("undefined");
  });
});
