import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import { RETIRED_CODES, SPEC_CODES } from "@/lib/messages/__generated__/spec-codes";
import {
  auditNoRawCodesInSourceFiles,
  buildForbiddenCodeIndex,
  formatRawCodeViolation,
} from "@/tests/cross-cutting/no-raw-codes-audit";
import { extractInternalCodeEnums } from "@/scripts/extract-internal-code-enums";

const FIXTURE_ROOT = "tests/cross-cutting/fixtures/no-raw-codes";

function fixture(path: string): string {
  return `${FIXTURE_ROOT}/${path}`;
}

function audit(paths: string[]) {
  return auditNoRawCodesInSourceFiles(paths, buildForbiddenCodeIndex());
}

describe("AC-X.2 internal code enum manifest", () => {
  // extractInternalCodeEnums() now builds a full TypeScript program to resolve
  // parse-warning codes by type (~19s: ~11.7s construction, ~2.8s checker
  // warm-up, ~4.5s walk, over 2882 files). That is well inside vitest's 30s
  // default locally and over it on a CI runner — this test timed out at 34.7s.
  // Spec: docs/superpowers/specs/2026-08-03-parse-warning-code-recognizer-design.md §5.
  test(
    "committed manifest is generated from parser, sync-status, pending-ingestion, and admin-alert sources",
    { timeout: 180_000 },
    () => {
      const extracted = extractInternalCodeEnums();
      expect(extracted.UNKNOWN_FIELD?.source).toContain("parse_warnings.code");
      expect(extracted.UNKNOWN_ROLE_TOKEN?.source).toContain("parse_warnings.code");
      expect(extracted.pending_review?.source).toContain("shows.last_sync_status");
      expect(extracted.sheet_unavailable?.source).toContain("shows.last_sync_status");
      expect(extracted["MI-1_VERSION_DETECTION_FAILED"]?.source).toContain(
        "pending_ingestions.last_error_code",
      );
      expect(extracted.WIZARD_ISOLATION_INDEXES_MISSING?.source).toContain("admin_alerts.code");
      expect(INTERNAL_CODE_ENUMS).toEqual(extracted);
    },
  );

  test("forbidden set dedupes catalog, retired, and internal provenance", () => {
    const index = buildForbiddenCodeIndex();
    expect(index.get("SHEET_UNAVAILABLE")?.sources).toContain("catalog");
    expect(index.get("FIRST_SEEN_REVIEW")?.sources).toContain("retired");
    expect(index.get("UNKNOWN_FIELD")?.sources).toContain("parse_warnings.code");
    expect(index.get("SHEET_UNAVAILABLE")?.sources).toContain("catalog");
    expect(index.get("sheet_unavailable")?.sources).toContain("shows.last_sync_status");
    expect(Object.keys(SPEC_CODES).length).toBeGreaterThan(0);
    expect(Object.keys(RETIRED_CODES).length).toBeGreaterThan(0);
  });
});

describe("AC-X.2 AST audit fixtures", () => {
  test.each([
    ["bad-jsx-text-raw-code.tsx", "jsx-text"],
    ["bad-jsx-attr-string-literal.tsx", "jsx-attribute"],
    ["bad-jsx-attr-expression.tsx", "jsx-attribute"],
    ["bad-jsx-attr-template-literal.tsx", "jsx-attribute"],
  ])("fails %s via %s raw-code rendering", (file, expectedKind) => {
    const violations = audit([fixture(file)]);
    expect(violations.map((violation) => violation.kind)).toContain(expectedKind);
    expect(violations.map((violation) => violation.code)).toContain("SHEET_UNAVAILABLE");
  });

  test.each([
    "good-via-messageFor.tsx",
    "good-via-error-explainer.tsx",
    "good-via-help-affordance.tsx",
    "good-discriminated-union.tsx",
    "good-switch-case.tsx",
    "good-data-testid.tsx",
    "good-code-array.tsx",
    "good-set-error.tsx",
    "good-noncontrolled-input.tsx",
  ])("passes non-rendering discrimination fixture %s", (file) => {
    expect(audit([fixture(file)]).map(formatRawCodeViolation)).toEqual([]);
  });
});

describe("AC-X.2 repository audit", () => {
  test("app/components JSX surfaces do not render raw catalog, retired, or internal codes", () => {
    expect(
      auditNoRawCodesInSourceFiles(undefined, buildForbiddenCodeIndex()).map(
        formatRawCodeViolation,
      ),
    ).toEqual([]);
  });

  test("x2-no-raw-codes is wired as a named audit script and workflow job", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["gen:internal-code-enums"]).toBe(
      "tsx scripts/extract-internal-code-enums.ts",
    );
    expect(packageJson.scripts?.["test:audit:x2-no-raw-codes"]).toContain(
      "vitest run tests/cross-cutting/no-raw-codes.test.ts",
    );

    const workflowPath = ".github/workflows/x-audits.yml";
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("x2-no-raw-codes:");
    expect(workflow).toContain("pnpm test:audit:x2-no-raw-codes");
    expect(workflow).toContain("pnpm gen:internal-code-enums");
    expect(workflow).toContain(
      "name: x1-catalog-parity-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}",
    );
    expect(workflow).toContain(
      "name: x2-no-raw-codes-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}",
    );
  });
});
