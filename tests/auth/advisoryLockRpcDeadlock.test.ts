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
    "supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql",
    "supabase/migrations/20260523000004_rotate_show_share_token.sql",
    "supabase/migrations/20260523000007_select_identity_atomic.sql",
    "supabase/migrations/20260524000002_claim_oauth_identity.sql",
    // M12 Phase 0.C Task 0.C.4 — validation tooling mint RPC.
    "supabase/migrations/20260527210000_mint_validation_fixture_atomic.sql",
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
    expect(lockTakingNames).toContain("reset_picker_epoch_atomic");
    expect(lockTakingNames).toContain("rotate_show_share_token");
    expect(lockTakingNames).toContain("select_identity_atomic");
    expect(lockTakingNames).toContain("claim_oauth_identity");
    // M12 Phase 0.C Task 0.C.4 — validation reseed mint RPC is the sole
    // holder of the per-show advisory lock for validation_<combo> shows.
    expect(lockTakingNames).toContain("mint_validation_fixture_atomic");

    const sourceFiles = [
      // middleware.ts removed 2026-05-27 (Phase 0.A finding 5 / commit b5999c8).
      // Vestigial-middleware structural defense at
      // tests/cross-cutting/no-vestigial-middleware.test.ts prevents
      // reintroducing a no-op middleware.ts/proxy.ts. If a real proxy.ts
      // calls withShowAdvisoryLock, append it here.
      "lib/realtime/showInvalidation.ts",
      "app/admin/dev/actions.ts",
      "lib/auth/picker/resetPickerEpoch.ts",
      "lib/auth/picker/rotateShareToken.ts",
      "lib/auth/picker/selectIdentity.ts",
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

  test("claim_oauth_identity acquires multi-show locks in deterministic drive_file_id order", () => {
    const source = stripComments(
      readFileSync(join(ROOT, "supabase/migrations/20260524000002_claim_oauth_identity.sql"), "utf8"),
    );

    expect(source).toMatch(/for\s+r\s+in[\s\S]*?order\s+by\s+s\.drive_file_id[\s\S]*?loop[\s\S]*?pg_advisory_xact_lock\(hashtext\('show:'\s*\|\|\s*r\.drive_file_id\)\)/i);
    expect(source).toMatch(/end\s+loop;\s*v_claim_at\s*:=\s*clock_timestamp\(\);/i);
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
