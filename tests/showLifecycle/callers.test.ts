import { describe, it, expect, vi } from "vitest";
import { archiveShow } from "@/lib/showLifecycle/archiveShow";
import { publishShow } from "@/lib/showLifecycle/publishShow";
import { unarchiveShow } from "@/lib/showLifecycle/unarchiveShow";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LifecycleResult, LifecycleRpc } from "@/lib/showLifecycle/_shared";

// R-impl-1 CRITICAL regression: the default RPC binding MUST be the session-bound server client (the
// authenticated admin's JWT), NOT service_role — the lifecycle RPCs are granted only to `authenticated`
// and gate on is_admin(), so a service-role caller fails every action. These spies prove the binding.
const { sessionRpc, serviceRoleClient } = vi.hoisted(() => ({
  sessionRpc: vi.fn(async () => ({ data: null, error: null })),
  serviceRoleClient: vi.fn(() => {
    throw new Error("service_role client must NOT back the lifecycle RPC callers");
  }),
}));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  createSupabaseServerClient: vi.fn(async () => ({ rpc: sessionRpc })),
  createSupabaseServiceRoleClient: serviceRoleClient,
}));

describe("lifecycle callers — default RPC binding (R-impl-1)", () => {
  it("archiveShow with NO injected rpc calls the SESSION client, never service_role", async () => {
    sessionRpc.mockClear();
    serviceRoleClient.mockClear();
    const res = await archiveShow("show-1"); // no deps → exercises defaultRpc (the production path)
    expect(sessionRpc).toHaveBeenCalledWith("archive_show", { p_show_id: "show-1" });
    expect(serviceRoleClient).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it("publishShow with NO injected rpc also routes through the session client", async () => {
    sessionRpc.mockClear();
    serviceRoleClient.mockClear();
    await publishShow("show-1");
    expect(sessionRpc).toHaveBeenCalledWith("publish_show", { p_show_id: "show-1" });
    expect(serviceRoleClient).not.toHaveBeenCalled();
  });
});

describe("lifecycle callers", () => {
  it("archiveShow returns {ok:true} on RPC success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const res = await archiveShow("show-1", { rpc });
    expect(rpc).toHaveBeenCalledWith("archive_show", { p_show_id: "show-1" });
    expect(res).toEqual({ ok: true });
  });

  it("archiveShow maps FINALIZE_OWNED_SHOW errcode to a typed refusal", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "FINALIZE_OWNED_SHOW" } });
    expect(await archiveShow("show-1", { rpc })).toEqual({
      ok: false,
      code: "FINALIZE_OWNED_SHOW",
    });
  });

  it("archiveShow surfaces an unmapped RETURNED error as infra_error (not silent)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } });
    expect(await archiveShow("show-1", { rpc })).toEqual({ ok: false, code: "infra_error" });
  });

  it("publishShow maps PUBLISH_BLOCKED_PENDING_REVIEW to a typed refusal", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "PUBLISH_BLOCKED_PENDING_REVIEW" } });
    expect(await publishShow("show-1", { rpc })).toEqual({
      ok: false,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    });
  });

  it("unarchiveShow runs the catch-up sync AFTER a REAL transition (RPC returns true)", async () => {
    const order: string[] = [];
    // R8: unarchive_show returns TRUE when it performed the archived->held transition.
    const rpc = vi.fn().mockImplementation(async () => {
      order.push("rpc");
      return { data: true, error: null };
    });
    const catchUp = vi.fn().mockImplementation(async () => {
      order.push("sync");
      return { outcome: "applied" };
    });
    const res = await unarchiveShow("show-1", "drive-1", { rpc, runManualSyncForShow: catchUp });
    expect(order).toEqual(["rpc", "sync"]);
    // Real signature is runManualSyncForShow(driveFileId, mode="manual", deps?) — positional mode string
    // (lib/sync/runManualSyncForShow.ts:217-220), NOT an options object.
    expect(catchUp).toHaveBeenCalledWith("drive-1", "manual");
    expect(res).toEqual({ ok: true });
  });

  it("R8: a stale/double Unarchive (RPC no-op → returns false) does NOT run the mutating catch-up sync", async () => {
    // unarchive_show returns FALSE when the show was already non-archived under the lock. The caller must
    // NOT run runManualSyncForShow (which clears live deferrals) against a show it did not transition.
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const catchUp = vi.fn();
    const res = await unarchiveShow("show-1", "drive-1", { rpc, runManualSyncForShow: catchUp });
    expect(catchUp).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true }); // the RPC succeeded (idempotent no-op), so the action still reports ok
  });

  it("unarchiveShow does NOT run the catch-up when the RPC fails, and surfaces the typed result", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "ADMIN_LINK_SHOW_NOT_FOUND" } });
    const catchUp = vi.fn();
    expect(
      await unarchiveShow("show-1", "drive-1", { rpc, runManualSyncForShow: catchUp }),
    ).toEqual({ ok: false, code: "ADMIN_LINK_SHOW_NOT_FOUND" });
    expect(catchUp).not.toHaveBeenCalled();
  });
});

describe("lifecycle callers — THROWN Supabase faults map to infra_error (R7, invariant 9)", () => {
  // R7: mapRpcResult only handled the returned {error}; a thrown construction/network/.rpc()-chain fault
  // rejected the server action outright, bypassing the infra_error retry copy the lifecycle buttons render.
  // The callLifecycleRpc chokepoint now catches thrown faults. (The "unmapped error" test above only
  // exercises a RETURNED error — this block exercises actual throws, which the prior tests did not.)
  const throwingCallers: Array<[string, (rpc: LifecycleRpc) => Promise<LifecycleResult>]> = [
    ["archiveShow", (rpc) => archiveShow("show-1", { rpc })],
    ["publishShow", (rpc) => publishShow("show-1", { rpc })],
    ["unarchiveShow", (rpc) => unarchiveShow("show-1", "drive-1", { rpc })],
  ];
  it.each(throwingCallers)(
    "%s: an rpc that THROWS resolves to { ok:false, code:'infra_error' } (no unhandled rejection)",
    async (_name, call) => {
      const rpc: LifecycleRpc = vi.fn(async () => {
        throw new Error("network reset mid-rpc");
      });
      await expect(call(rpc)).resolves.toEqual({ ok: false, code: "infra_error" });
    },
  );

  it("default path: a thrown createSupabaseServerClient construction fault → infra_error (not a rejection)", async () => {
    vi.mocked(createSupabaseServerClient).mockRejectedValueOnce(
      new Error("client construction fault"),
    );
    await expect(archiveShow("show-1")).resolves.toEqual({ ok: false, code: "infra_error" });
  });

  it("unarchiveShow: a thrown rpc skips the catch-up sync entirely", async () => {
    const rpc: LifecycleRpc = vi.fn(async () => {
      throw new Error("network reset mid-rpc");
    });
    const catchUp = vi.fn();
    await expect(
      unarchiveShow("show-1", "drive-1", { rpc, runManualSyncForShow: catchUp }),
    ).resolves.toEqual({ ok: false, code: "infra_error" });
    expect(catchUp).not.toHaveBeenCalled();
  });
});
