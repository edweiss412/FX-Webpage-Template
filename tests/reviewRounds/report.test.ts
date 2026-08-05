import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mergedArcs } from "../../lib/reviewRounds/mergedArcs";

const g = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * One repo carrying every shape the accept-set must decide (spec §11.3 layer 1):
 * the standard PR-merge subject, the second spelling, main merged INTO a
 * feature branch, a non-first-parent merge, an unrecognized subject, and a
 * branch whose main advanced after divergence.
 */
function fixtureRepo(): { dir: string; advancedBase: string; tookMainSha: string } {
  const dir = mkdtempSync(join(tmpdir(), "merged-arcs-"));
  g(dir, "init", "-q", "-b", "main");
  g(dir, "config", "user.email", "t@example.com");
  g(dir, "config", "user.name", "T");
  // A machine with global commit signing on would otherwise fail every commit
  // below with a fixture-setup error that reads like a producer bug.
  g(dir, "config", "commit.gpgsign", "false");
  const commit = (name: string, msg: string): void => {
    writeFileSync(join(dir, name), `${name}\n`);
    g(dir, "add", name);
    g(dir, "commit", "-qm", msg);
  };
  commit("seed.txt", "seed");

  // (a) standard PR merge, nested branch name
  g(dir, "checkout", "-q", "-b", "feat/nested-name");
  commit("a.txt", "a");
  g(dir, "checkout", "-q", "main");
  g(
    dir,
    "merge",
    "-q",
    "--no-ff",
    "feat/nested-name",
    "-m",
    "Merge pull request #101 from owner/feat/nested-name",
  );

  // (b) second spelling
  g(dir, "checkout", "-q", "-b", "chore/second-spelling");
  commit("b.txt", "b");
  g(dir, "checkout", "-q", "main");
  g(
    dir,
    "merge",
    "-q",
    "--no-ff",
    "chore/second-spelling",
    "-m",
    "Merge PR #102: chore/second-spelling - a thing",
  );

  // (c) main advances, THEN the branch merges - first parent != merge base
  g(dir, "checkout", "-q", "-b", "feat/advanced-main");
  commit("c.txt", "c");
  const advancedBase = g(dir, "merge-base", "main", "feat/advanced-main");
  g(dir, "checkout", "-q", "main");
  commit("d.txt", "main advances");
  g(
    dir,
    "merge",
    "-q",
    "--no-ff",
    "feat/advanced-main",
    "-m",
    "Merge pull request #103 from owner/feat/advanced-main",
  );

  // (d) main merged INTO a feature branch - NOT a merged feature arc.
  //
  // main MUST advance first. Without that, merging main into the branch is
  // already-up-to-date and creates NO COMMIT AT ALL, so the fixture holds zero
  // non-first-parent merges and a producer that omits --first-parent passes
  // the exclusion assertion vacuously.
  //
  // The branch must ALSO subsequently land on main. Without that the
  // main-into-branch merge is unreachable from main entirely, so bare
  // `git log --merges main` never sees it either and the exclusion assertion
  // is vacuous a SECOND way (measured: 5 merges reachable from main with and
  // without --first-parent, so dropping the flag changed nothing). Landing the
  // branch is also the real-history shape: the 239-of-916 non-first-parent
  // merges are reachable only through the second parent of the PR merge that
  // landed their branch.
  g(dir, "checkout", "-q", "-b", "feat/took-main");
  commit("e.txt", "e");
  g(dir, "checkout", "-q", "main");
  commit("e2.txt", "main advances again");
  g(dir, "checkout", "-q", "feat/took-main");
  g(dir, "merge", "-q", "--no-ff", "main", "-m", "Merge branch 'main' into feat/took-main");
  const tookMainSha = g(dir, "rev-parse", "HEAD");
  g(dir, "checkout", "-q", "main");
  g(
    dir,
    "merge",
    "-q",
    "--no-ff",
    "feat/took-main",
    "-m",
    "Merge pull request #104 from owner/feat/took-main",
  );

  // (e) a first-parent merge with an unrecognized subject
  g(dir, "checkout", "-q", "-b", "feat/mystery");
  commit("f.txt", "f");
  g(dir, "checkout", "-q", "main");
  g(dir, "merge", "-q", "--no-ff", "feat/mystery", "-m", "combine the mystery work");

  // (f) the LIVE ambiguous residue, copied from this repository's history: a
  // second-spelling subject whose first token IS a valid git branch name and
  // is NOT a branch. `git check-ref-format --branch M12.2` exits 0, so a
  // recognizer keyed on git-validity invents this branch instead of reporting
  // the residue.
  g(dir, "checkout", "-q", "-b", "feat/ambiguous-subject");
  commit("g.txt", "g");
  g(dir, "checkout", "-q", "main");
  g(
    dir,
    "merge",
    "-q",
    "--no-ff",
    "feat/ambiguous-subject",
    "-m",
    "Merge PR #4: M12.2 Phase B1 - admin nav shell + settings shell",
  );

  return { dir, advancedBase, tookMainSha };
}

const TOOK_MAIN_SUBJECT = "Merge branch 'main' into feat/took-main";

describe("merged-arc producer (spec §9, §11.3 layer 1)", () => {
  const { dir, advancedBase, tookMainSha } = fixtureRepo();
  const result = mergedArcs(dir);

  it("recognizes both PR-merge spellings", () => {
    const branches = result.recognized.map((a) => a.branch);
    expect(branches).toContain("feat/nested-name");
    expect(branches).toContain("chore/second-spelling");
  });

  // Failure caught: joining `nested-name` against a corpus stored at
  // `feat/nested-name`, so fully-recorded arcs come back as silent. 607 of the
  // 676 recognized merges in real history name a nested branch.
  it("extracts the WHOLE branch path after owner/, not the last component", () => {
    const arc = result.recognized.find((a) => a.branch.endsWith("nested-name"));
    expect(arc?.branch).toBe("feat/nested-name");
    expect(arc?.branch).not.toBe("nested-name");
  });

  // Failure caught: using the merge's first parent as baseSha. Measured on
  // real history, four of seven merges on the three reused branch names differ.
  it("reconstructs baseSha as merge-base of both parents, not the first parent", () => {
    const arc = result.recognized.find((a) => a.branch === "feat/advanced-main");
    expect(arc).toBeDefined();
    // Derived from the fixture repo, never a literal.
    expect(arc?.baseSha).toBe(advancedBase.slice(0, 12));
    const firstParent = g(dir, "rev-parse", `${arc?.sha}^1`);
    expect(arc?.baseSha).not.toBe(firstParent.slice(0, 12));
  });

  // Failure caught: inventing hundreds of silent arcs that never existed. In
  // real history 239 of 916 merges are main merged INTO a feature branch.
  //
  // Asserted BY SHA against both sets. The subject-level form
  // `expect(subjects).not.toContain(expect.stringContaining("Merge branch 'main' into"))`
  // is VACUOUS: `toContain` compares by identity and never applies an
  // asymmetric matcher, so it passes with the offending subject present
  // (measured directly against vitest 4.1.5).
  it("excludes main-merged-into-branch from BOTH sets", () => {
    // Premise: the fixture really does carry that merge, reachable from main.
    const reachable = g(dir, "log", "--merges", "main", "--format=%H").split("\n").filter(Boolean);
    expect(reachable).toContain(tookMainSha);

    expect(result.recognized.map((a) => a.sha)).not.toContain(tookMainSha);
    expect(result.unrecognized.map((u) => u.sha)).not.toContain(tookMainSha);
    expect(result.unrecognized.map((u) => u.subject)).not.toContain(TOOK_MAIN_SUBJECT);
    expect(result.recognized.map((a) => a.branch)).not.toContain("main");
    // The branch itself DID land, so its own PR merge is a real arc; only the
    // inner main-into-branch commit is excluded.
    expect(result.recognized.map((a) => a.branch)).toContain("feat/took-main");
  });

  // Failure caught: a residue silently dropped. Real history's single residue
  // - `Merge PR #4: …` - is a genuine PR merge in a second spelling, which is
  // exactly why the residue must be reported rather than assumed empty.
  it("reports the unrecognized residue BY SUBJECT, never dropping it", () => {
    expect(result.unrecognized.map((u) => u.subject)).toContain("combine the mystery work");
    expect(result.unrecognized.every((u) => u.sha.length > 0)).toBe(true);
  });

  // Failure caught: a recognizer keyed on git-validity inventing the branch
  // `M12.2` from the live residue subject, joining the corpus against a branch
  // that never existed and suppressing the one commit §9 requires be reported.
  it("does NOT invent a branch from a second-spelling subject with no slash", () => {
    expect(result.recognized.map((a) => a.branch)).not.toContain("M12.2");
    expect(result.unrecognized.map((u) => u.subject)).toContain(
      "Merge PR #4: M12.2 Phase B1 - admin nav shell + settings shell",
    );
    // Pin the premise, so this test cannot rot into a tautology if git changes:
    // ordinary git validation ACCEPTS the token, which is why validity is not
    // the discriminator.
    expect(() =>
      execFileSync("git", ["check-ref-format", "--branch", "M12.2"], {
        cwd: dir,
        stdio: "ignore",
      }),
    ).not.toThrow();
  });

  // Failure caught: a producer that omits --first-parent. Requires the fixture
  // to actually CONTAIN a non-first-parent merge REACHABLE FROM MAIN, which it
  // only does because main advances before feat/took-main merges it AND
  // feat/took-main subsequently lands.
  it("has a real non-first-parent merge in the fixture and excludes it", () => {
    const all = g(dir, "log", "--merges", "main", "--format=%H").split("\n").filter(Boolean);
    const firstParent = g(dir, "log", "--merges", "--first-parent", "main", "--format=%H")
      .split("\n")
      .filter(Boolean);
    // Derived from the fixture, not asserted as a literal count.
    expect(all.length).toBeGreaterThan(firstParent.length);
    expect(all).toContain(tookMainSha);
    expect(firstParent).not.toContain(tookMainSha);
    // Scanned commits are exactly the first-parent merges: nothing extra
    // sneaks in through a second parent.
    const scanned = [
      ...result.recognized.map((a) => a.sha),
      ...result.unrecognized.map((u) => u.sha),
    ];
    expect(scanned.slice().sort()).toEqual(firstParent.slice().sort());
  });

  it("reports the repository as not shallow", () => {
    expect(result.shallow).toBe(false);
  });
});
