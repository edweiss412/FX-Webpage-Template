// @vitest-environment jsdom
/**
 * F3 companion (plan §pre-draft finding 1): the resolved page's "Back to setup"
 * href is /admin/onboarding per spec §5, but the wizard renders at /admin via the
 * dispatcher — without this redirect the spec-mandated link 404s (the
 * "build-gated routes are never fallback targets" class).
 */
import { describe, expect, test, vi } from "vitest";

const redirectMock = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

describe("/admin/onboarding", () => {
  test("redirects to /admin (the wizard dispatcher)", async () => {
    const { default: OnboardingIndexPage } = await import(
      "@/app/admin/onboarding/page"
    );
    await expect(async () => OnboardingIndexPage()).rejects.toThrow(
      "NEXT_REDIRECT:/admin",
    );
    expect(redirectMock).toHaveBeenCalledWith("/admin");
  });
});
