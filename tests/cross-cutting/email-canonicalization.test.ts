import { execFileSync } from "node:child_process";
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
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    cwd: process.cwd(),
    input: sql,
    encoding: "utf8",
  }).trim();
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

  test("canonical CHECK migration backfills historical mixed-case rows before validation", () => {
    // Failure mode: ALTER TABLE ... ADD CHECK validates before historical rows are canonicalized.
    const output = runPsql(`
      begin;

      create schema if not exists dev;
      create table if not exists dev.sync_audit (like public.sync_audit including all);
      create table if not exists dev.app_settings (like public.app_settings including all);
      create table if not exists dev.deferred_ingestions (like public.deferred_ingestions including all);
      create table if not exists dev.admin_alerts (like public.admin_alerts including all);
      create table if not exists dev.reports (like public.reports including all);
      create table if not exists dev.report_rate_limits (like public.report_rate_limits including all);
      create table if not exists dev.pending_syncs (like public.pending_syncs including all);

      alter table if exists public.sync_audit
        drop constraint if exists sync_audit_applied_by_email_canonical;
      alter table if exists public.app_settings
        drop constraint if exists app_settings_watched_folder_set_by_email_canonical,
        drop constraint if exists app_settings_pending_folder_set_by_email_canonical;
      alter table if exists public.deferred_ingestions
        drop constraint if exists deferred_ingestions_deferred_by_email_canonical;
      alter table if exists public.admin_alerts
        drop constraint if exists admin_alerts_resolved_by_email_canonical;
      alter table if exists public.reports
        drop constraint if exists reports_admin_reported_by_email_canonical;
      alter table if exists public.report_rate_limits
        drop constraint if exists report_rate_limits_admin_identity_email_canonical;
      alter table if exists public.pending_syncs
        drop constraint if exists pending_syncs_wizard_approved_by_email_canonical;

      alter table if exists dev.sync_audit
        drop constraint if exists sync_audit_applied_by_email_canonical;
      alter table if exists dev.app_settings
        drop constraint if exists app_settings_watched_folder_set_by_email_canonical,
        drop constraint if exists app_settings_pending_folder_set_by_email_canonical;
      alter table if exists dev.deferred_ingestions
        drop constraint if exists deferred_ingestions_deferred_by_email_canonical;
      alter table if exists dev.admin_alerts
        drop constraint if exists admin_alerts_resolved_by_email_canonical;
      alter table if exists dev.reports
        drop constraint if exists reports_admin_reported_by_email_canonical;
      alter table if exists dev.report_rate_limits
        drop constraint if exists report_rate_limits_admin_identity_email_canonical;
      alter table if exists dev.pending_syncs
        drop constraint if exists pending_syncs_wizard_approved_by_email_canonical;

      insert into public.app_settings (id) values ('default') on conflict do nothing;
      insert into dev.app_settings (id) values ('default') on conflict do nothing;

      insert into public.sync_audit (
        drive_file_id, applied_by, staged_id, triggered_review_items, reviewer_choices,
        derived_side_effects, parse_result_summary, staged_modified_time
      ) values (
        'email-backfill-public-sync', ' Admin.Sync@Example.COM ', gen_random_uuid(), '[]'::jsonb, '{}'::jsonb,
        '{}'::jsonb, '{}'::jsonb, now()
      );
      update public.app_settings
         set watched_folder_set_by_email = ' Admin.Watched@Example.COM ',
             pending_folder_set_by_email = ' Admin.Pending@Example.COM '
       where id = 'default';
      insert into public.deferred_ingestions (
        drive_file_id, deferred_kind, deferred_by_email
      ) values (
        'email-backfill-public-deferred', 'defer_until_modified', ' Admin.Deferred@Example.COM '
      );
      insert into public.admin_alerts (
        code, context, resolved_at, resolved_by
      ) values (
        'EMAIL_BACKFILL_PUBLIC_ALERT', '{}'::jsonb, now(), ' Admin.Alert@Example.COM '
      );
      insert into public.reports (
        reported_by_kind, reported_by, context
      ) values
        ('admin', ' Admin.Report@Example.COM ', '{}'::jsonb),
        ('crew', ' Crew.Report@Example.COM ', '{}'::jsonb);
      insert into public.report_rate_limits (
        kind, identity, hour_bucket
      ) values
        ('admin', ' Admin.Limit@Example.COM ', '2026-05-20T00:00:00Z'::timestamptz),
        ('crew', ' Crew.Limit@Example.COM ', '2026-05-20T00:00:00Z'::timestamptz);
      insert into public.pending_syncs (
        drive_file_id, staged_modified_time, parse_result, source_kind,
        wizard_session_id, wizard_approved, wizard_approved_by_email,
        wizard_approved_at, wizard_reviewer_choices, wizard_reviewer_choices_version,
        warning_summary
      ) values (
        'email-backfill-public-pending', now(), '{}'::jsonb, 'onboarding_scan',
        gen_random_uuid(), true, ' Admin.Wizard@Example.COM ',
        now(), '{}'::jsonb, 1, ''
      );

      insert into dev.sync_audit (
        drive_file_id, applied_by, staged_id, triggered_review_items, reviewer_choices,
        derived_side_effects, parse_result_summary, staged_modified_time
      ) values (
        'email-backfill-dev-sync', ' Dev.Sync@Example.COM ', gen_random_uuid(), '[]'::jsonb, '{}'::jsonb,
        '{}'::jsonb, '{}'::jsonb, now()
      );
      update dev.app_settings
         set watched_folder_set_by_email = ' Dev.Watched@Example.COM ',
             pending_folder_set_by_email = ' Dev.Pending@Example.COM '
       where id = 'default';
      insert into dev.deferred_ingestions (
        drive_file_id, deferred_kind, deferred_by_email
      ) values (
        'email-backfill-dev-deferred', 'defer_until_modified', ' Dev.Deferred@Example.COM '
      );
      insert into dev.admin_alerts (
        code, context, resolved_at, resolved_by
      ) values (
        'EMAIL_BACKFILL_DEV_ALERT', '{}'::jsonb, now(), ' Dev.Alert@Example.COM '
      );
      insert into dev.reports (
        reported_by_kind, reported_by, context
      ) values
        ('admin', ' Dev.Report@Example.COM ', '{}'::jsonb),
        ('crew', ' Dev.Crew.Report@Example.COM ', '{}'::jsonb);
      insert into dev.report_rate_limits (
        kind, identity, hour_bucket
      ) values
        ('admin', ' Dev.Limit@Example.COM ', '2026-05-20T00:00:00Z'::timestamptz),
        ('crew', ' Dev.Crew.Limit@Example.COM ', '2026-05-20T00:00:00Z'::timestamptz);
      insert into dev.pending_syncs (
        drive_file_id, staged_modified_time, parse_result, source_kind,
        wizard_session_id, wizard_approved, wizard_approved_by_email,
        wizard_approved_at, wizard_reviewer_choices, wizard_reviewer_choices_version,
        warning_summary
      ) values (
        'email-backfill-dev-pending', now(), '{}'::jsonb, 'onboarding_scan',
        gen_random_uuid(), true, ' Dev.Wizard@Example.COM ',
        now(), '{}'::jsonb, 1, ''
      );

      \\i supabase/migrations/20260520000911_add_email_canonical_checks.sql

      select jsonb_build_object(
        'public_sync_audit', (select applied_by from public.sync_audit where drive_file_id = 'email-backfill-public-sync'),
        'public_app_watched', (select watched_folder_set_by_email from public.app_settings where id = 'default'),
        'public_app_pending', (select pending_folder_set_by_email from public.app_settings where id = 'default'),
        'public_deferred', (select deferred_by_email from public.deferred_ingestions where drive_file_id = 'email-backfill-public-deferred'),
        'public_admin_alert', (select resolved_by from public.admin_alerts where code = 'EMAIL_BACKFILL_PUBLIC_ALERT'),
        'public_admin_report', (select reported_by from public.reports where reported_by_kind = 'admin' and reported_by ilike '%report@example.com%' order by created_at desc limit 1),
        'public_crew_report', (select reported_by from public.reports where reported_by_kind = 'crew' and reported_by ilike '%report@example.com%' order by created_at desc limit 1),
        'public_admin_limit', (select identity from public.report_rate_limits where kind = 'admin' and identity ilike '%limit@example.com%'),
        'public_crew_limit', (select identity from public.report_rate_limits where kind = 'crew' and identity ilike '%limit@example.com%'),
        'public_pending', (select wizard_approved_by_email from public.pending_syncs where drive_file_id = 'email-backfill-public-pending'),
        'dev_sync_audit', (select applied_by from dev.sync_audit where drive_file_id = 'email-backfill-dev-sync'),
        'dev_app_watched', (select watched_folder_set_by_email from dev.app_settings where id = 'default'),
        'dev_app_pending', (select pending_folder_set_by_email from dev.app_settings where id = 'default'),
        'dev_deferred', (select deferred_by_email from dev.deferred_ingestions where drive_file_id = 'email-backfill-dev-deferred'),
        'dev_admin_alert', (select resolved_by from dev.admin_alerts where code = 'EMAIL_BACKFILL_DEV_ALERT'),
        'dev_admin_report', (select reported_by from dev.reports where reported_by_kind = 'admin' and reported_by ilike '%dev.report@example.com%' order by created_at desc limit 1),
        'dev_crew_report', (select reported_by from dev.reports where reported_by_kind = 'crew' and reported_by ilike '%dev.crew.report@example.com%' order by created_at desc limit 1),
        'dev_admin_limit', (select identity from dev.report_rate_limits where kind = 'admin' and identity ilike '%dev.limit@example.com%'),
        'dev_crew_limit', (select identity from dev.report_rate_limits where kind = 'crew' and identity ilike '%dev.crew.limit@example.com%'),
        'dev_pending', (select wizard_approved_by_email from dev.pending_syncs where drive_file_id = 'email-backfill-dev-pending')
      )::text;

      rollback;
    `);

    expect(JSON.parse(output)).toEqual({
      public_sync_audit: "admin.sync@example.com",
      public_app_watched: "admin.watched@example.com",
      public_app_pending: "admin.pending@example.com",
      public_deferred: "admin.deferred@example.com",
      public_admin_alert: "admin.alert@example.com",
      public_admin_report: "admin.report@example.com",
      public_crew_report: " Crew.Report@Example.COM ",
      public_admin_limit: "admin.limit@example.com",
      public_crew_limit: " Crew.Limit@Example.COM ",
      public_pending: "admin.wizard@example.com",
      dev_sync_audit: "dev.sync@example.com",
      dev_app_watched: "dev.watched@example.com",
      dev_app_pending: "dev.pending@example.com",
      dev_deferred: "dev.deferred@example.com",
      dev_admin_alert: "dev.alert@example.com",
      dev_admin_report: "dev.report@example.com",
      dev_crew_report: " Dev.Crew.Report@Example.COM ",
      dev_admin_limit: "dev.limit@example.com",
      dev_crew_limit: " Dev.Crew.Limit@Example.COM ",
      dev_pending: "dev.wizard@example.com",
    });
  }, 15000);

  test("live project satisfies all seven AC-X.5 audit layers", () => {
    expect(auditLiveEmailCanonicalization()).toEqual([]);
  }, 15000);
});
