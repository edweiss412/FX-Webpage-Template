import { type AcceptedSurvivor, type Score, reconcile, score } from "./ledger";

/**
 * The gate (spec §3.6).
 *
 * Six conditions, all evaluated — never short-circuited. A gate that stops at
 * the first failure turns one run into N runs, and this harness exists to
 * reduce round count.
 */
export type GateCondition =
  | "no-op"
  | "baseline"
  | "unaccepted-survivor"
  | "stale-ledger-row"
  | "below-floor"
  | "no-mutants"
  | "non-finite-score";

export type GateFailure = { condition: GateCondition; detail: string };

export type GateInput = {
  surfaceId: string;
  mutantCount: number;
  noOps: readonly string[];
  baselineGreen: boolean;
  killed: number;
  survivors: readonly string[];
  ledger: readonly AcceptedSurvivor[];
  scoreFloor: number;
};

export type GateResult = { passed: boolean; failures: GateFailure[]; score: Score };

export function evaluateGate(input: GateInput): GateResult {
  const failures: GateFailure[] = [];
  const { unaccepted, stale } = reconcile(input.survivors, input.ledger);
  const s = score({ killed: input.killed, survivors: input.survivors, ledger: input.ledger });

  if (input.noOps.length > 0) {
    failures.push({
      condition: "no-op",
      detail: `${input.noOps.length} no-op mutant(s): ${input.noOps.join(", ")}`,
    });
  }

  if (!input.baselineGreen) {
    failures.push({
      condition: "baseline",
      detail: `${input.surfaceId}: suite is red on UNMUTATED source; every mutant would score KILLED`,
    });
  }

  if (unaccepted.length > 0) {
    failures.push({
      condition: "unaccepted-survivor",
      detail: `${unaccepted.length} survivor(s) with no ledger row: ${unaccepted.join(", ")}`,
    });
  }

  if (stale.length > 0) {
    failures.push({
      condition: "stale-ledger-row",
      detail: `${stale.length} ledger row(s) whose site no longer survives: ${stale.join(", ")}`,
    });
  }

  // Conditions 6 FIRST in reasoning order, even though it is listed last in the
  // spec: a zero-mutant or zero-denominator run makes the floor comparison
  // meaningless rather than false. `NaN < floor` is `false`, so without these
  // two an empty run satisfies every other condition and the gate reports
  // green on a surface it never tested.
  const emptyRun = input.mutantCount === 0;
  const nonFinite = !Number.isFinite(s.value);

  if (emptyRun) {
    failures.push({
      condition: "no-mutants",
      detail: `${input.surfaceId}: the run produced 0 mutants; nothing was tested`,
    });
  }

  if (nonFinite && !emptyRun) {
    failures.push({
      condition: "non-finite-score",
      detail: `${input.surfaceId}: score is ${String(s.value)} (denominator ${s.denominator}); every mutant was excluded`,
    });
  }

  // Only meaningful once the score is a real number.
  if (!emptyRun && !nonFinite && s.value < input.scoreFloor) {
    failures.push({
      condition: "below-floor",
      detail: `${input.surfaceId}: score ${s.value.toFixed(4)} < floor ${input.scoreFloor}`,
    });
  }

  return { passed: failures.length === 0, failures, score: s };
}
