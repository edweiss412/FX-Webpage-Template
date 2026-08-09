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
/**
 * Peel wrappers that change no runtime value: parentheses, `as const` / `as T`,
 * `satisfies T`, and non-null `!`. Without this, `(["a","b"] as const).join(" ")` — which
 * Prettier preserves and which is ordinary TypeScript — is invisible to every proof built
 * on this extractor.
 */
function unwrap(node) {
  let n = node;
  for (;;) {
    if (
      ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isNonNullExpression(n) ||
      // Angle-bracket assertions are valid in `.ts` (`<string[]>[...]`, `<const>" "`).
      ts.isTypeAssertionExpression(n) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n))
    ) {
      n = n.expression;
      continue;
    }
    return n;
  }
}

/**
 * Array-returning methods that can sit between the literal and the `.join()`. Peeling only
 * `.filter` left `[...].map(x => x).join(" ")`, `.slice()`, `.flat()` and `.concat(...)`
 * invisible — and the census guard this replaces DID see those when they sat directly under
 * `className={[`, so missing them is a coverage regression, not a new limit.
 */
const ARRAY_RETURNING_METHODS = new Set([
  "filter",
  "map",
  "slice",
  "flat",
  "flatMap",
  "concat",
  "sort",
  "reverse",
  "toSorted",
  "toReversed",
  "toSpliced",
  "with",
  // Round-5 additions: all return arrays, all were invisible rather than STOPping.
  "copyWithin",
  "fill",
  "splice",
  "valueOf",
]);

/** `.filter(Boolean)` exactly — the ONLY predicate `cn` is equivalent to. */
function isBooleanFilter(call) {
  return (
    call.arguments.length === 1 &&
    ts.isIdentifier(call.arguments[0]) &&
    call.arguments[0].text === "Boolean"
  );
}

function matchArrayJoin(node) {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== "join") return null;
  if (node.arguments.length !== 1) return null;
  const separator = unwrap(node.arguments[0]);
  if (!isWhitespaceSeparator(separator)) return null;

  let receiver = unwrap(node.expression.expression);
  let hasFilterMarker = false;
  let hasForeignFilter = false;
  // A CHAIN of filters, not just one: `.filter(Boolean).filter(Boolean)` is valid and was
  // invisible when only a single link was peeled.
  for (;;) {
    if (
      ts.isCallExpression(receiver) &&
      ts.isPropertyAccessExpression(receiver.expression) &&
      ARRAY_RETURNING_METHODS.has(receiver.expression.name.text)
    ) {
      const method = receiver.expression.name.text;
      if (method === "filter") {
        // `cn` IS `filter(Boolean).join(" ")` — and ONLY that. Any other predicate makes
        // the migration non-equivalent, so it is recorded rather than silently treated as
        // the sanctioned form.
        if (isBooleanFilter(receiver)) hasFilterMarker = true;
        else hasForeignFilter = true;
      } else {
        // Any other array transform also breaks the `cn` equivalence: `cn` reproduces
        // `filter(Boolean)` and nothing else.
        hasForeignFilter = true;
      }
      receiver = unwrap(receiver.expression.expression);
      continue;
    }
    break;
  }
  if (!ts.isArrayLiteralExpression(receiver)) return null;
  return {
    operands: [...receiver.elements],
    hasFilterMarker,
    hasForeignFilter,
    // `cn` always emits ONE ASCII space. A base joined with "  ", "\n" or "\t" has the same
    // form and the same operands but a different rendered string, so the separator's exact
    // value is carried for the parity proof to reconcile.
    separatorText: separator.text,
  };
}

/** Match `cn(...)` — the post-migration form. */
function matchCnCall(node) {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "cn") return null;
  return { operands: [...node.arguments], hasFilterMarker: false, hasForeignFilter: false };
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

/**
 * A stable, comparable rendering of an operand.
 *
 * WHITESPACE IS COLLAPSED ONLY OUTSIDE STRING LITERALS, and comments are dropped only
 * where they are really comments. A regex over the raw text cannot tell either apart, and
 * for a PARITY PROOF that is not a nicety: collapsing inside a literal makes
 * `"a  b"` -> `"a b"` — a real rendered class change — compare equal, which is precisely
 * the drift this script exists to catch. String literals are therefore rendered from their
 * parsed `.text`, exactly, and everything else is structural.
 */
export function operandText(node, sourceFile) {
  const render = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      return JSON.stringify(n.text); // exact: interior whitespace preserved
    }
    if (ts.isIdentifier(n)) return n.text;
    if (ts.isParenthesizedExpression(n)) return `(${render(n.expression)})`;
    if (ts.isAsExpression(n) || ts.isNonNullExpression(n)) return render(n.expression);
    if (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)) return render(n.expression);
    if (ts.isConditionalExpression(n)) {
      return `${render(n.condition)} ? ${render(n.whenTrue)} : ${render(n.whenFalse)}`;
    }
    // `?.` is NOT decoration: `obj.value` throws where `obj?.value` yields undefined, so
    // erasing it made a real behavioural change compare equal.
    if (ts.isPropertyAccessExpression(n)) {
      const q = n.questionDotToken ? "?." : ".";
      return `${render(n.expression)}${q}${n.name.text}`;
    }
    if (ts.isElementAccessExpression(n)) {
      const q = n.questionDotToken ? "?." : "";
      return `${render(n.expression)}${q}[${render(n.argumentExpression)}]`;
    }
    if (ts.isBinaryExpression(n)) {
      return `${render(n.left)} ${n.operatorToken.getText(sourceFile)} ${render(n.right)}`;
    }
    if (ts.isCallExpression(n)) {
      const q = n.questionDotToken ? "?." : "";
      return `${render(n.expression)}${q}(${n.arguments.map(render).join(", ")})`;
    }
    if (n.kind === ts.SyntaxKind.NullKeyword) return "null";
    if (n.kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (n.kind === ts.SyntaxKind.FalseKeyword) return "false";
    // Fallback for shapes not modelled above: collapse whitespace only in the regions that
    // are NOT string literals, so a literal's bytes still cannot be silently normalized.
    return collapseOutsideLiterals(n, sourceFile);
  };
  return render(node);
}

/** Collapse runs of whitespace except inside string/template literal spans. */
function collapseOutsideLiterals(node, sourceFile) {
  const start = node.getStart(sourceFile);
  const text = node.getText(sourceFile);
  const protectedRanges = [];
  const collect = (n) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isRegularExpressionLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      // Regex literals too: whitespace inside `/  /` is SEMANTIC, and collapsing it made
      // `/  /.test(v) ? a : b` and `/ /.test(v) ? a : b` compare equal while selecting
      // different branches.
      protectedRanges.push([n.getStart(sourceFile) - start, n.getEnd() - start]);
    }
    ts.forEachChild(n, collect);
  };
  collect(node);
  const inProtected = (i) => protectedRanges.some(([a, b]) => i >= a && i < b);
  let out = "";
  let pendingSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inProtected(i) && /\s/.test(ch)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      if (out.length > 0) out += " ";
      pendingSpace = false;
    }
    out += ch;
  }
  return out.trim();
}

/** 1-based line number of a node. */
export function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
