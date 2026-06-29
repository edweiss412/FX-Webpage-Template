import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOTS = ["app", "lib", "scripts"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));

describe("app_events writer guard (append-only)", () => {
  test("only lib/log/persist.ts writes app_events, and only via .insert", () => {
    const RE = /from\(\s*["']app_events["']\s*\)\s*\.\s*(insert|update|delete|upsert)\(/g;
    const hits: { file: string; op: string }[] = [];
    for (const f of files) {
      const flat = readFileSync(f, "utf8").replace(/\s+/g, " ");
      for (const m of flat.matchAll(RE)) hits.push({ file: f, op: m[1]! });
    }
    // no in-place mutation anywhere
    expect(hits.filter((h) => h.op !== "insert")).toEqual([]);
    // the only writer is persist.ts
    expect([...new Set(hits.map((h) => h.file))]).toEqual(["lib/log/persist.ts"]);
  });

  test("no raw SQL update/delete of app_events outside the migration", () => {
    const RE = /(update\s+(public\.)?app_events|delete\s+from\s+(public\.)?app_events)\b/i;
    const offenders = files.filter((f) => RE.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  test("logger routes through sanitizeContext (redaction cannot be silently removed)", () => {
    const src = readFileSync("lib/log/logger.ts", "utf8");
    expect(src).toMatch(/sanitizeContext\(/);
  });
});
