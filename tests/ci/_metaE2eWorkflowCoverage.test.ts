/**
 * tests/ci/_metaE2eWorkflowCoverage.test.ts
 *
 * Structural guard: a Playwright-project-matched e2e spec that NO automatic
 * PR workflow invokes is DARK - it exists, matches a testMatch, and proves
 * nothing (spec 2026-07-24-archive-row-menu-idiom §6 item 6; the class cost
 * review rounds R11-R16). Fails by default for NEW dark specs; the
 * pre-existing darkness is inventoried below with reasons, not silently
 * blessed.
 *
 * Guarantee scope (spec R18 honesty correction): "covered" means the spec
 * RUNS AND REPORTS on every PR. Branch protection requires only the `quality`
 * context (owner-directed solo posture, plans DEFERRED.md 2026-06-22 entry),
 * so GitHub-enforced merge blocking is out of any scanner's reach; the ship
 * pipeline's all-checks-green gate is the procedural enforcement.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanWorkflowCoverage } from "./_workflowCoverageScan";

const ROOT = process.cwd();

/** Deliberately-not-PR-gated specs. Every row carries a reason or backlog ref.
 *  The stale-row assertion below flags rows for deleted specs; the shadowing
 *  assertion flags rows whose spec became covered. Populated from the scan
 *  output at introduction time (all pre-existing; BL-E2E-LIFECYCLE-SPECS-CI-DARK
 *  is the umbrella work item for wiring them). */
const PATH_GATED =
  "path-gated PR workflow (runs when its filter matches, not PR-blocking-capable per the scanner contract); BL-E2E-LIFECYCLE-SPECS-CI-DARK umbrella";
const UNSEEN =
  "not named in any workflow run command (project-only --project runs are invisible to the scanner, or no workflow runs it); BL-E2E-LIFECYCLE-SPECS-CI-DARK umbrella";
const LOCAL_ONLY_ALLOWLIST: Record<string, string> = {
  "tests/e2e/admin-changes-feed-layout.spec.ts": UNSEEN,
  "tests/e2e/admin-dev.spec.ts": UNSEEN,
  "tests/e2e/admin-layout-dimensions.spec.ts": UNSEEN,
  "tests/e2e/admin-layout.spec.ts": UNSEEN,
  "tests/e2e/admin-lifecycle-transitions.spec.ts": UNSEEN,
  "tests/e2e/admin-nav-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/admin-parse-panel.spec.ts": UNSEEN,
  "tests/e2e/admin-phase2-surfaces.spec.ts": UNSEEN,
  "tests/e2e/admin-route-boundaries.spec.ts": UNSEEN,
  "tests/e2e/admin-settings-admins-refresh.spec.ts": UNSEEN,
  "tests/e2e/agendaBreakdown.layout.spec.ts": UNSEEN,
  "tests/e2e/agendaScheduleLayout.spec.ts": UNSEEN,
  "tests/e2e/appHealthIndicator.layout.spec.ts": UNSEEN,
  "tests/e2e/attention-anchor-placement.spec.ts": PATH_GATED,
  "tests/e2e/attention-modal-gallery.spec.ts": UNSEEN,
  "tests/e2e/attention-pill-focus.spec.ts": UNSEEN,
  "tests/e2e/autoAppliedCardGrid.layout.spec.ts": UNSEEN,
  "tests/e2e/bell-panel-layout.spec.ts": PATH_GATED,
  "tests/e2e/blocked-row-resolver-transitions.spec.ts": UNSEEN,
  "tests/e2e/bulk-ignore-eyebrow.layout.spec.ts": UNSEEN,
  "tests/e2e/collapse-panel-morph.spec.ts": UNSEEN,
  "tests/e2e/compact-alert-card-layout.spec.ts": UNSEEN,
  "tests/e2e/crew-layout-dimensions.spec.ts": UNSEEN,
  "tests/e2e/crew-page.spec.ts": UNSEEN,
  "tests/e2e/crew-section-toggle.spec.ts": PATH_GATED,
  "tests/e2e/dataQualityBadge.layout.spec.ts": UNSEEN,
  "tests/e2e/deep-link-walker.spec.ts": UNSEEN,
  "tests/e2e/dev-capture.spec.ts": UNSEEN,
  "tests/e2e/developer-tier.spec.ts": UNSEEN,
  "tests/e2e/developer-toggle-layout.spec.ts": UNSEEN,
  "tests/e2e/empty-state-reachability.spec.ts": UNSEEN,
  "tests/e2e/empty-state.spec.ts": UNSEEN,
  "tests/e2e/help-auth.spec.ts": UNSEEN,
  "tests/e2e/help-mobile.spec.ts": UNSEEN,
  "tests/e2e/help-pages.spec.ts": UNSEEN,
  "tests/e2e/help-screenshots-clock-pipeline.spec.ts": UNSEEN,
  "tests/e2e/help-typography.spec.ts": UNSEEN,
  "tests/e2e/hoverhelp-geometry.spec.ts": PATH_GATED,
  "tests/e2e/layout-dimensions.spec.ts": UNSEEN,
  "tests/e2e/me-page.spec.ts": UNSEEN,
  "tests/e2e/needs-attention-page.spec.ts": UNSEEN,
  "tests/e2e/no-raw-codes.spec.ts": UNSEEN,
  "tests/e2e/notes-tile.spec.ts": UNSEEN,
  "tests/e2e/notify-toggles.spec.ts": UNSEEN,
  "tests/e2e/onboarding-wizard-step1.spec.ts": UNSEEN,
  "tests/e2e/pack-list.spec.ts": UNSEEN,
  "tests/e2e/packlist-rescan-recovery.spec.ts": UNSEEN,
  "tests/e2e/pendingDiscardReflow.layout.spec.ts": UNSEEN,
  "tests/e2e/picker-flow.spec.ts": UNSEEN,
  "tests/e2e/published-review-modal.closeFreshness.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.crew-actions.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.deeplink.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.interactions.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.layout.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.prefetch.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.realtime.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.reopen.spec.ts": PATH_GATED,
  "tests/e2e/published-show-attention.spec.ts": UNSEEN,
  "tests/e2e/report-modal.spec.ts": UNSEEN,
  "tests/e2e/resolve-label-layout.spec.ts": UNSEEN,
  "tests/e2e/right-now-transitions.spec.ts": UNSEEN,
  "tests/e2e/right-now.spec.ts": UNSEEN,
  "tests/e2e/role-spoof.spec.ts": UNSEEN,
  "tests/e2e/roles-settings-layout.spec.ts": UNSEEN,
  "tests/e2e/root-landing.spec.ts": UNSEEN,
  "tests/e2e/sample.spec.ts": UNSEEN,
  "tests/e2e/schedule-tile.spec.ts": UNSEEN,
  "tests/e2e/screenshots-help-capture.spec.ts": UNSEEN,
  "tests/e2e/sign-in-page.spec.ts": UNSEEN,
  "tests/e2e/skeletonBandParity.spec.ts": PATH_GATED,
  "tests/e2e/source-link-dimensional.spec.ts": UNSEEN,
  // Landed on main via the sibling strip-mobile-stacked-band branch while this
  // guard was in flight - part of the pre-existing inventory, not a post-guard
  // regression.
  "tests/e2e/stackedBandLayout.spec.ts": UNSEEN,
  "tests/e2e/stage-restricted-crew-schedule.spec.ts": UNSEEN,
  "tests/e2e/status-financials.spec.ts": UNSEEN,
  "tests/e2e/statusStripToggleLayout.spec.ts": PATH_GATED,
  "tests/e2e/step3-review-modal.interactions.spec.ts": PATH_GATED,
  "tests/e2e/step3-review-modal.layout.spec.ts": PATH_GATED,
  "tests/e2e/step3-review-page.layout.spec.ts": UNSEEN,
  "tests/e2e/step3-schedule-bookend-layout.spec.ts": UNSEEN,
  "tests/e2e/telemetry-layout.spec.ts": UNSEEN,
  "tests/e2e/theme-toggle.spec.ts": UNSEEN,
  "tests/e2e/toggle-edge-layout.spec.ts": UNSEEN,
  "tests/e2e/transport-tile.spec.ts": UNSEEN,
  "tests/e2e/warning-panel-polish.spec.ts": UNSEEN,
  "tests/e2e/wizard-blocker-modal.layout.spec.ts": UNSEEN,
};

describe("e2e workflow coverage (spec §6 item 6)", () => {
  const workflows = Object.fromEntries(
    readdirSync(join(ROOT, ".github/workflows"))
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => [f, readFileSync(join(ROOT, ".github/workflows", f), "utf8")]),
  );
  const packageScripts = (
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;
  const specs = readdirSync(join(ROOT, "tests/e2e"))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => `tests/e2e/${f}`);

  const { covered } = scanWorkflowCoverage({ workflows, packageScripts });

  it("every e2e spec is PR-covered or reason-allowlisted", () => {
    const dark = specs.filter((s) => !covered.has(s) && !(s in LOCAL_ONLY_ALLOWLIST));
    expect(dark, "dark specs - wire a workflow or add a reasoned allowlist row").toEqual([]);
  });

  it("the allowlist carries no stale or shadowing rows", () => {
    const stale = Object.keys(LOCAL_ONLY_ALLOWLIST).filter((s) => !specs.includes(s));
    expect(stale, "allowlist rows for deleted specs").toEqual([]);
    const shadowing = Object.keys(LOCAL_ONLY_ALLOWLIST).filter((s) => covered.has(s));
    expect(shadowing, "allowlisted specs that ARE covered - remove the row").toEqual([]);
  });

  it("the lifecycle layout spec is covered by lifecycle-layout-e2e.yml (not allowlisted)", () => {
    expect(covered.has("tests/e2e/admin-lifecycle-layout.spec.ts")).toBe(true);
  });
});

describe("the scanner itself (self-tests - a guard that matches nothing is worse than none)", () => {
  const spec = "tests/e2e/foo.spec.ts";
  const base = (trigger: string, extra: string, run: string) =>
    `name: x\non:\n${trigger}\njobs:\n  j:\n    runs-on: ubuntu-latest\n${extra}    steps:\n      - run: ${run}\n`;
  const S = (w: string, scripts: Record<string, string> = {}) =>
    scanWorkflowCoverage({ workflows: { "w.yml": w }, packageScripts: scripts });

  it("counts a clean pull_request workflow with an INLINE `- run:` invocation", () => {
    const r = S(
      base("  pull_request:\n  workflow_dispatch:", "", `pnpm exec playwright test ${spec}`),
    );
    expect(r.covered.has(spec)).toBe(true);
  });
  it("counts the two-line `- name:` + `run:` step form (the shape real workflows here use)", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Run e2e\n        run: pnpm exec playwright test ${spec}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(true);
  });
  it("resolves a pnpm script alias through package.json", () => {
    const r = S(base("  pull_request:", "", "pnpm test:e2e:foo"), {
      "test:e2e:foo": `playwright test ${spec}`,
    });
    expect(r.covered.has(spec)).toBe(true);
  });
  it("rejects workflow_dispatch-only", () => {
    const r = S(base("  workflow_dispatch:", "", `playwright test ${spec}`));
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe("no pull_request trigger");
  });
  it("rejects push-only", () => {
    const r = S(base("  push:\n    branches: [main]", "", `playwright test ${spec}`));
    expect(r.rejected[0]!.reason).toBe("no pull_request trigger");
  });
  it("rejects a pull_request.paths filter (spec-file-only filters included)", () => {
    const r = S(
      base(`  pull_request:\n    paths:\n      - "${spec}"`, "", `playwright test ${spec}`),
    );
    expect(r.rejected[0]!.reason).toBe("pull_request.paths filter");
  });
  it("rejects a job-level if:", () => {
    const r = S(base("  pull_request:", "    if: false\n", `playwright test ${spec}`));
    expect(r.rejected[0]!.reason).toBe("if: condition present");
  });
  it("rejects an INLINE `- if:` on the run step (marker-normalized)", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - if: failure()\n        run: playwright test ${spec}\n`;
    const r = S(w);
    expect(r.rejected[0]!.reason).toBe("if: condition present");
  });
  it("rejects an own-line if: on the run step", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: gated\n        if: github.event_name == 'push'\n        run: playwright test ${spec}\n`;
    const r = S(w);
    expect(r.rejected[0]!.reason).toBe("if: condition present");
  });
  it("a diagnostic if: failure() on a SIBLING step does not disqualify the run (R1 blocking fix)", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: playwright test ${spec}\n      - if: failure()\n        uses: actions/upload-artifact@v4\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(true);
  });
  it("a paths: under push: does not flag an unfiltered pull_request (R1 medium fix)", () => {
    const w = `name: x\non:\n  pull_request:\n  push:\n    paths:\n      - "lib/**"\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: playwright test ${spec}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(true);
  });
  it("rejects continue-on-error", () => {
    const r = S(
      base("  pull_request:", "    continue-on-error: true\n", `playwright test ${spec}`),
    );
    expect(r.rejected[0]!.reason).toBe("continue-on-error");
  });
  it("rejects exit-code suppression", () => {
    const r = S(base("  pull_request:", "", `playwright test ${spec} || true`));
    expect(r.rejected[0]!.reason).toBe("exit-code suppression");
  });
});
