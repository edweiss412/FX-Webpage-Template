import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";

/**
 * `calleeChain` is the ONLY place in premiseScan that walks a registration's
 * callee chain — enforced by a DERIVATION over the file, not by a list.
 *
 * A registration's callee can be another call: `test.each(rows)(…)`,
 * `test.skipIf(c).each(rows)(…)`. Reading ONE level of that — asking
 * `ts.isCallExpression(call.expression)` and then using the answer as the chain
 * — is correct exactly while a chain holds one call, and this arc made two-call
 * chains reachable. Every one-level reader then becomes wrong in one of the two
 * directions the bound forbids: `eachProducers` and the nested-suite prune miss
 * an eager argument (a silent FREE), and `premiseIsAssociated` reads a skip
 * CONDITION as a producer (FALSE CERTIFICATION).
 *
 * **A LIST OF REPAIRED SITES CANNOT HOLD THIS.** The sweep that replaced those
 * three readers was complete when it was written and incomplete before it
 * merged: a concurrent branch (PR #861) adds `eagerArguments`, a fourth
 * one-level reader that did not exist when the list was made. No list is
 * structurally capable of naming a site authored after it. So the check walks
 * the file and reports whatever it finds — a site added tomorrow reds by
 * default rather than being silently exempt.
 *
 * **THIS CHECK IMPOSES A DESIGN CONSTRAINT ON THE CODE, AND THAT IS WHAT IT IS
 * FOR.** Aliases are tracked by ASSIGNMENT, so a chain peel written as
 * `node = unwrap(node)` launders the callee read across a function boundary and
 * the authority goes invisible to the check that exists to find it. That is not
 * a limitation to work around: it is the check requiring the peel to stay
 * something a reader - and a tracker - can follow. `calleeChain` therefore uses
 * a PREDICATE to decide whether to peel and keeps the peel an assignment. When
 * this premise fails after a refactor, the question is whether the refactor
 * hid the authority, not whether the check needs another exemption.
 *
 * The one permitted reader is named here and NOWHERE ELSE, and the test proves
 * the exemption is live rather than vacuous: `calleeChain` must itself be
 * detected before it is excused.
 */

const SCANNER = join(__dirname, "source", "premiseScan.ts");

/** The single function permitted to walk the chain. */
const AUTHORITY = "calleeChain";

type Peek = { fn: string; line: number; text: string };

/**
 * Every site that tests whether a call's CALLEE is itself a call.
 *
 * Typed, not textual. `st.expression` on an `ExpressionStatement` reads
 * identically to `call.expression` on a `CallExpression` and means something
 * else entirely, so the receiver's TYPE is what separates them — a regex here
 * would flag `classifyTests`'s statement walk and would have to grow an
 * exception, which is the hand-list this exists to avoid.
 *
 * Both spellings are covered: the direct `ts.isCallExpression(call.expression)`
 * and the aliased `const callee = call.expression; ts.isCallExpression(callee)`.
 * They are the same defect and a check that saw only one would pass the moment
 * somebody extracted a variable.
 */
function chainPeeks(files: string[]): Peek[] {
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
    strict: true,
  });
  const checker = program.getTypeChecker();
  const out: Peek[] = [];

  for (const file of files) {
    const sf = program.getSourceFile(file);
    if (sf === undefined) throw new Error(`chainPeeks: ${file} is not in the program`);

    /** Is this expression `<call>.expression`, i.e. one step up the chain? */
    const isCalleeRead = (n: ts.Node): boolean =>
      ts.isPropertyAccessExpression(n) &&
      n.name.text === "expression" &&
      /\bCallExpression\b/.test(checker.typeToString(checker.getTypeAtLocation(n.expression)));

    /**
     * Names bound to a callee read, by declaration OR by assignment, to a
     * FIXPOINT, and keyed by the LEXICAL SCOPE that binds them.
     *
     * All three properties were bought by a failure of this very check, in
     * order. The assignment half and the fixpoint are what let it see the
     * authority, which launders the read through two bindings — `const inner =
     * node.expression` then `node = inner` — and a one-hop check reported the
     * authority CLEAN and then excused it, an exemption for something it had
     * never detected. A rogue site launders exactly as easily.
     *
     * Keying by NAME ALONE then flagged every walker in the file: `n` is bound
     * to a callee read inside one unrelated function and is the parameter name
     * of six others, so a file-global alias set made `ts.isCallExpression(n)`
     * rogue everywhere. Scope is what separates the same name in two places, so
     * the set is per binding scope and a use consults its own scope and every
     * enclosing one — which is what a closure can actually see.
     */
    const functionOf = (n: ts.Node): ts.Node => {
      for (let p: ts.Node | undefined = n.parent; p !== undefined; p = p.parent) {
        if (
          ts.isFunctionDeclaration(p) ||
          ts.isFunctionExpression(p) ||
          ts.isArrowFunction(p) ||
          ts.isMethodDeclaration(p)
        )
          return p;
      }
      return sf;
    };
    const aliases = new Map<ts.Node, Set<string>>();
    const visible = (use: ts.Node, name: string): boolean => {
      for (let p: ts.Node | undefined = use; p !== undefined; p = p.parent) {
        if (aliases.get(p)?.has(name) === true) return true;
      }
      return false;
    };
    const bind = (scope: ts.Node, name: string): boolean => {
      const set = aliases.get(scope) ?? new Set<string>();
      const had = set.has(name);
      set.add(name);
      aliases.set(scope, set);
      return !had;
    };
    for (;;) {
      let grew = false;
      const isAliased = (n: ts.Node): boolean =>
        isCalleeRead(n) || (ts.isIdentifier(n) && visible(n, n.text));
      const collect = (n: ts.Node): void => {
        if (
          ts.isVariableDeclaration(n) &&
          ts.isIdentifier(n.name) &&
          n.initializer &&
          isAliased(n.initializer)
        )
          grew = bind(functionOf(n), n.name.text) || grew;
        if (
          ts.isBinaryExpression(n) &&
          n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(n.left) &&
          isAliased(n.right)
        )
          grew = bind(functionOf(n), n.left.text) || grew;
        ts.forEachChild(n, collect);
      };
      collect(sf);
      if (!grew) break;
    }

    /** The nearest enclosing named function, so a finding names a site. */
    const enclosing = (n: ts.Node): string => {
      for (let p: ts.Node | undefined = n; p !== undefined; p = p.parent) {
        if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
        if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
      }
      return "<file scope>";
    };

    const walk = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "isCallExpression"
      ) {
        const arg = n.arguments[0];
        if (
          arg !== undefined &&
          (isCalleeRead(arg) || (ts.isIdentifier(arg) && visible(arg, arg.text)))
        ) {
          out.push({
            fn: enclosing(n),
            line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
            text: n.getText(sf),
          });
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
  }
  return out;
}

const found = chainPeeks([SCANNER]);

describe("the callee chain is walked in exactly one place", () => {
  // The detector must be able to FIND something, or "no findings" means "the
  // walker is broken" and reads identically to "the file is clean". The
  // authority is the live specimen: it walks the chain by construction, so it
  // MUST appear in the raw findings before the exemption removes it.
  premise(
    "the detector finds the authority itself",
    found.filter((p) => p.fn === AUTHORITY).length,
    0,
  );
  premiseHolds(
    "the authority's detection is by ASSIGNMENT alias, the harder of the two spellings",
    found.some((p) => p.fn === AUTHORITY),
  );

  it("no function other than the authority walks the callee chain", () => {
    const rogue = found.filter((p) => p.fn !== AUTHORITY);
    expect(rogue.map((p) => `${p.fn} (premiseScan.ts:${p.line}): ${p.text}`)).toEqual([]);
  });
});
