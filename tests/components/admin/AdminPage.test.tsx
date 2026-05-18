// @vitest-environment jsdom
/**
 * tests/components/admin/AdminPage.test.tsx (M10 §B Task 10.1 §B / Phase 1)
 *
 * Pins the dispatch contract of `/admin` (Phase 1 routing): based on
 * `result.settings` from `purgeAndRotateIfStale` + URL `?show_finalize`,
 * render OnboardingWizard / Dashboard stub / FinalizeReentry stub.
 *
 * Phase 1 routing precedence (deterministic, top-down):
 *   1. result.suppressed === 'WIZARD_FINALIZE_BATCHES_PENDING' OR
 *      searchParams.show_finalize === 'true' → FinalizeReentry stub.
 *   2. settings.watched_folder_id === null OR
 *      settings.pending_wizard_session_id !== null → OnboardingWizard.
 *   3. Otherwise → Dashboard stub.
 *
 * Fresh-settings invariant (spec §9.0): the page MUST pass
 * `result.settings` (the post-mutation row returned by the helper) into
 * the wizard renderer — never a pre-call capture. This test pins the
 * invariant by checking that, when the helper rotates the session, the
 * id reaching OnboardingWizard is the post-rotation id.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";

const purgeAndRotateIfStaleMock = vi.fn();
const requireAdminIdentityMock = vi.fn();
const onboardingWizardSpy =
  vi.fn<(props: { settings: AppSettingsRow; searchParams: { step?: string } }) => unknown>();

vi.mock("@/lib/onboarding/sessionLifecycle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding/sessionLifecycle")>(
    "@/lib/onboarding/sessionLifecycle",
  );
  return {
    ...actual,
    purgeAndRotateIfStale: (...args: unknown[]) => purgeAndRotateIfStaleMock(...args),
  };
});

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: () => requireAdminIdentityMock(),
  requireAdmin: () => requireAdminIdentityMock(),
}));

vi.mock("@/components/admin/OnboardingWizard", () => ({
  OnboardingWizard: (props: { settings: AppSettingsRow; searchParams: { step?: string } }) => {
    onboardingWizardSpy(props);
    return (
      <div
        data-testid="onboarding-wizard-spy"
        data-pending-session={props.settings.pending_wizard_session_id ?? "null"}
        data-watched-folder={props.settings.watched_folder_id ?? "null"}
        data-step={props.searchParams.step ?? "default"}
      />
    );
  },
}));

import AdminPage from "@/app/admin/page";

const FRESH_SETTINGS: AppSettingsRow = {
  id: "default",
  watched_folder_id: null,
  watched_folder_name: null,
  watched_folder_set_by_email: null,
  watched_folder_set_at: null,
  active_signing_key_id: "test-key",
  pending_folder_id: null,
  pending_folder_name: null,
  pending_folder_set_by_email: null,
  pending_folder_set_at: null,
  pending_wizard_session_id: null,
  pending_wizard_session_at: null,
  updated_at: new Date().toISOString(),
};

const SETTLED_SETTINGS: AppSettingsRow = {
  ...FRESH_SETTINGS,
  watched_folder_id: "folder-abc",
  watched_folder_name: "Shows 2026",
  watched_folder_set_by_email: "edweiss412@gmail.com",
  watched_folder_set_at: new Date().toISOString(),
};

const WIZARD_IN_FLIGHT_SETTINGS: AppSettingsRow = {
  ...FRESH_SETTINGS,
  pending_wizard_session_id: "11111111-1111-1111-1111-111111111111",
  pending_wizard_session_at: new Date().toISOString(),
};

const RE_RUN_SETUP_SETTINGS: AppSettingsRow = {
  ...SETTLED_SETTINGS,
  pending_wizard_session_id: "22222222-2222-2222-2222-222222222222",
  pending_wizard_session_at: new Date().toISOString(),
};

const ROTATED_SETTINGS: AppSettingsRow = {
  ...FRESH_SETTINGS,
  pending_wizard_session_id: "33333333-3333-3333-3333-333333333333",
  pending_wizard_session_at: new Date().toISOString(),
};

beforeEach(() => {
  purgeAndRotateIfStaleMock.mockReset();
  requireAdminIdentityMock.mockReset();
  onboardingWizardSpy.mockReset();
  requireAdminIdentityMock.mockResolvedValue({ email: "edweiss412@gmail.com" });
});

afterEach(() => cleanup());

describe("AdminPage Phase 1 routing", () => {
  test("fresh DB (watched_folder_id NULL, pending NULL) renders OnboardingWizard", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: FRESH_SETTINGS,
      rotated: false,
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("onboarding-wizard-spy")).toBeTruthy();
    expect(queryByTestId("admin-dashboard-placeholder")).toBeNull();
    expect(queryByTestId("admin-finalize-reentry-placeholder")).toBeNull();
  });

  test("settled (watched_folder_id non-null, pending NULL) renders Dashboard placeholder", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: SETTLED_SETTINGS,
      rotated: false,
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("admin-dashboard-placeholder").textContent ?? "").toMatch(
      /Dashboard is coming/i,
    );
    expect(queryByTestId("onboarding-wizard-spy")).toBeNull();
  });

  test("wizard mid-flight (pending_wizard_session_id non-null) renders OnboardingWizard", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
    });
    const { getByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("onboarding-wizard-spy")).toBeTruthy();
    expect(getByTestId("onboarding-wizard-spy").dataset.pendingSession).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  test("re-run-setup (watched_folder_id non-null AND pending non-null) renders OnboardingWizard", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: RE_RUN_SETUP_SETTINGS,
      rotated: false,
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("onboarding-wizard-spy")).toBeTruthy();
    // The dashboard stub must NOT render even though watched_folder_id is set.
    expect(queryByTestId("admin-dashboard-placeholder")).toBeNull();
  });

  test("?show_finalize=true renders FinalizeReentry placeholder (Phase 1 stub)", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: SETTLED_SETTINGS,
      rotated: false,
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({
        searchParams: Promise.resolve({ show_finalize: "true" }),
      }),
    );
    expect(getByTestId("admin-finalize-reentry-placeholder")).toBeTruthy();
    expect(queryByTestId("onboarding-wizard-spy")).toBeNull();
    expect(queryByTestId("admin-dashboard-placeholder")).toBeNull();
  });

  test("result.suppressed=WIZARD_FINALIZE_BATCHES_PENDING renders FinalizeReentry placeholder", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
      suppressed: "WIZARD_FINALIZE_BATCHES_PENDING",
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("admin-finalize-reentry-placeholder")).toBeTruthy();
    expect(queryByTestId("onboarding-wizard-spy")).toBeNull();
  });

  test("fresh-settings invariant: post-rotation settings reach OnboardingWizard, not pre-call values", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: ROTATED_SETTINGS,
      rotated: true,
    });
    render(await AdminPage({ searchParams: Promise.resolve({}) }));
    expect(onboardingWizardSpy).toHaveBeenCalledTimes(1);
    const [props] = onboardingWizardSpy.mock.calls[0]!;
    expect(props.settings.pending_wizard_session_id).toBe(
      "33333333-3333-3333-3333-333333333333",
    );
  });

  test("forwards searchParams.step to OnboardingWizard", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: FRESH_SETTINGS,
      rotated: false,
    });
    render(
      await AdminPage({
        searchParams: Promise.resolve({ step: "2" }),
      }),
    );
    expect(onboardingWizardSpy).toHaveBeenCalledTimes(1);
    const [props] = onboardingWizardSpy.mock.calls[0]!;
    expect(props.searchParams.step).toBe("2");
  });

  test("calls requireAdmin/requireAdminIdentity before purgeAndRotateIfStale", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: FRESH_SETTINGS,
      rotated: false,
    });
    let adminCallIndex = -1;
    let purgeCallIndex = -1;
    let counter = 0;
    requireAdminIdentityMock.mockImplementation(async () => {
      adminCallIndex = counter++;
      return { email: "edweiss412@gmail.com" };
    });
    purgeAndRotateIfStaleMock.mockImplementation(async () => {
      purgeCallIndex = counter++;
      return { settings: FRESH_SETTINGS, rotated: false };
    });
    render(await AdminPage({ searchParams: Promise.resolve({}) }));
    expect(adminCallIndex).toBeGreaterThanOrEqual(0);
    expect(purgeCallIndex).toBeGreaterThan(adminCallIndex);
  });
});
