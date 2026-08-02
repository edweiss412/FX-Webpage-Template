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
  "tests/e2e/admin-lifecycle-transitions.spec.ts":
    "its lifecycle-layout-e2e.yml run block validates the REPEATS input in a case/if block, and the R12 scanner refuses control-flow run blocks (both branches DO run the spec on every PR — REPEATS defaults to '1' — but the scanner cannot prove branch liveness by regex; the census pins the same block via complex-invocation registry rows); BL-E2E-LIFECYCLE-SPECS-CI-DARK umbrella",
  "tests/e2e/admin-nav-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/admin-parse-panel.spec.ts": UNSEEN,
  "tests/e2e/admin-phase2-surfaces.spec.ts": UNSEEN,
  "tests/e2e/admin-route-boundaries.spec.ts": UNSEEN,
  "tests/e2e/admin-settings-admins-refresh.spec.ts": UNSEEN,
  "tests/e2e/attention-modal-gallery.spec.ts":
    "runs in dev-gate-e2e.yml, which is workflow_dispatch + DAILY SCHEDULE (2026-07-26). A schedule is not PR-blocking-capable per the scanner contract, so this row stays — but the spec is no longer unrun: a break is now bounded to 24h instead of until someone remembers to dispatch. Three serialized cold builds make a per-PR trigger too heavy; ratified B1-D4. BL-DEV-GATE-GALLERY-SPEC-ROT",
  "tests/e2e/bell-panel-layout.spec.ts": PATH_GATED,
  "tests/e2e/crew-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/alert-action-links.spec.ts": PATH_GATED_BY_EXCLUSION,
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
  // packlist-rescan-recovery returned to the standalone CI project under the
  // PR-C directive resolver (BL-HARNESS-PACKLIST-SERVER-GRAPH graduated) — no
  // longer local-only.
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
  "tests/e2e/section-header-visual.spec.ts":
    "invoked only through the section-header-visual.yml docker run … bash -lc '…' block, which the R13 scanner refuses (spec path inside a quoted string is not a command-position invocation, and the block carries $PWD expansion). The census routes that same block through the complex-invocation registry, and the spec's LIVENESS is owned by the byte-comparing visual drift gate itself (a dead run has no fresh capture to compare); BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT tracks required-set promotion",
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

  // Local composite actions run in the caller's job env (cross-step-env-guard
  // spec §2.2): hand the scanner every action manifest so a `uses: ./…` step
  // resolves — a ./ ref MISSING from this map poisons fail-closed, so the map
  // must be complete for the live tree. ONLY GitHub-recognized manifests key
  // the map, action.yml preferred over action.yaml (spec R2: a supplemental
  // YAML must never overwrite the manifest under the same directory key).
  const localActions: Record<string, string> = {};
  {
    const manifestByDir = new Map<string, string>();
    for (const f of readdirSync(join(ROOT, ".github/actions"), { recursive: true }) as string[]) {
      if (!/(^|[\\/])action\.ya?ml$/.test(f)) continue;
      const dir = `./.github/actions/${f.split(/[\\/]/).slice(0, -1).join("/")}`;
      const prev = manifestByDir.get(dir);
      if (prev === undefined || f.endsWith("action.yml")) manifestByDir.set(dir, f);
    }
    for (const [dir, f] of manifestByDir) {
      localActions[dir] = readFileSync(join(ROOT, ".github/actions", f), "utf8");
    }
  }

  const { covered } = scanWorkflowCoverage({
    workflows,
    packageScripts,
    configSpecs: { "tests/e2e/standalone.config.ts": standaloneMembers },
    localActions,
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

  it("the agenda layout specs are COVERED on every PR, with no allowlist row", () => {
    // This assertion got STRONGER at merge. It used to demand the spec appear in `rejected`
    // with reason "pull_request.paths/paths-ignore filter", because the only thing running it
    // was a path-gated workflow -- honest, but weaker than PR-blocking. origin/main then
    // retired seven per-feature workflows for one unfiltered standalone-e2e.yml, so both
    // specs are now covered outright and their allowlist rows had to GO: the shadowing check
    // fails on an allowlisted spec that is covered.
    //
    // Asserted per spec rather than left to the generic dark/shadowing tests so a failure
    // names which one regressed, and so re-adding a row is caught by an explicit expectation.
    for (const spec of [
      "tests/e2e/agendaScheduleLayout.spec.ts",
      "tests/e2e/agendaBreakdown.layout.spec.ts",
    ]) {
      expect(specs, `${spec} must exist on disk`).toContain(spec);
      expect(covered.has(spec), `${spec} must be covered by an unfiltered workflow`).toBe(true);
      expect(spec in LOCAL_ONLY_ALLOWLIST, `${spec} must carry NO allowlist row`).toBe(false);
    }
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
    for (const tail of ["|| true", "; true", "; exit 0", "| sed -n 1p", "| tee out.txt"]) {
      const r = S(base("  pull_request:", "", `playwright test ${spec} ${tail}`));
      expect(r.covered.has(spec), `must not cover: ${tail}`).toBe(false);
      expect(r.rejected[0]!.reason).toBe("exit-code suppression");
    }
    // `cmd || :` UNQUOTED is invalid YAML (the trailing colon opens a nested
    // mapping) — GitHub rejects the file, canonicalization nulls, safe-dark.
    // A real workflow must QUOTE it; the canonical double-quoted scalar is
    // unquoted before scanning so the suppression stays REPORTED.
    {
      const invalid = S(base("  pull_request:", "", `playwright test ${spec} || :`));
      expect(invalid.covered.has(spec)).toBe(false);
      expect(invalid.rejected).toEqual([]);
      const quoted = S(base("  pull_request:", "", `"playwright test ${spec} || :"`));
      expect(quoted.covered.has(spec)).toBe(false);
      expect(quoted.rejected[0]!.reason).toBe("exit-code suppression");
    }
  });

  it("still counts a PRECEDING && chain, which does not swallow status", () => {
    const r = S(base("  pull_request:", "", `pnpm setup && playwright test ${spec}`));
    expect(r.covered.has(spec)).toBe(true);
  });

  it("rejects unmodelled shell constructs — state changes and control flow (R12)", () => {
    // `PATH=fixtures/fake pnpm exec playwright test …` runs a fake pnpm that
    // exits 0: the step is green, the spec never ran, and the scanner marked
    // it covered. Shell-state mutation (assignments in every form, the
    // assignment builtins, source/dot, directory changes, builtin/command
    // wrappers) and control flow (an invocation inside a dead branch) both
    // make "this run block executes this spec" unprovable by a line scan, so
    // any run block containing one claims nothing — the spec reads as dark
    // and costs an allowlist row, never as falsely covered.
    for (const run of [
      `PATH=fixtures/fake pnpm exec playwright test ${spec}`,
      `|\n          PATH=fixtures/fake\n          pnpm exec playwright test ${spec}`,
      `|\n          export NODE_OPTIONS=--require=./evil.cjs\n          pnpm exec playwright test ${spec}`,
      `|\n          cd fixtures\n          pnpm exec playwright test ${spec}`,
      `|\n          source ./env.sh\n          pnpm exec playwright test ${spec}`,
      `|\n          . ./env.sh\n          pnpm exec playwright test ${spec}`,
      `|\n          command unset -f playwright\n          pnpm exec playwright test ${spec}`,
      `|\n          if false; then\n            pnpm exec playwright test ${spec}\n          fi`,
      `|\n          for i in 1 2; do\n            pnpm exec playwright test ${spec}\n          done`,
    ]) {
      const r = S(base("  pull_request:", "", run));
      expect(r.covered.has(spec), `must not cover: ${run}`).toBe(false);
      expect(r.rejected[0]!.reason, `must reject as unmodelled: ${run}`).toBe(
        "unmodelled shell construct",
      );
    }
  });

  it("rejects the R13 evasions: punctuation function names, printf -v, expansion assignment, arithmetic", () => {
    for (const run of [
      `|\n          foo-bar ( ) { :\n          pnpm exec playwright test ${spec}\n          :; }`,
      `|\n          printf -v PATH fixtures/fake\n          pnpm exec playwright test ${spec}`,
      `|\n          : \${NODE_OPTIONS:=--require=./evil.cjs}\n          pnpm exec playwright test ${spec}`,
      `|\n          (( CI = 1 ))\n          pnpm exec playwright test ${spec}`,
    ]) {
      const r = S(base("  pull_request:", "", run));
      expect(r.covered.has(spec), `must not cover: ${run}`).toBe(false);
      expect(r.rejected[0]!.reason, `must reject as unmodelled: ${run}`).toBe(
        "unmodelled shell construct",
      );
    }
  });

  it("claims nothing from lines that are not command-position invocations (echo/docker text)", () => {
    // SPEC_RE and the alias grammar used to grep the WHOLE run block, so
    // `echo tests/e2e/foo.spec.ts` — or a spec path inside a docker/bash -lc
    // quoted string — counted as coverage. A claim now requires its line to
    // START (command position) with a recognized runner/invocation word.
    for (const run of [
      `echo ${spec}`,
      `echo pnpm exec playwright test ${spec}`,
      "echo pnpm test:e2e:foo",
      `docker run img bash -lc "pnpm exec playwright test ${spec}"`,
    ]) {
      const r = S(base("  pull_request:", "", run), { "test:e2e:foo": `playwright test ${spec}` });
      expect(r.covered.has(spec), `must not cover: ${run}`).toBe(false);
    }
    // …and command position still recognizes the real forms, through ;/&& too.
    const ok = S(base("  pull_request:", "", `pnpm setup && pnpm exec playwright test ${spec}`));
    expect(ok.covered.has(spec)).toBe(true);
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

describe("cross-step GITHUB_ENV/GITHUB_PATH poisoning (cross-step-env-guard spec §2.2)", () => {
  const spec = "tests/e2e/foo.spec.ts";
  const REASON = "earlier same-job step writes GITHUB_ENV/GITHUB_PATH";
  const INVOKE = `run: pnpm exec playwright test ${spec}`;
  const two = (first: string, second = INVOKE) =>
    `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${first}\n      - ${second}\n`;
  const S = (w: string, localActions: Record<string, string> = {}) =>
    scanWorkflowCoverage({ workflows: { "w.yml": w }, packageScripts: {}, localActions });

  it("rejects a claim after an earlier same-job env write, in EVERY write shape (F1/F2)", () => {
    // No write-shape grammar: mention = poison. A predicate narrowed to one
    // redirect form would pass at least one of these three. Semantically
    // real writes (R1 probe honesty): a GITHUB_PATH entry is a PATH
    // COMPONENT to prepend — the corrupting form is a directory holding a
    // fake pnpm; a PATH= assignment corrupts via GITHUB_ENV.
    for (const write of [
      'run: echo "/fake-bin" >> "$GITHUB_PATH"',
      'run: echo "PATH=/fake-bin:$PATH" | tee -a "$GITHUB_ENV"',
      'run: echo "/fake-bin" > "$GITHUB_PATH"',
    ]) {
      const r = S(two(write));
      expect(r.covered.has(spec), write).toBe(false);
      expect(r.rejected[0]!.reason, write).toBe(REASON);
    }
  });

  it("a write AFTER the invocation step poisons nothing before it (F3)", () => {
    const r = S(two(INVOKE, 'run: echo "X=1" >> "$GITHUB_ENV"'));
    expect(r.covered.has(spec)).toBe(true);
  });

  it("env state is job-scoped: a write in another job does not poison (F1 precision)", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "X=1" >> "$GITHUB_ENV"\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${INVOKE}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(true);
  });

  it("local composite actions: unknown ref fails closed; provided text decides (F4/F5)", () => {
    const ghost = S(two("uses: ./.github/actions/ghost"));
    expect(ghost.covered.has(spec)).toBe(false);
    expect(ghost.rejected[0]!.reason).toBe(REASON);
    const clean = S(two("uses: ./.github/actions/ok"), {
      "./.github/actions/ok":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n",
    });
    expect(clean.covered.has(spec)).toBe(true);
    const writer = S(two("uses: ./.github/actions/w"), {
      "./.github/actions/w":
        'runs:\n  using: composite\n  steps:\n    - run: echo "X=1" >> "$GITHUB_ENV"\n      shell: bash\n',
    });
    expect(writer.covered.has(spec)).toBe(false);
    expect(writer.rejected[0]!.reason).toBe(REASON);
  });

  it("PINNED marketplace actions stay trusted; unpinned and docker are refused (spec §5 L1/L8)", () => {
    const r = S(two("uses: actions/checkout@v4"));
    expect(r.covered.has(spec)).toBe(true);
    // …including owner/repo/path@ref. (docker:// is refused wholesale as of
    // R13 — see the dedicated fixture and spec §5 L8.)
    expect(S(two("uses: owner/repo/sub@v1")).covered.has(spec)).toBe(true);
  });

  it("a REFLESS remote uses: is invalid, not trusted — every site (R10)", () => {
    // GitHub requires {owner}/{repo}[/path]@{ref}; a refless ref fails
    // validation before any step runs, so the downstream invocation never
    // executes — trusting it was false coverage at all three sites.
    for (const ref of ["actions/checkout", "owner/repo/path"]) {
      const direct = S(two(`uses: ${ref}`));
      expect(direct.covered.has(spec), `workflow ${ref}`).toBe(false);
      expect(direct.rejected[0]!.reason, `workflow ${ref}`).toBe(REASON);
      const child = S(two("uses: ./.github/actions/c1"), {
        "./.github/actions/c1": `runs:\n  using: composite\n  steps:\n    - uses: ${ref}\n`,
      });
      expect(child.covered.has(spec), `composite child ${ref}`).toBe(false);
      expect(child.rejected[0]!.reason, `composite child ${ref}`).toBe(REASON);
      const nested = S(two("uses: ./.github/actions/p3"), {
        "./.github/actions/p3":
          "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/c1\n",
        "./.github/actions/c1": `runs:\n  using: composite\n  steps:\n    - uses: ${ref}\n`,
      });
      expect(nested.covered.has(spec), `nested ${ref}`).toBe(false);
      expect(nested.rejected[0]!.reason, `nested ${ref}`).toBe(REASON);
    }
    // …and a properly pinned remote ref inside a composite stays clean.
    const ok = S(two("uses: ./.github/actions/c2"), {
      "./.github/actions/c2":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n",
    });
    expect(ok.covered.has(spec)).toBe(true);
  });

  it("the whole docker:// family is opaque, at every site (R12/R13)", () => {
    // R12 replaced a \\S+ check with a hand-written image grammar; R13 then
    // produced four more Docker-invalid forms (hyphen-edged registry labels,
    // >128-char tags, >255-char paths, bare 64-hex names). Docker's
    // reference grammar is its own spec, so the family is refused wholesale
    // — including well-formed references, which is a conservative refusal
    // (spec §5 L8), never false coverage. Zero live docker:// refs.
    const long = "a".repeat(129);
    for (const ref of [
      "docker://@",
      "docker://",
      "docker://:tag",
      "docker://UPPER/img",
      "docker://-host.example.com/img",
      "docker://host-.example.com/img",
      `docker://alpine:${long}`,
      `docker://${"b".repeat(64)}`,
      // …and the well-formed ones are refused too, by design.
      "docker://alpine:3",
      "docker://ghcr.io/owner/img:v1.2",
      `docker://alpine@sha256:${"a".repeat(64)}`,
      "docker://registry.example.com:5000/team/img",
    ]) {
      const direct = S(two(`uses: ${ref}`));
      expect(direct.covered.has(spec), `workflow ${ref}`).toBe(false);
      expect(direct.rejected[0]!.reason, `workflow ${ref}`).toBe(REASON);
      const child = S(two("uses: ./.github/actions/d1"), {
        "./.github/actions/d1": `runs:\n  using: composite\n  steps:\n    - uses: ${ref}\n`,
      });
      expect(child.covered.has(spec), `composite child ${ref}`).toBe(false);
      const nested = S(two("uses: ./.github/actions/d2"), {
        "./.github/actions/d2":
          "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/d1\n",
        "./.github/actions/d1": `runs:\n  using: composite\n  steps:\n    - uses: ${ref}\n`,
      });
      expect(nested.covered.has(spec), `nested ${ref}`).toBe(false);
    }
    // …while pinned GitHub-action refs — the shapes this repo actually uses
    // — stay trusted, so the wholesale docker refusal costs no live
    // coverage.
    for (const ref of ["actions/checkout@v4", "owner/repo/sub@v1"]) {
      expect(S(two(`uses: ${ref}`)).covered.has(spec), ref).toBe(true);
    }
  });

  it("mapping order and post-steps job keys cannot hide refusals (R18)", () => {
    // run-first mixed steps: a text scan truncating at `run:` missed the
    // `uses:` that follows it; the typed read is order-independent.
    for (const ref of [
      "actions/checkout@v4",
      "actions/checkout",
      "./.github/actions/ghost",
      "docker://alpine:3",
    ]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo mixed\n        uses: ${ref}\n      - run: pnpm exec playwright test ${spec}\n`;
      const r = S(w);
      expect(r.covered.has(spec), `run-first ${ref}`).toBe(false);
      expect(r.rejected[0]!.reason, `run-first ${ref}`).toBe("unmodelled YAML spelling");
    }
    // job-level if:/continue-on-error: placed AFTER steps: are invisible to
    // the head TEXT, so they are read from the parsed job as well.
    const ifAfter = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n    if: false\n`;
    expect(S(ifAfter).covered.has(spec)).toBe(false);
    expect(S(ifAfter).rejected[0]!.reason).toBe("if: condition present");
    const coeAfter = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n    continue-on-error: true\n`;
    expect(S(coeAfter).covered.has(spec)).toBe(false);
    expect(S(coeAfter).rejected[0]!.reason).toBe("continue-on-error");
    // …and an explicit false after steps: still counts.
    const coeFalse = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n    continue-on-error: false\n`;
    expect(S(coeFalse).covered.has(spec)).toBe(true);
  });

  it("workflow-schema-invalid files claim nothing (R19)", () => {
    // GitHub rejects the FILE for unknown root/job/step keys, `with:` on a
    // run step, or non-numeric timeouts — so no test runs and any claim is
    // false coverage. Same narrow-accept posture as the manifest profile.
    const base = (root: string, job: string, step: string) =>
      `name: x\n${root}on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n${job}    steps:\n      - run: pnpm exec playwright test ${spec}\n${step}`;
    const bad = [
      base("bogus-root: 1\n", "", ""),
      base("", "    bogus-job: 1\n", ""),
      base("", "", "        bogus-step: 1\n"),
      base("", "", "        with:\n          a: b\n"),
      base("", "    timeout-minutes: fast\n", ""),
      base("", "", "        timeout-minutes: fast\n"),
    ];
    for (const w of bad) {
      const r = S(w);
      expect(r.covered.has(spec), w).toBe(false);
      expect(r.rejected[0]!.reason, w).toBe("unmodelled YAML spelling");
    }
    // …and the schedulable shape with legitimate optional keys still counts.
    const ok = base(
      "run-name: probe\n",
      "    timeout-minutes: 30\n",
      "        timeout-minutes: 5\n",
    );
    expect(S(ok).covered.has(spec)).toBe(true);
  });

  it("job KIND and typed values are enforced, not a union allowlist (R20)", () => {
    // A steps-job and a reusable-workflow (uses) job have DIFFERENT keyword
    // sets; a union allowlist accepted uses+steps together, with:/secrets:
    // on a steps job, and untyped name/id/with values.
    const wf = (jobBody: string) => `name: x\non:\n  pull_request:\njobs:\n  j:\n${jobBody}`;
    const bad = [
      // uses + steps on one job
      `    uses: ./.github/workflows/other.yml\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`,
      // with:/secrets: on a steps job
      `    runs-on: ubuntu-latest\n    with:\n      a: b\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`,
      `    runs-on: ubuntu-latest\n    secrets: inherit\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`,
      // non-string step name / id, non-mapping with:
      `    runs-on: ubuntu-latest\n    steps:\n      - name: 42\n        run: pnpm exec playwright test ${spec}\n`,
      `    runs-on: ubuntu-latest\n    steps:\n      - id: []\n        run: pnpm exec playwright test ${spec}\n`,
      `    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with: nope\n      - run: pnpm exec playwright test ${spec}\n`,
    ];
    for (const body of bad) {
      const r = S(wf(body));
      expect(r.covered.has(spec), body).toBe(false);
      expect(r.rejected[0]!.reason, body).toBe("unmodelled YAML spelling");
    }
    // …and a well-formed steps job with typed optional keys still counts.
    const ok = `    name: probe\n    runs-on: ubuntu-latest\n    env:\n      A: '1'\n    steps:\n      - name: run\n        id: r1\n        run: pnpm exec playwright test ${spec}\n`;
    expect(S(wf(ok)).covered.has(spec)).toBe(true);
  });

  it("every workflow key is TYPE-checked, not merely name-checked (R21)", () => {
    // R19/R20 validated key NAMES and a few values; each round then found
    // another value that passed unvalidated. Every key now carries a type
    // predicate, so a wrong-typed value is refused wherever it appears.
    const wf = (root: string, jobBody: string) =>
      `name: x\n${root}on:\n  pull_request:\njobs:\n  j:\n${jobBody}`;
    const stepsJob = (extra: string, step: string) =>
      `    runs-on: ubuntu-latest\n${extra}    steps:\n      - run: pnpm exec playwright test ${spec}\n${step}`;
    const bad = [
      // root-level wrong types
      wf("name:\n  - seq\n", stepsJob("", "")),
      wf("run-name:\n  - seq\n", stepsJob("", "")),
      wf("concurrency:\n  - seq\n", stepsJob("", "")),
      wf("permissions:\n  - seq\n", stepsJob("", "")),
      // job-level wrong types
      wf("", stepsJob("    environment:\n      - seq\n", "")),
      wf("", stepsJob("    outputs:\n      - seq\n", "")),
      wf("", stepsJob("    continue-on-error:\n      - seq\n", "")),
      wf("", stepsJob("    if:\n      - seq\n", "")),
      // step-level wrong types and out-of-range timeouts
      wf("", stepsJob("", "      - run: ''\n")),
      wf("", stepsJob("", "      - run: 42\n")),
      wf("", stepsJob("", "      - uses: ''\n")),
      wf("", stepsJob("", "      - run: echo x\n        continue-on-error:\n          - seq\n")),
      wf("", stepsJob("", "      - run: echo x\n        timeout-minutes: 0\n")),
      wf("", stepsJob("", "      - run: echo x\n        timeout-minutes: -1\n")),
      wf("", stepsJob("", "      - run: echo x\n        timeout-minutes: 1.5\n")),
      wf("", stepsJob("", "      - run: echo x\n        timeout-minutes: 361\n")),
      // reusable-workflow job with an invalid uses reference
      `name: x\non:\n  pull_request:\njobs:\n  a:\n    uses: not-a-workflow-ref\n  j:\n${stepsJob("", "")}`,
    ];
    for (const w of bad) {
      const r = S(w);
      expect(r.covered.has(spec), w).toBe(false);
      // Most shapes are REPORTED with the schema reason; a root-level type
      // error can also make the file yield no claim at all (safe-dark).
      // Either is a refusal — false coverage is the only failure.
      if (r.rejected.length > 0) {
        expect(r.rejected[0]!.reason, w).toBe("unmodelled YAML spelling");
      }
    }
    // …and the well-typed forms still count, including a valid reusable job
    // beside the claiming one and an in-range step timeout.
    const okReusable = `name: x\non:\n  pull_request:\njobs:\n  a:\n    uses: ./.github/workflows/other.yml\n  j:\n${stepsJob("", "      - run: echo x\n        timeout-minutes: 360\n")}`;
    expect(S(okReusable).covered.has(spec)).toBe(true);
  });

  it("container VALUES are typed too, one level down (R22)", () => {
    // `mapping`/`strOrMapping` validated only the outer container, so nested
    // junk passed: unknown permission levels, a keyless concurrency, unknown
    // strategy/environment/services keys.
    const wf = (root: string, jobExtra: string) =>
      `name: x\n${root}on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n${jobExtra}    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
    const bad = [
      wf("permissions:\n  contents: bogus\n", ""),
      wf("concurrency:\n  bogus: 1\n", ""),
      wf("", "    permissions:\n      contents: bogus\n"),
      wf("", "    concurrency:\n      group: ''\n"),
      wf("", "    strategy:\n      bogus: 1\n"),
      wf("", "    environment:\n      bogus: x\n"),
      wf("", "    services:\n      db:\n        bogus: x\n"),
    ];
    for (const w of bad) {
      const r = S(w);
      expect(r.covered.has(spec), w).toBe(false);
      if (r.rejected.length > 0) {
        expect(r.rejected[0]!.reason, w).toBe("unmodelled YAML spelling");
      }
    }
    // …and the well-formed nested shapes still count, including the live
    // `schedule:` SEQUENCE form that the live-tree tripwire caught when an
    // earlier draft refused it.
    const ok = [
      wf("permissions:\n  contents: read\n", ""),
      wf("concurrency:\n  group: g\n  cancel-in-progress: true\n", ""),
      wf("", "    strategy:\n      fail-fast: false\n"),
      wf("", "    environment:\n      name: prod\n      url: https://example.com\n"),
      wf("", "    services:\n      db:\n        image: postgres:16\n"),
      `name: x\non:\n  pull_request:\n  schedule:\n    - cron: '0 9 * * 1'\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`,
    ];
    for (const w of ok) {
      expect(S(w).covered.has(spec), w).toBe(true);
    }
  });

  it("nested trigger and permission shapes are validated, and activity-filtered PRs do not count (R23)", () => {
    const job = `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
    // Activity-filtered or sequence-valued pull_request: the workflow does
    // not run on every PR, so it cannot keep a spec covered (same treatment
    // as a paths filter).
    // R24: the rule is BARE-ONLY — any configuration under pull_request
    // means the workflow does not run on every PR. Enumerating filter keys
    // (paths, types, then branches, branches-ignore) was the losing shape.
    const filtered = [
      `name: x\non:\n  pull_request:\n    types:\n      - closed\n${job}`,
      `name: x\non:\n  pull_request:\n    types:\n      - opened\n      - synchronize\n${job}`,
      `name: x\non:\n  pull_request:\n    - opened\n${job}`,
      `name: x\non:\n  pull_request:\n    branches:\n      - main\n${job}`,
      `name: x\non:\n  pull_request:\n    branches-ignore:\n      - docs/**\n${job}`,
    ];
    for (const w of filtered) {
      const r = S(w);
      expect(r.covered.has(spec), w).toBe(false);
    }
    // Schema-invalid nested shapes: schedule without cron, permission
    // scalars and scopes outside GitHub's sets.
    const bad = [
      `name: x\non:\n  pull_request:\n  schedule:\n    - bogus: 1\n${job}`,
      `name: x\npermissions: bogus\non:\n  pull_request:\n${job}`,
      `name: x\npermissions:\n  bogus-scope: read\non:\n  pull_request:\n${job}`,
    ];
    for (const w of bad) {
      const r = S(w);
      expect(r.covered.has(spec), w).toBe(false);
    }
    // …and the well-formed forms still count.
    const ok = [
      `name: x\non:\n  pull_request:\n${job}`,
      `name: x\npermissions: read-all\non:\n  pull_request:\n${job}`,
      `name: x\npermissions:\n  contents: read\non:\n  pull_request:\n${job}`,
      `name: x\non:\n  pull_request:\n  schedule:\n    - cron: '0 9 * * 1'\n${job}`,
    ];
    for (const w of ok) {
      expect(S(w).covered.has(spec), w).toBe(true);
    }
  });

  it("block-scalar lines that look like steps cannot invent or shift coverage (R25/R26)", () => {
    // A body line beginning `- run:` / `- name:` / bare `-` used to add a
    // phantom raw chunk, which both invented coverage AND shifted every
    // later step's gate association. These fixtures put the step-shaped
    // text at line start INSIDE the block scalar, so the splitter really
    // sees it (the R25 fixtures only echoed it, which R26 caught).
    const phantom = [
      `      - run: |\n          - run: pnpm exec playwright test ${spec}\n`,
      `      - run: |\n          - name: fake\n            run: pnpm exec playwright test ${spec}\n`,
      `      - run: |\n          -\n          run: pnpm exec playwright test ${spec}\n`,
    ];
    for (const steps of phantom) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;
      expect(S(w).covered.has(spec), steps).toBe(false);
    }
    // …and a phantom chunk must not shift a LATER real step's gates: these
    // claim only through a step that carries `if:` / `continue-on-error:`,
    // so the claim must still be REJECTED for that reason.
    const shifted = [
      `      - run: |\n          - run: echo phantom\n      - if: false\n        run: pnpm exec playwright test ${spec}\n`,
      `      - run: |\n          - run: echo phantom\n      - continue-on-error: true\n        run: pnpm exec playwright test ${spec}\n`,
    ];
    for (const steps of shifted) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;
      expect(S(w).covered.has(spec), steps).toBe(false);
    }
    // …and a real second step still counts.
    const real = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n      - run: pnpm exec playwright test ${spec}\n`;
    expect(S(real).covered.has(spec)).toBe(true);
  });

  it("unknown events and event/schedule keys are refused (R25)", () => {
    const job = `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
    for (const on of [
      "  pull_request:\n  bogus_event:\n",
      "  pull_request:\n    bogus_key:\n      - x\n",
      "  pull_request:\n  schedule:\n    - cron: '0 9 * * 1'\n      bogus: 1\n",
    ]) {
      const r = S(`name: x\non:\n${on}${job}`);
      expect(r.covered.has(spec), on).toBe(false);
    }
    // …known events with known config keys still count.
    expect(
      S(`name: x\non:\n  pull_request:\n  push:\n    branches:\n      - main\n${job}`).covered.has(
        spec,
      ),
    ).toBe(true);
  });

  it("malformed action coordinates and misplaced reusable workflows are refused (R27)", () => {
    const job = `    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
    // Step action coordinates: every path segment must be a real segment.
    for (const ref of ["owner./repo@v1", "owner/..@v1", "owner/repo//@v1", "owner@v1"]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${ref}\n      - run: pnpm exec playwright test ${spec}\n`;
      expect(S(w).covered.has(spec), ref).toBe(false);
    }
    // Reusable-workflow jobs: only .github/workflows/<name>.yml, one level.
    for (const ref of [
      "./other.yml",
      "./.github/workflows/nested/other.yml",
      "owner/repo/other.yml@v1",
      "owner/repo/.github/workflows/other.yml@..",
    ]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  a:\n    uses: ${ref}\n  j:\n${job}`;
      expect(S(w).covered.has(spec), ref).toBe(false);
    }
    // …and the well-formed forms still count.
    const okStep = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm exec playwright test ${spec}\n`;
    expect(S(okStep).covered.has(spec)).toBe(true);
    for (const ref of [
      "./.github/workflows/other.yml",
      "owner/repo/.github/workflows/other.yml@v1",
    ]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  a:\n    uses: ${ref}\n  j:\n${job}`;
      expect(S(w).covered.has(spec), ref).toBe(true);
    }
  });

  it("multiline uses: values are classified whole, not by first line (R28)", () => {
    // Reconstructing `uses: <value>` and re-scanning it as text classified
    // a block scalar on its first line only; the runner consumes the whole
    // scalar, so both a remote-looking and a local-looking multiline value
    // must poison.
    const multiline = [
      "      - uses: |\n          actions/checkout@v4\n          extra-junk\n",
      "      - uses: |\n          ./.github/actions/setup\n          extra-junk\n",
    ];
    for (const step of multiline) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${step}      - run: pnpm exec playwright test ${spec}\n`;
      expect(S(w).covered.has(spec), step).toBe(false);
    }
    // …single-line equivalents still behave: pinned remote covered.
    const ok = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm exec playwright test ${spec}\n`;
    expect(S(ok).covered.has(spec)).toBe(true);
  });

  it("event configs are typed PER EVENT, not by a shared key union (R29)", () => {
    const job = `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
    const bad = [
      // workflow_dispatch takes an inputs MAPPING and nothing else
      "  pull_request:\n  workflow_dispatch:\n    inputs: 7\n",
      "  pull_request:\n  workflow_dispatch:\n    branches:\n      - main\n",
      // push has no `types`; pull_request has no `tags`
      "  pull_request:\n  push:\n    types:\n      - created\n",
      "  pull_request:\n    tags:\n      - v1\n",
      // filter values must be sequences of strings
      "  pull_request:\n    paths: docs\n",
      "  pull_request:\n    branches:\n      - 7\n",
    ];
    for (const on of bad) {
      expect(S(`name: x\non:\n${on}${job}`).covered.has(spec), on).toBe(false);
    }
    // …and the well-formed per-event shapes still count.
    const ok = [
      "  pull_request:\n  workflow_dispatch:\n    inputs:\n      why:\n        type: string\n",
      "  pull_request:\n  push:\n    branches:\n      - main\n    tags:\n      - v1\n",
      "  pull_request:\n  workflow_run:\n    workflows:\n      - other\n    types:\n      - completed\n",
    ];
    for (const on of ok) {
      expect(S(`name: x\non:\n${on}${job}`).covered.has(spec), on).toBe(true);
    }
  });

  it("action-manifest roots, step ids and continue-on-error are typed (R30)", () => {
    const two2 = (manifest: string) =>
      [
        `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/m\n      - run: pnpm exec playwright test ${spec}\n`,
        { "./.github/actions/m": manifest },
      ] as const;
    const goodSteps =
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n";
    const bad = [
      `name:\n  - seq\n${goodSteps}`,
      `description:\n  - seq\n${goodSteps}`,
      `inputs: nope\n${goodSteps}`,
      `outputs: nope\n${goodSteps}`,
      "bogus-root: 1\n" + goodSteps,
      "runs:\n  using: composite\n  steps:\n    - id: '1bad'\n      run: echo hi\n      shell: bash\n",
      "runs:\n  using: composite\n  steps:\n    - id: dup\n      run: echo a\n      shell: bash\n    - id: dup\n      run: echo b\n      shell: bash\n",
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      continue-on-error: nope\n",
    ];
    for (const manifest of bad) {
      const [w, actions] = two2(manifest);
      expect(S(w, actions).covered.has(spec), manifest).toBe(false);
      expect(S(w, actions).rejected[0]!.reason, manifest).toBe(REASON);
    }
    // …and a well-typed manifest (root metadata, valid id, expression coe)
    // still resolves clean.
    const [okW, okActions] = two2(
      "name: setup\ndescription: does things\ninputs:\n  a:\n    description: x\nruns:\n  using: composite\n  steps:\n    - id: step_one\n      run: echo hi\n      shell: bash\n      continue-on-error: ${{ false }}\n",
    );
    expect(S(okW, okActions).covered.has(spec)).toBe(true);
  });

  it("github.env / github.path aliases poison like the variables (R31)", () => {
    // These context properties NAME the same env files, so a write through
    // either mutates later steps in the job — a charter-surface vector, not
    // a constructed-name obfuscation.
    for (const prop of ["github.env", "github.path"]) {
      const direct = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "/fake-bin" >> "\${{ ${prop} }}"\n      - run: pnpm exec playwright test ${spec}\n`;
      const r = S(direct);
      expect(r.covered.has(spec), `direct ${prop}`).toBe(false);
      expect(r.rejected[0]!.reason, `direct ${prop}`).toBe(REASON);
      const viaAction = S(two("uses: ./.github/actions/w2"), {
        "./.github/actions/w2": `runs:\n  using: composite\n  steps:\n    - run: echo "/fake-bin" >> "\${{ ${prop} }}"\n      shell: bash\n`,
      });
      expect(viaAction.covered.has(spec), `composite ${prop}`).toBe(false);
      const nested = S(two("uses: ./.github/actions/p4"), {
        "./.github/actions/p4":
          "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/w2\n",
        "./.github/actions/w2": `runs:\n  using: composite\n  steps:\n    - run: echo "/fake-bin" >> "\${{ ${prop} }}"\n      shell: bash\n`,
      });
      expect(nested.covered.has(spec), `nested ${prop}`).toBe(false);
    }
  });

  it("a job without a valid runs-on claims nothing (R16)", () => {
    // runs-on is REQUIRED and must name a runner: absent, null, empty,
    // boolean, or an empty sequence means the job never executes, so any
    // claim from its steps is false coverage.
    for (const head of ["", "    runs-on:\n", "    runs-on: null\n", "    runs-on: []\n"]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n${head}    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
      const r = S(w);
      expect(r.covered.has(spec), JSON.stringify(head)).toBe(false);
      expect(r.rejected[0]!.reason, JSON.stringify(head)).toBe("job has no valid runs-on");
    }
    // …and the valid runner shapes still count: scalar, label sequence, and
    // a runner group mapping.
    for (const head of [
      "    runs-on: ubuntu-latest\n",
      "    runs-on:\n      - self-hosted\n      - linux\n",
      "    runs-on:\n      group: my-group\n",
    ]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n${head}    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
      expect(S(w).covered.has(spec), head).toBe(true);
    }
  });

  it("runs-on accepts only schedulable shapes, typed (R17)", () => {
    // R16 used textual/shape-counting heuristics per layer; R17 probed
    // numeric scalars, non-string sequence members, and wrong-typed or
    // extra-keyed group/labels mappings straight through. One shared typed
    // validator now decides both layers.
    const bad = [
      "    runs-on: 42\n",
      "    runs-on: '   '\n",
      "    runs-on:\n      - 42\n",
      "    runs-on:\n      - null\n",
      "    runs-on:\n      group:\n",
      "    runs-on:\n      group: []\n",
      "    runs-on:\n      labels: []\n",
      "    runs-on:\n      group: g\n      bogus: 1\n",
      "    runs-on:\n      bogus: x\n",
    ];
    for (const head of bad) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n${head}    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
      const r = S(w);
      expect(r.covered.has(spec), JSON.stringify(head)).toBe(false);
      expect(r.rejected[0]!.reason, JSON.stringify(head)).toBe("job has no valid runs-on");
    }
    const good = [
      "    runs-on: ubuntu-latest\n",
      "    runs-on:\n      - self-hosted\n      - linux\n",
      "    runs-on:\n      group: my-group\n",
      "    runs-on:\n      group: my-group\n      labels: gpu\n",
      "    runs-on:\n      labels:\n        - gpu\n        - linux\n",
    ];
    for (const head of good) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n${head}    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
      expect(S(w).covered.has(spec), JSON.stringify(head)).toBe(true);
    }
  });

  it("a step carrying BOTH run: and uses: claims nothing (R15)", () => {
    // The runner defines a step as run-step XOR regular-step, so GitHub
    // rejects the whole workflow — and claiming the run also bypassed every
    // usesKind refusal, since qualification ran before the uses bookkeeping.
    for (const ref of [
      "actions/checkout@v4",
      "actions/checkout",
      "./.github/actions/ghost",
      "docker://alpine:3",
    ]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${ref}\n        run: pnpm exec playwright test ${spec}\n`;
      const r = S(w);
      expect(r.covered.has(spec), ref).toBe(false);
      expect(r.rejected[0]!.reason, ref).toBe("unmodelled YAML spelling");
    }
    // File-level (whole-diff R3): a mixed step anywhere voids claims BEFORE
    // it, AFTER it, and in OTHER jobs — GitHub rejects the whole workflow.
    const before = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n      - uses: actions/checkout@v4\n        run: echo mixed\n`;
    expect(S(before).covered.has(spec)).toBe(false);
    const otherJob = `name: x\non:\n  pull_request:\njobs:\n  bad:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        run: echo mixed\n  good:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test ${spec}\n`;
    expect(S(otherJob).covered.has(spec)).toBe(false);
    // …a clean separated pair still counts.
    const ok = S(
      `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: pnpm exec playwright test ${spec}\n`,
    );
    expect(ok.covered.has(spec)).toBe(true);
  });

  it("Git-invalid action refs are invalid, not trusted — every site (R14)", () => {
    // git check-ref-format rejects each of these, so GitHub cannot resolve
    // the action and the step fails before the claimed downstream test
    // runs. The classifier accepts a narrow allowlist instead of modelling
    // ref grammar (spec §5 L8).
    const bad = [
      "..",
      "foo..bar",
      "/foo",
      "foo/",
      "foo//bar",
      ".foo",
      "foo/.bar",
      "foo.lock",
      "foo.",
    ];
    for (const ref of bad) {
      const full = `owner/repo@${ref}`;
      const direct = S(two(`uses: ${full}`));
      expect(direct.covered.has(spec), `workflow ${full}`).toBe(false);
      expect(direct.rejected[0]!.reason, `workflow ${full}`).toBe(REASON);
      const child = S(two("uses: ./.github/actions/g1"), {
        "./.github/actions/g1": `runs:\n  using: composite\n  steps:\n    - uses: ${full}\n`,
      });
      expect(child.covered.has(spec), `composite child ${full}`).toBe(false);
      const nested = S(two("uses: ./.github/actions/g2"), {
        "./.github/actions/g2":
          "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/g1\n",
        "./.github/actions/g1": `runs:\n  using: composite\n  steps:\n    - uses: ${full}\n`,
      });
      expect(nested.covered.has(spec), `nested ${full}`).toBe(false);
    }
    // …and the well-formed shapes stay trusted: the live tag family, a
    // dotted tag, and a full 40-hex SHA.
    for (const ref of ["v4", "v1.2.3", "main", "release_1", "a".repeat(40)]) {
      expect(S(two(`uses: owner/repo@${ref}`)).covered.has(spec), ref).toBe(true);
    }
  });

  it("invalid composite manifests are opaque: inexact using values, missing steps (R7)", () => {
    // GitHub requires runs.using === "composite" VERBATIM and requires
    // runs.steps — composite!, composite/x, or a steps-less composite is an
    // INVALID action that fails the job at the use site, so the downstream
    // invocation never runs. Treating either as a clean composite was false
    // coverage (R7 probe, direct + nested).
    for (const using of ["composite!", "composite/x", "composite extra"]) {
      const r = S(two("uses: ./.github/actions/bad"), {
        "./.github/actions/bad": `runs:\n  using: ${using}\n  steps:\n    - run: echo hi\n      shell: bash\n`,
      });
      expect(r.covered.has(spec), using).toBe(false);
      expect(r.rejected[0]!.reason, using).toBe(REASON);
    }
    const noSteps = S(two("uses: ./.github/actions/empty"), {
      "./.github/actions/empty": "runs:\n  using: composite\n",
    });
    expect(noSteps.covered.has(spec)).toBe(false);
    expect(noSteps.rejected[0]!.reason).toBe(REASON);
    const nested = S(two("uses: ./.github/actions/p2"), {
      "./.github/actions/p2":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/empty\n",
      "./.github/actions/empty": "runs:\n  using: composite\n",
    });
    expect(nested.covered.has(spec)).toBe(false);
    expect(nested.rejected[0]!.reason).toBe(REASON);
  });

  it("every invalid composite STEP shape is opaque, direct and nested (R8)", () => {
    // GitHub's runner schema: steps is a sequence of run-steps (run + shell,
    // both non-empty) or uses-steps (non-empty uses, NO shell), never both
    // or neither, only known keys. Each invalid shape fails the job at the
    // use site, so the downstream invocation never runs — twelve escaped the
    // textual checks before the shared typed validator landed.
    const bodies: Record<string, string> = {
      "steps-scalar": "runs:\n  using: composite\n  steps: nope\n",
      "steps-mapping": "runs:\n  using: composite\n  steps:\n    a: b\n",
      "steps-null": "runs:\n  using: composite\n  steps:\n",
      "item-scalar": "runs:\n  using: composite\n  steps:\n    - just-a-string\n",
      "missing-shell": "runs:\n  using: composite\n  steps:\n    - run: echo hi\n",
      "neither-run-nor-uses": "runs:\n  using: composite\n  steps:\n    - name: idle\n",
      "run-and-uses":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      uses: ./x\n",
      "uses-with-shell":
        "runs:\n  using: composite\n  steps:\n    - uses: ./x\n      shell: bash\n",
      "run-with-unknown-key":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      bogus: 1\n",
      "run-null": "runs:\n  using: composite\n  steps:\n    - run:\n      shell: bash\n",
      "shell-null": "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell:\n",
      "uses-null": "runs:\n  using: composite\n  steps:\n    - uses:\n",
    };
    for (const [shape, body] of Object.entries(bodies)) {
      const direct = S(two("uses: ./.github/actions/bad"), { "./.github/actions/bad": body });
      expect(direct.covered.has(spec), `direct ${shape}`).toBe(false);
      expect(direct.rejected[0]!.reason, `direct ${shape}`).toBe(REASON);
      const nested = S(two("uses: ./.github/actions/parent"), {
        "./.github/actions/parent":
          "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/bad\n",
        "./.github/actions/bad": body,
      });
      expect(nested.covered.has(spec), `nested ${shape}`).toBe(false);
      expect(nested.rejected[0]!.reason, `nested ${shape}`).toBe(REASON);
    }
    // …and a VALID composite (both step kinds) still resolves clean.
    const ok = S(two("uses: ./.github/actions/ok3"), {
      "./.github/actions/ok3":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n    - uses: actions/checkout@v4\n",
    });
    expect(ok.covered.has(spec)).toBe(true);
  });

  it("acceptance requires the NARROW profile: off-profile shapes are opaque (R9)", () => {
    // R8's validator was a blacklist, so each round found another
    // accepted-but-invalid shape. Acceptance now requires exact conformance
    // to a small profile — per-step-kind key sets, scalar-shaped values — so
    // anything off-profile (valid or not) is opaque and poisons fail-closed.
    const bodies: Record<string, string> = {
      "extra-runs-key":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n  bogus: 1\n",
      "with-on-run-step":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      with:\n        a: b\n",
      "workdir-on-uses-step":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      working-directory: x\n",
      "mapping-name":
        "runs:\n  using: composite\n  steps:\n    - name:\n        a: b\n      run: echo hi\n      shell: bash\n",
      "empty-id":
        "runs:\n  using: composite\n  steps:\n    - id: ''\n      run: echo hi\n      shell: bash\n",
      "mapping-if":
        "runs:\n  using: composite\n  steps:\n    - if:\n        a: b\n      run: echo hi\n      shell: bash\n",
      "sequence-env":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        - a\n",
      "empty-env-key":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        '': b\n",
      "mapping-env-value":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        a:\n          b: c\n",
      "mapping-coe":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      continue-on-error:\n        a: b\n",
      "mapping-workdir":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      working-directory:\n        a: b\n",
      "sequence-with":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      with:\n        - a\n",
      "mapping-with-value":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      with:\n        a:\n          b: c\n",
    };
    for (const [shape, body] of Object.entries(bodies)) {
      const direct = S(two("uses: ./.github/actions/off"), { "./.github/actions/off": body });
      expect(direct.covered.has(spec), `direct ${shape}`).toBe(false);
      expect(direct.rejected[0]!.reason, `direct ${shape}`).toBe(REASON);
      const nested = S(two("uses: ./.github/actions/parent2"), {
        "./.github/actions/parent2":
          "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/off\n",
        "./.github/actions/off": body,
      });
      expect(nested.covered.has(spec), `nested ${shape}`).toBe(false);
      expect(nested.rejected[0]!.reason, `nested ${shape}`).toBe(REASON);
    }
    // On-profile optional keys stay CLEAN — the profile is narrow, not empty.
    const rich = S(two("uses: ./.github/actions/rich"), {
      "./.github/actions/rich":
        "runs:\n  using: composite\n  steps:\n    - name: build\n      id: b1\n      if: always()\n      run: echo hi\n      shell: bash\n      working-directory: sub\n      continue-on-error: false\n      env:\n        A: '1'\n    - name: checkout\n      uses: actions/checkout@v4\n      with:\n        fetch-depth: 0\n",
    });
    expect(rich.covered.has(spec)).toBe(true);
  });

  it("javascript/docker local actions are opaque even when provided (F7)", () => {
    // R1 escaping mutant #1: no runs.steps to inspect, and the entry code
    // can core.addPath / core.exportVariable — presence in the map is not
    // "modeled". Fail-closed.
    const r = S(two("uses: ./.github/actions/js"), {
      "./.github/actions/js": "runs:\n  using: node20\n  main: index.js\n",
    });
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(REASON);
    // R2 refinement: `using: composite` in a multiline description scalar
    // must not masquerade a node action as composite — the check reads the
    // runs: block only.
    const masqueraded = S(two("uses: ./.github/actions/js2"), {
      "./.github/actions/js2":
        "name: x\ndescription: |\n  using: composite\nruns:\n  using: node20\n  main: index.js\n",
    });
    expect(masqueraded.covered.has(spec)).toBe(false);
    expect(masqueraded.rejected[0]!.reason).toBe(REASON);
    // Nested F7 (plan-review R4): a javascript action reached through a
    // composite PARENT is opaque there too, not just at the direct site.
    const nestedJs = S(two("uses: ./.github/actions/pjs"), {
      "./.github/actions/pjs":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/js3\n",
      "./.github/actions/js3": "runs:\n  using: node20\n  main: index.js\n",
    });
    expect(nestedJs.covered.has(spec)).toBe(false);
    expect(nestedJs.rejected[0]!.reason).toBe(REASON);
    // …and a REAL composite with prose elsewhere still resolves clean.
    const proseComposite = S(two("uses: ./.github/actions/ok2"), {
      "./.github/actions/ok2":
        "name: x\ndescription: |\n  helper prose\nruns:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n",
    });
    expect(proseComposite.covered.has(spec)).toBe(true);
  });

  it("multi-document files claim nothing (R3 audit, canonicalized)", () => {
    // parse() throws on a second `---` document, and GitHub does not run
    // multi-document workflow files either — canonicalization returns null
    // and the file is safe-dark: no claims, nothing to falsely cover.
    const w = `${two("run: echo hi")}---\nname: phantom\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected).toEqual([]);
  });

  it("YAML explicit-key syntax cannot hide scanner-read keys at any level (R4/R6, canonicalized)", () => {
    // `? key` / `: value` lines (and R6's bare-indicator split form with an
    // inline comment) parse to ordinary keys. Canonicalization (parse →
    // re-stringify) collapses them BEFORE any regex runs, so the scanner
    // rejects for the TRUE underlying reason, not a spelling refusal.
    const stepIf = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ? if\n        : failure()\n        run: playwright test ${spec}\n`;
    {
      const r = S(stepIf);
      expect(r.covered.has(spec)).toBe(false);
      expect(r.rejected[0]!.reason).toBe("if: condition present");
    }
    const splitExplicit = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ?\n          if # split explicit key\n        :\n          false\n        run: playwright test ${spec}\n`;
    {
      const r = S(splitExplicit);
      expect(r.covered.has(spec)).toBe(false);
      expect(r.rejected[0]!.reason).toBe("if: condition present");
    }
    const explicitPaths = `name: x\non:\n  pull_request:\n    ? paths\n    : ["docs/**"]\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: playwright test ${spec}\n`;
    {
      const r = S(explicitPaths);
      expect(r.covered.has(spec)).toBe(false);
      expect(r.rejected[0]!.reason).toBe("pull_request.paths/paths-ignore filter");
    }
    const explicitUses = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ? uses\n        : ./.github/actions/w\n      - run: pnpm exec playwright test ${spec}\n`;
    {
      const r = S(explicitUses, {
        "./.github/actions/w":
          'runs:\n  using: composite\n  steps:\n    - run: echo "/fake-bin" >> "$GITHUB_PATH"\n      shell: bash\n',
      });
      expect(r.covered.has(spec)).toBe(false);
      // Canonicalized to a plain uses: — the writing action poisons.
      expect(r.rejected[0]!.reason).toBe(REASON);
    }
  });

  it("a YAML tag on an implicit key cannot hide a scanner-read key (R4/R5, canonicalized)", () => {
    // `!!str if:`, bare `! if:`, and verbatim `!<tag:yaml.org,2002:str> if:`
    // all parse as an ordinary if: key — canonicalization collapses the tag
    // before any regex runs, so the TRUE if:-condition rejection fires.
    for (const tag of ["!!str ", "! ", "!<tag:yaml.org,2002:str> "]) {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: gated\n        ${tag}if: 'false'\n        run: playwright test ${spec}\n`;
      const r = S(w);
      expect(r.covered.has(spec), tag).toBe(false);
      expect(r.rejected[0]!.reason, tag).toBe("if: condition present");
    }
  });

  it("an inline comment on a uses: value canonicalizes to the parsed ref (R3 audit)", () => {
    // The parser strips the comment; canonical text carries the plain
    // marketplace ref the runner actually resolves — trusted, covered.
    const r = S(two("uses: actions/checkout@v4 # pin"));
    expect(r.covered.has(spec)).toBe(true);
  });

  it("nested local composites resolve recursively; cycles fail closed (F8)", () => {
    // R1 escaping mutant #2: a composite may `uses:` another local
    // composite; the child's writes must poison the caller's job.
    const parent = "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/child\n";
    const w = two("uses: ./.github/actions/parent");
    const writer = S(w, {
      "./.github/actions/parent": parent,
      "./.github/actions/child":
        'runs:\n  using: composite\n  steps:\n    - run: echo "/fake-bin" >> "$GITHUB_PATH"\n      shell: bash\n',
    });
    expect(writer.covered.has(spec)).toBe(false);
    expect(writer.rejected[0]!.reason).toBe(REASON);
    const clean = S(w, {
      "./.github/actions/parent": parent,
      "./.github/actions/child":
        "runs:\n  using: composite\n  steps:\n    - run: echo ok\n      shell: bash\n",
    });
    expect(clean.covered.has(spec)).toBe(true);
    const cycle = S(two("uses: ./.github/actions/cycle"), {
      "./.github/actions/cycle":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/cycle\n",
    });
    expect(cycle.covered.has(spec)).toBe(false);
    expect(cycle.rejected[0]!.reason).toBe(REASON);
  });

  it("a QUOTED local ref cannot dodge into the trusted-marketplace branch", () => {
    const r = S(two('uses: "./.github/actions/ghost"'));
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(REASON);
  });

  it("YAML-equivalent uses: spellings cannot bypass resolution (R3)", () => {
    // Quoted key, anchored value, folded value, flow mapping — all parse to
    // the same `uses` the typed census resolves; a plain-spelling regex saw
    // none of them (R3 probe: false coverage at direct AND nested sites).
    const writer = {
      "./.github/actions/w":
        'runs:\n  using: composite\n  steps:\n    - run: echo "/fake-bin" >> "$GITHUB_PATH"\n      shell: bash\n',
    };
    const SPELLING = "unmodelled YAML spelling";
    // Quoted KEY: metadata spelling refusal rejects the step and poisons.
    {
      const r = S(two('"uses": ./.github/actions/w'), writer);
      expect(r.covered.has(spec)).toBe(false);
      expect([SPELLING, REASON]).toContain(r.rejected[0]!.reason);
    }
    // Flow-mapping step.
    {
      const r = S(two("{ uses: ./.github/actions/w }"), writer);
      expect(r.covered.has(spec)).toBe(false);
      expect([SPELLING, REASON]).toContain(r.rejected[0]!.reason);
    }
    // Anchored value.
    {
      const r = S(two("uses: &a ./.github/actions/w"), writer);
      expect(r.covered.has(spec)).toBe(false);
      expect([SPELLING, REASON]).toContain(r.rejected[0]!.reason);
    }
    // Folded value (ref on the continuation line).
    {
      const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: >-\n          ./.github/actions/w\n      - ${INVOKE}\n`;
      const r = S(w, writer);
      expect(r.covered.has(spec)).toBe(false);
      expect([SPELLING, REASON]).toContain(r.rejected[0]!.reason);
    }
    // Alias value referencing no anchor: parse-invalid YAML — GitHub would
    // not run it either. Canonicalization nulls out → safe-dark.
    {
      const r = S(two("uses: *w"), writer);
      expect(r.covered.has(spec)).toBe(false);
      expect(r.rejected).toEqual([]);
    }
    // Nested site: a composite manifest hiding its child uses behind an
    // unmodelled spelling is refused whole.
    {
      const parent = 'runs:\n  using: composite\n  steps:\n    - "uses": ./.github/actions/w\n';
      const r = S(two("uses: ./.github/actions/p"), {
        "./.github/actions/p": parent,
        ...writer,
      });
      expect(r.covered.has(spec)).toBe(false);
      expect(r.rejected[0]!.reason).toBe(REASON);
    }
  });

  it("a quoted-key if: spelling cannot hide a condition (R3 class sweep, canonicalized)", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: gated\n        "if": github.event_name == 'push'\n        run: playwright test ${spec}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe("if: condition present");
  });

  it("live metadata shapes stay covered: mid-line JSON env value, JSON in a run body", () => {
    // The live workflows carry single-line JSON env: values (quoted keys sit
    // MID-line after a plain key) and run bodies may embed JSON — neither is
    // step-metadata spelling, so neither may false-dark a step.
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: seed\n        run: |\n          node -e 'x' <<'EOF'\n          {"client_email":"walker-fixture@seed-mode.iam.gserviceaccount.com"}\n          EOF\n      - ${INVOKE}\n`;
    // (heredoc keeps the JSON inside the run VALUE; the metadata check must
    // not see it — the step itself is refused by the census's heredoc rule
    // at the census layer, but the scanner's spelling refusal must not fire.)
    const r = S(w);
    expect(r.covered.has(spec)).toBe(true);
  });

  it("between-step comment prose mentioning GITHUB_ENV does not poison (F6 comment-glue)", () => {
    // The step-splitter glues BETWEEN-step comment lines onto the preceding
    // step's chunk; prose there must stay inert.
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n      # GITHUB_ENV is documented prose, not a write\n      - ${INVOKE}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(true);
  });

  it("chunk-level matching is deliberately broader than run-block matching (spec §5 L5)", () => {
    // A name: line mentioning GITHUB_ENV poisons — conservative direction,
    // costs a rename or a reasoned row, never silent false coverage.
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - name: touch GITHUB_ENV\n        run: echo hi\n      - ${INVOKE}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(REASON);
  });

  it("a poisoned whole-config claim is rejected AND reported, not dropped", () => {
    const CFG = "tests/e2e/standalone.config.ts";
    const members = ["tests/e2e/alpha.spec.ts", "tests/e2e/beta.spec.ts"];
    const w = two(
      'run: echo "X=1" >> "$GITHUB_ENV"',
      `run: pnpm exec playwright test --config ${CFG}`,
    );
    const r = scanWorkflowCoverage({
      workflows: { "w.yml": w },
      packageScripts: {},
      configSpecs: { [CFG]: members },
      localActions: {},
    });
    expect([...r.covered]).toEqual([]);
    expect(r.rejected.map((x) => x.spec).sort()).toEqual([...members].sort());
    expect(new Set(r.rejected.map((x) => x.reason))).toEqual(new Set([REASON]));
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
