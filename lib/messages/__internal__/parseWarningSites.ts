/**
 * Type-aware, fail-closed recognizer for `ParseWarning` construction sites.
 * Spec: `docs/superpowers/specs/2026-08-03-scanner-precision-cluster-design.md` §3.1.
 *
 * WHY IT IS TYPE-AWARE. Every syntactic mechanism was built and refuted by probe:
 * widening the scan roots mis-attributes 10-13 admin-alert codes; stripping type
 * declarations misses value positions; and matching factories by their WRITTEN
 * return type is the original bug one level up — `warning(): Phase2Args["parseResult"]["warnings"][number]`
 * never spells `ParseWarning` and escaped it. So a site is recognized by what its
 * type IS, never by how anything is spelled. Direct precedent, ratified:
 * `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md`.
 *
 * WHY IT IS FAIL-CLOSED. Enumerating shapes to capture is an unbounded arms race —
 * three consecutive review rounds each produced a compiled shape the current rule
 * missed. The default is therefore SIGNAL: a site whose code cannot be resolved
 * fails the guard unless it matches one of exactly four classifications.
 *
 * WHY EVERY CLASSIFICATION IS CAPTURE-LINKED. A classification stating only a LOCAL
 * syntax/type condition proves nothing, because it never establishes that the
 * propagated or delegated code was captured anywhere. Four compiled mutants
 * exploited exactly that. So each skip is validated in a SECOND PASS against what
 * pass 1 actually captured.
 *
 * SOUNDNESS BOUNDARY (spec §3.5a). Tracing a code's provenance through `any` /
 * `unknown` or higher-order application is undecidable; no type-based recognizer
 * survives `const w: ParseWarning = someAny`. Such a code is neither captured nor
 * signalled. Zero such constructions exist in `lib/` or `app/` today. The real
 * closure is an enumerated catalog, filed as `BL-CATALOG-PARTITION-WARNING-CLASS`.
 *
 * SINGLE COMPILER WORLD: ts-morph wrappers and its exported `ts` namespace only.
 * The standalone `typescript` package is never imported — its nominal types do not
 * satisfy ts-morph's vendored compiler under strict tsc.
 */
import { Node, Project, SyntaxKind, type Type } from "ts-morph";

export type SkipKind = "FRAGMENT" | "COPY" | "FACTORY_BODY" | "USE";

export type SiteScan = {
  /** code -> the files that define it. */
  codes: Map<string, Set<string>>;
  /** `path:line kind (reason)` for every site whose code could not be resolved. */
  signalled: string[];
  /** Every skip, with the classification that justified it. */
  skips: Array<{ at: string; kind: SkipKind }>;
};

export type ScanOptions = {
  /** File declaring the warning type (default: the repo's parser types module). */
  typesFilePath?: string;
  /** Name of the type alias to resolve (default: `ParseWarning`). */
  typeName?: string;
  /** Which files to scan, by path relative to the project root. */
  include: (rel: string) => boolean;
};

const SHOUTY = /^[A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+$/;

/** A pending skip, resolved in pass 2 against what pass 1 captured. */
type Pending = { at: string; kind: SkipKind; claim: string | null };

export function scanParseWarningSites(project: Project, options: ScanOptions): SiteScan {
  const typesFilePath = options.typesFilePath ?? "lib/parser/types.ts";
  const typeName = options.typeName ?? "ParseWarning";

  const warningType = project
    .getSourceFileOrThrow(typesFilePath)
    .getTypeAliasOrThrow(typeName)
    .getType();
  const checker = project.getTypeChecker().compilerObject as unknown as {
    isTypeAssignableTo(a: unknown, b: unknown): boolean;
  };

  /** `any` / `never` / `unknown` satisfy assignability trivially — never a site. */
  const rawAssignable = (t: Type | undefined): boolean => {
    if (!t || t.isAny() || t.isNever() || t.isUnknown()) return false;
    try {
      return checker.isTypeAssignableTo(t.compilerType, warningType.compilerType);
    } catch {
      return false;
    }
  };
  const unwrapPromise = (t: Type | undefined): Type | undefined =>
    t && t.getSymbol()?.getName() === "Promise" ? t.getTypeArguments()[0] : t;
  const assignable = (t: Type | undefined): boolean =>
    rawAssignable(t) || rawAssignable(unwrapPromise(t));

  const literalsOf = (t: Type | undefined): string[] => {
    if (!t) return [];
    if (t.isStringLiteral()) return [t.getLiteralValueOrThrow() as string];
    if (t.isUnion()) return t.getUnionTypes().flatMap(literalsOf);
    return [];
  };

  /**
   * The literals of the argument bound to the callee's `code` PARAMETER.
   *
   * Taking "any code-shaped argument" reads the wrong value whenever a factory
   * carries a second SHOUTY-typed parameter and the real code is dynamic: the
   * unrelated literal is captured and the site never signals. Binding by
   * parameter name means an unresolvable code falls through to SIGNAL instead.
   */
  const codeArgumentLiterals = (call: Node): string[] => {
    if (!Node.isCallExpression(call) && !Node.isNewExpression(call)) return [];
    const signature = checkerSignatureOf(call);
    const parameters = signature?.getParameters() ?? [];
    const index = parameters.findIndex((p) => p.getName() === "code");
    if (index === -1) return [];
    const arg = call.getArguments()[index];
    return arg ? literalsOf(arg.getType()) : [];
  };

  const typeChecker = project.getTypeChecker();
  const checkerSignatureOf = (call: Node) => {
    try {
      return typeChecker.getResolvedSignature(call as never) as
        | { getParameters(): Array<{ getName(): string }> }
        | undefined;
    } catch {
      return undefined;
    }
  };

  const root = `${process.cwd()}/`;
  const relOf = (p: string): string => (p.startsWith(root) ? p.slice(root.length) : p);

  const codes = new Map<string, Set<string>>();
  const signalled: string[] = [];
  const skips: Array<{ at: string; kind: SkipKind }> = [];
  const pending: Pending[] = [];
  /** Skips whose link is "a capture happened INSIDE this span" (USE, COPY). */
  const pendingSpans: Array<{
    at: string;
    kind: SkipKind;
    span: { rel: string; start: number; end: number };
  }> = [];

  /** Where each capture happened, so a link can name a SPECIFIC body, not a file. */
  const captureSpans: Array<{ rel: string; start: number; end: number }> = [];

  const capture = (code: string, rel: string): void => {
    if (!SHOUTY.test(code)) return;
    const set = codes.get(code) ?? new Set<string>();
    set.add(rel);
    codes.set(code, set);
  };

  // ── Pass 1: capture what is statically determinable; defer every skip ───────
  for (const sourceFile of project.getSourceFiles()) {
    const rel = relOf(sourceFile.getFilePath());
    if (!options.include(rel)) continue;

    sourceFile.forEachDescendant((node) => {
      const isSiteKind =
        Node.isObjectLiteralExpression(node) ||
        Node.isCallExpression(node) ||
        Node.isNewExpression(node) ||
        Node.isAwaitExpression(node);
      if (!isSiteKind) return;

      let contextual: Type | undefined;
      let own: Type | undefined;
      try {
        contextual = node.getContextualType();
        own = node.getType();
      } catch {
        return;
      }
      // Contextual OR intrinsic: a warning passed to `sink(x: ParseWarning | Alert)`
      // has a non-assignable contextual type and an assignable own type.
      if (!assignable(contextual) && !assignable(own)) return;
      // An awaited call is one site, not two — the `await` is the site.
      if (Node.isCallExpression(node) && Node.isAwaitExpression(node.getParent())) return;

      const type = unwrapPromise(own) ?? own;
      const at = `${rel}:${node.getStartLineNumber()}`;

      // The code is read off the node's OWN type: the contextual type reports the
      // DECLARED property type (`string`) and loses every literal.
      let found = literalsOf(type?.getProperty("code")?.getTypeAtLocation(node));

      if (!found.length && Node.isObjectLiteralExpression(node)) {
        const prop = node.getProperty("code");
        if (prop && Node.isPropertyAssignment(prop)) {
          found = literalsOf(prop.getInitializerOrThrow().getType());
        } else if (prop && Node.isShorthandPropertyAssignment(prop)) {
          found = literalsOf(prop.getNameNode().getType());
        }
      }
      if (!found.length) {
        const call =
          Node.isCallExpression(node) || Node.isNewExpression(node)
            ? node
            : Node.isAwaitExpression(node) && Node.isCallExpression(node.getExpression())
              ? node.getExpression()
              : undefined;
        if (call) found = codeArgumentLiterals(call);
      }

      const resolved = found.filter((c) => SHOUTY.test(c));
      if (resolved.length) {
        for (const code of resolved) capture(code, rel);
        captureSpans.push({ rel, start: node.getStart(), end: node.getEnd() });
        return;
      }

      // ── fail-closed from here: a skip needs a classification AND a capture link ──

      // FRAGMENT — an object spread INTO a warning, selected only via its
      // contextual type. The enclosing warning site carries the verdict.
      if (Node.isObjectLiteralExpression(node) && !assignable(own) && !node.getProperty("code")) {
        const enclosing = node.getFirstAncestor(
          (a) => Node.isObjectLiteralExpression(a) && assignable(a.getType()),
        );
        pending.push({ at, kind: "FRAGMENT", claim: enclosing ? "enclosing-site" : null });
        return;
      }

      // COPY — propagates another warning's code. The spread source must itself be
      // warning-typed and not `any`/`unknown`, or the origin is untraceable.
      if (Node.isObjectLiteralExpression(node) && !node.getProperty("code")) {
        const codeType = type?.getProperty("code")?.getTypeAtLocation(node);
        if (codeType && !literalsOf(codeType).length) {
          const spread = node.getProperties().find((x) => Node.isSpreadAssignment(x));
          const sourceType =
            spread && Node.isSpreadAssignment(spread)
              ? spread.getExpression().getType()
              : undefined;
          const warningTyped =
            Boolean(sourceType) &&
            assignable(sourceType) &&
            !sourceType!.isAny() &&
            !sourceType!.isUnknown();
          // Warning-TYPED is necessary but nowhere near sufficient: `declare const
          // external: ParseWarning` satisfies it while its code was captured
          // nowhere. The link is the SOURCE's declaration containing a capture.
          const decl =
            spread && Node.isSpreadAssignment(spread)
              ? spread.getExpression().getSymbol()?.getDeclarations()?.[0]
              : undefined;
          const span = decl
            ? {
                rel: relOf(decl.getSourceFile().getFilePath()),
                start: decl.getStart(),
                end: decl.getEnd(),
              }
            : null;
          // A PARAMETER receives its warning from call sites inside the scanned
          // program — including `.map((w) => ({ ...w, blockRef }))`, the shape of
          // every real copy here — so the origin is somebody else's captured site.
          // An AMBIENT declaration (`declare const external: ParseWarning`) has no
          // such flow: warning-typed and non-any, yet captured nowhere. That is the
          // distinction, and it is why "warning-typed" alone was not a link.
          const fromParameter = Boolean(decl && Node.isParameterDeclaration(decl));
          if (warningTyped && fromParameter) skips.push({ at, kind: "COPY" });
          else if (warningTyped && span) pendingSpans.push({ at, kind: "COPY", span });
          else pending.push({ at, kind: "COPY", claim: null });
          return;
        }
      }

      // FACTORY_BODY — `code` is a parameter of the enclosing function, so the codes
      // arrive at that function's DIRECT call sites. At least one must exist:
      // "every call site resolves" is vacuously true at zero, which `.map(factory)` exploits.
      if (Node.isObjectLiteralExpression(node)) {
        const prop = node.getProperty("code");
        const valueSymbol =
          prop && Node.isShorthandPropertyAssignment(prop)
            ? prop.getValueSymbol()
            : prop && Node.isPropertyAssignment(prop)
              ? prop.getInitializerOrThrow().getSymbol()
              : undefined;
        const isParameter = valueSymbol
          ?.getDeclarations()
          ?.some((d) => Node.isParameterDeclaration(d));
        if (isParameter) {
          const fn = node.getFirstAncestor(
            (a) =>
              Node.isFunctionDeclaration(a) ||
              Node.isArrowFunction(a) ||
              Node.isFunctionExpression(a),
          );
          const nameNode = fn && Node.isFunctionDeclaration(fn) ? fn.getNameNode() : undefined;
          let anyDirect = false;
          let allResolve = true;
          if (nameNode) {
            for (const ref of nameNode.findReferencesAsNodes()) {
              const call = ref.getParentIfKind(SyntaxKind.CallExpression);
              if (!call || call.getExpression() !== ref) continue;
              const args = codeArgumentLiterals(call).filter((c) => SHOUTY.test(c));
              if (args.length) {
                anyDirect = true;
                for (const code of args) capture(code, rel);
                captureSpans.push({
                  rel: relOf(call.getSourceFile().getFilePath()),
                  start: call.getStart(),
                  end: call.getEnd(),
                });
              } else {
                allResolve = false;
              }
            }
          }
          if (anyDirect && allResolve) {
            skips.push({ at, kind: "FACTORY_BODY" });
            return;
          }
          pending.push({ at, kind: "FACTORY_BODY", claim: null });
          return;
        }
      }

      // USE — calls a factory whose body is a site in its own right. The callee must
      // resolve (through import aliases) to a function-like declaration WITH a body,
      // and that body must actually have produced a captured code.
      if (Node.isCallExpression(node)) {
        const symbol = node.getExpression().getSymbol();
        const aliased = symbol?.getAliasedSymbol?.() ?? symbol;
        const declarations = [
          ...(aliased?.getDeclarations() ?? []),
          ...(symbol?.getDeclarations() ?? []),
        ];
        const calleeBody = declarations
          .map((d) => ({
            rel: relOf(d.getSourceFile().getFilePath()),
            start: d.getStart(),
            end: d.getEnd(),
          }))
          .find((d) => options.include(d.rel));
        const hasScannedBody = declarations.some((d) => {
          if (!options.include(relOf(d.getSourceFile().getFilePath()))) return false;
          const isFnLike =
            Node.isFunctionDeclaration(d) ||
            Node.isMethodDeclaration(d) ||
            Node.isArrowFunction(d) ||
            Node.isFunctionExpression(d);
          return isFnLike && Boolean((d as { getBody?: () => unknown }).getBody?.());
        });
        if (hasScannedBody && calleeBody) {
          pendingSpans.push({ at, kind: "USE", span: calleeBody });
          return;
        }
      }

      signalled.push(`${at} ${node.getKindName()}`);
    });
  }

  // ── Pass 2: every deferred skip is validated against what pass 1 captured ───
  for (const p of pending) {
    if (p.kind === "FRAGMENT" || p.kind === "COPY") {
      if (p.claim) skips.push({ at: p.at, kind: p.kind });
      else signalled.push(`${p.at} ${p.kind} (untraceable source)`);
    } else {
      signalled.push(`${p.at} FACTORY_BODY (no resolving direct call site)`);
    }
  }

  // Span-linked skips: a capture must have happened INSIDE the specific callee
  // body (USE) or source declaration (COPY). A file-wide check accepts any
  // unrelated warning in the same file and lets the real code vanish.
  const capturedInside = (span: { rel: string; start: number; end: number }): boolean =>
    captureSpans.some((c) => c.rel === span.rel && c.start >= span.start && c.end <= span.end);

  for (const p of pendingSpans) {
    if (capturedInside(p.span)) skips.push({ at: p.at, kind: p.kind });
    else signalled.push(`${p.at} ${p.kind} (nothing captured inside the linked body)`);
  }

  return { codes, signalled, skips };
}
