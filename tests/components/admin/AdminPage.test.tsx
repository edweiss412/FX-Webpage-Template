// @vitest-environment jsdom
/**
 * tests/components/admin/AdminPage.test.tsx
 * (M10 §B Task 10.1 §B — Phase 1 + Phase 2 dispatcher)
 *
 * Pins the dispatch contract of /admin:
 *
 * Precedence (top-down):
 *   1. settings.pending_wizard_session_id !== null →
 *      query wizard_finalize_checkpoints and branch:
 *        - 'in_progress'                       → <FinalizeInProgress />
 *        - 'all_batches_complete' (fresh < 24h) → <ReadyToPublish />
 *        - 'all_batches_complete' (stale ≥ 24h) → <StaleReadyToPublish />
 *        - 'final_cas_done'                    → Dashboard (defensive)
 *        - null                                → <OnboardingWizard />
 *   2. settings.watched_folder_id === null     → <OnboardingWizard />
 *   3. otherwise                                → Dashboard stub
 *
 * Fresh-settings invariant (spec §9.0): result.settings (post-mutation)
 * reaches the dispatcher; never a pre-call capture.
 *
 * Infra-error guard: if readFinalizeCheckpoint returns an infra_error,
 * render the cataloged infra-error placeholder (no raw codes).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";

const purgeAndRotateIfStaleMock = vi.fn();
const requireAdminIdentityMock = vi.fn();
const readFinalizeCheckpointMock = vi.fn();
const onboardingWizardSpy = vi.fn();
const readAppSettingsRowMock = vi.fn();

vi.mock("@/lib/onboarding/sessionLifecycle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding/sessionLifecycle")>(
    "@/lib/onboarding/sessionLifecycle",
  );
  return {
    ...actual,
    purgeAndRotateIfStale: (...args: unknown[]) => purgeAndRotateIfStaleMock(...args),
  };
});

// nav-perf phase 1 (A2): AdminPage now reads app_settings via readAppSettingsRow
// to gate the purgeAndRotateIfStale tx. Default the cheap read to infra_error so
// the gate FALLS BACK to always calling purgeAndRotateIfStale — preserving these
// routing tests' purge-driven settings. The skip path (value + null pending) is
// covered by tests/app/admin/purgeGate.test.ts.
vi.mock("@/lib/appSettings/readAppSettingsRow", () => ({
  readAppSettingsRow: (...args: unknown[]) => readAppSettingsRowMock(...args),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: () => requireAdminIdentityMock(),
  requireAdmin: () => requireAdminIdentityMock(),
}));

vi.mock("@/app/admin/_finalizeCheckpoint", () => ({
  readFinalizeCheckpoint: (sessionId: string) => readFinalizeCheckpointMock(sessionId),
  isInfraError: (result: unknown): result is { kind: "infra_error"; message: string } =>
    result !== null &&
    typeof result === "object" &&
    "kind" in (result as Record<string, unknown>) &&
    (result as Record<string, unknown>).kind === "infra_error",
  isCheckpointStale: (lastProcessedAt: string | null, now: Date): boolean => {
    if (!lastProcessedAt) return false;
    const parsed = Date.parse(lastProcessedAt);
    if (Number.isNaN(parsed)) return false;
    return now.getTime() - parsed > 24 * 3600 * 1000;
  },
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

vi.mock("@/components/admin/FinalizeInProgress", () => ({
  FinalizeInProgress: (props: {
    sessionId: string;
    batchesCompleted: number;
    lastProcessedAt?: string;
  }) => (
    <div
      data-testid="admin-finalize-in-progress-spy"
      data-session={props.sessionId}
      data-batches={String(props.batchesCompleted)}
      data-last-at={props.lastProcessedAt ?? ""}
    />
  ),
}));

vi.mock("@/components/admin/ReadyToPublish", () => ({
  ReadyToPublish: (props: { sessionId: string }) => (
    <div data-testid="admin-ready-to-publish-spy" data-session={props.sessionId} />
  ),
}));

vi.mock("@/components/admin/StaleReadyToPublish", () => ({
  StaleReadyToPublish: (props: { sessionId: string }) => (
    <div data-testid="admin-stale-ready-to-publish-spy" data-session={props.sessionId} />
  ),
}));

vi.mock("@/components/admin/Dashboard", () => ({
  Dashboard: () => <div data-testid="admin-dashboard-placeholder" />,
}));
// M12.3: AlertBanner moved into DashboardWithHeader (app/admin/page.tsx). It's an
// async server component (self-fetches via cookies/Supabase) and throws outside a
// request scope — stub it here; the banner is covered by tests/components/AlertBanner.test.tsx.
vi.mock("@/components/admin/AlertBanner", () => ({
  AlertBanner: () => <div data-testid="admin-alert-banner-stub" />,
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
  readFinalizeCheckpointMock.mockReset();
  onboardingWizardSpy.mockReset();
  readAppSettingsRowMock.mockReset();
  requireAdminIdentityMock.mockResolvedValue({ email: "edweiss412@gmail.com" });
  readFinalizeCheckpointMock.mockResolvedValue(null);
  // Default: cheap read degrades → gate falls back to purgeAndRotateIfStale (today's behavior).
  readAppSettingsRowMock.mockResolvedValue({ kind: "infra_error" });
});

afterEach(() => cleanup());

describe("AdminPage Phase 2 routing", () => {
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
    expect(queryByTestId("admin-finalize-in-progress-spy")).toBeNull();
    expect(readFinalizeCheckpointMock).not.toHaveBeenCalled();
  });

  test("settled (watched_folder_id non-null, pending NULL) renders Dashboard placeholder", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: SETTLED_SETTINGS,
      rotated: false,
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    // Dashboard is mocked in this test file; the mock renders a marker
    // testid so we don't depend on the real Supabase fetch path here.
    expect(getByTestId("admin-dashboard-placeholder")).toBeTruthy();
    expect(queryByTestId("onboarding-wizard-spy")).toBeNull();
    expect(readFinalizeCheckpointMock).not.toHaveBeenCalled();
  });

  test("wizard mid-flight (pending non-null) + no checkpoint → OnboardingWizard", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
    });
    readFinalizeCheckpointMock.mockResolvedValue(null);
    const { getByTestId } = render(await AdminPage({ searchParams: Promise.resolve({}) }));
    expect(getByTestId("onboarding-wizard-spy")).toBeTruthy();
    expect(getByTestId("onboarding-wizard-spy").dataset.pendingSession).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(readFinalizeCheckpointMock).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  test("wizard mid-flight + checkpoint status='in_progress' → FinalizeInProgress", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
    });
    readFinalizeCheckpointMock.mockResolvedValue({
      status: "in_progress",
      batches_completed: 100,
      last_processed_drive_file_id: "drive-100",
      last_processed_at: new Date().toISOString(),
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("admin-finalize-in-progress-spy").dataset.batches).toBe("100");
    expect(queryByTestId("onboarding-wizard-spy")).toBeNull();
  });

  test("wizard mid-flight + checkpoint status='all_batches_complete' fresh → ReadyToPublish", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
    });
    readFinalizeCheckpointMock.mockResolvedValue({
      status: "all_batches_complete",
      batches_completed: 50,
      last_processed_drive_file_id: "drive-50",
      last_processed_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("admin-ready-to-publish-spy")).toBeTruthy();
    expect(queryByTestId("admin-stale-ready-to-publish-spy")).toBeNull();
  });

  test("wizard mid-flight + checkpoint status='all_batches_complete' stale (≥24h) → StaleReadyToPublish", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
    });
    readFinalizeCheckpointMock.mockResolvedValue({
      status: "all_batches_complete",
      batches_completed: 50,
      last_processed_drive_file_id: "drive-50",
      last_processed_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("admin-stale-ready-to-publish-spy")).toBeTruthy();
    expect(queryByTestId("admin-ready-to-publish-spy")).toBeNull();
  });

  test("wizard mid-flight + checkpoint status='final_cas_done' (defensive) → Dashboard", async () => {
    // F-Codex-3 fix: the dispatcher MUST explicitly return Dashboard when
    // it observes a final_cas_done checkpoint with a still-non-null
    // pending_wizard_session_id (an inconsistent snapshot — Phase D
    // atomically clears the session id, so this state should be
    // unreachable in practice, but the dispatcher renders Dashboard
    // defensively rather than strand the operator on the wizard).
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
    });
    readFinalizeCheckpointMock.mockResolvedValue({
      status: "final_cas_done",
      batches_completed: 100,
      last_processed_drive_file_id: "drive-100",
      last_processed_at: new Date().toISOString(),
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("admin-dashboard-placeholder")).toBeTruthy();
    expect(queryByTestId("onboarding-wizard-spy")).toBeNull();
    expect(queryByTestId("admin-finalize-in-progress-spy")).toBeNull();
    expect(queryByTestId("admin-ready-to-publish-spy")).toBeNull();
    expect(queryByTestId("admin-stale-ready-to-publish-spy")).toBeNull();
  });

  test("re-run-setup mid-flight (watched_folder_id non-null AND pending non-null) + no checkpoint → OnboardingWizard", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: RE_RUN_SETUP_SETTINGS,
      rotated: false,
    });
    readFinalizeCheckpointMock.mockResolvedValue(null);
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("onboarding-wizard-spy")).toBeTruthy();
    expect(queryByTestId("admin-dashboard-placeholder")).toBeNull();
  });

  test("infra error from checkpoint reader → cataloged infra-error placeholder", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: WIZARD_IN_FLIGHT_SETTINGS,
      rotated: false,
    });
    readFinalizeCheckpointMock.mockResolvedValue({
      kind: "infra_error",
      message: "Supabase connection failed",
    });
    const { getByTestId, queryByTestId } = render(
      await AdminPage({ searchParams: Promise.resolve({}) }),
    );
    expect(getByTestId("admin-checkpoint-infra-error")).toBeTruthy();
    expect(queryByTestId("onboarding-wizard-spy")).toBeNull();
    expect(queryByTestId("admin-finalize-in-progress-spy")).toBeNull();
  });

  test("fresh-settings invariant: post-rotation settings reach OnboardingWizard, not pre-call values", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: ROTATED_SETTINGS,
      rotated: true,
    });
    readFinalizeCheckpointMock.mockResolvedValue(null);
    render(await AdminPage({ searchParams: Promise.resolve({}) }));
    expect(onboardingWizardSpy).toHaveBeenCalledTimes(1);
    const [props] = onboardingWizardSpy.mock.calls[0]! as [{ settings: AppSettingsRow }];
    expect(props.settings.pending_wizard_session_id).toBe("33333333-3333-3333-3333-333333333333");
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
    const [props] = onboardingWizardSpy.mock.calls[0]! as [{ searchParams: { step?: string } }];
    expect(props.searchParams.step).toBe("2");
  });

  test("calls requireAdmin/requireAdminIdentity before purgeAndRotateIfStale", async () => {
    purgeAndRotateIfStaleMock.mockResolvedValue({
      settings: FRESH_SETTINGS,
      rotated: false,
    });
    let adminCallIndex = -1;
    let readCallIndex = -1;
    let purgeCallIndex = -1;
    let counter = 0;
    requireAdminIdentityMock.mockImplementation(async () => {
      adminCallIndex = counter++;
      return { email: "edweiss412@gmail.com" };
    });
    readAppSettingsRowMock.mockImplementation(async () => {
      readCallIndex = counter++;
      return { kind: "infra_error" }; // forces fallback to purgeAndRotateIfStale
    });
    purgeAndRotateIfStaleMock.mockImplementation(async () => {
      purgeCallIndex = counter++;
      return { settings: FRESH_SETTINGS, rotated: false };
    });
    render(await AdminPage({ searchParams: Promise.resolve({}) }));
    // Auth gate runs before ANY data access (the cheap read AND the purge tx).
    expect(adminCallIndex).toBeGreaterThanOrEqual(0);
    expect(readCallIndex).toBeGreaterThan(adminCallIndex);
    expect(purgeCallIndex).toBeGreaterThan(adminCallIndex);
  });
});
