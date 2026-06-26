// @vitest-environment jsdom
/**
 * tests/admin/onboardingNavSuppression.test.tsx (Onboarding UX Polish — Task 1)
 *
 * Pins the layout's onboarding nav-suppression gate. During first-run
 * onboarding (a minted wizard session OR no watched folder yet) AdminLayout
 * renders the slim <OnboardingTopBar> instead of the full <AdminNav>; once the
 * folder is set and no wizard session is pending it renders the full nav. A
 * `{kind:"infra_error"}` app_settings read FAILS OPEN to the full nav so a
 * settled admin is never stranded without navigation.
 *
 * Concrete failure mode caught: (a) shipping the full nav tabs during
 * onboarding (the tabs point at destinations that don't exist yet); (b) a
 * fail-CLOSED app_settings read that hides nav from a settled admin on any
 * transient Supabase fault.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";

type ReadResult = { kind: "value"; settings: AppSettingsRow } | { kind: "infra_error" };

const settingsState = vi.hoisted(() => ({ result: null as ReadResult | null }));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {},
  requireAdminIdentity: vi.fn(async () => ({ email: "admin@fxav.test" })),
}));

vi.mock("@/lib/appSettings/readAppSettingsRow", () => ({
  readAppSettingsRow: vi.fn(async () => settingsState.result),
}));

// The full nav is a client island (usePathname); stub it to a detectable
// marker so we can assert its presence/absence without a Next request scope.
vi.mock("@/components/admin/nav/AdminNav", () => ({
  AdminNav: () => React.createElement("div", { "data-testid": "admin-nav-topbar" }, "nav"),
}));
vi.mock("@/components/layout/PageTransition", () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/messages/lookup", () => ({ getRequiredDougFacing: () => "load failed" }));
vi.mock("@/lib/admin/alertCount", () => ({
  fetchUnresolvedAlertCount: vi.fn(async () => ({ kind: "ok", count: 0 })),
}));
vi.mock("@/lib/admin/needsAttentionCount", () => ({
  loadNeedsAttentionCount: vi.fn(async () => ({ kind: "ok", count: 0 })),
}));
// next/image renders a plain <img> in jsdom without Next's loader plumbing.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", props),
}));

function makeSettings(over: Partial<AppSettingsRow>): AppSettingsRow {
  return {
    id: "default",
    watched_folder_id: null,
    watched_folder_name: null,
    watched_folder_set_by_email: null,
    watched_folder_set_at: null,
    active_signing_key_id: "key-1",
    pending_folder_id: null,
    pending_folder_name: null,
    pending_folder_set_by_email: null,
    pending_folder_set_at: null,
    pending_wizard_session_id: null,
    pending_wizard_session_at: null,
    updated_at: "2026-06-24T00:00:00.000Z",
    ...over,
  };
}

async function renderLayout() {
  const mod = await import("@/app/admin/layout");
  const ui = await mod.default({ children: null });
  render(ui);
}

afterEach(() => {
  cleanup();
  vi.resetModules();
});

beforeEach(() => {
  settingsState.result = null;
});

describe("AdminLayout onboarding nav suppression (Task 1)", () => {
  it("renders the slim onboarding bar (no full nav) when a wizard session is pending", async () => {
    settingsState.result = {
      kind: "value",
      settings: makeSettings({
        pending_wizard_session_id: "sess-1",
        watched_folder_id: "folder-1",
      }),
    };
    await renderLayout();
    expect(screen.getByTestId("onboarding-top-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-topbar")).toBeNull();
  });

  it("renders the slim onboarding bar when no watched folder is set yet (fresh first run)", async () => {
    settingsState.result = {
      kind: "value",
      settings: makeSettings({ pending_wizard_session_id: null, watched_folder_id: null }),
    };
    await renderLayout();
    expect(screen.getByTestId("onboarding-top-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-topbar")).toBeNull();
  });

  it("renders the full nav (no slim bar) once settled — folder set, no pending session", async () => {
    settingsState.result = {
      kind: "value",
      settings: makeSettings({ pending_wizard_session_id: null, watched_folder_id: "folder-1" }),
    };
    await renderLayout();
    expect(screen.getByTestId("admin-nav-topbar")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-top-bar")).toBeNull();
  });

  it("FAILS OPEN to the full nav on an app_settings infra_error", async () => {
    settingsState.result = { kind: "infra_error" };
    await renderLayout();
    expect(screen.getByTestId("admin-nav-topbar")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-top-bar")).toBeNull();
  });
});
