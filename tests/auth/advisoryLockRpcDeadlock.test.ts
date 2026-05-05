import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*--.*$/gm, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function lockTakingRpcNames(): string[] {
  const migrationFiles = [
    "supabase/migrations/20260502000000_dev_schema_clone.sql",
    "supabase/migrations/20260504000003_mint_link_session_atomic.sql",
    "supabase/migrations/20260504000004_revoke_leaked_link_atomic_advisory_lock.sql",
  ];

  const names = new Set<string>();
  for (const file of migrationFiles) {
    const source = stripComments(readFileSync(join(ROOT, file), "utf8"));
    const functionBlocks = source.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi,
    );
    for (const match of functionBlocks) {
      const [, name, body] = match;
      if (!name || !body) continue;
      if (/\bpg_(?:try_)?advisory_xact_lock\s*\(/i.test(body)) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

describe("advisory-lock RPC deadlock guard", () => {
  test("no Supabase RPC that takes a show advisory lock is called inside withShowAdvisoryLock", () => {
    const lockTakingNames = lockTakingRpcNames();
    expect(lockTakingNames).toContain("revoke_leaked_link_atomic");

    const sourceFiles = [
      "app/api/auth/redeem-link/route.ts",
      "middleware.ts",
      "app/show/[slug]/p/actions.ts",
      "lib/realtime/showInvalidation.ts",
      "app/admin/dev/actions.ts",
    ];

    for (const file of sourceFiles) {
      const source = stripComments(readFileSync(join(ROOT, file), "utf8"));
      const lockCallbacks = source.matchAll(
        /withShowAdvisoryLock\s*\([^]*?async\s*\([^)]*\)\s*=>\s*\{([^]*?)\n\s*\}\s*\)/g,
      );
      for (const callback of lockCallbacks) {
        const body = callback[1] ?? "";
        for (const name of lockTakingNames) {
          expect(
            body,
            `${file} calls rpc("${name}") inside withShowAdvisoryLock; if the RPC also acquires pg_advisory_xact_lock on another connection, the request deadlocks`,
          ).not.toMatch(new RegExp(`\\.rpc\\(\\s*["']${name}["']`));
        }
      }
    }
  });
});
