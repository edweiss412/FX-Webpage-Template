import { describe, expect, it } from "vitest";
import { planExecutionsForText, synthesizeExecFindings } from "../../lib/specLint/redContract";
import type { ExecOutcome, ExecResults } from "../../lib/specLint/types";

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
