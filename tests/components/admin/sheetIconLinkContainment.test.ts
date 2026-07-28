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
 * source extension anywhere in the tree, skipping only an ENUMERATED set of
 * never-compiled artifact dirs (node_modules, coverage, test-results,
 * playwright-report, .git, .next — r11: dot-directories are otherwise WALKED,
 * because a committed `.runtime/alias.tsx` explicitly imported by app code is
 * part of the module graph while a blanket dot-skip never scans it) and the
 * tsconfig-`exclude`d fixture trees (which deliberately contain planted
 * violations; the tests/-import rule below closes their import channel — every
 * excluded tree lives under tests/). r10 found that the r9 surface —
 * tsconfig `fileNames` ∪ a js/jsx/mdx walk of the UI trees — still omitted
 * every non-TS extension outside components/ and app/ (tsconfig's include
 * globs name only ts/tsx/mts despite allowJs), so `lib/sheetLinkAlias.mjs`
 * was an alias laundry the scan never visited. A raw directory walk has no
 * include-glob blind spot by construction; the tsconfig `exclude` list is
 * still read live so fixture-tree edits stay tracked.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  // 3 since r11: two label-context mentions plus the verbatim-phrase negative
  // plant for hiddenPhraseCount.
  "tests/components/admin/sheetIconLinkContainment.test.ts": 3,
  "tests/components/admin/showpage/publishedReviewModal.test.tsx": 3,
  "tests/components/admin/wizard/Step3ReviewModal.test.tsx": 6,
};

// .js/.jsx included (r7): tsconfig sets allowJs, so a plain-JS consumer is a
// legal compile target and must not dodge either scan. .mts/.cts/.mdx and the
// live root mdx-components.tsx joined in r8; r10 walks them repo-wide.
const SOURCE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts", ".mdx"];

// Build/report artifact trees — never compile inputs. Enumerated, never
// pattern-matched (r11): the r10 walk skipped every dot-directory wholesale,
// so a committed dot-dir source file (`.runtime/sheetAlias.tsx`) explicitly
// imported by app code was in the module graph but never scanned. Only these
// known VCS/build outputs are skipped; every other directory, dotted or not,
// is walked. The `.next-*` dist dirs ride the live tsconfig `exclude` list.
// ROOT-ONLY (r12): the names are meaningful as repo-root outputs; matching
// them at every depth made a nested `app/coverage/` or `lib/.next/` source
// tree invisible, so the skip applies only at depth zero.
const ARTIFACT_DIRS = new Set([
  "node_modules",
  "coverage",
  "test-results",
  "playwright-report",
  ".git",
  ".next",
]);

/**
 * tsconfig's `exclude` — read live so fixture-tree edits stay tracked, but
 * VALIDATED, never trusted (r12): `exclude` only stops entry-point inclusion —
 * an excluded file still enters Next's graph when something imports it, so
 * skipping an excluded tree is sound ONLY where the import channel is closed
 * by another rule. That holds for exactly three shapes: `node_modules`
 * (package territory, never first-party source), `.next*` build outputs, and
 * `tests/`-rooted trees (the everywhere tests/-import ban denies their
 * specifiers). Any other entry — a future `fixtures/` — would carve an
 * unscanned, importable tree, so it throws here and forces this guard to
 * learn it first.
 */
function tsconfigExcludes(root: string): string[] {
  const raw = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  if (raw.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, "\n"));
  }
  const excludes = (raw.config as { exclude?: string[] }).exclude ?? [];
  const unsound = excludes.filter(
    (e) => e !== "node_modules" && !/^\.next(?:-|$)/.test(e) && !/^tests\//.test(e),
  );
  if (unsound.length > 0) {
    throw new Error(
      `tsconfig exclude entries the walk cannot soundly skip (no closed import channel): ${unsound.join(", ")}`,
    );
  }
  return excludes;
}

/**
 * The scanned surface (r10): a full-repository walk of every source-extension
 * file. No include-glob dependence — tsconfig `fileNames` proved twice (r9
 * roots, r10 extensions) to be narrower than what Next actually compiles.
 */
/**
 * An artifact dir earns its skip only while git tracks NOTHING inside it
 * (r13): the names are conventions, not guarantees — a COMMITTED
 * `coverage/sheetAlias.tsx` is first-party source an app consumer can import
 * (`@/coverage/sheet`), and skipping it on the name alone reopened the
 * unscanned-importable-tree class the r12 exclude validation closed. `.git`
 * stays unconditional: git never tracks files under its own metadata dir.
 */
const untrackedCache = new Map<string, boolean>();
function isUntrackedArtifactDir(root: string, rel: string): boolean {
  if (rel === ".git") return true;
  const cached = untrackedCache.get(rel);
  if (cached !== undefined) return cached;
  const tracked = execFileSync("git", ["ls-files", "--", rel], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  untrackedCache.set(rel, tracked === "");
  return tracked === "";
}

function walkedFiles(root: string): string[] {
  const excludes = tsconfigExcludes(root);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = full.slice(root.length + 1);
      // Same tracked-nothing soundness rule for the non-tests excludes
      // (node_modules, .next*) as for ARTIFACT_DIRS: a tracked file under
      // them would be importable first-party source, so the skip lapses.
      // tests/-rooted excludes keep their skip while tracked — their import
      // channel is what the everywhere tests/-import ban closes.
      const excluded = excludes.find((e) => rel === e || rel.startsWith(`${e}/`));
      if (
        excluded !== undefined &&
        (excluded.startsWith("tests/") || isUntrackedArtifactDir(root, excluded))
      )
        continue;
      if (statSync(full).isDirectory()) {
        if (rel === entry && ARTIFACT_DIRS.has(entry) && isUntrackedArtifactDir(root, rel))
          continue;
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
 * the raw-text PREFILTER skipping the parse; since r11 the parse gate is ANY
 * backslash at all, because every spelling that can hide the name from a raw
 * scan (`\u`/`\x` escapes, identity escapes like `"Sheet\IconLink"`, line
 * continuations) needs one, and enumerating escape FORMS was shown incomplete
 * twice — the single character closes the class. Runtime indirection
 * (`React.createElement`, computed specifiers) is out of a static guard's
 * reach by construction and explicitly out of scope; the resolver-alias pin
 * below holds the STATIC resolution surface (tsconfig `paths`, package.json
 * `imports`, next.config aliasing) to its known alias-free state so a config
 * file cannot mint a specifier this checker does not recognize.
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
 * tests/-import boundary (r10; widened r11): the carve's premise is that
 * tests/ code cannot ship — so importing ANY module under tests/ is denied
 * EVERYWHERE except tests/ itself and scripts/ (tooling that legitimately
 * imports e2e helpers and never bundles into the app). r10 bound only the
 * shipped trees (app/, components/, lib/, root-level files), which left an
 * unclassified tree — a root-level fixtures/ bridge, a docs/ example — free
 * to re-export a carved tests/ wrapper for a shipped consumer that then
 * imports the bridge without ever mentioning tests/. Every laundering chain's
 * FIRST hop is a file whose specifier literally contains `tests/`; denying
 * that hop everywhere closes the chain wherever it parks.
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

/** The only trees allowed to import from tests/ — see the header (r11). */
const TESTS_IMPORT_EXEMPT = /^(?:tests|scripts)\//;

/** Unwrap parentheses and type-only wrappers around a callee (r15 — they are
 * erased or transparent at runtime, so `(module.require as NodeRequire)(…)`
 * is the same call as `module.require(…)`). */
function unwrapCallee(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isTypeAssertionExpression(e)
  )
    e = e.expression;
  return e;
}

/**
 * Every callee spelling that reaches a CJS require (r15): the bare
 * identifier, ANY property access named `require` (`module.require`,
 * `globalThis.require` — identifier `.text` cooks escapes), and a
 * string-keyed element access (`module["require"]`), each optionally behind
 * the runtime-transparent wrappers unwrapCallee strips. r14 taught the
 * CONFIG collector `.require` property calls but left the live scan's
 * specifierOf on the bare identifier, so
 * `module.require("@/components/admin/SheetIconLink")` touched the module
 * with no violation. Computed keys (`m["req" + "uire"]`) remain runtime
 * construction, out of a static guard's reach with the other computed forms
 * (and in config space nextConfigAliasOffenders flags every computed element
 * access outright).
 */
function isRequireCallee(expr: ts.Expression): boolean {
  const e = unwrapCallee(expr);
  if (ts.isIdentifier(e) && e.text === "require") return true;
  if (ts.isPropertyAccessExpression(e) && e.name.text === "require") return true;
  return (
    ts.isElementAccessExpression(e) &&
    ts.isStringLiteralLike(e.argumentExpression) &&
    e.argumentExpression.text === "require"
  );
}

function classNameViolations(src: string, fileName = "probe.tsx"): string[] {
  const out: string[] = [];
  if (fileName.endsWith(".mdx") || fileName.endsWith(".md")) {
    if (src.includes(NAME)) out.push(`${NAME} referenced in MDX — no sanctioned MDX use exists`);
    else if (src.includes("\\"))
      out.push(
        "backslash in MDX — escape spellings cannot be cleared by raw scan; no sanctioned MDX use",
      );
    return out;
  }
  // tests/ carve — attribute contract only, ROOT-ANCHORED (r10); see header.
  // Alias rules below (identifier + module path) are NOT relaxed.
  const attributeContractRelaxed = /^tests\//.test(fileName);
  const testsImportBanned = !TESTS_IMPORT_EXEMPT.test(fileName);
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
  // as unscanned channels to both the component module and tests/; r15 —
  // the require CALLEE is matched by isRequireCallee, not the bare
  // identifier alone).
  const specifierOf = (node: ts.Node): ts.StringLiteral | null => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      return node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequireCallee(node.expression)) &&
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
      // tests/-import boundary (r10; widened r11 to every non-exempt tree —
      // the carve's soundness depends on tests/ code having no import path
      // into the shipped graph, direct or bridged). BARE specifiers count
      // too (r13): with a tsconfig `baseUrl`, `import … from "tests/x"` is a
      // legal root-relative form that resolveSpecifier reports as unresolved;
      // baseUrl is also pinned absent below, and flagging the bare spelling
      // costs nothing when it cannot resolve. r15: absolute-path and URL
      // specifiers are OUTSIDE both shapes resolveSpecifier models (webpack
      // resolves absolute imports; Node resolves file: URLs), and a
      // `..`-escaping relative path can re-enter the repo from outside — for
      // those unmodeled targets, ANY tests/ segment in the specifier is the
      // ban's business. Root-relative resolutions keep the root-anchored
      // rule: app/tests/ is a real route tree, not the carve.
      if (testsImportBanned) {
        const resolved = resolveSpecifier(spec.text, fileName);
        const target = resolved ?? posix.normalize(spec.text);
        const unmodeled = resolved === null || resolved.startsWith("..");
        if (
          target === "tests" ||
          target.startsWith("tests/") ||
          (unmodeled && /(?:^|[\\/])tests[\\/]/.test(spec.text))
        ) {
          out.push(`non-exempt file imports from tests/ (carve laundering channel): ${snip(node)}`);
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
 * static alias requires one of them), a lone backslash (r11 — EVERY spelling
 * that can hide the name from a raw scan needs one: `\u`/`\x`, identity
 * escapes, line continuations; r10's `\u`/`\x` form list was shown incomplete,
 * so the gate is the single character the whole class shares), and, outside
 * the tests/-import-exempt trees, `tests/` (every specifier that can resolve
 * into tests/ contains it literally — the resolver-alias pin holds `@/*` as
 * the only alias).
 */
function needsParse(src: string, rel: string): boolean {
  if (src.includes(NAME) || src.includes("\\")) return true;
  return !TESTS_IMPORT_EXEMPT.test(rel) && src.includes("tests/");
}

/**
 * Escape-hidden PHRASE occurrences (r11 class-sweep of the needsParse fix:
 * the raw `split(PHRASE)` count has the same blindness the NAME prefilter
 * had). For a parseable file containing a backslash, compare each string-like
 * literal's COOKED text against its RAW source slice: any literal whose
 * cooked text contains the phrase while its raw spelling does not is hiding
 * it behind escapes — no sanctioned use is escape-spelled, so each is a
 * violation, not a count adjustment. Substitution-split templates
 * (`Open the source ${x}`) are runtime construction, out of a static guard's
 * reach like computed specifiers. MDX needs no twin: the live scan already
 * flags ANY backslash in MDX.
 */
function hiddenPhraseCount(src: string, rel: string): number {
  if (!src.includes("\\")) return 0;
  const kind = /\.(ts|mts|cts)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind);
  let hidden = 0;
  const countIn = (s: string): number => s.split(PHRASE).length - 1;
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const raw = src.slice(node.getStart(sf), node.getEnd());
      const cooked = countIn(node.text);
      if (cooked > countIn(raw)) hidden += cooked - countIn(raw);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hidden;
}

/**
 * Alias spellings in next.config.ts (r12 — the r11 pin was a raw-text regex
 * for `resolveAlias`/`resolve.alias`, and a property spelled
 * `resolveAlias` compiles to the same runtime key while never matching;
 * an intermediate binding `const r = config.resolve; r.alias = …` matched
 * neither substring). Scanned on the AST instead: identifiers and string
 * literals normalize escapes in `.text`, so ANY cooked spelling of
 * `resolveAlias` or `alias` — property name, member access, destructuring,
 * shorthand, quoted key — is flagged wherever it appears, and any element
 * access with a non-string-literal argument (`config["ali" + "as"]`,
 * template keys) is flagged as statically unclearable. Comments are not AST
 * nodes, so prose mentions stay clean. String CONCATENATION feeding
 * Reflect/JSON tricks is runtime construction, ratified out of scope with
 * the other computed forms.
 */
function nextConfigAliasOffenders(src: string): string[] {
  const out: string[] = [];
  const sf = ts.createSourceFile(
    "next.config.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
      if (node.text === "resolveAlias" || node.text === "alias")
        out.push(`alias spelling "${node.text}" (cooked) in next.config.ts`);
    }
    if (
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteralLike(node.argumentExpression) &&
      !ts.isNumericLiteral(node.argumentExpression)
    ) {
      out.push(`computed element access in next.config.ts — cannot be statically cleared`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * First-party modules reachable from next.config.ts (r13): the alias scan is
 * worthless if it stops at the entry file — a helper `lib/nextResolution.ts`
 * can hold the literal `resolveAlias` object while next.config.ts merely
 * imports and spreads it. BFS over relative / `@/` specifiers (bare package
 * imports are node_modules territory); every reached file gets the same
 * cooked-spelling scan. Standard Next resolution candidates: exact,
 * +extension, +/index.
 */
/**
 * FAIL-CLOSED since r14: the r13 collector silently IGNORED whatever it could
 * not model — `module.require(...)`, a specifier resolving to `.json` or a
 * directory `package.json#main`, a dynamic argument — and an ignored edge in
 * a config graph is an unscanned alias location. The inversion: every
 * specifier-bearing form is collected (import/export declarations,
 * `import =`, `import()`, bare `require()`, and ANY `<expr>.require()`
 * property call); a non-literal specifier is an offense outright; a local
 * specifier that resolves to a source file is enqueued, one that resolves to
 * `.json` is scanned for alias-spelled KEYS, and one that resolves to a
 * directory package or does not resolve at all is an offense. Bare
 * specifiers stay node_modules territory — pinned real by the
 * no-local-protocol-deps and no-workspace-packages assertions in the
 * resolver test — except `module`/`node:module`, whose `createRequire` is a
 * resolver escape hatch and is denied in config space. r15: "bare" is
 * node_modules territory ONLY for names npm could host — resolveSpecifier
 * also returns null for `data:`/`file:` URLs, absolute or drive-letter
 * paths, and `#` subpath imports, and a literal
 * `import("data:text/javascript,…")` executes under Node with its embedded
 * alias never scanned; bareSpecifierOffense classifies the null lane instead
 * of trusting it.
 */
/**
 * Bare-specifier classification for the config graph (r15). Denylist, not
 * npm-name grammar: the classes resolveSpecifier cannot model all carry a
 * telltale — a `:` (protocols, Windows drives), a leading `/` or `\`
 * (absolute paths), or a leading `#` (package subpath imports, whose
 * `imports` field is pinned absent anyway). `node:` builtins pass, except
 * the createRequire escape hatch.
 */
function bareSpecifierOffense(spec: string): string | null {
  if (spec === "module" || spec === "node:module")
    return `createRequire source "${spec}" in config graph`;
  if (/^node:[a-zA-Z0-9_/-]+$/.test(spec)) return null;
  if (spec.includes(":") || spec.startsWith("/") || spec.startsWith("\\") || spec.startsWith("#"))
    return `non-package specifier "${spec}" in config graph — cannot be cleared`;
  return null;
}

function configReachableFiles(root: string): { files: string[]; offenders: string[] } {
  const exts = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"];
  const jsonAliasKeys = (value: unknown, rel: string): string[] => {
    if (typeof value !== "object" || value === null) return [];
    const found: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "resolveAlias" || k === "alias") found.push(`alias key "${k}" in ${rel}`);
      found.push(...jsonAliasKeys(v, rel));
    }
    return found;
  };
  const queue = ["next.config.ts"];
  const seen = new Set<string>(queue);
  const files: string[] = [];
  const offenders: string[] = [];
  while (queue.length > 0) {
    const rel = queue.shift()!;
    files.push(rel);
    const src = readFileSync(join(root, rel), "utf8");
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      let specNode: ts.Expression | null = null;
      let specifierBearing = false;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier !== undefined
      ) {
        specifierBearing = true;
        specNode = node.moduleSpecifier;
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        specifierBearing = true;
        specNode = node.moduleReference.expression;
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequireCallee(node.expression))
      ) {
        specifierBearing = true;
        specNode = node.arguments[0] ?? null;
      }
      if (!specifierBearing) {
        ts.forEachChild(node, visit);
        return;
      }
      if (specNode === null || !ts.isStringLiteralLike(specNode)) {
        offenders.push(`${rel}: dynamic module specifier in config graph — cannot be cleared`);
        ts.forEachChild(node, visit);
        return;
      }
      const spec = specNode.text;
      const base = resolveSpecifier(spec, rel);
      if (base === null) {
        const offense = bareSpecifierOffense(spec);
        if (offense !== null) offenders.push(`${rel}: ${offense}`);
        ts.forEachChild(node, visit);
        return;
      }
      const candidates = [
        base,
        ...exts.map((e) => base + e),
        ...exts.map((e) => `${base}/index${e}`),
        `${base}.json`,
        `${base}/index.json`,
      ];
      const hit = candidates.find((c) => {
        const full = join(root, c);
        return existsSync(full) && statSync(full).isFile();
      });
      if (hit === undefined) {
        offenders.push(
          `${rel}: local specifier "${spec}" does not resolve to a scannable file — cannot be cleared`,
        );
      } else if (hit.endsWith(".json")) {
        offenders.push(...jsonAliasKeys(JSON.parse(readFileSync(join(root, hit), "utf8")), hit));
      } else if (!seen.has(hit)) {
        seen.add(hit);
        queue.push(hit);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { files, offenders };
}

describe("sheet-link phrase containment (spec §7.10)", () => {
  it("per-file occurrence counts equal the pinned set exactly", () => {
    const root = join(__dirname, "..", "..", "..");
    const found: Record<string, number> = {};
    const hidden: string[] = [];
    const files = walkedFiles(root);
    for (const file of files) {
      const rel = file.slice(root.length + 1);
      const src = readFileSync(file, "utf8");
      const count = src.split(PHRASE).length - 1;
      if (count > 0) found[rel] = count;
      // r11: an escape-spelled phrase in a literal is invisible to the raw
      // count — flagged outright, since no sanctioned use is escape-spelled.
      if (!rel.endsWith(".mdx") && hiddenPhraseCount(src, rel) > 0)
        hidden.push(`${rel}: escape-hidden phrase occurrence(s)`);
    }
    expect(hidden).toEqual([]);
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
    // r11 — identity escapes and line continuations also cook to the name
    // with no parse diagnostics; the any-backslash prefilter guarantees the
    // parse, and the cooked `.text` falls to the existing rules:
    expect(
      classNameViolations(
        'import { "Sheet\\IconLink" as X } from "@/components/admin/Sheet\\IconLink";',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      classNameViolations('import { X } from "@/components/admin/SheetIcon\\\nLink";'),
    ).toHaveLength(1);
    // r11 — the prefilter itself fires on every hiding form (the r10 hole was
    // a sound checker behind an unsound gate):
    expect(needsParse('const s = "Sheet\\IconLink";', "lib/x.ts")).toBe(true);
    expect(needsParse('const s = "SheetIcon\\\nLink";', "lib/x.ts")).toBe(true);
    expect(needsParse('import { h } from "@/tests/helpers/x";', "fixtures/bridge.tsx")).toBe(true);
    // r11 — the tests/-import ban binds outside app/, components/, lib/ and
    // the root too: an unclassified tree cannot bridge a carved tests/
    // wrapper into the shipped graph.
    expect(
      classNameViolations(
        'export * from "../tests/helpers/OffContract";',
        "fixtures/sheetBridge.tsx",
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations('import { W } from "@/tests/helpers/W";', "docs/examples/demo.ts"),
    ).toHaveLength(1);
    // r13 — BARE root-relative specifier (the shape a tsconfig baseUrl would
    // legalize) is flagged too; baseUrl itself is pinned absent below.
    expect(
      classNameViolations('import { W } from "tests/helpers/W";', "components/consumer.tsx"),
    ).toHaveLength(1);
    // r15 — property/element/wrapped require callees are module touches (the
    // r14 collector knew `.require`; the live scan's specifierOf did not):
    expect(
      classNameViolations('const m = module.require("@/components/admin/SheetIconLink");'),
    ).toHaveLength(1);
    expect(
      classNameViolations('const m = module["require"]("@/components/admin/SheetIconLink");'),
    ).toHaveLength(1);
    expect(
      classNameViolations('const m = (module.require)("@/components/admin/SheetIconLink");'),
    ).toHaveLength(1);
    expect(
      classNameViolations(
        'const m = (module.require as NodeRequire)("@/components/admin/SheetIconLink");',
        "probe.ts",
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations('const h = mod.require("@/tests/helpers/x");', "lib/consumer.ts"),
    ).toHaveLength(1);
    // r15 — absolute-path and URL specifiers sit outside both shapes
    // resolveSpecifier models; any tests/ segment in them is the ban's
    // business, as is a `..`-escaping relative that re-enters via tests/:
    expect(
      classNameViolations(
        'import { W } from "/Users/x/repo/tests/helpers/W";',
        "components/consumer.tsx",
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations(
        'import { W } from "file:///Users/x/repo/tests/helpers/W";',
        "components/consumer.tsx",
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations(
        'import { W } from "../../sibling/tests/helpers/W";',
        "components/consumer.tsx",
      ),
    ).toHaveLength(1);
    // r11 — the phrase count has the same escape blindness the NAME prefilter
    // had; hiddenPhraseCount sees through cooked literals:
    expect(hiddenPhraseCount('const a = "Open the source \\u0073heet";', "lib/x.ts")).toBe(1);
    expect(hiddenPhraseCount('const a = "Open the \\\nsource sheet";', "lib/x.ts")).toBe(1);
    expect(hiddenPhraseCount("const a = `Open the source \\u0073heet`;", "lib/x.ts")).toBe(1);
    // …verbatim spellings are the raw count's job, not hidden:
    expect(
      hiddenPhraseCount('const a = "Open the source sheet"; const b = "\\n";', "lib/x.ts"),
    ).toBe(0);
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

  it("resolver alias surface is pinned closed: @/* is the only path alias (r11)", () => {
    // Whole-diff r11: a tsconfig `paths` entry such as `"#sheet":
    // ["./components/admin/SheetIconLink.tsx"]` is a static alias the module
    // rule cannot see — the specifier neither ends with the component name
    // nor resolves through the two shapes resolveSpecifier knows, and the
    // quoted-export-name import it enables produces no Identifier node.
    // Rather than teach the checker every resolver, pin every resolver-level
    // alias mechanism the shipped bundle honours to its current alias-free
    // state; introducing one fails HERE and forces this guard to learn it
    // before it can exist. (vitest aliases affect only test-run resolution:
    // nothing they alias can ship, because shipped code cannot import tests/
    // and the walk parses every tree that could re-export for it.)
    const root = join(__dirname, "..", "..", "..");
    const raw = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
    expect(raw.error).toBeUndefined();
    const compilerOptions = (
      raw.config as { compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string } }
    ).compilerOptions;
    expect(compilerOptions?.paths).toEqual({ "@/*": ["./*"] });
    // r13: a `baseUrl` makes BARE specifiers root-relative — `import … from
    // "tests/x"` or "components/admin/…" would resolve without `./` or `@/`,
    // outside both shapes resolveSpecifier knows. The bare tests/ spelling is
    // also flagged directly, but the pin keeps the whole class shut.
    expect(compilerOptions?.baseUrl).toBeUndefined();
    // Node subpath imports (`#…` specifiers) resolve through package.json —
    // the same laundry with a different config file. r13: `exports` is the
    // same mechanism outward (a self-referencing package import
    // `fx-webpage-template/sheet` can remap to any file), and `browser` is a
    // legacy remap field; all three stay absent.
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(pkg.imports).toBeUndefined();
    expect(pkg.exports).toBeUndefined();
    expect(pkg.browser).toBeUndefined();
    // r14: bare specifiers are "node_modules territory" only while no
    // dependency resolves to a local path — a `file:`/`link:`/`workspace:`
    // dependency maps a bare name onto first-party disk, and a
    // pnpm-workspace `packages:` list would do the same for whole trees.
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      const deps = (pkg[field] ?? {}) as Record<string, string>;
      const local = Object.entries(deps).filter(([, v]) => /^(?:file|link|workspace):/.test(v));
      expect(local, `${field} has no local-protocol entries`).toEqual([]);
    }
    const workspaceYaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspaceYaml).not.toMatch(/^\s*packages\s*:/m);
    // Next-level aliasing (turbopack `resolveAlias`, webpack
    // `config.resolve.alias`) rewrites specifiers after tsconfig; the config
    // is code, so the pin is an AST scan for any cooked alias spelling or
    // statically unclearable computed access (r12 — see
    // nextConfigAliasOffenders; a raw regex missed escape spellings and
    // intermediate bindings). r13: the scan covers every first-party module
    // REACHABLE from next.config.ts, not just the entry file — a helper can
    // hold the alias literal while the entry merely spreads it. r14: the
    // collector is fail-closed — dynamic specifiers, unresolvable local
    // specifiers, directory packages, createRequire sources, and alias keys
    // in reached .json files all surface as offenders instead of being
    // silently skipped.
    const reachable = configReachableFiles(root);
    expect(reachable.files, "the config graph starts at the entry").toContain("next.config.ts");
    const configOffenders = [
      ...reachable.offenders,
      ...reachable.files.flatMap((rel) =>
        nextConfigAliasOffenders(readFileSync(join(root, rel), "utf8")).map((v) => `${rel}: ${v}`),
      ),
    ];
    expect(configOffenders).toEqual([]);
    // Plants: escape-spelled property key, intermediate-binding assignment,
    // quoted key, computed key — all flagged; the alias-free real config and
    // prose-comment mentions are not.
    expect(
      nextConfigAliasOffenders("const c = { resolv\\u0065Alias: {} };").length,
    ).toBeGreaterThan(0);
    expect(nextConfigAliasOffenders("const r = cfg.resolve; r.alias = {};").length).toBeGreaterThan(
      0,
    );
    expect(nextConfigAliasOffenders('const c = { "alias": {} };').length).toBeGreaterThan(0);
    expect(nextConfigAliasOffenders('cfg.resolve["ali" + "as"] = {};').length).toBeGreaterThan(0);
    expect(nextConfigAliasOffenders("// alias is fine in prose\nconst x = 1;")).toEqual([]);
    // r15 — the collector's null-resolution lane is npm territory only for
    // names npm could host; URL/path/subpath specifiers execute or remap
    // outside node_modules and surface as offenses:
    expect(bareSpecifierOffense("react")).toBeNull();
    expect(bareSpecifierOffense("@supabase/supabase-js")).toBeNull();
    expect(bareSpecifierOffense("next/dist/lib/x")).toBeNull();
    expect(bareSpecifierOffense("node:path")).toBeNull();
    expect(bareSpecifierOffense("module")).not.toBeNull();
    expect(bareSpecifierOffense("node:module")).not.toBeNull();
    expect(
      bareSpecifierOffense("data:text/javascript,export default {resolveAlias:{}}"),
    ).not.toBeNull();
    expect(bareSpecifierOffense("file:///tmp/alias.mjs")).not.toBeNull();
    expect(bareSpecifierOffense("/abs/alias.mjs")).not.toBeNull();
    expect(bareSpecifierOffense("#internal/alias")).not.toBeNull();
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
