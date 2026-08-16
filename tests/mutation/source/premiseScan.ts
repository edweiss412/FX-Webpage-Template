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

const parse = (path: string, text: string): ts.SourceFile =>
  ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

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
function referencedIdentifiers(node: ts.Node): ts.Identifier[] {
  const out: ts.Identifier[] = [];
  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && isReferenceIdentifier(n)) out.push(n);
    ts.forEachChild(n, walk);
  };
  walk(node);
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
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isQualifiedName(p) && p.right === id) return false;
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
    ts.isCaseBlock(node)
  );
}

/** The nearest enclosing scope of `node` — where a block-scoped binding declared at `node` lives. */
function scopeOf(node: ts.Node): Scope | null {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (isScopeNode(p)) return p;
    p = p.parent;
  }
  return null;
}

/** The nearest enclosing FUNCTION scope — where `var` and hoisted names live. */
function functionScopeOf(node: ts.Node): Scope | null {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isSourceFile(p) || isFunctionLike(p)) return p;
    p = p.parent;
  }
  return null;
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
  if (ts.isIdentifier(name)) return [name];
  const out: ts.Identifier[] = [];
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue;
    out.push(...bindingIdentifiers(el.name));
  }
  return out;
}

/** `const x = await import("m")` / `= import("m")` — the two spellings of a dynamic-import binding. */
function isDynamicImportInitializer(init: ts.Expression | undefined): boolean {
  if (init === undefined) return false;
  const expr = ts.isAwaitExpression(init) ? init.expression : init;
  return ts.isCallExpression(expr) && expr.expression.kind === ts.SyntaxKind.ImportKeyword;
}

/** `var` (function-scoped) vs `let`/`const` (block-scoped). */
function isVarDeclaration(decl: ts.VariableDeclaration): boolean {
  const list = decl.parent;
  if (list === undefined || !ts.isVariableDeclarationList(list)) return false;
  return (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
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
  | { kind: "import"; spec: string; imported: string }
  | { kind: "unbound" };

function resolveBinding(facts: ModuleFacts, name: string, from: ts.Node): Binding {
  let scope: Scope | null = scopeOf(from) ?? facts.sf;
  while (scope) {
    const here = facts.extents.get(scope)?.get(name);
    if (here && here.length > 0) return { kind: "local", scope, extent: here };
    // A shadow is a real answer, not a miss: the name is bound to something
    // with no provenance, so the walk STOPS rather than inheriting an outer
    // binding's extent.
    if (facts.shadows.get(scope)?.has(name)) return { kind: "local", scope, extent: [] };
    scope = scopeOf(scope);
  }
  const imported = facts.imports.get(name);
  if (imported !== undefined) return { kind: "import", ...imported };
  return { kind: "unbound" };
}

/** Identity of the binding a reference resolves to — the dedup key. */
function bindingKey(name: string, binding: Binding): string | null {
  if (binding.kind === "local") return `${name}@${binding.scope.kind}:${binding.scope.pos}`;
  if (binding.kind === "import") return `${name}@import`;
  return null;
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

  const bindPattern = (name: ts.BindingName, spec: string): void => {
    if (ts.isIdentifier(name)) imports.set(name.text, { spec, imported: name.text });
    else if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        if (!ts.isIdentifier(el.name)) continue;
        // `const { spawnSync: run } = await import(...)` carries the source name
        // in propertyName, exactly as a named import does.
        const imported =
          el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
        imports.set(el.name.text, { spec, imported });
      }
    }
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
        if (decl && ts.isVariableDeclaration(decl)) bindPattern(decl.name, arg.text);
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
      // A dynamic-import binding is recorded in `imports` (with the name it
      // carries in the TARGET module) by the clause above. Registering a local
      // extent for it too would shadow that entry with the bare `await
      // import(...)` expression, which names no provenance by itself and
      // carries no edge to follow into an in-repo module. LIMIT: such a binding
      // is therefore modelled as module-scoped, so two dynamic imports of the
      // same local name in different scopes share one entry.
      if (!isDynamicImportInitializer(node.initializer)) {
        for (const id of bindingIdentifiers(node.name)) {
          // A declaration with NO initializer still BINDS the name here, so a
          // later write inside a nested function attaches to this binding rather
          // than falling through to a same-named outer one.
          if (node.initializer) addExtentIn(home, id.text, node.initializer);
          else addShadowIn(home, id.text);
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) addExtent(node.name.text, node, node);
    if (ts.isClassDeclaration(node) && node.name) addExtent(node.name.text, node, node);

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
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.expression.left)
    ) {
      writes.push({ name: node.expression.left.text, at: node, value: node.expression.right });
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

  return { sf, imports, extents, shadows };
}

/** Strip parentheses and `as` casts, which otherwise hide the real callee. */
function unwrap(node: ts.Expression): ts.Expression {
  let n: ts.Expression = node;
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) n = n.expression;
  return n;
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
  let hit = false;
  const walk = (n: ts.Node): void => {
    if (hit) return;
    // process.env.X, and `const { env } = process` binding used as env.X
    if (ts.isPropertyAccessExpression(n)) {
      const text = n.getText(facts.sf);
      if (text.startsWith("process.env")) hit = true;
    }
    // `const { env } = process` registers `process` as env's extent, so what
    // reaches here is the initializer. Narrow to exactly that: `process` as the
    // object of a member access is handled by the `process.env` prefix test
    // above, and treating every bare mention as provenance would swallow the
    // computed-access case that must report as UNCLASSIFIABLE instead.
    if (ts.isIdentifier(n) && n.text === "process" && ts.isVariableDeclaration(n.parent)) {
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
          if (target === null) continue; // node_modules, pure by L-2
          const tf = factsFor(target);
          if (tf === null) {
            unresolved.push(`unparseable in-repo module ${imported.spec}`);
            continue;
          }
          // By the name it carries THERE, not the local alias.
          for (const ext of moduleScopeExtent(tf, imported.imported)) {
            if (visit(ext, tf, target)) return true;
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
        !ts.isStringLiteral(n.argumentExpression)
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

  let found = false;
  const walk = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      /^premise(Holds)?$/.test(n.expression.text) &&
      n.getStart(facts.sf) < call.getStart(facts.sf) &&
      referencesName(n, binding)
    ) {
      found = true;
    }
    ts.forEachChild(n, walk);
  };
  walk(facts.sf);
  return found;
}
