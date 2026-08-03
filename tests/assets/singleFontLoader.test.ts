/**
 * Structural guard — exactly ONE `next/font` loader invocation, in `app/fonts.ts`.
 *
 * `DESIGN.md:133` commits the product to a single family loaded via
 * `next/font/google`. The call lives in `app/fonts.ts` rather than the root
 * layout because Next 16 has TWO roots: `app/global-error.tsx`
 * renders its own `<html>` and replaces the root layout, so it needs the font
 * too, and a second `Inter()` call there would emit a second `@font-face` set
 * under the same family name. Both roots import one shared instance.
 *
 * Two things break the single-family commitment silently, and neither shows up
 * in any behavioral test:
 *
 *   1. **A second loader.** Two loader calls emit two independent `@font-face`
 *      sets. When both are the same family they land under the SAME family name,
 *      so nothing visibly changes. A real crew page was measured registering
 *      seven `Inter` faces from a single loader (2026-08-03 probe); a second
 *      loader compounds that. The browser suite DOES see most of this
 *      (`tests/e2e/font-binding.spec.ts` checks family count, duplicate face
 *      tuples, and one weight+style descriptor pair) — what it cannot see is a
 *      byte-identical second call, which registers indistinguishable faces.
 *   2. **A loader in the wrong layout.** Loading from a route layout instead of
 *      the root binds the font for that subtree only — exactly the state
 *      `BL-HEADER-FONT-FALLBACK-WRAP` was filed against, where crew pages
 *      rendered Inter and every other tree rendered the system fallback.
 *
 * The assertion pins the exact PATH SET and the total INVOCATION COUNT. A count
 * alone cannot see case 2 ("exactly one loader" is satisfied by the pre-fix
 * tree); a path set alone cannot see case 1 within one file.
 *
 * WHY A TYPESCRIPT PARSE AND NOT A REGEX. A line-oriented regex over
 * `const x = Loader(` has escaping mutants, and they are not hypothetical — a
 * cross-model review demonstrated one with a live probe. The mutation families
 * below are the enumerated set this guard is tested against
 * (`docs/agents/writing-plans.md:24`); each has an executable fixture case.
 *
 *   M1  a second loader in a NEW file                    → path-set check
 *   M2  a second NAMED import in the same file           → binding set + count
 *       (`import { Inter, Roboto }`, both invoked)          ← Codex R2 probe
 *   M3  the SAME loader invoked twice                    → count
 *   M4  an ALIASED import (`import { Inter as X }`)      → binding set
 *   M5  a CONST alias (`const F = Inter; F({...})`)      → alias resolution
 *       ← the regex's second escaping mutant
 *   M6  the loader MOVED to another layout               → path-set check
 *   M7  `next/font/local` instead of `next/font/google`  → module prefix match
 *   M8  a DEFAULT import from a next/font module         → binding set
 *   M9  a NAMESPACE import (`import * as f`, `f.Inter()`)→ property-access callee
 *   M10 two invocations on ONE source line               → AST nodes, not lines
 *
 * Review R3 then ran the shipped function in memory and demonstrated eight MORE
 * escaping forms, each now handled and fixtured (handled, not closed — see the
 * residuals section below):
 *
 *   M11 `(Inter)(...)`                  parenthesized callee
 *   M12 `(0, Inter)(...)`               sequence-expression callee
 *   M13 `{ Inter }.Inter(...)`          object-literal member
 *   M14 `Inter.call(...)` / `.apply`    invoked through Function.prototype
 *   M15 `let x; x = Inter; x(...)`      assignment alias
 *   M16 `fonts["Roboto"](...)`          namespace ELEMENT access
 *   M17 `const f2 = fonts; f2.Inter()`  namespace alias
 *   M18 `const { Inter } = fonts`       namespace destructure
 *
 * **WHAT EACH ASSERTION ACTUALLY PROVES — stated precisely after review R5,
 * which was right that an earlier revision overclaimed "closure".**
 *
 *   - **The PATH SET assertion is the strong one, and it is keyed on the IMPORT**
 *     (`hasFontImport`), independently of the invocation counter. Calling a
 *     `next/font` loader requires importing the module, and an import
 *     declaration is static and unaliasable — `Reflect.apply` and every other
 *     exotic call form still need one. So a second loader in a NEW file cannot
 *     hide from the path set, which is the case that motivated this guard.
 *     (Until review R7 the path set was DERIVED from the counter, so it
 *     inherited every one of the counter's blind spots and this property was
 *     claimed but not tested.)
 *   - **The CALL-COUNT assertion is best-effort**, covering the eighteen forms
 *     above. Its residual gap is narrow but real: a second loader call inside
 *     the ONE file already on the allowed path list, invoked through a form not
 *     enumerated. R5 demonstrated `Reflect.apply` doing exactly that.
 *   - **The runtime assertions in `tests/e2e/font-binding.spec.ts` corroborate
 *     rather than close.** They observe what the browser registered — one
 *     family, no duplicate face tuple, one weight descriptor — so they catch a
 *     second loader whose config differs in any of those. They do NOT catch a
 *     byte-identical second call (it would register the same faces), and they
 *     only observe the routes the spec visits.
 *
 * Neither layer is a proof, and the combination is not either. What the pair
 * buys is that every cheap accident is caught statically and every
 * differently-CONFIGURED duplicate is caught at runtime. A byte-identical
 * second call inside this one allowed file registers identical faces and is
 * invisible to both — recorded as the known residual rather than papered over. A new syntactic family
 * is admissible here only with a live escaping mutant demonstrated against the
 * shipped guard, not hypothesized.
 *
 * Spec: docs/superpowers/specs/2026-08-03-app-wide-font-binding.md §4.3
 */
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

const REPO_ROOT = join(__dirname, "..", "..");
const APP_DIR = join(REPO_ROOT, "app");

/** The one file allowed to CALL a font loader. Not `app/layout.tsx`: Next 16 has
 *  two roots, and `app/global-error.tsx` replaces the root layout entirely, so
 *  both need the font. They import ONE shared instance from here rather than
 *  each calling `Inter()`, which would emit two @font-face sets under one
 *  family name. DESIGN.md:133 names app/layout.tsx as the load site; this module
 *  is that load site, hoisted so the second root can share it. */
const CANONICAL_LOADER = "app/fonts.ts";

/** Matches the MODULE, not a font name, so switching family — or to a local
 *  face — still registers as a loader. */
function isFontModule(specifier: string): boolean {
  return specifier === "next/font" || specifier.startsWith("next/font/");
}

/**
 * Every loader invocation in one source file.
 *
 * Resolves, in order: import bindings from a `next/font/*` module (named,
 * aliased, default, and namespace forms), then const aliases of those bindings
 * to a fixpoint, then counts call expressions whose callee resolves into that
 * set. Counting AST call nodes rather than source lines is what makes M10
 * (two invocations on one line) unescapable.
 */
export function countLoaderInvocations(source: string, fileName = "probe.tsx"): number {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const loaderBindings = new Set<string>();
  const namespaceBindings = new Set<string>();

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!isFontModule(stmt.moduleSpecifier.text)) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) loaderBindings.add(clause.name.text); // default import (M8)
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings))
      namespaceBindings.add(bindings.name.text); // M9
    // `element.name` is the LOCAL name in every named form, aliased or not (M2, M4).
    else for (const element of bindings.elements) loaderBindings.add(element.name.text);
  }

  if (loaderBindings.size === 0 && namespaceBindings.size === 0) return 0;

  // Alias resolution to a FIXPOINT, over every form that can rebind a loader to
  // a new name. Review R3 demonstrated escapes through several of these against
  // an earlier version that handled only `const x = Inter`.
  let grew = true;
  while (grew) {
    grew = false;
    const add = (name: string): void => {
      if (!loaderBindings.has(name)) {
        loaderBindings.add(name);
        grew = true;
      }
    };
    const rootsOf = (expr: ts.Expression): boolean => {
      // Does this expression evaluate to a loader? Unwraps the wrappers that
      // change nothing about what is called.
      let e: ts.Expression = expr;
      for (;;) {
        if (ts.isParenthesizedExpression(e)) e = e.expression;
        else if (ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
        else if (ts.isNonNullExpression(e)) e = e.expression;
        // `(0, Inter)` — the sequence's VALUE is its last operand.
        else if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken)
          e = e.right;
        else break;
      }
      if (ts.isIdentifier(e)) return loaderBindings.has(e.text);
      // `fonts.Inter`, `fonts["Inter"]` — a namespace member — or a member of
      // an object literal that holds a loader (`{ Inter }.Inter`).
      if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
        if (ts.isIdentifier(e.expression)) return namespaceBindings.has(e.expression.text);
        return rootsOf(e.expression);
      }
      // `{ Inter }.Inter` is handled by the property-access branch above once its
      // object is not an identifier; an object literal holding a loader is
      // treated as a loader-valued expression.
      if (ts.isObjectLiteralExpression(e)) {
        return e.properties.some(
          (prop) =>
            (ts.isShorthandPropertyAssignment(prop) && loaderBindings.has(prop.name.text)) ||
            (ts.isPropertyAssignment(prop) && rootsOf(prop.initializer)),
        );
      }
      return false;
    };
    const visitAlias = (node: ts.Node): void => {
      // `const x = <loader>` / `let x = <loader>`
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name) && rootsOf(node.initializer)) add(node.name.text);
        // `const { Inter } = fonts` / `const { Inter: F } = fonts`
        else if (
          ts.isObjectBindingPattern(node.name) &&
          ts.isIdentifier(node.initializer) &&
          namespaceBindings.has(node.initializer.text)
        ) {
          for (const element of node.name.elements) {
            if (ts.isIdentifier(element.name)) add(element.name.text);
          }
        }
      }
      // `x = Inter` (mutable alias, assigned after declaration)
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        rootsOf(node.right)
      ) {
        add(node.left.text);
      }
      // `const f2 = fonts` (namespace alias)
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        namespaceBindings.has(node.initializer.text) &&
        !namespaceBindings.has(node.name.text)
      ) {
        namespaceBindings.add(node.name.text);
        grew = true;
      }
      ts.forEachChild(node, visitAlias);
    };
    ts.forEachChild(sf, visitAlias);

    let invocations = 0;
    const visitCall = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee: ts.Expression = node.expression;
        // `Inter.call(...)` / `Inter.apply(...)` invoke Inter, not a method of it.
        if (
          ts.isPropertyAccessExpression(callee) &&
          (callee.name.text === "call" || callee.name.text === "apply") &&
          rootsOf(callee.expression)
        ) {
          invocations += 1;
          ts.forEachChild(node, visitCall);
          return;
        }
        if (rootsOf(callee)) invocations += 1;
      }
      ts.forEachChild(node, visitCall);
    };
    ts.forEachChild(sf, visitCall);
    if (!grew) return invocations;
  }
  return 0;
}

/**
 * Does this file IMPORT from a `next/font/*` module at all?
 *
 * Deliberately independent of `countLoaderInvocations`. Review R7 caught the
 * path set being derived from the invocation count, which silently inherited
 * every one of the counter's blind spots: an exotic call form in a NEW file
 * (`Reflect.apply(Inter, …)`) counted 0 and therefore vanished from the path
 * set too — so the documented "an import cannot hide" property was not the
 * property being tested.
 *
 * This one IS that property. Calling a loader requires importing the module,
 * and an import declaration is static and unaliasable: there is no call syntax
 * that removes it. So the path set below holds regardless of how the call is
 * written.
 */
export function hasFontImport(source: string, fileName = "probe.tsx"): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return sf.statements.some(
    (stmt) =>
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      isFontModule(stmt.moduleSpecifier.text),
  );
}

function toRepoRelative(absolute: string): string {
  return relative(REPO_ROOT, absolute).split(sep).join("/");
}

describe("single next/font loader — live tree", () => {
  const appFiles = walkSourceFiles([APP_DIR]);

  it("the walk actually reached the app tree", () => {
    // Anti-vacuity: an empty walk satisfies every assertion below trivially,
    // and the guard would silently protect nothing.
    expect(appFiles.length, "walkSourceFiles found source files under app/").toBeGreaterThan(20);
    expect(appFiles.map(toRepoRelative)).toContain(CANONICAL_LOADER);
  });

  it("exactly one file under app/ calls a font loader, and it is the shared module", () => {
    // Keyed on the IMPORT, not on a successful invocation count — see
    // hasFontImport. This is the assertion that actually cannot be evaded by
    // call syntax.
    const loaders = appFiles
      .filter((file) => hasFontImport(readFileSync(file, "utf8"), file))
      .map(toRepoRelative);

    // toEqual on the SET, not a length check: a length check passes on a tree
    // whose single loader lives in the wrong layout — the pre-fix state this
    // guard exists to reject (M6).
    expect(
      loaders,
      `only ${CANONICAL_LOADER} may load a font (DESIGN.md:133 — one family, ` +
        `loaded at the root so every tree inherits it)`,
    ).toEqual([CANONICAL_LOADER]);
  });

  it("the whole app tree invokes a font loader exactly once", () => {
    const total = appFiles.reduce(
      (sum, file) => sum + countLoaderInvocations(readFileSync(file, "utf8"), file),
      0,
    );
    expect(
      total,
      "one loader invocation across app/ — a second emits a duplicate @font-face " +
        "set under the same family name, invisibly",
    ).toBe(1);
  });
});

describe("single next/font loader — mutation families", () => {
  const BASE = `import { Inter } from "next/font/google";\nconst inter = Inter({ subsets: ["latin"] });\nexport default function L({ children }: { children: unknown }) { return children; }\n`;

  it("baseline: the real shape counts exactly one", () => {
    expect(countLoaderInvocations(BASE)).toBe(1);
  });

  it("a destructured-props function declaration is NOT a loader call", () => {
    // The defect that made an earlier regex version of this guard pass
    // vacuously: `export default function RootLayout({` matched it.
    expect(
      countLoaderInvocations(
        `export default function RootLayout({ children }: { children: unknown }) { return children; }\n`,
      ),
    ).toBe(0);
  });

  it("M2 — a second named import from the same module, both invoked", () => {
    expect(
      countLoaderInvocations(
        `import { Inter, Roboto } from "next/font/google";\n` +
          `const a = Inter({ subsets: ["latin"] });\nconst b = Roboto({ subsets: ["latin"] });\n`,
      ),
    ).toBe(2);
  });

  it("M3 — the same loader invoked twice", () => {
    expect(
      countLoaderInvocations(
        `import { Inter } from "next/font/google";\n` +
          `const a = Inter({ subsets: ["latin"] });\nconst b = Inter({ subsets: ["cyrillic"] });\n`,
      ),
    ).toBe(2);
  });

  it("M4 — an aliased import", () => {
    expect(
      countLoaderInvocations(
        `import { Inter as Face } from "next/font/google";\nconst a = Face({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M5 — a const alias chain", () => {
    expect(
      countLoaderInvocations(
        `import { Inter } from "next/font/google";\n` +
          `const F = Inter;\nconst G = F;\nconst a = G({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M6 — the pre-change crew-layout shape is seen as a loader", () => {
    // The exact topology this guard exists to reject, verbatim from
    // app/show/[slug]/layout.tsx before this change. If the counter returned 0
    // here, the live path-set assertion would have been GREEN on the broken
    // tree and the guard would never have gone RED.
    const PRE_CHANGE_CREW_LAYOUT = `import type { ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default function ShowLayout({ children }: { children: ReactNode }) {
  return (
    <div data-testid="page-shell" className={\`\${inter.variable} flex min-h-screen flex-col\`}>
      {children}
    </div>
  );
}
`;
    expect(countLoaderInvocations(PRE_CHANGE_CREW_LAYOUT, "layout.tsx")).toBe(1);
  });

  it("M7 — next/font/local counts too", () => {
    expect(
      countLoaderInvocations(
        `import localFont from "next/font/local";\nconst a = localFont({ src: "./x.woff2" });\n`,
      ),
    ).toBe(1);
  });

  it("M9 — a namespace import invoked by property access", () => {
    expect(
      countLoaderInvocations(
        `import * as fonts from "next/font/google";\nconst a = fonts.Inter({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M10 — two invocations on ONE source line", () => {
    expect(
      countLoaderInvocations(
        `import { Inter, Roboto } from "next/font/google";\n` +
          `const a = Inter({ subsets: ["latin"] }), b = Roboto({ subsets: ["latin"] });\n`,
      ),
    ).toBe(2);
  });

  it("M11 — parenthesized callee", () => {
    expect(
      countLoaderInvocations(
        `import { Inter } from "next/font/google";\nconst a = (Inter)({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M12 — sequence-expression callee", () => {
    expect(
      countLoaderInvocations(
        `import { Inter } from "next/font/google";\nconst a = (0, Inter)({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M13 — object-literal member", () => {
    expect(
      countLoaderInvocations(
        `import { Inter } from "next/font/google";\nconst a = { Inter }.Inter({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M14 — invoked through Function.prototype.call", () => {
    expect(
      countLoaderInvocations(
        `import { Inter } from "next/font/google";\nconst a = Inter.call(null, { subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M15 — assignment alias", () => {
    expect(
      countLoaderInvocations(
        `import { Inter } from "next/font/google";\nlet x;\nx = Inter;\nconst a = x({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M16 — namespace element access", () => {
    expect(
      countLoaderInvocations(
        `import * as fonts from "next/font/google";\nconst a = fonts["Roboto"]({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M17 — namespace alias", () => {
    expect(
      countLoaderInvocations(
        `import * as fonts from "next/font/google";\nconst f2 = fonts;\nconst a = f2.Inter({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("M18 — namespace destructure", () => {
    expect(
      countLoaderInvocations(
        `import * as fonts from "next/font/google";\nconst { Inter } = fonts;\nconst a = Inter({ subsets: ["latin"] });\n`,
      ),
    ).toBe(1);
  });

  it("R3's full escape set: one ordinary loader PLUS each exotic second loader counts 2", () => {
    // The exact shape review R3 probed — the guard reported 1 for every one of
    // these while two loaders executed.
    const seconds = [
      `const b = (Roboto)({ subsets: ["latin"] });`,
      `const b = (0, Roboto)({ subsets: ["latin"] });`,
      `const b = { Roboto }.Roboto({ subsets: ["latin"] });`,
      `const b = Roboto.call(null, { subsets: ["latin"] });`,
      `let z;\nz = Roboto;\nconst b = z({ subsets: ["latin"] });`,
    ];
    for (const second of seconds) {
      const source =
        `import { Inter, Roboto } from "next/font/google";\n` +
        `const a = Inter({ subsets: ["latin"] });\n${second}\n`;
      expect(countLoaderInvocations(source), `escaping form: ${second}`).toBe(2);
    }
  });

  it("an identically-named import from an UNRELATED module is not counted", () => {
    // Guards the other direction: the oracle must key on the module, not on a
    // font-looking identifier, or any `Inter(` in the tree would trip it.
    expect(
      countLoaderInvocations(
        `import { Inter } from "@/lib/not-a-font";\nconst a = Inter({ subsets: ["latin"] });\n`,
      ),
    ).toBe(0);
  });
});

describe("the path set is keyed on the import, not the call", () => {
  it("an exotic call form in a new file is still visible to the path set", () => {
    // Review R7's escape: the counter reports 0 for this, so a path set derived
    // FROM the counter would not see the file at all. The import-keyed one does,
    // which is the whole point of separating them.
    const escaping =
      `import { Inter } from "next/font/google";\n` +
      `export const second = Reflect.apply(Inter, null, [{ subsets: ["latin"] }]);\n`;
    expect(countLoaderInvocations(escaping), "the counter's admitted blind spot").toBe(0);
    expect(hasFontImport(escaping), "the import is still plainly visible").toBe(true);
  });

  it("a file with no next/font import is not in the path set", () => {
    expect(hasFontImport(`import { Inter } from "@/lib/not-a-font";\nconst a = Inter({});\n`)).toBe(
      false,
    );
  });
});
