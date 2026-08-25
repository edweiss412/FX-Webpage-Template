import { describe, expect, it } from "vitest";

import { renderText, runCli, type CliDeps } from "../../scripts/spec-lint";
import { premiseHolds } from "../_shared/premise";
import { memSpliceSeam } from "./_memSpliceSeam";

const DOC = "docs/superpowers/plans/x.md";

/** A declared table whose one row's command cell is prose. */
const PROSE_CELL = [
  "# x",
  "",
  "<!-- ac-coverage: command-col=3 -->",
  "",
  "| AC | Proved by | Producing command |",
  "| --- | --- | --- |",
  "| AC-1 | Task 2 | both red commands above |",
  "",
].join("\n");

/** The same table with a runnable command. */
const CLEAN = PROSE_CELL.replace("both red commands above", "`pnpm vitest run tests/a.test.ts`");

function deps(text: string, spawnStatus = 0): CliDeps {
  return {
    cwd: () => "/repo",
    repoRoot: () => "/repo",
    listTrackedFiles: () => ["tests/a.test.ts"],
    // The CLI resolves the doc against the repo root, so these match on the
    // suffix rather than on the argv string.
    lstatKind: (p) => (p.endsWith(DOC) ? "file" : "missing"),
    readFileBytes: (p) => {
      if (!p.endsWith(DOC)) {
        const e = new Error("ENOENT") as Error & { code?: string };
        e.code = "ENOENT";
        throw e;
      }
      return Buffer.from(text, "utf8");
    },
    realpath: (p) => p,
    repairDiff: () => {
      throw new Error("repairDiff: not expected in this suite");
    },
    spawn: () => ({ status: spawnStatus, signal: null, stderr: "", stdout: "" }),
    ...memSpliceSeam(),
  };
}

describe("acCoverage — reaches the CLI's report and its exit code", () => {
  it("renders the finding AND exits 1 on a declared table with a prose command cell", () => {
    const r = runCli([DOC], deps(PROSE_CELL));
    premiseHolds("the CLI produced a result rather than a usage error", r.exitCode !== 2);

    // BOTH halves. `claimSweep` once shipped complete, tested and scored while
    // every one of its findings was filtered out of the rendered report before
    // reaching a human (lib/specLint/types.ts:12-33), so asserting the exit code
    // alone would not notice the same defect here.
    expect(r.stdout).toContain("AC_COMMAND_CELL_NOT_RUNNABLE");
    expect(r.stdout).toContain("acCoverage:");
    expect(r.exitCode).toBe(1);
  });

  it("says nothing and exits 0 when the same table carries a command", () => {
    const r = runCli([DOC], deps(CLEAN));
    premiseHolds(
      "the clean fixture really is the planted one, minus the plant",
      CLEAN !== PROSE_CELL,
    );
    expect(r.stdout).not.toContain("acCoverage:");
    expect(r.exitCode).toBe(0);
  });

  it("groups acCoverage findings under their own heading in the rendered report", () => {
    const out = renderText({
      doc: DOC,
      kind: "plan",
      kindSource: "inferred",
      findings: [
        {
          check: "acCoverage",
          code: "AC_COMMAND_CELL_NOT_RUNNABLE",
          severity: "fail",
          docLine: 7,
          column: 1,
          message: "command cell carries no command",
        },
      ],
      inventory: [],
    });
    expect(out).toContain("acCoverage:");
    expect(out).toContain("AC_COMMAND_CELL_NOT_RUNNABLE");
  });
});
