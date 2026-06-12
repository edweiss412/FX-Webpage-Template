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
      readFileSync(
        join(ROOT, "supabase/migrations/20260524000002_claim_oauth_identity.sql"),
        "utf8",
      ),
    );

    expect(source).toMatch(
      /for\s+r\s+in[\s\S]*?order\s+by\s+s\.drive_file_id[\s\S]*?loop[\s\S]*?pg_advisory_xact_lock\(hashtext\('show:'\s*\|\|\s*r\.drive_file_id\)\)/i,
    );
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

  test("stale-session reap uses direct SQL locks (finalize then show), no lock-taking RPC, no rotation", () => {
    // F4 Task 4.3 — sibling of the cleanup pin above, for reapStaleOnboardingSessions
    // (spec §3.3 row "F4 stale-session reap": same layer as cleanup, single holder).
    const source = stripComments(
      readFileSync(join(ROOT, "lib/onboarding/sessionLifecycle.ts"), "utf8"),
    );
    // DEVIATION from the plan's literal slice point ("async function reapOneSession"):
    // the show-lock acquisition lives in the lockReapDriveFiles helper, which is
    // defined BEFORE reapOneSession — slicing at reapOneSession would exclude it
    // and the show-lock assertion below could never pass. The slice starts at the
    // first reap helper instead; everything from there to EOF is reap-only code.
    const reapBody = source.slice(source.indexOf("async function collectReapDriveFileIds"));
    expect(reapBody.length).toBeGreaterThan(0);
    expect(reapBody).toMatch(/pg_advisory_xact_lock\(hashtext\('finalize:' \|\| \$1\)\)/);
    expect(reapBody).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
    expect(reapBody).not.toMatch(/\.rpc\(/);
    // Single-holder + no-rotation pins: the reap never re-acquires inside a
    // nested layer and never touches app_settings beyond the plain read.
    expect(reapBody).not.toMatch(/update\s+public\.app_settings/i);
    expect(reapBody).not.toMatch(
      /for update[\s\S]*?app_settings|app_settings[\s\S]{0,200}for update/i,
    );
    // R15 HIGH — advisory-before-row: drive-id collection must take NO row
    // locks. A FOR UPDATE before the show: advisory locks inverts the order
    // pending-ingestion actions use (advisory via withPostgresSyncPipelineLock
    // first, retry/route.ts; FOR UPDATE second) — AB-BA deadlock with a
    // stale-tab retry. The same applies to the reap's eligibility re-checks.
    const collectBody = source.slice(
      source.indexOf("async function collectReapDriveFileIds"),
      source.indexOf("async function lockReapDriveFiles"),
    );
    expect(collectBody.length).toBeGreaterThan(0);
    expect(collectBody).not.toMatch(/for\s+update/i);
    // Stronger than the plan's literal check: the ENTIRE reap surface is
    // row-lock-free (the 1-hour recency check deliberately drops cleanup's
    // FOR UPDATE — under the finalize advisory lock no finalize worker can
    // advance the checkpoint concurrently).
    expect(reapBody).not.toMatch(/for\s+update/i);
  });

  test("finalize routes acquire the finalize advisory lock BEFORE any app_settings FOR UPDATE row lock (R25-1/R29-1: global total order vs cleanupAbandonedFinalize)", () => {
    // cleanupAbandonedFinalize's order is finalize-lock → app_settings FOR UPDATE
    // (lib/onboarding/sessionLifecycle.ts cleanupAbandonedFinalize). A finalize route that takes
    // the app_settings row lock FIRST and only then touches the finalize lock inverts that order
    // (AB-BA) — cleanup clicked while a finalize batch is mid-flight can deadlock both, stranding
    // the wizard at the exact moment the operator is trying to recover it. Pin: in each route's
    // handler body, every call to a helper whose SQL does `from public.app_settings … for update`
    // must appear AFTER the `tryFinalizeLock(` call site.
    for (const { file, handlerName } of [
      {
        file: "app/api/admin/onboarding/finalize/route.ts",
        handlerName: "handleOnboardingFinalize",
      },
      { file: "app/api/admin/onboarding/finalize-cas/route.ts", handlerName: "runFinalizeCas" },
    ]) {
      const source = stripComments(readFileSync(join(ROOT, file), "utf8"));

      // Top-level function bodies (closing brace at column 0).
      const fnBodies = new Map<string, string>();
      for (const m of source.matchAll(
        /(?:^|\n)(?:export\s+)?async function ([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\(([\s\S]*?)\n\}/g,
      )) {
        const [, name, body] = m;
        if (name && body) fnBodies.set(name, body);
      }

      const appSettingsForUpdateHelpers = [...fnBodies.entries()]
        .filter(([, body]) => /from\s+public\.app_settings[\s\S]*?\bfor\s+update\b/i.test(body))
        .map(([name]) => name);

      const handlerBody = fnBodies.get(handlerName);
      expect(handlerBody, `${file}: could not extract ${handlerName} body`).toBeTruthy();
      const lockAt = handlerBody!.search(/\btryFinalizeLock\s*\(/);
      expect(lockAt, `${file}: ${handlerName} never calls tryFinalizeLock`).toBeGreaterThan(-1);

      for (const helper of appSettingsForUpdateHelpers) {
        const callRe = new RegExp(`\\b${helper}\\s*\\(`, "g");
        for (const call of handlerBody!.matchAll(callRe)) {
          expect(
            call.index! > lockAt,
            `${file}: ${handlerName} calls ${helper} (app_settings FOR UPDATE) at idx ${call.index} ` +
              `BEFORE tryFinalizeLock at idx ${lockAt} — inverts cleanupAbandonedFinalize's ` +
              `finalize-lock→app_settings order (AB-BA deadlock under cleanup/finalize overlap)`,
          ).toBe(true);
        }
      }
    }
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

describe("shared apply core is acquire-free (onboarding-fixups F1, spec §3.3)", () => {
  test("applyStagedCore.ts contains zero advisory-lock acquisitions and adopts via assertion only", () => {
    const core = stripComments(readFileSync(join(ROOT, "lib/sync/applyStagedCore.ts"), "utf8"));
    // Acquire-free: any pg_advisory* in the core is a second holder under the Phase B/D/dashboard
    // holders — deadlock under burst (M5 R20 class, invariant 2).
    expect(core).not.toMatch(/pg_(?:try_)?advisory_xact_lock/i);
    expect(core).not.toMatch(/withPostgresSyncPipelineLock|withShowLock\s*\(/);
    // Adoption, not acquisition: the core asserts the caller already holds the lock.
    expect(core).toMatch(/assertShowLockHeld|adoptShowLockHeld/);
  });

  test("finalize routes hold the documented per-show advisory-lock topology (single holder per surface)", () => {
    // Plan 01-f1 §"Advisory-lock holder topology": the per-row tx wrapper (defaultWithRowTx) is
    // the ONLY holder for the apply surfaces. DEVIATION from the plan's literal `toHaveLength(1)`
    // for both files: live finalize-cas ALSO contains the publish-flip's sorted per-show lock
    // loop inside publishAppliedWizardShows (plan R49-2 — acquired LAST in the OUTER transaction,
    // after the per-row apply transactions have committed and released their locks, so the
    // single-holder-at-a-time rule still holds). Pin the exact counts so a NEW acquisition on
    // either surface fails review here.
    const expected: ReadonlyArray<{ file: string; acquisitions: number }> = [
      // defaultWithRowTx only (Phase B per-row holder).
      { file: "app/api/admin/onboarding/finalize/route.ts", acquisitions: 1 },
      // defaultWithRowTx (Phase D per-row holder) + publishAppliedWizardShows sorted flip loop.
      { file: "app/api/admin/onboarding/finalize-cas/route.ts", acquisitions: 2 },
    ];
    for (const { file, acquisitions } of expected) {
      const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
      const found = src.match(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/g) ?? [];
      expect(
        found,
        `${file}: expected exactly ${acquisitions} per-show advisory-lock acquisition(s); a new ` +
          `acquisition needs a topology review (single-holder rule, invariant 2)`,
      ).toHaveLength(acquisitions);
    }
  });
});
