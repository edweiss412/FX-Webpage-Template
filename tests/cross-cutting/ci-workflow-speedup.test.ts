import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

/** The subset of a GitHub Actions step this file asserts on. */
type WorkflowStep = {
  name?: string;
  id?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, unknown>;
};

// Structural guards for the CI-speedup changes (PR A — Phase 1 + Phase 2c).
// These are regression guards, not behavior tests: they pin the workflow-yaml
// shape so a later edit cannot silently delete a concurrency block, the
// screenshots-drift path filter, the apt-get fast-path, or the Playwright
// browser cache. Mirrors the established string-match pattern in
// tests/cross-cutting/playwright-version-pin.test.ts (no yaml dependency).

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

function readWorkflow(name: string): string {
  return readFileSync(join(WORKFLOWS_DIR, name), "utf8");
}

// Every workflow that fires on `pull_request` should cancel superseded runs
// when the PR branch is re-pushed, so a stale run does not hold a runner while
// the new commit waits. Discovered dynamically (not a hardcoded list) so a
// future pull_request workflow added without a concurrency block fails this
// guard instead of silently false-greening it.
const PR_FIRING_WORKFLOWS = readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith(".yml"))
  .filter((f) => /\n {2}pull_request:/.test(readWorkflow(f)));

describe("CI speedup — concurrency cancel-in-progress on every PR-firing workflow", () => {
  // Anti-vacuity: if the discovery regex broke and matched nothing, it.each
  // below would pass with zero cases. Pin that discovery actually found the
  // known PR-firing workflows.
  it("discovers the known PR-firing workflows (guards against an empty match)", () => {
    expect(PR_FIRING_WORKFLOWS).toContain("quality.yml");
    expect(PR_FIRING_WORKFLOWS).toContain("unit-suite.yml");
    expect(PR_FIRING_WORKFLOWS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(PR_FIRING_WORKFLOWS)(
    "%s declares a concurrency group that cancels superseded PR runs (PR-only)",
    (file) => {
      const yaml = readWorkflow(file);
      // cancel-in-progress is gated to pull_request so re-pushing a PR cancels
      // the stale run, but post-merge `push: main` (and schedule) runs are NEVER
      // cancelled — every main commit gets a full verification run, and a
      // superseded main run no longer reports as a spurious "cancelled" failure.
      expect(
        /\nconcurrency:\s*\n\s+group:\s*.+\n\s+cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/.test(
          yaml,
        ),
        `${file} must set \`cancel-in-progress: \${{ github.event_name == 'pull_request' }}\` — ` +
          `cancel superseded PR re-pushes, but never cancel post-merge main runs.`,
      ).toBe(true);
    },
  );

  it.each(PR_FIRING_WORKFLOWS)(
    "%s scopes the concurrency group per git ref (not a single global group)",
    (file) => {
      const yaml = readWorkflow(file);
      const match = /\nconcurrency:\s*\n\s+group:\s*(.+)/.exec(yaml);
      expect(match, `${file} is missing a concurrency group line`).not.toBeNull();
      expect(
        match?.[1] ?? "",
        `${file} concurrency group must reference \${{ github.ref }} so distinct PRs ` +
          `(and main) do not cancel each other.`,
      ).toContain("github.ref");
    },
  );
});

describe("CI speedup — screenshots-drift runs per-PR only on render-affecting paths", () => {
  const yaml = readWorkflow("screenshots-drift.yml");

  it("scopes the pull_request trigger to a paths allow-list (not a bare trigger)", () => {
    expect(
      /\n {2}pull_request:\s*\n {4}paths:/.test(yaml),
      "screenshots-drift.yml must scope `pull_request:` to a `paths:` allow-list so it " +
        "does not boot Supabase + a Docker Playwright image on PRs that touch no rendered surface.",
    ).toBe(true);
  });

  // The allow-list must cover every input the capture can render from: the
  // rendered routes/components/tokens (app/**, components/**), the seeded data
  // pipeline (parser → fixtures → seed → migrations), and the capture infra.
  const REQUIRED_PATHS = [
    '"app/**"',
    '"components/**"',
    '"lib/parser/**"',
    '"fixtures/shows/**"',
    '"supabase/seed.ts"',
    '"supabase/migrations/**"',
    '"public/help/screenshots/**"',
    '"scripts/capture-core.ts"',
    '"scripts/help-screenshots.ts"',
    '"scripts/ci/**"',
    '"playwright.screenshots.config.ts"',
    '"tests/e2e/helpers/**"',
    '".github/workflows/screenshots-drift.yml"',
  ];

  it.each(REQUIRED_PATHS)("allow-list includes %s", (glob) => {
    expect(
      yaml.includes(glob),
      `screenshots-drift.yml paths allow-list is missing ${glob} — a change there can ` +
        `alter a captured screenshot, so it must re-trigger the drift gate.`,
    ).toBe(true);
  });

  it("retains the nightly schedule cron as the unfiltered full-coverage backstop", () => {
    expect(
      /\n {2}schedule:\s*\n {4}- cron:/.test(yaml),
      "screenshots-drift.yml MUST keep its `schedule: cron` — the nightly run is unfiltered " +
        "and is the safety net that catches drift on any PR the paths allow-list skipped.",
    ).toBe(true);
  });

  it("retains workflow_dispatch for on-demand verification", () => {
    expect(yaml.includes("workflow_dispatch:")).toBe(true);
  });
});

describe("CI speedup — host psql install skips apt-get update when psql is present", () => {
  const allWorkflows = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml"));

  // GitHub's ubuntu-latest image already ships postgresql-client most of the
  // time; `apt-get update` is the slow part. Guarding every host (sudo) install
  // with `command -v psql` skips the update+install when psql already resolves.
  // The in-container install in screenshots-drift (no `sudo`, inside the Docker
  // bash -lc) is intentionally excluded — it runs in a clean image each time.
  it.each(allWorkflows)(
    "%s: every host (sudo) postgresql-client install is guarded by `command -v psql`",
    (file) => {
      const offenders = readWorkflow(file)
        .split("\n")
        .filter(
          (line) =>
            line.includes("sudo apt-get") &&
            line.includes("postgresql-client") &&
            !line.includes("command -v psql"),
        );
      expect(
        offenders,
        `${file} has unguarded host psql install(s); wrap with ` +
          `\`command -v psql >/dev/null || (...)\` to skip apt-get update when psql exists:\n` +
          offenders.join("\n"),
      ).toEqual([]);
    },
  );
});

describe("CI speedup — Playwright browser binaries are cached on the e2e workflows", () => {
  // These three native-runner workflows download chromium (+ webkit) every run.
  // Caching ~/.cache/ms-playwright restores the binaries on a hit so only OS
  // deps (install-deps) re-run. screenshots-drift is intentionally excluded —
  // its browsers are baked into the pinned Docker image, not ~/.cache.
  const PW_WORKFLOWS = ["help-affordances.yml", "crew-e2e.yml", "dev-gate-e2e.yml"];

  it.each(PW_WORKFLOWS)("%s caches ~/.cache/ms-playwright via actions/cache@v4", (file) => {
    const yaml = readWorkflow(file);
    expect(
      yaml.includes("actions/cache@v4") && yaml.includes("~/.cache/ms-playwright"),
      `${file} must add an actions/cache@v4 step on path ~/.cache/ms-playwright so Playwright ` +
        `browser binaries are restored instead of re-downloaded every run.`,
    ).toBe(true);
  });

  it.each(PW_WORKFLOWS)(
    "%s keys the cache on the lockfile so a Playwright bump invalidates it",
    (file) => {
      const yaml = readWorkflow(file);
      expect(
        /key:\s*.*playwright.*hashFiles\('pnpm-lock\.yaml'\)/.test(yaml),
        `${file} Playwright cache key must include hashFiles('pnpm-lock.yaml') so bumping ` +
          `@playwright/test busts the cache and the matching browser build is downloaded.`,
      ).toBe(true);
    },
  );

  it.each(PW_WORKFLOWS)(
    "%s still installs the browsers (cache is an optimization, not a replacement)",
    (file) => {
      const yaml = readWorkflow(file);
      expect(
        yaml.includes("playwright install chromium"),
        `${file} must still run \`playwright install chromium ...\` — on a cache hit it is a ` +
          `fast no-op, on a miss it repopulates the cache.`,
      ).toBe(true);
    },
  );
});

describe("CI e2e workflows that boot a no-env-block webServer supply build-critical env at the runner level", () => {
  // crew-e2e (:3000) and dev-gate-e2e (:3001-:3003) each boot Playwright webServers
  // that carry NO `env:` block in playwright.config.ts, so the runner env is the
  // ONLY source for their `pnpm build` + `next start`. `next build` evaluates
  // app/api/auth/picker-bootstrap/route.ts -> lib/email/hashForLog.ts, which THROWS
  // at module eval when HASH_FOR_LOG_PEPPER < 32 chars; the /admin render + the
  // /api/test-auth/set-session endpoint create Supabase server/service-role clients
  // (lib/supabase/server.ts) that throw without the Supabase env. help-affordances
  // (:3004) is EXCLUDED — its webServer carries an inline env block with fallbacks.
  const BARE_RUNNER_WEBSERVER_WORKFLOWS = ["crew-e2e.yml", "dev-gate-e2e.yml"];
  const REQUIRED_ENV = [
    "HASH_FOR_LOG_PEPPER",
    // pickerCookieSigningKey() THROWS when unset, so any spec that reaches the
    // picker chain — or seeds a cookie through tests/e2e/helpers/seedPickerCookie.ts
    // — dies at setup without it. Registered here rather than pinned per-workflow
    // so the requirement covers both bare-runner workflows by construction.
    "PICKER_COOKIE_SIGNING_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  // Anchored: the key must start after a newline + indent, so "NEXT_PUBLIC_SUPABASE_URL:"
  // does NOT satisfy a "SUPABASE_URL" row (a plain .includes would false-pass).
  const has = (yaml: string, name: string) => new RegExp(`\\n\\s+${name}:`).test(yaml);

  // Anti-vacuity: crew-e2e.yml is the proven-green parallel; it MUST already satisfy
  // every row, so a broken list/discovery cannot false-green the guard.
  it("crew-e2e.yml (proven-green parallel) already supplies every required var", () => {
    const yaml = readWorkflow("crew-e2e.yml");
    for (const name of REQUIRED_ENV)
      expect(has(yaml, name), `crew-e2e.yml missing ${name}`).toBe(true);
  });

  const cases: Array<[string, string]> = BARE_RUNNER_WEBSERVER_WORKFLOWS.flatMap((file) =>
    REQUIRED_ENV.map((name): [string, string] => [file, name]),
  );
  it.each(cases)(
    "%s sets %s at the runner level (no-env-block webServer inherits it)",
    (file, name) => {
      expect(
        has(readWorkflow(file), name),
        `${file} boots a webServer with no \`env:\` block in playwright.config.ts, so it must set ` +
          `${name} at the runner level — else \`pnpm build\`/\`next start\` inherits nothing and ` +
          `fails (HASH_FOR_LOG_PEPPER: hashForLog.ts module-eval throw; Supabase: server/` +
          `service-role clients throw).`,
      ).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// screenshots-drift nextcache: exact input-hash key, no fallback, always-save.
//
// BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING. The combined
// `actions/cache@v4` step saved only in the post step of a SUCCESSFUL job, and
// its key carried two prefix `restore-keys` fallbacks. Composition: once every
// saved entry predates a UI-changing merge, the nightly run prefix-restores a
// stale Next compiler cache, renders the OLD chrome, fails the byte gate, and
// BY FAILING skips the save. The failure self-perpetuates until a human deletes
// the caches. Measured live (2026-08-14): two same-sha drift runs failed on 6
// md5-verified files while the no-cache regen workflow reproduced the committed
// bytes exactly; deleting all 12 caches flipped it green with zero source change.
//
// The repair makes a stale restore IMPOSSIBLE rather than merely saving more
// often: an exact content-hash key over the render inputs, in a fresh `-v2-`
// namespace, with NO fallback. A hit therefore means the cached compilation was
// built from byte-identical inputs, so reuse is sound BY KEY CONSTRUCTION
// instead of by trusting Next's invalidation — the exact trust the incident
// broke. The split restore/save with `if: always()` rides along for WARMTH: the
// first run at a given input set saves even when the byte gate fails.
//
// Spec: docs/superpowers/specs/ci/2026-08-15-screenshots-drift-cache-refresh-design.md
//
// Asserted on PARSED step objects, never file-wide substrings, so a
// commented-out `# uses:` line satisfies nothing. Assertion 7 is the one
// deliberate exception (it checks a YAML COMMENT, which `parse` discards) and
// bounds its raw-text slice by positions DERIVED from the parsed steps.
// ---------------------------------------------------------------------------

describe("screenshots-drift nextcache: exact input-hash key, no fallback, always-save", () => {
  const RAW = readWorkflow("screenshots-drift.yml");
  const DOC = parseYaml(RAW) as {
    on: { pull_request: { paths: string[] } };
    jobs: Record<string, { steps: WorkflowStep[] }>;
  };
  const STEPS = DOC.jobs["screenshots-drift"]!.steps;
  const CACHE_PATH = ".next-screenshots-help/cache";
  const NAMED_EXTRAS = ["pnpm-lock.yaml", "next.config.ts", "package.json"] as const;
  // The capture step MUTATES these bytes mid-run and actions/cache/save
  // re-evaluates a content-derived key at save time, so a baselines-in-key
  // census makes a drifting run save under a phantom key no checkout requests.
  // They are the comparison TARGET, not a compiler input.
  const MUTATED_TARGET_GLOB = "public/help/screenshots/**";

  const stepsUsing = (action: string): WorkflowStep[] =>
    STEPS.filter((s) => typeof s.uses === "string" && s.uses.startsWith(action));
  const indexOfStep = (pred: (s: WorkflowStep) => boolean): number => STEPS.findIndex(pred);

  it("1. splits the combined cache step into exactly one restore and one save", () => {
    expect(stepsUsing("actions/cache/restore@v4")).toHaveLength(1);
    expect(stepsUsing("actions/cache/save@v4")).toHaveLength(1);
    // The COMBINED action must no longer name this path. Other workflows'
    // ~/.cache/ms-playwright combined steps stay legal and are untouched.
    const combinedOnPath = STEPS.filter(
      (s) => s.uses === "actions/cache@v4" && s.with?.path === CACHE_PATH,
    );
    expect(
      combinedOnPath,
      "the combined actions/cache@v4 step saves only on job success, which is the " +
        "self-perpetuating failure this entry closes",
    ).toEqual([]);
  });

  it("2. the save step runs `if: always()` so a failing byte gate still saves", () => {
    const [save] = stepsUsing("actions/cache/save@v4");
    expect(save?.if).toBe("always()");
  });

  it("3. restore and save share a path, and the save reuses the restore's key BY REFERENCE", () => {
    const [restore] = stepsUsing("actions/cache/restore@v4");
    const [save] = stepsUsing("actions/cache/save@v4");
    expect(restore?.with?.path).toBe(CACHE_PATH);
    expect(save?.with?.path).toBe(CACHE_PATH);
    expect(restore?.id).toBe("nextcache-restore");
    // Single evaluation. A hand-copied or re-evaluated save key is the phantom-key
    // hole: hashFiles re-runs at save time, after the job mutated the tree.
    expect(save?.with?.key).toBe("${{ steps.nextcache-restore.outputs.cache-primary-key }}");
  });

  it("4. the restore declares NO restore-keys (a fallback is what served stale bytes)", () => {
    const [restore] = stepsUsing("actions/cache/restore@v4");
    expect(restore?.with && "restore-keys" in restore.with).toBe(false);
  });

  it("5. step order is capture -> chown -> drift check -> save", () => {
    const capture = indexOfStep((s) => (s.name ?? "").startsWith("Capture screenshots"));
    const chown = indexOfStep((s) => (s.name ?? "").startsWith("Reclaim Next cache ownership"));
    const drift = indexOfStep((s) => (s.name ?? "").startsWith("Check screenshot drift"));
    const save = indexOfStep(
      (s) => typeof s.uses === "string" && s.uses.startsWith("actions/cache/save@v4"),
    );
    for (const [label, i] of [
      ["capture", capture],
      ["chown", chown],
      ["drift", drift],
      ["save", save],
    ] as const) {
      expect(i, `${label} step not found`).toBeGreaterThanOrEqual(0);
    }
    // chown before save: the Docker build left the cache root-owned and the
    // save runs as the runner user.
    expect(capture).toBeLessThan(chown);
    expect(chown).toBeLessThan(drift);
    expect(drift).toBeLessThan(save);
  });

  it("6. the key's hashFiles census == the PR paths filter, minus the mutated target, plus the named extras", () => {
    const [restore] = stepsUsing("actions/cache/restore@v4");
    const key = String(restore?.with?.key ?? "");
    const args = /hashFiles\(([^)]*)\)/.exec(key)?.[1] ?? "";
    const census = new Set(
      args
        .split(",")
        .map((a) => a.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean),
    );
    const filter = DOC.on.pull_request.paths;
    // ONE derivation: the filter is the render-input census, so a future repair
    // to the filter repairs the key too instead of drifting from it.
    const expected = new Set([...filter.filter((g) => g !== MUTATED_TARGET_GLOB), ...NAMED_EXTRAS]);
    expect(census).toEqual(expected);
    expect(census.has(MUTATED_TARGET_GLOB)).toBe(false);
  });

  it("7. the save step's comment cites the entry id", () => {
    // The ONE raw-text assertion: `parse` discards comments. The slice is bounded
    // by positions derived from the PARSED steps, so it cannot land on a
    // commented-out step while the comment stays checkable.
    const [save] = stepsUsing("actions/cache/save@v4");
    const saveIdx = indexOfStep((s) => s === save);
    const prev = STEPS[saveIdx - 1]!;
    const startAt = RAW.indexOf(`name: ${prev.name}`);
    const endAt = RAW.indexOf("actions/cache/save@v4");
    expect(startAt, "could not locate the preceding step in raw text").toBeGreaterThanOrEqual(0);
    expect(endAt).toBeGreaterThan(startAt);
    expect(RAW.slice(startAt, endAt)).toContain(
      "BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING",
    );
  });

  it("8. the restore key is exactly the v2 namespace plus one hashFiles, nothing else", () => {
    const [restore] = stepsUsing("actions/cache/restore@v4");
    const key = String(restore?.with?.key ?? "");
    // A smuggled `github.sha` (or any second component) would make every run a
    // miss-then-save, reintroducing per-run entries; a lost `-v2-` would make the
    // poisoned generation reachable again.
    expect(key).toMatch(
      /^\$\{\{ runner\.os \}\}-nextcache-screenshots-v2-\$\{\{ hashFiles\([^)]*\) \}\}$/,
    );
  });

  it("9. the drift check NAMES every divergence, tracked and untracked (behavioral)", () => {
    // Shape assertions cannot see filename emission. Extract the step's real
    // script and RUN it against a constructed repo holding both kinds of drift.
    const drift = STEPS.find((s) => (s.name ?? "").startsWith("Check screenshot drift"));
    const script = String(drift?.run ?? "");
    expect(script.length, "drift-check step has no run: script").toBeGreaterThan(0);

    const build = (withDrift: boolean): string => {
      const dir = mkdtempSync(join(tmpdir(), "drift-check-"));
      const shots = join(dir, "public", "help", "screenshots");
      mkdirSync(shots, { recursive: true });
      writeFileSync(join(shots, "tracked.webp"), "original");
      const git = (...a: string[]): void => {
        execFileSync("git", a, { cwd: dir, stdio: "pipe" });
      };
      git("init", "-q");
      git("config", "user.email", "t@t.t");
      git("config", "user.name", "t");
      git("add", "-A");
      git("commit", "-qm", "base");
      if (withDrift) {
        writeFileSync(join(shots, "tracked.webp"), "MODIFIED");
        writeFileSync(join(shots, "untracked.webp"), "NEW");
      }
      return dir;
    };

    const run = (dir: string) => {
      const r = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8" });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };

    const dirty = build(true);
    const clean = build(false);
    try {
      const bad = run(dirty);
      expect(bad.status, "the drift check must fail when captures diverge").not.toBe(0);
      // BOTH names. The pre-repair script hid untracked filenames behind
      // `test -z "$(git ls-files --others ...)"` (probed: status=1, 0 bytes of
      // output), and its fail-fast `git diff --exit-code` exited before any
      // later branch could run — so with both kinds present only the tracked
      // name printed.
      expect(bad.out, "the tracked drift filename must be named").toContain("tracked.webp");
      expect(bad.out, "the untracked capture filename must be named").toContain("untracked.webp");

      const ok = run(clean);
      expect(ok.status, "a clean capture set must pass").toBe(0);
      expect(ok.out).not.toContain("tracked.webp");
      expect(ok.out).not.toContain("untracked.webp");
    } finally {
      rmSync(dirty, { recursive: true, force: true });
      rmSync(clean, { recursive: true, force: true });
    }
  });
});
