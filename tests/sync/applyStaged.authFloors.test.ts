import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("applyStaged auth floor cleanup", () => {
  test("role review apply no longer updates removed auth tables", () => {
    const source = readFileSync("lib/sync/applyStaged.ts", "utf8");

    expect(source).not.toMatch(/update\s+public\.crew_member_/i);
    expect(source).not.toMatch(/from\(["']crew_member_/i);
  });
});
