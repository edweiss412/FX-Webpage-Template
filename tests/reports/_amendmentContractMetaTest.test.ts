import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const REPORT_SOURCE = readFileSync(join(process.cwd(), "lib/reports/submit.ts"), "utf8");
const GITHUB_SOURCE = readFileSync(join(process.cwd(), "lib/github/issues.ts"), "utf8");

function urlWritingUpdates(source: string): string[] {
  const matches = source.match(/UPDATE\s+reports[\s\S]*?SET\s+github_issue_url[\s\S]*?(?:RETURNING|;)/gi);
  return matches ?? [];
}

describe("META §13.2.3 amendment structural contract", () => {
  test("recovery never calls GitHub code search", () => {
    expect(REPORT_SOURCE).not.toMatch(/search\.issuesAndPullRequests|searchIssuesByMarker/i);
    expect(GITHUB_SOURCE).not.toMatch(/search\.issuesAndPullRequests|searchIssuesByMarker/i);
  });

  test("every URL-writing reports UPDATE is lease-holder fenced unless it is recovered lookup rebinding", () => {
    const updates = urlWritingUpdates(REPORT_SOURCE);

    expect(updates.length, "expected at least one reports.github_issue_url UPDATE").toBeGreaterThan(0);
    for (const update of updates) {
      const recoveredPath = /created_at\s*>=\s*now\(\)\s*-\s*interval\s*'24 hours'/i.test(update);
      const leaseFenced = /AND\s+lease_holder\s*=\s*\$\d+::uuid/i.test(update);
      expect(
        leaseFenced || recoveredPath,
        `URL-writing UPDATE must either carry AND lease_holder = $myToken or be the recovered-path DB-horizon-gated rebinding:\n${update}`,
      ).toBe(true);
    }
  });

  test("report horizon comparisons are DB-time based, not Date.now-derived", () => {
    expect(REPORT_SOURCE).not.toMatch(/Date\.now\(\)/);
    expect(REPORT_SOURCE).toMatch(/created_at\s*>=\s*now\(\)\s*-\s*interval\s*'24 hours'/i);
  });
});
