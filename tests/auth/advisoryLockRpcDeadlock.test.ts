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
    // M12 Phase 0.C Codex R15-F1 — finalize RPC acquires per-show
    // advisory locks before DELETE during stale-show pruning.
    "supabase/migrations/20260527210001_validation_finalize_all_atomic.sql",
    // Sync changes-feed Phase 3 — MI-11 gate RPCs (mi11_approve_hold/mi11_reject_hold)
    // each acquire the per-show advisory lock themselves (admin path, §4.1).
    "supabase/migrations/20260608000002_mi11_gate_rpcs.sql",
    // Sync changes-feed Phase 4 — undo_change acquires the per-show advisory lock itself
    // (admin path, §4.1); _undo_tombstone runs inside that lock and never re-takes it.
    "supabase/migrations/20260608000003_undo_change_rpc.sql",
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
    // M12 Phase 0.C Codex R15-F1 — finalize RPC also acquires per-show
    // locks before DELETEing stale validation shows during prune.
    expect(lockTakingNames).toContain("validation_finalize_all_atomic");
    // Sync changes-feed Phase 3 — the MI-11 gate RPCs are single-holder admin lock-takers.
    expect(lockTakingNames).toContain("mi11_approve_hold");
    expect(lockTakingNames).toContain("mi11_reject_hold");
    // Sync changes-feed Phase 4 — undo_change is a single-holder admin lock-taker.
    expect(lockTakingNames).toContain("undo_change");

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
      // Sync changes-feed Phase 3 — the MI-11 gate server actions await the self-locking RPCs
      // bare (no JS-side withShowAdvisoryLock); nesting would deadlock under burst (M5 R20 class).
      "lib/sync/holds/mi11GateActions.ts",
      // Phase 4 undo delegation helper — calls undo_change bare (self-locking RPC).
      "lib/sync/holds/undoChange.ts",
      // Phase 6 (T6.9b / PF15) — the per-show changes-feed server actions DELEGATE to the
      // Phase 3/4 helpers (no inline supabase.rpc, no withShowAdvisoryLock wrap). NOTE: the
      // plan names this surface app/admin/show/[slug]/_actions.ts; this repo organizes the
      // per-show server actions under the _actions/ DIRECTORY, so the actual delegating file
      // is _actions/feed.ts — that is the surface pinned here.
      "app/admin/show/[slug]/_actions/feed.ts",
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

    // Phase 6 (T6.9b / PF15) — strongest form for the per-show feed action surface:
    // it must DELEGATE (no direct lock-taking-RPC call site at all), so the ONLY
    // path to the lock is the guarded Phase 3/4 helper — never a re-inlined or
    // JS-lock-wrapped RPC. (Negative-regression: re-inline a
    // supabase.rpc("mi11_approve_hold", …) here and this assertion fails.)
    const feedActions = stripComments(
      readFileSync(join(ROOT, "app/admin/show/[slug]/_actions/feed.ts"), "utf8"),
    );
    for (const name of ["mi11_approve_hold", "mi11_reject_hold", "undo_change"]) {
      expect(
        feedActions,
        `_actions/feed.ts must NOT call rpc("${name}") directly — it delegates to the guarded helper (PF15)`,
      ).not.toMatch(new RegExp(`\\.rpc\\(\\s*["']${name}["']`));
    }
    // And no JS-side show lock is taken on this surface at all (the helpers/RPCs self-lock).
    expect(
      feedActions,
      "_actions/feed.ts must NOT wrap delegation in withShowAdvisoryLock (single-holder rule)",
    ).not.toMatch(/withShowAdvisoryLock/);
  });

  test("lock-order: no lock-taking RPC row-locks (FOR UPDATE) before its first pg_advisory_xact_lock (PF11)", () => {
    // resolution #15 / PF11 CRITICAL — the sync path holds the show advisory lock THEN touches rows;
    // a lock-taking admin RPC that grabbed a FOR UPDATE row lock first and then waited on the advisory
    // lock deadlocks under burst (M5 R20). Pin advisory-before-row for EVERY lock-taking RPC body.
    const lockTakingMigrations = [
      "supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql",
      "supabase/migrations/20260523000004_rotate_show_share_token.sql",
      "supabase/migrations/20260523000007_select_identity_atomic.sql",
      "supabase/migrations/20260524000002_claim_oauth_identity.sql",
      "supabase/migrations/20260527210000_mint_validation_fixture_atomic.sql",
      "supabase/migrations/20260527210001_validation_finalize_all_atomic.sql",
      "supabase/migrations/20260608000002_mi11_gate_rpcs.sql",
      "supabase/migrations/20260608000003_undo_change_rpc.sql",
    ];

    for (const file of lockTakingMigrations) {
      const source = stripComments(readFileSync(join(ROOT, file), "utf8"));
      const functionBlocks = source.matchAll(
        /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi,
      );
      for (const match of functionBlocks) {
        const [, name, body] = match;
        if (!name || !body) continue;
        const advisoryAt = body.search(/pg_(?:try_)?advisory_xact_lock\s*\(/i);
        if (advisoryAt === -1) continue; // not a lock-taking body
        const forUpdateAt = body.search(/\bfor\s+update\b/i);
        // Either no FOR UPDATE at all, or it appears AFTER the first advisory lock.
        expect(
          forUpdateAt === -1 || forUpdateAt > advisoryAt,
          `${file}: ${name} contains "FOR UPDATE" (idx ${forUpdateAt}) before its first pg_advisory_xact_lock (idx ${advisoryAt}) — reverses the advisory-then-row order and deadlocks under burst (PF11)`,
        ).toBe(true);
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
