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
 * RUNS AND REPORTS on every PR — NOT that GitHub will block a merge on it.
 *
 * The claim that "branch protection requires only the `quality` context" was
 * STALE and is corrected here: measured 2026-07-26, the live required set
 * holds TWELVE contexts. The e2e jobs are advisory not because one context is
 * required, but because none of them is in that set. Merge blocking is out of
 * any scanner's reach either way; the ship pipeline's all-checks-green gate is
 * the procedural enforcement. Measurement: spec
 * docs/superpowers/specs/ci/2026-07-26-ci-dark-coverage-design.md §2.5.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanWorkflowCoverage } from "./_workflowCoverageScan";
import { listedSpecFiles } from "./_standaloneConfigProbe";

const ROOT = process.cwd();

/** Deliberately-not-PR-gated specs. Every row carries a reason or backlog ref.
 *  The stale-row assertion below flags rows for deleted specs; the shadowing
 *  assertion flags rows whose spec became covered. Populated from the scan
 *  output at introduction time (all pre-existing; BL-E2E-LIFECYCLE-SPECS-CI-DARK
 *  is the umbrella work item for wiring them). */
const PATH_GATED =
  "path-gated PR workflow (runs when its filter matches, not PR-blocking-capable per the scanner contract); BL-E2E-LIFECYCLE-SPECS-CI-DARK umbrella";
const PATH_GATED_BY_EXCLUSION =
  "path-gated by EXCLUSION (pull_request.paths-ignore, so it runs unless the change touches only prose no script reads — NOT docs/, which prebuild reads; broader than an allow-list, still not PR-blocking-capable per the scanner contract); BL-E2E-LIFECYCLE-SPECS-CI-DARK umbrella";
const UNSEEN =
  "not named in any workflow run command (project-only --project runs are invisible to the scanner, or no workflow runs it); BL-E2E-LIFECYCLE-SPECS-CI-DARK umbrella";
const LOCAL_ONLY_GALLERY_CAPTURE =
  "local review artifact by design - the gallery capture sweep runs only via pnpm screenshot:gallery; no CI job, no committed baselines (docs/superpowers/specs/2026-07-26-gallery-screenshot-capture-design.md section 1.1)";
const LOCAL_ONLY_ALLOWLIST: Record<string, string> = {
  "tests/e2e/screenshots-gallery-capture.spec.ts": LOCAL_ONLY_GALLERY_CAPTURE,
  "tests/e2e/admin-changes-feed-layout.spec.ts": UNSEEN,
  "tests/e2e/admin-dev.spec.ts": UNSEEN,
  "tests/e2e/admin-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/admin-layout.spec.ts": UNSEEN,
  "tests/e2e/admin-nav-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/admin-lifecycle-transitions.spec.ts":
    "NOT wired 2026-07-26 by MEASUREMENT, not neglect: spec §6.1 sets acceptance at five consecutive green runs and pre-ratifies staying dark otherwise (an admitted flake is worse than a known gap). Best measured 4/5 locally, plus one real-CI failure on the Published-toggle round-trip (Expected false, Received true after 30s). Its two DETERMINISTIC breaks ARE fixed in that PR — a retired-testid assertion and an unreachable compound case — and the pre-hydration swallow is repaired, so what remains is one flaky case rather than a spec that failed every run. BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE",
  "tests/e2e/admin-parse-panel.spec.ts": UNSEEN,
  "tests/e2e/admin-phase2-surfaces.spec.ts": UNSEEN,
  "tests/e2e/admin-route-boundaries.spec.ts": UNSEEN,
  "tests/e2e/admin-settings-admins-refresh.spec.ts": UNSEEN,
  "tests/e2e/attention-modal-gallery.spec.ts":
    "runs in dev-gate-e2e.yml, which is workflow_dispatch + DAILY SCHEDULE (2026-07-26). A schedule is not PR-blocking-capable per the scanner contract, so this row stays — but the spec is no longer unrun: a break is now bounded to 24h instead of until someone remembers to dispatch. Three serialized cold builds make a per-PR trigger too heavy; ratified B1-D4. BL-DEV-GATE-GALLERY-SPEC-ROT",
  "tests/e2e/bell-panel-layout.spec.ts": PATH_GATED,
  "tests/e2e/crew-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/crew-section-toggle.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/crew-page.spec.ts": UNSEEN,
  "tests/e2e/deep-link-walker.spec.ts": UNSEEN,
  "tests/e2e/dev-capture.spec.ts": UNSEEN,
  "tests/e2e/developer-tier.spec.ts": UNSEEN,
  "tests/e2e/empty-state-reachability.spec.ts": UNSEEN,
  "tests/e2e/empty-state.spec.ts": UNSEEN,
  "tests/e2e/help-auth.spec.ts": UNSEEN,
  "tests/e2e/help-mobile.spec.ts": UNSEEN,
  "tests/e2e/help-pages.spec.ts": UNSEEN,
  "tests/e2e/help-screenshots-clock-pipeline.spec.ts": UNSEEN,
  "tests/e2e/help-typography.spec.ts": UNSEEN,
  "tests/e2e/layout-dimensions.spec.ts": UNSEEN,
  "tests/e2e/me-page.spec.ts": UNSEEN,
  "tests/e2e/needs-attention-page.spec.ts": UNSEEN,
  "tests/e2e/no-raw-codes.spec.ts": UNSEEN,
  "tests/e2e/notes-tile.spec.ts": UNSEEN,
  "tests/e2e/notify-toggles.spec.ts": UNSEEN,
  "tests/e2e/onboarding-wizard-step1.spec.ts": UNSEEN,
  "tests/e2e/pack-list.spec.ts": UNSEEN,
  "tests/e2e/packlist-rescan-recovery.spec.ts": UNSEEN,
  "tests/e2e/picker-flow.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/published-review-modal.closeFreshness.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.crew-actions.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.deeplink.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.interactions.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.prefetch.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.realtime.spec.ts": PATH_GATED,
  "tests/e2e/published-review-modal.reopen.spec.ts": PATH_GATED,
  "tests/e2e/published-show-attention.spec.ts": UNSEEN,
  "tests/e2e/report-modal.spec.ts": UNSEEN,
  "tests/e2e/right-now-transitions.spec.ts": UNSEEN,
  "tests/e2e/right-now.spec.ts": UNSEEN,
  "tests/e2e/role-spoof.spec.ts": UNSEEN,
  "tests/e2e/roles-settings-layout.spec.ts": UNSEEN,
  "tests/e2e/root-landing.spec.ts": UNSEEN,
  "tests/e2e/sample.spec.ts": UNSEEN,
  "tests/e2e/schedule-tile.spec.ts": UNSEEN,
  "tests/e2e/screenshots-help-capture.spec.ts": UNSEEN,
  "tests/e2e/sign-in-page.spec.ts": UNSEEN,
  "tests/e2e/source-link-dimensional.spec.ts": UNSEEN,
  // Landed on main via the sibling strip-mobile-stacked-band branch while this
  // guard was in flight - part of the pre-existing inventory, not a post-guard
  // regression.
  "tests/e2e/stage-restricted-crew-schedule.spec.ts": UNSEEN,
  "tests/e2e/status-financials.spec.ts": UNSEEN,
  "tests/e2e/telemetry-layout.spec.ts": UNSEEN,
  "tests/e2e/theme-toggle.spec.ts": UNSEEN,
  "tests/e2e/transport-tile.spec.ts": UNSEEN,
  "tests/e2e/warning-panel-polish.spec.ts": UNSEEN,
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

  // Whole-config membership, resolved from the LIVE config rather than listed
  // here: a hand-maintained copy would drift the moment a spec is registered,
  // and drift in a coverage guard reads as coverage.
  // Membership is what Playwright ACTUALLY resolves, not what the top-level
  // testMatch declares: project-level matchers, testIgnore, testDir, an empty
  // projects list, and grep/grepInvert all narrow what runs while leaving that
  // matcher intact. Deleting an allowlist row for a spec that does not really
  // run is the exact harm this guard exists to prevent.
  const standaloneMembers = listedSpecFiles().map((f) => `tests/e2e/${f}`);

  const { covered } = scanWorkflowCoverage({
    workflows,
    packageScripts,
    configSpecs: { "tests/e2e/standalone.config.ts": standaloneMembers },
  });

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
  it("rejects a pull_request.paths-IGNORE filter too", () => {
    // The blind spot this branch found: an exclusion filter is still a filter, so
    // the job does not run on every PR. Matching only `paths:` marked such a
    // workflow PR-blocking-capable and silently counted its specs as covered.
    const r = S(
      base(`  pull_request:\n    paths-ignore:\n      - "docs/**"`, "", `playwright test ${spec}`),
    );
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe("pull_request.paths/paths-ignore filter");
  });

  it("rejects a pull_request.paths filter (spec-file-only filters included)", () => {
    const r = S(
      base(`  pull_request:\n    paths:\n      - "${spec}"`, "", `playwright test ${spec}`),
    );
    expect(r.rejected[0]!.reason).toBe("pull_request.paths/paths-ignore filter");
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
  it("rejects exit-code suppression in ANY status-replacing form", () => {
    // An adversarial round walked past the previous leak-enumeration with all
    // three of these. The gate is now an allowlist, so the list below is a
    // regression pin rather than the definition.
    for (const tail of ["|| true", "|| :", "; true", "; exit 0", "| sed -n 1p", "| tee out.txt"]) {
      const r = S(base("  pull_request:", "", `playwright test ${spec} ${tail}`));
      expect(r.covered.has(spec), `must not cover: ${tail}`).toBe(false);
      expect(r.rejected[0]!.reason).toBe("exit-code suppression");
    }
  });

  it("still counts a PRECEDING && chain, which does not swallow status", () => {
    const r = S(base("  pull_request:", "", `pnpm setup && playwright test ${spec}`));
    expect(r.covered.has(spec)).toBe(true);
  });

  it("rejects continue-on-error in any form that is not literally false", () => {
    // `${{ true }}` is an expression GitHub evaluates to true; matching the
    // literal `true` missed it entirely and reported false coverage.
    for (const value of ["true", "${{ true }}", "${{ github.event_name == 'push' }}", "'true'"]) {
      const job = S(
        base("  pull_request:", `    continue-on-error: ${value}\n`, `playwright test ${spec}`),
      );
      expect(job.covered.has(spec), `job-level: ${value}`).toBe(false);
    }
    // …and an explicit `false` must still COUNT, or the gate is just off.
    const ok = S(
      base("  pull_request:", "    continue-on-error: false\n", `playwright test ${spec}`),
    );
    expect(ok.covered.has(spec)).toBe(true);
  });

  it("rejects a step-level continue-on-error expression placed before run:", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - continue-on-error: \${{ true }}\n        run: playwright test ${spec}\n`;
    expect(S(w).covered.has(spec)).toBe(false);
  });
});

/**
 * The whole-config rule (spec §4.1).
 *
 * A command that runs a Playwright config WITHOUT naming a spec used to be
 * invisible to the scanner: it extracts spec paths, that command has none, so
 * it claimed nothing at all — not "rejected for a reason", but no claim to
 * reject. The whole-config workflow that PR2 ships is exactly that shape.
 *
 * The rule is deliberately the narrowest thing that closes the gap: ONE exact
 * literal command form covers every spec in that config's `testMatch`, and any
 * deviation of any kind yields no claim. Four adversarial rounds could not make
 * a general narrowing grammar (`--grep`, `--shard`, positionals, forwarded
 * call-site arguments) sound, so there is no grammar here to attack — there is
 * a string comparison. What was descoped is filed as BL-CI-* backlog items.
 *
 * Recognition and QUALIFICATION stay separate: everything below still passes
 * through the same `if:` / `continue-on-error` / path-filter / exit-suppression
 * gates, and the tests pin that a recognized command in a disqualified job
 * still yields nothing.
 */
describe("the whole-config rule (spec §4.1)", () => {
  const CFG = "tests/e2e/standalone.config.ts";
  const members = ["tests/e2e/alpha.spec.ts", "tests/e2e/beta.spec.ts"];
  const wf = (run: string, trigger = "  pull_request:", extra = "") =>
    `name: x\non:\n${trigger}\njobs:\n  j:\n    runs-on: ubuntu-latest\n${extra}    steps:\n      - run: ${run}\n`;
  const S = (run: string, trigger?: string, extra?: string) =>
    scanWorkflowCoverage({
      workflows: { "w.yml": wf(run, trigger, extra) },
      packageScripts: {},
      configSpecs: { [CFG]: members },
    });

  it("the exact shipping literal covers every member of that config", () => {
    const r = S(`pnpm exec playwright test --config ${CFG}`);
    expect([...r.covered].sort()).toEqual([...members].sort());
  });

  it("claims NOTHING for any deviation from the literal", () => {
    // Each of these is a narrowing form that a general grammar would have had
    // to reason about correctly. This rule reasons about none of them: they
    // are simply not the string.
    for (const run of [
      `pnpm exec playwright test --config ${CFG} --shard=1/2`,
      `pnpm exec playwright test --config ${CFG} -g foo`,
      `pnpm exec playwright test --config ${CFG} --grep-invert bar`,
      `pnpm exec playwright test --reporter=list --config ${CFG}`,
      `pnpm exec playwright test --config ${CFG} --list`,
      `pnpm exec playwright test --config=${CFG}`,
      `pnpm exec playwright test --config ${CFG} --project=chromium`,
    ]) {
      const r = S(run);
      expect([...r.covered], `must claim nothing: ${run}`).toEqual([]);
    }
  });

  it("a positional spec still covers THAT spec, and not the whole config", () => {
    // The two mechanisms are independent: naming a spec explicitly has always
    // covered it, and must keep doing so. What the deviation must not do is
    // claim the config's OTHER members.
    const r = S(`pnpm exec playwright test --config ${CFG} tests/e2e/alpha.spec.ts`);
    expect([...r.covered]).toEqual(["tests/e2e/alpha.spec.ts"]);
  });

  it("claims nothing when the literal is wrapped in ANY shell context", () => {
    // An adversarial round claimed full coverage for all three of these,
    // because alias recursion applied the exact match to the package-script
    // BODY while qualification only saw the outer command. The whole-config
    // claim now requires the entire run block to BE the literal, so an alias
    // does not carry it either — `pnpm test:e2e:standalone` is deliberately
    // NOT recognized, and that is the safe direction: it reads as dark rather
    // than as falsely covered.
    const scripts = { "test:e2e:standalone": `pnpm exec playwright test --config ${CFG}` };
    for (const run of [
      "echo pnpm test:e2e:standalone",
      "pnpm test:e2e:standalone",
      `pnpm exec playwright test --config ${CFG} &`,
      "|\n          set +e\n          pnpm test:e2e:standalone\n          true",
      `# pnpm exec playwright test --config ${CFG}`,
    ]) {
      const r = scanWorkflowCoverage({
        workflows: { "w.yml": wf(run) },
        packageScripts: scripts,
        configSpecs: { [CFG]: members },
      });
      expect([...r.covered], `must claim nothing: ${run}`).toEqual([]);
    }
  });

  it("claims nothing when the workflow uses a construct this scanner cannot model", () => {
    // An adversarial round produced false coverage through all six of these.
    // `shell: bash -c ":" {0}` makes the step succeed WITHOUT running the
    // command; `working-directory:` makes the relative config path resolve to
    // a different config; `needs: gate` where gate has `if: false` skips the
    // job entirely even though its own head carries no condition. Rather than
    // model any of them, a workflow using them yields nothing — the spec then
    // reads as dark and keeps its allowlist row, which is the safe direction.
    const cmd = `pnpm exec playwright test --config ${CFG}`;
    const cases = [
      `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - shell: bash -c ":" {0}\n        run: ${cmd}\n`,
      `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    defaults:\n      run:\n        shell: bash -c ":" {0}\n    steps:\n      - run: ${cmd}\n`,
      `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - working-directory: other\n        run: ${cmd}\n`,
      `name: x\non:\n  pull_request:\njobs:\n  gate:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n  j:\n    needs: gate\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${cmd}\n`,
    ];
    for (const [i, yaml] of cases.entries()) {
      const r = scanWorkflowCoverage({
        workflows: { "w.yml": yaml },
        packageScripts: {},
        configSpecs: { [CFG]: members },
      });
      expect([...r.covered], `case ${i} must claim nothing`).toEqual([]);
      expect(r.rejected[0]?.reason, `case ${i} must be REPORTED, not dropped`).toBe(
        "unmodelled execution override",
      );
    }
  });

  it("claims nothing for a config it was given no member list for", () => {
    const r = S("pnpm exec playwright test --config tests/e2e/other.config.ts");
    expect([...r.covered]).toEqual([]);
  });

  it("still applies every qualification gate to a recognized command", () => {
    const cmd = `pnpm exec playwright test --config ${CFG}`;
    expect([...S(cmd, "  workflow_dispatch:").covered]).toEqual([]);
    expect([...S(cmd, '  pull_request:\n    paths:\n      - "lib/**"').covered]).toEqual([]);
    expect([...S(cmd, "  pull_request:", "    continue-on-error: true\n").covered]).toEqual([]);
    expect([...S(`${cmd} || true`).covered]).toEqual([]);
    // …and the rejection is REPORTED, not silently dropped, so a disqualified
    // whole-config job cannot look like an absent one.
    const r = S(cmd, "  workflow_dispatch:");
    expect(r.rejected.map((x) => x.spec).sort()).toEqual([...members].sort());
    expect(new Set(r.rejected.map((x) => x.reason))).toEqual(new Set(["no pull_request trigger"]));
  });
});
