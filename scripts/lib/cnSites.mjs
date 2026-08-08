/**
 * cnSites.mjs — the shared site extractor for this arc's two one-shot scripts.
 *
 * Both `scripts/audit-cn-operand-kinds.mjs` (spec §4.1's operand-kind audit) and
 * `scripts/verify-cn-operand-parity.mjs` (spec §4.2 mechanism 2) have to answer the same
 * question — "what are the top-level operands of each className class-list expression in
 * this file?" — on two sides of a migration.  They share this module so the two proofs
 * cannot disagree about what a site is.
 *
 * A SITE is a whitespace-separated class-list expression in one of two forms:
 *
 *   array-join   [A, B, C].join(" ")                    (pre-migration)
 *                [A, B].filter(Boolean).join(" ")       (pre-migration, filtered)
 *   cn-call      cn(A, B, C)                            (post-migration)
 *
 * The separator must be a NON-EMPTY WHITESPACE string literal, at any quote style
 * (`" "`, `' '`, `` ` ` ``).  That is the same key spec §7.1 gives the tracked recognizer,
 * and it is what distinguishes a class list from data: every data join in this tree uses a
 * non-whitespace separator (spec §2.2).
 *
 * Extraction is AST-based rather than textual.  The plan sketches a backward bracket walk;
 * the TypeScript compiler API is a strict superset of it — it sees through comments,
 * nested brackets, JSX, and template literals identically, and it is the house pattern
 * (a dozen tracked meta-tests in this repo already scan this way).  What the plan actually
 * requires is that BOTH scripts extract the same way, which is what this module is.
 */

import path from "node:path";

import ts from "typescript";

/** Parse a file's text with the right script kind for its extension. */
export function parseSource(relPath, text) {
  const ext = path.extname(relPath).toLowerCase();
  const scriptKind =
    ext === ".tsx"
      ? ts.ScriptKind.TSX
      : ext === ".jsx"
        ? ts.ScriptKind.JSX
        : ext === ".js" || ext === ".mjs" || ext === ".cjs"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  return ts.createSourceFile(
    relPath,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind,
  );
}

function isStringLiteralNode(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/** A non-empty, all-whitespace string literal — the class-list separator key. */
export function isWhitespaceSeparator(node) {
  return isStringLiteralNode(node) && node.text.length > 0 && /^\s+$/.test(node.text);
}

/**
 * Match `[...].join(<ws>)` or `[...].filter(Boolean).join(<ws>)`.
 * Returns `{ operands, hasFilterMarker }` or null.
 */
function matchArrayJoin(node) {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== "join") return null;
  if (node.arguments.length !== 1 || !isWhitespaceSeparator(node.arguments[0])) return null;

  let receiver = node.expression.expression;
  let hasFilterMarker = false;
  if (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === "filter"
  ) {
    hasFilterMarker = true;
    receiver = receiver.expression.expression;
  }
  if (!ts.isArrayLiteralExpression(receiver)) return null;
  return { operands: [...receiver.elements], hasFilterMarker };
}

/** Match `cn(...)` — the post-migration form. */
function matchCnCall(node) {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "cn") return null;
  return { operands: [...node.arguments], hasFilterMarker: false };
}

/**
 * Every site in a parsed file, in source order.
 *
 * Both forms are collected in one pass, so a tree that is mid-migration (some sites
 * rewritten, some not) yields the same total rather than silently losing half of them —
 * which is what would let a partial migration pass a count premise.
 */
export function collectSites(sourceFile) {
  const sites = [];
  const visit = (node) => {
    const arrayJoin = matchArrayJoin(node);
    if (arrayJoin) {
      sites.push({ node, form: "array-join", ...arrayJoin });
    } else {
      const cnCall = matchCnCall(node);
      if (cnCall) sites.push({ node, form: "cn-call", ...cnCall });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  sites.sort((a, b) => a.node.getStart(sourceFile) - b.node.getStart(sourceFile));
  return sites;
}

/** Printable, comment-and-whitespace-insensitive text for an operand node. */
export function operandText(node, sourceFile) {
  return node
    .getText(sourceFile)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 1-based line number of a node. */
export function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
