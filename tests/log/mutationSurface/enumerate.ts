// Pure AST helpers for the mutation-surface discovery meta-test (invariant #10).
// `import ts from "typescript"` throughout — matches `_metaAdminOutcomeContract.test.ts`.
// Do NOT import `authPrimitives.hasDirective` (ts-morph-based, unexported); the
// directive detection below is a from-scratch reimplementation on `ts.Node`.

import { readFileSync } from "node:fs";
import ts from "typescript";

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
