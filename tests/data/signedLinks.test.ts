import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IssueLinkOutcome, RevokeAllLinksOutcome } from "@/lib/data/signedLinks";

const mockState = vi.hoisted(() => ({
  lastRpc: null as { fn: string; args: Record<string, unknown> } | null,
  rpcResponse: null as unknown,
  forceRpcError: null as string | null,
  throwOnRpc: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      mockState.lastRpc = { fn, args };
      if (mockState.throwOnRpc) {
        throw new Error("META: simulated rpc transport fault");
      }
      if (mockState.forceRpcError) {
        return { data: null, error: { message: mockState.forceRpcError } };
      }
      return { data: mockState.rpcResponse, error: null };
    },
  }),
}));

const { SignedLinksInfraError, issueNewLink, revokeAllLinks } = await import(
  "@/lib/data/signedLinks"
);

beforeEach(() => {
  mockState.lastRpc = null;
  mockState.rpcResponse = null;
  mockState.forceRpcError = null;
  mockState.throwOnRpc = false;
});

describe("M9.5 signed-links data layer scaffold", () => {
  test("SignedLinksInfraError extends Error with correct name", () => {
    const err = new SignedLinksInfraError("test");

    expect(err.name).toBe("SignedLinksInfraError");
    expect(err.message).toBe("test");
    expect(err).toBeInstanceOf(Error);
  });

  test("outcome unions include all expected kinds", () => {
    const issue: IssueLinkOutcome[] = [
      {
        kind: "ok",
        row: {
          current_token_version: 2,
          max_issued_version: 2,
          revoked_below_version: 0,
        },
      },
      { kind: "show_not_found" },
      { kind: "crew_member_not_found" },
    ];
    const revoke: RevokeAllLinksOutcome[] = [
      {
        kind: "ok",
        row: {
          current_token_version: 2,
          max_issued_version: 2,
          revoked_below_version: 2,
        },
      },
      { kind: "no_live_link" },
      { kind: "show_not_found" },
      { kind: "crew_member_not_found" },
    ];

    expect(issue.length).toBe(3);
    expect(revoke.length).toBe(4);
  });
});

describe("revokeAllLinks", () => {
  test("ok branch returns typed outcome and calls the revoke RPC", async () => {
    mockState.rpcResponse = {
      status: "ok",
      row: {
        current_token_version: 2,
        max_issued_version: 2,
        revoked_below_version: 2,
      },
    };

    const outcome = await revokeAllLinks({ showId: "show-1", crewName: "Alice" });

    expect(outcome).toEqual({
      kind: "ok",
      row: {
        current_token_version: 2,
        max_issued_version: 2,
        revoked_below_version: 2,
      },
    });
    expect(mockState.lastRpc).toEqual({
      fn: "revoke_all_links_rpc",
      args: { p_show_id: "show-1", p_crew_name: "Alice" },
    });
  });

  test("no_live_link branch returns typed no-op outcome", async () => {
    mockState.rpcResponse = { status: "no_live_link" };

    await expect(revokeAllLinks({ showId: "show-1", crewName: "Alice" })).resolves.toEqual({
      kind: "no_live_link",
    });
  });

  test("show_not_found and crew_member_not_found branches are whitelisted", async () => {
    for (const status of ["show_not_found", "crew_member_not_found"] as const) {
      mockState.rpcResponse = { status };

      await expect(revokeAllLinks({ showId: "show-1", crewName: "Alice" })).resolves.toEqual({
        kind: status,
      });
    }
  });

  test("returned rpc.error throws SignedLinksInfraError", async () => {
    mockState.forceRpcError = "PGRST500";

    await expect(revokeAllLinks({ showId: "show-1", crewName: "Alice" })).rejects.toBeInstanceOf(
      SignedLinksInfraError,
    );
  });

  test("thrown RPC transport faults throw SignedLinksInfraError", async () => {
    mockState.throwOnRpc = true;

    await expect(revokeAllLinks({ showId: "show-1", crewName: "Alice" })).rejects.toBeInstanceOf(
      SignedLinksInfraError,
    );
  });

  test("unknown status from RPC throws SignedLinksInfraError", async () => {
    mockState.rpcResponse = { status: "something_new" };

    await expect(revokeAllLinks({ showId: "show-1", crewName: "Alice" })).rejects.toThrow(
      /unknown status.*something_new/i,
    );
  });
});

describe("issueNewLink", () => {
  test("ok branch returns typed outcome and calls the issue RPC", async () => {
    mockState.rpcResponse = {
      status: "ok",
      row: {
        current_token_version: 2,
        max_issued_version: 2,
        revoked_below_version: 0,
      },
    };

    const outcome = await issueNewLink({ showId: "show-1", crewName: "Alice" });

    expect(outcome).toEqual({
      kind: "ok",
      row: {
        current_token_version: 2,
        max_issued_version: 2,
        revoked_below_version: 0,
      },
    });
    expect(mockState.lastRpc).toEqual({
      fn: "issue_new_link_rpc",
      args: { p_show_id: "show-1", p_crew_name: "Alice" },
    });
  });

  test("show_not_found and crew_member_not_found branches are whitelisted", async () => {
    for (const status of ["show_not_found", "crew_member_not_found"] as const) {
      mockState.rpcResponse = { status };

      await expect(issueNewLink({ showId: "show-1", crewName: "Alice" })).resolves.toEqual({
        kind: status,
      });
    }
  });

  test("returned rpc.error throws SignedLinksInfraError", async () => {
    mockState.forceRpcError = "PGRST500";

    await expect(issueNewLink({ showId: "show-1", crewName: "Alice" })).rejects.toBeInstanceOf(
      SignedLinksInfraError,
    );
  });

  test("thrown RPC transport faults throw SignedLinksInfraError", async () => {
    mockState.throwOnRpc = true;

    await expect(issueNewLink({ showId: "show-1", crewName: "Alice" })).rejects.toBeInstanceOf(
      SignedLinksInfraError,
    );
  });

  test("no_live_link is rejected by the issue-new status whitelist", async () => {
    mockState.rpcResponse = { status: "no_live_link" };

    await expect(issueNewLink({ showId: "show-1", crewName: "Alice" })).rejects.toThrow(
      /unknown status.*no_live_link/i,
    );
  });
});
