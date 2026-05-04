import { beforeEach, describe, expect, test, vi } from "vitest";

type CrewRow = {
  id: string;
  show_id: string;
  email: string;
};

const googleMock = vi.hoisted(() => ({
  userEmail: null as string | null,
  crewRows: [] as CrewRow[],
  eqCalls: [] as Array<[string, string]>,
  alertUpserts: [] as unknown[],
  alertError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: googleMock.userEmail
          ? { user: { id: "auth-user-1", email: googleMock.userEmail } }
          : { user: null },
        error: null,
      }),
    },
  }),
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      if (table === "crew_members") {
        const filters = new Map<string, string>();
        return {
          select: () => ({
            eq(column: string, value: string) {
              googleMock.eqCalls.push([column, value]);
              filters.set(column, value);
              return this;
            },
            then(resolve: (value: { data: CrewRow[]; error: null }) => void) {
              resolve({
                data: googleMock.crewRows.filter(
                  (row) =>
                    row.show_id === filters.get("show_id") &&
                    row.email === filters.get("email"),
                ),
                error: null,
              });
            },
          }),
        };
      }
      if (table === "admin_alerts") {
        return {
          upsert(payload: unknown) {
            googleMock.alertUpserts.push(payload);
            return Promise.resolve({ error: googleMock.alertError });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { validateGoogleSession } = await import("@/lib/auth/validateGoogleSession");

const showId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  googleMock.userEmail = null;
  googleMock.crewRows = [];
  googleMock.eqCalls = [];
  googleMock.alertUpserts = [];
  googleMock.alertError = null;
});

describe("validateGoogleSession", () => {
  test("no Supabase user continues", async () => {
    const result = await validateGoogleSession(new Request("https://crew.fxav.show"), {
      showId,
    });
    expect(result).toEqual({ kind: "continue" });
  });

  test("canonicalizes email at the boundary and resolves only within the requested show", async () => {
    googleMock.userEmail = " Alice@FXAV.NET ";
    googleMock.crewRows = [
      { id: "crew-a", show_id: showId, email: "alice@fxav.net" },
      {
        id: "crew-other-show",
        show_id: "33333333-3333-4333-8333-333333333333",
        email: "alice@fxav.net",
      },
    ];

    const result = await validateGoogleSession(new Request("https://crew.fxav.show"), {
      showId,
    });

    expect(googleMock.eqCalls).toContainEqual(["show_id", showId]);
    expect(googleMock.eqCalls).toContainEqual(["email", "alice@fxav.net"]);
    expect(result).toEqual({
      kind: "success",
      viewer: {
        kind: "crew",
        email: "alice@fxav.net",
        showId,
        crewMemberId: "crew-a",
      },
    });
  });

  test("signed-in email not on the requested show is GOOGLE_NO_CREW_MATCH", async () => {
    googleMock.userEmail = "missing@fxav.net";
    googleMock.crewRows = [];
    const result = await validateGoogleSession(new Request("https://crew.fxav.show"), {
      showId,
    });
    expect(result).toEqual({
      kind: "terminal_failure",
      status: 403,
      code: "GOOGLE_NO_CREW_MATCH",
    });
  });

  test("duplicate email within the same show raises AMBIGUOUS_EMAIL_BINDING and coalesces an admin alert", async () => {
    googleMock.userEmail = "alice@fxav.net";
    googleMock.crewRows = [
      { id: "crew-a", show_id: showId, email: "alice@fxav.net" },
      { id: "crew-b", show_id: showId, email: "alice@fxav.net" },
    ];
    const result = await validateGoogleSession(new Request("https://crew.fxav.show"), {
      showId,
    });
    expect(result).toEqual({
      kind: "terminal_failure",
      status: 500,
      code: "AMBIGUOUS_EMAIL_BINDING",
    });
    expect(googleMock.alertUpserts).toHaveLength(1);
    expect(JSON.stringify(googleMock.alertUpserts[0])).toContain(
      "AMBIGUOUS_EMAIL_BINDING",
    );
  });

  test("duplicate email alert persistence failure returns ADMIN_SESSION_LOOKUP_FAILED", async () => {
    googleMock.userEmail = "alice@fxav.net";
    googleMock.crewRows = [
      { id: "crew-a", show_id: showId, email: "alice@fxav.net" },
      { id: "crew-b", show_id: showId, email: "alice@fxav.net" },
    ];
    googleMock.alertError = { message: "fake DB outage" };

    const result = await validateGoogleSession(new Request("https://crew.fxav.show"), {
      showId,
    });

    expect(result).toEqual({
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    expect(googleMock.alertUpserts).toHaveLength(1);
  });
});
