import { describe, expect, it } from "vitest";
import {
  AFFORDANCE_MATRIX,
  targetForErrorCode,
  testidForErrorCode,
} from "@/app/help/_affordanceMatrix";

const CONCRETE_TESTID_RE = /^help-affordance--[a-z0-9-]+--(tooltip|tour|learn-more)$/;

describe("app/help/_affordanceMatrix.ts shape", () => {
  it("is non-empty", () => {
    expect(Array.isArray(AFFORDANCE_MATRIX)).toBe(true);
    expect(AFFORDANCE_MATRIX.length).toBeGreaterThan(0);
  });

  it("declares every concrete-testid row with a valid route, testid, and target", () => {
    const concreteRows = AFFORDANCE_MATRIX.filter((row) => row.kind === "concrete");
    expect(concreteRows.length).toBeGreaterThan(0);

    const testids = new Set<string>();
    for (const row of concreteRows) {
      expect(row.sourceSurface, "sourceSurface").toEqual(expect.any(String));
      expect(row.sourceRoute, `${row.sourceSurface} sourceRoute`).toMatch(/^\/.+/);
      expect(row.affordance, `${row.sourceSurface} affordance`).toEqual(expect.any(String));
      expect(row.testid, `${row.sourceSurface} testid`).toMatch(CONCRETE_TESTID_RE);
      expect(row.target, `${row.sourceSurface} target`).toMatch(/^\/help(?:\/|$)/);
      expect(row.owningMilestone, `${row.sourceSurface} owningMilestone`).toEqual(expect.any(String));
      expect(testids.has(row.testid), `${row.testid} must be unique`).toBe(false);
      testids.add(row.testid);
    }
  });

  it("includes the ratified finite concrete rows and no parse-warning-row family", () => {
    const concreteTestids = AFFORDANCE_MATRIX
      .filter((row) => row.kind === "concrete")
      .map((row) => row.testid)
      .sort();

    expect(concreteTestids).toEqual(
      [
        "help-affordance--dashboard-active-shows--tooltip",
        "help-affordance--dashboard-footer--tour",
        "help-affordance--dashboard-pending-ingestion--tooltip",
        "help-affordance--dashboard-restage-badge--tooltip",
        "help-affordance--first-seen-review-card--tooltip",
        "help-affordance--per-show-parse-warnings--tooltip",
        "help-affordance--per-show-preview-links--tooltip",
        "help-affordance--per-show-restage-card--tooltip",
        "help-affordance--per-show-sync-health--tooltip",
        "help-affordance--preview-banner--tooltip",
        "help-affordance--wizard-step1--tooltip",
        "help-affordance--wizard-step2--tooltip",
        "help-affordance--wizard-step3--tooltip",
      ].sort(),
    );

    expect(
      concreteTestids.some((testid) => testid.includes("parse-warning-row")),
      "Amendment 1 folds per-code parse warnings into the error-message template family",
    ).toBe(false);
  });

  it("declares exactly one template-family row for messageFor(code) errors", () => {
    const templateRows = AFFORDANCE_MATRIX.filter((row) => row.kind === "template-family");

    expect(templateRows).toHaveLength(1);
    expect(templateRows[0]).toMatchObject({
      sourceSurface: expect.stringContaining("messageFor(code)"),
      sourceRoute: expect.stringMatching(/^\/admin(?:\/|$)/),
      affordance: "Learn more →",
      testidPattern: "help-affordance--error-message--<code>--learn-more",
      targetPattern: "/help/errors#<code>",
      owningMilestone: expect.any(String),
    });
  });

  it("declares exactly one negative crew-row assertion", () => {
    const negativeRows = AFFORDANCE_MATRIX.filter((row) => row.kind === "negative");

    expect(negativeRows).toHaveLength(1);
    expect(negativeRows[0]).toMatchObject({
      sourceSurface: expect.stringContaining("Crew page"),
      // M11.5 R3 fix: crew route is /show/<slug>/<shareToken> (P-R12).
      // validateNextParam.ts:13-16 rejects slug-only crew next targets;
      // matrix must document the tokenized form so the negative assertion
      // pins the live route shape, not the retired one.
      sourceRoute: expect.stringMatching(/^\/show\/[^/]+\/[^/]+$/),
      assertion: expect.stringContaining("help-affordance--"),
    });
  });

  it("exports error-code helpers used by the deep-link walker", () => {
    expect(testidForErrorCode("PARSE_ERROR_LAST_GOOD")).toBe(
      "help-affordance--error-message--parse-error-last-good--learn-more",
    );
    expect(targetForErrorCode("PARSE_ERROR_LAST_GOOD")).toBe(
      "/help/errors#PARSE_ERROR_LAST_GOOD",
    );
  });
});
