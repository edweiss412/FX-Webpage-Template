/**
 * tests/docs/diagramTileRecordSweep.test.ts
 *
 * The mechanical oracle that REPLACES a fifth prose review round, on the
 * orchestrator's authorization (2026-09-01).
 *
 * Why it exists rather than another round. Three consecutive diff rounds on
 * fix/diagram-tile-states each returned the same finding SHAPE: a record claim
 * repaired at the sites the reviewer happened to name, while other instances of
 * the identical claim survived elsewhere in the corpus. Rounds 1 and 2 caught
 * two such classes; the final round caught three more instances across three
 * already-"repaired" claims. A fifth round would have been a fourth sample of
 * one distribution.
 *
 * The round-economy rule's third option is to replace enumeration with a
 * mechanical oracle and review THAT once. This is that oracle: each claim the
 * arc repaired becomes an executable assertion that its forbidden shape is
 * ABSENT from the whole corpus, so a survivor is a failing test rather than a
 * finding somebody has to spot.
 *
 * Every claim carries a PLANTED CONTROL. A matcher that has stopped matching is
 * indistinguishable from a corpus that is clean, and this file's whole value is
 * the difference between those two, so each matcher is run against the exact
 * pre-repair text and must fire on it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** The arc's own record surfaces: the two documents, the probes that model the
 *  tile, the two browser specs that carry the claims in comments, and the
 *  component whose comments repeat them. Listed rather than walked because the
 *  claims are about THIS arc's records; a survivor in an unrelated file is not
 *  what this oracle is for. */
const SURFACES = [
  "docs/superpowers/specs/2026-08-31-diagram-tile-states.md",
  "docs/superpowers/plans/2026-08-31-diagram-tile-states.md",
  "docs/superpowers/specs/probes/2026-08-31-diagram-tile-layout-probe.mjs",
  "docs/superpowers/specs/probes/2026-08-31-diagram-tile-grid-probe.mjs",
  "docs/superpowers/specs/probes/2026-08-31-diagram-tile-copy-fit-probe.mjs",
  "tests/e2e/step3-review-modal.layout.spec.ts",
  "tests/e2e/step3-review-modal.interactions.spec.ts",
  "components/admin/wizard/step3ReviewSections.tsx",
];

type Claim = {
  /** What the repair asserted, phrased as the thing that must NOT appear. */
  readonly label: string;
  /** The forbidden shape. */
  readonly forbidden: RegExp;
  /** Verbatim pre-repair text, from the commits this oracle replaces a round
   *  over. The matcher must fire on this or the matcher is dead. */
  readonly planted: readonly string[];
};

const CLAIMS: readonly Claim[] = [
  {
    label: "AC-7b is authored and green in Task 3, never in Task 2",
    // The four shapes the records actually used to say it.
    forbidden:
      /AC-7b[^.\n]{0,80}\bin Task 2\b|authored in 2, green in 3|Task 2 authored the five clauses|an AC-7b authored later/i,
    planted: [
      "AC-7b is split across the two on that boundary, in Task 2.",
      "| spec | AC-7b's `load-failed` arm, which needs hydration; authored in 2, green in 3 | 2, 3 |",
      "Task 2 authored the five clauses and left them red on clause 1:",
      "is already outside the box, so an AC-7b authored later could never be red.",
    ],
  },
  {
    label: "the name was cut off at 320 and 390 only, never at 640",
    forbidden: /320,\s*390 AND 640|three of (?:the )?four widths|two lines at 640\b/i,
    planted: [
      " * 320, 390 AND 640 — three of the four widths. The only recovery was the",
      "the copy-fit probe measures a realistic 21-character name needing two lines at 640 as well",
      "The name line was cut off at three of four widths",
    ],
  },
  {
    label: "the load-failed sentence is 54 characters",
    forbidden: /\b53 characters?\b/i,
    planted: ["// longer of the two at 53 characters, so a one-line result here means it is"],
  },
];

/**
 * A record that CORRECTS a claim has to be able to state the claim it corrects,
 * so this oracle distinguishes use from mention the way the convergence gate
 * already does for itself: an explicit, reasoned marker.
 *
 * `record-sweep-allow: <reason>` on the line, or on the line above it, exempts
 * that line. The reason is required by the assertion below, so an exemption
 * cannot be added silently, and an UNMARKED survivor still fails — the
 * exemption fails closed.
 */
const ALLOW = /record-sweep-allow:\s*\S/;

/** ONE extractor, used for the live corpus AND for every planted control, so a
 *  control cannot pass through a different code path than the assertion. */
function hits(text: string, claim: Claim): number {
  let n = 0;
  for (const line of text.split("\n")) {
    // A global regex would carry lastIndex across lines; test per line instead.
    if (new RegExp(claim.forbidden.source, claim.forbidden.flags.replace("g", "")).test(line)) n++;
  }
  return n;
}

describe("diagram-tile record sweep (mechanical oracle, replaces a 5th review round)", () => {
  const corpus = SURFACES.map((rel) => ({ rel, text: readFileSync(join(ROOT, rel), "utf8") }));

  it("every exemption carries a reason, and there are few of them", () => {
    // An exemption without a reason is an unexplained hole; a corpus full of
    // them is the enumeration this oracle replaced, wearing a marker.
    const marked = corpus.flatMap(({ rel, text }) =>
      text
        .split("\n")
        .map((line, i) => ({ rel, line: i + 1, text: line }))
        .filter((row) => /record-sweep-allow:/.test(row.text)),
    );
    for (const row of marked) {
      expect(ALLOW.test(row.text), `${row.rel}:${row.line} states a reason`).toBe(true);
    }
    expect(marked.length, "exemptions stay rare").toBeLessThanOrEqual(3);
  });

  it("reads every surface it claims to read", () => {
    // Premise: a path that stopped existing would silently shrink the corpus and
    // make every assertion below weaker without failing.
    expect(corpus.length).toBe(SURFACES.length);
    for (const { rel, text } of corpus) {
      expect(text.length, `${rel} is non-empty`).toBeGreaterThan(0);
    }
  });

  for (const claim of CLAIMS) {
    describe(claim.label, () => {
      it("fires on the pre-repair text (the matcher is alive)", () => {
        for (const planted of claim.planted) {
          expect(hits(planted, claim), `matcher fires on: ${planted.slice(0, 60)}`).toBeGreaterThan(
            0,
          );
        }
      });

      it("finds NO survivor anywhere in the arc's records", () => {
        const survivors = corpus
          .flatMap(({ rel, text }) => {
            const lines = text.split("\n");
            return lines.map((line, i) => ({
              rel,
              line: i + 1,
              text: line,
              exempt: ALLOW.test(line) || ALLOW.test(lines[i - 1] ?? ""),
            }));
          })
          .filter((row) => !row.exempt && hits(row.text, claim) > 0)
          .map((row) => `${row.rel}:${row.line} ${row.text.trim().slice(0, 90)}`);
        expect(survivors).toEqual([]);
      });
    });
  }
});
