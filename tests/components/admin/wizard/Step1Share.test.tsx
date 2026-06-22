// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step1Share.test.tsx (M10 §B Task 10.2 / Phase 1)
 *
 * Pins the public contract of <Step1Share> — the wizard step that asks
 * Doug to share his Drive folder with the service-account email and
 * confirm by clicking advance. Spec §9.0 step 1 governs the microcopy
 * verbatim; this test pins the four numbered prompts plus the copy
 * affordance + disclosure + advance button.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Step1Share } from "@/components/admin/wizard/Step1Share";

const SERVICE_ACCOUNT_EMAIL = "fxav-sync@fxav-project.iam.gserviceaccount.com";

const clipboardWriteText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  clipboardWriteText.mockReset();
  clipboardWriteText.mockResolvedValue();
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
});

afterEach(() => cleanup());

describe("Step1Share", () => {
  test("renders the spec §9.0 step 1 four numbered prompts verbatim", () => {
    const { container } = render(<Step1Share serviceAccountEmail={SERVICE_ACCOUNT_EMAIL} />);
    const body = container.textContent ?? "";
    expect(body).toContain("In Google Drive, find the folder where you keep your show sheets");
    expect(body).toContain('Click "Share" on the folder');
    expect(body).toContain("Paste this email and give it Viewer access");
    expect(body).toContain('Come back here and click "I’ve shared the folder."');
  });

  test("renders the service-account email as visible text inside the step body", () => {
    const { getByTestId } = render(<Step1Share serviceAccountEmail={SERVICE_ACCOUNT_EMAIL} />);
    expect(getByTestId("wizard-step1-service-account-email").textContent).toContain(
      SERVICE_ACCOUNT_EMAIL,
    );
  });

  test("copy button calls navigator.clipboard.writeText with the email", async () => {
    const { getByTestId } = render(<Step1Share serviceAccountEmail={SERVICE_ACCOUNT_EMAIL} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step1-copy-email-button"));
    });
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));
    expect(clipboardWriteText).toHaveBeenCalledWith(SERVICE_ACCOUNT_EMAIL);
  });

  test("copy button shows the copied-confirmation after click", async () => {
    const { getByTestId } = render(<Step1Share serviceAccountEmail={SERVICE_ACCOUNT_EMAIL} />);
    await act(async () => {
      fireEvent.click(getByTestId("wizard-step1-copy-email-button"));
    });
    await waitFor(() => {
      expect(getByTestId("wizard-step1-copy-feedback").textContent ?? "").toContain("Copied");
    });
  });

  test("includes the 'What's this email?' disclosure", () => {
    const { getByTestId } = render(<Step1Share serviceAccountEmail={SERVICE_ACCOUNT_EMAIL} />);
    const summary = getByTestId("wizard-step1-explainer-summary");
    expect(summary.textContent ?? "").toMatch(/What['’]s this email/);
  });

  test("advance button is a link to /admin?step=2", () => {
    const { getByTestId } = render(<Step1Share serviceAccountEmail={SERVICE_ACCOUNT_EMAIL} />);
    const advance = getByTestId("wizard-step1-advance");
    expect(advance.getAttribute("href")).toBe("/admin?step=2");
    expect(advance.textContent ?? "").toContain("I’ve shared the folder");
  });
});
