import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";
import { ROUND_THRESHOLD } from "../../lib/reviewRounds/constants";
import { mergedArcs } from "../../lib/reviewRounds/mergedArcs";
import { buildReport, main, render } from "../../scripts/review-economy";

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

/** Plant a corpus tree under `root` and return `root`. Paths are relative to
 *  docs/review-rounds/, exactly as on disk. */
function corpus(root: string, files: { path: string; body: string }[]): string {
  for (const f of files) {
    const abs = join(root, "docs", "review-rounds", f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.body);
  }
  return root;
}

const jrow = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    stage: "diff",
    round: 1,
    branch: "feat/foo",
    baseSha: "aaaaaaaaaaaa",
    label: null,
    status: "verdict",
    verdict: "APPROVE",
    failureReason: null,
    findingCount: null,
    startedAt: "2026-09-03T00:00:00.000Z",
    endedAt: "2026-09-03T00:10:00.000Z",
    briefPath: "b.md",
    outDir: "o",
    guardVersion: 1,
    recoveredFrom: null,
    ...over,
  });

const jrows = (...o: Record<string, unknown>[]): string => o.map(jrow).join("\n") + "\n";

/** Derived from ROUND_THRESHOLD - a fixture that cannot reach the threshold
 *  makes every trigger assertion below vacuous. */
const OBLIGE = Array.from({ length: ROUND_THRESHOLD }, (_, i) => ({ round: i + 1 }));

/** The report's boundary in tests is injected, never the production one:
 *  `adoptionBoundary(repoRoot)` reads git for the first-parent commit on main
 *  that added lib/reviewRounds/constants.ts, so a suite that called it would
 *  return null in every fixture repo and change behavior the day this merges. */
const BOUNDARY = "2026-09-01T00:00:00.000Z";
const opts = { adoptionBoundary: BOUNDARY };

describe("report aggregation (spec §9)", () => {
  // Failure caught: collapsing stages into one number, which cannot be
  // compared against a per-stage threshold, and an implementation that counts
  // every RECORDED row against it.
  it("reports rounds PER STAGE, counted and recorded separately", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-stage-")), [
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows(
          { stage: "spec", round: 1 },
          { stage: "spec", round: 2 },
          { stage: "diff", round: 1 },
          { stage: "diff", round: 1 },
          {
            stage: "diff",
            round: 2,
            status: "no_verdict",
            verdict: null,
            failureReason: "wrapper_error",
          },
          { stage: "task", round: 1 },
        ),
      },
    ]);
    const arc = buildReport(root, opts).arcs.find((a) => a.baseSha === "aaaaaaaaaaaa");
    expect(arc?.stages.spec).toEqual({ counted: 2, recorded: 2 });
    // Two rows share round 1, so counted is 1; the no_verdict row is recorded
    // but never counted.
    expect(arc?.stages.diff).toEqual({ counted: 1, recorded: 3 });
    expect(arc?.stages.task).toEqual({ counted: 0, recorded: 1 });
  });

  // Failure caught: a branch-only join reading an older arc's rows as evidence
  // for a later one. THIS FAILS AND EVERY OTHER TEST IN THIS FILE PASSES,
  // which is exactly how the defect would ship. Mirrors real history: this
  // repo has reused three branch names across distinct PRs.
  it("lists the newer arc as silent when an older arc shares its branch name", () => {
    const root = mkdtempSync(join(tmpdir(), "rep-join-"));
    corpus(root, [
      {
        path: "feat/reused/aaaaaaaaaaaa.jsonl",
        body: jrows(...OBLIGE.map((o) => ({ ...o, branch: "feat/reused" }))),
      },
    ]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        {
          sha: "1".repeat(40),
          branch: "feat/reused",
          baseSha: "aaaaaaaaaaaa",
          mergedAt: "2026-09-04T00:00:00.000Z",
        },
        {
          sha: "2".repeat(40),
          branch: "feat/reused",
          baseSha: "cccccccccccc",
          mergedAt: "2026-09-05T00:00:00.000Z",
        },
      ],
    });
    const silent = report.silentArcs?.map((a) => a.baseSha) ?? [];
    expect(silent).toContain("cccccccccccc");
    expect(silent).not.toContain("aaaaaaaaaaaa");
  });

  // Failure caught: a stage that began in one month and crossed in the next
  // landing in two buckets, which makes a monthly rate exceed 1 and reports
  // the first month as two different numbers.
  it("buckets a stage by its FIRST counted row's month and counts it triggered if it EVER crossed", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-rate-")), [
      {
        // Crosses the threshold, but its first counted row is in September.
        path: "feat/spanner/aaaaaaaaaaaa.jsonl",
        body: jrows(
          ...OBLIGE.slice(0, ROUND_THRESHOLD - 1).map((o) => ({
            ...o,
            branch: "feat/spanner",
            startedAt: "2026-09-28T00:00:00.000Z",
          })),
          { round: ROUND_THRESHOLD, branch: "feat/spanner", startedAt: "2026-10-02T00:00:00.000Z" },
        ),
      },
      {
        // Same September bucket, never crosses.
        path: "feat/short/bbbbbbbbbbbb.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/short",
          baseSha: "bbbbbbbbbbbb",
          startedAt: "2026-09-10T00:00:00.000Z",
        }),
      },
    ]);
    const rate = buildReport(root, opts).triggerRateByMonth;
    // Population and numerator both derived from the fixture: two (arc, stage)
    // pairs in 2026-09, one of which ever crossed.
    expect(rate["2026-09"]).toEqual({ population: 2, triggered: 1, rate: 0.5 });
    // The crossing does NOT also create an October bucket.
    expect(rate["2026-10"]).toBeUndefined();
  });

  // Failure caught: a rate computed over arcs rather than over (arc, stage)
  // pairs that actually completed a review.
  it("excludes task stages and no-verdict-only stages from the rate population", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-pop-")), [
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows(
          { stage: "spec", round: 1 },
          { stage: "task", round: 1 },
          {
            stage: "plan",
            round: 1,
            status: "no_verdict",
            verdict: null,
            failureReason: "attempts_exhausted",
          },
        ),
      },
    ]);
    // Only the spec stage completed a review, so the population is 1.
    expect(buildReport(root, opts).triggerRateByMonth["2026-09"]?.population).toBe(1);
  });

  // Failure caught: null folded into zero, which understates every total and
  // is indistinguishable from "no findings found".
  it("totals findingCount over declared rows only and reports undeclared as its own count", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-find-")), [
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows(
          { round: 1, findingCount: 5 },
          { round: 2, findingCount: 0 },
          { round: 3, findingCount: null },
        ),
      },
    ]);
    const f = buildReport(root, opts).findingsByStage.diff;
    // 5 + 0 over the two DECLARED rows. A null-as-zero implementation reports
    // the same total but declaredRows: 3, so both fields are asserted.
    expect(f).toEqual({ total: 5, declaredRows: 2, undeclaredRows: 1 });
  });

  it("lists a merged arc with zero rows as silent and one with rows as not", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-silent-")), [
      {
        path: "feat/recorded/aaaaaaaaaaaa.jsonl",
        body: jrows({ round: 1, branch: "feat/recorded" }),
      },
    ]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        {
          sha: "1".repeat(40),
          branch: "feat/recorded",
          baseSha: "aaaaaaaaaaaa",
          mergedAt: "2026-09-04T00:00:00.000Z",
        },
        {
          sha: "2".repeat(40),
          branch: "feat/quiet",
          baseSha: "bbbbbbbbbbbb",
          mergedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    });
    expect(report.silentArcs?.map((a) => a.branch)).toEqual(["feat/quiet"]);
  });

  // Failure caught: the 668-arc mass false classification.
  it("excludes pre-adoption merges from the silent list and reports them as a single count", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adopt-")), []);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        {
          sha: "1".repeat(40),
          branch: "feat/ancient",
          baseSha: "aaaaaaaaaaaa",
          mergedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          sha: "2".repeat(40),
          branch: "feat/modern",
          baseSha: "bbbbbbbbbbbb",
          mergedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    });
    expect(report.silentArcs?.map((a) => a.branch)).toEqual(["feat/modern"]);
    expect(report.preAdoptionMergeCount).toBe(1);
    // Reported as a COUNT, never enumerated (spec §8.3 limit 7).
    expect(report).not.toHaveProperty("preAdoptionArcs");
  });

  // Failure caught: THIS arc's own merge reported as silent. The boundary IS
  // the committer date of the merge that puts the constants module on main, so
  // the adoption arc's mergedAt equals it exactly; a strictly-less pre-adoption
  // test drops that equality into the post-adoption branch, and this arc has no
  // corpus by ratified design (spec §12), so the report accuses the very merge
  // that created it. Every other case in this file passes either way.
  it("treats a merge whose timestamp EQUALS the boundary as pre-adoption", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-equal-")), []);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        // mergedAt is BOUNDARY itself, not a second literal that could drift
        // away from it and make the equality this test is named for untested.
        {
          sha: "3".repeat(40),
          branch: "feat/the-adoption-merge",
          baseSha: "ffffffffffff",
          mergedAt: BOUNDARY,
        },
      ],
    });
    expect(report.silentArcs).toEqual([]);
    expect(report.preAdoptionMergeCount).toBe(1);
  });

  // The two cases that pass TRIVIALLY under a boundary derived from the corpus,
  // which is why the boundary is declared. Both are silent wrongness.
  it("lists a zero-row arc merged AFTER the boundary but BEFORE the earliest corpus row as silent", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-gap-")), [
      // Earliest row is 2026-09-03; a derived boundary would be that date.
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body: jrows({ round: 1 }) },
    ]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        {
          sha: "9".repeat(40),
          branch: "feat/first-silent",
          baseSha: "dddddddddddd",
          mergedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });
    expect(report.silentArcs?.map((a) => a.branch)).toContain("feat/first-silent");
    expect(report.preAdoptionMergeCount).toBe(0);
  });

  it("still lists post-boundary zero-row merges as silent when the corpus is EMPTY", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-empty-")), []);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        {
          sha: "9".repeat(40),
          branch: "feat/nothing-recorded",
          baseSha: "eeeeeeeeeeee",
          mergedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    });
    // A derived boundary is null here, the universe collapses to empty, and the
    // report declares all-clear in exactly the state where nothing is recorded.
    expect(report.silentArcs?.map((a) => a.branch)).toEqual(["feat/nothing-recorded"]);
  });

  // --- boundary advisory: exclusion rule, accept-set, wording (spec §3, §4) ---
  //
  // Spec §3.4 VERBATIM, written here as a test-local literal and never imported
  // from the implementation: an assertion built out of the module's own constant
  // is satisfied by whatever that module emits, including an empty string.
  // Parameterised by BOTH interpolations so P1 mutant (d) - the advisory's row
  // timestamp swapped for another row's - fails the case that names it.
  const advisoryLine = (earliest: string, boundary: string): string =>
    `ADVISORY: the earliest recorded row (${earliest}) precedes the declared adoption boundary (${boundary}) and no same-branch pre-adoption merge covers it — the boundary, the row's arc attribution, or the row's own timing is in question.`;

  /** Spec §3.2's note, asserted as a FULL LINE (`notes` array containment), so
   *  P1 mutant (b) - the same content plus a suffix - fails rather than passing
   *  a substring match. */
  const unplaceableNote = (n: number): string =>
    `${n} row(s) without a placeable startedAt are invisible to the boundary advisory.`;

  /** The shallow refusal note with its §3.5 extension, likewise full-line. */
  const SHALLOW_NOTE =
    "merged-arc scan REFUSED: this is a shallow clone, so its history is truncated. The silent-arc list is withheld, not empty; the boundary advisory is withheld for the same reason.";

  /** A recognized merge. `sha` is DERIVED from the branch and timestamp, so the
   *  two merges of case 9 cannot silently share one identity. */
  const merge = (
    branch: string,
    mergedAt: string,
    baseSha = "aaaaaaaaaaaa",
  ): { sha: string; branch: string; baseSha: string; mergedAt: string } => ({
    sha: Buffer.from(`${branch} ${mergedAt}`).toString("hex").slice(0, 40).padEnd(40, "0"),
    branch,
    baseSha,
    mergedAt,
  });

  /**
   * The premise every null-asserting exclusion case rests on: the SAME corpus,
   * with the merge set emptied, must FIRE. Without it, a case asserting
   * `boundaryAdvisory === null` passes on any corpus that never had a
   * pre-boundary row at all — the whole exclusion rule could be deleted and the
   * case would stay green. Stated on each case's OWN inputs (the same `root`,
   * varying only the merges), never on an adjacent fixture.
   */
  const premiseFiresWithoutMerges = (root: string): void =>
    premiseHolds(
      "this corpus fires the advisory once its merges are removed, so the null asserted below is the exclusion rule's doing",
      buildReport(root, { ...opts, mergedArcs: [] }).boundaryAdvisory !== null,
    );

  it("prints an advisory mismatch when the earliest corpus row precedes the boundary", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-mismatch-")), [
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows({ round: 1, startedAt: "2026-08-15T00:00:00.000Z" }),
      },
    ]);
    const report = buildReport(root, opts);
    // Reworded per spec §3.4 - the ONE existing assertion this arc changes.
    // Full-line equality, not `toContain`, because a substring match on the
    // timestamp survives every one of P1's four string mutants.
    expect(report.boundaryAdvisory).toBe(advisoryLine("2026-08-15T00:00:00.000Z", BOUNDARY));
  });

  // §4 case 1 (AC-W2.1). Failure caught: `earliest` computed over ALL rows
  // (scripts/review-economy.ts, the `.flatMap((a) => a.rows)` selection), which
  // is the LIVE defect - the wrapper wrote rows on the adoption branch hours
  // before that branch merged, and the report calls the constant wrong on every
  // run. The merge's baseSha DIFFERS from the corpus path's, because
  // `mergedArcs` derives baseSha from the merge-base of the merge's two
  // parents, so a split arc's earlier segments can never match an exact arcKey:
  // an implementation joining on arcKey(branch, baseSha) still fires here.
  it("excludes a pre-boundary row covered by its branch's pre-adoption merge, joined on branch and time rather than arcKey", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-split-")), [
      {
        path: "feat/split/111111111111.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/split",
          baseSha: "111111111111",
          startedAt: "2026-08-20T00:00:00.000Z",
        }),
      },
    ]);
    premiseFiresWithoutMerges(root);
    const report = buildReport(root, {
      ...opts,
      // Same branch, DIFFERENT baseSha, mergedAt at the boundary itself (the
      // `<=` carve-out makes it pre-adoption).
      mergedArcs: [merge("feat/split", BOUNDARY, "222222222222")],
    });
    expect(report.boundaryAdvisory).toBeNull();
  });

  // §4 case 2 (AC-W2.2). Failure caught: an exclusion rule so wide it swallows
  // the signal the advisory exists for. The companion pins STRICTLY-precedes:
  // a `<= boundary` mutant at the advisory condition prints "precedes" about a
  // timestamp that equals the boundary.
  it("still fires for an unexplained pre-boundary row, and only when the row STRICTLY precedes the boundary", () => {
    const unexplained = (startedAt: string): string =>
      jrows({ round: 1, branch: "feat/lonely", baseSha: "333333333333", startedAt });

    const firing = buildReport(
      corpus(mkdtempSync(join(tmpdir(), "rep-adv-lonely-")), [
        { path: "feat/lonely/333333333333.jsonl", body: unexplained("2026-08-20T00:00:00.000Z") },
      ]),
      { ...opts, mergedArcs: [] },
    );
    expect(firing.boundaryAdvisory).toBe(advisoryLine("2026-08-20T00:00:00.000Z", BOUNDARY));

    // Companion: the only unexplained row sits EXACTLY at the boundary.
    const atBoundary = buildReport(
      corpus(mkdtempSync(join(tmpdir(), "rep-adv-at-boundary-")), [
        { path: "feat/lonely/333333333333.jsonl", body: unexplained(BOUNDARY) },
      ]),
      { ...opts, mergedArcs: [] },
    );
    expect(atBoundary.boundaryAdvisory).toBeNull();
  });

  // §4 case 3 (AC-W2.3). The time cap's premise, stated executably: without the
  // firing run the cap could be deleted entirely and every other case would
  // still pass. The companion pins the cap as INCLUSIVE - a `<` cap strands a
  // row whose startedAt equals the merge's mergedAt, and neither of the firing
  // run's comparisons discriminates `<` from `<=`.
  it("counts a row written AFTER its branch's pre-adoption merge, and treats the cap boundary as inclusive", () => {
    const MERGED_AT = "2026-08-10T00:00:00.000Z";
    const reused = (startedAt: string): string =>
      jrows({ round: 1, branch: "feat/reuse", baseSha: "444444444444", startedAt });
    const withMerge = { ...opts, mergedArcs: [merge("feat/reuse", MERGED_AT)] };

    const afterMerge = buildReport(
      corpus(mkdtempSync(join(tmpdir(), "rep-adv-reuse-")), [
        { path: "feat/reuse/444444444444.jsonl", body: reused("2026-08-20T00:00:00.000Z") },
      ]),
      withMerge,
    );
    expect(afterMerge.boundaryAdvisory).toBe(advisoryLine("2026-08-20T00:00:00.000Z", BOUNDARY));

    // Companion: EXACTLY at the merge's timestamp, so the cap must include it.
    const atMerge = buildReport(
      corpus(mkdtempSync(join(tmpdir(), "rep-adv-at-merge-")), [
        { path: "feat/reuse/444444444444.jsonl", body: reused(MERGED_AT) },
      ]),
      withMerge,
    );
    expect(atMerge.boundaryAdvisory).toBeNull();
  });

  // §4 case 4 (AC-W2.4). Failure caught: an exclusion keyed on branch alone,
  // with no pre-adoption classification - only a merge that predates the
  // contract can explain a row that predates the contract.
  it("does not let a POST-adoption merge launder a pre-boundary row on its branch", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-late-")), [
      {
        path: "feat/late/555555555555.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/late",
          baseSha: "555555555555",
          startedAt: "2026-08-20T00:00:00.000Z",
        }),
      },
    ]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [merge("feat/late", "2026-09-05T00:00:00.000Z")],
    });
    expect(report.boundaryAdvisory).toBe(advisoryLine("2026-08-20T00:00:00.000Z", BOUNDARY));
  });

  // §4 case 5 (AC-W2.5). Failure caught: an advisory computed from an exclusion
  // set that a shallow clone silently emptied - every pre-boundary row then
  // reads as unexplained and the report accuses the constant on a scan it
  // already refused to trust.
  //
  // PREMISE PAIR, executable and on THIS case's own inputs: the identical
  // corpus is asserted to fire the advisory under a non-shallow run FIRST. The
  // existing shallow fixture's corpus is EMPTY, where boundaryAdvisory is null
  // with no withholding logic at all - the trivial null this pair exists to
  // block.
  it("withholds an advisory that WOULD fire when the merged-arc scan refused a shallow clone", () => {
    const CORPUS = [
      {
        path: "feat/uncovered/666666666666.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/uncovered",
          baseSha: "666666666666",
          startedAt: "2026-08-20T00:00:00.000Z",
        }),
      },
    ];
    const EXPECTED = advisoryLine("2026-08-20T00:00:00.000Z", BOUNDARY);

    // Premise: this corpus fires the advisory when the scan is trusted.
    const deep = buildReport(corpus(mkdtempSync(join(tmpdir(), "rep-adv-deep-")), CORPUS), opts);
    expect(deep.boundaryAdvisory, "premise: this corpus fires when not shallow").toBe(EXPECTED);

    const origin = fixtureRepo().dir;
    const shallow = join(mkdtempSync(join(tmpdir(), "rep-adv-shallow-")), "clone");
    execFileSync("git", ["clone", "--depth=1", `file://${origin}`, shallow]);
    corpus(shallow, CORPUS);
    // NOT `mergedArcs: []`: injecting the merges bypasses the shallow detection
    // this case is named for.
    const report = buildReport(shallow, opts);
    expect(report.shallow, "premise: the clone really is shallow").toBe(true);
    expect(report.boundaryAdvisory).toBeNull();
    // FULL-LINE equality. A `toMatch` on a fragment survives P1's suffix mutant.
    expect(report.notes).toContain(SHALLOW_NOTE);
  });

  // §4 case 6 (AC-W2.6). Failure caught: `earliest` selected by LEXICAL
  // `.sort()[0]` over startedAt strings and only then parsed - the lexically
  // smallest string here is chronologically LATER than the boundary, so the
  // advisory is silently suppressed for a genuinely pre-boundary row.
  it("selects the CHRONOLOGICALLY earliest row, not the lexically smallest string", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-lex-")), [
      {
        path: "feat/offsets/777777777777.jsonl",
        body: jrows(
          // Chronologically 2026-09-01T01:30Z - POST-boundary, lexically SMALLEST.
          {
            round: 1,
            branch: "feat/offsets",
            baseSha: "777777777777",
            startedAt: "2026-08-31T23:30:00-02:00",
          },
          // Chronologically 2026-08-31T23:00Z - PRE-boundary, lexically LARGER.
          {
            round: 2,
            branch: "feat/offsets",
            baseSha: "777777777777",
            startedAt: "2026-09-01T01:00:00+02:00",
          },
        ),
      },
    ]);
    const report = buildReport(root, { ...opts, mergedArcs: [] });
    expect(report.boundaryAdvisory).toBe(advisoryLine("2026-09-01T01:00:00+02:00", BOUNDARY));
    // Both rows are inside the accept-set, so the note must be ABSENT: this
    // pins the note's only-when-any-exist conditional against an unconditional
    // emit.
    expect(report.notes.some((n) => n.includes("without a placeable startedAt"))).toBe(false);
  });

  // §4 case 7 (AC-W2.7). Failure caught: NaN comparisons return false and
  // `null` startedAt is filtered - both silently, so a row the advisory could
  // not place looks exactly like a row it placed and cleared. Scenario (ii)
  // additionally pins the note's condition as "any non-placeable rows exist",
  // never "and no advisory fired".
  it("signals rows it cannot place, whether or not the advisory itself fires", () => {
    const INVALID = [
      { round: 1, branch: "feat/mixed", baseSha: "888888888888", startedAt: "not-a-date" },
      { round: 2, branch: "feat/mixed", baseSha: "888888888888", startedAt: null },
    ];

    // (i) the only placeable row is POST-boundary: no advisory, note present.
    const quiet = buildReport(
      corpus(mkdtempSync(join(tmpdir(), "rep-adv-unplaceable-quiet-")), [
        {
          path: "feat/mixed/888888888888.jsonl",
          body: jrows(...INVALID, {
            round: 3,
            branch: "feat/mixed",
            baseSha: "888888888888",
            startedAt: "2026-09-03T00:00:00.000Z",
          }),
        },
      ]),
      { ...opts, mergedArcs: [] },
    );
    expect(quiet.boundaryAdvisory).toBeNull();
    expect(quiet.notes).toContain(unplaceableNote(INVALID.length));

    // (ii) same invalid rows, plus an UNCOVERED pre-boundary row: the advisory
    // fires AND the note is still there.
    const loud = buildReport(
      corpus(mkdtempSync(join(tmpdir(), "rep-adv-unplaceable-loud-")), [
        {
          path: "feat/mixed/888888888888.jsonl",
          body: jrows(...INVALID, {
            round: 3,
            branch: "feat/mixed",
            baseSha: "888888888888",
            startedAt: "2026-08-20T00:00:00.000Z",
          }),
        },
      ]),
      { ...opts, mergedArcs: [] },
    );
    expect(loud.boundaryAdvisory).toBe(advisoryLine("2026-08-20T00:00:00.000Z", BOUNDARY));
    expect(loud.notes).toContain(unplaceableNote(INVALID.length));
  });

  // §4 case 8 (AC-W2.8). Failure caught: a bare `Date.parse` placement test.
  // Each row below is pre-boundary-LOOKING and each fails placement for its own
  // reason: the timezone-less string parses PRE-boundary under TZ=UTC and
  // POST-boundary under TZ=America/New_York (the same corpus flips the advisory
  // by environment); the calendar-invalid date silently normalizes to Mar 2;
  // the out-of-range offset is structurally plausible and parses NaN, so an
  // unbounded `[+-]\d{2}:\d{2}` regex calls it placeable and every later
  // comparison returns false with no note; the sub-millisecond fraction is
  // silently truncated, so a row can compare EQUAL to a `.000` merge and slip
  // inside the exclusion cap.
  it("rejects and counts all four accept-set rejection families", () => {
    const REJECTED = [
      "2026-08-31T23:00:00",
      "2026-02-30T00:00:00.000Z",
      "2026-08-31T12:00:00+24:00",
      "2026-08-31T12:00:00.0001Z",
    ];
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-acceptset-")), [
      {
        path: "feat/families/999999999999.jsonl",
        body: jrows(
          ...REJECTED.map((startedAt, i) => ({
            round: i + 1,
            branch: "feat/families",
            baseSha: "999999999999",
            startedAt,
          })),
          {
            round: REJECTED.length + 1,
            branch: "feat/families",
            baseSha: "999999999999",
            startedAt: "2026-09-03T00:00:00.000Z",
          },
        ),
      },
    ]);
    // PREMISE, on this case's own inputs: the calendar-invalid and
    // sub-millisecond rows really do PARSE, and land pre-boundary — so a bare
    // `Date.parse` placement would have COMPARED them and suppressed the note,
    // which is exactly what this case discriminates. (The timezone-less row is
    // deliberately excluded from the premise: its parse is host-dependent,
    // which is its own defect. The `+24:00` row parses NaN, which is the
    // structural test's job, not the parser's.)
    premiseHolds(
      "the calendar-invalid and sub-millisecond rows parse to finite pre-boundary instants, so a naive placement would have compared rather than counted them",
      [REJECTED[1], REJECTED[3]].every((s) => {
        const t = Date.parse(s as string);
        return Number.isFinite(t) && t < Date.parse(BOUNDARY);
      }),
    );
    const report = buildReport(root, { ...opts, mergedArcs: [] });
    expect(report.boundaryAdvisory).toBeNull();
    // Count DERIVED from the fixture, so a hardcoded N (P1 mutant (d)) fails.
    expect(report.notes).toContain(unplaceableNote(REJECTED.length));
  });

  // §4 case 9 (AC-W2.9). Failure caught by TWO mutants at the SELECTION site:
  // oldest-only selection (the live history holds four reused-branch instances)
  // and lexical-max selection, which picks the lexically-larger string whose
  // instant is 22:00Z and strands the 22:15Z row outside the cap. Both merge
  // strings lexically precede the boundary string, so classification (case 10)
  // is not also under test here.
  it("caps a multi-merge branch with the CHRONOLOGICALLY latest pre-adoption merge", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-multi-")), [
      {
        path: "feat/multi/aaaaaaaaaaab.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/multi",
          baseSha: "aaaaaaaaaaab",
          // Between the two merges chronologically: after 22:00Z, before 22:30Z.
          startedAt: "2026-08-31T22:15:00Z",
        }),
      },
    ]);
    premiseFiresWithoutMerges(root);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [
        // Chronologically 22:30Z, lexically SMALLER.
        merge("feat/multi", "2026-08-31T20:30:00-02:00"),
        // Chronologically 22:00Z, lexically LARGER.
        merge("feat/multi", "2026-09-01T00:00:00+02:00"),
      ],
    });
    expect(report.boundaryAdvisory).toBeNull();
  });

  // §4 case 10 (AC-W2.10). Failure caught: a LEXICAL `mergedAt <= boundary`
  // classification. This merge is chronologically 2026-08-31T23:00Z - inside
  // the pre-adoption carve-out - but its STRING is lexically greater than the
  // boundary string, so a lexical test files it post-adoption, drops it from
  // the exclusion map, and fires the advisory.
  it("classifies a merge as pre-adoption chronologically, not by string order", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-classify-")), [
      {
        path: "feat/classify/bbbbbbbbbbbb.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/classify",
          baseSha: "bbbbbbbbbbbb",
          startedAt: "2026-08-31T22:00:00Z",
        }),
      },
    ]);
    premiseFiresWithoutMerges(root);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [merge("feat/classify", "2026-09-01T01:00:00+02:00")],
    });
    expect(report.boundaryAdvisory).toBeNull();
  });

  // §4 case 11 (AC-W2.11). Failure caught: a LEXICAL `startedAt <= mergedAt`
  // cap. The row is chronologically an hour BEFORE the merge but its string is
  // lexically greater, so a lexical cap places a covered row outside the
  // exclusion and fires.
  it("applies the time cap chronologically, not by string order", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-cap-")), [
      {
        path: "feat/cap/cccccccccccc.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/cap",
          baseSha: "cccccccccccc",
          startedAt: "2026-08-31T21:00:00Z",
        }),
      },
    ]);
    premiseFiresWithoutMerges(root);
    const report = buildReport(root, {
      ...opts,
      // Chronologically 2026-08-31T22:00Z: pre-adoption, and after the row.
      mergedArcs: [merge("feat/cap", "2026-08-31T20:00:00-02:00")],
    });
    expect(report.boundaryAdvisory).toBeNull();
  });

  // §4 case 12 (AC-W2.12). Failure caught: a mutant that drops the branch
  // condition and caps on time alone, which lets any branch's pre-adoption
  // merge explain any branch's row. The fixture varies ONLY branch identity
  // against case 3's inclusive-cap companion - same timestamps, same equality,
  // merge moved to a different branch.
  it("covers a row only with a SAME-branch pre-adoption merge, never a global time cap", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-branch-")), [
      {
        path: "feat/x/dddddddddddd.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/x",
          baseSha: "dddddddddddd",
          startedAt: "2026-08-20T00:00:00.000Z",
        }),
      },
    ]);
    const report = buildReport(root, {
      ...opts,
      // Same instant as the row, so a branch-blind time cap would exclude it.
      mergedArcs: [merge("feat/y", "2026-08-20T00:00:00.000Z")],
    });
    expect(report.boundaryAdvisory).toBe(advisoryLine("2026-08-20T00:00:00.000Z", BOUNDARY));
  });

  // §4 case 13 (AC-W2.13). Failure caught: selecting the global chronological
  // earliest FIRST and then nulling the advisory because that row is covered.
  // The 2026-08-10 row is covered; the 2026-08-20 row is not, and it is a
  // legitimate signal that a select-then-filter implementation silently
  // suppresses. No other case combines an earlier covered row with a later
  // uncovered one.
  it("excludes covered rows BEFORE selecting the earliest, not after", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-adv-order-")), [
      {
        path: "feat/covered/eeeeeeeeeeee.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/covered",
          baseSha: "eeeeeeeeeeee",
          startedAt: "2026-08-10T00:00:00.000Z",
        }),
      },
      {
        path: "feat/uncovered-later/ffffffffffff.jsonl",
        body: jrows({
          round: 1,
          branch: "feat/uncovered-later",
          baseSha: "ffffffffffff",
          startedAt: "2026-08-20T00:00:00.000Z",
        }),
      },
    ]);
    const report = buildReport(root, {
      ...opts,
      mergedArcs: [merge("feat/covered", "2026-08-15T00:00:00.000Z")],
    });
    expect(report.boundaryAdvisory).toBe(advisoryLine("2026-08-20T00:00:00.000Z", BOUNDARY));
  });

  // Failure caught: an unset boundary treated as the epoch, which accuses every
  // pre-adoption merge in one run.
  it("reports not-yet-adopted and withholds the silent list when the boundary is null", () => {
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-null-")), []);
    const report = buildReport(root, {
      adoptionBoundary: null,
      mergedArcs: [
        {
          sha: "1".repeat(40),
          branch: "feat/whatever",
          baseSha: "aaaaaaaaaaaa",
          mergedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    });
    expect(report.silentArcs).toBeNull();
    // The count comes out of the same scan, so it is withheld with the list.
    expect(report.preAdoptionMergeCount).toBeNull();
    expect(report.notes.join(" ")).toMatch(/not yet adopted/i);
  });

  // Failure caught: authoritative metrics computed from a corpus the report
  // knows is incomplete, and printed as complete. `readArcs` keeps every
  // rejected line in `arc.malformed`; a report that aggregates `arc.rows`
  // alone prints `diff 3/3` over a four-line file, classifies the stage
  // untriggered, and gives no sign its input was partial - while the merge
  // gate, reading the SAME file, reports `malformed_row`. Two tools, one
  // corpus, contradictory answers, and the one a human runs by hand is the one
  // that hides it. This is the §8.2 failure arriving through the other door.
  it("reports malformed rows and marks the affected arc's counts incomplete", () => {
    const VALID = [{ round: 1 }, { round: 2 }, { round: 3 }];
    const body = jrows(...VALID) + "{ not json\n";
    const root = corpus(mkdtempSync(join(tmpdir(), "rep-malformed-")), [
      { path: "feat/foo/aaaaaaaaaaaa.jsonl", body },
    ]);
    const report = buildReport(root, opts);

    // Every expectation derived from the fixture body, never a literal: the
    // 1-indexed position of the line that cannot parse, and the number of rows
    // that can.
    const badLine = body.split("\n").findIndex((l) => l.startsWith("{ not")) + 1;
    expect(report.malformedRows).toHaveLength(1);
    expect(report.malformedRows[0]!).toEqual({
      arc: "feat/foo aaaaaaaaaaaa",
      file: "docs/review-rounds/feat/foo/aaaaaaaaaaaa.jsonl",
      line: badLine,
    });

    // The counts are still REPORTED, and still right about what they cover:
    // the three valid rows are real data, so the report DISCLOSES rather than
    // refusing. What it may not do is let the number read as whole.
    const arc = report.arcs.find((a) => a.baseSha === "aaaaaaaaaaaa");
    expect(arc?.stages.diff).toEqual({ counted: VALID.length, recorded: VALID.length });
    const rendered = render(report)
      .split("\n")
      .find((l) => l.includes("aaaaaaaaaaaa") && l.includes("diff"));
    expect(rendered).toContain("INCOMPLETE");
  });

  // Failure caught: a partial answer labelled complete - the §8.2 failure.
  // Ambient-gated skipping cannot catch this: an implementation with NO
  // --is-shallow-repository check passes every other test in this file.
  it("refuses the merged-arc scan on a synthesized shallow clone and says so by name", () => {
    const origin = fixtureRepo().dir; // Task 7's layer-1 fixture, reused
    const shallow = join(mkdtempSync(join(tmpdir(), "rep-shallow-")), "clone");
    execFileSync("git", ["clone", "--depth=1", `file://${origin}`, shallow]);
    expect(
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: shallow,
        encoding: "utf8",
      }).trim(),
    ).toBe("true");

    const report = buildReport(shallow, opts);
    // WITHHELD, not empty. An empty array and a refusal must be different
    // values, or this assertion cannot tell one from the other.
    expect(report.silentArcs).toBeNull();
    // Failure caught: the refusal is HALF applied. Both fields are outputs of
    // the one merged-arc scan, and a `preAdoptionMergeCount` initialised to 0
    // and left there reports an authoritative zero for a scan that never ran -
    // the §8.2 failure one line below a correct refusal of the same question.
    expect(report.preAdoptionMergeCount).toBeNull();
    expect(report.shallow).toBe(true);
    expect(report.notes.join(" ")).toMatch(/shallow/i);
  });
});

describe("CLI surface (spec §9)", () => {
  /** A report built from a fixture corpus, so every expectation below is
   *  derived from data the test planted rather than from a literal the
   *  renderer could be wrong about in the same direction. */
  const cliReport = (files: { path: string; body: string }[], boundary: string | null = BOUNDARY) =>
    buildReport(corpus(mkdtempSync(join(tmpdir(), "rep-cli-")), files), {
      adoptionBoundary: boundary,
    });

  // Failure caught: a renderer that prints "silent arcs: 0" for a WITHHELD
  // list. `Report` keeps null and [] distinct precisely so a refusal is not a
  // clean bill of health, and the whole distinction is lost if the one surface
  // a human actually reads collapses them back together.
  it("names the refusal instead of printing a count when silentArcs is null", () => {
    const report = cliReport([], null);
    expect(report.silentArcs).toBeNull();
    const text = render(report);
    expect(text).toMatch(/silent arcs: WITHHELD/);
    expect(text).not.toMatch(/silent arcs: 0/);
    // The REASON reaches the reader too, not just the word.
    for (const note of report.notes) expect(text).toContain(note);
  });

  // Failure caught: a renderer that refuses one output of the merged-arc scan
  // and prints a numeral for the other. `pre-adoption merges: 0` directly under
  // `silent arcs: WITHHELD` is a fact the scan never established, stated in the
  // reader's face by the line that follows a correct refusal.
  it("withholds the pre-adoption count alongside the silent list", () => {
    const report = cliReport([], null);
    expect(report.preAdoptionMergeCount).toBeNull();
    const text = render(report);
    expect(text).toMatch(/pre-adoption merges: WITHHELD/);
    expect(text).not.toMatch(/pre-adoption merges[^\n]*: 0/);
  });

  // Failure caught: a renderer that drops the per-stage breakdown, leaving one
  // collapsed number that cannot be compared against a per-stage threshold -
  // the same defect the aggregation rejects, one layer later.
  it("prints every arc's per-stage counted and recorded counts", () => {
    const report = cliReport([
      {
        path: "feat/foo/aaaaaaaaaaaa.jsonl",
        body: jrows(
          { stage: "spec", round: 1 },
          { stage: "diff", round: 1 },
          { stage: "diff", round: 2 },
        ),
      },
    ]);
    const text = render(report);
    // Guards the loop below against passing vacuously over zero arcs.
    expect(report.arcs.length).toBeGreaterThan(0);
    for (const arc of report.arcs) {
      const line = text.split("\n").find((l) => l.includes(arc.baseSha));
      expect(line, `no rendered line for ${arc.baseSha}`).toBeDefined();
      for (const [stage, c] of Object.entries(arc.stages)) {
        // Read off the report, so a fixture change cannot leave this asserting
        // a pair the report no longer holds.
        expect(line).toContain(`${stage} ${c.counted}/${c.recorded}`);
      }
    }
  });

  // Failure caught: argument handling that accepts anything and reports over
  // the live corpus regardless, so a typo silently answers a question nobody
  // asked. Neither branch below reaches git, so neither depends on the cwd.
  it("exits 2 on an unknown argument and 0 on --help", () => {
    expect(main(["--nope"])).toBe(2);
    expect(main(["--help"])).toBe(0);
  });
});

describe("adoption boundary, production default (spec §9)", () => {
  // Failure caught: `buildReport` not WIRED to the production boundary at all.
  // Every other case in this file INJECTS one, so an implementation that
  // defaults to the epoch, or to null forever, passes all of them. What is
  // asserted here is that the report READS `adoptionBoundary` when nothing is
  // injected - a different claim from the function's own contract, which is
  // pinned beside its implementation in tests/reviewRounds/row.test.ts
  // (Task 2). One test owns the function, this one owns the wiring.
  it("withholds before the constants module is on main and completes the scan after", () => {
    const repo = mkdtempSync(join(tmpdir(), "rep-boundary-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    writeFileSync(join(repo, "seed.txt"), "seed\n");
    git("add", "seed.txt");
    git("commit", "-qm", "seed");

    git("checkout", "-q", "-b", "feat/adopting");
    const constants = join(repo, "lib", "reviewRounds", "constants.ts");
    mkdirSync(dirname(constants), { recursive: true });
    writeFileSync(constants, "export const ROUND_THRESHOLD = 4;\n");
    git("add", "lib/reviewRounds/constants.ts");
    git("commit", "-qm", "feat: constants");

    // No injected boundary, so buildReport must call adoptionBoundary itself.
    // The module is not on main yet, so the report has to withhold rather than
    // accuse - which an epoch default cannot do.
    const early = buildReport(repo, {
      mergedArcs: [
        {
          sha: "4".repeat(40),
          branch: "feat/adopting",
          baseSha: "aaaaaaaaaaaa",
          mergedAt: "2026-09-04T00:00:00.000Z",
        },
      ],
    });
    expect(early.silentArcs).toBeNull();
    expect(early.notes.join(" ")).toMatch(/not yet adopted/i);

    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "merge feat/adopting", "feat/adopting");
    // WITHHELD becomes a COMPLETED scan: [] rather than null is reachable only
    // if the default boundary is now non-null, so this is the assertion a
    // never-wired or null-forever default fails.
    expect(buildReport(repo, { mergedArcs: [] }).silentArcs).toEqual([]);
  });
});

describe("real history (spec §11.3 layer 2)", () => {
  // A test that quietly passes over one merge is a false presence. Numbers are
  // derived from the live log, never from literals - a hardcoded 676 makes
  // this a tripwire on the calendar instead of on the producer.
  const isShallow =
    execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() ===
    "true";

  // INTERIM CEILING, not a flake bump. This test resolves every first-parent
  // merge on `main`, so its runtime grows MONOTONICALLY with merge history and
  // will keep growing; it is not transient and a rerun does not clear it.
  //
  //   24.79s  measured on a quiet box (prunegate, early warning)
  //   34.66s  measured after #875 merged ~98 commits, against a 30000ms ceiling
  //
  // The 850-merge walk is the cost: `git log` itself returns in 0.01s, and the
  // corpus contributes 235 files. Raised here because a required tier was
  // failing for every arc, not just the one that noticed.
  //
  // THE REAL REPAIR IS NOT THIS. Speeding up `mergedArcs` (or dropping its
  // second clone) is owned by arc-remerge and is already directed. When that
  // lands, this override should come back out rather than be raised again --
  // a ceiling that only ever moves up stops being a ceiling.
  it.skipIf(isShallow)(
    "matches the live log when history is available",
    { timeout: 180_000 },
    () => {
      const expected = execFileSync(
        "git",
        ["log", "--merges", "--first-parent", "main", "--format=%s"],
        { encoding: "utf8" },
      )
        .split("\n")
        .filter(Boolean);
      const { recognized, unrecognized } = mergedArcs(process.cwd());
      // Every first-parent merge is accounted for: recognized or reported.
      expect(recognized.length + unrecognized.length).toBe(expected.length);
      // The residue is REPORTED, never assumed empty - and every entry carries
      // its subject, per §9.
      expect(unrecognized.every((u) => u.subject.length > 0)).toBe(true);
    },
  );

  it.runIf(isShallow)("SKIPS BY NAME on a shallow clone", () => {
    // A named absence, not a quiet pass over one merge.
    expect(mergedArcs(process.cwd()).shallow).toBe(true);
  });
});
