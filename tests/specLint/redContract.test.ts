import { describe, expect, it } from "vitest";
import { parseDoc, splitLines } from "../../lib/specLint/parse";
import { checkRedContract, planExecutions, redTargetSpans } from "../../lib/specLint/redContract";
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
