import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  auditTraceability,
  generateTraceability,
  parseAcRequiredCheckFindings,
  parseWorkflowFindings,
} from "@/scripts/generate-traceability";

const SPEC_PATH = "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md";
const PLAN_PATH = "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md";
const WORKFLOW_PATH = ".github/workflows/x-audits.yml";

function fixture(name: string): string {
  return readFileSync(`tests/cross-cutting/fixtures/traceability/${name}`, "utf8");
}

describe("X.6 traceability matrix", () => {
  test("structured coverage markers are authoritative; free-form prose mentions do not satisfy mapping", () => {
    const spec = fixture("spec-with-spec-id.md");
    const plan = fixture("plan-freeform-mention.md");

    const matrix = generateTraceability({ spec, plan });

    expect(matrix.rows.find((row) => row.anchor === "-parsedsheet-parseresult-split")?.status).toBe(
      "MISSING",
    );

    const mapped = generateTraceability({ spec, plan: fixture("plan-explicit-coverage.md") });
    expect(mapped.rows.find((row) => row.anchor === "-parsedsheet-parseresult-split")?.status).toBe(
      "planned",
    );
  });

  test("unknown coverage markers fail with named MISSING_ANCHOR findings", () => {
    const matrix = generateTraceability({
      spec: fixture("spec-with-spec-id.md"),
      plan: fixture("plan-missing-anchor.md"),
    });

    expect(matrix.findings).toContain("MISSING_ANCHOR:not-in-spec");
  });

  test("live project traceability and cross-cutting parity checks are clean", () => {
    const findings = auditTraceability({
      specPath: SPEC_PATH,
      planPath: PLAN_PATH,
      workflowPath: WORKFLOW_PATH,
    });

    expect(findings).toEqual([]);
  });

  test("AC body versus required-check list drift is detected with a named diff", () => {
    const spec = readFileSync(SPEC_PATH, "utf8").replace(
      /x5-email-canonicalization/g,
      "x5-rls-coverage",
    );

    expect(parseAcRequiredCheckFindings(spec)).toContain(
      "+ac_body_list_drift:AC-X.5 expected=x5-email-canonicalization actual=x5-rls-coverage",
    );
  });

  test("workflow parity rejects pull_request_target and privileged secrets in the reader job", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8")
      .replace("pull_request:", "pull_request_target:")
      .replace("GH_TOKEN: ${{ github.token }}", "GH_TOKEN: ${{ secrets.GH_APP_TOKEN }}")
      .replace(
        /(verify-branch-protection-status:\n(?:\s*#.*\n)*)\s*if:\s*false\s*\n/,
        "$1",
      ); // simulate reader re-enabled; remove when X6-D-1 closes

    expect(parseWorkflowFindings(workflow)).toEqual(
      expect.arrayContaining([
        "+pull_request_target_used",
        "+reader_uses_secret:GH_TOKEN",
      ]),
    );
  });
});
