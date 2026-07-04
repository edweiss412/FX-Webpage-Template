// Pure AST helpers for the mutation-surface discovery meta-test (invariant #10).
// `import ts from "typescript"` throughout — matches `_metaAdminOutcomeContract.test.ts`.
// Do NOT import `authPrimitives.hasDirective` (ts-morph-based, unexported); the
// directive detection below is a from-scratch reimplementation on `ts.Node`.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import ts from "typescript";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

const SHOUTY = /^[A-Z][A-Z0-9_]+$/;
const ADMIN_GATES = new Set([
  "requireAdmin",
  "requireAdminIdentity",
  "requireDeveloper",
  "requireDeveloperIdentity",
]);
const isFnLike = (n: ts.Node) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isClassDeclaration(n) ||
  ts.isClassExpression(n);

export function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function leadingDirective(stmts: readonly ts.Statement[], d: string): boolean {
  for (const st of stmts) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === d) return true;
      continue;
    }
    break;
  }
  return false;
}
export function moduleHasUseServer(sf: ts.SourceFile) {
  return leadingDirective(sf.statements, "use server");
}
export function functionBodyHasUseServer(node: ts.FunctionLikeDeclaration) {
  return !!node.body && ts.isBlock(node.body) && leadingDirective(node.body.statements, "use server");
}

/** True if `name` is bound anywhere in a `BindingName` (identifier, object/array
 * destructuring, incl. rename `{ log: x }` binds `x` not `log`, and `{ log }` binds `log`). */
function bindingBindsName(bn: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(bn)) return bn.text === name;
  for (const el of bn.elements) {
    if (ts.isOmittedExpression(el)) continue;
    if (bindingBindsName(el.name, name)) return true;
  }
  return false;
}

export function isLocallyRebound(callNode: ts.Node, name: string): boolean {
  let n: ts.Node | undefined = callNode.parent;
  while (n && !ts.isSourceFile(n)) {
    let found = false;
    // block-scoped decls (incl. destructuring) + local function decls
    if (ts.isBlock(n) || isFnLike(n))
      ts.forEachChild(n, (ch) => {
        if (ts.isVariableStatement(ch))
          for (const d of ch.declarationList.declarations)
            if (bindingBindsName(d.name, name)) found = true;
        if (ts.isFunctionDeclaration(ch) && ch.name?.text === name) found = true;
      });
    // function/method/arrow parameters (incl. destructured params)
    if (isFnLike(n))
      for (const p of (n as ts.FunctionLikeDeclaration).parameters ?? [])
        if (bindingBindsName(p.name, name)) found = true;
    // catch clause variable: catch (log) { ... }
    if (ts.isCatchClause(n) && n.variableDeclaration && bindingBindsName(n.variableDeclaration.name, name))
      found = true;
    if (found) return true;
    n = n.parent;
  }
  return false;
}

export function scanBody(root: ts.Node, opts: { descend: boolean }) {
  const res = { adminOutcome: false, codedLog: false, adminGated: false, rpc: false, writeBuilder: false };
  const WRITE = new Set(["insert", "update", "delete", "upsert"]);
  const imports = importBindingOk(root.getSourceFile());
  const realBinding = (call: ts.Node, name: "log" | "logAdminOutcome") =>
    imports[name] && !isLocallyRebound(call, name);
  const visit = (n: ts.Node, isRoot: boolean) => {
    if (!isRoot && !opts.descend && isFnLike(n)) return; // action scope: don't descend into nested fns
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      if (
        ts.isIdentifier(c) &&
        c.text === "logAdminOutcome" &&
        n.parent &&
        ts.isAwaitExpression(n.parent) &&
        realBinding(n, "logAdminOutcome")
      )
        res.adminOutcome = true;
      if (ts.isIdentifier(c) && ADMIN_GATES.has(c.text)) res.adminGated = true;
      if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.name)) {
        if (WRITE.has(c.name.text)) res.writeBuilder = true;
        if (c.name.text === "rpc") res.rpc = true;
        if (
          ts.isIdentifier(c.expression) &&
          c.expression.text === "log" &&
          ["info", "warn", "error"].includes(c.name.text) &&
          realBinding(n, "log")
        ) {
          const a1 = n.arguments[1];
          if (a1 && ts.isObjectLiteralExpression(a1))
            for (const p of a1.properties)
              if (
                ts.isPropertyAssignment(p) &&
                ((ts.isIdentifier(p.name) && p.name.text === "code") ||
                  (ts.isStringLiteral(p.name) && p.name.text === "code")) &&
                ts.isStringLiteral(p.initializer) &&
                SHOUTY.test(p.initializer.text)
              )
                res.codedLog = true;
        }
      }
    }
    ts.forEachChild(n, (ch) => visit(ch, false));
  };
  visit(root, true);
  return res;
}

export function importBindingOk(sf: ts.SourceFile) {
  const out = { log: false, logAdminOutcome: false };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const mod = st.moduleSpecifier.text;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb))
      for (const el of nb.elements) {
        if (el.name.text === "log" && mod === "@/lib/log") out.log = true;
        if (el.name.text === "logAdminOutcome" && mod === "@/lib/log/logAdminOutcome")
          out.logAdminOutcome = true;
      }
  }
  return out;
}

// ── Task 3: surface enumeration (routes / module actions / inline actions) ──
// + admin classification + default-export detection ────────────────────────

export type SurfaceUnit = {
  file: string;
  fn: string;
  kind: "route" | "module-action" | "inline-action";
  node: ts.Node;
  admin: boolean;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** True if a `"use server"` module has ANY default export — banned (spec §4.1
 * Codex R19 F2): a default-exported action would be an un-named surface that
 * evades per-function keying. Covers `export default async function m(){}`
 * (a FunctionDeclaration with both export+default modifiers) and
 * `export default mutate;` (an ExportAssignment that is not `export =`). */
export function moduleDefaultExports(sf: ts.SourceFile): boolean {
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st) && !st.isExportEquals) return true;
    if (ts.canHaveModifiers(st)) {
      const mods = ts.getModifiers(st);
      const hasExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const hasDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (hasExport && hasDefault) return true;
    }
  }
  return false;
}

/** Every mutating HTTP method name (`POST`/`PUT`/`PATCH`/`DELETE`) this route
 * file exports — as a top-level exported `FunctionDeclaration`, an exported
 * `VariableStatement`, or a named-export `ExportDeclaration` (re-export, e.g.
 * `export { POST } from "./x"`, or a local export list, incl. rename `export
 * { handler as POST }` — the EXTERNAL/exported name is what's checked). */
export function routeMutatingMethods(sf: ts.SourceFile): string[] {
  const found = new Set<string>();
  for (const st of sf.statements) {
    if (ts.canHaveModifiers(st)) {
      const mods = ts.getModifiers(st);
      const isExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExport && ts.isFunctionDeclaration(st) && st.name && MUTATING_METHODS.has(st.name.text))
        found.add(st.name.text);
      if (isExport && ts.isVariableStatement(st))
        for (const d of st.declarationList.declarations)
          if (ts.isIdentifier(d.name) && MUTATING_METHODS.has(d.name.text)) found.add(d.name.text);
    }
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause))
      for (const el of st.exportClause.elements)
        if (MUTATING_METHODS.has(el.name.text)) found.add(el.name.text);
  }
  return [...found];
}

/** Resolve a local declaration by name — either a `FunctionDeclaration`, or a
 * `const`/`let` whose initializer is an arrow/function expression. Used to
 * resolve `export { local as mutate }` to the declaration whose body is the
 * checked scope (the specifier is NOT itself a checkable scope). */
function findLocalDeclNode(sf: ts.SourceFile, name: string): ts.Node | undefined {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st;
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (
          ts.isIdentifier(d.name) &&
          d.name.text === name &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        )
          return d.initializer;
  }
  return undefined;
}

/** Every exported async-function surface in a `"use server"` module, from ALL
 * export forms (Codex R3 HIGH — none can hide): (i) an export-modified
 * `FunctionDeclaration`; (ii) an export-modified `VariableStatement` whose
 * initializer is an arrow/function expression; (iii) a LOCAL `export { x }` /
 * `export { local as mutate }` list (no `from` clause — a re-export names
 * another module's symbol, checked where it is declared, so it is skipped
 * here). */
function collectModuleActions(sf: ts.SourceFile): { fn: string; node: ts.Node }[] {
  const out: { fn: string; node: ts.Node }[] = [];
  const seen = new Set<string>();
  const add = (fn: string, node: ts.Node) => {
    if (seen.has(fn)) return;
    seen.add(fn);
    out.push({ fn, node });
  };
  for (const st of sf.statements) {
    if (ts.canHaveModifiers(st)) {
      const mods = ts.getModifiers(st);
      const isExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDefault = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (isExport && !isDefault) {
        if (ts.isFunctionDeclaration(st) && st.name) add(st.name.text, st);
        if (ts.isVariableStatement(st))
          for (const d of st.declarationList.declarations)
            if (
              ts.isIdentifier(d.name) &&
              d.initializer &&
              (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
            )
              add(d.name.text, d.initializer);
      }
    }
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause))
      for (const el of st.exportClause.elements) {
        const localName = (el.propertyName ?? el.name).text;
        const exportedName = el.name.text;
        const declNode = findLocalDeclNode(sf, localName);
        if (declNode) add(exportedName, declNode);
      }
  }
  return out;
}

/** The nearest naming context for a function-scoped inline action: its own
 * name (named function declaration/expression), or the identifier/property it
 * is assigned to (`const selectIdentityFormAction = async (...) => {...}`). */
function inlineName(node: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name)
    return node.name.text;
  const p = node.parent;
  if (p) {
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
      return p.name.text;
  }
  return undefined;
}

/** Every function-scoped inline `"use server"` action anywhere in a file that
 * does NOT itself carry a module-level directive (a function/arrow whose
 * block body opens with the directive, e.g. a React form-action). */
function collectInlineActions(sf: ts.SourceFile): { fn: string; node: ts.Node }[] {
  const out: { fn: string; node: ts.Node }[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) &&
      functionBodyHasUseServer(n)
    ) {
      const fn = inlineName(n);
      if (fn) out.push({ fn, node: n });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const isAdminRoutePath = (file: string) => file.includes("app/api/admin/");

function collectFileSurfaceUnits(sf: ts.SourceFile, file: string): SurfaceUnit[] {
  if (basename(file) === "route.ts") {
    return routeMutatingMethods(sf).map((fn) => ({
      file,
      fn,
      kind: "route" as const,
      node: sf,
      // Admin routes are classified PATH-based only (spec §4.2) — a require*
      // scan would false-positive on e.g. app/api/report/route.ts, which reads
      // admin identity for role-detection, not gating.
      admin: isAdminRoutePath(file),
    }));
  }
  if (moduleHasUseServer(sf))
    return collectModuleActions(sf).map(({ fn, node }) => ({
      file,
      fn,
      kind: "module-action" as const,
      node,
      admin: scanBody(node, { descend: false }).adminGated,
    }));
  return collectInlineActions(sf).map(({ fn, node }) => ({
    file,
    fn,
    kind: "inline-action" as const,
    node,
    admin: scanBody(node, { descend: false }).adminGated,
  }));
}

/** Walk `roots` (typically `app/`, `lib/`, `components/`) for every mutation
 * surface unit — route handlers, module-level server actions, and
 * function-scoped inline actions — skipping `node_modules`/`.next`/`.git`. */
export function collectSurfaceUnits(roots: string[]): SurfaceUnit[] {
  const files = walkSourceFiles(roots).filter(
    (f) => !f.includes("/node_modules/") && !f.includes("/.next/") && !f.includes("/.git/"),
  );
  const units: SurfaceUnit[] = [];
  for (const file of files) units.push(...collectFileSurfaceUnits(parse(file), file));
  return units;
}
