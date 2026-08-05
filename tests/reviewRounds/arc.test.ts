import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveArc } from "../../lib/reviewRounds/arc";
import {
  advanceTrunkAndRecreate,
  detachedHeadRepo,
  FEATURE_BRANCH,
  featureBranchRepo,
  git,
  makeRepo,
  noMergeBaseRepo,
  onMainRepo,
  plainDir,
  REUSED_BRANCH,
  SUBDIR_PARTS,
  subdirectoryCwd,
  unbornBranchRepo,
} from "./_arcFixtures";

describe("arc identity (spec §5.2)", () => {
  it("resolves branch and 12-char merge base, and nests the branch as a path", () => {
    const dir = featureBranchRepo();
    // The branch point, derived from the repo: the fixture set `origin/main` to
    // it and the arc's commit sits past it.
    const base = git(dir, "rev-parse", "origin/main");

    const arc = resolveArc(dir);
    expect(arc.ok).toBe(true);
    if (!arc.ok) return;
    expect(arc.branch).toBe(FEATURE_BRANCH);
    // Derived from the repo, never a literal.
    expect(arc.baseSha).toBe(base.slice(0, 12));
    expect(arc.baseSha).toHaveLength(12);
    // Failure caught: slugging `/` to `-`, which collides two branches
    // differing only there.
    expect(arc.corpusFile).toBe(
      join(
        dir,
        "docs",
        "review-rounds",
        ...FEATURE_BRANCH.split("/"),
        `${base.slice(0, 12)}.jsonl`,
      ),
    );
    expect(arc.filingFile).toBe(arc.corpusFile.replace(/\.jsonl$/, ".md"));
  });

  // Failure caught: a corpus written under `<repo>/app/docs/review-rounds/`
  // that the gate - walking from the repo root - never sees, so an obliged
  // arc passes. Silent wrongness, not a conservative outcome.
  it("resolves the corpus root against the git toplevel, not against --cwd", () => {
    const sub = subdirectoryCwd();
    // Derived from the fixture's own nesting depth, not a literal path.
    const dir = resolve(sub, ...SUBDIR_PARTS.map(() => ".."));

    const fromRoot = resolveArc(dir);
    const fromSub = resolveArc(sub);
    expect(fromRoot.ok && fromSub.ok).toBe(true);
    if (!fromRoot.ok || !fromSub.ok) return;
    expect(fromSub.corpusFile).toBe(fromRoot.corpusFile);
    expect(fromSub.corpusFile).not.toContain(join(...SUBDIR_PARTS));
  });

  // Failure caught: a later arc reusing a merged arc's branch name inheriting
  // its corpus AND its filing - the gate then reports compliance for an arc
  // that burned four rounds and filed nothing. Real: this repo has reused
  // three branch names across distinct PRs (spec §5.2).
  it("gives two arcs on one branch name distinct files when the merge base differs", () => {
    const dir = makeRepo();
    git(dir, "checkout", "-q", "-b", REUSED_BRANCH);
    const first = resolveArc(dir);

    advanceTrunkAndRecreate(dir, REUSED_BRANCH);
    const second = resolveArc(dir);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.baseSha).not.toBe(first.baseSha);
    expect(second.corpusFile).not.toBe(first.corpusFile);
  });

  // Failure caught: resolving the base as `rev-parse origin/main` rather than
  // `merge-base origin/main HEAD`. Every other case in this file is blind to
  // the difference - they only ever resolve an arc whose branch point IS the
  // current trunk tip - and the mutation survives them all. It is not a
  // cosmetic difference: trunk advances constantly while an arc is live, so a
  // tip-keyed base renames the corpus mid-arc, and rounds 1-2 land in one file
  // and rounds 3-4 in another. The threshold then never trips on either, which
  // is the gate silently passing an arc that owes a filing.
  it("keys the base to the branch point, so trunk advancing mid-arc does not move the corpus", () => {
    const dir = makeRepo();
    const branchPoint = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "-b", "feat/live");
    writeFileSync(join(dir, "work.txt"), "work\n");
    git(dir, "add", "work.txt");
    git(dir, "commit", "-qm", "round 1 lands");
    const before = resolveArc(dir);

    // Trunk moves under a live arc; the arc itself is untouched.
    git(dir, "checkout", "-q", "main");
    writeFileSync(join(dir, "trunk.txt"), "trunk\n");
    git(dir, "add", "trunk.txt");
    git(dir, "commit", "-qm", "someone else merges");
    git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "HEAD"));
    git(dir, "checkout", "-q", "feat/live");
    const after = resolveArc(dir);

    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    // Derived from the repo, never a literal - and NOT the advanced trunk tip.
    expect(before.baseSha).toBe(branchPoint.slice(0, 12));
    expect(after.baseSha).toBe(before.baseSha);
    expect(after.corpusFile).toBe(before.corpusFile);
    expect(after.baseSha).not.toBe(git(dir, "rev-parse", "origin/main").slice(0, 12));
  });

  // Plan resolution R1: outside a repo there is no arc to record, so this is a
  // warning-and-skip, not a refusal to run. Failure caught: an exception that
  // breaks every existing tests/codexGuard run (harness.ts:127 mkdirSync).
  it("reports not_a_repo for a plain directory", () => {
    const arc = resolveArc(plainDir());
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("not_a_repo");
  });

  // Failure caught: rows landing in a nonsense location. Inside a repo a
  // detached HEAD IS a live arc whose identity cannot be determined, so
  // under-recording it silently is the §8.2 failure.
  it("reports detached_head on a detached checkout", () => {
    const arc = resolveArc(detachedHeadRepo());
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("detached_head");
  });

  it("reports on_main when HEAD is the trunk", () => {
    const arc = resolveArc(onMainRepo());
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("on_main");
  });

  it("reports no_merge_base when origin/main is absent", () => {
    const arc = resolveArc(noMergeBaseRepo());
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).toBe("no_merge_base");
  });

  // Failure caught, and observed for real: `git rev-parse --abbrev-ref HEAD`
  // FAILS on an unborn branch (a `git init` with no commits), so an empty repo
  // reads as a detached HEAD - and the wrapper refuses a detached HEAD outright
  // rather than warning and skipping. That turned nine pre-existing lint-doc
  // scenarios, whose --cwd is exactly such a repo
  // (tests/codexGuard/lintDoc.test.ts `plantDoc`), into exit-2 usage errors.
  // HEAD is on a branch here; there is just nothing for it to point at.
  it("does not mistake an unborn branch for a detached HEAD", () => {
    const arc = resolveArc(unbornBranchRepo());
    expect(arc.ok).toBe(false);
    if (arc.ok) return;
    expect(arc.kind).not.toBe("detached_head");
    expect(arc.kind).toBe("no_merge_base");
  });
});
