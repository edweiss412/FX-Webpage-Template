// @vitest-environment jsdom
/**
 * tests/app/admin/dashboardFolderTitle.test.tsx
 *
 * Regression guard for the page → Dashboard wiring of the watched Drive folder
 * name. The settled (Precedence 3) `/admin` render path MUST thread
 * settings.watched_folder_name into <Dashboard folderName>. A prior version
 * passed it only on the defensive final_cas_done branch, so the everyday
 * dashboard fell back to the generic "Active shows" title even when a folder
 * name was stored (the Dashboard component's own unit test passed the prop
 * directly and never exercised this wiring).
 *
 * The Dashboard is stubbed to CAPTURE the folderName prop it receives, so this
 * test pins the page-level wiring, not the data layer.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const captured = vi.hoisted(() => ({ folderName: "UNSET" as string | null | undefined }));

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));
// Fast-path: readAppSettingsRow returns a settled row (pending_wizard_session_at
// null) so AdminPage reuses it WITHOUT the purge tx, and the settled branch
// renders. watched_folder_name is the value under test.
vi.mock("@/lib/appSettings/readAppSettingsRow", () => ({
  readAppSettingsRow: async () => ({
    kind: "value",
    settings: {
      pending_wizard_session_id: null,
      pending_wizard_session_at: null,
      watched_folder_id: "f1",
      watched_folder_name: "fxav-test-shows",
    },
  }),
}));
vi.mock("@/lib/onboarding/sessionLifecycle", () => ({
  purgeAndRotateIfStale: async () => ({
    settings: {
      pending_wizard_session_id: null,
      pending_wizard_session_at: null,
      watched_folder_id: "f1",
      watched_folder_name: "fxav-test-shows",
    },
  }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  // admin-show-modal Task 11: ShowsTable/StagedReviewCard build param-preserving
  // modal hrefs from the current search params.
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));
// bell notification center §8: AlertBanner is retired — no banner stub needed.
vi.mock("@/components/admin/Dashboard", () => ({
  Dashboard: (props: { folderName?: string | null }) => {
    captured.folderName = props.folderName;
    return null;
  },
}));

async function renderAdminPage() {
  const mod = await import("@/app/admin/page");
  const ui = await mod.default({ searchParams: Promise.resolve({}) });
  render(ui);
}

beforeEach(() => {
  captured.folderName = "UNSET";
  vi.resetModules();
});
afterEach(() => cleanup());

describe("settled /admin threads the watched folder name into Dashboard", () => {
  it("passes settings.watched_folder_name as folderName (not undefined/null)", async () => {
    await renderAdminPage();
    expect(captured.folderName).toBe("fxav-test-shows");
  });
});
