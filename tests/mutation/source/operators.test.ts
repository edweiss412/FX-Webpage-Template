import { describe, expect, it } from "vitest";
import { OPERATOR_NAMES, enumerateSites, siteId } from "../../../tests/mutation/source/operators";

/**
 * The fixture is deliberately hostile to a text scanner: every construct here
 * defeated the throwaway regex sweep that preceded this harness (spec §2.3).
 * Digits live inside a message string and inside a regex character class;
 * comparison characters live inside TS generics and an arrow; and the only
 * quantifier bound sits inside a regex literal.
 */
const FIXTURE = `
// a comment with 1 digit and a < b and a && b
/* block comment with 2 digits and x <= y */
const RE = /^ {0,3}<!-- x -->[ \\t]*$/;
const CLASS = /[1-6]/;
export function f(m: Map<number, number[]>, s: Set<string>): number {
  const msg = "expected depth=<1-6>, got 7 instead";
  const finding = { column: 1, depth: 2 };
  let n = 0;
  for (let i = 0; i < 10; i++) {
    if (i >= 3 && i !== 4) n++;
    if (i <= 2 || i === 5) continue;
  }
  const g = (a: number) => a > 1;
  n = g(n) ? n : 0;
  return n;
}
`.trimStart();

const sites = (ops?: readonly (typeof OPERATOR_NAMES)[number][]) =>
  enumerateSites("/virtual/fixture.ts", FIXTURE, ops ?? OPERATOR_NAMES);

/** 1-based line of each site produced by `op`. */
const linesFor = (op: string): number[] =>
  sites()
    .filter((s) => s.operator === op)
    .map((s) => s.line)
    .sort((a, b) => a - b);

const lineOf = (needle: string): number =>
  FIXTURE.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("source-mutation operators — the declared accept-set (spec §3.1, AC-1)", () => {
  it("declares exactly the six operators, with no implemented emitter outside the declaration", () => {
    expect([...OPERATOR_NAMES].sort()).toEqual([
      "equality-flip",
      "integer-literal",
      "logical-connector",
      "regex-quantifier-bound",
      "relational-boundary",
      "statement-removal",
    ]);
    // SET EQUALITY, both directions. A subset check alone (emitted ⊆ declared)
    // stops a seventh emitter being smuggled in, but says nothing about a
    // declared operator that emits NOTHING — and that direction is the
    // dangerous one: the surface's promised mutants are never generated, so
    // they appear neither as killed nor as survivors, no ledger row goes
    // stale, the mutant count stays non-zero, and the score can still clear
    // the floor. The gate reports green having silently dropped the mutants it
    // promised, which violates the consequence bound outright.
    const emitted = new Set<string>(sites().map((s) => s.operator));
    expect([...emitted].sort()).toEqual([...OPERATOR_NAMES].sort());
  });

  it("emits at least one site for EVERY declared operator, so none is silently dark", () => {
    // The per-operator form of the same guarantee: a partially-broken emitter
    // that still fires somewhere would satisfy set equality above.
    for (const op of OPERATOR_NAMES) {
      expect(
        sites().filter((s) => s.operator === op).length,
        `${op} emitted nothing`,
      ).toBeGreaterThan(0);
    }
  });

  it("emits an integer-literal site for a numeric inside a property assignment", () => {
    // The concrete near-miss: an ordinary AST mistake is to walk only
    // statement-position numerics and skip `PropertyAssignment` initialisers.
    // `column: 1` in `lib/specLint/taskContract.ts:63` is exactly that shape and
    // is one of the surface's genuine gaps, so dropping it would delete a real
    // mutant while every gate condition stayed green.
    const propLine = lineOf("const finding = { column: 1, depth: 2 };");
    const there = sites().filter((s) => s.operator === "integer-literal" && s.line === propLine);
    expect(there.map((s) => `${s.from}->${s.to}`).sort()).toEqual(["1->2", "2->3"]);
  });

  it("honours a per-surface operator subset instead of always emitting all six", () => {
    const subset = sites(["equality-flip"]);
    expect(subset.length).toBeGreaterThan(0);
    expect(new Set(subset.map((s) => s.operator))).toEqual(new Set(["equality-flip"]));
  });
});

describe("source-mutation operators — AST scoping (spec §3.1/§3.2, AC-2)", () => {
  it("emits no integer-literal site inside a string literal, so message copy is never mutated", () => {
    // The regex sweep this harness replaced spliced `1` -> `2` inside
    // taskContract's "depth=<1-6>" message. An AST walk cannot: the digits
    // there are not NumericLiteral nodes.
    expect(linesFor("integer-literal")).not.toContain(lineOf('const msg = "expected'));
  });

  it("emits no site of any operator inside line or block comments", () => {
    const commentLines = [lineOf("// a comment"), lineOf("/* block comment")];
    const hit = sites().filter((s) => commentLines.includes(s.line));
    expect(hit.map((s) => `${s.operator}@${s.line}`)).toEqual([]);
  });

  it("emits no relational-boundary site on TS generics or on an arrow token", () => {
    // `Map<number, number[]>` and `=>` are the two constructs that forced
    // hand-written masking in the text scan; neither is a BinaryExpression.
    expect(linesFor("relational-boundary")).not.toContain(lineOf("export function f("));
    const arrowLine = lineOf("const g = (a: number) =>");
    // The arrow LINE does carry a real `a > 1` comparison, so scope the
    // assertion to the token actually rewritten rather than to the line.
    const onArrowLine = sites().filter(
      (s) => s.line === arrowLine && s.operator === "relational-boundary",
    );
    expect(onArrowLine.map((s) => s.from)).toEqual([">"]);
  });

  it("emits a regex-quantifier-bound site for a literal `{m,n}` and widens only its upper bound", () => {
    const q = sites().filter((s) => s.operator === "regex-quantifier-bound");
    expect(q.map((s) => `${s.from}->${s.to}`)).toEqual(["{0,3}->{0,4}"]);
  });

  it("does not treat a regex character-class range as an integer literal", () => {
    expect(linesFor("integer-literal")).not.toContain(lineOf("const CLASS ="));
  });
});

describe("source-mutation operators — rewrites (spec §3.1)", () => {
  it("shifts each relational boundary to its adjacent form", () => {
    const pairs = sites()
      .filter((s) => s.operator === "relational-boundary")
      .map((s) => `${s.from}->${s.to}`);
    expect(new Set(pairs)).toEqual(new Set(["<-><=", ">->>=", "<=-><", ">=->>"]));
  });

  it("flips strict equality in both directions", () => {
    const pairs = sites()
      .filter((s) => s.operator === "equality-flip")
      .map((s) => `${s.from}->${s.to}`);
    expect(new Set(pairs)).toEqual(new Set(["!==->===", "===->!=="]));
  });

  it("swaps each logical connective", () => {
    const pairs = sites()
      .filter((s) => s.operator === "logical-connector")
      .map((s) => `${s.from}->${s.to}`);
    expect(new Set(pairs)).toEqual(new Set(["&&->||", "||->&&"]));
  });

  it("removes expression, continue and break statements", () => {
    const removed = sites()
      .filter((s) => s.operator === "statement-removal")
      .map((s) => s.from);
    expect(removed).toContain("continue;");
    expect(removed.some((t) => t.startsWith("n++"))).toBe(true);
    // A variable DECLARATION is not an ExpressionStatement: removing one
    // cannot compile, so it would be a guaranteed-killed mutant that inflates
    // the score. It must not be emitted.
    expect(removed.some((t) => t.startsWith("const ") || t.startsWith("let "))).toBe(false);
  });
});

describe("source-mutation operators — site identity (spec §3.2)", () => {
  it("gives every site a unique id carrying operator, position and rewrite", () => {
    const ids = sites().map(siteId);
    expect(new Set(ids).size).toBe(ids.length);
    const first = sites()[0]!;
    expect(siteId(first)).toBe(
      `${first.operator}:${first.line}:${first.column}:${first.from}>${first.to}`,
    );
  });

  it("reports offsets that splice back to a mutant differing from the original", () => {
    for (const s of sites()) {
      const mutant = FIXTURE.slice(0, s.start) + s.replacement + FIXTURE.slice(s.end);
      expect(mutant, `site ${siteId(s)} produced a no-op mutant`).not.toBe(FIXTURE);
    }
  });
});
