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

/** Every JavaScript line terminator. LF-only handling has now produced THREE separate
 *  findings -- a `//` comment that ran past CR (R14), a jsdoc continuation strip that kept
 *  its decoration (R17), and the JSX whitespace model below -- so the class lives in one
 *  place. `\r`, U+2028 and U+2029 are line terminators to the JS grammar and to JSX. */
export const LINE_TERMINATORS = /[\n\r\u2028\u2029]/;

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
    for (const n of resolvableSpreadNames(a.expression)) names.add(n);
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
  // A COMPUTED key whose expression is a string literal is just as decidable:
  // `{["target"]: "_blank"}` reads identically at runtime, and ignoring it left
  // `<Foo {...{["href"]:"x",["target"]:"_blank"}}>` with no candidacy names at all
  // (review R11 BLOCKING 2).
  if (ts.isComputedPropertyName(n)) {
    const e = unparen(n.expression);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text.toLowerCase();
  }
  return null;
}

/** Every property name a resolvable spread contributes, lowercased, following NESTED
 *  spreads inside the object literals. One level of unwrapping left
 *  `<Foo {...{...{href:"x", target:"_blank"}}}>` with no names, so the element was
 *  never a candidate at all -- found by probing my own R10 fix before R11 ran. */
function resolvableSpreadNames(expr: ts.Expression): string[] {
  const out: string[] = [];
  const seen = new Set<ts.Node>();
  const walk = (e: ts.Expression): void => {
    for (const obj of spreadObjectLiterals(e)) {
      if (seen.has(obj)) continue;
      seen.add(obj);
      for (const prop of obj.properties) {
        if (ts.isSpreadAssignment(prop)) {
          walk(prop.expression);
          continue;
        }
        const pn = propNameLower(prop);
        if (pn !== null) out.push(pn);
      }
    }
  };
  walk(expr);
  return out;
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
  // An identifier bound ONCE in this file to an object literal is decidable, so
  // `const P = { href: "x", target: "_blank" }; <Foo {...P}>` is not residue -- it was
  // silent before, while the same spread on an `<a>` was reported (review R12 question
  // 2). Resolution is deliberately narrow: exactly one declaration of that name
  // anywhere in the file, with an object-literal initializer. More than one binding
  // means shadowing is possible, so it stays unresolvable and fails closed.
  if (ts.isIdentifier(e)) {
    const matches: ts.ObjectLiteralExpression[] = [];
    let bindings = 0;
    const visit = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === e.text) {
        bindings += 1;
        const init = n.initializer ? unparen(n.initializer) : undefined;
        if (init && ts.isObjectLiteralExpression(init)) matches.push(init);
      }
      ts.forEachChild(n, visit);
    };
    visit(e.getSourceFile());
    return bindings === 1 ? matches : [];
  }
  return [];
}

function unparen(node: ts.Expression): ts.Expression {
  let n = node;
  // Parentheses AND type-only wrappers. `as const`, `satisfies Props`, a non-null `!`,
  // and an old-style type assertion all erase at runtime, so
  // `<Foo {...({href:"x", target:"_blank"} as const)}>` really forwards both props --
  // yet the object was invisible and the anchor scanned clean (review R12 BLOCKING 1).
  for (;;) {
    if (ts.isParenthesizedExpression(n)) n = n.expression;
    else if (ts.isAsExpression(n)) n = n.expression;
    else if (ts.isSatisfiesExpression(n)) n = n.expression;
    else if (ts.isNonNullExpression(n)) n = n.expression;
    else if (ts.isTypeAssertionExpression(n)) n = n.expression;
    // A comma expression evaluates to its LAST operand, so `(0, {href, target})` really
    // forwards the object -- probed from review R13's question 1 before that round
    // reported. An IIFE and an `await` are NOT transparent (a call and a promise), so
    // they correctly stay unresolvable residue.
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.CommaToken)
      n = n.right;
    else return n;
  }
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

/**
 * Is `name` bound in THIS file by an import from one of `froms`?
 *
 * R27 BLOCKING 1: the guard trusted the SPELLING `NewTabHint`, so a local
 * `const NewTabHint = () => null` shadowed the real component and an anchor with no
 * announcement scanned clean. The same held for `Link`. Spelling is not binding, and a guard
 * that checks a name instead of what the name refers to can be defeated by one line.
 *
 * Fail-closed by construction: an unresolvable or absent import means NOT trusted.
 */
const importCache = new WeakMap<ts.SourceFile, Map<string, boolean>>();

function isImportedFrom(sf: ts.SourceFile, name: string, froms: readonly string[]): boolean {
  // Cached per SOURCE FILE, because the answer varies per file and this is asked once per
  // ANCHOR. Uncached it walked every import statement of all 246 files repeatedly and pushed
  // the live-census test from 3.0s to 5.9-7.2s under load, over vitest's 5s default. Raising
  // the timeout hid that; caching removes it.
  const key = `${name}\u0000${froms.join("\u0000")}`;
  let perFile = importCache.get(sf);
  if (perFile === undefined) {
    perFile = new Map();
    importCache.set(sf, perFile);
  }
  const hit = perFile.get(key);
  if (hit !== undefined) return hit;
  const result = computeIsImportedFrom(sf, name, froms);
  perFile.set(key, result);
  return result;
}

/**
 * Is `name` SHADOWED by a declaration in some scope enclosing `at`?
 *
 * R28 BLOCKING 1: proving an import exists in the file is not proving the JSX use site refers to
 * it. `const NewTabHint = () => null` inside a component shadows the import, and both fixtures
 * type-check cleanly. Walking the enclosing scopes is what makes the binding claim true at the
 * point it is used.
 *
 * Fail-closed: any declaration of that name in an enclosing scope counts as a shadow, even one
 * that would be a redeclaration error, because a guard should not adjudicate validity.
 */
function isShadowedAt(at: ts.Node, name: string): boolean {
  // A name can be introduced by an identifier OR by a destructuring pattern, in a declaration
  // or a parameter. Handling only identifiers missed `({ NewTabHint }) => ...`, which is the
  // most idiomatic way a React component would shadow it.
  const bindsName = (bn: ts.BindingName): boolean => {
    if (ts.isIdentifier(bn)) return bn.text === name;
    for (const el of bn.elements) {
      if (ts.isOmittedExpression(el)) continue;
      // An aliased destructure (`{ NewTabHint: other }`) binds `other`, not the name.
      if (bindsName(el.name)) return true;
    }
    return false;
  };
  const declares = (n: ts.Node): boolean => {
    if (ts.isVariableStatement(n)) {
      return n.declarationList.declarations.some((d) => bindsName(d.name));
    }
    if (
      (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) &&
      n.name !== undefined &&
      n.name.text === name
    ) {
      return true;
    }
    return false;
  };
  // A LOOP binding and a NAMED function expression also introduce the name (review R29
  // BLOCKING 1): `for (const NewTabHint of hints)` type-checks and shadowed the import.
  const loopOrNamedFnBinds = (n: ts.Node): boolean => {
    if (ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isForStatement(n)) {
      const init = n.initializer;
      if (init !== undefined && ts.isVariableDeclarationList(init)) {
        return init.declarations.some((d) => bindsName(d.name));
      }
      return false;
    }
    // `const f = function NewTabHint() {}` binds the name inside its own body, and so does a
    // named CLASS expression (review R30 BLOCKING 2).
    if (ts.isFunctionExpression(n) && n.name !== undefined) return n.name.text === name;
    if (ts.isClassExpression(n) && n.name !== undefined) return n.name.text === name;
    // A namespace/module block and a switch's case block are lexical scopes too.
    if (ts.isModuleBlock(n)) return n.statements.some(declares);
    if (ts.isCaseBlock(n)) {
      return n.clauses.some((c) => c.statements.some(declares));
    }
    if (ts.isCaseClause(n) || ts.isDefaultClause(n)) return n.statements.some(declares);
    if (ts.isCatchClause(n)) {
      return n.variableDeclaration !== undefined && bindsName(n.variableDeclaration.name);
    }
    return false;
  };
  /**
   * `var` is FUNCTION-scoped and hoists out of every block, so a declaration the ancestor walk can
   * never reach still shadows the import at the use site (review R31 BLOCKING 3):
   *
   *   function A() { if (cond) { var NewTabHint = () => null; } return <a …><NewTabHint /></a>; }
   *
   * The declaration is not on the path from the use site to the function, so no ancestor-only walk
   * can see it -- the model was wrong, not the list. Scans the whole function body WITHOUT entering
   * a nested function, where a `var` belongs to that function instead.
   *
   * `var` ONLY. The first version also counted a block-level `function` declaration, described as
   * "stricter than the language" -- but these files are ES modules, so strict mode applies and such
   * a declaration IS block-scoped and does not reach a use site outside its block. That produced
   * false positives on valid code (review R32 HIGH 6), and "deliberately stricter" is not a defence
   * when the strictness rejects markup an author would reasonably write. Namespace bodies and class
   * static blocks are their own `var` scopes and are not entered either, for the same reason.
   */
  const hoistedBinds = (scope: ts.Node): boolean => {
    let found = false;
    const walk = (n: ts.Node): void => {
      if (found) return;
      // Every construct that starts a new `var` scope. Missing any of these turns a declaration
      // that cannot reach the use site into a reported shadow.
      if (
        ts.isFunctionLike(n) ||
        ts.isModuleDeclaration(n) ||
        ts.isClassStaticBlockDeclaration(n)
      ) {
        return;
      }
      if (ts.isVariableDeclarationList(n) && (n.flags & ts.NodeFlags.BlockScoped) === 0) {
        // A `var` list, including a `for (var … )` initializer, which is not a VariableStatement.
        if (n.declarations.some((d) => bindsName(d.name))) {
          found = true;
          return;
        }
      }
      ts.forEachChild(n, walk);
    };
    ts.forEachChild(scope, walk);
    return found;
  };

  for (let cur: ts.Node | undefined = at; cur !== undefined; cur = cur.parent) {
    if (
      ts.isSourceFile(cur) ||
      ts.isFunctionLike(cur) ||
      ts.isModuleDeclaration(cur) ||
      ts.isClassStaticBlockDeclaration(cur)
    ) {
      // At every `var` scope boundary: module scope, a function, a NAMESPACE body, and a class
      // static block. R32 correctly stopped the downward scan from ENTERING the last two -- a `var`
      // in there cannot reach a use site outside -- but only doing that half was a fail-OPEN hole:
      // a use site INSIDE one of them is shadowed by a `var` in a sibling block within it, and
      // nothing scanned that scope. A boundary is a boundary in both directions.
      if (hoistedBinds(cur)) return true;
    }
    if (ts.isSourceFile(cur)) {
      // MODULE SCOPE counts too. A top-level `class NewTabHint {}` or `const NewTabHint = …`
      // alongside the import is a redeclaration error, and this guard's stated policy is not to
      // adjudicate validity -- the identifier at the use site no longer clearly refers to the
      // import, so it fails closed. `declares` never matches an ImportDeclaration, so the import
      // itself cannot trip this.
      if (cur.statements.some(declares)) return true;
      break;
    }
    const body = (cur as { body?: ts.Node }).body;
    const stmts = body !== undefined && ts.isBlock(body) ? body.statements : undefined;
    if (stmts !== undefined && stmts.some(declares)) return true;
    if (ts.isBlock(cur) && cur.statements.some(declares)) return true;
    if (loopOrNamedFnBinds(cur)) return true;
    // A function/arrow PARAMETER of that name shadows too.
    const params = (cur as { parameters?: ts.NodeArray<ts.ParameterDeclaration> }).parameters;
    if (params?.some((pm) => bindsName(pm.name)) === true) return true;
  }
  return false;
}

function computeIsImportedFrom(sf: ts.SourceFile, name: string, froms: readonly string[]): boolean {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const spec = st.moduleSpecifier;
    if (!ts.isStringLiteral(spec)) continue;
    if (!froms.some((f) => spec.text === f || spec.text.endsWith(f))) continue;
    const clause = st.importClause;
    if (clause.name?.text === name) return true; // default import
    const b = clause.namedBindings;
    if (b && ts.isNamedImports(b)) {
      for (const el of b.elements) if (el.name.text === name) return true;
    }
  }
  return false;
}

/** Is `n` the NewTabHint element? One definition, shared by the separator walk and the
 *  destination-content rule, so the two cannot disagree about what the hint is. */
function isHintElement(n: ts.Node): boolean {
  return (
    (ts.isJsxSelfClosingElement(n) && n.tagName.getText() === HINT) ||
    (ts.isJsxElement(n) && n.openingElement.tagName.getText() === HINT)
  );
}

/**
 * Does the anchor still contribute a DESTINATION to its accessible name, i.e. visible
 * content other than the announcement itself?
 *
 * R21 BLOCKING 2: the guard checked whether the HINT was visible but never whether the
 * LABEL still was. `<a ...><span aria-hidden="true">Go</span> <NewTabHint /></a>` therefore
 * passed, and both installed accessible-name implementations compute the name as
 * "(opens in a new tab)" alone -- strictly worse than no announcement, because the link no
 * longer says where it goes. The `aria-label` path already had this rule as `phrase-only`;
 * the content path did not.
 *
 * Deliberately conservative in the direction that matters: an aria-hidden ICON beside a
 * visible label is the common real shape here and must keep passing, so this only reports
 * when NOTHING outside the hint survives.
 */
function hasDestinationContent(anchor: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  if (!ts.isJsxElement(anchor)) return false;
  return childrenCarryDestination(anchor.children);
}

/**
 * Does this expression provably render nothing? Used to decide whether an interpolated child
 * can be a destination. Deliberately narrow: only PROVABLE emptiness returns true, so a
 * genuinely dynamic value is still assumed to carry a label.
 *
 * `{" "}`, `{null}`, `{false}` and `{undefined}` were the first three misses (R22 BLOCKING 1
 * and its predecessor); a conditional whose BOTH branches render nothing is the same fact one
 * level up, so it is decided by the same predicate rather than a second rule.
 */
function rendersNothing(e: ts.Expression): boolean {
  const n = unparen(e);
  // React renders nothing for null, undefined and BOTH booleans. It DOES render numbers, so
  // `{0}` prints "0". Falsiness and renders-nothing are ORTHOGONAL, and conflating them was
  // wrong in both directions (review R24 BLOCKING 3): `[]` is truthy yet renders nothing,
  // while `0` is falsy yet renders a character.
  if (
    n.kind === ts.SyntaxKind.NullKeyword ||
    n.kind === ts.SyntaxKind.FalseKeyword ||
    n.kind === ts.SyntaxKind.TrueKeyword ||
    isGlobalRef(n, "undefined")
  ) {
    return true;
  }
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
    return n.text.trim().length === 0;
  }
  // An array renders the concatenation of its elements, so it renders nothing iff every
  // element does. `[]` and `[null]` both qualify.
  // `void <anything>` evaluates to undefined (review R25 BLOCKING 3).
  if (ts.isVoidExpression(n)) return true;
  if (ts.isArrayLiteralExpression(n)) {
    return n.elements.every((el) => {
      // A HOLE (`[,]`) is undefined and renders nothing.
      if (el.kind === ts.SyntaxKind.OmittedExpression) return true;
      // A spread renders nothing iff what it spreads does; anything else is opaque.
      if (ts.isSpreadElement(el)) {
        const inner = unparen(el.expression);
        if (ts.isArrayLiteralExpression(inner)) return rendersNothing(inner);
        // Spreading a STRING yields one element per character, so an empty string yields none
        // (review R27 BLOCKING 3). Any other operand is opaque.
        if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
          // TRIM, matching the ordinary-string rule. `length === 0` let `{[..." "]}` through
          // while `{" "}` was correctly rejected -- the same fact decided two ways in one
          // function (review R28 BLOCKING 4).
          return inner.text.trim().length === 0;
        }
        return false;
      }
      return rendersNothing(el);
    });
  }
  // A plain object literal is not valid React content. CORRECTED at R26b: React does not
  // render nothing, it THROWS ("Objects are not valid as a React child"), verified against
  // React 19.2.4. Treating it as contributing no name is still right -- the component cannot
  // render at all -- but the earlier claim about the mechanism was false.
  if (ts.isObjectLiteralExpression(n)) return true;
  // ANY expression that always PRODUCES a boolean renders nothing -- React renders neither
  // `true` nor `false`. R29 handled only literal operands (`!true`), which left `{!label}` and
  // `{n > 0}` fail-open (review R30 BLOCKING 1). The set of always-boolean operators is closed
  // in the grammar, so this is a decidable rule rather than another approximation:
  //   `!x`, the eight comparisons, `instanceof`, `in`, and `delete`.
  // Deliberately NOT `typeof`, which yields a STRING and therefore renders.
  if (isAlwaysBoolean(n)) return true;
  if (ts.isConditionalExpression(n)) {
    // When the TEST is a literal we know which branch is taken, so only that one matters.
    // Requiring BOTH branches empty accepted `{true ? null : "Dest"}`, which renders nothing.
    const cond = unparen(n.condition);
    if (isLiteralTruthy(cond)) return rendersNothing(n.whenTrue);
    if (isLiteralFalsy(cond)) return rendersNothing(n.whenFalse);
    return rendersNothing(n.whenTrue) && rendersNothing(n.whenFalse);
  }
  // `a && b` evaluates to `a` when `a` is FALSY and to `b` otherwise. Decide which operand is
  // the result before asking what it renders; give up when `a` is not a literal.
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    const left = unparen(n.left);
    // `a && b` yields `a` when falsy, else `b`.
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (isLiteralFalsy(left)) return rendersNothing(left);
      if (isLiteralTruthy(left)) return rendersNothing(n.right);
      return false;
    }
    // `a || b` yields `a` when TRUTHY, else `b` -- the mirror of `&&`, and it was missing.
    // Found by probing the operator surface after R24 rather than by a review round.
    if (op === ts.SyntaxKind.BarBarToken) {
      if (isLiteralTruthy(left)) return rendersNothing(left);
      if (isLiteralFalsy(left)) return rendersNothing(n.right);
      return false;
    }
    // `a ?? b` yields `b` only when `a` is null/undefined. Note this is NOT falsiness: `0 ?? x`
    // yields `0`, which renders.
    if (op === ts.SyntaxKind.QuestionQuestionToken) {
      const nullish = left.kind === ts.SyntaxKind.NullKeyword || isGlobalRef(left, "undefined");
      if (nullish) return rendersNothing(n.right);
      if (isLiteralTruthy(left) || isLiteralFalsy(left)) return rendersNothing(left);
      return false;
    }
    return false;
  }
  return false;
}

/** Is this identifier the GLOBAL `undefined` / `NaN`, rather than a local of the same name?
 *
 *  R34 BLOCKING 1: the guard read these by SPELLING, which is the exact mistake R27 fixed for
 *  `NewTabHint` -- `function A(NaN) { ... hidden={NaN} }` binds a parameter, and every rule that
 *  treats the identifier as the global then reasons about a value that is not there. The scanner
 *  already owns the machinery to answer this, so the fix is to use it rather than to trust the name.
 */
function isGlobalRef(n: ts.Node, name: "undefined" | "NaN"): boolean {
  return ts.isIdentifier(n) && n.text === name && !isShadowedAt(n, name);
}

/** Definitely-falsy literals. `0` and `""` are falsy but `0` still RENDERS, which is why this
 *  is separate from `rendersNothing`. */
function isLiteralFalsy(n: ts.Expression): boolean {
  if (n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword) return true;
  if (isGlobalRef(n, "undefined")) return true;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text.length === 0;
  if (ts.isNumericLiteral(n)) return Number(n.text) === 0;
  // Nullish however spelled, `void 0` included (review R34 BLOCKING 2).
  if (isProvablyNullish(n)) return true;
  // An evaluated-empty template is falsy: `` `${""}` `` is "".
  if (ts.isTemplateExpression(n)) {
    const v = staticStringValue(n);
    return v !== null && v.length === 0;
  }
  // SELECTION composes: whichever operand or branch is taken decides falsiness.
  const picked = pickedOperand(n);
  if (picked !== null) return isLiteralFalsy(picked);
  // The three falsy values that are not plain literals (review R32 HIGH 7). React omits an
  // attribute for each of them -- measured for `hidden` and `inert` -- and the helper claimed to
  // recognise "every falsy value" while missing all three.
  // `!<decidable>` is decidable too: `!false` is provably true, `!1` provably false. Without this a
  // provably-open `<details open={!false}>` was reported. Exact JS semantics, so it is equally
  // correct wherever these two helpers pick a conditional branch or a logical operand.
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) {
    return isLiteralTruthy(n.operand);
  }
  // By VALUE, not by spelling: `/^0+n$/` missed `0x0n`, `0b0n` and separator forms (R33 BLOCKING 3).
  if (ts.isBigIntLiteral(n)) return bigIntLiteralIsZero(n.text);
  if (isGlobalRef(n, "NaN")) return true;
  // `-0` is a prefix MINUS applied to `0`, not a numeric literal, so the check above never saw it.
  if (
    ts.isPrefixUnaryExpression(n) &&
    (n.operator === ts.SyntaxKind.MinusToken || n.operator === ts.SyntaxKind.PlusToken)
  ) {
    // `-0`, `-0n` and `-NaN` are all falsy; the sign does not change that (review R34 BLOCKING 2).
    if (ts.isNumericLiteral(n.operand)) return Number(n.operand.text) === 0;
    if (ts.isBigIntLiteral(n.operand)) return bigIntLiteralIsZero(n.operand.text);
    if (isGlobalRef(n.operand, "NaN")) return true;
  }
  return false;
}

/** The operand a SELECTION expression evaluates to, when that is decidable; otherwise null.
 *
 *  `?:`, `&&`, `||` and `??` all pick one of their operands, so any question about the VALUE -- is
 *  it truthy, is it nullish, does React omit it -- has the same answer for the whole expression as
 *  for the operand chosen. Three separate helpers were each answering that question partially and
 *  disagreeing (review R34 BLOCKING 2 / HIGH 3), so the selection lives here once.
 */
function pickedOperand(e0: ts.Expression): ts.Expression | null {
  const e = unparen(e0);
  if (ts.isConditionalExpression(e)) {
    const cond = unparen(e.condition);
    if (isLiteralTruthy(cond)) return e.whenTrue;
    if (isLiteralFalsy(cond)) return e.whenFalse;
    return null;
  }
  if (ts.isBinaryExpression(e)) {
    const left = unparen(e.left);
    switch (e.operatorToken.kind) {
      case ts.SyntaxKind.AmpersandAmpersandToken:
        if (isLiteralFalsy(left)) return left;
        if (isLiteralTruthy(left)) return e.right;
        return null;
      case ts.SyntaxKind.BarBarToken:
        if (isLiteralTruthy(left)) return left;
        if (isLiteralFalsy(left)) return e.right;
        return null;
      case ts.SyntaxKind.QuestionQuestionToken:
        if (isProvablyNullish(left)) return e.right;
        if (isLiteralTruthy(left) || isLiteralFalsy(left)) return left;
        return null;
      default:
        return null;
    }
  }
  return null;
}

/**
 * The STRING a value expression evaluates to, or null when that cannot be decided statically.
 *
 * Two rules need this and both were doing their own weaker version. `stringOf` discarded template
 * SUBSTITUTIONS, so `aria-hidden={`${true}`}` scanned clean while React emitted `aria-hidden="true"`
 * and the announcement left the accessible name (review R32 BLOCKING 2). The style matcher worked on
 * raw TEXT, so a comma expression or a literal conditional slipped through even though React emits
 * the hiding declaration (review R32 BLOCKING 5). Both are the same missing capability: evaluate the
 * value-transparent wrappers instead of pattern-matching around them.
 */
function staticStringValue(e0: ts.Expression): string | null {
  const e = unparen(e0);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isNumericLiteral(e)) return String(Number(e.text));
  // How each of these STRINGIFIES inside a template, all measured: `${null}` is "null", `${0n}` and
  // `${-0}` are both "0". Leaving them undecidable made every one a false positive, because an
  // undecidable aria-hidden fails closed (review R33 BLOCKING 5).
  if (e.kind === ts.SyntaxKind.NullKeyword) return "null";
  if (isGlobalRef(e, "undefined")) return "undefined";
  if (isGlobalRef(e, "NaN")) return "NaN";
  if (ts.isBigIntLiteral(e)) return e.text.replace(/n$/, "").replace(/_/g, "");
  if (
    ts.isPrefixUnaryExpression(e) &&
    (e.operator === ts.SyntaxKind.MinusToken || e.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(e.operand)
  ) {
    const n =
      e.operator === ts.SyntaxKind.MinusToken ? -Number(e.operand.text) : Number(e.operand.text);
    return String(n === 0 ? 0 : n); // `-0` stringifies to "0"
  }
  if (e.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (e.kind === ts.SyntaxKind.FalseKeyword) return "false";
  if (ts.isTemplateExpression(e)) {
    let out = e.head.text;
    for (const span of e.templateSpans) {
      const part = staticStringValue(span.expression);
      if (part === null) return null; // one dynamic substitution makes the whole value unknown
      out += part + span.literal.text;
    }
    return out;
  }
  if (ts.isConditionalExpression(e)) {
    const cond = unparen(e.condition);
    if (isLiteralTruthy(cond)) return staticStringValue(e.whenTrue);
    if (isLiteralFalsy(cond)) return staticStringValue(e.whenFalse);
    // An undecidable TEST does not make the VALUE undecidable when both branches agree:
    // `display: flag ? "none" : "none"` is "none" either way (review R33 BLOCKING 5, fail-open).
    const a = staticStringValue(e.whenTrue);
    const b = staticStringValue(e.whenFalse);
    return a !== null && a === b ? a : null;
  }
  if (ts.isBinaryExpression(e)) {
    // NOTE: no comma branch. `unparen` already resolves a comma expression to its right operand
    // before this function sees it, so one here would be unreachable -- a mutation deleting it
    // changed no test, which is how it was caught rather than shipped as a comment claiming to be
    // the mechanism.
    // String concatenation of two decidable operands.
    if (e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const l = staticStringValue(e.left);
      const r = staticStringValue(e.right);
      return l === null || r === null ? null : l + r;
    }
    const left = unparen(e.left);
    if (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (isLiteralTruthy(left)) return staticStringValue(e.right);
      if (isLiteralFalsy(left)) return staticStringValue(left);
      return null;
    }
    if (e.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      if (isLiteralTruthy(left)) return staticStringValue(left);
      if (isLiteralFalsy(left)) return staticStringValue(e.right);
      return null;
    }
    // `??` was missing entirely. NOT falsiness: `0 ?? x` is `0`.
    if (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      if (isProvablyNullish(left)) return staticStringValue(e.right);
      if (isLiteralTruthy(left) || isLiteralFalsy(left)) return staticStringValue(left);
      return null;
    }
  }
  return null;
}

/** Definitely-truthy literals. Arrays and objects are ALWAYS truthy however empty they are --
 *  omitting them made `[] && "Dest"` manufacture a violation (review R24 BLOCKING 3). */
function isLiteralTruthy(n: ts.Expression): boolean {
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) {
    return isLiteralFalsy(n.operand);
  }
  if (ts.isArrayLiteralExpression(n) || ts.isObjectLiteralExpression(n)) return true;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text.length > 0;
  if (ts.isNumericLiteral(n)) return Number(n.text) !== 0;
  // Everything below is DEFINITELY truthy whatever its operands are, and leaving it out left
  // operand selection fail-open: `{-1 && <span aria-hidden="true">Go</span>}` scanned clean while
  // the accessible name held only the announcement (review R33 BLOCKING 2). The helpers decided
  // "literal", but selection only needs "decidable".
  if (ts.isPrefixUnaryExpression(n)) {
    // A signed numeric literal: `-1` is truthy, `-0` is not (handled by isLiteralFalsy).
    if (n.operator === ts.SyntaxKind.MinusToken || n.operator === ts.SyntaxKind.PlusToken) {
      if (ts.isNumericLiteral(n.operand)) return Number(n.operand.text) !== 0;
      if (ts.isBigIntLiteral(n.operand)) return !bigIntLiteralIsZero(n.operand.text);
    }
  }
  if (ts.isBigIntLiteral(n)) return !bigIntLiteralIsZero(n.text);
  if (ts.isRegularExpressionLiteral(n)) return true; // a RegExp object
  if (ts.isTypeOfExpression(n)) return true; // always a non-empty string
  if (ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isClassExpression(n)) return true;
  if (ts.isNewExpression(n)) return true; // constructors yield objects
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return true;
  if (ts.isTemplateExpression(n)) {
    // A template with a decidable value is truthy iff that value is non-empty; an undecidable one
    // is still truthy if any literal chunk is non-empty.
    const v = staticStringValue(n);
    if (v !== null) return v.length > 0;
    if (n.head.text.length > 0) return true;
    return n.templateSpans.some((sp) => sp.literal.text.length > 0);
  }
  const picked = pickedOperand(n);
  if (picked !== null) return isLiteralTruthy(picked);
  return false;
}

/** Is this BigInt literal's VALUE zero? Handles every radix and numeric separators. */
function bigIntLiteralIsZero(text: string): boolean {
  try {
    return BigInt(text.replace(/n$/, "").replace(/_/g, "")) === BigInt(0);
  } catch {
    return false;
  }
}

/**
 * Does the expression inside `{...}` carry a destination? `true` yes, `false` no, `null` opaque.
 *
 * R31 BLOCKING 2: an expression container holding JSX is NOT opaque. `{<span aria-hidden="true">Go
 * </span>}` renders byte-identical HTML to the same element written as a direct child (measured),
 * so the walk that decides the direct child must decide this one. Treating the container as opaque
 * credited a destination the accessible name never contains, which is the fail-open this rule
 * exists to prevent -- the same "syntactic position, decided elsewhere" mistake as R4/R25/R26b,
 * except here the position is decidable and the guard simply was not looking.
 *
 * Statically decidable containers are decided; `{label}` stays opaque and is assumed to carry a
 * destination, which is the accepted limit recorded in §6.4 and unchanged here.
 */
function expressionDestination(e0: ts.Expression): boolean | null {
  const e = unparen(e0);
  // Covers null/false/undefined/whitespace strings and every always-boolean form.
  if (rendersNothing(e)) return false;
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) {
    return childrenCarryDestination(ts.factory.createNodeArray([e]));
  }
  if (ts.isArrayLiteralExpression(e)) {
    // `{[<span aria-hidden="true">Go</span>]}` renders exactly like the bare element. A hole
    // contributes nothing; a spread of a LITERAL array is decidable and was previously not
    // (review R32 BLOCKING 4 -- and its existing fixture passed only through `rendersNothing`,
    // so the branch was unpinned as well as incomplete).
    let anyOpaque = false;
    for (const el of e.elements) {
      if (ts.isOmittedExpression(el)) continue;
      if (ts.isSpreadElement(el)) {
        const inner = unparen(el.expression);
        if (ts.isArrayLiteralExpression(inner)) {
          const d = expressionDestination(inner);
          if (d === true) return true;
          if (d === null) anyOpaque = true;
          continue;
        }
        anyOpaque = true;
        continue;
      }
      const d = expressionDestination(el);
      if (d === true) return true;
      if (d === null) anyOpaque = true;
    }
    return anyOpaque ? null : false;
  }
  if (ts.isConditionalExpression(e)) {
    const t = unparen(e.condition);
    if (isLiteralTruthy(t)) return expressionDestination(e.whenTrue);
    if (isLiteralFalsy(t)) return expressionDestination(e.whenFalse);
    // Neither branch decidable-by-test, but if BOTH branches independently carry no destination
    // then the test cannot matter -- whichever runs, nothing is named (review R32 BLOCKING 4).
    const a = expressionDestination(e.whenTrue);
    const b = expressionDestination(e.whenFalse);
    if (a === false && b === false) return false;
    // No `both true -> true` arm. The caller treats `null` as "assume a destination", so it would be
    // verdict-identical to falling through -- a mutation deleting it changed no test, which is the
    // fourth equivalent branch found in this guard by sweeping rather than by review.
    return null;
  }
  // `&&`, `||` and `??` SELECT an operand, exactly as in `rendersNothing`. Leaving them opaque
  // meant `{true && <span aria-hidden="true">Go</span>}` credited a destination the accessible name
  // never contains (review R32 BLOCKING 4). Mirrors that function deliberately: two rules deciding
  // the same operand-selection question must not drift apart.
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    const left = unparen(e.left);
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      if (isLiteralFalsy(left)) return expressionDestination(left);
      if (isLiteralTruthy(left)) return expressionDestination(e.right);
      return null;
    }
    if (op === ts.SyntaxKind.BarBarToken) {
      if (isLiteralTruthy(left)) return expressionDestination(left);
      if (isLiteralFalsy(left)) return expressionDestination(e.right);
      return null;
    }
    if (op === ts.SyntaxKind.QuestionQuestionToken) {
      // NOT falsiness: `0 ?? x` yields `0`, which renders "0".
      const nullish = left.kind === ts.SyntaxKind.NullKeyword || isGlobalRef(left, "undefined");
      if (nullish) return expressionDestination(e.right);
      if (isLiteralTruthy(left) || isLiteralFalsy(left)) return expressionDestination(left);
      return null;
    }
  }
  return null; // `{label}`, a call, a member access: opaque
}

/** The walk itself, over a child list, so a fragment reuses it without being faked into an
 *  element -- the first attempt spread a JsxFragment into an object shaped like a
 *  JsxElement, which every `ts.isJsxElement` guard then rejected. */
function childrenCarryDestination(children: ts.NodeArray<ts.JsxChild>): boolean {
  for (const child of children) {
    // NOTE: no `isHintElement` skip here. The announcement is not a destination, but the
    // untrusted-component rule below already skips every component including this one, and a
    // mutation proved the explicit line changed no test. It was kept for one round with a comment
    // admitting it was not the mechanism; R34 listed it as dead, which is the right call -- a line
    // that states intent while doing nothing is how the wrong line gets preserved later.
    if (ts.isJsxText(child)) {
      if (child.text.trim().length > 0) return true;
      continue;
    }
    // An interpolated expression is opaque -- `{label}` must not be read as absent -- but a
    // LITERAL one is not opaque at all, and treating it as such was a fail-open: `{" "}`,
    // `{null}` and `{false}` each contribute nothing to the name, so an anchor whose only
    // other child is the hint really does compute to "(opens in a new tab)" alone. Found by
    // probing this rule after writing it, not by review.
    if (ts.isJsxExpression(child)) {
      if (!child.expression) continue;
      const decided = expressionDestination(child.expression);
      if (decided === false) continue;
      return true; // decided yes, or genuinely opaque: assume it carries a destination
    }
    // A fragment carries no attributes, so it cannot hide; look through it.
    if (ts.isJsxFragment(child)) {
      if (childrenCarryDestination(child.children)) return true;
      continue;
    }
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      if (hidesFromAccName(child)) continue;
      const tag = ts.isJsxElement(child)
        ? child.openingElement.tagName.getText()
        : child.tagName.getText();
      // A COMPONENT is undecidable in both directions: it may render a label, or discard the
      // children it was given. R26b BLOCKING 1 showed trusting it is a fail-open --
      // `<Drop>Go</Drop>` renders nothing when `Drop` returns null. Failing CLOSED is chosen
      // because no live anchor takes its label from a component (all 22 use literal text, with
      // components only as aria-hidden icons), so the strictness costs nothing today and a
      // legitimate future case takes one reasoned exemption.
      if (!/^[a-z]/.test(tag) || tag.includes(".")) continue;
      // NAMING ATTRIBUTES, checked for paired AND self-closing elements alike. Inspecting them
      // only on self-closing gave equivalent markup opposite verdicts: `<span aria-label="Go" />`
      // passed while `<span aria-label="Go"></span>` was reported (review R26b HIGH 3).
      const attrs = ts.isJsxElement(child) ? child.openingElement.attributes : child.attributes;
      // `alt` only names the elements it APPLIES to -- `<br alt="Go" />` names nothing (R26b
      // BLOCKING 2). `aria-labelledby` is deliberately absent: it points at another element, a
      // dangling reference names nothing, and the target cannot be resolved statically, so
      // treating it as proof was a fail-open.
      // MODEL CHANGE at R28. The previous rule split on TAG -- input/select/textarea contribute
      // their value, everything else its aria-label -- and R28 showed that wrong in BOTH
      // directions on measured cases:
      //
      //   <input type="checkbox" value="Go">      -> "(opens in a new tab)"   value does NOT name
      //   <input type="checkbox" aria-label="Go"> -> "Go (opens in a new tab)" label DOES name
      //   <button aria-label="Go">                -> "(opens in a new tab)"   label does NOT name
      //
      // Real AccName behaviour varies by ROLE and by input TYPE, and this is the third
      // successive round spent refining an attribute-based approximation of it. So the approved
      // shape is narrowed instead, per the principle that fixed the main rule at R5: only
      // things whose contribution is unambiguous count as a destination -- rendered TEXT, and
      // `alt` on an image. No attribute on any other nested element is proof.
      //
      // Cost, measured before choosing: no live anchor relies on a nested element's attribute
      // for its label (all 22 use literal text), so this reports nothing today. A future case
      // takes one reasoned exemption, and that is cheaper than a rule that has been wrong three
      // rounds running.
      const ALT_ELEMENTS = new Set(["img", "area"]);
      if (ALT_ELEMENTS.has(tag)) {
        for (const a of attrs.properties) {
          if (!ts.isJsxAttribute(a) || jsxAttrNameLower(a) !== "alt" || !a.initializer) continue;
          const val = stringOf(a.initializer);
          // A dynamic alt is opaque and therefore assumed to name something; an EMPTY alt is
          // explicitly "no name".
          if (val === null || val.trim().length > 0) return true;
        }
      }
      // Then the children of an intrinsic element, which really do render.
      if (ts.isJsxElement(child) && childrenCarryDestination(child.children)) return true;
      continue;
    }
  }
  return false;
}

/** Elements whose content the HTML Standard never renders: script-supporting elements and
 *  metadata content. Text inside them contributes nothing to an accessible name, and a hint
 *  inside them is not announced. */
// Taken from the HTML Standard's own hidden-elements rendering rules rather than assembled by
// hand -- `<rp>` was missing, and it is `display: none` there (review R29 BLOCKING 3). Only the
// members that can plausibly appear inside an `<a>` are listed; see the metadata note below.
const NOT_RENDERED_TAGS = new Set([
  "template",
  "script",
  "style",
  "noscript",
  "datalist",
  "rp",
  // React 19 HOISTS a nested `<title>` out of the anchor, so its text never contributes to the
  // anchor's name (review R30 BLOCKING 4). The earlier reason for excluding it -- "not valid
  // inside an `<a>`" -- was factually wrong about React's behaviour, which is a different error
  // from getting a list wrong. `title` is also an attribute name; it lives in
  // CASE_INSENSITIVE_NAMES for that reason, which keeps the classification checks satisfied.
  "title",
  "noembed",
  "noframes",
  "param",
]);
// The rest of the metadata elements are absent for a MEASURED reason, not the one this comment
// used to give. `head`, `meta`, `link`, `base` and `basefont` were each rendered inside an anchor:
// `link`, `meta`, `base` and `area` THROW on children, so no hint can sit inside them, while
// `head` and `basefont` render their children normally and belong in neither set. `title` IS here
// (React hoists it), and the earlier claim that it was excluded because it "is not valid inside an
// `<a>`" was wrong about behaviour, not about a list -- see the R30/R31 record in the handoff.
// `title` and `style` are also real attribute names, which is why both appear in
// CASE_INSENSITIVE_NAMES; without that the guard's own classification checks read them as
// silenced attributes.

/** Does this `<title>` actually NAME something, i.e. is it the DIRECT child of an `<svg>`?
 *
 *  R31 HIGH 5: `<title>` is two different elements. React hoists the HTML one out of the anchor, so
 *  its text never reaches the accessible name -- but an SVG one stays where it is and names the
 *  graphic: `<svg><title>Go</title></svg>` computes "Go (opens in a new tab)".
 *
 *  The first version of this asked "is there an `<svg>` ANYWHERE above me", stopping at
 *  `<foreignObject>`. That is a fail-OPEN hole, found by measuring the shapes the R32 reviewer began
 *  probing rather than by waiting for the finding. Per SVG-AAM an `<svg>` takes its name from its
 *  OWN direct-child `<title>`; a deeper one names its nearest graphics container instead, which is
 *  not the anchor's name. Measured, and the verdict is identical on both render paths:
 *
 *    <svg><title>Go</title></svg>              -> "Go (opens in a new tab)"   NAMES
 *    <svg><g><title>Go</title></g></svg>       -> "(opens in a new tab)"      names nothing
 *    <svg><div><title>Go</title></div></svg>   -> "(opens in a new tab)"      names nothing
 *    <svg><foreignObject><title>…              -> "(opens in a new tab)"      names nothing
 *
 *  The `<div>` / `<p>` cases are the interesting ones: a client React render keeps the title in the
 *  SVG namespace while SSR markup reparsed by the HTML parser breaks out to XHTML (both measured, and
 *  they DISAGREE on namespace). The verdict is the same either way, so this rule deliberately does
 *  NOT model foreign-content breakout -- a direct-child test is correct under both and cannot drift
 *  apart from them. Fail-closed default: anything else is the HTML reading, i.e. not rendered.
 */
function isNamingSvgTitle(el: ts.Node): boolean {
  // "Direct child" is a RUNTIME relationship, and JSX has several wrappers that do not create one.
  // `<svg>{<title>Go</title>}</svg>`, a fragment, and `{[<title/>]}` all render the title as the
  // svg's own child and all NAME (measured) -- a literal parent-node test reported each of them,
  // which is the false-positive twin of the ancestor walk it replaced. Walk up until the first JSX
  // ELEMENT: everything between is transparent, and stopping at the first element is what keeps
  // `<svg><g><title/></g></svg>` correctly out.
  //
  // No self-closing-element guard: one cannot hold children, so it can never be an ancestor of a
  // `<title>`. A version with that check had an unreachable branch, which a mutation proved.
  for (let cur: ts.Node | undefined = el.parent; cur !== undefined; cur = cur.parent) {
    if (ts.isJsxElement(cur)) return cur.openingElement.tagName.getText() === "svg";
  }
  return false; // no JSX element ancestor in this file: fail closed
}

/** Does React OMIT this attribute from the DOM entirely, so its presence in the source hides
 *  nothing?
 *
 *  The answer depends on the attribute's TYPE, and conflating the two was a right-answer-wrong-
 *  reason bug in the first R31 fix -- caught by mutation, not by review. A BOOLEAN DOM attribute
 *  (`hidden`, `popover`, `inert`) is coerced, so every falsy value is dropped, `0` and `""`
 *  included. An ARIA attribute is a STRING: React drops only `null` and `undefined`, and
 *  `aria-hidden={0}` really does render `aria-hidden="0"` (measured). Reading `0` as "omitted"
 *  reached the correct verdict for that case by a false route, which made the branch that states
 *  the real reason unreachable -- a deleted-branch mutation proved it changed no test.
 *
 *  All values measured; see the table in tests/components/a11y/newTabAnnouncementBehavior.test.tsx
 *  (review R31 HIGH 6). */
function omittedByReact(a: ts.JsxAttribute): boolean {
  if (!a.initializer) return false; // bare attribute: `hidden` means true
  const init = a.initializer;
  const e = ts.isJsxExpression(init) ? (init.expression ? unparen(init.expression) : null) : init;
  if (e === null) return true; // `hidden={}` contributes no value
  // Nullish, however it is spelled -- `void 0` included.
  if (isProvablyNullish(e)) return true;
  // Deliberately NOT `isAlwaysBoolean`: for a BOOLEAN attribute the two booleans differ, since
  // `hidden={true}` renders `hidden=""` and hides. `a === b` is therefore undecidable and fails
  // closed. `popover` is the opposite -- React drops EITHER boolean from an enumerated attribute --
  // which is why `popoverHides` uses the wider `reactOmitsValue`. Same word, two behaviours.
  return isLiteralFalsy(e); // `hidden=""` and `hidden={0}` are coerced and dropped
}

/** Is `aria-hidden` hiding? ARIA hides only on the literal string "true", so every other literal
 *  is VISIBLE and only a dynamic value fails closed.
 *
 *  Deliberately does NOT reuse `omittedByReact`. The first R31 fix routed it through there, which
 *  answered `aria-hidden={0}` correctly for a false reason -- React keeps a falsy value on a string
 *  attribute and really does render `aria-hidden="0"` -- and made the branch stating the real reason
 *  unreachable. Passing a `kind` flag instead was worse: a mutation that ignored the flag entirely
 *  changed no verdict, because no falsy aria-hidden value hides either way, so the flag documented a
 *  distinction it could not affect. Two rules with different mechanisms, kept apart. */
function ariaHiddenHides(a: ts.JsxAttribute): boolean {
  const init = a.initializer;
  if (!init) return true; // bare `aria-hidden` renders aria-hidden="true"
  const e = ts.isJsxExpression(init) ? (init.expression ? unparen(init.expression) : null) : init;
  if (e === null) return false;
  // EVALUATE the value rather than pattern-matching it. `stringOf` discarded template
  // substitutions, so `aria-hidden={`${true}`}` and ``aria-hidden={`tr${"ue"}`}`` both scanned
  // clean while React emitted `aria-hidden="true"` and the announcement left the name -- and
  // ``aria-hidden={`true${false}`}`` was reported although it emits the harmless "truefalse"
  // (review R32 BLOCKING 2, wrong in both directions from one weak read).
  // NULLISH only -- deliberately NOT `reactOmitsValue`. That helper also omits BOOLEANS, which is
  // enumerated-attribute semantics; an ARIA attribute STRINGIFIES them, and `aria-hidden={true}`
  // really does render `aria-hidden="true"` and hide. Reaching for the shared helper here broke
  // that case immediately, which is the attribute-kind table in spec §6.4 earning its place.
  if (isProvablyNullish(e)) return false;
  const lit = staticStringValue(e);
  if (lit === null) return !cannotRenderTrue(e); // fail closed only when it COULD be "true"
  // Folded and trimmed: deliberately STRICTER than the harness, which hides only on the exact
  // lowercase "true". See the value table in the behaviour suite.
  return lit.trim().toLowerCase() === "true";
}

/** Does this expression ALWAYS produce a boolean, whatever its operands are?
 *
 *  The set is closed in the grammar: `!x`, the eight comparisons, `instanceof`, `in`, and `delete`.
 *  Deliberately NOT `typeof`, which yields a STRING. Extracted at R33 because two rules need it and
 *  the second was about to get its own copy: React renders neither boolean as content, and it also
 *  OMITS a boolean-valued attribute. One definition, so the two cannot drift.
 */
function isAlwaysBoolean(n: ts.Expression): boolean {
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.ExclamationToken) return true;
  if (ts.isDeleteExpression(n)) return true;
  if (ts.isBinaryExpression(n)) {
    const boolOps = new Set<ts.SyntaxKind>([
      ts.SyntaxKind.LessThanToken,
      ts.SyntaxKind.GreaterThanToken,
      ts.SyntaxKind.LessThanEqualsToken,
      ts.SyntaxKind.GreaterThanEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.InstanceOfKeyword,
      ts.SyntaxKind.InKeyword,
    ]);
    if (boolOps.has(n.operatorToken.kind)) return true;
    // `&&` and `||` yield ONE OF THEIR OPERANDS, so the result is always a boolean exactly when both
    // operands are: `!a && !b` is a boolean however `a` and `b` are bound (review R34 HIGH 3).
    if (
      n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      n.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      return isAlwaysBoolean(unparen(n.left)) && isAlwaysBoolean(unparen(n.right));
    }
  }
  if (n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword) return true;
  // NOTE: no conditional arm. Both callers already decide a conditional compositionally --
  // `rendersNothing` requires both branches to render nothing, `reactOmitsValue` requires both to be
  // omitted -- so an arm here changed no verdict under four different fixtures aimed at it. Deleted
  // rather than kept: the sixth equivalent branch in this guard, and the third whose fixture kept
  // passing through a neighbouring rule instead.
  return false;
}

/** Does React DROP this attribute value, so the attribute never reaches the DOM?
 *
 *  NOT "on any attribute" -- that claim sat here for two rounds and is false (review R34 HIGH 7).
 *  An ARIA attribute STRINGIFIES a boolean, so `aria-hidden={true}` renders `aria-hidden="true"` and
 *  hides; only `ariaHiddenHides` may speak for that kind. This helper describes an ENUMERATED
 *  attribute -- today just `popover` -- where React drops EITHER boolean along with the nullish
 *  values, plus expressions that provably produce one of them (
 *  `void 0`, `a === b`, `!x`, a selected operand, and a conditional whose branches all do).
 *  Distinct from `rendersNothing`, which also covers empty
 *  strings and arrays: those are dropped as CONTENT but preserved as an attribute VALUE, and
 *  `popover=""` is exactly the case where that difference decides the verdict (review R33).
 */
function isProvablyNullish(e0: ts.Expression): boolean {
  const e = unparen(e0);
  if (e.kind === ts.SyntaxKind.NullKeyword) return true;
  if (isGlobalRef(e, "undefined")) return true;
  if (ts.isVoidExpression(e)) return true; // `void 0` is undefined, whatever the operand
  if (ts.isConditionalExpression(e)) {
    const cond = unparen(e.condition);
    if (isLiteralTruthy(cond)) return isProvablyNullish(e.whenTrue);
    if (isLiteralFalsy(cond)) return isProvablyNullish(e.whenFalse);
    return isProvablyNullish(e.whenTrue) && isProvablyNullish(e.whenFalse);
  }
  return false;
}

function reactOmitsValue(e0: ts.Expression): boolean {
  const e = unparen(e0);
  if (isProvablyNullish(e)) return true;
  if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (isAlwaysBoolean(e)) return true;
  // Selection composes: `popover={false && "auto"}` yields `false`, which React omits (R34 HIGH 3).
  const picked = pickedOperand(e);
  if (picked !== null) return reactOmitsValue(picked);
  if (ts.isConditionalExpression(e)) {
    // Undecidable test, but if BOTH branches are omitted the test cannot matter.
    return reactOmitsValue(e.whenTrue) && reactOmitsValue(e.whenFalse);
  }
  return false;
}

/** Can this value possibly be the string `"true"` once React renders it into an attribute?
 *
 *  `ariaHiddenHides` fails closed on anything it cannot evaluate, which is right for a genuinely
 *  dynamic value and wrong for a value whose TYPE rules out the answer. A regex renders `/re/`, an
 *  array `""` or a comma list, an object `[object Object]`, `typeof x` one of a fixed set of type
 *  names -- none of them is `"true"`, and every one was reported (review R34 HIGH 3).
 */
function cannotRenderTrue(e0: ts.Expression): boolean {
  const e = unparen(e0);
  if (ts.isRegularExpressionLiteral(e)) return true;
  if (ts.isArrayLiteralExpression(e) || ts.isObjectLiteralExpression(e)) return true;
  if (ts.isFunctionExpression(e) || ts.isArrowFunction(e) || ts.isClassExpression(e)) return true;
  if (ts.isNewExpression(e)) return true;
  if (ts.isTypeOfExpression(e)) return true; // "string" | "number" | ... never "true"
  if (ts.isBigIntLiteral(e) || ts.isNumericLiteral(e)) return true;
  if (
    ts.isPrefixUnaryExpression(e) &&
    (e.operator === ts.SyntaxKind.MinusToken || e.operator === ts.SyntaxKind.PlusToken)
  ) {
    return ts.isNumericLiteral(e.operand) || ts.isBigIntLiteral(e.operand);
  }
  const picked = pickedOperand(e);
  if (picked !== null) return cannotRenderTrue(picked);
  if (ts.isConditionalExpression(e)) {
    return cannotRenderTrue(e.whenTrue) && cannotRenderTrue(e.whenFalse);
  }
  return false;
}

/** Does a `class` / `className` value hide this element?
 *
 *  A CSS class list is TOKENS, and `\b(hidden|invisible)\b` is not a token test: a hyphen is a
 *  word boundary, so `overflow-hidden` matched. That class clips overflow and hides nothing, and it
 *  is one of the most common utilities in this codebase, so the rule reported a whole family of
 *  perfectly visible markup. `not-hidden` and `peer-invisible` matched for the same reason.
 *
 *  A Tailwind VARIANT prefix still hides, conditionally, so `md:hidden` and `group-hover:invisible`
 *  are kept: the token after the last `:` is what names the utility. Conditional hiding fails
 *  closed, as before.
 *
 *  A decidable value is tokenised exactly. A dynamic one keeps the raw-text fallback that R2 HIGH 4
 *  added -- `className={hide ? "hidden" : ""}` must still fail closed -- but with delimiters that a
 *  hyphen is not, so the same false positives cannot come back through that path.
 */
function classNameHides(init: ts.JsxAttributeValue | undefined): boolean {
  if (!init) return false;
  const HIDING = new Set(["hidden", "invisible"]);
  const utility = (token: string): string => {
    const afterVariant = token.slice(token.lastIndexOf(":") + 1);
    return afterVariant.replace(/^[!-]+/, ""); // `!hidden` and `-hidden` name the same utility
  };
  const decided = staticStringValue(
    ts.isJsxExpression(init) ? (init.expression ?? (init as unknown as ts.Expression)) : init,
  );
  if (decided !== null) {
    return decided.split(/\s+/).some((t) => HIDING.has(utility(t)));
  }
  // Dynamic: fail closed on a delimited mention, where a hyphen is NOT a delimiter.
  const raw = init.getText();
  return /(^|[\s"'`{(:,[])(hidden|invisible)($|[\s"'`})\],])/.test(raw);
}

/** Does an inline `style` object hide this element?
 *
 *  Reads the object literal through the AST (R32 BLOCKING 5). A property hides when its KEY is
 *  exactly `display` or `visibility` -- both in the CSS-property spelling and in the camelCase React
 *  spelling, though neither of those two has one -- and its VALUE evaluates to a hiding keyword.
 *  Keys are compared exactly, which is what makes `backfaceVisibility` safe; CSS keywords are
 *  case-insensitive, so the value is folded.
 *
 *  A style prop that is not an object literal (`style={s}`, a spread) is opaque and does NOT hide
 *  here. That is unchanged behaviour, and the hint-path rule reports a non-literal style separately;
 *  widening it in this pass would be a scope change, not a fix. */
function styleObjectHides(init: ts.JsxAttributeValue | undefined): boolean {
  if (!init || !ts.isJsxExpression(init) || !init.expression) return false;
  const obj = unparen(init.expression);
  if (!ts.isObjectLiteralExpression(obj)) return false;
  const HIDING: Record<string, ReadonlySet<string>> = {
    display: new Set(["none"]),
    visibility: new Set(["hidden", "collapse"]),
  };
  // LAST WRITE WINS, and a spread is a write. Scanning properties independently was wrong in both
  // directions (review R33 BLOCKING 4): `{{...(true ? {display:"none"} : {})}}` hid and scanned
  // clean, while `{{display:"none", ...(true ? {display:"block"} : {})}}` is visible and was
  // reported. Resolve the object in source order into a final value per key; `undefined` marks a
  // key an undecidable write may have overwritten.
  const resolved = new Map<string, string | undefined>();
  const apply = (o: ts.ObjectLiteralExpression): boolean | "hides" => {
    for (const prop of o.properties) {
      if (ts.isSpreadAssignment(prop)) {
        const inner = unparen(prop.expression);
        const picked = pickObjectLiteral(inner);
        if (picked === null) {
          // An undecidable PREDICATE does not make the spread undecidable when every branch hides
          // the same way: `flag ? {display:"none"} : {visibility:"hidden"}` hides whichever runs
          // (review R34 BLOCKING 4). Only the branches need to be decidable, not the test.
          const branches = conditionalObjectBranches(inner);
          if (branches !== null && branches.every((b) => styleObjectLiteralHides(b)))
            return "hides";
          return false; // genuinely unknown: the whole object is opaque
        }
        if (apply(picked) === false) return false;
        continue;
      }
      if (!ts.isPropertyAssignment(prop)) {
        // Shorthand or a method: its VALUE is opaque, so mark the key unknown rather than skipping
        // it, which would let an earlier hiding write survive a later unknown one.
        const n = prop.name;
        const k = ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : null;
        if (k === null) return false;
        resolved.set(k.trim(), undefined);
        continue;
      }
      const name = prop.name;
      let key: string | null = null;
      if (ts.isIdentifier(name)) key = name.text;
      else if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
        key = name.text;
      else if (ts.isComputedPropertyName(name)) key = staticStringValue(name.expression);
      if (key === null) return false; // an undecidable KEY could be any property
      // TRIM but do NOT fold case. A React style key is a JavaScript property name, not a CSS
      // property name: `{DISPLAY:"NONE"}` makes React emit `-d-i-s-p-l-a-y:NONE`, which styles
      // nothing, so folding it reported valid markup (review R33 HIGH 8). Surrounding whitespace
      // IS tolerated by the CSS parser -- `{" display ":"none"}` really hides (measured).
      resolved.set(key.trim(), staticStringValue(prop.initializer) ?? undefined);
    }
    return true;
  };
  const applied = apply(obj);
  if (applied === "hides") return true; // a spread whose every branch hides
  if (applied === false) return false; // anything undecidable: opaque, unchanged posture
  for (const [key, value] of resolved) {
    const hiding = HIDING[key];
    if (hiding === undefined || value === undefined) continue;
    // CSS KEYWORDS are case-insensitive, unlike the key: `display:"NONE"` really hides (measured).
    if (hiding.has(value.trim().toLowerCase())) return true;
  }
  return false;
}

/** The object-literal branches of a conditional, when both are literals; otherwise null. */
function conditionalObjectBranches(e0: ts.Expression): ts.ObjectLiteralExpression[] | null {
  const e = unparen(e0);
  if (!ts.isConditionalExpression(e)) return null;
  const a = pickObjectLiteral(e.whenTrue);
  const b = pickObjectLiteral(e.whenFalse);
  return a !== null && b !== null ? [a, b] : null;
}

/** Does this object literal, considered ALONE, hide? Used to decide a conditional spread whose
 *  predicate is dynamic but whose branches all hide. */
function styleObjectLiteralHides(o: ts.ObjectLiteralExpression): boolean {
  const fake = ts.factory.createJsxExpression(undefined, o);
  return styleObjectHides(fake);
}

/** The object literal this expression definitely evaluates to, or null. Sees through a conditional
 *  whose branches are decidable, so `...(true ? {display:"none"} : {})` resolves. */
function pickObjectLiteral(e0: ts.Expression): ts.ObjectLiteralExpression | null {
  const e = unparen(e0);
  if (ts.isObjectLiteralExpression(e)) return e;
  if (ts.isConditionalExpression(e)) {
    const cond = unparen(e.condition);
    if (isLiteralTruthy(cond)) return pickObjectLiteral(e.whenTrue);
    if (isLiteralFalsy(cond)) return pickObjectLiteral(e.whenFalse);
  }
  return null;
}

/** Does `popover` hide this element?
 *
 *  `popover` is an ENUMERATED attribute, not a boolean one, and treating it as boolean was wrong in
 *  both directions (review R32 BLOCKING 3). Measured against React 19.2.4:
 *
 *    popover="" / {""} / {0} / {1} / "auto" / "bogus"  -> PRESERVED, and every one starts hidden
 *    popover={true} (which is what bare `<span popover>` means) -> OMITTED, so it hides nothing
 *    popover={false} / {null} / {undefined}                     -> OMITTED
 *
 *  An invalid value is not a free pass: the HTML Standard maps it to the `manual` state, so
 *  `popover="bogus"` is still a popover and still starts hidden. */
function popoverHides(a: ts.JsxAttribute): boolean {
  const init = a.initializer;
  if (!init) return false; // bare `popover` is `{true}`, which React omits
  const e = ts.isJsxExpression(init) ? (init.expression ? unparen(init.expression) : null) : init;
  if (e === null) return false;
  // Anything React DROPS hides nothing. Checking only the four literal spellings made
  // `popover={void 0}`, `popover={a === b}`, `popover={!x}` and `popover={cond ? true : false}`
  // false positives -- each provably produces a boolean or undefined, so React omits the attribute
  // and the announcement is fully visible (measured while R33 was still running).
  if (reactOmitsValue(e)) return false;
  // Any string or number REACHES the DOM, empty string included, and puts the element in a popover
  // state. A value that cannot be decided fails closed.
  return true;
}

/** Elements shown only when `open` is present and truthy. `<details>` shows its `<summary>`
 *  when closed, but a hint is never a summary, so treating the whole element as hiding is
 *  correct here. */
const NOT_SHOWN_UNLESS_OPEN = new Set(["details", "dialog"]);

/** Is this element (or an ancestor up to the anchor) hidden from the acc name? */
function hidesFromAccName(el: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  // `<details>` hides its content when `open` is ABSENT -- the only attribute here whose
  // absence is the hiding condition, which is why a presence-scanning loop could never
  // find it (review R21 BLOCKING 3). A `<summary>` child is still shown when closed, but
  // the hint is never a summary, so treating a closed details as hiding is correct here.
  const tag = ts.isJsxElement(el) ? el.openingElement.tagName.getText() : el.tagName.getText();
  // TAG-BASED HIDING, as two EXTERNALLY-DEFINED sets rather than a list grown one finding at
  // a time. `<template>` came from R22; probing afterwards found `<dialog>`, `<script>`,
  // `<style>`, `<noscript>` and `<datalist>` all fail-open the same way. Enumerating them
  // individually is the losing shape this guard has already hit four times, so the rule is
  // stated from the HTML Standard's own categories instead.
  //
  // NOT_RENDERED: content is never rendered (script-supporting and metadata elements).
  // NOT_SHOWN_UNLESS_OPEN: rendered only when `open` is present and truthy.
  // Namespace before tag name: an SVG `<title>` renders and NAMES (review R31 HIGH 5).
  if (tag === "title" && isNamingSvgTitle(el)) return false;
  if (NOT_RENDERED_TAGS.has(tag)) return true;
  // NOTE: there is deliberately no `<input type="hidden">` branch. It was added at R24 and a
  // systematic mutation sweep later showed removing it changed no test: `<input>` is a void
  // element, so it can never be an ancestor between the anchor and the hint, and R28's narrowed
  // destination model already rejects every nested-element attribute. Dead code deleted rather
  // than left with a comment claiming it does something.
  if (NOT_SHOWN_UNLESS_OPEN.has(tag)) {
    // `open` must be PROVABLY true. React omits the attribute for every falsy value, so
    // `open={0}`, `open={null}`, `open={undefined}` and a dynamic `open={isOpen}` can all
    // render a CLOSED details -- the earlier version only caught absence and a literal
    // `false` (review R22 BLOCKING 3). Fail closed on anything not provably open.
    const openAttr = attrs.properties.find((a) => attrName(a) === "open");
    if (!openAttr || !ts.isJsxAttribute(openAttr)) return true;
    if (!openAttr.initializer) return false; // bare `open` is true
    const init = openAttr.initializer;
    // `open` is a BOOLEAN DOM attribute, so React coerces: any TRUTHY value renders `open=""` and
    // the details really is open. Accepting only the literal `true` made `open={1}`, `open={!false}`
    // and `open={[]}` false positives -- each is provably truthy, so the announcement inside is
    // visible and the anchor was reported anyway. Found by probing this rule when R33 started
    // reading it, the same value-classification shape as `popover` and `aria-hidden` before it.
    //
    // `open=""` stays FALSY and therefore closed (review R23 BLOCKING 2); `isLiteralTruthy` handles
    // the string cases directly, so the separate string branch is gone rather than duplicated.
    const e = ts.isJsxExpression(init) ? (init.expression ? unparen(init.expression) : null) : init;
    if (e !== null && isLiteralTruthy(e)) return false; // provably open
    return true; // falsy, or dynamic and possibly closed: fail closed
  }
  for (const a of attrs.properties) {
    const n = attrName(a);
    if (!ts.isJsxAttribute(a)) continue;
    // The three BOOLEAN hiding attributes share one value rule, because the previous per-attribute
    // spellings disagreed with each other and with React: `hidden={undefined}` was read as hiding,
    // and `popover={false}` was read as hiding on PRESENCE alone, while React omits the attribute
    // entirely in both cases and the announcement is fully visible (review R31 HIGH 6). That is a
    // FALSE POSITIVE -- reporting code that is correct -- not a safe over-approximation, and a
    // guard that cries wolf on valid markup gets exemptions written around it.
    //
    // Measured, not reasoned (all pinned in tests/components/a11y/newTabAnnouncementBehavior.test.tsx):
    // `hidden` and `inert` are omitted for every falsy value -- `false`, `null`, `undefined`, `0`,
    // `""`, and also `-0`, `NaN` and `0n` -- because React coerces a boolean DOM attribute.
    //
    // `popover` is NOT one of them, and the "all values measured" claim that used to sit here was
    // unsupported: the table covered only `false` and `undefined` (review R32 BLOCKING 3). Measured
    // properly, React PRESERVES `popover=""`, `popover={0}`, `popover={1}`, `popover="auto"` and
    // `popover="bogus"` -- every one of which starts hidden -- and OMITS `popover={true}`, which
    // includes the bare `<span popover>` spelling. So it was wrong in BOTH directions: fail-open on
    // the four preserved values, false positive on the two omitted ones.
    //
    // `aria-hidden` is NOT in this group either. It is a STRING attribute with different mechanics,
    // and folding it in here is what produced a right-answer-wrong-reason branch -- see
    // `ariaHiddenHides`.
    if (n === "hidden" || n === "inert") {
      if (omittedByReact(a)) continue;
      return true; // present with a truthy or dynamic value: fail closed
    }
    if (n === "popover") {
      if (popoverHides(a)) return true;
      continue;
    }
    if (n === "aria-hidden") {
      if (ariaHiddenHides(a)) return true;
      continue;
    }
    // `class` AND `className`. React forwards a literal `class` to the DOM (dev warning
    // only), so `<span class="hidden">` really hides -- and this function used to read
    // only `className`, so that spelling was a fail-open in the SHIPPED rule, not merely
    // an untested one (review R21 BLOCKING 1).
    if (n === "classname" || n === "class") {
      if (classNameHides(a.initializer)) return true;
    }
    if (n === "style") {
      // MODEL CHANGE at R32. This was a raw-TEXT match, and five consecutive rounds each removed
      // one more wrapper that is transparent to the value: quotes (R27), backticks (R28), comments
      // (R30), parentheses (R31), and then R32 supplied `display: (0, "none")` and
      // `display: (true ? "none" : "block")`, which no amount of stripping can reach because they
      // require EVALUATION, not deletion. The comment claiming every transparent wrapper had been
      // removed was false when written.
      //
      // So the rule now reads the object literal through the AST and evaluates each property value
      // with `staticStringValue`. That also retires the two hazards the text version needed special
      // handling for: a computed or quoted key is just a key, and `backfaceVisibility` can no longer
      // be confused with `visibility` because keys are compared exactly rather than by substring.
      if (styleObjectHides(a.initializer)) return true;
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
          if (LINE_TERMINATORS.test(t)) continue; // stripped by JSX: keep looking
          return true; // real same-line space run
        }
        const trailing = t.slice(t.trimEnd().length);
        return trailing.length > 0 && !LINE_TERMINATORS.test(trailing);
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

  const isHint = isHintElement;

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
  // The hint must be the REAL component, not merely a name that matches. A file that defines
  // its own `NewTabHint` gets no credit for it (review R27 BLOCKING 1). The file this scanner
  // ships is the sole source; a spelled-but-unbound hint means the anchor does not announce.
  const sourceFile = anchor.getSourceFile();
  const hintIsReal =
    (isImportedFrom(sourceFile, HINT, ["components/shared/NewTabHint"]) ||
      // The component's own file defines it rather than importing it.
      sourceFile.fileName.endsWith("components/shared/NewTabHint.tsx")) &&
    // ...and no enclosing scope shadows that binding at the anchor (review R28 BLOCKING 1).
    !isShadowedAt(anchor, HINT);
  if (!hintIsReal) return out;
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
    // `a || b` yields `a` when `a` is TRUTHY, so a hint in `b` renders only when `a` is falsy.
    // Generic traversal entered both operands with no condition at all, which made
    // `{true || <NewTabHint />}` read as an unconditional hint while React renders none
    // (review R24 BLOCKING 1).
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      walk(n.left, nextHidden, nextConds);
      walk(n.right, nextHidden, [...nextConds, `!(${n.left.getText()})`]);
      return;
    }
    // `a ?? b` renders `b` only when `a` is nullish, so a hint there is conditional
    // (review R25 BLOCKING 1).
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      walk(n.left, nextHidden, nextConds);
      walk(n.right, nextHidden, [...nextConds, `${n.left.getText()} == null`]);
      return;
    }
    // A comma expression evaluates to its LAST operand, so a hint in any earlier one is
    // discarded: `(<NewTabHint />, null)` renders nothing.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      walk(n.right, nextHidden, nextConds);
      return;
    }
    // A hint passed as a CALL ARGUMENT is not rendered by this element -- the callee decides,
    // exactly like the JSX-attribute case above. `drop(<NewTabHint />)` announces nothing.
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      walk(n.expression, nextHidden, nextConds);
      return;
    }
    // A hint inside a FUNCTION BODY is not proof that a hint renders: the callback may never
    // run. `{e && xs.map(() => <NewTabHint />)}` with an empty `xs` renders no hint, yet the
    // hint was found and counted (review R24 BLOCKING 1). Not descending makes the anchor
    // report "does not announce", which is the fail-closed answer -- the author moves the hint
    // out of the callback or adds a reasoned exemption.
    // ALLOWLIST OF RENDER POSITIONS -- the same inversion that fixed the main shape rule at R5.
    // Listing positions that DISCARD a hint is unbounded: R25 supplied `??`, call arguments and
    // comma, and probing afterwards found six more (an object-literal property, a template
    // substitution, `void`, `typeof`, `!`, and property access). Enumerating what RENDERS is
    // closed, because a JSX child expression renders its VALUE and only these forms preserve it.
    if (ts.isJsxExpression(n)) {
      if (n.expression) walk(n.expression, nextHidden, nextConds);
      return;
    }
    if (ts.isJsxFragment(n)) {
      n.children.forEach((c) => walk(c, nextHidden, nextConds));
      return;
    }
    if (ts.isJsxElement(n)) {
      // A COMPONENT's children are a PROP it may discard, exactly like a call argument or a JSX
      // attribute. `<External target="_blank">Go <NewTabHint /></External>` renders an
      // unannounced anchor when `External` drops its children (review R26b BLOCKING 1), so a
      // hint inside a component is not proof one renders. Intrinsic children DO render.
      const tag = n.openingElement.tagName.getText();
      if (!/^[a-z]/.test(tag) || tag.includes(".")) return;
      n.children.forEach((c) => walk(c, nextHidden, nextConds));
      return;
    }
    if (
      ts.isAsExpression(n) ||
      ts.isSatisfiesExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isTypeAssertionExpression(n)
    ) {
      walk(n.expression, nextHidden, nextConds);
      return;
    }
    // An array renders each element, so every element is a render position -- including the
    // INNER expression of a spread, which the walker previously visited without unwrapping, so
    // `{[...[<NewTabHint />]]}` was wrongly reported as not announcing (review R26b HIGH 4).
    if (ts.isArrayLiteralExpression(n)) {
      n.elements.forEach((el) => {
        if (ts.isSpreadElement(el)) walk(el.expression, nextHidden, nextConds);
        else walk(el, nextHidden, nextConds);
      });
      return;
    }
    // Anything else -- a call, an object literal, a template substitution, a unary operator,
    // property access, a function body -- is NOT a render position. Stopping here means the
    // hint is not found, and the anchor reports "does not announce", which is fail-closed.
    return;
  };
  // Seed with the ANCHOR's own hidden state: traversal starting at children
  // missed `<a hidden>...<NewTabHint /></a>` (review R1 HIGH 4).
  const anchorHidden = hidesFromAccName(anchor);
  // If the ANCHOR ITSELF is an arbitrary component, its children are a prop it may discard --
  // `<External target="_blank">Go <NewTabHint /></External>` renders an unannounced anchor when
  // `External` drops them (review R26b BLOCKING 1). A KNOWN link tag is different: rendering its
  // children is the contract that makes it a link component, so `Link` is trusted. An unknown
  // component admitted by the explicit-target or href+spread rule is not, and reports "does not
  // announce" until the hint moves to an intrinsic anchor or a reasoned exemption is added. No
  // live anchor is a component tag, so this costs nothing today.
  const anchorTag = anchor.openingElement.tagName.getText();
  const anchorTagLast = anchorTag.split(".").pop() ?? anchorTag;
  // A KNOWN link component is trusted only when it is the REAL one: `Link` must be bound by an
  // import from next/link, or the same spelling-vs-binding hole applies here too.
  const linkIsReal =
    (LINK_TAGS.has(anchorTag) || LINK_TAGS.has(anchorTagLast)) &&
    isImportedFrom(sourceFile, anchorTagLast, ["next/link"]) &&
    !isShadowedAt(anchor, anchorTagLast);
  const anchorRendersChildren = /^[a-z]/.test(anchorTag) || linkIsReal;
  if (!anchorRendersChildren) return out;
  anchor.children.forEach((c) => walk(c, anchorHidden, []));
  // ALL, not ANY. A hidden instance beside a VISIBLE one does not remove the announcement from the
  // accessible name -- the visible one still renders it -- so reporting that pair was a false
  // positive (review R34 HIGH 5). `Go <NewTabHint/> <span aria-hidden><NewTabHint/></span>` computes
  // exactly "Go (opens in a new tab)", measured. The anchor is unannounced only when EVERY instance
  // is hidden, which is also what the single-instance case has always meant.
  out.hidden = out.instances.length > 0 && out.instances.every((h) => h.hidden);
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

  // Duplicate case-folded attribute names are AMBIGUOUS: HTML names are
  // case-insensitive and React applies the LAST one, so `<a target="_self"
  // TARGET="_blank">` really opened a new tab while scanning clean, and `aria-label`
  // beside `ARIA-LABEL` let an announcing label be replaced by a silent one
  // (review R11 BLOCKING 3).
  //
  // Three guards on WHEN this applies, all from review R12 MEDIUM 4:
  //   - INTRINSIC tags only. Props on a custom component are ordinary JavaScript
  //     keys and case-SENSITIVE, so `<UI.Link Mode="one" mode="two">` is two distinct
  //     props, not a duplicate.
  //   - ASCII folding only. `toLowerCase()` also folds Unicode, which rejected
  //     genuinely distinct `Σ` and `σ` attributes.
  //   - AFTER the not-external return, so an internal `<a>` with duplicated naming
  //     attributes is not dragged in as an external violation.
  const tagName = ts.isJsxElement(el) ? el.openingElement.tagName.getText() : el.tagName.getText();
  // JSX's own rule: a tag whose first character is lowercase is an intrinsic element;
  // anything containing a dot is a member expression, hence a component. A stricter
  // pattern wrongly excluded camelCase intrinsics like `<clipPath>` and `<foreignObject>`
  // (review R13 question 3, probed before that round reported).
  const isIntrinsic = /^[a-z]/.test(tagName) && !tagName.includes(".");
  // A REAL `next/link` also needs the fold: it forwards both spellings to an intrinsic anchor,
  // and React keeps the LAST -- so `<Link aria-label="Go (opens in a new tab)" ARIA-LABEL="Go">`
  // ships an anchor named "Go" and the announcement is silently dropped (review R28 BLOCKING 2).
  // Scoped to a verified `Link` binding: an arbitrary component's props really are
  // case-sensitive JS keys, which is why the fold must not apply to those.
  const tagLast = tagName.split(".").pop() ?? tagName;
  const isRealLink =
    LINK_TAGS.has(tagName) &&
    tagName !== "a" &&
    isImportedFrom(el.getSourceFile(), tagLast, ["next/link"]) &&
    !isShadowedAt(el, tagLast);
  if (isIntrinsic || isRealLink) {
    const folded = new Set<string>();
    for (const a of attrs.properties) {
      if (!ts.isJsxAttribute(a)) continue;
      const raw = a.name.getText();
      const key = raw.replace(/[A-Z]/g, (c) => c.toLowerCase());
      if (folded.has(key)) {
        return {
          kind: "unrecognized",
          why: `two attributes share the name "${key}" after ASCII case-folding; HTML attribute names are case-insensitive and React applies the LAST one, so keep a single spelling`,
        };
      }
      folded.add(key);
    }
  }

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
        if (!attr.initializer) return false;
        // A STYLE OBJECT is now fully decidable by `styleObjectHides`, which resolves the object in
        // source order and evaluates each value. `stringOf` returns null for ANY object literal, so
        // the old check called every inline style unprovable -- `style={{display:"block"}}` around a
        // hint is ordinary, correct markup and was reported. Found by the agreement matrix, which
        // renders the markup and sees the announcement plainly present (R35 close-out).
        if (nm === "style") {
          const init = attr.initializer;
          const obj = ts.isJsxExpression(init) && init.expression ? unparen(init.expression) : null;
          // An OBJECT LITERAL the hiding rule can read is decided by it. Everything else keeps the
          // previous treatment: a string-literal `style="color:red"` stays decidable (React rejects
          // that form at runtime, but the guard has always accepted it and narrowing that is a
          // separate decision), and a dynamic style object stays opaque.
          if (obj !== null && ts.isObjectLiteralExpression(obj)) return styleObjectHides(init);
        }
        // Undecidable class values (templates, conditionals) cannot be proven non-hiding.
        return !isDecidableLiteral(attr.initializer);
      });
      if (opaque) next = true;
    }
    ts.forEachChild(n, (c) => walk(c, next));
  };
  anchor.children.forEach((c) => walk(c, false));
  return found;
}

/**
 * Blank out comments, preserving every other byte and all offsets.
 *
 * The previous version drove `ts.createScanner().scan()` directly and rebuilt the
 * source from token text. That is not parser-equivalent: the scanner cannot know
 * when a `/` starts a regex without the parser's rescan, so a VALID regex literal
 * containing comment-like bytes -- `/[/*]/`, `/a\/*b/` -- was read as the start of a
 * block comment and everything after it was DISCARDED. Measured: `/[/*]/` truncated
 * the file to `const re=/[`. Every consumer then silently saw a fragment, which is
 * how a non-lowercase attribute-name literal appended later became invisible
 * (review R13 HIGH 3) and how a `components=` prop could hide (review R13 BLOCKING 2).
 *
 * A real parse knows where comments are, because they are trivia attached to tokens
 * rather than tokens. Ranges come from `getLeadingCommentRanges` /
 * `getTrailingCommentRanges` over the parsed tree, and each range is replaced with
 * spaces so byte offsets and line numbers are preserved for every caller.
 */
/**
 * Every comment range in `src`, found parse-informed.
 *
 * ONE implementation, shared by `stripCommentsSafely` and the exemption parser. They
 * had separate scanner loops, so fixing one left the other bypassable: a valid regex
 * containing comment bytes on the same line as an exemption comment made the parser
 * mis-locate it and an unannounced anchor scanned clean (review R14 BLOCKING 1). The
 * lesson generalizes -- after fixing a helper, enumerate its consumers -- and it is
 * enforced structurally here by there being nothing left to diverge.
 *
 * Sound by construction: the PARSE reports where literals are (string, template parts,
 * REGEX, JSX text), and a lexical pass only treats a `/` as a comment start outside
 * them. A raw scanner cannot do this because it cannot know a `/` begins a regex
 * without the parser's rescan.
 */
export function commentRanges(src: string): [number, number][] {
  const sf = ts.createSourceFile("__cmt.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const protectedRanges: [number, number][] = [];
  const collect = (n: ts.Node): void => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isRegularExpressionLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n)
    ) {
      protectedRanges.push([n.getStart(sf), n.getEnd()]);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const inProtected = (i: number): boolean => protectedRanges.some(([a, b]) => i >= a && i < b);

  // A shebang is not a comment: blanking its bytes destroyed real content, and a URL
  // inside it contains `//` (review R14 LOW 6).
  let from = 0;
  if (src.startsWith("#!")) {
    const nl = src.search(/[\n\r\u2028\u2029]/);
    from = nl === -1 ? src.length : nl;
  }

  // A `//` comment ends at ANY JavaScript line terminator, not only LF. CR, U+2028 and
  // U+2029 are all valid, and stopping at LF alone blanked the rest of the file
  // (review R14 BLOCKING 2).
  const isLineTerminator = (ch: string | undefined): boolean => LINE_TERMINATORS.test(ch ?? "");

  const out: [number, number][] = [];
  for (let i = from; i < src.length - 1; i += 1) {
    if (src[i] !== "/" || inProtected(i)) continue;
    if (src[i + 1] === "/") {
      let j = i + 2;
      while (j < src.length && !isLineTerminator(src[j])) j += 1;
      out.push([i, j]);
      i = j;
    } else if (src[i + 1] === "*") {
      let j = i + 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
      const endEx = Math.min(j + 2, src.length);
      out.push([i, endEx]);
      i = endEx - 1;
    }
  }
  return out;
}

/** Blank every comment to spaces, preserving length, offsets and line numbers. */
export function stripCommentsSafely(src: string): string {
  const out = src.split("");
  for (const [a, b] of commentRanges(src)) {
    for (let i = a; i < b; i += 1) {
      const ch = out[i];
      if (ch !== "\n" && ch !== "\r" && ch !== "\u2028" && ch !== "\u2029") out[i] = " ";
    }
  }
  return out.join("");
}

export function scanSource(sf: ts.SourceFile, path: string, sc: Scan): void {
  const src = sf.getFullText();

  // ONE comment exempts ONE anchor, claimed by the next CANDIDATE it precedes --
  // compliant or not. Consuming only when recording a violation let a compliant
  // anchor leave its exemption for a later broken one (review R3 HIGH 5).
  const exemptions: { end: number; endLine: number; used: boolean }[] = [];
  for (const [a, b] of commentRanges(src)) {
    // Strip the comment DELIMITERS before reading the reason: `/* marker: */` left `*/`
    // behind, which `.trim()` counted as a non-empty reason, so a reasonless exemption
    // silently exempted an anchor (review R15 HIGH 4).
    // Only the TRAILING delimiter matters: the reason is whatever follows the marker, so
    // `/* marker: */` left `*/` behind and `.trim()` counted it as a reason (review R15
    // HIGH 4). Stripping the LEADING delimiters was dead code -- they sit before the
    // marker and can never reach the reason -- and a mutation proved it, so it is gone
    // rather than kept for symmetry.
    // Trailing delimiter, then jsdoc DECORATION. `/**\n * marker:\n *\n */` left a bare
    // `*` after the marker, which counted as a reason (review R16 HIGH 2). Leading `*` on
    // each continuation line is decoration, never content.
    const text = src
      .slice(a, b)
      .replace(/\*+\/$/, "")
      .split(LINE_TERMINATORS)
      .map((l) => l.replace(/^\s*\*+\s?/, ""))
      .join("\n");
    const at = text.indexOf(EXEMPTION);
    if (at >= 0 && text.slice(at + EXEMPTION.length).trim().length > 0) {
      exemptions.push({
        // POSITION, not just line. Line comparison could not express "precedes" for a
        // comment sharing a line with its anchor, and let two exemptions on one line drift
        // across two anchors on the next (review R16 BLOCKING 1).
        end: b,
        endLine: sf.getLineAndCharacterOfPosition(b).line + 1,
        used: false,
      });
    }
  }

  // An exemption belongs to the FIRST candidate that follows it, and to no other. Line
  // arithmetic could not say that: a comment sharing a line with its anchor was
  // unmatchable, and two exemptions on the preceding line drifted onto two separate
  // anchors even though both pointed at the first (review R16 BLOCKING 1).
  //
  // So ownership is resolved positionally, in one pass over the candidates in source
  // order, before any claiming happens. Adjacency is still required -- the comment must
  // end on the anchor's line or the one above -- which is the long-standing rule that
  // stops a distant comment silencing something unrelated.
  const ownerOf = new Map<number, number>(); // candidate start -> exemption index
  {
    const starts: number[] = [];
    const collectStarts = (node: ts.Node): void => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tg = ts.isJsxElement(node)
          ? node.openingElement.tagName.getText()
          : node.tagName.getText();
        const at = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
        if (isLinkCandidate(tg, at) && classifyShape(node).kind !== "not-external") {
          starts.push(node.getStart());
        }
      }
      ts.forEachChild(node, collectStarts);
    };
    collectStarts(sf);
    starts.sort((x, y) => x - y);
    exemptions.forEach((e, idx) => {
      const owner = starts.find((s) => s >= e.end);
      if (owner === undefined) return;
      const ownerLine = sf.getLineAndCharacterOfPosition(owner).line + 1;
      if (e.endLine !== ownerLine && e.endLine !== ownerLine - 1) return;
      // Keying ownership BY CANDIDATE is what prevents a stale exemption sliding to a later
      // anchor. This first-wins guard only decides which of two exemptions on the SAME candidate
      // is consumed, and mutation showed it changes no verdict -- but unlike the two branches
      // deleted alongside it, dropping it would make the choice depend on iteration order, so it
      // stays for DETERMINISM. That is a different justification from correctness, and it is the
      // reason this one survives an equivalent-mutant finding.
      if (!ownerOf.has(owner)) ownerOf.set(owner, idx);
    });
  }

  const claimExemption = (start: number): boolean => {
    const idx = ownerOf.get(start);
    if (idx === undefined) return false;
    const slot = exemptions[idx]!;
    if (slot.used) return false;
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
          const exempted = claimExemption(node.getStart());
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
          const named = (which: string): boolean =>
            attrs.properties.some((a) => ts.isJsxAttribute(a) && jsxAttrNameLower(a) === which);
          const hasLabelledBy = named("aria-labelledby");
          const hasLabelAttr = named("aria-label") || hasLabelledBy;
          const hint = findHint(node);

          if (hasLabelledBy) {
            // `aria-labelledby` OUTRANKS `aria-label` in the accessible-name computation, so an
            // announcing `aria-label` beside it is dead text: measured, an anchor carrying both
            // computes the referenced element's text ("Go") and never announces (review R31
            // BLOCKING 1). Reading them as interchangeable meant the weaker one satisfied the
            // guard while the stronger one silently decided the name.
            //
            // Reported whichever attributes are present, because the reference cannot be resolved
            // statically -- the target may live in another component, another file, or be injected
            // at runtime. A dangling reference falls back to `aria-label` (also measured), so BOTH
            // outcomes are reachable from identical source and neither can be proven. Fail closed;
            // a legitimate use takes one reasoned exemption.
            record(
              "aria-labelledby outranks aria-label and descendant content, and its target cannot be resolved here, so the announcement cannot be proven (use aria-label alone, or add an exemption)",
            );
          } else if (hasLabelAttr) {
            // A naming attribute REPLACES descendant content, so the label itself
            // must announce and a hint child is inert.
            if (label === "phrase-only") {
              record("aria-label announces but carries no destination");
            } else if (label === "none") {
              record(
                "element has aria-label, so it must announce in that label (a NewTabHint child is ignored)",
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
          } else if (!hasDestinationContent(node)) {
            record(
              'the only visible content is the announcement, so the accessible name reads "(opens in a new tab)" with no destination',
            );
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
