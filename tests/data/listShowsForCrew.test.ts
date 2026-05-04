import { beforeEach, describe, expect, test, vi } from "vitest";

import type { GoogleIdentityViewer } from "@/lib/auth/validateGoogleIdentity";

type JoinedCrewShowRow = {
  id: string;
  shows: {
    id: string;
    slug: string;
    title: string;
    dates: { set?: string | null } | null;
    archived: boolean;
  };
};

const dataMock = vi.hoisted(() => ({
  rows: [] as JoinedCrewShowRow[],
  filters: [] as Array<[string, string | boolean]>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      expect(table).toBe("crew_members");
      const filters = new Map<string, string | boolean>();
      return {
        select(columns: string) {
          expect(columns).toContain("shows!inner");
          return {
            eq(column: string, value: string | boolean) {
              dataMock.filters.push([column, value]);
              filters.set(column, value);
              return this;
            },
            then(
              resolve: (value: { data: JoinedCrewShowRow[]; error: null }) => void,
            ) {
              const email = filters.get("email");
              const archived = filters.get("shows.archived");
              resolve({
                data:
                  email === "alice@fxav.net" && archived === false
                    ? dataMock.rows.filter((row) => !row.shows.archived)
                    : [],
                error: null,
              });
            },
          };
        },
      };
    },
  }),
}));

const { listShowsForCrew } = await import("@/lib/data/listShowsForCrew");

const identity: GoogleIdentityViewer = {
  kind: "crew",
  email: " Alice@FXAV.NET ",
  authUserId: "google-provider-sub-1",
};

beforeEach(() => {
  dataMock.rows = [
    {
      id: "crew-old",
      shows: {
        id: "show-old",
        slug: "old-show",
        title: "Old Show",
        dates: { set: "2026-01-10" },
        archived: false,
      },
    },
    {
      id: "crew-archived",
      shows: {
        id: "show-archived",
        slug: "archived-show",
        title: "Archived Show",
        dates: { set: "2026-04-10" },
        archived: true,
      },
    },
    {
      id: "crew-new",
      shows: {
        id: "show-new",
        slug: "new-show",
        title: "New Show",
        dates: { set: "2026-05-10" },
        archived: false,
      },
    },
  ];
  dataMock.filters = [];
});

describe("listShowsForCrew", () => {
  test("queries by canonical email from the identity and excludes archived shows", async () => {
    const shows = await listShowsForCrew(identity);

    expect(dataMock.filters).toContainEqual(["email", "alice@fxav.net"]);
    expect(dataMock.filters).toContainEqual(["shows.archived", false]);
    expect(shows).toEqual([
      {
        id: "show-new",
        slug: "new-show",
        title: "New Show",
        dates: { set: "2026-05-10" },
        crewMemberId: "crew-new",
      },
      {
        id: "show-old",
        slug: "old-show",
        title: "Old Show",
        dates: { set: "2026-01-10" },
        crewMemberId: "crew-old",
      },
    ]);
  });

  test("returns an empty list when the identity email is not canonicalizable", async () => {
    const shows = await listShowsForCrew({
      ...identity,
      email: "   ",
    });
    expect(shows).toEqual([]);
    expect(dataMock.filters).toEqual([]);
  });
});
