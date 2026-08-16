import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { childRun, INERT_TARGET } from "./source/childRun";
import { evaluateGate } from "./source/gate";
import { GUARD_SURFACES } from "./source/registry";
import { runControl, runSurface } from "./source/runner";

/**
 * The nightly source-mutation gate (spec §3.6, AC-13/AC-15).
 *
 * NIGHTLY ONLY. It spawns one `vitest` child per mutant — 102 on the first
 * enrolled surface, ~77 s — so it lives in no default project. The tests it
 * MOTIVATES are merge-gating (they are ordinary cases in the surface's own
 * suite); this file only detects NEW gaps. That split is spec R4 and it is
 * deliberate.
 *
 * On-demand: `pnpm mutation:guards`.
 */
const root = process.cwd();

/**
 * Per-surface ledger-kind expectations.
 *
 * Declared HERE rather than counted from the surface's own ledger, because
 * counting a list and comparing it to itself proves nothing — the point (whole-diff
 * R1 F4) is that the deliberately coarse score floor cannot catch one or two rows
 * migrating between kinds, so the target has to be stated independently.
 *
 * Keyed by surface id, and every enrolled surface must appear: a NEW surface fails
 * by default until it declares its own counts, rather than silently inheriting the
 * first customer's (whole-diff R2 MEDIUM — the previous version asserted
 * taskContract's 18/2 against every surface in `describe.each`).
 */
const EXPECTED_LEDGER_KINDS: Record<string, Record<string, number>> = {
  // 18/2 → 22/0 (2026-08-04, BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY). The two
  // `accepted-gap` rows were the comparator's equal-key blind spot, and adding
  // the message as a third key removed the gap rather than re-accepting it. The
  // comparator also moved into `compareFindings`, whose own mutants split into
  // four sign-not-magnitude and two guarded-branch equivalents — all six with
  // control-flow arguments, which is why the surface now carries NO accepted gap.
  taskContract: { equivalent: 22 },
  // Counted from the surface, not read back off its ledger: `scripts/lib/
  // ledger-claims-core.ts` has exactly THREE `?? 0` fallbacks whose key is
  // always present -- two in the tip comparator, one in the age loop -- and
  // nothing else that survives. No accepted-gap: every other survivor was
  // repaid by a test, so a row appearing here later is a regression to
  // explain rather than a number to update.
  ledgerClaimsCore: { equivalent: 3 },
  // Enrolled 2026-08-10 with an EMPTY ledger, deliberately. The surface's first
  // run scored 0.607, and the answer was to assert the recognizer's forms
  // directly (tests/docs/interactionTimingScan.test.ts) and to move the CLI out
  // of the mutated module — not to accept survivors. A row appearing here later
  // is therefore a regression to explain, not a number to update.
  interactionTimingScan: { equivalent: 8 },
  // Counted from the surface: SIX reachability arguments -- the three two-field
  // parses at ledger-git.ts:66, :142 and :232, the twice-tested regex group at :259,
  // the `+++ b/` fallthrough at :320, and headRepo's three-way collapse at :365
  // -- and NO accepted-gap rows at all. The one former family of six (the spawn
  // timeouts at :32-34 and MAX_GIT_STDOUT's three literals at :62) is CLOSED:
  // the injectable spawn seam makes every bound observable and
  // tests/scripts/ledgerGitSpawnSeam.test.ts kills all six
  // (chore/guard-completeness-wave, BL-LEDGER-GIT-TIMEOUT-CONSTANTS).
  // "accepted-gap" is absent rather than 0 because the reducer omits kinds with
  // no rows. A new accepted-gap row means a new family, which needs its own
  // backlog entry rather than a bumped number here.
  ledgerGit: { equivalent: 6 },
  // Counted from the surface: count.ts carries NO blessed survivor at all. Its
  // floor is 1, so any row appearing here is a coverage regression to repair
  // rather than a number to update.
  reviewRoundCount: {},
  // Counted from the surface: exactly TWO reachability arguments -- the
  // directory fallthrough at corpus.ts:79, which lands on the very next line's
  // `isFile()` skip, and the one-past-the-end read at :146, which `?? ""` turns
  // into a blank line the parser never sees. No accepted-gap: this surface's
  // floor is 1, so a gap here would have to be repaid, not blessed.
  reviewRoundCorpus: { equivalent: 2 },
  // Enrolled by the enforcement-pair arc (spec §6.3): the parse contract for
  // Mechanizable parity. Counted from the surface: SIX reachability arguments -
  // three childless-literal guards (visibleText's code/html arm and the two
  // walker guards, where descending into a literal finds nothing), the two
  // decline-loop breaks (the body only ever assigns true), and close()'s
  // current-null hygiene (reassigned at every heading branch). The first run's
  // other six survivors were real gaps, each repaid by a named test in
  // tests/reviewRounds/filing.test.ts or the meta-test's message assertions -
  // an accepted-gap row appearing here later needs its own backlog entry.
  reviewRoundFiling: { equivalent: 6 },
  // Counted from the surface: the executed-count oracle carries NO blessed
  // survivor. Its floor is 1, so a row appearing here is a coverage regression
  // to repair rather than a number to update. The surface exists in its current
  // shape BECAUSE of this table: enrolled as one file with its CLI main block
  // inline it scored 0.27, 18 of 19 survivors sitting in code the referring
  // suite can never execute through an import.
  phantomGapExecuted: {},
  // M-wave 2 W-GUARDS (2026-08-10). popoverOverlayExtract: TWO equivalent rows
  // (the template-separator connector flip, which can only inject the token
  // `undefined` where no accept-set token contains it; and the null-key
  // fall-through continue, which reaches only comparisons a null key cannot
  // match). renderedTextHaystack: clean sweep, 17/17 killed after the
  // hardening rows.
  // chore/guard-completeness-wave (2026-08-15). destructiveFileAnalysis: EIGHT
  // reachability arguments — the begin-callback receiver test Rule 1 already rejects
  // ahead of, four fixpoint loop bounds the break-on-no-growth condition makes
  // unreachable, the candidate-declaration count that cannot be zero by construction,
  // Rule 3's tag test whose only other identifier position is a type argument, the
  // ordering comparison two distinct nodes cannot tie, and the candidate-walker
  // parameter leg where widening CANDIDATES cannot widen CHECKED because declQualifies
  // re-derives `.begin`-ness independently. Everything else the runs surfaced was killed
  // by a fixture, or deleted as dead code.
  //
  // The eighth row arrived late and is worth the sentence: CI's whole-gate run found
  // TWELVE unaccepted survivors that three SIGTERM-killed local runs never reached, all
  // in code this branch added. Eleven were real. Nine of those never flip `ok` — they
  // move the rejection from Rule 1 to the containment rule — so only this suite's
  // reason-CLASS pinning could kill them, which is the argument for that discipline.
  destructiveFileAnalysis: { equivalent: 8 },
  // pgCronSmokes: a clean sweep, 14/14 killed on first enrolment. Empty is the honest
  // declaration and a row appearing here later is a regression to explain.
  pgCronSmokes: {},
  popoverOverlayExtract: { equivalent: 2 },
  renderedTextHaystack: {},
};

describe("guard-surface registry — ledger-kind expectations", () => {
  it("declares expected ledger-kind counts for every enrolled surface", () => {
    expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(
      GUARD_SURFACES.map((s) => s.id).sort(),
    );
  });
});

describe.each(GUARD_SURFACES.map((s) => [s.id, s] as const))(
  "source-mutation gate — %s",
  (_id, surface) => {
    const before = readFileSync(surface.sourcePath);
    const run = runSurface(root, surface);
    const result = evaluateGate({
      surfaceId: surface.id,
      mutantCount: run.mutantCount,
      noOps: run.noOps,
      baselineGreen: run.baselineGreen,
      killed: run.killed,
      survivors: run.survivors,
      ledger: surface.accepted,
      scoreFloor: surface.scoreFloor,
    });

    it("passes every gate condition", () => {
      expect(
        result.failures.map((f) => `${f.condition}: ${f.detail}`).join("\n"),
        "gate failures",
      ).toBe("");
      expect(result.passed).toBe(true);
    });

    it("holds the exact ledger-kind counts declared for THIS surface (AC-13)", () => {
      // The score floor is deliberately COARSE (spec §4.3): from the shipping
      // state it takes three further blessed gaps to breach 0.95, so the floor
      // cannot detect one or two rows silently migrating between kinds.
      // Expectations are per-surface: §4.3's numbers belong to the FIRST
      // CUSTOMER, while §3.7 enrollment is per-surface, so a legitimate second
      // surface must not be measured against taskContract's ledger.
      const kinds = surface.accepted.reduce<Record<string, number>>((acc, row) => {
        acc[row.kind] = (acc[row.kind] ?? 0) + 1;
        return acc;
      }, {});
      expect(kinds).toEqual(EXPECTED_LEDGER_KINDS[surface.id]);
    });

    it("classifies every generated mutant exactly once", () => {
      // The consequence bound in one assertion: killed + survivors must account
      // for every mutant produced. A dropped outcome leaves the gate green while
      // the run tested less than it claims.
      expect(run.killed + run.survivors.length).toBe(run.mutantCount);
      expect(new Set(run.survivors).size).toBe(run.survivors.length);
      expect(run.outcomes).toHaveLength(run.mutantCount);
    });

    it("generated mutants at all, and none was a no-op", () => {
      // Guards the vacuity hole from the other side: a run that silently
      // produced nothing would satisfy the ledger and floor conditions.
      expect(run.mutantCount).toBeGreaterThan(0);
      expect(run.noOps).toEqual([]);
    });

    it("scores at or above the surface's floor", () => {
      expect(result.score.value).toBeGreaterThanOrEqual(surface.scoreFloor);
    });

    it("leaves the tracked source byte-identical (AC-4)", () => {
      // The overlay serves mutant text from memory. If this ever fails, the
      // harness has been rewritten to patch files in place and a crashed run
      // can leave a mutant on disk.
      expect(readFileSync(surface.sourcePath).equals(before)).toBe(true);
    });

    it("kills THIS surface's own control mutant, proving the overlay is live (AC-3)", () => {
      // Without this, a harness whose overlay silently failed to apply reports a
      // PERFECT score -- every mutant running against clean source -- and every
      // other assertion here still passes.
      //
      // The previous version READ as if it made this assertion and did not: it
      // computed `broken`, asserted it differed from the source, and then called
      // runSurface with the surface's own operators, never passing `broken` to
      // anything. So it proved a string occurred in a file. It also hardcoded
      // taskContract's text inside this describe.each, which meant enrolling a
      // second surface red the gate.
      const source = readFileSync(surface.sourcePath, "utf8");
      const broken = source.replace(surface.control.from, surface.control.to);
      expect(
        broken,
        "control did not apply; validateSurface should have rejected this row",
      ).not.toBe(source);
      expect(
        runControl(root, surface, broken),
        "the suite did not notice this surface's control mutant",
      ).not.toBe(0);
      // Explicit budget, because this case SPAWNS A FULL CHILD SUITE RUN and
      // the shared 30s default is a per-test budget meant for in-process work.
      // The gate's other cases run runSurface at module scope, outside any
      // `it`, so no timeout applies to them -- this one moved inside an `it`
      // precisely so the control's verdict is asserted, and inherited a budget
      // that fits an ordinary test rather than a child vitest process. Green
      // locally at ~33s and RED on CI's slower runner, which is the whole
      // reason "real CI green" is a separate gate from "local green".
    }, 600_000);
  },
);

/**
 * The per-mutant config's timeout is actually in force (guard-premise Task 3).
 *
 * Nightly, because the fixture sleeps 5.2s. The merge-gating structural check
 * in tests/mutation/_metaOverlayConfigParity.test.ts compares the config VALUE
 * on every merge; this proves the value takes effect, which comparing a number
 * to a number cannot.
 */
describe("the per-mutant config's timeout is in force", () => {
  it("runs a fixture that outlives vitest's 5000ms default", () => {
    expect(childRun(root, "tests/mutation/source/fixtures/slowTest.fixture.ts", INERT_TARGET)).toBe(
      0,
    );
    // Same reason, and doubly so: the fixture deliberately sleeps past 5s, so
    // the child cannot finish inside a budget meant for in-process work.
  }, 300_000);
});
