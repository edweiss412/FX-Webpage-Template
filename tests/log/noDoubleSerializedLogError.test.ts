// tests/log/noDoubleSerializedLogError.test.ts
//
// The logger serializes exactly ONCE. `buildRecord` (lib/log/logger.ts) runs
// `serializeError(fields.error)` on its way to the record, so a call site that ALSO wraps the
// value hands `serializeError` a plain object; its non-Error branch is `String(value)`, and the
// persisted diagnostic collapses to the literal string "[object Object]". The field exists to
// carry the failure, and double-serializing silently destroys it.
//
// Spec: docs/superpowers/specs/observability/2026-08-15-sync-log-emit-guard-design.md §2.2, AC-7.
//
// WALK-DERIVED, NOT ENUMERATED. The 18 in-class sites this guard first turned red are not
// written down here. The scanner walks `lib/`, `app/`, and `components/` from disk, so a NEW site
// fails by default rather than needing anyone to remember to add a row. An enumerated cover
// re-opens the moment someone adds a file.
//
// CLOSURE SET (the mutation families this recognizer is claimed to cover, declared up front):
//   1. re-wrap      — `error: serializeError(x)` at any walked `log.*` call site.
//   2. alias        — the same through a renamed import (`import { serializeError as s }`),
//                     caught by resolving the IMPORT BINDING rather than matching a bare name.
//   3. spread-carrier — the property reaching the fields object through an object spread,
//                     including the conditional-spread form the picker resolvers use
//                     (`...(d === undefined ? {} : { error: serializeError(d) })`).
//
// DOCUMENTED LIMITS, not gaps to widen the recognizer for: a helper that wraps and then forwards
// (interprocedural flow), and a computed/dynamic property name. Both are outside the threat
// model below, and a probe demonstrating either files to the spec's limits section rather than
// growing this scanner. A wider recognizer is a bigger target for the next round.
//
// CONSEQUENCE BOUND. Every input is either handled correctly or reported; there is no
// silent-wrong path. A false positive is a LOUD failure a contributor resolves by unwrapping the
// call (which is the fix in every real case) or by taking the limit to the spec.
//
// THREAT MODEL FENCE. Ordinary authoring mistakes by a contributor who is not trying to evade
// the guard — copying a neighbouring emit that still wrapped, or reaching for the helper out of
// habit. Deliberate obfuscation (aliasing `log` itself through a local, building the property
// name at runtime, indexing the logger) is out of scope.
import { describe, expect, test } from "vitest";
import { Node, Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { premise } from "../_shared/premise";

/** The levels `lib/log` exposes. `debug` is console-only but double-serializes identically. */
const LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);

/** The module specifiers that can supply the shared `serializeError` helper. */
const SERIALIZE_ERROR_MODULES = ["@/lib/log", "@/lib/log/serializeError", "./serializeError"];

type Finding = { file: string; line: number; text: string };

/**
 * Local binding names for the shared `serializeError` helper in this file. Resolving the import
 * (rather than matching the bare identifier) is what makes the ALIAS family land: a renamed
 * import binds a different name to the same function, and a name-only scan misses it.
 */
function serializeErrorBindings(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const fromLogModule =
      SERIALIZE_ERROR_MODULES.includes(specifier) || specifier.endsWith("/log/serializeError");
    if (!fromLogModule) continue;
    for (const named of declaration.getNamedImports()) {
      if (named.getName() !== "serializeError") continue;
      names.add(named.getAliasNode()?.getText() ?? named.getName());
    }
  }
  return names;
}

/**
 * Strip parentheses. `...(cond ? {} : {...})` REQUIRES them to parse, so the spread's expression
 * is a ParenthesizedExpression and not the conditional itself — the shape both picker resolvers
 * use. Missing this is what the planted spread-carrier fixture caught.
 */
function unwrapParens(node: Node): Node {
  let current = node;
  while (Node.isParenthesizedExpression(current)) current = current.getExpression();
  return current;
}

/** Every object literal that contributes properties to `fields`, spreads resolved one level in. */
function contributingObjectLiterals(root: ObjectLiteralExpression): ObjectLiteralExpression[] {
  const literals: ObjectLiteralExpression[] = [root];
  for (const property of root.getProperties()) {
    if (!Node.isSpreadAssignment(property)) continue;
    const spread = unwrapParens(property.getExpression());
    // `...{ error: ... }` and `...(cond ? {} : { error: ... })` both carry the property through.
    const candidates = Node.isConditionalExpression(spread)
      ? [spread.getWhenTrue(), spread.getWhenFalse()].map(unwrapParens)
      : [spread];
    for (const candidate of candidates) {
      if (Node.isObjectLiteralExpression(candidate))
        literals.push(...contributingObjectLiterals(candidate));
    }
  }
  return literals;
}

/** Report every `log.<level>(msg, { ... error: serializeError(x) ... })` in one source file. */
export function findDoubleSerializedSites(sourceFile: SourceFile): Finding[] {
  const wrappers = serializeErrorBindings(sourceFile);
  if (wrappers.size === 0) return [];

  const findings: Finding[] = [];
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const receiver = callee.getExpression();
    // The `log` object itself, not `console` and not an aliased logger (threat-model fence).
    if (!Node.isIdentifier(receiver) || receiver.getText() !== "log") continue;
    if (!LOG_LEVELS.has(callee.getName())) continue;

    const secondArgument = call.getArguments()[1];
    if (!secondArgument) continue;
    const fields = unwrapParens(secondArgument);
    if (!Node.isObjectLiteralExpression(fields)) continue;

    for (const literal of contributingObjectLiterals(fields)) {
      for (const property of literal.getProperties()) {
        if (!Node.isPropertyAssignment(property)) continue;
        if (property.getName() !== "error") continue;
        const initializer = property.getInitializer();
        if (!initializer || !Node.isCallExpression(initializer)) continue;
        const wrapper = initializer.getExpression();
        if (!Node.isIdentifier(wrapper) || !wrappers.has(wrapper.getText())) continue;
        findings.push({
          file: sourceFile.getFilePath(),
          line: property.getStartLineNumber(),
          text: property.getText().replace(/\s+/g, " "),
        });
      }
    }
  }
  return findings;
}

function newProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false },
  });
}

/**
 * Planted fixtures, run UNCONDITIONALLY. Without them a scanner that silently stopped
 * recognizing the banned shape (a renamed ts-morph API, a typo in the level set) would report
 * zero findings over a clean tree and read exactly like success.
 */
const BANNED_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function reWrap(e: unknown) {
  void log.error("re-wrap family", { source: "probe", error: serializeError(e) });
}
`;

const ALIAS_FIXTURE = `
import { serializeError as toLoggable } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function aliased(e: unknown) {
  void log.warn("alias family", { source: "probe", error: toLoggable(e) });
}
`;

const SPREAD_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function spreadCarrier(detail: unknown) {
  void log.info("spread-carrier family", {
    source: "probe",
    ...(detail === undefined ? {} : { error: serializeError(detail) }),
  });
}
`;

const ALLOWED_FIXTURE = `
import { serializeError } from "@/lib/log/serializeError";
import { log } from "@/lib/log";

export function raw(err: unknown) {
  // The correct shape: the logger serializes this exactly once.
  void log.error("raw error", { source: "probe", error: err });
}

export function consoleDirect(e: unknown) {
  // console never re-serializes, so pre-serializing here is correct and must NOT be flagged
  // (this is the shape lib/log/persist.ts uses at both of its console sites).
  console.error("[probe] write failed", { error: serializeError(e) });
}
`;

describe("no double-serialized log.* error fields (AC-7)", () => {
  test("the scanner flags every banned family in a planted fixture", () => {
    const project = newProject();
    const banned = [
      ["re-wrap", BANNED_FIXTURE],
      ["alias", ALIAS_FIXTURE],
      ["spread-carrier", SPREAD_FIXTURE],
    ] as const;

    for (const [family, source] of banned) {
      const fixture = project.createSourceFile(`__premise_${family}__.ts`, source);
      const found = findDoubleSerializedSites(fixture);
      expect(found, `the ${family} family must be recognized`).toHaveLength(1);
    }
  });

  test("the scanner leaves a raw error field and a console-direct site alone", () => {
    const project = newProject();
    const fixture = project.createSourceFile("__premise_allowed__.ts", ALLOWED_FIXTURE);
    expect(findDoubleSerializedSites(fixture)).toEqual([]);
  });

  test("no source file passes a pre-serialized error to log.*", () => {
    const project = newProject();
    const files = walkSourceFiles(["lib", "app", "components"]);
    // The walk has to actually reach the tree, or an empty file list would report zero findings
    // and read as a pass. 500 is far below the real count and far above any accident.
    premise("the source walk reaches the repository tree", files.length, 500);

    const findings = files.flatMap((path) =>
      findDoubleSerializedSites(project.addSourceFileAtPath(path)),
    );

    expect(
      findings.map((f) => `${f.file}:${f.line} ${f.text}`),
      "pass the RAW value; buildRecord (lib/log/logger.ts) serializes it exactly once",
    ).toEqual([]);
  });
});
