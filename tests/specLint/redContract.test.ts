import { describe, expect, it } from "vitest";
import { parseDoc, splitLines } from "../../lib/specLint/parse";
import {
  checkRedContract,
  collectionProbePlan,
  deriveCollectionProbe,
  parseCheckPlan,
  planExecutions,
  redTargetSpans,
} from "../../lib/specLint/redContract";
import type { FileResolver, Finding } from "../../lib/specLint/types";

/**
 * The red-contract static checks (spec §4.3), the same-extent advisories
 * (§4.5), gate markers (§4.6) and the execution PLAN (§4.4's population).
 *
 * Two scopes are pinned separately and deliberately (spec §1.1 item 7):
 * PRESENCE requirements bind only inside `red-contract` regions, while
 * `RED_TARGET_INVALID` binds on every well-formed v2 marker of a plan-kind doc
 * that carries the field — because the citation pass no longer sees that span
 * and this validation is its whole replacement.
 */

const OPEN = "<!-- tasks: depth=2 -->";
const OPEN_RC = "<!-- tasks: depth=2 red-contract -->";
const END = "<!-- tasks: end -->";
const doc = (...lines: string[]) => lines.join("\n");

const FILES: Record<string, string | null> = {
  "lib/a.ts": "one\ntwo\nthree\n",
  "lib/dead.ts": null,
  "lib/old.ts": "retired\n",
};

const resolver = (files: Record<string, string | null> = FILES): FileResolver => ({
  listTrackedFiles: () => Object.keys(files),
  readFileLines: (p) => {
    const c = files[p];
    return c === null || c === undefined ? null : splitLines(c);
  },
});

const check = (
  text: string,
  kind: "spec" | "plan" = "plan",
  files: Record<string, string | null> = FILES,
): Finding[] => checkRedContract(parseDoc(text), kind, resolver(files));

const codes = (text: string, kind: "spec" | "plan" = "plan"): string[] =>
  check(text, kind)
    .map((f) => f.code)
    .sort();

/** One task in a region, its marker under test. */
const inRegion = (marker: string, open = OPEN_RC, ...extra: string[]) =>
  doc(open, "## A", marker, "AC-1 here.", ...extra, END);

const targetColumn = (line: string): number =>
  line.indexOf("red-target=`") + "red-target=`".length + 1;

describe("presence checks bind only inside red-contract regions (spec §4.3)", () => {
  it("a v1 marker inside a contract region draws exactly the two presence codes", () => {
    const marker = "<!-- task: red=`pnpm test` ac=AC-1 -->";
    expect(check(inRegion(marker))).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_STATE_MISSING",
        severity: "fail",
        docLine: 3,
        column: 1,
      }),
      expect.objectContaining({
        check: "taskContract",
        code: "RED_WHY_MISSING",
        severity: "fail",
        docLine: 3,
        column: 1,
      }),
    ]);
  });

  it("the same v1 marker in a BARE region draws nothing at all", () => {
    const marker = "<!-- task: red=`pnpm test` ac=AC-1 -->";
    expect(check(inRegion(marker, OPEN))).toEqual([]);
  });

  it("`authored` without a red-target is RED_TARGET_MISSING; `live` without one is fine", () => {
    expect(
      check(inRegion("<!-- task: red=`pnpm test` red-state=authored why=`w` ac=AC-1 -->")),
    ).toEqual([
      expect.objectContaining({
        code: "RED_TARGET_MISSING",
        severity: "fail",
        docLine: 3,
        column: 1,
      }),
    ]);
    expect(
      codes(inRegion("<!-- task: red=`pnpm test` red-state=live why=`w` ac=AC-1 -->")),
    ).toEqual([]);
  });

  it.each([
    ["empty", "<!-- task: red=`pnpm test` red-state=live why=`` ac=AC-1 -->"],
    ["whitespace-only", "<!-- task: red=`pnpm test` red-state=live why=`   ` ac=AC-1 -->"],
  ])("a PRESENT but %s why= is RED_WHY_MISSING, not a grammar rejection", (_label, marker) => {
    expect(codes(inRegion(marker))).toEqual(["RED_WHY_MISSING"]);
  });

  it("a complete marker in a contract region draws nothing", () => {
    expect(
      codes(
        inRegion(
          "<!-- task: red=`pnpm test` red-state=authored red-target=`lib/new.ts` why=`w` ac=AC-1 -->",
        ),
      ),
    ).toEqual([]);
  });

  it("a mixed plan keeps presence checks region-local", () => {
    const text = doc(
      OPEN,
      "## A",
      "<!-- task: red=`pnpm test` ac=AC-1 -->",
      "AC-1 here.",
      END,
      OPEN_RC,
      "## B",
      "<!-- task: red=`pnpm test` ac=AC-1 -->",
      END,
    );
    expect(check(text)).toEqual([
      expect.objectContaining({ code: "RED_STATE_MISSING", docLine: 8 }),
      expect.objectContaining({ code: "RED_WHY_MISSING", docLine: 8 }),
    ]);
  });

  it("checkRedContract is inert for spec-kind docs (spec §8 items 12-13)", () => {
    expect(check(inRegion("<!-- task: red=`pnpm test` ac=AC-1 -->"), "spec")).toEqual([]);
  });
});

describe("RED_TARGET_INVALID is global on plan-kind v2 markers (spec §4.3, review R5)", () => {
  const withTarget = (target: string, open = OPEN_RC) =>
    inRegion(
      `<!-- task: red=\`pnpm test\` red-state=authored red-target=\`${target}\` why=\`w\` ac=AC-1 -->`,
      open,
    );

  it.each([
    ["untracked colon form", "zzz/gone.ts:1"],
    ["unreadable file", "lib/dead.ts:1"],
    ["line beyond EOF", "lib/a.ts:99"],
    ["inverted range", "lib/a.ts:3-2"],
    ["bare-filename shorthand", "a.ts:1"],
    ["invalid coordinates", "lib/a.ts:0"],
    ["path-only target that IS tracked", "lib/a.ts"],
    ["empty capture", ""],
    ["whitespace-only capture", "   "],
    ["not a citation at all", "some prose"],
  ])("%s is RED_TARGET_INVALID, anchored at the capture column", (_label, target) => {
    const text = withTarget(target);
    const markerLine = text.split("\n")[2]!;
    expect(check(text)).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_TARGET_INVALID",
        severity: "fail",
        docLine: 3,
        column: targetColumn(markerLine),
      }),
    ]);
  });

  it.each([
    ["colon form on a tracked in-range line", "lib/a.ts:2"],
    ["colon form on a tracked range", "lib/a.ts:1-3"],
    ["colon form on EXACTLY the last line", "lib/a.ts:3"],
    ["a single-line range with equal endpoints", "lib/a.ts:2-2"],
    ["path-only form naming an absent module", "lib/notYet.ts"],
  ])("%s is VALID and draws nothing", (_label, target) => {
    expect(check(withTarget(target))).toEqual([]);
  });

  it("a range whose START is in range but whose END is past EOF is still invalid", () => {
    // `lib/a.ts` has three lines. Only the end is out of range, so a check that
    // required BOTH ends to be out would pass this silently.
    expect(check(withTarget("lib/a.ts:2-99")).map((f) => f.code)).toEqual(["RED_TARGET_INVALID"]);
  });

  it("the invalid finding carries its repair instruction verbatim", () => {
    const [finding] = check(withTarget("zzz/gone.ts:1"));
    expect(finding?.message).toBe("invalid `red-target=`: cited file not tracked: zzz/gone.ts");
    expect(finding?.detail).toBe(
      "fix the target: a tracked file with an in-range line, or an untracked path for a module the task creates",
    );
  });

  it("a marker on doc LINE 1 is validated like any other", () => {
    // The scan starts at index 0; a scan starting one line in loses the first
    // line of every document.
    const text = "<!-- task: red=`x` red-target=`zzz/gone.ts:1` ac=AC-1 -->\nAC-1 here.";
    expect(check(text)).toEqual([
      expect.objectContaining({ code: "RED_TARGET_INVALID", docLine: 1 }),
    ]);
  });

  it("validity is checked OUTSIDE contract regions too — but only validity", () => {
    // Round 5's case: the citation pass no longer sees this span anywhere in a
    // plan, so the validation must not be region-scoped or the finding is lost.
    const bare = withTarget("zzz/gone.ts:1", OPEN);
    expect(check(bare)).toEqual([
      expect.objectContaining({ code: "RED_TARGET_INVALID", docLine: 3 }),
    ]);
    // ...and a VALID one outside a region draws nothing: validity-global must
    // not become reject-global.
    expect(check(withTarget("lib/a.ts:2", OPEN))).toEqual([]);
  });

  it("a marker outside every region, in a plan with no region at all, is still validated", () => {
    const text = doc("# Plan", "## A", "<!-- task: red=`x` red-target=`zzz/gone.ts:1` ac=AC-1 -->");
    expect(codes(text)).toEqual(["RED_TARGET_INVALID"]);
  });
});

describe("same-extent advisories (spec §4.5)", () => {
  const retiredDoc = (fence: string[], red = "test -f lib/old.ts") =>
    doc(
      OPEN_RC,
      "## A",
      `<!-- task: red=\`${red}\` red-state=live why=\`w\` ac=AC-1 -->`,
      "AC-1 here.",
      ...fence,
      END,
    );

  it("a tracked path in the red command that the SAME extent git-mv's is advisory", () => {
    const findings = check(retiredDoc(["```sh", "git mv lib/old.ts lib/new.ts", "```"]));
    expect(findings).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_TARGET_RETIRED",
        severity: "advisory",
        docLine: 3,
        column: 1,
      }),
    ]);
  });

  it("git rm of the same path is the other shape", () => {
    expect(codes(retiredDoc(["```sh", "git rm lib/old.ts", "```"]))).toEqual([
      "RED_TARGET_RETIRED",
    ]);
  });

  it("a move in a DIFFERENT extent does not fire (probed in review round 3)", () => {
    const text = doc(
      OPEN_RC,
      "## A",
      "<!-- task: red=`test -f lib/old.ts` red-state=live why=`w` ac=AC-1 -->",
      "AC-1 here.",
      "## B",
      "<!-- task: red=`pnpm test` red-state=live why=`w` ac=AC-1 -->",
      "```sh",
      "git mv lib/old.ts lib/new.ts",
      "```",
      END,
    );
    expect(codes(text)).toEqual([]);
  });

  it("a NON-fenced mention of the move does not fire", () => {
    expect(codes(retiredDoc(["Then run git mv lib/old.ts lib/new.ts by hand."]))).toEqual([]);
  });

  it("a flag between `git mv` and its object does not hide the move", () => {
    expect(
      codes(retiredDoc(["```sh", "git mv -f lib/old.ts lib/new.ts", "```"])).length,
    ).toBeGreaterThan(0);
    expect(codes(retiredDoc(["```sh", "git mv -f lib/old.ts lib/new.ts", "```"]))).toEqual([
      "RED_TARGET_RETIRED",
    ]);
  });

  it("two retired paths in one command draw exactly ONE advisory, not one each", () => {
    const findings = check(
      retiredDoc(
        ["```sh", "git mv lib/old.ts lib/new.ts", "git rm lib/a.ts", "```"],
        "test -f lib/old.ts -o -f lib/a.ts",
      ),
    );
    expect(findings.map((f) => f.code)).toEqual(["RED_TARGET_RETIRED"]);
  });

  it("an untracked path token in the red command never fires", () => {
    expect(
      codes(retiredDoc(["```sh", "git mv lib/ghost.ts lib/new.ts", "```"], "test -f lib/ghost.ts")),
    ).toEqual([]);
  });

  it("RED_CONJUNCTION fires on `&&` only, and only inside contract regions", () => {
    const conj = "<!-- task: red=`pnpm a && pnpm b` red-state=live why=`w` ac=AC-1 -->";
    expect(check(inRegion(conj))).toEqual([
      expect.objectContaining({
        code: "RED_CONJUNCTION",
        severity: "advisory",
        docLine: 3,
        column: 1,
      }),
    ]);
    expect(
      codes(inRegion("<!-- task: red=`pnpm a ; pnpm b` red-state=live why=`w` ac=AC-1 -->")),
    ).toEqual([]);
    expect(check(inRegion(conj, OPEN))).toEqual([]);
  });

  it("a marker OUTSIDE every contract extent draws no conjunction advisory", () => {
    // Containment is an AND of two bounds; either bound alone matches almost
    // every line, so an orphaned marker would inherit the first extent's
    // advisories.
    const text = doc(
      OPEN_RC,
      "## A",
      "<!-- task: red=`pnpm one` red-state=live why=`w` ac=AC-1 -->",
      "AC-1 here.",
      END,
      "<!-- task: red=`pnpm a && pnpm b` red-state=live why=`w` ac=AC-1 -->",
    );
    expect(check(text)).toEqual([]);
  });
});

describe("gate markers (spec §4.6)", () => {
  const withGate = (gate: string, kind: "spec" | "plan" = "plan") =>
    check(doc("# Plan", gate, "prose"), kind);

  it("a well-formed gate with a probed note draws nothing", () => {
    expect(
      withGate("<!-- gate: cmd=`pnpm test` probed=`ran against a broken fixture` -->"),
    ).toEqual([]);
  });

  it("a gate with no probed note is GATE_UNPROBED (advisory)", () => {
    expect(withGate("<!-- gate: cmd=`pnpm test` -->")).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "GATE_UNPROBED",
        severity: "advisory",
        docLine: 2,
        column: 1,
      }),
    ]);
  });

  it.each(["", "   "])("a present-but-blank probed=`%s` is still GATE_UNPROBED", (probed) => {
    expect(
      withGate(`<!-- gate: cmd=\`pnpm test\` probed=\`${probed}\` -->`).map((f) => f.code),
    ).toEqual(["GATE_UNPROBED"]);
  });

  it.each(["", "  "])("a blank cmd=`%s` is hard GATE_CMD_EMPTY", (cmd) => {
    const found = withGate(`<!-- gate: cmd=\`${cmd}\` probed=\`p\` -->`);
    expect(found).toEqual([
      expect.objectContaining({ code: "GATE_CMD_EMPTY", severity: "fail", docLine: 2, column: 1 }),
    ]);
  });

  it.each([
    "<!-- gate: pnpm test -->",
    "<!-- gate: cmd=pnpm test -->",
    "<!-- gate: cmd=`pnpm test` probed=p -->",
    "<!-- gate: cmd=`a`  probed=`p` -->",
  ])("a gate-shaped line matching neither form is hard GATE_MALFORMED: %s", (gate) => {
    expect(withGate(gate)).toEqual([
      expect.objectContaining({ code: "GATE_MALFORMED", severity: "fail", docLine: 2, column: 1 }),
    ]);
  });

  it("a gate line indented FOUR spaces is not a gate line", () => {
    // Four spaces is an indented code block in markdown; the recognizer stops
    // at three, exactly like the task-marker forms it sits beside.
    expect(withGate("    <!-- gate: cmd=`` -->")).toEqual([]);
  });

  it("a gate marker on doc LINE 1 is still checked", () => {
    expect(check("<!-- gate: cmd=`pnpm test` -->\nprose")).toEqual([
      expect.objectContaining({ code: "GATE_UNPROBED", docLine: 1, column: 1 }),
    ]);
  });

  it("findings come back in document order, whatever order the checks ran in", () => {
    // Gates are scanned after markers, so an unsorted return would put the
    // line-2 gate finding after the line-5 marker finding.
    const text = doc(
      "# Plan",
      "<!-- gate: cmd=`pnpm ci` -->",
      OPEN_RC,
      "## A",
      "<!-- task: red=`pnpm test` ac=AC-1 -->",
      "AC-1 here.",
      END,
    );
    expect(check(text).map((f) => [f.code, f.docLine])).toEqual([
      ["GATE_UNPROBED", 2],
      ["RED_STATE_MISSING", 5],
      ["RED_WHY_MISSING", 5],
    ]);
  });

  it("gate lines are inert in spec-kind docs and inside fences", () => {
    expect(withGate("<!-- gate: cmd=`pnpm test` -->", "spec")).toEqual([]);
    expect(check(doc("# Plan", "```", "<!-- gate: cmd=`` -->", "```"))).toEqual([]);
  });
});

describe("fenced markers contribute nothing (spec §4.1 conventions)", () => {
  it("a fenced v2 marker draws no findings and no exclusion span", () => {
    const text = doc(
      OPEN_RC,
      "## A",
      "<!-- task: red=`pnpm test` red-state=live why=`w` ac=AC-1 -->",
      "AC-1 here.",
      "```md",
      "<!-- task: red=`x` red-target=`zzz/gone.ts:1` ac=AC-1 -->",
      "```",
      END,
    );
    expect(check(text)).toEqual([]);
    expect([...redTargetSpans(parseDoc(text))]).toEqual([]);
  });
});

describe("redTargetSpans — the span-exclusion coordinates (spec §5)", () => {
  it("keys every well-formed v2 red-target capture, in and out of regions", () => {
    const inside =
      "<!-- task: red=`x` red-state=authored red-target=`lib/new.ts` why=`w` ac=AC-1 -->";
    const outside = "<!-- task: red=`y` red-target=`lib/other.ts` ac=AC-1 -->";
    const text = doc(OPEN_RC, "## A", inside, "AC-1 here.", END, outside);
    expect([...redTargetSpans(parseDoc(text))].sort()).toEqual(
      [`3:${targetColumn(inside)}`, `6:${targetColumn(outside)}`].sort(),
    );
  });

  it("a marker with no red-target, or a malformed marker, contributes no key", () => {
    const text = doc(
      OPEN_RC,
      "## A",
      "<!-- task: red=`x` red-state=live why=`w` ac=AC-1 -->",
      "<!-- task: ac=AC-1 red-target=`lib/a.ts` red=`x` -->",
      END,
    );
    expect([...redTargetSpans(parseDoc(text))]).toEqual([]);
  });
});

describe("planExecutions — the §4.4 execution population", () => {
  it("enumerates live markers owned by contract-region extents, in doc order", () => {
    const text = doc(
      OPEN_RC,
      "## A",
      "<!-- task: red=`pnpm a` red-state=live why=`w` ac=AC-1 -->",
      "AC-1 here.",
      "## B",
      "<!-- task: red=`pnpm b` red-state=live why=`w` ac=AC-1 -->",
      END,
    );
    expect(planExecutions(parseDoc(text))).toEqual([
      { line: 3, command: "pnpm a" },
      { line: 6, command: "pnpm b" },
    ]);
  });

  it.each([
    [
      "authored markers",
      doc(
        OPEN_RC,
        "## A",
        "<!-- task: red=`pnpm a` red-state=authored red-target=`lib/new.ts` why=`w` ac=AC-1 -->",
        "AC-1 here.",
        END,
      ),
    ],
    [
      "live markers in a BARE region",
      doc(OPEN, "## A", "<!-- task: red=`pnpm a` red-state=live why=`w` ac=AC-1 -->", "AC-1.", END),
    ],
    [
      "orphaned live markers",
      doc(
        OPEN_RC,
        "## A",
        "<!-- task: red=`pnpm x` red-state=live why=`w` ac=AC-1 -->",
        "AC-1 here.",
        END,
        "<!-- task: red=`pnpm orphan` red-state=live why=`w` ac=AC-1 -->",
      ),
    ],
    [
      "plans with no region at all",
      doc("# Plan", "## A", "<!-- task: red=`pnpm a` red-state=live why=`w` ac=AC-1 -->"),
    ],
    ["gate commands", doc("# Plan", "<!-- gate: cmd=`pnpm gate` probed=`p` -->")],
    [
      "markers with no red-state",
      doc(OPEN_RC, "## A", "<!-- task: red=`pnpm a` ac=AC-1 -->", "AC-1 here.", END),
    ],
    [
      "live markers whose command is blank",
      doc(OPEN_RC, "## A", "<!-- task: red=`` red-state=live why=`w` ac=AC-1 -->", "AC-1.", END),
    ],
  ])("never enumerates %s", (_label, text) => {
    const plan = planExecutions(parseDoc(text));
    const orphanCase = plan.map((p) => p.command);
    expect(orphanCase).not.toContain("pnpm orphan");
    expect(orphanCase.filter((c) => c !== "pnpm x")).toEqual([]);
  });

  it("a plan with zero live markers plans nothing", () => {
    expect(planExecutions(parseDoc(doc("# Plan", "prose only")))).toEqual([]);
  });
});

/**
 * The parse-capability plan (verdict-capability spec §3). Population is GLOBAL
 * over well-formed markers of a plan-kind doc — v1 and v2, region or not,
 * because a command a shell cannot parse expresses no verdict anywhere — plus
 * every well-formed gate marker's non-empty `cmd=`.
 */
describe("parseCheckPlan", () => {
  it("enumerates non-empty red= (v1 and v2) and gate cmd=, and nothing else", () => {
    const lines = [
      "<!-- tasks: depth=2 red-contract -->",
      "## Task A",
      "<!-- task: red=`echo one` ac=AC-1 -->",
      "AC-1 appears here.",
      "<!-- tasks: end -->",
      "<!-- task: red=`echo two` red-state=live why=`x` ac=AC-1 -->", // outside region: still in plan
      "<!-- task: red=`` ac=AC-1 -->", // empty: excluded
      "<!-- gate: cmd=`echo gate` probed=`yes` -->",
      "```",
      "<!-- task: red=`echo fenced` ac=AC-1 -->", // fenced: inert
      "```",
    ];
    const plan = parseCheckPlan(parseDoc(lines.join("\n")));
    expect(plan).toEqual([
      { line: 3, command: "echo one", source: "red" },
      { line: 6, command: "echo two", source: "red" },
      { line: 8, command: "echo gate", source: "gate" },
    ]);
  });

  it("excludes malformed markers, malformed gate lines, and blank gate commands", () => {
    // Every excluded line is marker- or gate-SHAPED, so an implementation that
    // planned on the shape rather than on a successful parse would enumerate
    // them. The one legal line pins that the fixture is not vacuously empty.
    const lines = [
      "<!-- task: red=`echo bad` ac= -->", // ac= empty: still well-formed (ac-absent form)
      "<!-- task: red=`echo malformed` extra=`x` ac=AC-1 -->", // malformed marker
      "<!-- gate: cmd=echo unquoted -->", // malformed gate: cmd= is not backticked
      "<!-- gate: cmd=`` probed=`p` -->", // blank gate command: excluded
      "<!-- gate: cmd=`   ` probed=`p` -->", // whitespace-only gate command: excluded
      "<!-- task: red=`   ` ac=AC-1 -->", // whitespace-only red: excluded
    ];
    expect(parseCheckPlan(parseDoc(lines.join("\n")))).toEqual([
      { line: 1, command: "echo bad", source: "red" },
    ]);
  });
});

/**
 * Collection-probe derivation (verdict-capability spec §5.1). Everything here
 * is pure: the plan says WHICH probes may run and WHAT text each one is; the
 * adapter alone spawns. Two guarantees are structural rather than behavioral —
 * a declined entry carries no probe text at all (so nothing downstream can
 * spawn it), and an out-of-accept-set command derives no entry whatsoever.
 */

const TRACKED = new Set([
  "tests/a.test.ts",
  "tests/b.test.tsx",
  "lib/plain.ts",
  "tests/dir/nested.test.ts",
]);

const probePlan = (
  text: string,
  tracked: ReadonlySet<string> = TRACKED,
  excludeLines: ReadonlySet<number> = new Set<number>(),
) => collectionProbePlan(parseDoc(text), tracked, excludeLines);

/** One authored marker in a red-contract region, its `red=` under test. */
const authored = (red: string) =>
  inRegion(
    "<!-- task: red=`" + red + "` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->",
  );

/** One live marker in a red-contract region, its `red=` under test. */
const live = (red: string) =>
  inRegion("<!-- task: red=`" + red + "` red-state=live why=`w` ac=AC-1 -->");

const onlyEntry = (text: string, tracked?: ReadonlySet<string>) => {
  const plan = probePlan(text, tracked);
  expect(plan).toHaveLength(1);
  return plan[0]!;
};

describe("collectionProbePlan — vitest-shape recognition (spec §5.1)", () => {
  it.each([
    ["pnpm vitest run tests/a.test.ts", "pnpm vitest list tests/a.test.ts"],
    ["pnpm exec vitest run tests/a.test.ts", "pnpm exec vitest list tests/a.test.ts"],
    ["npx vitest run tests/a.test.ts", "npx vitest list tests/a.test.ts"],
    ["vitest run tests/a.test.ts", "vitest list tests/a.test.ts"],
  ])("recognizes the measured runner spelling %s", (red, probe) => {
    expect(onlyEntry(live(red))).toMatchObject({ line: 3, state: "live", probe });
  });

  it("preserves leading env assignments through the rewrite", () => {
    // The discriminating case in §2.3: a command carrying its own gating env
    // var must probe WITH it, and one missing it must probe without.
    expect(
      onlyEntry(live("VITEST_INCLUDE_MUTATION_HARNESS=1 A=b pnpm vitest run tests/a.test.ts")),
    ).toMatchObject({
      probe: "VITEST_INCLUDE_MUTATION_HARNESS=1 A=b pnpm vitest list tests/a.test.ts",
    });
  });

  it("rewrites the FIRST token pair only, leaving a later literal occurrence byte-identical", () => {
    // Live markers keep their filters intact, so the quoted occurrence rides
    // through. The operator-bearing spelling of this case is unreachable: the
    // compound guard declines it before any rewrite (asserted separately).
    expect(
      onlyEntry(live("pnpm vitest run tests/a.test.ts -t 'runs vitest run twice'")),
    ).toMatchObject({ probe: "pnpm vitest list tests/a.test.ts -t 'runs vitest run twice'" });
  });

  it.each([
    ["a tsx script", "pnpm tsx scripts/x.ts"],
    ["an rg probe", "rg -n foo lib/"],
    ["a package script", "pnpm test:fast"],
    ["a mid-command vitest run under a wrapper", "pnpm heavy pnpm vitest run tests/a.test.ts"],
    ["vitest without run", "pnpm vitest tests/a.test.ts"],
    ["a runner prefix that is not measured", "yarn vitest run tests/a.test.ts"],
  ])("derives no entry at all for %s", (_label, red) => {
    expect(probePlan(live(red))).toEqual([]);
  });
});

describe("collectionProbePlan — probe eligibility and declines (spec §5.1)", () => {
  it.each([
    ["&&", "pnpm vitest run tests/a.test.ts && echo done"],
    ["||", "pnpm vitest run tests/a.test.ts || echo failed"],
    [";", "pnpm vitest run tests/a.test.ts ; echo done"],
    ["|", "pnpm vitest run tests/a.test.ts | tail -1"],
    ["$(", "pnpm vitest run $(ls tests)"],
  ])("declines a command carrying %s, with NO probe text", (token, red) => {
    const entry = onlyEntry(live(red));
    expect(entry).toMatchObject({ line: 3, state: "live", skipped: "compound-command" });
    // Structural, not cosmetic: a derived `vitest list` on a compound command
    // would launch the trailing clauses verbatim.
    expect(Object.prototype.hasOwnProperty.call(entry, "probe")).toBe(false);
    expect((entry as { detail: string }).detail).toContain(token);
  });

  it("over-declines a QUOTED operator deliberately — quotes are not parsed", () => {
    const entry = onlyEntry(live("pnpm vitest run tests/a.test.ts -t 'a || b'"));
    expect(entry).toMatchObject({ skipped: "compound-command" });
    expect(Object.prototype.hasOwnProperty.call(entry, "probe")).toBe(false);
  });

  it("declines a backquote through the per-command derivation", () => {
    // Unreachable through the marker grammar (a `red=` capture is delimited by
    // backticks and cannot contain one), so it is pinned on the function the
    // plan calls rather than on a marker fixture that cannot exist.
    expect(deriveCollectionProbe("pnpm vitest run `ls tests`", "live")).toEqual({
      kind: "skipped",
      skipped: "compound-command",
      detail: expect.stringContaining("`"),
    });
  });
});

describe("collectionProbePlan — the authored name-filter strip (spec §5.1)", () => {
  it.each([
    ["-t 'a b'", "pnpm vitest run tests/a.test.ts -t 'a b'"],
    ['-t "a b"', 'pnpm vitest run tests/a.test.ts -t "a b"'],
    ["-t bare", "pnpm vitest run tests/a.test.ts -t bare"],
    ["--testNamePattern=x", "pnpm vitest run tests/a.test.ts --testNamePattern=x"],
    ["--testNamePattern y", "pnpm vitest run tests/a.test.ts --testNamePattern y"],
    ["-t=x", "pnpm vitest run tests/a.test.ts -t=x"],
  ])("strips %s for an authored marker, leaving every other byte identical", (_label, red) => {
    // The authored case's named test is future by declaration, so a name filter
    // must not mask the file-level question "can this ever collect the suite".
    expect(onlyEntry(authored(red))).toMatchObject({
      state: "authored",
      probe: "pnpm vitest list tests/a.test.ts",
    });
  });

  it("strips a filter sitting between other arguments without disturbing them", () => {
    expect(
      onlyEntry(
        authored("pnpm vitest run tests/a.test.ts -t 'a b' --reporter=dot tests/b.test.tsx"),
      ),
    ).toMatchObject({ probe: "pnpm vitest list tests/a.test.ts --reporter=dot tests/b.test.tsx" });
  });

  it.each([
    ["an attached quoted argument", "pnpm vitest run tests/a.test.ts -t'a b'"],
    ["a filter with no argument at all", "pnpm vitest run tests/a.test.ts -t"],
  ])("declines %s rather than guessing, with NO probe text", (_label, red) => {
    const entry = onlyEntry(authored(red));
    expect(entry).toMatchObject({ state: "authored", skipped: "unstrippable-filter" });
    expect(Object.prototype.hasOwnProperty.call(entry, "probe")).toBe(false);
  });

  it("leaves a LIVE marker's filters intact — live means observable today", () => {
    expect(onlyEntry(live("pnpm vitest run tests/a.test.ts -t 'a b'"))).toMatchObject({
      state: "live",
      probe: "pnpm vitest list tests/a.test.ts -t 'a b'",
    });
  });

  it("does not read a hyphenated non-filter token as a filter", () => {
    expect(onlyEntry(authored("pnpm vitest run tests/a.test.ts --reporter=dot"))).toMatchObject({
      probe: "pnpm vitest list tests/a.test.ts --reporter=dot",
    });
  });
});

describe("collectionProbePlan — population (spec §5.2)", () => {
  it.each([
    [
      "a marker in a bare region",
      doc(
        OPEN,
        "## A",
        "<!-- task: red=`pnpm vitest run tests/a.test.ts` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->",
        "AC-1 here.",
        END,
      ),
    ],
    [
      "an orphaned marker",
      doc(
        OPEN_RC,
        "## A",
        "<!-- task: red=`pnpm vitest run tests/dir/nested.test.ts` red-state=live why=`w` ac=AC-1 -->",
        "AC-1 here.",
        END,
        "<!-- task: red=`pnpm vitest run tests/a.test.ts` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->",
      ),
    ],
    [
      "a plan with no region at all",
      doc(
        "# Plan",
        "<!-- task: red=`pnpm vitest run tests/a.test.ts` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->",
      ),
    ],
  ])("derives nothing — not a probe, not a decline — for %s", (_label, text) => {
    expect(probePlan(text).map((e) => (e as { line: number }).line)).not.toContain(6);
    expect(probePlan(text).filter((e) => (e as { line: number }).line !== 3)).toEqual([]);
  });

  it("declines are ALSO ownership-scoped: a compound authored red outside a region draws nothing", () => {
    expect(
      probePlan(
        doc(
          "# Plan",
          "<!-- task: red=`pnpm vitest run tests/a.test.ts && echo x` red-state=authored red-target=`lib/a.ts` why=`w` ac=AC-1 -->",
        ),
      ),
    ).toEqual([]);
  });

  it("a v1 marker (no red-state) derives no entry", () => {
    expect(
      probePlan(inRegion("<!-- task: red=`pnpm vitest run tests/a.test.ts` ac=AC-1 -->")),
    ).toEqual([]);
  });

  it("a blank red= derives no entry", () => {
    expect(probePlan(live(""))).toEqual([]);
  });

  it("a marker whose line is excluded (parse-failed) derives no entry", () => {
    const text = live("pnpm vitest run tests/a.test.ts");
    expect(probePlan(text)).toHaveLength(1);
    expect(probePlan(text, TRACKED, new Set([3]))).toEqual([]);
  });
});

describe("collectionProbePlan — tracked test-file argument extraction (spec §5.2)", () => {
  it("partitions command tokens by tracked-set membership AND test-file suffix", () => {
    const entry = onlyEntry(
      authored(
        "pnpm vitest run tests/a.test.ts tests/b.test.tsx lib/plain.ts tests/missing.test.ts docs/x.md",
      ),
    );
    // Keyed on MEMBERSHIP, not on spelling: a tracked non-test file and an
    // untracked test file are excluded from `trackedTestArgs` for different
    // reasons, and both directions are asserted.
    expect(entry).toMatchObject({
      trackedTestArgs: ["tests/a.test.ts", "tests/b.test.tsx"],
      untrackedTestArgs: ["tests/missing.test.ts"],
    });
  });

  it("extracts from the ORIGINAL command, so a stripped filter cannot hide a token", () => {
    expect(
      onlyEntry(authored("pnpm vitest run tests/a.test.ts -t 'tests/missing.test.ts'")),
    ).toMatchObject({ trackedTestArgs: ["tests/a.test.ts"], untrackedTestArgs: [] });
  });

  it("a directory selector yields zero test-file tokens of either kind", () => {
    expect(onlyEntry(authored("pnpm vitest run tests/dir"))).toMatchObject({
      trackedTestArgs: [],
      untrackedTestArgs: [],
    });
  });
});

/**
 * The name-filter advisory (verdict-capability spec §4). A no-match `-t`
 * pattern exits 0, so a red carrying one can report green from the moment it is
 * written. Advisory and region-scoped exactly like `RED_CONJUNCTION`: measured
 * legitimate uses exist, so the finding says what to check and the author
 * dispositions it.
 */
describe("RED_TEST_NAME_FILTER (spec §4)", () => {
  it.each([
    ["-t with a quoted pattern", "pnpm vitest run tests/a.test.ts -t 'a b'"],
    ["-t with a bare pattern", "pnpm vitest run tests/a.test.ts -t bare"],
    ["-t=value", "pnpm vitest run tests/a.test.ts -t=bare"],
    ["--testNamePattern with a space", "pnpm vitest run tests/a.test.ts --testNamePattern 'a b'"],
    ["--testNamePattern=value", "pnpm vitest run tests/a.test.ts --testNamePattern=x"],
  ])("fires as an advisory on %s", (_label, red) => {
    const found = check(live(red));
    expect(found).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_TEST_NAME_FILTER",
        severity: "advisory",
        docLine: 3,
        column: 1,
      }),
    ]);
  });

  it.each([
    // Quoted spans are elided before the token match: this is the one place
    // quotes ARE read, because an advisory must be conservative about NOISE
    // while probe eligibility (§5.1) must be conservative about EXECUTION.
    ["a -t inside a quoted pattern", "sh -c \"grep -n 'x -t y' lib/a.ts\""],
    ["a path token that merely ends in -t.ts", "pnpm vitest run tests/foo-t.ts"],
    ["a bare -t.ts argument", "pnpm vitest run -t.ts"],
    ["a longer flag that starts with --testNamePattern", "pnpm vitest run --testNamePatternish x"],
    ["no filter at all", "pnpm vitest run tests/a.test.ts"],
  ])("does not fire on %s", (_label, red) => {
    expect(codes(live(red))).toEqual([]);
  });

  it.each([
    ["a bare region", OPEN],
    ["no region at all", null],
  ])("does not fire outside a red-contract region (%s)", (_label, open) => {
    const marker =
      "<!-- task: red=`pnpm vitest run tests/a.test.ts -t 'a b'` red-state=live why=`w` ac=AC-1 -->";
    const text =
      open === null ? doc("# Plan", "## A", marker, "AC-1 here.") : inRegion(marker, open);
    expect(codes(text)).not.toContain("RED_TEST_NAME_FILTER");
  });

  it("does not fire on a gate command", () => {
    expect(
      codes(
        doc("# Plan", "<!-- gate: cmd=`pnpm vitest run tests/a.test.ts -t 'a b'` probed=`p` -->"),
      ),
    ).not.toContain("RED_TEST_NAME_FILTER");
  });

  it("rides alongside RED_CONJUNCTION rather than replacing it", () => {
    expect(codes(live("pnpm vitest run tests/a.test.ts -t 'a b' && echo done"))).toEqual([
      "RED_CONJUNCTION",
      "RED_TEST_NAME_FILTER",
    ]);
  });
});

describe("planExecutions — the parse-failure exclusion (spec §3)", () => {
  const text = live("pnpm vitest run tests/a.test.ts");

  it("enumerates the live marker when nothing is excluded", () => {
    expect(planExecutions(parseDoc(text))).toEqual([
      { line: 3, command: "pnpm vitest run tests/a.test.ts" },
    ]);
  });

  it("drops a marker whose line the adapter excluded", () => {
    // Executing a command the shell cannot parse observes nothing; executing
    // one whose parseability was never observed is the same gamble.
    expect(planExecutions(parseDoc(text), new Set([3]))).toEqual([]);
  });

  it("excludes only the named line", () => {
    expect(planExecutions(parseDoc(text), new Set([4]))).toHaveLength(1);
  });
});
