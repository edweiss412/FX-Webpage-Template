// The canonicalization changed no VALUE — asserted deterministically.
//
// Spec: docs/superpowers/specs/2026-08-07-classname-array-join-cn.md §6, §9.4
// Plan: docs/superpowers/plans/2026-08-07-classname-array-join-cn.md, Task 6
//
// Stage 2 rewrites six class tokens. Four are shorthands whose equivalence is a Tailwind
// fact (`size-*` sets height and width; `text-<size>/<leading>` sets font-size and
// line-height). The other two substitute a CANONICAL UTILITY for a bracket/arrow form, and
// those are the ones that could in principle resolve differently:
//
//   C1  `max-w-[60px]`                       -> `max-w-confirm-box`
//   C5  `min-h-(--spacing-right-now-min-h)`  -> `min-h-right-now-min-h`
//
// The risk is a TOKEN question, not a timing or layout question: does the utility resolve
// to the value the form it replaced encoded? So it is answered here — no browser, no
// clock, no flake — rather than in the e2e dimension spec.
//
// THIS IS THE TOKEN HALF OF C1'S PROOF. It was once the WHOLE of it: measured 2026-08-08
// the connector was 0x1 at every viewport, because StepIndicator's <nav> was a
// content-sized flex item inside a row flex container, so its `flex-1` connectors got no
// free space and `max-w` never applied — nothing in a browser could discriminate a wrong
// `--spacing-confirm-box` when the box was zero wide either way.
//
// That premise is now FALSE, and deliberately so. The connector sets `w-confirm-box`
// (components/admin/OnboardingWizard.tsx) — a fixed 60px, which is this token — and the
// e2e spec measures it at every step and both widths. So the two proofs are now genuinely complementary: this file
// answers "does the utility resolve to the value the bracket form encoded", which is a
// token question with no browser in it, and the e2e spec answers "does the rendered box
// obey it", which cannot be answered anywhere else. Neither subsumes the other.
//
// It replaces the mid-crossfade sampler the plan descoped for the same reason: three
// consecutive review rounds on that sampler were all about driving framer-motion
// deterministically, and none of them was about the canonicalization.
//
// AUTHORED GREEN, DELIBERATELY, AND THAT IS DECLARED. Both facts are already true at
// base, so this is a PIN rather than Task 6's red (`pnpm lint` is). Its discriminating
// power was observed once at authoring by editing the `60px` literal, watching this fail,
// and reverting — recorded in the task log rather than asserted here.

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import ts from "typescript";

import { stripCssComments } from "../_shared/stripComments";

const GLOBALS = path.join(process.cwd(), "app/globals.css");

/**
 * The two production sites whose class token this file's token assertions are supposed to
 * prove. Without binding them, the proof is answering a question nobody asked: a rebase
 * changing the connector to `w-16` (64px, canonical, so ESLint stays silent) leaves
 * `--spacing-confirm-box: 60px` intact while the rendered constraint changes. That swap
 * was invisible to EVERY C1 assertion when the rect keys were 0-width; the e2e width
 * equality catches it now (64 != 60), but this binding is still what ties the token to
 * the site rather than to nothing. The token identity and the SITE THAT USES IT
 * are two halves of one claim.
 */
const CANONICAL_USE_SITES = [
  {
    id: "C1",
    file: "components/admin/OnboardingWizard.tsx",
    testId: "wizard-step-connector",
    // `w-`, not `max-w-`, as of the connector-render change. The canonicalization
    // this file proves is a TOKEN claim -- does the utility resolve to the 60px
    // the bracket form encoded -- and that claim is identical whichever spacing
    // utility consumes `--spacing-confirm-box`. The site moved from a cap that
    // was doing all the work (`flex-1 max-w-confirm-box`) to setting the width
    // outright, because measurement showed the flex-grow never grew anything.
    utility: "w-confirm-box",
    replaced: "max-w-[60px]",
  },
  {
    id: "C5",
    file: "components/crew/RightNowHero.tsx",
    testId: "right-now-hero",
    utility: "min-h-right-now-min-h",
    replaced: "min-h-(--spacing-right-now-min-h)",
  },
] as const;

/**
 * The class text of the JSX element carrying `data-testid={testId}`, or null.
 *
 * Searching the whole FILE was not a binding at all: a sibling component in the same file
 * using the utility satisfied the assertion while the real target changed to a different
 * canonical utility — and for C1 the rect keys are the accepted `0 == 0` tripwire, so
 * nothing else would have caught it. The question "does THIS element use THIS utility" is
 * an AST question about one element, which is closed; "does the file mention it" is not a
 * question about the target at all.
 */
function unconditionalClassLiterals(
  source: string,
  relPath: string,
  testId: string,
): string | null {
  const initializer = classTextOfElement(source, relPath, testId);
  if (initializer === null) return null;
  const cnIsSanctionedImport = fileImportsSanctionedCn(source, relPath);
  // Only UNCONDITIONALLY-APPLIED class text counts. Textual presence anywhere in the
  // initializer let `false ? "max-w-confirm-box" : "max-w-16"` satisfy the assertion while
  // the element always renders `max-w-16` — and C1's rect keys are the documented zero-width
  // tripwire, so that escape had nothing else catching it. A top-level string-literal
  // argument of the className expression IS always applied; a conditional branch is not.
  const wrapper = ts.createSourceFile(
    "__cls.tsx",
    `const __x = ${initializer.replace(/^\{|\}$/g, "")};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const literals: string[] = [];
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      const init = n.initializer;
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        literals.push(init.text);
      } else if (ts.isCallExpression(init)) {
        // ONLY the sanctioned `cn` callee. Treating every call's literal arguments as applied
        // let a type-correct helper that discards an argument — `pickSecond("max-w-confirm-box",
        // "max-w-16")` — satisfy both assertions while rendering `max-w-16`. `cn` is the one
        // callee whose semantics this arc pins (it concatenates every truthy argument), so it
        // is the one callee whose arguments are known to reach the class attribute.
        // ...and `cn` must be THE sanctioned import, not merely the spelling. A local `cn`
        // that discards its arguments would otherwise satisfy both assertions while the
        // element renders something else. C1's browser coverage is now real (the
        // connector renders at a fixed 60px and the e2e spec measures it), but this
        // binding is still the only thing tying the TOKEN to the SITE.
        if (
          ts.isIdentifier(init.expression) &&
          init.expression.text === "cn" &&
          cnIsSanctionedImport
        ) {
          for (const arg of init.arguments) {
            if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
              literals.push(arg.text);
            }
          }
        }
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(wrapper);
  return literals.join(" ");
}

/** Does this file import `cn` from `@/lib/ui/cn`, with no other binding of that name? */
function fileImportsSanctionedCn(source: string, relPath: string): boolean {
  const sourceFile = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let imported = false;
  let otherBindings = 0;
  const visit = (n: ts.Node): void => {
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      n.moduleSpecifier.text === "@/lib/ui/cn" &&
      n.importClause?.namedBindings &&
      ts.isNamedImports(n.importClause.namedBindings) &&
      n.importClause.namedBindings.elements.some((e) => e.name.text === "cn")
    ) {
      imported = true;
    }
    if (
      (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isFunctionDeclaration(n)) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === "cn"
    ) {
      otherBindings += 1;
    }
    ts.forEachChild(n, visit);
  };
  visit(sourceFile);
  return imported && otherBindings === 0;
}

function classTextOfElement(source: string, relPath: string, testId: string): string | null {
  const sourceFile = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const matches: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningLikeElement(node)) {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const marks = attrs.some(
        (a) =>
          ts.isIdentifier(a.name) &&
          a.name.text === "data-testid" &&
          a.initializer !== undefined &&
          ts.isStringLiteral(a.initializer) &&
          a.initializer.text === testId,
      );
      if (marks) {
        const className = attrs.find((a) => ts.isIdentifier(a.name) && a.name.text === "className");
        matches.push(className?.initializer ? className.initializer.getText(sourceFile) : "");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  // EXACTLY ONE source element may carry the id. Taking the first let a dead earlier element
  // keep the canonical utility while the rendered one changed — and C1's rect keys are the
  // accepted zero-width tripwire, so nothing else would have seen it.
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

/**
 * Every ACTIVE `--<name>: <value>;` declaration inside an `@theme` block, in source order.
 *
 * Two things this must not do, both probed as real holes in an earlier draft:
 *
 *  - **Read commented-out declarations.** A raw regex happily matched a token inside a
 *    `/* ... *\/` block, so a file whose ONLY matching declarations were commented out
 *    still reported `["60px"]` and passed. Comments are stripped first, by the
 *    single-source `stripCssComments` (blanks them, preserving offsets).
 *  - **Read declarations outside `@theme`.** Tailwind v4 only exposes `@theme` tokens as
 *    utilities, so a `:root` declaration of the same name proves nothing about what
 *    `max-w-confirm-box` resolves to. Only `@theme` blocks are scanned.
 */
function declarationsOf(css: string, token: string): string[] {
  const active = stripCssComments(css);
  // Split on SEMICOLONS, not line boundaries. A line-anchored regex saw only the first of
  // two declarations sharing a line, so `--spacing-confirm-box: 60px; --spacing-confirm-box: 64px;`
  // reported ["60px"] while CSS resolves the utility to 64px — and C1's rects are the
  // accepted 0-width tripwire, so nothing else would have caught it.
  const out: string[] = [];
  for (const block of themeBlocks(active)) {
    for (const decl of block.split(";")) {
      const m = decl.match(new RegExp(`^\\s*${token.replace(/[-]/g, "\\-")}\\s*:\\s*(.+)$`, "s"));
      if (m) out.push((m[1] ?? "").trim());
    }
  }
  return out;
}

/** The text inside each top-level `@theme { ... }` block, brace-matched. */
function themeBlocks(css: string): string[] {
  const out: string[] = [];
  const re = /@theme[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
    }
    out.push(css.slice(start, i - 1));
    re.lastIndex = i;
  }
  return out;
}

describe("canonicalized utilities resolve to the values they replaced (spec §6)", () => {
  const css = readFileSync(GLOBALS, "utf8");

  // Premise: the file was read and holds `@theme` tokens at all. A path that silently
  // resolved to an empty string would make every "defined exactly once" assertion below
  // report a count of 0 and fail — but it would fail for the wrong reason, so this says
  // which reason it is.
  it("premise: app/globals.css was read and carries @theme spacing tokens", () => {
    expect(css.length, `${GLOBALS} is empty or unreadable`).toBeGreaterThan(0);
    expect(css).toContain("--spacing-");
    // And the @theme scoping actually finds blocks — otherwise every assertion below would
    // read an empty set and "defined exactly once" would fail for the wrong reason.
    expect(themeBlocks(stripCssComments(css)).length, "no @theme block found").toBeGreaterThan(0);
  });

  it("C1: --spacing-confirm-box is exactly the 60px `max-w-[60px]` encoded", () => {
    const values = declarationsOf(css, "--spacing-confirm-box");
    // Defined exactly once: two definitions would make "the value" depend on cascade
    // order, and this assertion would be reading whichever one it happened to match.
    expect(
      values,
      "`max-w-confirm-box` replaced the bracket literal `max-w-[60px]` on the wizard's " +
        "step-indicator connector. If this token is not exactly 60px, that substitution " +
        "changed a computed max-width and spec §6 C1's equivalence claim is false.",
    ).toEqual(["60px"]);
  });

  it.each(CANONICAL_USE_SITES.map((u) => [u.id, u.file, u.testId, u.utility, u.replaced] as const))(
    "%s: the production ELEMENT still consumes the canonical utility",
    (id, file, testId, utility, replaced) => {
      const raw = readFileSync(path.join(process.cwd(), file), "utf8");
      // Scoped to the ELEMENT the canonicalization applies to, not the file. Comments are
      // excluded because `getText()` on the className initializer returns only that
      // expression, and a token boundary is required or `max-w-confirm-box` would be
      // satisfied by a longer canonical utility that merely starts with it.
      const src = unconditionalClassLiterals(raw, file, testId);
      expect(
        src,
        `${file} has no JSX element with data-testid="${testId}" — the target this ${id} token ` +
          "assertion is about has moved or been renamed, so the assertion is not binding anything.",
      ).not.toBeNull();
      if (src === null) return;
      const hasToken = (needle: string): boolean =>
        new RegExp(
          `(^|[\\s"'\`])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s"'\`]|$)`,
        ).test(src);
      expect(
        hasToken(utility),
        `${file} no longer contains \`${utility}\`. The token assertions in this file prove what ` +
          `that utility RESOLVES to; they prove nothing if the site stopped using it. A rebase ` +
          `that swapped it for a different canonical utility would leave every other ${id} ` +
          `assertion green while changing the rendered constraint.`,
      ).toBe(true);
      expect(
        hasToken(replaced),
        `${file} still contains the pre-canonicalization form \`${replaced}\`, which spec §6 ${id} ` +
          "replaced.",
      ).toBe(false);
    },
  );

  it("C5: --spacing-right-now-min-h is defined once — the single token BOTH spellings reference", () => {
    const values = declarationsOf(css, "--spacing-right-now-min-h");
    expect(
      values.length,
      "`min-h-(--spacing-right-now-min-h)` and `min-h-right-now-min-h` are two spellings of " +
        "the SAME token, which is what makes C5 an identity. Two definitions would mean the " +
        "arrow form and the utility could resolve to different values.",
    ).toBe(1);
    // The RightNowHero 176px card height is a ratified invariant (app/globals.css §
    // "right-now" block), so the value is pinned too, not just the cardinality.
    expect(values).toEqual(["176px"]);
  });
});
