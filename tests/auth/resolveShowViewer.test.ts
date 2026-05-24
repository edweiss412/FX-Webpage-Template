/**
 * E1 narrows resolveShowViewer to the admin/denied/terminal helper that
 * remains while API consumers are migrated to picker auth.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";

const authMock = vi.hoisted(() => ({
  state: {
    adminResult: { ok: false, reason: "not_admin" } as
      | { ok: true; email: string }
      | { ok: false; reason: "not_admin" | "infra_error" },
  },
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => authMock.state.adminResult,
}));

const supabaseMock = vi.hoisted(() => ({
  state: {
    slugLookupRow: null as null | { id: string; published: boolean },
    slugLookupError: null as null | { message: string },
    throwOnClient: false,
    lastSlugQueried: null as null | string,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (supabaseMock.state.throwOnClient) throw new Error("missing env");
    return {
      from: (table: string) => {
        if (table !== "shows") throw new Error(`unexpected table: ${table}`);
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
    };
  },
}));

const { resolveShowViewer } = await import("@/lib/auth/resolveShowViewer");

function fakeReq(): NextRequest {
  return {} as unknown as NextRequest;
}

beforeEach(() => {
  authMock.state.adminResult = { ok: false, reason: "not_admin" };
  supabaseMock.state.slugLookupRow = { id: "show-uuid-1", published: true };
  supabaseMock.state.slugLookupError = null;
  supabaseMock.state.throwOnClient = false;
  supabaseMock.state.lastSlugQueried = null;
});

describe("resolveShowViewer — E1 admin-only legacy helper", () => {
  test("source no longer imports legacy link or Google crew validators", () => {
    const source = readFileSync("lib/auth/resolveShowViewer.ts", "utf8");

    expect(source).not.toMatch(/crew_link/);
    expect(source).not.toMatch(/crew_google/);
    expect(source).not.toMatch(/validateLinkSession/);
    expect(source).not.toMatch(/validateGoogleSession/);
  });

  test("unknown slug resolves before admin and returns denied", async () => {
    supabaseMock.state.slugLookupRow = null;
    authMock.state.adminResult = { ok: true, email: "admin@example.com" };

    const result = await resolveShowViewer(fakeReq(), "unknown-show");

    expect(result).toEqual({ kind: "denied", reason: "unknown_slug" });
    expect(supabaseMock.state.lastSlugQueried).toBe("unknown-show");
  });

  test("admin session returns admin arm and can resolve unpublished shows", async () => {
    supabaseMock.state.slugLookupRow = { id: "show-uuid-1", published: false };
    authMock.state.adminResult = { ok: true, email: "admin@example.com" };

    await expect(resolveShowViewer(fakeReq(), "draft-show")).resolves.toEqual({
      kind: "admin",
      email: "admin@example.com",
      show_id: "show-uuid-1",
    });
  });

  test("non-admin unpublished show is denied as unknown slug", async () => {
    supabaseMock.state.slugLookupRow = { id: "show-uuid-1", published: false };

    await expect(resolveShowViewer(fakeReq(), "draft-show")).resolves.toEqual({
      kind: "denied",
      reason: "unknown_slug",
    });
  });

  test("non-admin published show falls through to no_credentials", async () => {
    await expect(resolveShowViewer(fakeReq(), "test-show")).resolves.toEqual({
      kind: "denied",
      reason: "no_credentials",
    });
  });

  test("slug lookup returned errors or throws are terminal infra failures", async () => {
    supabaseMock.state.slugLookupError = { message: "db failed" };
    await expect(resolveShowViewer(fakeReq(), "test-show")).resolves.toEqual({
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });

    supabaseMock.state.slugLookupError = null;
    supabaseMock.state.throwOnClient = true;
    await expect(resolveShowViewer(fakeReq(), "test-show")).resolves.toEqual({
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
  });

  test("admin infra failure is terminal instead of auth denial", async () => {
    authMock.state.adminResult = { ok: false, reason: "infra_error" };

    await expect(resolveShowViewer(fakeReq(), "test-show")).resolves.toEqual({
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
  });
});
