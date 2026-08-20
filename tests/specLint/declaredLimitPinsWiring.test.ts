import { describe, expect, it } from "vitest";
import { runLint } from "../../lib/specLint/run";
import type { EnrolledSurface, FileResolver, LintDoc } from "../../lib/specLint/types";
import { SYNTHETIC_TITLES as T } from "./__fixtures__/declaredLimitPins/syntheticTitles";

/**
 * Task 5 — the arm is reachable through `runLint`, plan-kind only, table INJECTED
 * (spec §4; AC-3, AC-8).
 *
 * Every other suite in this arc calls the pure core directly. That leaves the seam
 * where the core is actually reached untested, so a `runLint` that never calls the arm
 * passes all of them.
 *
 * ── ANTI-TAUTOLOGY: THE NULL-TABLE CASE IS NOT DECORATION ──────────────────────
 * Asserting only the positive case would be satisfied by an implementation that
 * hard-imports the registry into `lib/`, which is exactly what the purity boundary
 * forbids. A null table drawing NOTHING is what keeps the arm from becoming mandatory
 * for every existing caller, and it is asserted alongside the same document under a
 * table, so neither half can pass by the arm having gone silent.
 */

const SUITE = "tests/qplinth/wiring.test.ts";
const UNNAMED = "DECLARED_LIMIT_PIN_UNNAMED";

const SURFACE: EnrolledSurface = {
  id: "qplinthWiring",
  sourcePath: "lib/qplinth/wiring.ts",
  suitePaths: [SUITE],
};

const PLAN_TEXT = ["**Files:**", `- Modify: \`${SUITE}\``, ""].join("\n");

const resolver: FileResolver = {
  readFileLines: (path) => (path === SUITE ? [`test("${T.piCompanion}", () => {});`] : null),
  listTrackedFiles: () => [SUITE],
};

const doc = (kind: "spec" | "plan"): LintDoc => ({
  text: PLAN_TEXT,
  repoRelPath: kind === "plan" ? "docs/superpowers/plans/qplinth.md" : "docs/superpowers/specs/qplinth.md",
  kind,
  kindSource: "explicit",
});

const armCodes = (result: { findings: { code: string }[] }): string[] =>
  result.findings.filter((f) => f.code.startsWith("DECLARED_LIMIT_PIN")).map((f) => f.code);

describe("runLint — the declared-limit pin arm is wired, plan-kind only", () => {
  it("reports an unnamed pin for a PLAN naming an enrolled surface", () => {
    const result = runLint(doc("plan"), resolver, null, null, null, null, { surfaces: [SURFACE] });
    expect(armCodes(result)).toEqual([UNNAMED]);
  });

  it("reports NOTHING for a SPEC-kind document, with the plan-kind case as its pair", () => {
    // A spec carries no Files list, so the collision is a plan-time fact.
    expect(armCodes(runLint(doc("spec"), resolver, null, null, null, null, { surfaces: [SURFACE] }))).toEqual([]);
    expect(armCodes(runLint(doc("plan"), resolver, null, null, null, null, { surfaces: [SURFACE] }))).toEqual([UNNAMED]);
  });

  it("reports NOTHING for a NULL table, with the injected-table case as its pair", () => {
    expect(armCodes(runLint(doc("plan"), resolver, null, null, null, null, null))).toEqual([]);
    expect(armCodes(runLint(doc("plan"), resolver, null, null, null, null, { surfaces: [SURFACE] }))).toEqual([UNNAMED]);
  });

  it("leaves an EXISTING caller that passes no table byte-identical", () => {
    // The six-argument form is every caller that shipped before this arm. It must keep
    // compiling AND keep its findings unchanged, which is the whole point of the
    // static/injected split the exec, parse, probe and fixture arms already use.
    const before = runLint(doc("plan"), resolver, null, null, null, null);
    expect(armCodes(before)).toEqual([]);
    const after = runLint(doc("plan"), resolver, null, null, null, null, null);
    expect(after.findings).toEqual(before.findings);
  });

  it("threads the DISPOSITIONS through, not just the surfaces", () => {
    // Without this the adapter could inject a table and silently drop the registry,
    // which no other case here would notice.
    const dispositioned = runLint(doc("plan"), resolver, null, null, null, null, {
      surfaces: [SURFACE],
      dispositions: [{ path: SUITE, title: T.piCompanion, reason: "constructed for this assertion" }],
    });
    expect(armCodes(dispositioned)).toEqual([]);
    // Paired: the same run WITHOUT the row still draws, so the silence above is the
    // disposition and not the arm having gone quiet.
    expect(armCodes(runLint(doc("plan"), resolver, null, null, null, null, { surfaces: [SURFACE] }))).toEqual([
      UNNAMED,
    ]);
  });

  it("emits the arm's findings at ADVISORY severity, so `0 hard` is unaffected", () => {
    const result = runLint(doc("plan"), resolver, null, null, null, null, { surfaces: [SURFACE] });
    const arm = result.findings.filter((f) => f.code.startsWith("DECLARED_LIMIT_PIN"));
    expect(arm.length).toBeGreaterThan(0);
    expect(arm.every((f) => f.severity === "advisory")).toBe(true);
    expect(result.findings.some((f) => f.severity === "fail")).toBe(false);
  });
});
