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
  const actual =
    await vi.importActual<typeof import("@/lib/auth/requireAdmin")>("@/lib/auth/requireAdmin");
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

const { addAdminAction, revokeAdminAction } = await import("@/app/admin/settings/admins/actions");
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

describe("addAdminAction — R14 re-add confirmation binding", () => {
  test("R14 fix: confirm_re_add=true with email !== confirm_email returns invalid_email", async () => {
    // Pre-R14, a user could see "alice@example.com was revoked" in
    // the prompt, edit the visible email input to "bob@example.com",
    // submit with confirm_re_add=true, and the server would process
    // the EDITED email — bypassing the per-email second-tap gate.
    // R14 fix: server-side guard rejects the mismatch.
    let dataLayerCalled = false;
    // Reset prior-test mock state — earlier suite sets the throwing
    // requireAdminIdentityImpl which would fire AdminInfraError here.
    mockState.requireAdminIdentityImpl = null;
    mockState.addAdminEmailImpl = async () => {
      dataLayerCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "bob@example.com"); // edited
    fd.set("confirm_email", "alice@example.com"); // prompted
    fd.set("confirm_re_add", "true");
    const out = await addAdminAction(null, fd);
    expect(out.kind).toBe("invalid_email");
    // Data layer must NOT be called — mismatch is caught at the
    // Server Action boundary BEFORE reaching the RPC.
    expect(dataLayerCalled).toBe(false);
  });

  test("R14: confirm_re_add=true with matching emails proceeds normally", async () => {
    let dataLayerCalled = false;
    let receivedConfirmReAdd = false;
    mockState.requireAdminIdentityImpl = null;
    mockState.addAdminEmailImpl = async (opts: unknown) => {
      dataLayerCalled = true;
      const o = opts as { confirmReAdd?: boolean };
      receivedConfirmReAdd = o.confirmReAdd === true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "alice@example.com");
    fd.set("confirm_email", "alice@example.com");
    fd.set("confirm_re_add", "true");
    const out = await addAdminAction(null, fd);
    expect(out.kind).toBe("ok");
    expect(dataLayerCalled).toBe(true);
    expect(receivedConfirmReAdd).toBe(true);
  });

  test("R14: confirm_re_add=true with case-mismatch is ACCEPTED (canonicalize before compare)", async () => {
    let dataLayerCalled = false;
    mockState.requireAdminIdentityImpl = null;
    mockState.addAdminEmailImpl = async () => {
      dataLayerCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "  Alice@Example.COM ");
    fd.set("confirm_email", "alice@example.com");
    fd.set("confirm_re_add", "true");
    const out = await addAdminAction(null, fd);
    // Both canonicalize to the same value, so the guard PASSES and
    // the RPC is called.
    expect(out.kind).toBe("ok");
    expect(dataLayerCalled).toBe(true);
  });
});

describe("revokeAdminAction — M12.5 self-revoke is enforced server-side", () => {
  // The UI omits the Revoke control on the actor's own row, but the Server
  // Action is POST-reachable. The policy ("an admin can never revoke their own
  // access") MUST be enforced here against the AUTHENTICATED actor — a UI-only
  // guard is a misleading trust boundary (adversarial R5).
  test("self-targeted revoke is refused and does NOT reach the data layer", async () => {
    let dataLayerCalled = false;
    mockState.requireAdminIdentityImpl = async () => ({ email: "self@example.com" });
    mockState.revokeAdminEmailImpl = async () => {
      dataLayerCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "self@example.com");
    const out = await revokeAdminAction(null, fd);
    expect(out.kind).toBe("last_admin_lockout"); // refused
    expect(dataLayerCalled).toBe(false); // never reached revokeAdminEmail
  });

  test("self-revoke is refused even via case/space-drifted self email (canonicalized comparison)", async () => {
    let dataLayerCalled = false;
    mockState.requireAdminIdentityImpl = async () => ({ email: "self@example.com" });
    mockState.revokeAdminEmailImpl = async () => {
      dataLayerCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "  SELF@Example.com  "); // same identity, drifted casing/space
    const out = await revokeAdminAction(null, fd);
    expect(out.kind).toBe("last_admin_lockout");
    expect(dataLayerCalled).toBe(false);
  });

  test("revoking a PEER (different admin) still flows through to the data layer", async () => {
    let dataLayerCalled = false;
    mockState.requireAdminIdentityImpl = async () => ({ email: "self@example.com" });
    mockState.revokeAdminEmailImpl = async () => {
      dataLayerCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "peer@example.com");
    const out = await revokeAdminAction(null, fd);
    expect(out.kind).toBe("ok");
    expect(dataLayerCalled).toBe(true); // peer revoke is allowed (by-design)
  });
});
