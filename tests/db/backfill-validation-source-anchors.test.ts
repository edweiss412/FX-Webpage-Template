import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// idx38/#178 — AGENTS.md plan-wide invariant 2: every code path that mutates `shows` runs inside
// the per-show advisory lock keyed on `hashtext('show:' || drive_file_id)` (admin/blocking path →
// pg_advisory_xact_lock). The one-shot validation backfill UPDATEs public.shows.source_anchors; a
// runtime DB test is disproportionate for a one-off script (and needs the remote validation
// pooler), so this STRUCTURAL test pins that the lock is acquired — in a transaction, before the
// UPDATE — using the codebase's canonical hashkey convention (grep `hashtext('show:'`).
const ROOT = process.cwd();
const SRC = readFileSync(join(ROOT, "scripts/backfill-validation-source-anchors.ts"), "utf8");

describe("backfill-validation-source-anchors advisory-lock topology (invariant 2)", () => {
  test("acquires pg_advisory_xact_lock(hashtext('show:' || …)) before the shows UPDATE", () => {
    // Canonical per-show hashkey convention (matches app/api/admin/onboarding/finalize*/route.ts).
    expect(SRC).toMatch(/pg_advisory_xact_lock\(hashtext\('show:' \|\|/);

    // The lock acquisition must PRECEDE the shows UPDATE — the xact lock has to be held when the
    // row is written, or a concurrent per-show mutator can interleave (invariant 2).
    const lockIdx = SRC.indexOf("pg_advisory_xact_lock(hashtext('show:'");
    const updateIdx = SRC.search(/update\s+shows\b/i);
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeLessThan(updateIdx);
  });

  test("wraps the lock + UPDATE in a single transaction (sql.begin) so the xact lock scopes the write", () => {
    // pg_advisory_xact_lock is transaction-scoped; the lock and the UPDATE must share one tx.
    expect(SRC).toMatch(/sql\.begin\(/);
  });
});
