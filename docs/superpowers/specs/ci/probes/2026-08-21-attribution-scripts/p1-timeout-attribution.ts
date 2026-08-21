/**
 * PROBE 1 (executable half): is a timeout distinguishable from an assertion kill
 * anywhere an operator can observe?
 *
 * Every step below runs through the SHIPPED functions. Only the wall-clock
 * ceiling differs from production (250ms instead of 180_000ms), because
 * `runSuite` hardcodes `timeoutMs: MUTANT_TIMEOUT_MS` and is not parameterizable.
 */
import { spawnBounded, MUTANT_TIMEOUT_MS } from "../../../../../../tests/mutation/source/spawnBounded";
import { classify } from "../../../../../../tests/mutation/source/oracle";
import { MUTANT_TIMEOUT_EXIT } from "../../../../../../tests/mutation/source/runner";
import { evaluateGate } from "../../../../../../tests/mutation/source/gate";

const root = process.cwd();
let failed = 0;
const check = (label: string, cond: boolean, detail: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label} :: ${detail}`);
  if (!cond) failed += 1;
};

// --- POSITIVE CONTROL: the probe really did perturb the system (rule 89).
const t0 = Date.now();
const timedOut = spawnBounded(["sleep", "30"], { cwd: root, env: process.env, timeoutMs: 250 });
const elapsed = Date.now() - t0;
check(
  "control: a real ETIMEDOUT was produced",
  timedOut.outcome.kind === "timeout",
  `outcome.kind=${timedOut.outcome.kind} after ${elapsed}ms (ceiling 250ms)`,
);

// --- The other arm: a child that RAN and FAILED an assertion (exit 1).
const failedChild = spawnBounded(["sh", "-c", "exit 1"], { cwd: root, env: process.env, timeoutMs: 5000 });
check(
  "control: an ordinary non-zero exit was produced",
  failedChild.outcome.kind === "exit" && failedChild.outcome.code === 1,
  `outcome=${JSON.stringify(failedChild.outcome)}`,
);

// --- What `runSuite` returns for each, per runner.ts:112-113.
const codeFromTimeout = timedOut.outcome.kind === "timeout" ? MUTANT_TIMEOUT_EXIT : -1;
const codeFromAssertion = failedChild.outcome.kind === "exit" ? failedChild.outcome.code : -1;

// --- What the ORACLE makes of each.
const vTimeout = classify(codeFromTimeout);
const vAssertion = classify(codeFromAssertion);
console.log(`\nexit ${codeFromTimeout} (timeout)   -> classify -> ${vTimeout}`);
console.log(`exit ${codeFromAssertion} (assertion) -> classify -> ${vAssertion}`);
check(
  "the two arms are INDISTINGUISHABLE at the oracle",
  vTimeout === vAssertion,
  `both classify as ${vTimeout}; the exit code is consumed inline at runner.ts:165 and never stored`,
);

// --- What the GATE makes of a surface whose only kill was a timeout.
// MutantOutcome is {siteId, verdict} (runner.ts:28); RunResult exposes `killed`
// as a COUNT (runner.ts:174), so a timeout-killed mutant is not even nameable.
const mk = (killed: number, survivors: string[]) =>
  evaluateGate({
    surfaceId: "probe",
    mutantCount: killed + survivors.length,
    noOps: [],
    baselineGreen: true,
    killed,
    survivors,
    ledger: [],
    scoreFloor: 0.95,
  });
const gTimeout = mk(1, []);
const gAssertion = mk(1, []);
console.log(`\ngate(killed-by-timeout)   -> passed=${gTimeout.passed} score=${gTimeout.score.value.toFixed(4)} failures=${JSON.stringify(gTimeout.failures)}`);
console.log(`gate(killed-by-assertion) -> passed=${gAssertion.passed} score=${gAssertion.score.value.toFixed(4)} failures=${JSON.stringify(gAssertion.failures)}`);
check(
  "the two arms are INDISTINGUISHABLE at the gate",
  JSON.stringify(gTimeout) === JSON.stringify(gAssertion),
  "identical GateResult; the gate's input carries `killed: number` and no evidence field",
);

// --- Is the ceiling reachable per-MUTANT, or per-SUITE?
console.log(`\nMUTANT_TIMEOUT_MS = ${MUTANT_TIMEOUT_MS} — applied per spawnBounded call, i.e. PER SUITE (runner.ts:110),`);
console.log(`so a surface with N deciding suites admits up to N*${MUTANT_TIMEOUT_MS}ms per mutant, and no aggregate bound exists.`);

console.log(`\n${failed === 0 ? "PROBE 1 GREEN" : `PROBE 1 RED (${failed} check(s) failed)`}`);
process.exit(failed === 0 ? 0 : 1);
