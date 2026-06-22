/**
 * tests/app/admin/adminActionInfraError.test.ts (M12.2 B1 Task 6.4)
 *
 * Symmetric infra_error recovery across the add + revoke write surfaces.
 *
 * Contract pinned here (action layer):
 *   - addAdminEmail / revokeAdminEmail throwing AdminEmailsInfraError
 *     (the DATA call, AFTER the requireAdminIdentity gate) → the action
 *     returns { kind: "infra_error" } (retryable inline state).
 *   - A gate AdminInfraError (from requireAdminIdentity) PROPAGATES —
 *     it must NOT be caught and downgraded to a retryable inline state
 *     (auth/infra fault → catalog 500 boundary, AGENTS.md invariant 9).
 *   - A Next control-flow throw (redirect/notFound digest) propagates.
 *
 * Component-surface coverage (the three write surfaces all render the
 * cataloged inline ADMIN_EMAIL_WRITE_FAILED copy) lives in
 * tests/components/adminWriteFailSurfaces.test.tsx — it needs jsdom.
 */
import { describe, expect, test, beforeEach, vi } from "vitest";

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

// Use the REAL AdminEmailsInfraError class so `instanceof` in the action
// catch matches; only the two mutation functions are stubbed.
vi.mock("@/lib/data/adminEmails", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/data/adminEmails")>("@/lib/data/adminEmails");
  return {
    ...actual,
    addAdminEmail: async (opts: unknown) => {
      if (mockState.addAdminEmailImpl) return mockState.addAdminEmailImpl(opts);
      return { kind: "ok", row: null };
    },
    revokeAdminEmail: async (opts: unknown) => {
      if (mockState.revokeAdminEmailImpl) return mockState.revokeAdminEmailImpl(opts);
      return { kind: "ok" };
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { addAdminAction, revokeAdminAction } = await import("@/app/admin/settings/admins/actions");
const { AdminEmailsInfraError } = await import("@/lib/data/adminEmails");
const { AdminInfraError } = await import("@/lib/auth/requireAdmin");

describe("admin write actions — symmetric infra_error (Task 6.4)", () => {
  beforeEach(() => {
    mockState.requireAdminIdentityImpl = null;
    mockState.addAdminEmailImpl = null;
    mockState.revokeAdminEmailImpl = null;
  });

  test("addAdminEmail throws AdminEmailsInfraError (after gate) → { kind: 'infra_error' }", async () => {
    mockState.addAdminEmailImpl = async () => {
      throw new AdminEmailsInfraError("rpc fault");
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    const out = await addAdminAction(null, fd);
    expect(out).toEqual({ kind: "infra_error" });
  });

  test("revokeAdminEmail throws AdminEmailsInfraError → { kind: 'infra_error' }", async () => {
    mockState.revokeAdminEmailImpl = async () => {
      throw new AdminEmailsInfraError("rpc fault");
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    const out = await revokeAdminAction(null, fd);
    expect(out).toEqual({ kind: "infra_error" });
  });

  test("addAdminAction: a gate AdminInfraError still PROPAGATES (not downgraded to infra_error)", async () => {
    mockState.requireAdminIdentityImpl = async () => {
      throw new AdminInfraError("gate fault");
    };
    let dataCalled = false;
    mockState.addAdminEmailImpl = async () => {
      dataCalled = true;
      return { kind: "ok", row: null };
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(addAdminAction(null, fd)).rejects.toBeInstanceOf(AdminInfraError);
    expect(dataCalled).toBe(false);
  });

  test("revokeAdminAction: a gate AdminInfraError still PROPAGATES (not downgraded to infra_error)", async () => {
    mockState.requireAdminIdentityImpl = async () => {
      throw new AdminInfraError("gate fault");
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(revokeAdminAction(null, fd)).rejects.toBeInstanceOf(AdminInfraError);
  });

  test("addAdminAction: a Next control-flow throw propagates (not swallowed as infra_error)", async () => {
    // Next's redirect()/notFound() throw a digest error; the action's
    // catch must rethrow anything that isn't AdminEmailsInfraError.
    const digest = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/x;307;",
    });
    mockState.addAdminEmailImpl = async () => {
      throw digest;
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(addAdminAction(null, fd)).rejects.toBe(digest);
  });

  test("revokeAdminAction: a Next control-flow throw propagates", async () => {
    const digest = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    mockState.revokeAdminEmailImpl = async () => {
      throw digest;
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(revokeAdminAction(null, fd)).rejects.toBe(digest);
  });

  test("addAdminAction: an unknown error propagates (not swallowed)", async () => {
    const boom = new Error("unexpected");
    mockState.addAdminEmailImpl = async () => {
      throw boom;
    };
    const fd = new FormData();
    fd.set("email", "x@example.com");
    await expect(addAdminAction(null, fd)).rejects.toBe(boom);
  });
});
