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
    published: boolean;
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
            then(resolve: (value: { data: JoinedCrewShowRow[]; error: null }) => void) {
              const email = filters.get("email");
              const archived = filters.get("shows.archived");
              const published = filters.get("shows.published");
              resolve({
                data:
                  email === "alice@fxav.net" && archived === false && published === true
                    ? dataMock.rows.filter((row) => !row.shows.archived && row.shows.published)
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
        published: true,
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
        published: true,
      },
    },
    {
      id: "crew-unpublished",
      shows: {
        id: "show-unpublished",
        slug: "unpublished-show",
        title: "Unpublished Show",
        dates: { set: "2026-06-10" },
        archived: false,
        published: false,
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
        published: true,
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
    expect(dataMock.filters).toContainEqual(["shows.published", true]);
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
    expect(shows.map((show) => show.id)).not.toContain("show-unpublished");
  });

  test("includes a crew show only when the joined show is published", async () => {
    dataMock.rows = [
      {
        id: "crew-unpublished",
        shows: {
          id: "show-unpublished",
          slug: "unpublished-show",
          title: "Unpublished Show",
          dates: { set: "2026-06-10" },
          archived: false,
          published: false,
        },
      },
      {
        id: "crew-published",
        shows: {
          id: "show-published",
          slug: "published-show",
          title: "Published Show",
          dates: { set: "2026-07-10" },
          archived: false,
          published: true,
        },
      },
    ];

    const shows = await listShowsForCrew(identity);

    expect(shows).toEqual([
      {
        id: "show-published",
        slug: "published-show",
        title: "Published Show",
        dates: { set: "2026-07-10" },
        crewMemberId: "crew-published",
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
