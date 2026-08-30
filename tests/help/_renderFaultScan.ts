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
import {
  Node,
  Project,
  type ReturnStatement,
  ScriptTarget,
  SyntaxKind,
  type SourceFile,
} from "ts-morph";
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
export function resolveSpecifier(file: SourceFile, specifier: string): SourceFile | null {
  const base = specifier.startsWith("@/")
    ? join(process.cwd(), specifier.slice(2))
    : specifier.startsWith(".")
      ? join(file.getDirectoryPath(), specifier)
      : null;
  if (base === null) return null;

  const project = file.getProject();
  // The two directory-index forms are not decoration. Five live imports in the
  // scan roots -- four of `@/lib/log`, one of `@/lib/parser` -- resolve only
  // through an index file, and without them a caller deriving a population from
  // this resolver silently gets 209 modules where TypeScript sees 211. Neither
  // missed module happens to hold a violation today, so the omission would have
  // shown up as a clean run over a smaller population rather than as a failure.
  for (const extension of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
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

/**
 * Does this type predicate test FOR a fault, rather than merely mention one?
 *
 * Runs the predicate's returned expression through the branch classifier, with
 * an empty predicate set so it cannot recurse into itself. A predicate that
 * classifies as a fault guard is registered; one that negates it is not.
 */
function predicateTestsForFault(fn: Node): boolean {
  const returned =
    fn
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .map((r) => r.getExpression())
      .find((e) => e !== undefined) ??
    (Node.isArrowFunction(fn) && !Node.isBlock(fn.getBody()) ? fn.getBody() : undefined);
  if (returned === undefined) return false;
  return classifyExpression(returned, new Set<string>()) !== null;
}

/** Names of `v is T` predicates whose body tests an infra-error kind. */
export function infraPredicateNames(file: SourceFile): Set<string> {
  const names = new Set<string>();

  const consider = (source: SourceFile): void => {
    for (const fn of [
      ...source.getDescendantsOfKind(SyntaxKind.ArrowFunction),
      ...source.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ]) {
      const returnType = fn.getReturnTypeNode();
      if (returnType === undefined || !Node.isTypePredicate(returnType)) continue;
      if (!fn.getText().includes(INFRA_ERROR)) continue;
      // MENTIONING the literal is not the same as testing FOR it. `isHealthy`
      // spelled `v.kind !== "infra_error"` mentions it while meaning the
      // opposite, and registering it made every `if (isHealthy)` a fault guard.
      // The predicate's own returned expression goes through the same classifier
      // the branch guards do, so polarity is decided in exactly one place.
      if (!predicateTestsForFault(fn)) continue;

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

    // Resolution is by DECLARATION, but the call site spells the LOCAL name. An
    // aliased import (`import { isInfraError as bad }`) registered the
    // declaration's name while `classifyExpression` compared `bad`, so the
    // predicate was neither accepted nor reported -- silently skipped, which is
    // the one outcome the consequence bound forbids. The alias is mapped onto
    // the declaration it resolves to, which is what "aliases do not break
    // declaration-based resolution" was always supposed to mean.
    for (const named of declaration.getNamedImports()) {
      const alias = named.getAliasNode()?.getText();
      if (alias !== undefined && names.has(named.getNameNode().getText())) names.add(alias);
    }
  }

  return names;
}

/** Resolve an identifier to the initializer text of its declaration, once. */
/** The initializer NODE, so a caller can run a predicate over it rather than its text. */
function initializerNode(node: Node): Node | null {
  if (!Node.isIdentifier(node)) return null;
  for (const definition of node.getDefinitions()) {
    const declaration = definition.getDeclarationNode();
    if (declaration === undefined) continue;
    if (Node.isVariableDeclaration(declaration)) {
      return declaration.getInitializer() ?? null;
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
export function classifyExpression(
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
    // POLARITY IS PART OF THE GUARD. `=== "infra_error"` opens a fault branch;
    // `!== "infra_error"` opens the HEALTHY one. Treating them alike classified
    // healthy branches as faults, which would demand a marker on a branch that
    // renders fine -- a false candidate, and the residue registry is where false
    // candidates go to dilute the signal it exists to carry.
    if (op === SyntaxKind.EqualsEqualsEqualsToken) {
      if (node.getText().includes(INFRA_ERROR)) return "literal-comparison";
    }
    // A DISJUNCTION fires on either side, so it is a fault guard only when BOTH
    // sides are: `kind === "infra_error" || kind === "ok"` opens a branch that
    // renders for a healthy state too. A conjunction is narrower than either
    // side, so one fault-shaped side is enough.
    const left = classifyExpression(node.getLeft(), predicates, depth, negated);
    const right = classifyExpression(node.getRight(), predicates, depth, negated);
    if (op === SyntaxKind.BarBarToken) return left !== null && right !== null ? left : null;
    return left ?? right;
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
  // The one-hop re-runs THIS classifier on the initializer node rather than
  // substringing its text. Substring matching bypassed the polarity and
  // disjunction rules entirely: `const isHealthy = result.kind !== "infra_error"`
  // mentions the literal, so `if (isHealthy)` classified as a fault guard and a
  // HEALTHY branch would have been pressured to carry a marker that refuses
  // healthy captures. Same defect, and same repair, as the marker hop above:
  // resolve to the node and run the one rule.
  const initializer = initializerNode(node);
  if (initializer !== null && depth < 2) {
    const classified = classifyExpression(initializer, predicates, depth + 1, negated);
    if (classified !== null) return classified;
    // NO substring fallback here. One stood at this line and re-classified an
    // initializer as `tile-errors` merely because its TEXT mentioned the
    // literal, which is the exact bypass the paragraph above condemns: it
    // skipped both the negation and the disjunction rules, so a negated one-hop
    // and a mixed disjunction each classified a HEALTHY-capable guard as a
    // fault guard. If the one rule cannot classify the initializer, the answer
    // is "unclassifiable" and the site reports as residue -- a surfaced gap,
    // not a guess that silently pressures a healthy branch to carry a marker.
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
 * Can this element's marker EVER reach the DOM?
 *
 * The sibling question to `attributeAlwaysPresent`, and a different one. A
 * SHARED component must mark on every render, so certifying it asks "always".
 * A HAND-MARKED fault site is conditional BY DESIGN -- the canonical shape is
 * `renderFault={isInfra ? "telemetry-events" : undefined}`, which must not mark
 * a healthy render -- so asking "always" there would fail correct code.
 *
 * Round 6 reported the hand registry as text-matching and prescribed
 * `attributeAlwaysPresent`. The defect was real and the prescription was not:
 * applied literally it failed `TelemetryOverviewStrip.tsx:252`, a correct
 * marker. What the probe actually demonstrated is narrower -- that
 * `data-render-fault={undefined}` passed, and that value can NEVER produce an
 * attribute. So the rule for a hand-marked site is "can render", not "always".
 *
 * Absent by construction: an omitted or comment-only expression, a literal
 * `undefined`/`null`, and a conditional or logical chain in which no arm can
 * yield a value. Everything else can render.
 */
export function attributeCanRender(node: Node): boolean {
  const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node;
  if (!Node.isJsxOpeningElement(opening) && !Node.isJsxSelfClosingElement(opening)) return false;

  const yieldsValue = (expression: Node | undefined): boolean => {
    if (expression === undefined) return false;
    if (/^(?:undefined|null)$/.test(expression.getText().trim())) return false;
    // WRAPPERS are unwrapped rather than defaulting to renderable. The default
    // at the bottom of this function is "can render", which is the dangerous
    // direction -- it lets an impossible marker satisfy a hand registry -- and
    // `(undefined)`, `undefined as string | undefined` and `void 0` all reached
    // it, since none matches the literal test above. These are wrappers around
    // an expression, not new grammar families: each defers to what it wraps.
    if (Node.isParenthesizedExpression(expression)) return yieldsValue(expression.getExpression());
    if (
      Node.isAsExpression(expression) ||
      Node.isSatisfiesExpression(expression) ||
      Node.isNonNullExpression(expression) ||
      Node.isTypeAssertion(expression)
    ) {
      return yieldsValue(expression.getExpression());
    }
    // `void <anything>` evaluates to `undefined`, always.
    if (Node.isVoidExpression(expression)) return false;
    if (Node.isConditionalExpression(expression)) {
      return yieldsValue(expression.getWhenTrue()) || yieldsValue(expression.getWhenFalse());
    }
    if (Node.isBinaryExpression(expression)) {
      const op = expression.getOperatorToken().getText();
      if (op === "&&") return yieldsValue(expression.getRight());
      if (op === "||" || op === "??") {
        return yieldsValue(expression.getLeft()) || yieldsValue(expression.getRight());
      }
    }
    return true;
  };

  for (const attribute of opening.getAttributes()) {
    if (!Node.isJsxAttribute(attribute)) continue;
    const name = attribute.getNameNode().getText();
    if (name !== "data-render-fault" && name !== "renderFault") continue;

    const initializer = attribute.getInitializer();
    if (initializer === undefined) return true;
    if (Node.isStringLiteral(initializer)) return true;
    if (!Node.isJsxExpression(initializer)) return true;
    if (yieldsValue(initializer.getExpression())) return true;
  }
  return false;
}

/**
 * Does this element carry a marker that ALWAYS reaches the DOM?
 *
 * Text-matching the JSX source counted things React never renders. Probed at
 * whole-diff review r4b: a component containing only
 * `{/* thread the renderFault prop here *\/}` read as marked, and so did
 * `data-render-fault={undefined}`, `={fault ? "x" : undefined}` and
 * `={reason && "x"}`. React omits an attribute whose value is `undefined` or
 * `false`, so each of those is a marker that is not there -- a FALSE POSITIVE in
 * the enforcement, which is worse than a miss because it certifies coverage that
 * does not exist.
 *
 * The narrow rule: only a value that cannot be absent counts. A bare attribute,
 * a string literal and a template literal always produce one. A bare identifier,
 * a conditional with an `undefined`/`null` arm, and a logical `&&` can each
 * arrive absent, so they do not count HERE -- the call site has to spell the
 * marker itself.
 */
export function attributeAlwaysPresent(node: Node): boolean {
  const opening = Node.isJsxElement(node) ? node.getOpeningElement() : node;
  if (!Node.isJsxOpeningElement(opening) && !Node.isJsxSelfClosingElement(opening)) return false;

  for (const attribute of opening.getAttributes()) {
    if (!Node.isJsxAttribute(attribute)) continue;
    const name = attribute.getNameNode().getText();
    if (name !== "data-render-fault" && name !== "renderFault") continue;

    const initializer = attribute.getInitializer();
    if (initializer === undefined) return true;
    if (Node.isStringLiteral(initializer)) return true;
    if (!Node.isJsxExpression(initializer)) return true;

    const expression = initializer.getExpression();
    if (expression === undefined) continue;
    if (Node.isIdentifier(expression)) continue;
    if (Node.isConditionalExpression(expression)) {
      const arms = [expression.getWhenTrue(), expression.getWhenFalse()];
      if (arms.some((a) => /^(?:undefined|null)$/.test(a.getText().trim()))) continue;
      return true;
    }
    if (Node.isBinaryExpression(expression)) {
      const op = expression.getOperatorToken().getText();
      // `a && "x"` can yield a falsy left operand, so the attribute may vanish.
      // `a || "x"` and `a ?? "x"` cannot: when the left side declines, the right
      // one supplies a value, so the attribute is always present. Treating the
      // whole family as absent would demand a marker on code that already has
      // one -- a false RED, which is the opposite error from the one this
      // predicate was tightened to fix, and just as wrong.
      if (op === "&&") continue;
      if (op === "||" || op === "??") {
        const right = expression.getRight();
        const alwaysTruthy =
          (Node.isStringLiteral(right) && right.getLiteralValue().length > 0) ||
          Node.isTemplateExpression(right) ||
          Node.isNoSubstitutionTemplateLiteral(right);
        if (alwaysTruthy) return true;
        continue;
      }
      return true;
    }
    return true;
  }
  return false;
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
function carriesAttribute(jsx: Node | null): boolean {
  if (jsx === null) return false;
  if (attributeAlwaysPresent(jsx)) return true;

  // The ROOT itself first. The ancestry walk below stops AT `jsx`, so a root
  // that is itself conditional was never examined: routing the embedded-local
  // hop through this function still certified `const note = cond ? <marked/> :
  // null`, the exact shape the hop was repaired for. A walk bounded by a node
  // cannot inspect that node, so the root is decomposed here instead.
  if (Node.isParenthesizedExpression(jsx)) return carriesAttribute(jsx.getExpression());
  if (Node.isConditionalExpression(jsx)) {
    // Both arms, because the DOM sees only one and either may be the one.
    return carriesAttribute(jsx.getWhenTrue()) && carriesAttribute(jsx.getWhenFalse());
  }
  if (Node.isBinaryExpression(jsx)) {
    const rootOp = jsx.getOperatorToken().getText();
    // `cond && <marked/>` renders NOTHING when cond is falsy, so it can never
    // mark unconditionally, whatever the right side carries.
    if (rootOp === "&&") return false;
    if (rootOp === "||" || rootOp === "??") {
      return carriesAttribute(jsx.getLeft()) && carriesAttribute(jsx.getRight());
    }
  }

  // A marked DESCENDANT only counts when nothing between it and the branch root
  // can decline to render it. `{cond ? <marked/> : null}` puts a marker in the
  // source that the DOM may never receive, and counting it certified coverage
  // the runtime detector would not find.
  const unconditional = (el: Node): boolean => {
    if (!attributeAlwaysPresent(el)) return false;
    for (let a = el.getParent(); a !== undefined && a !== jsx; a = a.getParent()) {
      if (Node.isConditionalExpression(a)) return false;
      if (Node.isBinaryExpression(a)) {
        const op = a.getOperatorToken().getText();
        if (op === "&&" || op === "||" || op === "??") return false;
      }
    }
    return true;
  };
  for (const el of jsx.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (unconditional(el)) return true;
  }
  for (const el of jsx.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (unconditional(el)) return true;
  }

  // A branch may build the marked element into a local and embed it:
  // `const note = (<section data-render-fault=... />)` then `return <div>{note}</div>`.
  // The marker reaches the DOM either way, so resolving one hop through an
  // embedded identifier keeps the guard from failing a correct implementation.
  for (const container of jsx.getDescendantsOfKind(SyntaxKind.JsxExpression)) {
    const inner = container.getExpression();
    if (inner === undefined || !Node.isIdentifier(inner)) continue;
    // The hop resolves to the initializer NODE and runs the same predicate.
    // Text-matching it accepted `data-render-fault={undefined}` and a commented
    // marker inside the local, certifying an attribute that never reaches the DOM.
    const initializer = initializerNode(inner);
    if (initializer === null) continue;
    // Recurses into the SAME funnel rather than re-implementing "root or any
    // marked descendant". The open-coded version accepted a marked descendant
    // of the local without preserving CONDITIONAL ANCESTRY, so
    // `const note = cond ? <marked/> : null` certified a marker the DOM may
    // never receive -- the very rule `carriesAttribute` exists to apply, dropped
    // by the copy that did not call it.
    if (carriesAttribute(initializer)) return true;
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

export function componentRendersMarker(file: SourceFile, name: string): boolean {
  // Same file first: several fault surfaces are local helpers, not imports.
  for (const source of [file, importSourceOf(file, name)]) {
    if (source === null) continue;
    for (const declaration of [...source.getFunctions(), ...source.getVariableDeclarations()]) {
      if (declaration.getName() !== name) continue;
      const body = Node.isFunctionDeclaration(declaration)
        ? declaration.getBody()
        : declaration.getInitializer();
      if (body === undefined) continue;
      // EVERY exit, through the ONE funnel.
      //
      // This read `MARKER.test(returned.getText()) && marksUnconditionally(...)`,
      // and the pair certified a component that renders no marker at all: the
      // regex matched the marker's name anywhere in the subtree TEXT (a comment
      // counts), and `marksUnconditionally` answers "if a marker is on the root,
      // is it always present", which is vacuously true when the root has none.
      // Text-presence plus vacuous-unconditionality read as "marked".
      //
      // It also inspected only the FIRST return, so a later unmarked return was
      // invisible. A component marks on every render only if every JSX it can
      // return carries the attribute, hence `every` over all roots, with the
      // non-empty guard so a component returning no JSX is not vacuously marked.
      if (everyReturnMarks(body)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Does this component's marker appear on EVERY render, or only when a call site
 * passes it?
 *
 * The hop into a shared component is only sound for a component that marks
 * unconditionally. `SectionTileError` does: its value is a template literal, and
 * a template literal always produces a string, so the attribute is always in the
 * DOM. `FailureSurface` does not: it spreads an optional prop
 * (`data-render-fault={renderFault}`), and React omits an attribute whose value
 * is `undefined`, so a call site that passes no prop renders NO marker.
 *
 * Without this distinction the hop reported every `<FailureSurface />` as marked
 * whatever props it carried, which is a false NEGATIVE in the enforcement: an
 * unmarked fault branch would satisfy the meta-test while the capture saw
 * nothing. That also contradicted this module's own stated contract, that the
 * prop spelling is "pinned at the call site, so only the fault branches count
 * rather than every use of the component".
 *
 * The test is deliberately narrow: a BARE identifier is the only shape that can
 * arrive `undefined` from a call site. Any literal, template literal, or
 * computed expression always yields a value, so those still count.
 */
export function marksUnconditionally(returned: Node): boolean {
  const opening = Node.isJsxElement(returned) ? returned.getOpeningElement() : returned;
  if (!Node.isJsxOpeningElement(opening) && !Node.isJsxSelfClosingElement(opening)) return true;
  // Delegates to the ONE predicate. This used to carry its own copy of the rule
  // whose "any computed expression always yields a value" arm was false for
  // `cond ? "x" : undefined` and for `a && "x"` -- the same shapes the direct
  // path had already been fixed for. Two copies of a rule is two chances to fix
  // only one of them, which is what happened.
  const hasMarker = opening
    .getAttributes()
    .some(
      (a) =>
        Node.isJsxAttribute(a) &&
        ["data-render-fault", "renderFault"].includes(a.getNameNode().getText()),
    );
  if (!hasMarker) return true;
  return attributeAlwaysPresent(opening);
}

/**
 * Does EVERY exit of this body render a marker?
 *
 * The predecessor collected JSX roots and applied `every` to them, which
 * silently DISCARDED the exits that were not JSX: a component returning
 * `<marked/>` on one path and `null`, `false`, `0` or text on another certified,
 * while React rendered no marker on those paths. Filtering before a universal
 * quantifier makes the quantifier range over the survivors, which is not the
 * question. Every exit is examined, and a non-JSX one fails outright.
 *
 * Documented limit: an implicit fall-through (a body that ends without a
 * `return`) is not modelled. It is invisible to a return-statement walk, and
 * modelling it needs control-flow analysis this arc does not carry.
 */
function everyReturnMarks(body: Node): boolean {
  const statements = returnedStatements(body);
  if (statements.length === 0) return false;
  for (const statement of statements) {
    const jsx = jsxRoot(statement.getExpression());
    if (jsx === null) return false;
    if (!carriesAttribute(jsx)) return false;
  }
  return true;
}

/**
 * EVERY return statement this body owns, JSX or not.
 *
 * `firstReturnedJsx` stays for candidate COLLECTION, where the branch's first
 * rendered element is the thing under test. Certification is a different
 * question -- "does this mark on every render" -- and it has to see every exit.
 */
function returnedStatements(body: Node): ReturnStatement[] {
  const owned: ReturnStatement[] = [];
  for (const statement of body.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    const owner = statement.getFirstAncestor(
      (a) => Node.isArrowFunction(a) || Node.isFunctionDeclaration(a) || a === body,
    );
    if (owner !== body) continue;
    owned.push(statement);
  }
  return owned;
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
 * Every JSX-returning fault branch under the manifest-derived roots that the
 * `IfStatement`, `CaseClause` and `CatchClause` arms reach.
 *
 * A branch qualifies by returning JSX directly; its guard FORM then decides
 * whether it is accepted or reported by name -- ON THOSE THREE ARMS. The
 * `ConditionalExpression` arm has no residue fallback and drops an
 * unclassifiable guard SILENTLY, a declined asymmetry documented at the arm
 * itself. `components/admin/IgnoredSheetsDisclosure.tsx:79` is a live instance:
 * JSX in `whenTrue`, `classifyExpression` null, no candidate emitted. Branches that render nothing —
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
      // ASYMMETRY, DECLINED AND DOCUMENTED rather than closed. The IfStatement
      // arm above falls back to a vocabulary probe and reports an unclassifiable
      // guard as `unknown` residue. This arm drops it, deliberately.
      //
      // Probed: 741 such ternaries under the derived roots, 77 on a
      // fault-vocabulary guard and unclassifiable. 68 of those 77 sit in
      // `"use client"` files, where the guard is interaction state -- `errorCode`,
      // `state.kind === "error"`, `switchStatus === "error"` -- and not a server-render
      // fault. The screenshot harness captures server-rendered output, so a
      // client error toast is a different population from the one this
      // instrument measures. Nine are in server components, of which four are
      // emptiness checks (`allHidden && !roomsFetchFailed` and three siblings in
      // components/crew/sections/) and two are already registered.
      //
      // So the vocabulary probe is the WRONG FILTER on this arm, which answers
      // the question BL-RENDER-FAULT-TERNARY-RESIDUE-ASYMMETRY left open. Adding
      // the fallback would hand the registry 77 hand-written reasons to carry
      // roughly three new server-render fault sites, and the IfStatement arm's
      // comment above already records why that trade is bad: a false candidate
      // dilutes exactly the signal the residue exists to carry.
      //
      // RE-FILE TRIGGER, and it is computed rather than promised: if the count of
      // server-component ternaries that are unclassified, fault-vocabulary AND
      // unregistered rises above 7 -- its resting value today -- the decline is
      // re-opened. `tests/help/_metaRenderFaultMarking.test.ts` asserts that
      // bound, re-derives both figures above and compares them to this comment,
      // and pins each registered site as still unreachable. Editing these numbers
      // without re-probing fails there.
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

/**
 * The `lib/**` modules a set of rendered files imports DIRECTLY at runtime.
 *
 * Depth 1, deliberately. A module a rendered file imports directly is on the
 * render path; one four hops behind it is in the same module graph for reasons
 * that have nothing to do with rendering, and following the graph to its end
 * pulls in the cron and sync trees. Measured against the server-time guard's
 * own filters: depth 1 is 211 modules and 13 violations, depth 2 is 319 and 22,
 * unbounded is 396 and 31, and the whole directory is 532 and 55. All four
 * reach `lib/admin/loadAppEvents.ts`, and every violation unbounded depth adds
 * sits in a module whose only `app/` importers are under `app/api/**` or a cron
 * path -- none is awaited by a render.
 *
 * Type-only edges are excluded: an `import type` declaration, and a named group
 * whose every specifier is type-only with no default and no namespace binding,
 * are erased at build and carry no render.
 */
export function deriveImportedLibFiles(rootFiles: string[]): string[] {
  const project = new Project({
    compilerOptions: { target: ScriptTarget.ESNext, jsx: 4 },
    skipAddingFilesFromTsConfig: true,
  });
  const found = new Set<string>();

  for (const path of rootFiles) {
    const source = project.getSourceFile(path) ?? project.addSourceFileAtPath(path);
    const specifiers: string[] = [];

    for (const declaration of source.getImportDeclarations()) {
      const named = declaration.getNamedImports();
      const typeOnly =
        declaration.isTypeOnly() ||
        (named.length > 0 &&
          named.every((specifier) => specifier.isTypeOnly()) &&
          !declaration.getDefaultImport() &&
          !declaration.getNamespaceImport());
      if (!typeOnly) specifiers.push(declaration.getModuleSpecifierValue());
    }
    for (const declaration of source.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier !== undefined && !declaration.isTypeOnly()) specifiers.push(specifier);
    }

    for (const specifier of specifiers) {
      const target = resolveSpecifier(source, specifier);
      if (target === null) continue;
      const path = target.getFilePath();
      if (relative(process.cwd(), path).startsWith("lib/")) found.add(path);
    }
  }

  return [...found].sort();
}
