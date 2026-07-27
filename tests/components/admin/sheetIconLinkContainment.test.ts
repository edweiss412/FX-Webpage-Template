/**
 * tests/components/admin/sheetIconLinkContainment.test.ts
 *
 * Containment guard for the sheet-link phrase (sheet-icon-link spec §7.10) —
 * the adoption catcher that closes BL-HEADER-LINK-AFFORDANCE-CLASS's drift
 * class. The aria phrase "Open the source sheet" may exist in EXACTLY these
 * files at EXACTLY these occurrence counts:
 *
 *   - components/admin/SheetIconLink.tsx (2 — the subject and fallback label
 *     literals; every icon-only sheet link must delegate here)
 *   - components/admin/wizard/Step3SheetCard.tsx (1 — the ratified text-link
 *     variant, spec §1.5: visible words carry the affordance)
 *   - components/admin/wizard/step3ReviewSections.tsx (1 — the agenda
 *     error-state text link, spec §1.11: visible words carry the affordance)
 *
 * SET-EQUALITY with per-file counts, not an allowlist: a re-inlined anchor in
 * a NEW file adds a row; one inside an allowlisted file bumps its count. Both
 * fail. Comments count too (deliberate — a label-quoting comment re-seeds the
 * drift the next time someone copies it; reword instead, see spec §4.3).
 *
 * Filesystem-walked, never a named file list, so a new file cannot dodge the
 * walk. Since r10 the walked set is the FULL REPOSITORY: every file with a
 * source extension anywhere in the tree, skipping only dot-directories,
 * non-compile artifact dirs (node_modules, coverage, test-results,
 * playwright-report) and the tsconfig-`exclude`d fixture trees (which
 * deliberately contain planted violations; the shipped-tree no-tests-import
 * rule below closes their import channel). r10 found that the r9 surface —
 * tsconfig `fileNames` ∪ a js/jsx/mdx walk of the UI trees — still omitted
 * every non-TS extension outside components/ and app/ (tsconfig's include
 * globs name only ts/tsx/mts despite allowJs), so `lib/sheetLinkAlias.mjs`
 * was an alias laundry the scan never visited. A raw directory walk has no
 * include-glob blind spot by construction; the tsconfig `exclude` list is
 * still read live so fixture-tree edits stay tracked.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";

const PHRASE = "Open the source sheet";

const EXPECTED: Record<string, number> = {
  "components/admin/SheetIconLink.tsx": 2,
  "components/admin/wizard/Step3SheetCard.tsx": 1,
  "components/admin/wizard/step3ReviewSections.tsx": 1,
  // Test files quoting the phrase as assertion material (r9 — the walk now
  // covers the whole repository, so these pin like everything else; a new
  // assertion legitimately bumps its row here).
  "tests/components/a11y/newTabAnnouncementBehavior.test.tsx": 2,
  "tests/components/admin/sheetIconLink.test.tsx": 4,
  "tests/components/admin/sheetIconLinkContainment.test.ts": 2,
  "tests/components/admin/showpage/publishedReviewModal.test.tsx": 3,
  "tests/components/admin/wizard/Step3ReviewModal.test.tsx": 6,
};

// .js/.jsx included (r7): tsconfig sets allowJs, so a plain-JS consumer is a
// legal compile target and must not dodge either scan. .mts/.cts/.mdx and the
// live root mdx-components.tsx joined in r8; r10 walks them repo-wide.
const SOURCE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".mdx"];

// Build/report artifact trees — never compile inputs. Dot-directories are
// skipped wholesale (VCS, editor, CI metadata, .next* build output).
const ARTIFACT_DIRS = new Set(["node_modules", "coverage", "test-results", "playwright-report"]);

/** tsconfig's `exclude` — read live so fixture-tree edits stay tracked. */
function tsconfigExcludes(root: string): string[] {
  const raw = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  if (raw.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, "\n"));
  }
  return (raw.config as { exclude?: string[] }).exclude ?? [];
}

/**
 * The scanned surface (r10): a full-repository walk of every source-extension
 * file. No include-glob dependence — tsconfig `fileNames` proved twice (r9
 * roots, r10 extensions) to be narrower than what Next actually compiles.
 */
function walkedFiles(root: string): string[] {
  const excludes = tsconfigExcludes(root);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = full.slice(root.length + 1);
      if (excludes.some((e) => rel === e || rel.startsWith(`${e}/`))) continue;
      if (statSync(full).isDirectory()) {
        if (entry.startsWith(".") || ARTIFACT_DIRS.has(entry)) continue;
        walk(full);
      } else if (SOURCE_EXTS.some((ext) => entry.endsWith(ext))) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/**
 * Whole-diff r5; TS-AST since r7; DEFAULT-DENY since r8. The component's own
 * token set is pinned by set-equality in the unit suite, but that covers only
 * what SheetIconLink renders — a NEW consumer passing colour/size/hit-area
 * utilities through `className` (the prop is contractually positional-only)
 * would ship an off-contract skin with no guard failing.
 *
 * Three generations of this checker (two regex, one enumerated-AST) were each
 * shown fail-open on the NEXT round's alias spelling, so the rule is now
 * inverted from enumeration to default-deny, which closes the class by
 * construction rather than by list:
 *
 *   Every reference to the identifier `SheetIconLink` outside the component's
 *   own file must be one of exactly THREE sanctioned shapes — (1) an
 *   un-renamed `import { SheetIconLink }` specifier, (2) the tag name of a
 *   JSX element whose attributes satisfy the className contract, or (3) a
 *   `typeof SheetIconLink` type query (r9 — type space is erased at compile;
 *   no runtime alias can come out of it). ANY other reference — assignment,
 *   destructuring, parameter default, parenthesized or `as`-wrapped
 *   initializer, object property, default export, export clause, property
 *   access, argument position, anything — is a violation.
 *
 *   Independently, any touch of the component MODULE outside the sanctioned
 *   named import is a violation: import/export declarations, `import()`,
 *   `require()`, and `import =` forms all count, and the specifier is
 *   compared after stripping a resolvable extension and a trailing `/index`
 *   (r10 — `"…/SheetIconLink.js"` resolves to the .tsx under bundler
 *   resolution but dodged a bare `endsWith` check).
 *
 * Why this exhausts the static vector: creating ANY alias requires either
 * referencing the identifier (denied outside the three shapes) or importing
 * the module by path (denied outside the sanctioned form), so a downstream
 * `<X className=…>` cannot come into existence without the alias-creating
 * file failing first. Identifier and string escapes (`SheetIconLink`)
 * normalize in the AST's `.text`, so parsing catches them — the r10 hole was
 * the raw-text PREFILTER skipping the parse; it now also parses any file
 * containing a `\u`/`\x` escape spelling (contiguous fragments only, per the
 * prefilter-soundness rule). Runtime indirection (`React.createElement`,
 * computed specifiers) is out of a static guard's reach by construction and
 * explicitly out of scope.
 *
 * className contract at the JSX tag: no spread attribute; `className`, when
 * present, is a plain string literal; every token matches the closed
 * positional allowlist (non-negative margin 0-3 in half steps + order
 * utilities). `.mdx` files are checked by raw substring — MDX is not TSX, and
 * no MDX surface has a sanctioned use — and an escape spelling in MDX is
 * flagged as suspect for the same prefilter-soundness reason.
 *
 * tests/ carve (r9, attribute contract ONLY; ROOT-ANCHORED since r10 — a
 * segment match handed the carve to a hypothetical `app/tests/page.tsx`,
 * which is a real route): a file under the repo-root tests/ tree may render
 * the tag with spreads / non-literal className — its JSX reaches jsdom,
 * never a user, and the unit suite's render helper needs `{...overrides}` to
 * probe the contract itself. The identifier and module-path rules still bind
 * in full there, so a test file cannot mint an alias for a shipped consumer
 * to launder through; only the at-tag attribute checks are relaxed.
 *
 * Shipped-tree import boundary (r10): the carve's premise is that tests/ code
 * cannot ship — so shipped runtime trees (app/, components/, lib/, and
 * root-level compiled files) must not import ANY module under tests/, or a
 * carved off-contract wrapper could reach a user via a consumer that mentions
 * neither the identifier nor the component path. scripts/ and other tooling
 * trees are exempt (they import e2e helpers legitimately and never bundle
 * into the app).
 */
const POSITIONAL =
  /^(?:sm:|md:|lg:)?(?:m[lrtb]-(?:0(?:\.5)?|1(?:\.5)?|2(?:\.5)?|3)|order-(?:\d|first|last|none))$/;

const NAME = "SheetIconLink";
const COMPONENT_FILE = `components/admin/${NAME}.tsx`;

/** Strip a resolvable extension and trailing /index before suffix-matching. */
function normalizeSpecifier(spec: string): string {
  return spec.replace(/\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/, "").replace(/\/index$/, "");
}

/** Root-relative resolution of a specifier, or null for bare packages. */
function resolveSpecifier(spec: string, fromRel: string): string | null {
  if (spec.startsWith("@/")) return posix.normalize(spec.slice(2));
  if (spec.startsWith(".")) return posix.normalize(posix.join(posix.dirname(fromRel), spec));
  return null;
}

/** Shipped runtime surface: app/, components/, lib/, root-level compiled files. */
function isShippedTree(fileName: string): boolean {
  return !fileName.includes("/") || /^(?:app|components|lib)\//.test(fileName);
}

function classNameViolations(src: string, fileName = "probe.tsx"): string[] {
  const out: string[] = [];
  if (fileName.endsWith(".mdx") || fileName.endsWith(".md")) {
    if (src.includes(NAME)) out.push(`${NAME} referenced in MDX — no sanctioned MDX use exists`);
    else if (/\\[ux]/.test(src))
      out.push("escape spelling in MDX — cannot be cleared by raw scan; no sanctioned MDX use");
    return out;
  }
  // tests/ carve — attribute contract only, ROOT-ANCHORED (r10); see header.
  // Alias rules below (identifier + module path) are NOT relaxed.
  const attributeContractRelaxed = /^tests\//.test(fileName);
  const shippedTree = isShippedTree(fileName);
  const kind = /\.(ts|mts|cts)$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, kind);
  const snip = (node: ts.Node) => src.slice(node.getStart(sf), node.getStart(sf) + 100);

  const checkTagAttributes = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): void => {
    for (const attr of node.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attr)) {
        out.push(`spread attribute on ${NAME} (could smuggle className): ${snip(node)}`);
        continue;
      }
      if (!ts.isJsxAttribute(attr) || attr.name.getText(sf) !== "className") continue;
      const init = attr.initializer;
      if (init === undefined || !ts.isStringLiteral(init)) {
        out.push(`non-literal className in: ${snip(node)}`);
        continue;
      }
      for (const tok of init.text.split(/\s+/).filter(Boolean)) {
        if (!POSITIONAL.test(tok))
          out.push(`off-contract className token "${tok}" in: ${snip(node)}`);
      }
    }
  };

  // Every syntactic form that touches a module by string-literal specifier
  // (r10 — import/export declarations alone left require()/import()/import=
  // as unscanned channels to both the component module and tests/).
  const specifierOf = (node: ts.Node): ts.StringLiteral | null => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      return node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments.length > 0 &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    )
      return node.arguments[0];
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    )
      return node.moduleReference.expression;
    return null;
  };

  const visit = (node: ts.Node): void => {
    const spec = specifierOf(node);
    if (spec !== null) {
      // Module-path rule: the component module may ONLY be touched by the
      // sanctioned named import. Any other touch of that path fails.
      if (normalizeSpecifier(spec.text).endsWith(NAME)) {
        const sanctioned =
          ts.isImportDeclaration(node) &&
          node.importClause?.name === undefined && // no default import
          node.importClause?.namedBindings !== undefined &&
          ts.isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.every(
            (el) => el.propertyName === undefined && el.name.text === NAME,
          );
        if (!sanctioned)
          out.push(`unsanctioned import/export of the ${NAME} module: ${snip(node)}`);
      }
      // Shipped-tree import boundary (r10): shipped runtime code may not
      // import from tests/ at all — the carve's soundness depends on it.
      if (shippedTree) {
        const resolved = resolveSpecifier(spec.text, fileName);
        if (resolved !== null && (resolved === "tests" || resolved.startsWith("tests/"))) {
          out.push(`shipped file imports from tests/ (carve laundering channel): ${snip(node)}`);
        }
      }
    }
    // Identifier rule, default-deny: outside the three sanctioned shapes,
    // any occurrence of the identifier is a violation.
    if (ts.isIdentifier(node) && node.text === NAME) {
      const p = node.parent;
      const sanctionedImport =
        p !== undefined &&
        ts.isImportSpecifier(p) &&
        p.propertyName === undefined &&
        p.name === node;
      const sanctionedJsxTag =
        p !== undefined &&
        (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) &&
        p.tagName === node;
      // `typeof SheetIconLink` — pure type space, erased at compile, cannot
      // produce a runtime alias (r9).
      const sanctionedTypeQuery = p !== undefined && ts.isTypeQueryNode(p) && p.exprName === node;
      if (sanctionedJsxTag && !ts.isJsxClosingElement(p) && !attributeContractRelaxed) {
        checkTagAttributes(p);
      } else if (!sanctionedImport && !sanctionedJsxTag && !sanctionedTypeQuery) {
        out.push(
          `unsanctioned reference to ${NAME} (aliases defeat this guard): ${snip(p ?? node)}`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * Parse gate for the live scan. Raw-text prefilters must use only CONTIGUOUS
 * match fragments: `SheetIconLink` (identifier or module path — creating a
 * static alias requires one of them), `\u`/`\x` (the only spellings that can
 * hide the name from a raw scan; escapes normalize during parse), and, for
 * shipped trees, `tests/` (every specifier that can resolve into tests/
 * contains it literally — tsconfig's only alias is `@/*` → `./*`).
 */
function needsParse(src: string, rel: string): boolean {
  if (src.includes(NAME) || /\\[ux]/.test(src)) return true;
  return isShippedTree(rel) && src.includes("tests/");
}

describe("sheet-link phrase containment (spec §7.10)", () => {
  it("per-file occurrence counts equal the pinned set exactly", () => {
    const root = join(__dirname, "..", "..", "..");
    const found: Record<string, number> = {};
    const files = walkedFiles(root);
    for (const file of files) {
      const rel = file.slice(root.length + 1);
      const count = readFileSync(file, "utf8").split(PHRASE).length - 1;
      if (count > 0) found[rel] = count;
    }
    expect(found).toEqual(EXPECTED);
  });

  it("className checker flags off-contract tokens and non-literal expressions (negative plants)", () => {
    expect(
      classNameViolations(
        '<SheetIconLink href="x" subjectLabel="y" testId="t" ringOffset="bg" className="size-tap-min text-text-subtle" />',
      ),
    ).toHaveLength(2);
    expect(classNameViolations("<SheetIconLink className={dynamic} />")).toHaveLength(1);
    expect(classNameViolations("<SheetIconLink className={`mr-0.5 ${x}`} />")).toHaveLength(1);
    // r6 forms: spread, renamed import, negative margin, arbitrary value, self-*
    expect(classNameViolations('<SheetIconLink {...props} className="mr-0.5" />')).toHaveLength(1);
    expect(
      classNameViolations(
        'import { SheetIconLink as Link } from "@/components/admin/SheetIconLink";',
      ).length,
    ).toBeGreaterThan(0);
    expect(classNameViolations('<SheetIconLink className="-mr-3.5" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="mr-[-14px]" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="self-stretch" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="mr-4" />')).toHaveLength(1);
    // r7 forms: namespace import, star re-export, re-export rename, variable
    // alias, qualified tag, multi-line attributes, .js consumer
    expect(
      classNameViolations('import * as Icons from "@/components/admin/SheetIconLink";'),
    ).toHaveLength(1);
    expect(classNameViolations('export * from "@/components/admin/SheetIconLink";')).toHaveLength(
      1,
    );
    expect(
      classNameViolations(
        'export { SheetIconLink as SheetLink } from "@/components/admin/SheetIconLink";',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      classNameViolations(
        'import { SheetIconLink } from "@/components/admin/SheetIconLink";\nconst X = SheetIconLink;',
      ),
    ).toHaveLength(1);
    expect(classNameViolations('<Icons.SheetIconLink className="size-5" />')).toHaveLength(1);
    // r8 forms — every remaining static alias/rebinding spelling falls to the
    // default-deny identifier rule, no per-form logic:
    expect(classNameViolations("X = SheetIconLink;")).toHaveLength(1);
    expect(classNameViolations("function f(C = SheetIconLink) {}")).toHaveLength(1);
    expect(classNameViolations("const { SheetIconLink: C } = m;")).toHaveLength(1);
    expect(classNameViolations("const X = (SheetIconLink);")).toHaveLength(1);
    expect(classNameViolations("const X = SheetIconLink as unknown;")).toHaveLength(1);
    expect(classNameViolations("const o = { C: SheetIconLink };")).toHaveLength(1);
    expect(classNameViolations("export default SheetIconLink;")).toHaveLength(1);
    expect(
      classNameViolations('export * as Icons from "@/components/admin/SheetIconLink";'),
    ).toHaveLength(1);
    expect(classNameViolations("<SheetIconLink />", "page.mdx")).toHaveLength(1);
    expect(
      classNameViolations('<SheetIconLink\n  ringOffset="bg"\n  className="text-text-subtle"\n/>'),
    ).toHaveLength(1);
    expect(
      classNameViolations('<SheetIconLink className="text-red-500" />', "consumer.jsx"),
    ).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="sm:order-1 sm:ml-0.5" />')).toHaveLength(
      0,
    );
    expect(classNameViolations('<SheetIconLink className="mr-0.5" />')).toHaveLength(0);
    expect(classNameViolations('<SheetIconLink className="mr-0.5">x</SheetIconLink>')).toHaveLength(
      0,
    );
    expect(classNameViolations('<SheetIconLink ringOffset="bg" />')).toHaveLength(0);
    expect(
      classNameViolations('import { SheetIconLink } from "@/components/admin/SheetIconLink";'),
    ).toHaveLength(0);
    // r9 forms — type query is sanctioned (type space, no runtime alias):
    expect(
      classNameViolations(
        'import { SheetIconLink } from "@/components/admin/SheetIconLink";\ntype P = React.ComponentProps<typeof SheetIconLink>;',
      ),
    ).toHaveLength(0);
    // r9 tests/ carve — attribute contract relaxed there…
    expect(
      classNameViolations(
        "<SheetIconLink {...overrides} className={dynamic} />",
        "tests/components/admin/probe.test.tsx",
      ),
    ).toHaveLength(0);
    // …but alias creation is NOT: identifier and module-path rules bind.
    expect(
      classNameViolations("const X = SheetIconLink;", "tests/components/admin/probe.test.tsx"),
    ).toHaveLength(1);
    expect(
      classNameViolations(
        'export { SheetIconLink as X } from "@/components/admin/SheetIconLink";',
        "tests/components/admin/probe.test.tsx",
      ).length,
    ).toBeGreaterThan(0);
    // r10 forms — escape spellings normalize in the AST, so the parse catches
    // them (the prefilter change is what guarantees the parse happens):
    expect(
      classNameViolations(
        'import { Sheet\\u0049conLink as X } from "@/components/admin/Sheet\\u0049conLink";',
      ).length,
    ).toBeGreaterThan(0);
    // r10 — extension-suffixed specifier resolves to the component under
    // bundler resolution but dodged a bare endsWith:
    expect(
      classNameViolations('export * from "@/components/admin/SheetIconLink.js";'),
    ).toHaveLength(1);
    expect(
      classNameViolations('export * from "@/components/admin/SheetIconLink/index";'),
    ).toHaveLength(1);
    // r10 — string-literal imported name is not an Identifier node:
    expect(
      classNameViolations(
        'import { "SheetIconLink" as X } from "@/components/admin/SheetIconLink";',
      ).length,
    ).toBeGreaterThan(0);
    // r10 — require / dynamic import / import= are module touches too:
    expect(
      classNameViolations('const m = require("@/components/admin/SheetIconLink");'),
    ).toHaveLength(1);
    expect(
      classNameViolations('const p = import("@/components/admin/SheetIconLink.js");'),
    ).toHaveLength(1);
    expect(
      classNameViolations('import m = require("@/components/admin/SheetIconLink");', "probe.ts"),
    ).toHaveLength(1);
    // r10 — the carve is root-anchored: app/tests/ is a real route tree.
    expect(classNameViolations("<SheetIconLink {...p} />", "app/tests/page.tsx")).toHaveLength(1);
    // r10 — shipped trees may not import from tests/ (any specifier shape):
    expect(
      classNameViolations(
        'import { OffContract } from "@/tests/helpers/OffContract";',
        "components/admin/consumer.tsx",
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations(
        'import { OffContract } from "../../tests/helpers/OffContract";',
        "components/admin/consumer.tsx",
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations('const h = require("@/tests/helpers/x");', "lib/consumer.ts"),
    ).toHaveLength(1);
    // …tooling trees stay exempt, and tests/ importing tests/ is fine:
    expect(
      classNameViolations(
        'import { signInAs } from "@/tests/e2e/helpers/signInAs";',
        "scripts/help-screenshots.ts",
      ),
    ).toHaveLength(0);
    expect(
      classNameViolations(
        'import { helper } from "@/tests/helpers/x";',
        "tests/components/probe.test.tsx",
      ),
    ).toHaveLength(0);
    // MDX escape spellings cannot be cleared by a raw scan — flagged:
    expect(classNameViolations("hidden \\u0049 escape", "page.mdx")).toHaveLength(1);
  });

  it("walked surface covers every source extension in every root, not just the compile globs (r10)", () => {
    const root = join(__dirname, "..", "..", "..");
    const files = walkedFiles(root);
    const rels = new Set(files.map((f) => f.slice(root.length + 1)));
    // r9 escape: a static alias parked in lib/ (or tests/, scripts/,
    // app/api/) was never visited. r10 escape: a non-TS extension outside
    // the UI trees (tsconfig's include globs name only ts/tsx/mts). Pin both
    // classes via known real files, so a scope regression fails here even
    // before anyone plants an alias.
    expect(rels.has("lib/email/canonicalize.ts")).toBe(true);
    expect(rels.has("tests/components/admin/sheetIconLinkContainment.test.ts")).toBe(true);
    expect(rels.has("scripts/codex-guard.mjs")).toBe(true);
    expect(rels.has("eslint.config.mjs")).toBe(true);
    expect(rels.has("postcss.config.mjs")).toBe(true);
    expect(rels.has("mdx-components.tsx")).toBe(true);
    expect([...rels].some((r) => r.startsWith("app/api/"))).toBe(true);
    expect([...rels].some((r) => r.startsWith("supabase/"))).toBe(true);
    // Non-compile trees stay out.
    expect([...rels].some((r) => r.includes("node_modules/"))).toBe(false);
    expect([...rels].some((r) => r.startsWith("tests/cross-cutting/fixtures/auth-x3"))).toBe(false);
    expect([...rels].some((r) => r.startsWith(".next"))).toBe(false);
  });

  it("every live SheetIconLink call site keeps className positional-only string literals", () => {
    const root = join(__dirname, "..", "..", "..");
    const files = walkedFiles(root);
    const violations = files.flatMap((file) => {
      const rel = file.slice(root.length + 1);
      // The component's own file defines and exports the identifier — it is
      // the one place declaration references are the point, not an alias.
      if (rel === COMPONENT_FILE) return [];
      // Prefilter (see needsParse): a file that contains neither the bare
      // name, an escape spelling, nor (shipped trees) a tests/ fragment can
      // neither create a static alias nor launder through the carve.
      const src = readFileSync(file, "utf8");
      if (!needsParse(src, rel)) return [];
      return classNameViolations(src, rel).map((v) => `${rel}: ${v}`);
    });
    expect(violations).toEqual([]);
  });
});
