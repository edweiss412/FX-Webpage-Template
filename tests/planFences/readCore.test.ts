/**
 * tests/planFences/readCore.test.ts — the five-shape plan-fence read-core.
 *
 * Spec: docs/superpowers/specs/2026-08-06-arc-b-review-infra.md §2.1. Every
 * accept-set here is the SETTLED one, not the calibration probe's — the probe
 * committed beside the plan approximates in five named ways, and the last
 * describe in this file pins the gate to the settled side of each divergence.
 */
import { describe, expect, it } from "vitest";
import { analyzePlan, RULE_NAMES, type RuleName } from "@/lib/planFences";

/** Compact accessor: the (rule, instance) pairs a plan yields, non-waived. */
function hits(text: string, path = "docs/superpowers/plans/x/plan.md"): string[] {
  return analyzePlan(path, text)
    .findings.map((f) => `${f.rule}:${f.instance}`)
    .sort();
}

function rulesOf(text: string): RuleName[] {
  return [
    ...new Set(analyzePlan("docs/superpowers/plans/x/plan.md", text).findings.map((f) => f.rule)),
  ];
}

describe("plan-fence read-core (spec §2.1)", () => {
  describe("UNIMPORTED_IDENTIFIER", () => {
    it("fires on a known-API identifier a module-shaped fence neither imports nor declares", () => {
      const text = [
        "Prose in `lib/thing.ts`:",
        "",
        "```ts",
        'import { readFileSync } from "node:fs";',
        "const out = readFileSync(p);",
        "expect(out).toBe(1);",
        "```",
      ].join("\n");
      expect(hits(text)).toContain("UNIMPORTED_IDENTIFIER:expect");
    });

    it("does NOT fire when the identifier is imported, aliased, or locally declared", () => {
      const imported = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        'import { readFileSync as rfs } from "node:fs";',
        "const join = (a) => a;",
        "expect(rfs(join(1))).toBe(1);",
        "```",
      ].join("\n");
      expect(rulesOf(imported)).not.toContain("UNIMPORTED_IDENTIFIER");
    });

    it("does NOT fire on a fence with no import line (not module-shaped)", () => {
      const text = ["In `lib/a.ts`:", "", "```ts", "expect(x).toBe(1);", "```"].join("\n");
      expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
    });

    it("does NOT fire on a MEMBER access that happens to share a registry name", () => {
      // `re.test(x)`, `parts.join("/")`, `Promise.resolve()` are property reads,
      // not free identifiers. Counting them made `test`/`join`/`resolve` the top
      // three hits over the real corpus (360/89/96) — a rule that fires that
      // often on correct plans is one nobody will keep enabled.
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        'import { readFileSync } from "node:fs";',
        "const ok = /x/.test(readFileSync(p));",
        'const s = parts.join("/");',
        "const q = Promise.resolve(1);",
        "const w = obj.within;",
        "```",
      ].join("\n");
      expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
    });

    it("does NOT fire on a property KEY that shares a registry name", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        'import { readFileSync } from "node:fs";',
        "const cfg = { test: 1, join: 2 };",
        "void readFileSync(cfg);",
        "```",
      ].join("\n");
      expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
    });

    it("does NOT fire on an identifier outside the closed known-API registry", () => {
      // Documented limit 2: the registry is the accept-set; anything else escapes
      // BY DESIGN. Pinned so a later widening is a deliberate, visible edit.
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        'import { readFileSync } from "node:fs";',
        "wildlyBespokeHelper(readFileSync(p));",
        "```",
      ].join("\n");
      expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
    });
  });

  describe("DUPLICATE_IMPORT", () => {
    it("fires when the same imported binding appears in two fences attributed to one file", () => {
      const text = [
        "First, `lib/a.ts`:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        "const x = 1;",
        "```",
        "",
        "Then `lib/a.ts` again:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        "const y = 2;",
        "```",
      ].join("\n");
      expect(hits(text)).toContain("DUPLICATE_IMPORT:expect");
    });

    it("does NOT fire across fences attributed to DIFFERENT files", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        "const x = 1;",
        "```",
        "",
        "In `lib/b.ts`:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        "const y = 2;",
        "```",
      ].join("\n");
      expect(rulesOf(text)).not.toContain("DUPLICATE_IMPORT");
    });

    it("skips UNATTRIBUTED fences but still reports attribution coverage", () => {
      const text = [
        "Prose naming `lib/a.ts` and `lib/b.ts` — two tokens, so unattributed:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        "const x = 1;",
        "```",
        "",
        "Also `lib/a.ts` and `lib/b.ts`:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        "const y = 2;",
        "```",
      ].join("\n");
      const report = analyzePlan("docs/superpowers/plans/x/plan.md", text);
      expect(report.findings.map((f) => f.rule)).not.toContain("DUPLICATE_IMPORT");
      // Not a silent skip: the demotion is a visible number (limit 3b).
      expect(report.fences).toBe(2);
      expect(report.attributedFences).toBe(0);
    });
  });

  describe("MANGLED_TEMPLATE", () => {
    it("fires on an escaped backtick and an escaped ${ as DISTINCT identities", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        "const a = \\`hello\\`;",
        "const b = `x \\${y}`;",
        "```",
      ].join("\n");
      const got = hits(text).filter((h) => h.startsWith("MANGLED_TEMPLATE"));
      expect(new Set(got).size).toBe(2);
    });
  });

  describe("UNCHECKED_INDEX", () => {
    it("fires on identifier[0].member with no ! and no ?.", () => {
      const text = ["In `lib/a.ts`:", "", "```ts", "const n = rows[0].name;", "```"].join("\n");
      expect(hits(text)).toContain("UNCHECKED_INDEX:rows[0].name");
    });

    it("does NOT fire when the access is non-null-asserted or optional", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        "const a = rows[0]!.name;",
        "const b = rows[0]?.name;",
        "```",
      ].join("\n");
      expect(rulesOf(text)).not.toContain("UNCHECKED_INDEX");
    });
  });

  describe("FENCE_EM_DASH", () => {
    it("fires on the raw character and on every encoded spelling", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        'const a = "one — two";',
        'const b = "three &mdash; four";',
        'const c = "five &#8212; six";',
        'const d = "seven &#x2014; eight";',
        'const e = "nine \\u2014 ten";',
        'const f = "eleven \\u{2014} twelve";',
        "```",
      ].join("\n");
      const got = hits(text).filter((h) => h.startsWith("FENCE_EM_DASH"));
      expect(got.length).toBe(6);
    });

    it("does NOT fire in a NON-code fence (limit 4 scopes the rule to code)", () => {
      const text = ["Output from `lib/a.ts`:", "", "```text", "run — done", "```"].join("\n");
      expect(rulesOf(text)).not.toContain("FENCE_EM_DASH");
    });

    it("honors an existing spec-lint: ignore stack over the fence (dual-honor contract)", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "<!-- spec-lint: ignore — quoting shipped copy -->",
        "```ts",
        'const a = "one — two";',
        "```",
      ].join("\n");
      expect(rulesOf(text)).not.toContain("FENCE_EM_DASH");
    });
  });

  describe("the gate's own rule-scoped waiver", () => {
    const waived = (token: string): ReturnType<typeof analyzePlan> =>
      analyzePlan(
        "docs/superpowers/plans/x/plan.md",
        [
          "In `lib/a.ts`:",
          "",
          token,
          "```ts",
          "const n = rows[0].name;",
          'const s = "a — b";',
          "```",
        ].join("\n"),
      );

    it("suppresses EXACTLY its named rule and leaves the others firing", () => {
      const r = waived(
        "<!-- plan-fences: ignore UNCHECKED_INDEX — reviewed, length-checked above -->",
      );
      expect(r.findings.map((f) => f.rule)).toContain("FENCE_EM_DASH");
      expect(r.findings.map((f) => f.rule)).not.toContain("UNCHECKED_INDEX");
    });

    it("REPORTS the waived finding rather than dropping it", () => {
      const r = waived("<!-- plan-fences: ignore UNCHECKED_INDEX — reviewed -->");
      expect(r.waived.map((f) => f.rule)).toContain("UNCHECKED_INDEX");
    });

    it("rejects an unknown rule name", () => {
      const r = waived("<!-- plan-fences: ignore NOT_A_RULE — whatever -->");
      expect(r.waiverErrors.map((e) => e.code)).toContain("waiver_unknown_rule");
    });

    it("rejects an empty reason", () => {
      const r = waived("<!-- plan-fences: ignore UNCHECKED_INDEX —  -->");
      expect(r.waiverErrors.map((e) => e.code)).toContain("waiver_missing_reason");
    });

    it("rejects a waiver that suppresses nothing", () => {
      const r = analyzePlan(
        "docs/superpowers/plans/x/plan.md",
        [
          "In `lib/a.ts`:",
          "",
          "<!-- plan-fences: ignore UNCHECKED_INDEX — nothing to suppress -->",
          "```ts",
          "const n = 1;",
          "```",
        ].join("\n"),
      );
      expect(r.waiverErrors.map((e) => e.code)).toContain("waiver_suppressed_nothing");
    });
  });

  describe("unplaceable fences are REPORTED, never silently skipped (limit 3b)", () => {
    it("names an unclosed fence by path and line", () => {
      const text = ["In `lib/a.ts`:", "", "```ts", "const n = rows[0].name;"].join("\n");
      const r = analyzePlan("docs/superpowers/plans/x/plan.md", text);
      expect(r.unplaced.length).toBeGreaterThan(0);
      expect(r.unplaced[0]!.line).toBe(3);
    });
  });

  /**
   * The probe committed beside the plan is CALIBRATION, and it approximates in
   * five named ways. The corpus cannot exercise these branches (that is why the
   * divergences went unnoticed in the numbers), so each gets a planted case
   * pinning the gate to the SETTLED accept-set rather than the probe's.
   */
  describe("divergence-discriminating fixtures (plan G1a R3 F1)", () => {
    it("(i) a root-level 4-space-indented delimiter is INDENTED CODE, not a fence", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "    ```ts",
        "    const n = rows[0].name;",
        "    ```",
      ].join("\n");
      expect(analyzePlan("docs/superpowers/plans/x/plan.md", text).fences).toBe(0);
    });

    it("(ii) an import/export-only fence is ELIGIBLE (the union arm the corpus never exercises)", () => {
      const text = ["In `lib/a.ts`:", "", "```ts", 'import { expect } from "vitest"', "```"].join(
        "\n",
      );
      const r = analyzePlan("docs/superpowers/plans/x/plan.md", text);
      expect(r.eligibleFences).toBe(1);
    });

    it("(iii) attribution SKIPS a waiver line between the prose and the fence", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "<!-- plan-fences: ignore FENCE_EM_DASH — unrelated -->",
        "```ts",
        "const n = 1;",
        "```",
      ].join("\n");
      expect(analyzePlan("docs/superpowers/plans/x/plan.md", text).attributedFences).toBe(1);
    });

    it("(iv) only the four SOURCE extensions attribute; a css path leaves the fence unattributed", () => {
      const text = ["Styles in `app/globals.css`:", "", "```ts", "const n = 1;", "```"].join("\n");
      expect(analyzePlan("docs/superpowers/plans/x/plan.md", text).attributedFences).toBe(0);
    });

    it("(v) DUPLICATE_IMPORT binds IMPORTED bindings only, never a repeated local const", () => {
      const text = [
        "In `lib/a.ts`:",
        "",
        "```ts",
        'import { expect } from "vitest";',
        "const q = 1;",
        "```",
        "",
        "In `lib/a.ts`:",
        "",
        "```ts",
        'import { describe } from "vitest";',
        "const q = 2;",
        "```",
      ].join("\n");
      expect(rulesOf(text)).not.toContain("DUPLICATE_IMPORT");
    });
  });

  it("exposes exactly the five ratified rule names (closed set, spec §1.1 item 2)", () => {
    expect([...RULE_NAMES].sort()).toEqual(
      [
        "DUPLICATE_IMPORT",
        "FENCE_EM_DASH",
        "MANGLED_TEMPLATE",
        "UNCHECKED_INDEX",
        "UNIMPORTED_IDENTIFIER",
      ].sort(),
    );
  });
});

/**
 * Diff review R2 repairs. Each of these fails against the code as it stood after
 * R1 — a repair with no case that would have caught it is a claim.
 */
describe("R2 repairs", () => {
  it("(1) REPORTS a container-prefixed fence run it cannot place", () => {
    // `>     ```ts` is fence-shaped only AFTER peeling. Testing the raw line
    // dropped it silently, which the consequence bound forbids.
    const text = ["Quoted example:", "", ">     ```ts", ">     const n = 1;"].join("\n");
    const r = analyzePlan("docs/superpowers/plans/x/plan.md", text);
    expect(r.unplaced.length).toBeGreaterThan(0);
  });

  it("(3) a `not-ui` line between an `ignore` waiver and its fence does not break the waiver", () => {
    const text = [
      "In `lib/a.ts`:",
      "",
      "<!-- spec-lint: ignore — quoting shipped copy -->",
      "<!-- spec-lint: not-ui — internal note -->",
      "```ts",
      'const a = "one — two";',
      "```",
    ].join("\n");
    expect(rulesOf(text)).not.toContain("FENCE_EM_DASH");
  });

  it("(5) sees executable code inside a template interpolation", () => {
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "const s = `value: ${expect(readFileSync(p))}`;",
      "```",
    ].join("\n");
    expect(hits(text)).toContain("UNIMPORTED_IDENTIFIER:expect");
  });

  it("(5) binds a TYPED parameter by its name, not its type", () => {
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "const f = (expect: string) => readFileSync(expect);",
      "```",
    ].join("\n");
    expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
  });

  it("(5) binds a METHOD DEFINITION without binding a call of the same name", () => {
    const defines = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "const o = { expect(v: string) { return readFileSync(v); } };",
      "```",
    ].join("\n");
    expect(rulesOf(defines)).not.toContain("UNIMPORTED_IDENTIFIER");

    const calls = [
      "In `lib/b.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "expect(readFileSync(p));",
      "```",
    ].join("\n");
    expect(hits(calls)).toContain("UNIMPORTED_IDENTIFIER:expect");
  });

  it("(6) makes a DUPLICATED fence visible by SUMMING, not by renaming", () => {
    // A positional ordinal was tried and reverted: it is order-dependent, so a
    // copy inserted BEFORE a frozen fence renamed the historical one and
    // produced an offender AND a stale row for a document nobody touched
    // (R3 finding 6). Identity stays content-only; the COUNT carries the
    // duplication, which no insertion position can change.
    const fence = ["```ts", "const n = rows[0].name;", "```"];
    const one = ["In `lib/a.ts`:", "", ...fence].join("\n");
    const two = ["In `lib/a.ts`:", "", ...fence, "", "Again in `lib/a.ts`:", "", ...fence].join(
      "\n",
    );
    const countOf = (text: string): number => {
      const f = analyzePlan("docs/superpowers/plans/x/plan.md", text).findings.find(
        (x) => x.rule === "UNCHECKED_INDEX",
      );
      return f?.count ?? 0;
    };
    expect(countOf(one)).toBe(1);
    // The copy doubles the count, so a baseline row frozen at 1 fails.
    expect(countOf(two)).toBe(2);
  });
});

/**
 * Diff review R4. Four of the five findings were UNPINNED repairs — correct code
 * with no case that would notice its removal. Each gets its mutant's shape as a
 * test here; the generator-integration pin lives in `baselineGuard.test.ts`.
 */
describe("R4 repairs", () => {
  it("(1) sees code inside a NESTED-brace template interpolation", () => {
    // A one-level regex masked `${expect({ a: { b: 1 } })}` wholesale, hiding
    // executable code. The earlier fixture used a brace-free interpolation and
    // could not tell the difference.
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "const s = `v: ${expect({ a: { b: 1 } }, readFileSync(p))}`;",
      "```",
    ].join("\n");
    expect(hits(text)).toContain("UNIMPORTED_IDENTIFIER:expect");
  });

  it("(2) a waiver covers ITS fence regardless of where the copy sits", () => {
    // Summing before waiver resolution made suppression order-dependent: the
    // waived copy placed FIRST suppressed both occurrences, placed SECOND it
    // suppressed neither. Both arrangements must now waive exactly one.
    const fence = ["```ts", "const n = rows[0].name;", "```"];
    const waiver = "<!-- plan-fences: ignore UNCHECKED_INDEX — reviewed -->";
    const first = ["In `lib/a.ts`:", "", waiver, ...fence, "", "In `lib/a.ts`:", "", ...fence].join(
      "\n",
    );
    const second = [
      "In `lib/a.ts`:",
      "",
      ...fence,
      "",
      "In `lib/a.ts`:",
      "",
      waiver,
      ...fence,
    ].join("\n");
    for (const text of [first, second]) {
      const r = analyzePlan("docs/superpowers/plans/x/plan.md", text);
      const live = r.findings.find((f) => f.rule === "UNCHECKED_INDEX");
      const waived = r.waived.find((f) => f.rule === "UNCHECKED_INDEX");
      expect(live?.count, "exactly one occurrence survives the waiver").toBe(1);
      expect(waived?.count, "exactly one occurrence is reported as waived").toBe(1);
      expect(r.waiverErrors, "the waiver suppressed something, so no error").toEqual([]);
    }
  });

  it("(4) REPORTS a fence nested inside a list AND a quote", () => {
    // `peelContainers` is stateless and peels one level, so this was dropped
    // silently. The unplaceable check strips all leading container punctuation.
    const text = ["10. item", "", "    >     ```ts", "    >     const n = 1;"].join("\n");
    const r = analyzePlan("docs/superpowers/plans/x/plan.md", text);
    expect(
      r.unplaced.length,
      "a fence the extractor cannot place must be reported",
    ).toBeGreaterThan(0);
  });

  it("(5) binds a modifier-prefixed GENERIC method's own parameter", () => {
    // `public run<T>(expect: T) { … }` is valid TypeScript; without modifier and
    // type-parameter support the bound parameter `expect` false-fired.
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "class O { public run<T>(expect: T) { return readFileSync(String(expect)); } }",
      "```",
    ].join("\n");
    expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
  });
});

/**
 * Round-5 gate findings — every one was "correct but UNPINNED": behavior with no
 * case that would notice its removal. The reviewer supplied a surviving mutant
 * for each; these are those mutants, turned into assertions.
 */
describe("R5 gate pins", () => {
  it("a STANDALONE `not-ui` suppresses nothing", () => {
    // Mutant: widen the suppressing regex back to `(?:ignore|not-ui)`. The old
    // case could not catch it because its `not-ui` line sat behind an `ignore`.
    const text = [
      "In `lib/a.ts`:",
      "",
      "<!-- spec-lint: not-ui — internal note -->",
      "```ts",
      'const a = "one — two";',
      "```",
    ].join("\n");
    expect(rulesOf(text)).toContain("FENCE_EM_DASH");
  });

  it("binds DEFAULT and NAMESPACE imports", () => {
    // Mutant: delete the `ns` and `dflt` extraction blocks. A valid default
    // import then false-fires.
    const dflt = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import expect from "./expect";',
      'import { readFileSync } from "node:fs";',
      "expect(readFileSync(p));",
      "```",
    ].join("\n");
    expect(rulesOf(dflt)).not.toContain("UNIMPORTED_IDENTIFIER");

    const ns = [
      "In `lib/b.ts`:",
      "",
      "```ts",
      'import * as expect from "./expect";',
      'import { readFileSync } from "node:fs";',
      "expect.thing(readFileSync(p));",
      "```",
    ].join("\n");
    expect(rulesOf(ns)).not.toContain("UNIMPORTED_IDENTIFIER");
  });

  it("binds an UNPARENTHESIZED arrow parameter", () => {
    // Mutant: drop the final arm of PARAMS. `expect => …` then false-fires.
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "const f = expect => readFileSync(expect);",
      "```",
    ].join("\n");
    expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
  });

  it("attributes at SIX lines above and not at seven", () => {
    // Mutant: `scanned < 6` -> `scanned < 7`. The bound is part of the settled
    // accept-set, so both sides of it are asserted.
    const build = (gap: number): string =>
      [
        "In `lib/a.ts`:",
        ...Array.from({ length: gap }, () => ""),
        "```ts",
        "const x = 1;",
        "```",
      ].join("\n");
    // 4 blanks: the prose is the 5th line scanned, inside the bound.
    expect(analyzePlan("docs/superpowers/plans/x/plan.md", build(4)).attributedFences).toBe(1);
    // 6 blanks: the prose would be the 7th line scanned — exactly one past the
    // bound, which is the only gap that DISCRIMINATES. A larger gap is
    // unattributed under both `< 6` and `< 7`, so it proves nothing; the first
    // version of this case used 7 and the loosening mutant survived it.
    expect(analyzePlan("docs/superpowers/plans/x/plan.md", build(6)).attributedFences).toBe(0);
  });
});

/** Round-6 gate findings — three real misses plus six unpinned properties. */
describe("R6 gate repairs", () => {
  it("(1) sees code that follows an import on the SAME line", () => {
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs"; expect(readFileSync(p));',
      "```",
    ].join("\n");
    expect(hits(text)).toContain("UNIMPORTED_IDENTIFIER:expect");
  });

  it("(2) does not read `//` inside a string as a comment", () => {
    // Masking comments BEFORE strings blanked the rest of the line from the
    // `//` in a URL, hiding the call after it.
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      'const url = "https://example.com"; expect(readFileSync(url));',
      "```",
    ].join("\n");
    expect(hits(text)).toContain("UNIMPORTED_IDENTIFIER:expect");
  });

  it("(3) does not let a `}` inside a string end an interpolation early", () => {
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      'const s = `x ${"}" + expect(readFileSync(p))}`;',
      "```",
    ].join("\n");
    expect(hits(text)).toContain("UNIMPORTED_IDENTIFIER:expect");
  });

  it("(4) resolves a named-import ALIAS to the bound name", () => {
    // Mutant: always add the source name. The old alias case used `rfs`, which
    // is outside the registry, so it could not discriminate.
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { helper as expect } from "./h";',
      'import { readFileSync } from "node:fs";',
      "expect(readFileSync(p));",
      "```",
    ].join("\n");
    expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
  });

  it("(5) resolves a DESTRUCTURING alias to the bound name", () => {
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { readFileSync } from "node:fs";',
      "const { helper: expect } = obj;",
      "expect(readFileSync(p));",
      "```",
    ].join("\n");
    expect(rulesOf(text)).not.toContain("UNIMPORTED_IDENTIFIER");
  });

  it("(6) stops attribution at the FIRST prose line, even when ambiguous", () => {
    // Mutant: `continue` past an ambiguous line to search older prose. A fence
    // below it would then inherit an older path and false-fire DUPLICATE_IMPORT.
    const text = [
      "In `lib/a.ts`:",
      "",
      "```ts",
      'import { expect } from "vitest";',
      "const x = 1;",
      "```",
      "",
      "Mentions `lib/a.ts` and `lib/b.ts`:",
      "",
      "```ts",
      'import { expect } from "vitest";',
      "const y = 2;",
      "```",
    ].join("\n");
    expect(rulesOf(text)).not.toContain("DUPLICATE_IMPORT");
  });

  it("(7) treats an EXPORT-only fence as eligible, not just an import-only one", () => {
    const text = ["In `lib/a.ts`:", "", "```ts", "export default rows[0].name", "```"].join("\n");
    expect(hits(text)).toContain("UNCHECKED_INDEX:rows[0].name");
  });
});
