/**
 * Phase 4 Task 4.2 / 4.7 — lock-order guard for undo_change + _undo_tombstone (PF11 / resolution #15).
 *
 * CRITICAL deadlock class (M5 R20): the sync path holds the per-show advisory lock THEN touches
 * rows. A lock-taking admin RPC that grabbed a FOR UPDATE row lock BEFORE the advisory lock would
 * deadlock under burst. Statically assert, for every function body in the undo migration that takes
 * pg_advisory_xact_lock, that no `for update` token appears before the first advisory-lock token.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = join(process.cwd(), "supabase/migrations/20260608000003_undo_change_rpc.sql");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*--.*$/gm, "");
}

describe("undo_change migration — advisory-lock-before-row-lock order (PF11)", () => {
  it("no FOR UPDATE precedes the first pg_advisory_xact_lock in any lock-taking body", () => {
    const src = stripComments(readFileSync(MIGRATION, "utf8"));
    const functionBlocks = [
      ...src.matchAll(
        /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi,
      ),
    ];
    expect(functionBlocks.length).toBeGreaterThan(0);
    let sawLockTaker = false;
    for (const [, name, body] of functionBlocks) {
      const advisoryAt = body!.search(/pg_(?:try_)?advisory_xact_lock\s*\(/i);
      if (advisoryAt === -1) continue; // not a lock-taking body
      sawLockTaker = true;
      const forUpdateAt = body!.search(/\bfor\s+update\b/i);
      expect(
        forUpdateAt === -1 || forUpdateAt > advisoryAt,
        `${name}: FOR UPDATE (idx ${forUpdateAt}) appears before pg_advisory_xact_lock (idx ${advisoryAt}) — reverses advisory-then-row order (PF11)`,
      ).toBe(true);
    }
    // undo_change itself must be a lock-taker.
    expect(sawLockTaker).toBe(true);
    expect(src).toMatch(/create\s+(?:or\s+replace\s+)?function\s+public\.undo_change/i);
  });
});
