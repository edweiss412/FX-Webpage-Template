/**
 * tests/db/_connectionCensus.ts
 *
 * The connection census: every file under `tests/` that opens a database connection
 * through the `postgres` driver is CLASSIFIED into one of the accepted target classes,
 * or REPORTED by name. Spec:
 * `docs/superpowers/specs/ci/2026-08-21-destructive-guard-discovery-by-connection-design.md`.
 *
 * THE FORBIDDEN DIRECTION IS SILENCE. Every decision below is a total function whose
 * default branch is a REPORT, never a pass, so "neither classified nor reported" is
 * unrepresentable in the classification layer and any residual silent pass can live only
 * in DISCOVERY — what the walk treats as an input. Discovery is therefore ONE derived
 * extractor (`moduleSpecifiersIn`), consumed by both the driver walk and the edge walk;
 * seven of the twelve spec-round findings were two walks knowing different positions.
 *
 * NO BINDER, NO PROGRAM, NO TYPE CHECKER. Every tree comes from `ts.createSourceFile`
 * with `setParentNodes` true, which is the one configuration in which `.parent` is
 * populated by the PARSER. An upward `.parent` walk over a program-built tree without a
 * binder pass silently no-ops in the direction that looks like success.
 *
 * WHAT THIS MODULE DOES NOT DECIDE. It never reads SQL and never extends
 * `DESTRUCTIVE_STATEMENT_PATTERNS`; it says nothing about the VALUE of an environment
 * variable; and `guard-bound` is a LABEL for a site whose argument resolves to a guard
 * call, never a claim that the guard is EFFECTIVE — that question is
 * `_destructiveFileAnalysis.checkConnection`'s and stays there.
 */
import ts from "typescript";

import { REPO_ALIAS } from "@/vitest.projects";
import { isTransparent, skipTransparent } from "@/tests/_shared/outerExpressions";

import { stripCommentsForFile, stripSqlComments } from "@/tests/_shared/stripComments";

import type { DispositionKind, DispositionRow } from "./_connectionCensusDispositions";
import { DESTRUCTIVE_STATEMENT_PATTERNS, GUARD_OWN_FILES } from "./_destructiveStatements";
import { ACCEPTED_HOSTS } from "./_localDbUrl";
import { isGuardModule } from "./_localDbUrlScan";

export type SiteClass =
  | "guard-bound"
  | "validation-env"
  | "loopback-literal"
  | "remote-literal"
  | "unclassifiable";

export type ReportKind =
  | "unclassifiable"
  | "remote-literal"
  | "shadowed-driver"
  | "acquisition"
  | "value-reference"
  | "unresolved-import"
  | "loader-call"
  | "channel";

export type SpecifierPosition =
  | "import-declaration"
  | "export-declaration"
  | "import-equals"
  | "dynamic-import"
  | "require-call"
  | "loader-call";

export type ModuleSpecifierRef = {
  position: SpecifierPosition;
  /** Null for a specifier the census cannot read statically — never dropped. */
  literal: string | null;
  /** The specifier node itself, or the call when the specifier is absent. */
  node: ts.Node;
  /** The declaration or call the specifier belongs to. */
  declaration: ts.Node;
  loader?: { member: string; hasFactory: boolean };
};

export type DriverBinding = {
  name: string;
  form: "default-import" | "namespace-import" | "const-acquisition" | "import-equals";
  /** The identifier node that DECLARES the binding. */
  node: ts.Node;
  shadowed: boolean;
};

export type ConnectSite = {
  ordinal: number;
  line: number;
  call: ts.CallExpression;
  callee: string;
};

export type SiteClassification = {
  cls: SiteClass;
  envNames: string[];
  argText: string;
  detail: string;
  argIsCall: boolean;
};

export type ClassifiedSite = ConnectSite & SiteClassification;

export type Report = {
  file: string;
  line: number;
  /** The site ordinal, or null for a report that is not a connect site. */
  ordinal: number | null;
  kind: ReportKind;
  /** The disposition key: the argument's source text, or the acquisition's. */
  site: string;
  detail: string;
  argIsCall: boolean;
  /** Consumers that reach this file through the helper graph. One report, at the helper. */
  affected?: string[];
};

export type FileRecord = {
  file: string;
  /** The parsed tree, carried so a caller that also needs edges parses the file ONCE. */
  sf: ts.SourceFile;
  bindings: DriverBinding[];
  sites: ClassifiedSite[];
  reports: Report[];
};

/** The module specifier the census keys the population on. */
export const DRIVER_SPECIFIER = "postgres";

/**
 * The options postgres.js accepts BESIDE the URL that cannot steer the target.
 * Default-deny: an outer key outside this set makes the site `unclassifiable`, so
 * `postgres(url, { host: "…" })` — which connects to the overridden host while the URL
 * says loopback — reports rather than passing on its first argument.
 */
export const OPTIONS_ACCEPT_SET: ReadonlySet<string> = new Set([
  "max",
  "prepare",
  "idle_timeout",
  "connect_timeout",
  "max_lifetime",
  "onnotice",
  "debug",
  "transform",
  "types",
  "fetch_types",
  "connection",
]);

/** vitest loader members that EVALUATE the named module, so they yield its value. */
export const LOADER_MEMBERS_LOAD: ReadonlySet<string> = new Set(["importActual", "importMock"]);
/** Members that load only when called WITHOUT a factory (automocking evaluates the original). */
export const LOADER_MEMBERS_CONDITIONAL: ReadonlySet<string> = new Set(["mock", "doMock"]);
/** Members that load nothing. */
export const LOADER_MEMBERS_INERT: ReadonlySet<string> = new Set(["unmock", "doUnmock"]);

/** The accepted environment-name sequences, in order. Anything else reports. */
const ACCEPTED_ENV_CHAINS: ReadonlyArray<readonly string[]> = [
  ["TEST_DATABASE_URL"],
  ["TEST_DATABASE_URL", "DATABASE_URL"],
];

/** Outer option names that CAN redirect the connection, listed for the report text. */
const STEERING_OPTION_NAMES: ReadonlySet<string> = new Set([
  "host",
  "hostname",
  "port",
  "path",
  "database",
  "db",
  "user",
  "username",
  "password",
  "pass",
  "ssl",
  "socket",
]);

/**
 * Wrapper transparency comes from `tests/_shared/outerExpressions.ts`, which main shipped
 * while this arc was in flight. This module carried its own copy of the binding, justified
 * at the time by the precedent living in an ENROLLED surface this arc must not edit; the
 * shared module is not enrolled, so that reason is gone and the copy with it. Four copies of
 * one normalizer is how three of them go stale on their own schedules.
 */
/** Every meaning-preserving wrapper removed, through the ONE shared binding. */
const unwrap = skipTransparent;

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function parseSource(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(filePath),
  );
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function literalTextOf(node: ts.Node | undefined): string | null {
  if (node === undefined) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/**
 * EVERY module-specifier position the parser has, plus vitest's loader positions.
 *
 * This is the ONE extractor: the driver walk and the edge walk both consume it, and the
 * deciding suite asserts no other function in this module reads a specifier position.
 * The alternative — two walks each enumerating positions — is exactly the shape that
 * produced spec rounds 1, 3 and 4 (a side-effect import, `vi.importActual`, a
 * root-relative specifier), one position per round.
 */
export function moduleSpecifiersIn(sf: ts.SourceFile): ModuleSpecifierRef[] {
  const out: ModuleSpecifierRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      out.push({
        position: "import-declaration",
        literal: literalTextOf(node.moduleSpecifier),
        node: node.moduleSpecifier,
        declaration: node,
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      out.push({
        position: "export-declaration",
        literal: literalTextOf(node.moduleSpecifier),
        node: node.moduleSpecifier,
        declaration: node,
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      // An ImportEqualsDeclaration carries `moduleReference`, never `initializer`.
      out.push({
        position: "import-equals",
        literal: literalTextOf(node.moduleReference.expression),
        node: node.moduleReference.expression,
        declaration: node,
      });
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const first = node.arguments[0];
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        // `ts.isImportKeyword` exists at runtime but not in the public typings.
        out.push({
          position: "dynamic-import",
          literal: literalTextOf(first),
          node: first ?? node,
          declaration: node,
        });
      } else if (ts.isIdentifier(callee) && callee.text === "require") {
        out.push({
          position: "require-call",
          literal: literalTextOf(first),
          node: first ?? node,
          declaration: node,
        });
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "vi"
      ) {
        out.push({
          position: "loader-call",
          literal: literalTextOf(first),
          node: first ?? node,
          declaration: node,
          loader: { member: callee.name.text, hasFactory: node.arguments.length > 1 },
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

/** True when this loader position EVALUATES the module it names. */
export function loaderLoads(loader: { member: string; hasFactory: boolean }): boolean {
  if (LOADER_MEMBERS_LOAD.has(loader.member)) return true;
  return LOADER_MEMBERS_CONDITIONAL.has(loader.member) && !loader.hasFactory;
}

/** True when the member is one the census has a decided answer for. */
export function loaderKnown(member: string): boolean {
  return (
    LOADER_MEMBERS_LOAD.has(member) ||
    LOADER_MEMBERS_CONDITIONAL.has(member) ||
    LOADER_MEMBERS_INERT.has(member)
  );
}

/**
 * Every declaration of `name` in the file, in every scope. The census resolves no
 * scope, so "declared twice" is answered by counting, not by reasoning about which
 * declaration a call would bind to — the same conservative answer `checkConnection`
 * and `_localDbUrlScan` give, arrived at from the same evidence.
 */
export function declarationsOf(sf: ts.SourceFile, name: string): ts.Node[] {
  const out: ts.Node[] = [];
  const fromBindingName = (bn: ts.BindingName, node: ts.Node): void => {
    if (ts.isIdentifier(bn)) {
      if (bn.text === name) out.push(node);
      return;
    }
    for (const el of bn.elements) {
      if (ts.isBindingElement(el)) fromBindingName(el.name, el);
    }
  };
  const walk = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n)) fromBindingName(n.name, n);
    else if (ts.isParameter(n)) fromBindingName(n.name, n);
    else if (
      (ts.isFunctionDeclaration(n) ||
        ts.isFunctionExpression(n) ||
        ts.isClassDeclaration(n) ||
        ts.isClassExpression(n)) &&
      n.name !== undefined &&
      ts.isIdentifier(n.name) &&
      n.name.text === name
    ) {
      out.push(n);
    } else if (ts.isImportDeclaration(n) && n.importClause) {
      const clause = n.importClause;
      if (clause.name && clause.name.text === name) out.push(clause.name);
      const nb = clause.namedBindings;
      if (nb !== undefined) {
        if (ts.isNamespaceImport(nb)) {
          if (nb.name.text === name) out.push(nb.name);
        } else {
          for (const el of nb.elements) if (el.name.text === name) out.push(el.name);
        }
      }
    } else if (ts.isImportEqualsDeclaration(n) && n.name.text === name) {
      out.push(n.name);
    }
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);
  return out;
}

/**
 * The `const` (or import-equals) binding an acquisition expression flows into, unwrapped
 * through parentheses, `await`, the compiler's outer expressions and a trailing
 * `.default`. A `let`, a destructuring or a bare statement yields null — the residual
 * `acquisition` report, never a dropped site (spec round 2 F1: reporting the acquisition
 * and losing the sites it produces left a live connect call in no census at all).
 */
function constBindingFor(start: ts.Node): ts.Identifier | null {
  let cur: ts.Node = start;
  for (;;) {
    const parent: ts.Node | undefined = cur.parent;
    if (parent === undefined) return null;
    if (ts.isAwaitExpression(parent) && parent.expression === cur) {
      cur = parent;
      continue;
    }
    // An OUTER EXPRESSION is whatever the compiler says is transparent: a node the
    // compiler's own skip moves off, whose operand is the node we came from. Asking the
    // compiler rather than listing the wrapper kinds is the same choice `unwrap` makes.
    if (
      (parent as unknown as { expression?: ts.Node }).expression === cur &&
      isTransparent(parent)
    ) {
      cur = parent;
      continue;
    }
    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === cur &&
      parent.name.text === "default"
    ) {
      cur = parent;
      continue;
    }
    // `cur` only ever moves to an EXPRESSION above, and a variable declaration's one
    // expression child is its initializer — so an `initializer === cur` conjunct here
    // could not be falsified by any input. The other direction is dead too: reaching the
    // `const` branch needs a parent whose own parent is a VariableDeclarationList, and
    // nothing but a VariableDeclaration is one. Deleted rather than blessed with an
    // equivalence row, as `isAliasSourceName`'s unreachable branches were.
    if (ts.isVariableDeclaration(parent)) {
      const list = parent.parent;
      const isConst = ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
      if (!isConst || !ts.isIdentifier(parent.name)) return null;
      return parent.name;
    }
    return null;
  }
}

function acquisitionReport(
  sf: ts.SourceFile,
  node: ts.Node,
  detail: string,
  kind: ReportKind = "acquisition",
): Report {
  return {
    file: sf.fileName,
    line: lineOf(sf, node),
    ordinal: null,
    kind,
    site: node.getText(sf),
    detail,
    argIsCall: false,
  };
}

/**
 * Every acquisition of the driver, classified into a BINDING or a REPORT. There is no
 * third answer: a specifier position naming `"postgres"` that the census cannot follow
 * to a binding reports, so a client obtained by a route the walk does not model is never
 * silently "not a connect site".
 */
export function acquisitionsIn(sf: ts.SourceFile): {
  bindings: DriverBinding[];
  reports: Report[];
} {
  const bindings: DriverBinding[] = [];
  const reports: Report[] = [];
  const bind = (name: ts.Identifier, form: DriverBinding["form"]): void => {
    bindings.push({
      name: name.text,
      form,
      node: name,
      shadowed: declarationsOf(sf, name.text).length > 1,
    });
  };

  for (const ref of moduleSpecifiersIn(sf)) {
    if (ref.literal !== DRIVER_SPECIFIER) continue;

    if (ref.position === "import-declaration") {
      const decl = ref.declaration as ts.ImportDeclaration;
      const clause = decl.importClause;
      if (clause === undefined) {
        reports.push(
          acquisitionReport(
            sf,
            decl,
            "a side-effect import of the driver: it evaluates the module and binds nothing",
          ),
        );
        continue;
      }
      if (clause.isTypeOnly) continue;
      if (clause.name) bind(clause.name, "default-import");
      const nb = clause.namedBindings;
      if (nb !== undefined) {
        if (ts.isNamespaceImport(nb)) {
          bind(nb.name, "namespace-import");
        } else {
          for (const el of nb.elements) {
            if (el.isTypeOnly) continue;
            reports.push(
              acquisitionReport(
                sf,
                el,
                `a named VALUE import of the driver (\`${el.name.text}\`): the default export is ` +
                  "the only constructor, so the census cannot follow this to a connect site",
              ),
            );
          }
        }
      }
      continue;
    }

    if (ref.position === "export-declaration") {
      reports.push(
        acquisitionReport(sf, ref.declaration, "a re-export of the driver from a tests/ module"),
      );
      continue;
    }

    if (ref.position === "import-equals") {
      bind((ref.declaration as ts.ImportEqualsDeclaration).name, "import-equals");
      continue;
    }

    // dynamic-import / require-call / loader-call: an acquisition EXPRESSION.
    if (ref.position === "loader-call") {
      const loader = ref.loader;
      if (loader === undefined || !loaderLoads(loader)) {
        if (loader !== undefined && !loaderKnown(loader.member)) {
          reports.push(
            acquisitionReport(
              sf,
              ref.declaration,
              `an unrecognised vitest loader member (\`vi.${loader.member}\`) naming the driver: ` +
                "the census cannot decide whether it evaluates the module",
            ),
          );
        }
        continue;
      }
    }
    const bound = constBindingFor(ref.declaration);
    if (bound === null) {
      reports.push(
        acquisitionReport(
          sf,
          ref.declaration,
          "a driver acquisition the census cannot follow to a `const` or import-equals binding; " +
            "use a static default import, or add an `acquisition` disposition row",
        ),
      );
      continue;
    }
    bind(bound, "const-acquisition");
  }

  return { bindings, reports };
}

type CallCollection = {
  sites: ConnectSite[];
  shadowedCalls: ts.CallExpression[];
  valueReferences: ts.Identifier[];
};

function collectCalls(sf: ts.SourceFile, bindings: readonly DriverBinding[]): CallCollection {
  const byName = new Map<string, DriverBinding>();
  for (const b of bindings) byName.set(b.name, b);
  const declarationNodes = new Set<ts.Node>(bindings.map((b) => b.node));

  const siteCalls: ts.CallExpression[] = [];
  const shadowedCalls: ts.CallExpression[] = [];
  const calleeNodes = new Set<ts.Node>();
  const valueReferences: ts.Identifier[] = [];

  const visitCalls = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = unwrap(n.expression);
      if (ts.isIdentifier(callee)) {
        const binding = byName.get(callee.text);
        if (binding !== undefined && binding.form !== "namespace-import") {
          calleeNodes.add(callee);
          (binding.shadowed ? shadowedCalls : siteCalls).push(n);
        }
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        const binding = byName.get(callee.expression.text);
        if (
          binding !== undefined &&
          binding.form === "namespace-import" &&
          callee.name.text === "default"
        ) {
          calleeNodes.add(callee.expression);
          (binding.shadowed ? shadowedCalls : siteCalls).push(n);
        }
      }
    }
    ts.forEachChild(n, visitCalls);
  };
  ts.forEachChild(sf, visitCalls);

  const visitReferences = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const binding = byName.get(n.text);
      const isReference =
        binding !== undefined &&
        // A SHADOWED name's non-call references are deliberately not reported: the
        // census resolves no scope, so it cannot tell the local declaration's uses from
        // the driver's, and every CALL — the only reference that can open a connection —
        // already reports as `shadowed-driver`.
        !binding.shadowed &&
        !declarationNodes.has(n) &&
        !calleeNodes.has(n) &&
        !isAliasSourceName(n) &&
        !isPropertyNamePosition(n) &&
        !isInTypePosition(n);
      if (isReference) valueReferences.push(n);
    }
    ts.forEachChild(n, visitReferences);
  };
  ts.forEachChild(sf, visitReferences);

  const sites = siteCalls
    .slice()
    .sort((a, b) => a.getStart(sf) - b.getStart(sf))
    .map((call, index) => ({
      ordinal: index + 1,
      line: lineOf(sf, call),
      call,
      callee: unwrap(call.expression).getText(sf),
    }));

  return { sites, shadowedCalls, valueReferences };
}

/**
 * The SOURCE half of an alias: `const { postgres: pg } = o` and
 * `import { postgres as pg } from "./x"` both NAME a property; neither reads the driver
 * binding, so neither is a value reference.
 *
 * Every OTHER declaration position this function used to test is unreachable here by
 * construction, and the mutation gate is what proved it: a second declaration of the
 * driver's name makes the binding SHADOWED, a shadowed binding reports its CALLS and
 * nothing else, and the binding's own declaration node is excluded by identity before this
 * is consulted — so the variable, parameter, function, class and import-equals branches
 * could not be reached by any input, and not one mutant of them could be killed. They are
 * deleted rather than blessed with an equivalence row.
 */
function isAliasSourceName(id: ts.Identifier): boolean {
  const p = id.parent;
  return (ts.isBindingElement(p) || ts.isImportSpecifier(p)) && p.propertyName === id;
}

/**
 * A name inside a TYPE reads no value and opens no connection: `postgres.JSONValue` and
 * `ReturnType<typeof postgres>` are the live spellings, in 50+ files. The compiler decides
 * what a type position IS — a hand-written list of type node kinds would be the enumeration
 * this module avoids everywhere else — by walking up to the first `ts.isTypeNode` ancestor.
 */
function isInTypePosition(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur !== undefined && !ts.isSourceFile(cur)) {
    if (ts.isTypeNode(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * A property KEY, not a value read. `id.parent` is non-optional in the compiler's typings
 * once the tree is parsed with `setParentNodes`, so a runtime check for its absence would
 * be a tautology and is deliberately not written.
 */
function isPropertyNamePosition(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) {
    return p.name === id;
  }
  return false;
}

/** Connect sites: a call of a driver binding whose name is declared nowhere else. */
export function sitesIn(sf: ts.SourceFile): ConnectSite[] {
  return collectCalls(sf, acquisitionsIn(sf).bindings).sites;
}

type Resolution =
  | { kind: "guard" }
  | { kind: "env"; names: string[] }
  | { kind: "loopback" }
  | { kind: "remote"; host: string }
  | { kind: "unclassifiable"; detail: string };

/** Non-empty BY TYPE: the base case is one operand and the recursive case concatenates two. */
function flattenChain(expr: ts.Expression): [ts.Expression, ...ts.Expression[]] {
  const node = unwrap(expr);
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return [...flattenChain(node.left), ...flattenChain(node.right)];
  }
  return [node];
}

/** `process.env.NAME` / `process.env["NAME"]`, or null. */
function envNameOf(expr: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expr) && !ts.isElementAccessExpression(expr)) return null;
  const receiver = unwrap(expr.expression);
  const receiverIsEnv =
    ts.isPropertyAccessExpression(receiver) &&
    ts.isIdentifier(receiver.expression) &&
    receiver.expression.text === "process" &&
    receiver.name.text === "env";
  if (!receiverIsEnv) return null;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  const key = unwrap(expr.argumentExpression);
  return literalTextOf(key);
}

function hostResolution(text: string): Resolution {
  let host: string;
  try {
    host = new URL(text).hostname;
  } catch {
    return {
      kind: "unclassifiable",
      detail: "a string literal that does not parse as a URL",
    };
  }
  return ACCEPTED_HOSTS.has(host) ? { kind: "loopback" } : { kind: "remote", host };
}

function guardNamesIn(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const ref of moduleSpecifiersIn(sf)) {
    if (ref.position !== "import-declaration" || ref.literal === null) continue;
    if (!isGuardModule(ref.literal, sf.fileName)) continue;
    const clause = (ref.declaration as ts.ImportDeclaration).importClause;
    if (clause === undefined || clause.isTypeOnly) continue;
    if (clause.name) out.add(clause.name.text);
    const nb = clause.namedBindings;
    if (nb !== undefined && !ts.isNamespaceImport(nb)) {
      for (const el of nb.elements) if (!el.isTypeOnly) out.add(el.name.text);
    }
  }
  return out;
}

function resolveOperand(
  sf: ts.SourceFile,
  expr: ts.Expression,
  guards: ReadonlySet<string>,
  seen: Set<string>,
): Resolution {
  const node = unwrap(expr);

  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    if (ts.isIdentifier(callee) && guards.has(callee.text)) {
      // A guard NAME declared twice is ambiguous by the same any-declaration rule the
      // driver gets: the census cannot tell the imported guard from a local of the same
      // name, and declining is the only answer that is not a guess.
      if (declarationsOf(sf, callee.text).length > 1) {
        return {
          kind: "unclassifiable",
          detail: `the guard name \`${callee.text}\` is declared more than once in this file`,
        };
      }
      return { kind: "guard" };
    }
    return { kind: "unclassifiable", detail: "a call result the census does not follow" };
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return hostResolution(node.text);
  }

  const envName = envNameOf(node);
  if (envName !== null) return { kind: "env", names: [envName] };

  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return { kind: "unclassifiable", detail: "a property read the census does not follow" };
  }

  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) {
      return { kind: "unclassifiable", detail: "a self-referential binding" };
    }
    const declarations = declarationsOf(sf, node.text);
    if (declarations.length === 0) {
      return { kind: "unclassifiable", detail: `\`${node.text}\` has no declaration in this file` };
    }
    const resolutions: Resolution[] = [];
    for (const declaration of declarations) {
      if (!ts.isVariableDeclaration(declaration)) {
        return {
          kind: "unclassifiable",
          detail: `\`${node.text}\` is declared by something other than a const initializer`,
        };
      }
      const list = declaration.parent;
      const isConst = ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
      if (!isConst || declaration.initializer === undefined) {
        return {
          kind: "unclassifiable",
          detail: `\`${node.text}\` is not a const with an initializer`,
        };
      }
      const next = new Set(seen);
      next.add(node.text);
      resolutions.push(resolveChain(sf, declaration.initializer, guards, next));
    }
    const [first, ...rest] = resolutions;
    if (first === undefined) {
      return { kind: "unclassifiable", detail: `\`${node.text}\` resolves to nothing` };
    }
    for (const other of rest) {
      if (renderResolution(other) !== renderResolution(first)) {
        return {
          kind: "unclassifiable",
          detail: `\`${node.text}\` has declarations that classify differently`,
        };
      }
    }
    return first;
  }

  return {
    kind: "unclassifiable",
    detail: `an argument shape the census does not resolve (${ts.SyntaxKind[node.kind]})`,
  };
}

/** A stable rendering, used only to compare two resolutions for equality. */
function renderResolution(r: Resolution): string {
  if (r.kind === "env") return `env:${r.names.join(",")}`;
  if (r.kind === "remote") return `remote:${r.host}`;
  if (r.kind === "unclassifiable") return `unclassifiable:${r.detail}`;
  return r.kind;
}

function resolveChain(
  sf: ts.SourceFile,
  expr: ts.Expression,
  guards: ReadonlySet<string>,
  seen: Set<string>,
): Resolution {
  // The empty-chain case is UNREPRESENTABLE rather than guarded: `flattenChain` returns a
  // non-empty tuple, so a runtime check for an empty operand list is a tautology — and the
  // killer audit proved it was worse than that. The guard that used to sit here SWALLOWED a
  // classifier returning nothing, so the totality sweep could not kill that mutant: a
  // second, more permissive check downstream of the real one is how a defect stays invisible
  // while both look careful.
  const [firstExpr, ...restExprs] = flattenChain(expr);
  const first = resolveOperand(sf, firstExpr, guards, seen);
  const operands = [
    first,
    ...restExprs.map((operand) => resolveOperand(sf, operand, guards, seen)),
  ];
  if (operands.length === 1) return first;
  if (operands.some((o) => o.kind === "guard")) return { kind: "guard" };
  const names: string[] = [];
  for (const operand of operands) {
    if (operand.kind === "env") names.push(...operand.names);
    else if (operand.kind !== "loopback") {
      return {
        kind: "unclassifiable",
        detail:
          operand.kind === "unclassifiable"
            ? `a mixed chain: ${operand.detail}`
            : "a chain mixing an accepted source with a non-loopback literal",
      };
    }
  }
  return names.length === 0 ? { kind: "loopback" } : { kind: "env", names };
}

function classOfResolution(r: Resolution): { cls: SiteClass; envNames: string[]; detail: string } {
  if (r.kind === "guard") return { cls: "guard-bound", envNames: [], detail: "" };
  if (r.kind === "loopback") return { cls: "loopback-literal", envNames: [], detail: "" };
  if (r.kind === "remote") {
    return {
      cls: "remote-literal",
      envNames: [],
      detail: `a hard-coded non-loopback host \`${r.host}\``,
    };
  }
  if (r.kind === "unclassifiable") return { cls: "unclassifiable", envNames: [], detail: r.detail };
  const accepted = ACCEPTED_ENV_CHAINS.some(
    (chain) => chain.length === r.names.length && chain.every((n, i) => n === r.names[i]),
  );
  return accepted
    ? { cls: "validation-env", envNames: r.names, detail: "" }
    : {
        cls: "unclassifiable",
        envNames: r.names,
        detail: `environment names outside the accept-set, in this order: ${r.names.join(", ")}`,
      };
}

/**
 * Why the arguments AFTER the URL are part of the accept-set: `postgres()` with no
 * argument connects wherever libpq's `PG*` environment points, and
 * `postgres(url, { host: "…" })` overrides the URL's host — so a classifier that reads
 * only the first argument is silent while the driver connects somewhere else.
 *
 * `connection`'s KEYS are unrestricted: they are server-side runtime parameters that
 * postgres.js sends AFTER the socket is open (a driver probe on the live
 * `connection: { statement_timeout: 5000 }` site confirmed the target is unchanged), so
 * restricting them would red a correct file.
 */
function optionsProblem(options: ts.Expression): string | null {
  const node = unwrap(options);
  if (!ts.isObjectLiteralExpression(node)) {
    return "the options argument is not an object literal, so its keys cannot be read";
  }
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) return "a spread in the options object";
    if (ts.isShorthandPropertyAssignment(property)) {
      return `a shorthand option (\`${property.name.text}\`) bound outside the call`;
    }
    if (!ts.isPropertyAssignment(property)) {
      return "an options member that is not a plain `name: value` pair";
    }
    if (!ts.isIdentifier(property.name)) return "a computed or non-identifier option key";
    const key = property.name.text;
    if (!OPTIONS_ACCEPT_SET.has(key)) {
      return STEERING_OPTION_NAMES.has(key)
        ? `an option that can steer the target: ${key}`
        : `an option outside the accept-set: ${key}`;
    }
    if (key === "connection") {
      const value = unwrap(property.initializer);
      if (!ts.isObjectLiteralExpression(value)) {
        return "a `connection` value that is not an object literal";
      }
      for (const sub of value.properties) {
        if (!ts.isPropertyAssignment(sub) || !ts.isIdentifier(sub.name)) {
          return "a `connection` member that is not a plain `name: value` pair";
        }
        const literal = unwrap(sub.initializer);
        const isLiteral =
          ts.isStringLiteral(literal) ||
          ts.isNoSubstitutionTemplateLiteral(literal) ||
          ts.isNumericLiteral(literal) ||
          literal.kind === ts.SyntaxKind.TrueKeyword ||
          literal.kind === ts.SyntaxKind.FalseKeyword;
        if (!isLiteral) {
          return `a \`connection.${sub.name.text}\` value that is not a literal`;
        }
      }
    }
  }
  return null;
}

/** Total: every argument shape lands in the closed union, and the default is a REPORT. */
export function classifySite(sf: ts.SourceFile, site: ConnectSite): SiteClassification {
  const args = site.call.arguments;
  const firstArg = args[0];
  const argText = firstArg === undefined ? site.call.getText(sf) : firstArg.getText(sf);
  const argIsCall = firstArg !== undefined && ts.isCallExpression(unwrap(firstArg));

  if (firstArg === undefined) {
    return {
      cls: "unclassifiable",
      envNames: [],
      argText,
      argIsCall,
      detail:
        "postgres() with no argument: libpq's PG* environment decides the target, and the " +
        "census cannot read it",
    };
  }
  if (args.length > 2) {
    return {
      cls: "unclassifiable",
      envNames: [],
      argText,
      argIsCall,
      detail: "a third argument the census does not model",
    };
  }

  const guards = guardNamesIn(sf);
  const resolved = classOfResolution(resolveChain(sf, firstArg, guards, new Set()));
  const secondArg = args[1];
  const problem = secondArg === undefined ? null : optionsProblem(secondArg);
  if (problem !== null) {
    return {
      cls: "unclassifiable",
      envNames: resolved.envNames,
      argText,
      argIsCall,
      detail: problem,
    };
  }
  return {
    cls: resolved.cls,
    envNames: resolved.envNames,
    argText,
    argIsCall,
    detail: resolved.detail,
  };
}

/** The per-file record: bindings, classified sites, and every report the file owes. */
export function classifyFile(filePath: string, source: string): FileRecord {
  const sf = parseSource(filePath, source);
  const { bindings, reports: acquisitionReports } = acquisitionsIn(sf);
  const { sites, shadowedCalls, valueReferences } = collectCalls(sf, bindings);

  const classified: ClassifiedSite[] = sites.map((site) => ({
    ...site,
    ...classifySite(sf, site),
  }));

  const reports: Report[] = [...acquisitionReports];

  for (const call of shadowedCalls) {
    reports.push({
      file: filePath,
      line: lineOf(sf, call),
      ordinal: null,
      kind: "shadowed-driver",
      site: call.arguments[0]?.getText(sf) ?? call.getText(sf),
      detail:
        "the driver binding's name is declared more than once in this file; rename the local " +
        "declaration that reuses it",
      argIsCall: false,
    });
  }

  for (const reference of valueReferences) {
    reports.push({
      file: filePath,
      line: lineOf(sf, reference),
      ordinal: null,
      kind: "value-reference",
      site: reference.getText(sf),
      detail:
        "the driver binding is used as a VALUE rather than called, so the census cannot see " +
        "where the connection it produces points",
      argIsCall: false,
    });
  }

  for (const site of classified) {
    if (site.cls !== "unclassifiable" && site.cls !== "remote-literal") continue;
    reports.push({
      file: filePath,
      line: site.line,
      ordinal: site.ordinal,
      kind: site.cls,
      site: site.argText,
      detail: site.detail,
      argIsCall: site.argIsCall,
    });
  }

  // Stable by line: `Array.prototype.sort` preserves insertion order among equal keys, and
  // insertion order within a line is already the order the walk found them in. A second
  // comparison term would only restate that.
  reports.sort((a, b) => a.line - b.line);
  return { file: filePath, sf, bindings, sites: classified, reports };
}

/** A file's class after dispositions are applied to its reported sites. */
export type FileClass = SiteClass | "dispositioned" | "undisposed";

export type CensusFileInput = {
  file: string;
  sf: ts.SourceFile;
  /** The file's OWN resolved classes, before anything is inherited. */
  own: readonly FileClass[];
};

/** Injected so the suite drives constructed modules and the gate stats the real tree. */
export type ImportResolver = (fromFile: string, specifier: string) => string | null;

export type PropagationResult = {
  classes: Map<string, Set<FileClass>>;
  reports: Report[];
  /** Path-shaped edges leaving `tests/`, counted per file and never red. */
  productionEdges: Map<string, number>;
  /** For a helper whose own set is `undisposed`: every consumer that reaches it. */
  affected: Map<string, string[]>;
};

/**
 * The specifier PREFIXES that are path-shaped through the repo alias. `REPO_ALIAS` is a
 * FUNCTION of the root, so it is CALLED with the root and the KEYS of the returned map are
 * read; `Object.keys(REPO_ALIAS)` would yield none, and a second alias added to that map is
 * then covered without a census edit.
 */
export function aliasPrefixes(root: string): string[] {
  return Object.keys(REPO_ALIAS(root));
}

/** The walk root: the destructive guard's root, and the census's. */
export const TESTS_ROOT_PREFIX = "tests/";

/**
 * What counts as a SOURCE file, for the walk and for the edge walk alike — one set, two
 * consumers, so the population and the edges can never disagree about what a module is.
 * A resolved target outside it (a JSON baseline, a CSS fixture) carries no code and can
 * open no connection, so it is a DECIDED non-edge rather than a report.
 */
export const SOURCE_EXTENSIONS = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/;

/**
 * PATH-SHAPED is derived from the module system's own forms plus the repo alias map:
 * `./`, `../`, a leading `/` (Vite's project-root form), and `<key>/` for every key of
 * `REPO_ALIAS(root)`. Anything else is a bare package specifier and is not followed.
 */
export function isPathShaped(specifier: string, root: string): boolean {
  if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
    return true;
  }
  return aliasPrefixes(root).some((key) => specifier.startsWith(`${key}/`));
}

function edgeReport(
  input: CensusFileInput,
  ref: ModuleSpecifierRef,
  kind: ReportKind,
  detail: string,
): Report {
  return {
    file: input.file,
    line: lineOf(input.sf, ref.node),
    ordinal: null,
    kind,
    site: ref.literal ?? ref.node.getText(input.sf),
    detail,
    argIsCall: false,
  };
}

/**
 * The helper graph to a FIXPOINT: a file with no site of its own that imports a
 * connecting module inherits that module's resolved class set, transitively and through
 * cycles. A one-level walk passes a helper-of-a-helper silently, which is why the
 * deciding suite runs one beside this and asserts they disagree.
 *
 * Every specifier the walk declines to follow leaves a trace: a non-literal specifier and
 * an unresolvable path-shaped one REPORT, a path-shaped edge leaving `tests/` is COUNTED
 * as a production edge, and a bare package specifier is not an edge at all. A dropped
 * edge is the silent direction and does not exist here.
 */
export function propagateThroughImports(
  files: readonly CensusFileInput[],
  resolve: ImportResolver,
  root: string = process.cwd(),
): PropagationResult {
  const classes = new Map<string, Set<FileClass>>();
  const reports: Report[] = [];
  const productionEdges = new Map<string, number>();
  const edges = new Map<string, string[]>();
  const known = new Set(files.map((f) => f.file));

  for (const input of files) {
    classes.set(input.file, new Set<FileClass>(input.own));
    const targets: string[] = [];
    let production = 0;

    for (const ref of moduleSpecifiersIn(input.sf)) {
      if (ref.position === "loader-call") {
        const loader = ref.loader;
        if (loader === undefined) continue;
        if (!loaderLoads(loader)) {
          const pathShaped = ref.literal !== null && isPathShaped(ref.literal, root);
          if (!loaderKnown(loader.member) && pathShaped) {
            reports.push(
              edgeReport(
                input,
                ref,
                "loader-call",
                `an unrecognised vitest loader member (\`vi.${loader.member}\`) naming a ` +
                  "path-shaped module: the census cannot decide whether it evaluates it",
              ),
            );
          }
          continue;
        }
      }

      if (ref.literal === null) {
        reports.push(
          edgeReport(
            input,
            ref,
            "unresolved-import",
            "a module specifier the census cannot read statically; add an `unclassifiable` " +
              "disposition row naming this specifier",
          ),
        );
        continue;
      }
      if (!isPathShaped(ref.literal, root)) continue;

      const target = resolve(input.file, ref.literal);
      if (target === null) {
        reports.push(
          edgeReport(
            input,
            ref,
            "unresolved-import",
            "a path-shaped specifier that resolves to no file",
          ),
        );
        continue;
      }
      if (!target.startsWith(TESTS_ROOT_PREFIX)) {
        production += 1;
        continue;
      }
      if (!SOURCE_EXTENSIONS.test(target)) continue;
      if (!known.has(target)) {
        reports.push(
          edgeReport(
            input,
            ref,
            "unresolved-import",
            `resolves to \`${target}\`, which is under ${TESTS_ROOT_PREFIX} and not in the ` +
              "census population",
          ),
        );
        continue;
      }
      targets.push(target);
    }

    edges.set(input.file, targets);
    if (production > 0) productionEdges.set(input.file, production);
  }

  const reaches = new Map<string, Set<string>>(files.map((f) => [f.file, new Set<string>()]));
  let grew = true;
  while (grew) {
    grew = false;
    for (const input of files) {
      // Both maps were built from THIS list, one entry per input, so the lookups cannot
      // miss; a runtime check for that would be unreachable and the gate proved it.
      const mine = classes.get(input.file)!;
      const myReach = reaches.get(input.file)!;
      for (const target of edges.get(input.file) ?? []) {
        if (!myReach.has(target)) {
          myReach.add(target);
          grew = true;
        }
        for (const reached of reaches.get(target) ?? []) {
          if (!myReach.has(reached)) {
            myReach.add(reached);
            grew = true;
          }
        }
        for (const cls of classes.get(target) ?? []) {
          if (!mine.has(cls)) {
            mine.add(cls);
            grew = true;
          }
        }
      }
    }
  }

  // The obligation for an undisposed helper is ONE row where the SITE lives, so its
  // consumers are named as affected rather than each owing a row of their own.
  const affected = new Map<string, string[]>();
  for (const input of files) {
    if (!input.own.includes("undisposed")) continue;
    const consumers = files
      .filter((f) => f.file !== input.file && (reaches.get(f.file)?.has(input.file) ?? false))
      .map((f) => f.file)
      .sort();
    if (consumers.length > 0) affected.set(input.file, consumers);
  }

  return { classes, reports, productionEdges, affected };
}

export type InadmissibleRow = {
  row: DispositionRow;
  report: Report;
  reason: string;
};

export type Reconciliation = {
  /** Reports no row covers. */
  undisposed: Report[];
  /** Rows that match no live report. */
  stale: DispositionRow[];
  /** Rows that match more than one report without declaring which. */
  ambiguous: DispositionRow[];
  /** Rows whose kind is not admissible for the report they match. */
  inadmissible: InadmissibleRow[];
};

/**
 * Which disposition kinds may excuse THIS report. A `remote-literal` site has none: a
 * hard-coded remote DSN in a test is repaired, never excused.
 */
export function admissibleKindsFor(report: Report): DispositionKind[] {
  if (report.kind === "remote-literal") return [];
  if (report.kind === "acquisition" || report.kind === "value-reference") return ["acquisition"];
  if (report.kind === "channel") return ["channel"];
  if (report.kind === "unresolved-import" || report.kind === "loader-call") {
    return ["unclassifiable"];
  }
  // A site report. `resolver` claims the argument is a call of a function that resolves
  // the target through its own accept-set, so it is admissible only where there IS a call.
  return report.argIsCall ? ["resolver", "unclassifiable"] : ["unclassifiable"];
}

/**
 * BOTH DIRECTIONS. A registry checked forward only accumulates dead rows: a row that
 * matches nothing is STALE and red, which is the mechanism noticing a site that moved
 * under its text key, and a row that matches more than one report without declaring which
 * is AMBIGUOUS — it still covers the first occurrence, so the second is reported rather
 * than silently absorbed.
 */
export function reconcileDispositions(
  reports: readonly Report[],
  rows: readonly DispositionRow[],
): Reconciliation {
  const occurrences = new Map<string, number>();
  const keyed = reports.map((report) => {
    const key = `${report.file}\u0000${report.site}`;
    const nth = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, nth);
    return { report, nth };
  });

  const covered = new Set<Report>();
  const stale: DispositionRow[] = [];
  const ambiguous: DispositionRow[] = [];
  const inadmissible: InadmissibleRow[] = [];

  for (const row of rows) {
    const matches = keyed.filter((k) => k.report.file === row.file && k.report.site === row.site);
    if (matches.length === 0) {
      stale.push(row);
      continue;
    }
    if (row.nth === undefined && matches.length > 1) ambiguous.push(row);
    const wanted = row.nth ?? 1;
    const selected = matches.find((m) => m.nth === wanted);
    if (selected === undefined) {
      stale.push(row);
      continue;
    }
    const admissible = admissibleKindsFor(selected.report);
    if (!admissible.includes(row.kind)) {
      inadmissible.push({
        row,
        report: selected.report,
        reason:
          admissible.length === 0
            ? `a ${selected.report.kind} report has no admissible disposition kind`
            : `kind \`${row.kind}\` is not admissible for a ${selected.report.kind} report ` +
              `(admissible: ${admissible.join(", ")})`,
      });
      continue;
    }
    covered.add(selected.report);
  }

  return {
    undisposed: reports.filter((report) => !covered.has(report)),
    stale,
    ambiguous,
    inadmissible,
  };
}

export type JoinDeps = {
  patterns: Record<string, RegExp>;
  strip: (source: string, filePath: string) => string;
};

export type CensusSourceFile = { path: string; source: string };

export const DEFAULT_JOIN_DEPS: JoinDeps = {
  patterns: DESTRUCTIVE_STATEMENT_PATTERNS,
  strip: stripCommentsForFile,
};

/**
 * The destructive guard's OWN discovered set, computed by CALLING its recognizer and its
 * stripper rather than reproducing either. The union of two views is the destructive
 * meta-test's own rule: JS comments come off first, then SQL comments inside the surviving
 * literals, and a match in EITHER view counts — stripping SQL comments over a whole
 * TypeScript file treats a decrement as a line comment and can erase a real execution, so
 * the union can only ever ADD a match, never hide one.
 *
 * `patterns` and `strip` are INJECTED with the imported objects as defaults, and the
 * deciding suite asserts the defaults ARE those objects by identity: a private `new RegExp`
 * copy reproduces the live set and satisfies a literal-only structural check, but it cannot
 * respond to an injected pattern set.
 */
export function discoveredByDestructiveGuard(
  files: readonly CensusSourceFile[],
  deps: JoinDeps = DEFAULT_JOIN_DEPS,
): string[] {
  const exempt = new Set<string>(GUARD_OWN_FILES);
  const patterns = Object.values(deps.patterns);
  return files
    .filter(({ path, source }) => {
      if (exempt.has(path)) return false;
      const js = deps.strip(source, path);
      const sql = stripSqlComments(js);
      return patterns.some((pattern) => pattern.test(js) || pattern.test(sql));
    })
    .map(({ path }) => path);
}

/**
 * The one silent pass the census alone cannot see: a destructive statement reaching the
 * database through something that is not `postgres(...)`. Every discovered file must be in
 * the census population, or it is named here.
 */
export function channelReports(
  discovered: readonly string[],
  population: ReadonlySet<string>,
): Report[] {
  return discovered
    .filter((path) => !population.has(path))
    .map((path) => ({
      file: path,
      line: 1,
      ordinal: null,
      kind: "channel" as const,
      site: path,
      detail:
        "the destructive guard discovers this file, and it acquires the driver through no " +
        "channel the census models; add a `channel` disposition row naming it",
      argIsCall: false,
    }));
}
export type ClassCounts = Record<SiteClass, number>;

/** Every class, always, so a zero prints beside its population and `0 of 0` cannot read as a pass. */
export function classCounts(sites: readonly ClassifiedSite[]): ClassCounts {
  const counts: ClassCounts = {
    "guard-bound": 0,
    "validation-env": 0,
    "loopback-literal": 0,
    "remote-literal": 0,
    unclassifiable: 0,
  };
  for (const site of sites) counts[site.cls] += 1;
  return counts;
}

/**
 * The consumers a helper's undisposed site affects, attached to the helper's OWN report.
 * The obligation is one row where the site lives; listing the consumers is information,
 * not a second obligation.
 */
export function attachAffected(
  reports: readonly Report[],
  affected: ReadonlyMap<string, string[]>,
): Report[] {
  return reports.map((report) => {
    const consumers = affected.get(report.file);
    return consumers === undefined ? report : { ...report, affected: consumers };
  });
}

/** The one-line remedy per report kind: the message says which case, and what to do next. */
export const REMEDIES: Record<ReportKind, string> = {
  unclassifiable:
    "add a CONNECTION_CENSUS_DISPOSITIONS row of kind `resolver` or `unclassifiable` naming this site",
  "remote-literal": "read the target from TEST_DATABASE_URL or guard it with assertLocalDbUrl",
  "shadowed-driver": "rename the local declaration that reuses the driver binding's name",
  acquisition: "use a static default import, or add an `acquisition` disposition row",
  "value-reference": "call the driver binding directly, or add an `acquisition` disposition row",
  "unresolved-import":
    "use a literal specifier, or add an `unclassifiable` disposition row naming this specifier",
  "loader-call":
    "use a vitest loader the census models, or add an `unclassifiable` disposition row",
  channel:
    "this file executes destructive SQL through a channel the census does not model; add a `channel` disposition row",
};

/**
 * One line per report, then the per-class count block. Every field comes from the report
 * itself, so a report the census invents cannot render without saying where it is.
 */
export function renderReport(reports: readonly Report[], counts: ClassCounts): string {
  const lines: string[] = [];
  for (const report of reports) {
    const ordinal = report.ordinal === null ? "" : `site#${report.ordinal} `;
    lines.push(`${report.file}:${report.line} ${ordinal}${report.kind} — ${REMEDIES[report.kind]}`);
    if (report.affected !== undefined && report.affected.length > 0) {
      lines.push(`    affected: ${report.affected.join(", ")}`);
    }
  }
  const order: SiteClass[] = [
    "guard-bound",
    "validation-env",
    "loopback-literal",
    "remote-literal",
    "unclassifiable",
  ];
  lines.push(order.map((cls) => `${cls} ${counts[cls]}`).join(" / "));
  return lines.join("\n");
}
