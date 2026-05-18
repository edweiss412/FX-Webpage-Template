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
    "supabase/migrations/20260505000001_redeem_link_locked_rpcs.sql",
    "supabase/migrations/20260505000002_mint_bootstrap_nonce_atomic.sql",
    "supabase/migrations/20260505000003_recheck_link_session_mint_auth_state.sql",
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
    expect(lockTakingNames).toContain("consume_bootstrap_nonce_atomic");
    expect(lockTakingNames).toContain("mint_link_session_if_active_kid_matches");
    expect(lockTakingNames).toContain("mint_bootstrap_nonce_atomic");

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

  test("redeem-link route does not use JS-side advisory lock around Supabase mutations", () => {
    const source = stripComments(
      readFileSync(join(ROOT, "app/api/auth/redeem-link/route.ts"), "utf8"),
    );

    expect(source).not.toMatch(/withShowAdvisoryLock\s*\(/);
    expect(source).toMatch(/\.rpc\(\s*["']consume_bootstrap_nonce_atomic["']/);
    expect(source).toMatch(/\.rpc\(\s*["']mint_link_session_if_active_kid_matches["']/);
  });

  test("bootstrap nonce mint does not use JS-side advisory lock around Supabase mutations", () => {
    const source = stripComments(readFileSync(join(ROOT, "app/show/[slug]/p/actions.ts"), "utf8"));

    expect(source).not.toMatch(/withShowAdvisoryLock\s*\(/);
    expect(source).toMatch(/\.rpc\(\s*["']mint_bootstrap_nonce_atomic["']/);
  });

  test("abandoned finalize cleanup uses direct SQL locks and no lock-taking RPC boundary", () => {
    const source = stripComments(
      readFileSync(join(ROOT, "lib/onboarding/sessionLifecycle.ts"), "utf8"),
    );

    expect(source).toMatch(/pg_advisory_xact_lock\(hashtext\('finalize:' \|\| \$1\)\)/);
    expect(source).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
    expect(source).not.toMatch(/\.rpc\(/);
  });

  test("onboarding finalize routes use direct SQL advisory locks and no lock-taking RPC boundary", () => {
    for (const file of [
      "app/api/admin/onboarding/finalize/route.ts",
      "app/api/admin/onboarding/finalize-cas/route.ts",
    ]) {
      const source = stripComments(readFileSync(join(ROOT, file), "utf8"));

      expect(source).toMatch(/pg_try_advisory_xact_lock\(hashtext\('finalize:' \|\| \$1\)\)/);
      expect(source).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
      expect(source).not.toMatch(/\.rpc\(/);
    }
  });
});
