import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { canonicalize } from "@/lib/email/canonicalize";
import { EMAIL_BOUNDARIES } from "@/lib/audit/email-boundaries.generated";

type Nullability = "nullable" | "not-null" | "admin-conditional";

type ExpectedBoundaryCheck = {
  readonly table: string;
  readonly column: string;
  readonly nullability: Nullability;
  readonly condition?: string;
};

type ParsedCheck = {
  readonly path: string;
  readonly table: string;
  readonly column: string;
  readonly constraint: string;
  readonly body: string;
};

const expectedBoundaryChecks: readonly ExpectedBoundaryCheck[] = [
  { table: "crew_members", column: "email", nullability: "nullable" },
  { table: "transportation", column: "driver_email", nullability: "nullable" },
  { table: "contacts", column: "email", nullability: "nullable" },
  { table: "sync_audit", column: "applied_by", nullability: "not-null" },
  { table: "app_settings", column: "watched_folder_set_by_email", nullability: "nullable" },
  { table: "app_settings", column: "pending_folder_set_by_email", nullability: "nullable" },
  { table: "deferred_ingestions", column: "deferred_by_email", nullability: "nullable" },
  { table: "admin_alerts", column: "resolved_by", nullability: "nullable" },
  { table: "reports", column: "reported_by", nullability: "admin-conditional", condition: "reported_by_kind" },
  { table: "report_rate_limits", column: "identity", nullability: "admin-conditional", condition: "kind" },
  { table: "pending_syncs", column: "wizard_approved_by_email", nullability: "nullable" },
  { table: "shows_pending_changes", column: "applied_by_email", nullability: "not-null" },
] as const;

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function migrationSources(): { path: string; source: string }[] {
  return readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const path = join("supabase/migrations", name);
      return { path, source: readFileSync(path, "utf8") };
    });
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
  const alterMatches = Array.from(prefix.matchAll(/alter\s+table(?:\s+if\s+exists)?\s+(?:(?:public|dev)\.)?([a-z_][a-z0-9_]*)/gi));
  const createMatches = Array.from(prefix.matchAll(/create\s+table(?:\s+if\s+not\s+exists)?\s+(?:(?:public|dev)\.)?([a-z_][a-z0-9_]*)/gi));
  const alter = alterMatches.at(-1);
  const create = createMatches.at(-1);
  const alterIndex = alter?.index ?? -1;
  const createIndex = create?.index ?? -1;
  return alterIndex > createIndex ? alter?.[1] ?? null : create?.[1] ?? null;
}

function columnFromConstraint(table: string, constraint: string): string | null {
  const overrides = new Map<string, string>([
    ["admin_alerts_resolved_by_email_canonical", "resolved_by"],
    ["reports_admin_reported_by_email_canonical", "reported_by"],
    ["report_rate_limits_admin_identity_email_canonical", "identity"],
    ["sync_audit_applied_by_email_canonical", "applied_by"],
    ["shows_pending_changes_applied_by_email_canonical", "applied_by_email"],
  ]);
  const override = overrides.get(constraint);
  if (override) return override;
  const prefix = `${table}_`;
  const suffix = "_canonical";
  if (constraint.startsWith(prefix) && constraint.endsWith(suffix)) {
    return constraint.slice(prefix.length, -suffix.length);
  }
  return null;
}

function parseCanonicalChecks(): ParsedCheck[] {
  const checks: ParsedCheck[] = [];
  for (const source of migrationSources()) {
    const sql = stripSqlComments(source.source);
    for (const match of sql.matchAll(/\b(?:add\s+)?constraint\s+([a-z_][a-z0-9_]*)\s+check\s*\(/gi)) {
      const constraint = match[1];
      if (!constraint?.includes("email_canonical")) continue;
      const openParen = (match.index ?? 0) + match[0].length - 1;
      const body = matchingParenBody(sql, openParen);
      const table = tableAtOffset(sql, match.index ?? 0);
      const column = table ? columnFromConstraint(table, constraint) : null;
      if (!body || !table || !column) continue;
      checks.push({ path: source.path, table, column, constraint, body });
    }
  }
  return checks;
}

function canonicalPattern(column: string): RegExp {
  return new RegExp(
    `\\b${column}\\b\\s*=\\s*lower\\s*\\(\\s*(?:btrim|trim)\\s*\\(\\s*(?:both\\s+from\\s+)?\\b${column}\\b\\s*\\)\\s*\\)`,
    "i",
  );
}

function rejectsEmptyPattern(column: string): RegExp {
  return new RegExp(`(?:\\b${column}\\b\\s*<>\\s*''|''\\s*<>\\s*\\b${column}\\b)`, "i");
}

function nullabilityPattern(expected: ExpectedBoundaryCheck): RegExp | null {
  if (expected.nullability === "nullable") {
    return new RegExp(`\\b${expected.column}\\b\\s+is\\s+null`, "i");
  }
  if (expected.nullability === "admin-conditional") {
    return new RegExp(`\\b${expected.condition}\\b\\s*<>\\s*'admin'`, "i");
  }
  return null;
}

describe("canonical email CHECK contract", () => {
  test("canonicalize maps empty and whitespace-only raw emails to null", () => {
    expect(canonicalize(null)).toBeNull();
    expect(canonicalize(undefined)).toBeNull();
    expect(canonicalize("")).toBeNull();
    expect(canonicalize("   \t\n")).toBeNull();
    expect(canonicalize(" Admin@Example.COM ")).toBe("admin@example.com");
  });

  test("every canonical email CHECK matches canonicalize() output contract", () => {
    const checks = parseCanonicalChecks();
    const expectedByColumn = new Map(
      expectedBoundaryChecks.map((expected) => [`${expected.table}.${expected.column}`, expected]),
    );
    const failures: string[] = [];

    for (const check of checks) {
      const key = `${check.table}.${check.column}`;
      const expected = expectedByColumn.get(key);
      const body = normalizeSql(check.body);
      if (!expected) {
        failures.push(`${check.path}:${check.constraint}: unexpected canonical email CHECK on ${key}`);
        continue;
      }
      if (!canonicalPattern(check.column).test(body)) {
        failures.push(`${check.path}:${check.constraint}: missing lower(trim(${check.column})) equality`);
      }
      if (!rejectsEmptyPattern(check.column).test(body)) {
        failures.push(`${check.path}:${check.constraint}: missing ${check.column} <> ''`);
      }
      const expectedNullability = nullabilityPattern(expected);
      if (expectedNullability && !expectedNullability.test(body)) {
        failures.push(`${check.path}:${check.constraint}: missing ${expected.nullability} guard`);
      }
    }

    expect(failures).toEqual([]);
  });

  test("every DB email boundary has a canonical CHECK and X.5 manifest registration", () => {
    const checks = parseCanonicalChecks();
    const checkKeys = new Set(checks.map((check) => `${check.table}.${check.column}`));
    const manifestText = EMAIL_BOUNDARIES.map((boundary) => `${boundary.path} ${boundary.boundaryCheck}`).join("\n");

    const failures = expectedBoundaryChecks.flatMap((expected) => {
      const key = `${expected.table}.${expected.column}`;
      const messages: string[] = [];
      if (!checkKeys.has(key)) messages.push(`${key}: missing canonical CHECK`);
      if (!manifestText.includes(key)) messages.push(`${key}: missing X.5 manifest entry`);
      return messages;
    });

    expect(failures).toEqual([]);
  });
});
