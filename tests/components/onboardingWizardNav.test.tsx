// @vitest-environment jsdom
/**
 * tests/components/onboardingWizardNav.test.tsx
 * (Onboarding UX polish — Task 5 step navigation + Task 6 Step-3 width/grid)
 *
 * Pins the wizard navigation chrome added in the UX-polish pass:
 *   - Task 5: a non-destructive "Back" <Link> per step (none on step 1; step 2
 *     → ?step=1; step 3 → ?step=2), and clickable stepper pills for every
 *     already-visited step (n ≤ current → a real <Link>; a not-yet-reached pill
 *     stays a plain, hrefless <span>).
 *   - Task 5 SAFETY: navigating back to ?step=2 must NOT re-trigger the scan.
 *     Step2Verify fires its scan POST only from the form onSubmit handler, never
 *     on mount, so simply rendering the ?step=2 body issues no fetch. The test
 *     spies global.fetch and asserts zero calls after mount.
 *   - Task 6: Step 3 widens the wizard container on desktop (lg:max-w-6xl) while
 *     Steps 1-2 stay narrow (max-w-2xl), and the per-sheet review cards render in
 *     the responsive grid (<ul data-testid="wizard-step3-card-grid">), with the
 *     "Needs your attention" group as a full-width sibling above the grid.
 *
 * OnboardingWizard is an async Server Component — tests await the function and
 * render its JSX through RTL. Step2Verify (the ?step=2 body) calls useRouter(),
 * so next/navigation is stubbed at the file level (no app-router in jsdom).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { AppSettingsRow } from "@/lib/onboarding/sessionLifecycle";
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";

// Step2Verify (?step=2) + Step3Review children call useRouter()/usePathname();
// jsdom has no app-router context, so stub them at the file level.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "fxav-sync@fxav-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
});

// pending_wizard_session_id = null → Step 3 renders the no-session empty state
// (no Supabase fetch). The nav chrome (stepper + Back) is part of the wizard
// shell, so it renders on every step regardless of the step body.
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

const WSID = "11111111-2222-4333-8444-555555555555";

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (savedEnv === undefined) {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  } else {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = savedEnv;
  }
});

describe("OnboardingWizard navigation chrome (Task 5)", () => {
  test("Step 3 renders a Back link pointing at ?step=2", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "3" } }),
    );
    const back = getByTestId("wizard-back-link") as HTMLAnchorElement;
    expect(back.tagName).toBe("A");
    expect(back.getAttribute("href")).toBe("/admin?step=2");
  });

  test("Step 2 renders a Back link pointing at ?step=1", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "2" } }),
    );
    expect((getByTestId("wizard-back-link") as HTMLAnchorElement).getAttribute("href")).toBe(
      "/admin?step=1",
    );
  });

  test("Step 1 renders NO Back link (there is nowhere to go back to)", async () => {
    const { queryByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    expect(queryByTestId("wizard-back-link")).toBeNull();
  });

  test("visited-step pills are real <Link>s to their ?step= (n ≤ current)", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "3" } }),
    );
    const pill1 = getByTestId("wizard-step-indicator-1");
    const pill2 = getByTestId("wizard-step-indicator-2");
    expect(pill1.tagName).toBe("A");
    expect(pill1.getAttribute("href")).toBe("/admin?step=1");
    expect(pill2.tagName).toBe("A");
    expect(pill2.getAttribute("href")).toBe("/admin?step=2");
  });

  test("a not-yet-reached pill stays plain, non-clickable text (no href)", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }),
    );
    // At step 1, pills 2 and 3 are unreached → plain <span>, never a link.
    const pill2 = getByTestId("wizard-step-indicator-2");
    const pill3 = getByTestId("wizard-step-indicator-3");
    expect(pill2.tagName).not.toBe("A");
    expect(pill2.getAttribute("href")).toBeNull();
    expect(pill3.tagName).not.toBe("A");
    expect(pill3.getAttribute("href")).toBeNull();
    // The current pill (step 1) IS reachable and carries aria-current.
    const pill1 = getByTestId("wizard-step-indicator-1");
    expect(pill1.tagName).toBe("A");
    expect(pill1.getAttribute("aria-current")).toBe("step");
  });

  test("SAFETY: rendering the ?step=2 body fires NO scan POST (Back cannot re-scan)", async () => {
    // The #1 risk (plan Watchpoint, Task 5): navigating back to Step 2 must not
    // re-trigger the folder scan or orphan the wizard session. Step2Verify's
    // scan fetch lives entirely inside the form onSubmit handler — there is no
    // mount-time fire — so simply rendering ?step=2 issues no network call.
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    render(await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "2" } }));
    // Flush any mount-effect microtasks before asserting.
    await Promise.resolve();

    // The Step 2 verify form is mounted (read-only) and, crucially, NO scan
    // request was issued on mount.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("OnboardingWizard Step-3 width + card grid (Task 6)", () => {
  test("Step 3 widens the wizard container on desktop (lg:max-w-6xl)", async () => {
    const { getByTestId } = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "3" } }),
    );
    expect(getByTestId("onboarding-wizard").className).toContain("lg:max-w-6xl");
  });

  test("Steps 1-2 keep the narrow container (no lg:max-w-6xl)", async () => {
    const step1 = render(await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: {} }));
    expect(step1.getByTestId("onboarding-wizard").className).not.toContain("lg:max-w-6xl");
    expect(step1.getByTestId("onboarding-wizard").className).toContain("max-w-2xl");
    cleanup();
    const step2 = render(
      await OnboardingWizard({ settings: FRESH_SETTINGS, searchParams: { step: "2" } }),
    );
    expect(step2.getByTestId("onboarding-wizard").className).not.toContain("lg:max-w-6xl");
  });

  test("the Step-3 card list uses the responsive grid (1 → 2 → 3 cols), items-start", () => {
    // Render Step3Review directly with an informational row so the grid renders
    // without depending on Step3SheetCard internals (owned by a parallel task).
    const rows: Step3Row[] = [
      { driveFileId: "df-skip", driveFileName: "Reference.pdf", status: "skipped_non_sheet" },
    ];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const grid = getByTestId("wizard-step3-card-grid");
    const cls = grid.className;
    expect(cls).toContain("grid");
    expect(cls).toContain("grid-cols-1");
    expect(cls).toContain("lg:grid-cols-2");
    expect(cls).toContain("xl:grid-cols-3");
    // Tailwind v4: explicit items-start so a short card sizes to its own content
    // height instead of stretching to the tallest in its row.
    expect(cls).toContain("items-start");
  });

  test("the 'Needs your attention' group is a full-width sibling ABOVE the grid (never a grid cell)", () => {
    const rows: Step3Row[] = [
      { driveFileId: "df-skip", driveFileName: "Reference.pdf", status: "skipped_non_sheet" },
      {
        driveFileId: "df-hf",
        driveFileName: "Broken.gsheet",
        status: "hard_failed",
        pendingIngestionId: "ing-1",
        errorCode: "PARSE_HARD_FAIL",
      },
    ];
    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={rows} />);
    const needsAttention = getByTestId("wizard-step3-needs-attention");
    const grid = getByTestId("wizard-step3-card-grid");
    // The blocking group is NOT nested inside the card grid.
    expect(within(grid).queryByTestId("wizard-step3-needs-attention")).toBeNull();
    // …and it renders BEFORE the grid in document order (above it).
    expect(
      needsAttention.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
