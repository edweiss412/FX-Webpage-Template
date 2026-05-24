/**
 * tests/data/listShowsForCrew.test.ts (M11.5 §B Task E2)
 *
 * Pins the post-pivot contract:
 *   - The function accepts a SupabaseClient argument and calls
 *     `my_share_tokens_for_email` via `.rpc()` (NOT a service-role
 *     join on crew_members/shows).
 *   - Each entry returned carries a `shareToken` field; consumers
 *     render `/show/<slug>/<share-token>` URLs.
 *   - Show metadata (title/dates/venue) is fetched separately from
 *     `shows` and filtered by archived=false + published=true.
 *   - Negative-regression: a service-role-shaped client (one whose
 *     RPC returns the empty set because auth.email() is null) yields
 *     an empty array — the function MUST NOT silently succeed.
 */
import { beforeEach, describe, expect, test } from "vitest";

import { listShowsForCrew } from "@/lib/data/listShowsForCrew";

type ShareTokenRow = { slug: string; share_token: string };
type ShowMetadataRow = {
  id: string;
  slug: string;
  title: string;
  dates: unknown;
  venue: unknown;
};

type FakeBuilder = {
  rpcCalls: string[];
  shareTokenRows: ShareTokenRow[];
  showMetadataRows: ShowMetadataRow[];
  rpcError?: { message: string } | null;
  showsError?: { message: string } | null;
  capturedShowsQuery: {
    select?: string;
    inColumn?: string;
    inValues?: string[];
    archived?: boolean;
    published?: boolean;
  };
};

function makeClient(state: FakeBuilder): unknown {
  return {
    rpc(name: string) {
      state.rpcCalls.push(name);
      const err = state.rpcError ?? null;
      const data = err ? null : state.shareTokenRows;
      return Promise.resolve({ data, error: err });
    },
    from(table: string) {
      expect(table).toBe("shows");
      const query = {
        select(columns: string) {
          state.capturedShowsQuery.select = columns;
          return query;
        },
        in(column: string, values: string[]) {
          state.capturedShowsQuery.inColumn = column;
          state.capturedShowsQuery.inValues = values;
          return query;
        },
        eq(column: string, value: boolean) {
          if (column === "archived") state.capturedShowsQuery.archived = value;
          if (column === "published") state.capturedShowsQuery.published = value;
          return query;
        },
        then(resolve: (value: { data: ShowMetadataRow[] | null; error: unknown }) => void) {
          const err = state.showsError ?? null;
          resolve({ data: err ? null : state.showMetadataRows, error: err });
        },
      };
      return query;
    },
  };
}

function freshState(): FakeBuilder {
  return {
    rpcCalls: [],
    shareTokenRows: [],
    showMetadataRows: [],
    capturedShowsQuery: {},
  };
}

describe("listShowsForCrew — post-pivot RPC contract (M11.5 E2)", () => {
  let state: FakeBuilder;
  beforeEach(() => {
    state = freshState();
  });

  test("invokes my_share_tokens_for_email via .rpc()", async () => {
    state.shareTokenRows = [];
    state.showMetadataRows = [];
    await listShowsForCrew(makeClient(state) as never);
    expect(state.rpcCalls).toEqual(["my_share_tokens_for_email"]);
  });

  test("returns an empty array when the RPC returns no rows (service-role / no-session contract)", async () => {
    // Negative-regression: a service-role client has no JWT, so the
    // RPC's auth.email() is null and the server returns an empty
    // set. The function MUST surface that as []; it MUST NOT
    // silently succeed against a wider data set.
    state.shareTokenRows = [];
    const result = await listShowsForCrew(makeClient(state) as never);
    expect(result).toEqual([]);
    // No metadata fetch when there are no slugs to enrich.
    expect(state.capturedShowsQuery.inValues).toBeUndefined();
  });

  test("enriches RPC rows with show metadata and surfaces shareToken on each entry", async () => {
    state.shareTokenRows = [
      { slug: "a", share_token: "tokenA" },
      { slug: "b", share_token: "tokenB" },
    ];
    state.showMetadataRows = [
      {
        id: "show-a",
        slug: "a",
        title: "Show A",
        dates: { set: "2026-05-01" },
        venue: { name: "Hilton" },
      },
      {
        id: "show-b",
        slug: "b",
        title: "Show B",
        dates: { set: "2026-06-01" },
        venue: null,
      },
    ];
    const result = await listShowsForCrew(makeClient(state) as never);
    // Sort: dates.set desc — b (June) before a (May).
    expect(result.map((r) => r.slug)).toEqual(["b", "a"]);
    expect(result[0]).toEqual({
      id: "show-b",
      slug: "b",
      title: "Show B",
      dates: { set: "2026-06-01" },
      venue: null,
      shareToken: "tokenB",
    });
    expect(result[1]?.shareToken).toBe("tokenA");
    expect(result[1]?.venue?.name).toBe("Hilton");
  });

  test("metadata query filters archived=false and published=true", async () => {
    state.shareTokenRows = [{ slug: "a", share_token: "tokenA" }];
    state.showMetadataRows = [];
    await listShowsForCrew(makeClient(state) as never);
    expect(state.capturedShowsQuery.archived).toBe(false);
    expect(state.capturedShowsQuery.published).toBe(true);
    expect(state.capturedShowsQuery.inColumn).toBe("slug");
    expect(state.capturedShowsQuery.inValues).toEqual(["a"]);
  });

  test("drops rows whose metadata is absent (archived/unpublished filtered out by the second query)", async () => {
    state.shareTokenRows = [
      { slug: "a", share_token: "tokenA" },
      { slug: "b", share_token: "tokenB" },
    ];
    state.showMetadataRows = [
      {
        id: "show-a",
        slug: "a",
        title: "Show A",
        dates: { set: "2026-05-01" },
        venue: null,
      },
    ];
    // 'b' is filtered out at the shows query; the function returns
    // only the row whose metadata survived.
    const result = await listShowsForCrew(makeClient(state) as never);
    expect(result.map((r) => r.slug)).toEqual(["a"]);
  });

  test("throws when the RPC returns an error (fail-closed signal to the page)", async () => {
    state.rpcError = { message: "rpc fault" };
    await expect(listShowsForCrew(makeClient(state) as never)).rejects.toThrow(
      /share-token lookup failed/,
    );
  });

  test("throws when the metadata fetch returns an error", async () => {
    state.shareTokenRows = [{ slug: "a", share_token: "tokenA" }];
    state.showsError = { message: "shows fault" };
    await expect(listShowsForCrew(makeClient(state) as never)).rejects.toThrow(
      /show metadata lookup failed/,
    );
  });
});
