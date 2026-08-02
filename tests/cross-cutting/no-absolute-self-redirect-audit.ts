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
 *      naked `NextResponse`/`Response` value flows (whole-object laundering —
 *      `const R: { redirect: RedirectFn } = NextResponse` — needs no cast, so
 *      the object reference itself is the finding), namespace-import locals
 *      carrying the class one property deep, and dynamic `import(...)` calls
 *      of carrier modules (flagged at the import spelling). Extracting,
 *      storing, passing, or adapting the method or its carrier is a finding at
 *      the site where the name is spelled, and is NEVER allow-listable.
 *
 * The claim is conditional on the program resolving its imports: for
 * TypeScript files the `typecheck` merge gate (`tsc --noEmit`,
 * .github/workflows/quality.yml) enforces that tree-wide; plain-JS modules
 * have NO such backstop (tsconfig `include` is TS-only, `checkJs` off), which
 * is why the companion test's sentinel keeps the walked roots free of them.
 *
 * THREAT MODEL AND RESIDUAL (spec §7; ratified whole-diff r8): the guard's
 * claim is against INADVERTENT use — direct calls, honest indirection, and the
 * ninety-plus probed laundering families pinned as fixtures (regression floor,
 * spec §6). It does NOT claim to stop deliberate evasion, and never has: an
 * author contrived enough to route the class object through an adapter,
 * computed specifier, nested re-export namespace, or eval string can equally
 * hand-roll `new NextResponse(null, { headers: { Location } })`, which is
 * permanently outside the redirect-call claim. Receiver laundering, widened
 * keys, and Reflect.get ARE caught (they arise from plausible refactors);
 * exotic module-object flows beyond the pinned families file to the evasion
 * concession, not to the finding queue. Local runtime mimics named
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
  if (container !== "NextResponse" && container !== "Response") return false;
  // Provenance pin (whole-diff r11): only the REAL classes — declared under
  // node_modules (next/dist, typescript/lib, undici-types) — are banned. An
  // app-local class that merely shares the name is a plausible domain model;
  // a local class with a genuinely host-flipping redirect either delegates to
  // the real method (flagged at that reference) or hand-rolls the Location
  // header (the ratified concession).
  return decl.getSourceFile().getFilePath().includes("node_modules/");
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
  // Namespace hop (whole-diff r3; widened r6): a module-namespace object
  // carries the class one property deeper, under WHATEVER export name a
  // re-export chose — so for module-symbol types every property is checked
  // (module-gated, so ordinary structural types stay on the cheap path). One
  // hop suffices: any DEEPER stuffing must spell a tracked name at the
  // stuffing site, which is itself a flagged naked reference.
  if (isModuleType(t)) {
    for (const p of t.getProperties()) {
      const pt = checker.getTypeOfSymbolAtLocation(p, node);
      if (typeCarriesBannedSignature(pt)) return true;
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

/** Module-namespace types get the all-property hop regardless of export spelling. */
function isModuleType(t: Type): boolean {
  const sym = t.getSymbol();
  if (sym === undefined) return false;
  return (sym.getFlags() & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0;
}

/**
 * Positions that never yield the class object onward, so a banned-carrying
 * node there is not an extraction: direct member-access receiver (the member
 * access is separately a candidate), direct `new` callee (yields an instance),
 * the callee of a call prong 1 already flagged, instanceof RHS, and the
 * `typeof` value operand.
 */
/** Shape check for global-carrier destinations: a callable `redirect`, bare or one carrier hop down. */
function destinationLooksRedirectish(node: Node, t: Type): boolean {
  const checker = node.getProject().getTypeChecker();
  const direct = t.getProperty("redirect");
  if (
    direct !== undefined &&
    checker.getTypeOfSymbolAtLocation(direct, node).getCallSignatures().length > 0
  ) {
    return true;
  }
  for (const carrier of ["NextResponse", "Response"]) {
    const p = t.getProperty(carrier);
    if (p === undefined) continue;
    const pt = checker.getTypeOfSymbolAtLocation(p, node);
    const rp = pt.getProperty("redirect");
    if (
      rp !== undefined &&
      checker.getTypeOfSymbolAtLocation(rp, node).getCallSignatures().length > 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Climb transparent wrappers — `(X)`, `X!`, `X as T`, `X satisfies T` — so a
 * wrapped receiver/callee still classifies by its REAL syntactic position
 * (whole-diff r13: `(NextResponse).json(...)` false-flagged when only the
 * immediate parent was inspected).
 */
function effectivePosition(node: Node): { child: Node; parent: Node | undefined } {
  let child: Node = node;
  let parent = child.getParent();
  while (parent !== undefined) {
    const transparent =
      (Node.isParenthesizedExpression(parent) || Node.isNonNullExpression(parent)) &&
      parent.getExpression() === child;
    // An `as`/`satisfies` wrapper climbs ONLY while the asserted type still
    // carries — a cast that ERASES the carry (`as any`, `as unknown as …`) is
    // itself the laundering step, and the naked reference must keep flagging
    // (R68/R69; the r13 wrapped-receiver shapes stay quiet via parens/non-null).
    const carryPreservingCast =
      (Node.isAsExpression(parent) || Node.isSatisfiesExpression(parent)) &&
      parent.getExpression() === child &&
      carriesBanned(parent, parent.getType());
    if (!transparent && !carryPreservingCast) break;
    child = parent;
    parent = child.getParent();
  }
  return { child, parent };
}

function inNonExtractingPosition(node: Node, bannedCalls: ReadonlySet<Node>): boolean {
  const { child, parent } = effectivePosition(node);
  if (parent === undefined) return false;
  if (
    (Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) &&
    parent.getExpression() === child
  ) {
    return true;
  }
  if (Node.isNewExpression(parent) && parent.getExpression() === child) return true;
  if (
    Node.isCallExpression(parent) &&
    parent.getExpression() === child &&
    bannedCalls.has(parent)
  ) {
    return true;
  }
  if (
    Node.isBinaryExpression(parent) &&
    parent.getOperatorToken().getKind() === SyntaxKind.InstanceOfKeyword &&
    parent.getRight() === child
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
  if (Node.isImportEqualsDeclaration(parent)) return false;
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
  // `typeof NextResponse.json` parses its entity as QualifiedName chains, so a
  // QualifiedName parent is always type space (whole-diff r9 false positive).
  if (Node.isQualifiedName(parent)) return false;
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
  if (container !== "NextResponse" && container !== "Response") return false;
  return decl.getSourceFile().fileName.includes("node_modules/");
}

function rawTypeCarriesBannedSignature(checker: ts.TypeChecker, t: ts.Type): boolean {
  return checker
    .getSignaturesOfType(t, ts.SignatureKind.Call)
    .some((s) => rawIsBannedDecl(s.getDeclaration()));
}

/**
 * The callee is Node's `require` — pinned to the @types/node DECLARATION, not
 * a symbol-name comparison (a local callable `interface Require` produced a
 * false finding under the name check; whole-diff r8 finding 4).
 */
function isNodeRequireType(callee: Node): boolean {
  const sym = callee.getType().getSymbol();
  if (sym === undefined || sym.getName() !== "Require") return false;
  return sym
    .getDeclarations()
    .some((d) => d.getSourceFile().getFilePath().includes("node_modules/@types/node/"));
}

/** Per-project cache: `dir|specifier` → carrier verdict (require-call checks). */
const specifierVerdicts = new Map<string, boolean>();

/** Resolve a require() specifier and test whether that module's namespace carries. */
function specifierResolvesToCarrier(sf: SourceFile, specifier: string): boolean {
  const project = sf.getProject();
  const cacheKey = `${sf.getDirectoryPath()}|${specifier}`;
  const cached = specifierVerdicts.get(cacheKey);
  if (cached !== undefined) return cached;
  const res = ts.resolveModuleName(
    specifier,
    sf.getFilePath(),
    project.getCompilerOptions(),
    project.getModuleResolutionHost(),
  );
  const resolvedFileName = res.resolvedModule?.resolvedFileName;
  let verdict = false;
  if (resolvedFileName !== undefined) {
    const moduleSf =
      project.getSourceFile(resolvedFileName) ??
      project.addSourceFileAtPathIfExists(resolvedFileName);
    if (moduleSf !== undefined) {
      const raw = project.getTypeChecker().compilerObject;
      const moduleSymbol = raw.getSymbolAtLocation(moduleSf.compilerNode);
      if (moduleSymbol !== undefined) {
        verdict = rawModuleCarries(
          raw,
          raw.getTypeOfSymbolAtLocation(moduleSymbol, moduleSf.compilerNode),
          moduleSf.compilerNode,
        );
      }
    }
  }
  specifierVerdicts.set(cacheKey, verdict);
  return verdict;
}

/** Does a module-namespace type carry the banned class under ANY export name (r6)? */
function rawModuleCarries(checker: ts.TypeChecker, t: ts.Type, at: ts.Node): boolean {
  // r6: a re-export can rename the class, so every module property is checked.
  for (const p of t.getProperties()) {
    const pt = checker.getTypeOfSymbolAtLocation(p, at);
    if (rawTypeCarriesBannedSignature(checker, pt)) return true;
    const rp = pt.getProperty("redirect");
    if (
      rp !== undefined &&
      rawTypeCarriesBannedSignature(checker, checker.getTypeOfSymbolAtLocation(rp, at))
    ) {
      return true;
    }
  }
  return false;
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

  // Prong 1 — calls, by resolved-signature identity. Dynamic `import(...)` of
  // a carrier module is flagged HERE, at the import spelling (whole-diff r4):
  // deciding on the awaited module type closes every downstream shape (inline
  // stuffing, destructuring, promise variables, `.then` callbacks) at once —
  // name-tracking the bound variable covered only direct initializers.
  const bannedCalls = new Set<CallExpression>();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isBannedDecl(checker.getResolvedSignature(call)?.getDeclaration())) {
      bannedCalls.add(call);
      const firstArg = call.getArguments()[0];
      findings.push(
        findingFor(call, "call", firstArg === undefined ? "" : firstArg.getText().trim()),
      );
      continue;
    }
    if (call.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      const awaited = raw.getAwaitedType(raw.getTypeAtLocation(call.compilerNode));
      if (awaited !== undefined && rawModuleCarries(raw, awaited, call.compilerNode)) {
        findings.push(findingFor(call, "reference", ""));
      }
      continue;
    }
    // CommonJS carrier loads (whole-diff r7): `require("next/server")` — typed
    // or not, renamed or not — is detected by the CALLEE's `Require` type and
    // the string specifier, resolved to the module whose namespace carries.
    const callee = call.getExpression();
    const arg0 = call.getArguments()[0];
    if (
      arg0 !== undefined &&
      Node.isStringLiteral(arg0) &&
      Node.isIdentifier(callee) &&
      isNodeRequireType(callee) &&
      specifierResolvesToCarrier(sf, arg0.getLiteralText())
    ) {
      findings.push(findingFor(call, "reference", ""));
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
  // Tracked locals are decided by TYPE, not by spelling (whole-diff r5): a
  // renamed static re-export (`export { NextResponse as Redirector }`), a
  // default re-export, a re-exported namespace, or a multi-hop chain all
  // deliver a carrier under an arbitrary local name — so EVERY import binding
  // (default, namespace, named) whose type carries the banned method (directly,
  // via its `redirect` property, or one namespace hop) joins the candidate
  // name set. Purely-local aliases (`const X = NextResponse`) need no entry:
  // their creation site spells a tracked name and is itself flagged.
  // (Dynamic-import namespaces need no name tracking either: the import CALL
  // is flagged in the prong-1 loop above — whole-diff r4.)
  const objectNames = new Set(["NextResponse", "Response"]);
  // The global objects are carriers too (their types hold `Response`) — but
  // unlike the class names they have pervasive legitimate value uses (polyfill
  // casts, feature probes: the tree's pdf-globals shim false-flagged under an
  // own-type decision), so they get a DESTINATION-typed decision (whole-diff
  // r14): the naked flow flags only when the contextual/asserted destination
  // type still carries the banned method.
  // Global-carrier provenance is SYMBOL-based (whole-diff r16): the four
  // ambient globals seed the set only when an identifier actually resolves to
  // the lib/@types declaration (a local `const global = {…}` or a shadowing
  // parameter resolves elsewhere and never joins). Provenance then extends to
  // a fixpoint through ordinary local aliases AND single-file helper returns
  // (`function currentEnvironment() { return globalThis; }`), keyed by each
  // symbol's first declaration node. DEEPER environment-object indirection is
  // the ratified evasion concession (spec §7 limit 2), same as every other
  // carrier family.
  const AMBIENT_GLOBAL_NAMES = new Set(["globalThis", "window", "self", "global"]);
  const carrierDecls = new Set<Node>();
  const carrierFnDecls = new Set<Node>();
  const declKeyOf = (node: Node): Node | undefined => {
    const sym = node.getSymbol();
    return sym?.getDeclarations()[0];
  };
  const isAmbientGlobalIdentifier = (id: Node): boolean => {
    if (!Node.isIdentifier(id) || !AMBIENT_GLOBAL_NAMES.has(id.getText())) return false;
    const decls = id.getSymbol()?.getDeclarations() ?? [];
    // globalThis has no declarations in some lib shapes; fall back to type-symbol.
    if (decls.length === 0) return id.getText() === "globalThis";
    return decls.some((d) => d.getSourceFile().getFilePath().includes("node_modules/"));
  };
  const symbolDeclsIn = (node: Node, set: ReadonlySet<Node>): boolean => {
    const decls = node.getSymbol()?.getDeclarations() ?? [];
    return decls.some((d) => set.has(d));
  };
  const isCarrierExpression = (exprIn: Node): boolean => {
    let expr: Node = exprIn;
    while (
      (Node.isParenthesizedExpression(expr) ||
        Node.isNonNullExpression(expr) ||
        Node.isAwaitExpression(expr)) &&
      expr.getExpression() !== undefined
    ) {
      expr = expr.getExpression();
    }
    if (Node.isIdentifier(expr)) {
      if (isAmbientGlobalIdentifier(expr)) return true;
      return symbolDeclsIn(expr, carrierDecls);
    }
    // `cond ? globalThis : window`, `window ?? globalThis` — carrier if either
    // branch is (whole-diff r18).
    if (Node.isConditionalExpression(expr)) {
      return isCarrierExpression(expr.getWhenTrue()) || isCarrierExpression(expr.getWhenFalse());
    }
    if (Node.isBinaryExpression(expr)) {
      const op = expr.getOperatorToken().getKind();
      if (
        op === SyntaxKind.QuestionQuestionToken ||
        op === SyntaxKind.BarBarToken ||
        op === SyntaxKind.AmpersandAmpersandToken
      ) {
        return isCarrierExpression(expr.getLeft()) || isCarrierExpression(expr.getRight());
      }
      return false;
    }
    if (Node.isCallExpression(expr)) {
      let callee: Node = expr.getExpression();
      while (
        (Node.isParenthesizedExpression(callee) || Node.isNonNullExpression(callee)) &&
        callee.getExpression() !== undefined
      ) {
        callee = callee.getExpression();
      }
      if (Node.isIdentifier(callee)) return symbolDeclsIn(callee, carrierFnDecls);
    }
    return false;
  };
  /** Returns OWNED by this function — nested function bodies excluded (r17 FP). */
  const ownReturnExpressions = (fnBody: Node): Node[] => {
    const out: Node[] = [];
    const walk = (n: Node): void => {
      if (
        Node.isFunctionDeclaration(n) ||
        Node.isFunctionExpression(n) ||
        Node.isArrowFunction(n) ||
        Node.isMethodDeclaration(n) ||
        Node.isClassDeclaration(n) ||
        Node.isClassExpression(n) ||
        Node.isGetAccessorDeclaration(n) ||
        Node.isSetAccessorDeclaration(n) ||
        Node.isConstructorDeclaration(n)
      ) {
        return;
      }
      if (Node.isReturnStatement(n)) {
        const e = n.getExpression();
        if (e !== undefined) out.push(e);
      }
      n.forEachChild(walk);
    };
    fnBody.forEachChild(walk);
    return out;
  };
  const functionLikeReturnsCarrier = (fnLike: Node): boolean => {
    if (Node.isArrowFunction(fnLike)) {
      const body = fnLike.getBody();
      return Node.isBlock(body)
        ? ownReturnExpressions(body).some(isCarrierExpression)
        : isCarrierExpression(body);
    }
    if (Node.isFunctionDeclaration(fnLike) || Node.isFunctionExpression(fnLike)) {
      const body = fnLike.getBody();
      return body !== undefined && ownReturnExpressions(body).some(isCarrierExpression);
    }
    return false;
  };
  /** Unwrap parens/non-null/as/satisfies from an alias RHS — runtime identity
   * survives all of them (whole-diff r20). */
  const unwrapAliasRhs = (exprIn: Node): Node => {
    let e: Node = exprIn;
    while (
      (Node.isParenthesizedExpression(e) ||
        Node.isNonNullExpression(e) ||
        Node.isAsExpression(e) ||
        Node.isSatisfiesExpression(e)) &&
      e.getExpression() !== undefined
    ) {
      e = e.getExpression();
    }
    return e;
  };
  let carrierSetGrew = true;
  while (carrierSetGrew) {
    carrierSetGrew = false;
    for (const vd of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const nameNode = vd.getNameNode();
      if (!Node.isIdentifier(nameNode)) continue;
      const init = vd.getInitializer();
      if (init === undefined) continue;
      if (isCarrierExpression(unwrapAliasRhs(init))) {
        if (!carrierDecls.has(vd)) {
          carrierDecls.add(vd);
          carrierSetGrew = true;
        }
        continue;
      }
      const initFn = unwrapAliasRhs(init);
      if (
        (Node.isArrowFunction(initFn) || Node.isFunctionExpression(initFn)) &&
        functionLikeReturnsCarrier(initFn) &&
        !carrierFnDecls.has(vd)
      ) {
        carrierFnDecls.add(vd);
        carrierSetGrew = true;
        continue;
      }
      // Helper ALIAS: `const choose = pick` — wrapped forms included (r19/r20).
      const unwrappedInit = unwrapAliasRhs(init);
      if (
        Node.isIdentifier(unwrappedInit) &&
        symbolDeclsIn(unwrappedInit, carrierFnDecls) &&
        !carrierFnDecls.has(vd)
      ) {
        carrierFnDecls.add(vd);
        carrierSetGrew = true;
      }
    }
    for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
      if (functionLikeReturnsCarrier(fn) && !carrierFnDecls.has(fn)) {
        carrierFnDecls.add(fn);
        carrierSetGrew = true;
      }
    }
    // Staged initialization: `let environment; environment = globalThis;` —
    // and staged helper aliases: `let choose; choose = pick;` (r19).
    for (const bin of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      if (bin.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
      const lhs = bin.getLeft();
      if (!Node.isIdentifier(lhs)) continue;
      const rhs = unwrapAliasRhs(bin.getRight());
      const target = isCarrierExpression(rhs)
        ? carrierDecls
        : Node.isIdentifier(rhs) && symbolDeclsIn(rhs, carrierFnDecls)
          ? carrierFnDecls
          : undefined;
      if (target === undefined) continue;
      const decls = lhs.getSymbol()?.getDeclarations() ?? [];
      for (const d of decls) {
        if (!target.has(d)) {
          target.add(d);
          carrierSetGrew = true;
        }
      }
    }
  }
  for (const imp of sf.getImportDeclarations()) {
    const clause = imp.getImportClause();
    if (clause === undefined) continue;
    const bindings: Node[] = [];
    const defaultImport = clause.getDefaultImport();
    if (defaultImport !== undefined) bindings.push(defaultImport);
    const namedBindings = clause.getNamedBindings();
    if (namedBindings !== undefined && Node.isNamespaceImport(namedBindings)) {
      bindings.push(namedBindings.getNameNode());
    }
    for (const spec of imp.getNamedImports()) {
      bindings.push(spec.getAliasNode() ?? spec.getNameNode());
    }
    for (const binding of bindings) {
      if (carriesBanned(binding, binding.getType())) objectNames.add(binding.getText());
    }
  }
  // `import NR = NS.NextResponse` is VALUE-space alias syntax (whole-diff r10):
  // the binding joins the tracked set type-decidedly, so its naked uses flag —
  // the QualifiedName inside the import line itself stays skipped like any
  // other import statement.
  for (const ie of sf.getDescendantsOfKind(SyntaxKind.ImportEqualsDeclaration)) {
    const nameNode = ie.getNameNode();
    if (carriesBanned(nameNode, nameNode.getType())) objectNames.add(nameNode.getText());
  }
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!identifierIsExpressionUse(id)) continue;
    if (objectNames.has(id.getText())) {
      candidates.push(id);
      continue;
    }
    if (isCarrierExpression(id)) {
      if (inNonExtractingPosition(id, bannedCalls)) continue;
      const parent = id.getParent();
      const destinationType =
        parent !== undefined && (Node.isAsExpression(parent) || Node.isSatisfiesExpression(parent))
          ? parent.getType()
          : checker.getContextualType(id);
      // The destination is structurally erased by construction, so the check is
      // SHAPE-based: it exposes a callable `redirect`, bare or under a carrier
      // name. Erasing destinations (Record<string, unknown> polyfill casts)
      // expose neither.
      if (destinationType !== undefined && destinationLooksRedirectish(id, destinationType)) {
        findings.push(findingFor(id, "reference", ""));
      }
    }
  }
  // Helper CALLS producing a carrier get the same destination-shape decision;
  // an awaiting wrapper inherits the carrier and is judged at ITS destination.
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    let callee: Node = call.getExpression();
    while (
      (Node.isParenthesizedExpression(callee) || Node.isNonNullExpression(callee)) &&
      callee.getExpression() !== undefined
    ) {
      callee = callee.getExpression();
    }
    if (!Node.isIdentifier(callee)) continue;
    if (!symbolDeclsIn(callee, carrierFnDecls)) continue;
    let outer: Node = call;
    let parent = outer.getParent();
    while (
      parent !== undefined &&
      (Node.isAwaitExpression(parent) ||
        Node.isParenthesizedExpression(parent) ||
        Node.isNonNullExpression(parent)) &&
      parent.getExpression() === outer
    ) {
      outer = parent;
      parent = outer.getParent();
    }
    if (inNonExtractingPosition(outer, bannedCalls)) continue;
    const destinationType =
      parent !== undefined && (Node.isAsExpression(parent) || Node.isSatisfiesExpression(parent))
        ? parent.getType()
        : Node.isExpression(outer)
          ? checker.getContextualType(outer)
          : undefined;
    if (destinationType !== undefined && destinationLooksRedirectish(outer, destinationType)) {
      findings.push(findingFor(outer, "reference", ""));
    }
  }
  for (const node of candidates) {
    const t = node.getType();
    if (typeCarriesBannedSignature(t)) {
      // The node's value IS the method (direct carry) — flag in ANY position
      // except the exact call prong 1 already reported. Receiver position is
      // NOT exempt here: `NextResponse.redirect.call(undefined, u)` must flag
      // at the inner access even though it is the receiver of `.call`.
      const { child, parent } = effectivePosition(node);
      const calleeOfBanned =
        parent !== undefined &&
        Node.isCallExpression(parent) &&
        parent.getExpression() === child &&
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
  if (fixtureProject === undefined) {
    fixtureProject = new Project(AUDIT_PROJECT_OPTIONS);
    // Types anchor: @types/node (and next's types) enter the program only via
    // some import — without this seed, a fixture using bare `require` resolves
    // no `Require` symbol when it happens to run first/alone (order-dependence
    // of the r7 require branch, caught by the r8 repair's own probe).
    fixtureProject.createSourceFile("app/__audit_fixture__/__seed__.ts", `import "next/server";`, {
      overwrite: true,
    });
  }
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
  // Overwriting a module can change what a cached require-specifier verdict
  // would resolve to (whole-diff r9 finding 2) — drop the cache.
  specifierVerdicts.clear();
}

/** Audit a single fixture source. */
export function auditSource(repoRelativePath: string, source: string): SelfRedirectFinding[] {
  assertFixturePath(repoRelativePath);
  const sf = getFixtureProject().createSourceFile(repoRelativePath, source, { overwrite: true });
  return findSelfRedirects(sf);
}

/** Audit the real tree once; the companion test memoizes the result. */
export function auditTree(): TreeAudit {
  specifierVerdicts.clear(); // fixture-era verdicts must not leak into the tree scan
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
