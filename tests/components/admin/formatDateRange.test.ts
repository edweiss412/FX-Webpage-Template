// @vitest-environment node
//
// Regression test for formatDateRange's timezone correctness (M12.3 adversarial
// R3). Show dates are date-only ISO strings ('YYYY-MM-DD') that `new Date`
// parses as UTC midnight. The formatter MUST display the literal calendar date
// regardless of the runtime timezone — local getters render one day earlier in
// US zones (2026-06-14 → "6/13" in America/Chicago), which would show Doug the
// wrong show dates on the dashboard table and the per-show subtitle.
//
// TZ is pinned to a US zone up front so this catches the bug on ANY runner
// (including UTC CI runners, where local getters would otherwise look correct).
// Pin BEFORE importing the module so the first Date ops use it.
process.env.TZ = "America/Chicago";

import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { formatDateRange } from "@/lib/admin/showDisplay";

describe("formatDateRange — timezone-correct date-only formatting", () => {
  test("date-only range renders the literal calendar dates (not one-day-early)", () => {
    // Local-getter bug would yield "6/13/26 → 6/14/26" in America/Chicago.
    expect(formatDateRange("2026-06-14", "2026-06-15")).toBe("6/14/26 → 6/15/26");
  });

  test("single date renders its literal calendar date", () => {
    expect(formatDateRange("2026-06-14", null)).toBe("6/14/26");
    expect(formatDateRange(null, "2026-01-01")).toBe("1/1/26");
  });

  test("null/empty inputs return null", () => {
    expect(formatDateRange(null, null)).toBeNull();
  });

  test("year boundary date-only value does not slip to the previous year", () => {
    // 2026-01-01 in a UTC-negative zone with local getters → Dec 31, 2025.
    expect(formatDateRange("2026-01-01", "2026-01-01")).toBe("1/1/26 → 1/1/26");
  });
});

// M12.12 Task 10 — the dead ActiveShowsPanel/PendingPanel are deleted and the
// shared display helpers (ActiveShowRow, formatDateRange, formatRelative) move
// to lib/admin/showDisplay.ts as their ONE home (no transitional re-export,
// spec §13). This structural assertion walks every source file under
// components/ + app/ + tests/ and fails if any import specifier still points
// at the dead modules. Concrete failure mode caught: the helpers get
// duplicated instead of moved, or a dead-panel import survives the deletion.
describe("no production import of the deleted dashboard panels (M12.12 Task 10)", () => {
  const ROOT = process.cwd();
  const DEAD_SPECIFIER_RE =
    /from\s+["'][^"']*components\/admin\/(?:ActiveShowsPanel|PendingPanel)["']/;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  test("no file under components/, app/, or tests/ imports from the dead panel modules", () => {
    const offenders: string[] = [];
    for (const root of ["components", "app", "tests"]) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (DEAD_SPECIFIER_RE.test(src)) {
          offenders.push(relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
