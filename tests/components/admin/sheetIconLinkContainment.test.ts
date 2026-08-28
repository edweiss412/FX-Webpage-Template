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
 *   - components/admin/wizard/Step3SheetCard.tsx (2 since the PR #640 ternary split — the ratified text-link
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
  // r42 reconcile (2026-08-01, restore branch): PR #640's stripNewTabSuffix
  // dedup split the card label into a ternary pair (Step3SheetCard.tsx:156-157).
  "components/admin/wizard/Step3SheetCard.tsx": 2,
  "components/admin/wizard/step3ReviewSections.tsx": 1,
  // Test files quoting the phrase as assertion material (r9 — the walk now
  // covers the whole repository, so these pin like everything else; a new
  // assertion legitimately bumps its row here).
  // r42 reconcile: the same PR's a11y test quotes the phrase six times.
  "tests/components/a11y/newTabAnnouncementBehavior.test.tsx": 6,
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
// HORIZONTAL margins + order only (r17): the overlay's 44px VERTICAL floor is
// exactly met, so any mt-*/mb-* — even mt-0.5 — shifts the overlay a pixel
// outside a 44px row while every rect-size e2e stays green. The three shipped
// call sites use only mr-0.5 / sm:ml-0.5 / sm:order-1; vertical positioning
// belongs to the consuming row (spec §5.1), never the anchor.
const POSITIONAL =
  /^(?:sm:|md:|lg:)?(?:m[lr]-(?:0(?:\.5)?|1(?:\.5)?|2(?:\.5)?|3)|order-(?:\d|first|last|none))$/;

const NAME = "SheetIconLink";
const COMPONENT_FILE = `components/admin/${NAME}.tsx`;

/** Strip a resolvable extension and trailing /index before suffix-matching.
 * r16: a webpack resource query/fragment (`?off-contract`, `#frag`) rides the
 * specifier but not the resolved resource, so it is stripped FIRST — without
 * this, `"@/components/admin/SheetIconLink?x"` resolved to the component
 * while dodging the endsWith check. */
function normalizeSpecifier(spec: string): string {
  return spec
    .replace(/[?#][\s\S]*$/, "")
    .replace(/\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/, "")
    .replace(/\/index$/, "");
}

/** Root-relative resolution of a specifier, or null for bare packages. */
function resolveSpecifier(spec: string, fromRel: string): string | null {
  if (spec.startsWith("@/")) return posix.normalize(spec.slice(2));
  if (spec.startsWith(".")) return posix.normalize(posix.join(posix.dirname(fromRel), spec));
  return null;
}

/** The only trees allowed to import from tests/ — see the header (r11).
 *
 * The `docs/` half is the PROBES SUBTREE ONLY, not the tree: `docs/examples/demo.ts`
 * importing from `tests/` is a planted negative in this file's own suite and must keep
 * failing. Scoping it to `docs/**\/probes/**` was the difference between an exemption and a
 * hole. Committed PROBES under
 * `docs/superpowers/specs/**\/probes/` are review evidence, not shipped code, and reading the
 * corpus through `tests/parser/mutation/fixtures` is the entire point of one — a probe that
 * re-implemented fixture loading would be measuring its own copy rather than what the harness
 * measures. They ship nothing: no route, component, or library imports them, and the rule this
 * guard enforces is about a laundering CHANNEL into shipped code, which docs cannot be. Same
 * reasoning the sole-emitter pin already records for the same tree
 * (`tests/parser/fieldNearMiss.test.ts`: "probe and evidence scripts ... review artifacts, not
 * shipped call sites").
 */
const TESTS_IMPORT_EXEMPT = /^(?:tests|scripts)\/|^docs\/.*\/probes\//;

/** Unwrap parentheses and type-only wrappers around an expression (r15 for
 * callees — `(module.require as NodeRequire)(…)` is the same call as
 * `module.require(…)`; r16 widened to specifier ARGUMENTS, where the same
 * wrappers plus a no-substitution template hid the string from the
 * isStringLiteral check: `require(("@/…"))`, `require(\`@/…\`)`). */
function unwrapTransparent(expr: ts.Expression): ts.Expression {
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
  const e = unwrapTransparent(expr);
  if (ts.isIdentifier(e) && e.text === "require") return true;
  if (ts.isPropertyAccessExpression(e) && e.name.text === "require") return true;
  return (
    ts.isElementAccessExpression(e) &&
    ts.isStringLiteralLike(e.argumentExpression) &&
    e.argumentExpression.text === "require"
  );
}

/**
 * Resolution APIs are specifier-bearing too (r24): `require.resolve("./x")`
 * takes the SAME literal specifier grammar as `require` itself, and its
 * return value feeds a one-hop composition — `require(require.resolve(lit))`
 * — whose inner literal the argument extractor never saw (the outer argument
 * is a call expression, ratified computed; the inner callee is `.resolve`,
 * not a require spelling). The member ride the same normalization as the
 * require callee: property access or string-keyed element access named
 * `resolve` (or webpack's `resolveWeak`) on any require-callee expression,
 * plus the ESM twin `import.meta.resolve`, each behind runtime-transparent
 * wrappers. Computed keys stay in the ratified computed class.
 */
function isResolveCallee(expr: ts.Expression): boolean {
  const e = unwrapTransparent(expr);
  const RESOLVE_NAMES = new Set(["resolve", "resolveWeak"]);
  let base: ts.Expression;
  if (ts.isPropertyAccessExpression(e) && RESOLVE_NAMES.has(e.name.text)) {
    base = e.expression;
  } else if (
    ts.isElementAccessExpression(e) &&
    ts.isStringLiteralLike(e.argumentExpression) &&
    RESOLVE_NAMES.has(e.argumentExpression.text)
  ) {
    base = e.expression;
  } else {
    return false;
  }
  const owner = unwrapTransparent(base);
  if (isRequireCallee(owner)) return true;
  return ts.isMetaProperty(owner) && owner.keywordToken === ts.SyntaxKind.ImportKeyword;
}

/**
 * Context modules (r17): `require.context(dir, …, filter)` and
 * `import.meta.webpackContext(dir, …)` are documented static webpack module
 * syntaxes that select modules by directory + pattern, so no specifier ever
 * spells the component path — the SELECTION MECHANISM is denied outright, in
 * the live scan and the config graph alike. The `context` fragment in
 * needsParse gates the live parse; computed callee keys stay in the ratified
 * computed class.
 */
function isContextModuleCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrapTransparent(node.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    if (callee.name.text === "webpackContext") return true;
    if (callee.name.text === "context") return isRequireCallee(callee.expression);
  }
  if (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)) {
    if (callee.argumentExpression.text === "webpackContext") return true;
    if (callee.argumentExpression.text === "context") return isRequireCallee(callee.expression);
  }
  return false;
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
  // identifier alone; r16 — the ARGUMENT is unwrapped through the same
  // runtime-transparent wrappers and may be a no-substitution template,
  // closing `require(("@/…"))` and `require(\`@/…\`)`).
  // r17: PLURAL — AMD `require([deps], cb)` / `define(…, [deps], f)` are
  // documented static webpack module syntaxes whose specifiers ride ARRAY
  // elements, so every string-literal argument AND every string element of
  // an array-literal argument is a specifier. A component-targeting element
  // necessarily spells the module path (or tests/), so the r11 contiguous
  // prefilter fragments still gate the parse soundly.
  const specifiersOf = (node: ts.Node): ts.StringLiteralLike[] => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      return [node.moduleSpecifier];
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const ref = unwrapTransparent(node.moduleReference.expression);
      if (ts.isStringLiteralLike(ref)) return [ref];
      return [];
    }
    const isAmdDefineCallee = (expr: ts.Expression): boolean => {
      const e = unwrapTransparent(expr);
      return (
        (ts.isIdentifier(e) && e.text === "define") ||
        (ts.isPropertyAccessExpression(e) && e.name.text === "define")
      );
    };
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        isRequireCallee(node.expression) ||
        isResolveCallee(node.expression) ||
        isAmdDefineCallee(node.expression))
    ) {
      const out: ts.StringLiteralLike[] = [];
      for (const rawArg of node.arguments) {
        const arg = unwrapTransparent(rawArg);
        if (ts.isStringLiteralLike(arg)) out.push(arg);
        else if (ts.isArrayLiteralExpression(arg)) {
          for (const el of arg.elements) {
            const item = unwrapTransparent(el);
            if (ts.isStringLiteralLike(item)) out.push(item);
          }
        }
      }
      return out;
    }
    return [];
  };

  const visit = (node: ts.Node): void => {
    if (isContextModuleCall(node)) {
      out.push(
        `context-module call (pattern-based module selection defeats the specifier rules): ${snip(node)}`,
      );
    }
    for (const spec of specifiersOf(node)) {
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
    // r29: the identifier can be spelled as a STRING LITERAL in a binding
    // position — `import { "SheetIconLink" as X }` / `export { X as
    // "SheetIconLink" }` produce no Identifier node for the name. Denied in
    // import/export-specifier positions specifically; a test quoting the
    // name in assertion prose is not a binding and stays clean.
    if (ts.isStringLiteralLike(node) && node.text === NAME) {
      const p = node.parent;
      if (p !== undefined && (ts.isImportSpecifier(p) || ts.isExportSpecifier(p))) {
        out.push(`string-literal ${NAME} import/export binding: ${snip(p)}`);
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
  // r17: context modules (`require.context`, `import.meta.webpackContext`)
  // select by directory + pattern, so no other fragment need appear — but
  // every plain spelling contains the contiguous `context`, and escape
  // spellings need a backslash, which already gates the parse.
  if (src.includes("context")) return true;
  return !TESTS_IMPORT_EXEMPT.test(rel) && src.includes("tests/");
}

/**
 * AST-confirmed JSX render of the component (r16): raw `<SheetIconLink`
 * prefilter at the call site, then a real tag-name check so a comment or
 * string quoting the tag is not an adopter. Feeds the pinned adopter-set
 * assertion — the component's consuming-context requirements (spec §5.1:
 * 44px row floor, directional clearances, vertical centring) are geometry a
 * static guard cannot verify, so the guard makes ADOPTION itself the
 * reviewable event: a new direct adopter must add its row and ship its
 * rect-intersection e2e + impeccable pass alongside.
 */
function rendersTag(src: string, rel: string): boolean {
  const kind = /\.(ts|mts|cts)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === NAME
    )
      found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
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
function hiddenPhraseCount(src: string, rel: string, needle: string = PHRASE): number {
  if (!src.includes("\\")) return 0;
  const kind = /\.(ts|mts|cts)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind);
  let hidden = 0;
  const countIn = (s: string): number => s.split(needle).length - 1;
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
/**
 * r16: the pin claimed resolver-level closure while denying only the two
 * alias KEY spellings — webpack owns more remap surfaces (`resolve.fallback`
 * maps failed resolutions onto arbitrary files, `resolve.plugins` installs
 * arbitrary resolvers, `resolve.modules` adds first-party search roots,
 * `extensionAlias` / `descriptionFiles` redirect resolution inputs, and
 * `NormalModuleReplacementPlugin` rewrites requests outright), and the
 * `webpack` hook key itself is the gate to every one of them. The real
 * config has none of these tokens; introducing any fails here and forces
 * this guard to learn it first. Loader/transform pipelines (turbopack
 * `rules`) are build-time code construction, out of the static guard's scope
 * with the other computed forms.
 */
const REMAP_SPELLINGS = new Set([
  "alias",
  "resolveAlias",
  "webpack",
  "fallback",
  "plugins",
  "modules",
  "extensionAlias",
  "descriptionFiles",
  "NormalModuleReplacementPlugin",
  // r18: keys that redirect which FILES/ROOTS resolution reads — the same
  // laundering power with one indirection. `typescript.tsconfigPath` makes
  // Next install a tracked ALTERNATE tsconfig's `paths` (the resolver pin
  // reads only the root file); `experimental.externalDir` legalises imports
  // from OUTSIDE the repo root, i.e. outside the walk entirely;
  // `modularizeImports` rewrites import specifiers by template; and
  // `turbopack.root` moves the resolution root. None appears in the real
  // config; a legitimate future use teaches this guard first.
  "tsconfigPath",
  "externalDir",
  "modularizeImports",
  "root",
  // r22: keys that redirect which FILE a specifier lands on by EXTENSION.
  // `turbopack.resolveExtensions` REPLACES the candidate-extension list, and
  // Next's schema accepts arbitrary strings — an entry like "IconLink.tsx"
  // makes an innocent-looking specifier (`…/Sheet`) land on the component
  // file while both the suffix and identifier checks stay green.
  // `extensions` is the webpack twin (`resolve.extensions`) behind the
  // already-denied `webpack` hook key, listed for the same defense-in-depth
  // the r16 sub-keys carry. Neither token appears in the real config or its
  // reachable JSON; a legitimate future use teaches this guard first.
  "resolveExtensions",
  "extensions",
  // r23: the MDX loader's `extension` option redirects which FILES the MDX
  // pipeline claims — `createMDX({ extension: /\.mdx?$/ })` compiles tracked
  // `.md` (a tree the walk treats as prose) into importable/page source. The
  // real config passes no such key; the compiled-page surface is additionally
  // pinned by the pageExtensions equality check below.
  "extension",
]);

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
      if (REMAP_SPELLINGS.has(node.text))
        out.push(`resolver-remap spelling "${node.text}" (cooked) in next.config.ts`);
    }
    if (
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteralLike(node.argumentExpression) &&
      !ts.isNumericLiteral(node.argumentExpression)
    ) {
      out.push(`computed element access in next.config.ts — cannot be statically cleared`);
    }
    // r25: a computed PROPERTY NAME is the object-literal twin of computed
    // element access — `{ ["page" + "Extensions"]: [...] }` constructs a key
    // no token scan can see. A string-literal computed name cooks into the
    // token scans above; anything else is statically unclearable in config
    // space, same class as the element-access rule.
    if (ts.isComputedPropertyName(node)) {
      const key = unwrapTransparent(node.expression);
      if (!ts.isStringLiteralLike(key) && !ts.isNumericLiteral(key)) {
        out.push(`computed property name in next.config.ts — cannot be statically cleared`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * Every AST spelling of the `pageExtensions` token in a module (r25):
 * identifiers and string literals cook escapes in `.text`, so the pinned
 * property's own name, a shorthand property (`{ pageExtensions }`), a
 * string-literal computed key, a getter, a later dot/bracket assignment,
 * and a `delete` all count — the graph-wide pin requires EXACTLY ONE
 * occurrence (the entry property's name), so any second spelling in any
 * form fails without this guard having to model object semantics.
 * Non-literal computed keys are offenses outright (above).
 */
function pageExtensionsTokenCount(sf: ts.SourceFile): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && node.text === "pageExtensions") {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return count;
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
/**
 * Remap-key scan for JSON reachable from the config graph. r20: this lane
 * carried only the two alias literals while REMAP_SPELLINGS grew across
 * r16-r18 — a reachable JSON object could hold `modularizeImports` or
 * `tsconfigPath` and be spread into the config with no offense. ONE set
 * feeds every lane (the ledger-union lesson again).
 */
function jsonRemapOffenses(value: unknown, rel: string): string[] {
  if (typeof value !== "object" || value === null) return [];
  const found: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REMAP_SPELLINGS.has(k)) found.push(`resolver-remap key "${k}" in ${rel}`);
    // r24: `pageExtensions` is denied in the JSON lane ONLY — the one
    // sanctioned definition site is the entry file's own property, pinned by
    // graph-wide AST equality; a reachable JSON carrying the key exists to be
    // spread into the config, which is exactly the laundering the pin closes.
    // (Not in REMAP_SPELLINGS: the code lane scans the entry file, where the
    // legitimate property lives.)
    if (k === "pageExtensions") found.push(`pageExtensions key in reachable JSON ${rel}`);
    found.push(...jsonRemapOffenses(v, rel));
  }
  return found;
}

function bareSpecifierOffense(spec: string): string | null {
  if (spec === "module" || spec === "node:module")
    return `createRequire source "${spec}" in config graph`;
  if (/^node:[a-zA-Z0-9_/-]+$/.test(spec)) return null;
  if (spec.includes(":") || spec.startsWith("/") || spec.startsWith("\\") || spec.startsWith("#"))
    return `non-package specifier "${spec}" in config graph — cannot be cleared`;
  return null;
}

/**
 * r19: `bareImports` — every bare package the config graph touches. A
 * registry package invoked FROM the config (`withMDX`, `withSentryConfig`)
 * executes at build time and could hand Next a resolver alias from
 * node_modules, where no first-party scan reaches. The CONTENT of a pinned
 * dependency is ratified supply-chain trust (lockfile + dependency review
 * own upgrades, as they do for every package that could patch anything);
 * the first-party, teachable surface is WHICH packages the config invokes —
 * pinned by exact set in the resolver test, so a new config-level wrapper
 * fails until this guard learns it.
 */
function configReachableFiles(root: string): {
  files: string[];
  offenders: string[];
  bareImports: string[];
} {
  const exts = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"];
  const bareImports = new Set<string>();
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
      if (isContextModuleCall(node)) {
        offenders.push(`${rel}: context-module call in config graph — cannot be cleared`);
      }
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
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          isRequireCallee(node.expression) ||
          isResolveCallee(node.expression))
      ) {
        specifierBearing = true;
        specNode = node.arguments[0] ?? null;
      }
      if (!specifierBearing) {
        ts.forEachChild(node, visit);
        return;
      }
      // r16: unwrap the same runtime-transparent wrappers the live scan
      // unwraps, so `import(("./x"))` resolves rather than misclassifying —
      // and anything still non-literal stays the fail-closed offense.
      const specLit = specNode === null ? null : unwrapTransparent(specNode);
      if (specLit === null || !ts.isStringLiteralLike(specLit)) {
        offenders.push(`${rel}: dynamic module specifier in config graph — cannot be cleared`);
        ts.forEachChild(node, visit);
        return;
      }
      const spec = specLit.text;
      const base = resolveSpecifier(spec, rel);
      if (base === null) {
        const offense = bareSpecifierOffense(spec);
        if (offense !== null) offenders.push(`${rel}: ${offense}`);
        else bareImports.add(spec);
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
        offenders.push(
          ...jsonRemapOffenses(JSON.parse(readFileSync(join(root, hit), "utf8")), hit),
        );
      } else if (!seen.has(hit)) {
        seen.add(hit);
        queue.push(hit);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { files, offenders, bareImports: [...bareImports].sort() };
}

describe("sheet-link phrase containment (spec §7.10)", () => {
  // 30s timeouts on the two full-repo walk+read tests: 5.3s on CI shard
  // runners against vitest's 5000ms default — the walk is IO-bound, not hung.
  it("per-file occurrence counts equal the pinned set exactly", { timeout: 30_000 }, () => {
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

  it(
    "sheet-URL destination surface is pinned: one builder, censused consumers",
    { timeout: 30_000 },
    () => {
      // r33: the identifier/phrase lanes bind the COMPONENT; the destination
      // binds the CLASS. A hand-rolled icon-only anchor that mentions neither
      // the identifier nor the canonical phrase still needs a sheet URL, and
      // every static acquisition path is pinned: the raw host-path literal
      // (count-pinned per file, escape spellings flagged via the
      // cooked-literal scan), the `buildSheetDeepLink` fragment
      // (COUNT-pinned per shipped file since r34 — a second call or a
      // re-export inside an existing consumer is as loud as a new consumer;
      // escape-spelled identifiers and literals cook in the AST and are
      // counted by cookedFragmentExtra, riding the same single-backslash
      // tell as the r11 prefilter), and the three adopter href variables
      // (token-count-pinned below — reusing `openSheetHref` in a sibling
      // hand-rolled anchor, or renaming it to dodge the pin, changes a
      // pinned count either way). Computed and runtime construction stay in
      // the ratified out-of-scope class. A new sheet link therefore teaches
      // this guard first, where review (the invariant-8 UI gate) sees it.
      const SHEET_URL = "docs.google.com/spreadsheets";
      const BUILDER = "buildSheetDeepLink";
      const root = join(__dirname, "..", "..", "..");
      const urlFound: Record<string, number> = {};
      const urlHidden: string[] = [];
      const builderCounts: Record<string, number> = {};
      const cookedFragmentExtra = (src: string, rel: string, needle: string): number => {
        if (!src.includes("\\")) return 0;
        const kind = /\.(ts|mts|cts)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
        const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind);
        let extra = 0;
        const visit = (node: ts.Node): void => {
          if (
            ts.isIdentifier(node) ||
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)
          ) {
            const raw = src.slice(node.getStart(sf), node.getEnd());
            if (node.text.includes(needle) && !raw.includes(needle)) extra += 1;
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
        return extra;
      };
      for (const file of walkedFiles(root)) {
        const rel = file.slice(root.length + 1);
        const src = readFileSync(file, "utf8");
        const count = src.split(SHEET_URL).length - 1;
        if (count > 0) urlFound[rel] = count;
        if (!rel.endsWith(".mdx") && hiddenPhraseCount(src, rel, SHEET_URL) > 0)
          urlHidden.push(`${rel}: escape-hidden sheet-URL occurrence(s)`);
        if (!/^tests\//.test(rel)) {
          const raw = src.split(BUILDER).length - 1;
          const cooked = rel.endsWith(".mdx") ? 0 : cookedFragmentExtra(src, rel, BUILDER);
          if (raw + cooked > 0) builderCounts[rel] = raw + cooked;
        }
      }
      expect(urlHidden).toEqual([]);
      expect(urlFound).toEqual({
        "docs/superpowers/specs/step3-onboarding/2026-07-02-step3-review-modal-mock/data.jsx": 1,
        "lib/sheet-links/buildSheetDeepLink.ts": 1,
        "tests/admin/attentionClearingKind.test.ts": 1,
        "tests/adminAlerts/alertActions.test.ts": 5,
        "tests/components/a11y/newTabAnnouncementBehavior.test.tsx": 1,
        "tests/components/admin/review/attentionBanner.test.tsx": 1,
        "tests/components/admin/sheetIconLink.test.tsx": 1,
        // This file's own SHEET_URL constant — the self-row the phrase
        // census also carries.
        "tests/components/admin/sheetIconLinkContainment.test.ts": 1,
        "tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx": 1,
        "tests/components/admin/showpage/attentionMenuGroups.test.tsx": 1,
        "tests/components/admin/showpage/publishedReviewModal.test.tsx": 2,
        "tests/components/admin/wizard/Step2Verify.test.tsx": 1,
        "tests/components/step3SheetCard.test.tsx": 1,
        // Anchor-freshness integration pair (spec 2026-08-09-m-wave-2 §2.3):
        // three href assertions against the crew-page projection seam.
        "tests/data/sourceAnchorFreshness.db.test.ts": 3,
        "tests/dev/fullSplitComposite.test.ts": 1,
        // Two asserted hrefs: the RIA corpus case and the FORM-tab case both
        // compare buildSheetDeepLink's output against the literal it must produce
        // (spec 2026-08-27-wizard-warning-row-links-copy §2.5, AC-1/AC-4).
        "tests/drive/unknownFieldAnchors.test.ts": 2,
        "tests/e2e/_pillFocusLiveEntry.tsx": 1,
        "tests/e2e/_publishedReviewModalHarness.tsx": 1,
        "tests/e2e/_skeletonParityHarness.tsx": 1,
        "tests/sheet-links/buildSheetDeepLink.test.ts": 1,
      });
      expect(builderCounts).toEqual({
        "app/admin/_showReviewModal.tsx": 3,
        "app/api/admin/onboarding/finalize/route.ts": 1,
        "components/admin/NoteWarningCard.tsx": 3,
        "components/admin/OnboardingWizard.tsx": 1,
        "components/admin/PerShowActionableWarnings.tsx": 3,
        // The freshness DETECTOR, which is a non-rendering consumer and the only
        // one in this census. It hashes the RESOLVED href rather than the raw
        // source anchor, because the builder collapses every anchor outside the
        // allowlist onto one `#gid=0` and two different unusable anchors
        // therefore render the same link. Calling the shipped builder is the
        // point: a local reimplementation of that normalization would be a
        // second source of truth that drifts the first time the allowlist
        // changes. Count includes the prose that explains the collapse.
        "components/admin/review/sectionFreshness.ts": 6,
        "components/admin/wizard/Step3Review.tsx": 1,
        "components/admin/wizard/Step3ReviewModal.tsx": 3,
        "components/admin/wizard/Step3SheetCard.tsx": 3,
        "components/admin/wizard/step3ReviewSections.tsx": 8,
        "components/crew/primitives/CardHeaderActions.tsx": 1,
        "components/crew/primitives/SourceLink.tsx": 5,
        "components/crew/sections/BudgetSection.tsx": 1,
        "components/crew/sections/CrewSection.tsx": 1,
        "components/crew/sections/GearSection.tsx": 1,
        "components/crew/sections/ScheduleSection.tsx": 1,
        "components/crew/sections/TodaySection.tsx": 1,
        "components/crew/sections/TravelSection.tsx": 1,
        "components/crew/sections/VenueSection.tsx": 1,
        "components/shared/CardReportTrigger.tsx": 1,
        // Carries the `SourceAnchor` type import that came out of
        // OnboardingWizard.tsx with the Step-3 row assembly (2026-08-02
        // assembleStep3Row extraction). OnboardingWizard keeps its own import,
        // so this is a NEW row, not a moved one.
        "lib/admin/assembleStep3Row.ts": 1,
        // The staged crew preview's Supabase read imports SourceAnchor to type the
        // row's `source_anchors` column (2026-08-15 step3-crew-preview §2.1).
        "lib/admin/lookupStagedRow.ts": 1,
        "lib/admin/step3SectionStatus.ts": 1,
        "lib/adminAlerts/alertActions.ts": 5,
        "lib/data/getShowForViewer.ts": 2,
        // The staged adapter carries `sourceAnchors` straight onto the projection.
        "lib/data/stagedShowForViewer.ts": 1,
        "lib/dev/publishedModalFixture.ts": 4,
        "lib/drive/crewRoleAnchors.ts": 1,
        "lib/drive/showDayTimeAnchors.ts": 1,
        "lib/drive/sourceAnchors.ts": 1,
        "lib/drive/unknownFieldAnchors.ts": 2,
        // Type-only `SourceAnchor` import on the Phase-D shadow-payload parse boundary,
        // which surfaces the staged anchors the finalize-cas apply forwards (2026-08-03).
        "lib/onboarding/shadowPayload.ts": 1,
        "lib/parser/sectionHeaderNormalize.ts": 1,
        "lib/parser/types.ts": 2,
        "lib/sheet-links/buildSheetDeepLink.ts": 1,
        "lib/sync/applyParseResult.ts": 1,
        "lib/sync/attachWarningAnchors.ts": 1,
        "lib/sync/phase1.ts": 1,
        "lib/sync/phase2.ts": 1,
        "lib/sync/runOnboardingScan.ts": 1,
        "lib/sync/runScheduledCronSync.ts": 1,
      });
      // r34: the three adopters' sheet-href VARIABLES are the last static
      // acquisition path — a sibling hand-rolled `<a href={openSheetHref}>`
      // adds a token occurrence, and renaming the variable to dodge the pin
      // zeroes one. Exact counts, escape spellings included via the cooked
      // scan.
      const HREF_TOKEN_PINS: Array<[string, string, number]> = [
        ["components/admin/showpage/PublishedReviewModal.tsx", "openSheetHref", 5],
        ["components/admin/wizard/Step3ReviewModal.tsx", "sheetLink", 3],
        ["components/admin/wizard/step3ReviewSections.tsx", "sheetHref", 7],
      ];
      for (const [rel, token, pinned] of HREF_TOKEN_PINS) {
        const src = readFileSync(join(root, rel), "utf8");
        const raw = [
          ...src.matchAll(new RegExp(`(?<![A-Za-z0-9_$])${token}(?![A-Za-z0-9_$])`, "g")),
        ].length;
        const cooked = cookedFragmentExtra(src, rel, token);
        expect(raw + cooked, `${rel}: ${token} token count`).toBe(pinned);
      }
    },
  );

  it(
    "icon-only anchors in the admin tree are censused by exact set (r35)",
    { timeout: 30_000 },
    () => {
      // r35: the drift class is the ICON-ONLY sheet anchor, and the attack
      // shape is census-able directly — an `<a>` whose subtree carries no
      // rendered text (no non-whitespace JsxText, no expression child, which
      // may render text) is an icon-only anchor wherever its href came from,
      // pinned here by exact per-file count. A sibling hand-rolled icon
      // anchor reusing ANY existing URL variable adds a row and teaches this
      // guard first. Text-labeled anchors are the site-C pattern — visible
      // words carry the affordance — and are not the drift class. URL-value
      // REUSE beyond this shape (prop drilling, aliased locals feeding
      // text-labeled links) is intra-file dataflow: out of a static guard's
      // scope with the other computed forms, owned by the invariant-8 UI
      // gate and review, exactly as runtime indirection is.
      const root = join(__dirname, "..", "..", "..");
      const found: Record<string, number> = {};
      for (const file of walkedFiles(root)) {
        const rel = file.slice(root.length + 1);
        if (!/^(components\/admin|app\/admin)\//.test(rel)) continue;
        if (!/\.(tsx|jsx)$/.test(rel)) continue;
        const src = readFileSync(file, "utf8");
        if (!src.includes("<a")) continue;
        const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        // r36: an expression child is text-bearing only when it can RENDER
        // text — a wrapped element (`{<ExternalLink />}`), `{null}`, and a
        // whitespace-only string are not text; anything else (identifiers,
        // calls, member access) is conservatively text-bearing so legit
        // `{title}` links stay out of the census. Visually hidden text
        // (sr-only) and single-symbol glyph children are HIDING — review's
        // failure class per the dataflow ratification above, not this
        // census's.
        // r37: recursion is over RENDERED CHILDREN only — attributes never
        // render text, so `<ExternalLink aria-hidden={true} />` must not
        // read as text-bearing via its `{true}` prop (the default
        // expression branch is for CHILD expressions, where an identifier
        // can render text).
        const textBearing = (node: ts.Node): boolean => {
          if (ts.isJsxText(node)) return node.text.trim() !== "";
          if (ts.isJsxExpression(node)) {
            const e = node.expression;
            if (e === undefined) return false;
            if (ts.isStringLiteralLike(e)) return e.text.trim() !== "";
            if (e.kind === ts.SyntaxKind.NullKeyword) return false;
            if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) {
              return textBearing(e);
            }
            return true;
          }
          if (ts.isJsxSelfClosingElement(node)) return false;
          if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
            return node.children.some((c) => textBearing(c));
          }
          return false;
        };
        const visit = (node: ts.Node): void => {
          // r36: a self-closing `<a />` renders no text by construction
          // (pseudo-element/CSS content included) — censused too.
          if (
            ts.isJsxSelfClosingElement(node) &&
            ts.isIdentifier(node.tagName) &&
            node.tagName.text === "a"
          ) {
            found[rel] = (found[rel] ?? 0) + 1;
          }
          if (
            ts.isJsxElement(node) &&
            ts.isIdentifier(node.openingElement.tagName) &&
            node.openingElement.tagName.text === "a" &&
            !node.children.some((c) => textBearing(c))
          ) {
            found[rel] = (found[rel] ?? 0) + 1;
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
      expect(found).toEqual({
        // The bell panel's chevron affordance (reviewed, not a sheet link).
        "components/admin/BellPanel.tsx": 1,
        // The component this whole guard contains.
        "components/admin/SheetIconLink.tsx": 1,
        // Three icon-only CONTACT affordances (the crew-row call action and
        // the tel:/mailto: pair) plus the staged-diagram image anchor
        // (img-only, aria-labeled — the r37 attribute-expression fix
        // surfaced it) — none is a sheet link.
        "components/admin/wizard/step3ReviewSections.tsx": 4,
      });
    },
  );

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
    // r16 — the specifier ARGUMENT unwraps through the same transparent
    // wrappers as the callee, and a no-substitution template is a static
    // string too:
    expect(
      classNameViolations('const m = require(("@/components/admin/SheetIconLink"));'),
    ).toHaveLength(1);
    expect(
      classNameViolations("const m = require(`@/components/admin/SheetIconLink`);"),
    ).toHaveLength(1);
    expect(
      classNameViolations('const p = import(("@/tests/helpers/x") as string);', "lib/consumer.ts"),
    ).toHaveLength(1);
    // r16 — webpack resource query/fragment rides the specifier, not the
    // resolved resource; stripping happens before the suffix check:
    expect(
      classNameViolations(
        'import { "SheetIconLink" as X } from "@/components/admin/SheetIconLink?off-contract";',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      classNameViolations('export * from "@/components/admin/SheetIconLink#frag";'),
    ).toHaveLength(1);
    // r17 — AMD require/define carry specifiers in ARRAY arguments:
    expect(
      classNameViolations('require(["@/components/admin/SheetIconLink"], (m) => m);'),
    ).toHaveLength(1);
    expect(
      classNameViolations('define(["exports", "@/components/admin/SheetIconLink"], (e, m) => m);'),
    ).toHaveLength(1);
    expect(
      classNameViolations('define("app", ["@/tests/helpers/x"], (h) => h);', "lib/consumer.ts"),
    ).toHaveLength(1);
    // r29 — string-literal binding spellings produce no Identifier node:
    expect(
      classNameViolations('import { "SheetIconLink" as X } from "@/lib/sheet-icon";').length,
    ).toBeGreaterThan(0);
    expect(
      classNameViolations('export { X as "SheetIconLink" } from "./somewhere";').length,
    ).toBeGreaterThan(0);
    expect(classNameViolations('expect(name).toBe("SheetIconLink");', "tests/x.test.ts")).toEqual(
      [],
    );
    // r24 — resolution APIs are specifier-bearing: the one-hop
    // require(require.resolve(lit)) composition, the bare resolve call, the
    // webpack resolveWeak twin, the ESM import.meta.resolve twin, and the
    // wrapped/element-access spellings all surface the inner literal:
    expect(
      classNameViolations(
        'const m = require(require.resolve("@/components/admin/SheetIconLink"));',
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations('const p = require.resolve("@/components/admin/SheetIconLink");'),
    ).toHaveLength(1);
    expect(
      classNameViolations('const p = require.resolveWeak("@/components/admin/SheetIconLink");'),
    ).toHaveLength(1);
    expect(
      classNameViolations('const p = import.meta.resolve("@/components/admin/SheetIconLink");'),
    ).toHaveLength(1);
    expect(
      classNameViolations(
        'const p = (module.require)["resolve"]("@/components/admin/SheetIconLink");',
      ),
    ).toHaveLength(1);
    expect(
      classNameViolations('const h = require.resolve("@/tests/helpers/x");', "lib/consumer.ts"),
    ).toHaveLength(1);
    // r17 — context modules select by directory + pattern; the mechanism is
    // denied outright, and the `context` fragment gates the parse:
    expect(
      classNameViolations('const ctx = require.context("./components/admin", false, /Link$/);'),
    ).toHaveLength(1);
    expect(
      classNameViolations('const ctx = import.meta.webpackContext("./components", {});'),
    ).toHaveLength(1);
    expect(needsParse('const c = require.context("../", true, /Sheet$/);', "lib/x.ts")).toBe(true);
    // r17 — vertical margins shift the exactly-met 44px overlay out of a
    // 44px row; only horizontal margins + order are positional:
    expect(classNameViolations('<SheetIconLink className="mt-0.5" />')).toHaveLength(1);
    expect(classNameViolations('<SheetIconLink className="sm:mb-1" />')).toHaveLength(1);
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
    // r20: pnpm resolution controls are FIRST-PARTY package mutation — a root
    // `resolutions`/`overrides`/`pnpm.*` entry or a workspace
    // overrides/patchedDependencies/catalog key can redirect an
    // already-pinned config package onto tracked local bytes (a .tgz, a
    // patch) without touching the bare-import set, and a .pnpmfile.cjs hook
    // rewrites resolution at install time. All absent; a future legitimate
    // use teaches this guard first.
    expect(pkg.resolutions).toBeUndefined();
    expect(pkg.overrides).toBeUndefined();
    expect(pkg.pnpm).toBeUndefined();
    const wsKeys = [...workspaceYaml.matchAll(/^([A-Za-z][A-Za-z0-9_-]*)\s*:/gm)].map((m) => m[1]);
    expect(wsKeys, "pnpm-workspace.yaml top-level keys").toEqual(["allowBuilds"]);
    const pnpmfiles = execFileSync("git", ["ls-files", "--", "*pnpmfile*"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(pnpmfiles, "no tracked pnpmfile hooks").toBe("");
    // r22: the pnpmfile pin above matches FILENAMES, but pnpm accepts
    // arbitrary hook paths via .npmrc (`pnpmfile=hooks.cjs`,
    // `global-pnpmfile=…`) — a tracked .npmrc would re-open install-time
    // resolution rewriting under any hook name the glob never sees. No other
    // tracked surface can point at a hook: the workspace-yaml top-level keys
    // are pinned above, manifest `pnpm` is pinned absent, and env/CLI are not
    // tracked state. Zero tracked npmrc files today; a future legitimate one
    // teaches this guard (and its key denylist) first.
    const npmrcs = execFileSync("git", ["ls-files", "--", "*npmrc*"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(npmrcs, "no tracked npmrc (pnpm hook-path redirect surface)").toBe("");
    // r17: package scope is PER-DIRECTORY — a tracked nested package.json
    // (`components/package.json`) carries its own imports/exports/browser
    // remaps that the root-manifest pins above never see, and resolvers honor
    // the NEAREST manifest. The only tracked manifest IS the root one; a
    // future legitimate nested package must teach this guard first.
    const manifests = execFileSync("git", ["ls-files", "--", "*package.json"], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    // W-PARITY: the font-escape fixtures model a real dependency, so they carry
    // real nested manifests — one of them declares an `exports` subpath, which
    // is EXACTLY the mechanism this pin exists to stop. They are admitted on a
    // structural fence, not on intent: they live under a `__fixtures__` segment
    // inside `tests/`, and the tests/-import boundary asserted earlier in this
    // same file denies every shipped tree from importing any specifier
    // containing `tests/`. A resolver honours the nearest manifest only for a
    // module resolved from inside its directory, and no shipped module can be.
    // The carve is spelled as "under tests/**/__fixtures__/", so a manifest
    // dropped anywhere else — including elsewhere under tests/ — still fails.
    const FIXTURE_MANIFEST = /^tests\/(?:[^/]+\/)*__fixtures__\//;
    const fixtureManifests = manifests.filter((m) => FIXTURE_MANIFEST.test(m));
    expect(manifests.filter((m) => !FIXTURE_MANIFEST.test(m))).toEqual(["package.json"]);
    // PREMISE, both directions. Without the first, the carve would be vacuous
    // the day the fixtures move and would silently stop describing anything;
    // without the second, a regex that matched everything would read as a pass.
    expect(fixtureManifests.length, "the fixture manifests this carve admits").toBeGreaterThan(0);
    expect(FIXTURE_MANIFEST.test("components/package.json")).toBe(false);
    expect(FIXTURE_MANIFEST.test("tests/styles/package.json")).toBe(false);
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
    // r21: Next searches next.config.js, then .mjs, then .ts — a tracked
    // higher-priority entry would silently REPLACE the graph this collector
    // scans. The tracked entry set is exactly the file it starts at.
    const configEntries = execFileSync("git", ["ls-files", "--", "next.config*"], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(configEntries, "the tracked Next config entry").toEqual(["next.config.ts"]);
    const reachable = configReachableFiles(root);
    expect(reachable.files, "the config graph starts at the entry").toContain("next.config.ts");
    // r19: the packages the config INVOKES are pinned by exact set — a
    // config-wrapper package executes at build time and could hand Next an
    // alias from node_modules, outside every first-party scan. Adding a new
    // wrapper is a deliberate, reviewable act that teaches this guard first;
    // the CONTENT of these pinned dependencies is ratified supply-chain
    // trust (lockfile + dependency review own upgrades).
    expect(reachable.bareImports).toEqual(["@next/mdx", "@sentry/nextjs", "next"]);
    const configOffenders = [
      ...reachable.offenders,
      ...reachable.files.flatMap((rel) =>
        nextConfigAliasOffenders(readFileSync(join(root, rel), "utf8")).map((v) => `${rel}: ${v}`),
      ),
    ];
    // r30 (2026-08-09, next 16.3.0 bump — spec
    // docs/superpowers/specs/2026-08-09-next-1630-wedge-remeasure-design.md §3.1):
    // `typescript.tsconfigPath` is the r18 spelling that just became a REAL
    // config key. Next 16.3.0's build-time type-check reports diagnostics for
    // every file in the tsconfig project, including tests/** — five of which
    // import @/app/admin/dev/*, renamed aside by the build-artifact gate — so
    // the build reads a tests-excluding project instead. It is admitted on a
    // STRUCTURAL fence, not on intent: exactly one occurrence graph-wide, in
    // the entry file, as `typescript: { tsconfigPath: <string literal> }`, and
    // the file it names carries the SAME alias-free resolver state the root
    // config is pinned to. Any other spelling, site, or shape still offends,
    // and the r18 laundering path (an alternate tsconfig's `paths`) is closed
    // by reading that file here rather than by trusting the key's purpose.
    const TSCONFIG_PATH_OFFENSE =
      'next.config.ts: resolver-remap spelling "tsconfigPath" (cooked) in next.config.ts';
    expect(
      configOffenders.filter((o) => o !== TSCONFIG_PATH_OFFENSE),
      "no resolver-remap offense beyond the sanctioned tsconfigPath",
    ).toEqual([]);
    expect(
      configOffenders.filter((o) => o === TSCONFIG_PATH_OFFENSE),
      "exactly one tsconfigPath token, in the entry file",
    ).toEqual([TSCONFIG_PATH_OFFENSE]);
    // The sanctioned SHAPE, read from the AST: one `tsconfigPath` property,
    // string-literal value, nested directly inside the `typescript` property's
    // object literal. A shorthand, a computed key, a non-literal value, or the
    // same key under another parent never reaches `sanctionedTsconfigPaths`.
    const entrySf = ts.createSourceFile(
      "next.config.ts",
      readFileSync(join(root, "next.config.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const sanctionedTsconfigPaths: string[] = [];
    const collectTsconfigPath = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
        node.name.text === "tsconfigPath" &&
        ts.isStringLiteralLike(node.initializer)
      ) {
        const objectLiteral = node.parent;
        const owner = ts.isObjectLiteralExpression(objectLiteral)
          ? objectLiteral.parent
          : undefined;
        if (
          owner &&
          ts.isPropertyAssignment(owner) &&
          (ts.isIdentifier(owner.name) || ts.isStringLiteralLike(owner.name)) &&
          owner.name.text === "typescript"
        ) {
          sanctionedTsconfigPaths.push(node.initializer.text);
        }
      }
      ts.forEachChild(node, collectTsconfigPath);
    };
    collectTsconfigPath(entrySf);
    expect(sanctionedTsconfigPaths, "typescript.tsconfigPath, pinned by exact set").toEqual([
      "tsconfig.build.json",
    ]);
    // The tracked tsconfig set is pinned too: the build config is only closed
    // if a THIRD config cannot appear beside it unseen.
    const tsconfigs = execFileSync("git", ["ls-files", "--", "tsconfig*"], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .sort();
    expect(tsconfigs, "the tracked tsconfig set").toEqual(["tsconfig.build.json", "tsconfig.json"]);
    // The alternate config's own resolver state: it must inherit the root
    // config and add no alias of its own. `paths`/`baseUrl` absent here means
    // the effective values are the root ones, already pinned above.
    const buildRaw = ts.readConfigFile(join(root, sanctionedTsconfigPaths[0]!), ts.sys.readFile);
    expect(buildRaw.error).toBeUndefined();
    const buildConfig = buildRaw.config as {
      extends?: string;
      exclude?: string[];
      compilerOptions?: { paths?: Record<string, string[]>; baseUrl?: string };
    };
    expect(buildConfig.extends, "the build config extends the pinned root config").toBe(
      "./tsconfig.json",
    );
    expect(buildConfig.compilerOptions?.paths).toBeUndefined();
    expect(buildConfig.compilerOptions?.baseUrl).toBeUndefined();
    // r30/whole-diff-r1: `exclude` REPLACES the inherited array rather than
    // merging it, so the build config silently re-admitted every base
    // exclusion it failed to restate — including the build-artifact trees the
    // base `include` reaches via `<distDir>/types/**/*.ts`, which is how a
    // flag-unset build ends up type-checking an EARLIER artifact's emitted
    // references to the very app/admin/dev/* modules it just renamed aside
    // (probed: a planted `.next-dev/types/validator.ts` was excluded by the
    // base config and admitted by the build config, TS2307). The contract is
    // pinned as a DERIVATION, not a second list to keep in step: the build
    // config's exclusions are exactly the base's plus `tests`, so adding a
    // base exclusion without mirroring it fails HERE.
    const baseExclude = (raw.config as { exclude?: string[] }).exclude ?? [];
    expect(baseExclude.length, "the base config has exclusions to inherit").toBeGreaterThan(0);
    expect([...(buildConfig.exclude ?? [])].sort(), "build exclusions = base + tests").toEqual(
      [...baseExclude, "tests"].sort(),
    );
    // PREMISE, both directions. Without the first, the carve could sit over a
    // build config that excludes nothing and would silently stop describing
    // the reason it exists; without the second, a filter that admitted every
    // spelling would read as a pass.
    expect(buildConfig.exclude, "the build config's reason to exist").toContain("tests");
    expect(
      nextConfigAliasOffenders(
        'export default { typescript: { tsconfigPath: "x" }, turbopack: { resolveAlias: {} } };',
      ).length,
      "the offender scan still flags a second remap spelling beside tsconfigPath",
    ).toBeGreaterThan(1);
    // r23: the compiled-PAGE surface is a resolution surface too — adding
    // "md" to pageExtensions (or an MDX `extension` regex, denied via
    // REMAP_SPELLINGS above) turns tracked `.md` — a tree the walk treats as
    // prose — into compiled first-party source. r24: the pin is GRAPH-WIDE,
    // not entry-only — a reachable helper can hold
    // `{ pageExtensions: [...] }` that the entry merely spreads AFTER its own
    // property (the r13 lesson, replayed on a new key), so EVERY reachable
    // TS/JS module is parsed and exactly one `pageExtensions` property may
    // exist, in the entry file, every element a plain string literal, equal
    // to the current set. Reachable JSON carrying the key is an offense in
    // jsonRemapOffenses (a JSON file is never the sanctioned definition
    // site).
    const pageExtSets: Array<[string, string[]]> = [];
    // r25: property-shape collection alone is fail-open — shorthand
    // (`{ pageExtensions }`), string-literal computed keys, getters, later
    // dot/bracket assignments, and `delete` all reshape the config while
    // presenting no PropertyAssignment. Every one of those spellings still
    // carries the token as an identifier or string literal, so the pin
    // ALSO counts raw token occurrences graph-wide and requires exactly ONE
    // — the pinned entry property's own name. Non-literal computed keys are
    // config-space offenses (nextConfigAliasOffenders, r25).
    const pageExtTokenAt: string[] = [];
    for (const rel of reachable.files) {
      const graphSf = ts.createSourceFile(
        rel,
        readFileSync(join(root, rel), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        /\.(ts|mts|cts)$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
      );
      for (let i = 0; i < pageExtensionsTokenCount(graphSf); i += 1) pageExtTokenAt.push(rel);
      const collectPageExts = (node: ts.Node): void => {
        if (
          ts.isPropertyAssignment(node) &&
          (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
          node.name.text === "pageExtensions"
        ) {
          if (!ts.isArrayLiteralExpression(node.initializer)) {
            pageExtSets.push([rel, ["<non-array pageExtensions initializer>"]]);
          } else {
            pageExtSets.push([
              rel,
              node.initializer.elements.map((el) =>
                ts.isStringLiteralLike(el) ? el.text : "<non-literal pageExtensions element>",
              ),
            ]);
          }
        }
        ts.forEachChild(node, collectPageExts);
      };
      collectPageExts(graphSf);
    }
    expect(pageExtSets, "pageExtensions pinned by exact set, graph-wide").toEqual([
      ["next.config.ts", ["ts", "tsx", "mdx"]],
    ]);
    expect(
      pageExtTokenAt,
      "exactly one pageExtensions token spelling in the whole config graph",
    ).toEqual(["next.config.ts"]);
    // …and the named artifact stays impossible even if the pins above are
    // ever loosened: zero tracked .md under app/ (the only page-capable
    // tree). A future legitimate .md page teaches this guard first.
    const appMd = execFileSync("git", ["ls-files", "--", "app/*.md"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(appMd, "no tracked .md under app/ (page-candidate tripwire)").toBe("");
    // r29: a tracked SYMLINK is a filesystem-level alias — an extensionless
    // link `lib/sheet-icon → components/admin/SheetIconLink.tsx` resolves
    // for every bundler while the walk never reads it, the specifier never
    // ends with the component name, and no lane parses link targets. The
    // tracked symlink set is pinned by exact equality (both current entries
    // are documentation/fixture .md files); a new symlink teaches this
    // guard first.
    const symlinks = execFileSync("git", ["ls-files", "-s"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((l) => l.startsWith("120000 "))
      .map((l) => l.split("\t")[1]!)
      .sort();
    expect(symlinks, "tracked symlinks pinned by exact set").toEqual([
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M11-user-facing-docs.md",
      "tests/specLint/fixtures/cited/symlink.md",
    ]);
    // r30: a tracked REGULAR file with no extension (or an unmodeled one)
    // is a walk escape — `lib/sheet-icon` holding
    // `module.exports = require("../components/admin/SheetIconLink").…`
    // resolves as an exact-path import while no lane ever reads it, and its
    // consumer mentions neither the name nor the module path. Every tracked
    // file must carry a MODELED extension: a walked source extension, or a
    // non-executable type no pinned-config bundler resolves as code without
    // a rules/loader config (denied above). Extensionless files are pinned
    // to the exact dotfile set below. A new extension or dotfile teaches
    // this guard first.
    const MODELED_EXTS = new Set([
      ...SOURCE_EXTS,
      ".md",
      ".json",
      ".sql",
      ".png",
      ".webp",
      ".svg",
      ".ico",
      ".pdf",
      ".xlsx",
      ".css",
      ".html",
      ".yml",
      ".yaml",
      ".toml",
      ".txt",
      ".sh",
      ".fixture",
      ".snap",
      ".example",
      // A frozen git diff, committed as a replay fixture by the claim-sweep arm
      // (tests/specLint/fixtures/claimSweep/<rev>/repair.diff). It is fixture
      // DATA in its native format, not a build artifact.
      ".diff",
      // Font binaries, new to the repo at BL-INTER-NUMERAL-DISAMBIGUATION: the
      // self-hosted Inter subset the app loads, and the Google-served binary it
      // replaced, kept as the guard's historical regression fixture. Neither is
      // resolvable by the module graph, which is what this census is about.
      ".woff2",
      // The review-round corpus under docs/review-rounds/**: newline-delimited
      // JSON rows the codex-guard wrapper appends, one per dispatch. Data, like
      // .json above and unlike anything the bundler resolves - no pinned-config
      // resolver treats .jsonl as a module without a rules/loader entry (denied
      // above), and nothing imports one.
      ".jsonl",
      // The repo's first Python file: scripts/with-heavy-slot.py, the heavy-phase
      // slot wrapper. It is invoked as an argv to `python3` by a package.json
      // script and by agent sessions - never imported. No pinned-config bundler
      // resolves .py as a module without a rules/loader entry (denied above), and
      // the module graph cannot reach it at all.
      ".py",
      // The graduation artifact under docs/superpowers/plans/**: a unified diff
      // committed so the whole-diff review can read the ledger bytes that land
      // in the PR's LAST commit (invariant 12), where a review would otherwise
      // never see them. Applied with `git apply`, never imported; no pinned-config
      // resolver treats .patch as a module without a rules/loader entry (denied
      // above).
      ".patch",
    ]);
    const DOTFILE_BASENAMES = new Set([
      ".gitattributes",
      ".gitignore",
      ".nojekyll",
      ".prettierignore",
      ".prettierrc",
      ".vercelignore",
    ]);
    const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
      .trim()
      .split("\n");
    const unmodeled = tracked.filter((f) => {
      const base = f.slice(f.lastIndexOf("/") + 1);
      if (DOTFILE_BASENAMES.has(base)) return false;
      const stem = base.startsWith(".") ? base.slice(1) : base;
      const dot = stem.lastIndexOf(".");
      if (dot <= 0) return true;
      return !MODELED_EXTS.has(stem.slice(dot).toLowerCase());
    });
    expect(unmodeled, "every tracked file carries a modeled extension").toEqual([]);
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
    // r16 — the denied remap surface is wider than the two alias keys: the
    // webpack hook itself, failed-resolution fallback maps, resolver plugins,
    // module search roots, extension/description-file redirects, and request
    // rewriting:
    expect(nextConfigAliasOffenders("const cfg = { webpack: (c) => c };").length).toBeGreaterThan(
      0,
    );
    expect(
      nextConfigAliasOffenders('r.fallback = { "#sheet": "./components/x.tsx" };').length,
    ).toBeGreaterThan(0);
    expect(nextConfigAliasOffenders("r.extensionAlias = {};").length).toBeGreaterThan(0);
    expect(
      nextConfigAliasOffenders('new wp.NormalModuleReplacementPlugin(/x/, "y");').length,
    ).toBeGreaterThan(0);
    expect(nextConfigAliasOffenders('cfg.resolve.modules = ["aliases"];').length).toBeGreaterThan(
      0,
    );
    // r18 — keys that redirect which files/roots resolution reads carry the
    // same laundering power one indirection removed:
    expect(
      nextConfigAliasOffenders('const c = { typescript: { tsconfigPath: "tsconfig.ship.json" } };')
        .length,
    ).toBeGreaterThan(0);
    expect(
      nextConfigAliasOffenders("const c = { experimental: { externalDir: true } };").length,
    ).toBeGreaterThan(0);
    expect(
      nextConfigAliasOffenders('const c = { modularizeImports: { x: { transform: "y" } } };')
        .length,
    ).toBeGreaterThan(0);
    expect(
      nextConfigAliasOffenders('const c = { turbopack: { root: ".." } };').length,
    ).toBeGreaterThan(0);
    // r20 — the JSON lane shares the SAME remap-key set as the code lane:
    expect(jsonRemapOffenses({ modularizeImports: { x: {} } }, "cfg.json").length).toBeGreaterThan(
      0,
    );
    expect(
      jsonRemapOffenses({ typescript: { tsconfigPath: "t.json" } }, "cfg.json").length,
    ).toBeGreaterThan(0);
    expect(jsonRemapOffenses({ nested: { resolveAlias: {} } }, "cfg.json").length).toBeGreaterThan(
      0,
    );
    expect(jsonRemapOffenses({ remarkPlugins: [] }, "cfg.json")).toEqual([]);
    // r23 — extension-selection keys are remap keys in every lane:
    expect(jsonRemapOffenses({ extension: {} }, "cfg.json").length).toBeGreaterThan(0);
    expect(jsonRemapOffenses({ resolveExtensions: ["x.tsx"] }, "cfg.json").length).toBeGreaterThan(
      0,
    );
    // r24 — pageExtensions in reachable JSON is spread-fodder, denied (the
    // sanctioned definition site is the entry file's own pinned property):
    expect(jsonRemapOffenses({ pageExtensions: ["mdx"] }, "cfg.json").length).toBeGreaterThan(0);
    // r25 — every override spelling carries the token as an identifier or
    // string literal, so the graph-wide token count sees each one; a
    // non-literal computed key is an offense outright:
    const tokCount = (src: string): number =>
      pageExtensionsTokenCount(
        ts.createSourceFile("probe.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
      );
    expect(tokCount("const nextConfig = { pageExtensions };")).toBe(1);
    expect(tokCount('const c = { ["pageExtensions"]: ["md"] };')).toBe(1);
    expect(tokCount("const c = { get pageExtensions() { return ['md']; } };")).toBe(1);
    expect(tokCount('cfg.pageExtensions = ["md"];')).toBe(1);
    expect(tokCount('delete cfg["pageExtensions"];')).toBe(1);
    expect(tokCount("const unrelated = { remarkPlugins: [] };")).toBe(0);
    expect(
      nextConfigAliasOffenders('const c = { ["page" + "Extensions"]: ["md"] };').length,
    ).toBeGreaterThan(0);
  });

  it(
    "every live SheetIconLink call site keeps className positional-only string literals",
    { timeout: 30_000 },
    () => {
      const root = join(__dirname, "..", "..", "..");
      const files = walkedFiles(root);
      const adopters: string[] = [];
      const violations = files.flatMap((file) => {
        const rel = file.slice(root.length + 1);
        // The component's own file defines and exports the identifier — it is
        // the one place declaration references are the point, not an alias.
        if (rel === COMPONENT_FILE) return [];
        const src = readFileSync(file, "utf8");
        // r16 adopter census (same read, no extra walk): shipped files that
        // actually render the tag. tests/ renders ship nothing (the carve's
        // premise); MDX renders are already outright violations above.
        if (
          !/^tests\//.test(rel) &&
          !/\.mdx?$/.test(rel) &&
          src.includes(`<${NAME}`) &&
          rendersTag(src, rel)
        )
          adopters.push(rel);
        // Prefilter (see needsParse): a file that contains neither the bare
        // name, an escape spelling, nor (shipped trees) a tests/ fragment can
        // neither create a static alias nor launder through the carve.
        if (!needsParse(src, rel)) return [];
        return classNameViolations(src, rel).map((v) => `${rel}: ${v}`);
      });
      expect(violations).toEqual([]);
      // Pinned adopter set (r16): the consuming-context geometry (spec §5.1)
      // is unverifiable statically, so adoption itself is the reviewable
      // event — a new row lands only WITH its rect-intersection e2e and
      // impeccable pass.
      expect(adopters.sort()).toEqual([
        "components/admin/showpage/PublishedReviewModal.tsx",
        "components/admin/wizard/Step3ReviewModal.tsx",
        "components/admin/wizard/step3ReviewSections.tsx",
      ]);
    },
  );
});
