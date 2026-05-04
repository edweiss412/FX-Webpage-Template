/**
 * Round-4 §B finding: when `validateLinkSession` returns a terminal_failure
 * with `clearCookie: true` (e.g. LINK_SESSION_KEY_ROTATED per AC-5.6a), the
 * crew page must clear the stale `__Host-fxav_session` cookie on the FIRST
 * response — not leave it in place for the user to retry. Pre-fix the page
 * called `notFound()` before reaching the clearCookie redirect, so the spec
 * contract was violated for one full request cycle.
 *
 * This test pins: when the resolved chain has both `terminalFailure` and
 * `clearCookie: true`, ShowPage redirects through `/auth/clear-session`
 * before any `notFound()` rendering.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const navState = vi.hoisted(() => ({
  redirected: [] as string[],
  notFoundCalled: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    navState.redirected.push(path);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  notFound: () => {
    navState.notFoundCalled += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => undefined,
  }),
  headers: async () => ({
    get: () => null,
  }),
}));

vi.mock("@/lib/auth/cookies", () => ({
  decodeSessionCookieValue: () => null,
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => ({ ok: false }),
}));

vi.mock("@/lib/auth/validateLinkSession", () => ({
  validateLinkSession: async () => ({
    kind: "terminal_failure",
    status: 401,
    code: "LINK_SESSION_KEY_ROTATED",
    clearCookie: true,
  }),
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => ({ kind: "continue" }),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {
    const err = new Error("requireAdmin notFound");
    (err as { digest?: string }).digest = "NEXT_HTTP_ERROR_FALLBACK;404";
    throw err;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "11111111-1111-1111-1111-111111111111" },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/data/getShowForViewer", () => ({
  getShowForViewer: async () => {
    throw new Error("getShowForViewer should not be reached");
  },
}));

vi.mock("@/lib/data/viewerContext", () => ({
  resolveViewerContext: async () => null,
}));

vi.mock("@/lib/messages/lookup", () => ({
  messageFor: () => "msg",
}));

vi.mock("@/lib/visibility/scopeTiles", () => ({
  transportTileVisible: () => false,
}));

vi.mock("@/components/layout/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: () => null,
}));
vi.mock("@/components/right-now/RightNowCard", () => ({
  RightNowCard: () => null,
}));
vi.mock("@/components/right-now/buildRightNowContext", () => ({
  buildRightNowContext: () => null,
}));
vi.mock("@/components/tiles/AudioScopeTile", () => ({
  AudioScopeTile: () => null,
}));
vi.mock("@/components/tiles/ContactsTile", () => ({
  ContactsTile: () => null,
}));
vi.mock("@/components/tiles/CrewTile", () => ({ CrewTile: () => null }));
vi.mock("@/components/tiles/FinancialsTile", () => ({
  FinancialsTile: () => null,
}));
vi.mock("@/components/tiles/LightingScopeTile", () => ({
  LightingScopeTile: () => null,
}));
vi.mock("@/components/tiles/LodgingTile", () => ({ LodgingTile: () => null }));
vi.mock("@/components/tiles/NotesTile", () => ({ NotesTile: () => null }));
vi.mock("@/components/tiles/PackListTile", () => ({
  PackListTile: () => null,
}));
vi.mock("@/components/tiles/ScheduleTile", () => ({
  ScheduleTile: () => null,
}));
vi.mock("@/components/tiles/ShowStatusTile", () => ({
  ShowStatusTile: () => null,
}));
vi.mock("@/components/tiles/TransportTile", () => ({
  TransportTile: () => null,
}));
vi.mock("@/components/tiles/VenueTile", () => ({ VenueTile: () => null }));
vi.mock("@/components/tiles/VideoScopeTile", () => ({
  VideoScopeTile: () => null,
}));

const { default: ShowPage } = await import("@/app/show/[slug]/page");

describe("ShowPage terminal_failure + clearCookie", () => {
  beforeEach(() => {
    navState.redirected = [];
    navState.notFoundCalled = 0;
  });

  test("LINK_SESSION_KEY_ROTATED redirects to /auth/clear-session before notFound", async () => {
    await expect(
      ShowPage({ params: Promise.resolve({ slug: "test-show" }) }),
    ).rejects.toThrow(/^NEXT_REDIRECT:/);

    expect(navState.notFoundCalled).toBe(0);
    expect(navState.redirected).toHaveLength(1);
    const target = navState.redirected[0]!;
    expect(target).toMatch(/^\/auth\/clear-session\?next=/);
    expect(decodeURIComponent(target)).toContain("/show/test-show");
  });
});
