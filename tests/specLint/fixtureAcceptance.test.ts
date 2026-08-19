/**
 * Gate A — the acceptance properties no per-unit task reaches (fixture spec
 * §10, plan Gate A).
 *
 * Each is a DERIVED COVER over a set walked from disk, never a sample: the file
 * set comes from `git ls-files`, so a plan added tomorrow is covered without
 * editing this file. And each zero is paired with a POSITIVE CONTROL, because
 * absence is not evidence of carriage — an arm that never fires at all, or one
 * wired to nothing, satisfies every zero in the walk.
 *
 * NOT here, deliberately: AC-7's "`parse.ts` is unmodified" check. It needs a
 * merge-base, which this repo's CI checkout does not have (the same constraint
 * `tests/docs/_metaLedgerClaimCollision.test.ts:21` records). A suite assertion
 * that cannot compute its own subject in the environment it runs in is the
 * false-premise guard class, so it runs as a named closeout command with its
 * output in the PR body instead of passing unconditionally here.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";
import { checkFixtureContract, spliceFixturePlan } from "@/lib/specLint/fixtureContract";
import { parseDoc } from "@/lib/specLint/parse";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const trackedPlans = (): string[] =>
  execFileSync("git", ["ls-files", "--", "docs/superpowers/plans"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((p) => p.endsWith(".md"));

/** Every code this arm can emit, so the adversarial fence names them all. */
const FIXTURE_CODES = [
  "FIXTURE_MALFORMED",
  "FIXTURE_WHY_EMPTY",
  "FIXTURE_UNATTACHED",
  "FIXTURE_UNSATISFIABLE",
  "FIXTURE_PROBE_UNVERIFIED",
];

describe("Gate A — AC-2 and AC-6 over the tracked plan corpus", () => {
  const plans = trackedPlans();

  it("the corpus is a real cover, not an empty one", () => {
    // Without this, every zero below is vacuous: a walk over no files, or over
    // files with no fenced TypeScript in them, proves nothing about an arm that
    // only ever looks at fenced TypeScript.
    premise("the tracked plan corpus is non-empty", plans.length, 0);
    const withTsFence = plans.filter((p) =>
      /^ {0,3}```(ts|tsx|typescript)\s*$/m.test(readFileSync(join(ROOT, p), "utf8")),
    ).length;
    premise("tracked plans carry fenced TypeScript for the arm to ignore", withTsFence, 0);
  });

  it("AC-2 / AC-6: no shipped code inspects an unenrolled block, over every tracked plan", () => {
    const offenders: string[] = [];
    for (const path of plans) {
      const model = parseDoc(readFileSync(join(ROOT, path), "utf8"));
      const findings = checkFixtureContract(model, "plan");
      const splices = spliceFixturePlan(model, "plan");
      if (findings.length > 0) offenders.push(`${path}: ${findings.map((f) => f.code).join(",")}`);
      if (splices.length > 0) offenders.push(`${path}: ${splices.length} splice entr(ies)`);
    }
    expect(offenders).toEqual([]);
  });

  it("POSITIVE CONTROL: the arm does fire when a marker IS present", () => {
    // This is what makes the zeros above mean "silent on unenrolled blocks"
    // rather than merely "silent".
    const enrolled = ["# P", "<!-- fixture: why=`w` -->", "```ts", "// body", "```"].join("\n");
    expect(spliceFixturePlan(parseDoc(enrolled), "plan")).toEqual([{ line: 2, block: "// body" }]);
    const malformed = ["# P", "<!-- fixture: why=x -->", "```ts", "// body", "```"].join("\n");
    expect(checkFixtureContract(parseDoc(malformed), "plan").map((f) => f.code)).toEqual([
      "FIXTURE_MALFORMED",
    ]);
  });

  it("an UNENROLLED block whose CONTENT is maximally provocative is still untouched", () => {
    // The adversarial-content case the corpus does not happen to contain: an
    // implementation keying on fence CONTENT rather than on enrolment fires
    // here and passes the corpus walk, because no tracked plan holds this.
    const provocative = [
      "# P",
      "```ts",
      "// <!-- fixture: why=`inside a fence` -->",
      "// <!-- fixture: why=`` -->",
      'throw new Error("premise not met: this text is inside an UNENROLLED block");',
      ...FIXTURE_CODES.map((c) => `// ${c}`),
      'import { premiseHolds } from "@/tests/_shared/premise";',
      "```",
      "prose after",
    ].join("\n");
    const model = parseDoc(provocative);
    expect(checkFixtureContract(model, "plan")).toEqual([]);
    expect(spliceFixturePlan(model, "plan")).toEqual([]);
  });
});

describe("Gate A — AC-7 purity", () => {
  it("the new module is inside the recursive purity walk's tree and imports no node: builtin", () => {
    // tests/specLint/_metaPureCore.test.ts walks lib/specLint recursively, so
    // this module is covered by default. Asserted here rather than assumed,
    // because "covered by default" is a claim about a walk, not an observation
    // of one.
    const walked = execFileSync("git", ["ls-files", "--", "lib/specLint"], { encoding: "utf8" })
      .split("\n")
      .filter((p) => p.endsWith(".ts"));
    expect(walked).toContain("lib/specLint/fixtureContract.ts");
    const src = readFileSync(join(ROOT, "lib/specLint/fixtureContract.ts"), "utf8");
    expect(src).not.toMatch(/from "node:/);
    expect(src).not.toMatch(/require\("node:/);
  });
});
