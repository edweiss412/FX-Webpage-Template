/**
 * tests/docs/agendaFoldDocConsistency.test.ts
 *
 * WHY THIS EXISTS. The PR3 spec + plan pair took four adversarial rounds, and a large
 * share of each round's findings were defects in the PREVIOUS round's repairs — the
 * named instance got fixed and a contradicting copy elsewhere in the pair survived.
 * That class is nameable, mechanical, and therefore CI's job rather than a reviewer's.
 *
 * The project rule (docs/agents/writing-plans.md, "Structural-defense calibration")
 * says to ship the structural defense in the repair commit once the class is nameable,
 * not to wait for another round to confirm it. This is that defense.
 *
 * Scope is deliberately narrow: contradictions that are decidable by string presence.
 * It does NOT try to review the design — it pins decisions that were each re-litigated
 * across rounds, so a future edit that reintroduces the losing side fails here instead
 * of in review.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC = join(process.cwd(), "docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md");
const PLAN = join(process.cwd(), "docs/superpowers/plans/2026-07-26-agenda-perday-viewer-fold.md");

/**
 * Both documents deliberately QUOTE the wording each round superseded, so a reader can
 * see what changed and why. A naive scan therefore fires on the correction narrative
 * itself — which it did on the first run of this file, on two of its own rules. A gate
 * that flags its own bookkeeping is a false-positive generator, and false positives are
 * worse than no gate because they teach people to bypass it.
 *
 * So: scan only LIVE prose, by dropping any LINE that carries a correction marker. That is
 * sufficient — both original false positives quoted the old wording on a line that also said
 * "an earlier draft" / "was wrong", so the line filter catches them.
 *
 * An earlier version of this helper ALSO stripped double-quoted spans, and mutation testing
 * showed that silently disabled the first rule entirely: `kind: "subset"; days` contains a
 * quoted token, so stripping quotes rewrote it to `kind: ""; days` and the pattern could never
 * match. The rule that most needed quotes was the one the stripping broke. Kept as a comment
 * because "add a filter to reduce false positives, silently lose a true positive" is the whole
 * failure mode this file exists to guard against.
 */
const CORRECTION_MARKER =
  /earlier (draft|revision|version)|an earlier|was wrong|superseded|corrected|CORRECTED|withdrawn|WITHDRAWN|NOT the absence|removed rather than|no longer/;

function livePros(text: string): string {
  return text
    .split("\n")
    .filter((line) => !CORRECTION_MARKER.test(line))
    .join("\n");
}

const spec = livePros(readFileSync(SPEC, "utf8"));
const plan = livePros(readFileSync(PLAN, "utf8"));
const specRaw = readFileSync(SPEC, "utf8");
const planRaw = readFileSync(PLAN, "utf8");
const both = { spec, plan };

describe("agenda-fold spec/plan pair — decided questions stay decided", () => {
  it("the matcher contract is row INDICES, with no surviving date-set arm", () => {
    // R4 CRITICAL lineage: an ISO-date arm cannot identify a row, because the current
    // extractor always writes date: null (spec §2.5 fact 1).
    for (const [name, text] of Object.entries(both)) {
      expect(text, `${name} must not carry the superseded date-set arm`).not.toMatch(
        /kind:\s*"subset";\s*days/,
      );
    }
    expect(specRaw).toMatch(/kind:\s*"subset";\s*rows/);
  });

  it("aggregateDays is NOT forbidden above the boundary (the constraint was withdrawn)", () => {
    // R4 CRITICAL: the ban rested on aggregateDays throwing, and it cannot throw.
    // A future edit reinstating the ban would recreate the self-contradiction.
    for (const [name, text] of Object.entries(both)) {
      expect(text, `${name} must not reinstate the withdrawn aggregate ban`).not.toMatch(
        /(do NOT move|never) [`']?aggregateDays/i,
      );
    }
  });

  it("uniform <details> markup: no copy claims the fold renders without <details>", () => {
    // R3 HIGH, and it survived into a THIRD copy before being swept.
    for (const [name, text] of Object.entries(both)) {
      expect(text, `${name} must not claim plain rows for the fail-open case`).not.toMatch(
        /no\s+`<details>`\s+at all/i,
      );
    }
  });

  it("no un-sourced count of existing duration-fast class sites", () => {
    // Three consecutive rounds disputed this number because it is grep-flavour
    // dependent. It was removed rather than corrected again; the mechanism claim stays.
    for (const [name, text] of Object.entries(both)) {
      expect(text, `${name} must not reintroduce a bare site count`).not.toMatch(
        /\b1(18|24|42|79|85)\b\s*(existing|class-based|sites)/,
      );
      expect(text, `${name} must not claim a "119th" site`).not.toMatch(/119th/);
    }
    // The load-bearing mechanism claim must still be present and reproducible.
    expect(specRaw).toMatch(/transition-duration-fast/);
  });

  it("the prop is acknowledged as new in both documents", () => {
    // R3 LOW: both summaries still said "no new prop" after the contract added one.
    for (const [name, text] of Object.entries(both)) {
      expect(text, `${name} must not claim no new prop`).not.toMatch(/no new prop/i);
    }
  });

  it("every section the spec references exists as a heading", () => {
    const headings = new Set(
      [...specRaw.matchAll(/^## (\d+(?:\.\d+)?)/gm)].map((m) => m[1] as string),
    );
    const referenced = new Set(
      [...specRaw.matchAll(/§(\d+(?:\.\d+)?)/g)].map((m) => m[1] as string),
    );
    const orphans = [...referenced].filter((r) => !headings.has(r));
    expect(orphans, "spec references a section that does not exist").toEqual([]);
  });

  it("every plan task declares a red state or is labelled a non-TDD gate", () => {
    // Invariant 1 is non-negotiable; R4 CRITICAL found three tasks without one.
    const bodies = planRaw.split(/^### Task \d+/m).slice(1);
    expect(bodies.length).toBeGreaterThanOrEqual(7);
    bodies.forEach((body, i) => {
      const hasRed = /Test first|Red state first|not a TDD task/.test(body);
      expect(hasRed, `Task ${i + 1} declares neither a red state nor gate status`).toBe(true);
    });
  });
});
