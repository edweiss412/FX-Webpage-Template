import { Node, Project, type ObjectLiteralExpression, type Type } from "ts-morph";
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
        const spreadsAParseWarning = node
          .getProperties()
          .some(
            (p) => Node.isSpreadAssignment(p) && isAssignableToParseWarning(p.getExpression().getType()),
          );
        if (spreadsAParseWarning) return; // propagation, not emission
        unresolved.push({
          file,
          line: node.getStartLineNumber(),
          why: "code composed via a non-ParseWarning spread",
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
          // Follow the import alias: the emit site reads a const imported from
          // another module, so the local symbol is an alias, not the declaration.
          let symbol = initializer.getSymbol();
          try {
            symbol = symbol?.getAliasedSymbol() ?? symbol;
          } catch {
            // not an alias; keep the local symbol
          }
          for (const declaration of symbol?.getDeclarations() ?? []) {
            if (!Node.isVariableDeclaration(declaration)) continue;
            const value = unwrapAsExpressions(declaration.getInitializer());
            if (value && Node.isStringLiteral(value)) {
              sites.push({ code: value.getLiteralValue(), file, line, via: "const" });
              return;
            }
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
            Node.isFunctionDeclaration(a) || Node.isArrowFunction(a) || Node.isFunctionExpression(a),
        );
        if (!enclosing || !Node.isFunctionDeclaration(enclosing)) {
          unresolved.push({ file, line, why: "shorthand code, enclosing function is not a declaration" });
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
        if (parameterType?.isUnion() && parameterType.getUnionTypes().every((u) => u.isStringLiteral())) {
          for (const member of parameterType.getUnionTypes()) {
            sites.push({ code: String(member.getLiteralValue()), file, line, via: "union" });
          }
          return;
        }
        if (parameterType?.isStringLiteral()) {
          sites.push({ code: String(parameterType.getLiteralValue()), file, line, via: "union" });
          return;
        }

        let literalCallSites = 0;
        let dynamicCallSites = 0;
        for (const reference of enclosing.findReferencesAsNodes()) {
          const call = reference.getParent();
          if (!call || !Node.isCallExpression(call)) continue;
          // findReferencesAsNodes searches the WHOLE program, so the predicate
          // must be re-applied here. Without this, a test calling an exported
          // factory with a literal mints that code into the production manifest.
          const callFile = call.getSourceFile().getFilePath();
          if (!isScannedFile(callFile)) continue;
          const argument = unwrapAsExpressions(call.getArguments()[parameterIndex]);
          if (argument && Node.isStringLiteral(argument)) {
            sites.push({
              code: argument.getLiteralValue(),
              file: rel(callFile),
              line: call.getStartLineNumber(),
              via: "factory",
            });
            literalCallSites += 1;
          } else if (argument) {
            dynamicCallSites += 1;
          }
        }
        if (literalCallSites === 0) {
          unresolved.push({
            file,
            line,
            why: `factory ${factoryName}: no literal call sites (${dynamicCallSites} dynamic)`,
          });
        }
        return;
      }

      unresolved.push({ file, line, why: `code property kind ${property.getKindName()}` });
    });
  }

  return { sites, unresolved, nonLiteral };
}
