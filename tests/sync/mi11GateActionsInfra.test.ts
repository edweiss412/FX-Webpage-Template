/**
 * P3-F4 — invariant 9 (Supabase call-boundary) for the MI-11 gate actions.
 *
 * approveMi11Hold / rejectMi11Hold must map BOTH a RETURNED {error} AND a THROWN fault at every
 * Supabase boundary (service-role client construction, the sync_holds lookup SELECT, the authed
 * client construction, the supabase.rpc(...) mutation) to the SAME typed discriminable infra result
 * { ok:false, code:'SYNC_INFRA_ERROR' } — never an uncaught throw / untyped admin 500.
 *
 * Mirrors tests/sync/_metaInfraContract.test.ts: a hoisted infraMock toggles throws at each boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const infraMock = vi.hoisted(() => ({
  throwOnServiceConstruct: false,
  throwOnLookup: false,
  throwOnServerConstruct: false,
  throwOnRpc: false,
  lookupReturnsError: false,
  rpcReturnsError: false,
}));

const requireAdmin = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: () => requireAdmin() }));

const fetchDriveFileMetadata = vi.fn(async (..._a: unknown[]) => ({
  modifiedTime: "2026-06-02T00:00:00.000Z",
}));
vi.mock("@/lib/drive/fetch", () => {
  class DriveFetchError extends Error {}
  return {
    fetchDriveFileMetadata: (...a: unknown[]) => fetchDriveFileMetadata(...a),
    DriveFetchError,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (infraMock.throwOnServiceConstruct) throw new Error("META: service-role construct fault");
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (infraMock.throwOnLookup) throw new Error("META: lookup query fault");
              if (infraMock.lookupReturnsError) return { data: null, error: { message: "boom" } };
              return { data: { drive_file_id: "drive-1", show_id: "show-1" }, error: null };
            },
          }),
        }),
      }),
    };
  },
  createSupabaseServerClient: async () => {
    if (infraMock.throwOnServerConstruct) throw new Error("META: server construct fault");
    return {
      rpc: async () => {
        if (infraMock.throwOnRpc) throw new Error("META: rpc fault");
        if (infraMock.rpcReturnsError) return { data: null, error: { message: "boom" } };
        return { data: { ok: true }, error: null };
      },
    };
  },
}));

import { approveMi11Hold, rejectMi11Hold } from "@/lib/sync/holds/mi11GateActions";

const INFRA = { ok: false, code: "SYNC_INFRA_ERROR" } as const;

beforeEach(() => {
  Object.assign(infraMock, {
    throwOnServiceConstruct: false,
    throwOnLookup: false,
    throwOnServerConstruct: false,
    throwOnRpc: false,
    lookupReturnsError: false,
    rpcReturnsError: false,
  });
  requireAdmin.mockImplementation(async () => undefined);
});
afterEach(() => vi.clearAllMocks());

describe("approveMi11Hold — thrown Supabase boundary faults → typed infra result (P3-F4)", () => {
  it("service-role construction THROW → SYNC_INFRA_ERROR (does not throw)", async () => {
    infraMock.throwOnServiceConstruct = true;
    await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
  it("sync_holds lookup SELECT THROW → SYNC_INFRA_ERROR (does not throw)", async () => {
    infraMock.throwOnLookup = true;
    await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
  it("authed server-client construction THROW → SYNC_INFRA_ERROR (does not throw)", async () => {
    infraMock.throwOnServerConstruct = true;
    await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
  it("supabase.rpc THROW → SYNC_INFRA_ERROR (does not throw)", async () => {
    infraMock.throwOnRpc = true;
    await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
  it("RETURNED {error} on lookup → SYNC_INFRA_ERROR (preserved)", async () => {
    infraMock.lookupReturnsError = true;
    await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
  it("RETURNED {error} on rpc → SYNC_INFRA_ERROR (preserved)", async () => {
    infraMock.rpcReturnsError = true;
    await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
});

describe("rejectMi11Hold — thrown Supabase boundary faults → typed infra result (P3-F4)", () => {
  it("authed server-client construction THROW → SYNC_INFRA_ERROR (does not throw)", async () => {
    infraMock.throwOnServerConstruct = true;
    await expect(rejectMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
  it("supabase.rpc THROW → SYNC_INFRA_ERROR (does not throw)", async () => {
    infraMock.throwOnRpc = true;
    await expect(rejectMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
  it("RETURNED {error} on rpc → SYNC_INFRA_ERROR (preserved)", async () => {
    infraMock.rpcReturnsError = true;
    await expect(rejectMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
  });
});
