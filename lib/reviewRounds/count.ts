import { isCountedStage, type Stage } from "./constants";
import type { ReviewRoundRow } from "./row";

/**
 * The counting rule is EXACTLY TWO CONJUNCTS (spec §5.4):
 *   status === "verdict"  AND  stage is a counted stage.
 *
 * `failureReason` is deliberately NOT a conjunct. `giveUp()` merges a rollout
 * scrape into the result, so a RECOVERED verdict carries a real verdict
 * alongside failureReason "total_timeout" or "attempts_exhausted" - the
 * reviewer did its work and the verdict was recovered, so it counts.
 */
function bucket<K>(
  rows: ReviewRoundRow[],
  keep: (r: ReviewRoundRow) => boolean,
  identity: (r: ReviewRoundRow) => K,
): Map<Stage, number> {
  const perStage = new Map<Stage, Set<K>>();
  for (const r of rows) {
    if (!keep(r)) continue;
    let set = perStage.get(r.stage);
    if (!set) {
      set = new Set<K>();
      perStage.set(r.stage, set);
    }
    set.add(identity(r));
  }
  return new Map([...perStage].map(([stage, set]) => [stage, set.size]));
}

/** The counting rule's two conjuncts, named once and shared by both readers. */
const isCounted = (r: ReviewRoundRow) => r.status === "verdict" && isCountedStage(r.stage);

/** What makes two counted rows the SAME round. */
const byRound = (r: ReviewRoundRow) => r.round;
/**
 * A round is identified by its base as well as its number once the arc spans
 * more than one merge base: a re-merge renumbers from 1, so `round` alone
 * collapses the second base's rounds onto the first's. The separator is the
 * one `readArcs` already uses (`lib/reviewRounds/corpus.ts:124`) - it cannot
 * occur in a 12-hex base or in a number, so no two distinct pairs collide.
 */
const byBaseAndRound = (r: ReviewRoundRow) => `${r.baseSha}\u0000${r.round}`;

/** Distinct counted `round` values per stage - a parallel wave counts once. */
export function countedRounds(rows: ReviewRoundRow[]): Map<Stage, number> {
  return bucket(rows, isCounted, byRound);
}

/**
 * Distinct counted `(baseSha, round)` pairs per stage - the arc's rounds
 * summed across EVERY merge base it has sat on, where `countedRounds` sees
 * only the base it is called with.
 *
 * The two differ exactly when an arc re-merges. The merge base moves, the
 * corpus opens a second file, and the round numbering restarts at 1; four
 * rounds burned then read as three, and a stage that owes a filing obliges
 * nothing. Both counting conjuncts still apply, so infra deaths and
 * `stage: "task"` dispatches contribute here no more than they do there.
 */
export function arcCountedRounds(rows: ReviewRoundRow[]): Map<Stage, number> {
  return bucket(rows, isCounted, byBaseAndRound);
}

/**
 * Rows recorded per stage, regardless of status or stage - the dispatch count,
 * not the round count. Deliberately NOT deduplicated by `round`: this is the
 * "did this arc ever dispatch this stage" signal that `stage_without_rows`
 * reads, and a parallel wave is several dispatches sharing one round number.
 * `countedRounds` is the one that dedupes, because the THRESHOLD is about
 * rounds burned rather than processes launched.
 */
export function recordedRounds(rows: ReviewRoundRow[]): Map<Stage, number> {
  const perStage = new Map<Stage, number>();
  for (const r of rows) perStage.set(r.stage, (perStage.get(r.stage) ?? 0) + 1);
  return perStage;
}

/**
 * Stages whose DECLARED rounds are not a contiguous 1..N. Computed over every
 * row, not only counted ones: an infra fault legitimately occupies a round
 * number, and excluding it would report a gap on a healthy arc.
 */
export function roundGaps(rows: ReviewRoundRow[]): Stage[] {
  const perStage = new Map<Stage, Set<number>>();
  for (const r of rows) {
    let set = perStage.get(r.stage);
    if (!set) {
      set = new Set<number>();
      perStage.set(r.stage, set);
    }
    set.add(r.round);
  }
  const bad: Stage[] = [];
  for (const [stage, set] of perStage) {
    const sorted = [...set].sort((a, b) => a - b);
    const contiguous = sorted.every((n, i) => n === i + 1);
    if (!contiguous) bad.push(stage);
  }
  return bad;
}
