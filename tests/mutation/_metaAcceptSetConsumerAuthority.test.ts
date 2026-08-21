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
// ONE name, because after diff-review r2 there is genuinely one decider.
// `calleeChain` used to read a root name itself and now delegates entirely, so
// listing it would be an exemption for something the detector no longer finds -
// an exemption that cannot fire is indistinguishable from a detector that cannot
// see, which is the property this file exists to keep.
const NAME_AUTHORITIES = new Set(["calleeName"]);

type Finding = { fn: string; line: number; text: string; kind: "text-read" };

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

  // EXTRACTION, NOT USE - and this replaced two shape detectors rather than
  // joining them. The first version matched what was DONE with a name (`===`,
  // `.has`, `.test`), which is an open set of spellings: probing found it blind
  // to a `switch` over the callee text, an inline regex, an array `.includes`,
  // and an object lookup, one new corner per probe. Four more detectors would
  // have made this a bigger target for the fifth.
  //
  // Every one of those spellings must first READ the name, and that is ONE
  // thing. A blanket "no `.text` reads" is not available - the scanner has ~70
  // of them and only a handful are callee names, the rest being module
  // specifiers, binding names and export clauses - so CALLEE-NESS is the
  // discriminator, not the read.
  //
  // Aliases are followed because the natural way to write it splits the
  // extraction across two bindings: `const callee = c.expression;` then
  // `(callee as ts.Identifier).text`. Unfollowed, that launders straight past.
  const isCalleeRead = (n: ts.Node): boolean =>
    ts.isPropertyAccessExpression(n) && n.name.text === "expression";
  const peel = (n: ts.Expression): ts.Expression => {
    for (;;) {
      if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) {
        n = n.expression;
        continue;
      }
      return n;
    }
  };

  /** A function WITH a body and parameters. `ts.isFunctionLike` narrows to
   *  `SignatureDeclaration`, which has neither, and `isFunctionLikeDeclaration`
   *  is not exported - so the guard is spelled out rather than guessed at. */
  const isFnWithBody = (
    n: ts.Node,
  ): n is
    | ts.FunctionDeclaration
    | ts.FunctionExpression
    | ts.ArrowFunction
    | ts.MethodDeclaration =>
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n);

  type Frame = { fn: string; aliases: Set<string> };
  const walk = (n: ts.Node, f: Frame): void => {
    let frame = f;
    const named = nameOf(n);
    if (named !== null) frame = { fn: named, aliases: new Set(f.aliases) };
    else if (isFnWithBody(n)) frame = { fn: f.fn, aliases: new Set(f.aliases) };

    // Bind this function's callee aliases before its body is scanned for reads.
    if (isFnWithBody(n) && n.body !== undefined) {
      for (const param of n.parameters) {
        // A parameter declared as an expression IS a callee at every call site
        // that matters here; seeding it is what makes `calleeName` - the one
        // permitted decider - visible to this check at all.
        if (ts.isIdentifier(param.name) && /^(callee|expr|e)$/.test(param.name.text))
          frame.aliases.add(param.name.text);
      }
      const bind = (b: ts.Node): void => {
        if (ts.isVariableDeclaration(b) && ts.isIdentifier(b.name) && b.initializer !== undefined) {
          const init = peel(b.initializer);
          if (isCalleeRead(init) || (ts.isIdentifier(init) && frame.aliases.has(init.text)))
            frame.aliases.add(b.name.text);
        }
        if (!isFnWithBody(b) || b === n) ts.forEachChild(b, bind);
      };
      bind(n.body);
    }

    if (ts.isPropertyAccessExpression(n) && n.name.text === "text") {
      const obj = peel(n.expression);
      const direct = isCalleeRead(obj);
      const viaAlias = ts.isIdentifier(obj) && frame.aliases.has(obj.text);
      const viaMember =
        ts.isPropertyAccessExpression(obj) &&
        obj.name.text === "name" &&
        (isCalleeRead(peel(obj.expression)) ||
          (ts.isIdentifier(peel(obj.expression)) &&
            frame.aliases.has((peel(obj.expression) as ts.Identifier).text)));
      if (direct || viaAlias || viaMember) {
        found.push({ fn: frame.fn, line: at(n), text: n.getText(sf), kind: "text-read" });
      }
    }
    ts.forEachChild(n, (c) => walk(c, frame));
  };
  walk(sf, { fn: "<file scope>", aliases: new Set() });
  return { found, members: [...members].sort() };
}

const { found, members } = consumers(SCANNER);

describe("a callee name is extracted in exactly one place", () => {
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
  // The detector is proved on SYNTHETIC consumers, not on a live defect.
  // Liveness that rests on a real defect evaporates the moment the file is
  // clean, which is exactly when this check matters most.
  //
  // Five spellings, deliberately: the first version of this check modelled what
  // was DONE with a name and was blind to every one of them. They are here so a
  // future narrowing cannot quietly lose them again.
  it("fires on every extraction spelling, however the name is then used", () => {
    const fixture = join(tmpdir(), `acceptset-control-${process.pid}.ts`);
    const bodies: Record<string, string> = {
      rSwitch: `switch ((c.expression as ts.Identifier).text) { case "describe": return true; default: return false; }`,
      rRegex: `return /^(describe|suite)$/.test((c.expression as ts.Identifier).text);`,
      rIncludes: `return ["describe"].includes((c.expression as ts.Identifier).text);`,
      rLookup: `return M[(c.expression as ts.Identifier).text] === true;`,
      // The launder: the extraction split across two bindings, which is the
      // natural way to write it rather than an evasion.
      rLaunder: `const callee = c.expression; const name = (callee as ts.Identifier).text; return name === "describe";`,
    };
    writeFileSync(
      fixture,
      [
        "import ts from 'typescript';",
        "const M: Record<string, boolean> = { describe: true };",
        ...Object.entries(bodies).map(
          ([n, b]) => `function ${n}(c: ts.CallExpression): boolean { ${b} }`,
        ),
        // A comparison against an ALREADY-RESOLVED name is legitimate and must
        // NOT fire: the authority decided that name, and re-checking it is what
        // every honest consumer does.
        `function ok(root: string | null): boolean { return root !== "describe"; }`,
        `void M; void ok; ${Object.keys(bodies)
          .map((n) => `void ${n};`)
          .join(" ")}`,
        "",
      ].join("\n"),
    );
    try {
      const control = consumers(fixture).found;
      expect([...new Set(control.map((f) => f.fn))].sort()).toEqual(Object.keys(bodies).sort());
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
