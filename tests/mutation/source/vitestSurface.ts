import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import ts from "typescript";

/**
 * Vitest's own declaration, read as the authority for premiseScan's three
 * accept-sets (spec §3.2).
 *
 * The scanner does NOT call any of this at scan time (spec §5 L1) — it carries
 * committed literals, and `tests/mutation/_metaVitestSurfaceDerivation.test.ts`
 * is what compares them against what these functions derive. A scanner that
 * resolved `node_modules` per run would make every classification depend on an
 * install rather than on the source it is reading.
 *
 * The DECLARATION rather than runtime properties, because a runtime read cannot
 * tell a modifier from a BUILDER: `extend`, `override`, `scoped` and `fn` are
 * callable own properties of `test` that return a new API instead of
 * registering anything, and admitting them makes `test.extend({})` peel to
 * `test` and invent a registration out of a builder call (spec review r1
 * finding 1). They are not members of `ChainableTestAPI`, so a derivation that
 * reads the declaration never sees them — excluded BY CONSTRUCTION rather than
 * by an exception list (AC-7).
 *
 * Read with the TypeScript AST rather than with regexes, decided by running it:
 * a regex prototype's `interface Hooks` selector matched nothing on its very
 * first run. When a recognizer needs a new grammar corner, the repair direction
 * is the total reader, not a smarter pattern.
 */

/** Every selector's floor, so a selector that stops matching names ITSELF.
 *
 *  Per SELECTOR, never per module (AC-8): a module-level "did we derive
 *  anything" check passes as long as one selector still matches, which is
 *  exactly the vacuity this exists to prevent. */
function floor(label: string, members: string[]): string[] {
  if (members.length === 0) throw new Error(`derive: ${label} yielded no members`);
  return members;
}

/**
 * `@vitest/runner`'s dist directory, resolved AS VITEST WOULD.
 *
 * Two steps, because the one-step form does not work under plain node:
 * `require.resolve("@vitest/runner")` from the repo root FAILS — the runner is
 * a TRANSITIVE dependency and only `vitest` is direct. It happens to work under
 * `tsx`, which is exactly how a one-step version would have shipped and then
 * broken elsewhere.
 */
function runnerDist(root: string): string {
  const rootRequire = createRequire(join(root, "package.json"));
  const vitestRequire = createRequire(rootRequire.resolve("vitest" + "/package.json"));
  return dirname(vitestRequire.resolve("@vitest/runner"));
}

type Declarations = {
  aliases: Map<string, ts.TypeAliasDeclaration>;
  interfaces: Map<string, ts.InterfaceDeclaration>;
  consts: { name: string; type: ts.TypeNode }[];
};

/**
 * Every `*.d.ts` in the resolved dist, parsed.
 *
 * The declaration file's own name carries a CONTENT HASH inside a VERSIONED
 * store directory (today `tasks.d-Bh0IjN67.d.ts` under `@vitest+runner@4.1.5`).
 * Both segments move on an upgrade, so NEITHER may be written down — the whole
 * directory is read instead.
 */
export function readDeclarations(root: string = process.cwd()): Declarations {
  const dist = runnerDist(root);
  const files = readdirSync(dist).filter((f) => f.endsWith(".d.ts"));
  const out: Declarations = { aliases: new Map(), interfaces: new Map(), consts: [] };
  floor("the runner dist's .d.ts files", files);
  for (const file of files) {
    const path = join(dist, file);
    const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const st of sf.statements) {
      if (ts.isTypeAliasDeclaration(st)) out.aliases.set(st.name.text, st);
      else if (ts.isInterfaceDeclaration(st)) out.interfaces.set(st.name.text, st);
      else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.type)
            out.consts.push({ name: d.name.text, type: d.type });
        }
      }
    }
  }
  return out;
}

/** The property names a type element declares, ignoring anything unnamed. */
function propertyNames(members: readonly ts.TypeElement[]): string[] {
  return members
    .filter((m): m is ts.PropertySignature => ts.isPropertySignature(m))
    .map((m) => (ts.isIdentifier(m.name) ? m.name.text : null))
    .filter((n): n is string => n !== null);
}

/**
 * `ChainableFunction<"a" | "b", F, { each: …; for: … }>` — the chain keys and
 * the curried members, both named by the declaration.
 *
 * BOTH chainable declarations are read by the caller, not one: `fails` is
 * declared on `ChainableTestAPI` and not on `ChainableSuiteAPI`, so a
 * derivation reading only the suite side leaves `test.fails("must fail", fn)`
 * silently uncensused (spec review r2 finding 1).
 */
function chainableMembers(
  decls: Declarations,
  typeName: string,
): { chain: string[]; curried: string[] } {
  const alias = decls.aliases.get(typeName);
  const args = alias && ts.isTypeReferenceNode(alias.type) ? alias.type.typeArguments : undefined;
  const chain: string[] = [];
  const keys = args?.[0];
  if (keys !== undefined) {
    const literals = ts.isUnionTypeNode(keys) ? keys.types : [keys];
    for (const t of literals) {
      if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) chain.push(t.literal.text);
    }
  }
  const curriedArg = args?.[2];
  const curried =
    curriedArg !== undefined && ts.isTypeLiteralNode(curriedArg)
      ? propertyNames(curriedArg.members)
      : [];
  floor(typeName, [...chain, ...curried]);
  return { chain, curried };
}

/** The members of one intersection arm: an inline literal directly, a named
 *  reference by looking its declaration up. */
function armMembers(decls: Declarations, arm: ts.TypeNode): readonly ts.TypeElement[] {
  if (ts.isTypeLiteralNode(arm)) return arm.members;
  if (ts.isTypeReferenceNode(arm) && ts.isIdentifier(arm.typeName)) {
    const name = arm.typeName.text;
    const iface = decls.interfaces.get(name);
    if (iface) return iface.members;
    const alias = decls.aliases.get(name);
    if (alias && ts.isTypeLiteralNode(alias.type)) return alias.type.members;
  }
  return [];
}

/** Every arm of `A & B & { … }`, or the type itself when it is not an intersection. */
function intersectionMembers(decls: Declarations, typeName: string): ts.TypeElement[] {
  const alias = decls.aliases.get(typeName);
  if (!alias) return [];
  const arms = ts.isIntersectionTypeNode(alias.type) ? alias.type.types : [alias.type];
  return arms.flatMap((arm) => [...armMembers(decls, arm)]);
}

/** The parameter name that identifies a conditional modifier in the declaration. */
const CONDITION_PARAMETER = "condition";

/**
 * `skipIf` / `runIf` — the members that take a CONDITION, read through the
 * whole intersection INCLUDING its named arms.
 *
 * `TestAPI = ChainableTestAPI & ExtendedAPI & Hooks & { … }` and `skipIf` is
 * declared on `interface ExtendedAPI`, not inline. A selector reading only
 * `SuiteAPI`'s inline object gets the right ANSWER today, because the two
 * coincide — and would not RED if `ExtendedAPI` gained a member, which
 * falsifies AC-2's upgrade-red claim while every equality check still passes
 * (plan review r4 finding 3).
 */
function conditionalMembersFor(side: "suite" | "test", decls: Declarations): string[] {
  const typeName = side === "suite" ? "SuiteAPI" : "TestAPI";
  const out = new Set<string>();
  for (const member of intersectionMembers(decls, typeName)) {
    if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name)) continue;
    const type = member.type;
    if (type === undefined || !ts.isFunctionTypeNode(type)) continue;
    const takesCondition = type.parameters.some(
      (p) => ts.isIdentifier(p.name) && p.name.text === CONDITION_PARAMETER,
    );
    if (takesCondition) out.add(member.name.text);
  }
  return floor(`${typeName} conditional members`, [...out]);
}

/** The modifiers ONE side of the API declares.
 *
 *  Per side, because the declaration draws a line the union erased:
 *  `ChainableSuiteAPI` names `shuffle` and `ChainableTestAPI` names `fails`, and
 *  neither names the other's. Unioning them and applying the result to every
 *  registrar accepted `test.shuffle(…)` and `suite.fails(…)`, neither of which
 *  exists - spurious registrations invented by the derivation itself
 *  (diff review r2, F3).
 *
 *  A DERIVATION MUST PRESERVE THE DISTINCTIONS ITS SOURCE OF TRUTH MAKES.
 *  Deriving from the declaration was the right call; flattening what the
 *  declaration separates gave back the drift the derivation existed to remove,
 *  in the FREE direction rather than the strict one.
 *
 *  CONDITIONAL MEMBERS ARE READ PER SIDE TOO, and this is where the repair above
 *  was incomplete. Splitting the CHAINABLE members per side while leaving
 *  `conditionalMembers` looping over `SuiteAPI` AND `TestAPI` into one set left
 *  the same distinction-loss alive one layer down: an in-memory declaration with
 *  a suite-only `suiteIf(condition)` and a test-only `testIf(condition)`
 *  authorized BOTH on BOTH sides, and every equality test agreed, because the
 *  tests derive from the same flattened source (diff round 1 at base
 *  e5d1d723d69c, F4).
 *
 *  The justification for the flattening was "declared once for both sides and so
 *  belong to each" -- TRUE TODAY, and a snapshot fact rather than a checkable
 *  condition. Nothing re-derived it, so an ordinary Vitest upgrade adding a
 *  side-specific conditional would have silently falsified it while the
 *  derivation went on reporting a union. Reading each side's own declaration
 *  makes the claim structural: if the two sides do coincide, they coincide
 *  because the declaration says so, freshly, every run.
 *
 *  This is the same-PR default of the class-sweep rule failing at one remove. I
 *  swept the modifier SETS and stopped at the function that produced them,
 *  leaving a peer instance of one shape in a neighbouring function in the same
 *  file. "Same defect, different function" is exactly the case that default
 *  covers, and no deferral exception applies to it. */
export function deriveModifiersFor(
  side: "suite" | "test",
  decls: Declarations = readDeclarations(),
): string[] {
  const api = chainableMembers(decls, side === "suite" ? "ChainableSuiteAPI" : "ChainableTestAPI");
  return [...new Set([...api.chain, ...api.curried, ...conditionalMembersFor(side, decls)])].sort();
}

/** premiseScan's `MODIFIERS`: the union, for the sites that legitimately need
 *  "is this token a modifier at all" without knowing the root - the chain walk
 *  peels members BEFORE it learns which registrar it roots at. Sites that DO
 *  know the root must consult the per-side set instead. */
export function deriveModifiers(decls: Declarations = readDeclarations()): string[] {
  return [
    ...new Set([...deriveModifiersFor("suite", decls), ...deriveModifiersFor("test", decls)]),
  ].sort();
}

/**
 * premiseScan's `CURRIED_MODIFIERS`: the members whose CALL returns the
 * registration function rather than registering -- `each` and `for`, the third
 * type argument of both chainable declarations.
 *
 * A proper subset of the modifier set, and the scanner needs the distinction:
 * the ASSOCIATED premise (spec §3.3.2.2) is about the argument a CURRIED call
 * consumes. Reading "the immediate callee if it is a call" instead treats
 * `test.skipIf(c)("live", fn)`'s skip CONDITION as a producer, and a premise
 * about that condition then certifies a registration that has no producer at
 * all.
 */
export function deriveCurriedModifiers(decls: Declarations = readDeclarations()): string[] {
  const out = [
    ...new Set([
      ...chainableMembers(decls, "ChainableSuiteAPI").curried,
      ...chainableMembers(decls, "ChainableTestAPI").curried,
    ]),
  ];
  return floor("curried members of the chainable declarations", out).sort();
}

/** premiseScan's `HOOK_REGISTRARS`: the members of `interface Hooks`.
 *
 *  Derived rather than filtered from a hand-written candidate list, because a
 *  filter can only SUBTRACT — it can never add the member nobody thought of,
 *  which here is `aroundAll` / `aroundEach`. */
const HOOKS_INTERFACE = "Hooks";
export function deriveHooks(decls: Declarations = readDeclarations()): string[] {
  const iface = decls.interfaces.get(HOOKS_INTERFACE);
  return floor(HOOKS_INTERFACE, iface ? propertyNames(iface.members) : []).sort();
}

/** premiseScan's `REGISTRARS`: every constant the runner declares as a
 *  `SuiteAPI` or a `TestAPI`.
 *
 *  `bench` is not among them. Spec §3.1's probe listed it as a registrar
 *  because it read runtime exports; the declaration does not, so this excludes
 *  it BY CONSTRUCTION, which a runtime read cannot deliver (AC-7, §5 L3). */
const REGISTRAR_TYPES = ["SuiteAPI", "TestAPI"];

/**
 * The constants declared as ONE of the registrar APIs.
 *
 * The partition is derived rather than hand-written for the same reason the
 * union is: the walk DISPATCHES on which kind a root is, so a registrar the
 * declaration adds on the suite side has to reach the suite branch. A
 * hand-written `{describe, suite}` beside a derived `REGISTRARS` would put the
 * accept-set defect back one level down, where AC-2's upgrade-red cannot see
 * it.
 */
export function deriveRegistrarsOfType(
  api: string,
  decls: Declarations = readDeclarations(),
): string[] {
  const out = decls.consts
    .filter(
      (c) =>
        ts.isTypeReferenceNode(c.type) &&
        ts.isIdentifier(c.type.typeName) &&
        c.type.typeName.text === api,
    )
    .map((c) => c.name);
  return floor(`constants declared as ${api}`, [...new Set(out)]).sort();
}

export function deriveRegistrars(decls: Declarations = readDeclarations()): string[] {
  return [...new Set(REGISTRAR_TYPES.flatMap((api) => deriveRegistrarsOfType(api, decls)))].sort();
}
