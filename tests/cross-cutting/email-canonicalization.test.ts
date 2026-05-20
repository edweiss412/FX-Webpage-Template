import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { EMAIL_BOUNDARIES } from "@/lib/audit/email-boundaries.generated";
import {
  auditEmailCanonicalizationSources,
  auditEmailSchemaCheckSources,
  auditLiveEmailCanonicalization,
  diffEmailBoundaryParity,
} from "@/lib/audit/emailCanonicalization";
import { extractEmailBoundariesFromDocs } from "@/scripts/extract-email-boundaries";

const specPath = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md";
const planPath = "docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/11-cross-cutting.md";
const fixtureRoot = "tests/cross-cutting/fixtures/email-canonicalization";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function fixture(name: string): { path: string; source: string } {
  const path = join(fixtureRoot, name);
  return { path, source: read(path) };
}

function expectFixtureFail(name: string, expected: string | RegExp): void {
  const file = fixture(name);
  expect(auditEmailCanonicalizationSources([file]).join("\n")).toMatch(expected);
}

function expectFixturePass(name: string): void {
  const file = fixture(name);
  expect(auditEmailCanonicalizationSources([file])).toEqual([]);
}

describe("X.5 email canonicalization audit", () => {
  test("boundary manifest is generated from spec AC-X.5 and plan Step 1", () => {
    const extracted = extractEmailBoundariesFromDocs(read(specPath), read(planPath));
    expect(EMAIL_BOUNDARIES).toEqual(extracted.planBoundaries);
    expect(diffEmailBoundaryParity(extracted.specBoundaryKeys, extracted.planBoundaryKeys)).toEqual([]);
  });

  test("boundary parity emits named diffs when plan Step 1 drifts from spec AC-X.5", () => {
    const extracted = extractEmailBoundariesFromDocs(
      read(specPath),
      read(planPath).replace("`lib/reports/rateLimit.ts`", "`lib/reports/rateLimitDRIFT.ts`"),
    );
    expect(diffEmailBoundaryParity(extracted.specBoundaryKeys, extracted.planBoundaryKeys)).toContain(
      "+missing_in_plan:DB write:lib/reports/rateLimit.ts",
    );
    expect(diffEmailBoundaryParity(extracted.specBoundaryKeys, extracted.planBoundaryKeys)).toContain(
      "-extra_in_plan:DB write:lib/reports/rateLimitDRIFT.ts",
    );
  });

  test("boundary parity emits named diffs when spec AC-X.5 adds a boundary absent from the plan", () => {
    // Failure mode: spec-side boundary extraction is a hardcoded TS list and ignores new AC-X.5 codespans.
    const extracted = extractEmailBoundariesFromDocs(
      read(specPath).replace(
        "admin_alerts.resolved_by`, AND read-side",
        "admin_alerts.resolved_by`, `webhook_audit.requester_email`, AND read-side",
      ),
      read(planPath),
    );
    expect(diffEmailBoundaryParity(extracted.specBoundaryKeys, extracted.planBoundaryKeys)).toContain(
      "+missing_in_plan:DB write:webhook_audit.requester_email",
    );
  });

  test("canonicalize detection resolves the imported function symbol, not an import-name substring", () => {
    // Failure mode: an alias import of canonicalize is treated as raw because the audit compares import text.
    expect(auditEmailCanonicalizationSources([
      {
        path: join(fixtureRoot, "good-canonicalize-alias.ts.fixture"),
        source: [
          'import { canonicalize as cz } from "@/lib/email/canonicalize";',
          "export async function writeCrew(db: { from(table: string): { insert(row: unknown): Promise<void> } }, rawEmail: string) {",
          '  await db.from("crew_members").insert({ email: cz(rawEmail) });',
          "}",
        ].join("\n"),
      },
    ])).toEqual([]);

    // Failure mode: a lookalike module path passes because the audit checks `includes("email/canonicalize")`.
    expect(auditEmailCanonicalizationSources([
      {
        path: join(fixtureRoot, "bad-canonicalize-lookalike.ts.fixture"),
        source: [
          'import { canonicalize } from "@/lib/email/canonicalizeStrict";',
          "export async function writeCrew(db: { from(table: string): { insert(row: unknown): Promise<void> } }, rawEmail: string) {",
          '  await db.from("crew_members").insert({ email: canonicalize(rawEmail) });',
          "}",
        ].join("\n"),
      },
    ]).join("\n")).toMatch(/raw_email_db_write:crew_members\.email/);
  });

  test("parser layer requires canonicalize before emitted email fields", () => {
    // Failure mode: parser emits `email: rawCell`, bypassing the only allowed raw-email helper.
    expectFixtureFail("bad-parser-raw-email.ts.fixture", /raw_email_assignment:.*email/);
    expectFixturePass("good-canonicalized-parser.ts.fixture");
  });

  test("parser layer walks the whole lib/parser subtree, not only lib/parser/blocks", () => {
    // Failure mode: a new parser normalizer under lib/parser/** emits raw email outside blocks/.
    expect(auditEmailCanonicalizationSources([
      {
        path: "lib/parser/normalizers/email.ts",
        source: "export const normalized = { email: rawEmail };",
      },
    ]).join("\n")).toMatch(/lib\/parser\/normalizers\/email\.ts: raw_email_assignment:email:1/);
  });

  test("DB write layer requires defensive canonicalization at email persistence sinks", () => {
    // Failure mode: DB helper trusts upstream parser/auth canonicalization and inserts raw email.
    expectFixtureFail("bad-db-insert-raw-email.ts.fixture", /raw_email_db_write:.*crew_members\.email/);
    expectFixturePass("good-canonicalized-db-write.ts.fixture");
  });

  test("DB write layer audits array-form Supabase upserts", () => {
    // Failure mode: `.upsert([{ email: raw }])` bypasses object-write inspection.
    expect(auditEmailCanonicalizationSources([
      {
        path: join(fixtureRoot, "bad-array-upsert-raw-email.ts.fixture"),
        source: [
          "export async function writeCrew(db: { from(table: string): { upsert(row: unknown): Promise<void> } }, rawEmail: string) {",
          '  await db.from("crew_members").upsert([{ email: rawEmail }]);',
          "}",
        ].join("\n"),
      },
    ]).join("\n")).toMatch(/raw_email_db_write:crew_members\.email/);
  });

  test("SQL write parser audits ON CONFLICT DO UPDATE email assignments", () => {
    // Failure mode: INSERT is canonicalized but the conflict UPDATE branch writes a raw email parameter.
    expect(auditEmailCanonicalizationSources([
      {
        path: join(fixtureRoot, "bad-sql-on-conflict-update-raw-email.ts.fixture"),
        source: [
          "export async function write(db: { query(sql: string, params: readonly unknown[]): Promise<void> }, email: string, reason: string) {",
          "  await db.query(`",
          "    insert into public.deferred_ingestions (drive_file_id, deferred_by_email, reason)",
          "    values ($1, lower(trim($2)), $3)",
          "    on conflict (drive_file_id) do update set",
          "      deferred_by_email = $2,",
          "      reason = excluded.reason",
          "  `, ['drive', email, reason]);",
          "}",
        ].join("\n"),
      },
    ]).join("\n")).toMatch(/raw_email_db_write:deferred_ingestions\.deferred_by_email/);
  });

  test("admin_alerts.context layer recursively rejects raw email JSONB fields", () => {
    // Failure mode: nested JSONB email fields bypass column-level CHECK constraints.
    expectFixtureFail("bad-jsonb-context-raw-email.ts.fixture", /raw_email_jsonb_context:.*matchedEmail/);
    expectFixturePass("good-canonicalized-jsonb-context.ts.fixture");
  });

  test("admin_alerts.context layer does not treat arbitrary toString calls as canonical email", () => {
    // Failure mode: the Layer 6 crew-id carve-out globally lets `rawEmail.toString()` through JSONB email contexts.
    expect(auditEmailCanonicalizationSources([
      {
        path: join(fixtureRoot, "bad-jsonb-context-to-string-email.ts.fixture"),
        source: [
          "export function alert(rawEmail: string) {",
          "  return { context: { matchedEmail: rawEmail.toString() } };",
          "}",
        ].join("\n"),
      },
    ]).join("\n")).toMatch(/raw_email_jsonb_context:context\.matchedEmail/);
  });

  test("validator/read layer requires canonicalize before crew_members.email predicates", () => {
    // Failure mode: mixed-case Google email misses a canonical crew_members.email row.
    expectFixtureFail("bad-validator-no-canonicalize.ts.fixture", /raw_email_read_predicate:.*crew_members\.email/);
    expectFixturePass("good-validator-canonicalizes.ts.fixture");
  });

  test("reports layer allows admin canonical email or crew id, never raw crew/admin email", () => {
    // Failure mode: reports.reported_by stores an email on the crew path.
    expectFixtureFail("bad-reports-reported-by-raw-email.ts.fixture", /raw_reported_by_email/);
    expectFixturePass("good-reports-crew-uses-id.ts.fixture");
  });

  test("schema CHECK audit fails when a migration weakens the canonical form", () => {
    // Failure mode: the audit byte-compares a hardcoded pg_get_constraintdef string and never checks source SQL drift.
    const findings = auditEmailSchemaCheckSources([
      {
        path: "supabase/migrations/20260520000911_add_email_canonical_checks.sql",
        source: [
          "alter table public.admin_alerts",
          "  add constraint admin_alerts_resolved_by_email_canonical",
          "    check (resolved_by is null or resolved_by <> '');",
        ].join("\n"),
      },
    ]);
    expect(findings).toContain("+wrong_check_source:admin_alerts.resolved_by");
  });

  test("live project satisfies all seven AC-X.5 audit layers", () => {
    expect(auditLiveEmailCanonicalization()).toEqual([]);
  }, 15000);
});
