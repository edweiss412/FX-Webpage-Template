import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";

import { childRun, INERT_TARGET } from "./source/childRun";
import { classifyTests } from "./source/premiseScan";
import { GUARD_SURFACES } from "./source/registry";

const ROOT = join(__dirname, "..", "..");

/**
 * The premise contract (spec §3.3.2, §3.3.3).
 *
 * Merge-gating, static, DB-free. It walks the enrolled suites rather than a
 * hand-written file list, so a newly enrolled surface is covered by default
 * rather than silently exempt.
 */

/**
 * Declared per suite, INDEPENDENTLY of the classification.
 *
 * Counting a list and comparing it to itself proves nothing. The point is that
 * a recognizer which silently stops matching -- a `spawnSync` moved behind a
 * wrapper, a resolver that breaks -- drops these to zero and reds, instead of
 * reporting a clean corpus it no longer understands. A genuinely pure suite
 * declares 0 honestly and is not forced to invent a match.
 *
 * Same shape and same reason as EXPECTED_LEDGER_KINDS in source/expectedLedgerKinds.
 */
const EXPECTED_ENV_TOUCHING: Record<string, number> = {
  // The premise recognizer's own two suites, enrolled 2026-08-16 with the
  // premiseScan surface. Both counts are DERIVED from a run of the recognizer
  // over them, not asserted from reading:
  //
  //   premiseScan.test.ts        0 — every case writes a synthetic source under
  //                                  mkdtempSync and PARSES it. node:fs on a
  //                                  tree the test builds is not provenance, by
  //                                  the same rule the corpus suite is 0 under.
  //   _metaPremiseContract.test.ts  1 — "%s fails as a child run", which spawns
  //                                  a real child through `childRun`. The other
  //                                  nine read the live tree via node:fs only.
  "tests/mutation/source/premiseScan.test.ts": 0,
  "tests/mutation/_metaPremiseContract.test.ts": 1,
  // 15 -> 16 (2026-08-09): the constructed multi-line hunk case that kills the
  // diffHunks count-collapse pair (BL-MUTATION-LEDGERGIT-SITE-DRIFT) builds a
  // throwaway repo, so it counts as environment-touching like its
  // single-line sibling.
  // Seven: the truth-table `.each` (one classification for the whole table),
  // the unresolvable-site-origin row, the no-request-scope row, the scoped-catch
  // sibling, the two assertSameOriginServerAction cases, and the derived
  // no-dark-refusal sweep (which calls the throwing member and so reaches
  // resolveSiteOrigin). The proxy-independence guard is environment-FREE: it
  // parses a committed file and touches no ambient state. Decided per case from
  // what each case does and only THEN checked against the scanner.
  "tests/auth/sameOriginServerAction.test.ts": 7,
  "tests/scripts/ledgerClaimsCheck.test.ts": 16,
  // chore/guard-completeness-wave (2026-08-15): the spawn-seam suite, enrolled as
  // ledgerGit's second suite. All 16 of its cases import `realGitSurface`, so the scanner
  // classifies every one environment-touching — correctly by its own rule, even though
  // each case INJECTS its spawn and reaches no real process. The 13 recording cases carry
  // a real premise (`calls.length > 0`: a reader that short-circuits before spawning,
  // which `currentBranch` proves reachable under GitHub Actions variables, would otherwise
  // assert on `undefined`); the 3 fault cases carry `no-premise`, because their spawn
  // result is the fixture itself.
  "tests/scripts/ledgerGitSpawnSeam.test.ts": 16,
  // The analyzer suite enrolled by this branch. It declares 0 honestly: the cases drive
  // literal source strings through a pure AST function and reach no member of
  // ENVIRONMENT_SOURCES.
  "tests/db/destructiveFileAnalysis.test.ts": 0,
  // The pgCronSmokes unit suite enrolled by this branch: literal strings and URLs through
  // pure helpers, reaching no member of ENVIRONMENT_SOURCES.
  "tests/cross-cutting/pgCronSmokesUnit.test.ts": 0,
  "tests/scripts/ledgerClaims.test.ts": 0,
  // The psql startup-file scanner's deciding suite, enrolled 2026-08-16 at a
  // declared 0 — a number the enrolling arc recorded as a KNOWN UNDER-COUNT
  // rather than papering over, naming BL-PREMISE-SCAN-DESCRIBE-LOCAL-EXTENTS
  // and saying the number would rise when that row closed.
  //
  // It closed here, and the number rose. The suite imports `execFileSync` and
  // runs `git ls-files -z` inside the initializer for `TRACKED_SOURCE_ROOTS`,
  // declared in a `describe` callback; the two cases that consume it (`:1977`
  // and `:1986`) ARE environment-touching and are now classified as such. Both
  // already carried executable premises, so nothing about them changed — what
  // changed is that the classifier can see the dependency, which is the
  // fail-by-default property the contract exists to provide.
  //
  // Re-measured across every enrolled suite by walking the registry's
  // `suitePaths`, as that row required: this is the only count that moved.
  "tests/cross-cutting/psqlStartupFileSuppression.test.ts": 2,
  // The heavy-orphan reaper's classifier suite, enrolled 2026-08-16. It declares 0
  // because `classify` is pure by construction — no I/O and no clock, which is the
  // property that made the module the enrolled surface rather than the CLI — so every
  // case drives a literal row table and reaches no member of ENVIRONMENT_SOURCES. The
  // arc's environment-touching cases all live in the two suites that are deliberately
  // NOT enrolled: `tests/heavyReap/collect.test.ts` (real `ps`, spawned children) and
  // `tests/heavyReap/cli.test.ts` (the CLI as a child process, real orphans).
  //
  // The number is the scanner's own measurement, not an assertion about the suite: the
  // enrolment's red cycle reported "expected +0 to be undefined" here before the row
  // existed. This registry was missing from the plan's meta-test inventory and was found
  // by running the enrolment rather than by reading it.
  "tests/heavyReap/classify.test.ts": 0,
  // The interaction-timing scanner's two suites, enrolled 2026-08-10. The
  // inventory suite reads DESIGN.md and walks the repo, but through the module
  // under test rather than any member of ENVIRONMENT_SOURCES directly; the unit
  // suite drives literal source strings through `scanTimingSites` and touches
  // the real tree only for the universe fences.
  "tests/docs/_metaInteractionTimingInventory.test.ts": 0,
  "tests/docs/interactionTimingScan.test.ts": 0,
  // The 2026-08-15 arms suites, enrolled with citationIntent and redContract.
  // All five are pure: they drive literal fixture documents through the core
  // and read no member of ENVIRONMENT_SOURCES. Every subprocess-spawning case
  // of this arc lives in tests/specLint/cli.test.ts, which is deliberately NOT
  // enrolled, so no enrolled suite here spawns anything.
  "tests/specLint/citationIntent.test.ts": 0,
  "tests/specLint/citationIntentWiring.test.ts": 0,
  "tests/specLint/citationIntentCorpus.test.ts": 0,
  "tests/specLint/redContract.test.ts": 0,
  "tests/specLint/redExec.test.ts": 0,
  "tests/specLint/taskContract.test.ts": 0,
  // Enrolled by main as taskContract's second suite (2026-08-05). Pure: it
  // exercises compareFindings over literal fixtures and reads no environment.
  "tests/specLint/taskContractFindingOrder.test.ts": 0,
  // The v2 grammar suite, enrolled 2026-08-15 as taskContract's third suite.
  // Pure by the corpus-suite rule: it reads committed legacy fixtures through
  // node:fs, which is deliberately NOT provenance, and touches neither
  // child_process, ledger-git, nor process.env.
  "tests/specLint/taskContractV2Grammar.test.ts": 0,
  // The review-round economy's two suites, enrolled by reviewRoundCount and
  // reviewRoundCorpus. Both declare 0, and the declaration is honest rather
  // than convenient: neither reaches any member of ENVIRONMENT_SOURCES.
  // count.test.ts imports only vitest and lib/reviewRounds, driving literal
  // ReviewRoundRow fixtures. The corpus suite does use node:fs, but only
  // against scratch trees it builds itself under mkdtempSync -- node:fs is
  // deliberately NOT provenance here (the set is child_process, ledger-git and
  // process.env), because a test that constructs the tree it reads cannot be
  // decided by the ambient one.
  "tests/reviewRounds/count.test.ts": 0,
  "tests/docs/_metaReviewRoundEconomy.test.ts": 0,
  // Enrolled by reviewRoundFiling (enforcement-pair arc): parses literal
  // markdown strings through remark and reaches no member of
  // ENVIRONMENT_SOURCES.
  "tests/reviewRounds/filing.test.ts": 0,
  // M-wave 2 W-GUARDS (2026-08-10): both guard-extractor suites are pure by
  // the same rule as the corpus suite — they read the live tree via node:fs
  // and walkSourceFiles, which is deliberately NOT provenance; neither touches
  // child_process, ledger-git, or process.env.
  "tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts": 0,
  "tests/help/_metaUiLabelCrosswalk.test.ts": 0,
  // Enrolled by specLintNumerics (2026-08-11). Pure, and the declaration is
  // honest rather than convenient: every case drives checkNumerics or runLint
  // over literal fixture text with a hand-built FileResolver, so it reaches no
  // member of ENVIRONMENT_SOURCES -- no child process, no ledger-git, no
  // process.env, and no filesystem read at all.
  "tests/specLint/numerics.test.ts": 0,
  // Enrolled by feat/diagram-viewing-polish (2026-08-11) alongside the
  // phantom-gap executed-count oracle. 3: the three shipped-CLI cases spawn the
  // checker through node:child_process, because an exit code is the one thing
  // an import cannot observe. The other 22 drive report fixtures this suite
  // owns and read no environment — node:fs is deliberately not provenance, by
  // the same rule the corpus suite is declared 0 under.
  //
  // This count started as a FALSE 0. The spawning helper was declared inside
  // the describe body, and premiseScan registered declaration extents at module
  // scope ONLY, so all three classified environment-free; the helper was moved
  // to module scope to work around it. That blindness is now FIXED
  // (BL-PREMISESCAN-NESTED-HELPER-SCOPE): extents are keyed by scope and
  // resolved innermost-out, so a helper declared inside `describe` carries its
  // provenance and the count no longer depends on where the helper sits.
  "tests/ci/phantomGapExecuted.test.ts": 3,
  // The interactive-scan guard surfaces, enrolled 2026-08-14
  // (fix/ui-interactive-token-policy). All three declare 0, and the declaration
  // is honest rather than convenient: each reads the live tree through node:fs
  // (and, in the core's fixture cases, a tree it builds under mkdtempSync),
  // which is deliberately NOT provenance by the same rule the corpus suite is
  // declared 0 under. None spawns a child process, imports ledger-git, or reads
  // process.env. The one suite in this arc that DOES spawn — the contrast
  // suite's tailwindcss compile — is not a mutation suitePath and is therefore
  // not walked here.
  // The near-miss detector's two suites (spec parser/2026-08-15-field-near-miss-detector-
  // design.md, AC-N7). Both read the live tree through `node:fs` — the blocks directory, the
  // repo-wide call-site walk, the committed 65-row baseline — which is declared 0 by the same
  // rule the corpus suite above is: reading a tracked file is not provenance. Neither spawns a
  // child process, imports ledger-git, or reads `process.env`; the baseline suite's regen path
  // is env-gated but the gate is read by the SCRIPT, not the suite.
  "tests/parser/fieldNearMiss.test.ts": 0,
  "tests/parser/fieldNearMissBaseline.test.ts": 0,
  "tests/styles/interactiveScanCore.test.ts": 0,
  "tests/styles/_metaSubtleOnInteractive.test.ts": 0,
  "tests/styles/_metaTapTargetFloor.test.ts": 0,
  // The control-outline regression pin, enrolled 2026-08-16
  // (fix/control-outline-surface-fills). 0, by the same rule as its three
  // siblings above: it reads the live tree through node:fs via
  // `scanInteractiveElements`, and its negative control builds a fixture under
  // mkdtempSync and scans that — node:fs is deliberately NOT provenance here.
  // It spawns no child process, imports no ledger-git, and reads no process.env.
  // Its two `premise` calls (the repo-scan universe at module scope, and the
  // fixture's own parsed-and-produced-an-element check) are both about tree
  // content, not environment.
  "tests/styles/_metaControlOutlineFill.test.ts": 0,
  // The browser mode's two deciding suites (2026-08-15). Both declare 0, and the
  // declaration is honest rather than convenient: each builds the scratch trees it
  // reads under mkdtempSync and drives pure functions, touching no member of
  // ENVIRONMENT_SOURCES (child_process, ledger-git, process.env) — node:fs is
  // deliberately not provenance, by the same rule the corpus suite is declared 0
  // under. The suite that DOES spawn children, overlayWiring.test.ts, is not a
  // deciding suite for any enrolled surface and is therefore not scanned here.
  "tests/mutation/browser/registry.test.ts": 0,
  "tests/mutation/browser/mutate.test.ts": 0,
  // The execution-methods derivation suite, enrolled by this branch
  // (BL-EXECUTION-METHODS-DERIVED-FROM-DRIVER-TYPES). It declares 0, and the
  // declaration was PROBED rather than guessed: the classifier reported zero
  // environment-touching tests for this suite before the row existed, which is
  // why the row reads 0 and not 1. The suite's one read under node_modules is
  // the version sentinel's `node_modules/postgres/package.json` JSON read, and
  // a bare `node:fs` read is not provenance to this classifier — the same rule
  // the browser suites above and the corpus suite are declared 0 under. Every
  // other arm drives literal type-declaration source strings through a pure AST
  // function. The sentinel keeps its `premiseHolds` line regardless: it states
  // the read's premise for the human reader even though the classifier does not
  // demand it.
  "tests/db/executionMethodsManifest.test.ts": 0,
  // The modal-wait guard (2026-08-16). Declared 0 on the same reading as the
  // rows above: it builds every fixture repo it scans under mkdtempSync and
  // drives pure functions over them, touching no member of ENVIRONMENT_SOURCES.
  // `process.cwd()` is not `process.env`, and node:fs is deliberately not
  // provenance.
  "tests/ci/_metaModalWaitHelper.test.ts": 0,
  // The serializeError contract suite, enrolled 2026-08-16
  // (fix/serialize-error-structure). 0, and honestly so: every case builds its
  // fixture in the test body and drives it through the imported helper, so the
  // suite reaches no member of ENVIRONMENT_SOURCES — no child process, no
  // ledger-git, no process.env, and no filesystem read at all.
  "tests/log/serializeError.test.ts": 0,
  // The two surfaces the mutation-gate sharding arc enrols (2026-08-16). Both
  // measured 0 with the scanner, and the enrolment's red cycle reported
  // "expected +0 to be undefined" here before these rows existed.
  //
  // shardBudget's 0 is a genuine 0: lib/ci/shardBudget.ts is pure decision logic
  // with no `process` and no I/O -- that separation is why it is enrollable at
  // all -- and the suite drives literal record arrays through it.
  "tests/ci/shardBudget.test.ts": 0,
  // shardPartition's 0 is a SCANNER-RULE 0 and a known under-count, recorded
  // rather than papered over. The suite imports no member of
  // ENVIRONMENT_SOURCES directly, which is what the scanner classifies on, but
  // every case reaches the filesystem TRANSITIVELY: `weightOf` readFileSync's
  // each enrolled surface's source to generate its mutants. The count is the
  // scanner's own measurement under its own rule, not a claim that these cases
  // are hermetic. Widening the rule to transitive reachability is a change to
  // the scanner with its own before/after numbers, not a number to adjust here.
  "tests/mutation/source/shardPartition.test.ts": 0,
  // sourceShardPartition's SECOND deciding suite, added when enrolment's first
  // run showed the unit suite cannot kill a mutant of either constant it reads.
  // Also a scanner-rule 0 with the same caveat: it readFileSync's the workflow
  // and the shard files, but imports no member of ENVIRONMENT_SOURCES.
  "tests/mutation/_metaSourceShardIntegrity.test.ts": 0,
};

const suites = [...new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths))].sort();

describe("premise contract — the checker cannot report green on nothing", () => {
  it("has enrolled suites to scan", () => {
    expect(suites.length, "premise: the registry enrols at least one suite").toBeGreaterThan(0);
  });

  it("declares a count for every enrolled suite, and for no others", () => {
    // A newly enrolled suite reds here until it declares its own count, rather
    // than inheriting a neighbour's -- the defect the mutation gate's own
    // EXPECTED_LEDGER_KINDS was corrected for.
    expect(Object.keys(EXPECTED_ENV_TOUCHING).sort()).toEqual(suites);
  });

  it("examined tests at all", () => {
    const all = suites.flatMap((s) => classifyTests(ROOT, s));
    expect(all.length, "premise: the scanner found tests to classify").toBeGreaterThan(0);
  });

  it("classifies the declared number of environment-touching tests per suite", () => {
    for (const suite of suites) {
      const touching = classifyTests(ROOT, suite).filter(
        (t) => t.verdict === "environment-touching",
      );
      expect(touching.length, `${suite}`).toBe(EXPECTED_ENV_TOUCHING[suite]);
    }
  });
});

describe("premise contract — the rule", () => {
  it("every environment-touching test carries a premise or a reasoned exemption", () => {
    const offenders = suites.flatMap((s) =>
      classifyTests(ROOT, s)
        .filter((t) => t.verdict === "environment-touching" && !t.hasPremise && !t.exemption)
        .map((t) => `${s}:${t.line} ${t.testName}`),
    );
    expect(offenders).toEqual([]);
  });

  it("reports every unclassifiable test rather than passing it as environment-free", () => {
    // Distinct from undetected (spec L-8): unclassifiable is a construct the
    // checker RECOGNIZES and cannot resolve, so it knows enough to know it does
    // not know, and says so.
    const unresolved = suites.flatMap((s) =>
      classifyTests(ROOT, s)
        .filter((t) => t.verdict === "unclassifiable" && !t.exemption)
        .map((t) => `${s}:${t.line} ${t.testName} — ${t.detail}`),
    );
    expect(unresolved).toEqual([]);
  });
});

describe("premise contract — a premise that cannot run is no premise", () => {
  /**
   * Executable, not static, and it has to be: vitest registers `.each` cases by
   * iterating the producer, so an empty producer registers nothing and a
   * callback premise never runs. Probed at spec R8 -- the vacuous variant of
   * each of these reports `Tests 1 passed (1)` and stays green.
   *
   * Each fixture must FAIL, so none can be an ordinary discovered test and the
   * child's exit code is the only thing that can carry the verdict.
   */
  const FIXTURES = [
    "emptyItEach.fixture.ts",
    "emptyTestEach.fixture.ts",
    "emptyDescribeEach.fixture.ts",
    "associatedPlacement.fixture.ts",
  ];

  it.each(FIXTURES)("%s fails as a child run", (f) => {
    // no-premise: the fixtures are COMMITTED and enumerated above, so the case
    // set cannot silently empty; the child's non-zero exit is itself the
    // premise that the fixture executed rather than being skipped.
    premiseHolds(`${f} is a committed fixture this suite enumerates`, FIXTURES.includes(f));
    expect(
      childRun(ROOT, `tests/mutation/source/fixtures/${f}`, INERT_TARGET),
      `${f} must FAIL; an empty producer registers no case, so a green run means ` +
        `the premise never executed`,
    ).not.toBe(0);
  });
});
