import { describe, expect, test } from "vitest";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";

// Flow 6.2 §13.8 — the postgres.js sql fault → typed infra_error mapping (behavioral,
// beyond the static _metaInfraContract registration), plus the all-empty → empty return.
describe("buildMonitorDigestModel — infra + empty", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  const wm = async () => ({ kind: "value" as const, watermark: new Date("2026-07-08T00:00:00Z") });

  test("a throwing sql query → infra_error", async () => {
    const sql = (async () => {
      throw new Error("db down");
    }) as never;
    expect(await buildMonitorDigestModel(now, { sql, getWatermark: wm })).toEqual({
      kind: "infra_error",
    });
  });

  test("all three signals empty → empty", async () => {
    const sql = (async () => []) as never;
    expect(await buildMonitorDigestModel(now, { sql, getWatermark: wm })).toEqual({ kind: "empty" });
  });
});
