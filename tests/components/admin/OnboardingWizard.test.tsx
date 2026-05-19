// @vitest-environment jsdom
/**
 * tests/components/admin/OnboardingWizard.test.tsx (M10 §B Task 10.2 / Phase 1)
 *
 * Pins the public contract of <OnboardingWizard>, the server-side wizard
 * shell that picks the current step from `settings` + URL `?step=N` and
 * renders the matching step body plus the wizard chrome (step indicator,
 * Start Over button).
 *
 * Phase 1 only ships Step 1; Step 2 and Step 3 render placeholder bodies
 * so the URL routing transitions exist before the real step components
 * land (Phase 2). When the service-account email cannot be loaded from
 * the environment, the wizard renders the §12.4-cataloged operator-error
 * copy instead of Step 1 — never a raw code (AGENTS.md §1.5).
 *
 * Server Component — tests await the async function and render its JSX
 * output through React Testing Library.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import { startOverServerAction } from "@/lib/onboarding/serverActions";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

// Step2Verify (rendered when ?step=2) uses useRouter() to call
// router.refresh() on the admin-log-only "superseded" outcome. jsdom
// has no app-router context, so we stub it here at the file level.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "fxav-sync@fxav-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
});

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

const WIZARD_IN_FLIGHT_SETTINGS: AppSettingsRow = {
  ...FRESH_SETTINGS,
  pending_wizard_session_id: "00000000-0000-0000-0000-000000000001",
  pending_wizard_session_at: new Date().toISOString(),
};

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
});

afterEach(() => {
  cleanup();
  if (savedEnv === undefined) {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  } else {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = savedEnv;
  }
});

describe("OnboardingWizard", () => {
  test("renders Step 1 by default when no ?step param is provided", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(getByTestId("wizard-step1")).toBeTruthy();
    expect(getByTestId("wizard-step1-eyebrow").textContent).toContain("Step 1 of 3");
  });

  test("passes the parsed service-account email into Step1Share", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(
      getByTestId("wizard-step1-service-account-email").textContent,
    ).toContain("fxav-sync@fxav-project.iam.gserviceaccount.com");
  });

  test("renders the Start Over form bound to startOverServerAction", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    const form = getByTestId("wizard-start-over-form") as HTMLFormElement;
    // React Server Actions surface as the same function reference passed
    // to the form `action` prop — pin the binding so a regression that
    // swapped in a no-op or the wrong action surfaces immediately.
    // RTL renders the form with a React-managed action; reflect into the
    // attributes that React assigns for inspection.
    // The data attribute is set by the component to make the binding
    // assertable without leaking server-action internals into the DOM.
    expect(form.dataset.action).toBe("startOverServerAction");
    // Sanity: the imported reference is present in the test runtime.
    expect(typeof startOverServerAction).toBe("function");
    // The visible button label.
    expect(getByTestId("wizard-start-over-button").textContent).toContain("Start over");
  });

  test("when ?step=2 is in the URL, renders the real Step2Verify component", async () => {
    const { getByTestId, queryByTestId } = render(
      await OnboardingWizard({
        settings: FRESH_SETTINGS,
        searchParams: { step: "2" },
      }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    // Step2Verify renders the folder URL input + verify-and-scan button.
    expect(getByTestId("wizard-step2-folder-url-input")).toBeTruthy();
    expect(getByTestId("wizard-step2-submit")).toBeTruthy();
  });

  test("when ?step=3 with no pending session, renders the no-session empty state", async () => {
    // FRESH_SETTINGS has pending_wizard_session_id = null — step 3 can't
    // fetch a manifest, so render the explanatory empty state instead of
    // hitting the Supabase fetch.
    const { getByTestId } = render(
      await OnboardingWizard({
        settings: FRESH_SETTINGS,
        searchParams: { step: "3" },
      }),
    );
    expect(getByTestId("wizard-step3-no-session").textContent ?? "").toMatch(
      /Nothing scanned yet/i,
    );
  });

  test("ignores an unknown ?step value and falls back to Step 1", async () => {
    const { getByTestId, queryByTestId } = render(
      await OnboardingWizard({
        settings: FRESH_SETTINGS,
        searchParams: { step: "banana" },
      }),
    );
    expect(getByTestId("wizard-step1")).toBeTruthy();
    expect(queryByTestId("wizard-step2-placeholder")).toBeNull();
  });

  test("renders Step 1 when wizard is mid-flight (pending_wizard_session_id non-null)", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({
        settings: WIZARD_IN_FLIGHT_SETTINGS,
        searchParams: {},
      }),
    );
    expect(getByTestId("wizard-step1")).toBeTruthy();
  });

  test("HIDES Start Over when watched_folder_id is non-null (re-run setup must route through /admin/settings)", async () => {
    // Per spec §9.0: "After onboarding succeeds the [pre-onboarding
    // 'Start over'] affordance disappears — restart goes through
    // `/admin/settings` instead." The destructive
    // startOverServerAction lacks the checkpoint-aware suppression
    // that rerunSetupServerAction has, so post-onboarding restarts
    // MUST flow through Re-run Setup so a stale tab cannot strand
    // published=false finalize rows.
    const reRunSettings: AppSettingsRow = {
      ...WIZARD_IN_FLIGHT_SETTINGS,
      watched_folder_id: "folder-abc",
      watched_folder_name: "Shows 2026",
      watched_folder_set_at: new Date().toISOString(),
    };
    const { queryByTestId, getByTestId } = render(
      await OnboardingWizard({ settings: reRunSettings, searchParams: {} }),
    );
    // Wizard itself still renders (Step 1).
    expect(getByTestId("wizard-step1")).toBeTruthy();
    // But Start Over must be absent.
    expect(queryByTestId("wizard-start-over-form")).toBeNull();
    expect(queryByTestId("wizard-start-over-button")).toBeNull();
  });

  test("HIDES Start Over on operator-error path when watched_folder_id is non-null", async () => {
    // Even when the env is broken, the post-onboarding restart path is
    // /admin/settings Re-run Setup. The unconditional purge form must
    // stay hidden.
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const reRunSettings: AppSettingsRow = {
      ...WIZARD_IN_FLIGHT_SETTINGS,
      watched_folder_id: "folder-abc",
    };
    const { queryByTestId } = render(
      await OnboardingWizard({ settings: reRunSettings, searchParams: {} }),
    );
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
    expect(queryByTestId("wizard-start-over-form")).toBeNull();
    expect(queryByTestId("wizard-start-over-button")).toBeNull();
  });

  test("when GOOGLE_SERVICE_ACCOUNT_JSON is missing, renders cataloged operator-error copy (no raw code)", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const { container, queryByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
    const body = container.textContent ?? "";
    const operatorErrorCopy =
      MESSAGE_CATALOG.ONBOARDING_OPERATOR_ERROR.dougFacing!;
    expect(body).toContain(operatorErrorCopy);
    // No raw code rendered.
    expect(body).not.toContain("ONBOARDING_OPERATOR_ERROR");
    // Start Over still reachable so the operator has a recovery path
    // even when the env is broken.
    expect(queryByTestId("wizard-start-over-button")).toBeTruthy();
  });

  test("when GOOGLE_SERVICE_ACCOUNT_JSON is malformed JSON, renders the same operator-error copy", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{not-valid-json";
    const { container, queryByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
    const body = container.textContent ?? "";
    expect(body).toContain(
      MESSAGE_CATALOG.ONBOARDING_OPERATOR_ERROR.dougFacing!,
    );
  });

  test("when client_email is missing from the service-account JSON, renders the operator-error copy", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ private_key: "x" });
    const { queryByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(queryByTestId("wizard-step1")).toBeNull();
    expect(queryByTestId("wizard-operator-error")).toBeTruthy();
  });
});
