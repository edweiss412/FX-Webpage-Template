import { describe, expect, test, vi } from "vitest";

import { resolveTileAlertsForObserver } from "@/lib/adminAlerts/resolveTileAlertsForObserver";

/** Minimal PostgREST builder double: every filter returns `this`, `select` settles. */
function clientReturning(result: { data?: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["update", "eq", "is", "in"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.select = vi.fn(async () => result);
  const from = vi.fn(() => builder);
  return { client: { from } as never, from, builder };
}

describe("resolveTileAlertsForObserver", () => {
  test("empty tileIds issues NO supabase call", async () => {
    const { client, from } = clientReturning({ data: [], error: null });
    await resolveTileAlertsForObserver(
      { showId: "show-1", viewerKey: "crew-1", tileIds: [] },
      client,
    );
    expect(from).not.toHaveBeenCalled();
  });

  test("filters on code, show, observer and tiles", async () => {
    const { client, builder, from } = clientReturning({ data: [], error: null });
    await resolveTileAlertsForObserver(
      { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
      client,
    );
    expect(from).toHaveBeenCalledWith("admin_alerts");
    expect(builder.eq).toHaveBeenCalledWith("code", "TILE_SERVER_RENDER_FAILED");
    expect(builder.eq).toHaveBeenCalledWith("show_id", "show-1");
    expect(builder.eq).toHaveBeenCalledWith("context->>viewerKey", "crew-1");
    expect(builder.is).toHaveBeenCalledWith("resolved_at", null);
    expect(builder.in).toHaveBeenCalledWith("context->>tileId", ["crew:gear:scope"]);
  });

  test("a null showId filters IS NULL rather than eq", async () => {
    const { client, builder } = clientReturning({ data: [], error: null });
    await resolveTileAlertsForObserver(
      { showId: null, viewerKey: "admin", tileIds: ["crew:gear:scope"] },
      client,
    );
    expect(builder.is).toHaveBeenCalledWith("show_id", null);
  });

  test("sets resolved_at only, never resolved_by", async () => {
    const { client, builder } = clientReturning({ data: [], error: null });
    await resolveTileAlertsForObserver(
      { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
      client,
    );
    const patch = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(patch)).toEqual(["resolved_at"]);
  });

  test("throws on a returned DB error", async () => {
    const { client } = clientReturning({ error: { message: "boom" } });
    await expect(
      resolveTileAlertsForObserver(
        { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
        client,
      ),
    ).rejects.toThrow(/boom/);
  });

  test("throws on a thrown query fault", async () => {
    const builder: Record<string, unknown> = {};
    for (const m of ["update", "eq", "is", "in"]) builder[m] = vi.fn(() => builder);
    builder.select = vi.fn(async () => {
      throw new Error("socket closed");
    });
    const client = { from: vi.fn(() => builder) } as never;
    await expect(
      resolveTileAlertsForObserver(
        { showId: "show-1", viewerKey: "crew-1", tileIds: ["crew:gear:scope"] },
        client,
      ),
    ).rejects.toThrow(/socket closed/);
  });
});
