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

  it("the hoist is CONTAINED, because aggregateDays CAN throw at runtime", () => {
    // This rule previously asserted the opposite, and review R6 caught it enforcing a
    // premise two rounds had already rejected -- a structural defense pinning a stale
    // decision is worse than none, because it actively resists the correction.
    //
    // The history in one line: R3 forbade the hoist (right conclusion, wrong reason:
    // "aggregateDays contains a throw" -- it does not). R4 checked `grep -c throw`, got 0,
    // and withdrew the ban. R5 found the actual fault: getShowForViewer.ts CASTS the JSONB
    // without validating, so showDays can be non-iterable or hold non-strings, and
    // aggregateDays throws on those without containing any `throw` statement.
    //
    // So the settled decision is: hoist IS allowed, and MUST be wrapped in containment
    // that fails open. Both halves get pinned, because dropping either resurrects a
    // superseded round.
    expect(specRaw, "spec must record that the cast is not a validation").toMatch(
      /decodeJsonbColumn|CAST, not a validation/i,
    );
    expect(specRaw, "spec must require containment around the hoisted derivation").toMatch(
      /try\s*\/\s*catch|`try`\/`catch`/i,
    );
    for (const [name, text] of Object.entries(prose)) {
      expect(text, `${name} must not claim aggregateDays cannot throw`).not.toMatch(
        /aggregateDays\s+(cannot|can not|never)\s+throw/i,
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
        /(\b\d+\b[^.\n]{0,24}?(existing (class-based )?sites|class-based sites)|(existing (class-based )?sites|class-based sites)[^.\n]{0,24}?\b\d+\b)/,
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

  it("no copy demands a null-element-guard test for the NEW matcher", () => {
    // R5 CRITICAL then R6 CRITICAL: fixed in one place, survived in another, twice. The
    // EXISTING function keeps its guard (it gates on showDays); the new matcher's domain is
    // non-null by construction, so demanding the test is unsatisfiable.
    // Case-insensitive deliberately: the surviving copy R6 found read "Null-element guard"
    // and a case-sensitive sweep of "null-element guard" missed it.
    for (const [name, text] of Object.entries(prose)) {
      const demands = text
        .split("\n")
        .filter((l) => /null-element guard/i.test(l))
        .filter((l) => !/does NOT need|no such guard|NO null-element|EXISTING|comes back/i.test(l))
        .filter((l) => !/agendaSessionsForToday|lib\/crew\/agendaDayForToday/.test(l));
      expect(demands, `${name} still demands a null-guard test for the new matcher`).toEqual([]);
    }
  });

  it("the CI red state is the scanner's rejected list, not the allowlist string", () => {
    // R5 HIGH then R6 HIGH: the string-value red state is fakeable, because the meta-test
    // validates membership and never the reason. Two copies survived the first repair.
    expect(planRaw, "plan must name the scanner's rejected list as the red state").toMatch(
      /rejected/,
    );
    const fakeable = planRaw
      .split("\n")
      .filter((l) => /red state/i.test(l))
      .filter((l) => /reads `?PATH_GATED`?/.test(l))
      .filter((l) => !/fakeable|goes green|not merely|previous|earlier|corrected/i.test(l));
    expect(fakeable, "plan still prescribes the fakeable PATH_GATED red state").toEqual([]);
  });

  it("no task reference points past the last task", () => {
    // R6 HIGH: folding a task left "Task 7"/"T7" references behind. Derive the ceiling
    // rather than hardcoding it, so this survives another re-partition.
    const count = (planRaw.match(/^### Task \d+/gm) ?? []).length;
    const refs = [...planRaw.matchAll(/\b(?:Task |T)(\d)\b/g)].map((m) => Number(m[1]));
    const past = [...new Set(refs.filter((n) => n > count))];
    expect(past, `plan references tasks past T${count}`).toEqual([]);
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
    // Derive the expected count from the execution-order line rather than hardcoding it.
    // An earlier version pinned 7; folding a task into another correctly turned it red, which
    // is right in spirit but for the wrong reason — the rule should care that every task has a
    // red state, not how many tasks there are.
    const order = planRaw.match(/\*\*(T\d(?:\s*→\s*T\d)+)\*\*/);
    expect(order, "the execution-order line must be present").not.toBeNull();
    const declared = (order?.[1]?.match(/T\d/g) ?? []).length;
    expect(bodies.length, "task headings must match the execution order").toBe(declared);
    bodies.forEach((body, i) => {
      const hasRed = /Test first|Red state first|not a TDD task/.test(body);
      expect(hasRed, `Task ${i + 1} declares neither a red state nor gate status`).toBe(true);
    });
  });
});
