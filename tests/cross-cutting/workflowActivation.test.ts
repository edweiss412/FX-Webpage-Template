/**
 * tests/cross-cutting/workflowActivation.test.ts
 *
 * `activatedRunScalars` answers "which `run:` scalars are PROVABLY executed?" for
 * every wiring guard in the repo, so a wrong answer is silent dark coverage in
 * whichever guard asked. Its policy is REFUSAL: a construct that changes WHERE
 * or WHETHER a command runs is not modelled, it is refused, and a workflow using
 * one reads as unwired.
 *
 * This file pins the ONE exception, added 2026-08-16 by the modal-wait adoption
 * arc: a step-level `if: always()`. That literal is decidable without evaluating
 * anything and decides in the SAFE direction — the step runs even when an
 * earlier step failed, which is strictly more execution than the unconditional
 * default the function already counts. Everything either side of it stays
 * refused, which is what stops the exception from becoming a foothold.
 *
 * The cases below are paired: for every accepted spelling there is a REFUSED
 * near-neighbour one edit away, so the exception cannot silently widen into
 * "any expression mentioning always()".
 */
import { describe, expect, test } from "vitest";

import { activatedRunScalars } from "../_shared/workflowActivation";

/** A one-job, one-step workflow whose step carries `extra` verbatim. */
function workflow(extra: string): string {
  return [
    "name: probe",
    "on: pull_request",
    "jobs:",
    "  probe:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: the step under test",
    ...extra.split("\n").map((line) => (line === "" ? line : `        ${line}`)),
    "        run: echo marker",
  ].join("\n");
}

const runsOf = (extra: string): string[] => activatedRunScalars(workflow(extra));

describe("activatedRunScalars — the always() exception", () => {
  test("a step with no if: is counted (the baseline the exception is measured against)", () => {
    expect(runsOf("")).toEqual(["echo marker"]);
  });

  test.each([
    ["bare", "if: always()"],
    ["expression-wrapped", 'if: "${{ always() }}"'],
    ["padded", 'if: "  always()  "'],
  ])("if: always() is counted (%s)", (_label, extra) => {
    expect(runsOf(extra)).toEqual(["echo marker"]);
  });

  test.each([
    ["conjoined", "if: always() && github.event_name == 'push'"],
    ["disjoined", "if: always() || failure()"],
    ["negated", 'if: "!always()"'],
    ["failure()", "if: failure()"],
    ["success()", "if: success()"],
    ["literal false", "if: false"],
    ["an ordinary expression", "if: github.event_name == 'push'"],
  ])("every other if: is still REFUSED (%s)", (_label, extra) => {
    // An expression this code cannot evaluate is not proof, and accepting one
    // because it mentions always() is the recognizer growth the refusal policy
    // exists to avoid.
    expect(runsOf(extra)).toEqual([]);
  });

  test("a JOB-level if: always() is still refused — the exception is step-level only", () => {
    // A job-level condition governs the whole job, and the guards that consume
    // this function reason about steps. Widening there was not measured, so it
    // is not granted.
    const yaml = [
      "name: probe",
      "on: pull_request",
      "jobs:",
      "  probe:",
      "    runs-on: ubuntu-latest",
      "    if: always()",
      "    steps:",
      "      - run: echo marker",
    ].join("\n");
    expect(activatedRunScalars(yaml)).toEqual([]);
  });

  test("the always() step still loses to the OTHER refusals stacked on it", () => {
    // The exception relaxes one key. It must not relax the neighbours: a
    // `shell:` override prints the script path and exits 0 without running it,
    // and continue-on-error swallows the status the guard is reading.
    expect(runsOf('if: always()\nshell: "echo {0}"')).toEqual([]);
    expect(runsOf("if: always()\ncontinue-on-error: true")).toEqual([]);
    expect(runsOf('if: always()\nworking-directory: "./elsewhere"')).toEqual([]);
  });

  test("the live crew-e2e oracle step is what this exception exists for", async () => {
    // Anti-tautology: read the shipped workflow rather than a fixture, so the
    // exception cannot pass here while failing on the file it was written for.
    const { readFileSync } = await import("node:fs");
    const yaml = readFileSync(".github/workflows/crew-e2e.yml", "utf8");
    expect(yaml).toContain("node scripts/check-crew-e2e-executed.mjs");
    expect(
      activatedRunScalars(yaml).map((r) => r.trim()),
      "the executed-count oracle carries if: always() so a recovered-then-failed run still " +
        "reaches it; without the exception, hardening that step would read as UNWIRING it",
    ).toContain("node scripts/check-crew-e2e-executed.mjs");
  });
});
