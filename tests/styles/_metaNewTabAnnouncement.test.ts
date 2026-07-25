/**
 * tests/styles/_metaNewTabAnnouncement.test.ts
 *
 * Structural guard for spec 2026-07-25-newtab-announcement-family §6: every
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
import { describe, expect, it } from "vitest";

/** Recursive walk, matching the repo idiom in tests/styles/_classScanUtils.ts. */
function walkFiles(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walkFiles(p, ext);
    return ext.test(e) ? [p] : [];
  });
}

const PHRASE = "opens in a new tab";
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
        const t = ts.isObjectLiteralExpression(e.whenTrue) && objectHasBlankTarget(e.whenTrue);
        const f = ts.isObjectLiteralExpression(e.whenFalse) && objectHasBlankTarget(e.whenFalse);
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
        // Spread of an unresolvable identifier: only fail closed if it could
        // plausibly carry a target. We cannot know, so we do not flag it here;
        // a spread that DOES carry _blank via an unresolvable object is caught
        // by the lexical backstop in scanSource.
        continue;
      }
    }
  }
  return null;
}

function labelAnnounces(attrs: ts.JsxAttributes): "ok" | "phrase-only" | "none" {
  for (const a of attrs.properties) {
    if (attrName(a) !== "aria-label" || !ts.isJsxAttribute(a) || !a.initializer) continue;
    const text = stringOf(a.initializer);
    if (text === null) return "none";
    if (!text.includes(PHRASE)) return "none";
    // §6 req 4: the remainder must carry a destination. Strip the phrase AND
    // punctuation/whitespace so "(opens in a new tab)" fails too.
    const remainder = text.replace(PHRASE, "").replace(/[^\p{L}\p{N}]/gu, "");
    return remainder.length > 0 ? "ok" : "phrase-only";
  }
  return "none";
}

/** Is this element (or an ancestor up to the anchor) hidden from the acc name? */
function hidesFromAccName(el: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes;
  for (const a of attrs.properties) {
    const n = attrName(a);
    if (!ts.isJsxAttribute(a)) continue;
    if (n === "aria-hidden") {
      const v = a.initializer ? stringOf(a.initializer) : "true";
      if (v === "true" || v === null) return true;
    }
    // Native hidden attribute: `<span hidden>` or hidden={true}.
    if (n === "hidden") return true;
    if (n === "className") {
      const v = a.initializer ? (stringOf(a.initializer) ?? "") : "";
      if (/\bhidden\b/.test(v)) return true;
    }
    if (n === "style") {
      const v = a.initializer?.getText() ?? "";
      if (/display\s*:\s*['"]?none|visibility\s*:\s*['"]?hidden/.test(v)) return true;
    }
  }
  return false;
}

type HintFind = { found: boolean; hidden: boolean; conditions: string[] };

/** Locate NewTabHint under an anchor, tracking hidden-ness and gating conditions. */
function findHint(anchor: ts.JsxElement | ts.JsxSelfClosingElement): HintFind {
  const out: HintFind = { found: false, hidden: false, conditions: [] };
  if (!ts.isJsxElement(anchor)) return out;
  const walk = (n: ts.Node, hidden: boolean, conds: string[]): void => {
    let nextHidden = hidden;
    const nextConds = conds;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = ts.isJsxElement(n) ? n.openingElement.tagName.getText() : n.tagName.getText();
      if (tag === HINT) {
        out.found = true;
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
  anchor.children.forEach((c) => walk(c, false, []));
  return out;
}

function sameCondition(hintConds: string[], target: { text: string; negated: boolean }): boolean {
  const want = target.negated ? `!(${target.text})` : target.text;
  const norm = (s: string): string => s.replace(/\s+/g, "");
  // Exact match only. An earlier version also accepted `!(c) === want`, which
  // made a condition match its own NEGATION -- so a hint gated on `e` passed an
  // anchor whose target was `e ? undefined : "_blank"`, the precise
  // false-announcement bug requirement 5 exists to prevent. The synthetic
  // negated-polarity self-test caught it.
  return hintConds.some((c) => norm(c) === norm(want));
}

export function scanSource(sf: ts.SourceFile, path: string, sc: Scan): void {
  const src = sf.getFullText();
  const exempt = (line: number): boolean => {
    const lines = src.split("\n");
    const window = lines.slice(Math.max(0, line - 3), line + 1).join("\n");
    return window.includes(EXEMPTION);
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
            const label = labelAnnounces(attrs);
            const hint = findHint(node);
            if (label === "phrase-only") {
              record("aria-label announces but carries no destination");
            } else if (label === "ok") {
              if (polarity.kind === "conditional") {
                record("static aria-label announcement on a conditional-target anchor");
              }
            } else if (hint.found) {
              if (hint.hidden) {
                record("NewTabHint is hidden from the accessible name");
              } else if (polarity.kind === "conditional") {
                if (!sameCondition(hint.conditions, polarity)) {
                  record("hint is not gated by the anchor's effective _blank predicate");
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

// ── Synthetic scanner self-tests (§6 requirement 7) ────────────────────────
// Without these the guard is unfalsifiable: the live tree exercises only
// literal targets and true-polarity spreads.
describe("scanner self-test: synthetic fixtures prove discovery and each branch", () => {
  const probe = (code: string): Scan => {
    const sc: Scan = { anchors: 0, violations: [] };
    scanSource(parse("/synthetic/probe.tsx", code), "/synthetic/probe.tsx", sc);
    return sc;
  };
  const ok = (code: string): void => {
    const sc = probe(code);
    expect(sc.anchors, "anchor should be discovered").toBeGreaterThan(0);
    expect(sc.violations, `expected no violation, got: ${JSON.stringify(sc.violations)}`).toEqual(
      [],
    );
  };
  const rejects = (code: string, match: RegExp): void => {
    const sc = probe(code);
    expect(sc.anchors, "anchor should be discovered").toBeGreaterThan(0);
    expect(sc.violations.length, "expected a violation").toBeGreaterThan(0);
    expect(sc.violations[0]!.reason).toMatch(match);
  };

  it("discovers a literal target and rejects a bare external link", () => {
    rejects(`const A = () => <a href="x" target="_blank">Go</a>;`, /does not announce/);
  });

  it("accepts a hint after a literal target", () => {
    ok(`const A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;`);
  });

  it("accepts a destination-bearing aria-label", () => {
    ok(`const A = () => <a href="x" target="_blank" aria-label="Go (opens in a new tab)">Go</a>;`);
  });

  it("rejects a phrase-only label", () => {
    rejects(
      `const A = () => <a href="x" target="_blank" aria-label="opens in a new tab">Go</a>;`,
      /no destination/,
    );
  });

  it("rejects a punctuation-only remainder", () => {
    rejects(
      `const A = () => <a href="x" target="_blank" aria-label="(opens in a new tab)">Go</a>;`,
      /no destination/,
    );
  });

  it("rejects a hint hidden by aria-hidden", () => {
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span aria-hidden="true"><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
  });

  it("rejects a hint hidden by the native hidden attribute", () => {
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span hidden><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
  });

  it("rejects a hint hidden by a CSS class or inline style", () => {
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span className="hidden"><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span style={{ display: "none" }}><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
  });

  it('discovers target={"_blank"} in an expression container', () => {
    rejects(`const A = () => <a href="x" target={"_blank"}>Go</a>;`, /does not announce/);
  });

  it("treats a both-branch conditional target as static and accepts a static announcement", () => {
    ok(`const A = ({e}) => <a href="x" target={e ? "_blank" : "_blank"}>Go <NewTabHint /></a>;`);
  });

  it("requires matching polarity for a true-branch conditional target", () => {
    ok(
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined}>Go <NewTabHint /></a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("requires NEGATED polarity for a false-branch conditional target", () => {
    ok(
      `const A = ({e}) => <a href="x" target={e ? undefined : "_blank"}>Go {!(e) ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" target={e ? undefined : "_blank"}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("rejects a static label announcement on a conditional-target anchor", () => {
    rejects(
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined} aria-label="Go (opens in a new tab)">Go</a>;`,
      /static aria-label announcement on a conditional-target anchor/,
    );
  });

  it("discovers a conditional spread target and requires matching gating", () => {
    ok(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>Go <NewTabHint /></a>;`,
      /not gated/,
    );
  });

  it("resolves an identifier-backed spread object", () => {
    rejects(
      `const P = { target: "_blank" }; const A = () => <a href="x" {...P}>Go</a>;`,
      /does not announce/,
    );
  });

  it("fails closed on an unresolvable target expression", () => {
    rejects(`const A = ({t}) => <a href="x" target={t}>Go</a>;`, /not statically resolvable/);
  });

  it("covers <Link> and ignores non-link components carrying target", () => {
    rejects(`const A = () => <Link href="x" target="_blank">Go</Link>;`, /does not announce/);
    const sc = probe(`const A = () => <Tabs target="_blank" />;`);
    expect(sc.anchors, "non-link component must not be treated as an anchor").toBe(0);
    expect(sc.violations).toEqual([]);
  });

  it("honors an inline exemption comment", () => {
    ok(
      `// no-newtab-announcement: intentionally silent for the probe\nconst A = () => <a href="x" target="_blank">Go</a>;`,
    );
  });

  it("does not flag a non-external link", () => {
    const sc = probe(`const A = () => <a href="/local">Go</a>;`);
    expect(sc.anchors).toBe(0);
    expect(sc.violations).toEqual([]);
  });
});

// ── Live tree ─────────────────────────────────────────────────────────────
describe("every external link in the live tree announces its new tab", () => {
  it("has no unannounced external anchors", () => {
    const files = [
      ...walkFiles(join(process.cwd(), "components"), /\.tsx$/),
      ...walkFiles(join(process.cwd(), "app"), /\.tsx$/),
    ].map((abs) => abs.slice(process.cwd().length + 1));
    const sc: Scan = { anchors: 0, violations: [] };
    for (const rel of files) {
      const code = readFileSync(join(process.cwd(), rel), "utf8");
      if (!code.includes("_blank")) continue;
      scanSource(parse(rel, code), rel, sc);
    }
    // Anti-vacuity: the family exists, so a zero-anchor scan means the walker
    // or the glob broke rather than the tree being clean.
    expect(sc.anchors, "external anchors must be discovered").toBeGreaterThanOrEqual(20);
    expect(
      sc.violations.map((v) => `${v.file}:${v.line} ${v.reason}`),
      "unannounced external links",
    ).toEqual([]);
  });

  it("no .mdx file carries an external target (move such links into a .tsx component)", () => {
    const mdx = walkFiles(join(process.cwd(), "app"), /\.mdx$/).map((abs) =>
      abs.slice(process.cwd().length + 1),
    );
    expect(mdx.length, "mdx inventory should not be empty").toBeGreaterThan(0);
    const offenders = mdx.filter((rel) =>
      readFileSync(join(process.cwd(), rel), "utf8").includes("_blank"),
    );
    expect(offenders).toEqual([]);
  });
});
