import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import ts from "typescript";

/**
 * Classify each test in a suite by whether it can reach environment state
 * (spec §3.3.2, §3.3.2.1, §3.3.2.2).
 *
 * AST-based, never textual, for the reason `operators.ts` gives: comments are
 * not nodes and a digit inside a string is not a NumericLiteral.
 *
 * The rule keys on DECLARATIONS and REFERENCES rather than on a list of
 * syntactic positions, and that is not a stylistic choice — four consecutive
 * review rounds each named a position an enumeration had missed (a cross-module
 * wrapper, a `process.env` global, a two-level call chain, a module-scope
 * initializer). A declaration-reference fixed point covers all of them by
 * construction, including the ones nobody raised.
 *
 * It keys on declarations rather than on MODULES for the opposite reason,
 * probed on this corpus: `scripts/ledger-claims.ts` imports `realGitSurface`
 * from `ledger-git`, which imports `node:child_process`. A module-closure rule
 * therefore classifies every test importing `reportEnvelope` as
 * environment-touching, including the 101-claim fixture that touches no
 * environment at all — turning the premise into a ritual.
 */

/** Closed and declared, in the same spirit as OPERATOR_NAMES. */
export const ENVIRONMENT_SOURCES = {
  /** Any binding imported from these resolves as provenance, alias or not. */
  modules: ["node:child_process", "scripts/lib/ledger-git"] as const,
  /** Globals, which have no import edge to follow. */
  globals: ["process.env"] as const,
};

export type Verdict = "environment-touching" | "environment-free" | "unclassifiable";

export type TestClassification = {
  testName: string;
  line: number;
  verdict: Verdict;
  detail: string;
  hasPremise: boolean;
  exemption: string | null;
};

const REGISTRARS = new Set(["it", "test", "describe"]);
const MODIFIERS = new Set(["each", "for", "skip", "only", "concurrent", "sequential", "todo"]);

/** Parsed by EXTENSION: a `.tsx` suite read as TS turns `<div>x</div>` into a
 *  type assertion, so the classifier would be reasoning about an AST the file
 *  does not have. No enrolled suite is `.tsx` today; nothing stops the next one
 *  from being, and the JSX rules in `isReferenceIdentifier` are only reachable
 *  under this parse. */
const parse = (path: string, text: string): ts.SourceFile =>
  ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ES2022,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/** `it`, `test.each`, `describe.skip.each` … → the root identifier, else null. */
function registrarRoot(callee: ts.Expression): string | null {
  let node: ts.Expression = callee;
  // A registration call may itself be the RESULT of a call: test.each(rows)(...)
  while (ts.isCallExpression(node)) node = node.expression;
  while (ts.isPropertyAccessExpression(node)) {
    if (!MODIFIERS.has(node.name.text)) return null;
    node = node.expression;
  }
  return ts.isIdentifier(node) && REGISTRARS.has(node.text) ? node.text : null;
}

/**
 * EVERY identifier REFERENCE under `node`, in source order, each kept as the
 * identifier node itself so resolution starts from the reference's own scope.
 *
 * Deliberately NOT deduplicated by name. A name-keyed map kept whichever
 * occurrence came first and threw the rest away, so `{ const f = (cache) => cache;
 * return cache; }` was judged against the parameter and the module `cache` it
 * actually reads was never resolved — a silent false negative whose direction
 * flipped when the two references swapped places (whole-diff R1 #1). Dedup
 * happens downstream, keyed by the BINDING a reference resolves to.
 */
const referenceCache = new WeakMap<ts.Node, ts.Identifier[]>();
function referencedIdentifiers(node: ts.Node): ts.Identifier[] {
  const memo = referenceCache.get(node);
  if (memo !== undefined) return memo;
  const out: ts.Identifier[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && isReferenceIdentifier(n)) out.push(n);
    ts.forEachChild(n, walk);
  };
  walk(node);
  referenceCache.set(node, out);
  return out;
}

/**
 * Is this identifier a REFERENCE to a binding, or just a name in a position
 * that happens to hold one?
 *
 * A member name, a property key and a declaration's own name are not
 * references, and reading them as such resolves them against whatever
 * same-named binding is in scope: `pure({ cache: 1 })` inherited the extent of
 * a module `const cache = spawnSync(...)` from the KEY alone. The name-keyed
 * dedup hid this by keeping only one occurrence per name.
 */
function isReferenceIdentifier(id: ts.Identifier): boolean {
  const p = id.parent;
  if (p === undefined) return true;
  // A TYPE position names something at compile time and reaches nothing at
  // runtime, so resolving it against a same-named VALUE binding attributes
  // provenance to a test that never touches it. One ancestor test rather than a
  // list of type syntaxes: `typeof x` queries, annotations, type arguments,
  // heritage clauses and the rest all sit under a type node (R2 #2).
  if (isInTypePosition(id)) return false;
  // A label is its own namespace — `cache: for (…) break cache;` names neither
  // a value nor a type.
  if (ts.isLabeledStatement(p) && p.label === id) return false;
  if ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id) return false;
  // An intrinsic JSX tag is a string in disguise: `<div>` names an element, and
  // only a Capitalized tag is a value reference.
  if (
    (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) &&
    p.tagName === id &&
    /^[a-z]/.test(id.text)
  ) {
    return false;
  }
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  // (A QualifiedName's right-hand identifier needs no rule: every position one
  // can occupy inside a test's extent — a type reference, a `typeof` query — is
  // already a type position, and the mutation gate confirmed no declared
  // operator can distinguish the check from its absence. Deleted rather than
  // carried as an equivalence argument.)
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  // `{ prop: local }` — the KEY names a property, the local name is a binding.
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (ts.isJsxAttribute(p) && p.name === id) return false;
  if (ts.isMetaProperty(p)) return false;
  // A declaration's own name: it BINDS here, it does not read anything.
  if (
    (ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isBindingElement(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isEnumMember(p) ||
      ts.isEnumDeclaration(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isInterfaceDeclaration(p) ||
      ts.isModuleDeclaration(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isImportSpecifier(p) ||
      ts.isImportClause(p) ||
      ts.isNamespaceImport(p) ||
      ts.isTypeParameterDeclaration(p)) &&
    p.name === id
  ) {
    return false;
  }
  return true;
}

/** Is this identifier anywhere inside a TYPE, rather than in a value position? */
function isInTypePosition(id: ts.Identifier): boolean {
  let prev: ts.Node = id;
  let n: ts.Node | undefined = id.parent;
  while (n !== undefined) {
    // `class Derived extends Base` READS `Base` at runtime, and TypeScript
    // answers true to `isTypeNode` for the `ExpressionWithTypeArguments` that
    // holds it — so the base, a generic base, and a mixin call with its
    // arguments were all discarded as types. Only its EXPRESSION half is a
    // value: the type arguments of `extends Base<Config>` are still types, and
    // an INTERFACE's extends clause is types throughout.
    if (
      ts.isExpressionWithTypeArguments(n) &&
      n.expression === prev &&
      n.parent !== undefined &&
      ts.isHeritageClause(n.parent) &&
      n.parent.token === ts.SyntaxKind.ExtendsKeyword &&
      n.parent.parent !== undefined &&
      ts.isClassLike(n.parent.parent)
    ) {
      return false;
    }
    if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) {
      return true;
    }
    // An expression cannot sit inside a type except through these, and both
    // stop the walk: past them we are back in value code.
    if (ts.isExpressionStatement(n) || ts.isBlock(n) || ts.isSourceFile(n)) return false;
    prev = n;
    n = n.parent;
  }
  return false;
}

/** Does any identifier under `node` carry this name? (membership only — no resolution). */
function referencesName(node: ts.Node, name: string): boolean {
  return referencedIdentifiers(node).some((id) => id.text === name);
}

/** A binding environment: the source file, or any node that introduces one. */
type Scope = ts.Node;

/**
 * Every node that introduces a binding environment.
 *
 * Function-like nodes and the source file are the two the extent map was
 * originally keyed by. The rest are here because a binding form that is NOT
 * function-scoped — `let`/`const` in a block, a `for` head, a `catch`
 * parameter, a named function expression's self-binding — otherwise registers
 * one scope too wide and shadows references that sit outside it (whole-diff R1
 * #3). A class expression is a scope for the same reason: its name binds inside
 * its own body and nowhere else.
 */
function isScopeNode(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    isFunctionLike(node) ||
    ts.isClassExpression(node) ||
    ts.isBlock(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isCaseBlock(node) ||
    // A class static block is function-like for `var` as well as for let/const:
    // its `var` does not escape it. Missing here, a static block's `var` hoisted
    // to module scope and merged its extent into an unrelated module binding of
    // the same name (whole-diff R3 #4).
    ts.isClassStaticBlockDeclaration(node)
  );
}

// Both walks are pure over the AST and both run once per identifier REFERENCE
// now that resolution is per-occurrence, which is where the cost went: measured
// over the 29 enrolled suites, an unmemoized scope walk turned a 1.3 s corpus
// pass into 5.5 s and timed the contract's 30 s budget out on CI.
const scopeCache = new WeakMap<ts.Node, Scope | null>();
const functionScopeCache = new WeakMap<ts.Node, Scope | null>();

/** The nearest enclosing scope of `node` — where a block-scoped binding declared at `node` lives. */
function scopeOf(node: ts.Node): Scope | null {
  const memo = scopeCache.get(node);
  if (memo !== undefined) return memo;
  let p: ts.Node | undefined = node.parent;
  let found: Scope | null = null;
  while (p) {
    if (isScopeNode(p)) {
      found = p;
      break;
    }
    p = p.parent;
  }
  scopeCache.set(node, found);
  return found;
}

/** The nearest enclosing FUNCTION scope — where `var` and hoisted names live. */
function functionScopeOf(node: ts.Node): Scope | null {
  const memo = functionScopeCache.get(node);
  if (memo !== undefined) return memo;
  let p: ts.Node | undefined = node.parent;
  let found: Scope | null = null;
  while (p) {
    // A class static block bounds `var` the way a function body does, so the
    // hoist stops here rather than carrying the name out to the module.
    if (ts.isSourceFile(p) || isFunctionLike(p) || ts.isClassStaticBlockDeclaration(p)) {
      found = p;
      break;
    }
    p = p.parent;
  }
  functionScopeCache.set(node, found);
  return found;
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

/** Every name a binding form introduces — identifier, or any nesting of object/array patterns. */
function bindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  return boundNames(name).map(([id]) => id);
}

/**
 * Every name a binding form introduces, PAIRED with the default that runs when
 * the source has nothing for it.
 *
 * A default can be the binding's sole provenance — `const { helper =
 * spawningHelper } = {}` runs the default, always — and attaching only the
 * declaration's right-hand side lost it silently. Nested patterns carry their
 * own defaults at every level, so this walks rather than reading one.
 */
function boundNames(name: ts.BindingName): Array<[ts.Identifier, ts.Expression[]]> {
  if (ts.isIdentifier(name)) return [[name, []]];
  const out: Array<[ts.Identifier, ts.Expression[]]> = [];
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue;
    const inner = boundNames(el.name);
    // A default on a PATTERN element applies to every name inside it, and it
    // does NOT replace the defaults already found within. `own ?? el.initializer`
    // kept only the deepest, so `const { a: { b = 0 } = mk() } = {}` lost `mk()`
    // — the expression that actually runs when the source has no `a` at all
    // (whole-diff R3 #2). Both are reachable, so a name keeps both.
    for (const [id, own] of inner)
      out.push([id, el.initializer === undefined ? own : [...own, el.initializer]]);
  }
  return out;
}

/** `=`, `||=`, `??=`, `+=` — every operator that WRITES its left operand. */
function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

/**
 * The NAMES an assignment writes, paired with any defaults that run with them.
 *
 * The declaration side has `boundNames`; this is its expression-position twin,
 * because a destructuring assignment writes exactly as a destructuring
 * declaration binds. `({ url } = { url: process.env.X })` is live in the corpus
 * (`tests/db/destructiveFileAnalysis.test.ts`), and the write pass matched only
 * a bare `identifier = rhs` statement, so that provenance was dropped in silence
 * (whole-diff R3 #3).
 *
 * A property or element access returns NOTHING, and that is not a gap: `obj.x =
 * v` writes a property, not a binding, so there is no name for the walk to
 * reach it through.
 */
function assignmentTargets(target: ts.Expression): Array<[ts.Identifier, ts.Expression[]]> {
  const t = unwrap(target);
  if (ts.isIdentifier(t)) return [[t, []]];
  const out: Array<[ts.Identifier, ts.Expression[]]> = [];
  if (ts.isObjectLiteralExpression(t)) {
    for (const p of t.properties) {
      if (ts.isShorthandPropertyAssignment(p)) {
        const dflt = p.objectAssignmentInitializer;
        out.push([p.name, dflt ? [dflt] : []]);
      } else if (ts.isPropertyAssignment(p)) out.push(...assignmentTargets(p.initializer));
      else if (ts.isSpreadAssignment(p)) out.push(...assignmentTargets(p.expression));
    }
    return out;
  }
  if (ts.isArrayLiteralExpression(t)) {
    for (const el of t.elements) {
      if (ts.isOmittedExpression(el)) continue;
      out.push(...assignmentTargets(ts.isSpreadElement(el) ? el.expression : el));
    }
    return out;
  }
  // `[a = dflt] = xs` — the element's own default runs when the source has no
  // value for it, AND the name still takes the outer right-hand side when it
  // does. Both edges are needed.
  //
  // This arm was deleted once, on the argument that the write pass walks every
  // node and so records the inner `a = dflt` assignment on its own visit. That
  // is true and insufficient: the inner visit attaches only the DEFAULT, never
  // the outer RHS, so `[value = "d"] = [process.env.X]` silently lost the
  // environment read that `[value] = [process.env.X]` keeps. The probe that
  // "confirmed" the deletion used an empty outer RHS, where both paths agree —
  // it could not have discriminated. Restored, with a fixture whose provenance
  // is in the outer RHS (whole-diff R4 #4).
  if (ts.isBinaryExpression(t) && t.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    for (const [id, defaults] of assignmentTargets(t.left)) out.push([id, [...defaults, t.right]]);
  }
  return out;
}

/** `const x = await import("m")` / `= import("m")` — the two spellings of a dynamic-import binding. */
function isDynamicImportInitializer(init: ts.Expression | undefined): boolean {
  if (init === undefined) return false;
  const expr = ts.isAwaitExpression(init) ? init.expression : init;
  return ts.isCallExpression(expr) && expr.expression.kind === ts.SyntaxKind.ImportKeyword;
}

/**
 * `var` (function-scoped) vs `let`/`const`/`using` (block-scoped).
 *
 * Tested as "not Let and not Const", `using` and `await using` fell through to
 * the `var` arm, hoisted to the whole function, and shadowed reads that sit
 * AFTER their block — losing real provenance, silently (whole-diff R3 #4).
 * Both flags are named rather than inferred from the absence of the other two.
 * (Written `?? 0` at first, defensively. The pinned TypeScript defines both —
 * `Using` 4, `AwaitUsing` 6 on 5.9.3 — so the fallback was unreachable, and the
 * mutation gate reported both as survivors no operator can distinguish from
 * their absence. Deleted rather than carried as an equivalence argument, the
 * same disposition the QualifiedName rule got above.)
 */
function isVarDeclaration(decl: ts.VariableDeclaration): boolean {
  const list = decl.parent;
  if (list === undefined || !ts.isVariableDeclarationList(list)) return false;
  const blockScoped =
    ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using | ts.NodeFlags.AwaitUsing;
  return (list.flags & blockScoped) === 0;
}

/** What an EXPORTED name denotes in its own module. */
type ExportTarget = { kind: "local"; name: string } | { kind: "node"; node: ts.Node };

/**
 * The answer to "what does this module export under this name" (spec §2.2).
 *
 * `reasons` is the return channel for modules the CALLER never sees: a forward
 * hop loads a module inside `resolveExport`, so anything that module reports
 * about itself has no other way out. Task-ordered: `forward` is an internal
 * step, never returned to `reaches`.
 */
/**
 * A node in an export's extent, WITH the module it belongs to.
 *
 * The owner is not decoration: a forwarded node is declared in the module at
 * the END of the chain, so resolving its references against the barrel that
 * re-exported it finds none of its imports and reads a spawning helper as
 * pure. The plan's type sketch wrote a bare `ts.Node[]`, which cannot express
 * that; probed on `export { spawnHelper } from "./h"`, which stayed
 * `environment-free` until the owner travelled with the node.
 */
type ExtentNode = { node: ts.Node; facts: ModuleFacts; path: string };

type ExportResolution =
  | { kind: "extent"; nodes: ExtentNode[]; reasons?: string[] }
  | { kind: "forward"; spec: string; exportName: string }
  | { kind: "data"; reasons?: string[] }
  | { kind: "noSuchExport"; reasons?: string[] }
  | { kind: "unresolvable"; reason: string; reasons?: string[] };

/** A traversal answer and everything it could not resolve on the way. */
type Reach = { verdict: Verdict; reasons: string[] };

/**
 * §2.4's three answers, decided by EXTENSION before any read.
 *
 * `.jsx` is a language extension because it is analyzed today; omitting it
 * would make this repair introduce a silent free. `.json` is the only data
 * extension: this repo EXECUTES MDX (`next.config.ts` pageExtensions,
 * `@mdx-js/rollup`), so purifying `.mdx` would be a silent free, and it falls
 * to the third answer with every other shape a directory included.
 */
const LANGUAGE_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
];
const DATA_EXTENSIONS: readonly string[] = [".json"];

type ModuleFacts = {
  sf: ts.SourceFile;
  /** local name → the module it came from, and the name it has THERE. */
  imports: Map<string, { spec: string; imported: string; namespace?: boolean }>;
  /**
   * scope → (local name → the nodes forming its extent).
   *
   * Keyed by SCOPE, not by name alone. A flat map made unrelated same-named
   * bindings share an extent in both directions: `reportEnvelope`'s parameter
   * `res` inherited a `const res = spawnSync(...)` from inside another function
   * (a false POSITIVE — spec AC-10b), while a helper declared inside `describe`
   * registered no extent at all and its provenance vanished (a false NEGATIVE).
   * Scope keys close both without trading one for the other.
   */
  extents: Map<Scope, Map<string, ts.Node[]>>;
  /**
   * scope → names BOUND there with no extent of their own (parameters).
   *
   * A shadow stops the innermost-out walk: a parameter named `cache` means the
   * enclosing `cache` is not what the reference denotes, so falling through to
   * it would resurrect the collision this design exists to prevent.
   */
  shadows: Map<Scope, Set<string>>;
  /**
   * scope → (local name → the module edge a DYNAMIC import bound there).
   *
   * Separate from `imports` because the scopes differ: a static import binds at
   * module scope, but `const { spawnSync } = await import(...)` binds wherever
   * it is written. One file-global map made the answer depend on which
   * registration came last, in BOTH directions — a pure local hid a real
   * dynamic provenance, and a pure dynamic binding inherited an unrelated
   * static import's edge (whole-diff R2 #1).
   */
  scopedImports: Map<Scope, Map<string, { spec: string; imported: string; namespace?: boolean }>>;
  /**
   * EXPORTED name → what it names here: a module-local binding, or the node the
   * declaration itself contributes (`export default <expr>`, `export default
   * function`, `export default class`).
   *
   * The lookup a cross-module reference needs is "what does this module EXPORT
   * under this name", and `extents` answers a different question — "what is
   * declared here under this name". They coincide only when the two names
   * coincide, which is why every rename and every default resolved to nothing
   * before this map existed (spec §2.1).
   */
  exports: Map<string, ExportTarget>;
  /** EXPORTED name → the module it is forwarded from, and the name it has THERE. */
  forwards: Map<string, { spec: string; sourceName: string }>;
  /** `export * from` specifiers, in SOURCE ORDER — a fan-out, not a name. */
  starExports: string[];
  /**
   * EXPORTED name → why this module's export of it cannot be followed.
   *
   * The recognized-unresolvable EXPORT forms (spec §2.3). Each carries an
   * `export` modifier or clause, so a predicate keyed on the modifier alone
   * resolves them to an EMPTY extent and passes them as pure.
   */
  declinedExports: Map<string, string>;
  /**
   * Reasons this module reports about ITSELF, at module-load position.
   *
   * The walk starts at the `it` call, its hooks and its producers, so nothing
   * in a TOP-LEVEL STATEMENT is ever visited: a clause-less `import "./side"`,
   * a bare `await import(specifier)` statement, an assignment-position
   * `import()`. Each runs at load and sits inside no extent, so it needs a
   * SEED rather than a traversal rule. Merged at both places a module enters a
   * classification - the test file's own by `classifyTests`, and every module
   * the traversal LOADS by `reaches` and `followForward`.
   */
  moduleReports: string[];
  /** Memo for `resolveBinding`, keyed (scope, name) — see there for why that is the identity. */
  resolved: Map<Scope, Map<string, Binding>>;
  /** Memo for `extentIsProvenance`, per node of THIS file. */
  provenance: WeakMap<ts.Node, boolean>;
};

/**
 * What a reference DENOTES: a local binding (with its extent, possibly empty),
 * an import, or nothing.
 *
 * One resolution for both consumers. The import map is file-global, so reading
 * it before the lexical walk made every inner binding that reused an import's
 * name — `function pure(spawnSync)`, a local `const spawnSync` — read as
 * provenance it cannot reach (whole-diff R1 #2). Imports are what a name means
 * only when no enclosing scope binds it.
 */
type Binding =
  | { kind: "local"; scope: Scope; extent: ts.Node[] }
  /** `extent` carries any WRITES to the imported name — `let m = await
   *  import("p"); m = spawnSync(...)` binds once and is assigned twice, so the
   *  module edge is not the whole story. */
  | {
      kind: "import";
      scope: Scope;
      spec: string;
      imported: string;
      namespace?: boolean;
      extent: ts.Node[];
    }
  | { kind: "unbound" };

function resolveBinding(facts: ModuleFacts, name: string, from: ts.Node): Binding {
  // Resolution depends on the reference's SCOPE and the name, never on the
  // reference itself, so one answer per (scope, name) serves every occurrence.
  const start: Scope = scopeOf(from) ?? facts.sf;
  const byName = facts.resolved.get(start);
  const memo = byName?.get(name);
  if (memo !== undefined) return memo;
  const answer = resolveUncached(facts, name, start);
  if (byName === undefined) facts.resolved.set(start, new Map([[name, answer]]));
  else byName.set(name, answer);
  return answer;
}

function resolveUncached(facts: ModuleFacts, name: string, start: Scope): Binding {
  let scope: Scope | null = start;
  while (scope) {
    // A dynamic import binds HERE, so it is found on the same innermost-out
    // walk as any other binding rather than from a file-global map.
    const dynamic = facts.scopedImports.get(scope)?.get(name);
    if (dynamic !== undefined) {
      return {
        kind: "import",
        scope,
        ...dynamic,
        extent: facts.extents.get(scope)?.get(name) ?? [],
      };
    }
    const here = facts.extents.get(scope)?.get(name);
    if (here && here.length > 0) return { kind: "local", scope, extent: here };
    // A shadow is a real answer, not a miss: the name is bound to something
    // with no provenance, so the walk STOPS rather than inheriting an outer
    // binding's extent.
    if (facts.shadows.get(scope)?.has(name)) return { kind: "local", scope, extent: [] };
    scope = scopeOf(scope);
  }
  const imported = facts.imports.get(name);
  if (imported !== undefined) {
    return {
      kind: "import",
      scope: facts.sf,
      ...imported,
      extent: facts.extents.get(facts.sf)?.get(name) ?? [],
    };
  }
  return { kind: "unbound" };
}

/** Identity of the binding a reference resolves to — the dedup key. */
/**
 * The export a namespace reference names, or `null` when it names none.
 *
 * `ns.member` and `ns["member"]` select statically; every other position —
 * `Object.entries(ns)`, `vi.spyOn(ns, name)`, passing `ns` itself — selects
 * nothing this scanner can resolve, and §2.4b reports rather than guesses.
 */
function namespaceMember(reference: ts.Identifier): string | null {
  const p = reference.parent;
  if (p && ts.isPropertyAccessExpression(p) && p.expression === reference) return p.name.text;
  if (
    p &&
    ts.isElementAccessExpression(p) &&
    p.expression === reference &&
    ts.isStringLiteralLike(p.argumentExpression)
  )
    return p.argumentExpression.text;
  return null;
}

function bindingKey(name: string, binding: Binding, member?: string | null): string | null {
  if (binding.kind === "unbound") return null;
  // The scope is part of the identity for imports too: two dynamic imports of
  // one name in different scopes are two different edges to follow. For a
  // NAMESPACE the identity also carries the resolved MEMBER: one binding
  // stands for many exports, and a member-blind key lets the first member
  // visited mark the binding seen and skips every other — a silent free whose
  // direction depends on source order (spec §2.3).
  const suffix = member === undefined ? "" : `#${member ?? "<no-member>"}`;
  return `${name}@${binding.kind}@${binding.scope.kind}:${binding.scope.pos}${suffix}`;
}

/** A module's EXPORTED binding, looked up by the name it carries there. */
/**
 * What `facts` exports under `exportName` (spec §2.2).
 *
 * Consults `exports` FIRST and never `extents` on its own: `extents` answers
 * "what is declared here", and reaching it directly is what let a local
 * declaration stand in for an export of the same name. A name in neither map
 * is `noSuchExport`, which is PURE on a direct request and adds no reason - an
 * import of something a module does not export is a broken program, not an
 * unanalyzable one (spec §2.1).
 *
 * `root`, `active` and `done` are threaded from the outset so the topology is
 * stated once: Task 2 follows forwards INSIDE this function, and a signature
 * widened later would leave the star fan-out without its continuation.
 */
/**
 * `moduleFacts`, memoized per absolute path.
 *
 * Lifted to module scope because `resolveExport` follows forwards INTERNALLY
 * and must load each hop's facts itself; a cache local to `classifyTests` is
 * unreachable from there. Cleared at the start of every `classifyTests` call,
 * so a suite written to a path a previous call also used is re-read.
 */
/**
 * Is this specifier one the repository owns?
 *
 * The split §2.4b rests on: a BARE specifier is node_modules and stays pure
 * under the ratified L-2 whatever position it sits in, while a `./`, `../` or
 * `@/` specifier that does not resolve is a repo edge the scanner cannot
 * follow, and is REPORTED rather than passed as pure.
 */
function isInRepoSpecifier(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/");
}

/**
 * The ONE modelled `import()` shape: a direct local variable-declaration
 * initializer, which `bindPattern` registers as a module edge.
 *
 * Everything else - assignment position, embedded in a larger expression, a
 * bare statement - binds nothing this scanner can follow member-precisely, and
 * §2.4b reports it rather than enumerating accepted spellings. Returns the
 * declaration when the shape IS modelled, so the caller can ask the second
 * question: does the binding stay module-local?
 */
function isAtModuleLoad(node: ts.Node): boolean {
  // POSITION, not occurrence: a construct inside a function body is reachable
  // only by a CALL, so seeding on mere occurrence would mark a file for a
  // helper nothing calls and break AC-1 on the enrolled domain.
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (isFunctionLike(p)) return false;
    if (ts.isSourceFile(p)) return true;
  }
  return false;
}

function modelledDynamicDeclaration(call: ts.CallExpression): ts.VariableDeclaration | null {
  let p: ts.Node = call;
  while (p.parent && (ts.isAwaitExpression(p.parent) || ts.isParenthesizedExpression(p.parent)))
    p = p.parent;
  const parent = p.parent;
  if (parent && ts.isVariableDeclaration(parent) && parent.initializer === p) return parent;
  return null;
}

const factsCache = new Map<string, ModuleFacts | null>();
function factsFor(p: string): ModuleFacts | null {
  if (!factsCache.has(p)) factsCache.set(p, moduleFacts(p));
  return factsCache.get(p) ?? null;
}

/**
 * Follow ONE forward hop, then keep resolving in the target.
 *
 * `active` holds the `(module, exportName)` pairs on the CURRENT path, pushed
 * on entry and popped on completion: re-entering one is a back edge and IS the
 * cycle. The popping is the whole mechanism — by the time a diamond's second
 * arm reaches the shared pair, the first arm has completed and removed it, so
 * a properly popped set handles an ordinary diamond on its own, and a set that
 * is never popped reports one as a cycle. `done` is MEMOIZATION only (§2.5).
 */
function followForward(
  root: string,
  facts: ModuleFacts,
  spec: string,
  exportName: string,
  active: Set<string>,
  done: Map<string, ExportResolution>,
): ExportResolution {
  const target = resolveSpecifier(root, facts.sf.fileName, spec);
  // A BARE specifier is node_modules and stays pure under L-2, through a
  // forward exactly as through a direct import.
  if (target === null) return { kind: "noSuchExport" };
  const shape = classifyTarget(target, spec);
  if (shape !== "analyze") return shape === "data" ? { kind: "data" } : shape;
  const key = `${target}#${exportName}`;
  if (active.has(key)) return { kind: "unresolvable", reason: `re-export cycle at ${key}` };
  const memo = done.get(key);
  if (memo !== undefined) return memo;
  const tf = factsFor(target);
  if (tf === null) return { kind: "unresolvable", reason: `unparseable in-repo module ${spec}` };
  active.add(key);
  const carried = [...tf.moduleReports];
  const res = resolveExport(root, tf, exportName, active, done);
  active.delete(key);
  // Anything the HOP's own module reports about itself has no other way out:
  // the caller never sees this module (round-13 finding 1).
  const merged: ExportResolution =
    carried.length && res.kind !== "forward"
      ? { ...res, reasons: [...(res.reasons ?? []), ...carried] }
      : res;
  done.set(key, merged);
  return merged;
}

function resolveExport(
  root: string,
  facts: ModuleFacts,
  exportName: string,
  active: Set<string>,
  done: Map<string, ExportResolution>,
): ExportResolution {
  const target = facts.exports.get(exportName);
  if (target !== undefined) {
    const here = (node: ts.Node): ExtentNode => ({ node, facts, path: facts.sf.fileName });
    if (target.kind === "node") return { kind: "extent", nodes: [here(target.node)] };
    const nodes = (facts.extents.get(facts.sf)?.get(target.name) ?? []).map(here);
    // E2: `import { x } from "./h"; export { x }` exports a name this module
    // only IMPORTS, so the local map answers with an empty extent unless the
    // edge is followed. Any WRITE to the same binding stays in the answer.
    const imported = facts.imports.get(target.name);
    if (imported !== undefined && imported.namespace === true)
      // 2b: `import * as ns from "./h"; export { ns }` exports the namespace
      // OBJECT, not a target export. Forwarding it asks the target for `ns`,
      // which answers noSuchExport and goes silently pure (probe H1).
      return {
        kind: "unresolvable",
        reason: `local re-export of a namespace binding (${target.name}) in ${facts.sf.fileName}`,
      };
    if (imported !== undefined) {
      const via = followForward(root, facts, imported.spec, imported.imported, active, done);
      if (via.kind === "extent") return { kind: "extent", nodes: [...via.nodes, ...nodes] };
      if (via.kind !== "noSuchExport") return via;
    }
    return { kind: "extent", nodes };
  }
  const declined = facts.declinedExports.get(exportName);
  if (declined !== undefined) return { kind: "unresolvable", reason: declined };
  const forwarded = facts.forwards.get(exportName);
  if (forwarded !== undefined) {
    // An IN-REPO specifier that does not resolve is an edge this scanner cannot
    // follow, and L-2 does not cover it: L-2 is about node_modules, where there
    // is genuinely nothing in-repo to analyze.
    if (
      isInRepoSpecifier(forwarded.spec) &&
      resolveSpecifier(root, facts.sf.fileName, forwarded.spec) === null
    )
      return {
        kind: "unresolvable",
        reason: `unfollowable re-export of ${forwarded.sourceName} from ${forwarded.spec} in ${facts.sf.fileName}`,
      };
    return followForward(root, facts, forwarded.spec, forwarded.sourceName, active, done);
  }
  // E6: a star fan-out carries every name EXCEPT `default`. Candidates are
  // tried in SOURCE ORDER and a miss on one branch is benign; the first answer
  // that is not `noSuchExport` wins, because "stop at the first provenance" is
  // not decidable here — this returns an extent and cannot know what the
  // traversal will make of it (spec §2.2).
  if (exportName !== "default") {
    for (const spec of facts.starExports) {
      const via = followForward(root, facts, spec, exportName, active, done);
      if (via.kind !== "noSuchExport") return via;
    }
  }
  return { kind: "noSuchExport" };
}

/**
 * §2.4's three answers for a resolved specifier, decided BEFORE any read.
 *
 * A directory reaches `readFileSync` otherwise and throws `EISDIR`; an `.mdx`
 * target parses as TypeScript and yields a garbage tree that reads as pure.
 * Both are reported instead.
 */
function classifyTarget(
  target: string,
  spec: string,
): "analyze" | "data" | { kind: "unresolvable"; reason: string } {
  const ext = extname(target).toLowerCase();
  if (LANGUAGE_EXTENSIONS.includes(ext)) return "analyze";
  if (DATA_EXTENSIONS.includes(ext)) return "data";
  return { kind: "unresolvable", reason: `unsupported module shape for ${spec}` };
}

function moduleFacts(path: string): ModuleFacts | null {
  if (!existsSync(path)) return null;
  const sf = parse(path, readFileSync(path, "utf8"));
  const imports = new Map<string, { spec: string; imported: string; namespace?: boolean }>();
  const extents = new Map<Scope, Map<string, ts.Node[]>>();
  const shadows = new Map<Scope, Set<string>>();
  const scopedImports = new Map<
    Scope,
    Map<string, { spec: string; imported: string; namespace?: boolean }>
  >();
  const exports = new Map<string, ExportTarget>();
  const forwards = new Map<string, { spec: string; sourceName: string }>();
  const starExports: string[] = [];
  const declinedExports = new Map<string, string>();
  const moduleReports: string[] = [];
  /** Dynamic imports in a MODELLED position, decided after the walk: the shape
   * is modelled only while the binding stays module-local. */
  const modelledDynamic: Array<{ spec: string; names: string[] }> = [];
  /** Writes, resolved in a SECOND pass: a write's target binding cannot be
   * known until every declaration in the file has been registered. */
  const writes: Array<{ name: string; at: ts.Node; value: ts.Node }> = [];

  /** Register `node` in the extent of `name`, bound in exactly `scope`. */
  const addExtentIn = (scope: Scope, name: string, node: ts.Node): void => {
    const byName = extents.get(scope) ?? new Map<string, ts.Node[]>();
    byName.set(name, [...(byName.get(name) ?? []), node]);
    extents.set(scope, byName);
  };

  /** Register `node` in the extent of `name` as bound in `declaredAt`'s scope. */
  const addExtent = (name: string, node: ts.Node, declaredAt: ts.Node): void => {
    addExtentIn(scopeOf(declaredAt) ?? sf, name, node);
  };

  const addShadowIn = (scope: Scope, name: string): void => {
    const set = shadows.get(scope) ?? new Set<string>();
    set.add(name);
    shadows.set(scope, set);
  };

  /** Bind a dynamic import's names IN THE SCOPE THAT DECLARES THEM. */
  const bindPattern = (name: ts.BindingName, spec: string, scope: Scope): void => {
    const here =
      scopedImports.get(scope) ??
      new Map<string, { spec: string; imported: string; namespace?: boolean }>();
    if (ts.isIdentifier(name)) here.set(name.text, { spec, imported: name.text, namespace: true });
    else if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        if (!ts.isIdentifier(el.name)) continue;
        // `const { spawnSync: run } = await import(...)` carries the source name
        // in propertyName, exactly as a named import does.
        const imported =
          el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
        here.set(el.name.text, { spec, imported });
      }
    }
    scopedImports.set(scope, here);
  };

  const walk = (node: ts.Node): void => {
    // EXPORTS: what this module offers under each name (spec §2.2, forms E1-E4).
    // Registered here rather than derived later because the declaration is the
    // only place both names are visible at once - the EXPORTED one and the
    // local one - and every rename loses one of them the moment the walk moves
    // on. Type-only forms are skipped entirely, which is also what makes VALUE
    // beat type under declaration merging: a type never enters the map, so a
    // same-named value is the only thing there to find.
    if (
      ts.isExportDeclaration(node) &&
      !node.moduleSpecifier &&
      !node.isTypeOnly &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      // E2: `export { x }` and `export { x as y }` - the exported name is
      // `name`, the local one is `propertyName ?? name`, which is the mirror of
      // an import specifier and the easiest thing here to get backwards.
      for (const e of node.exportClause.elements) {
        if (e.isTypeOnly) continue;
        exports.set(e.name.text, { kind: "local", name: (e.propertyName ?? e.name).text });
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      isAtModuleLoad(node)
    ) {
      // §2.4b, stated as ONE rule over what the resolver cannot bind rather
      // than as a list of accepted spellings, and seeded only at MODULE-LOAD
      // position, where the walk never arrives on its own.
      const arg = node.arguments[0];
      const spec = arg && ts.isStringLiteral(arg) ? arg.text : null;
      if (spec === null) {
        moduleReports.push(`dynamic import() with a non-literal specifier in ${path}`);
      } else if (isInRepoSpecifier(spec)) {
        // A BARE specifier stays pure under L-2 whatever position it sits in.
        const decl = modelledDynamicDeclaration(node);
        if (decl === null) moduleReports.push(`unbindable dynamic import of ${spec} in ${path}`);
        else
          modelledDynamic.push({ spec, names: bindingIdentifiers(decl.name).map((i) => i.text) });
      }
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      // E5/E6: a re-export names another module. Recorded as an EDGE rather
      // than resolved here, because following it needs the resolver's root and
      // its cycle structures, which only exist during a traversal.
      const spec = node.moduleSpecifier.text;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const e of node.exportClause.elements) {
          if (e.isTypeOnly) continue;
          forwards.set(e.name.text, { spec, sourceName: (e.propertyName ?? e.name).text });
        }
      } else if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
        // `export * as ns from "./h"` binds a NAMESPACE OBJECT, which is not an
        // extent and cannot be followed member-precisely from here.
        declinedExports.set(
          node.exportClause.name.text,
          `unsupported export form: export * as ${node.exportClause.name.text} from ${spec} in ${path}`,
        );
      } else if (!node.exportClause) {
        starExports.push(spec);
      }
    }
    if (ts.isExportAssignment(node) && node.isExportEquals) {
      // `export = x` is a CommonJS export assignment, not an ES export, and
      // what an importer binds through it is not decidable here.
      declinedExports.set("default", `unsupported export form: export = in ${path}`);
    }
    if (
      ts.isModuleDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      // `export namespace NS {}` carries the modifier but registers no extent,
      // so an E1 predicate keyed on the modifier reads it as pure (probe B9).
      declinedExports.set(
        node.name.text,
        `unsupported export form: export namespace ${node.name.text} in ${path}`,
      );
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      // E3: `export default <expr>` exports the EXPRESSION under `default`.
      exports.set("default", { kind: "node", node: node.expression });
    }
    if (ts.canHaveModifiers(node)) {
      const mods = ts.getModifiers(node);
      const exported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      const isDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
      if (exported && isDefault) {
        // E4: a declaration carrying BOTH modifiers exports `default` and ONLY
        // `default` - function or class, named or anonymous - because the
        // declaration's own name is module-local under ES.
        exports.set("default", { kind: "node", node });
      } else if (exported && ts.isVariableStatement(node)) {
        // E1, read from the STATEMENT: the modifier lives there, not on the
        // declaration, and every declarator and every identifier a binding
        // pattern introduces is exported.
        for (const d of node.declarationList.declarations)
          for (const id of bindingIdentifiers(d.name))
            exports.set(id.text, { kind: "local", name: id.text });
      } else if (
        exported &&
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isEnumDeclaration(node)) &&
        node.name
      ) {
        exports.set(node.name.text, { kind: "local", name: node.name.text });
      }
    }

    // static imports, including aliases and namespaces
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (!clause && isInRepoSpecifier(spec)) {
        // `import "./side"` has no importClause at all, so every clause-driven
        // branch skips it and the module's own work is never seen. It runs at
        // load, inside no extent - hence the seed (spec §2.4b).
        moduleReports.push(`side-effect import of ${spec} in ${path}`);
      }
      // A default import binds a LOCAL name for the target's `default` export.
      // Recording the local name here is what made every renamed default ask
      // the target for a name it does not export (spec §2.1, half 2).
      if (clause?.name) imports.set(clause.name.text, { spec, imported: "default" });
      const b = clause?.namedBindings;
      // A namespace binding is ONE binding for MANY exports; the member is
      // what selects the export, so the flag travels with the binding.
      if (b && ts.isNamespaceImport(b))
        imports.set(b.name.text, { spec, imported: b.name.text, namespace: true });
      if (b && ts.isNamedImports(b)) {
        for (const e of b.elements) {
          // `import { helper as h }` binds `h` locally but names `helper` in the
          // target module. Looking the extent up by the LOCAL name found
          // nothing there, so an aliased provenance helper read as pure.
          imports.set(e.name.text, {
            spec,
            imported: e.propertyName ? e.propertyName.text : e.name.text,
          });
        }
      }
    }

    // dynamic import, destructured or not. A NON-literal specifier is not
    // recorded here: `unclassifiableWithin` carries the live copy of that rule,
    // scoped to the test's own extent, which is what the verdict reads.
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        let p: ts.Node = node;
        while (p.parent && !ts.isVariableDeclaration(p.parent)) p = p.parent;
        const decl = p.parent;
        if (decl && ts.isVariableDeclaration(decl)) {
          const home = isVarDeclaration(decl)
            ? (functionScopeOf(decl) ?? sf)
            : (scopeOf(decl) ?? sf);
          bindPattern(decl.name, arg.text, home);
        }
      }
    }

    // Declarations and their extents, registered IN THE SCOPE THAT BINDS THEM.
    //
    // This used to be module scope only, because a single flat name→extent map
    // makes unrelated same-named bindings collide: probed, `reportEnvelope`'s
    // parameter `res` collided with a `const res = resolveClaims(...)` inside
    // main(), and every test importing reportEnvelope classified as
    // environment-touching (spec AC-10b). Restricting to module scope closed
    // that by DISCARDING every nested binding, which cost the opposite error —
    // a helper declared inside `describe` had no extent, so its provenance was
    // invisible. Scope keys plus parameter shadows close both: the AC-10b
    // fixture and the describe-scope fixture are regression cases side by side.
    //
    // EVERY binding form binds, not just the identifier ones. Reading only
    // `const x = …` and identifier parameters left object/array patterns, `for`
    // heads, destructured `catch` clauses and named function expressions
    // unbound, so each fell through to a same-named outer binding and inherited
    // provenance it cannot reach (whole-diff R1 #3).
    if (ts.isVariableDeclaration(node)) {
      // `var` hoists to the enclosing FUNCTION; `let`/`const` bind in the block
      // they sit in. Registering a block-scoped name at function scope shadows
      // references that follow the block, which is the false-NEGATIVE direction.
      const home = isVarDeclaration(node) ? (functionScopeOf(node) ?? sf) : (scopeOf(node) ?? sf);
      // A dynamic-import binding is registered in `scopedImports` by the clause
      // above, carrying the name it has in the TARGET module. Registering a
      // local extent for it too would shadow that edge with the bare `await
      // import(...)` expression, which names no provenance by itself and has no
      // module edge to follow.
      const dynamicImport = isDynamicImportInitializer(node.initializer);
      for (const [id, fallbacks] of boundNames(node.name)) {
        // A declaration with NO initializer still BINDS the name here, so a
        // later write inside a nested function attaches to this binding rather
        // than falling through to a same-named outer one.
        if (node.initializer && !dynamicImport) addExtentIn(home, id.text, node.initializer);
        else if (!node.initializer && fallbacks.length === 0) addShadowIn(home, id.text);
        // EVERY default is part of the extent, because each is what runs when
        // the source supplies nothing at its own level of the pattern — and
        // that is true of a dynamic import too. Skipping the whole clause for
        // one dropped `const { helper = spawnSync } = await import(…)`, whose
        // default RUNS when the imported export is undefined (R4 #2). Only the
        // INITIALIZER is withheld for a dynamic import, because the bare
        // `await import(…)` expression names no provenance by itself and its
        // module edge is already registered in `scopedImports`.
        for (const fallback of fallbacks) addExtentIn(home, id.text, fallback);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) addExtent(node.name.text, node, node);
    if (ts.isClassDeclaration(node) && node.name) addExtent(node.name.text, node, node);
    // An enum declares a VALUE too — `cache.A` reads the enum object — so it
    // binds its name like a class does, or the member access falls through to
    // whatever same-named binding encloses it.
    if (ts.isEnumDeclaration(node)) addExtent(node.name.text, node, node);

    // A named function or class EXPRESSION binds its own name inside itself and
    // nowhere else: `const p = function cache() { return cache; }` reads the
    // function, not an outer `cache`.
    if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
      addShadowIn(node, node.name.text);
    }

    // Parameters bind their names with no extent of their own. Recorded as
    // shadows so the innermost-out walk STOPS rather than inheriting an outer
    // binding's provenance. Patterns bind exactly as identifiers do.
    if (isFunctionLike(node)) {
      for (const param of (node as ts.SignatureDeclaration).parameters ?? []) {
        for (const id of bindingIdentifiers(param.name)) addShadowIn(node, id.text);
      }
    }

    // A statement that WRITES to a binding is part of THAT binding's extent —
    // the one the target resolves to, innermost-out from the write itself, not
    // whichever module-scope name happens to match. `cache = spawnSync(...)`
    // inside `init()` extends the module `cache` when that is what `cache`
    // denotes there, and extends only the local one when a local shadows it.
    //
    // Keyed on the assignment OPERATOR rather than on one statement shape. The
    // old test was `ExpressionStatement > BinaryExpression(=) > Identifier`,
    // which is a single spelling: `cache ||= x`, `(cache) = x`, `const r =
    // (cache = x)`, and a destructuring or `for…of` target all wrote real
    // provenance that was dropped in silence (whole-diff R3 #3).
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      for (const [id, defaults] of assignmentTargets(node.left)) {
        writes.push({ name: id.text, at: node, value: node.right });
        for (const dflt of defaults) writes.push({ name: id.text, at: node, value: dflt });
      }
    }
    // `for (row of rows)` assigns to an EXISTING binding — a declaration in the
    // head binds instead, and is registered by the declaration clause above.
    if (
      (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer)
    ) {
      for (const [id, defaults] of assignmentTargets(node.initializer)) {
        writes.push({ name: id.text, at: node, value: node.expression });
        for (const dflt of defaults) writes.push({ name: id.text, at: node, value: dflt });
      }
    }

    ts.forEachChild(node, walk);
  };
  walk(sf);

  // Second pass: attach each write to the binding its target actually denotes,
  // walking innermost-out from the write. A binding is anything DECLARED in a
  // scope — with an extent or (an uninitialized `let`, a parameter) without one
  // — because that is what determines which name a write reaches. Unresolved
  // targets fall to module scope, the conservative direction: the write is
  // recorded rather than dropped.
  const bindingScope = (name: string, from: ts.Node): Scope => {
    let scope: Scope | null = scopeOf(from) ?? sf;
    while (scope) {
      if (
        extents.get(scope)?.has(name) ||
        shadows.get(scope)?.has(name) ||
        // A dynamic import BINDS its name too. Consulting only `extents` and
        // `shadows` walked straight past it, so a write to such a binding
        // resolved outward and landed on whatever same-named thing it met —
        // module scope via the fallback below, in practice. It happened to look
        // right at module scope and lost the write in every block and `describe`
        // (R4 #3).
        scopedImports.get(scope)?.has(name)
      ) {
        return scope;
      }
      scope = scopeOf(scope);
    }
    return sf; // unresolved: record the write at module scope rather than drop it
  };
  for (const { name, at, value } of writes) {
    const scope = bindingScope(name, at);
    const byName = extents.get(scope) ?? new Map<string, ts.Node[]>();
    byName.set(name, [...(byName.get(name) ?? []), value]);
    extents.set(scope, byName);
  }

  // A dynamic import in a modelled position is still unbindable ACROSS the
  // module boundary: what an importer binds through `export const ns = await
  // import(...)`, or through a later `export { ns }`, is a promise this
  // scanner cannot follow member-precisely (spec §2.2).
  for (const { spec, names } of modelledDynamic)
    if (names.some((nm) => exports.has(nm) || forwards.has(nm)))
      moduleReports.push(`unbindable dynamic import of ${spec} in ${path}`);

  return {
    sf,
    imports,
    extents,
    shadows,
    scopedImports,
    exports,
    forwards,
    starExports,
    declinedExports,
    moduleReports,
    resolved: new Map<Scope, Map<string, Binding>>(),
    provenance: new WeakMap<ts.Node, boolean>(),
  };
}

/** Strip parentheses and `as` casts, which otherwise hide the real callee. */
function unwrap(node: ts.Expression): ts.Expression {
  let n: ts.Expression = node;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isSatisfiesExpression(n)
  )
    n = n.expression;
  return n;
}

/** Does this binding pattern or assignment pattern extract a property named `env`? */
function bindsEnv(target: ts.Node): boolean {
  if (ts.isObjectBindingPattern(target)) {
    return target.elements.some((el) => {
      const key = el.propertyName ?? el.name;
      return ts.isIdentifier(key) && key.text === "env";
    });
  }
  // The assignment form: `({ env } = process)` parses its target as an object
  // LITERAL, not a binding pattern, so the two spellings need separate reads.
  if (ts.isObjectLiteralExpression(target)) {
    return target.properties.some(
      (p) =>
        (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
        ts.isIdentifier(p.name) &&
        p.name.text === "env",
    );
  }
  return false;
}

/**
 * Is this node the SOURCE of a destructuring that extracts `env`?
 *
 * Wrappers are climbed rather than enumerated at the call site, so `as`, `!`,
 * `satisfies` and parentheses all reach the same answer.
 */
function extractsEnvFrom(node: ts.Node): boolean {
  let cur: ts.Node = node;
  let p: ts.Node | undefined = cur.parent;
  while (
    p !== undefined &&
    (ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p) ||
      ts.isSatisfiesExpression(p))
  ) {
    cur = p;
    p = p.parent;
  }
  if (p === undefined) return false;
  if (ts.isVariableDeclaration(p) && p.initializer === cur) return bindsEnv(p.name);
  if (ts.isParameter(p) && p.initializer === cur) return bindsEnv(p.name);
  if (
    ts.isBinaryExpression(p) &&
    p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    p.right === cur
  ) {
    return bindsEnv(unwrap(p.left));
  }
  return false;
}

/**
 * `process.env`, reached through the BINDER rather than matched as text.
 *
 * The reach test used to be `node.getText().startsWith("process.env")`, which
 * is wrong in both directions and silent in both: a parameter or local named
 * `process` read as the global, and the global read through parentheses, a
 * cast, a non-null assertion, an optional chain or a string-literal computed
 * key read as nothing at all (whole-diff R3 #1). Every one returned
 * `detail: ""`, so neither direction announced itself.
 *
 * A NON-literal key is not resolvable and is not decided here —
 * `unclassifiableWithin` declines it.
 */
function readsProcessEnv(n: ts.Node, facts: ModuleFacts): boolean {
  let base: ts.Expression;
  if (ts.isPropertyAccessExpression(n) && n.name.text === "env") base = n.expression;
  else if (
    ts.isElementAccessExpression(n) &&
    ts.isStringLiteralLike(n.argumentExpression) &&
    n.argumentExpression.text === "env"
  )
    base = n.expression;
  else return false;
  let id = unwrap(base);
  // `globalThis.process.env` names the same global by its qualified spelling.
  if (
    ts.isPropertyAccessExpression(id) &&
    id.name.text === "process" &&
    ts.isIdentifier(unwrap(id.expression)) &&
    (unwrap(id.expression) as ts.Identifier).text === "globalThis"
  ) {
    id = unwrap(id.expression);
    return resolveBinding(facts, "globalThis", id).kind === "unbound";
  }
  return (
    ts.isIdentifier(id) &&
    id.text === "process" &&
    // Unbound is the global: anything a scope declares is a different thing
    // that merely shares the name.
    resolveBinding(facts, "process", id).kind === "unbound"
  );
}

/** Does this specifier name a declared module provenance? */
const isProvenanceModule = (spec: string): boolean =>
  ENVIRONMENT_SOURCES.modules.some((m) => spec === m || spec.endsWith(m) || spec.includes(m));

/** `@/x` and relative specifiers → an absolute repo path, else null. */
function resolveSpecifier(root: string, fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // bare specifier: node_modules, treated as pure (L-2)
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base]) {
    if (existsSync(cand) && !cand.includes("node_modules")) return cand;
  }
  return null;
}

/** True when this node's own text reaches `process.env` or a provenance local. */
function extentIsProvenance(node: ts.Node, facts: ModuleFacts): boolean {
  const memo = facts.provenance.get(node);
  if (memo !== undefined) return memo;
  let hit = false;
  const walk = (n: ts.Node): void => {
    if (hit) return;
    // process.env.X, and `const { env } = process` binding used as env.X
    if (readsProcessEnv(n, facts)) hit = true;
    // A dynamic import OF a provenance module is provenance wherever it sits.
    // The binding clause only registers `const x = await import(...)`, so an
    // ASSIGNMENT (`m = await import("node:child_process")`) reached the write
    // pass instead and its extent was the bare import expression, which named
    // nothing. LIMIT: for an IN-REPO specifier in that same position the
    // imported NAME is unknown, and treating the whole module as reachable is
    // namespace semantics — BL-PREMISESCAN-IMPORT-EDGE-FIDELITY owns that.
    if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] !== undefined &&
      ts.isStringLiteral(n.arguments[0]) &&
      isProvenanceModule((n.arguments[0] as ts.StringLiteral).text)
    ) {
      hit = true;
    }
    // `const { env } = process` — the global DESTRUCTURED rather than accessed.
    //
    // Keyed on what is extracted and on the binder, not on one syntactic shape.
    // Asking for "the bare identifier `process` as a declaration's initializer"
    // was wrong in both directions and silent in both: it counted
    // `const { version } = process`, which reads no environment, and it missed
    // the extraction through a wrapper, through a destructuring assignment, and
    // through a parameter default (whole-diff R4 #1).
    if (
      ts.isIdentifier(n) &&
      n.text === "process" &&
      isReferenceIdentifier(n) &&
      extractsEnvFrom(n) &&
      resolveBinding(facts, "process", n).kind === "unbound"
    ) {
      hit = true;
    }
    // An identifier is the import only when NOTHING between it and module scope
    // binds that name — a file-global map read cannot tell `spawnSync` the
    // import from `function pure(spawnSync)` (whole-diff R1 #2).
    if (ts.isIdentifier(n) && isReferenceIdentifier(n)) {
      const binding = resolveBinding(facts, n.text, n);
      if (binding.kind === "import" && isProvenanceModule(binding.spec)) hit = true;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  facts.provenance.set(node, hit);
  return hit;
}

/**
 * Classify every test in `suitePath`.
 *
 * The fixed point walks declarations, not files: a declaration is reachable
 * when the test's extent references it, transitively, and a test is
 * environment-touching when any reachable declaration's extent carries a
 * provenance.
 */
export function classifyTests(root: string, suitePath: string): TestClassification[] {
  const abs = resolve(root, suitePath);
  const facts = moduleFacts(abs);
  if (!facts) return [];
  factsCache.clear();
  factsCache.set(abs, facts);

  const out: TestClassification[] = [];

  const reaches = (start: ts.Node, home: ModuleFacts, homePath: string): Reach => {
    const seen = new Set<string>();
    const unresolved: string[] = [];
    const visit = (node: ts.Node, f: ModuleFacts, path: string): boolean => {
      if (extentIsProvenance(node, f)) return true;
      for (const reference of referencedIdentifiers(node)) {
        const name = reference.text;
        // Dedup by the BINDING, not the name: two same-named bindings in
        // different scopes are two different things to visit, and collapsing
        // them made the verdict depend on which occurrence came first.
        const binding = resolveBinding(f, name, reference);
        // A namespace reference selects its export through the MEMBER at the
        // use site, so the member is read before the dedup key is formed.
        const member =
          binding.kind === "import" && binding.namespace === true
            ? namespaceMember(reference)
            : undefined;
        const bk = bindingKey(name, binding, member);
        if (bk === null) continue; // unbound: nothing to visit
        const key = `${path}#${bk}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (binding.kind === "import") {
          const imported = binding;
          // Provenance FIRST, before any member inspection: the shipped
          // ordering says a namespace of `node:child_process` is touching
          // whatever the member, and inspecting first would demote it.
          if (isProvenanceModule(imported.spec)) return true;
          if (imported.namespace === true && member === null) {
            // A namespace used where no member is statically known resolves to
            // nothing member-precise. Named for the module the USE was written
            // in, and for the namespace's origin, because a reader needs both.
            unresolved.push(
              `namespace ${name} (imported from ${imported.spec}) used in a position with no statically known member, in ${path}`,
            );
            for (const ext of binding.extent) {
              if (visit(ext, f, path)) return true;
            }
            continue;
          }
          const target = resolveSpecifier(root, path, imported.spec);
          if (target === null) {
            // An IN-REPO specifier that does not resolve is NOT a bare one:
            // L-2 covers node_modules, where there is nothing in-repo to
            // analyze. `resolveSpecifier`'s candidates are deliberately not
            // widened; the miss is reported instead (spec §2.4b).
            if (isInRepoSpecifier(imported.spec))
              unresolved.push(`unresolved in-repo specifier ${imported.spec} in ${path}`);
            // node_modules, pure by L-2 — but a WRITE to the same binding is not.
            for (const ext of binding.extent) {
              if (visit(ext, f, path)) return true;
            }
            continue;
          }
          // Classify the target BEFORE any read (spec §2.4): a directory would
          // throw EISDIR inside `factsFor`, and a non-language, non-data shape
          // must be reported rather than parsed as TypeScript.
          const shape = classifyTarget(target, imported.spec);
          if (shape !== "analyze") {
            if (shape !== "data") unresolved.push(shape.reason);
            // `data` is pure exactly as a bare specifier is; both still visit
            // any WRITE to the same local binding below.
            for (const ext of binding.extent) {
              if (visit(ext, f, path)) return true;
            }
            continue;
          }
          const tf = factsFor(target);
          if (tf === null) {
            unresolved.push(`unparseable in-repo module ${imported.spec}`);
            continue;
          }
          // Every module the traversal LOADS contributes what it reports about
          // itself, named for the module it was found in (spec §2.6 item 2).
          unresolved.push(...tf.moduleReports);
          // By the name the target EXPORTS, not the local alias and not a local
          // declaration that merely shares the name.
          const res = resolveExport(
            root,
            tf,
            imported.namespace === true && member !== null && member !== undefined
              ? member
              : imported.imported,
            new Set<string>(),
            new Map<string, ExportResolution>(),
          );
          if (res.kind === "unresolvable") unresolved.push(res.reason);
          if (res.kind !== "forward" && res.reasons) unresolved.push(...res.reasons);
          if (res.kind === "extent") {
            // Each node travels with the module it was DECLARED in, which is
            // not `tf` once a forward has been followed.
            for (const ext of res.nodes) {
              if (visit(ext.node, ext.facts, ext.path)) return true;
            }
          }
          // …and anything later ASSIGNED to the same local binding.
          for (const ext of binding.extent) {
            if (visit(ext, f, path)) return true;
          }
          continue;
        }
        if (binding.kind === "local") {
          for (const ext of binding.extent) {
            if (visit(ext, f, path)) return true;
          }
        }
      }
      return false;
    };
    if (visit(start, home, homePath))
      return { verdict: "environment-touching", reasons: unresolved };
    return {
      verdict: unresolved.length > 0 ? "unclassifiable" : "environment-free",
      reasons: unresolved,
    };
  };

  // The TEST FILE's own module-load reports apply to every test in it, exactly
  // as a top-level hook does.
  const fileReports = [...facts.moduleReports];

  const suiteText = facts.sf.getFullText();

  const walk = (node: ts.Node, hooks: ts.Node[]): void => {
    if (ts.isCallExpression(node)) {
      const root_ = registrarRoot(node.expression);
      if (root_ === "describe") {
        // A describe.each producer and the describe's hooks both attach to
        // every test nested inside it: that is where the value those tests
        // consume comes from, so a premise must dominate them (spec §3.3.2.2).
        const nested = [...hooks, ...hookBodies(node), ...eachProducers(node)];
        ts.forEachChild(node, (c) => walk(c, nested));
        return;
      }
      if (root_ === "it" || root_ === "test") {
        const line = facts.sf.getLineAndCharacterOfPosition(node.getStart(facts.sf)).line + 1;
        const nameArg = node.arguments[0];
        const testName =
          nameArg && ts.isStringLiteralLike(nameArg) ? nameArg.text : `<test at line ${line}>`;

        // the test's extent is the WHOLE call expression, so a .each producer
        // is inside it by construction
        const own = reaches(node, facts, abs);
        let verdict = own.verdict;
        const reachReasons = [...own.reasons];
        if (verdict !== "environment-touching") {
          for (const h of hooks) {
            // Hook REASONS are still discarded here; Task 5 is where the hook
            // call site merges them, and its cases red on exactly that.
            if (reaches(h, facts, abs).verdict === "environment-touching") {
              verdict = "environment-touching";
              break;
            }
          }
        }
        // Unclassifiable is scoped to THIS test's extent and outranks
        // environment-touching: "I found something I cannot resolve" is a
        // different instruction to the reader than "this reaches the
        // environment", and collapsing them is what made §3.3.3 and §4
        // disagree at spec R7.
        const ownUnresolved = unclassifiableWithin(node, facts);
        if (ownUnresolved.length > 0 || fileReports.length > 0) verdict = "unclassifiable";

        const text = node.getText(facts.sf);
        const hasPremise = /\bpremise(Holds)?\s*\(/.test(text) || premiseIsAssociated(node, facts);
        const body = suiteText.slice(node.getStart(facts.sf), node.end);
        const m = body.match(/\/\/\s*no-premise:\s*(.+)/);
        const exemption = m?.[1]?.trim() ? m[1].trim() : null;

        out.push({
          testName,
          line,
          verdict,
          detail: [...ownUnresolved, ...reachReasons, ...fileReports].join("; "),
          hasPremise,
          exemption,
        });
        return;
      }
    }
    ts.forEachChild(node, (c) => walk(c, hooks));
  };
  walk(facts.sf, []);
  return out;
}

/** Reasons this node contains a recognized-but-unresolvable construct. */
function unclassifiableWithin(node: ts.Node, facts: ModuleFacts): string[] {
  const out: string[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0];
      if (!arg || !ts.isStringLiteral(arg))
        out.push("dynamic import() with a non-literal specifier");
      // §2.4b: a LITERAL in-repo specifier in a position the resolver cannot
      // bind - assignment, embedded in a larger expression, a bare statement -
      // is reported rather than passed as pure. A BARE specifier stays pure
      // under L-2, and the one MODELLED position stays modelled.
      else if (isInRepoSpecifier(arg.text) && modelledDynamicDeclaration(n) === null)
        out.push(`unbindable dynamic import of ${arg.text} in ${facts.sf.fileName}`);
    }
    if (ts.isElementAccessExpression(n)) {
      const obj = unwrap(n.expression);
      if (
        ts.isIdentifier(obj) &&
        obj.text === "process" &&
        // The GLOBAL only: a local named `process` indexed by a variable is an
        // ordinary object read, and declining it would be a demote invented
        // out of a shared name.
        resolveBinding(facts, "process", obj).kind === "unbound" &&
        !ts.isStringLiteralLike(n.argumentExpression)
      ) {
        out.push("computed member access on process");
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

/** Bodies of beforeEach/beforeAll declared directly inside a describe call. */
function hookBodies(describeCall: ts.CallExpression): ts.Node[] {
  const out: ts.Node[] = [];
  const walk = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      /^(beforeEach|beforeAll|afterEach|afterAll)$/.test(n.expression.text)
    ) {
      out.push(n);
    }
    ts.forEachChild(n, walk);
  };
  walk(describeCall);
  return out;
}

/** The producer argument of `describe.each(<producer>)(...)`, if any. */
function eachProducers(call: ts.CallExpression): ts.Node[] {
  const callee = call.expression;
  return ts.isCallExpression(callee) ? [...callee.arguments] : [];
}

/**
 * The associated pre-registration position (spec §3.3.2.2).
 *
 * A premise inside a `.each` callback cannot run when the producer yields
 * nothing — which is exactly the degenerate case it exists to detect. The
 * accepted placement is a premise over the NAMED BINDING the registration
 * consumes, sitting between that binding and the call.
 */
function premiseIsAssociated(call: ts.CallExpression, facts: ModuleFacts): boolean {
  const callee: ts.Expression = call.expression;
  if (!ts.isCallExpression(callee)) return false;
  const producer = callee.arguments[0];
  if (!producer || !ts.isIdentifier(producer)) return false;
  const binding = producer.text;

  // WHICH binding the registration consumes, so a premise about a same-named
  // one somewhere else cannot stand in for it.
  const producerBinding = resolveBinding(facts, binding, producer);
  const producerKey = bindingKey(binding, producerBinding);

  // The candidates are a property of the FILE, not of this registration, so
  // they are collected once. Re-walking the source per `.each` registration is
  // what took a corpus pass from 1.1s to 10.7s.
  return loadTimePremises(facts.sf).some(
    (n) =>
      n.getStart(facts.sf) < call.getStart(facts.sf) &&
      // It has to be about THIS binding, resolved rather than matched by name:
      // an inner `const rows` in another scope is a different producer.
      namesBinding(n, binding, producerKey, facts),
  );
}

/**
 * Every `premise(...)` / `premiseHolds(...)` call in the file that RUNS when
 * the module loads.
 *
 * A premise inside a function body runs when that function is called, which for
 * a never-called helper is never — and the whole point of the associated
 * placement is that it executes before the registration consumes the producer
 * (spec §3.3.2.2).
 */
const premiseCache = new WeakMap<ts.SourceFile, ts.CallExpression[]>();
function loadTimePremises(sf: ts.SourceFile): ts.CallExpression[] {
  const memo = premiseCache.get(sf);
  if (memo !== undefined) return memo;
  const out: ts.CallExpression[] = [];
  const walk = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      /^premise(Holds)?$/.test(n.expression.text) &&
      runsAtModuleLoad(n)
    ) {
      out.push(n);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  premiseCache.set(sf, out);
  return out;
}

/** Does this node execute when the module is loaded — i.e. sit under no function? */
/**
 * Does `child`'s subtree run every time `parent` runs?
 *
 * One step of the dominance walk, by construct. The controlling EXPRESSION of an
 * `if`, a loop, a `switch` or a ternary runs whenever the construct does; the
 * branches and bodies it selects do not. `&&`, `||` and `??` run their left
 * operand always and their right one conditionally.
 */
function executesWhenever(child: ts.Node, parent: ts.Node): boolean {
  const within = (n: ts.Node | undefined): boolean => {
    if (n === undefined) return false;
    return child === n || (child.getStart() >= n.getStart() && child.getEnd() <= n.getEnd());
  };
  if (ts.isIfStatement(parent)) return within(parent.expression);
  if (ts.isConditionalExpression(parent)) return within(parent.condition);
  if (ts.isSwitchStatement(parent)) return within(parent.expression);
  if (ts.isCaseClause(parent) || ts.isDefaultClause(parent)) return false;
  if (ts.isCatchClause(parent)) return false;
  if (ts.isWhileStatement(parent) || ts.isDoStatement(parent)) return within(parent.expression);
  if (ts.isForStatement(parent)) return within(parent.initializer);
  if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) return within(parent.expression);
  if (ts.isBinaryExpression(parent)) {
    const k = parent.operatorToken.kind;
    if (
      k === ts.SyntaxKind.AmpersandAmpersandToken ||
      k === ts.SyntaxKind.BarBarToken ||
      k === ts.SyntaxKind.QuestionQuestionToken
    )
      return within(parent.left);
  }
  return true;
}

function runsAtModuleLoad(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p !== undefined; p = p.parent) {
    if (ts.isSourceFile(p)) return true;
    // DOMINANCE, not mere position. The old rule asked only whether a non-IIFE
    // function encloses the call — and absence of one does not establish
    // execution: `if (false) { premise(...) }` sits at module scope and never
    // runs, and so does a short-circuit right operand, a ternary branch, a
    // zero-iteration loop body, an unmatched switch case, and a catch clause
    // (whole-diff R3 #5). Each was credited, so a premise contract could be
    // satisfied by a call nobody executes.
    //
    // Syntactic and deliberately conservative: it declines everything it cannot
    // see to be unconditional, rather than deciding reachability. A `try` block
    // and a `finally` block both run, so both still count.
    if (!executesWhenever(node, p)) return false;
    // An IIFE runs at load; a function that something else must call does not.
    if (isFunctionLike(p)) {
      const caller = p.parent;
      const invoked =
        caller !== undefined &&
        ((ts.isCallExpression(caller) && caller.expression === p) ||
          (ts.isParenthesizedExpression(caller) &&
            caller.parent !== undefined &&
            ts.isCallExpression(caller.parent) &&
            caller.parent.expression === caller));
      if (!invoked) return false;
    }
  }
  return true;
}

/** Does this premise call read the SAME binding the registration consumes? */
function namesBinding(
  node: ts.Node,
  name: string,
  producerKey: string | null,
  facts: ModuleFacts,
): boolean {
  if (producerKey === null) return referencesName(node, name);
  return referencedIdentifiers(node).some(
    (id) => id.text === name && bindingKey(name, resolveBinding(facts, name, id)) === producerKey,
  );
}
