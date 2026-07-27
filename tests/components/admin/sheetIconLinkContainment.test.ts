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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const PHRASE = "Open the source sheet";

const EXPECTED: Record<string, number> = {
  "components/admin/SheetIconLink.tsx": 2,
  "components/admin/wizard/Step3SheetCard.tsx": 1,
  "components/admin/wizard/step3ReviewSections.tsx": 1,
};

// .js/.jsx included (r7): tsconfig sets allowJs, so a plain-JS consumer is a
// legal compile target and must not dodge either scan.
const SOURCE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXTS.some((ext) => full.endsWith(ext))) out.push(full);
  }
  return out;
}

/**
 * Whole-diff r5, TS-AST form since r7: the component's own token set is
 * pinned by set-equality in the unit suite, but that covers only what
 * SheetIconLink renders — a NEW consumer passing colour/size/hit-area
 * utilities through `className` (the prop is contractually positional-only:
 * order/margin) would ship an off-contract skin with no guard failing.
 *
 * Two regex generations of this checker were each shown fail-open on the next
 * round's spelling (spreads/aliases in r6; namespace + re-export + variable
 * aliases, qualified JSX tags, and multi-line attribute forms in r7), so the
 * checker now parses with the TypeScript AST — the same escalation the
 * stripComments precedent (`tests/_shared/stripComments.ts`) records for
 * lexical scanners. Enforced per file:
 *   - the ONLY permitted binding is `import { SheetIconLink }` un-renamed;
 *     a renamed import specifier, a namespace import of the component module,
 *     a re-export rename, or a variable initialized from the identifier all
 *     fail (any alias defeats a name-keyed static guard — do not alias);
 *   - every JSX tag whose name is or ends with `SheetIconLink` (qualified
 *     names included) must carry no spread attribute, and its `className`,
 *     when present, must be a plain string literal (an initializer that is a
 *     JSX expression — template, identifier, anything computed — fails);
 *   - every className token must match the closed positional allowlist:
 *     non-negative margin scale (0-3, half steps) + order utilities. Negative
 *     margins, arbitrary values, `self-*`, sizes, colours all fail.
 */
const POSITIONAL =
  /^(?:sm:|md:|lg:)?(?:m[lrtb]-(?:0(?:\.5)?|1(?:\.5)?|2(?:\.5)?|3)|order-(?:\d|first|last|none))$/;

const NAME = "SheetIconLink";

function classNameViolations(src: string, fileName = "probe.tsx"): string[] {
  const out: string[] = [];
  const kind = /\.(ts|mts|cts)$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, kind);
  const snip = (node: ts.Node) => src.slice(node.getStart(sf), node.getStart(sf) + 100);

  const visit = (node: ts.Node): void => {
    // Import forms. The module check is by specifier suffix — the component
    // file is the only module named SheetIconLink in the repo.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      const fromComponentModule =
        spec !== undefined && ts.isStringLiteral(spec) && spec.text.endsWith(NAME);
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      const bindings = ts.isImportDeclaration(node) ? clause?.namedBindings : node.exportClause;
      if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
        for (const el of bindings.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (imported === NAME && el.name.text !== NAME)
            out.push(`renamed ${NAME} binding "${el.name.text}" — aliases defeat this guard`);
        }
      }
      if (bindings && ts.isNamespaceImport(bindings) && fromComponentModule)
        out.push(`namespace import of the ${NAME} module — aliases defeat this guard`);
      if (ts.isExportDeclaration(node) && !node.exportClause && fromComponentModule)
        out.push(`star re-export of the ${NAME} module — aliases defeat this guard`);
    }
    // Variable alias: const X = SheetIconLink.
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer !== undefined &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === NAME
    ) {
      out.push(`variable alias of ${NAME} — aliases defeat this guard`);
    }
    // JSX usages, qualified names included.
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagText = node.tagName.getText(sf);
      if (tagText === NAME || tagText.endsWith(`.${NAME}`)) {
        if (tagText !== NAME)
          out.push(`qualified JSX tag <${tagText}> — aliases defeat this guard`);
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
      ),
    ).toHaveLength(1);
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
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations(
        'import { SheetIconLink } from "@/components/admin/SheetIconLink";\nconst X = SheetIconLink;',
      ),
    ).toHaveLength(1);
    expect(classNameViolations('<Icons.SheetIconLink className="size-5" />')).toHaveLength(2);
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
    ];
    const violations = files.flatMap((file) => {
      // Gate on the bare name, not the JSX tag — an alias-importing file
      // contains no `<SheetIconLink` tag yet must still be flagged.
      const src = readFileSync(file, "utf8");
      if (!src.includes("SheetIconLink")) return [];
      return classNameViolations(src, file).map((v) => `${file.slice(root.length + 1)}: ${v}`);
    });
    expect(violations).toEqual([]);
  });
});
