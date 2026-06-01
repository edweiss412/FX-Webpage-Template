// @vitest-environment jsdom
/**
 * tests/components/adminWriteFailSurfaces.test.tsx (M12.2 B1 Task 6.4)
 *
 * All THREE admin write surfaces render the SAME cataloged inline
 * write-fail copy (ADMIN_EMAIL_WRITE_FAILED, role="alert") when their
 * Server Action returns { kind: "infra_error" }:
 *   - AddAdminForm        (add)
 *   - RevokeRowButton     (revoke)
 *   - ReAddRowButton      (re-add — previously DISCARDED its result, so
 *                          a transient re-add fault was invisible)
 *
 * Asserts the rendered text EQUALS getRequiredDougFacing(...) — never a
 * hardcoded literal — so the copy stays catalog-sourced (invariant 5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import { getRequiredDougFacing } from "@/lib/messages/lookup";

const mockState = vi.hoisted(() => ({
  addResult: { kind: "ok" } as { kind: string; email?: string },
  revokeResult: { kind: "ok" } as { kind: string; email?: string },
}));

vi.mock("@/app/admin/settings/admins/actions", () => ({
  addAdminAction: async () => mockState.addResult,
  revokeAdminAction: async () => mockState.revokeResult,
}));

import { AddAdminForm } from "@/app/admin/settings/admins/AddAdminForm";
import { RevokeRowButton } from "@/app/admin/settings/admins/RevokeRowButton";
import { ReAddRowButton } from "@/app/admin/settings/admins/ReAddRowButton";

const WRITE_FAIL = getRequiredDougFacing("ADMIN_EMAIL_WRITE_FAILED");

beforeEach(() => {
  mockState.addResult = { kind: "ok" };
  mockState.revokeResult = { kind: "ok" };
});

afterEach(() => {
  cleanup();
});

describe("admin write surfaces — inline infra_error copy (Task 6.4)", () => {
  it("AddAdminForm renders cataloged ADMIN_EMAIL_WRITE_FAILED on infra_error", async () => {
    mockState.addResult = { kind: "infra_error" };
    const { getByTestId, container } = render(<AddAdminForm />);
    await act(async () => {
      fireEvent.submit(getByTestId("admin-allowlist-add-form"));
    });
    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(WRITE_FAIL);
    });
  });

  it("RevokeRowButton renders cataloged ADMIN_EMAIL_WRITE_FAILED on infra_error (idle return block)", async () => {
    mockState.revokeResult = { kind: "infra_error" };
    const { getByTestId, container } = render(
      <RevokeRowButton email="x@example.com" disabled={false} />,
    );
    fireEvent.click(getByTestId("admin-allowlist-revoke-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-revoke-confirm-button"));
    });
    await waitFor(() => {
      const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
      expect(alerts.some((a) => a.textContent?.includes(WRITE_FAIL))).toBe(true);
    });
  });

  it("ReAddRowButton renders cataloged ADMIN_EMAIL_WRITE_FAILED inline on infra_error (no longer discards result)", async () => {
    mockState.addResult = { kind: "infra_error" };
    const { getByTestId, container } = render(<ReAddRowButton email="x@example.com" />);
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-readd-row-button"));
    });
    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(WRITE_FAIL);
    });
  });

  it("all three surfaces render the SAME catalog copy (parity, not per-surface literals)", () => {
    // Sanity: the constant is non-empty so the .toContain assertions
    // above can't pass vacuously against an empty alert.
    expect(WRITE_FAIL.length).toBeGreaterThan(0);
  });
});
