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
 * walk. Walks components/ AND app/ (excluding app/api — no UI there), because
 * an inline anchor in a page/layout would otherwise slip the set-equality
 * (audit P3).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const PHRASE = "Open the source sheet";

const EXPECTED: Record<string, number> = {
  "components/admin/SheetIconLink.tsx": 2,
  "components/admin/wizard/Step3SheetCard.tsx": 1,
  "components/admin/wizard/step3ReviewSections.tsx": 1,
};

// .js/.jsx included (r7): tsconfig sets allowJs, so a plain-JS consumer is a
// legal compile target and must not dodge either scan. .mts/.cts/.mdx and the
// live root mdx-components.tsx joined in r8.
const SOURCE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".mdx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXTS.some((ext) => full.endsWith(ext))) out.push(full);
  }
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
 *   own file must be one of exactly TWO sanctioned shapes — (1) an un-renamed
 *   `import { SheetIconLink }` specifier, or (2) the tag name of a JSX
 *   element whose attributes satisfy the className contract. ANY other
 *   reference — assignment, destructuring, parameter default, parenthesized
 *   or `as`-wrapped initializer, object property, default export, export
 *   clause, property access, argument position, anything — is a violation.
 *
 *   Independently, any import/export whose module specifier resolves to the
 *   component module (path suffix `SheetIconLink`) in a form other than the
 *   sanctioned named import — namespace import, star re-export, `export * as
 *   ns`, renamed re-export, default import — is a violation.
 *
 * Why this exhausts the static vector: creating ANY alias requires either
 * referencing the identifier (denied outside the two shapes) or importing the
 * module by path (denied outside the sanctioned form), so a downstream
 * `<X className=…>` cannot come into existence without the alias-creating
 * file failing first. Runtime indirection (`React.createElement`, computed
 * imports) is out of a static guard's reach by construction and explicitly
 * out of scope.
 *
 * className contract at the JSX tag: no spread attribute; `className`, when
 * present, is a plain string literal; every token matches the closed
 * positional allowlist (non-negative margin 0-3 in half steps + order
 * utilities). `.mdx` files are checked by raw substring — MDX is not TSX, and
 * no MDX surface has a sanctioned use.
 */
const POSITIONAL =
  /^(?:sm:|md:|lg:)?(?:m[lrtb]-(?:0(?:\.5)?|1(?:\.5)?|2(?:\.5)?|3)|order-(?:\d|first|last|none))$/;

const NAME = "SheetIconLink";
const COMPONENT_FILE = `components/admin/${NAME}.tsx`;

function classNameViolations(src: string, fileName = "probe.tsx"): string[] {
  const out: string[] = [];
  if (fileName.endsWith(".mdx") || fileName.endsWith(".md")) {
    if (src.includes(NAME)) out.push(`${NAME} referenced in MDX — no sanctioned MDX use exists`);
    return out;
  }
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

  const visit = (node: ts.Node): void => {
    // Module-path rule: the component module may ONLY be touched by the
    // sanctioned named import. Any other import/export of that path fails.
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.endsWith(NAME)
    ) {
      const sanctioned =
        ts.isImportDeclaration(node) &&
        node.importClause?.name === undefined && // no default import
        node.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(node.importClause.namedBindings) &&
        node.importClause.namedBindings.elements.every(
          (el) => el.propertyName === undefined && el.name.text === NAME,
        );
      if (!sanctioned) out.push(`unsanctioned import/export of the ${NAME} module: ${snip(node)}`);
    }
    // Identifier rule, default-deny: outside the two sanctioned shapes, any
    // occurrence of the identifier is a violation.
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
      if (sanctionedJsxTag && !ts.isJsxClosingElement(p)) {
        checkTagAttributes(p);
      } else if (!sanctionedImport && !sanctionedJsxTag) {
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

describe("sheet-link phrase containment (spec §7.10)", () => {
  it("per-file occurrence counts equal the pinned set exactly", () => {
    const root = join(__dirname, "..", "..", "..");
    const found: Record<string, number> = {};
    const files = [
      ...walk(join(root, "components")),
      ...walk(join(root, "app")).filter((f) => !f.includes("/app/api/")),
    ];
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
  });

  it("every live SheetIconLink call site keeps className positional-only string literals", () => {
    const root = join(__dirname, "..", "..", "..");
    const files = [
      ...walk(join(root, "components")),
      ...walk(join(root, "app")).filter((f) => !f.includes("/app/api/")),
      // Root-level MDX component map is a live consumer surface (r8).
      ...["mdx-components.tsx"].map((f) => join(root, f)).filter((f) => existsSync(f)),
    ];
    const violations = files.flatMap((file) => {
      const rel = file.slice(root.length + 1);
      // The component's own file defines and exports the identifier — it is
      // the one place declaration references are the point, not an alias.
      if (rel === COMPONENT_FILE) return [];
      // Gate on the bare name, not the JSX tag — an alias-creating file may
      // contain no `<SheetIconLink` tag yet must still be flagged. Files with
      // zero occurrences of the name cannot create a static alias (creation
      // requires the identifier or the module path, which contains it).
      const src = readFileSync(file, "utf8");
      if (!src.includes(NAME)) return [];
      return classNameViolations(src, file).map((v) => `${rel}: ${v}`);
    });
    expect(violations).toEqual([]);
  });
});
