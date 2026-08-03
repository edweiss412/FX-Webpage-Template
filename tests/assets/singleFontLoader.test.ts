/**
 * Structural guard — exactly ONE `next/font` loader invocation, in the root layout.
 *
 * `DESIGN.md:133` commits the product to a single family loaded via
 * `next/font/google` in `app/layout.tsx`. Two things break that silently, and
 * neither shows up in any behavioral test:
 *
 *   1. **A second loader.** Two loader calls emit two independent `@font-face`
 *      sets. When both are the same family they land under the SAME family name,
 *      so nothing visibly changes while the document carries a duplicate set. A
 *      real crew page was measured registering seven `Inter` faces from a single
 *      loader (2026-08-03 probe); a second loader compounds that invisibly.
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
 * below are the enumerated closure set this guard converges against
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
 * A new family is admissible only with a live escaping mutant demonstrated
 * against this guard, not hypothesized.
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

/** The one file allowed to load a font, per `DESIGN.md:133`. */
const CANONICAL_LOADER = "app/layout.tsx";

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
    // `import localFont from "next/font/local"` (M8)
    if (clause.name) loaderBindings.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      // `import * as fonts from "next/font/google"` (M9)
      namespaceBindings.add(bindings.name.text);
    } else {
      // `{ Inter }`, `{ Inter, Roboto }` (M2), `{ Inter as X }` (M4).
      // `element.name` is the LOCAL name in every form, which is what a call
      // site can actually reference.
      for (const element of bindings.elements) loaderBindings.add(element.name.text);
    }
  }

  if (loaderBindings.size === 0 && namespaceBindings.size === 0) return 0;

  // Const aliases, to a fixpoint: `const F = Inter;` then later `const G = F;` (M5).
  let grew = true;
  while (grew) {
    grew = false;
    const visitAlias = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        loaderBindings.has(node.initializer.text) &&
        !loaderBindings.has(node.name.text)
      ) {
        loaderBindings.add(node.name.text);
        grew = true;
      }
      ts.forEachChild(node, visitAlias);
    };
    ts.forEachChild(sf, visitAlias);
  }

  let invocations = 0;
  const visitCall = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && loaderBindings.has(callee.text)) invocations += 1;
      else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        namespaceBindings.has(callee.expression.text)
      ) {
        invocations += 1;
      }
    }
    ts.forEachChild(node, visitCall);
  };
  ts.forEachChild(sf, visitCall);
  return invocations;
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

  it("exactly one file under app/ loads a font, and it is the root layout", () => {
    const loaders = appFiles
      .filter((file) => countLoaderInvocations(readFileSync(file, "utf8"), file) > 0)
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
