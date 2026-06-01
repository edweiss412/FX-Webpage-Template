// @vitest-environment jsdom
// M12.2 Phase B1 Task 4.2 — Settings header consolidation. The inline
// eyebrow + <h2>Settings</h2> + sub block is replaced by the shared
// <AdminPageHeader title="Settings" sub="Manage your Drive connection, who can
// administer, and how the app behaves." />. The page owns its actor identity
// via requireAdminIdentity (used in Phase 6). Container caps at max-w-[740px].
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const calls = vi.hoisted(() => ({ requireAdminIdentity: 0, requireAdmin: 0 }));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {
    calls.requireAdmin += 1;
  },
  requireAdminIdentity: async () => {
    calls.requireAdminIdentity += 1;
    return { email: "admin@example.com" };
  },
}));
vi.mock("@/lib/onboarding/serverActions", () => ({
  rerunSetupServerAction: async () => {},
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/settings",
}));

async function renderSettings() {
  const mod = await import("@/app/admin/settings/page");
  render(await mod.default());
}

beforeEach(() => {
  calls.requireAdminIdentity = 0;
  calls.requireAdmin = 0;
  vi.resetModules();
});
afterEach(() => {
  cleanup();
});

describe("Settings header (Task 4.2)", () => {
  it("renders AdminPageHeader with title 'Settings' + new sub copy", async () => {
    await renderSettings();
    const header = screen.getByTestId("admin-page-header");
    expect(screen.getByTestId("admin-page-header-title").textContent).toBe("Settings");
    expect(header.textContent).toMatch(
      /Manage your Drive connection, who can administer, and how the app behaves\./,
    );
  });

  it("reads actor identity via requireAdminIdentity", async () => {
    await renderSettings();
    expect(calls.requireAdminIdentity).toBe(1);
  });

  it("caps the container at max-w-[740px]", async () => {
    await renderSettings();
    expect(screen.getByTestId("admin-settings-page").className).toMatch(/max-w-\[740px\]/);
  });

  it("keeps the re-run-setup + administrators body sections", async () => {
    await renderSettings();
    expect(screen.getByTestId("admin-settings-rerun-setup-section")).toBeInTheDocument();
    expect(screen.getByTestId("admin-settings-admins-link")).toBeInTheDocument();
  });
});
