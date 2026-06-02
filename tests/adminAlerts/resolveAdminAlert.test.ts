import { describe, expect, test, vi } from "vitest";
import { resolveAdminAlert } from "@/lib/adminAlerts/resolveAdminAlert";

function fakeResolveClient(result: { data?: unknown; error: unknown }) {
  const calls: Array<{ method: "eq" | "is"; column: string; value: unknown }> = [];
  const select = vi.fn().mockResolvedValue({ data: result.data ?? [], error: result.error });
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      calls.push({ method: "eq", column, value });
      return query;
    }),
    is: vi.fn((column: string, value: unknown) => {
      calls.push({ method: "is", column, value });
      return query;
    }),
    select,
  };
  const update = vi.fn(() => query);
  const from = vi.fn(() => ({ update }));
  return { client: { from } as never, from, update, query, select, calls };
}

describe("resolveAdminAlert", () => {
  test("resolves the open global alert for the coalesced null-show key", async () => {
    const { client, from, update, select, calls } = fakeResolveClient({
      data: [{ id: "alert-1" }],
      error: null,
    });

    await resolveAdminAlert({ showId: null, code: "SYNC_STALLED" }, client);

    expect(from).toHaveBeenCalledWith("admin_alerts");
    expect(update).toHaveBeenCalledWith({
      resolved_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(calls).toEqual([
      { method: "eq", column: "code", value: "SYNC_STALLED" },
      { method: "is", column: "resolved_at", value: null },
      { method: "is", column: "show_id", value: null },
    ]);
    expect(select).toHaveBeenCalledWith("id");
  });

  test("resolves a show-scoped alert by show_id and code", async () => {
    const { client, calls } = fakeResolveClient({ data: [{ id: "alert-1" }], error: null });

    await resolveAdminAlert({ showId: "show-1", code: "SHEET_UNAVAILABLE" }, client);

    expect(calls).toContainEqual({ method: "eq", column: "show_id", value: "show-1" });
  });

  test("throws on a returned DB error", async () => {
    const { client } = fakeResolveClient({ error: { message: "boom" } });

    await expect(resolveAdminAlert({ showId: null, code: "SYNC_STALLED" }, client)).rejects.toThrow(
      /admin alert resolve failed: boom/,
    );
  });

  test("throws on a thrown DB fault", async () => {
    const client = {
      from: () => {
        throw new Error("network down");
      },
    };

    await expect(
      resolveAdminAlert({ showId: null, code: "SYNC_STALLED" }, client as never),
    ).rejects.toThrow(/network down/);
  });
});
