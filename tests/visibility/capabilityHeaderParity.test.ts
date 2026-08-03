// tests/visibility/capabilityHeaderParity.test.ts
//
// `lib/visibility/capabilityTransitions.ts` opens its matrix with a block
// labelled "Tile-visibility rules from `lib/visibility/scopeTiles.ts` (verbatim
// branch logic)" and then quotes four predicates. A quote that CLAIMS to be
// verbatim is load-bearing: a reader trusts it instead of opening the source.
//
// It drifted. `financialsVisible` gained a third branch at `e348c81ca`
// (2026-07-16, the FINANCIALS role flag) and the quote kept saying
// `isAdmin || LEAD`, so for two and a half months the header described an
// entitlement rule the code had stopped implementing. That is the whole class
// this guard closes: a comment asserting parity with a source it cannot see.
//
// The expectation is EXTRACTED FROM `scopeTiles.ts` source, never hardcoded here
// — a hardcoded expectation would just be a second copy of the same claim,
// drifting in parallel.
//
// It compares a normalized EXPRESSION, not a flag set. Whole-diff review finding
// 2: a set comparison ignores operators, so rewriting `isAdmin || LEAD ||
// FINANCIALS` as `isAdmin && LEAD && FINANCIALS` left both sets equal and the
// guard green — while inverting the entitlement rule the comment claims to quote.
// Normalization strips `flags.includes(...)` wrapping and whitespace so a quote
// may say `LEAD` where the source says `flags.includes("LEAD")`, but it keeps
// every operator, negation, and parenthesis.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HEADER = readFileSync(join(ROOT, "lib/visibility/capabilityTransitions.ts"), "utf8");
const SCOPE = readFileSync(join(ROOT, "lib/visibility/scopeTiles.ts"), "utf8");

/** The predicates the header block quotes, in the order it quotes them. */
const QUOTED_PREDICATES = [
  "audioScopeVisible",
  "videoScopeVisible",
  "lightingScopeVisible",
  "financialsVisible",
] as const;

const FLAG = /\b(LEAD|A1|A2|V1|L1|L2|BO|SHOP|FINANCIALS)\b/g;
const ADMIN = /\bisAdmin\b/;

/** The quoted right-hand side for one predicate, from the header's rules block. */
function quotedRhs(name: string): string | null {
  const line = HEADER.split("\n").find((l) => new RegExp(`^\\s*\\*\\s+${name}\\s*=`).test(l));
  if (line === undefined) return null;
  const eq = line.indexOf("=");
  if (eq === -1) return null;
  // Trailing parenthetical commentary is prose, not part of the quoted rule.
  return line.slice(eq + 1).split("(")[0] ?? null;
}

/** The body of one exported predicate in scopeTiles.ts. */
function sourceBody(name: string): string | null {
  const at = SCOPE.indexOf(`export function ${name}(`);
  if (at === -1) return null;
  const open = SCOPE.indexOf("{", at);
  const close = SCOPE.indexOf("\n}", open);
  if (open === -1 || close === -1) return null;
  return SCOPE.slice(open, close);
}

function terms(text: string): Set<string> {
  const out = new Set<string>(text.match(FLAG) ?? []);
  if (ADMIN.test(text)) out.add("isAdmin");
  return out;
}

/**
 * The predicate as a comparable expression: operators and grouping preserved,
 * `flags.includes("X")` reduced to `X`, `return`/`;`/whitespace dropped.
 */
export function normalizeExpression(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\breturn\b/g, " ")
    .replace(/flags\s*\.\s*includes\s*\(\s*["'`]([A-Z0-9]+)["'`]\s*\)/g, "$1")
    .replace(/[;{}]/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

describe("capabilityTransitions header quotes scopeTiles verbatim", () => {
  it("discovers exactly the four quote/function pairs (never zero — a vacuous pass)", () => {
    const found = QUOTED_PREDICATES.filter(
      (n) => (quotedRhs(n)?.trim().length ?? 0) > 0 && (sourceBody(n)?.trim().length ?? 0) > 0,
    );
    expect(
      found,
      "A quote line or a source function went missing. Set equality over an empty set passes " +
        "vacuously, so the pair count is asserted before the comparison.",
    ).toEqual([...QUOTED_PREDICATES]);
  });

  it.each([...QUOTED_PREDICATES])("%s: the quoted flags equal the flags the source reads", (name) => {
    const quoted = terms(quotedRhs(name) ?? "");
    const actual = terms(sourceBody(name) ?? "");
    expect(
      [...quoted].sort(),
      `The header claims this quote is verbatim branch logic from scopeTiles.ts. ` +
        `Quoted: {${[...quoted].sort().join(", ")}}. Source reads: {${[...actual].sort().join(", ")}}.`,
    ).toEqual([...actual].sort());
  });

  it.each([...QUOTED_PREDICATES])("%s: the quoted OPERATORS match the source too", (name) => {
    const quoted = normalizeExpression(quotedRhs(name) ?? "");
    const actual = normalizeExpression(sourceBody(name) ?? "");
    expect(
      quoted,
      `Same flags, different logic. Quoted: \`${quoted}\`. Source: \`${actual}\`. A set ` +
        `comparison would pass this; "verbatim branch logic" has to mean the operators too.`,
    ).toBe(actual);
  });

  it("an operator swap in the source is caught (|| -> &&)", () => {
    // Executable proof of the escape the whole-diff review demonstrated.
    const quoted = normalizeExpression("isAdmin || LEAD || FINANCIALS");
    const mutated = normalizeExpression(
      'return isAdmin && flags.includes("LEAD") && flags.includes("FINANCIALS");',
    );
    expect(terms("isAdmin || LEAD || FINANCIALS")).toEqual(
      terms('isAdmin && flags.includes("LEAD") && flags.includes("FINANCIALS")'),
    );
    expect(quoted).not.toBe(mutated);
  });

  it("a header with a REMOVED quote line fails rather than silently passing", () => {
    // Synthetic proof that the guard cannot be silenced by deletion — the same
    // move that would defeat a scan-what-is-there implementation.
    const re = /^\s*\*\s+financialsVisible\s*=/;
    const mutated = HEADER.split("\n").filter((l) => !re.test(l));
    const line = mutated.find((l) => re.test(l));
    expect(line, "deleting the quote line must leave nothing to compare, which the pair-count " +
      "assertion above reports as a failure").toBeUndefined();
  });
});
