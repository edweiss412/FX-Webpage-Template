import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
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

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";

export type AuditSource = { path: string; source: string };

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const EMAIL_TABLE_COLUMNS = new Map<string, Set<string>>([
  ["crew_members", new Set(["email"])],
  ["transportation", new Set(["driver_email"])],
  ["contacts", new Set(["email"])],
  ["reports", new Set(["reported_by"])],
  ["report_rate_limits", new Set(["identity"])],
  ["sync_audit", new Set(["applied_by", "applied_by_email"])],
  ["pending_syncs", new Set(["wizard_approved_by_email"])],
  ["app_settings", new Set(["watched_folder_set_by_email", "pending_folder_set_by_email"])],
  ["deferred_ingestions", new Set(["deferred_by_email"])],
  ["admin_alerts", new Set(["resolved_by", "context"])],
]);

const REQUIRED_CHECKS: Array<{ table: string; column: string; constraint: string; definition: string }> = [
  {
    table: "crew_members",
    column: "email",
    constraint: "crew_members_email_canonical",
    definition: "CHECK (((email IS NULL) OR (email = lower(TRIM(BOTH FROM email)))))",
  },
  {
    table: "transportation",
    column: "driver_email",
    constraint: "transportation_driver_email_canonical",
    definition:
      "CHECK (((driver_email IS NULL) OR (driver_email = lower(TRIM(BOTH FROM driver_email)))))",
  },
  {
    table: "contacts",
    column: "email",
    constraint: "contacts_email_canonical",
    definition: "CHECK (((email IS NULL) OR (email = lower(TRIM(BOTH FROM email)))))",
  },
  {
    table: "sync_audit",
    column: "applied_by",
    constraint: "sync_audit_applied_by_email_canonical",
    definition: "CHECK ((applied_by = lower(TRIM(BOTH FROM applied_by))))",
  },
  {
    table: "app_settings",
    column: "watched_folder_set_by_email",
    constraint: "app_settings_watched_folder_set_by_email_canonical",
    definition:
      "CHECK (((watched_folder_set_by_email IS NULL) OR (watched_folder_set_by_email = lower(TRIM(BOTH FROM watched_folder_set_by_email)))))",
  },
  {
    table: "app_settings",
    column: "pending_folder_set_by_email",
    constraint: "app_settings_pending_folder_set_by_email_canonical",
    definition:
      "CHECK (((pending_folder_set_by_email IS NULL) OR (pending_folder_set_by_email = lower(TRIM(BOTH FROM pending_folder_set_by_email)))))",
  },
  {
    table: "deferred_ingestions",
    column: "deferred_by_email",
    constraint: "deferred_ingestions_deferred_by_email_canonical",
    definition:
      "CHECK (((deferred_by_email IS NULL) OR (deferred_by_email = lower(TRIM(BOTH FROM deferred_by_email)))))",
  },
  {
    table: "admin_alerts",
    column: "resolved_by",
    constraint: "admin_alerts_resolved_by_email_canonical",
    definition: "CHECK (((resolved_by IS NULL) OR (resolved_by = lower(TRIM(BOTH FROM resolved_by)))))",
  },
  {
    table: "reports",
    column: "reported_by",
    constraint: "reports_admin_reported_by_email_canonical",
    definition:
      "CHECK (((reported_by_kind <> 'admin'::text) OR (reported_by = lower(TRIM(BOTH FROM reported_by)))))",
  },
  {
    table: "report_rate_limits",
    column: "identity",
    constraint: "report_rate_limits_admin_identity_email_canonical",
    definition: "CHECK (((kind <> 'admin'::text) OR (identity = lower(TRIM(BOTH FROM identity)))))",
  },
  {
    table: "pending_syncs",
    column: "wizard_approved_by_email",
    constraint: "pending_syncs_wizard_approved_by_email_canonical",
    definition:
      "CHECK (((wizard_approved_by_email IS NULL) OR (wizard_approved_by_email = lower(TRIM(BOTH FROM wizard_approved_by_email)))))",
  },
];

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
  if (Node.isIdentifier(nameNode) || Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) {
    return nameNode.getText().replace(/^["']|["']$/g, "");
  }
  return null;
}

function isNullish(expr: Expression): boolean {
  return expr.getKind() === SyntaxKind.NullKeyword || expr.getKind() === SyntaxKind.UndefinedKeyword;
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
  if (Node.isFunctionDeclaration(declaration)) {
    return declaration.getName() === "canonicalize" && declaration.getSourceFile().getFilePath().endsWith("lib/email/canonicalize.ts");
  }
  if (Node.isImportSpecifier(declaration)) {
    const imported = declaration.getNameNode().getText();
    const moduleSpecifier = declaration.getImportDeclaration().getModuleSpecifierValue();
    return imported === "canonicalize" && moduleSpecifier.includes("email/canonicalize");
  }
  return false;
}

function callTargetsCanonicalize(call: CallExpression): boolean {
  const callee = call.getExpression();
  const symbol = callee.getSymbol() ?? (Node.isIdentifier(callee) ? callee.getDefinitions()[0]?.getDeclarationNode()?.getSymbol() : undefined);
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

function isCanonicalizedExpression(expr: Expression, seen = new Set<Node>()): boolean {
  const current = unwrap(expr);
  if (seen.has(current)) return false;
  seen.add(current);
  if (isNullish(current)) return true;
  if (Node.isCallExpression(current)) {
    if (callTargetsCanonicalize(current)) return true;
    const callee = current.getExpression();
    if (Node.isPropertyAccessExpression(callee) && callee.getName() === "toString") return true;
    return false;
  }
  if (Node.isIdentifier(current)) {
    const initializer = initializerForIdentifier(current);
    return initializer ? isCanonicalizedExpression(initializer, seen) : false;
  }
  if (Node.isConditionalExpression(current)) {
    return (
      isCanonicalizedExpression(current.getWhenTrue(), seen) ||
      isCanonicalizedExpression(current.getWhenFalse(), seen)
    );
  }
  return false;
}

function isEmailProperty(name: string): boolean {
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
      if (!isCanonicalizedExpression(expr)) {
        findings.push(`${path}: raw_reported_by_email:${prop.getStartLineNumber()}`);
      }
      continue;
    }
    if (EMAIL_TABLE_COLUMNS.get(table)?.has(name) || isEmailLikeDbColumn(name)) {
      if (!isCanonicalizedExpression(expr)) {
        findings.push(`${path}: raw_email_db_write:${table}.${name}:${prop.getStartLineNumber()}`);
      }
    }
  }
  return findings;
}

function sqlText(expr: Expression | undefined): string | null {
  if (!expr) return null;
  if (Node.isNoSubstitutionTemplateLiteral(expr) || Node.isStringLiteral(expr)) return expr.getLiteralText();
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

function parseInsertColumns(sql: string): { table: string; columnsByParam: Map<number, string> } | null {
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

function parseUpdateColumns(sql: string): { table: string; columnsByParam: Map<number, string> } | null {
  const match = sql.match(/update\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+set\s+([\s\S]*?)(?:\s+where|\s+returning|$)/i);
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

function auditSqlWrite(path: string, call: CallExpression): string[] {
  const sql = sqlText(call.getArguments()[0] as Expression | undefined);
  const params = arrayArg(call);
  if (!sql || !params) return [];
  const findings: string[] = [];
  const insert = parseInsertColumns(sql);
  if (insert) {
    for (const [paramIndex, column] of insert.columnsByParam) {
      if (column === "context") continue;
      if (!EMAIL_TABLE_COLUMNS.get(insert.table)?.has(column) && !isEmailLikeDbColumn(column)) continue;
      const arg = params.getElements()[paramIndex - 1] as Expression | undefined;
      if (arg && !isCanonicalizedExpression(arg)) {
        findings.push(`${path}: raw_email_db_write:${insert.table}.${column}:${call.getStartLineNumber()}`);
      }
    }
  }
  const update = parseUpdateColumns(sql);
  if (update) {
    for (const [paramIndex, column] of update.columnsByParam) {
      if (column === "context") continue;
      if (!EMAIL_TABLE_COLUMNS.get(update.table)?.has(column) && !isEmailLikeDbColumn(column)) continue;
      const arg = params.getElements()[paramIndex - 1] as Expression | undefined;
      if (arg && !isCanonicalizedExpression(arg)) {
        findings.push(`${path}: raw_email_db_write:${update.table}.${column}:${call.getStartLineNumber()}`);
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
        return [`${path}: raw_email_jsonb_context:${childTrail.join(".")}:${element.getStartLineNumber()}`];
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
    if (/email/i.test(name) && !Node.isObjectLiteralExpression(value) && !Node.isArrayLiteralExpression(value)) {
      if (!isCanonicalizedExpression(value)) {
        findings.push(`${path}: raw_email_jsonb_context:${nextTrail.join(".")}:${prop.getStartLineNumber()}`);
      }
    } else {
      findings.push(...auditContextExpression(path, value, nextTrail));
    }
  }
  return findings;
}

function auditParserAssignments(file: SourceFile): string[] {
  if (!file.getFilePath().includes("lib/parser/") && !basename(file.getFilePath()).includes("parser")) {
    return [];
  }
  const findings: string[] = [];
  for (const prop of file.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const object = prop.getFirstAncestorByKind(SyntaxKind.ObjectLiteralExpression);
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
      findings.push(`${file.getFilePath()}: raw_email_assignment:${name}:${prop.getStartLineNumber()}`);
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
    if (table && Node.isObjectLiteralExpression(first)) {
      findings.push(...auditObjectWrite(file.getFilePath(), table, first));
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
      findings.push(`${file.getFilePath()}: raw_email_read_predicate:crew_members.email:${call.getStartLineNumber()}`);
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
      if (!isCanonicalizedExpression(value)) {
        findings.push(`${file.getFilePath()}: raw_reported_by_email:${prop.getStartLineNumber()}`);
      }
    }
  }
  return findings;
}

function auditInlineNormalization(file: SourceFile): string[] {
  const findings: string[] = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    if (["toLowerCase", "toLocaleLowerCase", "trim", "trimStart", "trimEnd"].includes(callee.getName())) {
      findings.push(`${file.getFilePath()}: inline_email_normalization:${callee.getName()}:${call.getStartLineNumber()}`);
    }
  }
  return findings;
}

export function auditEmailCanonicalizationSources(sources: readonly AuditSource[]): string[] {
  const { files } = makeProject(sources);
  return files.flatMap((file) => [
    ...auditParserAssignments(file),
    ...auditWrites(file),
    ...auditReadPredicates(file),
    ...auditReportIdentityObjects(file),
    ...(file.getFilePath().includes("fixtures/email-canonicalization")
      ? auditInlineNormalization(file)
      : []),
  ]);
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql: string): string {
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
  for (const expected of REQUIRED_CHECKS) {
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
    if (normalizeDefinition(actual) !== normalizeDefinition(expected.definition)) {
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
    const row = rows.find((candidate) => candidate.name === name && candidate.pronargs === pronargs);
    if (!row) {
      findings.push(`+missing_rls_helper:${name}`);
      continue;
    }
    const body = row.definition.toLowerCase();
    if (name === "canonicalize_email" && !body.includes("lower(btrim")) findings.push(`+wrong_rls_helper:${name}`);
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
    ...walkSourceFiles(["lib/parser/blocks"]),
    ...walkSourceFiles(["lib/sync", "lib/reports", "lib/auth", "lib/data", "lib/adminAlerts"]),
    ...walkSourceFiles(["app/api/admin"]),
  ];
  const sources = sourcePaths.map((path) => ({ path, source: readFileSync(path, "utf8") }));
  return [
    ...auditEmailCanonicalizationSources(sources),
    ...auditSchemaChecks(),
    ...auditRlsHelpers(),
  ].sort();
}
