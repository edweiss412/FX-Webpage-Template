import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const ledgerId = "11111111-1111-4111-8111-111111111111";

const routeMock = vi.hoisted(() => ({
  AdminInfraError: class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
  },
  requireAdmin: vi.fn(async () => undefined),
  ledger: {
    drive_file_id: "drive-file-1",
    snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  } as { drive_file_id: string; snapshot_revision_id: string } | null,
  ledgerError: null as null | { message: string },
  repairSnapshotRollback: vi.fn(async () => ({
    outcome: "repaired" as const,
    snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  })) as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: routeMock.AdminInfraError,
  requireAdmin: routeMock.requireAdmin,
}));

vi.mock("@/lib/sync/promoteSnapshot", () => ({
  repairSnapshotRollback: routeMock.repairSnapshotRollback,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: routeMock.ledger,
            error: routeMock.ledgerError,
          }),
        }),
      }),
    }),
  }),
}));

const { POST } = await import("@/app/api/admin/snapshot-rollback/[id]/repair/route");

function request() {
  return new NextRequest(`https://crew.fxav.test/api/admin/snapshot-rollback/${ledgerId}/repair`, {
    method: "POST",
  });
}

async function post(id = ledgerId): Promise<Response> {
  return await POST(request(), { params: Promise.resolve({ id }) });
}

describe("POST /api/admin/snapshot-rollback/[id]/repair", () => {
  beforeEach(() => {
    routeMock.requireAdmin.mockClear();
    routeMock.repairSnapshotRollback.mockClear();
    routeMock.ledger = {
      drive_file_id: "drive-file-1",
      snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    routeMock.ledgerError = null;
    routeMock.repairSnapshotRollback.mockResolvedValue({
      outcome: "repaired",
      snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    } as never);
  });

  test("delegates valid stuck ledger rows to repairSnapshotRollback", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: {
        outcome: "repaired",
        snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });
    expect(routeMock.repairSnapshotRollback).toHaveBeenCalledWith(ledgerId);
  });

  test.each([
    ["not_stuck", "PENDING_SNAPSHOT_NOT_STUCK"],
    ["promote_in_flight", "PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT"],
  ] as const)("maps %s repair results to cataloged conflict responses", async (outcome, error) => {
    routeMock.repairSnapshotRollback.mockResolvedValueOnce({
      outcome,
      snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    } as never);

    const response = await post();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error });
  });

  test("Supabase returned errors surface as sync infra faults", async () => {
    routeMock.ledgerError = { message: "db unavailable" };

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "SYNC_INFRA_ERROR" });
    expect(routeMock.repairSnapshotRollback).not.toHaveBeenCalled();
  });
});
