// One definition of "what is a `.replace` call and what is its replacement", imported by every
// derivation in this directory.
//
// Spec rounds 2, 4 and 5 each found the SAME class in a different position: the replacement
// argument tested without resolving transparent wrappers, then the callee, then const binding
// initializers, then the file-level text prefilter that runs before any of them. Rounds 4 and 5
// also found the repair incomplete because it landed in one script while four siblings kept their
// own copies — and one of those siblings is the "independent oracle" the spec's AC-1b compares
// against, which made the cross-check vacuous on precisely this axis.
//
// So the resolution lives here, once. A derivation that wants a different answer has to say so
// explicitly rather than drift into one.
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { skipTransparent } from "../../../../../../tests/_shared/outerExpressions";

export const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

/** A `$` sequence `String.prototype.replace` interprets in a replacement STRING. */
export const DOLLAR = /\$(&|`|'|\d|<[A-Za-z_$][\w$]*>|\$)/;

// THERE IS NO TEXT PREFILTER, DELIBERATELY.
//
// A cheap regex deciding which files get parsed is the obvious optimization and it cost this arc
// two review rounds. `/\.replace\s*\(/` misses a wrapped callee `(s.replace)(a, v)`, because
// `.replace` is followed by `)`. Widening it to `/\.replace\b/` then misses the trivia JavaScript
// allows between the dot and the property name: `a.path. replace(...)`, a newline, a block
// comment, a line comment — each still a PropertyAccessExpression named `replace`, each rejected.
// An ordinary explanatory comment was enough to remove a corrupting live call from the judge.
//
// Every fix widened the regex and the next round found the next spelling, which is the recognizer
// ratchet this repo has measured as the losing move. The narrowing repair is to DELETE the
// optimization. Measured over the tracked population: prefiltered 508 files / 1235ms, no
// prefilter 3670 files / 1941ms, both finding 1206 calls. Seven hundred milliseconds is not worth
// an axis that admits a new finding every round, and deleting it also closes the escaped-
// identifier spelling (`s.repl\u0061ce(...)`) that no source-text regex can see at all.
//
// The safest optimization is the one that is not there.

/** Tracked files with a JS/TS extension, from disk — never an enumerated list. */
export const trackedFiles = (): string[] =>
  execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\n")
    .filter((f) => f !== "" && EXT.test(f));

/** The four second-argument forms that carry no runtime value. Wrappers resolved by the caller. */
export const isAccepted = (a: ts.Expression): boolean =>
  ts.isStringLiteral(a) ||
  ts.isNoSubstitutionTemplateLiteral(a) ||
  ts.isArrowFunction(a) ||
  ts.isFunctionExpression(a);

/** The `.replace` / `.replaceAll` property access a call denotes, transparent wrappers resolved. */
export const replaceCallee = (n: ts.Node): ts.PropertyAccessExpression | null => {
  if (!ts.isCallExpression(n)) return null;
  const c = skipTransparent(n.expression);
  return ts.isPropertyAccessExpression(c) && /^replace(All)?$/.test(c.name.text) ? c : null;
};

/** The string a declaration's initializer denotes, or null. Wrappers resolved. */
export const litText = (e: ts.Expression | undefined): string | null => {
  if (e === undefined) return null;
  const r = skipTransparent(e);
  return ts.isStringLiteral(r) || ts.isNoSubstitutionTemplateLiteral(r) ? r.text : null;
};

/** How a call's replacement argument classifies, with the judge's ordering (spec §3.1). */
export type Verdict = "accepted" | "not-in-population" | "reported";

export function classify(n: ts.CallExpression): { verdict: Verdict; arg: ts.Expression | null } {
  const args = n.arguments;
  const spreadIdx = args.findIndex((a) => ts.isSpreadElement(a));
  if (spreadIdx === 0 || spreadIdx === 1) return { verdict: "reported", arg: null };
  if (args.length < 2) return { verdict: "not-in-population", arg: null };
  const arg = skipTransparent(args[1]!);
  return { verdict: isAccepted(arg) ? "accepted" : "reported", arg };
}
