/**
 * tests/reviewRounds/advisoryComparatorTopology.test.ts — the claim spec §3.1
 * was actually making, stated executably.
 *
 * WHY THIS EXISTS. The 2026-08-07 spec §3.1 required "ONE parse-and-compare
 * helper", four documents repeated it, and a source comment above `atOrBefore`
 * said "The ONE comparator" while `strictlyBefore` sat two lines below it. A
 * cross-model reviewer produced the shipped-source counterexample. The wording
 * was wrong; the code was not, and consolidating `<` and `<=` behind one helper
 * would need a MODE parameter — a discriminating-parameter mutant surface added
 * to close a prose defect.
 *
 * WHAT §3.1 ACTUALLY NEEDS is its own stated rationale: "so a later-added site
 * cannot be lexical by default." That is two closable properties, and this file
 * is both, so the claim can never again be true only in prose:
 *
 *   1. No timestamp STRING is ever an operand of a relational operator inside
 *      the report module. Ordering goes through named helpers over parsed
 *      instants.
 *   2. Every ordering helper in the module accepts parsed values only, so a
 *      later-added site that forgets to parse is a COMPILE error rather than a
 *      silent lexical compare. A third comparator taking `string` fails here.
 *   3. No relational operand is a bare `Date.parse(...)` call. Added at diff
 *      R3, which found what properties 1 and 2 both let through: `Date.parse`
 *      of a timezone-less string SUCCEEDS and returns a host-dependent
 *      instant, and of an impossible date returns a normalized one. Property 1
 *      deliberately treats a call result as "already parsed", so the shape
 *      `Date.parse(a) < Date.parse(b)` was legitimate to it. ONE predicate,
 *      deliberately: the recognizer does not grow a grammar per round.
 *
 * SELF-TEST SHAPES, POSITIVE AND NEGATIVE, per the repair-economy rule
 * (`docs/agents/writing-plans.md`): a scanner's claims are planted as
 * executable shapes in the same commit as the scanner. Without the negative
 * shape a scanner that flags EVERY relational operator would pass its positive
 * case and be worthless.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";

const FILE = "scripts/review-economy.ts";
const SRC = readFileSync(join(process.cwd(), FILE), "utf8");

/**
 * The scan's scope is DERIVED, not listed. It was one hardcoded path, and
 * diff R1 found the predictable consequence: a lexical compare added to
 * `lib/reviewRounds/corpus.ts` was outside the only file the scanner read, so
 * the guard passed while the class it names shipped. An enumerated cover
 * re-opens the moment someone adds a site, which is exactly what happened.
 *
 * `lib/reviewRounds/` is walked from disk, so a NEW module in it is covered by
 * default rather than by remembering to register it.
 */
const SCANNED: readonly { file: string; src: string }[] = [
  { file: FILE, src: SRC },
  ...readdirSync(join(process.cwd(), "lib/reviewRounds"), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => `lib/reviewRounds/${e.name}`)
    .sort()
    .map((file) => ({ file, src: readFileSync(join(process.cwd(), file), "utf8") })),
];

/**
 * Identifiers that hold a timestamp STRING. A relational operator on any of
 * them orders ISO-8601 text lexically, and offset-bearing timestamps order
 * differently lexically than chronologically — which is the silent wrongness
 * §3.1 exists to prevent.
 */
const TIMESTAMP_NAMES: ReadonlySet<string> = new Set([
  "startedAt",
  "endedAt",
  "mergedAt",
  "boundary",
]);

const RELATIONAL: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

type Finding = { line: number; text: string };

const parse = (fileName: string, src: string): ts.SourceFile =>
  ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true);

/** The name a relational operand resolves to, or null when it is any other
 *  expression — a `Date.parse(...)` call, an index, a literal. A call result is
 *  deliberately NOT a name: comparing two parsed values is the correct shape. */
const operandName = (n: ts.Node): string | null => {
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isPropertyAccessExpression(n)) return n.name.text;
  return null;
};

/** Property 1: relational operators applied to a timestamp-bearing name. */
export function lexicalTimestampComparisons(fileName: string, src: string): Finding[] {
  const sf = parse(fileName, src);
  const found: Finding[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && RELATIONAL.has(n.operatorToken.kind)) {
      const names = [operandName(n.left), operandName(n.right)];
      if (names.some((nm) => nm !== null && TIMESTAMP_NAMES.has(nm))) {
        found.push({
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          text: n.getText(sf),
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/**
 * Property 2: an ordering helper — any module-scope function whose body applies
 * a relational operator to its OWN parameters — whose parameter is not declared
 * as parsed (`number`, optionally `| null`). Keyed on the parameter's declared
 * type rather than on the function's name, so a third comparator called
 * anything at all is still covered.
 */
export function comparatorsAcceptingUnparsed(fileName: string, src: string): Finding[] {
  const sf = parse(fileName, src);
  const found: Finding[] = [];

  const declaredParsed = (t: ts.TypeNode | undefined): boolean => {
    if (t === undefined) return false;
    const members = ts.isUnionTypeNode(t) ? t.types : [t];
    // `null` in a TYPE position is a LiteralTypeNode wrapping the keyword, not
    // the keyword itself — reading it as `SyntaxKind.NullKeyword` rejects every
    // `number | null` parameter in the module, which is how this scanner first
    // ran red against correct code.
    return members.every(
      (m) =>
        m.kind === ts.SyntaxKind.NumberKeyword ||
        (ts.isLiteralTypeNode(m) && m.literal.kind === ts.SyntaxKind.NullKeyword),
    );
  };

  const check = (fn: ts.SignatureDeclaration & { body?: ts.Node }): void => {
    const params = new Map<string, ts.ParameterDeclaration>();
    for (const p of fn.parameters) if (ts.isIdentifier(p.name)) params.set(p.name.text, p);
    if (params.size === 0 || fn.body === undefined) return;
    const visit = (n: ts.Node): void => {
      if (ts.isBinaryExpression(n) && RELATIONAL.has(n.operatorToken.kind)) {
        for (const side of [n.left, n.right]) {
          const nm = operandName(side);
          const p = nm === null ? undefined : params.get(nm);
          if (p !== undefined && !declaredParsed(p.type)) {
            found.push({
              line: sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1,
              text: p.getText(sf),
            });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(fn.body);
  };

  const walk = (n: ts.Node): void => {
    if (ts.isArrowFunction(n) || ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) {
      check(n as ts.SignatureDeclaration & { body?: ts.Node });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return found;
}

/** A direct `Date.parse(...)` call, which is the only shape property 3 knows. */
const isDateParseCall = (n: ts.Node): boolean =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  ts.isIdentifier(n.expression.expression) &&
  n.expression.expression.text === "Date" &&
  n.expression.name.text === "parse";

/**
 * Property 3: a relational operator applied to a bare `Date.parse(...)` result.
 * `Date.parse` answers questions it cannot settle - a timezone-less string gets
 * a host-dependent instant, an impossible date gets a normalized one - so its
 * result is not "parsed" in the sense properties 1 and 2 mean. Ordering goes
 * through `instant`, whose not-placeable answer is `null`.
 */
export function bareDateParseComparisons(fileName: string, src: string): Finding[] {
  const sf = parse(fileName, src);
  const found: Finding[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      RELATIONAL.has(n.operatorToken.kind) &&
      (isDateParseCall(n.left) || isDateParseCall(n.right))
    ) {
      found.push({
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        text: n.getText(sf),
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe("boundary-advisory comparator topology (2026-08-07 spec §3.1)", () => {
  it("PREMISE: both scanners flag a planted violation, and neither flags a legitimate comparison", () => {
    // POSITIVE — the exact regression §3.1 forbids: a later-added site that
    // compares the raw strings.
    const lexical = `const boundary = "x";\nconst startedAt = "y";\nexport const bad = startedAt <= boundary;\n`;
    expect(lexicalTimestampComparisons("planted.ts", lexical)).toHaveLength(1);

    // POSITIVE — a third comparator that takes strings.
    const stringy = `export const cmp = (a: string, b: string): boolean => a <= b;\n`;
    expect(comparatorsAcceptingUnparsed("planted.ts", stringy)).toHaveLength(2);

    // NEGATIVE — without these a scanner that flags EVERY relational operator
    // passes both positives and pins nothing. Comparing PARSED values, and
    // comparing things that are not timestamps at all, are both correct.
    const good =
      `const at = (s: string): number | null => Date.parse(s);\n` +
      `export const ok = (a: number | null, b: number | null): boolean =>\n` +
      `  a !== null && b !== null && a <= b;\n` +
      // Legitimate to properties 1 and 2 by design, and a POSITIVE for
      // property 3 below - which is the gap R3 found.
      `export const alsoOk = Date.parse(startedAt) <= Date.parse(boundary);\n` +
      `export const notATimestamp = (month: number): boolean => month < 1 || month > 12;\n`;
    expect(lexicalTimestampComparisons("planted.ts", good)).toEqual([]);
    expect(comparatorsAcceptingUnparsed("planted.ts", good)).toEqual([]);
  });

  it("PREMISE: property 3 flags a bare Date.parse comparison and nothing else", () => {
    // POSITIVE — the exact shape that shipped and that properties 1 and 2 both
    // cleared, in both operand positions and under every relational operator.
    expect(
      bareDateParseComparisons(
        "planted.ts",
        `export const a = Date.parse(x) < Date.parse(y);\n` +
          `export const b = parsed <= Date.parse(y);\n` +
          `export const c = Date.parse(x) > t;\n` +
          `export const d = Date.parse(x) >= t;\n`,
      ),
    ).toHaveLength(4);

    // NEGATIVE — without these the property is "flags any Date.parse" or
    // "flags any relational operator", either of which pins nothing. Parsing
    // into a variable, calling the real helper, and comparing non-timestamps
    // are all correct.
    expect(
      bareDateParseComparisons(
        "planted.ts",
        `const t = Date.parse(x);\n` +
          `export const ok = strictlyBefore(instant(x), instant(y));\n` +
          `export const alsoOk = Number.isFinite(Date.parse(x)) ? t : null;\n` +
          `export const notATimestamp = (month: number): boolean => month < 1;\n`,
      ),
    ).toEqual([]);
  });

  it("PREMISE: the scope reaches the module diff R1 caught, and flags the ACTUAL defect there", () => {
    // Two properties, because either alone is satisfiable while the guard is
    // useless. SCOPE: a scan narrowed back to one file passes every assertion
    // below it while covering nothing. POWER: a scope that reaches the file
    // proves nothing if the scanner cannot see the shape that shipped.
    const corpus = SCANNED.find(({ file }) => file === "lib/reviewRounds/corpus.ts");
    expect(corpus, "the walk must reach corpus.ts — R1's finding lived there").toBeDefined();

    const shipped =
      ".filter((r) => !strictlyBefore(instant(r.startedAt), instant(ARC_SUM_FREEZE)));";
    const lexical = ".filter((r) => r.startedAt === null || !(r.startedAt < ARC_SUM_FREEZE));";
    const regressed = corpus!.src.replace(shipped, lexical);
    premiseHolds("the repaired line is still present to regress", regressed !== corpus!.src);
    expect(lexicalTimestampComparisons(corpus!.file, regressed).length).toBeGreaterThan(0);
  });

  it("compares no timestamp STRING with a relational operator, in ANY scanned module", () => {
    premiseHolds(
      "every scanned module is non-empty and parses, so an empty scan means 'none found' rather than 'nothing read'",
      SCANNED.length > 1 &&
        SCANNED.every(({ file, src }) => src.length > 0 && parse(file, src).statements.length > 0),
    );
    const found = SCANNED.flatMap(({ file, src }) =>
      lexicalTimestampComparisons(file, src).map((f) => `${file}:${f.line} ${f.text}`),
    );
    expect(found).toEqual([]);
  });

  it("applies no relational operator to a bare Date.parse result, in ANY scanned module", () => {
    premiseHolds(
      "every scanned module is non-empty and parses, so an empty scan means 'none found' rather than 'nothing read'",
      SCANNED.length > 1 &&
        SCANNED.every(({ file, src }) => src.length > 0 && parse(file, src).statements.length > 0),
    );
    const found = SCANNED.flatMap(({ file, src }) =>
      bareDateParseComparisons(file, src).map((f) => `${file}:${f.line} ${f.text}`),
    );
    expect(found).toEqual([]);
  });

  it("declares every ordering helper over PARSED instants, so an unparsed site cannot compile", () => {
    // The property that replaces the retired "ONE comparator" wording. Two
    // helpers is correct — `<` and `<=` are both spec-required, at the strict
    // boundary check and the inclusive time cap — and collapsing them behind a
    // mode parameter would add a discriminating parameter, not remove a risk.
    // What matters is that NEITHER accepts a string, and neither does a third.
    // Ranged over the whole scan, not one file. The helpers moved to
    // `lib/reviewRounds/instant.ts` at R3, and a premise pinned to
    // `scripts/review-economy.ts` went vacuous the moment they left - which the
    // premise helper reported rather than passing quietly.
    premiseHolds(
      "some scanned module really does contain ordering helpers for this assertion to range over",
      SCANNED.some(
        ({ file, src }) =>
          comparatorsAcceptingUnparsed(file, src.replace(/: number \| null/g, ": string")).length >
          0,
      ),
    );
    const unparsed = SCANNED.flatMap(({ file, src }) =>
      comparatorsAcceptingUnparsed(file, src).map((f) => `${file}:${f.line} ${f.text}`),
    );
    expect(unparsed).toEqual([]);
  });
});
