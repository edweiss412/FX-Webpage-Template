/**
 * tests/app/admin/adminActionsRevalidate.test.ts (M12.2 B1 Task 6.3)
 *
 * Pins the canonical-surface revalidation contract: the admin allow-list
 * Server Actions are invoked from the EMBEDDED /admin/settings surface as
 * well as the deep-link /admin/settings/admins page. Revalidating only
 * "/admin/settings/admins" leaves the embedded /admin/settings list stale
 * (security-relevant for revoke). Each ok-path MUST revalidate BOTH paths.
 *
 * Unit wiring only — the observable RSC-refresh e2e (plan §6.3 Steps 5-6)
 * is deferred to a batched e2e phase (needs a running server + seeded DB).
 */
import { describe, expect, test, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  addAdminEmailImpl: null as null | ((opts: unknown) => Promise<unknown>),
  revokeAdminEmailImpl: null as null | ((opts: unknown) => Promise<unknown>),
}));

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAdmin", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/requireAdmin")>("@/lib/auth/requireAdmin");
  return {
    ...actual,
    requireAdminIdentity: async () => ({ email: "test-admin@example.com" }),
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

vi.mock("next/cache", () => ({ revalidatePath }));

const { addAdminAction, revokeAdminAction } = await import("@/app/admin/settings/admins/actions");

describe("admin allow-list actions — canonical-surface revalidation (Task 6.3)", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    mockState.addAdminEmailImpl = null;
    mockState.revokeAdminEmailImpl = null;
  });

  test("addAdminAction ok-path revalidates BOTH /admin/settings/admins AND /admin/settings", async () => {
    const fd = new FormData();
    fd.set("email", "new@example.com");
    const out = await addAdminAction(null, fd);
    expect(out.kind).toBe("ok");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings/admins");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  test("revokeAdminAction ok-path revalidates BOTH /admin/settings/admins AND /admin/settings", async () => {
    mockState.revokeAdminEmailImpl = async () => ({ kind: "ok" });
    const fd = new FormData();
    fd.set("email", "victim@example.com");
    const out = await revokeAdminAction(null, fd);
    expect(out.kind).toBe("ok");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings/admins");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });

  test("revokeAdminAction benign already_active no-op revalidates BOTH surfaces", async () => {
    // revokeAdminEmail returns already_active when the email never
    // existed; the action treats it as a successful no-op and still
    // refreshes both surfaces.
    mockState.revokeAdminEmailImpl = async () => ({
      kind: "already_active",
      email: "ghost@example.com",
    });
    const fd = new FormData();
    fd.set("email", "ghost@example.com");
    const out = await revokeAdminAction(null, fd);
    expect(out.kind).toBe("ok");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings/admins");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
  });
});
