/**
 * tests/admin/admins-actions.test.ts (M9 C9 R3 regression)
 *
 * Pins the R3 contract: app/admin/settings/admins/actions.ts MUST
 * propagate AdminInfraError when the auth gate fails (requireAdminIdentity
 * throws). The Server Action MUST NOT swallow infra faults into a
 * benign result kind (`invalid_email` or `ok`).
 *
 * Pre-R3 code path (the failing pattern this test pins against):
 *   getActorUid() → requireAdminIdentity() + supabase.auth.getUser()
 *   The second getUser() call returned `{ uid: null, identity }` on
 *   error — addAdminAction proceeded with uid=null (silent mutation),
 *   revokeAdminAction mapped uid=null to `invalid_email` (user-input
 *   signal masquerading as infra fault).
 *
 * R3 fix: actions call requireAdminIdentity() directly. Any throw
 * propagates to Next's error boundary (cataloged 500 path).
 */
import { describe, expect, test, vi } from "vitest";

// Hoisted mock control — set before importing actions so the vi.mock
// factories can reach it via vi.hoisted scope.
const mockState = vi.hoisted(() => ({
  requireAdminIdentityImpl: null as null | (() => Promise<{ email: string }>),
  addAdminEmailImpl: null as null | ((opts: unknown) => Promise<unknown>),
  revokeAdminEmailImpl: null as null | ((opts: unknown) => Promise<unknown>),
}));

vi.mock("@/lib/auth/requireAdmin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/requireAdmin")>(
    "@/lib/auth/requireAdmin",
  );
  return {
    ...actual,
    requireAdminIdentity: async () => {
      if (mockState.requireAdminIdentityImpl) return mockState.requireAdminIdentityImpl();
      return { email: "test-admin@example.com" };
    },
  };
});

vi.mock("@/lib/data/adminEmails", () => ({
  addAdminEmail: async (opts: unknown) => {
    if (mockState.addAdminEmailImpl) return mockState.addAdminEmailImpl(opts);
    return { kind: "ok", row: null };
  },
  revokeAdminEmail: async (opts: unknown) => {
    if (mockState.revokeAdminEmailImpl) return mockState.revokeAdminEmailImpl(opts);
    return { kind: "ok", row: null };
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { addAdminAction, revokeAdminAction } = await import(
  "@/app/admin/settings/admins/actions"
);
const { AdminInfraError } = await import("@/lib/auth/requireAdmin");

describe("admin allow-list Server Actions — R3 infra-fault propagation", () => {
  test("addAdminAction: AdminInfraError from requireAdminIdentity propagates (not swallowed)", async () => {
    mockState.requireAdminIdentityImpl = async () => {
      throw new AdminInfraError("simulated supabase server-client construction fault");
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(addAdminAction(null, fd)).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("revokeAdminAction: AdminInfraError from requireAdminIdentity propagates", async () => {
    mockState.requireAdminIdentityImpl = async () => {
      throw new AdminInfraError("simulated getUser fault");
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(revokeAdminAction(null, fd)).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("addAdminAction does NOT call addAdminEmail when requireAdmin throws (no silent mutation)", async () => {
    let dataLayerCalled = false;
    mockState.requireAdminIdentityImpl = async () => {
      throw new AdminInfraError("auth gate failed");
    };
    mockState.addAdminEmailImpl = async () => {
      dataLayerCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "attacker@example.com");
    await expect(addAdminAction(null, fd)).rejects.toBeInstanceOf(AdminInfraError);
    expect(dataLayerCalled).toBe(false);
  });

  test("revokeAdminAction does NOT call revokeAdminEmail when requireAdmin throws", async () => {
    let dataLayerCalled = false;
    mockState.requireAdminIdentityImpl = async () => {
      throw new AdminInfraError("auth gate failed");
    };
    mockState.revokeAdminEmailImpl = async () => {
      dataLayerCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "victim@example.com");
    await expect(revokeAdminAction(null, fd)).rejects.toBeInstanceOf(AdminInfraError);
    expect(dataLayerCalled).toBe(false);
  });

  test("revokeAdminAction does NOT return invalid_email on auth gate failure (R3 anti-regression)", async () => {
    // Pre-R3 the action mapped uid=null (from a degraded getUser
    // result) to { kind: "invalid_email" } — a user-input signal
    // masquerading as an infra fault. Verify the post-fix code throws
    // instead.
    mockState.requireAdminIdentityImpl = async () => {
      throw new AdminInfraError("getUser threw");
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    let caught: unknown = null;
    try {
      await revokeAdminAction(null, fd);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AdminInfraError);
  });
});
