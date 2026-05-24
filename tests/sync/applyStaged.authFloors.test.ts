import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("applyStaged auth floor cleanup", () => {
  test("role review apply no longer updates crew_member_auth", () => {
    const source = readFileSync("lib/sync/applyStaged.ts", "utf8");

    expect(source).not.toMatch(/update\s+public\.crew_member_auth/i);
    expect(source).not.toMatch(/from\(["']crew_member_auth["']\)/i);
  });
});
