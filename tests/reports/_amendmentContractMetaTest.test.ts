import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const REPORT_SOURCE = readFileSync(join(process.cwd(), "lib/reports/submit.ts"), "utf8");
const GITHUB_SOURCE = readFileSync(join(process.cwd(), "lib/github/issues.ts"), "utf8");
const REAPER_SOURCE = readFileSync(
  join(process.cwd(), "app/api/cron/report-reaper/route.ts"),
  "utf8",
);

function urlWritingUpdates(source: string): string[] {
  const matches = source.match(
    /UPDATE\s+reports\s+SET\s+github_issue_url[\s\S]*?(?:RETURNING|;)/gi,
  );
  return matches ?? [];
}

describe("META §13.2.3 amendment structural contract", () => {
  test("recovery never calls GitHub code search", () => {
    expect(REPORT_SOURCE).not.toMatch(/search\.issuesAndPullRequests|searchIssuesByMarker/i);
    expect(GITHUB_SOURCE).not.toMatch(/search\.issuesAndPullRequests|searchIssuesByMarker/i);
  });

  test("every URL-writing reports UPDATE is lease-holder fenced", () => {
    const updates = urlWritingUpdates(REPORT_SOURCE);

    expect(updates.length, "expected at least one reports.github_issue_url UPDATE").toBeGreaterThan(
      0,
    );
    for (const update of updates) {
      const leaseFenced = /AND\s+lease_holder\s*=\s*\$\d+::uuid/i.test(update);
      expect(
        leaseFenced,
        `URL-writing UPDATE must carry AND lease_holder = $myToken:\n${update}`,
      ).toBe(true);
    }
  });

  test("report horizon comparisons are DB-time based, not Date.now-derived", () => {
    expect(REPORT_SOURCE).not.toMatch(/Date\.now\(\)/);
    expect(REAPER_SOURCE).not.toMatch(/Date\.now\(\)/);
    expect(REPORT_SOURCE).toMatch(/created_at\s*>=\s*now\(\)\s*-\s*interval\s*'24 hours'/i);
    expect(REAPER_SOURCE).toMatch(/created_at\s*<\s*now\(\)\s*-\s*interval\s*'24 hours'/i);
    expect(REAPER_SOURCE).toMatch(/processing_lease_until\s*<\s*now\(\)/i);
  });

  test("LookupInconclusive and thrashing alerts use shared 2-gate reconciliation", () => {
    expect(REPORT_SOURCE).toMatch(/export\s+async\s+function\s+resolveStateGatedAlert/);
    expect(REPORT_SOURCE.match(/resolveStateGatedAlert\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(REPORT_SOURCE).toMatch(/raced_back:\s*true/);
    expect(REPORT_SOURCE).toMatch(/raced_back_twice:\s*true/);
    expect(REPORT_SOURCE).not.toMatch(
      /await\s+upsertStateGatedLookupAlert\([\s\S]*?;\s*return\s+\{\s*status:\s*(?:502|503)/,
    );
  });
});
