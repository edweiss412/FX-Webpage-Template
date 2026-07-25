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
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { compileSync } from "@mdx-js/mdx";
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

/**
 * Is this JSX element a link-shaped candidate?
 *
 * Tag-name membership alone was fail-open: `<Tags.External href="x"
 * target="_blank">` and `<UI.Link target={dest}>` were ADMITTED by the file net,
 * then skipped with zero anchors because a member-expression tag is not in
 * LINK_TAGS. React rendered both as real `<a target="_blank">` with the accessible
 * name "Go" (review R8 BLOCKING 2).
 *
 * Two ways in now:
 *   1. the tag is a known link, INCLUDING a member expression whose last segment
 *      is one (`UI.Link`, `Chrome.Anchor`); or
 *   2. the element carries an explicit `target` attribute, whatever its tag; or
 *   3. it carries `href` plus any spread, since the spread may supply the target.
 *
 * Attribute names for these tests come from `attrName`, so casing does not matter,
 * and a RESOLVABLE inline spread contributes its own property names -- R10 showed
 * `<Foo {...{href:"x", target:"_blank"}}>` was otherwise skipped even though both
 * props are statically visible.
 *
 * Rule 2 accepting `target` alone REVERSED an earlier decision on purpose. That
 * decision kept `<Tabs target="_blank" />` unclassified, reasoning that a non-URL
 * `target` prop selects a tab rather than a window; R9 then showed the cost, because
 * `<Foo target="_blank" {...spreadHref}>` was skipped entirely. Two reviewers pulling
 * opposite ways on one rule is settled by which direction fails closed. A live census
 * confirms every explicit `target` in the tree is `_blank` on an intrinsic `<a>`, so
 * this costs nothing today, and a genuine non-URL `target` prop costs one exemption.
 *
 * Keying on attributes rather than "has a spread" is what keeps every
 * `<div {...props}>` out. Residue, accepted: an UNRESOLVABLE spread on an unknown tag
 * carrying both props.
 */
function isLinkCandidate(tag: string, attrs: ts.JsxAttributes): boolean {
  const last = tag.split(".").pop() ?? tag;
  if (LINK_TAGS.has(tag) || LINK_TAGS.has(last) || /^(anchor|externallink)$/i.test(last)) {
    return true;
  }
  // Attribute names include those supplied by a RESOLVABLE inline spread. R10 showed
  // `<Foo {...{href:"x", target:"_blank"}}>` and the conditional form skipped
  // entirely: the props are statically visible, so they are outside the documented
  // unresolvable-spread deferral, and a forwarding `Foo` renders a real
  // `<a href="x" target="_blank">` named only "Go".
  const names = new Set<string | null>(attrs.properties.map((a) => attrName(a)));
  for (const a of attrs.properties) {
    if (!ts.isJsxSpreadAttribute(a)) continue;
    for (const obj of spreadObjectLiterals(a.expression)) {
      for (const prop of obj.properties) {
        const pn = propNameLower(prop);
        if (pn !== null) names.add(pn);
      }
    }
  }
  // An explicit `target` attribute is enough on its own. R9 showed
  // `<Foo target="_blank" {...spreadHref}>` skipped when `href` was also required,
  // and its census confirms no live component carries `target` without `href`, so
  // this costs nothing today. It does mean a non-URL `target` prop is now REPORTED
  // rather than ignored -- see the pin change in the self-tests.
  if (names.has("target")) return true;
  // Otherwise an `href` plus any spread: the spread may carry the target.
  return names.has("href") && attrs.properties.some((a) => ts.isJsxSpreadAttribute(a));
}

export type Violation = { file: string; line: number; reason: string };
export type Scan = { anchors: number; violations: Violation[] };

/** Effective `_blank` predicate for an anchor's target (§6 requirement 5). */
type Polarity =
  | { kind: "static" } // unconditionally external
  | { kind: "conditional"; text: string; negated: boolean }
  | { kind: "unresolvable" };

/** Attribute name, ASCII-LOWERCASED.
 *
 *  HTML attribute names are case-insensitive and React forwards unknown casings to
 *  the DOM (with a dev warning), so `TARGET="_blank"` opens a new tab and
 *  `ARIA-HIDDEN="true"` really hides. Comparing `getText()` verbatim made
 *  `admitsCandidate` admit all 63 non-lowercase casings of `target` while
 *  `classifyShape` then found zero anchors -- admitted, silently skipped, no
 *  violation (review R8 BLOCKING 1). Every name comparison in this file goes
 *  through here; the VALUE keeps its original case (`_blank` is compared with its
 *  own case-insensitive rule). */
function attrName(a: ts.JsxAttributeLike): string | null {
  return ts.isJsxAttribute(a) ? a.name.getText().toLowerCase() : null;
}

/** Lowercased name for a definite JsxAttribute (same rationale as attrName). */
function jsxAttrNameLower(a: ts.JsxAttribute): string {
  return a.name.getText().toLowerCase();
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

/** Is this value fully decidable at scan time? A template WITH substitutions is
 *  not: `target={`_${suffix}`}` can be "_blank" and `className={`${h?"hidden":""}`}`
 *  can hide, yet stringOf's literal-span concatenation makes both look literal
 *  (review R4 BLOCKING 1 and 4). Anything undecidable must fail closed. */
function isDecidableLiteral(node: ts.Node | undefined): boolean {
  if (!node) return false;
  const inner =
    ts.isJsxExpression(node) && node.expression ? unparen(node.expression) : (node as ts.Node);
  if (ts.isTemplateExpression(inner)) return false;
  return stringOf(inner) !== null;
}

/**
 * Does this label expression interpolate a value? A template like
 * `${alt} (opens in a new tab)` has NO static destination text, but its
 * destination is the substitution -- so the remainder rule must not reject it.
 * Without this, the correctly-implemented diagram-link label read as
 * "phrase-only". Found while implementing the sweep, not by prose review.
 */
/** Text of the expressions a template substitutes, normalized. */
function substitutedExprs(node: ts.Node): (string | null)[] {
  const n = ts.isJsxExpression(node) && node.expression ? unparen(node.expression) : node;
  if (!ts.isTemplateExpression(n)) return [];
  return n.templateSpans.map((sp) => identityKey(sp.expression));
}

/**
 * Does the enclosing conditional's TEST guarantee this branch's substitution is
 * non-empty? `alt ? \`${alt} (opens…)\`` and
 * `title.trim() ? \`… ${title.trim()} …\`` both do. Without this, the fail-closed
 * substitution rule (review R4 BLOCKING 5) would reject the shipped diagram and
 * modal labels, which are correct.
 */
function guardedSubstitution(branch: ts.Node, condition: ts.Expression): boolean {
  // EXACT match only. Treating `label` and `label.trim()` as interchangeable let
  // `label ? `${label.trim()} (opens…)`` pass, where a whitespace-only label takes
  // the truthy branch and the substitution trims to "" -- a phrase-only name
  // (review R5 HIGH 3). The guard must prove the SAME expression non-empty.
  // Structural identity, not textual: R6 showed `!(label && ready)` guarding a
  // `${!label && ready}` substitution slipped through, and at label="" the name
  // is phrase-only (review R6 BLOCKING 1, third consumer).
  // Fail closed when either side is outside the decidable subset: an
  // unprovable guard is not a guard (review R7 BLOCKING 1).
  const cond = identityKey(condition);
  if (cond === null) return false;
  return substitutedExprs(branch).some((e) => e !== null && e === cond);
}

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
    // A conditional whose every branch is a blank literal can never name
    // anything: `${e ? "" : ""}` passed as a destination (review R2 BLOCKING 3).
    if (ts.isConditionalExpression(e)) {
      const branches = [unparen(e.whenTrue), unparen(e.whenFalse)];
      if (
        branches.every(
          (b) =>
            (ts.isStringLiteral(b) || ts.isNoSubstitutionTemplateLiteral(b)) &&
            b.text.trim().length === 0,
        )
      ) {
        return false;
      }
    }
    // FAIL CLOSED: an unconstrained value may be "". `${label} (opens in a new
    // tab)` with label="" computes a phrase-only name (review R4 BLOCKING 5). A
    // destination must come from static text, so require it there.
    return false;
  });
}

/** Strip parentheses: the live spreads are `{...(cond ? {…} : {})}`, whose
 *  expression is a ParenthesizedExpression, not a ConditionalExpression. Missing
 *  this made the scanner blind to all four conditional-spread anchors -- caught by
 *  the synthetic self-test below, not by the live tree. */
/** Object-literal property name, ASCII-lowercased. The approved-spread path
 *  compared `prop.name.text` verbatim, so `{ TARGET: "_BLANK" }` was reported as an
 *  unrecognized shape -- fail-closed, but it contradicts the ratified casing
 *  contract and rejects a correctly announced link (review R9 MEDIUM 3). */
function propNameLower(prop: ts.ObjectLiteralElementLike): string | null {
  const n = prop.name;
  if (n === undefined) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text.toLowerCase();
  return null;
}

/** Object literals a spread expression statically resolves to: a bare literal, or
 *  either branch of a conditional between literals. An identifier or call is NOT
 *  resolvable and yields none, which keeps the unresolvable-spread deferral intact. */
function spreadObjectLiterals(expr: ts.Expression): ts.ObjectLiteralExpression[] {
  const e = unparen(expr);
  if (ts.isObjectLiteralExpression(e)) return [e];
  if (ts.isConditionalExpression(e)) {
    return [unparen(e.whenTrue), unparen(e.whenFalse)].filter(ts.isObjectLiteralExpression);
  }
  return [];
}

function unparen(node: ts.Expression): ts.Expression {
  let n = node;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
}

function isBlank(node: ts.Node | undefined): boolean {
  if (!node) return false;
  // HTML target keywords are ASCII case-insensitive, so `_BLANK` opens a new tab
  // just as `_blank` does (review R4 BLOCKING 1).
  return (stringOf(node) ?? "").trim().toLowerCase() === "_blank";
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
      const substituted = nodes.map(
        (n) => hasSubstitution(n) || guardedSubstitution(n, expr.condition),
      );
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
        // The label's OWN predicate must be the target's, else the announcing
        // branch can be chosen by an unrelated flag: `target={e ? "_blank" : u}`
        // with `aria-label={ready ? "…(opens…)" : "Go"}` is silent when e=true and
        // ready=false (review R2 BLOCKING 1). Index-matching alone missed that.
        const labelCond = expr.condition.getText();
        const want = polarity.negated ? `!(${polarity.text})` : polarity.text;
        // Approved simple predicates only, on BOTH sides: a compound label
        // predicate is not compared to a compound target predicate, because a
        // textual normalizer equated eleven distinct operator families and the
        // AND/OR pair here was one of R6's accepted-then-refuted probes
        // (review R6 BLOCKING 1, second consumer).
        const a = simplePredicateKey(labelCond);
        const b = simplePredicateKey(want);
        if (a === null || b === null) return "none";
        const direct = a === b;
        // `!X` vs `X` in either direction is the inverted spelling. Prefixing and
        // re-normalizing produced `!!e` and missed it.
        const inverted = a === `!${b}` || `!${a}` === b;
        if (!direct && !inverted) return "none";
        // With an inverted label predicate the announcing branch flips, which is
        // how `!e ? "Go" : "Go (opens…)"` stays valid.
        const wantIdx = inverted ? 1 : 0;
        const otherIdx = inverted ? 1 - wantIdx : 1;
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
        // A STRING "false" is truthy for the native boolean attribute: React
        // renders hidden="" and the node leaves the a11y tree. Only the boolean
        // literal false is visible (review R2 HIGH 4).
        if (n === "aria-hidden" && stringOf(e) === "false") continue;
        return true; // dynamic or string: fail closed
      }
      const v = stringOf(init);
      if (n === "aria-hidden" && v === "false") continue;
      return true;
    }
    if (n === "classname") {
      // Read the raw text, not just a resolved literal: a dynamic
      // `className={hide ? "hidden" : ""}` previously resolved to null and was
      // treated as visible (review R2 HIGH 4). Any mention of a hiding class in
      // the expression fails closed.
      const v = a.initializer ? (stringOf(a.initializer) ?? a.initializer.getText()) : "";
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
    // Never descend into JSX ATTRIBUTES: a hint passed as a prop
    // (`<Wrapper hint={<NewTabHint/>}/>`) may be dropped by the callee, so a
    // syntactic occurrence there is not an accessible descendant (review R4
    // BLOCKING 4).
    if (ts.isJsxAttributes(n) || ts.isJsxAttribute(n)) return;
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

/**
 * Parse a predicate's source text back into an expression node.
 *
 * The scanner passes predicates around as text (`.getText()`), but text is the
 * wrong comparison substrate: see `simplePredicateKey`.
 */
function parseExprText(text: string): ts.Expression | null {
  const sf = ts.createSourceFile(
    "__pred.tsx",
    `(${text});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const st = sf.statements[0];
  if (!st || !ts.isExpressionStatement(st)) return null;
  return st.expression;
}

/**
 * Key proving two expressions are the SAME expression, or null when the shape is
 * outside the decidable subset.
 *
 * Approved: identifier; property access (recording `?.`); element access with a
 * literal or identifier key; a ZERO-ARGUMENT call over any of those; and `!` over
 * any of them. Nothing else.
 *
 * An earlier version serialized arbitrary expressions and fell back to
 * `getText().replace(/\s+/g, "")` for unsupported subtrees. That fallback erases
 * token boundaries, so genuinely different expressions collided and a guard
 * "proved" a DIFFERENT expression non-empty: `new F()` vs `newF()`, `await x` vs
 * `awaitx`, `typeof x` vs `typeofx`, `delete x.y` vs `deletex.y`, `x as string`
 * vs `xasstring`, a one-space template vs an empty one, and every literal
 * containing a space (`get(/a b/)` vs `get(/ab/)`). R7 demonstrated each with a
 * witness where the substitution returned "" and the computed name was
 * "(opens in a new tab)" alone. It also dropped optional-chain tokens and call
 * type arguments, colliding `obj?.[key]` with `obj[key]`, `fn?.()` with `fn()`,
 * and `fn<T>()` with `fn()`.
 *
 * A partial serializer over a Turing-complete grammar cannot be made injective
 * by adding cases -- that is the same losing shape as normalizing predicate text.
 * So the subset is explicit and everything else fails closed. The shipped labels
 * use `label`, `alt`, `displayTitle`, `title` and `title.trim()`, all inside it.
 */
function identityKey(e: ts.Expression): string | null {
  if (ts.isParenthesizedExpression(e)) return identityKey(e.expression);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = identityKey(e.operand);
    return inner === null ? null : `!${inner}`;
  }
  if (ts.isIdentifier(e)) return `i:${e.text}`;
  if (ts.isPropertyAccessExpression(e)) {
    const base = identityKey(e.expression);
    if (base === null) return null;
    return `${base}${e.questionDotToken ? "?." : "."}p:${e.name.getText()}`;
  }
  if (ts.isElementAccessExpression(e)) {
    const base = identityKey(e.expression);
    if (base === null) return null;
    const arg = e.argumentExpression;
    // A numeric key uses the literal's normalized text, so `obj[0]` and `obj[0.0]`
    // deliberately share a key: JS coerces both to the property "0", so they ARE
    // the same expression. Not a collision -- verified by probe during self-review.
    const key = ts.isStringLiteral(arg)
      ? `s:${JSON.stringify(arg.text)}`
      : ts.isNumericLiteral(arg)
        ? `n:${arg.text}`
        : ts.isIdentifier(arg)
          ? `i:${arg.text}`
          : null;
    if (key === null) return null;
    return `${base}${e.questionDotToken ? "?." : ""}[${key}]`;
  }
  if (ts.isCallExpression(e)) {
    // Zero-argument only, and no type arguments: `fn<T>()` and `fn()` are
    // different expressions and must not share a key.
    if (e.arguments.length > 0 || e.typeArguments !== undefined) return null;
    const callee = identityKey(e.expression);
    return callee === null ? null : `${callee}${e.questionDotToken ? "?." : ""}()`;
  }
  return null;
}

/**
 * The key for a predicate that GATES something, or null when the predicate is
 * not an approved shape.
 *
 * Approved: an identifier, a property-access chain over identifiers, or `!`
 * applied to either. Nothing else -- no binary operators, ternaries, calls,
 * commas, or element access.
 *
 * Why so narrow: rounds 1 through 6 each found a new pair of DIFFERENT compound
 * predicates that a textual normalizer equated. R6 alone listed eleven operator
 * families (`!(e && ready)` vs `!e && ready`, `!(x === y)` vs `!x === y`,
 * `!(n > 0)` vs `!n > 0`, nullish, comma, bitwise, `instanceof`, ...). Each
 * collision let an anchor open a new tab with no announcement while the guard
 * reported zero violations.
 *
 * Deciding semantic equivalence of arbitrary predicates is not something a
 * static pass can do, so this stops asking. A compound predicate is simply not
 * an approved shape, and the pair is reported instead of compared. Every one of
 * those eleven families fails closed at once, and no future family can reopen
 * the hole. The cost is a false positive on a legitimately compound gate; the
 * four shipped gated anchors all gate on member expressions, so today it is
 * zero. Accepted limit, spec section 6.4.
 */
function simplePredicateKey(text: string): string | null {
  const e = parseExprText(text);
  if (!e) return null;
  const walk = (n: ts.Expression): string | null => {
    if (ts.isParenthesizedExpression(n)) return walk(n.expression);
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) {
      const inner = walk(n.operand);
      return inner === null ? null : `!${inner}`;
    }
    if (ts.isIdentifier(n)) return n.text;
    if (ts.isPropertyAccessExpression(n)) {
      const base = walk(n.expression);
      if (base === null || base.startsWith("!")) return null;
      return `${base}${n.questionDotToken ? "?." : "."}${n.name.getText()}`;
    }
    return null;
  };
  return walk(e);
}

/** Lexical nets for files the AST pass cannot classify.
 *
 *  Both are deliberately tested against the raw text AND a comment-stripped copy,
 *  and the UNION decides. R7 found a block comment sitting between `target` and its
 *  `=`, and between a spread's brace and its dots, slipping past a raw-text-only
 *  regex (the literal forms are in the self-tests, not here, because a nested
 *  comment delimiter would close this doc block). Stripping alone is unsafe in MDX
 *  (prose contains `https://`, which a JS lexer reads as a line comment and would
 *  delete along with anything after it on that line). Testing both and taking the
 *  union can only ever admit MORE, which is the fail-closed direction. */
function lexicalVariants(code: string): string[] {
  const out = [code];
  try {
    const stripped = stripCommentsSafely(code);
    if (stripped !== code) out.push(stripped);
  } catch {
    /* best effort: the raw text is still checked */
  }
  return out;
}

// HTML attribute names are case-insensitive, so `TARGET="_blank"` opens a tab.
// React warns about the casing but still emits the attribute (review R7 BLOCKING 2).
const TARGET_ATTR = /target\s*=/i;
const JSX_SPREAD = /\{\s*\.\.\./;

/** Does this source text contain anything that could make an external anchor?
 *  Shared by the live-tree loop AND its self-test, so the two cannot diverge --
 *  R5 left the loop case-SENSITIVE while the scanner was case-insensitive, so a
 *  real `_BLANK` file was never scanned at all. */
export function admitsCandidate(code: string): boolean {
  return lexicalVariants(code).some(
    (v) => /_blank/i.test(v) || TARGET_ATTR.test(v) || JSX_SPREAD.test(v),
  );
}

/**
 * Compile a `.mdx` source to JSX so the SAME AST scanner classifies it.
 *
 * Four rounds went into hand-written lexical rules for MDX and each produced a new
 * defect: a bare `target\s*=` matched prose and autolinks (R8); a character class
 * excluding angle brackets ended the tag at any `>` inside it (R9); then a
 * quote-and-brace scanner miscounted braces inside regex literals, treated fenced
 * code as live JSX, and ran past a quoted attribute ending in a backslash (R10,
 * three separate findings).
 *
 * A lexer for a real grammar is the wrong model, so MDX now goes through the actual
 * MDX compiler -- already a repo dependency -- and the compiled JSX is handed to
 * `scanSource`. Prose becomes string literals, fenced code becomes string literals,
 * and regex literals, escapes and attribute quoting become the compiler's problem.
 * MDX and TSX are now ONE enforcement path rather than two, which is what removes
 * the class instead of the instance.
 */
export function compileMdxToJsx(source: string): string {
  return String(compileSync(source, { jsx: true }));
}

export const MDX_FORBIDDEN = /_blank|target\s*=|\{\s*\.\.\./i;

function sameCondition(hintConds: string[], target: { text: string; negated: boolean }): boolean {
  const want = target.negated ? `!(${target.text})` : target.text;
  // The hint's gating must be EXACTLY the predicate, not a superset. Using
  // `some` over the nesting chain let `external && ready` satisfy `external`
  // (review R1 BLOCKING 2): with external=true, ready=false the link opens a new
  // tab and announces nothing. So the full conjunction must be one predicate
  // equal to the target's, after normalization.
  //
  // Exact match only in the other direction too: an even earlier version
  // accepted `!(c) === want`, which made a condition match its own NEGATION.
  if (hintConds.length !== 1) return false;
  // Structural keys, and BOTH sides must be an approved simple predicate. A
  // compound predicate on either side yields null and is reported rather than
  // compared -- textual normalization equated eleven distinct operator families
  // (review R6 BLOCKING 1).
  const a = simplePredicateKey(hintConds[0]!);
  const b = simplePredicateKey(want);
  return a !== null && b !== null && a === b;
}

/**
 * Strip comments using the TypeScript scanner rather than regexes. A regex pass
 * treats comment delimiters INSIDE string literals as real comments, so a
 * `const marker = "//"` could hide a phrase-bearing label from the copy census,
 * and a `"/*"`/`"*\/"` string pair could hide an arbitrary span (review R2
 * MEDIUM 8). Token-based stripping cannot be fooled that way.
 */
/**
 * SHAPE ALLOWLIST — the soundness model (whole-diff review R3).
 *
 * R1, R2 and R3 each found a NEW fail-open AST shape: nested spreads, computed
 * keys, shadowed identifiers, spread-supplied aria-label, spread-supplied hidden,
 * partially-exhaustive ternaries. That is not a run of bugs, it is the wrong
 * default. A static scanner cannot soundly resolve arbitrary JS -- imported props
 * objects, parameters, shadowing -- so "prove this anchor is broken" leaks by
 * construction, and docs/agents/spec-self-review.md:22 caps that iteration at three
 * rounds.
 *
 * Inverted: an external link must match one of a SMALL set of approved shapes;
 * anything else is a finding. The whole codebase uses exactly two (19 literal + 4
 * conditional-spread), so the allowlist costs nothing today and any novel shape
 * fails LOUDLY with instructions instead of passing silently.
 *
 * Accepted tradeoff: a correct-but-unusual shape (an announcing aria-label arriving
 * through a spread, say) is reported. Deliberate -- the author moves to an approved
 * shape or adds an exemption with a reason. A false positive costs one comment; a
 * false negative ships a silent link.
 */
type Shape =
  | { kind: "not-external" }
  | { kind: "literal" }
  | { kind: "gated"; cond: string }
  | { kind: "unrecognized"; why: string };

function classifyShape(el: ts.JsxElement | ts.JsxSelfClosingElement): Shape {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  const spreads = attrs.properties.filter(ts.isJsxSpreadAttribute);
  const targetAttr = attrs.properties.find(
    (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && jsxAttrNameLower(a) === "target",
  );

  // Without a target attribute AND without a spread, nothing can make it external.
  if (!targetAttr && spreads.length === 0) return { kind: "not-external" };

  if (targetAttr) {
    if (spreads.length > 0) {
      return {
        kind: "unrecognized",
        why: "explicit target alongside a spread; a spread can also supply target, aria-label or hidden",
      };
    }
    const init = targetAttr.initializer;
    if (init && isBlank(init)) return { kind: "literal" };
    if (init && ts.isJsxExpression(init) && init.expression && isBlank(unparen(init.expression))) {
      return { kind: "literal" };
    }
    if (init && isDecidableLiteral(init)) return { kind: "not-external" };
    return {
      kind: "unrecognized",
      why: 'target is not a decidable literal (template/expression); inline target="_blank" or add an exemption',
    };
  }

  if (spreads.length !== 1) {
    return { kind: "unrecognized", why: "multiple spreads cannot be resolved statically" };
  }
  const e = unparen(spreads[0]!.expression);
  if (!ts.isConditionalExpression(e)) {
    return {
      kind: "unrecognized",
      why: 'spread is not the approved `COND ? { target: "_blank", … } : {}` form',
    };
  }
  const whenTrue = unparen(e.whenTrue);
  const whenFalse = unparen(e.whenFalse);
  if (!ts.isObjectLiteralExpression(whenTrue) || !ts.isObjectLiteralExpression(whenFalse)) {
    return { kind: "unrecognized", why: "both spread branches must be inline object literals" };
  }
  // Only these props may appear in an approved spread. An open literal-valued
  // allowlist let a spread carry aria-labelledby / aria-hidden / hidden /
  // className / style / a competing aria-label (review R4 BLOCKING 2).
  const SPREADABLE = new Set(["target", "rel"]);
  // Duplicate case-folded names are AMBIGUOUS and must fail closed. React writes both
  // `{ target: "_self", TARGET: "_blank" }` to one case-insensitive DOM attribute and
  // the LATER value wins, so reading the first normalized match gave the wrong value
  // in both directions (review R10 BLOCKING 3).
  const hasDuplicateFoldedName = (o: ts.ObjectLiteralExpression): boolean => {
    const seen = new Set<string>();
    for (const prop of o.properties) {
      const pn = propNameLower(prop);
      if (pn === null) continue;
      if (seen.has(pn)) return true;
      seen.add(pn);
    }
    return false;
  };
  const plain = (o: ts.ObjectLiteralExpression): boolean =>
    !hasDuplicateFoldedName(o) &&
    o.properties.every(
      (prop) =>
        ts.isPropertyAssignment(prop) &&
        (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
        SPREADABLE.has(propNameLower(prop) ?? "") &&
        isDecidableLiteral(prop.initializer),
    );
  if (!plain(whenTrue) || !plain(whenFalse)) {
    return {
      kind: "unrecognized",
      why: "spread branches must hold only literal-valued properties (no nested spread, computed key or shorthand)",
    };
  }
  const named = (o: ts.ObjectLiteralExpression, key: string): string | null => {
    for (const prop of o.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
        propNameLower(prop) === key
      ) {
        return stringOf(prop.initializer);
      }
    }
    return null;
  };
  const isBlankStr = (v: string | null): boolean => (v ?? "").trim().toLowerCase() === "_blank";
  const t = isBlankStr(named(whenTrue, "target"));
  const f = isBlankStr(named(whenFalse, "target"));
  if (t && f) return { kind: "literal" };
  if (!t && !f) return { kind: "not-external" };
  return {
    kind: "gated",
    // Parenthesized so a compound condition negates as a whole.
    cond: t ? e.condition.getText() : `!(${e.condition.getText()})`,
  };
}

/** Anything on the path from anchor to hint that blocks proof of visibility: a
 *  spread (which can carry hidden / aria-hidden / className), or a className/style
 *  that is not a plain string literal. `className={classes}` cannot be shown to
 *  omit a hiding class (review R3 HIGH 4), so it is reported rather than assumed
 *  safe. No live hint sits under such a wrapper. */
function hasSpreadOnHintPath(anchor: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  if (!ts.isJsxElement(anchor)) return false;
  let found = false;
  const walk = (n: ts.Node, sawSpread: boolean): void => {
    let next = sawSpread;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = ts.isJsxElement(n) ? n.openingElement.tagName.getText() : n.tagName.getText();
      const a = ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes;
      if (tag === HINT && sawSpread) {
        found = true;
        return;
      }
      const opaque = a.properties.some((attr) => {
        if (ts.isJsxSpreadAttribute(attr)) return true;
        if (!ts.isJsxAttribute(attr)) return false;
        const nm = jsxAttrNameLower(attr);
        // A wrapper carrying its OWN name replaces the subtree's contribution,
        // so the hint inside it never reaches the anchor name (review R4
        // BLOCKING 4: `<span role="img" aria-label="icon">`).
        if (nm === "aria-label" || nm === "aria-labelledby") return true;
        if (nm === "role") {
          // `role="presentation"`/`none`/`group` do not rename the subtree, and
          // rejecting them was pure developer friction (review R5 LOW 6). Only a
          // role that takes its name from an author attribute is opaque here.
          const v = attr.initializer ? stringOf(attr.initializer) : null;
          if (v === null) return true; // dynamic role: fail closed
          return !["presentation", "none", "group", "generic"].includes(v.trim());
        }
        if (nm !== "classname" && nm !== "style") return false;
        // Undecidable values (templates, conditionals) cannot be proven
        // non-hiding.
        return attr.initializer ? !isDecidableLiteral(attr.initializer) : false;
      });
      if (opaque) next = true;
    }
    ts.forEachChild(n, (c) => walk(c, next));
  };
  anchor.children.forEach((c) => walk(c, false));
  return found;
}

export function stripCommentsSafely(src: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, src);
  let out = "";
  let tok = scanner.scan();
  while (tok !== ts.SyntaxKind.EndOfFileToken) {
    if (
      tok !== ts.SyntaxKind.SingleLineCommentTrivia &&
      tok !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      out += scanner.getTokenText();
    }
    tok = scanner.scan();
  }
  return out;
}

export function scanSource(sf: ts.SourceFile, path: string, sc: Scan): void {
  const src = sf.getFullText();

  // ONE comment exempts ONE anchor, claimed by the next CANDIDATE it precedes --
  // compliant or not. Consuming only when recording a violation let a compliant
  // anchor leave its exemption for a later broken one (review R3 HIGH 5).
  const exemptions: { endLine: number; used: boolean }[] = [];
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
          exemptions.push({
            endLine: sf.getLineAndCharacterOfPosition(scanner.getTokenEnd()).line + 1,
            used: false,
          });
        }
      }
      tok = scanner.scan();
    }
  }
  const claimExemption = (line: number): boolean => {
    const slot = exemptions.find((e) => !e.used && (e.endLine === line || e.endLine === line - 1));
    if (!slot) return false;
    slot.used = true;
    return true;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = ts.isJsxElement(node)
        ? node.openingElement.tagName.getText()
        : node.tagName.getText();
      const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
      if (isLinkCandidate(tag, attrs)) {
        const shape = classifyShape(node);
        if (shape.kind !== "not-external") {
          sc.anchors += 1;
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          const exempted = claimExemption(line);
          const record = (reason: string): void => {
            if (!exempted) sc.violations.push({ file: path, line, reason });
          };
          const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;

          if (shape.kind === "unrecognized") {
            record(`unrecognized external-link shape (${shape.why})`);
            ts.forEachChild(node, visit);
            return;
          }

          const polarity: Polarity =
            shape.kind === "gated"
              ? {
                  kind: "conditional",
                  text: shape.cond.replace(/^!/, ""),
                  negated: shape.cond.startsWith("!"),
                }
              : { kind: "static" };
          const label = labelAnnounces(attrs, polarity);
          const hasLabelAttr = attrs.properties.some(
            (a) =>
              ts.isJsxAttribute(a) &&
              (jsxAttrNameLower(a) === "aria-label" || jsxAttrNameLower(a) === "aria-labelledby"),
          );
          const hint = findHint(node);

          if (hasLabelAttr) {
            // A naming attribute REPLACES descendant content, so the label itself
            // must announce and a hint child is inert.
            if (label === "phrase-only") {
              record("aria-label announces but carries no destination");
            } else if (label === "none") {
              record(
                "element has aria-label/aria-labelledby, so it must announce in that label (a NewTabHint child is ignored)",
              );
            } else if (label === "ok" && shape.kind === "gated") {
              record("static aria-label announcement on a conditional-target anchor");
            }
          } else if (!hint.found) {
            record("external link does not announce that it opens a new tab");
          } else if (hasSpreadOnHintPath(node)) {
            record(
              "an element between the anchor and its NewTabHint has attributes that cannot be proven non-hiding (a spread, or a non-literal className/style); inline them or add an exemption",
            );
          } else if (hint.hidden) {
            record("NewTabHint is hidden from the accessible name");
          } else if (!hint.separated) {
            record(
              'NewTabHint needs a real sibling space before it, else the accessible name reads "Label(opens in a new tab)"',
            );
          } else if (shape.kind === "gated") {
            const want = {
              text: shape.cond.replace(/^!/, ""),
              negated: shape.cond.startsWith("!"),
            };
            if (hint.instances.some((h) => !sameCondition(h.conditions, want))) {
              record("hint is not gated by the anchor's effective _blank predicate");
            }
          } else if (hint.instances.every((h) => h.conditions.length > 0)) {
            // Unconditionally external, so the hint must render unconditionally.
            // Proving an arbitrary conditional chain exhaustive is undecidable in
            // general -- R3 defeated the both-branches heuristic with
            // `e ? ready && <Hint/> : <Hint/>` -- so the approved shape is simply
            // an unconditional hint.
            record(
              "hint is conditionally rendered on an unconditionally external anchor; render it unconditionally",
            );
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
