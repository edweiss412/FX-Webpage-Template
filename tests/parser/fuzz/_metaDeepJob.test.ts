// tests/parser/fuzz/_metaDeepJob.test.ts
//
// Structural pin for the nightly `parser-fuzz-deep` CI job in
// .github/workflows/x-audits.yml (spec 2026-07-09-parser-property-fuzz §5,
// plan docs/superpowers/plans/2026-07-09-parser-property-fuzz.md Task 10).
//
// Reads the workflow file as text (same pattern as other structural-pin
// meta-tests in this repo, e.g. tests/parser/fuzz/_metaDialRegistry.test.ts
// walking DIAL_REGISTRY, tests/cross-cutting/pg-cron-coverage.test.ts reading
// generated files as raw text) and fails by default if a later workflow edit
// silently drops any of the four load-bearing contracts:
//   (a) the `parser-fuzz-deep:` job key exists at all
//   (b) it is gated to schedule/workflow_dispatch only (never runs on every
//       pull_request, which would burn CI minutes on a deep fuzz sweep)
//   (c) the job body actually invokes `pnpm test:fuzz:deep` (not the cheap
//       Tier-1 `test:fuzz`)
//   (d) a step greps the log for `FUZZ-CONFIG` so the seed/numRuns replay
//       coordinates the Tier-1 test prints survive into the run summary —
//       without this, a failure overnight is unreplayable.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOW_PATH = ".github/workflows/x-audits.yml";

function readWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

/** Extract the text of a single top-level job block (2-space-indented job
 * key through the line before the next 2-space-indented job key, or EOF). */
function extractJobBlock(workflow: string, jobKey: string): string {
  const lines = workflow.split("\n");
  const jobKeyRe = new RegExp(`^  ${jobKey}:\\s*$`);
  const anyJobKeyRe = /^  [a-zA-Z0-9_-]+:\s*$/;

  const startIdx = lines.findIndex((line) => jobKeyRe.test(line));
  if (startIdx === -1) return "";

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (anyJobKeyRe.test(line)) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

describe("parser-fuzz-deep nightly job — structural pin", () => {
  const workflow = readWorkflow();

  it("job key `parser-fuzz-deep:` exists in x-audits.yml", () => {
    expect(/^  parser-fuzz-deep:\s*$/m.test(workflow)).toBe(true);
  });

  const jobBlock = extractJobBlock(workflow, "parser-fuzz-deep");

  it("job block is non-empty (extraction sanity check)", () => {
    expect(jobBlock.length).toBeGreaterThan(0);
  });

  it("job is gated to schedule/workflow_dispatch only — never runs on every pull_request", () => {
    expect(jobBlock).toMatch(
      /if:\s*github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/,
    );
  });

  it("job body invokes `pnpm test:fuzz:deep` (the deep fuzz script, not Tier-1 test:fuzz)", () => {
    expect(jobBlock).toContain("pnpm test:fuzz:deep");
  });

  it("a summary step greps the log for FUZZ-CONFIG (replay-coordinate survival)", () => {
    expect(jobBlock).toMatch(/grep\s+-E\s+["'][^"']*FUZZ-CONFIG[^"']*["']/);
    expect(jobBlock).toContain("GITHUB_STEP_SUMMARY");
  });
});
