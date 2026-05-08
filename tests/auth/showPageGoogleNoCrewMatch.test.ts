/**
 * Round-10 §A HIGH: signed-in Google users with no crew row on the
 * requested show would loop between /show/<slug> and /auth/sign-in?
 * next=/show/<slug>. The page's CF-IMPL-4 workaround downgrades
 * GOOGLE_NO_CREW_MATCH to "continue", losing the signal that the
 * request HAD a valid Google session. The no-viewer tail then sends
 * the user to /auth/sign-in?next=/show/<slug>; the sign-in page's
 * already-authenticated guard sees the same Google session and
 * redirects back to /show/<slug>. Browsers stop after a few hops.
 *
 * Users who picked the wrong Google account can't escape to switch.
 *
 * Fix: track the GOOGLE_NO_CREW_MATCH outcome distinctly and redirect
 * to /me (which lists shows the user actually has access to) instead
 * of bouncing to sign-in. /me handles the empty-state path gracefully.
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
  cookies: async () => ({ getAll: () => [], get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/lib/auth/cookies", () => ({
  decodeSessionCookieValue: () => null,
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => ({ ok: false }),
}));

const linkState = vi.hoisted(() => ({
  clearCookie: false as boolean,
}));

vi.mock("@/lib/auth/validateLinkSession", () => ({
  validateLinkSession: async () => ({
    kind: "continue",
    clearCookie: linkState.clearCookie ? true : undefined,
  }),
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => ({
    kind: "continue",
    code: "GOOGLE_NO_CREW_MATCH",
  }),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
    constructor(message: string) {
      super(message);
      this.name = "AdminInfraError";
    }
  },
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
            data: {
              id: "11111111-1111-1111-1111-111111111111",
              published: true,
            },
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
vi.mock("@/components/tiles/AudioScopeTile", () => ({ AudioScopeTile: () => null }));
vi.mock("@/components/tiles/ContactsTile", () => ({ ContactsTile: () => null }));
vi.mock("@/components/tiles/CrewTile", () => ({ CrewTile: () => null }));
vi.mock("@/components/tiles/FinancialsTile", () => ({ FinancialsTile: () => null }));
vi.mock("@/components/tiles/LightingScopeTile", () => ({ LightingScopeTile: () => null }));
vi.mock("@/components/tiles/LodgingTile", () => ({ LodgingTile: () => null }));
vi.mock("@/components/tiles/NotesTile", () => ({ NotesTile: () => null }));
vi.mock("@/components/tiles/PackListTile", () => ({ PackListTile: () => null }));
vi.mock("@/components/tiles/ScheduleTile", () => ({ ScheduleTile: () => null }));
vi.mock("@/components/tiles/ShowStatusTile", () => ({ ShowStatusTile: () => null }));
vi.mock("@/components/tiles/TransportTile", () => ({ TransportTile: () => null }));
vi.mock("@/components/tiles/VenueTile", () => ({ VenueTile: () => null }));
vi.mock("@/components/tiles/VideoScopeTile", () => ({ VideoScopeTile: () => null }));

const { default: ShowPage } = await import("@/app/show/[slug]/page");

describe("ShowPage Google-no-crew redirect routing", () => {
  beforeEach(() => {
    navState.redirected = [];
    navState.notFoundCalled = 0;
    linkState.clearCookie = false;
  });

  test("signed-in Google user with no crew row redirects to /me, not /auth/sign-in", async () => {
    await expect(ShowPage({ params: Promise.resolve({ slug: "another-show" }) })).rejects.toThrow(
      /^NEXT_REDIRECT:/,
    );

    expect(navState.notFoundCalled).toBe(0);
    expect(navState.redirected).toHaveLength(1);
    const target = navState.redirected[0]!;
    // Pre-fix: /auth/sign-in?next=/show/another-show (loops with sign-in's
    // already-authenticated guard). Post-fix: /me (breaks the loop;
    // /me lists shows the user actually has access to).
    expect(target).toBe("/me");
  });

  test("R14 #3: Google-no-crew + clearCookie redirects through /auth/clear-session before /me", async () => {
    // Round-13 §B MEDIUM: a stale/revoked/wrong-show link cookie can
    // set clearCookie=true via validateLinkSession's continue arm
    // before the chain reaches the Google validator. R11 #1 redirected
    // straight to /me on Google-no-crew, bypassing the cookie cleanup
    // and leaving the stale cookie for the next request to recover.
    // Now: clear-session with next=/me carries the cookie clear.
    linkState.clearCookie = true;

    await expect(ShowPage({ params: Promise.resolve({ slug: "another-show" }) })).rejects.toThrow(
      /^NEXT_REDIRECT:/,
    );

    expect(navState.redirected).toHaveLength(1);
    const target = navState.redirected[0]!;
    expect(target).toMatch(/^\/auth\/clear-session\?next=/);
    expect(decodeURIComponent(target)).toContain("/me");
  });
});
