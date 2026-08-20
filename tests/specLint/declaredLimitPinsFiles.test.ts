import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { namedSurfaces } from "../../lib/specLint/declaredLimitPins";
import type { EnrolledSurface } from "../../lib/specLint/types";

/**
 * Task 2 — the Files-declaration span, and which enrolled surfaces a plan NAMES
 * (spec §3.2, AC-2).
 *
 * ── THE GRAIN IS THE DECLARATION, NOT THE DOCUMENT ─────────────────────────────
 * Measured at the §2 baseline: whole-document matching draws on 63 plans against the
 * Files grain's 23. The 40-plan difference is prose citation — plans naming
 * `_metaPremiseContract.test.ts` or `numerics.ts` as context, contracts to satisfy, or
 * prior art. None of them edits the surface, and advising them is exactly the false
 * advisory the consequence bound forbids.
 *
 * ── EVERY NEGATIVE IS PAIRED, AND ALMOST EVERY PAIR IS DERIVED ─────────────────
 * A fixture expecting "names nothing" is satisfied by an implementation that never
 * looked. So each decline below is paired with the identical bytes minus ONE variable —
 * the blank line, the list marker, the `.bak` suffix — produced by a mechanical
 * transform of the declining fixture, and the paired variant NAMES. Where a transform
 * would be less legible than a second literal (the inline/list form pair, which differ
 * in what the header line carries) both are written out and the single variable is
 * named in the test.
 *
 * ── THE SURFACE TABLE IS INJECTED ──────────────────────────────────────────────
 * `lib/` imports no registry. Most rows below mirror real enrolled surfaces so the
 * multi-surface and delimited-token cases are realistic; verified against
 * `tests/mutation/source/registry.ts` at authoring time — `_metaReviewRoundEconomy.test.ts`
 * is a `suitePath` of exactly THREE surfaces. `SYNTHETIC` is the row whose paths appear
 * nowhere in that registry, and it is the case that kills a hardcoded copy of the live
 * enrolled paths.
 */

const REVIEW_ECONOMY_SUITE = "tests/docs/_metaReviewRoundEconomy.test.ts";

const SURFACES: readonly EnrolledSurface[] = [
  {
    id: "reviewRoundCount",
    sourcePath: "lib/reviewRounds/count.ts",
    suitePaths: ["tests/reviewRounds/count.test.ts", REVIEW_ECONOMY_SUITE],
  },
  {
    id: "reviewRoundCorpus",
    sourcePath: "lib/reviewRounds/corpus.ts",
    suitePaths: [REVIEW_ECONOMY_SUITE],
  },
  {
    id: "reviewRoundFiling",
    sourcePath: "lib/reviewRounds/filing.ts",
    suitePaths: [REVIEW_ECONOMY_SUITE],
  },
  {
    id: "interactionTimingScan",
    sourcePath: "scripts/scan-interaction-timings.ts",
    suitePaths: ["tests/docs/interactionTimingScan.test.ts"],
  },
];

/**
 * Paths absent from `tests/mutation/source/registry.ts` — checked at authoring time.
 * The weaker implementation this kills is "the 100 live enrolled paths, hardcoded",
 * which passes every other case in this file.
 */
const SYNTHETIC: EnrolledSurface = {
  id: "qplinthSyntheticSurface",
  sourcePath: "lib/qplinth/syntheticCore.ts",
  suitePaths: ["tests/qplinth/syntheticCore.test.ts"],
};

const named = (text: string, surfaces: readonly EnrolledSurface[] = SURFACES): string[] =>
  [...namedSurfaces(parseDoc(text), surfaces)].sort();

const doc = (...lines: string[]): string => lines.join("\n") + "\n";

describe("namedSurfaces — INLINE form reads its own line and nothing below it", () => {
  // The discriminating case round 3 found on a live plan: an inline declaration
  // followed by a blank and a TASK CHECKLIST. Skipping the blank absorbed the
  // checklist, so adding one ordinary prior-art citation to a checklist step made an
  // unrelated pin advise. Any blank-skipping implementation fails this.
  const INLINE_THEN_CHECKLIST = doc(
    "## Task 3",
    "",
    "**Files:** `BACKLOG.md` **and `BACKLOG-archive.md`**",
    "",
    `- [ ] Step 1: read \`${REVIEW_ECONOMY_SUITE}\` for prior art`,
    "- [ ] Step 2: commit",
  );

  it("does not read a checklist below an inline declaration, even across a blank line", () => {
    expect(named(INLINE_THEN_CHECKLIST)).toEqual([]);
  });

  it("…while the SAME checklist line under a LIST-form header IS read (the one variable is the header)", () => {
    // Identical checklist bytes; only the header changed from inline to list form, and
    // the blank line is gone. Without this pair the case above is satisfied by an
    // implementation that reads no declaration at all.
    const listForm = doc(
      "## Task 3",
      "",
      "**Files:**",
      `- [ ] Step 1: read \`${REVIEW_ECONOMY_SUITE}\` for prior art`,
      "- [ ] Step 2: commit",
    );
    expect(named(listForm)).toEqual([
      "reviewRoundCorpus",
      "reviewRoundCount",
      "reviewRoundFiling",
    ]);
  });

  it("treats a ROOT-FILE path on the header as making the form INLINE (round 6)", () => {
    // A slash-bearing probe wrongly excluded the 54 headers naming only a root file
    // (`BACKLOG.md`, `package.json`, `AGENTS.md`). If the header is not recognized as
    // inline, the list below is read and the surface is wrongly named.
    const rootFileInline = doc(
      "**Files:** `package.json`",
      `- Modify: \`${REVIEW_ECONOMY_SUITE}\``,
    );
    expect(named(rootFileInline)).toEqual([]);
  });

  it("names an enrolled path that sits ON the header line itself", () => {
    // The round-1 finding: an implementation scanning only the lines BELOW the header
    // misses 696 of 2567 headers, and dropped a real `interactionTimingScan` advisory.
    expect(named(doc("**Files:** Modify `tests/docs/interactionTimingScan.test.ts`"))).toEqual([
      "interactionTimingScan",
    ]);
  });
});

describe("namedSurfaces — LIST form, and where the run ends", () => {
  it("reads a run of unordered items immediately below the header", () => {
    expect(
      named(doc("**Files:**", "- Modify: `lib/reviewRounds/count.ts`", "- Test: `tests/reviewRounds/count.test.ts`")),
    ).toEqual(["reviewRoundCount"]);
  });

  it("ends the run at the FIRST BLANK LINE", () => {
    const stopsAtBlank = doc(
      "**Files:**",
      "- Modify: `lib/reviewRounds/count.ts`",
      "",
      `- Modify: \`scripts/scan-interaction-timings.ts\``,
    );
    expect(named(stopsAtBlank)).toEqual(["reviewRoundCount"]);
  });

  it("ends the run at the first line that is NOT a list item", () => {
    const stopsAtProse = doc(
      "**Files:**",
      "- Modify: `lib/reviewRounds/count.ts`",
      "Prose resumes here.",
      "- Modify: `scripts/scan-interaction-timings.ts`",
    );
    expect(named(stopsAtProse)).toEqual(["reviewRoundCount"]);
  });

  it("reads an INDENTED CONTINUATION line of a list item", () => {
    const continuation = doc(
      "**Files:**",
      "- Modify: the review-round counter",
      "  `lib/reviewRounds/count.ts`",
    );
    expect(named(continuation)).toEqual(["reviewRoundCount"]);
  });

  it("reads a SECOND `**Files:**` block in the same document", () => {
    const twoBlocks = doc(
      "**Files:**",
      "- Modify: `lib/reviewRounds/count.ts`",
      "",
      "## Task 2",
      "",
      "**Files:**",
      "- Modify: `scripts/scan-interaction-timings.ts`",
    );
    expect(named(twoBlocks)).toEqual(["interactionTimingScan", "reviewRoundCount"]);
  });

  it("accepts the `**Files**` spelling and a list-item header", () => {
    expect(named(doc("- **Files**", "  - Modify: `lib/reviewRounds/count.ts`"))).toEqual([
      "reviewRoundCount",
    ]);
  });
});

describe("namedSurfaces — declined shapes, each paired on ONE variable", () => {
  // ── a blank line between header and list ──────────────────────────────────────
  // Spec §8 item 14. No blank is ever skipped: the blank is the signal that the list
  // below belongs to something else.
  const BLANK_GAP = doc("**Files:**", "", `- Modify: \`${REVIEW_ECONOMY_SUITE}\``);
  const NO_GAP = BLANK_GAP.replace("**Files:**\n\n", "**Files:**\n");

  it("declines a list separated from its header by a BLANK LINE (spec §8 item 14)", () => {
    expect(named(BLANK_GAP)).toEqual([]);
  });

  it("…and the SAME BYTES with the blank removed NAME all three surfaces", () => {
    expect(named(NO_GAP)).toEqual(["reviewRoundCorpus", "reviewRoundCount", "reviewRoundFiling"]);
  });

  // ── an ordered run ────────────────────────────────────────────────────────────
  // Spec §8 item 11. 19 headers of 2567 are followed by one, and sampling shows those
  // runs are as often TASK STEPS as file lists, so the arm declines rather than
  // guessing. The failure direction is a missed advisory, never a false one.
  const ORDERED = doc("**Files:**", `1. Modify: \`${REVIEW_ECONOMY_SUITE}\``);
  const UNORDERED = ORDERED.replace("\n1. ", "\n- ");

  it("declines an ORDERED run after the header (spec §8 item 11)", () => {
    expect(named(ORDERED)).toEqual([]);
  });

  it("…and the SAME BYTES with the list marker swapped NAME all three surfaces", () => {
    expect(named(UNORDERED)).toEqual(["reviewRoundCorpus", "reviewRoundCount", "reviewRoundFiling"]);
  });

  // ── a fenced header ───────────────────────────────────────────────────────────
  const FENCED = doc("```markdown", "**Files:**", "- Modify: `lib/reviewRounds/count.ts`", "```");
  const UNFENCED = doc("**Files:**", "- Modify: `lib/reviewRounds/count.ts`");

  it("treats a `**Files:**` line inside a FENCE as inert", () => {
    expect(named(FENCED)).toEqual([]);
  });

  it("…and the SAME declaration outside the fence NAMES its surface", () => {
    expect(named(UNFENCED)).toEqual(["reviewRoundCount"]);
  });
});

describe("namedSurfaces — a path is a DELIMITED TOKEN, not a substring (spec §3.2)", () => {
  it("declines a `.bak` sibling while the real entry in the SAME declaration still names", () => {
    // Both halves in one input, so the negative cannot pass by the scanner going silent.
    // A `String.prototype.includes` implementation names the surface twice here and
    // fails, because the `.bak` line must contribute NOTHING.
    const withBak = doc(
      "**Files:**",
      "- Modify: `lib/reviewRounds/count.ts.bak`",
      "- Modify: `scripts/scan-interaction-timings.ts`",
    );
    expect(named(withBak)).toEqual(["interactionTimingScan"]);
  });

  it("declines a PREFIXED path, the LEADING side of the same rule", () => {
    // An implementation checking only the character AFTER the match reads
    // `archive/lib/reviewRounds/count.ts` as the enrolled surface. Paired with a real
    // entry so silence cannot pass.
    const prefixed = doc(
      "**Files:**",
      "- Modify: `archive/lib/reviewRounds/count.ts`",
      "- Modify: `scripts/scan-interaction-timings.ts`",
    );
    expect(named(prefixed)).toEqual(["interactionTimingScan"]);
  });

  it("names the surface when the exact entry appears, as the control for both declines", () => {
    expect(named(doc("**Files:**", "- Modify: `lib/reviewRounds/count.ts`"))).toEqual([
      "reviewRoundCount",
    ]);
  });
});

describe("namedSurfaces — boundaries of the LIST-form lookahead", () => {
  it("declines a header that is the LAST line of the document", () => {
    // There is no next line to look at. Paired below, so "names nothing" cannot pass by
    // the scanner never having run.
    expect(named(doc("## Task 1", "", "**Files:**"))).toEqual([]);
  });

  it("…while the same header WITH a list under it names its surface", () => {
    expect(named(doc("## Task 1", "", "**Files:**", "- Modify: `lib/reviewRounds/count.ts`"))).toEqual([
      "reviewRoundCount",
    ]);
  });

  it("declines when the line below the header opens a FENCE", () => {
    // The lookahead must reject a fenced next line, not merely a non-list one.
    const fencedBelow = doc("**Files:**", "```", "- Modify: `lib/reviewRounds/count.ts`", "```");
    expect(named(fencedBelow)).toEqual([]);
  });

  it("reads a list run that reaches the END OF THE DOCUMENT with no trailing blank", () => {
    // Drives the run loop to the final line. Without this the loop's bound is never
    // exercised at its boundary and an off-by-one there goes unnoticed.
    expect(named(doc("**Files:**", "- Modify: `lib/reviewRounds/count.ts`"))).toEqual([
      "reviewRoundCount",
    ]);
  });
});

describe("namedSurfaces — the delimiter test, at both of its edges", () => {
  it("declines a path preceded by a path character at position ONE", () => {
    // The LEADING edge at its tightest: the enrolled path starts at index 1, so an
    // implementation that only checks `index > 0` before reading the preceding
    // character reads "" and wrongly accepts.
    expect(named(doc("**Files:**", "- Modify: xlib/reviewRounds/count.ts"))).toEqual([]);
  });

  it("names a path that ends EXACTLY at the end of the line", () => {
    // The TRAILING edge at its tightest: nothing follows the path, so an implementation
    // that requires a character after the match drops a real citation.
    expect(named(doc("**Files:**", "- Modify: lib/reviewRounds/count.ts"))).toEqual([
      "reviewRoundCount",
    ]);
  });

  it("keeps scanning past an ABUTTED occurrence to find a clean one on the same line", () => {
    // A line can carry the path twice, once abutted and once delimited. A scan that
    // stops at the first occurrence — or advances past the second while resuming —
    // reports the wrong answer for the line.
    expect(
      named(doc("**Files:**", "- Modify: xlib/reviewRounds/count.ts and `lib/reviewRounds/count.ts`")),
    ).toEqual(["reviewRoundCount"]);
  });
});

describe("namedSurfaces — the grain, made executable (spec §2.5)", () => {
  it("names NOTHING for an enrolled path in prose outside every declaration", () => {
    // The §2.5 measurement as a test: a whole-document implementation passes every
    // other case in this file and fails this one.
    //
    // FIXTURE NEUTRALIZATION, both halves required:
    //  - it carries a REAL declaration naming a DIFFERENT enrolled surface, asserted
    //    NAMED in the same run — without it an implementation that names nothing passes;
    //  - and the prose path occurs NOWHERE inside that declaration, because §3.2
    //    multi-surface naming would name the surface anyway and the negative could not
    //    fail.
    const prose = doc(
      "**Files:**",
      "- Modify: `scripts/scan-interaction-timings.ts`",
      "",
      `Prior art: \`${REVIEW_ECONOMY_SUITE}\` is the gate our tests must satisfy.`,
      "It is NOT edited by this plan.",
    );
    expect(named(prose)).toEqual(["interactionTimingScan"]);
  });

  it("names a surface on a bullet whose VERB is unmodeled", () => {
    // The §2.5 verb argument as a test: a probe returns `Modify` 2011, `Test` 960,
    // `Create` 761 and a long tail of one-offs (`Regenerate`, `Modify or delete`,
    // `deliver row`). An accept-set over verbs is a denylist wearing an accept-set's
    // clothes; the arm reads only whether an enrolled path appears on a line in the
    // block. An implementation accept-listing Modify/Test/Create fails only this.
    expect(named(doc("**Files:**", "- Regenerate: `lib/reviewRounds/count.ts`"))).toEqual([
      "reviewRoundCount",
    ]);
  });

  it("names ALL surfaces a shared path belongs to", () => {
    // `_metaReviewRoundEconomy.test.ts` is a suitePath of three; pins are deduplicated
    // by (path, title) afterwards, so the reader still sees each pin once.
    expect(named(doc("**Files:**", `- Test: \`${REVIEW_ECONOMY_SUITE}\``))).toEqual([
      "reviewRoundCorpus",
      "reviewRoundCount",
      "reviewRoundFiling",
    ]);
  });

  it("names a surface by its sourcePath as readily as by a suitePath", () => {
    expect(named(doc("**Files:**", "- Modify: `scripts/scan-interaction-timings.ts`"))).toEqual([
      "interactionTimingScan",
    ]);
  });
});

describe("namedSurfaces — the table is INJECTED, not hardcoded (spec §6)", () => {
  it("names a SYNTHETIC surface whose paths appear nowhere in the registry", () => {
    // Kills "a hardcoded copy of the 100 live enrolled paths", which passes every other
    // case in this file.
    //
    // This is the NAMING half only, and deliberately not the whole proof: a naming-only
    // assertion is passed by an integration that uses the injected table here and then
    // ignores the result downstream. The END-TO-END half — the same synthetic surface
    // carrying a pin and drawing DECLARED_LIMIT_PIN_UNNAMED — is Task 3's, where
    // advisories first exist.
    const plan = doc("**Files:**", "- Test: `tests/qplinth/syntheticCore.test.ts`");
    expect(named(plan, [...SURFACES, SYNTHETIC])).toEqual(["qplinthSyntheticSurface"]);
  });

  it("names nothing when the injected table is EMPTY, while the same plan names under a table", () => {
    // Paired, so "empty table draws nothing" cannot pass by the scanner never looking.
    const plan = doc("**Files:**", "- Modify: `lib/reviewRounds/count.ts`");
    expect(named(plan, [])).toEqual([]);
    expect(named(plan)).toEqual(["reviewRoundCount"]);
  });

  it("names nothing for a document with no Files declaration at all", () => {
    const noDeclaration = doc("## Task 1", "", "We will edit `lib/reviewRounds/count.ts` eventually.");
    expect(named(noDeclaration)).toEqual([]);
    // Control: the same path inside a real declaration DOES name.
    expect(named(doc("**Files:**", "- Modify: `lib/reviewRounds/count.ts`"))).toEqual([
      "reviewRoundCount",
    ]);
  });
});
