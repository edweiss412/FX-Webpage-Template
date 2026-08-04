/**
 * The accepted-survivor ledger (spec §3.5).
 *
 * Shape follows the parser harness (`tests/parser/mutation/knownHoles.ts:2-6`),
 * with one addition that carries the design: the KIND split.
 *
 *   - `equivalent`  — the mutant cannot change observable behavior. Excluded
 *                     from the score denominator, because a provably
 *                     unkillable mutant would otherwise cap every surface
 *                     below 100% forever.
 *   - `accepted-gap`— a real gap, deliberately uncovered. Counted as a
 *                     survivor, so it DEPRESSES the score, and required to
 *                     carry a backlog `ref`.
 *
 * A single "accepted" kind would let any ledger row buy a perfect score, which
 * is the failure this split exists to prevent.
 */
export type AcceptedSurvivorKind = "equivalent" | "accepted-gap";

export type AcceptedSurvivor = {
  siteId: string;
  kind: AcceptedSurvivorKind;
  /** The argument, with a citation. Required; enforced by the registry meta-test. */
  reason: string;
  /** `BL-*` / `DEF-*` id. REQUIRED when kind is `accepted-gap`. */
  ref?: string;
};

export type Reconciliation = {
  /** Survivors with no ledger row at all — the primary gate condition. */
  unaccepted: string[];
  /** Ledger rows whose site no longer survives, or no longer exists. */
  stale: string[];
};

/**
 * Bidirectional set diff between the survivors a run actually produced and the
 * rows the ledger claims.
 *
 * Site ids carry position (`operator:line:column:from>to`), so editing the
 * surface above a site changes its id. That deliberately surfaces as BOTH a
 * stale row and a new unaccepted survivor rather than silently re-matching —
 * a ledger that quietly follows its site around stops being a ratchet.
 */
export function reconcile(
  survivors: readonly string[],
  ledger: readonly AcceptedSurvivor[],
): Reconciliation {
  const claimed = new Set(ledger.map((r) => r.siteId));
  const actual = new Set(survivors);
  return {
    unaccepted: survivors.filter((s) => !claimed.has(s)),
    stale: ledger.filter((r) => !actual.has(r.siteId)).map((r) => r.siteId),
  };
}

export type ScoreInput = {
  killed: number;
  survivors: readonly string[];
  ledger: readonly AcceptedSurvivor[];
};

export type Score = {
  killed: number;
  /** Survivors counted against the score: accepted-gap plus unaccepted. */
  countedSurvivors: number;
  /** Survivors excluded as equivalent. */
  excluded: number;
  denominator: number;
  /**
   * `killed / denominator`. **May be `NaN`** when the denominator is zero — a
   * run that produced no mutants. That is reported rather than coerced,
   * because `NaN < floor` is `false` and a gate comparing only against the
   * floor would pass a surface it never tested (spec §3.6 condition 6).
   */
  value: number;
};

export function score({ killed, survivors, ledger }: ScoreInput): Score {
  const equivalent = new Set(ledger.filter((r) => r.kind === "equivalent").map((r) => r.siteId));
  const excluded = survivors.filter((s) => equivalent.has(s)).length;
  const countedSurvivors = survivors.length - excluded;
  const denominator = killed + countedSurvivors;
  return {
    killed,
    countedSurvivors,
    excluded,
    denominator,
    value: killed / denominator,
  };
}
