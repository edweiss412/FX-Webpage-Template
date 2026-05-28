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
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260527210002_validation_seed_rate_limit.sql",
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
    expect(harness).toMatch(/existingSnap\.kind\s*!==\s*kind\s*\|\|\s*existingSnap\.identity\s*!==\s*identity/);
  });

  test("R1/R2 — admin_alerts writes go through a clobber guard (refuse pre-existing non-fixture)", () => {
    expect(harness).toMatch(/assertAdminAlertNoClobber/);
    expect(harness).toMatch(/refusing to seed admin_alert/);
  });

  test("RPC is service_role-only (no anon/authenticated execute)", () => {
    expect(migration.toLowerCase()).toMatch(
      /revoke all on function public\.validation_seed_rate_limit\(text, text, integer, timestamptz\) from public, anon, authenticated/,
    );
    expect(migration.toLowerCase()).toMatch(
      /grant execute on function public\.validation_seed_rate_limit\(text, text, integer, timestamptz\) to service_role/,
    );
  });
});
