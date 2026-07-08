import { describe, expect, test } from "vitest";
import {
  getMonitorDigestWatermark,
  writeMonitorDigestWatermark,
} from "@/lib/notify/monitorWatermark";

// Invariant 9 behavioral coverage for the supabase-client watermark boundary
// (flow 6.2 §4.2, §13.8). Registration in _metaInfraContract is static; this
// proves the fault → typed infra_error mapping.
function clientReturningError() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }),
      }),
      update: () => ({
        eq: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }),
      }),
    }),
  } as never;
}
function clientThrowing() {
  return {
    from: () => {
      throw new Error("thrown");
    },
  } as never;
}

describe("monitorWatermark infra contract (invariant 9)", () => {
  test("read: returned error → infra_error", async () => {
    expect(await getMonitorDigestWatermark(clientReturningError())).toEqual({ kind: "infra_error" });
  });
  test("read: thrown → infra_error", async () => {
    expect(await getMonitorDigestWatermark(clientThrowing())).toEqual({ kind: "infra_error" });
  });
  test("read: value maps to Date", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { last_monitor_digest_sent_at: "2026-07-08T00:00:00Z" },
              error: null,
            }),
          }),
        }),
      }),
    } as never;
    expect(await getMonitorDigestWatermark(client)).toEqual({
      kind: "value",
      watermark: new Date("2026-07-08T00:00:00Z"),
    });
  });
  test("read: null column → value null", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { last_monitor_digest_sent_at: null }, error: null }),
          }),
        }),
      }),
    } as never;
    expect(await getMonitorDigestWatermark(client)).toEqual({ kind: "value", watermark: null });
  });
  test("write: empty update data → infra_error", async () => {
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }),
    } as never;
    expect(await writeMonitorDigestWatermark(new Date(), client)).toEqual({ kind: "infra_error" });
  });
  test("write: success", async () => {
    const client = {
      from: () => ({
        update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: "default" }], error: null }) }) }),
      }),
    } as never;
    expect(await writeMonitorDigestWatermark(new Date(), client)).toEqual({ kind: "ok" });
  });
  test("write: returned error → infra_error", async () => {
    expect(await writeMonitorDigestWatermark(new Date(), clientReturningError())).toEqual({
      kind: "infra_error",
    });
  });
});
