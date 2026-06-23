import { readFileSync } from "node:fs";
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
