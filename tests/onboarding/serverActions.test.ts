import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
  purgeAndRotateOnboardingSession: vi.fn<() => Promise<unknown>>(async () => ({ rotated: true })),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: mocks.requireAdminIdentity,
}));

vi.mock("@/lib/onboarding/sessionLifecycle", () => ({
  purgeAndRotateOnboardingSession: mocks.purgeAndRotateOnboardingSession,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

async function importActions() {
  vi.resetModules();
  return await import("@/lib/onboarding/serverActions");
}

beforeEach(() => {
  mocks.requireAdminIdentity.mockReset();
  mocks.requireAdminIdentity.mockResolvedValue({ email: "doug@example.com" });
  mocks.purgeAndRotateOnboardingSession.mockReset();
  mocks.purgeAndRotateOnboardingSession.mockResolvedValue({ rotated: true });
  mocks.redirect.mockClear();
});

describe("onboarding server actions", () => {
  test("startOverServerAction gates admin, rotates, then redirects to /admin", async () => {
    const { startOverServerAction } = await importActions();

    await expect(startOverServerAction()).rejects.toMatchObject({ url: "/admin" });

    expect(mocks.requireAdminIdentity).toHaveBeenCalledOnce();
    expect(mocks.purgeAndRotateOnboardingSession).toHaveBeenCalledWith();
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });

  test("startOverServerAction does not rotate when admin gate fails", async () => {
    mocks.requireAdminIdentity.mockRejectedValue(new Error("forbidden"));
    const { startOverServerAction } = await importActions();

    await expect(startOverServerAction()).rejects.toThrow(/forbidden/);

    expect(mocks.purgeAndRotateOnboardingSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  test("rerunSetupServerAction rotates with finalize suppression enabled, then redirects to /admin", async () => {
    const { rerunSetupServerAction } = await importActions();

    await expect(rerunSetupServerAction()).rejects.toMatchObject({ url: "/admin" });

    expect(mocks.requireAdminIdentity).toHaveBeenCalledOnce();
    expect(mocks.purgeAndRotateOnboardingSession).toHaveBeenCalledWith({
      suppressIfFinalizePending: true,
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });

  test("rerunSetupServerAction redirects to finalize re-entry when suppression gate fires", async () => {
    mocks.purgeAndRotateOnboardingSession.mockResolvedValue({
      rotated: false,
      suppressed: "WIZARD_FINALIZE_BATCHES_PENDING",
    });
    const { rerunSetupServerAction } = await importActions();

    await expect(rerunSetupServerAction()).rejects.toMatchObject({
      url: "/admin?show_finalize=true",
    });

    expect(mocks.redirect).toHaveBeenCalledWith("/admin?show_finalize=true");
  });

  test("rerunSetupServerAction does not rotate when admin gate fails", async () => {
    mocks.requireAdminIdentity.mockRejectedValue(new Error("forbidden"));
    const { rerunSetupServerAction } = await importActions();

    await expect(rerunSetupServerAction()).rejects.toThrow(/forbidden/);

    expect(mocks.purgeAndRotateOnboardingSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
