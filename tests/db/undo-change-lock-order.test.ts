/**
 * Phase 4 Task 4.2 / 4.7 — lock-order guard for undo_change + _undo_tombstone (PF11 / resolution #15).
 *
 * CRITICAL deadlock class (M5 R20): the sync path holds the per-show advisory lock THEN touches
 * rows. A lock-taking admin RPC that grabbed a FOR UPDATE row lock BEFORE the advisory lock would
 * deadlock under burst. Statically assert, for every function body in the undo migration that takes
 * pg_advisory_xact_lock, that no `for update` token appears before the first advisory-lock token.
 */
import { describe, expect, it } from "vitest";

import {
  declaredFunctionNames,
  migrationsDefining,
  readMigrationSource,
  shippedFunctionBody,
} from "./_sqlFunctionBodies";

/**
 * The migration that INTRODUCED the undo family. It names the function set to check; it is NOT the
 * body source — two later migrations `create or replace` undo_change, and this guard spent its life
 * reading the superseded original. Each function below is resolved to its own last definition, so
 * _undo_tombstone and cleanup_superseded_before_images (which nothing redefines) keep their coverage
 * while undo_change follows the replacements.
 */
const UNDO_SEED_MIGRATION = "supabase/migrations/20260608000003_undo_change_rpc.sql";

function shippedUndoFamilyBodies(): Array<{ name: string; file: string; body: string }> {
  const names = [...new Set(declaredFunctionNames(readMigrationSource(UNDO_SEED_MIGRATION)))];
  // Non-empty self-check: a delimiter the extractor does not accept would empty this list and every
  // assertion built on it would pass vacuously rather than fail.
  expect(names.length, `${UNDO_SEED_MIGRATION}: no function definitions found`).toBeGreaterThan(0);
  return names.map((name) => ({ name, ...shippedFunctionBody(name) }));
}

describe("undo_change migration — advisory-lock-before-row-lock order (PF11)", () => {
  it("no FOR UPDATE precedes the first pg_advisory_xact_lock in any lock-taking body", () => {
    const scanned = shippedUndoFamilyBodies();
    expect(scanned.length).toBeGreaterThan(0);
    let sawLockTaker = false;
    for (const { name, file, body } of scanned) {
      const advisoryAt = body.search(/pg_(?:try_)?advisory_xact_lock\s*\(/i);
      if (advisoryAt === -1) continue; // not a lock-taking body
      sawLockTaker = true;
      const forUpdateAt = body.search(/\bfor\s+update\b/i);
      expect(
        forUpdateAt === -1 || forUpdateAt > advisoryAt,
        `${file}: ${name}: FOR UPDATE (idx ${forUpdateAt}) appears before pg_advisory_xact_lock (idx ${advisoryAt}) — reverses advisory-then-row order (PF11)`,
      ).toBe(true);
    }
    // undo_change itself must be a lock-taker.
    expect(sawLockTaker).toBe(true);
    expect(scanned.map((entry) => entry.name)).toContain("undo_change");
  });

  it("scans the SHIPPED undo-family bodies, resolved per function, not the migration that introduced them", () => {
    // Same two hazards as the PF11 name-discovery guard (tests/auth/advisoryLockRpcDeadlock.test.ts):
    // a `$$`-only extractor finds nothing in the migration that ships undo_change (its body is
    // delimited by `$function$`), and a file-level repoint would stop scanning _undo_tombstone and
    // cleanup_superseded_before_images, which no later migration redefines. Resolution is therefore
    // per FUNCTION, with a non-empty self-check so a future delimiter change fails loudly instead of
    // emptying this guard.
    const scanned = shippedUndoFamilyBodies();
    expect(
      scanned.length,
      "no undo-family bodies discovered — this guard is a no-op",
    ).toBeGreaterThan(0);
    const byName = new Map(scanned.map((entry) => [entry.name, entry]));
    // Union preserved: the seed migration's other two functions are still scanned.
    expect(byName.has("_undo_tombstone")).toBe(true);
    expect(byName.has("cleanup_superseded_before_images")).toBe(true);

    // undo_change is read from its LAST definition, and that is not the one that introduced it.
    const defining = migrationsDefining("undo_change");
    expect(defining.length, "undo_change resolution is not exercised").toBeGreaterThan(1);
    const undo = byName.get("undo_change");
    expect(undo, "undo_change must be scanned").toBeTruthy();
    expect(undo!.file).toBe(defining[defining.length - 1]);
    expect(undo!.file, "still reading the migration that INTRODUCED undo_change").not.toBe(
      defining[0],
    );
    expect(undo!.body, "the shipped undo_change body must be a lock taker").toMatch(
      /pg_advisory_xact_lock\s*\(/i,
    );
  });
});
