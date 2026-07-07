import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ rpc }),
}));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { HEALTH_CODES, DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { loadAlertSummary } from "@/lib/admin/loadAlertSummary";

// Braced-void body: an arrow returning the mock fn is invoked by vitest as a
// teardown callback (calls rpc() under mockRejectedValue → stray rejection).
beforeEach(() => {
  rpc.mockReset();
});

describe("loadAlertSummary", () => {
  it("ok degraded>0 → kind degraded, notice = total - degraded", async () => {
    rpc.mockResolvedValue({ data: [{ total: "3", degraded: "1" }], error: null });
    const r = await loadAlertSummary();
    expect(r).toMatchObject({ kind: "degraded", total: 3, degraded: 1, notice: 2 });
    expect(rpc).toHaveBeenCalledWith("admin_alert_summary", {
      _health_codes: HEALTH_CODES,
      _degraded_codes: DEGRADED_HEALTH_CODES,
    });
  });

  it("total 0 → ok", async () => {
    rpc.mockResolvedValue({ data: [{ total: "0", degraded: "0" }], error: null });
    expect((await loadAlertSummary()).kind).toBe("ok");
  });

  it("degraded 0, total>0 → notice", async () => {
    rpc.mockResolvedValue({ data: [{ total: "2", degraded: "0" }], error: null });
    expect(await loadAlertSummary()).toMatchObject({ kind: "notice", notice: 2 });
  });

  it("rpc returned error → infra_error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await loadAlertSummary()).kind).toBe("infra_error");
  });

  it("rpc throws → infra_error", async () => {
    rpc.mockRejectedValue(new Error("network"));
    expect((await loadAlertSummary()).kind).toBe("infra_error");
  });

  // Strict validation (Codex plan-R2 F2), mirror loadTelemetryStats.
  it.each([
    ["missing degraded", { total: "3" }],
    ["non-numeric", { total: "x", degraded: "1" }],
    ["NaN/Infinity", { total: "Infinity", degraded: "1" }],
    ["negative", { total: "-1", degraded: "0" }],
    ["degraded > total", { total: "1", degraded: "3" }],
    // Codex whole-diff R1: NULL fields must FAIL (Number(null)===0 previously masked them as 0).
    ["null total", { total: null, degraded: "0" }],
    ["null degraded", { total: "3", degraded: null }],
    ["empty data", null],
  ])("malformed (%s) → infra_error", async (_l, row) => {
    rpc.mockResolvedValue({ data: row === null ? [] : [row], error: null });
    expect((await loadAlertSummary()).kind).toBe("infra_error");
  });
});
