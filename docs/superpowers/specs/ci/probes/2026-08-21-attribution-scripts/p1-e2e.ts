import { runSurface } from "../../../../../../tests/mutation/source/runner";
import { evaluateGate } from "../../../../../../tests/mutation/source/gate";
import { enumerateSites, siteId } from "../../../../../../tests/mutation/source/operators";
import { MUTANT_TIMEOUT_MS } from "../../../../../../tests/mutation/source/spawnBounded";
import type { GuardSurface } from "../../../../../../tests/mutation/source/registry";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();

/**
 * The synthetic surfaces are WRITTEN BY THIS SCRIPT rather than committed, so the
 * probe is self-contained and regenerable (round-4 review: the committed script
 * required four files that were not in the tree). They are removed in the finally
 * below; `tests/_probe_nondet/` is git-ignored so an interrupted run cannot leak
 * them into a commit.
 *
 * hangSource's `i = i - 1;` removal is the SYNCHRONOUS non-terminating mutant —
 * vitest's own testTimeout is a timer and cannot fire on a blocked worker thread,
 * so the spawnBounded ceiling is what stops it. assertSource keeps the advance in
 * the for-header, so no statement-removal mutant of it hangs.
 */
const FIXTURE_DIR = join(root, "tests/_probe_nondet");
const FIXTURES: Record<string, string> = {
  "hangSource.ts": `export function countDown(n: number): number {
  let i = n;
  let steps = 0;
  while (i > 0) {
    steps = steps + 1;
    i = i - 1;
  }
  return steps;
}
`,
  "hangSource.probe.test.ts": `import { describe, expect, it } from "vitest";
import { countDown } from "./hangSource";

describe("countDown", () => {
  it("counts one step per unit", () => {
    expect(countDown(3)).toBe(3);
  });
});
`,
  "assertSource.ts": `export function countDown(n: number): number {
  let steps = 0;
  for (let i = n; i > 0; i = i - 1) {
    steps = steps + 1;
  }
  return steps;
}
`,
  "assertSource.probe.test.ts": `import { describe, expect, it } from "vitest";
import { countDown } from "./assertSource";

describe("countDown", () => {
  it("counts one step per unit", () => {
    expect(countDown(3)).toBe(3);
  });
});
`,
};

function writeFixtures(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const [name, body] of Object.entries(FIXTURES)) {
    writeFileSync(join(FIXTURE_DIR, name), body, "utf8");
  }
}


const surfaceFor = (stem: string): GuardSurface =>
  ({
    id: `probe-${stem}`,
    sourcePath: `tests/_probe_nondet/${stem}.ts`,
    suitePaths: [`tests/_probe_nondet/${stem}.probe.test.ts`],
    operators: ["statement-removal"],
    scoreFloor: 0,
    control: { from: "steps = steps + 1;", to: "steps = steps + 2;" },
    accepted: [],
  }) as unknown as GuardSurface;

const runArm = (stem: string) => {
  const s = surfaceFor(stem);
  const target = resolve(root, s.sourcePath);
  const text = readFileSync(target, "utf8");
  const sites = enumerateSites(target, text, s.operators);
  console.log(`\n=== ARM ${stem}: ${sites.length} statement-removal site(s) ===`);
  for (const site of sites) console.log(`    ${siteId(site)}`);

  const t0 = Date.now();
  const run = runSurface(root, s);
  const elapsedMs = Date.now() - t0;

  const gate = evaluateGate({
    surfaceId: s.id,
    mutantCount: run.mutantCount,
    noOps: run.noOps,
    baselineGreen: run.baselineGreen,
    killed: run.killed,
    survivors: run.survivors,
    ledger: s.accepted,
    scoreFloor: s.scoreFloor,
  });

  console.log(`--- RunResult (everything runSurface reports) ---`);
  console.log(JSON.stringify(run, null, 2));
  console.log(`--- GateResult (everything the gate reports) ---`);
  console.log(`passed=${gate.passed} score=${gate.score.value.toFixed(4)} failures=${JSON.stringify(gate.failures)}`);
  console.log(`--- what surfaceCases.ts would PRINT for "passes every gate condition" ---`);
  console.log(JSON.stringify(gate.failures.map((f) => `${f.condition}: ${f.detail}`).join("\n")));
  console.log(`--- elapsed (NOT recorded anywhere by the harness) ---`);
  console.log(`${(elapsedMs / 1000).toFixed(1)}s across ${run.mutantCount} mutant(s) + 1 baseline; ceiling is ${MUTANT_TIMEOUT_MS / 1000}s per suite-child`);
  return { run, gate, elapsedMs };
};

writeFixtures();
let hang: ReturnType<typeof runArm>;
let assertArm: ReturnType<typeof runArm>;
try {
  hang = runArm("hangSource");
  assertArm = runArm("assertSource");
} finally {
  // Rule 69: the tree deliberately holds no scratch. Removed even on failure.
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

console.log("\n================ PRE-REGISTERED READING ================");
const overlayLive = hang.run.survivors.length === 0 && hang.run.killed > 0;
console.log(`overlay live (mutants were actually served): ${overlayLive} — killed=${hang.run.killed} survivors=${hang.run.survivors.length}`);
const ceilingReached = hang.elapsedMs > MUTANT_TIMEOUT_MS;
console.log(`spawn ceiling actually reached (elapsed > ${MUTANT_TIMEOUT_MS}ms): ${ceilingReached}`);
console.log(`control arm elapsed: ${(assertArm.elapsedMs / 1000).toFixed(1)}s — same operator, no hang`);

const shapeIdentical =
  hang.run.baselineGreen === assertArm.run.baselineGreen &&
  hang.run.survivors.length === assertArm.run.survivors.length &&
  hang.gate.passed === assertArm.gate.passed &&
  hang.gate.score.value === assertArm.gate.score.value &&
  JSON.stringify(hang.run.outcomes.map((o) => o.verdict)) ===
    JSON.stringify(hang.run.outcomes.map(() => "KILLED"));
console.log(`every outcome in the hang arm reads KILLED, indistinguishably: ${shapeIdentical}`);
console.log(`fields available to attribute an outcome: ${Object.keys(hang.run.outcomes[0] ?? {}).join(", ")}`);
