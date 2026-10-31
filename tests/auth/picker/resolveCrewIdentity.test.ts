/**
 * tests/auth/picker/resolveCrewIdentity.test.ts
 *
 * The identity half of the crew page's access resolution (spec §4.5): the
 * Google-session block and the picker selection that run after the page's
 * archived, admin and unpublished gates. The page and the saved-copy status
 * route both call this one function, so its outcomes are pinned here against
 * the values the page returned before the extraction, the picker half is
 * pinned to forward the caller's epoch check, and the page is pinned to pass
 * the current one.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { encodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import { resolveCrewIdentity, type EpochCheck } from "@/lib/auth/picker/resolveCrewIdentity";
import {
  resolvePickerSelection,
  type ResolvePickerSelectionResult,
} from "@/lib/auth/picker/resolvePickerSelection";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { resetLogSink, setLogSink, type LogRecord } from "@/lib/log";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({ resolvePickerSelection: vi.fn() }));
vi.mock("@/lib/auth/validateGoogleSession", () => ({ validateGoogleSession: vi.fn() }));
vi.mock("@/lib/auth/isAdminSession", () => ({ isAdminSession: vi.fn() }));
vi.mock("@/lib/env/pickerCookieSigningKey", () => ({ pickerCookieSigningKey: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

const KEY = "0".repeat(64);
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_CREW_ID = "33333333-3333-3333-3333-333333333333";
const COOKIE_NAME = "__Host-fxav_picker";
const CLAIMED_AT = "2025-01-15T12:00:00.123Z";
const CLAIMED_MILLIS = new Date(CLAIMED_AT).getTime();
const PICKED_AT = CLAIMED_MILLIS + 1;
const CURRENT: EpochCheck = { kind: "current" };

type CrewClaimRow = { claimed_via_oauth_at: string | null; selections_reset_at: string | null };

let crewClaimRow: CrewClaimRow | null;
let crewError: unknown;
let crewThrows: boolean;
let records: LogRecord[];

function serviceRoleFake() {
  const maybeSingle = vi.fn(async () => {
    if (crewThrows) throw new Error("fetch failed");
    return { data: crewClaimRow, error: crewError };
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq };
}

function pickerCookie(input: { showId?: string; crewMemberId?: string; t?: number } = {}) {
  return encodePickerCookie(
    {
      v: 1,
      selections: {
        [input.showId ?? SHOW_ID]: {
          id: input.crewMemberId ?? CREW_ID,
          e: 7,
          t: input.t ?? PICKED_AT,
        },
      },
    },
    KEY,
  );
}

function req(cookie?: string): Request {
  const init = cookie ? { headers: { cookie: `other=1; ${COOKIE_NAME}=${cookie}` } } : undefined;
  return new Request("https://crew.fxav.show/show/show-one/aa11", init);
}

function googleSuccess(crewMemberId = CREW_ID): void {
  vi.mocked(validateGoogleSession).mockResolvedValue({
    kind: "success",
    viewer: { kind: "crew", email: "crew@example.com", showId: SHOW_ID, crewMemberId },
  });
}

function failClosedSites(): unknown[] {
  return records
    .filter((r) => r.code === "PICKER_RESOLVER_LOOKUP_FAILED")
    .map((r) => {
      expect(r.level).toBe("warn");
      expect(r.source).toBe("auth.picker.resolveShowPageAccess");
      return r.context.site;
    });
}

beforeEach(() => {
  crewClaimRow = { claimed_via_oauth_at: CLAIMED_AT, selections_reset_at: null };
  crewError = null;
  crewThrows = false;
  records = [];
  setLogSink((r) => {
    records.push(r);
  });

  vi.mocked(pickerCookieSigningKey).mockReset();
  vi.mocked(pickerCookieSigningKey).mockReturnValue(KEY);
  vi.mocked(validateGoogleSession).mockReset();
  vi.mocked(validateGoogleSession).mockResolvedValue({ kind: "continue" });
  vi.mocked(resolvePickerSelection).mockReset();
  vi.mocked(resolvePickerSelection).mockResolvedValue({ kind: "resolved", crewMemberId: CREW_ID });
  vi.mocked(createSupabaseServiceRoleClient).mockReset();
  vi.mocked(isAdminSession).mockReset();
  vi.mocked(isAdminSession).mockResolvedValue({ ok: false, reason: "not_admin" });
});

afterEach(() => {
  resetLogSink();
  // The caller hands in its client; this module never builds one.
  expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
});

describe("resolveCrewIdentity: the picker half", () => {
  test.each<[string, EpochCheck]>([
    ["current", { kind: "current" }],
    ["saved", { kind: "saved", epoch: 6 }],
  ])("forwards the %s epoch check, the show id and the raw cookie", async (_label, epochCheck) => {
    const cookie = pickerCookie();
    const { client } = serviceRoleFake();

    await expect(
      resolveCrewIdentity({ showId: SHOW_ID, req: req(cookie), epochCheck, serviceRole: client }),
    ).resolves.toEqual({ kind: "resolved", crewMemberId: CREW_ID });

    expect(resolvePickerSelection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolvePickerSelection).mock.calls[0]![0]).toStrictEqual({
      showId: SHOW_ID,
      cookie,
      epochCheck,
    });
  });

  test("forwards an absent cookie as undefined", async () => {
    const { client } = serviceRoleFake();

    await resolveCrewIdentity({
      showId: SHOW_ID,
      req: req(),
      epochCheck: CURRENT,
      serviceRole: client,
    });

    expect(vi.mocked(resolvePickerSelection).mock.calls[0]![0]).toStrictEqual({
      showId: SHOW_ID,
      cookie: undefined,
      epochCheck: CURRENT,
    });
  });

  test.each<[ResolvePickerSelectionResult, unknown]>([
    [{ kind: "no_selection" }, { kind: "no_auth", reason: "first_contact" }],
    [
      { kind: "resolved", crewMemberId: CREW_ID },
      { kind: "resolved", crewMemberId: CREW_ID },
    ],
    [
      { kind: "epoch_stale", expectedEpoch: 6, expectedCrewMemberId: CREW_ID },
      { kind: "epoch_stale", expectedEpoch: 6, expectedCrewMemberId: CREW_ID },
    ],
    [
      { kind: "removed_from_roster", expectedEpoch: 7, expectedCrewMemberId: CREW_ID },
      { kind: "removed_from_roster", expectedEpoch: 7, expectedCrewMemberId: CREW_ID },
    ],
    [
      { kind: "selection_reset", expectedEpoch: 7, expectedCrewMemberId: CREW_ID },
      { kind: "selection_reset", expectedEpoch: 7, expectedCrewMemberId: CREW_ID },
    ],
    [
      {
        kind: "identity_invalidated",
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
        reason: "claimed_after_pick",
      },
      {
        kind: "identity_invalidated",
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
        reason: "claimed_after_pick",
      },
    ],
    [
      {
        kind: "identity_invalidated",
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
        reason: "session_mismatch",
      },
      {
        kind: "identity_invalidated",
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
        reason: "session_mismatch",
      },
    ],
    [{ kind: "show_unavailable" }, { kind: "show_unavailable" }],
  ])("maps picker result %j", async (pickerResult, expected) => {
    vi.mocked(resolvePickerSelection).mockResolvedValue(pickerResult);
    const { client } = serviceRoleFake();

    await expect(
      resolveCrewIdentity({
        showId: SHOW_ID,
        req: req(pickerCookie()),
        epochCheck: CURRENT,
        serviceRole: client,
      }),
    ).resolves.toStrictEqual(expected);
    expect(failClosedSites()).toEqual([]);
  });

  test("a picker infra fault fails closed and names the picker_selection site", async () => {
    vi.mocked(resolvePickerSelection).mockResolvedValue({
      kind: "infra_error",
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
    const { client } = serviceRoleFake();

    await expect(
      resolveCrewIdentity({
        showId: SHOW_ID,
        req: req(pickerCookie()),
        epochCheck: CURRENT,
        serviceRole: client,
      }),
    ).resolves.toStrictEqual({ kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    expect(failClosedSites()).toEqual(["picker_selection"]);
  });

  test("with no Google session the picker cookie is never decoded here", async () => {
    const { client, from } = serviceRoleFake();

    await resolveCrewIdentity({
      showId: SHOW_ID,
      req: req(pickerCookie()),
      epochCheck: CURRENT,
      serviceRole: client,
    });

    expect(validateGoogleSession).toHaveBeenCalledWith(expect.any(Request), { showId: SHOW_ID });
    expect(pickerCookieSigningKey).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("resolveCrewIdentity: the Google-session branch", () => {
  test("a terminal Google failure fails closed before the picker half", async () => {
    vi.mocked(validateGoogleSession).mockResolvedValue({
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    const { client } = serviceRoleFake();

    await expect(
      resolveCrewIdentity({
        showId: SHOW_ID,
        req: req(pickerCookie()),
        epochCheck: CURRENT,
        serviceRole: client,
      }),
    ).resolves.toStrictEqual({ kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    expect(failClosedSites()).toEqual(["google_session"]);
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test("a Google session with no crew match is google_mismatch and never reads the cookie", async () => {
    vi.mocked(validateGoogleSession).mockResolvedValue({
      kind: "continue",
      code: "GOOGLE_NO_CREW_MATCH",
    });
    const { client } = serviceRoleFake();

    await expect(
      resolveCrewIdentity({
        showId: SHOW_ID,
        req: req(pickerCookie({ crewMemberId: OTHER_CREW_ID })),
        epochCheck: CURRENT,
        serviceRole: client,
      }),
    ).resolves.toStrictEqual({ kind: "no_auth", reason: "google_mismatch" });
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test("an unavailable signing key fails closed and names the picker_cookie_key site", async () => {
    googleSuccess();
    vi.mocked(pickerCookieSigningKey).mockImplementation(() => {
      throw new Error("PICKER_COOKIE_SIGNING_KEY is unset");
    });
    const { client } = serviceRoleFake();

    await expect(
      resolveCrewIdentity({
        showId: SHOW_ID,
        req: req(pickerCookie()),
        epochCheck: CURRENT,
        serviceRole: client,
      }),
    ).resolves.toStrictEqual({ kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    expect(failClosedSites()).toEqual(["picker_cookie_key"]);
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test.each<[string, () => string | undefined]>([
    ["no picker cookie", () => undefined],
    ["an entry for another show only", () => pickerCookie({ showId: OTHER_SHOW_ID })],
    ["an entry for a different crew member", () => pickerCookie({ crewMemberId: OTHER_CREW_ID })],
  ])("%s routes to picker bootstrap without a token", async (_label, cookie) => {
    googleSuccess();
    const { client, from } = serviceRoleFake();

    const result = await resolveCrewIdentity({
      showId: SHOW_ID,
      req: req(cookie()),
      epochCheck: CURRENT,
      serviceRole: client,
    });

    expect(result).toStrictEqual({ kind: "needs_picker_bootstrap" });
    expect(from).not.toHaveBeenCalled();
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test("reads the claim row for the Google viewer through the caller's client", async () => {
    googleSuccess();
    const { client, from, select, eq } = serviceRoleFake();

    await resolveCrewIdentity({
      showId: SHOW_ID,
      req: req(pickerCookie()),
      epochCheck: CURRENT,
      serviceRole: client,
    });

    expect(from).toHaveBeenCalledWith("crew_members");
    expect(select).toHaveBeenCalledWith("claimed_via_oauth_at, selections_reset_at");
    expect(eq).toHaveBeenCalledWith("id", CREW_ID);
  });

  test.each<[string, () => void, string]>([
    [
      "a returned error",
      () => {
        crewError = { message: "db failed" };
      },
      "crew_claim_read",
    ],
    [
      "a thrown read",
      () => {
        crewThrows = true;
      },
      "crew_claim_read_threw",
    ],
  ])("a claim-row read with %s fails closed and names its site", async (_label, arrange, site) => {
    googleSuccess();
    arrange();
    const { client } = serviceRoleFake();

    await expect(
      resolveCrewIdentity({
        showId: SHOW_ID,
        req: req(pickerCookie()),
        epochCheck: CURRENT,
        serviceRole: client,
      }),
    ).resolves.toStrictEqual({ kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    expect(failClosedSites()).toEqual([site]);
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test.each<[string, () => void, number]>([
    [
      "a missing crew row",
      () => {
        crewClaimRow = null;
      },
      PICKED_AT,
    ],
    [
      "an unclaimed member",
      () => {
        crewClaimRow = { claimed_via_oauth_at: null, selections_reset_at: null };
      },
      PICKED_AT,
    ],
    ["a pick at the claim instant", () => {}, CLAIMED_MILLIS],
    ["a pick before the claim", () => {}, CLAIMED_MILLIS - 1000],
    [
      "a selection reset at or after the pick",
      () => {
        crewClaimRow = {
          claimed_via_oauth_at: CLAIMED_AT,
          selections_reset_at: new Date(PICKED_AT).toISOString(),
        };
      },
      PICKED_AT,
    ],
  ])("%s routes to picker bootstrap without a token", async (_label, arrange, t) => {
    googleSuccess();
    arrange();
    const { client } = serviceRoleFake();

    const result = await resolveCrewIdentity({
      showId: SHOW_ID,
      req: req(pickerCookie({ t })),
      epochCheck: CURRENT,
      serviceRole: client,
    });

    expect(result).toStrictEqual({ kind: "needs_picker_bootstrap" });
    expect(resolvePickerSelection).not.toHaveBeenCalled();
  });

  test.each<[string, string | null]>([
    ["no selection reset", null],
    ["a selection reset before the pick", new Date(PICKED_AT - 1).toISOString()],
    ["a malformed reset marker (fails open)", "not-a-date"],
  ])(
    "a claimed member picked after the claim with %s goes on to the picker half",
    async (_label, resetAt) => {
      googleSuccess();
      crewClaimRow = { claimed_via_oauth_at: CLAIMED_AT, selections_reset_at: resetAt };
      vi.mocked(resolvePickerSelection).mockResolvedValue({
        kind: "selection_reset",
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
      });
      const { client } = serviceRoleFake();
      const epochCheck: EpochCheck = { kind: "saved", epoch: 7 };

      await expect(
        resolveCrewIdentity({
          showId: SHOW_ID,
          req: req(pickerCookie()),
          epochCheck,
          serviceRole: client,
        }),
      ).resolves.toStrictEqual({
        kind: "selection_reset",
        expectedEpoch: 7,
        expectedCrewMemberId: CREW_ID,
      });
      expect(resolvePickerSelection).toHaveBeenCalledTimes(1);
      expect(vi.mocked(resolvePickerSelection).mock.calls[0]![0]).toMatchObject({ epochCheck });
    },
  );
});

describe("resolveCrewIdentity: static guards", () => {
  // The static guard on resolveShowPageAccess.ts covered this code before it
  // moved here, so the same properties are pinned on its new home.
  test("the module is pure: no cookie mutators, no Next cookies, no client of its own", () => {
    const source = readFileSync("lib/auth/picker/resolveCrewIdentity.ts", "utf8");
    expect(source).toMatch(/\bresolvePickerSelection\(/); // premise: the file read is the module
    expect(source).not.toMatch(/next\/headers/);
    expect(source).not.toMatch(/\bcookies\s*\(/);
    expect(source).not.toMatch(/\bencodePickerCookie\b/);
    expect(source).not.toMatch(/\bsignEnvelope\b/);
    expect(source).not.toMatch(/\bcreateSupabase(?:ServiceRole|Server)Client\s*\(/);
  });

  test("resolveShowPageAccess imports the shared fail-closed helpers instead of keeping copies", () => {
    const source = readFileSync("lib/auth/picker/resolveShowPageAccess.ts", "utf8");
    expect(source).toMatch(/from "@\/lib\/auth\/picker\/resolveCrewIdentity"/);
    expect(source).not.toMatch(
      /\bfunction\s+(?:infraError|pickerCookieFromRequest|readCrewClaimRow)\b/,
    );
    expect(source).not.toMatch(/\bconst\s+INFRA_ERROR\b/);
    expect(source).not.toMatch(/\bvalidateGoogleSession\b/);
    expect(source).not.toMatch(/\bresolvePickerSelection\b/);
  });
});

describe("resolveShowPageAccess calls it with the current epoch check", () => {
  test("the live page compares the entry to the row's epoch, through the page's one client", async () => {
    googleSuccess();
    const cookie = pickerCookie();
    const from = vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "shows"
              ? {
                  data: { id: SHOW_ID, published: true, archived: false, picker_epoch: 7 },
                  error: null,
                }
              : { data: crewClaimRow, error: null },
        }),
      }),
    }));
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      rpc: vi.fn(async () => ({ data: SHOW_ID, error: null })),
      from,
    } as never);

    await expect(
      resolveShowPageAccess({ slug: "show-one", shareToken: "aa11", req: req(cookie) }),
    ).resolves.toStrictEqual({
      kind: "resolved",
      showId: SHOW_ID,
      crewMemberId: CREW_ID,
      source: "cookie",
      pickerEpoch: 7,
    });
    expect(vi.mocked(resolvePickerSelection).mock.calls[0]![0]).toStrictEqual({
      showId: SHOW_ID,
      cookie,
      epochCheck: { kind: "current" },
    });
    // The claim row was read through the client the page built, and no second one exists.
    expect(from).toHaveBeenCalledWith("crew_members");
    expect(createSupabaseServiceRoleClient).toHaveBeenCalledTimes(1);
    vi.mocked(createSupabaseServiceRoleClient).mockClear(); // the page's own; see afterEach
  });
});
