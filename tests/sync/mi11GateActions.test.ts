/**
 * Tasks 3.6 / 3.7 / 3.8 — mi11 approve/reject server actions (two-stage Drive orchestration).
 *
 * approveMi11Hold(holdId, expectedBaseModifiedTime):
 *   (0) requireAdmin; (1) NON-locking SERVICE-ROLE read of sync_holds by id → authoritative
 *   drive_file_id (NEVER client-supplied; PF23); early MI11_HOLD_ALREADY_RESOLVED if gone;
 *   (2) fetchDriveFileMetadata(driveFileId) BEFORE the RPC (F13); typed failure → MI11_DRIVE_RECHECK_FAILED
 *   without calling the RPC (F15 / invariant 9); (3) mi11_approve_hold via the AUTHENTICATED client,
 *   forwarding the CALLER-supplied expected token UNCHANGED (PF40 — never re-read server-side).
 * rejectMi11Hold(holdId, expectedBaseModifiedTime): requireAdmin + mi11_reject_hold (no Drive read).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks ---
const requireAdmin = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: () => requireAdmin() }));

const fetchDriveFileMetadata = vi.fn();
vi.mock("@/lib/drive/fetch", () => {
  class DriveFetchError extends Error {}
  return {
    fetchDriveFileMetadata: (...a: unknown[]) => fetchDriveFileMetadata(...a),
    DriveFetchError,
  };
});
class DriveFetchError extends Error {}

// service-role client: from("sync_holds").select(...).eq("id", holdId).maybeSingle()
const lookupResult = { value: { data: null as unknown, error: null as unknown } };
const maybeSingle = vi.fn(async () => lookupResult.value);
const lookupEq = vi.fn(() => ({ maybeSingle }));
const lookupSelect = vi.fn(() => ({ eq: lookupEq }));
const serviceFrom = vi.fn(() => ({ select: lookupSelect }));

// authenticated client: rpc(name, args)
type RpcReturn = {
  data: { ok: boolean; code?: string } | null;
  error: { message?: string } | null;
};
const rpc = vi.fn<(...a: unknown[]) => Promise<RpcReturn>>(async () => ({
  data: { ok: true },
  error: null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ from: serviceFrom }),
  createSupabaseServerClient: async () => ({ rpc }),
}));

import { approveMi11Hold, rejectMi11Hold } from "@/lib/sync/holds/mi11GateActions";

const HOLD_ID = "11111111-1111-1111-1111-111111111111";
const D1 = "drive-file-1";
const T1 = "2026-06-02T00:00:00.000Z";
const EXPECTED_T0 = "2026-06-01T00:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockImplementation(async () => undefined);
  lookupResult.value = { data: { drive_file_id: D1, show_id: "show-1" }, error: null };
  fetchDriveFileMetadata.mockResolvedValue({ modifiedTime: T1 });
  rpc.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(() => vi.clearAllMocks());

describe("approveMi11Hold — two-stage Drive orchestration (Task 3.6)", () => {
  it("reads the hold's authoritative driveFileId, Drive BEFORE the RPC, forwards the CALLER token unchanged", async () => {
    const order: string[] = [];
    fetchDriveFileMetadata.mockImplementation(async (id: string) => {
      order.push(`drive:${id}`);
      return { modifiedTime: T1 };
    });
    rpc.mockImplementation(async (...a: unknown[]) => {
      order.push("rpc");
      void a;
      return { data: { ok: true }, error: null };
    });

    const res = await approveMi11Hold(HOLD_ID, EXPECTED_T0);

    // (a) service-role lookup by id; driveFileId NOT client-supplied.
    expect(serviceFrom).toHaveBeenCalledWith("sync_holds");
    expect(lookupEq).toHaveBeenCalledWith("id", HOLD_ID);
    // (b) Drive read with THAT hold's D1, BEFORE the rpc.
    expect(order).toEqual([`drive:${D1}`, "rpc"]);
    // (c) rpc receives p_hold_id, the freshly-observed Drive modtime, AND the caller token UNCHANGED.
    expect(rpc).toHaveBeenCalledWith("mi11_approve_hold", {
      p_hold_id: HOLD_ID,
      p_observed_modified_time: T1,
      p_expected_base_modified_time: EXPECTED_T0, // NOT re-read from the lookup (anti-vacuous, PF40)
    });
    expect(res).toEqual({ ok: true });
  });

  it("hold already gone → MI11_HOLD_ALREADY_RESOLVED, NO Drive call, NO rpc call", async () => {
    lookupResult.value = { data: null, error: null };
    const res = await approveMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(res).toEqual({ ok: false, code: "MI11_HOLD_ALREADY_RESOLVED" });
    expect(fetchDriveFileMetadata).toHaveBeenCalledTimes(0);
    expect(rpc).toHaveBeenCalledTimes(0);
  });

  it("requireAdmin runs before any lookup", async () => {
    const order: string[] = [];
    requireAdmin.mockImplementation(async () => {
      order.push("admin");
    });
    maybeSingle.mockImplementation(async () => {
      order.push("lookup");
      return lookupResult.value;
    });
    await approveMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(order[0]).toBe("admin");
  });
});

describe("approveMi11Hold — stale-target guard surfacing (Task 3.7)", () => {
  it("RPC returns MI11_TARGET_MOVED → surfaced as a typed non-mutating result", async () => {
    fetchDriveFileMetadata.mockResolvedValue({ modifiedTime: T1 });
    rpc.mockResolvedValue({ data: { ok: false, code: "MI11_TARGET_MOVED" }, error: null });
    const res = await approveMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(res).toEqual({ ok: false, code: "MI11_TARGET_MOVED" });
    expect(rpc).toHaveBeenCalledWith(
      "mi11_approve_hold",
      expect.objectContaining({ p_observed_modified_time: T1, p_expected_base_modified_time: EXPECTED_T0 }),
    );
  });
});

describe("approveMi11Hold — Drive reverify failure (Task 3.8 / F15)", () => {
  it("(a) fetchDriveFileMetadata THROWS → MI11_DRIVE_RECHECK_FAILED, rpc never called", async () => {
    fetchDriveFileMetadata.mockRejectedValue(new DriveFetchError("boom"));
    const res = await approveMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(res).toEqual({ ok: false, code: "MI11_DRIVE_RECHECK_FAILED" });
    expect(rpc).toHaveBeenCalledTimes(0);
  });

  it("(b) fetchDriveFileMetadata returns a discriminable error result → MI11_DRIVE_RECHECK_FAILED, rpc never called", async () => {
    // a non-throwing 403/404/429-style returned-error shape.
    fetchDriveFileMetadata.mockResolvedValue({ ok: false, status: 429 });
    const res = await approveMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(res).toEqual({ ok: false, code: "MI11_DRIVE_RECHECK_FAILED" });
    expect(rpc).toHaveBeenCalledTimes(0);
  });

  it("a missing modifiedTime on the Drive result is treated as a recheck failure (no rpc)", async () => {
    fetchDriveFileMetadata.mockResolvedValue({ modifiedTime: null });
    const res = await approveMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(res).toEqual({ ok: false, code: "MI11_DRIVE_RECHECK_FAILED" });
    expect(rpc).toHaveBeenCalledTimes(0);
  });
});

describe("rejectMi11Hold — no Drive read, forwards caller token (Task 3.6/3.8)", () => {
  it("calls mi11_reject_hold with holdId + the caller token; NO Drive read, NO service-role pre-read", async () => {
    const res = await rejectMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(fetchDriveFileMetadata).toHaveBeenCalledTimes(0);
    expect(serviceFrom).toHaveBeenCalledTimes(0); // RPC resolves its own drive_file_id
    expect(rpc).toHaveBeenCalledWith("mi11_reject_hold", {
      p_hold_id: HOLD_ID,
      p_expected_base_modified_time: EXPECTED_T0,
    });
    expect(res).toEqual({ ok: true });
  });

  it("requireAdmin runs first", async () => {
    const order: string[] = [];
    requireAdmin.mockImplementation(async () => {
      order.push("admin");
    });
    rpc.mockImplementation(async () => {
      order.push("rpc");
      return { data: { ok: true }, error: null };
    });
    await rejectMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(order).toEqual(["admin", "rpc"]);
  });

  it("an RPC error surfaces as a typed infra-failure result (invariant 9)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await rejectMi11Hold(HOLD_ID, EXPECTED_T0);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(typeof res.code).toBe("string");
    }
  });
});
