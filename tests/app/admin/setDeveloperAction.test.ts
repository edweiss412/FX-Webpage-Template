/**
 * tests/app/admin/setDeveloperAction.test.ts (Phase 4 Task 9, spec §7)
 *
 * Pins the developer-gated toggle Server Action contract:
 *   - The requireDeveloperIdentity() gate is OUTSIDE the try (boundary-throw
 *     posture, mirrors addAdminAction:76): a DeveloperInfraError PROPAGATES to
 *     the catalog 500 boundary and the data call is never reached — it is NOT
 *     downgraded to a retryable inline result (AGENTS.md invariant 9).
 *   - setAdminDeveloper throwing AdminEmailsInfraError (the DATA call, AFTER
 *     the gate) → { kind: "infra_error" }.
 *   - ok → returned unchanged AND revalidates BOTH the embedded
 *     /admin/settings surface and the /admin/settings/admins deep link.
 *   - typed non-ok outcomes (self_developer_demote_forbidden, not_authorized)
 *     pass through unchanged with no revalidation.
 */
import { describe, expect, test, beforeEach, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  requireDeveloperIdentityImpl: null as null | (() => Promise<{ email: string }>),
  setAdminDeveloperImpl: null as null | ((opts: unknown) => Promise<unknown>),
}));

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireDeveloper", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/requireDeveloper")>(
    "@/lib/auth/requireDeveloper",
  );
  return {
    ...actual,
    requireDeveloperIdentity: async () => {
      if (mockState.requireDeveloperIdentityImpl) return mockState.requireDeveloperIdentityImpl();
      return { email: "dev@example.com" };
    },
  };
});

// Use the REAL AdminEmailsInfraError class so `instanceof` in the action catch
// matches; only setAdminDeveloper is stubbed.
vi.mock("@/lib/data/adminEmails", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/data/adminEmails")>("@/lib/data/adminEmails");
  return {
    ...actual,
    setAdminDeveloper: async (opts: unknown) => {
      if (mockState.setAdminDeveloperImpl) return mockState.setAdminDeveloperImpl(opts);
      return { kind: "ok", email: "target@example.com", isDeveloper: true };
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath }));

const { setDeveloperAction } = await import("@/app/admin/settings/admins/developerActions");
const { AdminEmailsInfraError } = await import("@/lib/data/adminEmails");
const { DeveloperInfraError } = await import("@/lib/auth/requireDeveloper");

function makeForm(email: string, isDeveloper: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("is_developer", isDeveloper);
  return fd;
}

describe("setDeveloperAction — developer-gated toggle (Task 9)", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    mockState.requireDeveloperIdentityImpl = null;
    mockState.setAdminDeveloperImpl = null;
  });

  test("gate DeveloperInfraError PROPAGATES (boundary-throw); setAdminDeveloper is never called", async () => {
    mockState.requireDeveloperIdentityImpl = async () => {
      throw new DeveloperInfraError("gate fault");
    };
    let dataCalled = false;
    mockState.setAdminDeveloperImpl = async () => {
      dataCalled = true;
      return { kind: "ok", email: "target@example.com", isDeveloper: true };
    };
    await expect(
      setDeveloperAction(null, makeForm("target@example.com", "true")),
    ).rejects.toBeInstanceOf(DeveloperInfraError);
    expect(dataCalled).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("ok-path returns the outcome AND revalidates BOTH /admin/settings and /admin/settings/admins", async () => {
    mockState.setAdminDeveloperImpl = async () => ({
      kind: "ok",
      email: "target@example.com",
      isDeveloper: true,
    });
    const out = await setDeveloperAction(null, makeForm("target@example.com", "true"));
    expect(out).toEqual({ kind: "ok", email: "target@example.com", isDeveloper: true });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings/admins");
  });

  test("setAdminDeveloper throws AdminEmailsInfraError (after gate) → { kind: 'infra_error' } (no revalidate)", async () => {
    mockState.setAdminDeveloperImpl = async () => {
      throw new AdminEmailsInfraError("rpc fault");
    };
    const out = await setDeveloperAction(null, makeForm("target@example.com", "true"));
    expect(out).toEqual({ kind: "infra_error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("self_developer_demote_forbidden passes through unchanged (no revalidate)", async () => {
    mockState.setAdminDeveloperImpl = async () => ({
      kind: "self_developer_demote_forbidden",
      email: "dev@example.com",
    });
    const out = await setDeveloperAction(null, makeForm("dev@example.com", "false"));
    expect(out).toEqual({ kind: "self_developer_demote_forbidden", email: "dev@example.com" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("not_authorized passes through unchanged (no revalidate)", async () => {
    mockState.setAdminDeveloperImpl = async () => ({ kind: "not_authorized" });
    const out = await setDeveloperAction(null, makeForm("target@example.com", "true"));
    expect(out).toEqual({ kind: "not_authorized" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
