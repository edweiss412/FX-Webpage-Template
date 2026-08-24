// Shared scanner for the render-fault marking meta-test.
//
// The population is DERIVED, never listed: roots come from the manifest, files
// from a filesystem walk of those roots, candidates from the AST. A component
// added under a scanned root is covered the day it lands.
//
// The accept-set is keyed on the RENDERING CONSTRUCT, not on the comparison
// spelling. A recognizer that enumerates comparison forms is a denylist, and
// the catch-clause shape is the proof: it has no comparison to enumerate.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Node, Project, ScriptTarget, SyntaxKind, type SourceFile } from "ts-morph";
import { deriveScanRoots, parseManifestRoutes } from "@/scripts/help-screenshots-routes";

export const FAULT_ATTRIBUTE = "data-render-fault";
const INFRA_ERROR = "infra_error";
const TILE_ERRORS = "tileErrors";

export type GuardForm =
  | "literal-comparison"
  | "predicate-declaration"
  | "in-operator"
  | "catch-clause"
  | "tile-errors"
  | "switch-case"
  | "unknown";

export const ACCEPTED_FORMS: readonly GuardForm[] = [
  "literal-comparison",
  "predicate-declaration",
  "in-operator",
  "catch-clause",
  "tile-errors",
  "switch-case",
];

export type Candidate = {
  file: string;
  line: number;
  form: GuardForm;
  marked: boolean;
  guard: string;
};

export function scanRoots(): string[] {
  const manifest = readFileSync(
    join(process.cwd(), "scripts/help-screenshots.manifest.ts"),
    "utf8",
  );
  return deriveScanRoots(parseManifestRoutes(manifest));
}

function walk(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

export function scannedFiles(): string[] {
  return scanRoots().flatMap((root) => walk(join(process.cwd(), root)));
}

/**
 * Resolve an import specifier to a file on disk.
 *
 * ts-morph's own module resolution is not configured with the tsconfig paths
 * here, so `@/`-aliased imports resolve to nothing. Both cross-file hops this
 * scanner makes -- the imported type-guard predicate and the shared fallback
 * component -- arrive through that alias, so leaving it to the resolver would
 * silently drop the two cases the spec names as load-bearing.
 */
function resolveSpecifier(file: SourceFile, specifier: string): SourceFile | null {
  const base = specifier.startsWith("@/")
    ? join(process.cwd(), specifier.slice(2))
    : specifier.startsWith(".")
      ? join(file.getDirectoryPath(), specifier)
      : null;
  if (base === null) return null;

  const project = file.getProject();
  for (const extension of [".ts", ".tsx"]) {
    const candidate = base + extension;
    if (!existsSync(candidate)) continue;
    return project.getSourceFile(candidate) ?? project.addSourceFileAtPath(candidate);
  }
  return null;
}

/**
 * Does the component named `name`, imported into `file`, render the marker?
 *
 * Memoized. The shared fallback is returned by fourteen branches, and resolving
 * its module and re-walking its body once per branch made the scan too slow to
 * be a meta-test at all -- the first uncached version ran past 400 seconds over
 * the 265 scanned files.
 */
const componentMarkCache = new Map<string, boolean>();

/** The source file an identifier was imported from, if it was imported. */
function importSourceOf(file: SourceFile, name: string): SourceFile | null {
  for (const declaration of file.getImportDeclarations()) {
    const named = declaration
      .getNamedImports()
      .some((n) => (n.getAliasNode() ?? n.getNameNode()).getText() === name);
    const dflt = declaration.getDefaultImport()?.getText() === name;
    if (!named && !dflt) continue;
    return (
      declaration.getModuleSpecifierSourceFile() ??
      resolveSpecifier(file, declaration.getModuleSpecifierValue())
    );
  }
  return null;
}

/** Names of `v is T` predicates whose body tests an infra-error kind. */
function infraPredicateNames(file: SourceFile): Set<string> {
  const names = new Set<string>();

  const consider = (source: SourceFile): void => {
    for (const fn of [
      ...source.getDescendantsOfKind(SyntaxKind.ArrowFunction),
      ...source.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ]) {
      const returnType = fn.getReturnTypeNode();
      if (returnType === undefined || !Node.isTypePredicate(returnType)) continue;
      if (!fn.getText().includes(INFRA_ERROR)) continue;

      if (Node.isFunctionDeclaration(fn)) {
        const name = fn.getName();
        if (name !== undefined) names.add(name);
        continue;
      }
      const name = fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
      if (name !== undefined) names.add(name);
    }
  };

  consider(file);
  // Resolution is through the DECLARATION, wherever it lives. A scan keyed on
  // the identifier is a denylist with one entry: it breaks on a rename, on an
  // alias at the import site, and on a second predicate spelled differently.
  // Two live predicates already differ in both spelling and module.
  for (const declaration of file.getImportDeclarations()) {
    const resolved =
      declaration.getModuleSpecifierSourceFile() ??
      resolveSpecifier(file, declaration.getModuleSpecifierValue());
    if (resolved !== null && resolved !== undefined) consider(resolved);
  }

  return names;
}

/** Resolve an identifier to the initializer text of its declaration, once. */
function initializerText(node: Node): string | null {
  if (!Node.isIdentifier(node)) return null;
  for (const definition of node.getDefinitions()) {
    const declaration = definition.getDeclarationNode();
    if (declaration === undefined) continue;
    if (Node.isVariableDeclaration(declaration)) {
      return declaration.getInitializer()?.getText() ?? null;
    }
  }
  return null;
}

/**
 * Classify a guard, tracking POLARITY.
 *
 * A branch taken when the fault is ABSENT is not a fault branch, and the
 * distinction is not cosmetic: four crew sections pair
 * `faulted ? <SectionTileError/> : null` with
 * `allEmpty && !faulted ? <EmptyState/> : null`. Ignoring polarity classifies
 * the second as a fault too, and marking an EMPTY STATE means every healthy
 * capture of those sections gets refused -- the AC-7 failure mode wearing
 * different clothes.
 *
 * A genuine `!isOk(x)` fault guard would fall through to the reported residue
 * rather than being silently dropped, which is the right side to fail on. No
 * such site exists in the corpus today.
 */
function classifyExpression(
  node: Node,
  predicates: Set<string>,
  depth = 0,
  negated = false,
): GuardForm | null {
  if (depth > 2) return null;

  if (Node.isPrefixUnaryExpression(node)) {
    const flip = node.getOperatorToken() === SyntaxKind.ExclamationToken ? !negated : negated;
    return classifyExpression(node.getOperand(), predicates, depth, flip);
  }
  if (Node.isParenthesizedExpression(node)) {
    return classifyExpression(node.getExpression(), predicates, depth, negated);
  }
  if (negated) return null;

  if (Node.isBinaryExpression(node)) {
    const op = node.getOperatorToken().getKind();
    if (op === SyntaxKind.InKeyword) return "in-operator";
    if (
      op === SyntaxKind.EqualsEqualsEqualsToken ||
      op === SyntaxKind.ExclamationEqualsEqualsToken
    ) {
      if (node.getText().includes(INFRA_ERROR)) return "literal-comparison";
    }
    // A compound guard is accepted when either side is, at this polarity.
    return (
      classifyExpression(node.getLeft(), predicates, depth, negated) ??
      classifyExpression(node.getRight(), predicates, depth, negated)
    );
  }

  if (Node.isCallExpression(node)) {
    if (predicates.has(node.getExpression().getText())) return "predicate-declaration";
    if (node.getText().includes(TILE_ERRORS)) return "tile-errors";
  }

  if (Node.isPropertyAccessExpression(node) && node.getText().includes(TILE_ERRORS)) {
    return "tile-errors";
  }

  // The guard may be a boolean computed elsewhere. Resolving ONE hop keeps the
  // tileErrors and comparison shapes visible without becoming dataflow
  // analysis, which this arc deliberately does not carry.
  const initializer = initializerText(node);
  if (initializer !== null) {
    if (initializer.includes(TILE_ERRORS)) return "tile-errors";
    if (initializer.includes(INFRA_ERROR)) return "literal-comparison";
  }

  return null;
}

function jsxRoot(expression: Node | undefined): Node | null {
  if (expression === undefined) return null;
  if (
    Node.isJsxElement(expression) ||
    Node.isJsxSelfClosingElement(expression) ||
    Node.isJsxFragment(expression)
  ) {
    return expression;
  }
  if (Node.isParenthesizedExpression(expression)) return jsxRoot(expression.getExpression());
  return null;
}

/**
 * Does the branch's returned JSX carry the marker?
 *
 * The check is over the whole returned SUBTREE, not just its root element,
 * because that is exactly what the capture does: `detectRenderFaults` scans the
 * captured subtree for `[data-render-fault]` wherever it sits. A root-only
 * check would have been stricter than the runtime in the wrong direction --
 * the admin layout's failure screen wraps its marked div in a provider, and a
 * root-only check calls that unmarked while the capture sees it perfectly.
 *
 * Two spellings count. `data-render-fault` is the DOM attribute. `renderFault`
 * is the same marker at a COMPONENT boundary, where a DOM attribute cannot
 * cross and a prop is the only way to thread it -- pinned at the call site, so
 * only the fault branches count rather than every use of the component.
 *
 * Plus ONE hop into a shared fallback component, for the branches that return a
 * bare `<SectionTileError />`. Marking that component once is the honest
 * factoring: fourteen branches render it, the capture reads the DOM, and the
 * DOM cannot tell where the attribute was authored.
 */
const MARKER = /(?:data-render-fault|renderFault)[=\s]/;

function carriesAttribute(jsx: Node | null): boolean {
  if (jsx === null) return false;
  if (MARKER.test(jsx.getText())) return true;

  // A branch may build the marked element into a local and embed it:
  // `const note = (<section data-render-fault=... />)` then `return <div>{note}</div>`.
  // The marker reaches the DOM either way, so resolving one hop through an
  // embedded identifier keeps the guard from failing a correct implementation.
  for (const container of jsx.getDescendantsOfKind(SyntaxKind.JsxExpression)) {
    const inner = container.getExpression();
    if (inner === undefined || !Node.isIdentifier(inner)) continue;
    const initializer = initializerText(inner);
    if (initializer !== null && MARKER.test(initializer)) return true;
  }

  const opening = Node.isJsxElement(jsx) ? jsx.getOpeningElement() : jsx;
  if (!Node.isJsxOpeningElement(opening) && !Node.isJsxSelfClosingElement(opening)) return false;

  const tag = opening.getTagNameNode();
  if (!Node.isIdentifier(tag)) return false;
  const name = tag.getText();
  const file = opening.getSourceFile();
  const key = `${file.getFilePath()}::${name}`;

  const cached = componentMarkCache.get(key);
  if (cached !== undefined) return cached;

  const marked = componentRendersMarker(file, name);
  componentMarkCache.set(key, marked);
  return marked;
}

function componentRendersMarker(file: SourceFile, name: string): boolean {
  // Same file first: several fault surfaces are local helpers, not imports.
  for (const source of [file, importSourceOf(file, name)]) {
    if (source === null) continue;
    for (const declaration of [...source.getFunctions(), ...source.getVariableDeclarations()]) {
      if (declaration.getName() !== name) continue;
      const body = Node.isFunctionDeclaration(declaration)
        ? declaration.getBody()
        : declaration.getInitializer();
      if (body === undefined) continue;
      const returned = firstReturnedJsx(body);
      if (returned !== null && MARKER.test(returned.getText())) return true;
    }
  }
  return false;
}

function firstReturnedJsx(body: Node): Node | null {
  for (const statement of body.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    // Only returns belonging to THIS branch, not to a nested function.
    const owner = statement.getFirstAncestor(
      (a) => Node.isArrowFunction(a) || Node.isFunctionDeclaration(a) || a === body,
    );
    if (owner !== body) continue;
    const jsx = jsxRoot(statement.getExpression());
    if (jsx !== null) return jsx;
  }
  return null;
}

/**
 * Every JSX-returning fault branch under the manifest-derived roots.
 *
 * A branch qualifies by returning JSX directly; its guard FORM then decides
 * whether it is accepted or reported by name. Branches that render nothing —
 * a flag assignment, an announce-only effect, a predicate definition — are not
 * candidates at all: tracing a flag to the JSX that consumes it is dataflow
 * analysis this arc does not carry, and those live in the reported residue.
 */
export function scanCandidates(): Candidate[] {
  const project = new Project({
    compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
    skipAddingFilesFromTsConfig: true,
  });
  const paths = scannedFiles();
  project.addSourceFilesAtPaths(paths);

  const candidates: Candidate[] = [];

  for (const path of paths) {
    const source = project.getSourceFileOrThrow(path);
    const predicates = infraPredicateNames(source);
    const file = relative(process.cwd(), path);

    const push = (node: Node, jsx: Node | null, form: GuardForm, guard: string): void => {
      if (jsx === null) return;
      candidates.push({
        file,
        line: node.getStartLineNumber(),
        form,
        marked: carriesAttribute(jsx),
        guard: guard.replace(/\s+/g, " ").slice(0, 80),
      });
    };

    for (const statement of source.getDescendantsOfKind(SyntaxKind.IfStatement)) {
      const jsx = firstReturnedJsx(statement.getThenStatement());
      if (jsx === null) continue;
      const guard = statement.getExpression();
      const form = classifyExpression(guard, predicates);
      if (form === null) {
        // The universe is located by structure plus a FAULT-shaped guard. The
        // vocabulary is deliberately narrow: `null` and `missing` were tried
        // and withdrawn, because an optional-content check reads identically
        // to a fault check and six ordinary routing branches came back as
        // candidates. A false candidate is not free — it lands in the reported
        // residue, where it dilutes exactly the signal the residue carries.
        if (!/error|fail|infra|degrad|unavailable|corrupt/i.test(guard.getText())) continue;
        push(statement, jsx, "unknown", guard.getText());
        continue;
      }
      push(statement, jsx, form, guard.getText());
    }

    for (const conditional of source.getDescendantsOfKind(SyntaxKind.ConditionalExpression)) {
      const jsx = jsxRoot(conditional.getWhenTrue());
      if (jsx === null) continue;
      const guard = conditional.getCondition();
      const form = classifyExpression(guard, predicates);
      // ASYMMETRY, stated rather than left to be discovered: the IfStatement arm
      // above falls back to a vocabulary probe and reports an unclassifiable
      // guard as `unknown` residue. This arm drops it silently. A ternary whose
      // whenTrue is JSX is exactly the shape layer 1 claims to reach, so this is
      // a gap INSIDE the claimed coverage, not the documented ceiling at spec
      // section 4.2. Probed: 714 such ternaries under the derived roots, 91 on a
      // fault-vocabulary guard. Closing it means declaring every unclassifiable
      // one, which is a residue population this arc cannot hand-write without
      // reducing the registry to boilerplate and destroying the signal it
      // carries. Tracked as BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY.
      if (form === null) continue;
      push(conditional, jsx, form, guard.getText());
    }

    for (const clause of source.getDescendantsOfKind(SyntaxKind.CaseClause)) {
      if (!clause.getText().includes(INFRA_ERROR)) continue;
      push(clause, firstReturnedJsx(clause), "switch-case", clause.getExpression().getText());
    }

    for (const clause of source.getDescendantsOfKind(SyntaxKind.CatchClause)) {
      push(clause, firstReturnedJsx(clause.getBlock()), "catch-clause", "catch");
    }
  }

  return candidates.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
