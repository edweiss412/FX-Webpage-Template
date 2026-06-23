import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { encodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import {
  resolveShowPageAccess,
  type ResolveShowPageAccessResult,
} from "@/lib/auth/picker/resolveShowPageAccess";
import { resolvePickerSelection } from "@/lib/auth/picker/resolvePickerSelection";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({ resolvePickerSelection: vi.fn() }));
vi.mock("@/lib/auth/isAdminSession", () => ({ isAdminSession: vi.fn() }));
vi.mock("@/lib/auth/validateGoogleSession", () => ({ validateGoogleSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));

const KEY = "0".repeat(64);
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const CREW_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_CREW_ID = "33333333-3333-3333-3333-333333333333";
const SLUG = "show-one";
const TOKEN = "a".repeat(64);
const COOKIE_NAME = "__Host-fxav_picker";

type ShowRow = { id: string; published: boolean; archived: boolean };
type CrewClaimRow = { claimed_via_oauth_at: string | null };

let resolvedShowId: string | null;
let resolveError: unknown;
let showRow: ShowRow | null;
let showError: unknown;
let crewClaimRow: CrewClaimRow | null;
let crewError: unknown;

function req(cookie?: string): Request {
  const init = cookie ? { headers: { cookie: `${COOKIE_NAME}=${cookie}` } } : undefined;
  return new Request(`https://crew.fxav.show/show/${SLUG}/${TOKEN}`, init);
}

function pickerCookie(input: { crewMemberId?: string; t?: number } = {}): string {
  return encodePickerCookie(
    {
      v: 1,
      selections: {
        [SHOW_ID]: {
          id: input.crewMemberId ?? CREW_ID,
          e: 7,
          t: input.t ?? 1_737_028_800_124,
        },
      },
    },
    KEY,
  );
}

function queryResultFor(table: string) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => {
          if (table === "shows") return { data: showRow, error: showError };
          if (table === "crew_members") return { data: crewClaimRow, error: crewError };
          return { data: null, error: new Error(`unexpected table ${table}`) };
        }),
      })),
    })),
  };
}

beforeEach(() => {
  process.env.PICKER_COOKIE_SIGNING_KEY = KEY;
  resolvedShowId = SHOW_ID;
  resolveError = null;
  showRow = { id: SHOW_ID, published: true, archived: false };
  showError = null;
  crewClaimRow = { claimed_via_oauth_at: "2025-01-15T12:00:00.123Z" };
  crewError = null;

  vi.mocked(isAdminSession).mockReset();
  vi.mocked(isAdminSession).mockResolvedValue({ ok: false, reason: "not_admin" });
  vi.mocked(validateGoogleSession).mockReset();
  vi.mocked(validateGoogleSession).mockResolvedValue({ kind: "continue" });
  vi.mocked(resolvePickerSelection).mockReset();
  vi.mocked(resolvePickerSelection).mockResolvedValue({ kind: "no_selection" });
  vi.mocked(createSupabaseServiceRoleClient).mockReset();
  vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
    rpc: vi.fn(async () => ({ data: resolvedShowId, error: resolveError })),
    from: vi.fn((table: string) => queryResultFor(table)),
  } as never);
});

describe("resolveShowPageAccess", () => {
  test("resolves archived before admin, unpublished before Google, and admin before unpublished", async () => {
    showRow = { id: SHOW_ID, published: true, archived: true };
    vi.mocked(isAdminSession).mockResolvedValue({ ok: true, email: "admin@example.com" });
    await expect(
      resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req() }),
    ).resolves.toEqual({
      kind: "archived",
    });
    expect(validateGoogleSession).not.toHaveBeenCalled();

    showRow = { id: SHOW_ID, published: false, archived: false };
    await expect(
      resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req() }),
    ).resolves.toEqual({
      kind: "admin",
      showId: SHOW_ID,
    });

    vi.mocked(isAdminSession).mockResolvedValue({ ok: false, reason: "not_admin" });
    await expect(
      resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req() }),
    ).resolves.toEqual({
      kind: "unpublished",
    });
    expect(validateGoogleSession).not.toHaveBeenCalled();
  });

  test("returns terminal show and infra errors without page-rendering showId", async () => {
    resolvedShowId = null;
    await expect(
      resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req() }),
    ).resolves.toEqual({
      kind: "show_unavailable",
    });

    resolveError = { message: "db failed" };
    await expect(
      resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req() }),
    ).resolves.toEqual({
      kind: "infra_error",
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
  });

  test("routes a matching Google session with no acceptable cookie to picker bootstrap", async () => {
    vi.mocked(validateGoogleSession).mockResolvedValue({
      kind: "success",
      viewer: { kind: "crew", email: "crew@example.com", showId: SHOW_ID, crewMemberId: CREW_ID },
    });

    const result = await resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req() });

    expect(result.kind).toBe("needs_picker_bootstrap");
    if (result.kind === "needs_picker_bootstrap") {
      expect(result.intentToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    }
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test("keeps a same-user post-claim cookie on the cookie resolver path", async () => {
    vi.mocked(validateGoogleSession).mockResolvedValue({
      kind: "success",
      viewer: { kind: "crew", email: "crew@example.com", showId: SHOW_ID, crewMemberId: CREW_ID },
    });
    vi.mocked(resolvePickerSelection).mockResolvedValue({
      kind: "resolved",
      crewMemberId: CREW_ID,
    });

    await expect(
      resolveShowPageAccess({
        slug: SLUG,
        shareToken: TOKEN,
        req: req(pickerCookie({ t: 1_737_028_800_124 })),
      }),
    ).resolves.toEqual({
      kind: "resolved",
      showId: SHOW_ID,
      crewMemberId: CREW_ID,
      source: "cookie",
    });
  });

  test("Google no-crew-match is terminal google_mismatch and never consumes a stale picker cookie", async () => {
    vi.mocked(validateGoogleSession).mockResolvedValue({
      kind: "continue",
      code: "GOOGLE_NO_CREW_MATCH",
    });
    vi.mocked(resolvePickerSelection).mockResolvedValue({
      kind: "resolved",
      crewMemberId: OTHER_CREW_ID,
    });

    await expect(
      resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req(pickerCookie()) }),
    ).resolves.toEqual({
      kind: "no_auth",
      showId: SHOW_ID,
      reason: "google_mismatch",
    });
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test.each([
    [
      { kind: "no_selection" as const },
      { kind: "no_auth", showId: SHOW_ID, reason: "first_contact" },
    ],
    [
      { kind: "epoch_stale" as const, expectedEpoch: 6, expectedCrewMemberId: CREW_ID },
      { kind: "epoch_stale", showId: SHOW_ID, expectedEpoch: 6, expectedCrewMemberId: CREW_ID },
    ],
    [
      { kind: "removed_from_roster" as const, expectedEpoch: 7, expectedCrewMemberId: CREW_ID },
      {
        kind: "removed_from_roster",
        showId: SHOW_ID,
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
      },
    ],
    [
      {
        kind: "identity_invalidated" as const,
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
        reason: "session_mismatch" as const,
      },
      {
        kind: "identity_invalidated",
        showId: SHOW_ID,
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
        reason: "session_mismatch",
      },
    ],
    [{ kind: "show_unavailable" as const }, { kind: "show_unavailable" }],
    [
      { kind: "infra_error" as const, code: "PICKER_RESOLVER_LOOKUP_FAILED" as const },
      { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" },
    ],
  ])("maps cookie resolver result %j", async (pickerResult, expected) => {
    vi.mocked(resolvePickerSelection).mockResolvedValue(pickerResult);

    await expect(
      resolveShowPageAccess({ slug: SLUG, shareToken: TOKEN, req: req(pickerCookie()) }),
    ).resolves.toEqual(expected);
  });

  test("type contract keeps showId only on page-rendering arms", () => {
    type PageRenderingKind =
      | "admin"
      | "resolved"
      | "no_auth"
      | "epoch_stale"
      | "removed_from_roster"
      | "identity_invalidated";
    type TerminalKind = Exclude<ResolveShowPageAccessResult["kind"], PageRenderingKind>;
    type PageRenderingArm = Extract<ResolveShowPageAccessResult, { kind: PageRenderingKind }>;
    type TerminalArm = Extract<ResolveShowPageAccessResult, { kind: TerminalKind }>;
    const pageArm: PageRenderingArm = { kind: "admin", showId: SHOW_ID };
    const terminalArm: TerminalArm = { kind: "archived" };

    expect(pageArm.showId).toBe(SHOW_ID);
    expect("showId" in terminalArm).toBe(false);
  });

  test("static guard: helper is pure and does not import cookie mutators or Next cookies", () => {
    const source = readFileSync("lib/auth/picker/resolveShowPageAccess.ts", "utf8");
    expect(source).not.toMatch(/next\/headers/);
    expect(source).not.toMatch(/\bcookies\s*\(/);
    expect(source).not.toMatch(/\bencodePickerCookie\b/);
    expect(source).not.toMatch(/\bsignEnvelope\b/);
  });
});
