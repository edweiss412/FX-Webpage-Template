import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
  // `[a = dflt] = xs` needs NO arm here. The element's own default is itself an
  // assignment expression, and the write pass walks every node, so it records
  // that write directly on its own visit. An arm for it was written first and
  // the mutation gate then reported it as a survivor no operator could
  // distinguish — probed by running both fixture shapes through a mutated copy,
  // which returned identical verdicts. Deleted rather than ledgered, the same
  // disposition the QualifiedName rule and the `?? 0` flag fallbacks got.
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

type ModuleFacts = {
  sf: ts.SourceFile;
  /** local name → the module it came from, and the name it has THERE. */
  imports: Map<string, { spec: string; imported: string }>;
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
  scopedImports: Map<Scope, Map<string, { spec: string; imported: string }>>;
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
  | { kind: "import"; scope: Scope; spec: string; imported: string; extent: ts.Node[] }
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
function bindingKey(name: string, binding: Binding): string | null {
  if (binding.kind === "unbound") return null;
  // The scope is part of the identity for imports too: two dynamic imports of
  // one name in different scopes are two different edges to follow.
  return `${name}@${binding.kind}@${binding.scope.kind}:${binding.scope.pos}`;
}

/** A module's EXPORTED binding, looked up by the name it carries there. */
function moduleScopeExtent(facts: ModuleFacts, name: string): ts.Node[] {
  return facts.extents.get(facts.sf)?.get(name) ?? [];
}

function moduleFacts(path: string): ModuleFacts | null {
  if (!existsSync(path)) return null;
  const sf = parse(path, readFileSync(path, "utf8"));
  const imports = new Map<string, { spec: string; imported: string }>();
  const extents = new Map<Scope, Map<string, ts.Node[]>>();
  const shadows = new Map<Scope, Set<string>>();
  const scopedImports = new Map<Scope, Map<string, { spec: string; imported: string }>>();
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
    const here = scopedImports.get(scope) ?? new Map<string, { spec: string; imported: string }>();
    if (ts.isIdentifier(name)) here.set(name.text, { spec, imported: name.text });
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
    // static imports, including aliases and namespaces
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, { spec, imported: clause.name.text });
      const b = clause?.namedBindings;
      if (b && ts.isNamespaceImport(b)) imports.set(b.name.text, { spec, imported: b.name.text });
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
      if (!isDynamicImportInitializer(node.initializer)) {
        for (const [id, fallbacks] of boundNames(node.name)) {
          // A declaration with NO initializer still BINDS the name here, so a
          // later write inside a nested function attaches to this binding rather
          // than falling through to a same-named outer one.
          if (node.initializer) addExtentIn(home, id.text, node.initializer);
          else if (fallbacks.length === 0) addShadowIn(home, id.text);
          // EVERY default is part of the extent, because each is what runs when
          // the source supplies nothing at its own level of the pattern.
          for (const fallback of fallbacks) addExtentIn(home, id.text, fallback);
        }
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
      if (extents.get(scope)?.has(name) || shadows.get(scope)?.has(name)) return scope;
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

  return {
    sf,
    imports,
    extents,
    shadows,
    scopedImports,
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
  const id = unwrap(base);
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
    // `const { env } = process` registers `process` as env's extent, so what
    // reaches here is the initializer. Narrow to exactly that: `process` as the
    // object of a member access is handled by the `process.env` prefix test
    // above, and treating every bare mention as provenance would swallow the
    // computed-access case that must report as UNCLASSIFIABLE instead.
    if (
      ts.isIdentifier(n) &&
      n.text === "process" &&
      ts.isVariableDeclaration(n.parent) &&
      // The INITIALIZER, never the declared name: `const process = { env: {} }`
      // put the identifier in a declaration-name position, and reading that as
      // a reference made a suite's own local shadow classify as the global.
      n.parent.initializer === n &&
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
  const cache = new Map<string, ModuleFacts | null>([[abs, facts]]);
  const factsFor = (p: string): ModuleFacts | null => {
    if (!cache.has(p)) cache.set(p, moduleFacts(p));
    return cache.get(p) ?? null;
  };

  const out: TestClassification[] = [];

  const reaches = (start: ts.Node, home: ModuleFacts, homePath: string): Verdict => {
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
        const bk = bindingKey(name, binding);
        if (bk === null) continue; // unbound: nothing to visit
        const key = `${path}#${bk}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (binding.kind === "import") {
          const imported = binding;
          if (isProvenanceModule(imported.spec)) return true;
          const target = resolveSpecifier(root, path, imported.spec);
          if (target === null) {
            // node_modules, pure by L-2 — but a WRITE to the same binding is not.
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
          // By the name it carries THERE, not the local alias.
          for (const ext of moduleScopeExtent(tf, imported.imported)) {
            if (visit(ext, tf, target)) return true;
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
    if (visit(start, home, homePath)) return "environment-touching";
    return unresolved.length > 0 ? "unclassifiable" : "environment-free";
  };

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
        let verdict = reaches(node, facts, abs);
        if (verdict !== "environment-touching") {
          for (const h of hooks) {
            if (reaches(h, facts, abs) === "environment-touching") {
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
        if (ownUnresolved.length > 0) verdict = "unclassifiable";

        const text = node.getText(facts.sf);
        const hasPremise = /\bpremise(Holds)?\s*\(/.test(text) || premiseIsAssociated(node, facts);
        const body = suiteText.slice(node.getStart(facts.sf), node.end);
        const m = body.match(/\/\/\s*no-premise:\s*(.+)/);
        const exemption = m?.[1]?.trim() ? m[1].trim() : null;

        out.push({
          testName,
          line,
          verdict,
          detail: ownUnresolved.join("; "),
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
