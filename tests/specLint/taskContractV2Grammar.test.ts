import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { premise, premiseHolds } from "../_shared/premise";
import { parseDoc } from "../../lib/specLint/parse";
import {
  checkTaskContract,
  parseMarker,
  taskTopology,
  MARKER_ANY,
  type ParsedMarker,
} from "../../lib/specLint/taskContract";

/**
 * The widened region + marker grammar (spec §4.1-§4.2) and the two exports the
 * redContract module consumes. `taskContract.ts` stays the ONLY owner of marker
 * and region recognition (spec §5 one-grammar-one-owner), so every recognition
 * assertion in the arm lives here.
 *
 * The v2 fields are legal on any marker anywhere: this suite pins the GRAMMAR.
 * Their required PRESENCE inside `red-contract` regions is the redContract
 * module's suite.
 */

const OPEN = "<!-- tasks: depth=2 -->";
const OPEN_RC = "<!-- tasks: depth=2 red-contract -->";
const END = "<!-- tasks: end -->";
const doc = (...lines: string[]) => lines.join("\n");

const codes = (text: string): string[] =>
  checkTaskContract(parseDoc(text), "plan")
    .map((f) => f.code)
    .sort();

/** One task, its marker under test, with `AC-1` resolvable in the prose. */
const withMarker = (marker: string, open = OPEN, prose = "AC-1 here.") =>
  doc(open, "## A", marker, prose, END);

const parsed = (line: string): ParsedMarker => {
  const r = parseMarker(line, 1);
  expect(r).not.toBe("malformed");
  expect(r).not.toBeNull();
  return r as ParsedMarker;
};

describe("region grammar — the optional red-contract attribute (spec §4.1)", () => {
  it("the bare depth form is unchanged and is NOT a red-contract region", () => {
    expect(codes(withMarker("<!-- task: red=`pnpm test` ac=AC-1 -->"))).toEqual([]);
    const topo = taskTopology(parseDoc(withMarker("<!-- task: red=`pnpm test` ac=AC-1 -->")));
    expect(topo.regions).toEqual([{ depth: 2, start: 1, end: 5, redContract: false }]);
    expect(topo.extents).toEqual([{ start: 2, end: 5, redContract: false }]);
  });

  it("the red-contract attribute enrolls the region and flags its extents", () => {
    const text = withMarker("<!-- task: red=`pnpm test` ac=AC-1 -->", OPEN_RC);
    expect(codes(text)).toEqual([]);
    const topo = taskTopology(parseDoc(text));
    expect(topo.regions).toEqual([{ depth: 2, start: 1, end: 5, redContract: true }]);
    expect(topo.extents).toEqual([{ start: 2, end: 5, redContract: true }]);
    expect([...topo.owned.entries()]).toEqual([[2, [3]]]);
    expect(topo.orphaned).toEqual([]);
  });

  it.each([
    "<!-- tasks: depth=2 red-contract=1 -->",
    "<!-- tasks: depth=2 redcontract -->",
    "<!-- tasks: depth=2 red-contracts -->",
    "<!-- tasks: depth=2 RED-CONTRACT -->",
    "<!-- tasks: red-contract depth=2 -->",
    "<!-- tasks: depth=2  red-contract -->",
  ])("a near-miss attribute line stays TASK_ENROLL_MALFORMED: %s", (open) => {
    expect(codes(doc(open, "## A"))).toEqual(["TASK_ENROLL_MALFORMED"]);
  });

  it("a mixed plan carries one bare region and one red-contract region, in order", () => {
    const text = doc(
      OPEN,
      "## A",
      "<!-- task: red=`pnpm test` ac=AC-1 -->",
      "AC-1 here.",
      END,
      OPEN_RC,
      "## B",
      "<!-- task: red=`pnpm test` red-state=live why=`x` ac=AC-1 -->",
      END,
    );
    expect(codes(text)).toEqual([]);
    expect(taskTopology(parseDoc(text)).regions.map((r) => r.redContract)).toEqual([false, true]);
    expect(taskTopology(parseDoc(text)).extents.map((e) => e.redContract)).toEqual([false, true]);
  });

  it("an orphaned marker is reported by the topology as well as the checker", () => {
    const text = doc(OPEN_RC, "## A", "<!-- task: red=`x` ac=AC-1 -->", "AC-1 here.", END, "");
    const withOrphan = doc(
      OPEN_RC,
      "## A",
      "<!-- task: red=`x` ac=AC-1 -->",
      "AC-1 here.",
      END,
      "<!-- task: red=`y` ac=AC-1 -->",
    );
    expect(taskTopology(parseDoc(text)).orphaned).toEqual([]);
    expect(taskTopology(parseDoc(withOrphan)).orphaned).toEqual([6]);
    expect(codes(withOrphan)).toEqual(["TASK_MARKER_ORPHANED"]);
  });
});

describe("marker grammar — v2 fields are legal on any marker (spec §4.2)", () => {
  it.each([
    "<!-- task: red=`pnpm test` red-state=live ac=AC-1 -->",
    "<!-- task: red=`pnpm test` red-state=authored ac=AC-1 -->",
    "<!-- task: red=`pnpm test` red-target=`lib/a.ts:3` ac=AC-1 -->",
    "<!-- task: red=`pnpm test` why=`the guard does not exist yet` ac=AC-1 -->",
    "<!-- task: red=`pnpm test` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->",
    "<!-- task: red=`pnpm test` red-state=live why=`w` ac=AC-1,AC-2 -->",
  ])("well-formed v2 marker draws no grammar finding: %s", (marker) => {
    expect(codes(withMarker(marker, OPEN_RC, "AC-1 and AC-2 here."))).toEqual([]);
    expect(parseMarker(marker, 1)).not.toBe("malformed");
  });

  it.each([
    ["reordered fields", "<!-- task: red=`x` why=`w` red-state=live ac=AC-1 -->"],
    ["ac before the optional fields", "<!-- task: red=`x` ac=AC-1 red-state=live -->"],
    ["double space between fields", "<!-- task: red=`x`  red-state=live ac=AC-1 -->"],
    ["tab between fields", "<!-- task: red=`x`\tred-state=live ac=AC-1 -->"],
    ["invalid red-state literal", "<!-- task: red=`x` red-state=liv ac=AC-1 -->"],
    ["red-state quoted", "<!-- task: red=`x` red-state=`live` ac=AC-1 -->"],
    ["unbackticked red-target", "<!-- task: red=`x` red-target=lib/a.ts:3 ac=AC-1 -->"],
    ["unknown v2-looking field", "<!-- task: red=`x` red-reason=`w` ac=AC-1 -->"],
    ["repeated red-state", "<!-- task: red=`x` red-state=live red-state=live ac=AC-1 -->"],
  ])("%s is TASK_MARKER_MALFORMED, and parseMarker says so too", (_label, marker) => {
    expect(codes(withMarker(marker, OPEN_RC))).toEqual(["TASK_MARKER_MALFORMED"]);
    expect(parseMarker(marker, 1)).toBe("malformed");
  });

  it("v1 semantics survive on the v2 form: empty red, absent ac, and their precedence", () => {
    expect(codes(withMarker("<!-- task: red=`` red-state=live ac=AC-1 -->", OPEN_RC))).toEqual([
      "TASK_RED_EMPTY",
    ]);
    expect(codes(withMarker("<!-- task: red=`  ` red-state=live ac=AC-1 -->", OPEN_RC))).toEqual([
      "TASK_RED_EMPTY",
    ]);
    expect(codes(withMarker("<!-- task: red=`x` red-state=live why=`w` -->", OPEN_RC))).toEqual([
      "TASK_AC_MISSING",
    ]);
    expect(codes(withMarker("<!-- task: red=`x` red-state=live ac= -->", OPEN_RC))).toEqual([
      "TASK_AC_MISSING",
    ]);
    // Double defect: precedence rule 2 needs an OTHERWISE well-formed marker.
    expect(codes(withMarker("<!-- task: red=`` red-state=live why=`w` -->", OPEN_RC))).toEqual([
      "TASK_MARKER_MALFORMED",
    ]);
  });

  it("v2 ac ids still resolve, with the self-resolution exclusion intact", () => {
    // The only occurrence of AC-9 is the marker itself → unresolved.
    expect(
      codes(doc(OPEN_RC, "## A", "<!-- task: red=`x` red-state=live ac=AC-9 -->", "prose", END)),
    ).toEqual(["TASK_AC_UNRESOLVED"]);
  });

  it("v2 markers count for cardinality: two in one extent is a duplicate", () => {
    expect(
      codes(
        doc(
          OPEN_RC,
          "## A",
          "<!-- task: red=`x` red-state=live ac=AC-1 -->",
          "<!-- task: red=`y` red-state=live ac=AC-1 -->",
          "AC-1 here.",
          END,
        ),
      ),
    ).toEqual(["TASK_MARKER_DUPLICATE"]);
  });

  it("a marker-shaped line inside a fence is still inert", () => {
    expect(
      codes(
        doc(
          OPEN_RC,
          "## A",
          "```",
          "<!-- task: red=`x` red-state=live ac=AC-1 -->",
          "```",
          "AC-1 here.",
          END,
        ),
      ),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });
});

describe("parseMarker — the structured parse redContract consumes", () => {
  it("returns null for a line that is not marker-shaped", () => {
    expect(parseMarker("plain prose", 4)).toBeNull();
    expect(parseMarker("<!-- tasks: depth=2 -->", 4)).toBeNull();
  });

  it("a v1 marker parses with every v2 field null", () => {
    const p = parsed("<!-- task: red=`pnpm test` ac=AC-1,AC-2 -->");
    expect(p).toEqual({
      line: 1,
      red: "pnpm test",
      redState: null,
      redTarget: null,
      why: null,
      acRaw: "AC-1,AC-2",
    });
  });

  it("captures every v2 field, with the red-target column counted from the line", () => {
    const line =
      "<!-- task: red=`pnpm test` red-state=authored red-target=`lib/a.ts:3` why=`w` ac=AC-1 -->";
    const p = parsed(line);
    // Derived from the line, not pasted: the capture starts one character past
    // the opening backtick of the red-target field.
    const expectedColumn = line.indexOf("red-target=`") + "red-target=`".length + 1;
    expect(p.redState).toBe("authored");
    expect(p.redTarget).toEqual({ raw: "lib/a.ts:3", column: expectedColumn });
    expect(p.why).toBe("w");
    expect(p.acRaw).toBe("AC-1");
    expect(line.slice(expectedColumn - 1, expectedColumn - 1 + "lib/a.ts:3".length)).toBe(
      "lib/a.ts:3",
    );
  });

  it("blank captures are returned RAW — blankness is semantic, not a grammar rejection", () => {
    const p = parsed("<!-- task: red=`x` red-target=`` why=`` ac=AC-1 -->");
    expect(p.redTarget?.raw).toBe("");
    expect(p.why).toBe("");
    const q = parsed("<!-- task: red=`x` red-target=`  ` why=`   ` ac=AC-1 -->");
    expect(q.redTarget?.raw).toBe("  ");
    expect(q.why).toBe("   ");
  });

  it("a marker with an absent ac list parses with acRaw null rather than malformed", () => {
    const p = parsed("<!-- task: red=`x` red-state=live -->");
    expect(p.acRaw).toBeNull();
    expect(p.redState).toBe("live");
    expect(parsed("<!-- task: red=`x` ac= -->").acRaw).toBeNull();
  });

  it("MARKER_ANY is exported and recognises exactly the marker-shaped prefix", () => {
    expect(MARKER_ANY.test("<!-- task: anything at all")).toBe(true);
    expect(MARKER_ANY.test("   <!-- task: indented up to three spaces -->")).toBe(true);
    expect(MARKER_ANY.test("    <!-- task: four spaces is not a marker -->")).toBe(false);
    expect(MARKER_ANY.test("<!-- tasks: depth=2 -->")).toBe(false);
  });
});

describe("legacy corpus — v1 plans relint byte-identically (AC-4)", () => {
  const DIR = join(process.cwd(), "tests/specLint/fixtures/legacyPlans");
  const SNAPSHOT = JSON.parse(
    readFileSync(join(DIR, "taskContractFindings.json"), "utf8"),
  ) as Record<string, unknown[]>;
  const FIXTURES = ["libdata-call-boundary-metatest.md", "promote-identity-validation.md"];

  it.each(FIXTURES)("%s produces exactly the findings the shipped checker produced", (name) => {
    const text = readFileSync(join(DIR, name), "utf8");
    const model = parseDoc(text);

    // Premise: the fixture must actually reach the checker's marker machinery,
    // or "no findings" would prove nothing about the grammar. Both counts come
    // from the fixture file itself.
    const markerLines = model.lines.filter((l) => MARKER_ANY.test(l)).length;
    premise(`${name} carries task markers`, markerLines, 0);
    premiseHolds(
      `${name} opens a task region`,
      model.lines.some((l) => /^ {0,3}<!-- tasks: depth=/.test(l)),
    );

    expect(checkTaskContract(model, "plan")).toEqual(SNAPSHOT[name]);
  });

  it.each(FIXTURES)("%s: the snapshot discriminates — a corrupted marker still reds", (name) => {
    // A clean legacy plan snapshots to zero findings, so equality alone would
    // also pass against a checker that emitted nothing at all. Corrupting one
    // marker of the same fixture proves the pipeline is live on THESE bytes.
    const text = readFileSync(join(DIR, name), "utf8");
    const lines = text.split("\n");
    const markerIdx = lines.findIndex((l) => MARKER_ANY.test(l));
    premise(`${name} has a marker to corrupt`, markerIdx + 1, 0);
    // The ids this marker CLAIMED. Stripping `ac=` does not only malform the
    // marker: any of these the plan declares in its own body is now claimed by
    // nothing, so `TASK_AC_UNCLAIMED` follows from the same corruption. Derived
    // from the fixture's own bytes rather than listed, so the assertion below
    // stays exact across every fixture instead of being loosened to a
    // containment check.
    const stripped = / ac=([^ ]+) /.exec(lines[markerIdx]!)?.[1]?.split(",") ?? [];
    lines[markerIdx] = lines[markerIdx]!.replace(/ ac=[^ ]+ /, " ");

    const found = checkTaskContract(parseDoc(lines.join("\n")), "plan");
    expect(found.filter((f) => f.code !== "TASK_AC_UNCLAIMED")).toEqual([
      expect.objectContaining({ code: "TASK_AC_MISSING", docLine: markerIdx + 1 }),
    ]);
    // Every remaining finding is an id the corruption orphaned, and no other.
    for (const f of found.filter((x) => x.code === "TASK_AC_UNCLAIMED")) {
      const id = /`(AC-[^`]+)`/.exec(f.message)?.[1] ?? "";
      expect(`${name} orphaned ${id}: ${stripped.includes(id)}`).toBe(
        `${name} orphaned ${id}: true`,
      );
    }
  });
});
