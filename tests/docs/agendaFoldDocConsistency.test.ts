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
 * Distinguishing a LIVE instruction from a QUOTED superseded one is the whole difficulty.
 * Both documents deliberately reproduce the wording each round replaced, so a naive scan
 * fires on their own bookkeeping.
 *
 * Two mechanisms were tried and both were wrong, in opposite directions:
 *
 *  1. Blank every double-quoted span. This silently disabled the union-arm rule entirely,
 *     because `kind: "subset"; days` CONTAINS a quoted token, so blanking rewrote it to
 *     `kind: ""; days` and the pattern could never match. Caught by mutation testing.
 *  2. Drop any LINE carrying a correction marker ("an earlier", "corrected", …). Review R5
 *     showed this blinds the gate on the exact lines it protects: spec:66, plan:7 and
 *     plan:160 each carry a live decision AND a correction marker, so reintroducing the
 *     forbidden wording on those lines passed.
 *
 * What actually works is (1) applied PER RULE. Superseded wording in these documents is
 * always quoted, so blanking quoted spans is the right discriminator for PROSE rules; the
 * rules whose pattern needs quotes read the raw text instead. No line is ever discarded.
 */
function unquoted(text: string): string {
  return text.replace(/"[^"\n]*"/g, '""');
}

const specRaw = readFileSync(SPEC, "utf8");
const planRaw = readFileSync(PLAN, "utf8");
/** Prose view: quoted (i.e. superseded, reproduced) wording blanked. */
const prose = { spec: unquoted(specRaw), plan: unquoted(planRaw) };
/** Raw view: for rules whose forbidden pattern itself contains quotes. */
const raw = { spec: specRaw, plan: planRaw };

describe("agenda-fold spec/plan pair — decided questions stay decided", () => {
  it("the matcher contract is row INDICES, with no surviving date-set arm", () => {
    // R4 CRITICAL lineage: an ISO-date arm cannot identify a row, because the current
    // extractor always writes date: null (spec §2.5 fact 1).
    for (const [name, text] of Object.entries(raw)) {
      expect(text, `${name} must not carry the superseded date-set arm`).not.toMatch(
        /kind:\s*"subset";\s*days/,
      );
    }
    expect(specRaw).toMatch(/kind:\s*"subset";\s*rows/);
  });

  it("aggregateDays is NOT forbidden above the boundary (the constraint was withdrawn)", () => {
    // R4 CRITICAL: the ban rested on aggregateDays throwing, and it cannot throw.
    // A future edit reinstating the ban would recreate the self-contradiction.
    for (const [name, text] of Object.entries(prose)) {
      expect(text, `${name} must not reinstate the withdrawn aggregate ban`).not.toMatch(
        /(do NOT move|never) [`']?aggregateDays/i,
      );
    }
  });

  it("uniform <details> markup: no copy claims the fold renders without <details>", () => {
    // R3 HIGH, and it survived into a THIRD copy before being swept.
    for (const [name, text] of Object.entries(prose)) {
      expect(text, `${name} must not claim plain rows for the fail-open case`).not.toMatch(
        /no\s+`<details>`\s+at all/i,
      );
    }
  });

  it("no un-sourced count of existing duration-fast class sites", () => {
    // Three consecutive rounds disputed this number because it is grep-flavour
    // dependent. It was removed rather than corrected again; the mechanism claim stays.
    for (const [name, text] of Object.entries(prose)) {
      expect(text, `${name} must not reintroduce a bare site count`).not.toMatch(
        /\b\d{2,}\b[^.\n]{0,20}?(existing (class-based )?sites|class-based sites)/,
      );
      expect(text, `${name} must not claim a "119th" site`).not.toMatch(/119th/);
    }
    // The load-bearing mechanism claim must still be present and reproducible.
    expect(specRaw).toMatch(/transition-duration-fast/);
  });

  it("the prop is acknowledged as new in both documents", () => {
    // R3 LOW: both summaries still said "no new prop" after the contract added one.
    for (const [name, text] of Object.entries(prose)) {
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
