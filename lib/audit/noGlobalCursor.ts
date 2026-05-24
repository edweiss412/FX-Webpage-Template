import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import {
  Node,
  Project,
  ScriptKind,
  SourceFile,
  SyntaxKind,
  type BinaryExpression,
} from "ts-morph";

import {
  AUTHORITATIVE_GATING_WATERMARKS,
  BANNED_COMBOS,
  DISPLAY_ONLY_TIMESTAMPS,
  SYNC_ENTRY_POINTS,
} from "@/lib/audit/watermark-symbols.generated";

export type SchemaColumn = {
  table_name: string;
  column_name: string;
};

export type SourceInput = {
  path: string;
  source: string;
};

const OUT_OF_SCOPE_WATERMARK_COLUMNS: readonly string[] = [
  "report_rate_limits.hour_bucket",
  "sync_log.occurred_at",
  "sync_audit.applied_at",
  "admin_alerts.raised_at",
  "admin_alerts.last_seen_at",
  "admin_alerts.resolved_at",
  "reports.created_at",
  "reports.processing_lease_until",
  // pending_ingestions.last_seen_modified_time is a per-row Drive watermark for failed-ingestion retries.
  // Column exists at supabase/migrations/20260501001000_internal_and_admin.sql:197; it is not a singleton/global cursor.
  "pending_ingestions.last_seen_modified_time",
  "pending_syncs.prior_last_sync_status",
  "pending_syncs.prior_last_sync_error",
  "shows.last_sync_status",
  "shows.last_sync_error",
  "wizard_finalize_checkpoints.last_processed_at",
  "wizard_finalize_checkpoints.last_processed_drive_file_id",
];

const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">=", "==", "===", "!=", "!=="]);
const ALLOWED_TOKEN_NAMES = new Set([
  "last_processed_at",
  "last_processed_drive_file_id",
  "lastProcessedAt",
  "_lastProcessedAt",
  "auditGlobalCursorDdl",
  "auditProjectNoGlobalCursor",
  "no_global_cursor_columns",
  "reject_global_watermark_columns",
]);

type OriginKind = "db-read" | "context" | "env" | "module" | "unresolved";

type SourceRef = {
  name: string;
  origin: OriginKind;
};

type DbRead = {
  table: string;
  columns: Set<string>;
};

type AnalysisContext = {
  variableSources: Map<string, SourceRef>;
  dbReads: Map<string, DbRead>;
  moduleMutables: Set<string>;
  parameters: Set<string>;
  sourceFiles: readonly SourceFile[];
  seenHelpers: Set<string>;
};

function repoPath(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const cwd = process.cwd().replaceAll("\\", "/");
  return normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : normalized;
}

export function tokenizeIdentifier(name: string): string[] {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_\-.:[\]'\"`]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function isBannedName(name: string): boolean {
  const tokens = new Set(tokenizeIdentifier(name));
  return BANNED_COMBOS.some((combo) => combo.every((token) => tokens.has(token)));
}

function watermarkColumnHeuristic(column: string): boolean {
  return (
    /last_(seen|sync|poll|processed|run|cursor)/i.test(column) ||
    /watermark/i.test(column) ||
    /(^|_)cursor($|_)/i.test(column) ||
    /global_(state|cursor)/i.test(column)
  );
}

function setValues(set: ReadonlySet<string>): string[] {
  return Array.from(set);
}

function columnPair(symbol: string): SchemaColumn | null {
  if (symbol.startsWith("fileMeta.")) return null;
  if (symbol.includes("->>")) return null;
  const [table, column] = symbol.split(".");
  if (!table || !column || column.includes(".")) return null;
  return { table_name: table, column_name: column };
}

export function extractAllowedWatermarkColumnPairs(): SchemaColumn[] {
  const pairs = [
    ...setValues(AUTHORITATIVE_GATING_WATERMARKS),
    ...setValues(DISPLAY_ONLY_TIMESTAMPS),
    ...OUT_OF_SCOPE_WATERMARK_COLUMNS,
  ]
    .map(columnPair)
    .filter((pair): pair is SchemaColumn => pair !== null);
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = `${pair.table_name}.${pair.column_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function allowedColumnKeys(): Set<string> {
  return new Set(extractAllowedWatermarkColumnPairs().map((pair) => `${pair.table_name}.${pair.column_name}`));
}

export function auditSchemaColumns(columns: readonly SchemaColumn[]): string[] {
  const allowed = allowedColumnKeys();
  const findings: string[] = [];
  for (const column of columns) {
    if (!watermarkColumnHeuristic(column.column_name)) continue;
    const key = `${column.table_name}.${column.column_name}`;
    if (!allowed.has(key)) {
      findings.push(
        `AC-X.4 violation: column ${key} has watermark-shaped name and is not in _allowed_watermark_columns.`,
      );
    }
  }
  return findings;
}

function makeSourceFile(filePath: string, source: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile(filePath, source, { overwrite: true, scriptKind: ScriptKind.TSX });
}

function qualifiedPropertyAccess(node: Node): string | null {
  if (!Node.isIdentifier(node)) return null;
  const parent = node.getParent();
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node) {
    const expression = parent.getExpression();
    if (Node.isIdentifier(expression)) return `${expression.getText()}.${node.getText()}`;
    if (Node.isPropertyAccessExpression(expression) && Node.isIdentifier(expression.getExpression())) {
      return `${expression.getText()}.${node.getText()}`;
    }
    return node.getText();
  }
  if (Node.isPropertyAssignment(parent) && parent.getNameNode() === node) return node.getText();
  return node.getText();
}

function allowedRef(value: string): boolean {
  return (
    ALLOWED_TOKEN_NAMES.has(value) ||
    AUTHORITATIVE_GATING_WATERMARKS.has(value) ||
    DISPLAY_ONLY_TIMESTAMPS.has(value) ||
    OUT_OF_SCOPE_WATERMARK_COLUMNS.includes(value)
  );
}

export function auditTokenAwareSource(filePath: string, source: string): string[] {
  const sf = makeSourceFile(filePath, source);
  const findings: string[] = [];
  for (const identifier of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const qualified = qualifiedPropertyAccess(identifier);
    const value = qualified ?? identifier.getText();
    if (!isBannedName(value)) continue;
    if (allowedRef(value) || allowedRef(identifier.getText())) continue;
    findings.push(`Banned watermark identifier '${value}' at ${repoPath(filePath)}:${identifier.getStartLineNumber()}`);
  }
  for (const literal of [
    ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
  ]) {
    const value = literal.getLiteralText();
    if (!isBannedName(value) || allowedRef(value)) continue;
    const parent = literal.getParent();
    if (Node.isElementAccessExpression(parent)) {
      findings.push(
        `Banned watermark string '${value}' at ${repoPath(filePath)}:${literal.getStartLineNumber()}`,
      );
    }
  }
  return findings;
}

function projectSourceFiles(): SourceFile[] {
  const project = new Project({ tsConfigFilePath: "tsconfig.json", skipAddingFilesFromTsConfig: false });
  return project.getSourceFiles().filter((sf) => {
    const path = repoPath(sf.getFilePath());
    return (
      !path.includes("/node_modules/") &&
      !path.endsWith(".d.ts") &&
      !path.startsWith(".next") &&
      !path.includes("tests/cross-cutting/fixtures/")
    );
  });
}

function collectSchemaColumnsFromMigrations(): SchemaColumn[] {
  const columns: SchemaColumn[] = [];
  const migration = "supabase/migrations/20260501000000_initial_public_schema.sql";
  if (!existsSync(migration)) return columns;
  const sql = readFileSync(migration, "utf8");
  for (const tableMatch of sql.matchAll(/create table(?: if not exists)? ([a-z][a-z0-9_]*) \(([\s\S]*?)\);/gi)) {
    const table = tableMatch[1];
    const body = tableMatch[2] ?? "";
    if (!table) continue;
    for (const line of body.split(/\r?\n/)) {
      const column = line.trim().match(/^([a-z][a-z0-9_]*)\s+/i)?.[1];
      if (column) columns.push({ table_name: table, column_name: column });
    }
  }
  return columns;
}

function dbReadFromText(text: string): DbRead | null {
  const table = text.match(/\.from\(\s*["']([a-z][a-z0-9_]*)["']\s*\)/)?.[1];
  const select = text.match(/\.select\(\s*["']([^"']+)["']\s*\)/)?.[1];
  if (!table || !select) return null;
  const columns = select
    .split(",")
    .map((column) => column.trim().split(/\s+/)[0])
    .filter((column): column is string => Boolean(column) && column !== "*");
  return { table, columns: new Set(columns) };
}

function sourceForDbRead(read: DbRead): SourceRef | null {
  const first = Array.from(read.columns)[0];
  if (!first) return null;
  return { name: `${read.table}.${first}`, origin: "db-read" };
}

function sourceNameForDbProperty(read: DbRead, property: string): string {
  if (read.table === "shows" && property === "snapshot_revision_id") {
    return "shows.diagrams->>snapshot_revision_id";
  }
  return `${read.table}.${property}`;
}

function sourceNameForDbPath(read: DbRead, path: readonly string[]): string | null {
  const [first, second] = path;
  if (!first) return sourceForDbRead(read)?.name ?? null;
  if (read.table === "shows" && first === "diagrams" && second === "snapshot_revision_id") {
    return "shows.diagrams->>snapshot_revision_id";
  }
  if (read.table === "shows" && first === "snapshot_revision_id" && read.columns.has("diagrams")) {
    return "shows.diagrams->>snapshot_revision_id";
  }
  return sourceNameForDbProperty(read, first);
}

function unwrapExpression(node: Node): Node {
  if (Node.isAwaitExpression(node)) return unwrapExpression(node.getExpression());
  if (Node.isParenthesizedExpression(node)) return unwrapExpression(node.getExpression());
  if (Node.isAsExpression(node) || Node.isTypeAssertion(node) || Node.isNonNullExpression(node)) {
    return unwrapExpression(node.getExpression());
  }
  return node;
}

function propertyPath(node: Node): string[] | null {
  if (Node.isIdentifier(node)) return [node.getText()];
  if (Node.isPropertyAccessExpression(node)) {
    const prefix = propertyPath(node.getExpression());
    return prefix ? [...prefix, node.getName()] : null;
  }
  if (Node.isElementAccessExpression(node)) {
    const prefix = propertyPath(node.getExpression());
    const argument = node.getArgumentExpression();
    if (!prefix || !argument || !Node.isStringLiteral(argument)) return null;
    return [...prefix, argument.getLiteralText()];
  }
  return null;
}

function sourceFromDbPropertyPath(path: readonly string[], context: AnalysisContext): SourceRef | null {
  const [root, maybeData, ...dataPath] = path;
  if (!root || maybeData !== "data") return null;
  const read = context.dbReads.get(root);
  if (!read) return null;
  const name = sourceNameForDbPath(read, dataPath);
  return name ? { name, origin: "db-read" } : null;
}

function localFunctionNamed(sourceFiles: readonly SourceFile[], name: string): Node | null {
  for (const sf of sourceFiles) {
    const fn = sf.getFunctions().find((candidate) => candidate.getName() === name);
    if (fn) return fn;
    const declaration = sf.getVariableDeclaration(name);
    const init = declaration?.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return init;
  }
  return null;
}

function sourceFromHelperCall(node: Node, context: AnalysisContext): SourceRef | null {
  const expression = unwrapExpression(node);
  if (!Node.isCallExpression(expression)) return null;
  const callee = expression.getExpression();
  if (!Node.isIdentifier(callee)) return null;
  const helperName = callee.getText();
  if (context.seenHelpers.has(helperName)) return null;
  const helper = localFunctionNamed(context.sourceFiles, helperName);
  if (!helper) return null;
  const nextContext = collectContext(helper, context.sourceFiles, new Set([...context.seenHelpers, helperName]));
  for (const returnStatement of helper.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    const returned = returnStatement.getExpression();
    if (!returned) continue;
    const source = resolveSource(returned, nextContext);
    if (source) return source;
  }
  return null;
}

function isUntypedAnyEscape(node: Node): boolean {
  const expression = unwrapExpression(node);
  if (Node.isCallExpression(expression) && Node.isIdentifier(expression.getExpression())) return false;
  try {
    return expression.getType().isAny();
  } catch {
    return true;
  }
}

function collectContext(
  root: Node,
  sourceFiles: readonly SourceFile[] = [root.getSourceFile()],
  seenHelpers = new Set<string>(),
): AnalysisContext {
  const context: AnalysisContext = {
    variableSources: new Map(),
    dbReads: new Map(),
    moduleMutables: new Set(),
    parameters: new Set(),
    sourceFiles,
    seenHelpers,
  };
  const sf = root.getSourceFile();
  for (const statement of sf.getStatements()) {
    if (Node.isVariableStatement(statement)) {
      const declarationKind = statement.getDeclarationKind();
      for (const declaration of statement.getDeclarations()) {
        if (declarationKind !== "const") context.moduleMutables.add(declaration.getName());
      }
    }
  }
  for (const parameter of root.getDescendantsOfKind(SyntaxKind.Parameter)) {
    context.parameters.add(parameter.getName());
  }
  if (Node.isFunctionDeclaration(root)) {
    for (const parameter of root.getParameters()) context.parameters.add(parameter.getName());
  }
  for (const declaration of root.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    const text = initializer.getText();
    const read = dbReadFromText(text);
    if (read) {
      context.dbReads.set(declaration.getName(), read);
      const source = sourceForDbRead(read);
      if (source) context.variableSources.set(declaration.getName(), source);
      continue;
    }
    const envName = text.match(/process\.env(?:\[['"]([^'"]+)['"]\]|\.(\w+))/)?.[1] ?? text.match(/process\.env(?:\[['"]([^'"]+)['"]\]|\.(\w+))/)?.[2];
    if (envName) {
      context.variableSources.set(declaration.getName(), { name: `process.env.${envName}`, origin: "env" });
      continue;
    }
    const helperSource = sourceFromHelperCall(initializer, context);
    if (helperSource) {
      context.variableSources.set(declaration.getName(), helperSource);
      continue;
    }
    if (isUntypedAnyEscape(initializer)) {
      context.variableSources.set(declaration.getName(), { name: declaration.getName(), origin: "unresolved" });
      continue;
    }
  }
  for (const name of context.moduleMutables) {
    context.variableSources.set(name, { name: `module.${name}`, origin: "module" });
  }
  return context;
}

function contextSource(name: string): SourceRef {
  return { name, origin: "context" };
}

function resolveSource(node: Node, context: AnalysisContext): SourceRef | null {
  const text = node.getText();
  if (/shows\.diagrams\s*->>\s*['"]snapshot_revision_id['"]/.test(text)) {
    return contextSource("shows.diagrams->>snapshot_revision_id");
  }
  const fileMeta = text.match(/\bfileMeta\.(modifiedTime|driveModifiedTime|headRevisionId|md5Checksum)\b/);
  if (fileMeta?.[1]) return contextSource(`fileMeta.${fileMeta[1]}`);
  const envName = text.match(/process\.env(?:\[['"]([^'"]+)['"]\]|\.(\w+))/)?.[1] ?? text.match(/process\.env(?:\[['"]([^'"]+)['"]\]|\.(\w+))/)?.[2];
  if (envName) return { name: `process.env.${envName}`, origin: "env" };

  const helperSource = sourceFromHelperCall(node, context);
  if (helperSource) return helperSource;

  const path = propertyPath(unwrapExpression(node));
  if (path) {
    const dbSource = sourceFromDbPropertyPath(path, context);
    if (dbSource) return dbSource;
    const [root] = path;
    if (root && context.parameters.has(root)) return contextSource(text);
  }
  const showProperty = text.match(/\bshow\.([a-zA-Z_$][\w$]*)\b/);
  if (showProperty?.[1]) return { name: `shows.${showProperty[1]}`, origin: "db-read" };
  const variable = text.match(/^[a-zA-Z_$][\w$]*$/)?.[0];
  if (variable) {
    const known = context.variableSources.get(variable);
    if (known) return known;
    if (context.parameters.has(variable)) return contextSource(variable);
  }
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) return contextSource(text);
  if (isUntypedAnyEscape(node)) return { name: text, origin: "unresolved" };
  return null;
}

function tableFromWriteCall(call: Node): string | null {
  if (!Node.isCallExpression(call)) return null;
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) return null;
  if (!["update", "delete", "upsert", "insert"].includes(expression.getName())) return null;
  return call.getText().match(/\.from\(\s*["']([a-z][a-z0-9_]*)["']\s*\)/)?.[1] ?? null;
}

function writeSinkTables(root: Node): Set<string> {
  const tables = new Set<string>();
  for (const call of root.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const table = tableFromWriteCall(call);
    if (table) tables.add(table);
  }
  return tables;
}

function tableForGatingWatermark(name: string): string | null {
  if (name.startsWith("fileMeta.")) return null;
  if (name.includes("->>")) return name.split(".")[0] ?? null;
  return name.split(".")[0] ?? null;
}

function lineFor(node: Node): number {
  return node.getStartLineNumber();
}

function displayFinding(file: string, line: number, name: string): string {
  return (
    `AC-X.4 violation: sync-decision comparison reads display-only timestamp '${name}'. ` +
    "Display-only timestamps are rendered to the operator but never gate writes; replace with the corresponding authoritative gating watermark " +
    "(e.g., last_seen_modified_time, base_modified_time, staged_modified_time, or fileMeta.modifiedTime)." +
    ` (${repoPath(file)}:${line})`
  );
}

function semanticViolation(file: string, line: number, source: SourceRef): string {
  if (source.origin === "unresolved") {
    return (
      `AC-X.4 semantic-layer violation at ${repoPath(file)}:${line}: watermark-shape source '${source.name}' ` +
      "could not be resolved to a per-row column."
    );
  }
  return (
    `AC-X.4 semantic-layer violation at ${repoPath(file)}:${line}: watermark-shape comparison consumes forbidden source '${source.name}'. ` +
    "Sync gating decisions MUST read watermarks from per-row sources only."
  );
}

function analyzeBinary(file: string, binary: BinaryExpression, context: AnalysisContext): string[] {
  if (!COMPARISON_OPERATORS.has(binary.getOperatorToken().getText())) return [];
  const left = resolveSource(binary.getLeft(), context);
  const right = resolveSource(binary.getRight(), context);
  const sources = [left, right].filter((source): source is SourceRef => source !== null);
  const findings: string[] = [];
  const line = lineFor(binary);
  for (const source of sources) {
    if (DISPLAY_ONLY_TIMESTAMPS.has(source.name)) findings.push(displayFinding(file, line, source.name));
  }
  const gating = sources.find((source) => AUTHORITATIVE_GATING_WATERMARKS.has(source.name));
  if (!gating || findings.length > 0) return findings;
  const other = gating === left ? right : left;
  if (!other) return [semanticViolation(file, line, { name: binary.getText(), origin: "unresolved" })];
  if (other.origin === "db-read" && other.name === gating.name) {
    return [
      `AC-X.4 violation: gating-watermark CAS at ${repoPath(file)}:${line} compares ${gating.name} against a fresh-read value; the other operand must come from the reviewed/staged context (e.g., reviewedStagedId, payload.expected_revision), NOT from a fresh SELECT inside the comparison.`,
    ];
  }
  if (AUTHORITATIVE_GATING_WATERMARKS.has(other.name)) return [];
  if (other.origin === "context") return [];
  return [semanticViolation(file, line, other)];
}

function findEntryDeclarations(sources: readonly SourceFile[], entry: string): Node[] {
  const matches: Node[] = [];
  for (const sf of sources) {
    for (const fn of sf.getFunctions()) {
      if (fn.getName() === entry) matches.push(fn);
    }
    for (const declaration of sf.getVariableDeclarations()) {
      const init = declaration.getInitializer();
      if (
        declaration.getName() === entry &&
        init &&
        (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
      ) {
        matches.push(init);
      }
    }
  }
  return matches;
}

function requiredEntriesForSources(sourceFiles: readonly SourceFile[], forceAll = false): string[] {
  const all = setValues(SYNC_ENTRY_POINTS);
  if (forceAll) return all;
  const declared = all.filter((entry) => findEntryDeclarations(sourceFiles, entry).length > 0);
  if (declared.length === 1) return declared;
  return all;
}

function precheckEntries(sourceFiles: readonly SourceFile[], requiredEntries: readonly string[]): string[] {
  const unresolved: string[] = [];
  const ambiguous: string[] = [];
  for (const entry of requiredEntries) {
    const matches = findEntryDeclarations(sourceFiles, entry);
    if (matches.length === 0) unresolved.push(entry);
    if (matches.length > 1) ambiguous.push(`${entry} (${matches.length} matches)`);
  }
  if (unresolved.length === 0 && ambiguous.length === 0) return [];
  const parts: string[] = [];
  if (unresolved.length > 0) parts.push(`unresolved sync entry points (zero declarations): ${unresolved.join(", ")}`);
  if (ambiguous.length > 0) parts.push(`ambiguous sync entry points (multiple declarations): ${ambiguous.join(", ")}`);
  return [
    `AC-X.4 semantic-layer precheck failed — ${parts.join("; ")}. Update SYNC_ENTRY_POINTS to match the live codebase, or restore the missing declarations.`,
  ];
}

function jsonbCasFindings(file: string, root: Node, context: AnalysisContext): { findings: string[]; compared: Set<string>; read: Set<string> } {
  const jsonb = "shows.diagrams->>snapshot_revision_id";
  const findings: string[] = [];
  const compared = new Set<string>();
  const read = new Set<string>();
  for (const tagged of root.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
    if (!/shows\.diagrams\s*->>\s*['"]snapshot_revision_id['"]/.test(tagged.getText())) continue;
    read.add(jsonb);
    const line = lineFor(tagged);
    for (const expression of tagged.getDescendantsOfKind(SyntaxKind.TemplateExpression)) {
      for (const span of expression.getTemplateSpans()) {
        const source = resolveSource(span.getExpression(), context);
        if (!source) continue;
        if (source.origin === "db-read" && source.name === jsonb) {
          findings.push(
            `AC-X.4 violation: gating-watermark CAS at ${repoPath(file)}:${line} compares ${jsonb} against a fresh-read value; the other operand must come from the reviewed/staged context (e.g., reviewedStagedId, payload.expected_revision), NOT from a fresh SELECT inside the comparison.`,
          );
        } else if (source.origin === "context" || AUTHORITATIVE_GATING_WATERMARKS.has(source.name)) {
          compared.add(jsonb);
        } else {
          findings.push(semanticViolation(file, line, source));
        }
      }
    }
  }
  return { findings, compared, read };
}

export function auditSemanticWatermarks(
  sources: readonly SourceInput[],
  options: { requireAllEntries?: boolean } = {},
): string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFiles = sources.map((source) =>
    project.createSourceFile(source.path, source.source, { overwrite: true, scriptKind: ScriptKind.TSX }),
  );
  const requiredEntries = requiredEntriesForSources(sourceFiles, options.requireAllEntries ?? sources.length > 1);
  const precheck = precheckEntries(sourceFiles, requiredEntries);
  if (precheck.length > 0) return precheck;

  const findings: string[] = [];
  for (const sf of sourceFiles) {
    for (const entry of requiredEntries) {
      for (const root of findEntryDeclarations([sf], entry)) {
        const context = collectContext(root, sourceFiles);
        const compared = new Set<string>();
        const read = new Set<string>();
        const jsonb = jsonbCasFindings(sf.getFilePath(), root, context);
        findings.push(...jsonb.findings);
        for (const value of jsonb.compared) compared.add(value);
        for (const value of jsonb.read) read.add(value);

        for (const [, dbRead] of context.dbReads) {
          for (const column of dbRead.columns) {
            const name = sourceNameForDbProperty(dbRead, column);
            if (AUTHORITATIVE_GATING_WATERMARKS.has(name)) read.add(name);
          }
        }
        for (const binary of root.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
          const binaryFindings = analyzeBinary(sf.getFilePath(), binary, context);
          findings.push(...binaryFindings);
          if (binaryFindings.length === 0) {
            const left = resolveSource(binary.getLeft(), context);
            const right = resolveSource(binary.getRight(), context);
            for (const source of [left, right]) {
              if (source && AUTHORITATIVE_GATING_WATERMARKS.has(source.name)) compared.add(source.name);
            }
          }
        }
        const writtenTables = writeSinkTables(root);
        if (writtenTables.size > 0) {
          for (const gating of read) {
            const table = tableForGatingWatermark(gating);
            if (table && writtenTables.has(table) && !compared.has(gating)) {
              findings.push(
                `AC-X.4 violation: gating watermark ${gating} is read by ${entry} but never enforced as a CAS predicate before a write sink. Every AUTHORITATIVE_GATING_WATERMARKS member must be CAS'd against the reviewed/staged context value before mutating writes.`,
              );
            }
          }
        }
      }
    }
  }
  return findings;
}

export function parseWatermarkMigration(sql: string): { sql: string; allowlist: SchemaColumn[] } {
  const allowlist = Array.from(
    sql.matchAll(/\(\s*'([a-z][a-z0-9_]*)'\s*,\s*'([a-z][a-z0-9_]*)'\s*\)/g),
    (match) => ({ table_name: match[1]!, column_name: match[2]! }),
  );
  return { sql, allowlist };
}

export function auditGlobalCursorDdl(sql: string): string[] {
  const findings: string[] = [];
  if (!/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+reject_global_watermark_columns/i.test(sql)) {
    findings.push("missing reject_global_watermark_columns function");
  }
  if (!/CREATE\s+EVENT\s+TRIGGER\s+no_global_cursor_columns/i.test(sql)) {
    findings.push("missing no_global_cursor_columns event trigger");
  }
  if (!/ddl_command_end/i.test(sql)) findings.push("event trigger must run on ddl_command_end");
  const migration = parseWatermarkMigration(sql);
  const expected = extractAllowedWatermarkColumnPairs().map((pair) => `${pair.table_name}.${pair.column_name}`);
  const actual = new Set(migration.allowlist.map((pair) => `${pair.table_name}.${pair.column_name}`));
  for (const key of expected) {
    if (!actual.has(key)) findings.push(`missing _allowed_watermark_columns seed ${key}`);
  }
  return findings;
}

export function auditProjectNoGlobalCursor(
  options: { syncSources?: readonly SourceInput[]; skipTokenLayer?: boolean; requireAllEntries?: boolean } = {},
): string[] {
  const findings = auditSchemaColumns(collectSchemaColumnsFromMigrations());
  if (!options.skipTokenLayer) {
    for (const sf of projectSourceFiles()) {
      findings.push(...auditTokenAwareSource(sf.getFilePath(), sf.getFullText()));
    }
  }
  const syncSources =
    options.syncSources ??
    [
      "lib/sync/runScheduledCronSync.ts",
      "lib/sync/runManualSyncForShow.ts",
      "lib/sync/runPushSyncForShow.ts",
      "lib/sync/runOnboardingScan.ts",
      "lib/sync/retrySingleFile.ts",
      "lib/sync/assetRecovery.ts",
      "lib/sync/applyStaged.ts",
      "lib/sync/discardStaged.ts",
    ].flatMap((path) => (existsSync(path) ? [{ path, source: readFileSync(path, "utf8") }] : []));
  findings.push(...auditSemanticWatermarks(syncSources, { requireAllEntries: options.requireAllEntries ?? true }));
  return findings.map((finding) => finding.replace(relative(process.cwd(), process.cwd()), ""));
}
