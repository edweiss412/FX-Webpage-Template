// The replacement-string judge (spec 2026-08-24-replacement-string-class-sweep §3).
//
// `String.prototype.replace` PARSES its second argument when that argument is a string: `$&` is
// the match, `` $` `` and `$'` are the text around it, `$1`/`$<name>` are captures, `$$` is a
// literal dollar. A runtime value placed there is interpreted rather than inserted — the call
// succeeds, the output is wrong, and nothing throws.
//
// Pure functions of a source STRING, deliberately. The mutation overlay rewrites the module
// graph, so a check that read its subject off disk with `readFileSync` would read unmutated bytes
// and pass unconditionally; taking the source as an argument is what lets the fixture suite kill
// mutants at all (spec §7).
import ts from "typescript";

import { skipTransparent } from "../../_shared/outerExpressions";

export type Finding = {
  /** Repo-relative path of the file the call is in. */
  file: string;
  /** 1-indexed line of the call expression. */
  line: number;
  /** The call's source text, truncated for legibility. */
  text: string;
};

/**
 * The four second-argument forms that carry no runtime value.
 *
 * An ACCEPT-SET, not a denylist: an argument form nobody has thought of yet is reported rather
 * than accepted, which is the direction a static guard must fail in.
 */
function isAccepted(a: ts.Expression): boolean {
  return (
    ts.isStringLiteral(a) ||
    ts.isNoSubstitutionTemplateLiteral(a) ||
    ts.isArrowFunction(a) ||
    ts.isFunctionExpression(a)
  );
}

/**
 * The `.replace` / `.replaceAll` property access a call denotes, transparent wrappers resolved.
 *
 * Resolution happens HERE and in `litOf` below, not at each kind test, because spec rounds 2, 4
 * and 5 each found this same class in a different position — the argument, the callee, a const
 * initializer, and the file prefilter that used to gate the walk. Four positions in one class is
 * a fact about placement (spec §3.3).
 */
function replaceCallee(n: ts.Node): ts.PropertyAccessExpression | null {
  if (!ts.isCallExpression(n)) return null;
  const callee = skipTransparent(n.expression);
  return ts.isPropertyAccessExpression(callee) && /^replace(All)?$/.test(callee.name.text)
    ? callee
    : null;
}

type Verdict = "accepted" | "not-in-population" | "reported";

/**
 * Spec §3.1's ordering, and the order is load-bearing.
 *
 * A SPREAD at index 0 or 1 makes positional indexing meaningless: `s.replace(...[find, repl])`
 * has ONE AST argument, so `arguments[1]` is undefined while the call receives two. Checking the
 * argument COUNT first would file that as "no replacement position" — an acceptance path wearing
 * an out-of-population label, which is the one direction §2's consequence bound forbids. Worse,
 * `s.replace(...args, "lit")` has an ACCEPTED literal at index 1 that is not the argument the
 * call uses.
 */
function classify(call: ts.CallExpression): Verdict {
  const args = call.arguments;
  const spreadIdx = args.findIndex((a) => ts.isSpreadElement(a));
  if (spreadIdx === 0 || spreadIdx === 1) return "reported";
  if (args.length < 2) return "not-in-population";
  return isAccepted(skipTransparent(args[1]!)) ? "accepted" : "reported";
}

function walk(
  filePath: string,
  source: string,
  visit: (call: ts.CallExpression, verdict: Verdict, src: ts.SourceFile) => void,
): void {
  const src = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const step = (n: ts.Node): void => {
    if (replaceCallee(n) !== null && ts.isCallExpression(n)) visit(n, classify(n), src);
    // NEVER return early. A chained `a.replace(x, y).replace(z, w)` nests the inner call inside
    // the outer call's receiver, so stopping here drops every link but the last — twelve offender
    // sites on the live corpus are reachable only through a receiver.
    ts.forEachChild(n, step);
  };
  step(src);
}

/** Findings for one source string: one per REPORTED site. A finding is a name and a location. */
export function judgeSource(filePath: string, source: string): Finding[] {
  const findings: Finding[] = [];
  walk(filePath, source, (call, verdict, src) => {
    if (verdict !== "reported") return;
    const { line } = src.getLineAndCharacterOfPosition(call.getStart(src));
    findings.push({
      file: filePath,
      line: line + 1,
      text: call.getText(src).slice(0, 110).replace(/\s+/g, " "),
    });
  });
  return findings;
}

/**
 * Calls with no replacement position — fewer than two arguments, and no spread that would make
 * the count meaningless. Counted rather than reported, and asserted by the suite, so the bucket
 * cannot quietly absorb real sites.
 */
export function notInPopulationCount(filePath: string, source: string): number {
  let n = 0;
  walk(filePath, source, (_call, verdict) => {
    if (verdict === "not-in-population") n++;
  });
  return n;
}
