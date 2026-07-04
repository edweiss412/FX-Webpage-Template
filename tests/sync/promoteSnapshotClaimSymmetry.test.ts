// tests/sync/promoteSnapshotClaimSymmetry.test.ts
//
// Regression for the diagram-snapshot promote outage (2026-07-03): the promote
// rollback path (`clearRolledBack`) released a claim with `claim_token = null,
// claimed_at = null` but `claim_expires_at = now()` (non-null) — which violates
// the DB CHECK `pending_snapshot_uploads_claim_symmetry_check` (all three claim
// columns must be set-together or null-together), raising PG 23514 on EVERY
// rollback for ANY show. postgres is mocked in the promote unit tests, so the
// constraint was never exercised. Here the mock ENFORCES the real constraint
// against the actual `clearRolledBack` SQL, and we force the rollback path
// (manifest mismatch) so the release runs.
import { describe, expect, test, vi } from "vitest";

const showId = "11111111-1111-4111-8111-111111111111";
const driveFileId = "drive-file-1";
const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tempPrefix = `diagram-snapshots/shows/${showId}/_pending/run-1/`;

// Enforce the claim_symmetry CHECK the way Postgres would: any statement that
// nulls the claim token/claimed_at but leaves claim_expires_at non-null (or any
// asymmetric mix) is rejected with the real constraint's error.
function assertClaimSymmetry(sql: string): void {
  if (!/pending_snapshot_uploads/i.test(sql)) return;
  // Extract the assigned value of each claim column (up to the next comma/newline).
  const assignedValue = (col: string): string | null => {
    const m = sql.match(new RegExp(`${col}\\s*=\\s*([^,\\n]+)`, "i"));
    return m?.[1]?.trim().toLowerCase() ?? null; // null == column not assigned here
  };
  const assigned = ["claim_token", "claimed_at", "claim_expires_at"]
    .map(assignedValue)
    .filter((v): v is string => v !== null);
  if (assigned.length === 0) return; // statement doesn't touch the claim columns
  const isNull = (v: string) => v === "null";
  const allNull = assigned.every(isNull);
  const allSet = assigned.every((v) => !isNull(v));
  if (!allNull && !allSet) {
    throw new Error(
      'new row for relation "pending_snapshot_uploads" violates check constraint ' +
        '"pending_snapshot_uploads_claim_symmetry_check"',
    );
  }
}

const mock = vi.hoisted(() => {
  const hoistedShowId = "11111111-1111-4111-8111-111111111111";
  const hoistedDriveFileId = "drive-file-1";
  const hoistedRev = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const initialRow = {
    id: "22222222-2222-4222-8222-222222222222",
    show_id: hoistedShowId,
    drive_file_id: hoistedDriveFileId,
    temp_prefix: `diagram-snapshots/shows/${hoistedShowId}/_pending/run-1/`,
    snapshot_revision_id: hoistedRev,
    asset_count: 2,
    expected_asset_count: 2,
  };
  return { initialRow };
});

vi.mock("postgres", () => ({
  default: vi.fn(() =>
    Object.assign(
      vi.fn(async () => [mock.initialRow]),
      { end: vi.fn() },
    ),
  ),
}));

vi.mock("@/lib/sync/lockedPromoteTx", () => ({
  withPromoteLock: async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      queryOne: vi.fn(async (sql: string) => {
        // The rollback release (clearRolledBack) — enforce the real CHECK.
        assertClaimSymmetry(sql);
        if (/set\s+claim_token\s*=\s*gen_random_uuid\(\)/i.test(sql)) {
          return { ...mock.initialRow, promoted_at: null, claim_token: "claim-1" };
        }
        return { ok: true };
      }),
    }),
}));

vi.mock("@/lib/sync/lockedShowTx", () => ({
  withShowLock: async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      queryOne: vi.fn(async (sql: string) => {
        if (/jsonb_array_elements/i.test(sql)) return { count: 2 }; // expected assets = 2
        if (/with\s+target/i.test(sql)) return { updated: true };
        return { ok: true };
      }),
    }),
}));

const { promoteSnapshotUpload } = await import("@/lib/sync/promoteSnapshot");

describe("promote rollback path releases the claim without violating claim_symmetry", () => {
  test("manifest mismatch → clearRolledBack succeeds (no 23514) and returns manifest_mismatch", async () => {
    // storage.list returns ONE object while expected=2 → forces the pre-move
    // manifest-mismatch rollback (the exact path the outage hit).
    const storage = {
      list: vi.fn(async (prefix: string) =>
        prefix === tempPrefix ? [`${tempPrefix}only.jpg`] : [],
      ),
      move: vi.fn(async () => undefined),
    };

    const result = await promoteSnapshotUpload(snapshotRevisionId, { storage });

    expect(result).toEqual({ outcome: "manifest_mismatch", snapshotRevisionId });
    // Pre-fix (claim_expires_at = now()) assertClaimSymmetry throws → this rejects.
  });
});
