import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET } from "@/app/api/cron/notify/route";
import { runDigestNotify, runRealtimeNotify } from "@/lib/notify/runNotify";

vi.mock("@/lib/notify/runNotify", () => ({
  runRealtimeNotify: vi.fn(),
  runDigestNotify: vi.fn(),
}));

const runRealtimeNotifyMock = vi.mocked(runRealtimeNotify);
const runDigestNotifyMock = vi.mocked(runDigestNotify);

function request(job?: string, authorization = "Bearer test-cron-secret"): NextRequest {
  const url = new URL("https://crew.fxav.test/api/cron/notify");
  if (job) url.searchParams.set("job", job);
  return new NextRequest(url, {
    headers: authorization ? { authorization } : {},
  });
}

describe("notify cron route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    runRealtimeNotifyMock.mockReset();
    runDigestNotifyMock.mockReset();
  });

  test("rejects missing cron authorization before running work", async () => {
    const response = await GET(request("realtime", ""));

    expect(response.status).toBe(401);
    expect(runRealtimeNotifyMock).not.toHaveBeenCalled();
    expect(runDigestNotifyMock).not.toHaveBeenCalled();
  });

  test("runs realtime notify for the realtime job", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [],
      delivery: { kind: "ok" as const, sent: 1 },
    };
    runRealtimeNotifyMock.mockResolvedValue(result);

    const response = await GET(request("realtime"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(runRealtimeNotifyMock).toHaveBeenCalledOnce();
    expect(runDigestNotifyMock).not.toHaveBeenCalled();
  });

  test("runs digest notify for the digest job", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [],
      delivery: { kind: "skipped" as const, reason: "outside_digest_window" },
    };
    runDigestNotifyMock.mockResolvedValue(result);

    const response = await GET(request("digest"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(runDigestNotifyMock).toHaveBeenCalledOnce();
    expect(runRealtimeNotifyMock).not.toHaveBeenCalled();
  });

  test.each([undefined, "weekly"])("rejects unknown job %s without running work", async (job) => {
    const response = await GET(request(job));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "unknown job" });
    expect(runRealtimeNotifyMock).not.toHaveBeenCalled();
    expect(runDigestNotifyMock).not.toHaveBeenCalled();
  });

  test("returns 500 (with the recorded result body) when delivery is an infra_error", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [],
      delivery: { kind: "infra_error" as const, source: "activeRecipients" },
    };
    runRealtimeNotifyMock.mockResolvedValue(result);

    const response = await GET(request("realtime"));

    expect(response.status).toBe(500);
    // The body still carries the recorded outcomes (recorded-not-swallowed).
    expect(await response.json()).toEqual(result);
  });

  test("returns 500 when a maintenance step reports infra_error even if delivery is ok", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [{ step: "stall" as const, result: { kind: "infra_error" as const } }],
      delivery: { kind: "ok" as const, sent: 0 },
    };
    runDigestNotifyMock.mockResolvedValue(result);

    const response = await GET(request("digest"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(result);
  });

  test("a deliberate skip (e.g. config invalid / outside window) stays 200, not a fault", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [{ step: "stall" as const, result: { kind: "ok" as const } }],
      delivery: { kind: "skipped" as const, reason: "config_invalid" },
    };
    runRealtimeNotifyMock.mockResolvedValue(result);

    const response = await GET(request("realtime"));

    expect(response.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // M12.13 §4.2 R27/R28 — statusFor matrix for recorded toggle faults. ANY
  // recorded toggle infra source (delivery-side partial per-kind fault OR a
  // maintenance-side reconciliation fault) must surface 5xx so pg_cron sees
  // the degradation; deliberate toggle-OFF skips remain 200.
  // -------------------------------------------------------------------------

  test("returns 500 when an otherwise-ok delivery RECORDED a per-kind toggle fault (R27)", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [{ step: "stall" as const, result: { kind: "ok" as const } }],
      delivery: { kind: "ok" as const, sent: 2, toggleFaults: ["getAlertOnAutoPublish"] },
    };
    runRealtimeNotifyMock.mockResolvedValue(result);

    const response = await GET(request("realtime"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(result);
  });

  test("returns 500 when a skipped delivery carries a recorded toggle fault (off + fault mix)", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [{ step: "stall" as const, result: { kind: "ok" as const } }],
      delivery: {
        kind: "skipped" as const,
        reason: "alert_on_sync_problems_off",
        toggleFaults: ["getAlertOnAutoPublish"],
      },
    };
    runRealtimeNotifyMock.mockResolvedValue(result);

    const response = await GET(request("realtime"));

    expect(response.status).toBe(500);
  });

  test("deliberate toggle-OFF skips (single and combined reasons) stay 200 — OFF is not a fault", async () => {
    for (const reason of [
      "alert_on_sync_problems_off",
      "alert_on_auto_publish_off",
      "alert_on_sync_problems_off+alert_on_auto_publish_off",
    ]) {
      runRealtimeNotifyMock.mockResolvedValue({
        kind: "ok" as const,
        maintenance: [{ step: "stall" as const, result: { kind: "ok" as const } }],
        delivery: { kind: "skipped" as const, reason },
      });

      const response = await GET(request("realtime"));

      expect(response.status).toBe(200);
    }
  });

  test("returns 500 when the MAINTENANCE emailDelivery step records toggle faults as infra_error detail (R28)", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [
        { step: "stall" as const, result: { kind: "ok" as const } },
        {
          step: "emailDelivery" as const,
          result: {
            kind: "infra_error" as const,
            toggleFaults: ["getAlertOnSyncProblems"],
            detail: { opened: 0, resolved: 1 },
          },
        },
      ],
      delivery: { kind: "ok" as const, sent: 0 },
    };
    runRealtimeNotifyMock.mockResolvedValue(result);

    const response = await GET(request("realtime"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(result);
  });

  test("returns 500 for a maintenance step carrying recorded toggleFaults even with a non-fault kind (mechanism pin)", async () => {
    const result = {
      kind: "ok" as const,
      maintenance: [
        {
          step: "emailDelivery" as const,
          result: {
            kind: "ok" as const,
            opened: 0,
            resolved: 0,
            toggleFaults: ["getAlertOnAutoPublish"],
          },
        },
      ],
      delivery: { kind: "ok" as const, sent: 0 },
    };
    runRealtimeNotifyMock.mockResolvedValue(result);

    const response = await GET(request("realtime"));

    expect(response.status).toBe(500);
  });
});
