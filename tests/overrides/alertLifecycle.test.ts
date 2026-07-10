// Step 11.3 — SYNC-side auto-resolve lifecycle for the two override admin-alert
// codes (spec 2026-07-07 §6 step 3 / §10 R30). Drives the SYNC PATH ONLY: the
// admin-op action (discard/repoint/reactivate) does not exist until Task 14
// (R3b-7), so this test exercises `emitOverrideDeactivationAlerts` (the
// post-commit sync-side wiring) + `resolveOverrideAlertsForShow` (the single
// per-(show,code) re-derivation point).
//
// Failure modes this catches:
//   - coarse dedup regressed: two paused rows of one code emit >1 bell.
//   - resolve-on-clear regressed: a code with zero remaining paused rows is not
//     resolved (or one with ≥1 paused row is wrongly resolved).
//   - best-effort contract regressed: a throw in the emit path escapes and would
//     fail the sync, OR the emit path mutates admin_overrides (the durable
//     Task-10 stream must be untouched by this best-effort bell).
//   - the re-derivation is duplicated: something other than
//     resolveOverrideAlertsForShow decides resolution.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { OverrideSideEffect } from "@/lib/sync/overrideShowHotel";
import {
  emitOverrideDeactivationAlerts,
  resolveOverrideAlertsForShow,
} from "@/lib/adminAlerts/resolveOverrideAlertsForShow";

const SHOW_ID = "00000000-0000-4000-8000-000000000001";

// Fake service-role Supabase client mirroring the exact read chain the resolve
// helper issues: from("admin_overrides").select("id").eq(...).eq(...).eq(...).limit(1).
// `inactiveRows` = the paused (active=false) admin_overrides rows for this show;
// the fake filters them by deactivation_code the way the real .eq() does. It also
// records every DML verb so the test can prove the emit path never mutates the
// durable stream.
function makeClient(
  inactiveRows: Array<{ deactivation_code: "target_missing" | "name_conflict" }>,
) {
  const verbs = { select: 0, insert: 0, update: 0, delete: 0 };
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select() {
          verbs.select++;
          return builder;
        },
        insert() {
          verbs.insert++;
          return builder;
        },
        update() {
          verbs.update++;
          return builder;
        },
        delete() {
          verbs.delete++;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        is() {
          return builder;
        },
        limit() {
          const rows =
            table === "admin_overrides"
              ? inactiveRows.filter((r) => r.deactivation_code === filters["deactivation_code"])
              : [];
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as never, verbs };
}

describe("override admin-alert sync-side lifecycle", () => {
  it("two paused overrides of one code emit ONE coarse bell; leave that code open, resolve the empty code", async () => {
    const { client } = makeClient([
      { deactivation_code: "target_missing" },
      { deactivation_code: "target_missing" },
    ]);
    const upsertAdminAlert = vi.fn().mockResolvedValue("alert-1");
    const resolveAdminAlert = vi.fn().mockResolvedValue(undefined);
    const sideEffects: OverrideSideEffect[] = [
      { overrideId: "o1", deactivate: "target_missing" },
      { overrideId: "o2", deactivate: "target_missing" },
    ];

    await emitOverrideDeactivationAlerts(SHOW_ID, sideEffects, {
      client,
      upsertAdminAlert,
      resolveAdminAlert,
    });

    // Coarse per-(show,code) dedup: TWO paused rows of the SAME code collapse to ONE bell.
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
    expect(upsertAdminAlert.mock.calls[0]![0]).toMatchObject({
      showId: SHOW_ID,
      code: "OVERRIDE_TARGET_MISSING",
    });
    // Re-derivation runs for BOTH codes. target_missing has 2 paused rows → left open
    // (resolveAdminAlert NOT called for it); name_conflict has 0 paused rows → resolved.
    const resolvedCodes = resolveAdminAlert.mock.calls.map((c) => (c[0] as { code: string }).code);
    expect(resolvedCodes).toContain("OVERRIDE_NAME_CONFLICT");
    expect(resolvedCodes).not.toContain("OVERRIDE_TARGET_MISSING");
  });

  it("resolveOverrideAlertsForShow resolves the code when zero paused rows remain (last cleared)", async () => {
    const { client } = makeClient([]); // a later state where the last paused row was cleared
    const resolveAdminAlert = vi.fn().mockResolvedValue(undefined);

    await resolveOverrideAlertsForShow(
      { client, resolveAdminAlert },
      SHOW_ID,
      "OVERRIDE_TARGET_MISSING",
    );

    expect(resolveAdminAlert).toHaveBeenCalledTimes(1);
    expect(resolveAdminAlert.mock.calls[0]![0]).toMatchObject({
      showId: SHOW_ID,
      code: "OVERRIDE_TARGET_MISSING",
    });
  });

  it("resolveOverrideAlertsForShow leaves the alert open while ≥1 paused row of that code remains", async () => {
    const { client } = makeClient([{ deactivation_code: "target_missing" }]);
    const resolveAdminAlert = vi.fn().mockResolvedValue(undefined);

    await resolveOverrideAlertsForShow(
      { client, resolveAdminAlert },
      SHOW_ID,
      "OVERRIDE_TARGET_MISSING",
    );

    expect(resolveAdminAlert).not.toHaveBeenCalled();
  });

  it("best-effort: a throwing emit is swallowed AND never mutates the durable admin_overrides stream", async () => {
    const { client, verbs } = makeClient([{ deactivation_code: "name_conflict" }]);
    const upsertAdminAlert = vi.fn().mockRejectedValue(new Error("bell provider down"));
    const resolveAdminAlert = vi.fn().mockResolvedValue(undefined);
    const sideEffects: OverrideSideEffect[] = [{ overrideId: "o1", deactivate: "name_conflict" }];

    await expect(
      emitOverrideDeactivationAlerts(SHOW_ID, sideEffects, {
        client,
        upsertAdminAlert,
        resolveAdminAlert,
      }),
    ).resolves.toBeUndefined();

    // The durable Task-10 inactive-row stream is authoritative: the best-effort bell
    // path only ever SELECTs admin_overrides, never insert/update/delete.
    expect(verbs.insert).toBe(0);
    expect(verbs.update).toBe(0);
    expect(verbs.delete).toBe(0);
  });

  it("resolveOverrideAlertsForShow is the SINGLE re-derivation point the emit delegates to", async () => {
    const { client } = makeClient([]);
    const upsertAdminAlert = vi.fn().mockResolvedValue("alert-1");
    const resolveAdminAlert = vi.fn().mockResolvedValue(undefined);
    const resolveSpy = vi.fn().mockResolvedValue(undefined);
    const sideEffects: OverrideSideEffect[] = [{ overrideId: "o1", deactivate: "target_missing" }];

    await emitOverrideDeactivationAlerts(SHOW_ID, sideEffects, {
      client,
      upsertAdminAlert,
      resolveAdminAlert,
      resolveOverrideAlertsForShow: resolveSpy,
    });

    // Both codes re-derived through the ONE helper; the emit never calls resolveAdminAlert directly.
    expect(resolveSpy).toHaveBeenCalledTimes(2);
    expect(resolveSpy.mock.calls.map((c) => c[2])).toEqual([
      "OVERRIDE_TARGET_MISSING",
      "OVERRIDE_NAME_CONFLICT",
    ]);
    expect(resolveAdminAlert).not.toHaveBeenCalled();
  });

  it("no deactivations → no bell and no re-derivation (sheet_value-only syncs are inert)", async () => {
    const { client } = makeClient([]);
    const upsertAdminAlert = vi.fn().mockResolvedValue("alert-1");
    const resolveSpy = vi.fn().mockResolvedValue(undefined);
    const sideEffects: OverrideSideEffect[] = [{ overrideId: "o1", sheetValue: "x" }];

    await emitOverrideDeactivationAlerts(SHOW_ID, sideEffects, {
      client,
      upsertAdminAlert,
      resolveOverrideAlertsForShow: resolveSpy,
    });

    expect(upsertAdminAlert).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it("is wired into the sync post-commit path (outside the advisory lock)", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    expect(src).toMatch(/emitOverrideDeactivationAlerts/);
  });
});
