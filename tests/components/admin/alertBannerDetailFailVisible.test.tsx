// @vitest-environment jsdom
/**
 * tests/components/admin/alertBannerDetailFailVisible.test.tsx (M12.2 B1 Task 1.3)
 *
 * Fail-VISIBLE contract for AlertBanner's infra-fault paths. Because the
 * NotifBell count and the banner are SEPARATE Supabase reads, a positive
 * (or degraded) bell must NEVER route the operator to an empty
 * /admin#alerts surface. Every AlertBanner infra fault — detail SELECT
 * returned-error, detail SELECT thrown, AND client construction throw —
 * must render the cataloged degraded banner (`ADMIN_ALERT_COUNT_FAILED`),
 * NOT return null.
 *
 * In BOTH cases fetchUnresolvedAlertCount is mocked → { kind:'ok', count:3 }
 * (a positive bell) so the test pins the "positive bell must not route to an
 * empty banner" invariant specifically.
 *
 * Concrete failure mode caught: a join/RLS fault OR a client-construction
 * throw that lets the bell count succeed while the banner returns null →
 * empty /admin#alerts surface, hiding alert context exactly when degraded.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { getRequiredDougFacing } from "@/lib/messages/lookup";

// Positive bell in BOTH cases: a non-empty count must coexist with a
// fail-visible banner, never with a null (empty) banner.
vi.mock("@/lib/admin/alertCount", () => ({
  fetchUnresolvedAlertCount: async () => ({ kind: "ok", count: 3 }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

// Toggles for the supabase mock behavior, set per-test.
const mockState = vi.hoisted(() => ({
  throwOnConstruct: false,
  detailReturnedError: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (mockState.throwOnConstruct) {
      throw new Error("client construction failed");
    }
    const builder: Record<string, unknown> = {};
    const pass = () => builder;
    builder.select = pass;
    builder.is = pass;
    builder.not = pass;
    builder.order = pass;
    builder.limit = () =>
      mockState.detailReturnedError
        ? Promise.resolve({ data: null, error: { message: "join blew up" } })
        : Promise.resolve({ data: [], error: null });
    return { from: () => builder };
  },
}));

afterEach(() => {
  cleanup();
  mockState.throwOnConstruct = false;
  mockState.detailReturnedError = false;
  vi.resetModules();
});

describe("AlertBanner detail-read fail-visible (Task 1.3)", () => {
  it("detail SELECT error → cataloged degraded banner, not null", async () => {
    mockState.detailReturnedError = true;
    const { AlertBanner } = await import("@/components/admin/AlertBanner");
    const ui = await AlertBanner();
    expect(ui).not.toBeNull();
    const { getByTestId } = render(ui);
    const degraded = getByTestId("admin-alert-banner-degraded");
    expect(degraded.textContent).toContain(getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED"));
  });

  it("client CONSTRUCTION throw → cataloged degraded banner, not null (positive bell must not route to empty surface)", async () => {
    mockState.throwOnConstruct = true;
    const { AlertBanner } = await import("@/components/admin/AlertBanner");
    const ui = await AlertBanner();
    expect(ui).not.toBeNull();
    const { getByTestId } = render(ui);
    const degraded = getByTestId("admin-alert-banner-degraded");
    expect(degraded.textContent).toContain(getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED"));
  });
});
