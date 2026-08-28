import { describe, expect, test } from "vitest";
import { stripCommentsForFile } from "../_shared/stripComments";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  latestResetValidationDataBody,
  latestResetValidationDataFile,
} from "../db/_resetRpcSource.js";
import {
  declaredFunctionNames,
  extractFunctionBodies,
  migrationFiles,
  migrationsDefining,
  readMigrationSource,
  shippedFunctionBody,
} from "../db/_sqlFunctionBodies.js";

const ROOT = process.cwd();

/**
 * PF11 invariant: a lock-taking RPC body must not `FOR UPDATE` row-lock BEFORE its
 * first pg_advisory_xact_lock (reverses advisory-then-row order → deadlock under
 * burst, M5 R20). No-op for a body that takes no advisory lock.
 */
function assertAdvisoryBeforeRowLock(label: string, name: string, body: string): void {
  const advisoryAt = body.search(/pg_(?:try_)?advisory_xact_lock\s*\(/i);
  if (advisoryAt === -1) return; // not a lock-taking body
  const forUpdateAt = body.search(/\bfor\s+update\b/i);
  expect(
    forUpdateAt === -1 || forUpdateAt > advisoryAt,
    `${label}: ${name} contains "FOR UPDATE" (idx ${forUpdateAt}) before its first pg_advisory_xact_lock (idx ${advisoryAt}) — reverses the advisory-then-row order and deadlocks under burst (PF11)`,
  ).toBe(true);
}

/**
 * Migrations that INTRODUCE a family of lock-taking RPCs. This list seeds NAME discovery only —
 * every body is then resolved per FUNCTION to its last definition (see shippedLockTakerBodies), so
 * a `create or replace` in a newer migration is followed automatically and a file here going stale
 * costs nothing. A brand-new lock-taking function still needs an entry, which is the point: adding
 * one is a deliberate topology decision (invariant 2).
 */
function lockTakerSeedMigrations(): string[] {
  return [
    "supabase/migrations/20260502000000_dev_schema_clone.sql",
    "supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql",
    "supabase/migrations/20260523000004_rotate_show_share_token.sql",
    // Per-crew picker reset (2026-07-03) — self-locking admin RPC.
    "supabase/migrations/20260703000001_reset_crew_member_selection.sql",
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
    // Two later migrations `create or replace` undo_change; per-function resolution follows them.
    "supabase/migrations/20260608000003_undo_change_rpc.sql",
    // Task 2 — reset_validation_data() acquires the per-show advisory lock for
    // EVERY affected drive_file_id (sorted, single-holder) before any delete.
    // Derived (not hardcoded) so the SHIPPED defining migration is scanned even
    // after a future `create or replace` supersedes the current one — the name
    // detection is body-agnostic, but this avoids the superseded-file drift that
    // PF11 had with 20260622000002 (audit idx78). latestResetValidationDataBody()
    // is the canonical source for body-inspection.
    latestResetValidationDataFile(),
    // Developer tier Task 2c — set_admin_developer_rpc + the re-created
    // revoke_admin_email_rpc each take hashtextextended('admin_emails', 0)
    // before their row lock, single-holder (own body; never nested).
    "supabase/migrations/20260703230100_admin_emails_developer_tier.sql",
    // Part B (2026-07-04 §3.2) — re-created upsert_admin_email_rpc +
    // revoke_admin_email_rpc (developer-only actor, pre+post-lock re-check) each
    // take hashtextextended('admin_emails', 0) before their FOR UPDATE row lock,
    // single-holder (own body; never nested inside each other).
    "supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql",
    // Pull-sheet-on-archived-tab override (spec §5.4, Task 8) — set_pull_sheet_override
    // acquires pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id)) FIRST in its own
    // body (sole show: holder; the JS route never locks). Advisory-then-row (no FOR UPDATE).
    "supabase/migrations/20260706000000_pull_sheet_override.sql",
    // Published-show archived-tab override (spec 2026-07-23 §3.2) — set_published_pull_sheet_override
    // acquires pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id)) FIRST in its own body
    // (sole show: holder; the JS route app/api/admin/show/pull-sheet-override never locks).
    "supabase/migrations/20260723090000_published_pull_sheet_override.sql",
  ];
}

/**
 * The (name, file, body) triples the PF11 guards actually inspect: for every function any seed
 * migration declares, the body from the LAST migration that defines it, kept if that SHIPPED body
 * takes an advisory lock.
 *
 * Resolution is per FUNCTION and not per file, because `create or replace` routinely replaces ONE
 * member of an older migration's function set — the 2026-08-04 migration replaces undo_change and
 * mi11_approve_hold while mi11_reject_hold still ships from 20260608000002. Swapping file entries
 * would drop the reject side entirely; a union over per-function resolutions cannot.
 *
 * The seed set is expanded once through each resolved file, so a companion function introduced
 * ALONGSIDE a replacement (same migration, new name) is discovered rather than skipped.
 */
function shippedLockTakerBodies(): Array<{ name: string; file: string; body: string }> {
  const candidates = new Set<string>();
  for (const file of lockTakerSeedMigrations()) {
    for (const name of declaredFunctionNames(readMigrationSource(file))) candidates.add(name);
  }
  for (const name of [...candidates]) {
    const { file } = shippedFunctionBody(name);
    for (const sibling of declaredFunctionNames(readMigrationSource(file))) {
      candidates.add(sibling);
    }
  }

  const inspected: Array<{ name: string; file: string; body: string }> = [];
  for (const name of [...candidates].sort()) {
    const { file, body } = shippedFunctionBody(name);
    if (/\bpg_(?:try_)?advisory_xact_lock\s*\(/i.test(body)) inspected.push({ name, file, body });
  }
  // Non-empty self-check: a discovery that silently returns nothing turns every assertion built on
  // it into a vacuous pass. This is the failure mode the `$$`-only extractor produced for years.
  expect(
    inspected.length,
    "no lock-taking RPC bodies discovered — the PF11 guards would pass vacuously",
  ).toBeGreaterThan(0);
  return inspected;
}

function lockTakingRpcNames(): string[] {
  return shippedLockTakerBodies().map((entry) => entry.name);
}

describe("advisory-lock RPC deadlock guard", () => {
  test("no Supabase RPC that takes a show advisory lock is called inside withShowAdvisoryLock", () => {
    const lockTakingNames = lockTakingRpcNames();
    expect(lockTakingNames).toContain("reset_picker_epoch_atomic");
    expect(lockTakingNames).toContain("rotate_show_share_token");
    expect(lockTakingNames).toContain("reset_crew_member_selection");
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
    // Task 2 — reset_validation_data() is a single-holder admin lock-taker over the
    // sorted distinct affected-key set (shows ∪ pending_syncs ∪ pending_ingestions ∪
    // deferred_ingestions) before any delete.
    expect(lockTakingNames).toContain("reset_validation_data");
    // Developer tier Task 2c — set_admin_developer_rpc acquires
    // hashtextextended('admin_emails', 0) before its FOR UPDATE row lock,
    // single-holder (its own body; never nested inside upsert/revoke).
    expect(lockTakingNames).toContain("set_admin_developer_rpc");
    // Part B (2026-07-04 §3.2) — the re-created upsert_admin_email_rpc +
    // revoke_admin_email_rpc (migration 20260704000000) each take
    // hashtextextended('admin_emails', 0) before their row lock, single-holder
    // (own body; never nested inside each other or set_admin_developer_rpc).
    expect(lockTakingNames).toContain("upsert_admin_email_rpc");
    expect(lockTakingNames).toContain("revoke_admin_email_rpc");
    // Pull-sheet-on-archived-tab override (spec §5.4, Task 8) — set_pull_sheet_override is
    // a single-holder admin lock-taker; the JS route awaits it via the service-role client
    // and never wraps it in withShowAdvisoryLock (nesting would deadlock, M5 R20 class).
    expect(lockTakingNames).toContain("set_pull_sheet_override");
    // Published-show archived-tab override (spec 2026-07-23) — set_published_pull_sheet_override
    // acquires pg_advisory_xact_lock(hashtext('show:' || p_drive_file_id)) FIRST in its own body;
    // the JS route awaits it via the service-role client and never wraps it (single-holder).
    expect(lockTakingNames).toContain("set_published_pull_sheet_override");

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
      // Per-crew picker reset (2026-07-03) — awaits the self-locking reset_crew_member_selection
      // RPC bare (no JS-side withShowAdvisoryLock); nesting would deadlock (M5 R20 class).
      "lib/auth/picker/resetCrewMemberSelection.ts",
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
      const source = stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file);
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
    const feedActions = stripCommentsForFile(
      readFileSync(join(ROOT, "app/admin/show/[slug]/_actions/feed.ts"), "utf8"),
      "app/admin/show/[slug]/_actions/feed.ts",
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

    // Published archived-tab override (spec 2026-07-23): the RPC is the SOLE show: lock holder;
    // neither the JS route nor its RPC-caller helper may take a JS-side show lock (nesting would
    // deadlock, M5 R20 class). Negative-regression: wrap the setRpc call in withShowAdvisoryLock
    // and this fails.
    for (const f of [
      "app/api/admin/show/pull-sheet-override/route.ts",
      "lib/admin/setPublishedPullSheetOverrideRpc.ts",
    ]) {
      const src = stripCommentsForFile(readFileSync(join(ROOT, f), "utf8"), f);
      expect(src, `${f} must NOT take a JS-side show lock (single-holder rule)`).not.toMatch(
        /withShowAdvisoryLock|withPostgresSyncPipelineLock|withShowLock|pg_advisory_xact_lock/,
      );
    }

    // Targeted lock-order pin for the published override RPC: its own advisory lock must precede
    // the first row touch (the advisory-before-row list's FOR-UPDATE scan is vacuous here — the
    // RPC uses plain SELECT/UPDATE, so pin the ordering explicitly).
    const pubMig = stripCommentsForFile(
      readFileSync(
        join(ROOT, "supabase/migrations/20260723090000_published_pull_sheet_override.sql"),
        "utf8",
      ),
      "supabase/migrations/20260723090000_published_pull_sheet_override.sql",
    );
    const advisoryAt = pubMig.search(/pg_advisory_xact_lock\(/);
    const firstShowTouch = pubMig.search(/\b(select|update)\b[^;]*\bpublic\.shows\b/i);
    expect(advisoryAt, "published override RPC must call pg_advisory_xact_lock").toBeGreaterThan(
      -1,
    );
    expect(
      advisoryAt,
      "published override RPC must take its advisory lock BEFORE any public.shows read/write (advisory-before-row)",
    ).toBeLessThan(firstShowTouch);
  });

  test("PF11 guards inspect the SHIPPED bodies: dollar-tag tolerant, resolved per FUNCTION, non-empty", () => {
    // Invariant 2 is a P0, and for most of this guard's life it verified bodies no database runs.
    // Two mechanical hazards produced that, and each one makes a naive repointing WORSE than the
    // stale file list it replaces, because both fail by passing.
    const inspected = shippedLockTakerBodies();

    // NON-EMPTY SELF-CHECK. Everything below is an assertion over a discovered set; a discovery that
    // silently returns nothing makes all of it vacuous instead of red. Probed before this test was
    // written: pointing the `$$`-only extractor this guard shipped with at the migration that
    // actually ships undo_change discovers ZERO functions.
    expect(
      inspected.length,
      "no lock-taking RPC bodies discovered — the guard is a no-op",
    ).toBeGreaterThan(0);
    const byName = new Map(inspected.map((entry) => [entry.name, entry]));
    expect([...byName.keys()].sort()).toEqual(lockTakingRpcNames());

    // HAZARD 1 — the dollar-quote tag is not always `$$`. The shipped undo_change body is delimited
    // by `$function$`, and in a file that MIXES the two forms a `$$`-only non-greedy match runs from
    // one declaration to a later function's `$$`: it reports the right name with the wrong body and
    // drops the later function entirely. Pinned as the general invariant over the whole corpus, so a
    // future delimiter change fails loudly rather than emptying a guard: every declared function has
    // exactly one body extracted, in declaration order.
    for (const file of migrationFiles()) {
      const source = readMigrationSource(file);
      expect(
        extractFunctionBodies(source).map((fn) => fn.name),
        `${file}: extracted function bodies do not match the declarations — a dollar-quote tag was ` +
          `not accepted, or one body swallowed the next declaration`,
      ).toEqual(declaredFunctionNames(source));
    }

    // HAZARD 2 — resolution must UNION over the shipped catalog, never swap one file for another.
    // mi11_reject_hold is defined ONLY in 20260608000002; the 2026-08-04 migration replaces
    // mi11_approve_hold alone. Swapping the file entry stops discovering the reject side.
    expect(byName.has("mi11_reject_hold"), "mi11_reject_hold dropped from the discovered set").toBe(
      true,
    );
    expect(migrationsDefining("mi11_reject_hold")).toHaveLength(1);
    expect(migrationsDefining("mi11_approve_hold").length).toBeGreaterThan(1);

    // …and per-function resolution must actually reach the LAST definition. undo_change is the
    // instance that made this a P0: three migrations define it, and the guard read the first.
    const undoDefining = migrationsDefining("undo_change");
    expect(undoDefining.length, "undo_change resolution is not exercised").toBeGreaterThan(1);
    const undo = byName.get("undo_change");
    expect(undo, "undo_change must be inspected as a lock taker").toBeTruthy();
    expect(undo!.file).toBe(undoDefining[undoDefining.length - 1]);
    expect(
      undo!.file,
      "undo_change is still being read from the migration that INTRODUCED it",
    ).not.toBe(undoDefining[0]);
    expect(
      undo!.body,
      "the SHIPPED undo_change body must still acquire the per-show advisory lock in-RPC",
    ).toMatch(/pg_advisory_xact_lock\s*\(/i);
  });

  test("lock-order: no lock-taking RPC row-locks (FOR UPDATE) before its first pg_advisory_xact_lock (PF11)", () => {
    // resolution #15 / PF11 CRITICAL — the sync path holds the show advisory lock THEN touches rows;
    // a lock-taking admin RPC that grabbed a FOR UPDATE row lock first and then waited on the advisory
    // lock deadlocks under burst (M5 R20). Pin advisory-before-row for EVERY lock-taking RPC body.
    // This was a SECOND hardcoded migration list, and it went stale the same way the name-discovery
    // list did — repairing only one leaves the guard half-blind, since a body could be discovered as
    // a lock taker here and never order-checked, or vice versa. Both now read the same per-function
    // resolution: every SHIPPED lock-taking body, from whichever migration last defined it.
    // Non-lock-taking bodies need no entry — assertAdvisoryBeforeRowLock is a no-op for them, so
    // scanning the lock takers is exactly the coverage the old file walk produced.
    // (reset_validation_data was already excluded from the hardcoded list for this reason and is
    // re-asserted below from latestResetValidationDataBody(); it is also covered by the loop now.)
    for (const { name, file, body } of shippedLockTakerBodies()) {
      assertAdvisoryBeforeRowLock(file, name, body);
    }

    // reset_validation_data() takes its advisory locks before any mutation and takes no
    // FOR UPDATE row locks at all (trivially passes today) — but validate the SHIPPED body,
    // not a pinned migration, so a future `create or replace` that reversed the order would
    // be caught (audit idx78).
    assertAdvisoryBeforeRowLock(
      "latest reset_validation_data",
      "reset_validation_data",
      latestResetValidationDataBody(),
    );
  });

  test("reset_validation_data guards derive from the shared latest-body helper — no hardcoded reset migration (audit idx78)", () => {
    // PF11 + lockTakingRpcNames() previously hardcoded 20260622000002 (the timeout hotfix)
    // with a comment asserting it "is the LATEST definition" — false at HEAD, where
    // 20260622000003 (`delete … where ctid is not null`) is the shipped body. A future
    // `create or replace` FOR-UPDATE regression would go undetected because the guard scans a
    // superseded body. Pin: this file must NOT hardcode any reset_validation_data migration;
    // both scans derive from _resetRpcSource (latestResetValidationDataFile / …Body).
    const self = readFileSync(join(ROOT, "tests/auth/advisoryLockRpcDeadlock.test.ts"), "utf8");
    const hardcoded = self.match(/2026\d{10}_validation_reset\w*\.sql/g) ?? [];
    expect(hardcoded, `hardcoded reset migrations found: ${hardcoded.join(", ")}`).toEqual([]);

    // Positive: the SHIPPED reset body actually satisfies the advisory-before-row invariant.
    const body = latestResetValidationDataBody();
    const advisoryAt = body.search(/pg_(?:try_)?advisory_xact_lock\s*\(/i);
    const forUpdateAt = body.search(/\bfor\s+update\b/i);
    expect(advisoryAt, "shipped reset_validation_data must take an advisory lock").toBeGreaterThan(
      -1,
    );
    expect(forUpdateAt === -1 || forUpdateAt > advisoryAt).toBe(true);
  });

  test("claim_oauth_identity acquires multi-show locks in deterministic drive_file_id order", () => {
    const source = stripCommentsForFile(
      readFileSync(
        join(ROOT, "supabase/migrations/20260524000002_claim_oauth_identity.sql"),
        "utf8",
      ),
      "supabase/migrations/20260524000002_claim_oauth_identity.sql",
    );

    expect(source).toMatch(
      /for\s+r\s+in[\s\S]*?order\s+by\s+s\.drive_file_id[\s\S]*?loop[\s\S]*?pg_advisory_xact_lock\(hashtext\('show:'\s*\|\|\s*r\.drive_file_id\)\)/i,
    );
    expect(source).toMatch(/end\s+loop;\s*v_claim_at\s*:=\s*clock_timestamp\(\);/i);
  });

  test("reset_validation_data acquires multi-show locks in deterministic drive_file_id order, single-holder, before any delete", () => {
    // Task 2 — the reset is a single-holder lock-taker over the sorted distinct
    // affected-key set (shows ∪ pending_syncs ∪ pending_ingestions ∪
    // deferred_ingestions). Pin: a `for … in (…) u order by drive_file_id loop`
    // that takes pg_advisory_xact_lock(hashtext('show:' || <var>)), the lock
    // loop ends BEFORE the first delete, and there is NO nested SECURITY DEFINER
    // re-acquire (the body calls no other lock-taking RPC).
    // Uses latestResetValidationDataBody() so a future replace-function migration
    // is automatically picked up rather than silently validating the superseded body.
    const body = latestResetValidationDataBody();

    // Sorted multi-show lock loop over the distinct affected-key set.
    expect(body).toMatch(
      /for\s+\w+\s+in[\s\S]*?order\s+by\s+drive_file_id[\s\S]*?loop[\s\S]*?pg_advisory_xact_lock\(hashtext\('show:'\s*\|\|\s*\w+\)\)/i,
    );

    // The lock loop must close BEFORE the first delete (locks acquired before any mutation).
    const endLoopAt = body.search(/end\s+loop\s*;/i);
    const firstDeleteAt = body.search(/delete\s+from\s+public\./i);
    expect(endLoopAt, "reset_validation_data must contain an `end loop;`").toBeGreaterThan(-1);
    expect(firstDeleteAt, "reset_validation_data must contain a delete").toBeGreaterThan(-1);
    expect(
      endLoopAt < firstDeleteAt,
      "all per-show advisory locks must be acquired (loop closed) BEFORE the first delete",
    ).toBe(true);

    // Single-holder: the body must take the advisory lock exactly via the loop
    // and call no OTHER lock-taking RPC (no nested SECURITY DEFINER re-acquire).
    const otherLockTakers = lockTakingRpcNames().filter((n) => n !== "reset_validation_data");
    for (const name of otherLockTakers) {
      expect(
        body,
        `reset_validation_data must not call rpc/SELECT public.${name}() (nested lock-taker → double-hold)`,
      ).not.toMatch(new RegExp(`\\bpublic\\.${name}\\s*\\(`, "i"));
    }
  });

  test("abandoned finalize cleanup uses direct SQL locks and no lock-taking RPC boundary", () => {
    const source = stripCommentsForFile(
      readFileSync(join(ROOT, "lib/onboarding/sessionLifecycle.ts"), "utf8"),
      "lib/onboarding/sessionLifecycle.ts",
    );

    expect(source).toMatch(/pg_advisory_xact_lock\(hashtext\('finalize:' \|\| \$1\)\)/);
    expect(source).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
    expect(source).not.toMatch(/\.rpc\(/);
  });

  test("T10-static (finalize-resume-deadlock §5.5 R7): cleanup's lock helper takes NO FOR UPDATE before its show: advisory locks (advisory-before-row)", () => {
    // Thread 2a structural defense — cleanupAbandonedFinalize's drive-file lock
    // helper (lockCleanupDriveFiles) formerly `SELECT … FOR UPDATE`d applied-
    // manifest + shadow rows BEFORE acquiring the show: advisory locks — the
    // reverse of every show:-first recovery route (Apply, Unapprove, discard,
    // extract-agenda), an AB-BA inversion. Pin advisory-before-row on the helper
    // body so a future edit reintroducing a FOR UPDATE ahead of the show: lock
    // fails at CI (reuses the file's stripComments + assertAdvisoryBeforeRowLock).
    const source = stripCommentsForFile(
      readFileSync(join(ROOT, "lib/onboarding/sessionLifecycle.ts"), "utf8"),
      "lib/onboarding/sessionLifecycle.ts",
    );
    const helperStart = source.indexOf("async function lockCleanupDriveFiles");
    expect(helperStart, "lockCleanupDriveFiles not found").toBeGreaterThan(-1);
    // The helper is defined immediately before purgeAndRotateOnboardingSession.
    const helperEnd = source.indexOf(
      "export async function purgeAndRotateOnboardingSession",
      helperStart,
    );
    expect(helperEnd, "could not bound lockCleanupDriveFiles body").toBeGreaterThan(helperStart);
    const helperBody = source.slice(helperStart, helperEnd);
    // Must acquire a show: advisory lock and take NO FOR UPDATE ahead of it.
    expect(helperBody).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
    assertAdvisoryBeforeRowLock(
      "lib/onboarding/sessionLifecycle.ts",
      "lockCleanupDriveFiles",
      helperBody,
    );
    // Belt-and-suspenders: the helper body contains no FOR UPDATE at all.
    expect(helperBody).not.toMatch(/\bfor\s+update\b/i);
  });

  test("stale-session reap uses direct SQL locks (finalize then show), no lock-taking RPC, no rotation", () => {
    // F4 Task 4.3 — sibling of the cleanup pin above, for reapStaleOnboardingSessions
    // (spec §3.3 row "F4 stale-session reap": same layer as cleanup, single holder).
    const source = stripCommentsForFile(
      readFileSync(join(ROOT, "lib/onboarding/sessionLifecycle.ts"), "utf8"),
      "lib/onboarding/sessionLifecycle.ts",
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
        // The lock + the app_settings FOR UPDATE both live in the shared batch core
        // `executeFinalizeBatch`, which BOTH the non-streaming `handleOnboardingFinalize` and the
        // streaming `handleOnboardingFinalizeStream` delegate to (single lock holder, one topology).
        handlerName: "executeFinalizeBatch",
      },
      { file: "app/api/admin/onboarding/finalize-cas/route.ts", handlerName: "runFinalizeCas" },
    ]) {
      const source = stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file);

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
      const source = stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file);

      expect(source).toMatch(/pg_try_advisory_xact_lock\(hashtext\('finalize:' \|\| \$1\)\)/);
      expect(source).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
      expect(source).not.toMatch(/\.rpc\(/);
    }
  });

  test("extract-agenda advisory-lock topology: single admit holder in lease helper, brief show: lock in tx#2, no lock in Drive window (round-14/15/19 plan findings)", () => {
    const ROUTE =
      "app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts";
    const HELPER = "lib/agenda/extractAgendaLease.ts";

    const helperSrc = stripCommentsForFile(readFileSync(join(ROOT, HELPER), "utf8"), HELPER);
    const routeSrc = stripCommentsForFile(readFileSync(join(ROOT, ROUTE), "utf8"), ROUTE);

    // 1. Lease helper: EXACTLY ONE pg_advisory_xact_lock(hashtext('agenda-extract-admit'...))
    //    and ZERO 'show:' acquisitions (single-holder rule; round-14 — scanning the helper
    //    separately because a route-only scan cannot prove single-holder for the admit lock).
    const admitLocks = [
      ...helperSrc.matchAll(/pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'agenda-extract-admit'/g),
    ];
    expect(
      admitLocks,
      `${HELPER}: expected exactly 1 'agenda-extract-admit' advisory-lock acquisition; ` +
        `a second acquisition (here or in the route) breaches the single-holder rule`,
    ).toHaveLength(1);

    const helperShowLocks = [
      ...helperSrc.matchAll(/pg_(?:try_)?advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'show:/g),
    ];
    expect(
      helperShowLocks,
      `${HELPER}: must contain zero 'show:' advisory-lock acquisitions; ` +
        `the per-show lock lives exclusively in tx#2 of the route`,
    ).toHaveLength(0);

    // 2. The tx#1a sql.begin callback (the one containing claimExtractLease) does NOT touch
    //    pending_syncs or app_settings — the admit lock tx must commit BEFORE the staged
    //    read tx#1b; spanning them would hold the deployment-wide admit lock across the
    //    staged read (round-19 plan finding).
    const firstBeginIdx = routeSrc.indexOf("sql.begin(");
    const secondBeginIdx = routeSrc.indexOf("sql.begin(", firstBeginIdx + 1);
    expect(firstBeginIdx, `${ROUTE}: could not find first sql.begin(`).toBeGreaterThan(-1);
    expect(secondBeginIdx, `${ROUTE}: could not find second sql.begin(`).toBeGreaterThan(-1);
    const tx1aRegion = routeSrc.slice(firstBeginIdx, secondBeginIdx);
    expect(tx1aRegion, `${ROUTE}: first sql.begin (tx#1a) must call claimExtractLease`).toMatch(
      /claimExtractLease/,
    );
    expect(
      tx1aRegion,
      `${ROUTE}: tx#1a (admit-lock tx) must NOT query pending_syncs; staged read belongs in tx#1b (round-19)`,
    ).not.toMatch(/pending_syncs/);
    expect(
      tx1aRegion,
      `${ROUTE}: tx#1a (admit-lock tx) must NOT query app_settings; staged read belongs in tx#1b (round-19)`,
    ).not.toMatch(/app_settings/);

    // 3. Route has EXACTLY ONE pg_advisory_xact_lock(hashtext('show:' || ...)) acquisition
    //    in the canonical hashtext form (round-15). That single acquisition belongs in tx#2.
    const routeShowLocks = [
      ...routeSrc.matchAll(/pg_advisory_xact_lock\s*\(\s*hashtext\s*\(\s*'show:'\s*\|\|/g),
    ];
    expect(
      routeShowLocks,
      `${ROUTE}: expected exactly 1 per-show advisory-lock acquisition ` +
        `(pg_advisory_xact_lock(hashtext('show:' || ...))); a new acquisition ` +
        `requires a topology review (single-holder rule, invariant 2)`,
    ).toHaveLength(1);

    // 4. NO advisory lock in the Drive window (between tx#1b commit and tx#2 begin).
    //    The Drive window is the text from the first 'if (read.kind' (immediately after
    //    tx#1b closes) through to 'const persist' (which opens tx#2's sql.begin).
    //    Any pg_advisory*_xact_lock here would hold an advisory lock across
    //    unbounded Drive I/O, violating the spec's three-window boundary (round-19).
    const driveWindowStart = routeSrc.indexOf("if (read.kind");
    const tx2Start = routeSrc.indexOf("const persist");
    expect(
      driveWindowStart,
      `${ROUTE}: could not locate Drive-window start marker 'if (read.kind'`,
    ).toBeGreaterThan(-1);
    expect(
      tx2Start,
      `${ROUTE}: could not locate tx#2 start marker 'const persist'`,
    ).toBeGreaterThan(-1);
    expect(driveWindowStart, "Drive-window start must precede tx#2 start").toBeLessThan(tx2Start);
    const driveWindow = routeSrc.slice(driveWindowStart, tx2Start);
    expect(
      driveWindow,
      `${ROUTE}: advisory lock found in the Drive window (between tx#1b and tx#2); ` +
        `no DB connection may be held during Drive I/O`,
    ).not.toMatch(/pg_(?:try_)?advisory_xact_lock/i);
  });

  test("per-sheet rescan acquires locks in the global total order finalize: → app_settings FOR UPDATE → show: (no AB-BA vs finalize)", () => {
    // rescanWizardSheet mutates the same wizard surface as finalize. It MUST grab the
    // finalize:<session> lock first, then the app_settings FOR UPDATE session re-check, then
    // the per-show lock — the identical order finalize/finalize-cas + cleanupAbandonedFinalize
    // use — or a rescan clicked during an in-flight finalize can AB-BA deadlock (spec §8).
    const source = stripCommentsForFile(
      readFileSync(join(ROOT, "lib/onboarding/rescanWizardSheet.ts"), "utf8"),
      "lib/onboarding/rescanWizardSheet.ts",
    );
    const finalizeAt = source.search(
      /pg_try_advisory_xact_lock\(hashtext\('finalize:' \|\| \$1\)\)/,
    );
    // The authoritative session re-check is the SOLE `for update` in the file (the pre-lock
    // app_settings read at the top is deliberately non-locking/advisory). Match the keyword
    // position directly — a `from public.app_settings … for update` span would start at that
    // earlier advisory read and mis-order vs the finalize lock.
    const forUpdateAt = source.search(/\bfor\s+update\b/i);
    const showAt = source.search(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/);
    expect(finalizeAt, "rescan: no finalize: try-lock").toBeGreaterThan(-1);
    expect(forUpdateAt, "rescan: no app_settings FOR UPDATE re-check").toBeGreaterThan(-1);
    expect(showAt, "rescan: no show: lock").toBeGreaterThan(-1);
    expect(finalizeAt, "rescan: finalize: lock must precede app_settings FOR UPDATE").toBeLessThan(
      forUpdateAt,
    );
    expect(forUpdateAt, "rescan: app_settings FOR UPDATE must precede the show: lock").toBeLessThan(
      showAt,
    );
    expect(source, "rescan must use direct SQL locks, no lock-taking RPC boundary").not.toMatch(
      /\.rpc\(/,
    );
  });
});

describe("shared apply core is acquire-free (onboarding-fixups F1, spec §3.3)", () => {
  test("applyStagedCore.ts contains zero advisory-lock acquisitions and adopts via assertion only", () => {
    const core = stripCommentsForFile(
      readFileSync(join(ROOT, "lib/sync/applyStagedCore.ts"), "utf8"),
      "lib/sync/applyStagedCore.ts",
    );
    // Acquire-free: any pg_advisory* in the core is a second holder under the Phase B/D/dashboard
    // holders — deadlock under burst (M5 R20 class, invariant 2).
    expect(core).not.toMatch(/pg_(?:try_)?advisory_xact_lock/i);
    expect(core).not.toMatch(/withPostgresSyncPipelineLock|withShowLock\s*\(/);
    // Adoption, not acquisition: the core asserts the caller already holds the lock.
    expect(core).toMatch(/assertShowLockHeld|adoptShowLockHeld/);
  });

  test("applyRescanDecisionUnderLock.ts is lock-free and touches neither app_settings nor wizard_finalize_checkpoints (spec §4.2)", () => {
    // The extracted rescan core runs under finalize's ALREADY-HELD locks on a SEPARATE
    // connection (finalize's outer tx holds app_settings + wizard_finalize_checkpoints FOR
    // UPDATE). A per-row advisory acquisition OR any app_settings/checkpoints write here would
    // cross-transaction deadlock. Pin: the source acquires NO advisory lock, writes NEITHER
    // table, and calls no lock-taking RPC. (The lock acquisition + app_settings re-check +
    // checkpoint reopen stay in rescanWizardSheet's wrapper / finalize's route.)
    const core = stripCommentsForFile(
      readFileSync(join(ROOT, "lib/onboarding/applyRescanDecisionUnderLock.ts"), "utf8"),
      "lib/onboarding/applyRescanDecisionUnderLock.ts",
    );
    expect(core, "applyRescanDecisionUnderLock must acquire no advisory lock (§4.2)").not.toMatch(
      /pg_(?:try_)?advisory_xact_lock/i,
    );
    expect(core, "applyRescanDecisionUnderLock must call no lock-taking RPC").not.toMatch(
      /\.rpc\(/,
    );
    // app_settings: neither read (for update) nor written from the core.
    expect(
      core,
      "applyRescanDecisionUnderLock must not touch app_settings (§4.2 cross-tx deadlock)",
    ).not.toMatch(/\bapp_settings\b/i);
    // wizard_finalize_checkpoints: no insert/update/delete from the core.
    expect(
      core,
      "applyRescanDecisionUnderLock must not write wizard_finalize_checkpoints (§4.2 cross-tx deadlock)",
    ).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.wizard_finalize_checkpoints/i);
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
      // Task 9 — resolve-blocker's LOCKED PHASE (sql.begin callback) takes the single
      // per-show advisory lock itself (JS-side route holder, mirrors finalize/finalize-cas);
      // both action: "unarchive" and action: "rebuild" dispatch under this ONE acquisition.
      { file: "app/api/admin/onboarding/resolve-blocker/route.ts", acquisitions: 1 },
    ];
    for (const { file, acquisitions } of expected) {
      const src = stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file);
      const found = src.match(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/g) ?? [];
      expect(
        found,
        `${file}: expected exactly ${acquisitions} per-show advisory-lock acquisition(s); a new ` +
          `acquisition needs a topology review (single-holder rule, invariant 2)`,
      ).toHaveLength(acquisitions);
    }
  });

  test("resolve-blocker route is a single JS-side lock holder that reaches only the lock-free unarchive/rescan cores after acquiring it (Task 9)", () => {
    // Task 9 pin — resolve-blocker mirrors finalize/finalize-cas as a JS-side single-holder
    // route (registered in the topology table above), but ALSO dispatches into two distinct
    // lock-free mutation cores depending on `action`. This test proves (b) the route never
    // references the self-locking rescanWizardSheet wrapper or calls the is_admin()-gated
    // unarchive_show RPC (both would be a SECOND holder → deadlock, M5 R20 class), and
    // (c) the two functions actually invoked after the lock — resolveUnarchive and
    // resolveRebuild — reach ONLY _unarchive_show_apply and applyRescanDecisionUnderLock
    // respectively as their mutation entry point (no other DB-mutating call site).
    const ROUTE = "app/api/admin/onboarding/resolve-blocker/route.ts";
    const source = stripCommentsForFile(readFileSync(join(ROOT, ROUTE), "utf8"), ROUTE);

    // (a) restated at the whole-file level (belt-and-suspenders to the registry-table pin
    // above): exactly one pg_advisory_xact_lock call textually in the entire route.
    const allLockCalls = source.match(/pg_advisory_xact_lock\s*\(/g) ?? [];
    expect(
      allLockCalls,
      `${ROUTE}: expected exactly 1 pg_advisory_xact_lock call textually in the whole file`,
    ).toHaveLength(1);

    // (b) Must not reference the self-locking rescanWizardSheet wrapper (finalize:→
    // app_settings FOR UPDATE→show: order) — nesting it under this route's own show: lock
    // acquisition would be a second holder for the same hashkey (M5 R20 deadlock class).
    expect(
      source,
      `${ROUTE}: must not reference rescanWizardSheet — it is a self-locking wrapper; nesting ` +
        `under this route's show: lock would deadlock (M5 R20 class)`,
    ).not.toMatch(/rescanWizardSheet/);

    // Must not CALL the is_admin()-gated unarchive_show RPC — the route's owner postgres.js
    // connection carries no JWT for is_admin() to read (spec §3.2); only the lock-free owner-SQL
    // _unarchive_show_apply is reachable. Word-boundary regex: there is no boundary between the
    // leading "_" and "u" in "_unarchive_show_apply" (both are \w), so this pattern cannot
    // false-positive on the legitimate call below.
    expect(
      source,
      `${ROUTE}: must not call unarchive_show (the RLS/is_admin()-gated RPC) — only ` +
        `_unarchive_show_apply is reachable from this route's connection (spec §3.2)`,
    ).not.toMatch(/\bunarchive_show\s*\(/);

    // (c) Extract top-level function bodies (closing brace at column 0 — same idiom as the
    // finalize-vs-app_settings-FOR-UPDATE ordering test above) to prove reachability, not just
    // textual presence anywhere in the file.
    const fnBodies = new Map<string, string>();
    for (const m of source.matchAll(
      /(?:^|\n)(?:export\s+)?async function ([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\(([\s\S]*?)\n\}/g,
    )) {
      const [, name, body] = m;
      if (name && body) fnBodies.set(name, body);
    }

    const unarchiveBody = fnBodies.get("resolveUnarchive");
    const rebuildBody = fnBodies.get("resolveRebuild");
    const dispatchBody = fnBodies.get("handleResolveBlocker");
    expect(unarchiveBody, `${ROUTE}: could not extract resolveUnarchive body`).toBeTruthy();
    expect(rebuildBody, `${ROUTE}: could not extract resolveRebuild body`).toBeTruthy();
    expect(dispatchBody, `${ROUTE}: could not extract handleResolveBlocker body`).toBeTruthy();

    // resolveUnarchive's ONLY mutation entry point is _unarchive_show_apply — it must not
    // also reach applyRescanDecisionUnderLock (that would be a second, undocumented path).
    expect(unarchiveBody).toMatch(/_unarchive_show_apply\s*\(/);
    expect(unarchiveBody).not.toMatch(/applyRescanDecisionUnderLock/);

    // resolveRebuild's ONLY mutation entry point is the direct applyRescanDecisionUnderLock
    // call — it must not also reach _unarchive_show_apply.
    expect(rebuildBody).toMatch(/applyRescanDecisionUnderLock\s*\(/);
    expect(rebuildBody).not.toMatch(/_unarchive_show_apply/);

    // handleResolveBlocker's LOCKED PHASE calls the lock, THEN dispatches to resolveUnarchive
    // or resolveRebuild depending on `action` — both call sites must be textually AFTER the
    // lock acquisition (the lock is taken once, before either dispatch branch).
    const lockAt = dispatchBody!.search(/pg_advisory_xact_lock\s*\(/);
    expect(
      lockAt,
      `${ROUTE}: handleResolveBlocker never calls pg_advisory_xact_lock`,
    ).toBeGreaterThan(-1);
    const unarchiveDispatchAt = dispatchBody!.search(/resolveUnarchive\s*\(/);
    const rebuildDispatchAt = dispatchBody!.search(/resolveRebuild\s*\(/);
    expect(
      unarchiveDispatchAt,
      `${ROUTE}: handleResolveBlocker never dispatches to resolveUnarchive`,
    ).toBeGreaterThan(-1);
    expect(
      rebuildDispatchAt,
      `${ROUTE}: handleResolveBlocker never dispatches to resolveRebuild`,
    ).toBeGreaterThan(-1);
    expect(
      unarchiveDispatchAt > lockAt,
      `${ROUTE}: resolveUnarchive is dispatched before the lock is acquired`,
    ).toBe(true);
    expect(
      rebuildDispatchAt > lockAt,
      `${ROUTE}: resolveRebuild is dispatched before the lock is acquired`,
    ).toBe(true);
  });

  test(
    "finalize §5.6 re-select topology: parse_result re-read runs under the existing show: lock " +
      "with zero new acquisitions (Task 12, publish-safety)",
    () => {
      // Spec §5.6 / Task 12: inside defaultWithRowTx (which already holds
      // pg_advisory_xact_lock(hashtext('show:' || $1)) at line ~164), processApprovedRow
      // re-SELECTs parse_result from pending_syncs generation-scoped before apply.
      // This re-read captures any agenda extraction that completed between
      // selectFinishableCleanRows (outer tx, no show: lock) and the per-row tx.
      //
      // Invariant: the re-SELECT must be INSIDE the locked tx window and must NOT add a
      // new pg_advisory_xact_lock — that would create a nested holder (deadlock class, M5 R20).
      //
      // Negative-regression verification (manual, performed during Task 12 authoring):
      // Temporarily adding `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`
      // immediately before the re-SELECT raised the `toHaveLength(1)` count to 2,
      // causing the topology test above to FAIL.  After reverting, it passes at 1.
      // This confirms the structural guard is load-bearing.
      const FINALIZE = "app/api/admin/onboarding/finalize/route.ts";
      const src = stripCommentsForFile(readFileSync(join(ROOT, FINALIZE), "utf8"), FINALIZE);

      // (1) The generation-scoped re-SELECT pattern must be present (all four WHERE keys).
      expect(
        src,
        `${FINALIZE}: §5.6 re-SELECT (wizard_session_id + drive_file_id + staged_id + ` +
          `staged_modified_time) not found — Task 12 re-read was removed or renamed`,
      ).toMatch(
        /select parse_result[\s\S]*?from public\.pending_syncs[\s\S]*?where[\s\S]*?wizard_session_id[\s\S]*?drive_file_id[\s\S]*?staged_id[\s\S]*?staged_modified_time/i,
      );

      // (2) Acquisition count must remain at exactly 1 (single-holder rule). A second
      // pg_advisory_xact_lock anywhere in the file is a nested-holder deadlock risk.
      const acquisitions =
        src.match(/pg_advisory_xact_lock\(hashtext\('show:' \|\| \$1\)\)/g) ?? [];
      expect(
        acquisitions,
        `${FINALIZE}: §5.6 re-SELECT block must NOT add a new advisory-lock acquisition — ` +
          `acquisition count must stay at 1 (defaultWithRowTx is the single holder)`,
      ).toHaveLength(1);

      // (3) Drive-light: the re-SELECT block must not contain any Drive call pattern.
      // Finalize reads parse_result from the DB only; per-PDF Drive revalidation is
      // delegated to cron (spec §5.7 temporal-scope).
      expect(
        src,
        `${FINALIZE}: Drive call found near the §5.6 re-SELECT block; ` +
          `finalize must not make per-PDF Drive calls during apply`,
      ).not.toMatch(/getFile|downloadFileBytes/i);
    },
  );
});

// ── Parallel arm: the `withShowLock` JS wrapper (invariant 2 single-holder) ─────────
//
// The arm above scans `withShowAdvisoryLock` (`lib/db/advisoryLock.ts`). `withShowLock`
// (`lib/sync/lockedShowTx.ts:88`) is a DIFFERENT wrapper over the same hashkey
// (`hashtext('show:' || drive_file_id)`), so it needs its own scan or its acquirers go
// unguarded. Both wrappers, one rule: for a given hashkey the lock is acquired at
// exactly ONE layer. A body that calls an RPC which self-locks deadlocks under burst
// (the M5 R20 class), so the pin is that nothing under the lock reaches for an RPC.
//
// Discovery is FILESYSTEM-WALKED, so an acquirer added tomorrow is scanned by default,
// and EVERY match is classified — none is silently dropped, because a dropped site is
// indistinguishable from a clean one. Four shapes exist:
//
//   inline       `withShowLock(id, async (tx) => { … })` — the body is right here.
//   delegate     `withShowLock(id, (tx) => helper(tx, …))` — an expression arrow whose
//                work is a named same-file function. The arm scans THAT function's body.
//                One hop, same file, deliberately not a cross-module resolver: a
//                recognizer that chases delegation everywhere becomes a bigger target
//                than the defect it guards.
//   passthrough  the callback is a parameter the CALLER supplies (`fn`), so this site
//                has no body of its own. DOCUMENTED LIMIT: the arm inspects nothing
//                here. It costs nothing, because every caller that supplies a real
//                callback does so at its own `withShowLock` / `deps.withShowLock` call
//                site, which this same walk discovers and scans.
//   declaration  the wrapper's own definition, or an interface member / method that
//                declares one. Detected STRUCTURALLY (a parameter list carries top-level
//                `name: Type` annotations), never by filename — excluding by filename
//                would blind the arm the day someone re-homes the wrapper.
//
// The classification is asserted complete in BOTH directions against the registry below.
// An unregistered site lands on one side; a registered one the walk can no longer see
// lands on the other, which is the premise failing rather than production being wrong.
// A rename that demotes a `delegate` to `passthrough` changes its registry string and
// fails here too, so the weaker classification can never be reached quietly.

type LockSiteKind = "inline" | "delegate" | "passthrough" | "declaration";
type LockCallSite = { file: string; kind: LockSiteKind; label: string; span: string };

/** Every `withShowLock` site in `app/` + `lib/`, as `file::kind::label`. */
const WITH_SHOW_LOCK_SITES: readonly string[] = [
  "app/admin/onboarding/_actions/stagedWarningIgnore.ts::inline::callback",
  "app/admin/onboarding/_actions/useRawStaged.ts::inline::callback",
  "app/admin/show/[slug]/_actions/useRaw.ts::inline::callback",
  // The injectable deps member (declaration), the method that implements it
  // (declaration), and that method's forward of the caller's own `fn` (passthrough).
  // The two real bodies are the `deps.withShowLock` call sites.
  "lib/sync/assetRecovery.ts::declaration::withShowLock",
  "lib/sync/assetRecovery.ts::declaration::withShowLock",
  "lib/sync/assetRecovery.ts::inline::callback",
  "lib/sync/assetRecovery.ts::inline::callback",
  "lib/sync/assetRecovery.ts::passthrough::fn",
  // The wrapper itself.
  "lib/sync/lockedShowTx.ts::declaration::withShowLock",
  "lib/sync/promoteSnapshot.ts::inline::callback",
  "lib/sync/promoteSnapshot.ts::inline::callback",
  "lib/sync/runOnboardingScan.ts::delegate::recordLiveRowConflict",
  // withPostgresSyncPipelineLock forwards the caller's `fn`; the cron callers' own
  // bodies are scanned where they are written.
  "lib/sync/runScheduledCronSync.ts::passthrough::fn",
  "lib/sync/unpublishShow.ts::delegate::unpublishShowViaEmailedLink_unlocked",
];

function walkSourceFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  visit(join(ROOT, root));
  return out;
}

/** Index of the `}` / `)` matching the opener at `open`, or -1. */
function matchDelim(source: string, open: number, oc: string, cc: string): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === oc) depth += 1;
    else if (ch === cc) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** True iff the argument list carries a top-level `name: Type` annotation — the shape a
 *  PARAMETER list has and a call's argument list does not. Depth-aware, so a `:` inside
 *  an options object literal or a nested type never counts.
 *
 *  Angle brackets are deliberately NOT depth delimiters. They do not nest reliably in
 *  source text: the `>` of an arrow `=>` decrements the depth, after which every `:` in
 *  an inline callback body reads as top-level and EVERY call misclassifies as a
 *  declaration — which is exactly what it did before this note existed. Parens and
 *  braces are enough, because a generic in a parameter position always sits inside one. */
function looksLikeParameterList(argList: string): boolean {
  let depth = 0;
  for (let i = 0; i < argList.length; i += 1) {
    const ch = argList[i];
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    else if (ch === ":" && depth === 1) return true;
  }
  return false;
}

/** The body of a same-file `function NAME(...) { … }`, or null when unresolvable. */
function sameFileFunctionBody(source: string, name: string): string | null {
  const decl = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(`).exec(source);
  if (!decl) return null;
  const paramOpen = source.indexOf("(", decl.index + decl[0].length - 1);
  const paramClose = matchDelim(source, paramOpen, "(", ")");
  if (paramClose === -1) return null;
  const bodyOpen = source.indexOf("{", paramClose);
  const bodyClose = matchDelim(source, bodyOpen, "{", "}");
  if (bodyOpen === -1 || bodyClose === -1) return null;
  return source.slice(bodyOpen + 1, bodyClose);
}

function withShowLockSites(source: string, file: string): LockCallSite[] {
  const sites: LockCallSite[] = [];
  const call = /(?:\w+\.)?withShowLock\s*(?:<[^>()]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(source)) !== null) {
    const openParen = source.indexOf("(", m.index + m[0].length - 1);
    const closeParen = matchDelim(source, openParen, "(", ")");
    if (closeParen === -1) continue;
    const argList = source.slice(openParen, closeParen);

    if (looksLikeParameterList(argList)) {
      sites.push({ file, kind: "declaration", label: "withShowLock", span: "" });
      continue;
    }

    const blockArrow = argList.indexOf("=> {");
    if (blockArrow !== -1) {
      const bodyOpen = argList.indexOf("{", blockArrow);
      const bodyClose = matchDelim(argList, bodyOpen, "{", "}");
      if (bodyClose !== -1) {
        sites.push({
          file,
          kind: "inline",
          label: "callback",
          span: argList.slice(bodyOpen + 1, bodyClose),
        });
        continue;
      }
    }

    // `(tx) => name(...)`, or a bare identifier argument — the delegate / passthrough
    // split is decided by whether `name` resolves to a same-file function.
    const named =
      /=>\s*([A-Za-z_$][\w$]*)\s*\(/.exec(argList) ?? /,\s*([A-Za-z_$][\w$]*)\s*,/.exec(argList);
    const label = named?.[1] ?? "unknown";
    const body = named ? sameFileFunctionBody(source, label) : null;
    sites.push(
      body === null
        ? { file, kind: "passthrough", label, span: "" }
        : { file, kind: "delegate", label, span: body },
    );
  }
  return sites;
}

function discoverWithShowLockSites(): LockCallSite[] {
  const found: LockCallSite[] = [];
  for (const root of ["app", "lib"]) {
    for (const full of walkSourceFiles(root)) {
      const rel = relative(ROOT, full);
      found.push(...withShowLockSites(stripCommentsForFile(readFileSync(full, "utf8"), rel), rel));
    }
  }
  return found;
}

describe("withShowLock acquirer topology (invariant 2, single holder)", () => {
  test("site discovery is complete in both directions", () => {
    const discovered = discoverWithShowLockSites()
      .map((s) => `${s.file}::${s.kind}::${s.label}`)
      .sort();
    expect(discovered).toEqual([...WITH_SHOW_LOCK_SITES].sort());
  });

  test("every scannable site yields a non-empty span", () => {
    // Without this, an inline body the extractor failed to close, or a delegate whose
    // target moved, would contribute an empty span and sail through the `.rpc(`
    // assertion below having inspected nothing at all.
    for (const site of discoverWithShowLockSites()) {
      if (site.kind === "passthrough" || site.kind === "declaration") continue;
      expect(
        site.span.trim().length,
        `${site.file}::${site.kind}::${site.label}: empty span — nothing would be inspected`,
      ).toBeGreaterThan(0);
    }
  });

  test("nothing under a withShowLock call reaches for an RPC", () => {
    const sites = discoverWithShowLockSites();
    for (const site of sites) {
      expect(
        site.span,
        `${site.file} (${site.kind}: ${site.label}) calls .rpc(...) under withShowLock; if that ` +
          `RPC also acquires pg_advisory_xact_lock on another connection the request deadlocks ` +
          `(M5 R20 class). Acquire at exactly one layer: the JS wrapper here, or the RPC's own body.`,
      ).not.toMatch(/\.rpc\s*\(/);
    }
    // Non-vacuous self-check: an extractor that silently returns nothing would turn the
    // assertion above into a pass for every file at once.
    const scannable = sites.filter((s) => s.kind === "inline" || s.kind === "delegate");
    expect(
      scannable.length,
      "no scannable withShowLock bodies were extracted — the assertion above is vacuous",
    ).toBeGreaterThan(0);
  });
});
