// Structural guard for the replacement-string class sweep (spec §3, §9).
//
// Two halves. The FIXTURE cases run `judgeSource` over source STRINGS, which is what lets them
// kill mutants: the harness overlay rewrites the module graph, so a check that read its subject
// off disk would read unmutated bytes and pass unconditionally. The repo-wide half walks the real
// population and is the standing gate; it contributes no kills.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

import {
  callSiteCount,
  judgeSource,
  notInPopulationCount,
  population,
  scanFiles,
} from "./replacementString/scan";

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

describe("a finding carries the location and text a human dispositions it by", () => {
  // The inventory renders findings as `file:line`, and the failure output IS the work list, so
  // both fields are load-bearing rather than cosmetic. Nothing else in this suite pins them: the
  // fixture cases assert HOW MANY findings a source yields, and the inventory compares an already
  // rendered list, so an off-by-one in the line or a change to the truncation length is invisible
  // to every other case here.

  it("reports the 1-indexed line the call starts on, not the 0-indexed one", () => {
    const found = judgeSource("f.ts", "const a = 1;\nconst b = 2;\ns.replace(x, v);\n");
    expect(found[0]?.line, "line 3 of three, counting from 1").toBe(3);
  });

  it("carries the file it was given", () => {
    expect(judgeSource("some/path.ts", `s.replace(x, v)`)[0]?.file).toBe("some/path.ts");
  });

  it("truncates the call text for legibility and collapses its whitespace", () => {
    const long = `s.replace(x, ${"averyLongIdentifierName".repeat(12)})`;
    const text = judgeSource("f.ts", long)[0]?.text ?? "";
    expect(text.length, "truncated so a finding stays one readable line").toBe(110);
    expect(judgeSource("f.ts", "s.replace(\n  x,\n  v,\n)")[0]?.text).toBe("s.replace( x, v, )");
  });
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

describe("a spread AFTER the replacement position does not make a call unclassifiable", () => {
  // §3.1's rule fires on a spread at index 0 or 1, because those are the positions that make
  // `arguments[1]` stop meaning "the replacement". A spread at index 2 or later does not: the
  // replacement is still exactly where it looks, so the call classifies on its own merits.
  it("accepts a literal replacement even when a spread follows it", () => {
    expect(one(`s.replace(a, "lit", ...rest)`)).toEqual([]);
  });

  it("still reports a runtime replacement when a spread follows it", () => {
    expect(one(`s.replace(a, v, ...rest)`)).toHaveLength(1);
  });
});

describe("callSiteCount counts what the walk SAW, in every bucket", () => {
  // The premise asserts this is above a floor, which cannot see an off-by-one. The count is what
  // distinguishes "the population is clean" from "the walk parsed nothing", so it is pinned
  // exactly on a fixture rather than only bounded on the live tree.
  it("counts accepted, reported and not-in-population calls alike", () => {
    const src = `s.replace(a, "lit"); s.replace(b, v); s.replace(c);`;
    expect(callSiteCount(["f.ts"], () => src)).toBe(3);
  });

  it("is zero for a source with no replace call at all", () => {
    expect(callSiteCount(["f.ts"], () => "const x = 1;")).toBe(0);
  });
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

describe("population — derived from disk, stated as a subtraction (AC-4)", () => {
  it("keeps every JS/TS extension the sweep covers", () => {
    const files = ["a.ts", "b.tsx", "c.js", "d.jsx", "e.mjs", "f.cjs", "g.mts", "h.cts"];
    expect(population(files)).toEqual(files);
  });

  it("drops non-JS/TS files", () => {
    expect(population(["a.md", "b.json", "c.css", "d.ts"])).toEqual(["d.ts"]);
  });

  it("subtracts node_modules/** and docs/**", () => {
    expect(population(["node_modules/x/a.ts", "docs/b.ts", "lib/c.ts"])).toEqual(["lib/c.ts"]);
  });

  it("INCLUDES a file under a top-level directory that appears nowhere in this repo", () => {
    // The failure this catches: someone rewrites the subtraction as an allowlist of known
    // directories, and a directory added later is silently unscanned.
    expect(population(["quokka-ledger/nested/deep.ts"])).toEqual(["quokka-ledger/nested/deep.ts"]);
  });
});

describe("scanFiles — there is no text prefilter (AC-4b)", () => {
  it("STRUCTURAL: reads every file it is given, never gating on source text", () => {
    const seen: string[] = [];
    const files = ["a.ts", "b.ts", "c.ts"];
    scanFiles(files, (f) => {
      seen.push(f);
      return "const x = 1;\n"; // no `.replace` anywhere
    });
    expect(seen, "a file is parsed, not pre-screened by a regex over its text").toEqual(files);
  });

  const spellings: [string, string][] = [
    ["baseline", `a.path.replace("$C", v)`],
    ["wrapped callee", `(a.path.replace)("$C", v)`],
    ["space after the dot", `a.path. replace("$C", v)`],
    ["newline after the dot", 'a.path.\n  replace("$C", v)'],
    ["block comment after the dot", `a.path./* why */replace("$C", v)`],
    ["line comment after the dot", 'a.path.// why\n  replace("$C", v)'],
    ["escaped identifier", `a.path.repl\\u0061ce("$C", v)`],
  ];
  for (const [label, src] of spellings) {
    it(`BEHAVIOURAL: reports a ${label}`, () => {
      expect(
        judgeSource("f.ts", src),
        `${label} is a .replace call with a runtime replacement`,
      ).toHaveLength(1);
    });
  }
});

describe("the repo-wide walk states its premise executably (AC-6)", () => {
  const files = population(
    execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
      .split("\n")
      .filter((f) => f !== ""),
  );

  it("looked at all — a walk that parsed nothing must not read as a clean bill", () => {
    // Unconditional relative to what it guards, and never inside a `.each` callback whose case
    // count can be zero. The floor is far below the live population on purpose: this guards
    // against 0, it does not pin today's number, which is not a number this corpus holds still.
    premise(
      "the walk found `.replace` call sites to classify",
      callSiteCount(files, (f) => readFileSync(f, "utf8")),
      100,
    );
    premise("the population is non-trivial", files.length, 500);
  });
});

/**
 * Every in-population offender, declared.
 *
 * AUTHORED FROM AN INDEPENDENT DERIVATION — `count-conservative.mts --list`, which reaches the
 * same set through its own walker — and deliberately NOT from the module under test. A list
 * generated by the walker it checks would agree with that walker's every mistake, which is the
 * one thing this assertion exists to prevent.
 *
 * It shrinks as repairs land: each repair task deletes its own entries in the same commit that
 * wraps them, so removing entries reds this and repairing them greens it. When it reaches empty
 * the assertion IS the zero-offender gate (AC-5).
 */
const EXPECTED_OFFENDERS: readonly string[] = [
  // Empty: every in-population offender is repaired. The assertion IS the zero-offender
  // gate now (AC-5), and a NEW offender introduced later reds it by name.
];

describe("the repo-wide scan against the declared inventory (AC-1b, AC-5)", () => {
  const files = population(
    execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
      .split("\n")
      .filter((f) => f !== ""),
  );
  const found = scanFiles(files, (f) => readFileSync(f, "utf8"))
    .map((x) => `${x.file}:${x.line}`)
    .sort();

  // The stop-early walker — one that classifies a call and never descends into its receiver —
  // is caught by the CHAINED FIXTURE cases above, not here. A live-corpus list of the twelve
  // receiver-only sites was tried and removed: it has to shrink as those sites are repaired, so
  // by the time the sweep succeeds it is empty and `arrayContaining([])` passes for any walker at
  // all. A guard that evaporates exactly when the thing it guards starts mattering is worse than
  // no guard, because it still reads like one.
  it("reports exactly the declared offenders", () => {
    expect(found).toEqual([...EXPECTED_OFFENDERS].sort());
  });
});
