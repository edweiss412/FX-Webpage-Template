// @vitest-environment jsdom
//
// Backoff spec §3.6 / §6 class 18 (Settings page loader half; whole-diff
// review): the page's separate service-role read forwards a live state row to
// DriveConnectionPanel, maps the helper's typed infra_error to null, and never
// calls the helper when the health carries no folder id. Harness mirrors
// tests/app/admin/settingsDataLoad.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const watchStateMock = vi.hoisted(() => ({
  result: null as unknown,
  spy: undefined as unknown as ReturnType<typeof vi.fn>,
}));
const healthMock = vi.hoisted(() => ({
  health: {} as Record<string, unknown>,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {},
  requireAdminIdentity: async () => ({ email: "admin@example.com" }),
}));
vi.mock("@/lib/onboarding/serverActions", () => ({
  rerunSetupServerAction: async () => {},
}));
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-06-01T12:00:00.000Z"),
}));
vi.mock("@/lib/admin/watchSurfaceState", () => {
  const spy = vi.fn(async () => watchStateMock.result);
  watchStateMock.spy = spy;
  return { readWatchSurfaceState: spy };
});
vi.mock("@/lib/admin/driveConnectionHealth", () => ({
  fetchDriveConnectionHealth: vi.fn(async () => healthMock.health),
}));
vi.mock("@/lib/admin/embeddedAdminEmails", () => ({
  fetchEmbeddedAdminEmails: vi.fn(async () => ({
    kind: "ok" as const,
    rows: [
      {
        email: "admin@example.com",
        added_by: null,
        added_at: "2026-05-01T00:00:00.000Z",
        revoked_by: null,
        revoked_at: null,
        note: null,
      },
    ],
  })),
}));
vi.mock("@/lib/appSettings/getSettingsPageFlags", () => ({
  getSettingsPageFlags: vi.fn(async () => ({
    kind: "ok" as const,
    autoPublishCleanFirstSeen: false,
    alertOnSyncProblems: true,
    dailyReviewDigest: true,
    alertOnAutoPublish: true,
  })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/settings",
}));

const WARN_HEALTH = {
  health: "warn" as const,
  reason: "watch_expired" as const,
  code: "WATCH_CHANNEL_ORPHANED" as const,
  folderName: "Show Sheets",
  folderId: "folder-123",
  syncingCount: 3,
  attentionCount: 1,
  lastReadAt: "2026-06-01T11:00:00.000Z",
};
const FAILED_STATE = {
  nextAttemptAt: "2026-06-01T12:15:00.000Z",
  consecutiveFailures: 2,
  lastAttemptOutcome: "failed" as const,
};

async function renderPage() {
  const mod = await import("@/app/admin/settings/page");
  render(await mod.default());
}

describe("settings page watchState loader (spec §3.6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watchStateMock.result = null;
    healthMock.health = WARN_HEALTH;
  });
  afterEach(() => cleanup());

  it("forwards a live failed state row into the panel's sentence", async () => {
    watchStateMock.result = FAILED_STATE;
    await renderPage();
    const line = screen.getByTestId("drive-connection-next-attempt");
    expect(line.textContent).toBe("Trying again in 15 min · 2 reconnect attempts so far");
    expect(watchStateMock.spy).toHaveBeenCalledWith("folder-123");
    expect(watchStateMock.spy).toHaveBeenCalledTimes(1);
  });

  it("maps the helper's typed infra_error to a hidden line (render-boundary policy)", async () => {
    watchStateMock.result = { kind: "infra_error" };
    await renderPage();
    expect(screen.queryByTestId("drive-connection-next-attempt")).toBeNull();
    expect(screen.getByTestId("admin-settings-page")).toBeTruthy(); // page intact
  });

  it("never calls the helper when the health carries no folder id", async () => {
    healthMock.health = { ...WARN_HEALTH, reason: "not_configured" as const, folderId: null };
    await renderPage();
    expect(watchStateMock.spy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("drive-connection-next-attempt")).toBeNull();
  });
});
