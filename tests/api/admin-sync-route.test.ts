import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const adminMock = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => undefined),
  requireAdminIdentity: vi.fn(async () => ({ email: "admin@fxav.test" })),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: adminMock.requireAdmin,
  requireAdminIdentity: adminMock.requireAdminIdentity,
}));

const logAdminOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: logAdminOutcomeMock,
}));

const syncMock = vi.hoisted(() => ({
  runManualSyncForShow: vi.fn<
    (
      driveFileId: string,
      mode: "manual",
    ) => Promise<
      | { outcome: "applied"; showId: string }
      | { outcome: "stage"; stagedId: string }
      | { outcome: "parse_error"; code: "SYNC_INFRA_ERROR" | "DRIVE_METADATA_MISSING" }
      | { outcome: "hard_fail"; code: string }
      | { outcome: "stale"; code: string }
      | { outcome: "blocked"; code: "FINALIZE_OWNED_SHOW" }
    >
  >(async () => ({ outcome: "applied", showId: "show-1" })),
}));

vi.mock("@/lib/sync/runManualSyncForShow", () => ({
  FINALIZE_OWNED_SHOW: "FINALIZE_OWNED_SHOW",
  runManualSyncForShow: syncMock.runManualSyncForShow,
}));

type SupabaseState = {
  row: { drive_file_id: string } | null;
  error: null | { message: string };
  throws: null | Error;
  calls: Array<{ table: string; filters: Array<{ column: string; value: unknown }> }>;
};

const supabaseMock = vi.hoisted(() => ({
  state: {
    row: { drive_file_id: "drive-file-1" },
    error: null,
    throws: null,
    calls: [],
  } as SupabaseState,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (table: string) => {
      const filters: Array<{ column: string; value: unknown }> = [];
      supabaseMock.state.calls.push({ table, filters });
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push({ column, value });
          return builder;
        },
        maybeSingle: async () => {
          if (supabaseMock.state.throws) throw supabaseMock.state.throws;
          return { data: supabaseMock.state.row, error: supabaseMock.state.error };
        },
      };
      return builder;
    },
  }),
}));

const { POST } = await import("@/app/api/admin/sync/[slug]/route");

function request() {
  return new NextRequest("https://crew.fxav.test/api/admin/sync/test-show", {
    method: "POST",
  });
}

describe("POST /api/admin/sync/[slug]", () => {
  beforeEach(() => {
    adminMock.requireAdmin.mockClear();
    adminMock.requireAdminIdentity.mockClear();
    logAdminOutcomeMock.mockClear();
    syncMock.runManualSyncForShow.mockClear();
    supabaseMock.state.row = { drive_file_id: "drive-file-1" };
    supabaseMock.state.error = null;
    supabaseMock.state.throws = null;
    supabaseMock.state.calls = [];
  });

  test("requires admin before resolving the show or running sync", async () => {
    const rejected = new Error("forbidden");
    adminMock.requireAdmin.mockRejectedValueOnce(rejected);

    await expect(POST(request(), { params: Promise.resolve({ slug: "test-show" }) })).rejects.toBe(
      rejected,
    );

    expect(supabaseMock.state.calls).toEqual([]);
    expect(syncMock.runManualSyncForShow).not.toHaveBeenCalled();
  });

  test("runs manual sync for the show slug and returns the sync result", async () => {
    const response = await POST(request(), { params: Promise.resolve({ slug: "test-show" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: { outcome: "applied", showId: "show-1" },
    });
    expect(supabaseMock.state.calls).toEqual([
      { table: "shows", filters: [{ column: "slug", value: "test-show" }] },
    ]);
    expect(syncMock.runManualSyncForShow).toHaveBeenCalledWith("drive-file-1", "manual");
  });

  test("applied outcome emits SHOW_SYNCED_MANUAL telemetry gated on the applied result", async () => {
    syncMock.runManualSyncForShow.mockResolvedValueOnce({ outcome: "applied", showId: "show-42" });

    const response = await POST(request(), { params: Promise.resolve({ slug: "test-show" }) });

    expect(response.status).toBe(200);
    const { email: expectedEmail } = await adminMock.requireAdminIdentity();
    const expectedDriveFileId = supabaseMock.state.row?.drive_file_id;
    expect(logAdminOutcomeMock).toHaveBeenCalledWith({
      code: "SHOW_SYNCED_MANUAL",
      source: "api.admin.sync",
      actorEmail: expectedEmail,
      driveFileId: expectedDriveFileId,
      showId: "show-42",
    });
  });

  test("stage outcome reaches the success return but emits no telemetry", async () => {
    syncMock.runManualSyncForShow.mockResolvedValueOnce({ outcome: "stage", stagedId: "staged-9" });

    const response = await POST(request(), { params: Promise.resolve({ slug: "test-show" }) });

    expect(response.status).toBe(200);
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("FINALIZE_OWNED_SHOW maps to 409 without rewriting the code", async () => {
    syncMock.runManualSyncForShow.mockResolvedValueOnce({
      outcome: "blocked",
      code: "FINALIZE_OWNED_SHOW",
    });

    const response = await POST(request(), { params: Promise.resolve({ slug: "test-show" }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "FINALIZE_OWNED_SHOW",
    });
  });

  test.each([
    [{ outcome: "parse_error" as const, code: "SYNC_INFRA_ERROR" as const }, 500],
    [{ outcome: "parse_error" as const, code: "DRIVE_METADATA_MISSING" as const }, 409],
    [{ outcome: "hard_fail" as const, code: "MI-1_VERSION_DETECTION_FAILED" }, 409],
    [{ outcome: "stale" as const, code: "STALE_MANUAL_REPLAY_ABORTED" }, 409],
  ])("maps failed manual sync result %j to ok false", async (syncResult, status) => {
    syncMock.runManualSyncForShow.mockResolvedValueOnce(syncResult);

    const response = await POST(request(), { params: Promise.resolve({ slug: "test-show" }) });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: syncResult.code,
    });
  });

  test("unknown slug returns PENDING_SYNC_NOT_FOUND and does not call Drive sync", async () => {
    supabaseMock.state.row = null;

    const response = await POST(request(), { params: Promise.resolve({ slug: "missing" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "PENDING_SYNC_NOT_FOUND",
    });
    expect(syncMock.runManualSyncForShow).not.toHaveBeenCalled();
  });

  test("returned and thrown Supabase lookup failures surface as SYNC_INFRA_ERROR", async () => {
    supabaseMock.state.error = { message: "db down" };
    const returned = await POST(request(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(returned.status).toBe(500);
    await expect(returned.json()).resolves.toEqual({ ok: false, error: "SYNC_INFRA_ERROR" });

    supabaseMock.state.error = null;
    supabaseMock.state.throws = new Error("network down");
    const thrown = await POST(request(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(thrown.status).toBe(500);
    await expect(thrown.json()).resolves.toEqual({ ok: false, error: "SYNC_INFRA_ERROR" });
  });
});
