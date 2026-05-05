/**
 * tests/auth/resolveShowViewer.test.ts (M4 Task 4.16 Step 1.5)
 *
 * Unit tests for the 5-arm discriminated union returned by
 * lib/auth/resolveShowViewer.ts. The five arms — `admin`, `crew_link`,
 * `crew_google`, `denied`, `forbidden` — are intentionally distinct so API
 * routes map deterministically to HTTP status codes:
 *
 *    denied    → 401  (no/invalid credentials)
 *    forbidden → 403  (valid credentials, wrong show)
 *    success   → 200  (admin/crew_link/crew_google)
 *
 * Conflating denied/forbidden is the failure mode this suite pins.
 *
 * The three validator helpers (isAdminSession, validateLinkSession,
 * validateGoogleSession) are M4 minimal stubs that always return failure;
 * we mock them per-test to drive each arm.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Hoisted mock state so each test can drive a specific validator outcome
// without coupling to module-load order.
const validatorMock = vi.hoisted(() => {
  return {
    state: {
      adminResult: { ok: false } as { ok: boolean; email?: string },
      // Codex round-25 HIGH: peek result drives the cross-show
      // short-circuit BEFORE validateLinkSession runs. The peek
      // is a non-destructive cookie read; on cross-show it routes
      // to forbidden directly so the destructive show-bound
      // validator never sees a wrong-show cookie (which it would
      // delete + return 'continue' for, downgrading 403 to 401
      // and destroying a valid session).
      peekResult: { kind: "no_cookie" } as
        | { kind: "no_cookie" }
        | { kind: "no_envelope" }
        | { kind: "envelope"; showId: string },
      linkResult: { kind: "continue" } as
        | {
            kind: "success";
            viewer: { kind: "crew"; showId: string; crewMemberId: string };
          }
        | { kind: "continue"; clearCookie?: true },
      googleResult: { kind: "continue" } as
        | {
            kind: "success";
            viewer: {
              kind: "crew";
              email: string;
              showId: string;
              crewMemberId: string;
            };
          }
        | { kind: "continue" },
      validateLinkSessionCallCount: 0,
    },
  };
});

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => validatorMock.state.adminResult,
}));
vi.mock("@/lib/auth/validateLinkSession", () => ({
  peekLinkSessionShow: () => validatorMock.state.peekResult,
  validateLinkSession: async () => {
    validatorMock.state.validateLinkSessionCallCount += 1;
    return validatorMock.state.linkResult;
  },
}));
vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => validatorMock.state.googleResult,
}));

// Mock the service-role Supabase client so we control the slug-resolution
// step without hitting a live DB. Tests flip `slugLookupRow` to drive the
// "unknown_slug" branch vs the success branch.
const supabaseMock = vi.hoisted(() => {
  return {
    state: {
      // null → no row; { id, published } → resolves to that show_id.
      slugLookupRow: null as null | { id: string; published: boolean },
      slugLookupError: null as null | { message: string },
      lastSlugQueried: null as null | string,
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
  createSupabaseServiceRoleClient: () => ({
    from: (table: string) => {
      if (table !== "shows") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: (_col: string, value: string) => {
            supabaseMock.state.lastSlugQueried = value;
            return {
              maybeSingle: async () => ({
                data: supabaseMock.state.slugLookupRow,
                error: supabaseMock.state.slugLookupError,
              }),
            };
          },
        }),
      };
    },
  }),
}));

const { resolveShowViewer } = await import("@/lib/auth/resolveShowViewer");

function fakeReq(): NextRequest {
  // The validators don't actually read the request in tests (we mock them);
  // a minimal stub object is sufficient to satisfy the signature.
  return {} as unknown as NextRequest;
}

beforeEach(() => {
  validatorMock.state.adminResult = { ok: false };
  validatorMock.state.peekResult = { kind: "no_cookie" };
  validatorMock.state.linkResult = {
    kind: "continue",
  };
  validatorMock.state.googleResult = {
    kind: "continue",
  };
  validatorMock.state.validateLinkSessionCallCount = 0;
  supabaseMock.state.slugLookupRow = { id: "show-uuid-1", published: true };
  supabaseMock.state.slugLookupError = null;
  supabaseMock.state.lastSlugQueried = null;
});

describe("resolveShowViewer — 5-arm discriminated union", () => {
  test("(1) unknown slug → denied (reason: unknown_slug)", async () => {
    supabaseMock.state.slugLookupRow = null;
    const result = await resolveShowViewer(fakeReq(), "unknown-show");
    expect(result.kind).toBe("denied");
    if (result.kind === "denied") {
      expect(result.reason).toBe("unknown_slug");
    }
    expect(supabaseMock.state.lastSlugQueried).toBe("unknown-show");
  });

  test("(2) admin session → admin arm with email + show_id (admin precedence over crew validators)", async () => {
    validatorMock.state.adminResult = {
      ok: true,
      email: "edweiss412@gmail.com",
    };
    // A successful crew_link result that would normally win — but admin
    // precedence means the admin arm fires first.
    validatorMock.state.linkResult = {
      kind: "success",
      viewer: { kind: "crew", showId: "show-uuid-1", crewMemberId: "crew-1" },
    };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    expect(result.kind).toBe("admin");
    if (result.kind === "admin") {
      expect(result.email).toBe("edweiss412@gmail.com");
      expect(result.show_id).toBe("show-uuid-1");
    }
  });

  test("admin session can resolve an unpublished show", async () => {
    supabaseMock.state.slugLookupRow = { id: "show-uuid-1", published: false };
    validatorMock.state.adminResult = {
      ok: true,
      email: "edweiss412@gmail.com",
    };

    const result = await resolveShowViewer(fakeReq(), "draft-show");

    expect(result.kind).toBe("admin");
    if (result.kind === "admin") {
      expect(result.show_id).toBe("show-uuid-1");
    }
  });

  test("link crew session for unpublished show resolves as not found", async () => {
    supabaseMock.state.slugLookupRow = { id: "show-uuid-1", published: false };
    validatorMock.state.linkResult = {
      kind: "success",
      viewer: { kind: "crew", showId: "show-uuid-1", crewMemberId: "crew-99" },
    };

    const result = await resolveShowViewer(fakeReq(), "draft-show");

    expect(result.kind).toBe("denied");
    if (result.kind === "denied") {
      expect(result.reason).toBe("unknown_slug");
    }
  });

  test("google crew session for unpublished show resolves as not found", async () => {
    supabaseMock.state.slugLookupRow = { id: "show-uuid-1", published: false };
    validatorMock.state.googleResult = {
      kind: "success",
      viewer: {
        kind: "crew",
        email: "alice@fxav.test",
        showId: "show-uuid-1",
        crewMemberId: "crew-77",
      },
    };

    const result = await resolveShowViewer(fakeReq(), "draft-show");

    expect(result.kind).toBe("denied");
    if (result.kind === "denied") {
      expect(result.reason).toBe("unknown_slug");
    }
  });

  test("(3a) link session matching show → crew_link arm", async () => {
    validatorMock.state.linkResult = {
      kind: "success",
      viewer: { kind: "crew", showId: "show-uuid-1", crewMemberId: "crew-99" },
    };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    expect(result.kind).toBe("crew_link");
    if (result.kind === "crew_link") {
      expect(result.show_id).toBe("show-uuid-1");
      expect(result.crew_member_id).toBe("crew-99");
    }
  });

  test("(3b) link session for DIFFERENT show → forbidden (cross_show_link_session) carrying validator's resolved show_id", async () => {
    // Per plan §789 + §826, the forbidden arm must carry the validator's
    // resolved show_id (the show the cookie ACTUALLY belongs to) so admin-info
    // logs can record the cross-show diagnostic. The slug-resolved show is
    // "show-uuid-1"; the cookie's session is for "different-show-uuid"; the
    // forbidden return must surface the LATTER.
    validatorMock.state.linkResult = {
      kind: "success",
      viewer: {
        kind: "crew",
        showId: "different-show-uuid",
        crewMemberId: "crew-99",
      },
    };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    // CRITICAL: this is forbidden (403), NOT denied (401). A valid session for
    // a different show is a different failure mode than no session at all.
    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toBe("cross_show_link_session");
      expect(result.show_id).toBe("different-show-uuid");
      // link variant has no email; field is undefined.
      expect(result.email).toBeUndefined();
    }
  });

  test("(4a) google session matching show → crew_google arm", async () => {
    validatorMock.state.googleResult = {
      kind: "success",
      viewer: {
        kind: "crew",
        email: "alice@fxav.test",
        showId: "show-uuid-1",
        crewMemberId: "crew-77",
      },
    };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    expect(result.kind).toBe("crew_google");
    if (result.kind === "crew_google") {
      expect(result.email).toBe("alice@fxav.test");
      expect(result.show_id).toBe("show-uuid-1");
      expect(result.crew_member_id).toBe("crew-77");
    }
  });

  test("(4b) google session for DIFFERENT show → forbidden (cross_show_google_session) carrying validator's resolved show_id + email", async () => {
    // The google variant carries BOTH show_id (validator's resolved show, for
    // cross-show diagnostics) AND email (operator identity, so admin-info
    // logs don't have to re-query crew_member_auth). See plan §789 + §826.
    validatorMock.state.googleResult = {
      kind: "success",
      viewer: {
        kind: "crew",
        email: "alice@fxav.test",
        showId: "different-show-uuid",
        crewMemberId: "crew-77",
      },
    };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toBe("cross_show_google_session");
      expect(result.show_id).toBe("different-show-uuid");
      expect(result.email).toBe("alice@fxav.test");
    }
  });

  test("(5) no credentials → denied (reason: no_credentials)", async () => {
    // All validators return failure; slug resolves successfully.
    const result = await resolveShowViewer(fakeReq(), "test-show");
    expect(result.kind).toBe("denied");
    if (result.kind === "denied") {
      expect(result.reason).toBe("no_credentials");
    }
  });

  test("denied vs forbidden are DISTINCT kinds (status-code mapping invariant)", async () => {
    // Drive the cross-show forbidden case ...
    validatorMock.state.linkResult = {
      kind: "success",
      viewer: {
        kind: "crew",
        showId: "different-show-uuid",
        crewMemberId: "crew-99",
      },
    };
    const forbiddenResult = await resolveShowViewer(fakeReq(), "test-show");

    // ... and the no-credentials denied case.
    validatorMock.state.linkResult = {
      kind: "continue",
    };
    const deniedResult = await resolveShowViewer(fakeReq(), "test-show");

    expect(forbiddenResult.kind).toBe("forbidden");
    expect(deniedResult.kind).toBe("denied");
    expect(forbiddenResult.kind).not.toBe(deniedResult.kind);
  });

  test("slug resolves before validator chain (unknown_slug short-circuits even with valid session)", async () => {
    // If a future regression placed admin/link/google checks BEFORE slug
    // resolution, an unknown_slug request with a valid admin cookie would
    // return `admin` instead of `denied(unknown_slug)`. The plan calls for
    // slug-first resolution.
    supabaseMock.state.slugLookupRow = null;
    validatorMock.state.adminResult = {
      ok: true,
      email: "edweiss412@gmail.com",
    };
    const result = await resolveShowViewer(fakeReq(), "nonexistent-show");
    expect(result.kind).toBe("denied");
    if (result.kind === "denied") {
      expect(result.reason).toBe("unknown_slug");
    }
  });

  // ── Codex round-25 HIGH — cross-show signed-link 403 boundary ───────

  test("Codex round-25 HIGH — cross-show signed-link cookie routes to forbidden BEFORE destructive validateLinkSession runs", async () => {
    // Cookie envelope says show-uuid-OTHER; request asks for show-uuid-1.
    // Pre-fix: peek did not exist, validateLinkSession ran with
    // showId=show-uuid-1, saw cookie show=show-uuid-OTHER, deleted
    // the session + returned 'continue', resolveShowViewer mapped
    // that to denied/401. Crew got 401 instead of 403 AND lost
    // their valid show-OTHER session.
    //
    // Post-fix: peek catches the cross-show cookie BEFORE the
    // destructive validator runs. Result is forbidden with the
    // cookie's actual show_id, no DB hit, no deletion.
    validatorMock.state.peekResult = {
      kind: "envelope",
      showId: "show-uuid-OTHER",
    };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.reason).toBe("cross_show_link_session");
      expect(result.show_id).toBe("show-uuid-OTHER");
    }
    // Critical: validateLinkSession was NEVER called. Pre-fix it
    // ran and destroyed the session.
    expect(validatorMock.state.validateLinkSessionCallCount).toBe(0);
  });

  test("Codex round-25 HIGH — in-context signed-link cookie still flows through validateLinkSession", async () => {
    // Anti-tautology: when the cookie envelope's show_id matches
    // the requested show_id, peek does NOT short-circuit; the
    // normal validator runs as before.
    validatorMock.state.peekResult = {
      kind: "envelope",
      showId: "show-uuid-1",
    };
    validatorMock.state.linkResult = {
      kind: "success",
      viewer: {
        kind: "crew",
        showId: "show-uuid-1",
        crewMemberId: "crew-1",
      },
    };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    expect(result.kind).toBe("crew_link");
    // Critical: validateLinkSession DID run (peek didn't short-
    // circuit).
    expect(validatorMock.state.validateLinkSessionCallCount).toBe(1);
  });

  test("Codex round-25 HIGH — no cookie → peek returns no_cookie, normal flow continues", async () => {
    // Defensive: peek with no_cookie must NOT classify as forbidden;
    // the normal flow runs (validator returns continue → denied).
    validatorMock.state.peekResult = { kind: "no_cookie" };
    validatorMock.state.linkResult = { kind: "continue" };
    const result = await resolveShowViewer(fakeReq(), "test-show");
    // No admin, no link, no google → denied no_credentials.
    expect(result.kind).toBe("denied");
    expect(validatorMock.state.validateLinkSessionCallCount).toBe(1);
  });
});
