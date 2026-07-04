// @vitest-environment jsdom
//
// developer-tier Task 16 (spec §6 "Settings page net effect") — the settings
// page gates the Maintenance + Diagnostics sections and the developer controls
// on the runtime developer bit. A normal admin (isCurrentUserDeveloper=false)
// sees NEITHER section, and the two developer-aware children receive a `false`
// flag; a developer sees both sections and both children receive `true`.
//
// Concrete failure mode pinned: a normal admin seeing the developer-only
// Maintenance (stale-session reap / destructive reset) or Diagnostics
// (observability deep-link) surfaces, or the page forwarding a stale/true
// developer flag to DevToolsRow / AdministratorsSection.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const dev = vi.hoisted(() => ({ isCurrentUserDeveloper: vi.fn() }));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {},
  requireAdminIdentity: async () => ({ email: "admin@example.com" }),
}));
vi.mock("@/lib/auth/requireDeveloper", () => ({
  isCurrentUserDeveloper: dev.isCurrentUserDeveloper,
}));
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-06-01T12:00:00.000Z"),
}));
vi.mock("@/lib/admin/driveConnectionHealth", () => ({
  fetchDriveConnectionHealth: vi.fn(async () => ({
    health: "positive" as const,
    folderName: "Show Sheets",
    folderId: "folder-123",
    syncingCount: 3,
    attentionCount: 0,
    lastReadAt: "2026-06-01T11:00:00.000Z",
  })),
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
        is_developer: true,
      },
    ],
  })),
}));
vi.mock("@/lib/appSettings/getSettingsPageFlags", () => ({
  getSettingsPageFlags: vi.fn(async () => ({
    kind: "value" as const,
    autoPublishCleanFirstSeen: true,
    alertOnSyncProblems: true,
    dailyReviewDigest: false,
    alertOnAutoPublish: true,
  })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/settings",
}));

// DevToolsRow + AdministratorsSection are mocked to capture the developer flag
// each receives. DevToolsRow itself renders null in a non-dev build regardless,
// so its DOM cannot witness the prop — capture it here instead.
vi.mock("@/components/admin/settings/DevToolsRow", () => ({
  DevToolsRow: ({ isDeveloper }: { isDeveloper?: boolean }) => (
    <div data-testid="mock-dev-tools-row" data-is-developer={String(isDeveloper)} />
  ),
}));
vi.mock("@/components/admin/settings/AdministratorsSection", () => ({
  AdministratorsSection: ({ viewerIsDeveloper }: { viewerIsDeveloper?: boolean }) => (
    <div data-testid="mock-admins-section" data-viewer-is-developer={String(viewerIsDeveloper)} />
  ),
}));

async function renderSettings() {
  const mod = await import("@/app/admin/settings/page");
  render(await mod.default());
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("Settings page developer visibility (Task 16)", () => {
  it("non-developer → NO Maintenance/Diagnostics; children get isDeveloper=false", async () => {
    dev.isCurrentUserDeveloper.mockResolvedValue(false);

    await renderSettings();

    expect(screen.queryByTestId("admin-settings-maintenance-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-settings-diagnostics-section")).not.toBeInTheDocument();

    expect(screen.getByTestId("mock-dev-tools-row")).toHaveAttribute("data-is-developer", "false");
    expect(screen.getByTestId("mock-admins-section")).toHaveAttribute(
      "data-viewer-is-developer",
      "false",
    );
  });

  it("developer → both sections render; children get isDeveloper=true", async () => {
    dev.isCurrentUserDeveloper.mockResolvedValue(true);

    await renderSettings();

    expect(screen.getByTestId("admin-settings-maintenance-section")).toBeInTheDocument();
    expect(screen.getByTestId("admin-settings-diagnostics-section")).toBeInTheDocument();

    expect(screen.getByTestId("mock-dev-tools-row")).toHaveAttribute("data-is-developer", "true");
    expect(screen.getByTestId("mock-admins-section")).toHaveAttribute(
      "data-viewer-is-developer",
      "true",
    );
  });
});
