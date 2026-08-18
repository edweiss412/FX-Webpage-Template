import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkUniversals } from "../../lib/specLint/universals";
import type { Finding } from "../../lib/specLint/types";

/**
 * Arm A — the `ENUMERATED_UNIVERSAL_NO_PROBE` advisory (spec
 * `docs/superpowers/specs/2026-08-17-speclint-prose-consistency-arms.md` §3.2, §6).
 *
 * This suite asserts FINDINGS ONLY. Every inventory-membership assertion — including
 * the group-side halves of the word-form and heading fixtures below — lives in
 * `universalsInventory.test.ts`, so this file greens on the advisory implementation
 * alone (plan review R1 F1 ownership split).
 */

const ADVISORY = "ENUMERATED_UNIVERSAL_NO_PROBE";

/** Findings of ONE code: a fixture can never pass because a different arm fired on the
 * same line (anti-tautology; the `numerics.test.ts` idiom). */
const only = (findings: Finding[], code: string): Finding[] =>
  findings.filter((f) => f.code === code);

function advisories(docText: string, kind: "spec" | "plan" = "spec"): Finding[] {
  return only(checkUniversals(parseDoc(docText), kind).findings, ADVISORY);
}

/**
 * E1, verbatim from the defective revision `cc7942d4e:181`
 * (`docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md`, §5.1).
 * Twenty of the twenty-one sites land on those four grounds, not all twenty-one.
 */
const E1_LINE =
  "`text-faint` against all four neutral grounds is already pinned in `tests/styles/secondary-action-contrast.test.ts` (`--color-surface`, `--color-surface-sunken`, `--color-bg`, `--color-surface-raised`, asserted `≥3.0`) and already carried as §1.2 rows. Every one of the 21 swapped sites lands on one of those four. **No new ratio assertion, no new token, no new DESIGN.md table row** — which is the check that the ruling really is one token per site.";

/** The E1 doc: claim in §5.1, the cardinal enumerated in a DIFFERENT section, no probe
 * command anywhere in the claim's own section. Every gate is satisfied, so the advisory
 * fires — the retro-probe regression of spec §6. */
const e1Doc = (claim: string = E1_LINE): string =>
  [
    "# Control outline surface fills",
    "",
    "## 5. Verification / pins",
    "",
    "### 5.1 The ratio side needs nothing new",
    "",
    claim,
    "",
    "## 6. Census",
    "",
    "The census carries 21 swapped sites, one row each.",
    "",
  ].join("\n");

describe("checkUniversals — ENUMERATED_UNIVERSAL_NO_PROBE (spec §3.2)", () => {
  it("fires exactly once on the E1 defective line, at the claim's own doc line", () => {
    const findings = advisories(e1Doc());
    expect(findings).toHaveLength(1);
    // Derived from the fixture's own layout, never hardcoded: the claim is the 7th line.
    expect(findings[0]!.docLine).toBe(e1Doc().split("\n").indexOf(E1_LINE) + 1);
    expect(findings[0]!.severity).toBe("advisory");
    expect(findings[0]!.check).toBe("universals");
  });

  it("names the cardinal and one other-section line carrying it (spec §3.2 message)", () => {
    const [finding] = advisories(e1Doc());
    expect(finding!.message).toContain("21");
    const detail = `${finding!.message}\n${finding!.detail ?? ""}`;
    expect(detail).toContain("The census carries 21 swapped sites");
  });

  it("the corrected current-main partition sentence draws nothing (repair direction)", () => {
    // The live repaired form at
    // `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` §5.1:
    // the universal was replaced by a partition, so no universal+cardinal match survives.
    // (The live line continues with a historical parenthetical — "an earlier draft claimed
    // all 21 did" — which is a separate self-describing clause, not this repair's subject.)
    const corrected =
      "**Twenty of the 21 land on one of those four; the twenty-first does not** — `components/admin/StagedPreviewBanner.tsx:72` is transparent on `warning-bg`, a TINTED plate.";
    expect(advisories(e1Doc(corrected))).toHaveLength(0);
  });
});

describe("checkUniversals — single-gate rejection fixtures (spec §6)", () => {
  it("gate 5: a probe command in the claim's own section silences it", () => {
    const doc = [
      "# Control outline surface fills",
      "",
      "### 5.1 The ratio side needs nothing new",
      "",
      "Counted with `rg -n 'text-faint' components/` over the tracked tree.",
      E1_LINE,
      "",
      "## 6. Census",
      "",
      "The census carries 21 swapped sites, one row each.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("gate 4: a cardinal appearing only in the claim's own section draws nothing", () => {
    const doc = [
      "# Control outline surface fills",
      "",
      "### 5.1 The ratio side needs nothing new",
      "",
      E1_LINE,
      "The census carries 21 swapped sites, one row each.",
      "",
      "## 6. Census",
      "",
      "Rows are listed by file.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("gate 1: a table row draws nothing", () => {
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "| claim | note |",
      "| --- | --- |",
      "| Every one of the 21 swapped sites lands there | census |",
      "",
      "## B",
      "",
      "The census carries 21 swapped sites.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("gate 1: a line carrying an ISO date draws nothing", () => {
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "As of 2026-08-16, every one of the 21 swapped sites lands on one of those four.",
      "",
      "## B",
      "",
      "The census carries 21 swapped sites.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("gate 1: a fenced line draws nothing", () => {
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "```",
      "Every one of the 21 swapped sites lands on one of those four.",
      "```",
      "",
      "## B",
      "",
      "The census carries 21 swapped sites.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("gate 1: a HEADING line carrying a universal + cardinal draws nothing", () => {
    // A heading is a label, not a claim sentence (spec §3.2 gate 1; R3 F1 resolved the
    // contract/instrument divergence in the instrument's favour).
    const doc = [
      "# Doc",
      "",
      "## Every one of the 21 swapped sites",
      "",
      "Body prose carrying no quantifier.",
      "",
      "## B",
      "",
      "The census carries 21 swapped sites.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("accept-set: a word-form cardinal draws nothing (documented limit)", () => {
    // Spec §7: "all twenty-one sites" is inventoried (clause-initial `All`), not
    // advisory-flagged. The SAME line's `universal-claims` membership is asserted in
    // universalsInventory.test.ts — the two halves of one fixture (ownership split).
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "All twenty-one sites carry the swap.",
      "",
      "## B",
      "",
      "The census carries 21 swapped sites.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("gate 3 discriminator: the qualifier's nearest predecessor IS the claim cardinal", () => {
    // Deleting the dated-qualifier gate yields one finding here — this fixture and no
    // other (spec §6; R2 F3 replaced the mixed-line form as the discriminator).
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "The ruling covers all 36 sites at plan time.",
      "",
      "## B",
      "",
      "The census carries 36 swapped sites.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("compound nearest-binding: only the unqualified claim fires", () => {
    // `all 37 sites (36 at plan time)` — the qualifier binds 36, its nearest predecessor,
    // so the 37 claim survives. NOT a single-gate discriminator (spec §6).
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "The ruling covers all 37 sites (36 at plan time).",
      "",
      "## B",
      "",
      "The census carries 37 rows and 36 earlier rows.",
      "",
    ].join("\n");
    const findings = advisories(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("37");
  });

  it.each([
    ["whitespace separator", "The job runs every 5 min against the live corpus."],
    ["hyphen separator", "The job runs every 5-min check against the live corpus."],
  ])("time-unit exclusion, %s: a frequency is not a population", (_label, claim) => {
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      claim,
      "",
      "## B",
      "",
      "The cadence is 5 in both places.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("inline-span discriminator: a backticked literal is example text, not a claim", () => {
    // The inline-span gate is the ONLY gate rejecting this line: it is non-fenced,
    // non-table, non-heading, undated, the value is in bounds, no time unit follows, no
    // dated qualifier binds it, 21 is enumerated in another section, and the claim's own
    // section carries no probe command. Deleting that gate fails exactly this fixture.
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "The banner reads `applies to all 21 rows` verbatim.",
      "",
      "## B",
      "",
      "The census carries 21 swapped sites.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("value bound, lower half: a value below 2 draws nothing", () => {
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "Status reads all 0 across the board.",
      "",
      "## B",
      "",
      "The prior run reported all 0 too.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it("value bound, width half: a 4-digit read draws nothing", () => {
    const doc = [
      "# Doc",
      "",
      "## A",
      "",
      "The rows date from all 2025 without exception.",
      "",
      "## B",
      "",
      "Filed across all 2025 in the archive.",
      "",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });

  it.each([
    [
      "thousands separator",
      "The shipped rule applies to all 5,022 eligible data rows without exception.",
      "5,022",
    ],
    [
      "decimal point",
      "The loop yields every 2.5 seconds of wall clock, which is not a population.",
      "2.5",
    ],
  ])(
    "literal continuation, %s: a fragment of a longer number is not the cardinal",
    (_label, claim, literal) => {
      // Layer-3 corpus finding: the recognizer read the FIRST DIGIT GROUP of a
      // comma-grouped number as the whole cardinal — `all 5,022 eligible data rows`
      // emitted on "all 5". Four live instances, all in the probe domain
      // (`ci/2026-07-06-mutation-harness-sharding.md:77,78`,
      // `parser/2026-08-07-parser-mutation-wave-design.md:319,345`). Two of them are
      // precisely the 4-digit populations the width bound exists to exclude, so this is
      // an emission OUTSIDE the stated accept-set — a defect by spec §1.2, repaired by
      // NARROWING, not a taste-based gate tightening against a frozen survivor set.
      const doc = [
        "# Doc",
        "",
        "## A",
        "",
        claim,
        "",
        "## B",
        "",
        `The other section also carries ${literal} for the reader to compare.`,
        "",
      ].join("\n");
      expect(advisories(doc)).toHaveLength(0);
    },
  );

  it("spec-kind gate: the same E1 doc read as a plan draws nothing", () => {
    expect(advisories(e1Doc(), "plan")).toHaveLength(0);
  });

  it("an empty doc draws nothing", () => {
    expect(advisories("")).toHaveLength(0);
  });
});

describe("every candidate on a line is evaluated, not just the first (spec §1.2 bound)", () => {
  // Whole-diff review R1: `UNIVERSAL_CARDINAL.exec` returned only the FIRST match, so a
  // candidate-specific rejection — the value bound, a literal continuation, a time unit,
  // an inline span, a dated qualifier, or missing enumeration evidence — SUPPRESSED a
  // later qualifying claim on the same line. The line then drew silence, and silence is
  // contracted to mean "no qualifying structure", never "verified consistent".
  //
  // Live proof, inside the probe domain:
  // `docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md:238`
  // carries `all 11` (no evidence elsewhere) before `all 5` (evidence in another section)
  // and emitted nothing; masking `all 11` alone made the `all 5` claim emit.

  /** The rejected candidate comes FIRST; the qualifying `45` claim comes second. */
  const twoCandidates = (first: string): string =>
    [
      "# Doc",
      "## A",
      `${first} and separately all 45 codes carry the copy.`,
      "## B",
      "The catalog carries 45 codes and 1 placeholder, over 45,000 words, across 45 days.",
    ].join("\n");

  it.each([
    ["value bound", "All 1 code is exempt"],
    ["literal continuation", "All 45,000 words were reviewed"],
    ["time unit", "All 45 days of the window are covered"],
    ["inline span", "The banner reads `all 45 rows` verbatim"],
    ["dated qualifier", "All 45 at plan time were counted"],
  ])("a first candidate rejected by the %s does not mask the later claim", (_label, first) => {
    const findings = advisories(twoCandidates(first));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("45");
  });

  it("a first candidate lacking enumeration evidence does not mask a later one", () => {
    // The live shape above, reduced to a fixture: `11` appears nowhere else, `5` does.
    const doc = [
      "# Doc",
      "## A",
      "Sites: the layout spec (all 11), the transitions spec (all 5), and the rest.",
      "## B",
      "The transitions spec carries 5 sites.",
    ].join("\n");
    const findings = advisories(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("5");
  });

  it("the ONE-advisory-per-line bound is retained when several candidates qualify", () => {
    const doc = [
      "# Doc",
      "## A",
      "Every one of the 21 sites lands there, and all 45 codes carry the copy.",
      "## B",
      "The census carries 21 sites and 45 codes.",
    ].join("\n");
    const findings = advisories(doc);
    expect(findings).toHaveLength(1);
    // The FIRST qualifying candidate owns the line.
    expect(findings[0]!.message).toContain("21");
  });

  it("a line whose every candidate is rejected still draws silence", () => {
    // The scan must not become "emit if any candidate matched the regex" — the gates
    // still decide, candidate by candidate.
    const doc = [
      "# Doc",
      "## A",
      "All 1 code is exempt and all 45 days of the window are covered.",
      "## B",
      "The catalog carries 45 codes and 1 placeholder.",
    ].join("\n");
    expect(advisories(doc)).toHaveLength(0);
  });
});
