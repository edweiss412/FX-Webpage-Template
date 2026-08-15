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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ENV_KEY_ALLOWLIST,
  envAllowlistHygieneProblems,
  envPairGovernance,
  governanceViolations,
  unreviewedLivePairs,
  scanWorkflowCoverage,
  type EnvKeyAllowlist,
} from "./_workflowCoverageScan";
import { listedSpecFiles } from "./_standaloneConfigProbe";

/** ONE loader for live local-action manifests, shared by the scan call, the
 *  env-pair census, and the governance gate (plan-R3 F1: a shallow sibling
 *  walk in any one consumer silently drops NESTED manifests the scanner
 *  discovers, re-opening the unreviewed-pair class at exactly that depth).
 *  Recursive; GitHub manifest preference (action.yml over action.yaml under
 *  one directory key); keys in the `./.github/actions/<relpath>` ref form. */
function localActionTextsUnder(actionsDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(actionsDir)) return out;
  const manifestByDir = new Map<string, string>();
  for (const f of readdirSync(actionsDir, { recursive: true }) as string[]) {
    if (!/(^|[\\/])action\.ya?ml$/.test(f)) continue;
    const dir = `./.github/actions/${f.split(/[\\/]/).slice(0, -1).join("/")}`;
    const prev = manifestByDir.get(dir);
    if (prev === undefined || f.endsWith("action.yml")) manifestByDir.set(dir, f);
  }
  for (const [dir, f] of manifestByDir) out[dir] = readFileSync(join(actionsDir, f), "utf8");
  return out;
}
const liveLocalActions = () => localActionTextsUnder(join(process.cwd(), ".github/actions"));

/** Every env: (key, value-text) pair a live workflow or local action
 *  manifest carries, read from the PARSED documents (spec §2.3 — a grep
 *  would count comments/prose as live usage, laundering stale rows). */
function liveEnvPairs(): Map<string, Set<string>> {
  const pairs = new Map<string, Set<string>>();
  const collect = (env: unknown) => {
    if (env !== null && typeof env === "object" && !Array.isArray(env))
      for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
        const set = pairs.get(k) ?? new Set<string>();
        set.add(typeof v === "string" ? v : String(v));
        pairs.set(k, set);
      }
  };
  const wfDir = join(process.cwd(), ".github/workflows");
  for (const f of readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n))) {
    const doc = parse(readFileSync(join(wfDir, f), "utf8")) as {
      env?: unknown;
      jobs?: Record<string, { env?: unknown; steps?: Array<{ env?: unknown }> }>;
    } | null;
    collect(doc?.env);
    for (const j of Object.values(doc?.jobs ?? {})) {
      collect(j?.env);
      for (const s of Array.isArray(j?.steps) ? j.steps : []) collect(s?.env);
    }
  }
  for (const text of Object.values(liveLocalActions())) {
    const doc = parse(text) as { runs?: { steps?: Array<{ env?: unknown }> } } | null;
    for (const s of Array.isArray(doc?.runs?.steps) ? doc.runs.steps : []) collect(s?.env);
  }
  return pairs;
}

const ROOT = process.cwd();

/** Deliberately-not-PR-gated specs. Every row carries a reason or backlog ref.
 *  The stale-row assertion below flags rows for deleted specs; the shadowing
 *  assertion flags rows whose spec became covered. Populated from the scan
 *  output at introduction time. BL-E2E-APP-DEPENDENT-SPECS-CI-DARK is the umbrella
 *  work item for the UNSEEN rows only — the specs no workflow names. Path-gated rows
 *  ARE named by a workflow and merely are not PR-blocking-capable, which is a
 *  different property and a different (unfiled) question. */
const PATH_GATED =
  "path-gated PR workflow (runs when its filter matches, not PR-blocking-capable per the scanner contract). NOT the BL-E2E-APP-DEPENDENT-SPECS-CI-DARK population: a workflow does name these.";
const PATH_GATED_BY_EXCLUSION =
  "path-gated by EXCLUSION (pull_request.paths-ignore, so it runs unless the change touches only prose no script reads — NOT docs/, which prebuild reads; broader than an allow-list, still not PR-blocking-capable per the scanner contract). NOT the BL-E2E-APP-DEPENDENT-SPECS-CI-DARK population: a workflow does name these.";
const UNSEEN =
  "not named in any workflow run command (project-only --project runs are invisible to the scanner, or no workflow runs it); BL-E2E-APP-DEPENDENT-SPECS-CI-DARK umbrella";
const LOCAL_ONLY_GALLERY_CAPTURE =
  "local review artifact by design - the gallery capture sweep runs only via pnpm screenshot:gallery; no CI job, no committed baselines (docs/superpowers/specs/2026-07-26-gallery-screenshot-capture-design.md section 1.1)";
const LOCAL_ONLY_ALLOWLIST: Record<string, string> = {
  "tests/e2e/screenshots-gallery-capture.spec.ts": LOCAL_ONLY_GALLERY_CAPTURE,
  "tests/e2e/admin-dev.spec.ts": UNSEEN,
  "tests/e2e/admin-changes-feed-layout.spec.ts": UNSEEN,
  "tests/e2e/admin-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/admin-lifecycle-transitions.spec.ts":
    "its lifecycle-layout-e2e.yml run block validates the REPEATS input in a case/if block, and the R12 scanner refuses control-flow run blocks (both branches DO run the spec on every PR — REPEATS defaults to '1' — but the scanner cannot prove branch liveness by regex; the census pins the same block via complex-invocation registry rows). NOT the BL-E2E-APP-DEPENDENT-SPECS-CI-DARK population: this spec runs on every PR.",
  "tests/e2e/admin-nav-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/nojs-loading-notice.spec.ts": PATH_GATED,
  // admin-dashboard-row-actions: rides the SAME admin-layout-e2e.yml job as its
  // three siblings above, whose path filter now also names every production
  // surface this spec guards (ShowRowActions, AnchoredPortal, ShowsTable and the
  // lib/popover placement core), so a regression in any of them fires the gate.
  "tests/e2e/rowactions-geometry.spec.ts": PATH_GATED,
  "tests/e2e/admin-parse-panel.spec.ts": UNSEEN,
  "tests/e2e/admin-route-boundaries.spec.ts": UNSEEN,
  "tests/e2e/admin-settings-admins-refresh.spec.ts": UNSEEN,
  "tests/e2e/attention-modal-gallery.spec.ts":
    "runs in dev-gate-e2e.yml via a project-only --project invocation (invisible to the scanner), which since 2026-08-09 carries a PATH-FILTERED pull_request trigger over the tested surfaces PLUS the daily schedule backstop for out-of-filter drift (24h bound). Not PR-blocking-capable: the job is absent on non-matching PRs, so it cannot join the required set. Gate-placement decision ratified at BL-DEV-GATE-GALLERY-SPEC-ROT close-out (BACKLOG-archive.md): the spec's value is the built ADMIN_DEV_PANEL_ENABLED=true artifact, so the dedicated project stays.",
  "tests/e2e/bell-panel-layout.spec.ts": PATH_GATED,
  "tests/e2e/crew-layout-dimensions.spec.ts": PATH_GATED,
  "tests/e2e/alert-action-links.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/crew-section-toggle.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/font-binding.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/font-rendering-census.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/crew-page.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/deep-link-walker.spec.ts": UNSEEN,
  "tests/e2e/dev-capture.spec.ts": UNSEEN,
  "tests/e2e/developer-tier.spec.ts": UNSEEN,
  "tests/e2e/empty-state-reachability.spec.ts": UNSEEN,
  "tests/e2e/help-auth.spec.ts": UNSEEN,
  "tests/e2e/help-mobile.spec.ts": UNSEEN,
  "tests/e2e/help-screenshots-clock-pipeline.spec.ts": UNSEEN,
  "tests/e2e/help-typography.spec.ts": UNSEEN,
  "tests/e2e/needs-attention-holds.spec.ts": PATH_GATED,
  "tests/e2e/needs-attention-page.spec.ts": UNSEEN,
  "tests/e2e/no-raw-codes.spec.ts": UNSEEN,
  "tests/e2e/onboarding-wizard-step1.spec.ts": UNSEEN,
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
  // Wired 2026-08-10 (M-wave 2 W-E2E): named in crew-e2e.yml's run command.
  "tests/e2e/right-now-transitions.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/roles-settings-layout.spec.ts": UNSEEN,
  "tests/e2e/section-header-visual.spec.ts":
    "invoked only through the section-header-visual.yml docker run … bash -lc '…' block, which the R13 scanner refuses (spec path inside a quoted string is not a command-position invocation, and the block carries $PWD expansion). The census routes that same block through the complex-invocation registry, and the spec's LIVENESS is owned by the byte-comparing visual drift gate itself (a dead run has no fresh capture to compare); BL-SECTION-HEADER-VISUAL-REQUIRED-CONTEXT tracks required-set promotion",
  "tests/e2e/screenshots-help-capture.spec.ts": UNSEEN,
  "tests/e2e/sign-in-page.spec.ts": UNSEEN,
  "tests/e2e/source-link-dimensional.spec.ts": UNSEEN,
  // Named in crew-e2e.yml's run command as of this branch (resolved by desktop-chromium — it
  // moved off mobile-safari when the first CI run measured every non-admin viewer dark on Linux
  // WebKit), so it is paths-ignore-gated like its three siblings rather than unseen.
  "tests/e2e/stage-restricted-crew-schedule.spec.ts": PATH_GATED_BY_EXCLUSION,
  "tests/e2e/telemetry-layout.spec.ts": UNSEEN,
  "tests/e2e/theme-toggle.spec.ts": PATH_GATED_BY_EXCLUSION,
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
  const localActions = liveLocalActions();

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

  it("no spec a paths-ignore workflow RUNS is still classified UNSEEN", () => {
    // The dark/stale/shadowing checks above accept either classification for a
    // path-gated spec, so a forgotten reclassification is silent: a spec can be
    // wired into a workflow and still be counted in the
    // BL-E2E-APP-DEPENDENT-SPECS-CI-DARK census as "no workflow names it".
    // UNSEEN is a claim about the corpus, and this makes it a checkable one.
    const namedByPathsIgnoreWorkflow = new Set<string>();
    for (const yaml of Object.values(workflows)) {
      if (!/^\s*paths-ignore:/m.test(yaml)) continue;
      for (const m of yaml.matchAll(/tests\/e2e\/[\w.-]+\.spec\.ts/g)) {
        namedByPathsIgnoreWorkflow.add(m[0]);
      }
    }
    expect(
      namedByPathsIgnoreWorkflow.size,
      "no paths-ignore workflow names any e2e spec — the scan is wrong",
    ).toBeGreaterThan(0);
    const stillUnseen = [...namedByPathsIgnoreWorkflow]
      .filter((spec) => LOCAL_ONLY_ALLOWLIST[spec] === UNSEEN)
      .sort();
    expect(
      stillUnseen,
      "these specs ARE named in a paths-ignore workflow's run command but their allowlist row " +
        "still says UNSEEN. Reclassify to PATH_GATED_BY_EXCLUSION — a workflow does name them.",
    ).toEqual([]);
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
      // Row swap (2026-08-02 step3 live-render cluster, plan Task 5):
      // agendaBreakdown.layout.spec.ts measured hand-transcribed card chrome
      // and was retired once its assertion families were re-homed onto the
      // real modal tree here.
      "tests/e2e/step3-review-modal.agenda.spec.ts",
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
  const REASON =
    "earlier same-job step writes GITHUB_ENV/GITHUB_PATH or carries an unmodelled static env: key";
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
    // env key CREW_E2E_ONLY: allowlisted live pair ('1') — this fixture pins TYPED-value
    // acceptance, not key modeling (the static-env suite owns key fixtures).
    const ok = `    name: probe\n    runs-on: ubuntu-latest\n    env:\n      CREW_E2E_ONLY: '1'\n    steps:\n      - name: run\n        id: r1\n        run: pnpm exec playwright test ${spec}\n`;
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
    for (const prop of ["github.env", "github.path", "github['env']", 'github["path"]']) {
      const direct = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo /fake-bin >> \${{ ${prop} }}\n      - run: pnpm exec playwright test ${spec}\n`;
      const r = S(direct);
      expect(r.covered.has(spec), `direct ${prop}`).toBe(false);
      expect(r.rejected[0]!.reason, `direct ${prop}`).toBe(REASON);
      const viaAction = S(two("uses: ./.github/actions/w2"), {
        "./.github/actions/w2": `runs:\n  using: composite\n  steps:\n    - run: echo /fake-bin >> \${{ ${prop} }}\n      shell: bash\n`,
      });
      expect(viaAction.covered.has(spec), `composite ${prop}`).toBe(false);
      const nested = S(two("uses: ./.github/actions/p4"), {
        "./.github/actions/p4":
          "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/w2\n",
        "./.github/actions/w2": `runs:\n  using: composite\n  steps:\n    - run: echo /fake-bin >> \${{ ${prop} }}\n      shell: bash\n`,
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
        "runs:\n  using: composite\n  steps:\n    - name: build\n      id: b1\n      if: always()\n      run: echo hi\n      shell: bash\n      working-directory: sub\n      continue-on-error: false\n      env:\n        CREW_E2E_ONLY: '1'\n    - name: checkout\n      uses: actions/checkout@v4\n      with:\n        fetch-depth: 0\n",
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

describe("static env-block key allowlist (static-env spec §2.1)", () => {
  const spec = "tests/e2e/foo.spec.ts";
  const INVOKE = `run: pnpm exec playwright test ${spec}`;
  const ENV_REASON = (keys: string[]) => `env block sets unmodelled key(s): ${keys.join(", ")}`;
  const POISON_REASON =
    "earlier same-job step writes GITHUB_ENV/GITHUB_PATH or carries an unmodelled static env: key";
  // Fixture-local allowlist: fixtures must not couple to live seed rows.
  const ALLOW = {
    GOOD_KEY: { values: [{ text: "v", governs: [] }], reason: "fixture-reviewed test pair" },
  };
  const S = (w: string, localActions: Record<string, string> = {}) =>
    scanWorkflowCoverage({
      workflows: { "w.yml": w },
      packageScripts: {},
      localActions,
      envKeyAllowlist: ALLOW,
    });
  const job = (jobExtra: string, stepExtra = "") =>
    `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n${jobExtra}    steps:\n      - ${INVOKE}\n${stepExtra}`;

  it("workflow-root env with an off-list key rejects every claim in the file (S1)", () => {
    const w = `env:\n  PATH: fixtures/fake\nname: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${INVOKE}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(ENV_REASON(["PATH"]));
  });

  it("job env with an off-list key rejects that job's claims; other jobs stay covered (S1/S3)", () => {
    const dirty = S(job("    env:\n      PATH: fixtures/fake\n"));
    expect(dirty.covered.has(spec)).toBe(false);
    expect(dirty.rejected[0]!.reason).toBe(ENV_REASON(["PATH"]));
    const crossJob = `name: x\non:\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    env:\n      PATH: fixtures/fake\n    steps:\n      - run: echo hi\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${INVOKE}\n`;
    expect(S(crossJob).covered.has(spec)).toBe(true);
  });

  it("step env scoping is per-step: own step rejects, sibling dirt does not leak (S1/S3)", () => {
    const own = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${INVOKE}\n        env:\n          PATH: fixtures/fake\n`;
    const r = S(own);
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(ENV_REASON(["PATH"]));
    const sibling = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n        env:\n          PATH: fixtures/fake\n      - ${INVOKE}\n`;
    expect(S(sibling).covered.has(spec)).toBe(true);
  });

  it("a uses: step handed an off-list env key poisons the job fail-closed (S1, LS3)", () => {
    const w = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        env:\n          PATH: fixtures/fake\n      - ${INVOKE}\n`;
    const r = S(w);
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(POISON_REASON);
  });

  it("a LOCAL uses: invocation handed an off-list env key poisons fail-closed (S1, kind-narrowing)", () => {
    // The shipped matrix pinned the INVOCATION cell only with a REMOTE ref,
    // so `usesKind(step.uses) !== "local"` added to the dirty-env condition
    // escaped every fixture (final review (a) finding 1, probe-backed). Each
    // cell below keeps the resolved manifest CLEAN, so the refusal can only
    // come from the invoking step's own env — a fixture that poisoned via
    // the manifest would pass for the wrong reason.
    const cleanBody =
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n";
    const clean = { "./.github/actions/a": cleanBody };
    const invoke = (envBlock: string) =>
      `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n${envBlock}      - ${INVOKE}\n`;
    const r = S(invoke("        env:\n          PATH: fixtures/fake\n"), clean);
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(POISON_REASON);
    // Precision twin (S3): an allowlisted pair on the same local invocation
    // stays covered, so the cell cannot be satisfied by darking local refs.
    expect(S(invoke("        env:\n          GOOD_KEY: v\n"), clean).covered.has(spec)).toBe(true);
    // Class-sweep of the same shape INSIDE a manifest: a composite step that
    // invokes a LOCAL action while carrying dirty env, at direct AND nested
    // depth. The shipped composite cells pinned only remote refs there.
    const use = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - ${INVOKE}\n`;
    const directLocalUses = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n      env:\n        PATH: fixtures/fake\n",
      "./.github/actions/b": cleanBody,
    };
    const nestedLocalUses = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n",
      "./.github/actions/b":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/c\n      env:\n        PATH: fixtures/fake\n",
      "./.github/actions/c": cleanBody,
    };
    for (const [label, actions] of [
      ["composite-direct-local-uses", directLocalUses],
      ["composite-nested-local-uses", nestedLocalUses],
    ] as const) {
      const c = S(use, actions);
      expect(c.covered.has(spec), label).toBe(false);
      expect(c.rejected[0]!.reason, label).toBe(POISON_REASON);
    }
  });

  it("composite dirt in a LATER sibling still poisons (S1, sibling-position narrowing)", () => {
    // Every other composite cell puts the dirty step FIRST or alone, so a
    // regression that inspects only the first sibling — or recurses only into
    // the first `uses:` — passed all of them while a late-dirty action went
    // uncaught (final review (a) R3, probe-backed). Each fixture below has a
    // CLEAN first sibling, so only genuine traversal past it can refuse.
    const use = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - ${INVOKE}\n`;
    const lateRun = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - run: echo clean\n      shell: bash\n    - run: echo dirty\n      shell: bash\n      env:\n        PATH: fixtures/fake\n",
    };
    const lateUses = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n    - uses: actions/cache@v4\n      env:\n        PATH: fixtures/fake\n",
    };
    // Dirt behind the SECOND `uses:`, one level down: kills first-use-only
    // recursion, which the direct cells cannot see.
    const lateNestedLocal = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n    - uses: ./.github/actions/b\n",
      "./.github/actions/b":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        PATH: fixtures/fake\n",
    };
    for (const [label, actions] of [
      ["late-run-sibling", lateRun],
      ["late-uses-sibling", lateUses],
      ["late-nested-local-uses", lateNestedLocal],
    ] as const) {
      const r = S(use, actions);
      expect(r.covered.has(spec), label).toBe(false);
      expect(r.rejected[0]!.reason, label).toBe(POISON_REASON);
    }
    // Precision twin: a clean LATER sibling must not poison — the cell cannot
    // be satisfied by refusing every multi-step composite.
    const allClean = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - run: echo clean\n      shell: bash\n    - run: echo also-clean\n      shell: bash\n      env:\n        GOOD_KEY: v\n",
    };
    expect(S(use, allClean).covered.has(spec), "clean-late-sibling").toBe(true);
  });

  it("composite matrix: direct/nested x run/uses step env dirt all poison (S1, R1 F1)", () => {
    const use = (ref: string) =>
      `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${ref}\n      - ${INVOKE}\n`;
    const directRun = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        PATH: fixtures/fake\n",
    };
    const directUses = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      env:\n        PATH: fixtures/fake\n",
    };
    const nested = (childSteps: string) => ({
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n",
      "./.github/actions/b": `runs:\n  using: composite\n  steps:\n${childSteps}`,
    });
    const nestedRun = nested(
      "    - run: echo hi\n      shell: bash\n      env:\n        PATH: fixtures/fake\n",
    );
    const nestedUses = nested(
      "    - uses: actions/checkout@v4\n      env:\n        PATH: fixtures/fake\n",
    );
    for (const [label, actions] of [
      ["direct-run", directRun],
      ["direct-uses", directUses],
      ["nested-run", nestedRun],
      ["nested-uses", nestedUses],
    ] as const) {
      const r = S(use("./.github/actions/a"), actions);
      expect(r.covered.has(spec), label).toBe(false);
      expect(r.rejected[0]!.reason, label).toBe(POISON_REASON);
    }
    // Precision twins (S3): the same composites with an ALLOWLISTED key stay
    // covered — every matrix cell, not one representative (plan-R1 F1).
    const cleanDirectRun = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        GOOD_KEY: v\n",
    };
    const cleanDirectUses = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      env:\n        GOOD_KEY: v\n",
    };
    const cleanNestedRun = nested(
      "    - run: echo hi\n      shell: bash\n      env:\n        GOOD_KEY: v\n",
    );
    const cleanNestedUses = nested(
      "    - uses: actions/checkout@v4\n      env:\n        GOOD_KEY: v\n",
    );
    for (const [label, actions] of [
      ["clean-direct-run", cleanDirectRun],
      ["clean-direct-uses", cleanDirectUses],
      ["clean-nested-run", cleanNestedRun],
      ["clean-nested-uses", cleanNestedUses],
    ] as const) {
      expect(S(use("./.github/actions/a"), actions).covered.has(spec), label).toBe(true);
    }
  });

  it("dirt is found in a LATER file and a LATER job step (S1, remaining traversal dimensions)", () => {
    // Implementer class-sweep of the traversal-narrowing family the last
    // three rounds walked one dimension at a time (ref kind, then sibling
    // position): the two iteration axes with no positive cell were the
    // workflow-FILE loop and the job's STEP loop. Both get one here so a
    // first-file-only or first-step-only narrowing cannot escape either.
    const clean = `name: c\non:\n  pull_request:\njobs:\n  c:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`;
    const dirty = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      PATH: fixtures/fake\n    steps:\n      - ${INVOKE}\n`;
    const twoFiles = scanWorkflowCoverage({
      workflows: { "a-clean.yml": clean, "z-dirty.yml": dirty },
      packageScripts: {},
      localActions: {},
      envKeyAllowlist: ALLOW,
    });
    expect(twoFiles.covered.has(spec), "dirty second file").toBe(false);
    expect(twoFiles.rejected[0]!.reason, "dirty second file").toBe(ENV_REASON(["PATH"]));
    // Claiming step is the THIRD step of a job whose env is dirty.
    const lateStep = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      PATH: fixtures/fake\n    steps:\n      - run: echo one\n      - run: echo two\n      - ${INVOKE}\n`;
    const r = S(lateStep);
    expect(r.covered.has(spec), "claim at a later job step").toBe(false);
    expect(r.rejected[0]!.reason, "claim at a later job step").toBe(ENV_REASON(["PATH"]));
  });

  it("dirt is found at a LATER job and a LATER workflow step, per source kind (S1 position matrix)", () => {
    // Completing the position matrix rather than adding one more cell: the
    // refusal path iterates FILES, JOBS, and STEPS, and dirt can sit at job
    // scope, run-step scope, or uses-step scope. Rounds 1-3 pinned the file
    // axis and the composite-sibling axis but left every JOB and every
    // workflow-STEP source at position 0, so first-position-only checks
    // escaped (final review (a) R4 F1). One later-position positive per
    // (iterated thing x source kind) cell.
    // Dirty SECOND job — the first job is clean and non-claiming.
    const secondJob = `name: x\non:\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n  z:\n    runs-on: ubuntu-latest\n    env:\n      PATH: fixtures/fake\n    steps:\n      - ${INVOKE}\n`;
    const j = S(secondJob);
    expect(j.covered.has(spec), "dirty second job").toBe(false);
    expect(j.rejected[0]!.reason, "dirty second job").toBe(ENV_REASON(["PATH"]));
    // Dirty SECOND run-step: the claiming step is itself the later step and
    // carries the dirt, behind a clean first step.
    const secondRun = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n      - ${INVOKE}\n        env:\n          PATH: fixtures/fake\n`;
    const r = S(secondRun);
    expect(r.covered.has(spec), "dirty second run-step").toBe(false);
    expect(r.rejected[0]!.reason, "dirty second run-step").toBe(ENV_REASON(["PATH"]));
    // Dirty SECOND uses-step, behind a clean first uses-step, poisoning the
    // later claim.
    const secondUses = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/cache@v4\n        env:\n          PATH: fixtures/fake\n      - ${INVOKE}\n`;
    const u = S(secondUses);
    expect(u.covered.has(spec), "dirty second uses-step").toBe(false);
    expect(u.rejected[0]!.reason, "dirty second uses-step").toBe(POISON_REASON);
  });

  it("allowlisted pairs stay covered at every direct scope (S3 clean cells)", () => {
    // Workflow-root, run-step, and uses:-step clean twins — the job-scope
    // twin lives in the S2 block. A scope whose clean cell is missing lets
    // an allowlist-ignoring coarsening mutant escape at exactly that scope.
    const root = `env:\n  GOOD_KEY: v\nname: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${INVOKE}\n`;
    expect(S(root).covered.has(spec), "workflow-root").toBe(true);
    const ownStep = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${INVOKE}\n        env:\n          GOOD_KEY: v\n`;
    expect(S(ownStep).covered.has(spec), "run-step").toBe(true);
    const usesStep = `name: x\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        env:\n          GOOD_KEY: v\n      - ${INVOKE}\n`;
    expect(S(usesStep).covered.has(spec), "uses-step").toBe(true);
  });

  it("unknown keys fail closed including prototype-named ones; allowlisted stay covered (S2)", () => {
    for (const key of ["PATH", "TOTALLY_NOVEL_KEY", "constructor"]) {
      const r = S(job(`    env:\n      ${key}: v\n`));
      expect(r.covered.has(spec), key).toBe(false);
      expect(r.rejected[0]!.reason, key).toBe(ENV_REASON([key]));
    }
    expect(S(job("    env:\n      GOOD_KEY: v\n")).covered.has(spec)).toBe(true);
  });

  it("the reason lists ALL off-list keys, sorted (S4/S5)", () => {
    const r = S(job("    env:\n      ZZ_B: v\n      AA_A: v\n"));
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe(ENV_REASON(["AA_A", "ZZ_B"]));
  });

  it("value pinning: an allowlisted key with a NOVEL value fails closed (S7, spec §7 R2)", () => {
    // The R2 live mutant: MODAL_PREFETCH_E2E=0 gated test.skip into a green
    // run with no tests while a key-name-only registry stayed clean. A row
    // pins exact value TEXTS; anything else is off-list like a novel key.
    const novel = S(job("    env:\n      GOOD_KEY: other\n"));
    expect(novel.covered.has(spec)).toBe(false);
    expect(novel.rejected[0]!.reason).toBe(ENV_REASON(["GOOD_KEY"]));
    expect(S(job("    env:\n      GOOD_KEY: v\n")).covered.has(spec)).toBe(true);
  });
});

describe("ENV_KEY_ALLOWLIST hygiene (static-env spec §2.3)", () => {
  it("every allowlist row pins live (key, value) pairs only, with a non-empty reason (S6)", () => {
    // Through the pure checker, so the doctored twin below exercises the SAME
    // assertion logic this live gate runs — not a parallel re-implementation.
    expect(envAllowlistHygieneProblems(ENV_KEY_ALLOWLIST, liveEnvPairs())).toEqual([]);
  });

  it("the action-manifest loader discovers NESTED manifests and prefers action.yml (plan-R3)", () => {
    // Shallow-walk mutant: a nested action's env pair escapes the live
    // completeness census while the scanner (which resolves any uses: path)
    // still executes it. One shared loader + this fixture pins the depth.
    const base = mkdtempSync(join(tmpdir(), "actions-depth-"));
    try {
      mkdirSync(join(base, "group/nested"), { recursive: true });
      writeFileSync(
        join(base, "group/nested/action.yml"),
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        NESTED_KEY: x\n",
      );
      writeFileSync(join(base, "group/nested/action.yaml"), "runs:\n  using: composite\n");
      const found = localActionTextsUnder(base);
      expect(Object.keys(found)).toEqual(["./.github/actions/group/nested"]);
      expect(found["./.github/actions/group/nested"]).toContain("NESTED_KEY");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("every LIVE env pair has a reviewed row — the seed cannot drift over-tight (plan-R2)", () => {
    // The inverse direction of the stale-row check: hygiene that only asserts
    // declared→live lets a NEW live pair sit unreviewed forever (the plan-R2
    // probe: GH_APP_TOKEN landed in x-audits.yml with no row, every gate
    // green). Live→declared closes the drift class, not the one instance.
    expect(unreviewedLivePairs(ENV_KEY_ALLOWLIST, liveEnvPairs())).toEqual([]);
  });

  it("every row's governs equals the live derivation — relocation reds (S8, spec §7 R3)", () => {
    const wfDir = join(process.cwd(), ".github/workflows");
    const workflows = Object.fromEntries(
      readdirSync(wfDir)
        .filter((n) => /\.ya?ml$/.test(n))
        .map((f) => [f, readFileSync(join(wfDir, f), "utf8")]),
    );
    // Same recognizer inputs as the live scan (§7 R4): alias resolution and
    // the whole-config literal both confer governance; prose does not.
    const packageScripts = (
      JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    const configSpecs = {
      "tests/e2e/standalone.config.ts": listedSpecFiles().map((f) => `tests/e2e/${f}`),
    };
    const localActions = liveLocalActions();
    expect(
      governanceViolations(
        ENV_KEY_ALLOWLIST,
        envPairGovernance(workflows, packageScripts, configSpecs, ENV_KEY_ALLOWLIST, localActions),
      ),
    ).toEqual([]);
  });

  it("the governance checker reds a relocated pair and a silently-gained one (S8 doctored twins)", () => {
    const claiming = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: pnpm exec playwright test tests/e2e/x.spec.ts\n`;
    const relocated = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test tests/e2e/x.spec.ts\n  other:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: echo parked\n`;
    const row = { K: { values: [{ text: "v", governs: ["tests/e2e/x.spec.ts"] }], reason: "r" } };
    const gv = (
      workflows: Record<string, string>,
      packageScripts: Record<string, string> = {},
      allowlist: EnvKeyAllowlist = row,
    ) => envPairGovernance(workflows, packageScripts, {}, allowlist);
    // The R3 mutant: pair parked at a non-claiming site — pair-level presence
    // still holds, governance does not.
    expect(governanceViolations(row, gv({ "w.yml": claiming }))).toEqual([]);
    expect(governanceViolations(row, gv({ "w.yml": relocated }))).toHaveLength(1);
    // The inverse drift: a pair silently GAINING governance must also red.
    const bare = { K: { values: [{ text: "v", governs: [] }], reason: "r" } };
    expect(governanceViolations(bare, gv({ "w.yml": claiming }, {}, bare))).toHaveLength(1);
    // R4 launder twin: prose is not a claim. A pair parked on an echo step
    // that PRINTS the spec path confers no governance — the declared row
    // reds instead of being laundered through non-command-position text.
    const parked = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test tests/e2e/x.spec.ts\n  park:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: echo tests/e2e/x.spec.ts\n`;
    expect(governanceViolations(row, gv({ "w.yml": parked }))).toHaveLength(1);
    // …and alias-resolved claims DO confer it (same recognizer as the scan).
    const aliased = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: pnpm run e2e:x\n`;
    expect(
      governanceViolations(
        row,
        gv({ "w.yml": aliased }, { "e2e:x": "playwright test tests/e2e/x.spec.ts" }),
      ),
    ).toEqual([]);
    // R5 duplicate-substitution twin: governance is credited ONLY at the
    // scan's covered.add site, so a DISQUALIFIED duplicate of the real
    // invocation (path-gated here) carrying the pair confers nothing — the
    // declaring row reds while pair presence and recognition both hold.
    const substituted = {
      "real.yml": `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm exec playwright test tests/e2e/x.spec.ts\n`,
      "gated.yml": `on:\n  pull_request:\n    paths:\n      - docs/**\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: pnpm exec playwright test tests/e2e/x.spec.ts\n`,
    };
    expect(governanceViolations(row, gv(substituted))).toHaveLength(1);
  });

  it("a VALUE swap between a claiming and a parked site reds (S8 pair-keyed governance)", () => {
    // Key-keyed governance could not see this: a row pinning two live values
    // keeps one `governs` list, so swapping which value sits at the claiming
    // site leaves pair presence, completeness, and equality all green while a
    // value-gated spec self-skips (final review (a) R2 probe, live-
    // representable — SUPABASE_URL, SUPABASE_SECRET_KEY and TEST_AUTH_SECRET
    // each pin multiple live values). Governance is keyed by (key, value).
    const CLAIM = "run: pnpm exec playwright test tests/e2e/x.spec.ts";
    const tree = (claimingValue: string, parkedValue: string) => ({
      "w.yml": `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: ${claimingValue}\n    steps:\n      - ${CLAIM}\n  other:\n    runs-on: ubuntu-latest\n    env:\n      K: ${parkedValue}\n    steps:\n      - run: echo parked\n`,
    });
    // Declared: "required" gates the spec, "inert" gates nothing.
    const row: EnvKeyAllowlist = {
      K: {
        values: [
          { text: "required", governs: ["tests/e2e/x.spec.ts"] },
          { text: "inert", governs: [] },
        ],
        reason: "r",
      },
    };
    const gv = (workflows: Record<string, string>) => envPairGovernance(workflows, {}, {}, row);
    // Faithful tree: the claiming job carries the gating value.
    expect(governanceViolations(row, gv(tree("required", "inert"))), "faithful").toEqual([]);
    // Swapped: BOTH values are still live and still allowlisted, and a
    // key-keyed derivation is byte-identical here — only the pair-keyed one
    // sees that "required" no longer governs and "inert" now does.
    const swapped = governanceViolations(row, gv(tree("inert", "required")));
    expect(swapped, "swapped").toHaveLength(2);
    expect(swapped.join("\n")).toMatch(/K=required/);
    expect(swapped.join("\n")).toMatch(/K=inert/);
    // Pair-level hygiene stays green across the swap — it is exactly the
    // check that cannot catch this, which is why governance must be keyed by
    // the pair rather than the key.
    const live = new Map([["K", new Set(["required", "inert"])]]);
    expect(envAllowlistHygieneProblems(row, live), "stale hygiene blind").toEqual([]);
    expect(unreviewedLivePairs(row, live), "completeness blind").toEqual([]);
  });

  it("governance is credited at workflow-root, run-step, and whole-config sites (S8 scope cells)", () => {
    // Every shipped governance positive used JOB-level env and passed no
    // configSpecs, so deleting the workflow-root credit, deleting the
    // run-step credit, or dropping configSpecs from the wrapper each escaped
    // all of them (final review (a) finding 2, probe-backed). A regressed
    // credit makes a mechanically derived row declare `governs: []`, and a
    // relocation of that pair then passes both hygiene directions.
    const CFG = "tests/e2e/standalone.config.ts";
    const row = { K: { values: [{ text: "v", governs: ["tests/e2e/x.spec.ts"] }], reason: "r" } };
    const bare = { K: { values: [{ text: "v", governs: [] }], reason: "r" } };
    const gv = (
      workflows: Record<string, string>,
      configSpecs: Record<string, string[]> = {},
      allowlist: EnvKeyAllowlist = row,
    ) => envPairGovernance(workflows, {}, configSpecs, allowlist);
    const CLAIM = "run: pnpm exec playwright test tests/e2e/x.spec.ts";
    // Workflow-root env governs the claims below it.
    const root = `env:\n  K: v\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${CLAIM}\n`;
    expect(governanceViolations(row, gv({ "w.yml": root })), "root credit").toEqual([]);
    expect(governanceViolations(bare, gv({ "w.yml": root }, {}, bare)), "root gain").toHaveLength(
      1,
    );
    // Run-step env on the claiming step itself governs that step's claims.
    const step = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${CLAIM}\n        env:\n          K: v\n`;
    expect(governanceViolations(row, gv({ "w.yml": step })), "step credit").toEqual([]);
    expect(governanceViolations(bare, gv({ "w.yml": step }, {}, bare)), "step gain").toHaveLength(
      1,
    );
    // Whole-config recognition: the config's MEMBERS are the governed claims,
    // so a wrapper that drops configSpecs derives nothing at this site.
    const cfg = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: pnpm exec playwright test --config ${CFG}\n`;
    const members = { [CFG]: ["tests/e2e/x.spec.ts"] };
    expect(governanceViolations(row, gv({ "w.yml": cfg }, members)), "config credit").toEqual([]);
    expect(
      governanceViolations(bare, gv({ "w.yml": cfg }, members, bare)),
      "config gain",
    ).toHaveLength(1);
  });

  it("governance is credited at LATER positions and accumulates over ALL claims (S8 position/cardinality)", () => {
    // The credit-site fixtures pinned WHICH scopes confer governance but put
    // every positive at position 0 with exactly one governed spec, so a
    // derivation truncated to the first job, first step, first configSpecs
    // member, or first accumulated claim passed all of them — and a
    // correspondingly truncated row then satisfied governanceViolations,
    // re-opening relocation/value-swap for every omitted claim (final review
    // (a) R4 F2). Position AND cardinality, per iterated thing.
    const CFG = "tests/e2e/standalone.config.ts";
    const gv = (
      workflows: Record<string, string>,
      allowlist: EnvKeyAllowlist,
      configSpecs: Record<string, string[]> = {},
    ) => envPairGovernance(workflows, {}, configSpecs, allowlist);
    const rowFor = (governs: string[]): EnvKeyAllowlist => ({
      K: { values: [{ text: "v", governs }], reason: "r" },
    });
    const claimOf = (s: string) => `run: pnpm exec playwright test ${s}`;
    // LATER JOB: the first job is clean and claiming; the pair sits in job two.
    const laterJob = `on:\n  pull_request:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - ${claimOf("tests/e2e/a.spec.ts")}\n  z:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - ${claimOf("tests/e2e/z.spec.ts")}\n`;
    const jobRow = rowFor(["tests/e2e/z.spec.ts"]);
    expect(governanceViolations(jobRow, gv({ "w.yml": laterJob }, jobRow)), "later job").toEqual(
      [],
    );
    // LATER STEP: step-scope pair on the SECOND step of a job.
    const laterStep = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${claimOf("tests/e2e/a.spec.ts")}\n      - ${claimOf("tests/e2e/z.spec.ts")}\n        env:\n          K: v\n`;
    const stepRow = rowFor(["tests/e2e/z.spec.ts"]);
    expect(
      governanceViolations(stepRow, gv({ "w.yml": laterStep }, stepRow)),
      "later step",
    ).toEqual([]);
    // CARDINALITY, whole-config: a config with TWO members governs BOTH.
    const cfgWf = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: pnpm exec playwright test --config ${CFG}\n`;
    const members = { [CFG]: ["tests/e2e/a.spec.ts", "tests/e2e/b.spec.ts"] };
    const bothCfg = rowFor(["tests/e2e/a.spec.ts", "tests/e2e/b.spec.ts"]);
    expect(
      governanceViolations(bothCfg, gv({ "w.yml": cfgWf }, bothCfg, members)),
      "both config members",
    ).toEqual([]);
    // …and a row naming only the FIRST member must RED, so a truncated
    // derivation cannot be satisfied by a matching truncated row.
    const firstCfgOnly = rowFor(["tests/e2e/a.spec.ts"]);
    expect(
      governanceViolations(firstCfgOnly, gv({ "w.yml": cfgWf }, firstCfgOnly, members)),
      "truncated config row",
    ).toHaveLength(1);
    // CARDINALITY, accumulation: two claiming steps under one governing scope.
    const twoClaims = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - ${claimOf("tests/e2e/a.spec.ts")}\n      - ${claimOf("tests/e2e/b.spec.ts")}\n`;
    const bothClaims = rowFor(["tests/e2e/a.spec.ts", "tests/e2e/b.spec.ts"]);
    expect(
      governanceViolations(bothClaims, gv({ "w.yml": twoClaims }, bothClaims)),
      "both accumulated claims",
    ).toEqual([]);
    const firstClaimOnly = rowFor(["tests/e2e/a.spec.ts"]);
    expect(
      governanceViolations(firstClaimOnly, gv({ "w.yml": twoClaims }, firstClaimOnly)),
      "truncated accumulation row",
    ).toHaveLength(1);
  });

  it("governance credits the EFFECTIVE value after scope precedence (S8 shadowing)", () => {
    // GitHub precedence is step > job > workflow. Crediting every
    // syntactically in-scope pair let a SHADOWED value keep the governance of
    // the value that actually reaches the runner, so swapping the two left
    // governance byte-identical while the effective value flipped from the
    // one that runs the spec to the one that self-skips it (final review (a)
    // R5 F1). All three precedence pairs are pinned.
    const CLAIM = "run: pnpm exec playwright test tests/e2e/x.spec.ts";
    const X = ["tests/e2e/x.spec.ts"];
    const declared: EnvKeyAllowlist = {
      K: {
        values: [
          { text: "required", governs: X },
          { text: "inert", governs: [] },
        ],
        reason: "r",
      },
    };
    const gv = (wf: string) => envPairGovernance({ "w.yml": wf }, {}, {}, declared);
    const rootJob = (root: string, job: string) =>
      `env:\n  K: ${root}\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: ${job}\n    steps:\n      - ${CLAIM}\n`;
    const rootStep = (root: string, step: string) =>
      `env:\n  K: ${root}\non:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - ${CLAIM}\n        env:\n          K: ${step}\n`;
    const jobStep = (job: string, step: string) =>
      `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: ${job}\n    steps:\n      - ${CLAIM}\n        env:\n          K: ${step}\n`;
    for (const [label, wf] of [
      ["root<job", rootJob],
      ["root<step", rootStep],
      ["job<step", jobStep],
    ] as const) {
      // Effective value is `required`; the shadowed `inert` governs nothing.
      expect(governanceViolations(declared, gv(wf("inert", "required"))), label).toEqual([]);
      // Swapped: effective value is now `inert`, so the SAME row must red —
      // the assertion a scope-blind derivation cannot make.
      expect(
        governanceViolations(declared, gv(wf("required", "inert"))),
        `${label} swapped`,
      ).not.toEqual([]);
    }
  });

  it("action-scoped env pairs govern later claims in the job (S8, R5 F2)", () => {
    // A pair handed to a `uses:` invocation, or carried by a step of the
    // composite it resolves, is part of the job's execution context: an
    // action gated on it can decide whether the later spec does anything.
    // Crediting nothing there left relocation of such a pair invisible.
    const CLAIM = "run: pnpm exec playwright test tests/e2e/x.spec.ts";
    const X = ["tests/e2e/x.spec.ts"];
    const declared: EnvKeyAllowlist = { K: { values: [{ text: "v", governs: X }], reason: "r" } };
    const gv = (wf: string, actions: Record<string, string> = {}) =>
      envPairGovernance({ "w.yml": wf }, {}, {}, declared, actions);
    const cleanBody =
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n";
    // (a) env on the local `uses:` INVOCATION itself.
    const invocation = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n        env:\n          K: v\n      - ${CLAIM}\n`;
    expect(
      governanceViolations(declared, gv(invocation, { "./.github/actions/a": cleanBody })),
      "uses-invocation env",
    ).toEqual([]);
    // (b) composite RUN-step env and (c) NESTED composite step env.
    const use = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - ${CLAIM}\n`;
    const compositeRun = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        K: v\n",
    };
    const nested = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n",
      "./.github/actions/b":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        K: v\n",
    };
    for (const [label, actions] of [
      ["composite-run env", compositeRun],
      ["nested-composite env", nested],
    ] as const) {
      expect(governanceViolations(declared, gv(use, actions)), label).toEqual([]);
    }
    // Relocation twin: park the pair on a NON-claiming job and the declaring
    // row reds — the whole point of crediting these sites.
    const parked = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - ${CLAIM}\n  park:\n    runs-on: ubuntu-latest\n    env:\n      K: v\n    steps:\n      - run: echo parked\n`;
    expect(
      governanceViolations(declared, gv(parked, { "./.github/actions/a": cleanBody })),
      "relocated away from the action site",
    ).toHaveLength(1);
    // Action-scoped credit is ADDITIVE, never suppressed by a same-key
    // direct value (R7 F1). Precedence resolves what ONE step sees; an
    // earlier action saw its own value regardless of what the claiming step
    // later sets, so BOTH pairs govern. An earlier draft asserted the
    // opposite ("direct scope wins"), which let `K=required` at an action be
    // relocated freely whenever the claiming step carried `K=inert`.
    const bothScopes = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      K: direct\n    steps:\n      - uses: ./.github/actions/a\n        env:\n          K: v\n      - ${CLAIM}\n`;
    const twoValues: EnvKeyAllowlist = {
      K: {
        values: [
          { text: "direct", governs: X },
          { text: "v", governs: X },
        ],
        reason: "r",
      },
    };
    expect(
      governanceViolations(
        twoValues,
        envPairGovernance({ "w.yml": bothScopes }, {}, {}, twoValues, {
          "./.github/actions/a": cleanBody,
        }),
      ),
      "action-scoped and direct values BOTH govern",
    ).toEqual([]);
    // …and a row crediting only the direct value reds, so a suppressing
    // derivation cannot be satisfied by a correspondingly narrowed row.
    const directOnly: EnvKeyAllowlist = {
      K: {
        values: [
          { text: "direct", governs: X },
          { text: "v", governs: [] },
        ],
        reason: "r",
      },
    };
    expect(
      governanceViolations(
        directOnly,
        envPairGovernance({ "w.yml": bothScopes }, {}, {}, directOnly, {
          "./.github/actions/a": cleanBody,
        }),
      ),
      "direct-only row must red",
    ).toHaveLength(1);
    // Composite `uses:`-step env governs too, at direct AND nested depth
    // (R7 (b) F2 — the S8 positives covered run-step env only).
    const usesEnvDirect = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      env:\n        K: v\n",
    };
    const usesEnvNested = {
      "./.github/actions/a":
        "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n",
      "./.github/actions/b":
        "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      env:\n        K: v\n",
    };
    for (const [label, actions] of [
      ["composite uses-step env", usesEnvDirect],
      ["nested composite uses-step env", usesEnvNested],
    ] as const) {
      expect(governanceViolations(declared, gv(use, actions)), label).toEqual([]);
    }
  });

  it("action-scoped governance keeps EVERY value and skips guarded steps (S8, R6)", () => {
    // Two sub-holes in the action-scoped credit added at R5: a Map collapsed
    // two action-scoped VALUES of one key so only the last was credited
    // (R6 F1), and a step provably not running still conferred governance
    // (R6 F2).
    const CLAIM = "run: pnpm exec playwright test tests/e2e/x.spec.ts";
    const X = ["tests/e2e/x.spec.ts"];
    const cleanBody =
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n";
    const gv = (wf: string, allowlist: EnvKeyAllowlist, actions: Record<string, string> = {}) =>
      envPairGovernance({ "w.yml": wf }, {}, {}, allowlist, actions);
    // F1: two invocations handed DIFFERENT values of one key — both govern.
    const twoValues = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n        env:\n          K: required\n      - uses: ./.github/actions/a\n        env:\n          K: inert\n      - ${CLAIM}\n`;
    const bothDeclared: EnvKeyAllowlist = {
      K: {
        values: [
          { text: "required", governs: X },
          { text: "inert", governs: X },
        ],
        reason: "r",
      },
    };
    expect(
      governanceViolations(
        bothDeclared,
        gv(twoValues, bothDeclared, { "./.github/actions/a": cleanBody }),
      ),
      "both action-scoped values govern",
    ).toEqual([]);
    // …and a row crediting only the LAST value must red, so a collapsing
    // derivation cannot be satisfied by a correspondingly collapsed row.
    const lastOnly: EnvKeyAllowlist = {
      K: {
        values: [
          { text: "required", governs: [] },
          { text: "inert", governs: X },
        ],
        reason: "r",
      },
    };
    expect(
      governanceViolations(lastOnly, gv(twoValues, lastOnly, { "./.github/actions/a": cleanBody })),
      "last-value-only row",
    ).toHaveLength(1);
    // F2: a GUARDED invocation confers nothing — it provably may not run.
    const guardedInvocation = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n        if: false\n        env:\n          K: v\n      - ${CLAIM}\n`;
    const bare: EnvKeyAllowlist = { K: { values: [{ text: "v", governs: [] }], reason: "r" } };
    expect(
      governanceViolations(bare, gv(guardedInvocation, bare, { "./.github/actions/a": cleanBody })),
      "guarded invocation confers nothing",
    ).toEqual([]);
    // A guarded COMPOSITE step confers nothing. The condition must be a
    // STRING: `validatedCompositeSteps` accepts `if:` on composite steps but
    // rejects a YAML BOOLEAN on type, and an earlier draft used `if: false`
    // and so proved nothing — the claim was never covered, making the
    // assertion vacuous, and it led to a wrong "this is unreachable"
    // conclusion (corrected at R7). With a string condition the claim stays
    // COVERED, so the assertion below is about governance, as intended.
    const use = `on:\n  pull_request:\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - ${CLAIM}\n`;
    const guardedCompositeStep = {
      "./.github/actions/a":
        'runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      if: "${{ false }}"\n      env:\n        K: v\n',
    };
    const r = scanWorkflowCoverage({
      workflows: { "w.yml": use },
      packageScripts: {},
      localActions: guardedCompositeStep,
      envKeyAllowlist: bare,
    });
    expect(r.covered.has("tests/e2e/x.spec.ts"), "guarded composite step stays covered").toBe(true);
    expect(
      governanceViolations(bare, gv(use, bare, guardedCompositeStep)),
      "guarded composite step confers nothing",
    ).toEqual([]);
    // Guarded PARENT hides its whole subtree.
    const guardedParent = {
      "./.github/actions/a":
        'runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n      if: "${{ false }}"\n',
      "./.github/actions/b":
        "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      env:\n        K: v\n",
    };
    expect(
      governanceViolations(bare, gv(use, bare, guardedParent)),
      "guarded parent hides nested pair",
    ).toEqual([]);
  });

  it("the stale-row detector actually reads its inputs (S6 doctored twin)", () => {
    // Each doctored allowlist must red through the SAME checker the live
    // gate invokes — deleting a live assertion cannot leave this twin green.
    const live = new Map([["K", new Set(["v"])]]);
    const row = (over: Partial<EnvKeyAllowlist[string]>): EnvKeyAllowlist => ({
      K: { values: [{ text: "v", governs: [] }], reason: "r", ...over },
    });
    expect(envAllowlistHygieneProblems(row({}), live)).toEqual([]);
    const ghost = {
      GHOST_KEY_NEVER_LIVE: { values: [{ text: "v", governs: [] }], reason: "r" },
    };
    expect(envAllowlistHygieneProblems(ghost, live)).toHaveLength(1);
    expect(envAllowlistHygieneProblems(ghost, live)[0]).toMatch(/stale env-key row/);
    expect(envAllowlistHygieneProblems(row({ values: [] }), live)[0]).toMatch(/value-less/);
    expect(
      envAllowlistHygieneProblems(
        row({
          values: [
            { text: "v", governs: [] },
            { text: "__NEVER_LIVE__", governs: [] },
          ],
        }),
        live,
      )[0],
    ).toMatch(/stale pinned value/);
    expect(envAllowlistHygieneProblems(row({ reason: "  " }), live)[0]).toMatch(/reason-less/);
    // Completeness twin (plan-R2): a live pair with no row, and a live VALUE
    // outside its row's pins, each red through the same live→declared checker.
    expect(unreviewedLivePairs(row({}), live)).toEqual([]);
    const extraKey = new Map([...live, ["NEW_LIVE_KEY", new Set(["x"])]]);
    expect(unreviewedLivePairs(row({}), extraKey)).toHaveLength(1);
    expect(unreviewedLivePairs(row({}), extraKey)[0]).toMatch(/unreviewed live env pair/);
    const extraValue = new Map([["K", new Set(["v", "v2"])]]);
    expect(unreviewedLivePairs(row({}), extraValue)).toHaveLength(1);
    expect(unreviewedLivePairs(row({}), extraValue)[0]).toMatch(/NEW_LIVE|K=v2/);
  });
});
