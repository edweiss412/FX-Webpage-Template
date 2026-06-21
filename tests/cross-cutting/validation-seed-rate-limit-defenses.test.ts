/**
 * tests/cross-cutting/validation-seed-rate-limit-defenses.test.ts
 *
 * M12 Phase 0.E structural-defense calibration (AGENTS.md). The rate-limit
 * snapshot/quota-state-correctness vector drew adversarial findings in three
 * consecutive rounds:
 *   • R2 — hour_bucket derived from the client/gateway clock (boundary race).
 *   • R3 — unlocked SELECT-then-UPSERT (lost-update vs live enforceQuota).
 *   • R4 — force-overwrite across an hour boundary stranded the prior bucket.
 *
 * Per the structural-defense-calibration rule, the convergence path is no
 * longer another adversarial round — it is a CI-time guard that pins the
 * DB-side defenses so a future migration/harness edit cannot silently drop
 * them and re-open the class. This meta-test walks the live migration + harness
 * source and asserts each defense is present.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const MIGRATION = join(ROOT, "supabase/migrations/20260527210002_validation_seed_rate_limit.sql");
const ALERT_MIGRATION = join(
  ROOT,
  "supabase/migrations/20260527210003_validation_seed_admin_alert.sql",
);
const HARNESS = join(ROOT, "scripts/validation-report-fixtures.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("validation_seed_rate_limit DB-side defenses (R2/R3/R4 structural pin)", () => {
  const migration = read(MIGRATION);
  const harness = read(HARNESS);

  test("R2 — bucket is derived DB-side via date_trunc('hour', now()), not a client clock", () => {
    expect(migration).toMatch(/date_trunc\(\s*'hour'\s*,\s*now\(\)\s*\)/);
    // The harness must NOT pass a client-computed bucket to the seed path.
    expect(harness).not.toMatch(/truncToHourUtc/);
  });

  test("R3 — RPC serializes against enforceQuota with a SHARE ROW EXCLUSIVE table lock", () => {
    expect(migration.toLowerCase()).toMatch(
      /lock\s+table\s+public\.report_rate_limits\s+in\s+share\s+row\s+exclusive\s+mode/,
    );
  });

  test("R6 — write-ahead: harness PEEKs (dry-run) + persists snapshot BEFORE the destructive seed", () => {
    // The RPC supports a non-mutating peek (p_dry_run) used to capture the
    // prior+bucket so the snapshot file is durable before the seed mutation.
    expect(migration).toMatch(/p_dry_run\s+boolean\s+default\s+false/);
    expect(migration.toLowerCase()).toMatch(/if\s+not\s+p_dry_run\s+then/);
    // The harness must call the RPC twice: a dry-run peek, then the seed, with
    // writeSnapshot BETWEEN them (durable restore record before mutation).
    expect(harness).toMatch(/p_dry_run:\s*true/);
    expect(harness).toMatch(/p_dry_run:\s*false/);
    const peekIdx = harness.indexOf("p_dry_run: true");
    const writeIdx = harness.indexOf("writeSnapshot(file", peekIdx);
    const seedIdx = harness.indexOf("p_dry_run: false");
    expect(peekIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(peekIdx);
    expect(seedIdx).toBeGreaterThan(writeIdx);
  });

  test("R7/R9 — seed-time prior rewrite (committed) + pending-status crash marker + cleanup warning", () => {
    // The peek snapshot is "pending"; the post-seed rewrite is "committed" with
    // the seed-time authoritative prior. Cleanup warns on a "pending" snapshot
    // (crash between seed and rewrite) rather than silently restoring a
    // possibly-stale prior.
    expect(harness).toMatch(/status:\s*"pending"/);
    expect(harness).toMatch(/status:\s*"committed"/);
    expect(harness).toMatch(/snapshot is "pending"/);
    // The committed rewrite must use the SEED RPC's returned prior (R7), not the
    // peek's, so a [peek,seed] increment is preserved in the no-crash case.
    expect(harness).toMatch(/snapshot_prior_count:\s*seeded\.snapshot_prior_count/);
  });

  test("R7 — rate-limit-crew identity is bound to the combo's validation fixture show", () => {
    expect(harness).toMatch(/shows!inner\(drive_file_id, client_label\)/);
    expect(harness).toMatch(/does NOT resolve to a crew_member on/);
  });

  test("R11 — resolveShowId requires the 'M12 Validation' ownership sentinel", () => {
    // The non-rate outcomes' show lookup must carry the fixture-ownership proof.
    expect(harness).toMatch(/\.eq\("client_label", "M12 Validation"\)/);
  });

  test("R12 — bot-login dual-write is one atomic both-or-neither RPC", () => {
    const alertMigration = read(
      join(ROOT, "supabase/migrations/20260527210004_validation_seed_bot_login_alerts.sql"),
    );
    // The harness routes the bot-login dual-write through the combined RPC.
    expect(harness).toMatch(/\.rpc\(\s*["']validation_seed_bot_login_alerts["']/);
    // The RPC checks BOTH scopes under one lock before writing either.
    expect(alertMigration.toLowerCase()).toMatch(
      /lock\s+table\s+public\.admin_alerts\s+in\s+share\s+row\s+exclusive\s+mode/,
    );
    expect(alertMigration).toMatch(/GITHUB_BOT_LOGIN_MISSING/);
    expect(alertMigration).toMatch(/REPORT_LOOKUP_INCONCLUSIVE/);
    expect(alertMigration).toMatch(/upsert_admin_alert\(null, 'GITHUB_BOT_LOGIN_MISSING'/);
    expect(alertMigration.toLowerCase()).toMatch(
      /grant execute on function public\.validation_seed_bot_login_alerts\(uuid, jsonb\) to service_role/,
    );
  });

  test("R11 — re-seeded fixture alert refreshes raised_at (banner freshness)", () => {
    const alertMigration = read(
      join(ROOT, "supabase/migrations/20260527210003_validation_seed_admin_alert.sql"),
    );
    expect(alertMigration.toLowerCase()).toMatch(/set raised_at = now\(\)/);
  });

  test("R8 — cleanup mode rejects seed-only flags before any destructive write", () => {
    // The rejections must appear BEFORE the defaultCleanup call in the source.
    const cleanupIdx = harness.indexOf("if (values.cleanup) {");
    const defaultCleanupIdx = harness.indexOf("await defaultCleanup(supabase)", cleanupIdx);
    const forceFlagRejectIdx = harness.indexOf(
      "--force-overwrite-snapshot is a seed-only flag and is not valid with --cleanup",
    );
    expect(cleanupIdx).toBeGreaterThan(-1);
    expect(forceFlagRejectIdx).toBeGreaterThan(cleanupIdx);
    expect(forceFlagRejectIdx).toBeLessThan(defaultCleanupIdx);
  });

  test("R4 — RPC refuses force-overwrite across an hour boundary (p_expected_prev_bucket guard)", () => {
    expect(migration).toMatch(/p_expected_prev_bucket/);
    expect(migration.toLowerCase()).toMatch(/across hour boundary/);
    // The harness must thread the existing snapshot's bucket into the RPC so
    // the DB-side guard can fire.
    expect(harness).toMatch(/p_expected_prev_bucket:\s*expectedPrevBucket/);
    expect(harness).toMatch(/expectedPrevBucket\s*=\s*existingSnap\.recorded_hour_bucket/);
  });

  test("R3 MED — force-overwrite refuses a different (kind, identity) snapshot", () => {
    expect(harness).toMatch(/--force-overwrite-snapshot refused/);
    expect(harness).toMatch(
      /existingSnap\.kind\s*!==\s*kind\s*\|\|\s*existingSnap\.identity\s*!==\s*identity/,
    );
  });

  test("R1/R5 — admin_alerts writes go through the ATOMIC validation_seed_admin_alert RPC (lock + refuse-non-fixture + delegate)", () => {
    const alertMigration = read(ALERT_MIGRATION);
    // The harness writes alerts ONLY through the atomic RPC (no raw upsert, no
    // TOCTOU preflight).
    expect(harness).toMatch(/\.rpc\(\s*["']validation_seed_admin_alert["']/);
    expect(harness).not.toMatch(/assertAdminAlertNoClobber/);
    // The RPC atomically locks, refuses a pre-existing non-fixture row, and
    // delegates the actual write to the canonical upsert_admin_alert.
    expect(alertMigration.toLowerCase()).toMatch(
      /lock\s+table\s+public\.admin_alerts\s+in\s+share\s+row\s+exclusive\s+mode/,
    );
    expect(alertMigration.toLowerCase()).toMatch(/refusing to seed admin_alert/);
    expect(alertMigration).toMatch(/not like 'm12-fixture-%'/);
    expect(alertMigration).toMatch(/public\.upsert_admin_alert\(/);
    expect(alertMigration.toLowerCase()).toMatch(
      /revoke all on function public\.validation_seed_admin_alert\(uuid, text, jsonb\) from public, anon, authenticated/,
    );
    expect(alertMigration.toLowerCase()).toMatch(
      /grant execute on function public\.validation_seed_admin_alert\(uuid, text, jsonb\) to service_role/,
    );
  });

  test("RPC is service_role-only (no anon/authenticated execute)", () => {
    expect(migration.toLowerCase()).toMatch(
      /revoke all on function public\.validation_seed_rate_limit\(text, text, integer, timestamptz, boolean\) from public, anon, authenticated/,
    );
    expect(migration.toLowerCase()).toMatch(
      /grant execute on function public\.validation_seed_rate_limit\(text, text, integer, timestamptz, boolean\) to service_role/,
    );
  });
});
