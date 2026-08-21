import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

import {
  deriveCurriedModifiers,
  deriveHooks,
  deriveModifiers,
  deriveModifiersFor,
  deriveRegistrars,
  deriveRegistrarsOfType,
  readDeclarations,
} from "./source/vitestSurface";

/**
 * The three accept-sets premiseScan carries are DERIVED, and this is where that
 * claim is checked (AC-2).
 *
 * The scanner keeps committed literals rather than calling the extractor —
 * spec §5 L1: a classifier that resolved `node_modules` per run would make
 * every verdict depend on an install. The literals are only as good as
 * something that reds when they drift, and a Vitest upgrade that adds a
 * modifier, a hook or a registrar reds HERE.
 *
 * A `_meta*` sibling rather than a case inside `premiseScan.test.ts`, matching
 * `tests/mutation/_metaClaimSweepSuiteDerivation.test.ts`. Deliberately NOT in
 * premiseScan's `suitePaths`: it decides nothing about the scanner's behaviour,
 * so enrolling it would buy wall clock at no score.
 */

const SCANNER = join(__dirname, "source", "premiseScan.ts");

/** A `new Set([...])` initializer's string elements, read from the scanner's
 *  own source — nothing is exported for this, because an export authored so a
 *  fixture could import it makes the fixture's red an unresolved import. */
function committedSet(name: string): string[] {
  const sf = ts.createSourceFile(
    SCANNER,
    readFileSync(SCANNER, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let found: string[] | null = null;
  const walk = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isNewExpression(node.initializer)
    ) {
      const arg = node.initializer.arguments?.[0];
      if (arg && ts.isArrayLiteralExpression(arg)) {
        // A non-literal element would be DROPPED by a filter, and the equality
        // below cannot see that: it would compare the derived set against a
        // truncated list and the missing element would read as a derivation
        // change rather than as an unreadable literal.
        const literals = arg.elements.filter(ts.isStringLiteralLike);
        if (literals.length !== arg.elements.length)
          throw new Error(
            `${name} holds ${arg.elements.length - literals.length} non-literal element(s); ` +
              "the committed set cannot be read",
          );
        found = literals.map((e) => e.text);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  if (found === null) throw new Error(`${name} not found in premiseScan.ts — the pin broke`);
  return found;
}

/** The alternation of a `/^(a|b|c)$/` literal in the scanner's own source. */
function committedAlternation(name: string): string[] {
  const sf = ts.createSourceFile(
    SCANNER,
    readFileSync(SCANNER, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let found: string[] | null = null;
  const walk = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isRegularExpressionLiteral(node.initializer)
    ) {
      const alternation = /^\/\^\(([^)]+)\)\$\/$/.exec(node.initializer.text);
      const group = alternation?.[1];
      if (group !== undefined) found = group.split("|");
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  if (found === null) throw new Error(`${name} not found in premiseScan.ts — the pin broke`);
  return found;
}

const declarations = readDeclarations();

describe("AC-2 — every committed accept-set equals what Vitest's declaration says", () => {
  // Each derived set is non-empty BEFORE any equality runs. An equality between
  // two empty arrays passes, and that is exactly the shape a selector which
  // stopped matching produces.
  premise("the modifier set derives", deriveModifiers(declarations).length, 0);
  premise("the hook set derives", deriveHooks(declarations).length, 0);
  premise("the curried set derives", deriveCurriedModifiers(declarations).length, 0);
  premise("the registrar set derives", deriveRegistrars(declarations).length, 0);
  premise("the suite half derives", deriveRegistrarsOfType("SuiteAPI", declarations).length, 0);
  premise("the test half derives", deriveRegistrarsOfType("TestAPI", declarations).length, 0);

  it("MODIFIERS equals the declared chainable, curried and conditional members", () => {
    expect([...committedSet("MODIFIERS")].sort()).toEqual(deriveModifiers(declarations));
  });

  // The PARTITION, pinned. The union alone cannot catch a side losing a member
  // to the other, which is exactly what happened: `shuffle` is suite-only and
  // `fails` is test-only, and a derivation that unioned them accepted
  // `test.shuffle` and `suite.fails`. Pinning only the union would have stayed
  // green through that (diff r2, F3).
  it("SUITE_MODIFIERS equals what the suite side declares", () => {
    expect([...committedSet("SUITE_MODIFIERS")].sort()).toEqual(
      deriveModifiersFor("suite", declarations),
    );
  });

  it("TEST_MODIFIERS equals what the test side declares", () => {
    expect([...committedSet("TEST_MODIFIERS")].sort()).toEqual(
      deriveModifiersFor("test", declarations),
    );
  });

  // The two sides must actually DIFFER, or the partition is a distinction the
  // code draws and the declaration does not - and this pin would be theatre.
  it("the two sides are not the same set", () => {
    const suite = new Set(deriveModifiersFor("suite", declarations));
    const test = new Set(deriveModifiersFor("test", declarations));
    const onlySuite = [...suite].filter((m) => !test.has(m));
    const onlyTest = [...test].filter((m) => !suite.has(m));
    expect({ onlySuite, onlyTest }).toEqual({ onlySuite: ["shuffle"], onlyTest: ["fails"] });
  });

  it("CURRIED_MODIFIERS equals the declared curried members", () => {
    expect([...committedSet("CURRIED_MODIFIERS")].sort()).toEqual(
      deriveCurriedModifiers(declarations),
    );
  });

  it("CURRIED_MODIFIERS is a PROPER subset of MODIFIERS", () => {
    // The direction, which the two equalities cannot state. A curried modifier
    // that is not a modifier would never be reached by the peel, so the
    // associated-premise rule would look for a producer on a chain the scanner
    // resolved to nothing; and if the two sets were EQUAL, "curried" would have
    // stopped meaning anything and the skip condition would be a producer again.
    const curried = deriveCurriedModifiers(declarations);
    const modifiers = deriveModifiers(declarations);
    premise("there are curried modifiers to check", curried.length, 0);
    for (const m of curried) expect(modifiers).toContain(m);
    expect(modifiers.length).toBeGreaterThan(curried.length);
  });

  it("HOOK_REGISTRARS equals the members of `interface Hooks`", () => {
    expect([...committedAlternation("HOOK_REGISTRARS")].sort()).toEqual(deriveHooks(declarations));
  });

  // The PARTITION is pinned, not only the union. `REGISTRARS` in the scanner is
  // the union of the two committed halves, so a union-only assertion passes
  // while a registrar sits on the wrong side of the dispatch -- recognized and
  // then dropped, which is strictly worse than not recognized.
  it("SUITE_REGISTRARS equals the constants declared as SuiteAPI", () => {
    expect([...committedSet("SUITE_REGISTRARS")].sort()).toEqual(
      deriveRegistrarsOfType("SuiteAPI", declarations),
    );
  });

  it("TEST_REGISTRARS equals the constants declared as TestAPI", () => {
    expect([...committedSet("TEST_REGISTRARS")].sort()).toEqual(
      deriveRegistrarsOfType("TestAPI", declarations),
    );
  });

  it("the two halves together are every registrar the declaration names", () => {
    const committed = [
      ...new Set([...committedSet("SUITE_REGISTRARS"), ...committedSet("TEST_REGISTRARS")]),
    ].sort();
    expect(committed).toEqual(deriveRegistrars(declarations));
  });
});

describe("AC-7 — the builders are excluded by construction, and the direction is named", () => {
  // Not redundant with the equality above. The equality says the two sides
  // agree; this says WHICH way a disagreement would be wrong. A derivation that
  // admitted `extend` would make `test.extend({})` peel to `test` and invent a
  // registration out of a builder call, and the equality alone would report
  // that as "the committed literal is stale".
  const BUILDERS = ["extend", "override", "scoped", "fn"];

  it("no builder is a derived modifier", () => {
    const derived = deriveModifiers(declarations);
    premise("there are derived modifiers to check against", derived.length, 0);
    for (const builder of BUILDERS) expect(derived).not.toContain(builder);
  });

  it("`bench` is not a derived registrar", () => {
    // §5 L3: the runtime exports a `bench` registrar and the DECLARATION does
    // not, which is the whole reason this reads the declaration.
    const derived = deriveRegistrars(declarations);
    premise("there are derived registrars to check against", derived.length, 0);
    expect(derived).not.toContain("bench");
  });
});

describe("the per-side split reaches the CONDITIONAL members too", () => {
  // Diff round 1 at base e5d1d723d69c, F4. `deriveModifiersFor` split the
  // chainable members per side and then unioned `conditionalMembers`, which
  // looped over BOTH `SuiteAPI` and `TestAPI` into one set — so the exact
  // distinction-loss the split exists to close survived one function below it.
  //
  // It could not be caught by any assertion over the LIVE declaration, because
  // Vitest declares `runIf` and `skipIf` on both sides today: the union and the
  // per-side read agree, and will go on agreeing until the day they matter.
  // That is why the justification in the source ("declared once for both sides
  // and so belong to each") was a snapshot fact rather than a checkable
  // condition, and why this fixture supplies the declaration that separates
  // them instead of waiting for an upstream release to do it.
  const SYNTHETIC = `
    type ChainableSuiteAPI = ChainableFunction<"only" | "skip", unknown, { each: unknown }>;
    type ChainableTestAPI = ChainableFunction<"only" | "skip", unknown, { each: unknown }>;
    type SuiteAPI = ChainableSuiteAPI & { suiteIf: (condition: unknown) => void };
    type TestAPI = ChainableTestAPI & { testIf: (condition: unknown) => void };
  `;

  const synthetic = (): Parameters<typeof deriveModifiersFor>[1] => {
    const sf = ts.createSourceFile("synthetic.d.ts", SYNTHETIC, ts.ScriptTarget.Latest, true);
    const aliases = new Map<string, ts.TypeAliasDeclaration>();
    const interfaces = new Map<string, ts.InterfaceDeclaration>();
    const walk = (n: ts.Node): void => {
      if (ts.isTypeAliasDeclaration(n)) aliases.set(n.name.text, n);
      if (ts.isInterfaceDeclaration(n)) interfaces.set(n.name.text, n);
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return { aliases, interfaces, consts: [] };
  };

  it("a side-specific conditional is authorized on THAT SIDE ONLY", () => {
    const decls = synthetic();
    const suite = deriveModifiersFor("suite", decls);
    const test = deriveModifiersFor("test", decls);

    // The premise: a fixture whose two sides do not actually differ makes every
    // assertion below vacuously true, and the whole point is the difference.
    premise(
      "the fixture declares a suite-only conditional",
      suite.filter((m) => m === "suiteIf").length,
      0,
    );
    premise(
      "the fixture declares a test-only conditional",
      test.filter((m) => m === "testIf").length,
      0,
    );

    expect(suite).toContain("suiteIf");
    expect(suite).not.toContain("testIf");
    expect(test).toContain("testIf");
    expect(test).not.toContain("suiteIf");
  });

  it("the union is still the union — the per-side split does not lose members", () => {
    // The twin. Without it, a derivation that returned the EMPTY set per side
    // would satisfy both `not.toContain` assertions above.
    const decls = synthetic();
    const suite = deriveModifiersFor("suite", decls);
    const test = deriveModifiersFor("test", decls);
    expect([...new Set([...suite, ...test])].sort()).toEqual(
      ["each", "only", "skip", "suiteIf", "testIf"].sort(),
    );
  });
});
