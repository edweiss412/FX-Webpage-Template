// Bell notification center Task 9: GET /api/admin/alerts/bell/count.
// Cloned from tests/app/api/needsAttentionCountRoute.test.ts:7-33 (see
// bellFeedRoute.test.ts for the sibling feed-route coverage). Failure modes
// pinned: (a) ok payload → { count } with a no-store header; (b) loader
// infra_error maps to 503 WITHOUT leaking raw catalog codes (invariant 5); (c)
// AdminInfraError from requireAdminIdentity → 503; (d) requireAdminIdentity +
// isCurrentUserDeveloper results are wired into loadBellUnseenCount(email,
// isDev) verbatim (tier-scope wiring regression guard).
import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET } from "@/app/api/admin/alerts/bell/count/route";
import { loadBellUnseenCount } from "@/lib/admin/bellFeed";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";

vi.mock("@/lib/auth/requireAdmin", () => {
  class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";

    constructor(message: string) {
      super(message);
      this.name = "AdminInfraError";
    }
  }
  return {
    AdminInfraError,
    requireAdminIdentity: vi.fn(),
  };
});

vi.mock("@/lib/auth/requireDeveloper", () => ({
  isCurrentUserDeveloper: vi.fn(),
}));

vi.mock("@/lib/admin/bellFeed", () => ({
  loadBellUnseenCount: vi.fn(),
}));

const requireAdminIdentityMock = vi.mocked(requireAdminIdentity);
const isCurrentUserDeveloperMock = vi.mocked(isCurrentUserDeveloper);
const loadBellUnseenCountMock = vi.mocked(loadBellUnseenCount);

describe("GET /api/admin/alerts/bell/count", () => {
  beforeEach(() => {
    requireAdminIdentityMock.mockReset();
    isCurrentUserDeveloperMock.mockReset();
    loadBellUnseenCountMock.mockReset();
    requireAdminIdentityMock.mockResolvedValue({ email: "admin@fxav.test" });
    isCurrentUserDeveloperMock.mockResolvedValue(false);
  });

  test("ok → 200 { count } with Cache-Control: no-store", async () => {
    loadBellUnseenCountMock.mockResolvedValue({ kind: "ok", count: 7 });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 7 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("loader infra_error → 503 with no raw catalog codes in the body", async () => {
    loadBellUnseenCountMock.mockResolvedValue({ kind: "infra_error" });

    const response = await GET();

    expect(response.status).toBe(503);
    // Invariant 5: no raw §12.4 catalog-code shapes (SCREAMING_SNAKE) leak out.
    const bodyText = await response.text();
    expect(bodyText).not.toMatch(/[A-Z_]{6,}/);
  });

  test("requireAdminIdentity throwing AdminInfraError → 503 without touching the loader", async () => {
    requireAdminIdentityMock.mockRejectedValue(new AdminInfraError("forced"));

    const response = await GET();

    expect(response.status).toBe(503);
    const bodyText = await response.text();
    expect(bodyText).not.toMatch(/[A-Z_]{6,}/);
    expect(loadBellUnseenCountMock).not.toHaveBeenCalled();
  });

  test("requireAdminIdentity throwing Next control flow propagates (rejects)", async () => {
    // Stand-in for forbidden()/notFound() control-flow errors: a plain Error
    // that is NOT an AdminInfraError must escape the handler for Next to catch.
    const controlFlow = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    requireAdminIdentityMock.mockRejectedValue(controlFlow);

    await expect(GET()).rejects.toBe(controlFlow);
    expect(loadBellUnseenCountMock).not.toHaveBeenCalled();
  });

  test("passes (email, viewerIsDeveloper) from requireAdminIdentity + isCurrentUserDeveloper into loadBellUnseenCount verbatim", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "dev@fxav.test" });
    isCurrentUserDeveloperMock.mockResolvedValue(true);
    loadBellUnseenCountMock.mockResolvedValue({ kind: "ok", count: 0 });

    await GET();

    expect(loadBellUnseenCountMock).toHaveBeenCalledWith("dev@fxav.test", true);
  });
});
