import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import {
  checkDeclaredLimitPins,
  type PinDisposition,
  type PreparedSuite,
  type SuitePreparer,
} from "../../lib/specLint/declaredLimitPins";
import type { EnrolledSurface, FileResolver, Finding } from "../../lib/specLint/types";
import { SYNTHETIC_TITLES as T } from "./__fixtures__/declaredLimitPins/syntheticTitles";

/**
 * Task 3 — the obligation, both finding codes, and the fail-open closure
 * (spec §3.3, §3.4; AC-3, AC-5).
 *
 * ── THE FAIL-OPEN CLOSURE IS THE POINT, AND IT HAS THREE CHANNELS ──────────────
 * "No pins" and "could not look" must never be the same observation. Only ONE of the
 * three ways a suite can fail to yield trustworthy pins is visible through
 * `readFileLines`, so an implementation resting on it passes channel 1 and fails the
 * other two:
 *
 *   1. `readFileLines` returns null — unreadable, or a symlink.
 *   2. The path is absent from `listTrackedFiles()`. The read seam is TRACKING-BLIND:
 *      it resolves any file on disk, so an untracked suite reads fine and reports
 *      "no pins" with nothing saying the tree and the index disagree. Its fixture uses
 *      a resolver whose read SUCCEEDS and returns real pin-bearing text.
 *   3. Preparation reports PARSE DIAGNOSTICS. This suite owns the CHANNEL, not the
 *      ORDERING: the pure core receives a prepared RESULT and never parses anything,
 *      so whether diagnostics were taken before or after blanking is invisible here
 *      and is proved in Task 7b against the real preparation function. One fact, one
 *      owner.
 *
 * **All three channels assert the OTHER suite's pins still report.** The parse channel
 * needs this most: live surfaces have several suites and the pins are often in the
 * later one — `reviewRoundCount` names `tests/reviewRounds/count.test.ts` AND
 * `tests/docs/_metaReviewRoundEconomy.test.ts`, and both of that surface's pins are in
 * the second. An implementation that `return`s from the SURFACE on a bad suite, while
 * correctly continuing for the other channels, passes every other fixture here and
 * silently suppresses a live pin.
 */

const SUITE_A = "tests/qplinth/alpha.test.ts";
const SUITE_B = "tests/qplinth/beta.test.ts";
const SOURCE_A = "lib/qplinth/alpha.ts";
const SOURCE_B = "lib/qplinth/beta.ts";

const UNNAMED = "DECLARED_LIMIT_PIN_UNNAMED";
const UNREADABLE = "DECLARED_LIMIT_PIN_SUITE_UNREADABLE";

const SURFACE_A: EnrolledSurface = {
  id: "qplinthAlpha",
  sourcePath: SOURCE_A,
  suitePaths: [SUITE_A],
};
const SURFACE_B: EnrolledSurface = {
  id: "qplinthBeta",
  sourcePath: SOURCE_B,
  suitePaths: [SUITE_B],
};
/** One pin reachable through TWO surfaces: both name the same suite. */
const SURFACE_B_SHARING_A: EnrolledSurface = {
  id: "qplinthBetaSharing",
  sourcePath: SOURCE_B,
  suitePaths: [SUITE_A],
};

const pinLine = (title: string): string => `test("${title}", () => {});`;

/** A resolver over an in-memory file table. `tracked` defaults to every key. */
function resolverOf(files: Record<string, string[] | null>, tracked?: string[]): FileResolver {
  return {
    readFileLines: (path) => (path in files ? (files[path] ?? null) : null),
    listTrackedFiles: () => tracked ?? Object.keys(files),
  };
}

/** Identity preparation, except for paths declared unparseable (channel 3). */
function preparerOf(parseFailures: readonly string[] = []): SuitePreparer {
  return (path, lines): PreparedSuite =>
    parseFailures.includes(path) ? { status: "parse-failed" } : { status: "ok", lines };
}

interface RunOptions {
  kind?: "spec" | "plan";
  surfaces?: readonly EnrolledSurface[] | null;
  files?: Record<string, string[] | null>;
  tracked?: string[];
  parseFailures?: readonly string[];
  dispositions?: readonly PinDisposition[];
}

function run(planText: string, options: RunOptions = {}): Finding[] {
  const files = options.files ?? {};
  return checkDeclaredLimitPins(
    parseDoc(planText),
    options.kind ?? "plan",
    options.surfaces === undefined ? [SURFACE_A] : options.surfaces,
    resolverOf(files, options.tracked),
    preparerOf(options.parseFailures),
    options.dispositions ?? [],
  );
}

const doc = (...lines: string[]): string => lines.join("\n") + "\n";
const declaring = (...paths: string[]): string =>
  doc("**Files:**", ...paths.map((p) => `- Modify: \`${p}\``));

/** Order-independent: several findings legitimately share one anchor (spec §3.3). */
const codes = (findings: Finding[]): string[] => findings.map((f) => f.code).sort();
const titlesIn = (findings: Finding[], code: string): string[] =>
  findings
    .filter((f) => f.code === code)
    .map((f) => /"([^"]*)"$/.exec(f.message)?.[1] ?? f.message)
    .sort();

describe("checkDeclaredLimitPins — the obligation (spec §3.3)", () => {
  it("draws exactly one advisory for an unnamed pin, at ADVISORY severity", () => {
    const findings = run(declaring(SUITE_A), { files: { [SUITE_A]: [pinLine(T.piCompanion)] } });
    expect(codes(findings)).toEqual([UNNAMED]);
    expect(findings[0]!.severity).toBe("advisory");
    expect(findings[0]!.message).toContain(T.piCompanion);
    expect(findings[0]!.message).toContain(SUITE_A);
  });

  it("draws NOTHING when the plan names the pin verbatim, while an unnamed pin in the same run draws", () => {
    // Paired, so the silence cannot be an arm that went quiet everywhere.
    const plan = doc(
      "**Files:**",
      `- Modify: \`${SUITE_A}\``,
      "",
      `We retire "${T.piCompanion}" in Step 3.`,
    );
    const files = { [SUITE_A]: [pinLine(T.piCompanion), pinLine(T.tauLive)] };
    const findings = run(plan, { files });
    expect(codes(findings)).toEqual([UNNAMED]);
    expect(titlesIn(findings, UNNAMED)).toEqual([T.tauLive]);
  });

  it("counts a title inside a FENCED block as named — the search is the whole document", () => {
    const plan = doc("**Files:**", `- Modify: \`${SUITE_A}\``, "", "```", T.piCompanion, "```");
    expect(codes(run(plan, { files: { [SUITE_A]: [pinLine(T.piCompanion)] } }))).toEqual([]);
  });

  it("anchors the advisory at the Files-declaration line that named the surface", () => {
    const plan = doc("## Task 1", "", "**Files:**", `- Modify: \`${SUITE_A}\``);
    const findings = run(plan, { files: { [SUITE_A]: [pinLine(T.piCompanion)] } });
    // Assert a finding EXISTS before indexing one, so a stub that returns nothing fails
    // on this assertion rather than on a TypeError. A wrong-reason red exits non-zero
    // and looks healthy to every did-it-fail check while proving nothing.
    expect(codes(findings)).toEqual([UNNAMED]);
    expect(findings[0]!.docLine).toBe(3);
    // COLUMN is asserted too. It is a whole-line finding, so column 1 is the contract;
    // without this the constant is unpinned and any value would satisfy the suite.
    expect(findings.every((f) => f.column === 1)).toBe(true);
  });

  it("reports EVERY finding at advisory severity, asserted over all of them rather than sampled", () => {
    const files = {
      [SUITE_A]: [pinLine(T.piCompanion), pinLine(T.tauLive)],
      [SUITE_B]: null,
    };
    const findings = run(declaring(SUITE_A, SUITE_B), {
      surfaces: [SURFACE_A, SURFACE_B],
      files,
      tracked: [SUITE_A, SUITE_B],
    });
    expect(findings.length).toBeGreaterThan(1);
    expect(findings.every((f) => f.severity === "advisory")).toBe(true);
    expect(new Set(findings.map((f) => f.check))).toEqual(new Set(["taskContract"]));
  });
});

describe("checkDeclaredLimitPins — emission order (spec §3.3)", () => {
  it("emits in DOC ORDER of first naming, then pin order within a suite", () => {
    // Spec §3.3 states an emission order, so it is asserted rather than left to the
    // caller. Note `runLint` re-sorts every finding by (check, docLine, column, code),
    // so this order is observable only on a DIRECT call — which is exactly why it needs
    // its own case and cannot be inferred from the wiring suite.
    //
    // Every OTHER multi-finding assertion in this arc is deliberately order-independent,
    // because findings sharing an anchor have no natural order and a positional
    // assertion there would either flake or pass by luck.
    const plan = doc(
      "**Files:**",
      `- Modify: \`${SUITE_B}\``,
      "",
      "## Task 2",
      "",
      "**Files:**",
      `- Modify: \`${SUITE_A}\``,
    );
    const findings = run(plan, {
      surfaces: [SURFACE_A, SURFACE_B],
      files: { [SUITE_A]: [pinLine(T.piCompanion)], [SUITE_B]: [pinLine(T.tauLive)] },
    });
    // SUITE_B is named FIRST in the document, so its advisory comes first even though
    // SURFACE_A is first in the injected table.
    // Anchored at the HEADER lines (1 and 6), not at the item lines that carry the
    // paths — every pin of a surface shares its declaration's anchor.
    expect(findings.map((f) => f.docLine)).toEqual([1, 6]);
    expect(titlesIn([findings[0]!], UNNAMED)).toEqual([T.tauLive]);
  });
});

describe("checkDeclaredLimitPins — naming is a VERBATIM SUBSTRING test (spec §8 item 7)", () => {
  it("is satisfied when a LONGER title present in the plan literally contains the pin's title", () => {
    const longer = `${T.tauLive} under sustained burst`;
    const plan = doc("**Files:**", `- Modify: \`${SUITE_A}\``, "", `We keep "${longer}" as is.`);
    expect(codes(run(plan, { files: { [SUITE_A]: [pinLine(T.tauLive)] } }))).toEqual([]);
  });

  it("is NOT satisfied by a near-miss that does not literally contain the title", () => {
    // Paired with the case above on one variable: the plan's sentence.
    const plan = doc(
      "**Files:**",
      `- Modify: \`${SUITE_A}\``,
      "",
      "We keep the qplinth tau hinge as is.",
    );
    expect(codes(run(plan, { files: { [SUITE_A]: [pinLine(T.tauLive)] } }))).toEqual([UNNAMED]);
  });
});

describe("checkDeclaredLimitPins — decoding, the other half of Task 1's pair", () => {
  // The SOURCE spelling and the DECODED title differ. Exactly ONE of the two is named
  // in each plan below: naming both silences both and proves nothing.
  const SOURCE_SPELLED = 'test("the qplinth \\"epsilon\\" shim is a known miss", () => {});';

  it("draws NOTHING when the plan names the DECODED title", () => {
    const plan = doc(
      "**Files:**",
      `- Modify: \`${SUITE_A}\``,
      "",
      `We retire ${T.epsilonEscapedQuote} in Step 3.`,
    );
    expect(codes(run(plan, { files: { [SUITE_A]: [SOURCE_SPELLED] } }))).toEqual([]);
  });

  it("DRAWS when the plan names the SOURCE spelling instead", () => {
    // The pair that fails any implementation carrying the raw capture through to the
    // comparison: that one passes the case above and fails this one.
    const plan = doc(
      "**Files:**",
      `- Modify: \`${SUITE_A}\``,
      "",
      'We retire the qplinth \\"epsilon\\" shim is a known miss in Step 3.',
    );
    expect(codes(run(plan, { files: { [SUITE_A]: [SOURCE_SPELLED] } }))).toEqual([UNNAMED]);
  });

  it("matches a decoded NEWLINE title spanning TWO plan lines (spec §8 item 13)", () => {
    // Fails a per-line obligation matcher, which is the implementation this rejects.
    const pin = 'test("a qplinth newline\\nspanning documented limit", () => {});';
    const plan = doc(
      "**Files:**",
      `- Modify: \`${SUITE_A}\``,
      "",
      "a qplinth newline",
      "spanning documented limit",
    );
    expect(codes(run(plan, { files: { [SUITE_A]: [pin] } }))).toEqual([]);
  });

  it("matches a decoded TAB title within ONE plan line (spec §8 item 13)", () => {
    const pin = 'test("a qplinth tab\\tbearing documented limit", () => {});';
    const plan = doc(
      "**Files:**",
      `- Modify: \`${SUITE_A}\``,
      "",
      "a qplinth tab\tbearing documented limit",
    );
    expect(codes(run(plan, { files: { [SUITE_A]: [pin] } }))).toEqual([]);
  });
});

describe("checkDeclaredLimitPins — deduplication is on (suitePath, title) and NOTHING else", () => {
  it("draws ONE finding for one pin reachable through TWO surfaces", () => {
    const findings = run(declaring(SUITE_A, SOURCE_B), {
      surfaces: [SURFACE_A, SURFACE_B_SHARING_A],
      files: { [SUITE_A]: [pinLine(T.piCompanion)] },
    });
    expect(codes(findings)).toEqual([UNNAMED]);
  });

  it("draws TWO findings for two DIFFERENT pins on two surfaces — the dedup case's partner", () => {
    // "One pin, two surfaces, one finding" is ALSO satisfied by an implementation that
    // ignores surfaces entirely and reports per pin. Only an implementation that tracks
    // surfaces AND deduplicates passes both halves.
    const findings = run(declaring(SUITE_A, SUITE_B), {
      surfaces: [SURFACE_A, SURFACE_B],
      files: { [SUITE_A]: [pinLine(T.piCompanion)], [SUITE_B]: [pinLine(T.tauLive)] },
    });
    expect(titlesIn(findings, UNNAMED)).toEqual([T.piCompanion, T.tauLive].sort());
  });

  it("draws BOTH findings for TWO pins on ONE surface, which share an anchor line", () => {
    // Every pin of a surface anchors at that surface's declaration line, so an
    // anchor-position dedup — a set keyed on `code:file:line`, which no rule mandates
    // and any competent author reaches for — silently merges them. The dedup-partner
    // case above uses two SURFACES and leaves this untested; the corpus case would
    // catch it only after the collapse had shipped.
    const findings = run(declaring(SUITE_A), {
      files: { [SUITE_A]: [pinLine(T.piCompanion), pinLine(T.tauLive)] },
    });
    expect(titlesIn(findings, UNNAMED)).toEqual([T.piCompanion, T.tauLive].sort());
    expect(new Set(findings.map((f) => f.docLine)).size).toBe(1);
  });
});

describe("checkDeclaredLimitPins — the fail-open closure, all THREE channels (spec §3.4)", () => {
  /** Surface A's suite is broken; surface B's carries a pin that MUST still report. */
  const twoSurfaces = { surfaces: [SURFACE_A, SURFACE_B] as EnrolledSurface[] };
  const planNamingBoth = declaring(SUITE_A, SUITE_B);

  it("channel 1 — a null read draws the advisory, and the other suite's pins still report", () => {
    const findings = run(planNamingBoth, {
      ...twoSurfaces,
      files: { [SUITE_A]: null, [SUITE_B]: [pinLine(T.tauLive)] },
      tracked: [SUITE_A, SUITE_B],
    });
    expect(codes(findings)).toEqual([UNNAMED, UNREADABLE].sort());
    expect(titlesIn(findings, UNNAMED)).toEqual([T.tauLive]);
    const unreadable = findings.find((f) => f.code === UNREADABLE)!;
    expect(unreadable.message).toContain(SUITE_A);
    // The unreadable finding carries its OWN column constant, which the UNNAMED case
    // cannot pin: both are whole-line findings and both must report column 1.
    expect(unreadable.column).toBe(1);
    expect(unreadable.docLine).toBeGreaterThan(0);
  });

  it("channel 2 — an UNTRACKED suite whose read SUCCEEDS draws it too", () => {
    // The case a tracking-blind implementation passes silently: the read returns real
    // pin-bearing text, so resting on `readFileLines` alone reports those pins as
    // though the tree and the index agreed.
    const findings = run(planNamingBoth, {
      ...twoSurfaces,
      files: { [SUITE_A]: [pinLine(T.piCompanion)], [SUITE_B]: [pinLine(T.tauLive)] },
      tracked: [SUITE_B],
    });
    expect(codes(findings)).toEqual([UNNAMED, UNREADABLE].sort());
    // The untracked suite's pin is NOT reported as a pin — it is reported as unreadable.
    expect(titlesIn(findings, UNNAMED)).toEqual([T.tauLive]);
    expect(findings.find((f) => f.code === UNREADABLE)!.message).toContain(SUITE_A);
  });

  it("channel 3 — a suite whose PREPARATION reports diagnostics draws it, and the other still reports", () => {
    const findings = run(planNamingBoth, {
      ...twoSurfaces,
      files: { [SUITE_A]: [pinLine(T.piCompanion)], [SUITE_B]: [pinLine(T.tauLive)] },
      tracked: [SUITE_A, SUITE_B],
      parseFailures: [SUITE_A],
    });
    expect(codes(findings)).toEqual([UNNAMED, UNREADABLE].sort());
    expect(titlesIn(findings, UNNAMED)).toEqual([T.tauLive]);
  });

  it("channel 3, within ONE surface — an unparseable FIRST suite does not suppress a pin-bearing SECOND", () => {
    // The discriminating shape. An implementation that `return`s from the SURFACE on a
    // parse failure passes all three cases above and fails only this one, because live
    // surfaces genuinely carry several suites with the pins in the later one.
    const twoSuiteSurface: EnrolledSurface = {
      id: "qplinthTwoSuites",
      sourcePath: SOURCE_A,
      suitePaths: [SUITE_A, SUITE_B],
    };
    const findings = run(declaring(SOURCE_A), {
      surfaces: [twoSuiteSurface],
      files: { [SUITE_A]: [pinLine(T.piCompanion)], [SUITE_B]: [pinLine(T.tauLive)] },
      tracked: [SUITE_A, SUITE_B],
      parseFailures: [SUITE_A],
    });
    expect(codes(findings)).toEqual([UNNAMED, UNREADABLE].sort());
    expect(titlesIn(findings, UNNAMED)).toEqual([T.tauLive]);
  });

  it("a HEALTHY suite draws NO unreadable advisory, while its pins still report", () => {
    // Kills "emit the unreadable advisory unconditionally", which satisfies all three
    // channel cases above. PAIRED: the same run must still report this suite's pins, so
    // an arm that has gone silent everywhere fails rather than passing by absence.
    const findings = run(declaring(SUITE_A), {
      files: { [SUITE_A]: [pinLine(T.piCompanion)] },
      tracked: [SUITE_A],
    });
    expect(codes(findings)).toEqual([UNNAMED]);
    expect(titlesIn(findings, UNNAMED)).toEqual([T.piCompanion]);
  });
});

describe("checkDeclaredLimitPins — injection, end to end (spec §6)", () => {
  it("advises on a SYNTHETIC surface's pin, proving the table drives the whole path", () => {
    // Task 2 proved the NAMING half. An integration that consults the injected table
    // when naming and then ignores or replaces that result downstream passes Task 2 and
    // fails only here; Tasks 5 and 7b cannot catch it, since they exercise only REAL
    // enrolled surfaces.
    const synthetic: EnrolledSurface = {
      id: "qplinthSyntheticSurface",
      sourcePath: "lib/qplinth/syntheticCore.ts",
      suitePaths: ["tests/qplinth/syntheticCore.test.ts"],
    };
    const findings = run(declaring("tests/qplinth/syntheticCore.test.ts"), {
      surfaces: [synthetic],
      files: { "tests/qplinth/syntheticCore.test.ts": [pinLine(T.piCompanion)] },
    });
    expect(codes(findings)).toEqual([UNNAMED]);
    expect(findings[0]!.detail).toContain("qplinthSyntheticSurface");
  });

  it("runs NOTHING for a null table, while the same plan under a table draws", () => {
    const files = { [SUITE_A]: [pinLine(T.piCompanion)] };
    expect(run(declaring(SUITE_A), { surfaces: null, files })).toEqual([]);
    expect(codes(run(declaring(SUITE_A), { files }))).toEqual([UNNAMED]);
  });

  it("runs NOTHING for a SPEC-kind document, while the same text as a plan draws", () => {
    const files = { [SUITE_A]: [pinLine(T.piCompanion)] };
    expect(run(declaring(SUITE_A), { kind: "spec", files })).toEqual([]);
    expect(codes(run(declaring(SUITE_A), { kind: "plan", files }))).toEqual([UNNAMED]);
  });

  it("draws nothing for a named surface whose suite holds no pins, while a pin-bearing one draws", () => {
    expect(
      run(declaring(SUITE_A), { files: { [SUITE_A]: ['test("ordinary", () => {});'] } }),
    ).toEqual([]);
    expect(
      codes(run(declaring(SUITE_A), { files: { [SUITE_A]: [pinLine(T.piCompanion)] } })),
    ).toEqual([UNNAMED]);
  });

  it("honors the disposition registry end to end", () => {
    const files = { [SUITE_A]: [pinLine(T.sigmaDispositioned), pinLine(T.tauLive)] };
    const dispositions: PinDisposition[] = [
      { path: SUITE_A, title: T.sigmaDispositioned, reason: "constructed for this suite" },
    ];
    expect(titlesIn(run(declaring(SUITE_A), { files, dispositions }), UNNAMED)).toEqual([
      T.tauLive,
    ]);
    // Control: without the row, BOTH draw.
    expect(titlesIn(run(declaring(SUITE_A), { files }), UNNAMED)).toEqual(
      [T.sigmaDispositioned, T.tauLive].sort(),
    );
  });
});
