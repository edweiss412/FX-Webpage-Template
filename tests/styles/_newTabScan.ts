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

/** Resolve an in-file object-literal initializer for `{...IDENT}` spreads.
 *  Scope-blind by design, so AMBIGUITY fails closed: with the same name declared
 *  in two function scopes the last one used to win globally (review R2 BLOCKING
 *  2). Two or more declarations now resolve to null -> unresolvable. */
function resolveObjectLiteral(sf: ts.SourceFile, name: string): ts.ObjectLiteralExpression | null {
  let count = 0;
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
      count += 1;
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return count === 1 ? found : null;
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
/** Does this object literal (recursively, including nested spreads) carry
 *  target:"_blank"? Returns "yes" | "no" | "unknown" — "unknown" fails closed. */
function objectCarriesBlank(
  sf: ts.SourceFile,
  obj: ts.ObjectLiteralExpression,
  depth = 0,
): "yes" | "no" | "unknown" {
  if (depth > 4) return "unknown";
  let verdict: "yes" | "no" | "unknown" = "no";
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const name = prop.name;
      // Computed keys like ["target"] were invisible to a name-only check.
      const key = ts.isComputedPropertyName(name)
        ? stringOf(unparen(name.expression))
        : ts.isIdentifier(name) || ts.isStringLiteral(name)
          ? name.text
          : null;
      if (key === null) {
        verdict = "unknown"; // dynamic key could be `target`
        continue;
      }
      if (key !== "target") continue;
      if (isBlank(prop.initializer)) return "yes";
      if (stringOf(prop.initializer) === null) verdict = "unknown";
      continue;
    }
    // Shorthand `{target}` carries an unknown value under the right name.
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === "target") {
      verdict = "unknown";
      continue;
    }
    // Nested spread inside the object: `{...{...externalLinkProps}}`.
    if (ts.isSpreadAssignment(prop)) {
      const inner = unparen(prop.expression);
      if (ts.isObjectLiteralExpression(inner)) {
        const r = objectCarriesBlank(sf, inner, depth + 1);
        if (r === "yes") return "yes";
        if (r === "unknown") verdict = "unknown";
        continue;
      }
      const resolved = ts.isIdentifier(inner) ? resolveObjectLiteral(sf, inner.text) : null;
      if (resolved) {
        const r = objectCarriesBlank(sf, resolved, depth + 1);
        if (r === "yes") return "yes";
        if (r === "unknown") verdict = "unknown";
        continue;
      }
      verdict = "unknown";
    }
  }
  return verdict;
}

/**
 * Classify how an element becomes target="_blank", scanning EVERY attribute
 * rather than returning at the first match. Returning early let an explicit
 * `target="_blank"` mask a later spread that supplied an aria-label, which
 * suppresses the child hint (review R2 BLOCKING 2).
 */
function classifyTarget(sf: ts.SourceFile, attrs: ts.JsxAttributes): Polarity | null {
  let found: Polarity | null = null;
  const note = (p: Polarity): void => {
    // unresolvable dominates; otherwise first concrete verdict wins.
    if (p.kind === "unresolvable" || found === null) found = p;
  };

  for (const a of attrs.properties) {
    if (attrName(a) === "target" && ts.isJsxAttribute(a)) {
      const init = a.initializer;
      if (!init) continue;
      if (isBlank(init)) {
        note({ kind: "static" });
        continue;
      }
      if (ts.isJsxExpression(init) && init.expression) {
        const e = unparen(init.expression);
        if (ts.isConditionalExpression(e)) {
          const t = isBlank(e.whenTrue);
          const f = isBlank(e.whenFalse);
          if (t && f) note({ kind: "static" });
          else if (t) note({ kind: "conditional", text: e.condition.getText(), negated: false });
          else if (f) note({ kind: "conditional", text: e.condition.getText(), negated: true });
          else if (stringOf(e.whenTrue) === null || stringOf(e.whenFalse) === null) {
            note({ kind: "unresolvable" });
          }
          continue;
        }
        if (isBlank(e)) {
          note({ kind: "static" });
          continue;
        }
        note({ kind: "unresolvable" });
        continue;
      }
      continue;
    }
    if (ts.isJsxSpreadAttribute(a)) {
      const e = unparen(a.expression);
      if (ts.isConditionalExpression(e)) {
        const bs = [unparen(e.whenTrue), unparen(e.whenFalse)];
        const verdicts = bs.map((b) =>
          ts.isObjectLiteralExpression(b)
            ? objectCarriesBlank(sf, b)
            : ((): "yes" | "no" | "unknown" => {
                const r = ts.isIdentifier(b) ? resolveObjectLiteral(sf, b.text) : null;
                return r ? objectCarriesBlank(sf, r) : "unknown";
              })(),
        );
        if (verdicts.includes("unknown")) {
          note({ kind: "unresolvable" });
          continue;
        }
        const [t, f] = [verdicts[0] === "yes", verdicts[1] === "yes"];
        if (t && f) note({ kind: "static" });
        else if (t) note({ kind: "conditional", text: e.condition.getText(), negated: false });
        else if (f) note({ kind: "conditional", text: e.condition.getText(), negated: true });
        continue;
      }
      if (ts.isObjectLiteralExpression(e)) {
        const r = objectCarriesBlank(sf, e);
        if (r === "yes") note({ kind: "static" });
        else if (r === "unknown") note({ kind: "unresolvable" });
        continue;
      }
      if (ts.isIdentifier(e)) {
        const obj = resolveObjectLiteral(sf, e.text);
        if (!obj) {
          note({ kind: "unresolvable" });
          continue;
        }
        const r = objectCarriesBlank(sf, obj);
        if (r === "yes") note({ kind: "static" });
        else if (r === "unknown") note({ kind: "unresolvable" });
        continue;
      }
      note({ kind: "unresolvable" });
    }
  }
  return found;
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
/** Does this element carry ANY naming override (aria-label / aria-labelledby),
 *  including one supplied by a spread? If so, descendant text -- and therefore a
 *  NewTabHint child -- cannot contribute to the accessible name at all. */
function hasNamingOverride(sf: ts.SourceFile, attrs: ts.JsxAttributes): "yes" | "no" | "unknown" {
  let verdict: "yes" | "no" | "unknown" = "no";
  for (const a of attrs.properties) {
    const n = attrName(a);
    if (n === "aria-label" || n === "aria-labelledby") return "yes";
    if (ts.isJsxSpreadAttribute(a)) {
      const e = unparen(a.expression);
      const objs: ts.ObjectLiteralExpression[] = [];
      // Collect candidate object literals, recursing through a conditional
      // spread's branches -- `{...(cond ? { target: "_blank" } : {})}` is the live
      // Group C shape and must NOT read as an unresolvable naming override.
      const collect = (x: ts.Expression): void => {
        const u = unparen(x);
        if (ts.isObjectLiteralExpression(u)) {
          objs.push(u);
          return;
        }
        if (ts.isConditionalExpression(u)) {
          collect(u.whenTrue);
          collect(u.whenFalse);
          return;
        }
        if (ts.isIdentifier(u)) {
          const r = resolveObjectLiteral(sf, u.text);
          if (r) objs.push(r);
          else verdict = "unknown";
          return;
        }
        verdict = "unknown";
      };
      collect(e);
      for (const o of objs) {
        for (const prop of o.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
            (prop.name.text === "aria-label" || prop.name.text === "aria-labelledby")
          ) {
            return "yes";
          }
        }
      }
    }
  }
  return verdict;
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
        // The label's OWN predicate must be the target's, else the announcing
        // branch can be chosen by an unrelated flag: `target={e ? "_blank" : u}`
        // with `aria-label={ready ? "…(opens…)" : "Go"}` is silent when e=true and
        // ready=false (review R2 BLOCKING 1). Index-matching alone missed that.
        const labelCond = expr.condition.getText();
        const want = polarity.negated ? `!${polarity.text}` : polarity.text;
        const a = normPredicate(labelCond);
        const b = normPredicate(want);
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
    if (n === "className") {
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
  // Strip whitespace only OUTSIDE string literals: a blanket replace made
  // `mode === "x y"` and `mode === "xy"` normalize identically, which would let a
  // hint gate on a DIFFERENT predicate than the target (review R2 BLOCKING 1).
  let t = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote) {
      t += ch;
      if (ch === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      t += ch;
      continue;
    }
    if (!/\s/.test(ch)) t += ch;
  }
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

/** Does every branch of each hint-bearing conditional render a hint? Then the
 *  announcement is unconditional at runtime even though each instance carries a
 *  recorded condition. */
function hasExhaustiveHint(anchor: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  if (!ts.isJsxElement(anchor)) return false;
  const containsHint = (n: ts.Node): boolean => {
    let hit = false;
    const w = (x: ts.Node): void => {
      const tag = ts.isJsxElement(x)
        ? x.openingElement.tagName.getText()
        : ts.isJsxSelfClosingElement(x)
          ? x.tagName.getText()
          : null;
      if (tag === HINT) hit = true;
      ts.forEachChild(x, w);
    };
    w(n);
    return hit;
  };
  let sawConditional = false;
  let allExhaustive = true;
  const walk = (n: ts.Node): void => {
    if (ts.isConditionalExpression(n) && containsHint(n)) {
      sawConditional = true;
      if (!(containsHint(n.whenTrue) && containsHint(n.whenFalse))) allExhaustive = false;
    }
    ts.forEachChild(n, walk);
  };
  anchor.children.forEach(walk);
  return sawConditional && allExhaustive;
}

export function scanSource(sf: ts.SourceFile, path: string, sc: Scan): void {
  const src = sf.getFullText();
  // Exemptions must be REAL COMMENTS carrying a reason. An unparsed substring
  // window let a JSX attribute (`data-note="no-newtab-announcement:"`) suppress a
  // finding, and accepted a bare marker with no reason (review R1 HIGH 5). We
  // collect comment ranges once and require text after the marker.
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
          const end = sf.getLineAndCharacterOfPosition(scanner.getTokenEnd()).line + 1;
          exemptions.push({ endLine: end, used: false });
        }
      }
      tok = scanner.scan();
    }
  }
  // ONE comment exempts ONE anchor, and only the anchor it immediately precedes.
  // A padded line-window let a single comment silence every anchor that followed
  // it (review R2 HIGH 5).
  const exempt = (line: number): boolean => {
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
            const override = hasNamingOverride(sf, attrs);
            const hint = findHint(node);
            if (label === "phrase-only") {
              record("aria-label announces but carries no destination");
            } else if (label === "conditional-ok") {
              // Label announces in exactly the external branch: correct.
            } else if (label === "ok") {
              if (polarity.kind === "conditional") {
                record("static aria-label announcement on a conditional-target anchor");
              }
            } else if (override !== "no") {
              // aria-label / aria-labelledby REPLACE descendant content, so a
              // NewTabHint child contributes nothing. Falling through to the hint
              // let `aria-label="Go"` (and aria-labelledby) pass with an
              // accessible name of "Go" (review R2 BLOCKING 3).
              record(
                override === "unknown"
                  ? "naming override may come from an unresolvable spread; inline it or add an exemption"
                  : "element has aria-label/aria-labelledby, so it must announce in that label (a NewTabHint child is ignored)",
              );
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
                // silent on one branch -- UNLESS the branches are exhaustive.
                // `{e ? <Hint /> : <Hint />}` announces on every path, and
                // flagging it was a false positive (review R2 MEDIUM 7).
                const gated = hint.instances.filter((h) => h.conditions.length > 0);
                const exhaustive = hasExhaustiveHint(node);
                if (!exhaustive && gated.length > 0 && gated.length === hint.instances.length) {
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
