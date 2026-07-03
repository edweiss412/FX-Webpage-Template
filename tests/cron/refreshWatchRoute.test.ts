// tests/cron/refreshWatchRoute.test.ts
// Route HTTP contract for /api/cron/refresh-watch: refresh -> reconcile, then
// 500 iff (refresh.failures non-empty || reconcile.outcome === "infra_error").
// Handled degradations (still_orphaned / renewal_failing / vacuous) stay 200 —
// they must not page hourly. Failure modes under test: silent-200-on-infra-fault
// (spec R1-2), and 5xx-on-handled-degradation paging (spec R2-5).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const watchMock = vi.hoisted(() => ({
  refreshWatchSubscriptions: vi.fn(),
  reconcileWatchChannels: vi.fn(),
}));

vi.mock("@/lib/drive/watch", () => ({
  refreshWatchSubscriptions: watchMock.refreshWatchSubscriptions,
  reconcileWatchChannels: watchMock.reconcileWatchChannels,
}));

const CLEAN_REFRESH = { refreshed: ["folder-1"], orphaned: [], failures: [] };
const HEALTHY_RECONCILE = {
  outcome: "healthy" as const,
  sweptPending: 0,
  escalated: false,
  faults: [],
};

function authedRequest(): NextRequest {
  return new NextRequest("https://crew.fxav.test/api/cron/refresh-watch", {
    headers: { authorization: "Bearer cron-test-secret" },
  });
}

describe("/api/cron/refresh-watch — HTTP contract", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    watchMock.refreshWatchSubscriptions.mockReset();
    watchMock.reconcileWatchChannels.mockReset();
    process.env.CRON_SECRET = "cron-test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  test("401 without bearer", async () => {
    const { GET } = await import("@/app/api/cron/refresh-watch/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/refresh-watch"));

    expect(response.status).toBe(401);
    expect(watchMock.refreshWatchSubscriptions).not.toHaveBeenCalled();
    expect(watchMock.reconcileWatchChannels).not.toHaveBeenCalled();
  });

  test("200 ok — healthy reconcile; body carries refresh + reconcile counts", async () => {
    watchMock.refreshWatchSubscriptions.mockResolvedValue(CLEAN_REFRESH);
    watchMock.reconcileWatchChannels.mockResolvedValue(HEALTHY_RECONCILE);
    const { GET } = await import("@/app/api/cron/refresh-watch/route");

    const response = await GET(authedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      refreshed: ["folder-1"],
      refreshOrphaned: [],
      refreshFailures: 0,
      reconcile: { outcome: "healthy", sweptPending: 0, escalated: false },
    });
    expect(watchMock.reconcileWatchChannels).toHaveBeenCalledWith(CLEAN_REFRESH);
  });

  test.each(["still_orphaned", "renewal_failing", "vacuous"] as const)(
    "200 ok — reconcile outcome %s is NOT 5xx (handled degradation must not page hourly)",
    async (outcome) => {
      watchMock.refreshWatchSubscriptions.mockResolvedValue(CLEAN_REFRESH);
      watchMock.reconcileWatchChannels.mockResolvedValue({
        outcome,
        sweptPending: 0,
        escalated: false,
        faults: [],
      });
      const { GET } = await import("@/app/api/cron/refresh-watch/route");

      const response = await GET(authedRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.reconcile.outcome).toBe(outcome);
    },
  );

  const FAULT_NAMES = [
    "pending_sweep",
    "folder_read",
    "channel_read",
    "subscribe_infra",
    "activate_write",
    "alert_resolve_write",
    "alert_row_read",
    "guard_read",
    "guard_write",
    "pref_read",
    "recipients_read",
    "email_send",
    "escalation_helper",
  ] as const;

  test.each(FAULT_NAMES)(
    "500 infra — reconcile outcome infra_error (fault: %s) -> 500, body.ok false, faults present",
    async (faultName) => {
      watchMock.refreshWatchSubscriptions.mockResolvedValue(CLEAN_REFRESH);
      watchMock.reconcileWatchChannels.mockResolvedValue({
        outcome: "infra_error",
        sweptPending: 0,
        escalated: false,
        faults: [faultName],
      });
      const { GET } = await import("@/app/api/cron/refresh-watch/route");

      const response = await GET(authedRequest());

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.reconcile.outcome).toBe("infra_error");
      expect(body.reconcile.faults).toEqual([faultName]);
    },
  );

  test.each([
    { folderId: "*", operation: "list_expiring" },
    { folderId: "folder-1", operation: "activate_pending" },
  ])(
    "500 infra — refresh.failures non-empty ($operation) even when reconcile is clean",
    async (failure) => {
      watchMock.refreshWatchSubscriptions.mockResolvedValue({
        refreshed: [],
        orphaned: [],
        failures: [failure],
      });
      watchMock.reconcileWatchChannels.mockResolvedValue(HEALTHY_RECONCILE);
      const { GET } = await import("@/app/api/cron/refresh-watch/route");

      const response = await GET(authedRequest());

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.refreshFailures).toBe(1);
      expect(body.reconcile.outcome).toBe("healthy");
    },
  );

  test("sendEmail retry_later is NOT a fault (reconcile returns clean -> 200)", async () => {
    watchMock.refreshWatchSubscriptions.mockResolvedValue(CLEAN_REFRESH);
    watchMock.reconcileWatchChannels.mockResolvedValue({
      outcome: "recovered",
      sweptPending: 0,
      escalated: true,
      faults: [],
    });
    const { GET } = await import("@/app/api/cron/refresh-watch/route");

    const response = await GET(authedRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.reconcile.outcome).toBe("recovered");
    expect(body.reconcile.faults).toBeUndefined();
  });
});
