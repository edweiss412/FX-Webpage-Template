// @vitest-environment jsdom
/**
 * tests/components/RevokeRowButton.test.tsx (M9 C9 R8 regression)
 *
 * R8 MEDIUM: a Server Action returning last_admin_lockout (or any
 * non-ok terminal result) does NOT revalidate the page, so the
 * client island stays mounted. The component must reset its local
 * `resolving` state to `idle` on a non-ok result; otherwise the
 * Revoking… label + disabled Confirm + disabled Cancel persist and
 * Doug has no escape short of reloading.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

// Stable mock of the Server Action; the test controls the resolved
// value per case.
const mockState = vi.hoisted(() => ({
  nextResult: { kind: "ok" } as
    | { kind: "ok" }
    | { kind: "last_admin_lockout"; email: string }
    | { kind: "invalid_email" },
}));

vi.mock("@/app/admin/settings/admins/actions", () => ({
  revokeAdminAction: async () => mockState.nextResult,
}));

import { RevokeRowButton } from "@/app/admin/settings/admins/RevokeRowButton";

beforeEach(() => {
  mockState.nextResult = { kind: "ok" };
});

afterEach(() => {
  cleanup();
});

describe("RevokeRowButton — R8 MEDIUM lockout UI reset", () => {
  it("R8 fix: last_admin_lockout result returns Cancel/Revoke to idle (not stuck in Revoking…)", async () => {
    mockState.nextResult = { kind: "last_admin_lockout", email: "lonely@example.com" };
    const { getByTestId, queryByTestId } = render(
      <RevokeRowButton email="lonely@example.com" disabled={false} />,
    );

    // Tap Revoke → confirm row appears.
    fireEvent.click(getByTestId("admin-allowlist-revoke-button"));
    expect(getByTestId("admin-allowlist-revoke-confirm-row")).not.toBeNull();

    // Tap Confirm revoke → form submits to mocked action.
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-revoke-confirm-button"));
    });

    // After action resolves, the lockout message renders AND the
    // confirm row unmounts (state back to idle so Doug can retry or
    // dismiss). Pre-R8 the component stayed in resolving with the
    // Revoking… label and disabled controls.
    await waitFor(() => {
      expect(queryByTestId("admin-allowlist-revoke-confirm-row")).toBeNull();
    });
    expect(getByTestId("admin-allowlist-revoke-button").textContent?.trim()).toBe("Revoke");
    expect(getByTestId("admin-allowlist-lockout-error").textContent ?? "").toContain(
      "last administrator",
    );
  });

  it("R8 fix: invalid_email result also returns to idle (any non-ok terminal result)", async () => {
    mockState.nextResult = { kind: "invalid_email" };
    const { getByTestId, queryByTestId } = render(
      <RevokeRowButton email="x@example.com" disabled={false} />,
    );
    fireEvent.click(getByTestId("admin-allowlist-revoke-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-revoke-confirm-button"));
    });
    await waitFor(() => {
      expect(queryByTestId("admin-allowlist-revoke-confirm-row")).toBeNull();
    });
    expect(getByTestId("admin-allowlist-revoke-button").textContent?.trim()).toBe("Revoke");
  });
});
