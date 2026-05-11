import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const showId = "11111111-1111-4111-8111-111111111111";
const applyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type LedgerRow = {
  id: string;
  show_id: string;
  snapshot_revision_id: string;
  promoted_at: string | null;
  promote_started_at: string | null;
  claim_token: string | null;
};

const statusMock = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => undefined),
  show: {
    id: "11111111-1111-4111-8111-111111111111",
    diagrams: {
      current: { snapshot_revision_id: "prior-rev" },
      pending: { revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    },
  } as { id: string; diagrams: unknown } | null,
  ledger: {
    id: "ledger-1",
    show_id: "11111111-1111-4111-8111-111111111111",
    snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    promoted_at: null,
    promote_started_at: new Date().toISOString(),
    claim_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  } as LedgerRow | null,
  showError: null as null | { message: string },
  ledgerError: null as null | { message: string },
  writes: 0,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: statusMock.requireAdmin,
  AdminInfraError: class AdminInfraError extends Error {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: table === "pending_snapshot_uploads" ? statusMock.ledger : statusMock.show,
                error:
                  table === "pending_snapshot_uploads"
                    ? statusMock.ledgerError
                    : statusMock.showError,
              }),
            }),
            maybeSingle: async () => ({
              data: table === "pending_snapshot_uploads" ? statusMock.ledger : statusMock.show,
              error:
                table === "pending_snapshot_uploads"
                  ? statusMock.ledgerError
                  : statusMock.showError,
            }),
          }),
        }),
        update: () => {
          statusMock.writes += 1;
          return { eq: () => ({}) };
        },
      };
    },
  }),
}));

async function getStatus(): Promise<Response> {
  const { GET } = await import("@/app/api/admin/show/[slug]/apply/[applyId]/status/route");
  return await GET(
    new NextRequest(`https://crew.fxav.test/api/admin/show/test-show/apply/${applyId}/status`),
    { params: Promise.resolve({ slug: "test-show", applyId }) },
  );
}

beforeEach(() => {
  vi.resetModules();
  statusMock.requireAdmin.mockClear();
  statusMock.show = {
    id: showId,
    diagrams: {
      current: { snapshot_revision_id: "prior-rev" },
      pending: { revision_id: applyId },
    },
  };
  statusMock.ledger = {
    id: "ledger-1",
    show_id: showId,
    snapshot_revision_id: applyId,
    promoted_at: null,
    promote_started_at: new Date().toISOString(),
    claim_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
  statusMock.showError = null;
  statusMock.ledgerError = null;
  statusMock.writes = 0;
});

describe("GET /api/admin/show/[slug]/apply/[applyId]/status", () => {
  test("reports pending, promoted, and stuck states without writes", async () => {
    await expect((await getStatus()).json()).resolves.toMatchObject({
      status: "pending",
      snapshot_revision_id: applyId,
      ledger_row_id: "ledger-1",
    });

    statusMock.ledger = { ...statusMock.ledger!, promoted_at: new Date().toISOString() };
    statusMock.show = {
      id: showId,
      diagrams: { current: { snapshot_revision_id: "newer-rev" }, pending: null },
    };
    await expect((await getStatus()).json()).resolves.toMatchObject({
      status: "promoted",
      snapshot_revision_id: applyId,
      ledger_row_id: "ledger-1",
    });

    statusMock.ledger = {
      ...statusMock.ledger!,
      promoted_at: null,
      promote_started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      claim_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    statusMock.show = {
      id: showId,
      diagrams: {
        current: { snapshot_revision_id: "prior-rev" },
        pending: { revision_id: applyId },
      },
    };
    await expect((await getStatus()).json()).resolves.toMatchObject({
      status: "stuck_admin_repair_required",
      snapshot_revision_id: applyId,
      diagnostics: { promote_started_at: statusMock.ledger.promote_started_at },
    });

    expect(statusMock.writes).toBe(0);
  });

  test("never-promoted rows no longer referenced by pending report rolled_back", async () => {
    statusMock.ledger = {
      ...statusMock.ledger!,
      promoted_at: null,
      promote_started_at: null,
      claim_token: null,
    };
    statusMock.show = {
      id: showId,
      diagrams: { current: {}, pending: { revision_id: "newer-rev" } },
    };

    await expect((await getStatus()).json()).resolves.toMatchObject({
      status: "rolled_back",
      snapshot_revision_id: applyId,
    });
  });

  test("non-admin and show-mismatch requests do not expose ledger state", async () => {
    statusMock.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
    expect((await getStatus()).status).toBe(403);

    statusMock.ledger = { ...statusMock.ledger!, show_id: "other-show" };
    expect((await getStatus()).status).toBe(404);
  });

  test("Supabase returned errors surface as infra faults instead of not-found", async () => {
    statusMock.showError = { message: "db unavailable" };
    let response = await getStatus();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "SYNC_INFRA_ERROR" });

    statusMock.showError = null;
    statusMock.ledgerError = { message: "db unavailable" };
    response = await getStatus();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "SYNC_INFRA_ERROR" });
  });
});
