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
        "help-affordance--dashboard-recently-auto-applied--tooltip",
        "help-affordance--dashboard-restage--legend",
        "help-affordance--first-seen-review-card--tooltip",
        "help-affordance--ignored-sheets-page--tooltip",
        "help-affordance--needs-attention-page--tooltip",
        "help-affordance--per-show-alerts--tooltip",
        // per-show-crew / per-show-data-quality / per-show-sync-footer RETIRED by Task 16
        // (impeccable) — the consolidated-admin-show-page rebuild dissolved their host
        // sections; their "?" tooltips are not re-homed (crew: preview-as help is served by
        // the preview-banner affordance; sync: hover-only in a slim strip; data-quality: the
        // sibling per-show-alerts tooltip already covers /help/admin/parse-warnings). The help
        // TARGET pages stay live. See DEFERRED.md CASP-1 (resolved-retired).
        "help-affordance--preview-banner--tooltip",
        "help-affordance--settings-administrators--tooltip",
        "help-affordance--settings-drive-connection--tooltip",
        "help-affordance--settings-drive-health-badge--tooltip",
        "help-affordance--settings-maintenance--tooltip",
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

  it("exports DEFERRED_TESTIDS containing the still-deferred rows", () => {
    // preview-banner (M11-G-D-3) remains deferred-pending-build. Task 16 (impeccable)
    // RETIRED the three per-show Crew / Sync-footer / Data-quality tooltips deferred by
    // Task 13 — their host sections were dissolved by the consolidated-show-page rebuild
    // and the critique gate ruled none should be re-homed (DEFERRED.md CASP-1 resolved).
    // So only preview-banner stays deferred.
    expect([...DEFERRED_TESTIDS].sort()).toEqual(
      ["help-affordance--preview-banner--tooltip"].sort(),
    );
    for (const id of DEFERRED_TESTIDS) {
      expect(
        AFFORDANCE_MATRIX.some((r) => r.kind === "concrete" && r.testid === id),
        `${id} must be a concrete matrix row`,
      ).toBe(true);
    }
  });

  it("pins the 19 concrete rows incl. renames, the legend row, and the step-3 redesign views", () => {
    const concrete = AFFORDANCE_MATRIX.filter((r) => r.kind === "concrete");
    // 20 base + 2 step-3 redesign views (Unpublished / Ignored sheets) − 1 removed
    // per-show re-stage tooltip (moot since Phase 6 swapped that mount for ChangesFeed)
    // + 1 per-show Data-quality panel tooltip (parse-data-quality-warnings)
    // − 1 removed Unpublished (Held shows) page (folded into the dashboard list)
    // − 3 per-show Crew / Sync-footer / Data-quality tooltips RETIRED by Task 16
    //   (impeccable) when the consolidated-show-page rebuild dissolved their sections.
    // + 1 recently-auto-applied strip header help (2026-07-17 header parity).
    expect(concrete).toHaveLength(19);
    const ids = concrete.map((r) => r.testid);
    expect(ids).not.toContain("help-affordance--per-show-data-quality--tooltip");
    expect(ids).not.toContain("help-affordance--per-show-crew--tooltip");
    expect(ids).not.toContain("help-affordance--per-show-sync-footer--tooltip");
    expect(ids).toContain("help-affordance--settings-maintenance--tooltip");
    expect(ids).toContain("help-affordance--dashboard-restage--legend");
    expect(ids).toContain("help-affordance--dashboard-needs-attention--tooltip");
    expect(ids).not.toContain("help-affordance--unpublished-page--tooltip");
    expect(ids).toContain("help-affordance--ignored-sheets-page--tooltip");
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
