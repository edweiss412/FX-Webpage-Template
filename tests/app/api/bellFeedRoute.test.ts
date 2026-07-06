// Bell notification center Task 9: GET /api/admin/alerts/bell/feed.
// Cloned from tests/app/api/needsAttentionCountRoute.test.ts:7-33. Failure
// modes pinned: (a) ok payload passes the loader result through verbatim
// (minus `kind`) with a no-store header; (b) loader infra_error maps to 503
// WITHOUT leaking raw catalog codes (invariant 5); (c) AdminInfraError from
// requireAdminIdentity → 503; (d) requireAdminIdentity + isCurrentUserDeveloper
// results are wired into loadBellFeed(email, isDev) verbatim (tier-scope
// wiring regression guard).
import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET } from "@/app/api/admin/alerts/bell/feed/route";
import { loadBellFeed } from "@/lib/admin/bellFeed";
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
  loadBellFeed: vi.fn(),
}));

const requireAdminIdentityMock = vi.mocked(requireAdminIdentity);
const isCurrentUserDeveloperMock = vi.mocked(isCurrentUserDeveloper);
const loadBellFeedMock = vi.mocked(loadBellFeed);

describe("GET /api/admin/alerts/bell/feed", () => {
  beforeEach(() => {
    requireAdminIdentityMock.mockReset();
    isCurrentUserDeveloperMock.mockReset();
    loadBellFeedMock.mockReset();
    requireAdminIdentityMock.mockResolvedValue({ email: "admin@fxav.test" });
    isCurrentUserDeveloperMock.mockResolvedValue(false);
  });

  test("ok → 200 body passes loader result through verbatim, with Cache-Control: no-store", async () => {
    loadBellFeedMock.mockResolvedValue({
      kind: "ok",
      entries: [],
      unseenCount: 3,
      truncated: false,
      historyDays: 30,
      feedCap: 200,
      seenThrough: "2026-07-05T00:00:00.000Z",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entries: [],
      unseenCount: 3,
      truncated: false,
      historyDays: 30,
      feedCap: 200,
      seenThrough: "2026-07-05T00:00:00.000Z",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("loader infra_error → 503 with no raw catalog codes in the body", async () => {
    loadBellFeedMock.mockResolvedValue({ kind: "infra_error" });

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
    expect(loadBellFeedMock).not.toHaveBeenCalled();
  });

  test("requireAdminIdentity throwing Next control flow propagates (rejects)", async () => {
    // Stand-in for forbidden()/notFound() control-flow errors: a plain Error
    // that is NOT an AdminInfraError must escape the handler for Next to catch.
    const controlFlow = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    requireAdminIdentityMock.mockRejectedValue(controlFlow);

    await expect(GET()).rejects.toBe(controlFlow);
    expect(loadBellFeedMock).not.toHaveBeenCalled();
  });

  test("passes (email, viewerIsDeveloper) from requireAdminIdentity + isCurrentUserDeveloper into loadBellFeed verbatim", async () => {
    requireAdminIdentityMock.mockResolvedValue({ email: "dev@fxav.test" });
    isCurrentUserDeveloperMock.mockResolvedValue(true);
    loadBellFeedMock.mockResolvedValue({
      kind: "ok",
      entries: [],
      unseenCount: 0,
      truncated: false,
      historyDays: 30,
      feedCap: 200,
      seenThrough: "2026-07-05T00:00:00.000Z",
    });

    await GET();

    expect(loadBellFeedMock).toHaveBeenCalledWith("dev@fxav.test", true);
  });
});
