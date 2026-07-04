import { describe, expect, test, vi } from "vitest";
import { resolveAdminAlert, resolveAdminAlerts } from "@/lib/adminAlerts/resolveAdminAlert";

function fakeResolveClient(result: { data?: unknown; error: unknown }) {
  const calls: Array<{ method: "eq" | "is" | "in"; column: string; value: unknown }> = [];
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
    in: vi.fn((column: string, value: unknown) => {
      calls.push({ method: "in", column, value });
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

    // A non-inbox per-show code (SHEET_UNAVAILABLE is now inbox-routed → auto-clear only).
    await resolveAdminAlert({ showId: "show-1", code: "TILE_PROJECTION_FETCH_FAILED" }, client);

    expect(calls).toContainEqual({ method: "eq", column: "show_id", value: "show-1" });
  });

  test("rejects an inbox-routed code (auto-clear only) without touching the client", async () => {
    const { client, from } = fakeResolveClient({ error: null });

    await expect(
      resolveAdminAlert({ showId: "show-1", code: "SHEET_UNAVAILABLE" }, client),
    ).rejects.toThrow(/auto-resolve-only/i);
    expect(from).not.toHaveBeenCalled();
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

describe("resolveAdminAlerts (bulk)", () => {
  test("codes: [] is a no-op — zero client invocations", async () => {
    const { client, from } = fakeResolveClient({ error: null });

    await resolveAdminAlerts({ showId: "s-1", codes: [] }, client);

    expect(from).not.toHaveBeenCalled();
  });

  test("filters: code IN codes, show_id exact (null → .is), resolved_at null; sets only resolved_at", async () => {
    const { client, from, update, select, calls } = fakeResolveClient({
      data: [{ id: "alert-1" }],
      error: null,
    });

    await resolveAdminAlerts(
      { showId: null, codes: ["REEL_DRIFTED", "EMBEDDED_ASSET_DRIFTED"] },
      client,
    );

    expect(from).toHaveBeenCalledWith("admin_alerts");
    // toHaveBeenCalledWith asserts an exact object match, so this also proves no
    // resolved_by key is present alongside resolved_at.
    expect(update).toHaveBeenCalledWith({
      resolved_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(calls).toEqual([
      { method: "in", column: "code", value: ["REEL_DRIFTED", "EMBEDDED_ASSET_DRIFTED"] },
      { method: "is", column: "resolved_at", value: null },
      { method: "is", column: "show_id", value: null },
    ]);
    expect(select).toHaveBeenCalledWith("id");
  });

  test("show-scoped: show_id exact match via .eq", async () => {
    const { client, calls } = fakeResolveClient({ data: [{ id: "alert-1" }], error: null });

    await resolveAdminAlerts({ showId: "show-1", codes: ["SYNC_STALLED"] }, client);

    expect(calls).toContainEqual({ method: "eq", column: "show_id", value: "show-1" });
  });

  test("returned DB error throws", async () => {
    const { client } = fakeResolveClient({ error: { message: "boom" } });

    await expect(
      resolveAdminAlerts({ showId: null, codes: ["SYNC_STALLED"] }, client),
    ).rejects.toThrow(/admin alert bulk resolve failed: boom/);
  });

  test("thrown query fault throws", async () => {
    const client = {
      from: () => {
        throw new Error("network down");
      },
    };

    await expect(
      resolveAdminAlerts({ showId: null, codes: ["SYNC_STALLED"] }, client as never),
    ).rejects.toThrow(/network down/);
  });

  test("rejects when any code in the batch is inbox-routed", async () => {
    const { client, from } = fakeResolveClient({ error: null });

    await expect(
      resolveAdminAlerts(
        { showId: "show-1", codes: ["SYNC_STALLED", "PARSE_ERROR_LAST_GOOD"] },
        client,
      ),
    ).rejects.toThrow(/auto-resolve-only/i);
    expect(from).not.toHaveBeenCalled();
  });
});
