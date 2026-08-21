import { type AcceptedSurvivor, type Score, reconcile, score } from "./ledger";
import type { MutantOutcome } from "./runner";

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
  | "non-finite-score"
  | "unaccounted-mutants"
  | "duplicate-survivor";

export type GateFailure = { condition: GateCondition; detail: string };

/**
 * An observation the gate REPORTS without failing on.
 *
 * `site`, `suite` and `durationMs` are STRUCTURED FIELDS rather than only an
 * opaque `detail` string, because a proof comparing fields requires fields to
 * exist — an implementation formatting everything into prose looks informative
 * and makes the comparison impossible.
 */
export type GateNotice = {
  kind: "timeout-kill";
  site: string;
  suite: string;
  durationMs: number;
  detail: string;
};

export type GateInput = {
  surfaceId: string;
  mutantCount: number;
  noOps: readonly string[];
  baselineGreen: boolean;
  killed: number;
  survivors: readonly string[];
  ledger: readonly AcceptedSurvivor[];
  scoreFloor: number;
  /**
   * OPTIONAL, defaulting to none.
   *
   * Requiring it would force edits to three call sites that cannot supply it
   * meaningfully — including committed probe scripts whose value is EVIDENTIARY
   * and which must not be edited to stay current. Absent outcomes yield no
   * notices, which is the CORRECT answer rather than a convenient one: with no
   * children there is no deciding child, so no timeout kill can exist.
   */
  outcomes?: readonly MutantOutcome[];
};

export type GateResult = {
  passed: boolean;
  failures: GateFailure[];
  notices: GateNotice[];
  score: Score;
};

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

  // ACCOUNTING. Every generated mutant must be classified exactly once: the
  // consequence bound is "killed, ledgered, or fails the gate", and without this
  // a mutant can be neither. Conditions 3-5 all reason about the survivor LIST
  // and the killed COUNT without ever checking they add up to the mutants
  // actually produced, so a dropped outcome — a `continue` in the run loop, a
  // filter that quietly discards, an exception swallowed per-mutant — leaves the
  // gate green while the run tested less than it claims.
  const uniqueSurvivors = new Set(input.survivors);
  if (uniqueSurvivors.size !== input.survivors.length) {
    const seen = new Set<string>();
    const dupes = input.survivors.filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
    failures.push({
      condition: "duplicate-survivor",
      detail: `survivor id(s) reported more than once: ${[...new Set(dupes)].join(", ")}`,
    });
  }

  const accounted = input.killed + uniqueSurvivors.size;
  if (accounted !== input.mutantCount) {
    failures.push({
      condition: "unaccounted-mutants",
      detail:
        `${input.surfaceId}: ${input.mutantCount} mutant(s) generated but ${accounted} classified ` +
        `(killed ${input.killed} + ${uniqueSurvivors.size} distinct survivor(s)). ` +
        `Every generated mutant must be killed or survive; a mutant that is neither was silently dropped.`,
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

  // A NOTICE IS NOT A FAILURE. `passed` is computed from `failures` ALONE and
  // this array is never consulted for it — the record is additive, and a channel
  // that could red a green surface is a new way for the harness to lie about the
  // thing it was added to observe.
  //
  // The DECIDING child is the LAST one, because `runMutantRecorded`
  // short-circuits. A timeout anywhere earlier cannot have decided the verdict,
  // and reporting it would attach a stale timeout to a settled outcome.
  const notices: GateNotice[] = [];
  for (const outcome of input.outcomes ?? []) {
    const children = outcome.children ?? [];
    const deciding = children[children.length - 1];
    if (deciding === undefined || deciding.kind !== "timeout") continue;
    notices.push({
      kind: "timeout-kill",
      site: outcome.siteId,
      suite: deciding.suite,
      durationMs: deciding.durationMs,
      detail:
        `TIMEOUT-KILL ${outcome.siteId}: the child running ${deciding.suite} hit the wall-clock ` +
        `ceiling after ${deciding.durationMs}ms and was killed. It scores KILLED, which is the ` +
        `standard verdict, but it is NOT evidence the suite rejected the mutant.`,
    });
  }

  return { passed: failures.length === 0, failures, notices, score: s };
}
