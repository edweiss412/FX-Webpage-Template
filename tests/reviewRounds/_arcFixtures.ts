import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The ONE list of arc-resolution fixtures. Two implementations of `resolveArc`
 * exist - lib/reviewRounds/arc.ts, and the plain-JS mirror the wrapper runs at
 * scripts/reviewRoundEmit.mjs - and enumerating cases separately per suite is
 * exactly the thing that drifts. Both tests/reviewRounds/arc.test.ts and
 * tests/reviewRounds/bridgeParity.test.ts build from these, so a case added
 * here covers the bridge automatically.
 */

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * `realpathSync` because the assertions compare `resolveArc`'s output against a
 * path built from this directory: on macOS `os.tmpdir()` is `/var/folders/...`,
 * a symlink into `/private/var/folders/...`, and `git rev-parse --show-toplevel`
 * reports the resolved physical path. Resolving here keeps the comparison about
 * WHICH directory roots the corpus - the thing under test - rather than about
 * which of two spellings of one directory the fixture happened to pick.
 */
export function mkTmpDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/** A real repo with a `main` and one commit, network-free and deterministic. */
export function makeRepo(): string {
  const dir = mkTmpDir("arc-repo-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, "add", "seed.txt");
  git(dir, "commit", "-qm", "seed");
  // `origin/main` without a network: a local remote-tracking ref.
  git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "HEAD"));
  return dir;
}

/** Branch names live here so a fixture and the test asserting on it cannot drift. */
export const FEATURE_BRANCH = "feat/foo";
export const SUBDIR_BRANCH = "feat/sub";
export const REUSED_BRANCH = "feat/reused";
export const NO_REMOTE_BRANCH = "feat/x";
export const UNBORN_BRANCH = "feat/unborn";
/** Relative subdirectory the subdirectory-cwd case hands to `resolveArc`. */
export const SUBDIR_PARTS = ["app", "nested"] as const;

/** An ordinary live arc: a feature branch with one commit past the branch point. */
export function featureBranchRepo(): string {
  const dir = makeRepo();
  git(dir, "checkout", "-q", "-b", FEATURE_BRANCH);
  writeFileSync(join(dir, "a.txt"), "a\n");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-qm", "work");
  return dir;
}

/** The repo root of the subdirectory case, for tests that need both ends. */
export function subdirectoryRepo(): string {
  const dir = makeRepo();
  git(dir, "checkout", "-q", "-b", SUBDIR_BRANCH);
  mkdirSync(join(dir, ...SUBDIR_PARTS), { recursive: true });
  return dir;
}

/** A `--cwd` deep inside the repo, which must still root the corpus at the toplevel. */
export function subdirectoryCwd(): string {
  return join(subdirectoryRepo(), ...SUBDIR_PARTS);
}

/** Advance trunk, then recreate `branch` off the new tip: one name, two arcs. */
export function advanceTrunkAndRecreate(dir: string, branch: string): void {
  git(dir, "checkout", "-q", "main");
  writeFileSync(join(dir, "b.txt"), "b\n");
  git(dir, "add", "b.txt");
  git(dir, "commit", "-qm", "main advances");
  git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "HEAD"));
  git(dir, "branch", "-qD", branch);
  git(dir, "checkout", "-q", "-b", branch);
}

/** The SECOND arc to wear a reused branch name - a distinct merge base. */
export function reusedBranchRepo(): string {
  const dir = makeRepo();
  git(dir, "checkout", "-q", "-b", REUSED_BRANCH);
  advanceTrunkAndRecreate(dir, REUSED_BRANCH);
  return dir;
}

/** Not a repository at all: the wrapper warns and skips (plan R1). */
export function plainDir(): string {
  return mkTmpDir("arc-plain-");
}

export function detachedHeadRepo(): string {
  const dir = makeRepo();
  git(dir, "checkout", "-q", "--detach");
  return dir;
}

export function onMainRepo(): string {
  return makeRepo();
}

/** A repo with no `origin/main` ref, so no merge base can be computed. */
export function noMergeBaseRepo(): string {
  const dir = mkTmpDir("arc-noremote-");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  writeFileSync(join(dir, "s.txt"), "s\n");
  git(dir, "add", "s.txt");
  git(dir, "commit", "-qm", "seed");
  git(dir, "checkout", "-q", "-b", NO_REMOTE_BRANCH);
  return dir;
}

/**
 * A repo whose HEAD is UNBORN: `git init` and nothing else. HEAD is on a branch;
 * there is simply no commit for it to point at. Real fixture shape - the lint-doc
 * suite plants one (tests/codexGuard/lintDoc.test.ts `plantDoc`) - and reading it
 * as a detached HEAD refuses a whole class of dispatches that should warn and skip.
 */
export function unbornBranchRepo(): string {
  const dir = mkTmpDir("arc-unborn-");
  git(dir, "init", "-q", "-b", UNBORN_BRANCH);
  return dir;
}

/** Every arc-resolution case, as (name, cwd-builder) pairs. */
export function arcFixtureCases(): [name: string, build: () => string][] {
  return [
    ["feature branch", featureBranchRepo],
    ["subdirectory cwd", subdirectoryCwd],
    ["reused branch", reusedBranchRepo],
    ["plain dir", plainDir],
    ["detached HEAD", detachedHeadRepo],
    ["on main", onMainRepo],
    ["no merge base", noMergeBaseRepo],
    ["unborn branch", unbornBranchRepo],
  ];
}
