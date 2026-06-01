// @vitest-environment jsdom
/**
 * tests/app/admin/layoutIdentityFault.test.tsx (M12.2 B1 Task 2.2)
 *
 * Pins the layout identity-fold catch. AdminLayout now reads identity via
 * requireAdminIdentity({ layer: "layout" }); when that throws a REAL
 * server-side AdminInfraError, the catch renders the FIXED
 * ADMIN_ROUTE_LOAD_FAILED Doug copy inside the admin-layout-infra-error
 * surface — NEVER ADMIN_SESSION_LOOKUP_FAILED's null-dougFacing →
 * crewFacing fallback (wrong audience), NEVER Next's generic page.
 *
 * Concrete failure mode caught: the catch rendering the crew-facing
 * fallback copy on the admin shell when a session/infra fault occurs.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getRequiredDougFacing, getCrewFacing } from "@/lib/messages/lookup";

const auth = vi.hoisted(() => ({
  shouldThrow: false,
}));

// AdminInfraError must be a REAL instance so the layout's
// `err instanceof AdminInfraError` check matches.
vi.mock("@/lib/auth/requireAdmin", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/requireAdmin")>(
      "@/lib/auth/requireAdmin",
    );
  return {
    AdminInfraError: actual.AdminInfraError,
    requireAdminIdentity: vi.fn(async () => {
      if (auth.shouldThrow) {
        throw new actual.AdminInfraError("simulated layout-gate infra fault");
      }
      return { email: "admin@fxav.test" };
    }),
  };
});

// AlertBanner is async + self-fetches; stub it so the layout renders.
vi.mock("@/components/admin/AlertBanner", () => ({
  AlertBanner: () => null,
}));

// On the success path the layout now renders <AdminNav>, a client island
// that calls usePathname. Stub it so the success-path render doesn't throw
// outside a Next request scope.
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

vi.mock("@/lib/admin/alertCount", () => ({
  fetchUnresolvedAlertCount: vi.fn(async () => ({ kind: "ok", count: 0 })),
}));

async function renderLayout() {
  const mod = await import("@/app/admin/layout");
  const ui = await mod.default({ children: null });
  render(ui);
}

afterEach(() => {
  cleanup();
  vi.resetModules();
});

beforeEach(() => {
  auth.shouldThrow = false;
});

describe("AdminLayout identity fold (Task 2.2)", () => {
  it("renders fixed ADMIN_ROUTE_LOAD_FAILED Doug copy in the infra-error surface when requireAdminIdentity throws a real AdminInfraError", async () => {
    auth.shouldThrow = true;
    await renderLayout();
    const surface = screen.getByTestId("admin-layout-infra-error");
    expect(surface).toBeInTheDocument();
    expect(surface.textContent).toContain(
      getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED"),
    );
  });

  it("never renders crew-facing copy nor the raw error code on the admin shell", async () => {
    auth.shouldThrow = true;
    await renderLayout();
    const surface = screen.getByTestId("admin-layout-infra-error");
    // ADMIN_SESSION_LOOKUP_FAILED's crewFacing must not leak to Doug.
    const crew = getCrewFacing("ADMIN_SESSION_LOOKUP_FAILED");
    if (crew) {
      expect(surface.textContent).not.toContain(crew);
    }
    expect(surface.textContent).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(surface.textContent).not.toContain("ADMIN_ROUTE_LOAD_FAILED");
  });

  it("on success renders the admin chrome (not the infra-error surface)", async () => {
    auth.shouldThrow = false;
    await renderLayout();
    expect(screen.queryByTestId("admin-layout-infra-error")).toBeNull();
    expect(screen.getByTestId("admin-layout")).toBeInTheDocument();
  });
});
