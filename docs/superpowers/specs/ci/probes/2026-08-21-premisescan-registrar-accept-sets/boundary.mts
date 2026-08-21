/**
 * Does each enrolled task's red actually FAIL at its own commit boundary?
 *
 * Plan review r1 finding 1 was a task whose commit would have left its own test
 * command red, and the defect was invisible because the boundary state was
 * REASONED about rather than run. This runs it. Import paths are relative to the
 * repo root, so run it from there:
 *
 *   pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-registrar-accept-sets/boundary.mts
 *
 * On the SHIPPED scanner it reports today's behaviour. To read a task's red, apply
 * that task's predecessors to premiseScan.ts first and re-run: the post-Task-1
 * state (sets derived, peel interleaved, dispatch and hook predicate untouched)
 * is the one the plan's 0.3 item 8 quotes.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyTests } from "../../../../../../tests/mutation/source/premiseScan";

const FIXTURES: Record<string, string> = {
  // Task 2's red: suite must behave as describe does.
  suiteTwin: `import { suite, it, beforeEach } from "vitest";
suite("s", () => {
  beforeEach(() => { process.env.CI; });
  it("child", () => {});
});
`,
  describeTwin: `import { describe, it, beforeEach } from "vitest";
describe("s", () => {
  beforeEach(() => { process.env.CI; });
  it("child", () => {});
});
`,
  // Task 3's red: a qualified hook call must be seen.
  qualifiedHook: `import { test, it } from "vitest";
test.beforeEach(() => { process.env.CI; });
it("child", () => {});
`,
  // Task 2's SECOND red: the nested prune at premiseScan.ts:1862. Only the
  // OUTER SIBLING discriminates -- with the prune still keyed on "describe"
  // alone, the nested suite's hook is read as content of the outer describe and
  // leaks to the sibling. Asserting the inner child alone passes either way.
  nestedPrune: `import { describe, suite, it, beforeEach } from "vitest";
describe("outer", () => {
  suite("inner", () => {
    beforeEach(() => { process.env.CI; });
    it("inner child", () => {});
  });
  it("outer sibling", () => {});
});
`,
  // Task 3's red: the suite-factory alias.
  factoryAlias: `import { describe, it } from "vitest";
describe("outer", (t) => {
  t.beforeEach(() => { process.env.CI; });
  it("child", () => {});
});
`,
};

const dir = mkdtempSync(join(tmpdir(), "boundary-"));
let seen = 0;
for (const [name, src] of Object.entries(FIXTURES)) {
  const file = `${name}.test.ts`;
  writeFileSync(join(dir, file), src);
  const rows = classifyTests(dir, file);
  const shown = rows.filter((r) => r.testName === "child" || r.testName.includes("sibling") || r.testName.includes("inner child"));
  const desc = shown.length > 0 ? shown.map((r) => `${r.testName}=${r.verdict}`).join("  ") : "(NOT CLASSIFIED)";
  console.log(`${name.padEnd(14)} rows=${rows.length}  ${desc}`);
  seen += rows.length;
}

// A probe that classifies nothing prints four tidy "(NOT CLASSIFIED)" lines and
// exits 0, which is indistinguishable from a scanner that correctly declines
// every fixture. Refuse instead.
if (seen === 0) {
  console.error("boundary: every fixture classified zero tests; the probe reached nothing");
  process.exit(2);
}
