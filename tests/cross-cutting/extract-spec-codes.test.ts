import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { extractSpecCodesFromMarkdown } from "@/scripts/extract-spec-codes";

const fixtureDir = "tests/cross-cutting/fixtures/extract-spec-codes";

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

describe("§12.4 spec-code extractor", () => {
  test("emits the four-field payload for active rows and omits helpfulContext for admin-log-only rows", () => {
    const result = extractSpecCodesFromMarkdown(fixture("good-complete.md"), {
      sourcePath: "good-complete.md",
      validateRenderedHelpfulContext: false,
    });

    expect(result.specCodes).toEqual({
      SHEET_UNAVAILABLE: {
        dougFacing: "Doug copy.",
        crewFacing: "Crew copy.",
        followUp: "Doug → fix sheet",
        helpfulContext: "Helpful context.",
      },
      ADMIN_LOG_ONLY: {
        dougFacing: null,
        crewFacing: null,
        followUp: null,
        helpfulContext: null,
      },
    });
    expect(result.retiredCodes).toEqual({
      OAUTH_STATE_INVALID: {
        replacedBy: "OAUTH_STATE_INVALID",
        retiredIn: "§12.4",
        variant: "operator-log-only variant",
      },
    });
  });

  test("fails when a Doug-facing row is missing helpfulContext", () => {
    expect(() =>
      extractSpecCodesFromMarkdown(fixture("bad-missing-helpful-context.md"), {
        sourcePath: "bad-missing-helpful-context.md",
        validateRenderedHelpfulContext: false,
      }),
    ).toThrow(
      "§12.4 helpfulContext appendix missing entry for code SHEET_UNAVAILABLE (dougFacing is non-null)",
    );
  });

  test("fails when the helpfulContext appendix references an unknown code", () => {
    expect(() =>
      extractSpecCodesFromMarkdown(fixture("bad-orphan-yaml-key.md"), {
        sourcePath: "bad-orphan-yaml-key.md",
        validateRenderedHelpfulContext: false,
      }),
    ).toThrow(/^§12\.4 helpfulContext appendix references unknown code ORPHAN_CODE$/);
  });

  test("fails when an admin-log-only row has helpfulContext", () => {
    expect(() =>
      extractSpecCodesFromMarkdown(fixture("bad-yaml-entry-for-null-dougfacing.md"), {
        sourcePath: "bad-yaml-entry-for-null-dougfacing.md",
        validateRenderedHelpfulContext: false,
      }),
    ).toThrow(
      "§12.4 helpfulContext appendix has entry for code ADMIN_LOG_ONLY whose dougFacing is null",
    );
  });

  test("fails on pseudo-null sentinel prose instead of the em-dash/null convention", () => {
    expect(() =>
      extractSpecCodesFromMarkdown(fixture("bad-pseudo-null-sentinel.md"), {
        sourcePath: "bad-pseudo-null-sentinel.md",
        validateRenderedHelpfulContext: false,
      }),
    ).toThrow(
      "§12.4 row uses pseudo-null sentinel 'none' for code ADMIN_LOG_ONLY; use '—' (em-dash) or empty cell per §12.4 Conventions",
    );
  });

  test("fails duplicate active codes with differing full payloads", () => {
    expect(() =>
      extractSpecCodesFromMarkdown(fixture("bad-duplicate-active-code.md"), {
        sourcePath: "bad-duplicate-active-code.md",
        validateRenderedHelpfulContext: false,
      }),
    ).toThrow(/SPEC_DUPLICATE_ACTIVE_CODE[\s\S]*SHEET_UNAVAILABLE[\s\S]*dougFacing/);
  });

  test("detects rendered Doug-facing messageFor sites across multiline argument lists", () => {
    expect(() =>
      extractSpecCodesFromMarkdown(fixture("bad-rendered-multiline-messagefor.md"), {
        sourcePath: "bad-rendered-multiline-messagefor.md",
        renderedContextRoots: ["tests/cross-cutting/fixtures/extract-spec-codes/rendered-sites"],
        validateRenderedHelpfulContext: true,
      }),
    ).toThrow(
      /§12\.4 helpfulContext appendix missing entry for SHOW_VERSION_AUTH_FAILED; the code is rendered to Doug via messageFor at .*multiline-messageFor\.ts:4/,
    );
  });
});
