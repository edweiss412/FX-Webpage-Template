import { describe, expect, it } from "vitest";
import { runCli, type CliDeps } from "../../scripts/spec-lint";
import { memSpliceSeam } from "./_memSpliceSeam";
import type { LintResult } from "../../lib/specLint/types";

/**
 * Task 3 wiring (spec §4): the `universals` check must reach BOTH renderers. A module
 * that composes correctly in isolation is invisible to a user until `runLint` calls it
 * and `renderText` carries a row for it — this suite is the only place that observes
 * the seam end to end.
 */

const SPEC = "/repo/docs/superpowers/specs/_universals-wiring.md";
const PLAN = "/repo/docs/superpowers/plans/_universals-wiring.md";

/** The E1 claim shape plus an out-of-scope region, so one doc exercises the advisory
 * AND both inventory groups. */
const DOC = [
  "# Universals wiring fixture",
  "",
  // Present so the fixture's ONLY finding is the advisory: an exit code of 0 then
  // means the universals output did not move it, rather than being masked by an
  // unrelated hard finding from another check.
  "## 1.1 Resolved scope — do not relitigate",
  "",
  "The fixture exists to observe the wiring seam.",
  "",
  "## 5. Verification",
  "",
  "### 5.1 The ratio side",
  "",
  "Every one of the 21 swapped sites lands on one of those four.",
  "",
  "## 8. Out of scope",
  "",
  "- Any closing of the wiring-guard bypasses, which this fixture does not need.",
  "",
  "## 9. Census",
  "",
  "The census carries 21 swapped sites, one row each.",
  "",
].join("\n");

function memDeps(files: Record<string, string>): CliDeps {
  return {
    cwd: () => "/repo",
    repoRoot: () => "/repo",
    listTrackedFiles: () => ["lib/a.ts"],
    lstatKind: (p) => (files[p] !== undefined ? "file" : "missing"),
    readFileBytes: (p) => {
      const c = files[p];
      if (c === undefined) {
        const e = new Error("ENOENT") as Error & { code?: string };
        e.code = "ENOENT";
        throw e;
      }
      return Buffer.from(c, "utf8");
    },
    realpath: (p) => p,
    spawn: () => ({ status: 0, signal: null, stdout: "", stderr: "" }),
    ...memSpliceSeam(),
  };
}

const run = (path: string, argv: string[] = []) =>
  runCli([path, ...argv], memDeps({ [path]: DOC }));

const parsed = (path: string): LintResult => JSON.parse(run(path, ["--json"]).stdout) as LintResult;

describe("universals wiring — text render (spec §4)", () => {
  it("the advisory appears under a `universals:` check header", () => {
    const { stdout } = run(SPEC);
    const lines = stdout.split("\n");
    const header = lines.indexOf("universals:");
    expect(header).toBeGreaterThan(-1);
    // Scoped to the rows UNDER that header, so the assertion cannot pass because some
    // other check happened to print the code (anti-tautology).
    const body = lines.slice(header + 1).findIndex((l) => !l.startsWith("  "));
    const rows = lines.slice(header + 1, header + 1 + (body === -1 ? lines.length : body));
    expect(rows.some((l) => l.includes("ADVISORY ENUMERATED_UNIVERSAL_NO_PROBE"))).toBe(true);
  });

  it("both inventory groups appear in the INVENTORY block", () => {
    const { stdout } = run(SPEC);
    const block = stdout.slice(stdout.indexOf("INVENTORY"));
    expect(block).toContain("universal-claims:");
    expect(block).toContain("scope-fences:");
  });

  it("the run stays advisory-only: exit 0 and no `fail` severity from this check", () => {
    // The premise this rests on: the ONLY finding on the fixture is the new advisory.
    // Without it, an exit code of 0 would prove nothing about severity.
    expect(parsed(SPEC).findings.map((f) => f.code)).toEqual(["ENUMERATED_UNIVERSAL_NO_PROBE"]);
    expect(run(SPEC).exitCode).toBe(0);
    const universals = parsed(SPEC).findings.filter((f) => f.check === "universals");
    expect(universals.length).toBeGreaterThan(0);
    expect(universals.every((f) => f.severity === "advisory")).toBe(true);
  });
});

describe("universals wiring — --json (spec §4)", () => {
  it("carries the same findings and groups the text render shows", () => {
    const result = parsed(SPEC);
    expect(result.findings.filter((f) => f.code === "ENUMERATED_UNIVERSAL_NO_PROBE")).toHaveLength(
      1,
    );
    expect(result.inventory.map((g) => g.raw)).toEqual(
      expect.arrayContaining(["universal-claims", "scope-fences"]),
    );
  });

  it("the numeric inventory groups survive alongside the new ones", () => {
    // The new groups CONCATENATE after the numeric ones (spec §4); a wiring that
    // replaced `numerics.inventory` rather than appending would drop them silently.
    const raws = parsed(SPEC).inventory.map((g) => g.raw);
    expect(raws).toContain("21");
    expect(raws.indexOf("21")).toBeLessThan(raws.indexOf("universal-claims"));
  });
});

describe("universals wiring — spec-kind gate at the seam", () => {
  it("the same doc read as a PLAN carries neither the advisory nor the groups", () => {
    const result = parsed(PLAN);
    expect(result.kind).toBe("plan");
    expect(result.findings.filter((f) => f.check === "universals")).toEqual([]);
    expect(result.inventory.map((g) => g.raw)).not.toContain("universal-claims");
    expect(result.inventory.map((g) => g.raw)).not.toContain("scope-fences");
    expect(run(PLAN).stdout).not.toContain("universals:");
  });
});
