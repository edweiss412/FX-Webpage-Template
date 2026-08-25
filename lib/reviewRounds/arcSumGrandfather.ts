import { type CountedStage } from "./constants";

/**
 * The eleven `(branch, stage)` pairs that already owed a filing under clause B
 * when the arc sum shipped, frozen so the rule can be HARD from day one
 * (spec §3.3). All eleven are merged and their branches are deleted on origin,
 * so none can ever gain a filing; an advisory tier over them would never drain.
 *
 * The set can only SHRINK. Three meta-test assertions over the live corpus
 * enforce that structurally rather than by convention:
 *
 *   1. every counted row of every pair carries a `startedAt` strictly before
 *      `ARC_SUM_FREEZE` - and every row written from now on postdates it, so
 *      no future arc can be added to this set at all;
 *   2. every pair still owes under clause B, so a pair that has since gained a
 *      filing or lost its rows is stale and fails;
 *   3. the set holds exactly eleven entries.
 *
 * A row with `startedAt: null` cannot be proven older than the freeze and so
 * fails assertion 1 - conservative and loud. Measured at authoring: zero such
 * rows among the eleven.
 */
export const ARC_SUM_FREEZE = "2026-08-22T00:00:00.000Z";

export const ARC_SUM_GRANDFATHERED: readonly { branch: string; stage: CountedStage }[] = [
  { branch: "chore/archive-duplicate-ids", stage: "diff" },
  { branch: "ci/app-e2e-batch1", stage: "plan" },
  { branch: "docs/harness-false-failures-spec", stage: "plan" },
  { branch: "feat/crew-chrome-footer-avatar", stage: "diff" },
  { branch: "feat/diagram-viewing-polish", stage: "diff" },
  { branch: "feat/m2-e2e-infra", stage: "diff" },
  { branch: "feat/mutation-ref-sub", stage: "diff" },
  { branch: "fix/premisescan-registrar-accept-sets", stage: "diff" },
  { branch: "fix/scanner-scope-totality", stage: "diff" },
  { branch: "fix/sendauth-arm-classifier-unification", stage: "diff" },
  { branch: "test/execution-methods-driver-derived", stage: "diff" },
];

/**
 * Keyed on `(branch, stage)` and never on a path: clause B's obligation is not
 * attached to any one base, which is the whole point of it. The separator is
 * the one `readArcs` already uses for the same reason
 * (`lib/reviewRounds/corpus.ts:124`) - the hash, dash and colon characters are
 * all legal in git branch names and would collide.
 */
const KEYS = new Set(ARC_SUM_GRANDFATHERED.map(({ branch, stage }) => `${branch}\u0000${stage}`));

export function isArcSumGrandfathered(branch: string, stage: string): boolean {
  return KEYS.has(`${branch}\u0000${stage}`);
}
