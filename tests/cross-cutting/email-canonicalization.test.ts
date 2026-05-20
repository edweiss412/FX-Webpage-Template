import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { EMAIL_BOUNDARIES } from "@/lib/audit/email-boundaries.generated";
import {
  auditEmailCanonicalizationSources,
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

  test("parser layer requires canonicalize before emitted email fields", () => {
    // Failure mode: parser emits `email: rawCell`, bypassing the only allowed raw-email helper.
    expectFixtureFail("bad-parser-raw-email.ts.fixture", /raw_email_assignment:.*email/);
    expectFixturePass("good-canonicalized-parser.ts.fixture");
  });

  test("DB write layer requires defensive canonicalization at email persistence sinks", () => {
    // Failure mode: DB helper trusts upstream parser/auth canonicalization and inserts raw email.
    expectFixtureFail("bad-db-insert-raw-email.ts.fixture", /raw_email_db_write:.*crew_members\.email/);
    expectFixturePass("good-canonicalized-db-write.ts.fixture");
  });

  test("admin_alerts.context layer recursively rejects raw email JSONB fields", () => {
    // Failure mode: nested JSONB email fields bypass column-level CHECK constraints.
    expectFixtureFail("bad-jsonb-context-raw-email.ts.fixture", /raw_email_jsonb_context:.*matchedEmail/);
    expectFixturePass("good-canonicalized-jsonb-context.ts.fixture");
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

  test("inline-normalization fixture proves the defense-in-depth guard sees forbidden chains", () => {
    // Failure mode: a parallel .toLowerCase().trim() branch creeps in beside canonicalize().
    expectFixtureFail("bad-inline-toLowerCase.ts.fixture", /inline_email_normalization/);
  });

  test("live project satisfies all seven AC-X.5 audit layers", () => {
    expect(auditLiveEmailCanonicalization()).toEqual([]);
  }, 15000);
});
