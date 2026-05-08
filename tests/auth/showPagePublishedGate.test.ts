/**
 * Round-9 §A + §B HIGH: ShowPage runs validateLinkSession (and its
 * `last_active_at` UPDATE side effect) before the only non-admin
 * published-show check. For an unpublished-but-existing slug + non-
 * admin viewer, the page reached the no-viewer-redirect path while
 * unknown slugs hit notFound() — the response shape distinguished
 * unpublished-show existence and unpublish failed to stop session-
 * refresh side effects.
 *
 * This test pins: when shows.published is false and the viewer is
 * not an admin, the page returns notFound() WITHOUT invoking the
 * link/google validators.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const navState = vi.hoisted(() => ({
  redirected: [] as string[],
  notFoundCalled: 0,
}));

const validatorState = vi.hoisted(() => ({
  validateLinkSessionCalls: 0,
  validateGoogleSessionCalls: 0,
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

vi.mock("@/lib/auth/validateLinkSession", () => ({
  validateLinkSession: async () => {
    validatorState.validateLinkSessionCalls += 1;
    return { kind: "continue" };
  },
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => {
    validatorState.validateGoogleSessionCalls += 1;
    return { kind: "continue" };
  },
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

const supabaseState = vi.hoisted(() => ({
  showPublished: false as boolean,
  showExists: true as boolean,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (!supabaseState.showExists) {
              return { data: null, error: null };
            }
            return {
              data: {
                id: "11111111-1111-1111-1111-111111111111",
                published: supabaseState.showPublished,
              },
              error: null,
            };
          },
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

describe("ShowPage non-admin published-show gate", () => {
  beforeEach(() => {
    navState.redirected = [];
    navState.notFoundCalled = 0;
    validatorState.validateLinkSessionCalls = 0;
    validatorState.validateGoogleSessionCalls = 0;
    supabaseState.showPublished = false;
    supabaseState.showExists = true;
  });

  test("non-admin + unpublished slug returns notFound BEFORE link/google validators run", async () => {
    await expect(ShowPage({ params: Promise.resolve({ slug: "draft-show" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    expect(navState.notFoundCalled).toBe(1);
    expect(navState.redirected).toEqual([]);
    // The side-effect concern from round-9 §B: validateLinkSession's
    // last_active_at update must NOT fire on unpublished-show requests.
    expect(validatorState.validateLinkSessionCalls).toBe(0);
    expect(validatorState.validateGoogleSessionCalls).toBe(0);
  });

  test("non-admin + published slug DOES run the auth chain (regression)", async () => {
    supabaseState.showPublished = true;

    // Reaches the no-viewer redirect path (no auth) — that's the
    // expected behavior for a published show with no session.
    await expect(ShowPage({ params: Promise.resolve({ slug: "live-show" }) })).rejects.toThrow(
      /^NEXT_REDIRECT:/,
    );

    expect(navState.notFoundCalled).toBe(0);
    expect(validatorState.validateLinkSessionCalls).toBe(1);
  });

  test("unknown slug returns notFound (regression — same response as unpublished)", async () => {
    supabaseState.showExists = false;

    await expect(ShowPage({ params: Promise.resolve({ slug: "nonexistent" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );

    expect(navState.notFoundCalled).toBe(1);
    expect(validatorState.validateLinkSessionCalls).toBe(0);
  });
});
