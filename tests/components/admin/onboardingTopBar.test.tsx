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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { OnboardingTopBar } from "@/components/admin/nav/OnboardingTopBar";
import type { HealthStatus } from "@/lib/admin/healthRollup";

// <NotifBell> (rendered when a bellCount prop is supplied) is a client island:
// useBellBadge reads usePathname and, in effects, POSTs a realtime token. Mock
// the pathname and stub fetch so the badge mounts cleanly under jsdom (mirrors
// tests/components/admin/nav/AdminNav.test.tsx).
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  test("renders the <AppHealthIndicator> when a healthRollup is provided (nothing goes dark during onboarding)", () => {
    const degraded: HealthStatus = {
      kind: "degraded",
      count: 1,
      summaries: [{ text: "A push notification failed a security check.", count: 1 }],
      overflowCount: 0,
    };
    const q = render(
      <OnboardingTopBar email="admin@example.test" healthRollup={degraded} isDeveloper={false} />,
    );
    expect(q.getByTestId("app-health-indicator")).not.toBeNull();
    expect(q.getByTestId("app-health-dot-degraded")).not.toBeNull();
  });

  test("omits the indicator when no healthRollup is provided (guard)", () => {
    const q = render(<OnboardingTopBar email="admin@example.test" />);
    expect(q.queryByTestId("app-health-indicator")).toBeNull();
  });

  test("NEVER renders <NotifBell> during onboarding — even with a healthRollup (owner decision 2026-07-06: the bell is suppressed while the nav tabs are, and only the health indicator stays)", () => {
    const degraded: HealthStatus = {
      kind: "degraded",
      count: 1,
      summaries: [{ text: "A push notification failed a security check.", count: 1 }],
      overflowCount: 0,
    };
    const q = render(
      <OnboardingTopBar email="admin@example.test" healthRollup={degraded} isDeveloper={false} />,
    );
    // Bell is gone from the setup chrome…
    expect(q.queryByTestId("admin-notif-bell")).toBeNull();
    expect(q.queryByTestId("admin-notif-bell-degraded")).toBeNull();
    // …but the app-health indicator still renders (a health fault must never be dark).
    expect(q.getByTestId("app-health-indicator")).not.toBeNull();
  });

  test("omits the bell entirely in the minimal render (guard)", () => {
    const q = render(<OnboardingTopBar email="admin@example.test" />);
    expect(q.queryByTestId("admin-notif-bell")).toBeNull();
    expect(q.queryByTestId("admin-notif-bell-degraded")).toBeNull();
  });
});
