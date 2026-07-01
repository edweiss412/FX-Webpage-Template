import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  type ArrayLiteralExpression,
  CallExpression,
  Expression,
  Identifier,
  Node,
  ObjectLiteralExpression,
  Project,
  PropertyAssignment,
  ShorthandPropertyAssignment,
  SourceFile,
  SyntaxKind,
} from "ts-morph";

import { EMAIL_BOUNDARIES } from "@/lib/audit/email-boundaries.generated";
import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

export type AuditSource = { path: string; source: string };

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type CheckSource = { table: string; column: string; constraint: string; body: string };

export function diffEmailBoundaryParity(
  specBoundaryKeys: readonly string[],
  planBoundaryKeys: readonly string[],
): string[] {
  const diffs: string[] = [];
  const spec = new Set(specBoundaryKeys);
  const plan = new Set(planBoundaryKeys);
  for (const value of spec) {
    if (!plan.has(value)) diffs.push(`+missing_in_plan:${value}`);
  }
  for (const value of plan) {
    if (!spec.has(value)) diffs.push(`-extra_in_plan:${value}`);
  }
  return diffs.sort();
}

function addColumn(map: Map<string, Set<string>>, table: string, column: string): void {
  const columns = map.get(table) ?? new Set<string>();
  columns.add(column);
  map.set(table, columns);
}

function deriveEmailTableColumns(): Map<string, Set<string>> {
  const columns = new Map<string, Set<string>>();
  for (const boundary of EMAIL_BOUNDARIES) {
    const text = `${boundary.path} ${boundary.boundaryCheck}`;
    for (const match of text.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g)) {
      const table = match[1];
      const column = match[2];
      if (!table || !column) continue;
      if (column === "ts" || column === "id") continue;
      if (isEmailLikeDbColumn(column) || (table === "admin_alerts" && column === "context")) {
        addColumn(columns, table, column);
      }
    }
  }
  for (const source of defaultSchemaCheckSources()) {
    for (const check of parseEmailCheckSources([source])) {
      addColumn(columns, check.table, check.column);
    }
  }
  return columns;
}

function defaultSchemaCheckSources(): AuditSource[] {
  return [
    "supabase/migrations/20260501000000_initial_public_schema.sql",
    "supabase/migrations/20260520000911_add_email_canonical_checks.sql",
    "supabase/migrations/20260602000004_b3_email_deliveries.sql",
    "supabase/migrations/20260630000001_transportation_loadout_contact.sql",
  ].map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

function matchingParenBody(sql: string, openParen: number): string | null {
  let depth = 0;
  for (let index = openParen; index < sql.length; index++) {
    const char = sql[index];
    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) return sql.slice(openParen + 1, index);
    }
  }
  return null;
}

function tableAtOffset(sql: string, offset: number): string | null {
  const prefix = sql.slice(0, offset);
  const alterMatches = Array.from(
    prefix.matchAll(/alter\s+table(?:\s+if\s+exists)?\s+(?:(?:public|dev)\.)?([a-z_][a-z0-9_]*)/gi),
  );
  const createMatches = Array.from(
    prefix.matchAll(
      /create\s+table(?:\s+if\s+not\s+exists)?\s+(?:(?:public|dev)\.)?([a-z_][a-z0-9_]*)/gi,
    ),
  );
  const alter = alterMatches.at(-1);
  const create = createMatches.at(-1);
  const alterIndex = alter?.index ?? -1;
  const createIndex = create?.index ?? -1;
  return alterIndex > createIndex ? (alter?.[1] ?? null) : (create?.[1] ?? null);
}

function columnFromCheckBody(body: string): string | null {
  const equalsCanonical = body.match(
    /\b([a-z_][a-z0-9_]*)\s*=\s*lower\s*\(\s*(?:btrim|trim)\s*\(\s*(?:both\s+from\s+)?\1\s*\)\s*\)/i,
  );
  if (equalsCanonical?.[1]) return equalsCanonical[1];
  return null;
}

function columnFromConstraint(table: string, constraint: string): string | null {
  if (constraint === "admin_alerts_resolved_by_email_canonical") return "resolved_by";
  if (constraint === "reports_admin_reported_by_email_canonical") return "reported_by";
  if (constraint === "report_rate_limits_admin_identity_email_canonical") return "identity";
  if (constraint === "sync_audit_applied_by_email_canonical") return "applied_by";
  if (constraint === "shows_pending_changes_applied_by_email_canonical") return "applied_by_email";
  if (constraint === "email_deliveries_recipient_email_canonical") return "recipient";
  const prefix = `${table}_`;
  const suffixes = ["_canonical"];
  for (const suffix of suffixes) {
    if (constraint.startsWith(prefix) && constraint.endsWith(suffix)) {
      return constraint.slice(prefix.length, -suffix.length);
    }
  }
  return null;
}

function parseEmailCheckSources(sources: readonly AuditSource[]): CheckSource[] {
  const checks: CheckSource[] = [];
  for (const source of sources) {
    const sql = stripSqlComments(source.source);
    for (const match of sql.matchAll(
      /\b(?:add\s+)?constraint\s+([a-z_][a-z0-9_]*)\s+check\s*\(/gi,
    )) {
      const constraint = match[1];
      if (!constraint?.includes("email_canonical")) continue;
      const openParen = (match.index ?? 0) + match[0].length - 1;
      const body = matchingParenBody(sql, openParen);
      const table = tableAtOffset(sql, match.index ?? 0);
      const column =
        body && table && (columnFromCheckBody(body) ?? columnFromConstraint(table, constraint));
      if (!body || !table || !column) continue;
      checks.push({ table, column, constraint, body });
    }
  }
  return checks;
}

function canonicalCheckPattern(column: string): RegExp {
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\b${escaped}\\b\\s*=\\s*lower\\s*\\(\\s*(?:btrim|trim)\\s*\\(\\s*(?:both\\s+from\\s+)?\\b${escaped}\\b\\s*\\)\\s*\\)`,
    "i",
  );
}

function checkBodyIsCanonical(body: string, column: string): boolean {
  const normalized = normalizeDefinition(body);
  const rejectsEmpty = new RegExp(
    `(?:\\b${column}\\b\\s*<>\\s*''|''\\s*<>\\s*\\b${column}\\b)`,
    "i",
  );
  return canonicalCheckPattern(column).test(normalized) && rejectsEmpty.test(normalized);
}

export function auditEmailSchemaCheckSources(sources: readonly AuditSource[]): string[] {
  const findings: string[] = [];
  for (const check of parseEmailCheckSources(sources)) {
    if (!checkBodyIsCanonical(check.body, check.column)) {
      findings.push(`+wrong_check_source:${check.table}.${check.column}`);
    }
  }
  return findings.sort();
}

function makeProject(sources: readonly AuditSource[]): { project: Project; files: SourceFile[] } {
  const project = new Project({
    tsConfigFilePath: "tsconfig.json",
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFileAtPathIfExists("lib/email/canonicalize.ts");
  const files = sources.map(({ path, source }) => {
    const tsPath = path.endsWith(".fixture") ? path.replace(/\.fixture$/, "") : path;
    return project.createSourceFile(tsPath, source, { overwrite: true });
  });
  return { project, files };
}

function propertyName(node: PropertyAssignment | ShorthandPropertyAssignment): string | null {
  if (Node.isShorthandPropertyAssignment(node)) return node.getName();
  const nameNode = node.getNameNode();
  if (
    Node.isIdentifier(nameNode) ||
    Node.isStringLiteral(nameNode) ||
    Node.isNumericLiteral(nameNode)
  ) {
    return nameNode.getText().replace(/^["']|["']$/g, "");
  }
  return null;
}

function isNullish(expr: Expression): boolean {
  return (
    expr.getKind() === SyntaxKind.NullKeyword || expr.getKind() === SyntaxKind.UndefinedKeyword
  );
}

function unwrap(expr: Expression): Expression {
  let current = expr;
  while (
    Node.isAsExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isNonNullExpression(current) ||
    Node.isParenthesizedExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

function declarationIsCanonicalize(declaration: Node): boolean {
  return (
    Node.isFunctionDeclaration(declaration) &&
    declaration.getSourceFile().getFilePath().endsWith("lib/email/canonicalize.ts")
  );
}

function callTargetsCanonicalize(call: CallExpression): boolean {
  const callee = call.getExpression();
  const directSymbol = callee.getSymbol();
  const symbol =
    directSymbol?.getAliasedSymbol() ??
    directSymbol ??
    (Node.isIdentifier(callee)
      ? callee.getDefinitions()[0]?.getDeclarationNode()?.getSymbol()
      : undefined);
  const declarations = symbol?.getDeclarations() ?? [];
  return declarations.some(declarationIsCanonicalize);
}

function initializerForIdentifier(identifier: Identifier): Expression | null {
  const declaration = identifier.getDefinitions()[0]?.getDeclarationNode();
  if (Node.isVariableDeclaration(declaration)) return declaration.getInitializer() ?? null;
  if (Node.isParameterDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    return initializer ?? null;
  }
  return null;
}

type CanonicalizationMode = "email" | "report-identity";

function isCanonicalizedExpression(
  expr: Expression,
  seen = new Set<Node>(),
  mode: CanonicalizationMode = "email",
): boolean {
  const current = unwrap(expr);
  if (seen.has(current)) return false;
  seen.add(current);
  if (isNullish(current)) return true;
  if (Node.isCallExpression(current)) {
    if (callTargetsCanonicalize(current)) return true;
    const callee = current.getExpression();
    if (
      mode === "report-identity" &&
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === "toString"
    ) {
      return true;
    }
    return false;
  }
  if (Node.isIdentifier(current)) {
    const initializer = initializerForIdentifier(current);
    return initializer ? isCanonicalizedExpression(initializer, seen, mode) : false;
  }
  if (Node.isConditionalExpression(current)) {
    return (
      isCanonicalizedExpression(current.getWhenTrue(), seen, mode) ||
      isCanonicalizedExpression(current.getWhenFalse(), seen, mode)
    );
  }
  return false;
}

function isEmailProperty(name: string): boolean {
  if (name.includes(".")) return false;
  return /^email$/.test(name) || /_email$/.test(name) || /_by_email$/.test(name);
}

function isEmailLikeDbColumn(name: string): boolean {
  return (
    isEmailProperty(name) ||
    name === "identity" ||
    name === "reported_by" ||
    name === "applied_by" ||
    name === "resolved_by" ||
    name === "wizard_approved_by_email"
  );
}

function stringArg(call: CallExpression, index: number): string | null {
  const arg = call.getArguments()[index];
  return Node.isStringLiteral(arg) ? arg.getLiteralText() : null;
}

function tableFromCall(call: CallExpression): string | null {
  const callee = call.getExpression();
  if (Node.isPropertyAccessExpression(callee) && callee.getName() === "from") {
    return stringArg(call, 0);
  }
  return null;
}

function tableForWriteCall(call: CallExpression): string | null {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return null;
  if (!["insert", "upsert", "update"].includes(callee.getName())) return null;
  let cursor: Expression = callee.getExpression();
  while (Node.isCallExpression(cursor)) {
    const table = tableFromCall(cursor);
    if (table) return table;
    const inner = cursor.getExpression();
    if (!Node.isPropertyAccessExpression(inner)) break;
    cursor = inner.getExpression();
  }
  return null;
}

function auditObjectWrite(path: string, table: string, object: ObjectLiteralExpression): string[] {
  const findings: string[] = [];
  const emailTableColumns = deriveEmailTableColumns();
  for (const prop of object.getProperties()) {
    if (!Node.isPropertyAssignment(prop) && !Node.isShorthandPropertyAssignment(prop)) continue;
    const name = propertyName(prop);
    if (!name) continue;
    const expr = Node.isPropertyAssignment(prop) ? prop.getInitializer() : prop.getNameNode();
    if (!expr) continue;
    if (table === "admin_alerts" && name === "context") {
      findings.push(...auditContextExpression(path, expr, ["context"]));
      continue;
    }
    if (table === "reports" && name === "reported_by") {
      if (!isCanonicalizedExpression(expr, new Set<Node>(), "report-identity")) {
        findings.push(`${path}: raw_reported_by_email:${prop.getStartLineNumber()}`);
      }
      continue;
    }
    if (emailTableColumns.get(table)?.has(name) || isEmailLikeDbColumn(name)) {
      if (!isCanonicalizedExpression(expr)) {
        findings.push(`${path}: raw_email_db_write:${table}.${name}:${prop.getStartLineNumber()}`);
      }
    }
  }
  return findings;
}

function sqlText(expr: Expression | undefined): string | null {
  if (!expr) return null;
  if (Node.isNoSubstitutionTemplateLiteral(expr) || Node.isStringLiteral(expr))
    return expr.getLiteralText();
  if (Node.isTaggedTemplateExpression(expr)) return expr.getTemplate().getText();
  return null;
}

function arrayArg(call: CallExpression): ArrayLiteralExpression | null {
  return call.getArguments().find(Node.isArrayLiteralExpression) ?? null;
}

function splitTopLevelCsv(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth++;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseInsertColumns(
  sql: string,
): { table: string; columnsByParam: Map<number, string> } | null {
  const match = sql.match(
    /insert\s+into\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*(?:values\s*\(([\s\S]*?)\)|select\s+([\s\S]*?)\s+from)/i,
  );
  if (!match?.[1] || !match[2]) return null;
  const values = match[3] ?? match[4] ?? "";
  const valueParts = splitTopLevelCsv(values);
  const columns = splitTopLevelCsv(match[2])
    .map((part) => part.trim().replace(/"/g, ""))
    .filter(Boolean);
  const columnsByParam = new Map<number, string>();
  columns.forEach((column, index) => {
    const param = valueParts[index]?.match(/^\$(\d+)/)?.[1];
    if (param) columnsByParam.set(Number(param), column);
  });
  return {
    table: match[1],
    columnsByParam,
  };
}

function parseUpdateColumns(
  sql: string,
): { table: string; columnsByParam: Map<number, string> } | null {
  const match = sql.match(
    /update\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+set\s+([\s\S]*?)(?:\s+where|\s+returning|$)/i,
  );
  if (!match?.[1] || !match[2]) return null;
  const columnsByParam = new Map<number, string>();
  for (const assignment of match[2].split(",")) {
    const part = assignment.trim();
    const col = part.match(/^([a-z_][a-z0-9_]*)\s*=/i)?.[1];
    const param = part.match(/\$(\d+)/)?.[1];
    if (col && param) columnsByParam.set(Number(param), col);
  }
  return { table: match[1], columnsByParam };
}

function parseDoUpdateColumns(
  sql: string,
  insertTable: string | null,
): { table: string; columnsByParam: Map<number, string> } | null {
  const match = sql.match(
    /\bon\s+conflict[\s\S]*?\bdo\s+update\s+set\s+([\s\S]*?)(?:\s+where|\s+returning|$)/i,
  );
  if (!match?.[1]) return null;
  const columnsByParam = new Map<number, string>();
  for (const assignment of splitTopLevelCsv(match[1])) {
    const col = assignment.match(/^\s*([a-z_][a-z0-9_]*)\s*=/i)?.[1];
    const param = assignment.match(/\$(\d+)/)?.[1];
    if (col && param) columnsByParam.set(Number(param), col);
  }
  return insertTable ? { table: insertTable, columnsByParam } : null;
}

function auditSqlWrite(path: string, call: CallExpression): string[] {
  const sql = sqlText(call.getArguments()[0] as Expression | undefined);
  const params = arrayArg(call);
  if (!sql || !params) return [];
  const findings: string[] = [];
  const emailTableColumns = deriveEmailTableColumns();
  const insert = parseInsertColumns(sql);
  if (insert) {
    for (const [paramIndex, column] of insert.columnsByParam) {
      if (column === "context") continue;
      if (!emailTableColumns.get(insert.table)?.has(column) && !isEmailLikeDbColumn(column))
        continue;
      const arg = params.getElements()[paramIndex - 1] as Expression | undefined;
      if (arg && !isCanonicalizedExpression(arg)) {
        findings.push(
          `${path}: raw_email_db_write:${insert.table}.${column}:${call.getStartLineNumber()}`,
        );
      }
    }
  }
  const updateColumns = parseUpdateColumns(sql);
  const doUpdate = parseDoUpdateColumns(sql, insert?.table ?? null);
  for (const update of [updateColumns, doUpdate]) {
    if (!update) continue;
    for (const [paramIndex, column] of update.columnsByParam) {
      if (column === "context") continue;
      if (!emailTableColumns.get(update.table)?.has(column) && !isEmailLikeDbColumn(column))
        continue;
      const arg = params.getElements()[paramIndex - 1] as Expression | undefined;
      if (arg && !isCanonicalizedExpression(arg)) {
        findings.push(
          `${path}: raw_email_db_write:${update.table}.${column}:${call.getStartLineNumber()}`,
        );
      }
    }
  }
  return findings;
}

function auditContextExpression(path: string, expr: Expression, trail: string[]): string[] {
  const current = unwrap(expr);
  if (Node.isIdentifier(current)) {
    const initializer = initializerForIdentifier(current);
    return initializer ? auditContextExpression(path, initializer, trail) : [];
  }
  if (Node.isArrayLiteralExpression(current)) {
    return current.getElements().flatMap((element) => {
      if (!Node.isExpression(element)) return [];
      const childTrail = [...trail.slice(0, -1), `${trail.at(-1) ?? "value"}[]`];
      if (/email/i.test(trail.at(-1) ?? "") && !isCanonicalizedExpression(element)) {
        return [
          `${path}: raw_email_jsonb_context:${childTrail.join(".")}:${element.getStartLineNumber()}`,
        ];
      }
      return auditContextExpression(path, element, childTrail);
    });
  }
  if (!Node.isObjectLiteralExpression(current)) return [];
  const findings: string[] = [];
  for (const prop of current.getProperties()) {
    if (!Node.isPropertyAssignment(prop) && !Node.isShorthandPropertyAssignment(prop)) continue;
    const name = propertyName(prop);
    if (!name) continue;
    const value = Node.isPropertyAssignment(prop) ? prop.getInitializer() : prop.getNameNode();
    if (!value) continue;
    const nextTrail = [...trail, name];
    if (
      /email/i.test(name) &&
      !Node.isObjectLiteralExpression(value) &&
      !Node.isArrayLiteralExpression(value)
    ) {
      if (/_hash$/i.test(name)) continue;
      if (!isCanonicalizedExpression(value)) {
        findings.push(
          `${path}: raw_email_jsonb_context:${nextTrail.join(".")}:${prop.getStartLineNumber()}`,
        );
      }
    } else {
      findings.push(...auditContextExpression(path, value, nextTrail));
    }
  }
  return findings;
}

function auditParserAssignments(file: SourceFile): string[] {
  const findings: string[] = [];
  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const object = prop.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression);
    if (object?.getProperty("invariant")) continue;
    const call = object?.getParentIfKind(SyntaxKind.CallExpression);
    const callee = call?.getExpression();
    if (
      callee &&
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === "push" &&
      callee.getExpression().getText() === "emailMatches"
    ) {
      continue;
    }
    const name = propertyName(prop);
    const expr = prop.getInitializer();
    if (!name || !expr || !isEmailProperty(name)) continue;
    if (!isCanonicalizedExpression(expr)) {
      findings.push(
        `${file.getFilePath()}: raw_email_assignment:${name}:${prop.getStartLineNumber()}`,
      );
    }
  }
  return findings;
}

function auditWrites(file: SourceFile): string[] {
  const findings: string[] = [];
  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const name = propertyName(prop);
    const expr = prop.getInitializer();
    if (name === "context" && expr) {
      findings.push(...auditContextExpression(file.getFilePath(), expr, ["context"]));
    }
  }
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const table = tableForWriteCall(call);
    const first = call.getArguments()[0];
    if (table) {
      if (Node.isObjectLiteralExpression(first)) {
        findings.push(...auditObjectWrite(file.getFilePath(), table, first));
      }
      if (Node.isArrayLiteralExpression(first)) {
        for (const element of first.getElements()) {
          if (Node.isObjectLiteralExpression(element)) {
            findings.push(...auditObjectWrite(file.getFilePath(), table, element));
          }
        }
      }
    }
    findings.push(...auditSqlWrite(file.getFilePath(), call));
  }
  return findings;
}

function auditReadPredicates(file: SourceFile): string[] {
  const findings: string[] = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== "eq") continue;
    const [columnArg, valueArg] = call.getArguments();
    if (!Node.isStringLiteral(columnArg) || columnArg.getLiteralText() !== "email") continue;
    if (!Node.isExpression(valueArg)) continue;
    let cursor: Expression = callee.getExpression();
    let table: string | null = null;
    while (Node.isCallExpression(cursor)) {
      table = tableFromCall(cursor) ?? table;
      const inner = cursor.getExpression();
      if (!Node.isPropertyAccessExpression(inner)) break;
      cursor = inner.getExpression();
    }
    if (table === "crew_members" && !isCanonicalizedExpression(valueArg)) {
      findings.push(
        `${file.getFilePath()}: raw_email_read_predicate:crew_members.email:${call.getStartLineNumber()}`,
      );
    }
  }
  return findings;
}

function auditReportIdentityObjects(file: SourceFile): string[] {
  if (!file.getFilePath().endsWith("lib/reports/submit.ts")) return [];
  const findings: string[] = [];
  for (const object of file.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const props = object.getProperties().filter(Node.isPropertyAssignment);
    const adminKind = props.some((prop) => {
      const name = propertyName(prop);
      const value = prop.getInitializer();
      return (
        (name === "kind" || name === "reportedByKind") &&
        Node.isStringLiteral(value) &&
        value.getLiteralText() === "admin"
      );
    });
    if (!adminKind) continue;
    for (const prop of props) {
      const name = propertyName(prop);
      const value = prop.getInitializer();
      if (!value || (name !== "identity" && name !== "reportedBy")) continue;
      if (!isCanonicalizedExpression(value, new Set<Node>(), "report-identity")) {
        findings.push(`${file.getFilePath()}: raw_reported_by_email:${prop.getStartLineNumber()}`);
      }
    }
  }
  return findings;
}

export function auditEmailCanonicalizationSources(sources: readonly AuditSource[]): string[] {
  const { files } = makeProject(sources);
  return files.flatMap((file) => [
    ...(file.getFilePath().includes("/lib/parser/") ||
    file.getFilePath().includes("fixtures/email-canonicalization")
      ? auditParserAssignments(file)
      : []),
    ...auditWrites(file),
    ...auditReadPredicates(file),
    ...auditReportIdentityObjects(file),
  ]);
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql: string): string {
  // not-subject-to-meta: psql shell-out; no Supabase client involved
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function normalizeDefinition(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function auditSchemaChecks(): string[] {
  const findings: string[] = [];
  const expectedChecks = parseEmailCheckSources(defaultSchemaCheckSources());
  findings.push(...auditEmailSchemaCheckSources(defaultSchemaCheckSources()));
  for (const expected of expectedChecks) {
    const actual = runPsql(`
      select pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public'
         and t.relname = ${sqlString(expected.table)}
         and c.conname = ${sqlString(expected.constraint)}
         and c.contype = 'c';
    `);
    if (!actual) {
      findings.push(`+missing_check:${expected.table}.${expected.column}`);
      continue;
    }
    if (!checkBodyIsCanonical(actual, expected.column)) {
      findings.push(`+wrong_check:${expected.table}.${expected.column}`);
    }
  }
  return findings;
}

function auditRlsHelpers(): string[] {
  const raw = runPsql(`
    select jsonb_build_object(
      'name', proname,
      'pronargs', pronargs,
      'definition', pg_get_functiondef(p.oid)
    )::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_admin', 'auth_email_canonical', 'canonicalize_email')
     order by proname, pronargs;
  `);
  const rows = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { name: string; pronargs: number; definition: string });
  const findings: string[] = [];
  for (const [name, pronargs] of [
    ["auth_email_canonical", 0],
    ["canonicalize_email", 1],
    ["is_admin", 0],
  ] as const) {
    const row = rows.find(
      (candidate) => candidate.name === name && candidate.pronargs === pronargs,
    );
    if (!row) {
      findings.push(`+missing_rls_helper:${name}`);
      continue;
    }
    const body = row.definition.toLowerCase();
    if (name === "canonicalize_email" && !body.includes("lower(btrim"))
      findings.push(`+wrong_rls_helper:${name}`);
    if (name === "auth_email_canonical" && !body.includes("canonicalize_email(auth.email())")) {
      findings.push(`+wrong_rls_helper:${name}`);
    }
    if (
      name === "is_admin" &&
      (!body.includes("app_metadata") ||
        !body.includes("public.admin_emails") ||
        !body.includes("auth_email_canonical()"))
    ) {
      findings.push(`+wrong_rls_helper:${name}`);
    }
  }
  return findings;
}

export function auditLiveEmailCanonicalization(): string[] {
  const sourcePaths = [
    ...walkSourceFiles(["lib/parser"]),
    ...walkSourceFiles([
      "lib/sync",
      "lib/reports",
      "lib/auth",
      "lib/data",
      "lib/adminAlerts",
      "lib/notify",
    ]),
    ...walkSourceFiles(["app/api/admin"]),
    // M12 Phase 0.C Task 0.C.9 — extend audit to validation tooling
    // (DEFERRED.md M12-PHASE0C-EMAIL-CANON-EXT). Validation tooling IS a
    // boundary for email writes (fixture INSERTs into crew_members); AGENTS.md
    // invariant 3 requires canonicalization via lib/email/canonicalize.ts.
    ...walkSourceFiles(["scripts"]).filter((p) => /(?:^|\/)validation-[\w-]+\.ts$/.test(p)),
  ];
  const sources = sourcePaths.map((path) => ({ path, source: readFileSync(path, "utf8") }));
  return [
    ...auditEmailCanonicalizationSources(sources),
    ...auditSchemaChecks(),
    ...auditRlsHelpers(),
  ].sort();
}
