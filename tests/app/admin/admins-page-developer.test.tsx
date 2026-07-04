// @vitest-environment jsdom
//
// developer-tier Task 17 (spec §6 "Administrators deep-link page", Codex R6) —
// the /admin/settings/admins deep link must thread the SAME developer bit into
// AdministratorsSection that the embedded /admin/settings body does, so the
// per-row Developer toggle is visible on BOTH surfaces (not just the embedded
// one). Concrete failure mode: the deep-link page forgetting viewerIsDeveloper
// → a developer opening /admin/settings/admins directly sees no toggles.
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
// Capture the developer flag the deep-link page hands to AdministratorsSection.
vi.mock("@/components/admin/settings/AdministratorsSection", () => ({
  AdministratorsSection: ({ viewerIsDeveloper }: { viewerIsDeveloper?: boolean }) => (
    <div data-testid="mock-admins-section" data-viewer-is-developer={String(viewerIsDeveloper)} />
  ),
}));

async function renderAdminsPage() {
  const mod = await import("@/app/admin/settings/admins/page");
  render(await mod.default());
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("Administrators deep-link page — viewerIsDeveloper threading (Task 17)", () => {
  it("developer → AdministratorsSection receives viewerIsDeveloper=true", async () => {
    dev.isCurrentUserDeveloper.mockResolvedValue(true);
    await renderAdminsPage();
    expect(screen.getByTestId("mock-admins-section")).toHaveAttribute(
      "data-viewer-is-developer",
      "true",
    );
  });

  it("non-developer → AdministratorsSection receives viewerIsDeveloper=false", async () => {
    dev.isCurrentUserDeveloper.mockResolvedValue(false);
    await renderAdminsPage();
    expect(screen.getByTestId("mock-admins-section")).toHaveAttribute(
      "data-viewer-is-developer",
      "false",
    );
  });
});
