/**
 * tests/cross-cutting/no-absolute-self-redirect-audit.ts
 *
 * Bans `NextResponse.redirect(...)` and the Web API `Response.redirect` under
 * the walked roots (app/**, lib/**, root middleware), allow-listing the handful
 * of sites that legitimately redirect to an EXTERNAL absolute URL. Everything
 * else must go through `hostRelativeRedirect` (lib/http), whose Location is
 * host-relative and therefore cannot flip the host and drop host-scoped cookies.
 * See docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md
 * (which supersedes the syntactic construction from
 * 2026-07-24-picker-flow-app-bugs.md §3).
 *
 * WHAT THIS IS, STATED HONESTLY: TWO-PRONG resolved-identity matching through
 * the TypeScript type checker — not a spelling matcher. The previous version
 * recognized 19 hand-collected spellings, each added after a review probe
 * defeated the prior round; that list is now only a regression floor pinned by
 * fixtures in the companion test. The prongs:
 *
 *   1. CALLS — every call expression whose resolved signature's declaration is
 *      `redirect` on a container named `NextResponse` or `Response`, however
 *      the callee value flowed there (aliases, helper returns, class fields,
 *      re-exports, typed dispatch tables, literal-typed computed keys).
 *   2. REFERENCES — every OTHER reference to that method OR to the class
 *      object carrying it: property/element access, binding elements,
 *      destructuring-assignment members (via the source property-symbol type),
 *      and naked `NextResponse`/`Response` value flows (whole-object
 *      laundering — `const R: { redirect: RedirectFn } = NextResponse` — needs
 *      no cast, so the object reference itself is the finding). Extracting,
 *      storing, passing, or adapting the method or its carrier is a finding at
 *      the site where the name is spelled, and is NEVER allow-listable.
 *
 * The claim is conditional on the program resolving its imports: for
 * TypeScript files the `typecheck` merge gate (`tsc --noEmit`,
 * .github/workflows/quality.yml) enforces that tree-wide; plain-JS modules
 * have NO such backstop (tsconfig `include` is TS-only, `checkJs` off), which
 * is why the companion test's sentinel keeps the walked roots free of them.
 *
 * KNOWN RESIDUAL (spec §7): string-mediated dynamic access — `eval`, or any
 * construct where the name reaches the method only inside a string literal —
 * is the one remaining type-erasure escape; it cannot be pinned by a fixture
 * (the E1 fixture pins the eval shape at 0 findings) and is covered only by
 * its greppable spelling being loud in review. Receiver laundering
 * (`(NextResponse as any).redirect`), widened computed keys, and
 * `Reflect.get(NextResponse, k)` are all CAUGHT at the naked class-object
 * reference they must spell (whole-diff r2 closure). Local runtime mimics named
 * `NextResponse` either delegate to the real method (their internal reference
 * is in a walked file and flags there) or hand-roll a Location header without
 * it (outside this guard's claim). `node_modules` wrappers are outside the
 * walked roots. Treat a green run as "no call or reference resolving to the
 * banned method exists outside the allowlist", not "the dynamic class is
 * impossible".
 */
import {
  Node,
  Project,
  SyntaxKind,
  ts,
  type CallExpression,
  type SourceFile,
  type Type,
} from "ts-morph";

export type SelfRedirectFinding = {
  /** 1-based line of the call or reference. */
  line: number;
  text: string;
  /**
   * Exact source text of the first argument (calls only; "" for references —
   * which therefore never match an allow-list row's argument pin).
   */
  argument: string;
  kind: "call" | "reference";
};

export type TreeAudit = {
  /** Repo-relative path → findings. Every audited file is present, [] when clean. */
  findingsByFile: Map<string, SelfRedirectFinding[]>;
  /** Audited (non-node_modules) files under app/. */
  visitedAppFiles: number;
  /** Audited files under lib/. */
  visitedLibFiles: number;
  /** Audited files with plain-JS extensions — the companion test pins this []. */
  plainJsFiles: string[];
};

/**
 * Sites that redirect to an EXTERNAL absolute URL, where host-relative is wrong.
 *
 * Keyed `path:line` so a moved call re-surfaces for review instead of inheriting
 * its predecessor's exemption. Keep this tiny: every row is a standing claim that
 * the target is genuinely off-origin.
 */
export const EXTERNAL_REDIRECT_ALLOWLIST: Readonly<
  Record<string, { reason: string; argument: string }>
> = {
  // Supabase-issued Google OAuth endpoint (accounts.google.com). Off-origin by
  // definition — the point of the call is to leave the app.
  //
  // `argument` is pinned as well as the line: review noted that a line-keyed
  // exemption still covers the call if its argument changes IN PLACE from
  // `data.url` to `new URL(path, request.url)`, which would reintroduce the flip
  // under cover of the row.
  "app/api/auth/google/start/route.ts:72": {
    reason: "Supabase-issued Google OAuth URL",
    argument: "data.url",
  },
};

/** Name of the class/interface/type-literal-variable enclosing a declaration. */
function containerName(decl: Node): string | null {
  let parent = decl.getParent();
  while (parent !== undefined) {
    if (Node.isClassDeclaration(parent) || Node.isInterfaceDeclaration(parent)) {
      return parent.getName() ?? null;
    }
    if (Node.isTypeLiteral(parent)) {
      // `var Response: { redirect(...): Response }` — the name is on the variable.
      const holder = parent.getParent();
      return Node.isVariableDeclaration(holder) ? holder.getName() : null;
    }
    parent = parent.getParent();
  }
  return null;
}

/**
 * Name a signature declaration answers to. Function-typed properties resolve to
 * the nameless FunctionTypeNode; the name lives on the enclosing property.
 * FunctionDeclarations (e.g. next/navigation's `redirect`) are never banned.
 */
function declaredName(decl: Node): string | null {
  if (Node.isMethodDeclaration(decl) || Node.isMethodSignature(decl)) return decl.getName();
  if (Node.isFunctionTypeNode(decl)) {
    const holder = decl.getParent();
    if (Node.isPropertySignature(holder) || Node.isPropertyDeclaration(holder)) {
      return holder.getName();
    }
    return null;
  }
  return null;
}

function isBannedDecl(decl: Node | undefined): boolean {
  if (decl === undefined) return false;
  if (declaredName(decl) !== "redirect") return false;
  const container = containerName(decl);
  return container === "NextResponse" || container === "Response";
}

function typeCarriesBannedSignature(t: Type): boolean {
  return t.getCallSignatures().some((s) => isBannedDecl(s.getDeclaration()));
}

/**
 * Widened carry (whole-diff r2): a value is banned-carrying when its type's
 * call signatures include the banned declaration OR its `redirect` property's
 * type does — the class OBJECT carries the method inside it, so a naked
 * `NextResponse`/`Response` value flowing into ANY differently-typed slot
 * (annotated variable, parameter, return, field, array, generic, any-cast) is
 * itself the laundering step, and it must spell one of those names.
 */
function carriesBanned(node: Node, t: Type): boolean {
  if (typeCarriesBannedSignature(t)) return true;
  const checker = node.getProject().getTypeChecker();
  const prop = t.getProperty("redirect");
  if (
    prop !== undefined &&
    typeCarriesBannedSignature(checker.getTypeOfSymbolAtLocation(prop, node))
  ) {
    return true;
  }
  // Namespace hop (whole-diff r3): a module-namespace object carries the class
  // one property deeper (`NS.NextResponse.redirect`). One hop suffices — any
  // DEEPER stuffing must spell a tracked name at the stuffing site, which is
  // itself a flagged naked reference.
  for (const carrier of ["NextResponse", "Response"]) {
    const p = t.getProperty(carrier);
    if (p === undefined) continue;
    const pt = checker.getTypeOfSymbolAtLocation(p, node);
    const rp = pt.getProperty("redirect");
    if (
      rp !== undefined &&
      typeCarriesBannedSignature(checker.getTypeOfSymbolAtLocation(rp, node))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Positions that never yield the class object onward, so a banned-carrying
 * node there is not an extraction: direct member-access receiver (the member
 * access is separately a candidate), direct `new` callee (yields an instance),
 * the callee of a call prong 1 already flagged, instanceof RHS, and the
 * `typeof` value operand.
 */
function inNonExtractingPosition(node: Node, bannedCalls: ReadonlySet<Node>): boolean {
  const parent = node.getParent();
  if (parent === undefined) return false;
  if (
    (Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) &&
    parent.getExpression() === node
  ) {
    return true;
  }
  if (Node.isNewExpression(parent) && parent.getExpression() === node) return true;
  if (Node.isCallExpression(parent) && parent.getExpression() === node && bannedCalls.has(parent)) {
    return true;
  }
  if (
    Node.isBinaryExpression(parent) &&
    parent.getOperatorToken().getKind() === SyntaxKind.InstanceOfKeyword &&
    parent.getRight() === node
  ) {
    return true;
  }
  if (Node.isTypeOfExpression(parent)) return true;
  return false;
}

/** An identifier candidate must be a value USE, not a name/import/type position. */
function identifierIsExpressionUse(id: Node): boolean {
  const parent = id.getParent();
  if (parent === undefined) return false;
  if (Node.isImportSpecifier(parent) || Node.isExportSpecifier(parent)) return false;
  if (Node.isImportClause(parent) || Node.isNamespaceImport(parent)) return false;
  if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
  if (Node.isBindingElement(parent)) return false;
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) return false;
  if (
    (Node.isPropertyAssignment(parent) ||
      Node.isPropertySignature(parent) ||
      Node.isMethodDeclaration(parent)) &&
    parent.getNameNode() === id
  ) {
    return false;
  }
  if (Node.isTypeQuery(parent) || Node.isTypeReference(parent)) return false;
  if (
    Node.isFunctionDeclaration(parent) ||
    Node.isClassDeclaration(parent) ||
    Node.isInterfaceDeclaration(parent)
  ) {
    return false;
  }
  if (Node.isParameterDeclaration(parent) && parent.getNameNode() === id) return false;
  return true;
}

// Raw-side twins for the assignment-pattern prong. These run against nodes and
// types from `checker.compilerObject`, so they are written against ts-morph's
// exported `ts` namespace — the SAME vendored compiler world (mixing the
// standalone `typescript` package's types with compilerObject values does not
// survive strict tsc; see the spec's R1/F3 record).
function rawContainerName(decl: ts.Node): string | null {
  let parent: ts.Node | undefined = decl.parent;
  while (parent !== undefined) {
    if (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) {
      return parent.name?.getText() ?? null;
    }
    if (ts.isTypeLiteralNode(parent)) {
      const holder: ts.Node = parent.parent;
      return ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)
        ? holder.name.text
        : null;
    }
    parent = parent.parent;
  }
  return null;
}

function rawDeclaredName(decl: ts.Node): string | null {
  if (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl)) return decl.name.getText();
  if (ts.isFunctionTypeNode(decl)) {
    const holder: ts.Node = decl.parent;
    if (ts.isPropertySignature(holder) || ts.isPropertyDeclaration(holder)) {
      return holder.name.getText();
    }
    return null;
  }
  return null;
}

function rawIsBannedDecl(decl: ts.Node | undefined): boolean {
  if (decl === undefined) return false;
  if (rawDeclaredName(decl) !== "redirect") return false;
  const container = rawContainerName(decl);
  return container === "NextResponse" || container === "Response";
}

function rawTypeCarriesBannedSignature(checker: ts.TypeChecker, t: ts.Type): boolean {
  return checker
    .getSignaturesOfType(t, ts.SignatureKind.Call)
    .some((s) => rawIsBannedDecl(s.getDeclaration()));
}

/** Property name of an assignment-pattern member; literal-TYPED computed keys resolve too. */
function memberPropName(checker: ts.TypeChecker, name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const t = checker.getTypeAtLocation(name.expression);
    if (t.isStringLiteral()) return t.value;
  }
  return null;
}

function findingFor(node: Node, kind: "call" | "reference", argument: string): SelfRedirectFinding {
  return {
    line: node.getStartLineNumber(),
    text: (node.getText().split("\n")[0] ?? "").trim(),
    argument,
    kind,
  };
}

/** Both prongs over one source file. */
function findSelfRedirects(sf: SourceFile): SelfRedirectFinding[] {
  const checker = sf.getProject().getTypeChecker();
  const raw = checker.compilerObject;
  const findings: SelfRedirectFinding[] = [];

  // Prong 1 — calls, by resolved-signature identity.
  const bannedCalls = new Set<CallExpression>();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isBannedDecl(checker.getResolvedSignature(call)?.getDeclaration())) {
      bannedCalls.add(call);
      const firstArg = call.getArguments()[0];
      findings.push(
        findingFor(call, "call", firstArg === undefined ? "" : firstArg.getText().trim()),
      );
    }
  }

  // Prong 2 — references, type-decided over EVERY candidate (no syntactic key
  // or name prefilter: literal-TYPED keys defeat literal-NODE filters). A
  // candidate in direct-callee position is skipped only when prong 1 already
  // flagged that call — otherwise it is checked too, which closes union-typed
  // keys that defeat signature resolution. Identifier candidates cover naked
  // class-OBJECT flows (`const R: { redirect: RedirectFn } = NextResponse`),
  // which launder the receiver without any cast: the whole-object flow must
  // spell NextResponse/Response (or an import alias of NextResponse) once, so
  // the name set below is complete — a further local alias's CREATION site is
  // itself a flagged naked reference.
  const candidates: Node[] = [
    ...sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression),
    ...sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression),
    ...sf.getDescendantsOfKind(SyntaxKind.BindingElement),
  ];
  const objectNames = new Set(["NextResponse", "Response"]);
  for (const imp of sf.getImportDeclarations()) {
    for (const spec of imp.getNamedImports()) {
      if (spec.getNameNode().getText() === "NextResponse") {
        objectNames.add(spec.getAliasNode()?.getText() ?? "NextResponse");
      }
    }
    // Namespace objects CARRY the class one property deep — their locals are
    // candidates too (whole-diff r3: `({ NextResponse: R } = NS)` and
    // object-rest spellings launder without a class-name expression).
    const nsImport = imp.getNamespaceImport();
    if (nsImport !== undefined) objectNames.add(nsImport.getText());
  }
  // Dynamic-import namespaces: `const m = await import("next/server")`.
  for (const vd of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = vd.getInitializer();
    const inner = init !== undefined && Node.isAwaitExpression(init) ? init.getExpression() : init;
    if (
      inner !== undefined &&
      Node.isCallExpression(inner) &&
      inner.getExpression().getKind() === SyntaxKind.ImportKeyword
    ) {
      const nameNode = vd.getNameNode();
      if (Node.isIdentifier(nameNode)) objectNames.add(nameNode.getText());
    }
  }
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!objectNames.has(id.getText())) continue;
    if (!identifierIsExpressionUse(id)) continue;
    candidates.push(id);
  }
  for (const node of candidates) {
    const t = node.getType();
    if (typeCarriesBannedSignature(t)) {
      // The node's value IS the method (direct carry) — flag in ANY position
      // except the exact call prong 1 already reported. Receiver position is
      // NOT exempt here: `NextResponse.redirect.call(undefined, u)` must flag
      // at the inner access even though it is the receiver of `.call`.
      const parent = node.getParent();
      const calleeOfBanned =
        parent !== undefined &&
        Node.isCallExpression(parent) &&
        parent.getExpression() === node &&
        bannedCalls.has(parent);
      if (!calleeOfBanned) findings.push(findingFor(node, "reference", ""));
      continue;
    }
    // Whole-OBJECT carry (the type's `redirect` property is the banned method):
    // skip positions that never yield the object onward — direct member-access
    // receiver (naming the container to reach some member, which is itself a
    // candidate), `new` callee, instanceof RHS, typeof operand.
    if (inNonExtractingPosition(node, bannedCalls)) continue;
    if (carriesBanned(node, t)) {
      findings.push(findingFor(node, "reference", ""));
    }
  }

  // Destructuring-ASSIGNMENT members (`({ redirect: f } = NextResponse)`) are
  // Property/ShorthandPropertyAssignment nodes, not BindingElements, and every
  // target-side type query reports the annotated TARGET type — so the flag is
  // decided on the SOURCE property-symbol's type, resolved through the vendored
  // compiler's getTypeOfAssignmentPattern (covers plain assignments,
  // array-nested patterns, and for-of heads).
  for (const kind of [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment]) {
    for (const member of sf.getDescendantsOfKind(kind)) {
      const holder = member.getParent();
      if (!Node.isObjectLiteralExpression(holder)) continue;
      let srcType: ts.Type | undefined;
      try {
        srcType = raw.getTypeOfAssignmentPattern(holder.compilerNode);
      } catch {
        continue; // value-position object literal, not an assignment pattern
      }
      if (srcType === undefined) continue;
      const nameNode = (
        member.compilerNode as ts.PropertyAssignment | ts.ShorthandPropertyAssignment
      ).name;
      const propName = memberPropName(raw, nameNode);
      if (propName === null) continue;
      const prop = srcType.getProperty(propName);
      if (prop === undefined) continue;
      if (
        rawTypeCarriesBannedSignature(raw, raw.getTypeOfSymbolAtLocation(prop, member.compilerNode))
      ) {
        findings.push(findingFor(member, "reference", ""));
      }
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

const AUDIT_PROJECT_OPTIONS = {
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: true,
} as const;

/**
 * Shared project for fixture sources. tsconfig-hosted so `next/server` and
 * `@/lib/**` resolve from the real filesystem; fixture paths live under an
 * `__audit_fixture__/` segment that the companion test asserts does not exist
 * on disk. A SEPARATE project instance from auditTree's, so fixtures can never
 * leak into the tree audit.
 */
let fixtureProject: Project | undefined;
function getFixtureProject(): Project {
  fixtureProject ??= new Project(AUDIT_PROJECT_OPTIONS);
  return fixtureProject;
}

const ALLOWLISTED_PATHS = new Set(
  Object.keys(EXTERNAL_REDIRECT_ALLOWLIST).map((key) => key.slice(0, key.lastIndexOf(":"))),
);

function assertFixturePath(repoRelativePath: string): void {
  // Allow-list tests may mirror an allowlisted route path (the argument-pin
  // fixture must land on the row's exact path:line); everything else stays in
  // the __audit_fixture__ namespace so fixtures can never shadow real files.
  // Exact segment prefix, no traversal — a substring test accepted paths
  // outside both roots, non-segment lookalikes, and `..` escapes (whole-diff
  // review r1, probe-demonstrated).
  if (ALLOWLISTED_PATHS.has(repoRelativePath)) return;
  const inNamespace =
    (repoRelativePath.startsWith("app/__audit_fixture__/") ||
      repoRelativePath.startsWith("lib/__audit_fixture__/")) &&
    !repoRelativePath.split("/").includes("..");
  if (inNamespace) return;
  throw new Error(
    `fixture path ${repoRelativePath} must sit directly under app/__audit_fixture__/ or ` +
      `lib/__audit_fixture__/ (or mirror an EXTERNAL_REDIRECT_ALLOWLIST path for allow-list tests)`,
  );
}

/** Add a sibling module to the fixture project (multi-file fixtures, e.g. re-exports). */
export function addFixtureModule(repoRelativePath: string, source: string): void {
  assertFixturePath(repoRelativePath);
  getFixtureProject().createSourceFile(repoRelativePath, source, { overwrite: true });
}

/** Audit a single fixture source. */
export function auditSource(repoRelativePath: string, source: string): SelfRedirectFinding[] {
  assertFixturePath(repoRelativePath);
  const sf = getFixtureProject().createSourceFile(repoRelativePath, source, { overwrite: true });
  return findSelfRedirects(sf);
}

/** Audit the real tree once; the companion test memoizes the result. */
export function auditTree(): TreeAudit {
  const project = new Project(AUDIT_PROJECT_OPTIONS);
  project.addSourceFilesAtPaths([
    "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
    "lib/**/*.{ts,tsx,js,jsx,mjs,cjs}",
    "middleware.{ts,tsx}",
  ]);
  const findingsByFile = new Map<string, SelfRedirectFinding[]>();
  let visitedAppFiles = 0;
  let visitedLibFiles = 0;
  const plainJsFiles: string[] = [];
  const root = `${process.cwd()}/`;
  for (const sf of project.getSourceFiles()) {
    const abs = sf.getFilePath();
    if (abs.includes("node_modules")) continue;
    const rel = abs.startsWith(root) ? abs.slice(root.length) : abs;
    if (rel.startsWith("app/")) visitedAppFiles++;
    if (rel.startsWith("lib/")) visitedLibFiles++;
    if (/\.(jsx?|mjs|cjs)$/.test(rel)) plainJsFiles.push(rel);
    findingsByFile.set(rel, findSelfRedirects(sf));
  }
  return { findingsByFile, visitedAppFiles, visitedLibFiles, plainJsFiles };
}

/** Findings with no allow-list row, keyed `path:line`. */
export function unallowedRedirects(
  repoRelativePath: string,
  findings: readonly SelfRedirectFinding[],
): SelfRedirectFinding[] {
  return findings.filter((f) => {
    const row = EXTERNAL_REDIRECT_ALLOWLIST[`${repoRelativePath}:${f.line}`];
    // EXACT argument match, not a substring of the line. Review showed the
    // substring form still exempting `metadata.url`, a conditional that merely
    // mentions `data.url`, or an internal URL trailed by a `/* data.url */`
    // comment — which defeats the point of pinning the argument at all.
    // Reference findings carry argument "" and therefore never match a row.
    return row === undefined || f.argument !== row.argument;
  });
}
