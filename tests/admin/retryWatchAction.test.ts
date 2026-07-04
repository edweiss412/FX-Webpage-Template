/**
 * tests/admin/retryWatchAction.test.ts (Task 9)
 *
 * Unit-test harness for retryWatchSubscriptionFormAction in
 * app/admin/actions.ts (spec §3.6 / §4.5 incl. R11 advisory 1 — every
 * fail-visible path pinned).
 *
 * Mock surface: @/lib/auth/requireAdmin, @/lib/appSettings/getWatchedFolderId,
 * @/lib/drive/watch, @/lib/adminAlerts/resolveAdminAlert, next/cache, @/lib/log.
 *
 * Anti-tautology: the "active outcome" test asserts the resolveAdminAlert
 * SPY's call args directly (not any rendered DOM/banner state), and the
 * "orphaned outcome" test asserts the spy was NOT called at all — a broken
 * implementation that always resolves (or never resolves) cannot pass both.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const requireAdminSpy = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: requireAdminSpy,
}));

const getActiveWatchedFolderSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/appSettings/getWatchedFolderId", () => ({
  getActiveWatchedFolder: getActiveWatchedFolderSpy,
}));

const subscribeToWatchedFolderSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/drive/watch", () => ({
  subscribeToWatchedFolder: subscribeToWatchedFolderSpy,
}));

const resolveAdminAlertSpy = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/adminAlerts/resolveAdminAlert", () => ({
  resolveAdminAlert: resolveAdminAlertSpy,
}));

const revalidatePathSpy = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathSpy,
}));

const logInfoSpy = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/log", () => ({
  log: { info: logInfoSpy, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import AFTER mocks so the action's module-level imports resolve to them.
import { retryWatchSubscriptionFormAction } from "@/app/admin/actions";

class FakeDriveWatchInfraError extends Error {
  readonly kind = "drive_watch_infra_error";
  constructor(operation: string) {
    super(`Drive watch infrastructure failure during ${operation}`);
  }
}

describe("retryWatchSubscriptionFormAction", () => {
  beforeEach(() => {
    requireAdminSpy.mockClear();
    getActiveWatchedFolderSpy.mockReset();
    subscribeToWatchedFolderSpy.mockReset();
    resolveAdminAlertSpy.mockClear();
    revalidatePathSpy.mockClear();
    logInfoSpy.mockClear();
  });

  test("calls requireAdmin before any read", async () => {
    getActiveWatchedFolderSpy.mockResolvedValue({ kind: "no_folder_configured" });

    await retryWatchSubscriptionFormAction(new FormData());

    expect(requireAdminSpy).toHaveBeenCalledTimes(1);
    // requireAdmin must run before the first read — assert ordering via
    // mock invocation order rather than just "was called".
    const requireAdminOrder = requireAdminSpy.mock.invocationCallOrder[0];
    const folderReadOrder = getActiveWatchedFolderSpy.mock.invocationCallOrder[0];
    expect(requireAdminOrder).toBeLessThan(folderReadOrder as number);
  });

  test("no_folder_configured → returns without subscribe, no throw, no revalidate; logs the deliberate skip", async () => {
    getActiveWatchedFolderSpy.mockResolvedValue({ kind: "no_folder_configured" });

    await expect(retryWatchSubscriptionFormAction(new FormData())).resolves.toBeUndefined();

    expect(subscribeToWatchedFolderSpy).not.toHaveBeenCalled();
    expect(resolveAdminAlertSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
    expect(logInfoSpy).toHaveBeenCalledTimes(1);
    const [message, fields] = logInfoSpy.mock.calls[0] as unknown as [
      string,
      { source: string; code?: string },
    ];
    expect(message).toEqual(expect.stringContaining("skip"));
    expect(fields.source).toBe("admin.watchRetry");
    // Info-WITH-code so the deliberate no-op PERSISTS (info persists only with a code).
    expect(fields.code).toBe("WATCH_RETRY_NO_FOLDER_SKIPPED");
  });

  test("folder infra_error → REJECTS with the typed WatchRetryInfraError (kind discriminator), no subscribe, no revalidate", async () => {
    getActiveWatchedFolderSpy.mockResolvedValue({
      kind: "infra_error",
      operation: "readActiveWatchedFolderId",
      source: "returned_error",
      cause: new Error("boom"),
    });

    // Failure mode: a generic Error keeps fail-visibility but loses the
    // discriminable typed-result contract (invariant 9 / spec §3.6.2 "throw
    // a typed error").
    await expect(retryWatchSubscriptionFormAction(new FormData())).rejects.toMatchObject({
      kind: "watch_retry_infra_error",
      operation: "folder_read",
    });

    expect(subscribeToWatchedFolderSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  test("active outcome → resolveAdminAlert({showId:null, code:'WATCH_CHANNEL_ORPHANED'}) + both revalidatePaths", async () => {
    getActiveWatchedFolderSpy.mockResolvedValue({ folderId: "folder-123" });
    subscribeToWatchedFolderSpy.mockResolvedValue({ outcome: "active", channelId: "chan-1" });

    await retryWatchSubscriptionFormAction(new FormData());

    expect(subscribeToWatchedFolderSpy).toHaveBeenCalledWith("folder-123");
    // anti-tautology: assert the resolve SPY args, not DOM.
    expect(resolveAdminAlertSpy).toHaveBeenCalledTimes(1);
    expect(resolveAdminAlertSpy).toHaveBeenCalledWith({
      showId: null,
      code: "WATCH_CHANNEL_ORPHANED",
    });
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin", "layout");
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/settings");
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
  });

  test("orphaned outcome → NO resolve call; still revalidates (banner re-render is the feedback)", async () => {
    getActiveWatchedFolderSpy.mockResolvedValue({ folderId: "folder-123" });
    subscribeToWatchedFolderSpy.mockResolvedValue({
      outcome: "orphaned",
      channelId: "chan-1",
      reason: "watch_create_failed",
    });

    await retryWatchSubscriptionFormAction(new FormData());

    expect(resolveAdminAlertSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin", "layout");
    expect(revalidatePathSpy).toHaveBeenCalledWith("/admin/settings");
    expect(revalidatePathSpy).toHaveBeenCalledTimes(2);
  });

  test("subscribe throwing DriveWatchInfraError → REJECTS", async () => {
    getActiveWatchedFolderSpy.mockResolvedValue({ folderId: "folder-123" });
    subscribeToWatchedFolderSpy.mockRejectedValue(
      new FakeDriveWatchInfraError("drive_watch_channels.insert_pending"),
    );

    await expect(retryWatchSubscriptionFormAction(new FormData())).rejects.toMatchObject({
      kind: "drive_watch_infra_error",
    });

    expect(resolveAdminAlertSpy).not.toHaveBeenCalled();
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });

  test("resolveAdminAlert throwing after active → REJECTS (fail-visible)", async () => {
    getActiveWatchedFolderSpy.mockResolvedValue({ folderId: "folder-123" });
    subscribeToWatchedFolderSpy.mockResolvedValue({ outcome: "active", channelId: "chan-1" });
    resolveAdminAlertSpy.mockRejectedValue(new Error("resolve failed"));

    await expect(retryWatchSubscriptionFormAction(new FormData())).rejects.toThrow(
      "resolve failed",
    );

    // The failed resolve must NOT be papered over by a revalidate — the
    // banner would otherwise appear to have cleared while the alert row
    // stays unresolved on the DB.
    expect(revalidatePathSpy).not.toHaveBeenCalled();
  });
});
