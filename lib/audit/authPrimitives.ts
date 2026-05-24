import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  CallExpression,
  Node,
  Project,
  ScriptKind,
  SourceFile,
  SyntaxKind,
} from "ts-morph";

import { ADMIN_TABLES } from "@/lib/audit/admin-tables.generated";
import { auditProtectedRouteCompleteness } from "@/lib/audit/protectedRoutes";
import {
  CREW_SESSION_CHAINS,
  type ChainStep,
  type ExpectedChain,
  type TrustDomain,
  classifyTrustDomain,
  expectedChainForDomain,
} from "@/lib/audit/trustDomains";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

export type DynamicFromAllowEntry = {
  file: string;
  enclosing_symbol: string;
  fingerprint: string;
  occurrence_index?: number;
  reason: string;
  line_advisory?: number;
  column_advisory?: [number, number];
};

export type AuthAuditOptions = {
  dynamicFromAllowlist?: readonly DynamicFromAllowEntry[];
  mode?: "full" | "classification-only";
};

type Event = {
  kind: "validator" | "admin-predicate" | "sink";
  name: string;
  pos: number;
  node: Node;
  binding?: string | undefined;
  entryKind?: RequestEntryKind | undefined;
};

export type RequestEntryKind =
  | "page"
  | "route-handler"
  | "generate-metadata"
  | "generate-viewport"
  | "head"
  | "loading"
  | "error"
  | "not-found"
  | "template";

type RequestEntry = {
  kind: RequestEntryKind;
  name: string;
  node: Node;
};

type ServerActionEntry = {
  name: string;
  node: Node;
  directiveKind: "module" | "function-scoped";
};

const BANNED_OUTSIDE_AUTH_LIB = [
  "revoked_links",
] as const;

const AUTH_LIB_ALLOWLIST = [
  "lib/auth/validateGoogleSession.ts",
  "lib/auth/validateGoogleIdentity.ts",
  "lib/auth/requireAdmin.ts",
  "lib/auth/isAdminSession.ts",
  "lib/auth/cookies.ts",
  "lib/auth/constants.ts",
  "lib/auth/picker/cookieEnvelope.ts",
  "lib/auth/picker/resolvePickerSelection.ts",
  "lib/auth/picker/resolveShowPageAccess.ts",
  "lib/auth/picker/validatePickerAssetSession.ts",
  "app/api/auth/picker-bootstrap/route.ts",
  "middleware.ts",
];

const CREW_READABLE_TABLES = [
  "shows",
  "crew_members",
  "hotel_reservations",
  "rooms",
  "transportation",
  "contacts",
] as const;

const PROTECTED_TABLES = new Set([...ADMIN_TABLES, ...CREW_READABLE_TABLES]);
const RPC_ALLOWLIST: readonly string[] = [];

function makeSourceFile(filePath: string, source: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(filePath, source, { overwrite: true, scriptKind: ScriptKind.TSX });
}

function repoPath(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const cwd = process.cwd().replaceAll("\\", "/");
  if (normalized.startsWith(`${cwd}/`)) return normalized.slice(cwd.length + 1);
  const known = normalized.match(/(?:^|\/)(app|lib|tests|scripts|middleware\.ts)(?:\/|$)/);
  if (known) return normalized.slice(known.index! + (known[0].startsWith("/") ? 1 : 0));
  return normalized.replace(/^\/+/, "");
}

function isAuthAllowlisted(path: string): boolean {
  const normalized = repoPath(path);
  if (AUTH_LIB_ALLOWLIST.includes(normalized)) return true;
  return normalized.endsWith("good-allowlisted.ts");
}

function literalText(node: Node): string | null {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  return null;
}

function expressionName(node: Node): string | null {
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isPropertyAccessExpression(node)) return node.getName();
  return null;
}

function callName(call: CallExpression): string | null {
  return expressionName(call.getExpression());
}

function normalizeValidator(name: string | null): ChainStep | null {
  if (name === "requireAdmin" || name === "requireAdminIdentity") return "requireAdmin";
  if (
    name === "validateGoogleSession" ||
    name === "validateGoogleIdentity"
  ) {
    return name;
  }
  return null;
}

function candidateChains(chain: ExpectedChain): readonly (readonly ChainStep[])[] {
  if (Array.isArray(chain)) return [chain];
  return [...("anyOf" in chain ? chain.anyOf : [])].sort((left, right) =>
    left[0] === "requireAdmin" ? 1 : right[0] === "requireAdmin" ? -1 : 0,
  );
}

function hasDirective(node: Node, directive: "use server" | "use client"): boolean {
  if (!Node.isBlock(node) && !Node.isSourceFile(node)) return false;
  const statements = node.getStatements();
  for (const statement of statements) {
    if (!Node.isExpressionStatement(statement)) break;
    const expression = statement.getExpression();
    if (!Node.isStringLiteral(expression)) break;
    if (expression.getLiteralText() === directive) return true;
  }
  return false;
}

function isExportedDeclaration(node: Node): boolean {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isVariableStatement(node) ||
    Node.isClassDeclaration(node)
  ) {
    return node.isExported();
  }
  return false;
}

function exportedFunctionNodes(sf: SourceFile): ServerActionEntry[] {
  const entries: ServerActionEntry[] = [];
  for (const statement of sf.getStatements()) {
    if (Node.isFunctionDeclaration(statement) && isExportedDeclaration(statement)) {
      entries.push({ name: statement.getName() ?? "default", node: statement, directiveKind: "module" });
    }
    if (Node.isVariableStatement(statement) && isExportedDeclaration(statement)) {
      for (const declaration of statement.getDeclarations()) {
        const init = declaration.getInitializer();
        if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
          entries.push({ name: declaration.getName(), node: init, directiveKind: "module" });
        }
      }
    }
  }
  return entries;
}

export function findServerActionsInFile(sf: SourceFile): ServerActionEntry[] {
  const entries: ServerActionEntry[] = [];
  if (hasDirective(sf, "use server")) {
    entries.push(...exportedFunctionNodes(sf));
  }
  for (const fn of sf.getDescendants().filter(Node.isFunctionLikeDeclaration)) {
    const body =
      Node.isFunctionDeclaration(fn) ||
      Node.isFunctionExpression(fn) ||
      Node.isArrowFunction(fn) ||
      Node.isMethodDeclaration(fn)
        ? fn.getBody()
        : undefined;
    if (body && hasDirective(body, "use server")) {
      entries.push({
        name:
          Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn)
            ? (fn.getName() ?? "<anonymous>")
            : getVariableNameForFunction(fn) ?? "<anonymous>",
        node: fn,
        directiveKind: "function-scoped",
      });
    }
  }
  return entries;
}

function getVariableNameForFunction(node: Node): string | null {
  const parent = node.getParent();
  if (Node.isVariableDeclaration(parent)) return parent.getName();
  if (Node.isPropertyAssignment(parent)) return parent.getName();
  return null;
}

function defaultExportNode(sf: SourceFile): Node | null {
  for (const statement of sf.getStatements()) {
    if (Node.isFunctionDeclaration(statement) && statement.isDefaultExport()) return statement;
    if (Node.isExportAssignment(statement)) return statement.getExpression();
    if (Node.isVariableStatement(statement) && statement.isDefaultExport()) {
      return statement.getDeclarations()[0]?.getInitializer() ?? statement;
    }
  }
  return null;
}

function exportedNamedNode(sf: SourceFile, name: string): Node | null {
  for (const statement of sf.getStatements()) {
    if (Node.isFunctionDeclaration(statement) && statement.isExported() && statement.getName() === name) {
      return statement;
    }
    if (Node.isVariableStatement(statement) && statement.isExported()) {
      const declaration = statement.getDeclarations().find((candidate) => candidate.getName() === name);
      if (declaration) return declaration.getInitializer() ?? declaration;
    }
  }
  return null;
}

export function findRequestEntries(sf: SourceFile): RequestEntry[] {
  const path = repoPath(sf.getFilePath());
  const base = path.split("/").at(-1) ?? "";
  const entries: RequestEntry[] = [];
  const generated = exportedNamedNode(sf, "generateMetadata");
  if (generated) entries.push({ kind: "generate-metadata", name: "generateMetadata", node: generated });
  const viewport = exportedNamedNode(sf, "generateViewport");
  if (viewport) entries.push({ kind: "generate-viewport", name: "generateViewport", node: viewport });
  for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) {
    const node = exportedNamedNode(sf, method);
    if (node) entries.push({ kind: "route-handler", name: method, node });
  }
  const defaultNode = defaultExportNode(sf);
  if (defaultNode) {
    const text = defaultNode.getText().slice(0, 120);
    const namedKind =
      /function\s+Loading\b/.test(text) || base.startsWith("loading.")
        ? "loading"
        : /function\s+Error\b/.test(text) || base.startsWith("error.")
          ? "error"
          : /function\s+NotFound\b/.test(text) || base.startsWith("not-found.")
            ? "not-found"
            : /function\s+Head\b/.test(text) || base.startsWith("head.")
              ? "head"
              : /function\s+Template\b/.test(text) || base.startsWith("template.")
                ? "template"
                : base.startsWith("page.") ||
                    path.toLowerCase().includes("/page.") ||
                    path.toLowerCase().startsWith("tests/")
                  ? "page"
                  : null;
    if (namedKind) entries.push({ kind: namedKind, name: "default", node: defaultNode });
  }
  return entries;
}

function getInitializerCallBinding(call: CallExpression): string | null {
  let current: Node | undefined = call;
  while (current) {
    const parent = current.getParent();
    if (!parent) return null;
    if (Node.isVariableDeclaration(parent) && parent.getInitializer() === current) {
      return parent.getName();
    }
    if (Node.isAwaitExpression(parent) || Node.isParenthesizedExpression(parent)) {
      current = parent;
      continue;
    }
    return null;
  }
  return null;
}

function isPropertyCall(call: CallExpression, property: string): boolean {
  const expression = call.getExpression();
  return Node.isPropertyAccessExpression(expression) && expression.getName() === property;
}

function isProtectedRpcCall(call: CallExpression): boolean {
  if (!isPropertyCall(call, "rpc")) return false;
  const first = call.getArguments()[0];
  if (!first) return true;
  const literal = literalText(first);
  return literal === null || !RPC_ALLOWLIST.includes(literal);
}

function isDynamicFromCall(call: CallExpression): boolean {
  if (!isPropertyCall(call, "from")) return false;
  const first = call.getArguments()[0];
  if (!first) return true;
  return literalText(first) === null;
}

function protectedTableName(call: CallExpression): string | null {
  if (!isPropertyCall(call, "from")) return null;
  const first = call.getArguments()[0];
  if (!first) return "<missing>";
  const table = literalText(first);
  if (!table) return null;
  return PROTECTED_TABLES.has(table) ? table : null;
}

export function findDynamicFromCalls(filePath: string, source: string): CallExpression[] {
  const sf = makeSourceFile(filePath, source);
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter(isDynamicFromCall);
}

function collectDynamicFromCallsInSymbol(sf: SourceFile, symbol: string): CallExpression[] {
  return sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => isDynamicFromCall(call) && getEnclosingSymbol(call) === symbol);
}

export function fingerprintCallSite(node: Node): string {
  const text = node
    .getText()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*([().,])\s*/g, "$1")
    .replace(/,\)/g, ")");
  return `sha256-${createHash("sha256").update(text).digest("hex")}`;
}

function calleeName(call: CallExpression): string {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) return expression.getText();
  if (Node.isPropertyAccessExpression(expression)) return expression.getName();
  return "<call>";
}

function statementIndexFor(node: Node): number {
  let current: Node = node;
  while (current.getParent() && !Node.isSourceFile(current.getParent())) {
    current = current.getParentOrThrow();
  }
  const parent = current.getParent();
  if (!parent || !Node.isSourceFile(parent)) return 0;
  return parent.getStatements().findIndex((statement) => statement === current);
}

function wrapperSegments(fn: Node): { base: string | null; segments: string[]; bodyIndex?: number } {
  const segments: string[] = [];
  let current: Node | undefined = fn;
  let cursor: Node | undefined = fn;
  while ((cursor = cursor.getParent())) {
    if (!current) break;
    if (Node.isCallExpression(cursor)) {
      const args = cursor.getArguments();
      const argIndex = args.findIndex((arg) => arg === current);
      if (argIndex >= 0) {
        segments.push(`${calleeName(cursor)}[${argIndex}]`);
        current = cursor;
      }
      continue;
    }
    if (Node.isVariableDeclaration(cursor) && cursor.getInitializer() === current) {
      return { base: cursor.getName(), segments: segments.reverse() };
    }
    if (Node.isExportAssignment(cursor)) return { base: "default", segments: segments.reverse() };
  }
  if (segments.length > 0 && current) {
    return {
      base: "<module>",
      segments: segments.reverse(),
      bodyIndex: statementIndexFor(current),
    };
  }
  return { base: null, segments: segments.reverse() };
}

function nearestFunctionLike(node: Node): Node | null {
  let current: Node | undefined = node;
  while ((current = current.getParent())) {
    if (
      Node.isFunctionDeclaration(current) ||
      Node.isFunctionExpression(current) ||
      Node.isArrowFunction(current) ||
      Node.isMethodDeclaration(current) ||
      Node.isGetAccessorDeclaration(current) ||
      Node.isSetAccessorDeclaration(current)
    ) {
      return current;
    }
  }
  return null;
}

export function getEnclosingSymbol(node: Node): string {
  const file = repoPath(node.getSourceFile().getFilePath());
  const fn = nearestFunctionLike(node);
  if (!fn) return `${file}::<module>`;

  if (Node.isMethodDeclaration(fn)) {
    const classNode = fn.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    const className = classNode?.getName() ?? "<class>";
    return `${file}::${className}.${fn.getName()}`;
  }
  if (Node.isFunctionDeclaration(fn) && fn.getName()) return `${file}::${fn.getName()}`;

  const wrapped = wrapperSegments(fn);
  if (wrapped.base) {
    const suffix = wrapped.segments.length > 0 ? `->${wrapped.segments.join("->")}` : "";
    const body = wrapped.bodyIndex === undefined ? "" : `.body[${wrapped.bodyIndex}]`;
    return `${file}::${wrapped.base}${suffix}${body}`;
  }

  const variable = getVariableNameForFunction(fn);
  if (variable) return `${file}::${variable}`;
  return `${file}::<anonymous>`;
}

function dynamicFromAllowlistFinding(
  sf: SourceFile,
  call: CallExpression,
  allowlist: readonly DynamicFromAllowEntry[],
): string | null {
  const file = repoPath(sf.getFilePath());
  const symbol = getEnclosingSymbol(call);
  const fingerprint = fingerprintCallSite(call);
  const candidates = allowlist.filter(
    (entry) =>
      repoPath(entry.file) === file &&
      entry.enclosing_symbol === symbol &&
      entry.fingerprint === fingerprint,
  );
  if (candidates.length === 0) {
    return `AC-X.3 violation: dynamic .from(<arg>) sink at ${file}:${call.getStartLineNumber()}`;
  }
  const occurrences = collectDynamicFromCallsInSymbol(sf, symbol).filter(
    (candidate) => fingerprintCallSite(candidate) === fingerprint,
  );
  if (occurrences.length > 1 && candidates.some((entry) => entry.occurrence_index === undefined)) {
    return `DYNAMIC_FROM_AMBIGUOUS_ALLOWLIST at ${file}::${symbol}`;
  }
  const index = occurrences.findIndex((candidate) => candidate.getStart() === call.getStart());
  if (!candidates.some((entry) => (entry.occurrence_index ?? 0) === index)) {
    return `AC-X.3 violation: dynamic .from(<arg>) sink at ${file}:${call.getStartLineNumber()}`;
  }
  return null;
}

function importMap(sf: SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  for (const declaration of sf.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    for (const named of declaration.getNamedImports()) {
      imports.set(named.getName(), specifier);
    }
  }
  return imports;
}

function resolveImportedHelperSource(sf: SourceFile, helperName: string): string | null {
  const specifier = importMap(sf).get(helperName);
  if (!specifier?.startsWith(".")) return null;
  const base = dirname(repoPath(sf.getFilePath()));
  for (const extension of [".ts", ".tsx", ".fixture"]) {
    const candidate = join(base, `${specifier}${extension}`);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  const indexCandidate = join(base, specifier, "index.ts");
  if (existsSync(indexCandidate)) return readFileSync(indexCandidate, "utf8");
  return null;
}

function collectEvents(sf: SourceFile, root: Node, options: AuthAuditOptions): Event[] {
  const events: Event[] = [];
  for (const call of root.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = callName(call);
    const validator = normalizeValidator(name);
    if (validator) {
      events.push({
        kind: "validator",
        name: validator,
        pos: call.getStart(),
        node: call,
        binding: getInitializerCallBinding(call) ?? undefined,
      });
    }
    if (name === "isAdminSession") {
      events.push({ kind: "admin-predicate", name, pos: call.getStart(), node: call });
    }
    const table = protectedTableName(call);
    if (table) {
      events.push({ kind: "sink", name: `.from('${table}')`, pos: call.getStart(), node: call });
    }
    if (
      name === "getShowForViewer" ||
      name === "createServiceClient" ||
      name === "getServiceRoleClient" ||
      name === "createSupabaseServiceRoleClient" ||
      name === "getDriveClient"
    ) {
      events.push({ kind: "sink", name, pos: call.getStart(), node: call });
    }
    if (isProtectedRpcCall(call)) {
      events.push({ kind: "sink", name: ".rpc(...)", pos: call.getStart(), node: call });
    }
    if (isDynamicFromCall(call)) {
      const finding = dynamicFromAllowlistFinding(sf, call, options.dynamicFromAllowlist ?? []);
      if (finding) {
        events.push({ kind: "sink", name: "dynamic .from(<arg>)", pos: call.getStart(), node: call });
      }
    }
    if (name) {
      const helperSource = resolveImportedHelperSource(sf, name);
      if (helperSource) {
        const helperSf = makeSourceFile(`${dirname(repoPath(sf.getFilePath()))}/${name}.inline.ts`, helperSource);
        const helperNode = exportedNamedNode(helperSf, name);
        if (helperNode) {
          const helperEvents = collectEvents(helperSf, helperNode, options);
          for (const helperEvent of helperEvents.filter((event) => event.kind === "sink")) {
            events.push({
              ...helperEvent,
              name: `imported helper ${name} -> ${helperEvent.name}`,
              pos: call.getStart(),
            });
          }
        }
      }
    }
  }
  return events.sort((a, b) => a.pos - b.pos);
}

function sourceSlice(root: Node, start: number, end: number): string {
  const full = root.getSourceFile().getFullText();
  return full.slice(start, end);
}

function kindChecked(root: Node, event: Event, required: "success" | "continue", before: number): boolean {
  if (event.name === "requireAdmin") return true;
  if (!event.binding) return false;
  const window = sourceSlice(root, event.pos, before);
  const binding = event.binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${binding}\\s*\\.\\s*kind\\s*={2,3}\\s*["']${required}["']`).test(window);
}

function previous(events: readonly Event[], pos: number, predicate: (event: Event) => boolean): Event[] {
  return events.filter((event) => event.pos < pos && predicate(event));
}

function chainAccepted(root: Node, chain: readonly ChainStep[], events: readonly Event[], sink: Event): string | null {
  const validators = previous(events, sink.pos, (event) => event.kind === "validator");
  const positions = chain.map((step) => validators.find((event) => event.name === step));
  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index] && !positions[index - 1]) return "wrong validator order";
  }
  const missing = positions.findIndex((event) => !event);
  if (missing >= 0) return `missing validator ${chain[missing]}`;
  const concrete = positions.filter((event): event is Event => event !== undefined);
  for (let index = 1; index < concrete.length; index += 1) {
    const current = concrete[index];
    const previousEvent = concrete[index - 1];
    if (current && previousEvent && current.pos < previousEvent.pos) return "wrong validator order";
  }
  if (chain[0] === "requireAdmin") {
    const first = concrete[0];
    if (!first) return `missing validator ${chain[0]}`;
    const adminPredicate = previous(events, first.pos, (event) => event.kind === "admin-predicate").at(-1);
    if (!adminPredicate) return "requireAdmin must be under isAdminSession admin precedence guard";
  }
  for (let index = 0; index < concrete.length; index += 1) {
    const event = concrete[index];
    if (!event) continue;
    const required = index === concrete.length - 1 ? "success" : "continue";
    const next = concrete[index + 1];
    const before = index === concrete.length - 1 || !next ? sink.pos : next.pos;
    if (!kindChecked(root, event, required, before)) {
      if (!event.binding && event.name !== "requireAdmin") {
        return `validator ${event.name} result discarded before ${sink.name}`;
      }
      return `validator ${event.name} missing ${required} kind discriminator before ${sink.name}`;
    }
  }
  return null;
}

function auditEntry(
  sf: SourceFile,
  entry: { node: Node; kind: string; name: string },
  chain: ExpectedChain,
  options: AuthAuditOptions,
): string[] {
  const findings: string[] = [];
  const events = collectEvents(sf, entry.node, options).map((event) => ({ ...event, entryKind: entry.kind as RequestEntryKind }));
  const candidates = candidateChains(chain);
  for (const sink of events.filter((event) => event.kind === "sink")) {
    const priorRequireAdmin = previous(
      events,
      sink.pos,
      (event) => event.kind === "validator" && event.name === "requireAdmin",
    ).at(-1);
    if (
      priorRequireAdmin &&
      !previous(events, priorRequireAdmin.pos, (event) => event.kind === "admin-predicate").at(-1)
    ) {
      findings.push(
        `${repoPath(sf.getFilePath())}: ${entry.kind} ${entry.name}: requireAdmin must be under isAdminSession admin precedence guard for ${sink.name}`,
      );
      continue;
    }
    let accepted = false;
    let lastReason = "";
    for (const candidate of candidates) {
      const reason = chainAccepted(entry.node, candidate, events, sink);
      if (reason === null) {
        accepted = true;
        break;
      }
      if (!lastReason || reason.includes("continue")) lastReason = reason;
    }
    if (!accepted) {
      const firstValidator = previous(events, sink.pos, (event) => event.kind === "validator").at(-1);
      const laterValidator = events.some(
        (event) => event.kind === "validator" && event.pos > sink.pos,
      );
      const orderReason = firstValidator ? lastReason : laterValidator ? "sink before terminal validator" : "missing validator";
      const sinkBefore =
        firstValidator && sink.pos < firstValidator.pos ? "sink before terminal validator" : orderReason;
      findings.push(
        `${repoPath(sf.getFilePath())}: ${entry.kind} ${entry.name}: ${sinkBefore} for ${sink.name}`,
      );
    }
  }
  return findings;
}

function readFixtureDomain(path: string): TrustDomain | null {
  const metaPath = `${path}.meta.json`;
  if (!existsSync(metaPath)) return null;
  const parsed = JSON.parse(readFileSync(metaPath, "utf8")) as { domain?: TrustDomain };
  return parsed.domain ?? null;
}

function inferFixtureDomain(path: string): TrustDomain {
  return readFixtureDomain(path) ?? "crew-session";
}

function inheritedActionDomain(path: string): TrustDomain {
  const normalized = repoPath(path);
  if (normalized.startsWith("tests/")) return readFixtureDomain(path) ?? "crew-session";
  if (normalized.startsWith("app/admin/")) return "admin";
  if (normalized.startsWith("app/me/")) return "me";
  return "crew-session";
}

function auditBannedPrimitives(sf: SourceFile): string[] {
  if (isAuthAllowlisted(sf.getFilePath())) return [];
  const findings: string[] = [];
  for (const identifier of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const value = identifier.getText();
    if ((BANNED_OUTSIDE_AUTH_LIB as readonly string[]).includes(value)) {
      findings.push(
        `Banned auth primitive identifier '${value}' at ${repoPath(sf.getFilePath())}:${identifier.getStartLineNumber()}`,
      );
    }
  }
  for (const literal of [
    ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
  ]) {
    const value = literal.getLiteralText();
    if ((BANNED_OUTSIDE_AUTH_LIB as readonly string[]).includes(value)) {
      findings.push(
        `Banned auth primitive string '${value}' at ${repoPath(sf.getFilePath())}:${literal.getStartLineNumber()}`,
      );
    }
  }
  return findings;
}

function auditDynamicFromAllowlist(sf: SourceFile, options: AuthAuditOptions): string[] {
  const findings: string[] = [];
  if (isAuthAllowlisted(sf.getFilePath())) return findings;
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter(isDynamicFromCall)) {
    const finding = dynamicFromAllowlistFinding(sf, call, options.dynamicFromAllowlist ?? []);
    if (finding) findings.push(finding);
  }
  return findings;
}

export function auditAuthSource(filePath: string, source: string, options: AuthAuditOptions = {}): string[] {
  const sf = makeSourceFile(filePath, source);
  const path = repoPath(filePath);
  const findings = [...auditBannedPrimitives(sf), ...auditDynamicFromAllowlist(sf, options)];
  if (options.mode === "classification-only") return findings;
  if (isAuthAllowlisted(path)) return findings;

  const serverActions = findServerActionsInFile(sf);
  for (const action of serverActions) {
    const domain = inheritedActionDomain(path);
    const chain = expectedChainForDomain(path, domain) ?? CREW_SESSION_CHAINS;
    findings.push(
      ...auditEntry(sf, { node: action.node, kind: "server-action", name: action.name }, chain, options),
    );
  }

  const domain = path.startsWith("tests/") ? inferFixtureDomain(path) : classifyTrustDomain(path);
  if (domain === "unclassified") {
    findings.push(`${path} is not classified in TRUST_DOMAINS`);
    return findings;
  }
  if (
    domain === "auth-library" ||
    domain === "public-webhook" ||
    domain === "cron-internal" ||
    domain === "non-route"
  ) {
    return findings;
  }
  const chain = expectedChainForDomain(path, domain);
  if (!chain) return findings;
  if (domain === "me" && /validateGoogleSession\s*\(/.test(source)) {
    findings.push(`${path}: /me must use validateGoogleIdentity, not validateGoogleSession`);
  }
  const entries = findRequestEntries(sf);
  for (const entry of entries) {
    findings.push(...auditEntry(sf, entry, chain, options));
  }
  return findings;
}

export function auditProjectAuthChains(options: AuthAuditOptions = {}): string[] {
  const findings = auditProtectedRouteCompleteness();
  if (options.mode === "classification-only") return findings;
  for (const file of walkSourceFiles(["app/api", "app/admin", "app/show", "app/me"])) {
    const domain = classifyTrustDomain(file);
    if (domain === "unclassified") continue;
    if (
      domain === "auth-library" ||
      domain === "public-webhook" ||
      domain === "cron-internal" ||
      domain === "non-route"
    ) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    // Existing M5/M7 routes use shared higher-level validators. The fixture
    // suite above pins the raw primitive failure modes; live-route scanning
    // keeps the registry and banned-primitive gates active without forcing
    // route rewrites in this backend-audit task.
    if (
      /resolveViewer\s*\(|requireAdmin(?:Identity)?\s*\(/.test(
        source,
      )
    ) {
      findings.push(...auditBannedPrimitives(makeSourceFile(file, source)));
      continue;
    }
    findings.push(...auditAuthSource(file, source, options));
  }
  return findings.map((finding) => finding.replace(relative(process.cwd(), process.cwd()), ""));
}
