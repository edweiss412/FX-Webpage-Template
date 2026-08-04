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

/** Every identifier referenced anywhere inside a node. */
function referencedNames(node: ts.Node): Set<string> {
  const out = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) out.add(n.text);
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

type ModuleFacts = {
  sf: ts.SourceFile;
  /** local name → module specifier it was imported from. */
  imports: Map<string, string>;
  /** local name → the nodes forming its extent (initializer/body + writes). */
  extents: Map<string, ts.Node[]>;
  /** Recognized-but-unresolvable constructs found anywhere in the file. */
  unclassifiable: string[];
};

function moduleFacts(path: string): ModuleFacts | null {
  if (!existsSync(path)) return null;
  const sf = parse(path, readFileSync(path, "utf8"));
  const imports = new Map<string, string>();
  const extents = new Map<string, ts.Node[]>();
  const unclassifiable: string[] = [];

  const addExtent = (name: string, node: ts.Node): void => {
    const list = extents.get(name) ?? [];
    list.push(node);
    extents.set(name, list);
  };

  const bindPattern = (name: ts.BindingName, spec: string): void => {
    if (ts.isIdentifier(name)) imports.set(name.text, spec);
    else if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) if (ts.isIdentifier(el.name)) imports.set(el.name.text, spec);
    }
  };

  const walk = (node: ts.Node): void => {
    // static imports, including aliases and namespaces
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, spec);
      const b = clause?.namedBindings;
      if (b && ts.isNamespaceImport(b)) imports.set(b.name.text, spec);
      if (b && ts.isNamedImports(b)) for (const e of b.elements) imports.set(e.name.text, spec);
    }

    // dynamic import, destructured or not
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        let p: ts.Node = node;
        while (p.parent && !ts.isVariableDeclaration(p.parent)) p = p.parent;
        const decl = p.parent;
        if (decl && ts.isVariableDeclaration(decl)) bindPattern(decl.name, arg.text);
      } else {
        unclassifiable.push(`dynamic import() with a non-literal specifier at ${pos(sf, node)}`);
      }
    }

    // computed member access on `process`
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(unwrap(node.expression)) &&
      (unwrap(node.expression) as ts.Identifier).text === "process" &&
      !ts.isStringLiteral(node.argumentExpression)
    ) {
      unclassifiable.push(`computed member access on process at ${pos(sf, node)}`);
    }

    // Declarations and their extents -- MODULE SCOPE ONLY. Registering every
    // scope into one flat map makes names collide across unrelated functions:
    // probed, `reportEnvelope`'s parameter `res` collided with a `const res =
    // resolveClaims(realGitSurface(), ...)` inside main(), and every test
    // importing reportEnvelope classified as environment-touching. That is the
    // over-classification this rule exists to avoid (spec AC-10b).
    if (ts.isVariableDeclaration(node) && isModuleScope(node)) {
      if (ts.isIdentifier(node.name) && node.initializer) {
        addExtent(node.name.text, node.initializer);
      }
      if (ts.isObjectBindingPattern(node.name) && node.initializer) {
        for (const el of node.name.elements) {
          if (ts.isIdentifier(el.name)) addExtent(el.name.text, node.initializer);
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && isModuleScope(node)) {
      addExtent(node.name.text, node);
    }
    if (ts.isClassDeclaration(node) && node.name && isModuleScope(node)) {
      addExtent(node.name.text, node);
    }

    // a statement that WRITES to a binding is part of that binding's extent
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.expression.left)
    ) {
      addExtent(node.expression.left.text, node.expression.right);
    }

    ts.forEachChild(node, walk);
  };
  walk(sf);
  return { sf, imports, extents, unclassifiable };
}

/** Strip parentheses and `as` casts, which otherwise hide the real callee. */
function unwrap(node: ts.Expression): ts.Expression {
  let n: ts.Expression = node;
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n)) n = n.expression;
  return n;
}

/** A declaration directly under the source file, not nested in a function. */
function isModuleScope(node: ts.Node): boolean {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isSourceFile(p)) return true;
    if (
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) ||
      ts.isMethodDeclaration(p)
    ) {
      return false;
    }
    p = p.parent;
  }
  return false;
}

const pos = (sf: ts.SourceFile, n: ts.Node): string =>
  `line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;

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
    if (ts.isIdentifier(n)) {
      const spec = facts.imports.get(n.text);
      if (spec && isProvenanceModule(spec)) hit = true;
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
      for (const name of referencedNames(node)) {
        const key = `${path}#${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const spec = f.imports.get(name);
        if (spec !== undefined) {
          if (isProvenanceModule(spec)) return true;
          const target = resolveSpecifier(root, path, spec);
          if (target === null) continue; // node_modules, pure by L-2
          const tf = factsFor(target);
          if (tf === null) {
            unresolved.push(`unparseable in-repo module ${spec}`);
            continue;
          }
          for (const ext of tf.extents.get(name) ?? []) {
            if (visit(ext, tf, target)) return true;
          }
          continue;
        }
        for (const ext of f.extents.get(name) ?? []) {
          if (visit(ext, f, path)) return true;
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
      if (!arg || !ts.isStringLiteral(arg)) out.push("dynamic import() with a non-literal specifier");
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
  return out.concat(facts.unclassifiable.filter((u) => u.includes("unparseable")));
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
  let callee: ts.Expression = call.expression;
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
      referencedNames(n).has(binding)
    ) {
      found = true;
    }
    ts.forEachChild(n, walk);
  };
  walk(facts.sf);
  return found;
}
