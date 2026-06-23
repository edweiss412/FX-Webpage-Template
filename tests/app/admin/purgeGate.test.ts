// @vitest-environment jsdom
// nav-perf phase 1 (A2) — app/admin/page.tsx purge gate. purgeAndRotateIfStale
// opens a postgres.js tx on EVERY /admin render but is a no-op unless
// `pending_wizard_session_at` is non-null. The gate reads app_settings cheaply
// first (readAppSettingsRow); when that read confirms NULL it reuses those
// settings and SKIPS the tx. A non-null session OR an infra fault on the cheap
// read (returned-error OR thrown) falls back to the original always-call
// behavior so a degraded read can NEVER produce a false "settled" render.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  preRead: { kind: "value", settings: {} } as
    | { kind: "value"; settings: Record<string, unknown> }
    | { kind: "infra_error" },
  preReadThrows: false as boolean,
  purgeSettings: {} as Record<string, unknown>,
}));

const purgeSpy = vi.hoisted(() => vi.fn());
const readAppSettingsRowSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));

vi.mock("@/lib/appSettings/readAppSettingsRow", () => ({
  readAppSettingsRow: (...args: unknown[]) => {
    readAppSettingsRowSpy(...args);
    if (state.preReadThrows) throw new Error("META: readAppSettingsRow threw");
    return Promise.resolve(state.preRead);
  },
}));

vi.mock("@/lib/onboarding/sessionLifecycle", () => ({
  purgeAndRotateIfStale: (...args: unknown[]) => {
    purgeSpy(...args);
    return Promise.resolve({ settings: state.purgeSettings, rotated: false });
  },
}));

vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

// Isolate the gate from the dashboard data layer + async banner.
vi.mock("@/components/admin/Dashboard", () => ({ Dashboard: () => null }));
vi.mock("@/components/admin/AlertBanner", () => ({ AlertBanner: () => null }));

// A settled, folder-configured, no-pending-session app_settings row → the
// dispatcher reaches precedence-3 (DashboardWithHeader). Each case sets a
// distinct `pending_wizard_session_at` to drive the gate decision.
function settledSettings(over: Record<string, unknown> = {}) {
  return {
    watched_folder_id: "f1",
    pending_wizard_session_id: null,
    pending_wizard_session_at: null,
    ...over,
  };
}

async function renderAdminPage() {
  const mod = await import("@/app/admin/page");
  return mod.default({ searchParams: Promise.resolve({}) });
}

beforeEach(() => {
  state.preRead = { kind: "value", settings: settledSettings() };
  state.preReadThrows = false;
  state.purgeSettings = settledSettings();
  purgeSpy.mockClear();
  readAppSettingsRowSpy.mockClear();
});
afterEach(() => vi.resetModules());

describe("/admin purge gate (nav-perf phase 1 A2)", () => {
  test("pending_wizard_session_at=null → purgeAndRotateIfStale NOT called; uses pre-read settings", async () => {
    state.preRead = { kind: "value", settings: settledSettings({ pending_wizard_session_at: null }) };
    await renderAdminPage();
    expect(readAppSettingsRowSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).not.toHaveBeenCalled();
  });

  test("pending_wizard_session_at non-null → purgeAndRotateIfStale IS called (unchanged)", async () => {
    state.preRead = {
      kind: "value",
      settings: settledSettings({ pending_wizard_session_at: "2026-06-01T00:00:00.000Z" }),
    };
    await renderAdminPage();
    expect(readAppSettingsRowSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).toHaveBeenCalledTimes(1);
  });

  test("pre-read returned infra_error → falls back to purgeAndRotateIfStale (no false settled render)", async () => {
    state.preRead = { kind: "infra_error" };
    await renderAdminPage();
    expect(readAppSettingsRowSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).toHaveBeenCalledTimes(1);
  });

  test("pre-read THROWS → falls back to purgeAndRotateIfStale (no false settled render)", async () => {
    state.preReadThrows = true;
    await renderAdminPage();
    expect(readAppSettingsRowSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).toHaveBeenCalledTimes(1);
  });
});
