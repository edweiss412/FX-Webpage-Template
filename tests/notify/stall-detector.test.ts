import { beforeEach, describe, expect, test, vi } from "vitest";
import { STALENESS_THRESHOLD_MS } from "@/lib/notify/constants";
import { detectAndResolveStall } from "@/lib/notify/detect/stall";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn(),
}));

vi.mock("@/lib/adminAlerts/resolveAdminAlert", () => ({
  resolveAdminAlert: vi.fn(),
}));

const upsertMock = vi.mocked(upsertAdminAlert);
const resolveMock = vi.mocked(resolveAdminAlert);

describe("detectAndResolveStall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue(null);
    resolveMock.mockResolvedValue(undefined);
  });

  test("null heartbeat raises global SYNC_STALLED", async () => {
    const result = await detectAndResolveStall(null, new Date("2026-06-02T15:00:00.000Z"));

    expect(result).toEqual({ kind: "ok" });
    expect(upsertMock).toHaveBeenCalledWith({
      showId: null,
      code: "SYNC_STALLED",
      context: {},
    });
    expect(resolveMock).not.toHaveBeenCalled();
  });

  test("heartbeat older than threshold raises global SYNC_STALLED", async () => {
    const now = new Date("2026-06-02T15:00:00.000Z");
    const heartbeat = new Date(now.getTime() - STALENESS_THRESHOLD_MS - 1);

    await expect(detectAndResolveStall(heartbeat, now)).resolves.toEqual({ kind: "ok" });

    expect(upsertMock).toHaveBeenCalledWith({
      showId: null,
      code: "SYNC_STALLED",
      context: {},
    });
  });

  test("fresh heartbeat resolves global SYNC_STALLED and does not raise a false stall", async () => {
    const now = new Date("2026-06-02T15:00:00.000Z");
    const heartbeat = new Date(now.getTime() - STALENESS_THRESHOLD_MS + 1);

    await expect(detectAndResolveStall(heartbeat, now)).resolves.toEqual({ kind: "ok" });

    expect(upsertMock).not.toHaveBeenCalled();
    expect(resolveMock).toHaveBeenCalledWith({ showId: null, code: "SYNC_STALLED" });
  });

  test("fresh-deploy heartbeat at now does not raise a stall", async () => {
    const now = new Date("2026-06-02T15:00:00.000Z");

    await expect(detectAndResolveStall(now, now)).resolves.toEqual({ kind: "ok" });

    expect(upsertMock).not.toHaveBeenCalled();
    expect(resolveMock).toHaveBeenCalledWith({ showId: null, code: "SYNC_STALLED" });
  });

  test("upsert failure returns infra_error and never throws", async () => {
    upsertMock.mockRejectedValue(new Error("write failed"));

    await expect(
      detectAndResolveStall(null, new Date("2026-06-02T15:00:00.000Z")),
    ).resolves.toEqual({ kind: "infra_error" });
  });

  test("resolve failure returns infra_error and never throws", async () => {
    resolveMock.mockRejectedValue(new Error("resolve failed"));

    await expect(
      detectAndResolveStall(
        new Date("2026-06-02T15:00:00.000Z"),
        new Date("2026-06-02T15:00:00.000Z"),
      ),
    ).resolves.toEqual({ kind: "infra_error" });
  });
});
