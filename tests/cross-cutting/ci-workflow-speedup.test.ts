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
// the new commit waits. unit-suite already had this; the rest are added here.
const PR_FIRING_WORKFLOWS = [
  "unit-suite.yml",
  "quality.yml",
  "x-audits.yml",
  "screenshots-drift.yml",
  "help-affordances.yml",
  "crew-e2e.yml",
];

describe("CI speedup — concurrency cancel-in-progress on every PR-firing workflow", () => {
  it.each(PR_FIRING_WORKFLOWS)(
    "%s declares a concurrency group with cancel-in-progress: true",
    (file) => {
      const yaml = readWorkflow(file);
      expect(
        /\nconcurrency:\s*\n\s+group:\s*.+\n\s+cancel-in-progress:\s*true/.test(yaml),
        `${file} must declare a top-level \`concurrency:\` block with \`cancel-in-progress: true\` ` +
          `so re-pushing a PR cancels the superseded run instead of queueing both.`,
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
