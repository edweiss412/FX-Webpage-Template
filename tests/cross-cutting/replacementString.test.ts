// Structural guard for the replacement-string class sweep (spec §3, §9).
//
// Two halves. The FIXTURE cases run `judgeSource` over source STRINGS, which is what lets them
// kill mutants: the harness overlay rewrites the module graph, so a check that read its subject
// off disk would read unmutated bytes and pass unconditionally. The repo-wide half walks the real
// population and is the standing gate; it contributes no kills.
import { describe, expect, it } from "vitest";

import { judgeSource, notInPopulationCount } from "./replacementString/scan";

/** One call per fixture, so a case can never pass on another case's finding. */
const one = (src: string) => judgeSource("f.ts", src);

describe("judgeSource — the accept-set (AC-1)", () => {
  const accepted: [string, string][] = [
    ["string literal", `s.replace(a, "lit")`],
    ["no-substitution template", "s.replace(a, `notmpl`)"],
    ["arrow function", `s.replace(a, () => v)`],
    ["function expression", `s.replace(a, function (m) { return v })`],
  ];
  for (const [label, src] of accepted) {
    it(`accepts a ${label}`, () => {
      expect(one(src), `${label} carries no runtime value`).toEqual([]);
    });
  }

  const reported: [string, string][] = [
    ["identifier", `s.replace(a, v)`],
    ["property access", `s.replace(a, o.p)`],
    ["template with substitution", "s.replace(a, `x${v}`)"],
    ["call", `s.replace(a, f())`],
    ["concatenation", `s.replace(a, "x" + v)`],
  ];
  for (const [label, src] of reported) {
    it(`reports a ${label}`, () => {
      const found = one(src);
      expect(found, `${label} can carry a $ sequence at runtime`).toHaveLength(1);
      expect(found[0]?.line).toBe(1);
    });
  }
});

describe("judgeSource — transparent wrappers resolve (AC-2)", () => {
  const wrapped: [string, string][] = [
    ["parentheses", `s.replace(a, ("lit"))`],
    ["as assertion", `s.replace(a, ("lit" as string))`],
    ["non-null assertion", `s.replace(a, ("lit"!))`],
    ["satisfies", `s.replace(a, ("lit" satisfies string))`],
  ];
  for (const [label, src] of wrapped) {
    it(`sees through ${label} in the ARGUMENT`, () => {
      expect(one(src), `${label} denotes the literal inside it`).toEqual([]);
    });
  }

  const callee: [string, string][] = [
    ["parentheses", `(s.replace)(a, v)`],
    ["as assertion", `(s.replace as any)(a, v)`],
    ["non-null assertion", `(s.replace!)(a, v)`],
  ];
  for (const [label, src] of callee) {
    it(`sees through ${label} in the CALLEE`, () => {
      expect(one(src), "a wrapped callee is still a .replace call").toHaveLength(1);
    });
  }
});

describe("judgeSource — argument shapes that are not a replacement (AC-3, AC-3b)", () => {
  it("counts a one-argument call as not-in-population and never reports it", () => {
    expect(one(`s.replace(a)`)).toEqual([]);
    expect(notInPopulationCount("f.ts", `s.replace(a)`)).toBe(1);
  });

  it("counts a zero-argument call the same way", () => {
    expect(one(`s.replace()`)).toEqual([]);
    expect(notInPopulationCount("f.ts", `s.replace()`)).toBe(1);
  });

  const spreads: [string, string][] = [
    ["spread at index 0", `s.replace(...[find, repl])`],
    ["spread at 0 with a literal at 1", `s.replace(...args, "lit")`],
    ["spread at index 1", `s.replace(a, ...rest)`],
  ];
  for (const [label, src] of spreads) {
    it(`REPORTS ${label} rather than bucketing it out of the population`, () => {
      expect(
        one(src),
        "positional indexing is meaningless here, so it is unclassifiable",
      ).toHaveLength(1);
      expect(
        notInPopulationCount("f.ts", src),
        "a spread call is not 'no replacement position'",
      ).toBe(0);
    });
  }
});

describe("judgeSource — chained calls (AC-1b)", () => {
  it("reports BOTH links of a two-link chain", () => {
    expect(one(`s.replace(a, v).replace(b, w)`)).toHaveLength(2);
  });

  it("reports all THREE links of a three-link chain", () => {
    expect(one(`s.replace(a, v).replace(b, w).replace(c, x)`)).toHaveLength(3);
  });

  it("reports the inner link when the outer one is accepted", () => {
    // The defect this catches: a visitor that classifies the outer call and stops descending
    // never sees the receiver. Measured on the live corpus, twelve offender sites are reachable
    // only this way.
    expect(one(`s.replace(a, v).replace(b, "lit")`)).toHaveLength(1);
  });
});
