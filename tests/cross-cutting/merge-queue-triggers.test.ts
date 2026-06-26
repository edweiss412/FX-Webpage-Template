import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Structural guard for the GitHub merge queue (main branch). When a PR is added
// to the queue, GitHub dispatches the `merge_group` event on a temporary
// merge_group branch and waits for the REQUIRED status checks to report on it.
// If a workflow that produces a required check does NOT trigger on merge_group,
// that check never reports on the merge_group → the queued merge HANGS → ALL
// merges to main are blocked. So every workflow producing a required context
// MUST keep `merge_group:` in its `on:` triggers.
//
// The 12 required contexts (gh api .../branches/main/protection) are produced by
// exactly these three workflows:
//   - quality.yml          → quality
//   - unit-suite.yml       → unit-suite (aggregator)
//   - x-audits.yml         → x1..x6, validation-schema-parity, affordance-matrix-parity,
//                            postgrest-dml-lockdown, traceability-audit
const REQUIRED_CHECK_WORKFLOWS = ["quality.yml", "unit-suite.yml", "x-audits.yml"];

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

describe("merge queue — required-check workflows trigger on merge_group", () => {
  it.each(REQUIRED_CHECK_WORKFLOWS)(
    "%s declares the `merge_group:` trigger (else the merge queue hangs)",
    (file) => {
      const yaml = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      // `merge_group:` at the 2-space `on:` level (a top-level event trigger).
      expect(
        /\n {2}merge_group:/.test(yaml),
        `${file} must trigger on \`merge_group\` — it produces a REQUIRED status check, and ` +
          `the merge queue blocks ALL merges if that check never reports on the merge_group branch.`,
      ).toBe(true);
    },
  );
});
