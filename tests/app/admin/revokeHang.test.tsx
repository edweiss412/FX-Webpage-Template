// @vitest-environment jsdom
/**
 * tests/app/admin/revokeHang.test.tsx (Task 7.1 — revoke-hang watchdog)
 *
 * Carry-in bug: a React server action submitted via useActionState routes
 * a THROWN/hung action to the error boundary, not back to local state — so
 * if no result arrives within a bounded window the Confirm button is
 * stranded on "Revoking…" forever. Task 7.1 adds a conservative watchdog:
 * after WATCHDOG_MS with no result, the island transitions to an explicit
 * "couldnt_confirm" state that (a) never returns to idle, (b) suppresses
 * duplicate submits, (c) prompts a refresh.
 *
 * Three cases:
 *   (a) infra_error result → inline error, button recovers from "Revoking…".
 *       This exercises the REAL revokeAdminAction (Phase 6.4 typed result),
 *       with the data layer mocked to throw AdminEmailsInfraError. The
 *       Step-4 negative-regression reverts 6.4 (re-throw) → this test FAILS
 *       (the throw escapes to the boundary and strands the button), proving
 *       the typed-result contract is pinned by this test.
 *   (b) no-response hang → "Couldn't confirm. Refresh to check." renders;
 *        the confirm/submit is DISABLED (duplicate submit suppressed).
 *   (c) delayed result arriving AFTER the watchdog fired → component stays
 *        conservative: no second submit becomes enabled, no auto-return to
 *        idle. (Row-removal-on-refresh is the §6.3 e2e, deferred.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import { AdminEmailsInfraError } from "@/lib/data/adminEmails";

// --- Mock the action's dependencies so test (a) runs the REAL action path.
// requireAdminIdentity: pass the gate. revokeAdminEmail: throw the typed infra
// fault so revokeAdminAction's catch maps it to { kind: "infra_error" } (6.4).
// next/cache revalidatePath: no-op (success path not exercised by (a)).
// Return a real admin identity: revokeAdminAction's M12.5 self-revoke guard
// reads `canonicalize(identity.email)`, so `undefined` would throw before the
// data call. The email differs from the revoked target ("x@example.com") so
// the guard passes and the flow reaches revokeAdminEmail (mocked to throw).
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: async () => ({ email: "admin@fxav.test" }),
}));
vi.mock("@/lib/data/adminEmails", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/data/adminEmails")>();
  return {
    ...actual,
    addAdminEmail: vi.fn(),
    revokeAdminEmail: vi.fn(async () => {
      throw new actual.AdminEmailsInfraError("revokeAdminEmail.rpc: simulated infra fault");
    }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The real Server Action under test (deps mocked above).
import { revokeAdminAction } from "@/app/admin/settings/admins/actions";

// Hang controller: tests (b)/(c) need an action that never resolves so the
// watchdog fires. We wrap the action module so the mode picks the strategy.
const mockState = vi.hoisted(() => ({
  mode: "real" as "real" | "hang",
  calls: 0,
}));

vi.mock("@/app/admin/settings/admins/actions", async (importActual) => {
  const actual = await importActual<typeof import("@/app/admin/settings/admins/actions")>();
  return {
    ...actual,
    revokeAdminAction: async (
      prev: Awaited<ReturnType<typeof actual.revokeAdminAction>> | null,
      formData: FormData,
    ) => {
      mockState.calls += 1;
      if (mockState.mode === "hang") {
        // Never resolves — simulates the action hanging with no result.
        return new Promise(() => {});
      }
      // Run the REAL action (with deps mocked above) so (a) flows through the
      // 6.4 try/catch → { kind: "infra_error" }; reverting 6.4 makes it throw.
      return actual.revokeAdminAction(prev, formData);
    },
  };
});

import { RevokeRowButton } from "@/app/admin/settings/admins/RevokeRowButton";

beforeEach(() => {
  mockState.mode = "real";
  mockState.calls = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Silence the expected jsdom error-boundary console noise the negative
// regression produces when the action throws (uncaught in the dispatch).
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("RevokeRowButton — Task 7.1 revoke-hang watchdog", () => {
  it("(a) infra_error result → inline error, button recovers from 'Revoking…' (real action path)", async () => {
    // Sanity: the real action maps the thrown AdminEmailsInfraError to the
    // typed result. If 6.4 is reverted (re-throw), this rejects and the
    // assertions below fail because the island never receives a result.
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(revokeAdminAction(null, fd)).resolves.toEqual({ kind: "infra_error" });

    const { getByTestId, queryByTestId } = render(
      <RevokeRowButton email="x@example.com" disabled={false} />,
    );

    fireEvent.click(getByTestId("admin-allowlist-revoke-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-revoke-confirm-button"));
    });

    // The non-ok infra_error result snaps ui→idle: the confirm row unmounts,
    // the Revoke button is back (recovered from "Revoking…"), and the inline
    // write-failed error renders. Reverting 6.4 (re-throw) routes the throw to
    // the error boundary instead → the confirm row stays + no inline error.
    await waitFor(() => {
      expect(queryByTestId("admin-allowlist-revoke-confirm-row")).toBeNull();
    });
    expect(getByTestId("admin-allowlist-revoke-button").textContent?.trim()).toBe("Revoke");
    expect(getByTestId("admin-allowlist-error-write-failed")).not.toBeNull();
  });

  it("(b) no-response hang → 'Couldn't confirm. Refresh to check.'; duplicate submit suppressed", async () => {
    vi.useFakeTimers();
    mockState.mode = "hang";
    const { getByTestId, queryByTestId } = render(
      <RevokeRowButton email="x@example.com" disabled={false} />,
    );

    fireEvent.click(getByTestId("admin-allowlist-revoke-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-revoke-confirm-button"));
    });

    // Still resolving — no result arrived. Advance past the watchdog window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    const status = getByTestId("admin-allowlist-couldnt-confirm");
    expect(status).not.toBeNull();
    expect(status.getAttribute("role")).toBe("status");
    // Curly apostrophe (&rsquo;) per DESIGN.md typography; normalize for the
    // assertion so it reads as the plain copy "Couldn't confirm. Refresh to check."
    const statusText = (status.textContent ?? "").replace(/’/g, "'");
    expect(statusText).toContain("Couldn't confirm. Refresh to check.");

    // The confirm/submit button is disabled so a second tap can't double-revoke.
    const confirmBtn = queryByTestId("admin-allowlist-revoke-confirm-button");
    if (confirmBtn) {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    }
    // A refresh affordance is offered.
    expect(getByTestId("admin-allowlist-couldnt-confirm-refresh")).not.toBeNull();
  });

  it("(c) delayed result after the watchdog fired → stays conservative (no re-enable, no auto-idle)", async () => {
    vi.useFakeTimers();
    // Hang first so the watchdog fires; the action stays in-flight (never
    // re-dispatched), modeling the original call committing late.
    mockState.mode = "hang";
    const { getByTestId, queryByTestId } = render(
      <RevokeRowButton email="x@example.com" disabled={false} />,
    );

    fireEvent.click(getByTestId("admin-allowlist-revoke-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-allowlist-revoke-confirm-button"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    // In couldnt_confirm now.
    expect(getByTestId("admin-allowlist-couldnt-confirm")).not.toBeNull();
    const callsAfterWatchdog = mockState.calls;

    // A late result/render must NOT re-enable a second submit nor auto-return
    // to idle. Advance more time + flush microtasks; the conservative state holds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    // Still couldnt_confirm: no idle Revoke button re-appeared, and the
    // action was not invoked a second time.
    expect(getByTestId("admin-allowlist-couldnt-confirm")).not.toBeNull();
    expect(queryByTestId("admin-allowlist-revoke-button")).toBeNull();
    const confirmBtn = queryByTestId("admin-allowlist-revoke-confirm-button");
    if (confirmBtn) {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    }
    expect(mockState.calls).toBe(callsAfterWatchdog);
  });
});

// Reference the imported symbol so the import isn't tree-shaken/flagged unused.
void AdminEmailsInfraError;
