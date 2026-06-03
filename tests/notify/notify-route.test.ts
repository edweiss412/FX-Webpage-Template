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
});
