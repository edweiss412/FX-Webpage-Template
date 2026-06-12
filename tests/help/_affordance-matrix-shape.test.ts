import { describe, expect, it } from "vitest";
import {
  AFFORDANCE_MATRIX,
  DEFERRED_TESTIDS,
  targetForErrorCode,
  testidForErrorCode,
} from "@/app/help/_affordanceMatrix";

const CONCRETE_TESTID_RE = /^help-affordance--[a-z0-9-]+--(tooltip|tour|learn-more|legend)$/;

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
      expect(row.owningMilestone, `${row.sourceSurface} owningMilestone`).toEqual(
        expect.any(String),
      );
      expect(["mobile", "desktop", "both"]).toContain(row.visibleAt);
      expect(testids.has(row.testid), `${row.testid} must be unique`).toBe(false);
      testids.add(row.testid);
    }
  });

  it("includes the ratified finite concrete rows and no parse-warning-row family", () => {
    const concreteTestids = AFFORDANCE_MATRIX.filter((row) => row.kind === "concrete")
      .map((row) => row.testid)
      .sort();

    expect(concreteTestids).toEqual(
      [
        "help-affordance--dashboard-active-shows--tooltip",
        "help-affordance--dashboard-archived-shows--tooltip",
        "help-affordance--dashboard-footer--tour",
        "help-affordance--dashboard-needs-attention--tooltip",
        "help-affordance--dashboard-restage--legend",
        "help-affordance--first-seen-review-card--tooltip",
        "help-affordance--needs-attention-page--tooltip",
        "help-affordance--per-show-alerts--tooltip",
        "help-affordance--per-show-crew--tooltip",
        "help-affordance--per-show-restage-card--tooltip",
        "help-affordance--per-show-sync-footer--tooltip",
        "help-affordance--preview-banner--tooltip",
        "help-affordance--settings-administrators--tooltip",
        "help-affordance--settings-drive-connection--tooltip",
        "help-affordance--settings-drive-health-badge--tooltip",
        "help-affordance--settings-preferences--tooltip",
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

  it("exports DEFERRED_TESTIDS containing exactly the two still-deferred rows", () => {
    expect([...DEFERRED_TESTIDS].sort()).toEqual([
      "help-affordance--per-show-restage-card--tooltip",
      "help-affordance--preview-banner--tooltip",
    ]);
    for (const id of DEFERRED_TESTIDS) {
      expect(
        AFFORDANCE_MATRIX.some((r) => r.kind === "concrete" && r.testid === id),
        `${id} must be a concrete matrix row`,
      ).toBe(true);
    }
  });

  it("pins the 19 concrete rows incl. renames and the legend row", () => {
    const concrete = AFFORDANCE_MATRIX.filter((r) => r.kind === "concrete");
    expect(concrete).toHaveLength(19);
    const ids = concrete.map((r) => r.testid);
    expect(ids).toContain("help-affordance--dashboard-restage--legend");
    expect(ids).toContain("help-affordance--dashboard-needs-attention--tooltip");
    expect(ids).not.toContain("help-affordance--dashboard-pending-ingestion--tooltip");
    expect(ids).not.toContain("help-affordance--dashboard-restage-badge--tooltip");
    expect(ids).not.toContain("help-affordance--per-show-sync-health--tooltip");
  });

  it("wizard step rows carry their ?step deep link in sourceRoute (no routeFor special case)", () => {
    const byId = new Map(
      AFFORDANCE_MATRIX.flatMap((r) => (r.kind === "concrete" ? [[r.testid, r] as const] : [])),
    );
    expect(byId.get("help-affordance--wizard-step2--tooltip")?.sourceRoute).toBe("/admin?step=2");
    expect(byId.get("help-affordance--wizard-step3--tooltip")?.sourceRoute).toBe("/admin?step=3");
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
    expect(targetForErrorCode("PARSE_ERROR_LAST_GOOD")).toBe("/help/errors#PARSE_ERROR_LAST_GOOD");
  });
});
