import { beforeEach, describe, expect, test, vi } from "vitest";
import { encodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import { resolvePickerSelection } from "@/lib/auth/picker/resolvePickerSelection";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceRoleClient: vi.fn(),
}));

const KEY = "0".repeat(64);
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SHOW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_ID = "22222222-2222-2222-2222-222222222222";

type MockState = {
  sessionEmail: string | null;
  show: { picker_epoch: number; published: boolean; archived: boolean } | null;
  crew: { id: string; email: string | null; claimed_via_oauth_at: string | null } | null;
  throwService: boolean;
  throwAuth: boolean;
  authError: boolean;
  showError: boolean;
  crewError: boolean;
  rowEmailError: boolean;
};

const state: MockState = {
  sessionEmail: null,
  show: { picker_epoch: 1, published: true, archived: false },
  crew: { id: CREW_ID, email: "alice@example.com", claimed_via_oauth_at: null },
  throwService: false,
  throwAuth: false,
  authError: false,
  showError: false,
  crewError: false,
  rowEmailError: false,
};

function cookie(input: { showId?: string; crewId?: string; e?: number; t?: number } = {}) {
  return encodePickerCookie(
    {
      v: 1,
      selections: {
        [input.showId ?? SHOW_ID]: {
          id: input.crewId ?? CREW_ID,
          e: input.e ?? 1,
          t: input.t ?? 0,
        },
      },
    },
    KEY,
  );
}

function queryResult(table: string, single: boolean) {
  if (table === "shows") {
    return { data: state.show, error: state.showError ? { message: "show failed" } : null };
  }
  if (table === "crew_members" && single) {
    return {
      data: state.crew ? { email: state.crew.email } : null,
      error: state.rowEmailError ? { message: "row email failed" } : null,
    };
  }
  return { data: state.crew, error: state.crewError ? { message: "crew failed" } : null };
}

function queryBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => queryResult(table, false)),
    single: vi.fn(async () => queryResult(table, true)),
  };
  return builder;
}

beforeEach(() => {
  process.env.PICKER_COOKIE_SIGNING_KEY = KEY;
  Object.assign(state, {
    sessionEmail: null,
    show: { picker_epoch: 1, published: true, archived: false },
    crew: { id: CREW_ID, email: "alice@example.com", claimed_via_oauth_at: null },
    throwService: false,
    throwAuth: false,
    authError: false,
    showError: false,
    crewError: false,
    rowEmailError: false,
  });
  vi.mocked(createSupabaseServiceRoleClient).mockImplementation(() => {
    if (state.throwService) throw new Error("service failed");
    return { from: vi.fn((table: string) => queryBuilder(table)) } as never;
  });
  vi.mocked(createSupabaseServerClient).mockImplementation(async () => {
    if (state.throwAuth) throw new Error("auth failed");
    return {
      rpc: vi.fn(async (name: string) => {
        expect(name).toBe("auth_email_canonical");
        return {
          data: state.sessionEmail,
          error: state.authError ? { message: "auth rpc failed" } : null,
        };
      }),
    } as never;
  });
});

describe("resolvePickerSelection", () => {
  test("returns no_selection for absent, malformed, or unrelated cookies", async () => {
    await expect(resolvePickerSelection({ showId: SHOW_ID, cookie: undefined })).resolves.toEqual({
      kind: "no_selection",
    });
    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: "not.a.cookie" }),
    ).resolves.toEqual({
      kind: "no_selection",
    });
    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: cookie({ showId: OTHER_SHOW_ID }) }),
    ).resolves.toEqual({
      kind: "no_selection",
    });
  });

  test("returns show_unavailable for archived or unpublished shows", async () => {
    state.show = { picker_epoch: 1, published: true, archived: true };
    await expect(resolvePickerSelection({ showId: SHOW_ID, cookie: cookie() })).resolves.toEqual({
      kind: "show_unavailable",
    });

    state.show = { picker_epoch: 1, published: false, archived: false };
    await expect(resolvePickerSelection({ showId: SHOW_ID, cookie: cookie() })).resolves.toEqual({
      kind: "show_unavailable",
    });
  });

  test("returns epoch_stale when cookie epoch differs from show epoch", async () => {
    state.show = { picker_epoch: 2, published: true, archived: false };

    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: cookie({ e: 1 }) }),
    ).resolves.toEqual({
      kind: "epoch_stale",
      expectedEpoch: 1,
      expectedCrewMemberId: CREW_ID,
    });
  });

  test("returns removed_from_roster when crew row is gone", async () => {
    state.crew = null;

    await expect(resolvePickerSelection({ showId: SHOW_ID, cookie: cookie() })).resolves.toEqual({
      kind: "removed_from_roster",
      expectedEpoch: 1,
      expectedCrewMemberId: CREW_ID,
    });
  });

  test("returns identity_invalidated when cookie predates or ties OAuth claim", async () => {
    state.crew = {
      id: CREW_ID,
      email: "alice@example.com",
      claimed_via_oauth_at: "2026-01-16T12:00:00.123Z",
    };

    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: cookie({ t: 1_737_028_800_123 }) }),
    ).resolves.toEqual({
      kind: "identity_invalidated",
      expectedEpoch: 1,
      expectedCrewMemberId: CREW_ID,
      reason: "claimed_after_pick",
    });
  });

  test("returns identity_invalidated/session_mismatch when active session email differs", async () => {
    state.sessionEmail = "bob@example.com";

    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: cookie({ t: 1_737_028_800_124 }) }),
    ).resolves.toEqual({
      kind: "identity_invalidated",
      expectedEpoch: 1,
      expectedCrewMemberId: CREW_ID,
      reason: "session_mismatch",
    });

    state.crew = { id: CREW_ID, email: null, claimed_via_oauth_at: null };
    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: cookie({ t: 1_737_028_800_124 }) }),
    ).resolves.toMatchObject({
      kind: "identity_invalidated",
      reason: "session_mismatch",
    });
  });

  test("returns resolved on happy path for anonymous or matching-session callers", async () => {
    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: cookie({ t: 1_737_028_800_124 }) }),
    ).resolves.toEqual({
      kind: "resolved",
      crewMemberId: CREW_ID,
    });

    state.sessionEmail = "alice@example.com";
    await expect(
      resolvePickerSelection({ showId: SHOW_ID, cookie: cookie({ t: 1_737_028_800_124 }) }),
    ).resolves.toEqual({
      kind: "resolved",
      crewMemberId: CREW_ID,
    });
  });

  test("returns infra_error on every Supabase boundary failure", async () => {
    for (const flag of [
      "throwService",
      "throwAuth",
      "authError",
      "showError",
      "crewError",
      "rowEmailError",
    ] as const) {
      Object.assign(state, {
        sessionEmail: flag === "rowEmailError" ? "alice@example.com" : null,
        throwService: false,
        throwAuth: false,
        authError: false,
        showError: false,
        crewError: false,
        rowEmailError: false,
      });
      state[flag] = true;

      await expect(resolvePickerSelection({ showId: SHOW_ID, cookie: cookie() })).resolves.toEqual({
        kind: "infra_error",
        code: "PICKER_RESOLVER_LOOKUP_FAILED",
      });
    }
  });
});
