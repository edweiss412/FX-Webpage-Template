import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ rpc }),
}));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { loadTelemetryStats } from "@/lib/admin/loadTelemetryStats";

// Braced-void body: `() => rpc.mockReset()` returns the mock fn, which vitest
// invokes as a teardown callback → calls rpc() (rejected under mockRejectedValue)
// → stray unhandled rejection. Returning undefined avoids that.
beforeEach(() => {
  rpc.mockReset();
});
const NOW = new Date("2026-07-06T12:00:00Z");

describe("loadTelemetryStats", () => {
  it("ok: coerces bigint strings + returns stats", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          total: "4",
          error_count: "2",
          warn_count: "1",
          info_count: "1",
          buckets: Array(24)
            .fill(0)
            .map((_, i) => (i === 23 ? 3 : 0)),
        },
      ],
      error: null,
    });
    const r = await loadTelemetryStats(NOW);
    expect(r).toEqual({
      kind: "ok",
      stats: { total: 4, errorCount: 2, warnCount: 1, infoCount: 1, buckets: expect.any(Array) },
    });
    expect(rpc).toHaveBeenCalledWith("admin_event_stats_24h", { _now: NOW.toISOString() });
  });

  it("rpc returned error → infra_error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
  });

  it("rpc throws → infra_error", async () => {
    rpc.mockRejectedValue(new Error("network"));
    expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
  });

  it("malformed/empty data → infra_error", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
  });

  // Strict validation (Codex plan-R1 F1): drifted/partial shapes must degrade, not render NaN.
  it.each([
    [
      "missing field",
      {
        total: "4",
        error_count: "2",
        warn_count: "1",
        /* info_count missing */ buckets: Array(24).fill(0),
      },
    ],
    [
      "non-numeric",
      {
        total: "x",
        error_count: "2",
        warn_count: "1",
        info_count: "1",
        buckets: Array(24).fill(0),
      },
    ],
    [
      "non-array buckets",
      { total: "4", error_count: "2", warn_count: "1", info_count: "1", buckets: "nope" },
    ],
    [
      "wrong bucket length",
      {
        total: "4",
        error_count: "2",
        warn_count: "1",
        info_count: "1",
        buckets: Array(12).fill(0),
      },
    ],
    [
      "NaN/Infinity",
      {
        total: "4",
        error_count: "Infinity",
        warn_count: "1",
        info_count: "1",
        buckets: Array(24).fill(0),
      },
    ],
    [
      "negative",
      {
        total: "-1",
        error_count: "2",
        warn_count: "1",
        info_count: "1",
        buckets: Array(24).fill(0),
      },
    ],
  ])("malformed row (%s) → infra_error", async (_label, row) => {
    rpc.mockResolvedValue({ data: [row], error: null });
    expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
  });
});
