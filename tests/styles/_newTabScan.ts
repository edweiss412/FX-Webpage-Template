/**
 * tests/styles/_newTabScan.ts
 *
 * Scanner for the structural guard in _metaNewTabAnnouncement.test.ts, spec 2026-07-25-newtab-announcement-family §6: every
 * external link under components/ and app/ must announce that it opens a new
 * tab, per anchor -- not per file.
 *
 * WHY PER-ANCHOR AST RATHER THAN A LEXICAL FILE SCAN (§6): after the sweep every
 * family file contains a qualifying token, so a per-file check would pass a NEW
 * unannounced anchor added to any of them -- the most probable regression.
 * step3ReviewSections.tsx alone holds six external anchors, where one import
 * would satisfy the whole file.
 *
 * WHY `_blank` AS A VALUE RATHER THAN `target="_blank"` AS AN ATTRIBUTE LITERAL:
 * four of the family's anchors apply the attribute through a conditional spread,
 * so an attribute-literal matcher misses exactly the anchors the backlog item is
 * about. That undercount (18 vs 23) is the defect this guard exists to prevent.
 *
 * The scanner is exposed through the `scanSource` seam so the synthetic
 * self-tests below can drive every accept/reject branch. Live-tree coverage is
 * NOT sufficient: the tree exercises only literal targets and true-polarity
 * spreads, so a scanner supporting today's shapes and nothing else would pass
 * every other assertion while failing open on the rest. Seam precedent:
 * tests/admin/_metaInfoCodeActionability.test.ts:121.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

/** Recursive walk, matching the repo idiom in tests/styles/_classScanUtils.ts. */
export function walkFiles(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walkFiles(p, ext);
    return ext.test(e) ? [p] : [];
  });
}

export const PHRASE = "opens in a new tab";
const HINT = "NewTabHint";
const EXEMPTION = "no-newtab-announcement:";
const LINK_TAGS = new Set(["a", "Link"]);

export type Violation = { file: string; line: number; reason: string };
export type Scan = { anchors: number; violations: Violation[] };

/** Effective `_blank` predicate for an anchor's target (§6 requirement 5). */
type Polarity =
  | { kind: "static" } // unconditionally external
  | { kind: "conditional"; text: string; negated: boolean }
  | { kind: "unresolvable" };

function attrName(a: ts.JsxAttributeLike): string | null {
  return ts.isJsxAttribute(a) ? a.name.getText() : null;
}

function stringOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isJsxExpression(node) && node.expression) return stringOf(node.expression);
  if (ts.isTemplateExpression(node)) {
    // Template with substitutions: concatenate the literal spans so a phrase
    // inside static text is still found (the substitution values are unknown).
    return node.head.text + node.templateSpans.map((s) => s.literal.text).join("");
  }
  return null;
}

/**
 * Does this label expression interpolate a value? A template like
 * `${alt} (opens in a new tab)` has NO static destination text, but its
 * destination is the substitution -- so the remainder rule must not reject it.
 * Without this, the correctly-implemented diagram-link label read as
 * "phrase-only". Found while implementing the sweep, not by prose review.
 */
function hasSubstitution(node: ts.Node): boolean {
  const n = ts.isJsxExpression(node) && node.expression ? unparen(node.expression) : node;
  if (!ts.isTemplateExpression(n) || n.templateSpans.length === 0) return false;
  // A substitution only supplies a destination if it can actually be non-empty.
  // `${""} (opens in a new tab)` produced a phrase-only runtime name while
  // passing the remainder rule (review R1 BLOCKING 3).
  return n.templateSpans.some((span) => {
    const e = unparen(span.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      return e.text.trim().length > 0;
    }
    return true; // unknown value: assume it names something
  });
}

/** Strip parentheses: the live spreads are `{...(cond ? {…} : {})}`, whose
 *  expression is a ParenthesizedExpression, not a ConditionalExpression. Missing
 *  this made the scanner blind to all four conditional-spread anchors -- caught by
 *  the synthetic self-test below, not by the live tree. */
function unparen(node: ts.Expression): ts.Expression {
  let n = node;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
}

function isBlank(node: ts.Node | undefined): boolean {
  if (!node) return false;
  return stringOf(node) === "_blank";
}

/** Resolve an in-file object-literal initializer for `{...IDENT}` spreads. */
function resolveObjectLiteral(sf: ts.SourceFile, name: string): ts.ObjectLiteralExpression | null {
  let found: ts.ObjectLiteralExpression | null = null;
  const walk = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      ts.isObjectLiteralExpression(n.initializer)
    ) {
      found = n.initializer;
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return found;
}

/** `{}` — an empty object literal branch carries nothing and is resolvable. */
function isEmptyObject(n: ts.Expression): boolean {
  return ts.isObjectLiteralExpression(n) && n.properties.length === 0;
}

function objectHasBlankTarget(obj: ts.ObjectLiteralExpression): boolean {
  return obj.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === "target" &&
      isBlank(p.initializer),
  );
}

/**
 * Classify how an element becomes `target="_blank"`.
 * Returns null when the element is not an external link at all.
 */
function classifyTarget(sf: ts.SourceFile, attrs: ts.JsxAttributes): Polarity | null {
  for (const a of attrs.properties) {
    // 1. Direct target attribute.
    if (attrName(a) === "target" && ts.isJsxAttribute(a)) {
      const init = a.initializer;
      if (!init) continue;
      if (isBlank(init)) return { kind: "static" };
      if (ts.isJsxExpression(init) && init.expression) {
        const e = unparen(init.expression);
        if (ts.isConditionalExpression(e)) {
          const t = isBlank(e.whenTrue);
          const f = isBlank(e.whenFalse);
          if (t && f) return { kind: "static" }; // both branches external
          if (t) return { kind: "conditional", text: e.condition.getText(), negated: false };
          if (f) return { kind: "conditional", text: e.condition.getText(), negated: true };
          return null; // conditional, but never _blank
        }
        if (isBlank(e)) return { kind: "static" };
        // A target we cannot statically resolve: fail closed.
        return { kind: "unresolvable" };
      }
      continue;
    }
    // 2. Spread attribute carrying target: "_blank".
    if (ts.isJsxSpreadAttribute(a)) {
      const e = unparen(a.expression);
      if (ts.isConditionalExpression(e)) {
        const branches = [e.whenTrue, e.whenFalse].map((b) => unparen(b));
        const opaque = branches.some((b) => !ts.isObjectLiteralExpression(b) && !isEmptyObject(b));
        if (opaque) return { kind: "unresolvable" }; // e.g. `e ? P : {}`
        const t = ts.isObjectLiteralExpression(branches[0]!) && objectHasBlankTarget(branches[0]!);
        const f = ts.isObjectLiteralExpression(branches[1]!) && objectHasBlankTarget(branches[1]!);
        if (t && f) return { kind: "static" };
        if (t) return { kind: "conditional", text: e.condition.getText(), negated: false };
        if (f) return { kind: "conditional", text: e.condition.getText(), negated: true };
        continue;
      }
      if (ts.isObjectLiteralExpression(e)) {
        if (objectHasBlankTarget(e)) return { kind: "static" };
        continue;
      }
      if (ts.isIdentifier(e)) {
        const obj = resolveObjectLiteral(sf, e.text);
        if (obj) {
          if (objectHasBlankTarget(obj)) return { kind: "static" };
          continue;
        }
        // FAIL CLOSED (whole-diff review R1 BLOCKING 1): an imported or
        // helper-built props object can carry target:"_blank" invisibly. The
        // previous `continue` let `<a {...externalLinkProps}>` through with zero
        // findings. We cannot resolve it, so we refuse it.
        return { kind: "unresolvable" };
      }
      // Any other spread expression (call, member access, conditional whose
      // branches are not object literals) is equally unresolvable.
      return { kind: "unresolvable" };
    }
  }
  return null;
}

/** Classify one label string: does it announce, and does it keep a destination? */
function classifyLabelText(text: string): "ok" | "phrase-only" | "none" {
  if (!text.includes(PHRASE)) return "none";
  // §6 req 4: the remainder must carry a destination. Strip the phrase AND
  // punctuation/whitespace so "(opens in a new tab)" fails too.
  // replaceAll: stripping only the FIRST occurrence let
  // "(opens in a new tab) (opens in a new tab)" pass, because the second copy
  // was mistaken for a destination (review R1 BLOCKING 3).
  const remainder = text
    .split(PHRASE)
    .join("")
    .replace(/[^\p{L}\p{N}]/gu, "");
  return remainder.length > 0 ? "ok" : "phrase-only";
}

/**
 * A label may be a CONDITIONAL expression -- the empty-interpolation fallbacks
 * (§5) are written as ternaries. Every branch must announce, otherwise the
 * anchor is silent on whichever branch is taken at runtime. Discovered while
 * implementing the sweep: the first scanner returned "none" for any ternary
 * label and flagged six correctly-fixed anchors.
 */
function labelAnnounces(
  attrs: ts.JsxAttributes,
  polarity?: Polarity,
): "ok" | "phrase-only" | "none" | "conditional-ok" {
  for (const a of attrs.properties) {
    if (attrName(a) !== "aria-label" || !ts.isJsxAttribute(a) || !a.initializer) continue;
    const init = a.initializer;
    const expr =
      ts.isJsxExpression(init) && init.expression ? unparen(init.expression) : (init as ts.Node);
    if (ts.isConditionalExpression(expr)) {
      const nodes = [expr.whenTrue, expr.whenFalse];
      const branches = nodes.map((b) => stringOf(b));
      if (branches.some((t) => t === null)) return "none";
      const substituted = nodes.map(hasSubstitution);
      const verdicts = (branches as string[]).map((t, i) =>
        substituted[i] && classifyLabelText(t) === "phrase-only" ? "ok" : classifyLabelText(t),
      );
      if (verdicts.includes("phrase-only")) return "phrase-only";
      // For a CONDITIONAL target, a label whose phrase sits in exactly the
      // external branch is CORRECT, not a defect: `external ? "Go (opens in a
      // new tab)" : "Go"` announces precisely when the tab opens. Requiring both
      // branches to announce rejected that valid shape (review R1 BLOCKING 3),
      // while for a STATIC target a silent branch really is a hole.
      if (polarity?.kind === "conditional") {
        const wantIdx = polarity.negated ? 1 : 0;
        const otherIdx = polarity.negated ? 0 : 1;
        if (verdicts[wantIdx] === "ok" && verdicts[otherIdx] === "none") return "conditional-ok";
        if (verdicts[wantIdx] === "ok" && verdicts[otherIdx] === "ok") return "ok";
        return "none";
      }
      if (verdicts.includes("none")) return "none";
      return "ok";
    }
    const text = stringOf(init);
    if (text === null) return "none";
    const verdict = classifyLabelText(text);
    return verdict === "phrase-only" && hasSubstitution(init) ? "ok" : verdict;
  }
  return "none";
}

/** Is this element (or an ancestor up to the anchor) hidden from the acc name? */
function hidesFromAccName(el: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  for (const a of attrs.properties) {
    const n = attrName(a);
    if (!ts.isJsxAttribute(a)) continue;
    if (n === "aria-hidden" || n === "hidden") {
      // Presence-only classification wrongly rejected `hidden={false}` and
      // `aria-hidden={false}` (review R1 HIGH 4). Read the VALUE: bare attribute
      // means true; an explicit `false` literal means visible.
      if (!a.initializer) return true;
      const init = a.initializer;
      if (ts.isJsxExpression(init) && init.expression) {
        const e = unparen(init.expression);
        if (e.kind === ts.SyntaxKind.FalseKeyword) continue;
        if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
        const lit = stringOf(e);
        if (lit === "false") continue;
        return true; // dynamic: assume hidden (fail closed)
      }
      const v = stringOf(init);
      if (v === "false") continue;
      return true;
    }
    if (n === "className") {
      const v = a.initializer ? (stringOf(a.initializer) ?? "") : "";
      // `invisible` is Tailwind's visibility:hidden and was unrecognized.
      if (/\b(hidden|invisible)\b/.test(v)) return true;
    }
    if (n === "style") {
      const v = a.initializer?.getText() ?? "";
      if (/display\s*:\s*['"]?none|visibility\s*:\s*['"]?hidden/.test(v)) return true;
    }
  }
  return false;
}

/**
 * Does every NewTabHint sit immediately after a real space text node (§3.1)?
 *
 * Mutation-proven necessary: deleting the space before a hint left the entire
 * suite green, because only two anchors have an anchored accessible-name
 * assertion and the rest of the guard only checked PRESENCE. That is the
 * "detailsfor …" defect the spec says already shipped here once.
 *
 * Accepts either spelling prettier produces: a literal JSX space (`Go <Hint />`)
 * or an explicit `{" "}` expression, including when it is the last child of the
 * preceding line.
 */
function hintHasSiblingSpace(root: ts.Node): boolean {
  let ok = true;

  /** Is `node` separated from what precedes it, among `children`? */
  const separatedAt = (children: ts.NodeArray<ts.JsxChild>, idx: number): boolean | "first" => {
    for (let j = idx - 1; j >= 0; j -= 1) {
      const prev = children[j]!;
      if (ts.isJsxText(prev)) {
        const t = prev.text;
        if (t.trim().length === 0) {
          if (/\n/.test(t)) continue; // stripped by JSX: keep looking
          return true; // real same-line space run
        }
        const trailing = t.slice(t.trimEnd().length);
        return trailing.length > 0 && !/\n/.test(trailing);
      }
      if (
        ts.isJsxExpression(prev) &&
        prev.expression &&
        ts.isStringLiteral(prev.expression) &&
        /^[ \u00a0]+$/.test(prev.expression.text)
      ) {
        return true; // explicit {" "}
      }
      return false; // adjacent content
    }
    return "first"; // nothing precedes it at this level
  };

  const isHint = (n: ts.Node): boolean =>
    (ts.isJsxSelfClosingElement(n) && n.tagName.getText() === HINT) ||
    (ts.isJsxElement(n) && n.openingElement.tagName.getText() === HINT);

  // Parent chain so a hint that HEADS a wrapper can inherit the wrapper's
  // separator: `Go <span hidden={false}><NewTabHint /></span>` is correctly
  // separated -- the space sits before the span, not before the hint. Checking
  // only immediate siblings reported a false positive there.
  const parents = new Map<ts.Node, { children: ts.NodeArray<ts.JsxChild>; index: number }>();
  const index = (n: ts.Node): void => {
    const kids = ts.isJsxElement(n) ? n.children : ts.isJsxFragment(n) ? n.children : null;
    if (kids) kids.forEach((c, i) => parents.set(c, { children: kids, index: i }));
    ts.forEachChild(n, index);
  };
  index(root);

  const check = (node: ts.Node): void => {
    // Walk UP to the nearest indexed JSX child. A hint can sit inside a
    // JsxExpression (`{cond ? <NewTabHint /> : null}`) or a wrapper element, and
    // in both cases the separator belongs to that container's position among its
    // siblings, not to the hint's own.
    let cur: ts.Node | undefined = node;
    while (cur) {
      const pos = parents.get(cur);
      if (pos) {
        const verdict = separatedAt(pos.children, pos.index);
        if (verdict === true) return;
        if (verdict === false) break;
        // "first": heads its parent's children, so inherit the parent's position.
        const parentNode = findParentNode(root, pos.children);
        if (!parentNode) break;
        cur = parentNode.parent as ts.Node | undefined;
        if (parents.has(parentNode)) cur = parentNode;
        continue;
      }
      cur = cur.parent as ts.Node | undefined;
    }
    ok = false;
  };

  const walk = (n: ts.Node): void => {
    if (isHint(n)) check(n);
    ts.forEachChild(n, walk);
  };
  walk(root);
  return ok;
}

/** The element/fragment whose `children` array is `kids`. */
function findParentNode(root: ts.Node, kids: ts.NodeArray<ts.JsxChild>): ts.Node | undefined {
  let found: ts.Node | undefined;
  const walk = (n: ts.Node): void => {
    if ((ts.isJsxElement(n) || ts.isJsxFragment(n)) && n.children === kids) found = n;
    ts.forEachChild(n, walk);
  };
  walk(root);
  return found;
}

/** One entry per NewTabHint instance found under the anchor, so an unconditional
 *  hint next to a gated one cannot hide behind the gated one's conditions
 *  (review R1 BLOCKING 2: the previous shape kept a single overwritten value). */
type HintInstance = { hidden: boolean; conditions: string[] };
type HintFind = {
  found: boolean;
  instances: HintInstance[];
  hidden: boolean;
  conditions: string[];
  separated: boolean;
};

/** Locate NewTabHint under an anchor, tracking hidden-ness and gating conditions. */
function findHint(anchor: ts.JsxElement | ts.JsxSelfClosingElement): HintFind {
  const out: HintFind = {
    found: false,
    instances: [],
    hidden: false,
    conditions: [],
    separated: false,
  };
  if (!ts.isJsxElement(anchor)) return out;
  const walk = (n: ts.Node, hidden: boolean, conds: string[]): void => {
    let nextHidden = hidden;
    const nextConds = conds;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = ts.isJsxElement(n) ? n.openingElement.tagName.getText() : n.tagName.getText();
      if (tag === HINT) {
        out.found = true;
        out.instances.push({ hidden, conditions: conds });
        if (hidden) out.hidden = true;
        out.conditions = conds;
        return;
      }
      if (hidesFromAccName(n)) nextHidden = true;
    }
    if (ts.isParenthesizedExpression(n)) {
      walk(n.expression, nextHidden, nextConds);
      return;
    }
    if (ts.isConditionalExpression(n)) {
      // Hint in the true branch is gated by the condition; false branch by !cond.
      walk(n.whenTrue, nextHidden, [...nextConds, n.condition.getText()]);
      walk(n.whenFalse, nextHidden, [...nextConds, `!(${n.condition.getText()})`]);
      return;
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      walk(n.right, nextHidden, [...nextConds, n.left.getText()]);
      return;
    }
    ts.forEachChild(n, (c) => walk(c, nextHidden, nextConds));
  };
  // Seed with the ANCHOR's own hidden state: traversal starting at children
  // missed `<a hidden>...<NewTabHint /></a>` (review R1 HIGH 4).
  const anchorHidden = hidesFromAccName(anchor);
  anchor.children.forEach((c) => walk(c, anchorHidden, []));
  if (out.found) out.separated = hintHasSiblingSpace(anchor);
  return out;
}

/** Normalize a predicate for comparison: drop whitespace, then peel redundant
 *  outer parens so `!e`, `!(e)`, and `(!e)` all compare equal (review R1
 *  BLOCKING 2 rejected valid equivalent spellings). */
function normPredicate(text: string): string {
  let t = text.replace(/\s+/g, "");
  const peel = (x: string): string => {
    while (x.startsWith("(") && x.endsWith(")")) {
      let depth = 0;
      let wraps = true;
      for (let i = 0; i < x.length; i += 1) {
        if (x[i] === "(") depth += 1;
        else if (x[i] === ")") {
          depth -= 1;
          if (depth === 0 && i < x.length - 1) {
            wraps = false;
            break;
          }
        }
      }
      if (!wraps) break;
      x = x.slice(1, -1);
    }
    return x;
  };
  t = peel(t);
  if (t.startsWith("!")) t = "!" + peel(t.slice(1));
  return t;
}

function sameCondition(hintConds: string[], target: { text: string; negated: boolean }): boolean {
  const want = target.negated ? `!${target.text}` : target.text;
  const norm = normPredicate;
  // The hint's gating must be EXACTLY the predicate, not a superset. Using
  // `some` over the nesting chain let `external && ready` satisfy `external`
  // (review R1 BLOCKING 2): with external=true, ready=false the link opens a new
  // tab and announces nothing. So the full conjunction must be one predicate
  // equal to the target's, after normalization.
  //
  // Exact match only in the other direction too: an even earlier version
  // accepted `!(c) === want`, which made a condition match its own NEGATION.
  if (hintConds.length !== 1) return false;
  return norm(hintConds[0]!) === norm(want);
}

export function scanSource(sf: ts.SourceFile, path: string, sc: Scan): void {
  const src = sf.getFullText();
  // Exemptions must be REAL COMMENTS carrying a reason. An unparsed substring
  // window let a JSX attribute (`data-note="no-newtab-announcement:"`) suppress a
  // finding, and accepted a bare marker with no reason (review R1 HIGH 5). We
  // collect comment ranges once and require text after the marker.
  const exemptionLines = new Set<number>();
  {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, src);
    let tok = scanner.scan();
    while (tok !== ts.SyntaxKind.EndOfFileToken) {
      if (
        tok === ts.SyntaxKind.SingleLineCommentTrivia ||
        tok === ts.SyntaxKind.MultiLineCommentTrivia
      ) {
        const text = scanner.getTokenText();
        const at = text.indexOf(EXEMPTION);
        if (at >= 0 && text.slice(at + EXEMPTION.length).trim().length > 0) {
          const start = sf.getLineAndCharacterOfPosition(scanner.getTokenStart()).line + 1;
          const end = sf.getLineAndCharacterOfPosition(scanner.getTokenEnd()).line + 1;
          for (let l = start; l <= end + 1; l += 1) exemptionLines.add(l);
        }
      }
      tok = scanner.scan();
    }
  }
  const exempt = (line: number): boolean =>
    exemptionLines.has(line) || exemptionLines.has(line - 1) || exemptionLines.has(line - 2);

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = ts.isJsxElement(node)
        ? node.openingElement.tagName.getText()
        : node.tagName.getText();
      const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
      if (LINK_TAGS.has(tag)) {
        const polarity = classifyTarget(sf, attrs);
        if (polarity) {
          sc.anchors += 1;
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          const record = (reason: string): void => {
            if (!exempt(line)) sc.violations.push({ file: path, line, reason });
          };
          if (polarity.kind === "unresolvable") {
            record("target value is not statically resolvable; inline it or add an exemption");
          } else {
            const label = labelAnnounces(attrs, polarity);
            const hint = findHint(node);
            if (label === "phrase-only") {
              record("aria-label announces but carries no destination");
            } else if (label === "conditional-ok") {
              // Label announces in exactly the external branch: correct.
            } else if (label === "ok") {
              if (polarity.kind === "conditional") {
                record("static aria-label announcement on a conditional-target anchor");
              }
            } else if (hint.found) {
              // Hidden is checked FIRST: a hint that never reaches the name at
              // all is the primary defect, and its separator is moot.
              if (hint.hidden) {
                record("NewTabHint is hidden from the accessible name");
              } else if (!hint.separated) {
                record(
                  'NewTabHint needs a real sibling space before it, else the accessible name reads "Label(opens in a new tab)"',
                );
              } else if (polarity.kind === "conditional") {
                // EVERY instance must be gated by the predicate. One
                // unconditional hint beside a gated one previously passed, which
                // both announces on the internal branch and duplicates the
                // external announcement (review R1 BLOCKING 2).
                const ungated = hint.instances.filter(
                  (h) => !sameCondition(h.conditions, polarity),
                );
                if (ungated.length > 0) {
                  record("hint is not gated by the anchor's effective _blank predicate");
                }
              } else if (polarity.kind === "static") {
                // A static target with a CONDITIONALLY rendered hint would be
                // silent on one branch.
                const gated = hint.instances.filter((h) => h.conditions.length > 0);
                if (gated.length > 0 && gated.length === hint.instances.length) {
                  record("hint is conditionally rendered on an unconditionally external anchor");
                }
              }
            } else {
              record("external link does not announce that it opens a new tab");
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function parse(path: string, code: string): ts.SourceFile {
  return ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export { parse };
