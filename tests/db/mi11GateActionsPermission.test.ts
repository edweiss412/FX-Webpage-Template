/**
 * Task 3.6 — REAL permission boundary (not mocked; PF24).
 *
 * approveMi11Hold's lookup read of sync_holds MUST use the SERVICE-ROLE client, because sync_holds is
 * RLS-locked from `authenticated` (F9 / resolution #10). This test proves, against the real DB, that:
 *   (a) a service-role read of a seeded sync_holds row by id SUCCEEDS (resolves drive_file_id), AND
 *   (b) a direct `authenticated`-client SELECT (ADMIN_CLAIMS authed path) on that same row is
 *       RLS-DENIED (zero rows) — so the helper CANNOT do the lookup with the authenticated client.
 *
 * Failure mode caught (PF24): the helper does the lookup read with the authenticated client → it
 * silently returns zero rows for real admins under Phase-1 RLS (the mocked Task 3.6 test still passes).
 */
import { afterAll, describe, expect, it } from "vitest";

import { asAdminTx, closeMi11Helpers, heldFromCrew, mi11Sql, seedHold, seedShow } from "./_mi11Helpers";

afterAll(closeMi11Helpers);

describe("mi11 gate action lookup — sync_holds RLS posture (PF24)", () => {
  it("(a) service-role/superuser read by id resolves drive_file_id; (b) authenticated SELECT is RLS-denied", async () => {
    const show = await seedShow(mi11Sql);
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: "2026-06-01T00:00:00.000Z",
    });

    // (a) service-role-equivalent (superuser TEST_DATABASE_URL) read succeeds and yields drive_file_id.
    const [svc] = (await mi11Sql`
      select drive_file_id from public.sync_holds where id = ${hold.id}`) as Array<{
      drive_file_id: string;
    }>;
    expect(svc?.drive_file_id).toBe(show.driveFileId);

    // (b) the SAME row read via the authenticated (ADMIN_CLAIMS) path is denied. sync_holds has DML+
    // SELECT REVOKEd from `authenticated` (Phase 1) AND RLS enabled with no select policy, so an authed
    // SELECT surfaces a permission error — the helper genuinely cannot use the authenticated client.
    await expect(
      asAdminTx((tx) =>
        tx.unsafe(`select drive_file_id from public.sync_holds where id = $1::uuid`, [hold.id]),
      ),
    ).rejects.toThrow(/permission denied|sync_holds/i);
  });
});
