// tests/cron/summarizeNotify.test.ts
import { describe, expect, test } from "vitest";
import { summarizeNotify } from "@/app/api/cron/notify/route";
describe("summarizeNotify", () => {
  test("skipped delivery → detail.deliverySkipReason", () => {
    const s = summarizeNotify({
      delivery: { kind: "skipped", reason: "config_invalid" },
      maintenance: [],
    } as never);
    expect(s.outcome).toBe("ok");
    expect(s.detail).toMatchObject({
      deliveryKind: "skipped",
      deliverySkipReason: "config_invalid",
    });
  });
  test("ok delivery → deliveryKind ok, no skip reason", () => {
    const s = summarizeNotify({ delivery: { kind: "ok", sent: 2 }, maintenance: [] } as never);
    expect(s.detail).toMatchObject({ deliveryKind: "ok" });
    expect((s.detail as Record<string, unknown>).deliverySkipReason).toBeUndefined();
  });
});
