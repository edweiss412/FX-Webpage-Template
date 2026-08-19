// tests/docs/controlOutlinePartitionParity.test.ts
//
// The hover partition is stated in five places and drifted in four review
// rounds running. This closes that class BY DERIVATION rather than by another
// hand-sweep.
//
// THE GUARD'S OWN ARRAYS ARE THE SOURCE OF TRUTH. `HOVER_DELETE`,
// `HOVER_SUBTLE` and `HOVER_ACCENT` in `tests/styles/_metaControlOutlineFill.test.ts`
// are what the executable assertions enforce, so every prose claim about the
// partition is checked against THEM — never against a literal typed here, which
// would just relocate the drift.
//
// Why this exists at all: the partition moved 13/5 in draft, to 12/6/3 at spec
// review, to 9/9/3 when the invariant-8 design review found two hover cues that
// were literal no-ops, to 8/10/3 when whole-diff review round 1 found a third.
// Each move left stale sentences behind, and each round found some. A sweep
// verified by enumeration re-opens the moment someone adds a site; a derived
// cover does not.
//
// HISTORICAL RECORDS ARE DELIBERATELY EXEMPT. Review-round filings and the
// spec's own superseded-state notes record what was true at that round, and
// rewriting them would destroy the provenance they exist to hold. Only CURRENT
// operative statements are checked.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";

const ROOT = process.cwd();
const GUARD = join(ROOT, "tests/styles/_metaControlOutlineFill.test.ts");

/** Read a group's membership count out of the guard's own array literal. */
function guardGroupSize(name: string): number {
  const src = readFileSync(GUARD, "utf8");
  const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(src);
  if (!m) throw new Error(`${name} not found in the guard`);
  return (m[1]!.match(/"[^"]+:\d+"/g) ?? []).length;
}

const DELETE = guardGroupSize("HOVER_DELETE");
const SUBTLE = guardGroupSize("HOVER_SUBTLE");
const ACCENT = guardGroupSize("HOVER_ACCENT");
const TOTAL = DELETE + SUBTLE + ACCENT;

/**
 * Files whose CURRENT statements must agree with the guard. The review-round
 * corpus is absent on purpose (see the header).
 */
const OPERATIVE = [
  "docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md",
  "docs/superpowers/plans/2026-08-18-control-outline-border-token.md",
  "docs/superpowers/plans/2026-08-18-control-outline-border-token-HANDOVER.md",
  "docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md",
  "tests/styles/_metaControlOutlineFill.test.ts",
] as const;

/** `a/b/c` partition triples, e.g. `12/6/3`. */
const TRIPLE = /\b(\d{1,2})\/(\d{1,2})\/(\d{1,2})\b/g;

/**
 * A line is exempt when it explicitly marks the number as superseded. That is
 * the ONLY escape, and it must say so in the line itself — an unmarked stale
 * number is exactly what this test exists to catch.
 */
const SUPERSEDED = /supersed|earlier round|was 12\/6\/3|drafted|became|historical|prior state|SUPERSEDED/i;

describe("control-outline hover partition parity (derived, not enumerated)", () => {
  it("premise: the guard's arrays were read and are non-empty", () => {
    premise("HOVER_DELETE parsed", DELETE, 0);
    premise("HOVER_SUBTLE parsed", SUBTLE, 0);
    premise("HOVER_ACCENT parsed", ACCENT, 0);
  });

  it("the guard's own assertions agree with its arrays", () => {
    const src = readFileSync(GUARD, "utf8");
    expect(src).toContain(`expect(HOVER_DELETE.length).toBe(${DELETE});`);
    expect(src).toContain(`expect(HOVER_SUBTLE.length).toBe(${SUBTLE});`);
    expect(src).toContain(`expect(HOVER_ACCENT.length).toBe(${ACCENT});`);
  });

  it.each(OPERATIVE)("%s states no partition triple that contradicts the guard", (rel) => {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const offenders: string[] = [];
    text.split("\n").forEach((line, i) => {
      if (SUPERSEDED.test(line)) return;
      for (const m of line.matchAll(TRIPLE)) {
        const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
        // Only triples that look like THIS partition — three groups summing to
        // the hover population. A version string or a date fragment is not one.
        if (a + b + c !== TOTAL) continue;
        if (a !== DELETE || b !== SUBTLE || c !== ACCENT) {
          offenders.push(`${rel}:${i + 1}: ${m[0]} (guard says ${DELETE}/${SUBTLE}/${ACCENT})`);
        }
      }
    });
    expect(offenders, "stale partition triples in a CURRENT statement").toEqual([]);
  });

  it.each(OPERATIVE)("%s states no delete/raise count that contradicts the guard", (rel) => {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const offenders: string[] = [];
    /**
     * Only the phrasings that name a group SIZE, and only where the token the
     * group raises TO disambiguates which group is meant.
     *
     * An earlier draft matched a bare `N raise` and flagged "3 raise to
     * `border-accent-on-bg`" against the subtle group's 10 — a false positive,
     * because the accent group raises too. A check that cries wolf is worse
     * than no check, so the matcher requires the destination token.
     */
    const DELETE_CLAIM = /\b(\d{1,2})\s+(?:sites?\s+)?(?:delete|deletions?)\b/gi;
    const SUBTLE_CLAIM = /\b(\d{1,2})\s+(?:sites?\s+)?raises?\s+to\s+`?(?:hover:)?border-text-subtle/gi;
    const ACCENT_CLAIM = /\b(\d{1,2})\s+(?:sites?\s+)?raises?\s+to\s+`?(?:hover:)?border-accent-on-bg/gi;
    const CHECKS: ReadonlyArray<readonly [RegExp, number, string]> = [
      [DELETE_CLAIM, DELETE, "delete"],
      [SUBTLE_CLAIM, SUBTLE, "raise to text-subtle"],
      [ACCENT_CLAIM, ACCENT, "raise to accent-on-bg"],
    ];
    text.split("\n").forEach((line, i) => {
      if (SUPERSEDED.test(line)) return;
      for (const [re, wanted, label] of CHECKS) {
        for (const m of line.matchAll(re)) {
          if (Number(m[1]) !== wanted) {
            offenders.push(`${rel}:${i + 1}: "${m[0]}" — guard says ${wanted} ${label}`);
          }
        }
      }
    });
    expect(offenders, "stale delete/raise counts in a CURRENT statement").toEqual([]);
  });
});
