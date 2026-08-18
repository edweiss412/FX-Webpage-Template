import { describe, expect, it } from "vitest";
import {
  planExecutionsForText,
  synthesizeExecFindings,
  synthesizeParseFindings,
} from "../../lib/specLint/redContract";
import type { ExecOutcome, ExecResults, ParseResults } from "../../lib/specLint/types";

/**
 * The pure half of `--exec-red` (spec §4.4): the core plans WHICH commands may
 * run and synthesizes findings from outcomes it is HANDED. No subprocess, no
 * runner type, and no function value performing I/O crosses this boundary —
 * which is what keeps `lib/specLint/**` importable without `node:child_process`
 * (spec §5).
 */

const OPEN_RC = "<!-- tasks: depth=2 red-contract -->";
const OPEN = "<!-- tasks: depth=2 -->";
const END = "<!-- tasks: end -->";
const doc = (...lines: string[]) => lines.join("\n") + "\n";

const results = (
  outcomes: Record<number, ExecOutcome>,
  stderrTails: Record<number, string> = {},
): ExecResults => ({
  outcomes: new Map(Object.entries(outcomes).map(([k, v]) => [Number(k), v])),
  stderrTails: new Map(Object.entries(stderrTails).map(([k, v]) => [Number(k), v])),
});

const PLAN = [{ line: 3, command: "pnpm vitest run tests/x.test.ts" }];

describe("synthesizeExecFindings — the §4.4 outcome map", () => {
  it("exit 0 is a HARD RED_ALREADY_GREEN at the marker line", () => {
    expect(synthesizeExecFindings(PLAN, results({ 3: { kind: "exit", code: 0 } }))).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_ALREADY_GREEN",
        severity: "fail",
        docLine: 3,
        column: 1,
      }),
    ]);
  });

  it.each([126, 127])("exit %i is an advisory RED_EXEC_ERROR carrying the stderr tail", (code) => {
    const found = synthesizeExecFindings(
      PLAN,
      results({ 3: { kind: "exit", code } }, { 3: "sh: pnpm: not found" }),
    );
    expect(found).toEqual([
      expect.objectContaining({
        code: "RED_EXEC_ERROR",
        severity: "advisory",
        docLine: 3,
        column: 1,
      }),
    ]);
    expect(found[0]!.detail).toContain(String(code));
    expect(found[0]!.detail).toContain("sh: pnpm: not found");
  });

  it("a timeout is an advisory RED_EXEC_TIMEOUT — redness unverified, not observed", () => {
    expect(synthesizeExecFindings(PLAN, results({ 3: { kind: "timeout" } }))).toEqual([
      expect.objectContaining({
        code: "RED_EXEC_TIMEOUT",
        severity: "advisory",
        docLine: 3,
        column: 1,
      }),
    ]);
  });

  it("a signal death names the signal, and a spawn failure names the message", () => {
    const signalled = synthesizeExecFindings(
      PLAN,
      results({ 3: { kind: "signal", signal: "SIGTERM" } }),
    );
    expect(signalled[0]).toEqual(
      expect.objectContaining({
        code: "RED_EXEC_ERROR",
        severity: "advisory",
        docLine: 3,
        column: 1,
      }),
    );
    expect(signalled[0]!.detail).toContain("SIGTERM");

    const spawnFailed = synthesizeExecFindings(
      PLAN,
      results({ 3: { kind: "spawn-error", message: "spawn sh ENOENT" } }),
    );
    expect(spawnFailed[0]).toEqual(
      expect.objectContaining({ code: "RED_EXEC_ERROR", docLine: 3, column: 1 }),
    );
    expect(spawnFailed[0]!.detail).toContain("spawn sh ENOENT");
    // Classifying either as observed red is the silent corruption §4.4 forbids.
    expect([signalled[0]!.code, spawnFailed[0]!.code]).toEqual([
      "RED_EXEC_ERROR",
      "RED_EXEC_ERROR",
    ]);
  });

  it.each([1, 2, 42, 255])("any other non-zero exit (%i) is red observed — silence", (code) => {
    expect(synthesizeExecFindings(PLAN, results({ 3: { kind: "exit", code } }))).toEqual([]);
  });

  it("a null outcome map (static invocation) synthesizes nothing", () => {
    expect(synthesizeExecFindings(PLAN, null)).toEqual([]);
  });

  it("a planned command with no recorded outcome is skipped rather than guessed", () => {
    expect(synthesizeExecFindings(PLAN, results({}))).toEqual([]);
  });

  it("findings follow the plan's doc order", () => {
    const plan = [
      { line: 3, command: "a" },
      { line: 9, command: "b" },
    ];
    const found = synthesizeExecFindings(
      plan,
      results({ 9: { kind: "exit", code: 0 }, 3: { kind: "timeout" } }),
    );
    expect(found.map((f) => [f.code, f.docLine])).toEqual([
      ["RED_EXEC_TIMEOUT", 3],
      ["RED_ALREADY_GREEN", 9],
    ]);
  });
});

describe("planExecutionsForText — the adapter's pure entry to the §4.4 population", () => {
  it("enumerates live contract-region markers in doc order", () => {
    expect(
      planExecutionsForText(
        doc(
          OPEN_RC,
          "## A",
          "<!-- task: red=`pnpm a` red-state=live why=`w` ac=AC-1 -->",
          "AC-1 here.",
          "## B",
          "<!-- task: red=`pnpm b` red-state=live why=`w` ac=AC-1 -->",
          END,
        ),
      ),
    ).toEqual([
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
        "<!-- task: red=`pnpm never` red-state=authored red-target=`lib/new.ts` why=`w` ac=AC-1 -->",
        "AC-1 here.",
        END,
      ),
    ],
    [
      "live markers in a bare region",
      doc(
        OPEN,
        "## A",
        "<!-- task: red=`pnpm never` red-state=live why=`w` ac=AC-1 -->",
        "AC-1 here.",
        END,
      ),
    ],
    [
      "orphaned live markers",
      doc(
        OPEN_RC,
        "## A",
        "<!-- task: red=`pnpm kept` red-state=live why=`w` ac=AC-1 -->",
        "AC-1 here.",
        END,
        "<!-- task: red=`pnpm never` red-state=live why=`w` ac=AC-1 -->",
      ),
    ],
    [
      "plans with no region",
      doc("# Plan", "## A", "<!-- task: red=`pnpm never` red-state=live why=`w` ac=AC-1 -->"),
    ],
    ["gate commands", doc("# Plan", "<!-- gate: cmd=`pnpm never` probed=`p` -->")],
    [
      "fenced markers",
      doc(
        OPEN_RC,
        "## A",
        "<!-- task: red=`pnpm kept` red-state=live why=`w` ac=AC-1 -->",
        "AC-1 here.",
        "```md",
        "<!-- task: red=`pnpm never` red-state=live why=`w` ac=AC-1 -->",
        "```",
        END,
      ),
    ],
  ])("never enumerates %s", (_label, text) => {
    expect(planExecutionsForText(text).map((p) => p.command)).not.toContain("pnpm never");
  });

  it("a plan with zero live markers plans nothing", () => {
    expect(planExecutionsForText(doc("# Plan", "prose only"))).toEqual([]);
  });
});

/**
 * The parse-capability synthesis (verdict-capability spec §3). Outcomes are
 * HANDED to the core exactly as `--exec-red`'s are; the adapter alone spawns
 * `sh -nc`. Two sources share one plan and one outcome map — a `red=` defect
 * and a gate `cmd=` defect are one grammar apart and must not report as each
 * other.
 */

const parseResults = (
  outcomes: Record<number, ExecOutcome>,
  stderrTails: Record<number, string> = {},
): ParseResults => ({
  outcomes: new Map(Object.entries(outcomes).map(([k, v]) => [Number(k), v])),
  stderrTails: new Map(Object.entries(stderrTails).map(([k, v]) => [Number(k), v])),
});

const RED_ENTRY = { line: 4, command: "pnpm tsx check.ts a:1:2:<><=", source: "red" as const };
const GATE_ENTRY = { line: 9, command: "pnpm heavy pnpm gate >", source: "gate" as const };

describe("synthesizeParseFindings — the §3 parse-capability map", () => {
  it("a non-zero parse exit on a red= is a HARD RED_UNPARSEABLE carrying the stderr tail", () => {
    const found = synthesizeParseFindings(
      [RED_ENTRY],
      parseResults({ 4: { kind: "exit", code: 2 } }, { 4: "sh: -c: line 1: syntax error" }),
    );
    expect(found).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "RED_UNPARSEABLE",
        severity: "fail",
        docLine: 4,
        column: 1,
      }),
    ]);
    expect(found[0]!.detail).toContain("sh: -c: line 1: syntax error");
  });

  it("a non-zero parse exit on a gate cmd= is a HARD GATE_CMD_UNPARSEABLE — never the red code", () => {
    const found = synthesizeParseFindings(
      [GATE_ENTRY],
      parseResults({ 9: { kind: "exit", code: 2 } }),
    );
    expect(found).toEqual([
      expect.objectContaining({
        code: "GATE_CMD_UNPARSEABLE",
        severity: "fail",
        docLine: 9,
        column: 1,
      }),
    ]);
  });

  it("renders at most 200 characters of the tail, whatever length it is handed", () => {
    // Probed live: a 500-character invalid token yields a 581-byte `sh -nc`
    // diagnostic, so the bound discriminates on real input rather than only on
    // a constructed one. The adapter trims too; this pins the RENDERED length,
    // so a defective adapter cannot smuggle an unbounded detail line through.
    const found = synthesizeParseFindings(
      [RED_ENTRY],
      parseResults({ 4: { kind: "exit", code: 2 } }, { 4: "x".repeat(500) }),
    );
    expect(found[0]!.detail).toContain("x".repeat(200));
    expect(found[0]!.detail).not.toContain("x".repeat(201));
  });

  it("exit 0 is a parseable command — silence", () => {
    expect(
      synthesizeParseFindings(
        [RED_ENTRY, GATE_ENTRY],
        parseResults({ 4: { kind: "exit", code: 0 }, 9: { kind: "exit", code: 0 } }),
      ),
    ).toEqual([]);
  });

  it.each([
    ["timeout", { kind: "timeout" } as ExecOutcome, "timeout"],
    ["signal", { kind: "signal", signal: "SIGKILL" } as ExecOutcome, "SIGKILL"],
    [
      "spawn-error",
      { kind: "spawn-error", message: "spawn sh ENOENT" } as ExecOutcome,
      "spawn sh ENOENT",
    ],
  ])(
    "a parse %s is an advisory RED_PROBE_UNVERIFIED naming the probe and the reason",
    (_label, outcome, needle) => {
      const found = synthesizeParseFindings([RED_ENTRY], parseResults({ 4: outcome }));
      expect(found).toEqual([
        expect.objectContaining({
          code: "RED_PROBE_UNVERIFIED",
          severity: "advisory",
          docLine: 4,
          column: 1,
        }),
      ]);
      // Capability UNVERIFIED must never read as either verdict, and the
      // operator must be able to tell WHICH probe and WHY from the detail.
      expect(found[0]!.detail).toContain("parse");
      expect(found[0]!.detail).toContain(needle);
    },
  );

  it("a non-observed parse never reports the hard codes, on either source", () => {
    const found = synthesizeParseFindings(
      [RED_ENTRY, GATE_ENTRY],
      parseResults({ 4: { kind: "timeout" }, 9: { kind: "spawn-error", message: "boom" } }),
    );
    expect(found.map((f) => f.code)).toEqual(["RED_PROBE_UNVERIFIED", "RED_PROBE_UNVERIFIED"]);
  });

  it("a null outcome map (static invocation without the parse pass) synthesizes nothing", () => {
    expect(synthesizeParseFindings([RED_ENTRY, GATE_ENTRY], null)).toEqual([]);
  });

  it("a planned command with no recorded outcome is skipped rather than guessed", () => {
    expect(synthesizeParseFindings([RED_ENTRY], parseResults({}))).toEqual([]);
  });

  it("findings follow the plan's doc order", () => {
    const found = synthesizeParseFindings(
      [RED_ENTRY, GATE_ENTRY],
      parseResults({ 9: { kind: "exit", code: 2 }, 4: { kind: "exit", code: 2 } }),
    );
    expect(found.map((f) => [f.code, f.docLine])).toEqual([
      ["RED_UNPARSEABLE", 4],
      ["GATE_CMD_UNPARSEABLE", 9],
    ]);
  });
});
