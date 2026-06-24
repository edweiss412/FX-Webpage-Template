import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
