// The zero-tolerance array-join className guard, and the executable premise the census
// guard's deletion rests on.
//
// Spec: docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §7
//
// WHAT DIED AND WHAT SURVIVED. `tests/specLint/canonicalClassArray.test.ts` bounded the
// blind spot by CENSUS: it enumerated all 18 files that array-joined a className and
// asserted the set could only shrink. The migration to `cn(...)` emptied that set, so the
// census's premise is gone. The recognizer's premise is not: nothing stops a contributor
// from writing a new array-join className tomorrow, and the eslint rule still cannot see
// inside one. Spec §1.1 R4 fences this in BOTH directions — do not argue for keeping the
// census, and do not argue for deleting the recognizer.
//
// So the census is replaced by the EMPTY SET: no className array join may exist under
// `app/` or `components/` at all. Strictly stronger than the census it replaces.
//
// THIS GUARD DOES NOT INHERIT THE CENSUS SCANNER'S THREE ESCAPES. That scanner anchored
// on the literal text `className={[` / `const x = [`, matched the separator `.join(" ")`
// exactly, and scanned only `/\.tsx?$/`. Each is a hole, and all seven escape shapes in
// spec §7.1 were probed silent — invisible to the scanner AND reporting zero eslint
// problems, with Prettier preserving every spelling rather than normalizing to one. The
// accept-set here is stated positively instead: every array join whose separator is a
// NON-EMPTY WHITESPACE string literal is reported, at any quote style, anywhere in any UI
// source file, position-free.
//
// WHAT THIS GUARD DELIBERATELY DOES NOT DECIDE. A className that is a bare identifier or
// an object lookup (`className={TRACK_BASE}`, `className={SIZE_CLASS[size]}`) is neither
// accepted nor reported. That is spec §1.1 R6's separate blind spot, with a different
// mechanism and its own backlog entry (§9.2). The subject here is the JOIN, and the join
// alone — saying "everything that is not a literal, template, or callee is reported"
// would over-promise what this recognizer can see.
//
// CONSEQUENCE BOUND. Every input is either handled correctly or reported; there is no
// silent-wrong path. A false positive is a loud failure a contributor resolves by adding
// an exemption row with its operand signature. THREAT MODEL: ordinary authoring mistakes
// by a contributor who is not trying to evade the guard. Deliberate obfuscation (building
// the separator at runtime, `Array.prototype.join.call`, a computed member access) is out
// of scope and files to documented limits rather than widening this recognizer.
//
// WHY THIS FILE CARRIES ITS OWN RECOGNIZER. `scripts/lib/cnSites.mjs` implements the same
// extraction for the arc's two one-shot scripts, but those ship unwired and could
// reasonably be deleted once the migration is closed (spec §4.3). A tracked guard that
// imported them would die with them. The duplication is deliberate and bounded.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ESLint } from "eslint";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { stripCommentsSafely } from "../_shared/stripComments";

const ROOT = process.cwd();

/** Every extension the eslint rule itself covers (`eslint.config.mjs`). */
const UI_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

/** The two UI roots. */
const UI_ROOTS = ["app", "components"] as const;

/**
 * The two legitimate whitespace data joins (spec §2.2, §7.1).
 *
 * EXEMPT PER SITE, NEVER PER FILE, AND ASSERTED AS SET EQUALITY. A file-wide exemption is
 * a hole: a contributor adds an array-join className to an exempted file, ESLint stays
 * blind, and the exemption suppresses the guard — silently, which breaches the consequence
 * bound above. An exhaustiveness check ("the file still contains a match") does not close
 * it either, because it cannot tell the legitimate join from an added one.
 *
 * So each row records a file AND the exact operand signature of the site it excuses, and
 * the assertion is that the file's set of whitespace-join signatures EQUALS its recorded
 * set. Both consequences are wanted: a NEW join in an exempted file fails (set is larger)
 * and a REMOVED one fails too (set is smaller), so a stale row cannot sit there
 * pre-authorizing a future class join in that file.
 *
 * The two are NOT the same expression, so the list carries both spellings. An exemption
 * broadened to cover both by loosening the operand match would silently admit a future
 * class join.
 */
const EXEMPT_SITES: Readonly<Record<string, readonly string[]>> = {
  // Each row is `<enclosing function> :: <operand signature>`. See EXEMPTION KEY below.
  "components/admin/wizard/step3ReviewSections.tsx": [
    "TransportBreakdown :: filter(…) :: leg.date, leg.time",
  ],
  "components/admin/review/sectionFreshness.ts": [
    "renderedTransportation :: filter(…) :: row.date, row.time",
  ],
  // Two PROSE joins, not class lists: the warning card's guidance line and its condensed
  // popover body, both assembling user-visible sentences with a single space between them
  // (spec 2026-08-27-wizard-warning-row-links-copy §4.3). Neither is in className position,
  // and each is recorded with its exact operand signature so a future className join in
  // this file still fails.
  "components/admin/PerShowActionableWarnings.tsx": [
    "withControlsNote :: filter(…) :: guidance.markup, note",
    "condensedPopoverSlots :: filter(…) :: movedGuidance, fullBody, trailing ?? null",
  ],
};

type JoinSite = {
  file: string;
  line: number;
  /** `<enclosing function> :: <operands>` — the exemption key. */
  signature: string;
  /** The operand list alone, comments stripped and whitespace collapsed. */
  operands: string;
  /** The separator's literal text, for diagnostics. */
  separator: string;
  /** Is this join feeding a `className` (JSX attribute, or a `className:` property)? */
  inClassNamePosition: boolean;
};

/**
 * `.js`/`.jsx`/`.mjs`/`.cjs` are parsed as JSX so a `.js` file containing JSX still yields
 * a usable tree; `.ts` must NOT be, because TSX misparses `<T>(x) => x`.
 */
function scriptKindFor(relPath: string): ts.ScriptKind {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".ts") return ts.ScriptKind.TS;
  return ts.ScriptKind.JSX;
}

function isStringLiteralNode(
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

/**
 * Array-returning methods that can sit between the literal and the `.join()`. Peeling only
 * `.filter` left `.map(String)`, `.slice()`, `.flat()` and `.concat(...)` invisible — and
 * the census guard this file replaces DID see those under `className={[`, so missing them
 * was a coverage regression. Kept in lockstep with `scripts/lib/cnSites.mjs`.
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

/**
 * Peel a chain of array-returning method calls, unwrapping value-preserving wrappers at the
 * receiver, at each intermediate callee, and between links.
 */
function peelArrayChain(node: ts.Expression): { receiver: ts.Expression; chain: string[] } {
  let receiver = unwrapValuePreserving(node);
  const chain: string[] = [];
  for (;;) {
    if (!ts.isCallExpression(receiver)) return { receiver, chain };
    const link = unwrapValuePreserving(receiver.expression);
    if (!ts.isPropertyAccessExpression(link)) return { receiver, chain };
    if (!ARRAY_RETURNING_METHODS.has(link.name.text)) return { receiver, chain };
    chain.unshift(link.name.text);
    receiver = unwrapValuePreserving(link.expression);
  }
}

/** Peel wrappers that change no runtime value: `( )`, `as T`, `satisfies T`, `!`. */
function unwrapValuePreserving(node: ts.Expression): ts.Expression {
  let n = node;
  for (;;) {
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) {
      n = n.expression;
      continue;
    }
    if (ts.isSatisfiesExpression(n)) {
      n = n.expression;
      continue;
    }
    // Angle-bracket assertions — `<string[]>[...]`, `<const>" "` — are valid in `.ts` (TSX
    // parses them as JSX, which is why they only reach here from a `.ts` file, and one of
    // the two exempt files IS a `.ts` file).
    if (ts.isTypeAssertionExpression(n)) {
      n = n.expression;
      continue;
    }
    return n;
  }
}

/** The accept-set's key: a non-empty, all-whitespace separator, at ANY quote style. */
function isWhitespaceSeparator(node: ts.Node): boolean {
  return isStringLiteralNode(node) && node.text.length > 0 && /^\s+$/.test(node.text);
}

/**
 * Collapse an operand's source text to a stable signature.
 *
 * Comment handling is NOT done here — `stripCommentsSafely` (the single-source module;
 * `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` forbids local copies) blanks
 * comments to spaces BEFORE the parse in `recognizeJoins`, preserving length and offsets so
 * reported line numbers still point at the real file. A local `/\/\*[\s\S]*?\*\//` here would
 * be a second, weaker implementation of that: it cannot tell a comment from the same
 * characters inside a string literal or a regex, which is exactly why the shared module
 * parses instead of pattern-matching.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Every whitespace-separated array join in one file's source.
 *
 * Position-free by construction: the walk visits every node, so a join inside a ternary,
 * a template interpolation, a call argument, or a variable initializer is found the same
 * way the bare JSX-attribute form is.
 */
function recognizeJoins(relPath: string, source: string): JoinSite[] {
  const kind = scriptKindFor(relPath);
  // Blank comments to spaces BEFORE parsing, via the single-source module. It preserves
  // length and offsets, so reported line numbers still point at the real file, and operand
  // signatures come out comment-free without a local regex that cannot tell a comment from
  // the same characters inside a string literal.
  const sourceFile = ts.createSourceFile(
    relPath,
    stripCommentsSafely(source, kind),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const found: JoinSite[] = [];

  const visit = (node: ts.Node): void => {
    // The separator can be wrapped too: `.join(" " as const)` is ordinary TypeScript that
    // Prettier leaves alone, and it escaped a check that read `arguments[0]` raw.
    // `arguments.length >= 1`, not `=== 1`: `.join(" ", undefined)` is valid JavaScript that
    // ignores the extra argument and still emits a space-separated className. Prettier
    // preserves it and ESLint is blind to it, so an exact-arity check was a free bypass in
    // every `.js`/`.jsx`/`.mjs`/`.cjs` UI file.
    const rawSeparator =
      ts.isCallExpression(node) && node.arguments.length >= 1 ? node.arguments[0] : undefined;
    const separatorArg =
      rawSeparator === undefined ? undefined : unwrapValuePreserving(rawSeparator);
    // The CALLEE can be wrapped too: `(arr.join)(" ")`, `arr.join!(" ")`, `(arr.join as F)(" ")`
    // all emit the identical runtime call and were invisible while only the RECEIVER was
    // unwrapped. Same bounded wrapper class, one level out.
    const callee = ts.isCallExpression(node) ? unwrapValuePreserving(node.expression) : undefined;
    if (
      ts.isCallExpression(node) &&
      callee !== undefined &&
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "join" &&
      separatorArg !== undefined &&
      isWhitespaceSeparator(separatorArg)
    ) {
      let receiver: ts.Expression = unwrapValuePreserving(
        (callee as ts.PropertyAccessExpression).expression,
      );
      // ONE function, called from both places. There used to be two copies of this loop —
      // the direct one and the one inside the const-resolution hop — and only the first was
      // taught to unwrap the intermediate callee, so `const t = [...].filter!(Boolean)`
      // routed through a const stayed silent while the identical direct form was caught.
      // Two copies of a peel rule is exactly how that recurs; there is now one.
      const firstPeel = peelArrayChain(receiver);
      receiver = firstPeel.receiver;
      const chain: string[] = [...firstPeel.chain];
      // A bare identifier receiver — `const tokens = ["p-2", drift]; tokens.join(" ")` — is
      // ordinary authoring and was invisible. Resolve up to three same-file `const` hops,
      // re-applying the peel after each, so `const t = [...].filter(Boolean)` and a two-hop
      // alias both reduce. Bounded on purpose: see RECEIVER REACHABILITY.
      for (let hop = 0; hop < 3 && ts.isIdentifier(receiver); hop += 1) {
        const resolved = soleConstInitializer(sourceFile, receiver.text);
        if (resolved === null) break;
        const hopPeel = peelArrayChain(unwrapValuePreserving(resolved));
        receiver = hopPeel.receiver;
        chain.unshift(...hopPeel.chain);
      }
      if (ts.isArrayLiteralExpression(receiver)) {
        const operandSignature = receiver.elements
          .map((e) => normalize(e.getText(sourceFile)))
          .join(", ");
        // The TRANSFORM CHAIN belongs to the exemption IDENTITY, not to the bare operand
        // list. Peeling `.map(...)` erased its output-changing semantics, so
        // `[leg.date, leg.time].map(() => "p-2").join(" ")` inherited a data-join exemption
        // whose operands it reproduces while emitting an entirely different string.
        const chainKey = chain.length > 0 ? `${chain.join(".")}(…) :: ` : "";
        found.push({
          file: relPath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          signature: `${enclosingFunctionName(node)} :: ${chainKey}${operandSignature}`,
          operands: operandSignature,
          separator: JSON.stringify((separatorArg as ts.StringLiteral).text),
          inClassNamePosition: isInClassNamePosition(node, sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * RECEIVER REACHABILITY — what this scanner resolves, and the limit it stops at.
 *
 * It reduces a join's receiver through: value-preserving wrappers, a chain of
 * array-returning methods, and up to three same-file sole-`const` hops. That covers the
 * accidental-authoring shapes — a filtered array in a const, an alias, an alias of an alias.
 *
 * It does NOT resolve a factory call, a member array, a conditional array, or
 * `Array.from(...)`. Those are a DATAFLOW/type question, and a lexical guard cannot close
 * them: each resolution rule invites one more indirection. **The limit is bounded and
 * stated rather than silently widened**, and it is strictly stronger than what it replaces —
 * the deleted census scanner anchored on the literal text `className={[`, so it missed
 * every one of those shapes too, plus the ones this scanner now catches. `pnpm lint` remains
 * the primary mechanism for anything routed through `cn(...)`.
 */
function soleConstInitializer(sourceFile: ts.SourceFile, name: string): ts.Expression | null {
  let found: ts.Expression | null = null;
  let seen = 0;
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer !== undefined
    ) {
      seen += 1;
      found = n.initializer;
    }
    ts.forEachChild(n, visit);
  };
  visit(sourceFile);
  return seen === 1 ? found : null;
}

/**
 * THE EXEMPTION KEY, AND WHY IT IS NOT A DATAFLOW QUESTION.
 *
 * Earlier revisions tried to decide "is this join feeding a className?" and extend that
 * decision each time a reviewer found another shape it missed — direct use, then alias
 * chains, then late assignment / function declarations / parameter defaults / destructuring.
 * That is unbounded: className-ness is a dataflow property, and a lexical walk can always be
 * routed around by one more hop. Three consecutive rounds spent on it, which this repo's own
 * rule says to close structurally rather than patch again.
 *
 * So the guard no longer asks. Every whitespace array join is REPORTED unless it matches an
 * exemption row exactly, and a row is keyed on THREE things: the file, the enclosing
 * function's name, and the operand signature. That key is closed — it ranges over a finite
 * program, not over an open set of routing shapes. Replacing a data join with a class join
 * now has to reproduce the operand signature INSIDE the same named function to escape, and
 * at that point the "escape" is code that renders `leg.date` as a CSS class.
 */
function enclosingFunctionName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node; n !== undefined; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (
      (ts.isFunctionExpression(n) || ts.isArrowFunction(n)) &&
      n.parent &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name)
    ) {
      return n.parent.name.text;
    }
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
  }
  return "<module>";
}

function isInClassNamePosition(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  for (let n: ts.Node | undefined = node; n !== undefined; n = n.parent) {
    if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name) && n.name.text === "className") return true;
    if (
      ts.isPropertyAssignment(n) &&
      (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
      n.name.text === "className"
    ) {
      return true;
    }
    // VIA A VARIABLE. Stopping the walk at the declaration classified
    // `const classList = [...].join(" ")` + `className={classList}` as a DATA join, which
    // let an exemption signature authorize a real class list. Follow the binding instead:
    // if the name it is assigned to is ever used in a className position, this is one too.
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      return identifierUsedAsClassName(sourceFile, n.name.text);
    }
    if (ts.isFunctionDeclaration(n)) break;
  }
  return false;
}

/**
 * Is `name` — or anything transitively ALIASED from it — ever referenced from a `className`
 * JSX attribute or `className:` property?
 *
 * Following only direct use let one ordinary alias hop launder a class join into a "data"
 * join: `const joined = [...].join(" "); const cls = joined;` + `className={cls}`. The
 * alias set is closed first, then every member is checked.
 */
function identifierUsedAsClassName(sourceFile: ts.SourceFile, name: string): boolean {
  const aliases = new Set([name]);
  for (let grew = true; grew; ) {
    grew = false;
    const visitAlias = (n: ts.Node): void => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer !== undefined &&
        !aliases.has(n.name.text)
      ) {
        const init = unwrapValuePreserving(n.initializer);
        if (ts.isIdentifier(init) && aliases.has(init.text)) {
          aliases.add(n.name.text);
          grew = true;
        }
      }
      ts.forEachChild(n, visitAlias);
    };
    visitAlias(sourceFile);
  }

  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && aliases.has(n.text)) {
      for (let p: ts.Node | undefined = n.parent; p !== undefined; p = p.parent) {
        if (ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "className") {
          found = true;
          return;
        }
        if (
          ts.isPropertyAssignment(p) &&
          (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
          p.name.text === "className"
        ) {
          found = true;
          return;
        }
        if (ts.isJsxAttribute(p) || ts.isStatement(p)) break;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * The file walker, PARAMETERIZED BY ITS ROOTS — which is the whole point.
 *
 * An inline-string fixture proves the RECOGNIZER parses; it proves nothing about the
 * WALKER that decides which files reach it. After the migration the only live
 * whitespace-join sites in the tree are the two exemptions, both under `components/` in
 * `.ts`/`.tsx` — so a walker restricted to `components/**` + `.ts`/`.tsx` would satisfy
 * the exemption assertions, the clean-tree assertion, and the eslint pair, while an
 * ordinary `app/**\/*.jsx` array join stayed silent forever. Pointing this same function
 * at an on-disk fixture tree is what closes that.
 */
function scanRoots(opts: { root: string; roots: readonly string[]; tracked: boolean }): JoinSite[] {
  const files = opts.tracked
    ? trackedFiles(opts.root, opts.roots)
    : walkFiles(opts.root, opts.roots);
  return files.flatMap((rel) =>
    recognizeJoins(rel, fs.readFileSync(path.join(opts.root, rel), "utf8")),
  );
}

/** Tracked files only — an untracked scratch file is not a shipped className. */
function trackedFiles(root: string, roots: readonly string[]): string[] {
  return execFileSync("git", ["ls-files", "-z", ...roots], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(
      (f) =>
        f.length > 0 && UI_EXTENSIONS.includes(path.extname(f) as (typeof UI_EXTENSIONS)[number]),
    );
}

function walkFiles(root: string, roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(childRel);
      else if (UI_EXTENSIONS.includes(path.extname(entry.name) as (typeof UI_EXTENSIONS)[number])) {
        out.push(childRel);
      }
    }
  };
  roots.forEach(walk);
  return out.sort();
}

/* ────────────────────────────────────────────────────────────────────────────
 * The premise fixture — an on-disk tree, varied on THREE dimensions
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The seven escape shapes of spec §7.1, each with a unique operand signature so the
 * assertion names the shape that went missing rather than reporting a count.
 */
const ESCAPE_SHAPES = [
  {
    id: "ternary-at-className",
    signature: '"esc-1a", "esc-1b"',
    code: 'export const A = (flag) => <div className={flag ? ["esc-1a", "esc-1b"].join(" ") : "p-2"} />;',
  },
  {
    id: "template-interpolation",
    signature: '"esc-2a", "esc-2b"',
    code: 'export const B = () => <div className={`p-2 ${["esc-2a", "esc-2b"].join(" ")}`} />;',
  },
  {
    id: "backtick-separator",
    // Operand text is the SOURCE text, so this shape's signature carries its backticks.
    signature: "`esc-3a`, `esc-3b`",
    code: "export const C = () => <div className={[`esc-3a`, `esc-3b`].join(` `)} />;",
  },
  {
    id: "single-quote-separator",
    signature: "'esc-4a', 'esc-4b'",
    code: "export const D = () => <div className={['esc-4a', 'esc-4b'].join(' ')} />;",
  },
  {
    id: "call-argument-position",
    signature: '"esc-5a", "esc-5b"',
    code: 'export const E = () => make({ className: ["esc-5a", "esc-5b"].join(" ") });',
  },
  {
    id: "via-variable-const",
    signature: '"esc-6a", "esc-6b"',
    code: 'const unremarkableName = ["esc-6a", "esc-6b"].join(" ");\nexport const F = () => <div className={unremarkableName} />;',
  },
  {
    id: "direct-form",
    signature: '"esc-7a", "esc-7b"',
    code: 'export const G = () => <div className={["esc-7a", "esc-7b"].join(" ")} />;',
  },
  // Callee wrappers. Each emits the identical runtime call and was invisible while only the
  // RECEIVER was unwrapped; the fixture pins the closure rather than the implementation.
  {
    id: "parenthesized-callee",
    signature: '"esc-8a", "esc-8b"',
    code: 'export const H = () => <div className={(["esc-8a", "esc-8b"].join)(" ")} />;',
  },
  {
    id: "nonnull-callee",
    signature: '"esc-9a", "esc-9b"',
    code: 'export const I = () => <div className={["esc-9a", "esc-9b"].join!(" ")} />;',
  },
  {
    id: "as-cast-callee",
    signature: '"esc-10a", "esc-10b"',
    code: 'export const J = () => <div className={(["esc-10a", "esc-10b"].join as (s: string) => string)(" ")} />;',
  },
  {
    id: "const-routed-wrapped-intermediate-callee",
    signature: '"esc-13a", "esc-13b"',
    code: 'const esc13 = ["esc-13a", "esc-13b"].filter!(Boolean);\nexport const M = () => <div className={esc13.join(" ")} />;',
  },
  {
    id: "extra-ignored-argument",
    signature: '"esc-12a", "esc-12b"',
    code: 'export const L = () => <div className={["esc-12a", "esc-12b"].join(" ", undefined)} />;',
  },
  {
    id: "satisfies-callee",
    signature: '"esc-11a", "esc-11b"',
    code: 'export const K = () => <div className={(["esc-11a", "esc-11b"].join satisfies (s: string) => string)(" ")} />;',
  },
] as const;

/**
 * Separator spellings. The accept-set says NON-EMPTY WHITESPACE, so a scanner hard-coded
 * to a single ASCII space would satisfy a single-space-only fixture while missing both of
 * the others. Probed: neither draws an ESLint finding, so the rule does not backstop them,
 * and accidental double spacing is ordinary authoring.
 */
const SEPARATOR_SPELLINGS = [
  { id: "single-space", literal: '" "' },
  { id: "double-space", literal: '"  "' },
  { id: "tab", literal: '"\\t"' },
  { id: "single-quoted", literal: "' '" },
  { id: "backtick", literal: "` `" },
] as const;

/** The three negatives that must NOT be reported. */
const NEGATIVES = [
  { id: "comma-separator", code: 'export const N1 = ["n1a", "n1b"].join(", ");' },
  { id: "empty-separator", code: 'export const N2 = ["n2a", "n2b"].join("");' },
  { id: "cn-callee", code: 'export const N3 = cn("n3a", "n3b");' },
] as const;

/** Twelve root × extension combinations — the walker-coverage dimension. */
const COMBINATIONS = UI_ROOTS.flatMap((root) => UI_EXTENSIONS.map((ext) => ({ root, ext })));

function buildPremiseFixture(): {
  dir: string;
  comboSignature: (root: string, ext: string) => string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-callee-premise-"));
  const comboSignature = (root: string, ext: string): string =>
    `"combo-${root}${ext.replace(".", "-")}"`;

  // One planted array-join className at EVERY root × extension combination, rotating the
  // separator spelling across them so a single-space-only scanner fails on the
  // combination it drops, by name.
  COMBINATIONS.forEach(({ root, ext }, index) => {
    const spelling = SEPARATOR_SPELLINGS[index % SEPARATOR_SPELLINGS.length];
    if (spelling === undefined) throw new Error("unreachable: SEPARATOR_SPELLINGS is non-empty");
    const separator = spelling.literal;
    const rel = path.join(root, "nested", `Combo${index}${ext}`);
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    // Non-JSX shape, so this is valid in `.ts` (where JSX would not parse) as well as in
    // every other extension.
    fs.writeFileSync(
      abs,
      `export const combo = [${comboSignature(root, ext)}].join(${separator});\n`,
      "utf8",
    );
  });

  // The seven escape shapes, plus the three negatives, in a `.tsx` file where JSX parses.
  const shapesAbs = path.join(dir, "components", "Shapes.tsx");
  fs.mkdirSync(path.dirname(shapesAbs), { recursive: true });
  fs.writeFileSync(
    shapesAbs,
    `${ESCAPE_SHAPES.map((s) => s.code).join("\n")}\n${NEGATIVES.map((n) => n.code).join("\n")}\n`,
    "utf8",
  );

  return { dir, comboSignature };
}

const premise = buildPremiseFixture();
afterAll(() => {
  fs.rmSync(premise.dir, { recursive: true, force: true });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The guard
 * ──────────────────────────────────────────────────────────────────────────── */

describe("no className array joins survive (zero-tolerance, spec §7.1)", () => {
  // ── The premise, stated executably and UNCONDITIONALLY ──────────────────────────────
  //
  // A zero-tolerance guard cannot prove its scanner works by finding a non-empty set:
  // "found nothing" is both the passing state and what a broken scanner reports. These
  // three assertions run before the clean-tree assertion below, and none of them sits
  // inside a `.each` callback whose case count could be zero.

  const premiseSites = scanRoots({ root: premise.dir, roots: UI_ROOTS, tracked: false });

  it("premise / location: finds a planted join at all twelve root × extension combinations", () => {
    const signatures = new Set(premiseSites.map((s) => s.operands));
    const missing = COMBINATIONS.filter(
      ({ root, ext }) => !signatures.has(premise.comboSignature(root, ext)),
    ).map(({ root, ext }) => `${root}/**/*${ext}`);
    expect(
      missing,
      "the scanner's WALKER drops these root/extension combinations. An array-join className " +
        "in one of them would never be reported, and the clean-tree assertion below would " +
        "still pass — which is exactly the vacuous-premise failure this fixture exists to catch.",
    ).toEqual([]);
  });

  it("premise / shape: finds every escape shape — the seven from spec §7.1 plus the callee wrappers", () => {
    const signatures = new Set(premiseSites.map((s) => s.operands));
    const missed = ESCAPE_SHAPES.filter((shape) => !signatures.has(shape.signature)).map(
      (s) => s.id,
    );
    expect(
      missed,
      "the recognizer misses these escape shapes. All seven were probed silent against the OLD " +
        "census scanner and against the eslint rule itself; a replacement that inherits any of " +
        "them re-opens the hole spec §7.1 exists to close.",
    ).toEqual([]);
  });

  it("premise / separator: finds every whitespace spelling and no non-whitespace one", () => {
    // The five spellings in the fixture resolve to three distinct separator VALUES —
    // `" "` and `' '` and `` ` ` `` are the same value at three quote styles, which is
    // exactly the point: the recognizer keys on the VALUE, not the spelling.
    const separators = [...new Set(premiseSites.map((s) => s.separator))].sort();
    expect(separators).toEqual(['" "', '"  "', '"\\t"'].sort());

    // And the three negatives are absent — a recognizer that reported every `.join(...)`
    // would satisfy every positive assertion above while being useless.
    const signatures = new Set(premiseSites.map((s) => s.operands));
    const wronglyReported = [
      { id: "comma-separator .join(', ')", signature: '"n1a", "n1b"' },
      { id: "empty-separator .join('')", signature: '"n2a", "n2b"' },
      { id: "cn(...) callee", signature: '"n3a", "n3b"' },
    ]
      .filter((negative) => signatures.has(negative.signature))
      .map((negative) => negative.id);
    expect(wronglyReported, "the recognizer reported a non-class join").toEqual([]);
    expect(NEGATIVES.length, "premise: all three negatives are in the fixture").toBe(3);
  });

  // ── The guard itself ────────────────────────────────────────────────────────────────

  const treeSites = scanRoots({ root: ROOT, roots: UI_ROOTS, tracked: true });

  it("reports zero array-join classNames outside the two named data-join exemptions", () => {
    const offenders = treeSites
      // Reported unless the row matches EXACTLY — file, enclosing function, and operands.
      .filter((s) => !(EXEMPT_SITES[s.file] ?? []).includes(s.signature))
      .map((s) => `${s.file}:${s.line} — [${s.signature}].join(${s.separator})`);
    expect(
      offenders,
      "new array-join className(s). `better-tailwindcss/enforce-canonical-classes` CANNOT see " +
        "inside an array join — the plugin's String matcher returns an UNCROSSABLE_BOUNDARY at " +
        "any CallExpression — so Tailwind drift in these escapes `pnpm lint` and therefore CI. " +
        "Use `cn(...)` from @/lib/ui/cn, which the plugin traverses by default. If this is a DATA " +
        "join rather than a class list, add an EXEMPT_SITES row with its exact operand signature.",
    ).toEqual([]);
  });

  it.each(Object.keys(EXEMPT_SITES))(
    "%s holds exactly its recorded exempt sites, no more and no fewer",
    (file) => {
      const actual = treeSites
        .filter((s) => s.file === file)
        .map((s) => s.signature)
        .sort();
      expect(
        actual,
        "an exempted file's whitespace-join sites must EQUAL its recorded set. Larger means a new " +
          "join landed in a file whose exemption would have suppressed the guard; smaller means a " +
          "stale row is sitting there pre-authorizing a future class join in this file.",
      ).toEqual([...(EXEMPT_SITES[file] ?? [])].sort());
    },
  );

  it("pins that the canonical-class rule is ON, so this guard protects a live gap", () => {
    // A guard that outlives its rule pins nothing.
    const config = fs.readFileSync(path.join(ROOT, "eslint.config.mjs"), "utf8");
    expect(config).toMatch(/"better-tailwindcss\/enforce-canonical-classes":\s*"error"/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The coverage premise pair (spec §7.2)
 * ──────────────────────────────────────────────────────────────────────────── */

// The census guard's whole justification was "the rule cannot see these." Deleting it
// asserts "the rule can see these NOW." That assertion is not left in prose.
//
// The negative control is what makes the pair discriminating: without it, a harness
// pointed at the wrong file, or a rule that reported everything, would satisfy the
// positive check vacuously. It also permanently documents, executably, WHY the migration
// was necessary — after the array-join sites are gone, this is the only surviving evidence
// that the blind spot was real.

const SEEDED = "min-h-(--spacing-tap-min)"; // canonicalizes to `min-h-tap-min`
const CANONICAL_RULE = "better-tailwindcss/enforce-canonical-classes";

type Cell = { id: string; line: number; reported: boolean };

function buildCoverageProbe(): { source: string; cells: Cell[] } {
  const lines: string[] = [];
  const cells: Cell[] = [];
  const add = (id: string, reported: boolean, code: string): void => {
    lines.push(code);
    cells.push({ id, line: lines.length, reported });
  };

  lines.push('import { cn } from "@/lib/ui/cn";');
  lines.push("const on = Math.random() > 0.5;");

  // Shape A — inline `className={cn(...)}`.
  add(
    "inline / literal arg",
    true,
    `export const A1 = () => <div className={cn("flex", "${SEEDED}")} />;`,
  );
  add(
    "inline / ternary arg",
    true,
    `export const A2 = () => <div className={cn("flex", on ? "${SEEDED}" : "p-2")} />;`,
  );
  add(
    "inline / array-join negative, double-quote separator",
    false,
    `export const A3 = () => <div className={["flex", "${SEEDED}"].join(" ")} />;`,
  );
  add(
    "inline / array-join negative, single-quote separator",
    false,
    `export const A4 = () => <div className={['flex', '${SEEDED}'].join(' ')} />;`,
  );
  add(
    "inline / array-join negative, backtick separator",
    false,
    "export const A5 = () => <div className={[`flex`, `" + SEEDED + "`].join(` `)} />;",
  );

  // Shape B — via a variable. Spec §2.3 probed that the callee match does not depend on
  // the variable's NAME, and this is what pins it: `unremarkableName` is not `classes`.
  add("via-variable / literal arg", true, `const unremarkableName = cn("flex", "${SEEDED}");`);
  add(
    "via-variable / ternary arg",
    true,
    `const alsoUnremarkable = cn("flex", on ? "${SEEDED}" : "p-2");`,
  );
  add(
    "via-variable / array-join negative, double-quote separator",
    false,
    `const joinedDouble = ["flex", "${SEEDED}"].join(" ");`,
  );
  add(
    "via-variable / array-join negative, single-quote separator",
    false,
    `const joinedSingle = ['flex', '${SEEDED}'].join(' ');`,
  );
  add(
    "via-variable / array-join negative, backtick separator",
    false,
    "const joinedBacktick = [`flex`, `" + SEEDED + "`].join(` `);",
  );

  lines.push(
    "export const B = () => <><div className={unremarkableName} /><div className={alsoUnremarkable} />" +
      "<div className={joinedDouble} /><div className={joinedSingle} /><div className={joinedBacktick} /></>;",
  );

  return { source: `${lines.join("\n")}\n`, cells };
}

describe("the premise the census deletion rests on (spec §7.2)", () => {
  it("the rule reports drift inside cn(...) and NOT inside an array join", async () => {
    // `better-tailwindcss` resolves canonical classes through a synckit worker whose default
    // timeout is short. On a loaded machine (this repo's arcs ship concurrently, and a
    // measured load average of 57 was enough) the worker misses it and ESLint reports
    // `Internal error: Atomics.wait() failed: timed-out` — a machine-contention failure that
    // says nothing about the rule. Raise it so this assertion measures the RULE, not the
    // scheduler. Respects an explicit outer value.
    process.env.SYNCKIT_TIMEOUT ??= "120000";
    const { source, cells } = buildCoverageProbe();
    const eslint = new ESLint({ cwd: ROOT });
    // `lintText` needs no file on disk, so nothing is written into the repo that a
    // concurrent scan — including this file's own tracked-tree assertion — could see.
    const results = await eslint.lintText(source, {
      filePath: path.join(ROOT, "components", "__cn_coverage_probe__.tsx"),
    });
    const result = results[0];
    expect(result, "ESLint.lintText returned no result for the probe source").toBeDefined();
    if (result === undefined) return;

    const reportedLines = new Set(
      result.messages.filter((m) => m.ruleId === CANONICAL_RULE).map((m) => m.line),
    );

    // Premise for the premise: the harness linted something. A misconfigured ESLint that
    // reported nothing at all would otherwise satisfy every negative cell vacuously.
    expect(
      reportedLines.size,
      "the canonical-class rule reported NOTHING on a file seeded with a known violation. The " +
        "harness is not linting what it thinks it is — check `cwd`, the flat-config lookup, and " +
        "the `entryPoint: app/globals.css` setting.",
    ).toBeGreaterThan(0);

    const wrong = cells
      .filter((cell) => reportedLines.has(cell.line) !== cell.reported)
      .map((cell) => `${cell.id} — expected ${cell.reported ? "REPORTED" : "not reported"}`);

    expect(
      wrong,
      "a positive cell failing means the migration's whole premise is wrong — the rule does NOT " +
        "see inside `cn(...)`, and the array-join sites were migrated for nothing. A negative cell " +
        "failing means the rule CAN now see inside array joins, which would make the migration " +
        "unnecessary and this guard's justification stale. Either way, re-derive spec §2.3.",
    ).toEqual([]);
  });
});
