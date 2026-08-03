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

export type ParseWarningCodeScan = {
  sites: ParseWarningCodeSite[];
  unresolved: UnresolvedCodeSite[];
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

  for (const sourceFile of project.getSourceFiles()) {
    const absolute = sourceFile.getFilePath();
    if (!isScannedFile(absolute)) continue;
    const file = rel(absolute);

    sourceFile.forEachDescendant((node) => {
      if (!Node.isObjectLiteralExpression(node)) return;

      const names = ownPropertyNames(node);
      const hasSpread = node.getProperties().some((p) => Node.isSpreadAssignment(p));

      // Cheap syntactic pre-filter before any type work: ParseWarning requires
      // severity, code and message, so anything assignable supplies all three
      // directly or through a spread.
      if (!names.has("code")) return;
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
        unresolved.push({
          file,
          line,
          why: `code initializer is ${initializer?.getKindName() ?? "absent"}`,
        });
        return;
      }

      unresolved.push({ file, line, why: `code property kind ${property.getKindName()}` });
    });
  }

  return { sites, unresolved };
}
