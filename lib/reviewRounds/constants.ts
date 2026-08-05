import { execFileSync } from "node:child_process";

/**
 * The canonical threshold (spec §4.3). Every module that reasons about the
 * filing duty imports THIS - a literal 4 anywhere outside a fixture is a
 * second definition waiting to drift from the first.
 *
 * It matches the REVIEW_ROUND_CAP default in the per-machine dispatch hook so
 * one number governs both the dispatch block and the filing duty.
 */
export const ROUND_THRESHOLD = 4;

/** Closed accept-set, keyed on value (spec §5.1). No `unknown` bucket. */
export const STAGES = ["spec", "plan", "diff", "task"] as const;
export type Stage = (typeof STAGES)[number];

/**
 * `task` is recorded and never counted (spec §5.1). The wrapper has one
 * subcommand serving two call classes; declaring a non-review task as `diff`
 * would record a review round that never happened, and four such tasks would
 * manufacture a filing obligation out of nothing.
 */
export const COUNTED_STAGES = ["spec", "plan", "diff"] as const;

/**
 * The moment the recording contract went live (spec §9). DECLARED, and set by
 * the commit that merges this system - never derived from the corpus.
 *
 * A derived boundary (the earliest startedAt observed) is silently wrong twice.
 * The contract is live the moment the wrapper ships, but the first row lands
 * whenever the next dispatch happens to run, so an arc merging in between is
 * filed as pre-adoption despite being fully covered. And an empty corpus has no
 * earliest row, so the boundary is null, the universe is empty, and the report
 * declares no silent arcs in exactly the state where nothing is being recorded
 * at all. That failure is self-concealing: the worse the adoption, the cleaner
 * the report.
 *
 * The observed earliest row is still reported, as an ADVISORY line: a corpus
 * predating this constant means this constant is wrong, and saying so is
 * cheaper than deriving a number nothing can check.
 *
 * It is NOT a hand-set literal, and no commit inside this PR can hold the right
 * value. Any timestamp written before the merge is EARLIER than the merge, and
 * early is the unsafe direction: an arc merging between that commit and this
 * one is then reported as a post-adoption silent arc, which is a false
 * accusation the report prints as fact. A hand-set literal is also a value
 * nothing can check, and forgetting to update it is silent.
 *
 * So it is READ FROM GIT, from the one place that knows when the contract went
 * live: the first-parent commit on main that ADDED this file. That is the merge
 * commit of this PR, whose committer date IS the moment the wrapper began
 * recording. It cannot be too early or too late by construction, and it needs
 * no follow-up commit.
 *
 * The `main` ref below is LOAD-BEARING, not decoration. A ref-less `git log`
 * walks HEAD, and on the feature branch that adds this file HEAD's first-parent
 * history contains the branch-local addition - so the query returns a boundary
 * EARLIER than the merge, which is the exact "too early" failure this whole
 * design exists to prevent. Adoption is a fact about main.
 *
 * `null` - the file not yet on main - means "not yet adopted". The report says
 * so by name and WITHHOLDS the silent list, rather than treating an unset
 * boundary as the epoch and accusing all 668 pre-adoption merges at once.
 */
export function adoptionBoundary(repoRoot: string): string | null {
  try {
    const out = execFileSync(
      "git",
      [
        "log",
        "--first-parent",
        "--diff-filter=A",
        "--format=%cI",
        "main",
        "--",
        "lib/reviewRounds/constants.ts",
      ],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    // Last line: the OLDEST addition, in case the file were ever removed and
    // re-added. Adoption is when it FIRST went live, not the latest churn.
    const lines = out.split("\n").filter(Boolean);
    return lines.length > 0 ? (lines[lines.length - 1] as string) : null;
  } catch {
    return null;
  }
}
export type CountedStage = (typeof COUNTED_STAGES)[number];

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

export function isCountedStage(v: unknown): v is CountedStage {
  return typeof v === "string" && (COUNTED_STAGES as readonly string[]).includes(v);
}
