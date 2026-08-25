import { execFileSync } from "node:child_process";

export type MergedArc = { sha: string; branch: string; baseSha: string; mergedAt: string };
export type UnrecognizedMerge = { sha: string; subject: string };
export type MergedArcsResult = {
  shallow: boolean;
  recognized: MergedArc[];
  unrecognized: UnrecognizedMerge[];
};

/** ASCII unit separator: a subject can contain anything except this. */
const FIELD_SEP = "\u001f";

function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** The standard GitHub merge subject. Branch is the WHOLE path after `owner/`. */
const PULL_REQUEST = /^Merge pull request #\d+ from [^/\s]+\/(.+)$/;

/**
 * The second spelling. The capture MUST contain a `/`.
 *
 * "Parses as a branch name" is NOT a sufficient test. The one real residue in
 * this repository's history is `Merge PR #4: M12.2 Phase B1 ...`, and
 * `git check-ref-format --branch M12.2` EXITS 0 - ordinary git validation
 * accepts the token. A recognizer keyed on git-validity therefore invents the
 * branch `M12.2`, joins the corpus against a branch that never existed, and
 * silently converts the one commit §9 requires be REPORTED into a fictitious
 * arc. Requiring a `/` keeps it in the residue, which is where §9 measured it.
 */
const SECOND_SPELLING = /^Merge PR #\d+: (\S+\/\S+)/;

/** A first-parent merge, classified by SUBJECT only — no base resolved. */
export type ClassifiedMerge = { sha: string; branch: string; mergedAt: string };
export type ClassifiedResult = {
  shallow: boolean;
  recognized: ClassifiedMerge[];
  unrecognized: UnrecognizedMerge[];
};

/**
 * The cheap half of `mergedArcs`: ONE `git log`, no per-merge process spawns.
 *
 * `mergedArcs` costs one `git merge-base` PROCESS per recognized merge, and main
 * carries roughly 850 first-parent merges, so its cost grows monotonically with
 * the repository's merge count. Measured 2026-08-24 as a live fleet blocker:
 * 24.79s on a quiet box, then 34.66s after one day's merges landed, against a
 * 30s default test ceiling — it will red every arc's suite from now on, and
 * raising the ceiling only moves the date.
 *
 * Callers that need the ACCOUNTING — every first-parent merge is either
 * recognized or reported, never dropped — do not need a base at all, and should
 * use this. `mergedArcs` stays for callers that genuinely consume `baseSha`,
 * which is the silent-arc join in `scripts/review-economy.ts`.
 */
export function classifyFirstParentMerges(repoRoot: string): ClassifiedResult {
  if (git(repoRoot, ["rev-parse", "--is-shallow-repository"]) === "true") {
    return { shallow: true, recognized: [], unrecognized: [] };
  }
  const log = git(repoRoot, [
    "log",
    "--merges",
    "--first-parent",
    "main",
    "--format=%H%x1f%s%x1f%cI",
  ]);
  const recognized: ClassifiedMerge[] = [];
  const unrecognized: UnrecognizedMerge[] = [];
  for (const line of (log ?? "").split("\n")) {
    if (line.trim() === "") continue;
    const fields = line.split(FIELD_SEP);
    const sha = fields[0] ?? "";
    const subject = fields[1] ?? "";
    const mergedAt = fields[2] ?? "";
    const branch = PULL_REQUEST.exec(subject)?.[1] ?? SECOND_SPELLING.exec(subject)?.[1] ?? null;
    if (branch === null) unrecognized.push({ sha, subject });
    else recognized.push({ sha, branch, mergedAt });
  }
  return { shallow: false, recognized, unrecognized };
}

export function mergedArcs(repoRoot: string): MergedArcsResult {
  // First, and unconditional. A shallow clone presents truncated history as
  // complete, and depth-1 is the NORMAL CI state - a scan that answers from it
  // is a partial answer labelled complete, which is the §8.2 failure.
  if (git(repoRoot, ["rev-parse", "--is-shallow-repository"]) === "true") {
    return { shallow: true, recognized: [], unrecognized: [] };
  }

  // `--first-parent`, not bare `--merges`: 239 of 916 real merge commits are
  // main merged INTO a feature branch, and counting those would invent hundreds
  // of silent arcs that never existed.
  const log = git(repoRoot, [
    "log",
    "--merges",
    "--first-parent",
    "main",
    "--format=%H%x1f%s%x1f%cI",
  ]);

  const recognized: MergedArc[] = [];
  const unrecognized: UnrecognizedMerge[] = [];
  for (const line of (log ?? "").split("\n")) {
    if (line.trim() === "") continue;
    const fields = line.split(FIELD_SEP);
    const sha = fields[0] ?? "";
    const subject = fields[1] ?? "";
    const mergedAt = fields[2] ?? "";

    // An ACCEPT-set over subjects, keyed on structure. A denylist would accept
    // whatever it failed to model, which is how a residue becomes an invention.
    const branch = PULL_REQUEST.exec(subject)?.[1] ?? SECOND_SPELLING.exec(subject)?.[1] ?? null;
    if (branch === null) {
      // Reported BY SUBJECT, never dropped and never guessed at.
      unrecognized.push({ sha, subject });
      continue;
    }

    // NEVER the first parent, which equals the merge base only when main did not
    // advance after the branch diverged. Measured on real history: four of the
    // seven merges on the three reused branch names differ.
    const base = git(repoRoot, ["merge-base", `${sha}^1`, `${sha}^2`]);
    if (base === null || base.length < 12) {
      // A merge without two reachable parents has no reconstructible base, so it
      // is residue rather than an arc with a guessed identity.
      unrecognized.push({ sha, subject });
      continue;
    }
    recognized.push({ sha, branch, baseSha: base.slice(0, 12), mergedAt });
  }
  return { shallow: false, recognized, unrecognized };
}
