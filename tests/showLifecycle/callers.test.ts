import { describe, it, expect, vi } from "vitest";
import { archiveShow } from "@/lib/showLifecycle/archiveShow";
import { publishShow } from "@/lib/showLifecycle/publishShow";
import { unarchiveShow } from "@/lib/showLifecycle/unarchiveShow";

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
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "FINALIZE_OWNED_SHOW" } });
    expect(await archiveShow("show-1", { rpc })).toEqual({ ok: false, code: "FINALIZE_OWNED_SHOW" });
  });

  it("archiveShow surfaces an unmapped/thrown error as infra_error (not silent)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "connection reset" } });
    expect(await archiveShow("show-1", { rpc })).toEqual({ ok: false, code: "infra_error" });
  });

  it("publishShow maps PUBLISH_BLOCKED_PENDING_REVIEW to a typed refusal", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "PUBLISH_BLOCKED_PENDING_REVIEW" } });
    expect(await publishShow("show-1", { rpc })).toEqual({ ok: false, code: "PUBLISH_BLOCKED_PENDING_REVIEW" });
  });

  it("unarchiveShow runs the catch-up sync AFTER the RPC (separate call, not nested in a lock)", async () => {
    const order: string[] = [];
    const rpc = vi.fn().mockImplementation(async () => { order.push("rpc"); return { data: null, error: null }; });
    const catchUp = vi.fn().mockImplementation(async () => { order.push("sync"); return { outcome: "applied" }; });
    const res = await unarchiveShow("show-1", "drive-1", { rpc, runManualSyncForShow: catchUp });
    expect(order).toEqual(["rpc", "sync"]);
    // Real signature is runManualSyncForShow(driveFileId, mode="manual", deps?) — positional mode string
    // (lib/sync/runManualSyncForShow.ts:217-220), NOT an options object.
    expect(catchUp).toHaveBeenCalledWith("drive-1", "manual");
    expect(res).toEqual({ ok: true });
  });

  it("unarchiveShow does NOT run the catch-up when the RPC fails, and surfaces the typed result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "ADMIN_LINK_SHOW_NOT_FOUND" } });
    const catchUp = vi.fn();
    expect(await unarchiveShow("show-1", "drive-1", { rpc, runManualSyncForShow: catchUp })).toEqual({ ok: false, code: "ADMIN_LINK_SHOW_NOT_FOUND" });
    expect(catchUp).not.toHaveBeenCalled();
  });
});
