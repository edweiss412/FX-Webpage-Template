import { describe, expect, test, vi } from "vitest";
import {
  loadShowCrewWithAuth,
  type LoadCrewResult,
} from "@/lib/data/loadShowCrewWithAuth";

type AwaitedResult = { data: unknown; error: { message: string } | null } | Error;

type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
};

function buildMockSupabase(
  crewMembersResult: AwaitedResult,
  crewAuthResult: AwaitedResult,
): MockSupabase {
  return {
    from: vi.fn((table: string) => {
      const target = table === "crew_members" ? crewMembersResult : crewAuthResult;
      const settle = () =>
        target instanceof Error ? Promise.reject(target) : Promise.resolve(target);
      const chain: {
        select: ReturnType<typeof vi.fn>;
        eq: ReturnType<typeof vi.fn>;
        order: ReturnType<typeof vi.fn>;
      } = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => {
          if (table === "crew_member_auth") return settle();
          return chain;
        }),
        order: vi.fn(() => settle()),
      };
      return chain;
    }),
  };
}

describe("loadShowCrewWithAuth", () => {
  test("happy path: returns merged crew rows with authMissing=false", async () => {
    const supabase = buildMockSupabase(
      {
        data: [
          { id: "row-1", name: "Alice", role: "LEAD" },
          { id: "row-2", name: "Bob", role: "A1" },
        ],
        error: null,
      },
      {
        data: [
          {
            crew_name: "Alice",
            current_token_version: 2,
            max_issued_version: 2,
            revoked_below_version: 0,
          },
          {
            crew_name: "Bob",
            current_token_version: 1,
            max_issued_version: 1,
            revoked_below_version: 1,
          },
        ],
        error: null,
      },
    );
    const result: LoadCrewResult = await loadShowCrewWithAuth(
      supabase as never,
      "show-uuid",
    );
    expect(result.crewLookupFailed).toBe(false);
    expect(result.crew).toHaveLength(2);
    expect(result.crew[0]).toMatchObject({
      id: "row-1",
      name: "Alice",
      role: "LEAD",
      authMissing: false,
      current_token_version: 2,
      max_issued_version: 2,
      revoked_below_version: 0,
    });
    expect(result.crew[1]).toMatchObject({
      name: "Bob",
      authMissing: false,
      revoked_below_version: 1,
    });
  });

  test("crew_members RETURNED error → crewLookupFailed=true, empty crew", async () => {
    const supabase = buildMockSupabase(
      { data: null, error: { message: "PGRST500 simulated" } },
      { data: [], error: null },
    );
    const result = await loadShowCrewWithAuth(supabase as never, "show-uuid");
    expect(result.crewLookupFailed).toBe(true);
    expect(result.crew).toEqual([]);
  });

  test("crew_members THROWN error → crewLookupFailed=true (caught + folded into the same branch)", async () => {
    const supabase = buildMockSupabase(
      new Error("network blew up"),
      { data: [], error: null },
    );
    const result = await loadShowCrewWithAuth(supabase as never, "show-uuid");
    expect(result.crewLookupFailed).toBe(true);
    expect(result.crew).toEqual([]);
  });

  test("crew_member_auth RETURNED error → crewLookupFailed=true (R1 HIGH-1 fix — no fallback to live-link defaults)", async () => {
    const supabase = buildMockSupabase(
      { data: [{ id: "row-1", name: "Alice", role: "LEAD" }], error: null },
      { data: null, error: { message: "PGRST500 on auth lookup" } },
    );
    const result = await loadShowCrewWithAuth(supabase as never, "show-uuid");
    expect(result.crewLookupFailed).toBe(true);
    expect(result.crew).toEqual([]);
  });

  test("crew_member_auth THROWN error → crewLookupFailed=true (folded into same branch)", async () => {
    const supabase = buildMockSupabase(
      { data: [{ id: "row-1", name: "Alice", role: "LEAD" }], error: null },
      new Error("auth network blew up"),
    );
    const result = await loadShowCrewWithAuth(supabase as never, "show-uuid");
    expect(result.crewLookupFailed).toBe(true);
    expect(result.crew).toEqual([]);
  });

  test("crew_member exists but missing auth row → authMissing=true with sentinel versions (R1 HIGH-1 fix)", async () => {
    const supabase = buildMockSupabase(
      {
        data: [
          { id: "row-1", name: "Alice", role: "LEAD" },
          { id: "row-2", name: "Bob", role: "A1" },
        ],
        error: null,
      },
      {
        // Only Alice has an auth row; Bob's is missing.
        data: [
          {
            crew_name: "Alice",
            current_token_version: 2,
            max_issued_version: 2,
            revoked_below_version: 0,
          },
        ],
        error: null,
      },
    );
    const result = await loadShowCrewWithAuth(supabase as never, "show-uuid");
    expect(result.crewLookupFailed).toBe(false);
    expect(result.crew).toHaveLength(2);
    expect(result.crew[0]).toMatchObject({ name: "Alice", authMissing: false });
    const bob = result.crew[1];
    expect(bob).toMatchObject({
      name: "Bob",
      authMissing: true,
      // Sentinel values — UI MUST branch on authMissing FIRST.
      current_token_version: 0,
      max_issued_version: 0,
      revoked_below_version: 0,
    });
  });
});
