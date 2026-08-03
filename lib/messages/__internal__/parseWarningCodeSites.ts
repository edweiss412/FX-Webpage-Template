import {
  Node,
  Project,
  SyntaxKind,
  VariableDeclarationKind,
  type ObjectLiteralExpression,
  type Type,
} from "ts-morph";
import { resolve } from "node:path";

/**
 * Type-aware recognizer for every string literal that reaches the `code`
 * property of a `ParseWarning`.
 *
 * Replaces the generator's former directory-scan-plus-regex heuristic, which
 * both over-selected (nothing textual separates `code: "X"` on a ParseWarning
 * from `code: "X"` on an admin alert in the same file) and under-selected (a
 * factory takes its code as an argument, invisible to any `code:` regex).
 *
 * There is deliberately NO roots list: the scanned set is the TypeScript
 * program minus an exclusion predicate, so an emitter in an unanticipated
 * directory is covered by construction. Spec:
 * docs/superpowers/specs/2026-08-03-parse-warning-code-recognizer-design.md
 */

export type ParseWarningCodeSite = {
  code: string;
  /** repo-relative */
  file: string;
  line: number;
  via: "literal" | "const" | "factory" | "union";
};

export type UnresolvedCodeSite = { file: string; line: number; why: string };

/** A ParseWarning produced by something other than an object literal. */
export type NonLiteralConstruction = {
  file: string;
  line: number;
  kind: "class" | "object-assign";
};

export type ParseWarningCodeScan = {
  sites: ParseWarningCodeSite[];
  unresolved: UnresolvedCodeSite[];
  nonLiteral: NonLiteralConstruction[];
  /** `file:line` of any scanned file importing a warning factory from the fixture tree. */
  fixtureFactoryImporters: string[];
};

const ROOT = resolve(__dirname, "../../..");

/**
 * Excluded from the scan. `tests/` and the gallery fixture tree CONSUME the
 * warning universe (`buildWarning(code)`), so letting them define it would let
 * a fixture typo mint a code.
 */
const EXCLUDED_PREFIXES = ["tests/", "lib/dev/attentionScenarios/"] as const;

const rel = (absolute: string): string => absolute.replace(`${ROOT}/`, "");

function isScannedFile(absolute: string): boolean {
  if (!absolute.startsWith(`${ROOT}/`)) return false;
  if (absolute.includes("/node_modules/") || absolute.includes("/__generated__/")) return false;
  const path = rel(absolute);
  return !EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function ownPropertyNames(literal: ObjectLiteralExpression): Set<string> {
  const names = new Set<string>();
  for (const property of literal.getProperties()) {
    if (Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)) {
      names.add(property.getName());
    }
  }
  return names;
}

/** Unwrap `as const` / `as T` so the literal underneath is visible. */
function unwrapAsExpressions(node: Node | undefined): Node | undefined {
  let current = node;
  while (current && Node.isAsExpression(current)) current = current.getExpression();
  return current;
}

/**
 * Resolve an identifier to the string literal a `const X = "LIT"` declares,
 * following the import alias first — the emit site usually reads a const
 * imported from another module, so the local symbol is an alias, not the
 * declaration.
 */
/**
 * The string-literal members of a type, when the type is made entirely of them
 * (a lone literal counts). `null` / `undefined` members are ignored so an
 * optional union still enumerates. Returns undefined when the type is not an
 * enumeration of literals.
 */
function stringLiteralMembers(type: Type): string[] | undefined {
  const parts = type.isUnion() ? type.getUnionTypes() : [type];
  const meaningful = parts.filter((t) => !t.isNull() && !t.isUndefined());
  if (meaningful.length === 0) return undefined;
  if (!meaningful.every((t) => t.isStringLiteral())) return undefined;
  return meaningful.map((t) => String(t.getLiteralValue()));
}

function resolveStringConst(identifier: Node): string | undefined {
  if (!Node.isIdentifier(identifier)) return undefined;
  let symbol = identifier.getSymbol();
  try {
    symbol = symbol?.getAliasedSymbol() ?? symbol;
  } catch {
    // not an alias; keep the local symbol
  }
  for (const declaration of symbol?.getDeclarations() ?? []) {
    if (!Node.isVariableDeclaration(declaration)) continue;
    // Declaration KIND matters: a `let`/`var` binding whose initializer is a
    // literal is not a constant, and certifying its initial value would emit a
    // code the runtime never persists once the binding is reassigned.
    const statement = declaration.getVariableStatement();
    if (statement?.getDeclarationKind() !== VariableDeclarationKind.Const) continue;
    const value = unwrapAsExpressions(declaration.getInitializer());
    if (value && Node.isStringLiteral(value)) return value.getLiteralValue();
  }
  return undefined;
}

export function collectParseWarningCodeSites(): ParseWarningCodeScan {
  const project = new Project({ tsConfigFilePath: `${ROOT}/tsconfig.json` });
  const checker = project.getTypeChecker();
  // `isTypeAssignableTo` is not on ts-morph's wrapper; reach the compiler checker.
  const compilerChecker = checker.compilerObject as unknown as {
    isTypeAssignableTo: (source: unknown, target: unknown) => boolean;
  };

  // OrThrow deliberately: a rename must crash loudly rather than silently
  // emptying the result, which would make every downstream assertion vacuous.
  const parseWarningType = project
    .getSourceFileOrThrow(`${ROOT}/lib/parser/types.ts`)
    .getTypeAliasOrThrow("ParseWarning")
    .getType();

  const isAssignableToParseWarning = (type: Type | undefined): boolean => {
    // `any` is assignable to everything, so an `any`-typed expression would
    // false-positive (e.g. `Object.assign(Object.create(null), {...})`).
    if (!type || type.isAny() || type.isUnknown()) return false;
    try {
      return compilerChecker.isTypeAssignableTo(type.compilerType, parseWarningType.compilerType);
    } catch {
      return false;
    }
  };

  const sites: ParseWarningCodeSite[] = [];
  const unresolved: UnresolvedCodeSite[] = [];
  const nonLiteral: NonLiteralConstruction[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const absolute = sourceFile.getFilePath();
    if (!isScannedFile(absolute)) continue;
    const file = rel(absolute);

    sourceFile.forEachDescendant((node) => {
      if (Node.isClassDeclaration(node)) {
        // Same pre-filter trick as object literals: a class that cannot supply
        // all three required members can never be assignable, so skip the
        // expensive instance-type resolution on every unrelated class.
        const members = new Set(
          node.getMembers().map((m) => {
            const getName = (m as { getName?: () => string }).getName;
            return typeof getName === "function" ? getName.call(m) : "";
          }),
        );
        if (members.has("severity") && members.has("code") && members.has("message")) {
          const declaration = node.getSymbol()?.getDeclarations()?.[0];
          if (declaration && isAssignableToParseWarning(checker.getTypeAtLocation(declaration))) {
            nonLiteral.push({ file, line: node.getStartLineNumber(), kind: "class" });
          }
        }
        return;
      }

      if (Node.isCallExpression(node) && node.getExpression().getText() === "Object.assign") {
        if (isAssignableToParseWarning(node.getType())) {
          nonLiteral.push({ file, line: node.getStartLineNumber(), kind: "object-assign" });
        }
        return;
      }

      if (!Node.isObjectLiteralExpression(node)) return;

      const names = ownPropertyNames(node);
      const hasSpread = node.getProperties().some((p) => Node.isSpreadAssignment(p));

      // Cheap syntactic pre-filter before any type work: ParseWarning requires
      // severity, code and message, so anything assignable supplies all three
      // directly or through a spread.
      if (!names.has("code")) {
        // No own `code`: either PROPAGATION of an existing warning, or
        // COMPOSITION where the code arrives via a spread fragment. Composition
        // must be signaled — under a naive rule neither literal is a candidate,
        // so the code would vanish with nothing reaching `unresolved`.
        if (!hasSpread) return;
        if (!isAssignableToParseWarning(node.getType())) return;
        // ORDER matters. `{...priorWarning, ...codePart}` is propagation only if
        // nothing after the warning spread can overwrite `code`; a later
        // non-ParseWarning spread can, and a rule that asks merely whether ANY
        // spread is a warning skips it as propagation while recording neither a
        // site nor an unresolved construction.
        const spreads = node.getProperties().filter((p) => Node.isSpreadAssignment(p));
        const lastWarningSpread = spreads.reduce(
          (acc, p, i) => (isAssignableToParseWarning(p.getExpression().getType()) ? i : acc),
          -1,
        );
        // Only a later spread that can actually CARRY `code` overwrites it.
        // crew.ts:382 spreads an autocorrect-only fragment after the warning,
        // which cannot, so a mere "something follows" test false-positives.
        const overwrittenAfterwards =
          lastWarningSpread >= 0 &&
          spreads.slice(lastWarningSpread + 1).some((p) => {
            const t = p.getExpression().getType();
            // A named `code` property is the obvious carrier, but an index
            // signature or `any` can supply one at runtime while exposing no
            // named property — so both count as able to overwrite.
            if (t.isAny() || t.isUnknown()) return true;
            if (t.getStringIndexType() !== undefined) return true;
            return t.getProperty("code") !== undefined;
          });
        if (lastWarningSpread >= 0 && !overwrittenAfterwards) return; // propagation, not emission
        unresolved.push({
          file,
          line: node.getStartLineNumber(),
          why: overwrittenAfterwards
            ? "a non-ParseWarning spread follows the warning spread and can overwrite `code`"
            : "code composed via a non-ParseWarning spread",
        });
        return;
      }
      if (!hasSpread && !(names.has("severity") && names.has("message"))) return;
      if (!isAssignableToParseWarning(node.getType())) return;

      const line = node.getStartLineNumber();
      const property = node.getPropertyOrThrow("code");

      if (Node.isPropertyAssignment(property)) {
        const initializer = unwrapAsExpressions(property.getInitializer());
        if (initializer && Node.isStringLiteral(initializer)) {
          sites.push({ code: initializer.getLiteralValue(), file, line, via: "literal" });
          return;
        }
        if (initializer && Node.isIdentifier(initializer)) {
          const resolved = resolveStringConst(initializer);
          if (resolved !== undefined) {
            sites.push({ code: resolved, file, line, via: "const" });
            return;
          }
          unresolved.push({
            file,
            line,
            why: `identifier ${initializer.getText()} is not a string const`,
          });
          return;
        }

        unresolved.push({
          file,
          line,
          why: `code initializer is ${initializer?.getKindName() ?? "absent"}`,
        });
        return;
      }

      if (Node.isShorthandPropertyAssignment(property)) {
        // A factory: `function warn(code, message): ParseWarning { return { severity, code, message } }`.
        // The code is chosen at the CALL SITE, not here.
        const enclosing = property.getFirstAncestor(
          (a) =>
            Node.isFunctionDeclaration(a) ||
            Node.isArrowFunction(a) ||
            Node.isFunctionExpression(a),
        );
        if (!enclosing || !Node.isFunctionDeclaration(enclosing)) {
          unresolved.push({
            file,
            line,
            why: "shorthand code, enclosing function is not a declaration",
          });
          return;
        }
        const parameterIndex = enclosing.getParameters().findIndex((p) => p.getName() === "code");
        if (parameterIndex < 0) {
          unresolved.push({ file, line, why: "shorthand code, no matching parameter" });
          return;
        }
        const factoryName = enclosing.getName() ?? "(anonymous)";

        // Ordered BEFORE call-site analysis: a union-typed parameter enumerates
        // the universe exhaustively, whereas call sites enumerate only what is
        // currently called. reelWarning's one call site passes its code
        // dynamically, so call-site analysis alone would record nothing.
        const parameterType = enclosing.getParameters()[parameterIndex]?.getType();
        const parameterMembers = parameterType ? stringLiteralMembers(parameterType) : undefined;
        if (parameterMembers?.length) {
          for (const member of parameterMembers) {
            sites.push({ code: member, file, line, via: "union" });
          }
          return;
        }

        let callSites = 0;
        for (const reference of enclosing.findReferencesAsNodes()) {
          // The reference is not always the callee itself: `ns.warning("X")`
          // and `const alias = warning; alias("X")` put the identifier under a
          // PropertyAccess or a VariableDeclaration. Walk up to the nearest
          // enclosing call and confirm the reference is in its callee position,
          // so an argument that merely mentions the factory is not miscounted.
          const call = reference.getFirstAncestor(Node.isCallExpression);
          if (!call) {
            unresolved.push({
              file: rel(reference.getSourceFile().getFilePath()),
              line: reference.getStartLineNumber(),
              why: `factory ${factoryName}: reference is not a call (aliased or re-exported)`,
            });
            continue;
          }
          // The reference must be in the CALLEE position — an argument that
          // merely mentions the factory is not a call of it.
          const callee = call.getExpression();
          const inCallee =
            callee === reference ||
            callee.getDescendantsOfKind(SyntaxKind.Identifier).some((n) => n === reference);
          if (!inCallee) continue;
          // findReferencesAsNodes searches the WHOLE program, so the predicate
          // must be re-applied here. Without this, a test calling an exported
          // factory with a literal mints that code into the production manifest.
          const callFile = call.getSourceFile().getFilePath();
          if (!isScannedFile(callFile)) continue;
          callSites += 1;
          const callAt = { file: rel(callFile), line: call.getStartLineNumber() };
          const argument = unwrapAsExpressions(call.getArguments()[parameterIndex]);

          if (argument && Node.isStringLiteral(argument)) {
            sites.push({ code: argument.getLiteralValue(), ...callAt, via: "factory" });
            continue;
          }
          const resolved = argument ? resolveStringConst(argument) : undefined;
          if (resolved !== undefined) {
            sites.push({ code: resolved, ...callAt, via: "const" });
            continue;
          }
          // The argument is dynamic, but its TYPE may still enumerate the
          // universe — `warning(reelVerification.warningCode)` passes a
          // `ReelWarningCode | null`. Same treatment rule 3 gives a union-typed
          // parameter, applied here to the argument.
          const argumentMembers = argument ? stringLiteralMembers(argument.getType()) : undefined;
          if (argumentMembers?.length) {
            for (const member of argumentMembers)
              sites.push({ code: member, ...callAt, via: "union" });
            continue;
          }
          // Judged PER CALL SITE, never in aggregate. A sibling literal call
          // must NOT mask a dynamic one: `warning("EMBEDDED_ASSET_DRIFTED")`
          // and `warning(reelVerification.warningCode)` live two lines apart in
          // lib/sync/applyStaged.ts, and an aggregate "no literal call sites"
          // test silently dropped the second.
          unresolved.push({
            ...callAt,
            why: `factory ${factoryName}: call argument is ${argument?.getKindName() ?? "absent"}`,
          });
        }
        if (callSites === 0) {
          unresolved.push({
            file,
            line,
            why: `factory ${factoryName}: no call sites in scanned files`,
          });
        }
        return;
      }

      unresolved.push({ file, line, why: `code property kind ${property.getKindName()}` });
    });
  }

  // Assertion 5's data, computed in-process. The former implementation shelled
  // out to `rg`, which scanned Markdown (a historical plan snippet read as a
  // production import) and, under a shell without `rg` on PATH, returned empty
  // through its `|| true` and asserted nothing at all.
  const fixtureFactoryImporters: string[] = [];
  const FIXTURE_FACTORIES = new Set(["buildWarning", "crewScopedWarning"]);
  for (const sourceFile of project.getSourceFiles()) {
    const absolute = sourceFile.getFilePath();
    if (!isScannedFile(absolute)) continue;
    for (const declaration of sourceFile.getImportDeclarations()) {
      if (!declaration.getModuleSpecifierValue().includes("lib/dev/attentionScenarios")) continue;
      const named = declaration.getNamedImports().map((n) => n.getName());
      if (named.some((n) => FIXTURE_FACTORIES.has(n))) {
        fixtureFactoryImporters.push(`${rel(absolute)}:${declaration.getStartLineNumber()}`);
      }
    }
  }

  return { sites, unresolved, nonLiteral, fixtureFactoryImporters };
}
