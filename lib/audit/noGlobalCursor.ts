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
  "crew_member_auth.current_token_version",
  "crew_member_auth.max_issued_version",
  "crew_member_auth.revoked_below_version",
  "link_sessions.expires_at",
  "link_sessions.last_active_at",
  "link_sessions.created_at",
  "report_rate_limits.hour_bucket",
  "sync_log.occurred_at",
  "sync_audit.applied_at",
  "admin_alerts.raised_at",
  "admin_alerts.last_seen_at",
  "admin_alerts.resolved_at",
  "reports.created_at",
  "reports.processing_lease_until",
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

function collectContext(root: Node): AnalysisContext {
  const context: AnalysisContext = {
    variableSources: new Map(),
    dbReads: new Map(),
    moduleMutables: new Set(),
    parameters: new Set(),
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
    if (/\bas\s+any\b/.test(text)) {
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

  const dbProperty = text.match(/\b([a-zA-Z_$][\w$]*)\.data\.([a-zA-Z_$][\w$]*)\b/);
  if (dbProperty?.[1] && dbProperty[2]) {
    const read = context.dbReads.get(dbProperty[1]);
    if (read) return { name: sourceNameForDbProperty(read, dbProperty[2]), origin: "db-read" };
  }
  const showProperty = text.match(/\bshow\.([a-zA-Z_$][\w$]*)\b/);
  if (showProperty?.[1]) return { name: `shows.${showProperty[1]}`, origin: "db-read" };
  const variable = text.match(/^[a-zA-Z_$][\w$]*$/)?.[0];
  if (variable) {
    const known = context.variableSources.get(variable);
    if (known) return known;
    if (context.parameters.has(variable) || /reviewed|expected|pinned|payload|params|req/i.test(variable)) {
      return contextSource(variable);
    }
  }
  if (/req\.params|payload\.|reviewed|expected|pinned/i.test(text)) return contextSource(text);
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) return contextSource(text);
  return null;
}

function isWriteSink(text: string): boolean {
  return /\.(update|delete|upsert|insert)\s*\(/.test(text);
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
      if (declaration.getName() === entry) matches.push(init ?? declaration);
    }
  }
  return matches;
}

function requiredEntriesForSources(sources: readonly SourceInput[]): string[] {
  const all = setValues(SYNC_ENTRY_POINTS);
  const text = sources.map((source) => source.source).join("\n");
  if (/Renamed|function\s+runScheduledCronSync[\s\S]*function\s+runScheduledCronSync/.test(text)) return all;
  const present = all.filter((entry) => new RegExp(`\\b${entry}\\b`).test(text));
  return present.length > 0 ? present : all;
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

function jsonbCasFindings(file: string, source: string): { findings: string[]; compared: Set<string>; read: Set<string> } {
  const jsonb = "shows.diagrams->>snapshot_revision_id";
  const findings: string[] = [];
  const compared = new Set<string>();
  const read = new Set<string>();
  if (!/shows\.diagrams\s*->>\s*['"]snapshot_revision_id['"]/.test(source)) return { findings, compared, read };
  read.add(jsonb);
  if (/\$\{\s*(req\.params\.rev|reviewedRevisionId|expectedRevisionId|pinnedRevisionId|payload\.[^}]+)\s*\}/.test(source)) {
    compared.add(jsonb);
  }
  if (/\$\{\s*fresh\.data\.diagrams\.snapshot_revision_id\s*\}/.test(source)) {
    findings.push(
      `AC-X.4 violation: gating-watermark CAS at ${repoPath(file)}:1 compares ${jsonb} against a fresh-read value; the other operand must come from the reviewed/staged context (e.g., reviewedStagedId, payload.expected_revision), NOT from a fresh SELECT inside the comparison.`,
    );
  }
  return { findings, compared, read };
}

export function auditSemanticWatermarks(sources: readonly SourceInput[]): string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFiles = sources.map((source) =>
    project.createSourceFile(source.path, source.source, { overwrite: true, scriptKind: ScriptKind.TSX }),
  );
  const requiredEntries = requiredEntriesForSources(sources);
  const precheck = precheckEntries(sourceFiles, requiredEntries);
  if (precheck.length > 0) return precheck;

  const findings: string[] = [];
  for (const sf of sourceFiles) {
    for (const entry of requiredEntries) {
      for (const root of findEntryDeclarations([sf], entry)) {
        const context = collectContext(root);
        const compared = new Set<string>();
        const read = new Set<string>();
        const jsonb = jsonbCasFindings(sf.getFilePath(), root.getText());
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
        if (isWriteSink(root.getText())) {
          for (const gating of read) {
            if (!compared.has(gating)) {
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

export function auditProjectNoGlobalCursor(): string[] {
  const findings = auditSchemaColumns(collectSchemaColumnsFromMigrations());
  for (const sf of projectSourceFiles()) {
    findings.push(...auditTokenAwareSource(sf.getFilePath(), sf.getFullText()));
  }
  const syncSources = [
    "lib/sync/runScheduledCronSync.ts",
    "lib/sync/runManualSyncForShow.ts",
    "lib/sync/runPushSyncForShow.ts",
    "lib/sync/runOnboardingScan.ts",
    "lib/sync/retrySingleFile.ts",
    "lib/sync/assetRecovery.ts",
    "lib/sync/applyStaged.ts",
    "lib/sync/discardStaged.ts",
  ].flatMap((path) => (existsSync(path) ? [{ path, source: readFileSync(path, "utf8") }] : []));
  const precheckOnly = auditSemanticWatermarks(syncSources).filter((finding) =>
    finding.startsWith("AC-X.4 semantic-layer precheck failed"),
  );
  findings.push(...precheckOnly);
  return findings.map((finding) => finding.replace(relative(process.cwd(), process.cwd()), ""));
}
