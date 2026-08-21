import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";

/**
 * A registrar or hook NAME is decided in exactly two places — enforced by a
 * DERIVATION over the file, not by a list.
 *
 * This arc widened the accept-sets: `REGISTRARS` gained `suite`,
 * `HOOK_REGISTRARS` gained `aroundAll`/`aroundEach`. Widening a set only helps
 * the consumers that CONSULT it. A consumer that decides a name some other way
 * — comparing against a string literal, or narrowing a callee with
 * `ts.isIdentifier` and reading `.text` inline — keeps the OLD, narrower answer
 * while the set says otherwise, and it does so silently.
 *
 * Both directions of that are FALSE CERTIFICATION, the class the consequence
 * bound forbids outright, and both were live on this branch when the check was
 * written:
 *
 *   - `registrarRoot(call.expression) !== "describe"` returned early for
 *     `suite("S", factory)`, so a non-inline factory whose hook reads
 *     `process.env` reported `environment-free`.
 *   - `ts.isIdentifier(n.expression) && HOOK_REGISTRARS.test(n.expression.text)`
 *     never saw `test.beforeEach(…)`, so a sibling test reported
 *     `environment-free`.
 *
 * **A LIST OF REPAIRED CONSUMERS CANNOT HOLD THIS**, and the branch proved it
 * the expensive way. `BL-ACCEPTSET-CONSUMER-COVERAGE` was filed and then
 * deferred with the words "this arc repaired the three known consumers of one
 * set, which is the instance, not the class" — and adversarial review then found
 * consumers four and five. Deferring the detector did not defer the defects; it
 * only deferred finding them. So the check walks the file and reports whatever
 * it finds, and a consumer written tomorrow reds by default rather than being
 * silently exempt.
 *
 * The permitted deciders are named here and NOWHERE ELSE, and each is proved
 * LIVE rather than vacuous: an authority must be DETECTED before it is excused,
 * or an exemption that has stopped matching is indistinguishable from a detector
 * that has stopped seeing.
 */

const SCANNER = join(__dirname, "source", "premiseScan.ts");

/**
 * The only function permitted to decide a name from a `.text` read against a
 * derived set. `calleeName`/`calleeNamed` are deciders too, but they resolve a
 * name to a STRING and test that, so they are not this shape and correctly do
 * not appear - the check reports inline AST-name decisions, not every consumer.
 */
const NAME_AUTHORITIES = new Set(["calleeChain"]);

type Finding = { fn: string; line: number; text: string; kind: "text-read" | "literal" };

function consumers(file: string): { found: Finding[]; members: string[] } {
  const program = ts.createProgram([file], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
    strict: true,
  });
  const sf = program.getSourceFile(file);
  if (sf === undefined) throw new Error(`consumers: ${file} is not in the program`);

  /**
   * The set members, READ FROM THE SOURCE rather than restated here. A literal
   * list would be a second copy of the very thing this file exists to keep
   * singular, and would go stale in exactly the direction that makes the check
   * pass while the scanner is wrong.
   */
  const members = new Set<string>();
  const setDecls = new Set<ts.Node>();
  const collectMembers = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      /^(SUITE_REGISTRARS|TEST_REGISTRARS|REGISTRARS)$/.test(n.name.text) &&
      n.initializer
    ) {
      setDecls.add(n);
      const lit = (m: ts.Node): void => {
        if (ts.isStringLiteral(m)) members.add(m.text);
        ts.forEachChild(m, lit);
      };
      lit(n.initializer);
    }
    ts.forEachChild(n, collectMembers);
  };
  collectMembers(sf);

  // The enclosing function is threaded DOWN the descent rather than read back up
  // through `.parent`. Parent pointers are not populated on a program source
  // file unless something binds it first - the sibling authority check only has
  // them because it calls `getTypeChecker()`, and depending on that side effect
  // would break here the moment this check stopped needing a checker. Measured:
  // every finding resolved to `<file scope>` and the authority premise failed,
  // which is the premise doing its job.
  const at = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const nameOf = (n: ts.Node): string | null => {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (
      (ts.isFunctionExpression(n) || ts.isArrowFunction(n)) &&
      n.parent !== undefined &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name)
    )
      return n.parent.name.text;
    return null;
  };

  const found: Finding[] = [];
  const inSetDecl = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n; p !== undefined; p = p.parent) {
      if (setDecls.has(p)) return true;
    }
    return false;
  };

  const walk = (n: ts.Node, fn: string): void => {
    const here = nameOf(n);
    if (here !== null) fn = here;
    // SHAPE 1 — a name-set membership test whose argument is a SYNTACTIC `.text`
    // read. That is deciding a name from the AST inline. A consumer that passes
    // an already-resolved root string (`SUITE_REGISTRARS.has(root)`) is NOT this
    // shape and is not reported: the authority already decided that name.
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      (n.expression.name.text === "test" || n.expression.name.text === "has") &&
      // The RECEIVER must be a derived name set - a module-level SCREAMING_CASE
      // constant - or `names`, which is how `calleeNamed` is parameterised BY
      // those sets. Matching any `.test` receiver flagged `/^[a-z]/.test(id.text)`,
      // a lowercase-initial check with nothing to do with registrar names: a
      // false advisory on the live corpus, which is the one thing a detector on
      // this branch may not do.
      ts.isIdentifier(n.expression.expression) &&
      (/^[A-Z][A-Z0-9_]*$/.test(n.expression.expression.text) ||
        n.expression.expression.text === "names")
    ) {
      const arg = n.arguments[0];
      if (arg !== undefined && ts.isPropertyAccessExpression(arg) && arg.name.text === "text") {
        found.push({ fn, line: at(n), text: n.getText(sf), kind: "text-read" });
      }
    }

    // SHAPE 2 — a comparison against a string literal that IS a member of the
    // derived sets. The set says which names count; a literal here says
    // something narrower and does not move when the set does.
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
    ) {
      for (const side of [n.left, n.right]) {
        if (ts.isStringLiteral(side) && members.has(side.text) && !inSetDecl(side)) {
          found.push({ fn, line: at(n), text: n.getText(sf), kind: "literal" });
        }
      }
    }
    ts.forEachChild(n, (c) => walk(c, fn));
  };
  walk(sf, "<file scope>");
  return { found, members: [...members].sort() };
}

const { found, members } = consumers(SCANNER);

describe("a registrar or hook name is decided in exactly two places", () => {
  // The members must come from the source, or shape 2 ranges over nothing and
  // reports a clean file for the same reason an empty list does.
  premise("the set members were read from the scanner", members.length, 0);
  premiseHolds(
    "the derived sets carry the names this arc added",
    members.includes("suite") && members.includes("describe"),
  );

  // The authority must be DETECTED before it is excused. An exemption that
  // cannot fire is indistinguishable from a detector that cannot see, and this
  // repo has paid for that distinction before.
  for (const authority of NAME_AUTHORITIES) {
    premiseHolds(
      `the detector finds the authority ${authority} itself`,
      found.some((f) => f.fn === authority),
    );
  }

  // ...and BOTH shapes are proved to fire, on a synthetic consumer rather than
  // on a live defect. Liveness that depends on a real defect existing evaporates
  // the moment the file is clean, which is exactly when the check matters most:
  // it would then pass for the same reason a broken walker passes.
  it("both shapes fire on a synthetic consumer", () => {
    const fixture = join(tmpdir(), `acceptset-control-${process.pid}.ts`);
    writeFileSync(
      fixture,
      [
        "import ts from 'typescript';",
        "const REGISTRARS = new Set(['describe', 'suite']);",
        "const HOOKS = /^(beforeEach)$/;",
        "function rogueTextRead(n: ts.CallExpression): boolean {",
        "  return HOOKS.test((n.expression as ts.Identifier).text);",
        "}",
        "function rogueLiteral(root: string | null): boolean {",
        "  return root !== 'describe';",
        "}",
        "void REGISTRARS; void rogueTextRead; void rogueLiteral;",
        "",
      ].join("\n"),
    );
    try {
      const control = consumers(fixture).found;
      expect(control.map((f) => `${f.fn}:${f.kind}`).sort()).toEqual([
        "rogueLiteral:literal",
        "rogueTextRead:text-read",
      ]);
    } finally {
      rmSync(fixture, { force: true });
    }
  });

  it("no consumer outside the authorities decides a registrar or hook name", () => {
    const rogue = found.filter((f) => !NAME_AUTHORITIES.has(f.fn));
    expect(rogue.map((f) => `${f.fn} (premiseScan.ts:${f.line}) [${f.kind}]: ${f.text}`)).toEqual(
      [],
    );
  });
});
