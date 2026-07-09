import { describe, expect, test } from "vitest";
import { buildMonitorDigestModel, MONITOR_FIRST_RUN_LOOKBACK_MS } from "@/lib/notify/monitorDigest";

// Recording sql: captures the bind params of each query so we can prove windowStart.
function recordingSql(rowsByCall: unknown[][] = []) {
  const calls: { params: unknown[] }[] = [];
  let i = 0;
  const fn = (async (_strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ params });
    return rowsByCall[i++] ?? [];
  }) as never;
  return { fn, calls };
}

function watermark(value: Date | null) {
  return async () => ({ kind: "value" as const, watermark: value });
}

describe("buildMonitorDigestModel — window (spec §4.3)", () => {
  const now = new Date("2026-07-08T12:00:00Z");

  test("NULL watermark → windowStart bound as now - 24h in the first query", async () => {
    const { fn, calls } = recordingSql();
    await buildMonitorDigestModel(now, { sql: fn, getWatermark: watermark(null) });
    const expected = new Date(now.getTime() - MONITOR_FIRST_RUN_LOOKBACK_MS).toISOString();
    expect(calls[0]!.params).toContain(expected);
    expect(MONITOR_FIRST_RUN_LOOKBACK_MS).toBe(24 * 60 * 60 * 1000);
  });

  test("non-NULL watermark → windowStart bound as the watermark", async () => {
    const wmDate = new Date("2026-07-08T06:00:00Z");
    const { fn, calls } = recordingSql();
    await buildMonitorDigestModel(now, { sql: fn, getWatermark: watermark(wmDate) });
    expect(calls[0]!.params).toContain(wmDate.toISOString());
  });

  test("watermark read infra_error → infra_error, no query issued", async () => {
    const { fn, calls } = recordingSql();
    const r = await buildMonitorDigestModel(now, {
      sql: fn,
      getWatermark: async () => ({ kind: "infra_error" as const }),
    });
    expect(r).toEqual({ kind: "infra_error" });
    expect(calls).toHaveLength(0);
  });
});
