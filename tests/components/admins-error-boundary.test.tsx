// @vitest-environment jsdom
/**
 * tests/components/admins-error-boundary.test.tsx (M9 final review fix)
 *
 * Pins the route-segment error boundary at
 * `app/admin/settings/admins/error.tsx`. When listAdminEmails() throws
 * AdminEmailsInfraError, Doug MUST see a cataloged retryable message
 * instead of Next.js's generic error page.
 *
 * Both AdminEmailsInfraError and unknown throws render the same
 * ADMIN_EMAIL_LIST_FAILED catalog copy — the message ("can't load
 * the administrator list right now") fits both classes, and
 * distinguishing them in user-facing text would leak implementation
 * detail. Operator-facing distinction lives in server logs + the
 * client console.error.
 *
 * Both branches expose a Retry button wired to Next's reset() callback.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import AdminsPageError from "@/app/admin/settings/admins/error";
import { AdminEmailsInfraError } from "@/lib/data/adminEmails";

afterEach(() => {
  cleanup();
});

describe("admins/error.tsx — M9 final-review fix", () => {
  it("renders the cataloged ADMIN_EMAIL_LIST_FAILED message when AdminEmailsInfraError is thrown", () => {
    const err = new AdminEmailsInfraError("simulated RLS denial on admin_emails SELECT");
    const reset = vi.fn();
    const { getByTestId } = render(<AdminsPageError error={err} reset={reset} />);
    const boundary = getByTestId("admin-allowlist-error-boundary");
    expect(boundary.textContent).toContain("can't load the administrator list");
  });

  it("renders the same cataloged message for non-AdminEmailsInfraError throws (defense in depth)", () => {
    const err = new Error("unexpected generic error");
    const reset = vi.fn();
    const { getByTestId } = render(<AdminsPageError error={err} reset={reset} />);
    const boundary = getByTestId("admin-allowlist-error-boundary");
    // Same ADMIN_EMAIL_LIST_FAILED copy as the infra branch — the
    // message fits both classes and avoids leaking implementation
    // detail in user-facing text.
    expect(boundary.textContent).toContain("can't load the administrator list");
  });

  it("Retry button is wired to Next's reset() callback", () => {
    const err = new AdminEmailsInfraError("rls denial");
    const reset = vi.fn();
    const { getByTestId } = render(<AdminsPageError error={err} reset={reset} />);
    fireEvent.click(getByTestId("admin-allowlist-error-retry"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("error boundary uses role='alert' so screen readers announce the failure", () => {
    const err = new AdminEmailsInfraError("rls denial");
    const reset = vi.fn();
    const { getByTestId } = render(<AdminsPageError error={err} reset={reset} />);
    expect(getByTestId("admin-allowlist-error-boundary").getAttribute("role")).toBe("alert");
  });
});
