import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const CORPUS_DIR = join("docs", "review-rounds");

export type ArcRefusalKind = "not_a_repo" | "detached_head" | "on_main" | "no_merge_base";

export type ArcResolution =
  | {
      ok: true;
      repoRoot: string;
      branch: string;
      baseSha: string;
      corpusFile: string;
      filingFile: string;
    }
  | { ok: false; kind: ArcRefusalKind; problem: string };

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Arc identity is `(branch, merge-base SHA)` read from git, NEVER from `--out`
 * path naming (spec §5.2). A branch name is not unique over time - this
 * repository has already reused three across distinct PRs - and keyed on
 * branch alone a later arc inherits a merged arc's corpus and its filing.
 */
export function resolveArc(cwd: string): ArcResolution {
  // Resolve against the git TOPLEVEL, not `--cwd`: the wrapper validates
  // `--cwd` only as a directory, so a dispatch handed a repo subdirectory
  // would otherwise write its corpus somewhere the gate never walks.
  const repoRoot = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (repoRoot === null) {
    return { ok: false, kind: "not_a_repo", problem: `not a git repository: ${cwd}` };
  }

  // `symbolic-ref`, NOT `rev-parse --abbrev-ref`: on an UNBORN branch (a fresh
  // `git init` with no commits) `rev-parse` cannot resolve HEAD to an object and
  // fails, which reads as a detached HEAD and refuses a dispatch that should
  // merely warn and skip. `symbolic-ref` asks the question actually being asked
  // - is HEAD on a branch - and answers it without needing a commit.
  const branch = git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (branch === null || branch === "" || branch === "HEAD") {
    return {
      ok: false,
      kind: "detached_head",
      problem: `HEAD is detached in ${repoRoot}; an arc has no identity without a branch`,
    };
  }
  if (branch === "main") {
    return { ok: false, kind: "on_main", problem: "HEAD is main; there is no arc to record" };
  }

  const base = git(cwd, ["merge-base", "origin/main", "HEAD"]);
  if (base === null || base.length < 12) {
    return {
      ok: false,
      kind: "no_merge_base",
      problem: `could not compute merge-base origin/main HEAD in ${repoRoot}`,
    };
  }
  const baseSha = base.slice(0, 12);

  // The branch is used AS A NESTED PATH, not slugged: flattening `/` to `-`
  // collides two branches differing only there.
  const corpusFile = join(repoRoot, CORPUS_DIR, ...branch.split("/"), `${baseSha}.jsonl`);
  return {
    ok: true,
    repoRoot,
    branch,
    baseSha,
    corpusFile,
    filingFile: corpusFile.replace(/\.jsonl$/, ".md"),
  };
}
