// @vitest-environment jsdom
/**
 * tests/components/admin/onboardingTopBar.test.tsx
 *
 * Pins the slim first-run admin bar (<OnboardingTopBar>): the admin identity +
 * POST sign-out it renders, the empty-email guard, and the email-clamp class
 * contract. The clamp assertion is a followup (E-class) fix: `truncate` +
 * `max-w-48` are inert on a bare `inline` box (max-width does not apply to a
 * non-replaced inline element), so the span must be `inline-block` for a long
 * Workspace address to ellipsize instead of growing the bar.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { OnboardingTopBar } from "@/components/admin/nav/OnboardingTopBar";

afterEach(cleanup);

describe("OnboardingTopBar", () => {
  test("renders the admin email and a POST sign-out form to /auth/sign-out", () => {
    const q = render(<OnboardingTopBar email="admin@example.test" />);
    expect(q.getByText("admin@example.test")).not.toBeNull();
    const form = q.getByTestId("onboarding-signout-form");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/auth/sign-out");
  });

  test("hides the email span entirely when email is empty/whitespace (guard condition)", () => {
    const q = render(<OnboardingTopBar email="   " />);
    expect(q.queryByText(/@/)).toBeNull();
    // the bar still renders its sign-out affordance — only the identity is dropped
    expect(q.getByTestId("onboarding-signout-form")).not.toBeNull();
  });

  test("the email span is inline-block + truncate + max-w-48 so a long email clamps", () => {
    const q = render(
      <OnboardingTopBar email="a-very-long-workspace-admin-address@some-long-domain.example.test" />,
    );
    const span = q.getByText(/@/);
    // `truncate` (overflow-hidden + ellipsis) and `max-w-48` only take effect on a
    // block / inline-block box; on a bare `inline` span max-width is ignored.
    expect(span.className).toContain("inline-block");
    expect(span.className).toContain("truncate");
    expect(span.className).toContain("max-w-48");
    // and it must NOT carry the inert bare-`inline` display utility
    expect(span.className).not.toMatch(/(?:^|\s)sm:inline(?:\s|$)/);
  });
});
