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
import { existsSync } from "node:fs";
import { join } from "node:path";

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

  it("R11 P1 fix: escape Link is present so retry-loop isn't a trap", () => {
    const err = new AdminEmailsInfraError("persistent rls denial");
    const reset = vi.fn();
    const { getByTestId } = render(<AdminsPageError error={err} reset={reset} />);
    const back = getByTestId("admin-allowlist-error-back");
    expect(back.tagName.toLowerCase()).toBe("a");
    // R12 fix: must target an EXISTING route (R11's original `/admin`
    // 404'd because the route tree has no `app/admin/page.tsx`).
    // /admin/dev is the only /admin/* page that doesn't depend on
    // admin_emails and therefore can't re-fail the same way.
    // R15: target is /admin (the production-safe landing added in
    // R15; R12-14 used /admin/dev which is build-gated out of prod).
    expect(back.getAttribute("href")).toBe("/admin");
    expect(back.textContent?.trim()).toBe("Back to admin");
  });

  it("R15 fix: escape Link target is the production-safe /admin landing", () => {
    // Compile-time route-reachability check: assert the always-built
    // landing exists. /admin/dev was build-gated, so R15 added the
    // unconditional /admin landing at app/admin/page.tsx.
    const adminLandingPage = join(process.cwd(), "app/admin/page.tsx");
    expect(existsSync(adminLandingPage)).toBe(true);
  });

  it("R11 P2 fix: Retry button starts in idle state with 'Retry' label + not disabled", () => {
    const err = new AdminEmailsInfraError("rls denial");
    const reset = vi.fn();
    const { getByTestId } = render(<AdminsPageError error={err} reset={reset} />);
    const retry = getByTestId("admin-allowlist-error-retry") as HTMLButtonElement;
    expect(retry.textContent?.trim()).toBe("Retry");
    expect(retry.disabled).toBe(false);
    expect(retry.getAttribute("aria-busy")).toBe("false");
  });

  it("R11 P2 fix: escalation sub-line is rendered (operator visibility cue)", () => {
    const err = new AdminEmailsInfraError("rls denial");
    const reset = vi.fn();
    const { getByTestId } = render(<AdminsPageError error={err} reset={reset} />);
    const boundary = getByTestId("admin-allowlist-error-boundary");
    expect(boundary.textContent).toContain("server-side log");
  });
});
