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
});
