import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const DIR = join(process.cwd(), "lib/observe/query");
const WRITE = /\.(insert|update|delete|upsert|rpc)\s*\(/;
// Matches @/lib/log AND any subpath (@/lib/log/persist) — the char class after
// requires a `/` or the closing quote, so it can't false-match @/lib/logger.
const LOG_IMPORT = /from\s+["']@\/lib\/log(\/|["'])/;

// RECURSIVE walk so a future subdirectory under lib/observe/query is not missed.
function tsFiles(dir = DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("read-only query core", () => {
  test("has files", () => {
    expect(tsFiles().length).toBeGreaterThanOrEqual(5);
  });
  test("no write builders anywhere under lib/observe/query/**", () => {
    for (const f of tsFiles()) {
      expect(readFileSync(f, "utf8"), `${f} contains a write builder`).not.toMatch(WRITE);
    }
  });
  test("no lib/log import anywhere under lib/observe/query/** (blocks transitive app_events write on fault)", () => {
    for (const f of tsFiles()) {
      expect(readFileSync(f, "utf8"), `${f} imports lib/log`).not.toMatch(LOG_IMPORT);
    }
  });
});
