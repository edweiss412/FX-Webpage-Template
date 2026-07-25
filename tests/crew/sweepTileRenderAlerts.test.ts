import { beforeEach, describe, expect, test, vi } from "vitest";

const { upsertMock, resolveMock, logErrorMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(async () => null),
  resolveMock: vi.fn(async () => undefined),
  logErrorMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert: upsertMock }));
vi.mock("@/lib/adminAlerts/resolveTileAlertsForObserver", () => ({
  resolveTileAlertsForObserver: resolveMock,
}));
vi.mock("@/lib/log", () => ({
  log: { error: logErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { sweepTileRenderAlerts } from "@/lib/crew/sweepTileRenderAlerts";

const ARGS = { showId: "show-1", sheetName: "RPAS Central 2026", viewerKey: "crew-dana" };

function ledger(attempted: string[], failed: Record<string, string> = {}): TileRenderLedger {
  const l = createTileRenderLedger();
  for (const id of attempted) l.attempted.add(id);
  for (const [id, msg] of Object.entries(failed)) l.failed.set(id, msg);
  return l;
}

beforeEach(() => {
  upsertMock.mockClear();
  resolveMock.mockClear();
  logErrorMock.mockClear();
  logErrorMock.mockImplementation(async () => undefined);
});

describe("sweepTileRenderAlerts", () => {
  test("carries the thrown message into context.message", async () => {
    await sweepTileRenderAlerts(
      ledger(["crew:gear:scope"], { "crew:gear:scope": "scope projection blew up" }),
      ARGS,
    );
    expect(upsertMock).toHaveBeenCalledWith({
      showId: "show-1",
      code: "TILE_SERVER_RENDER_FAILED",
      context: {
        tileId: "crew:gear:scope",
        message: "scope projection blew up",
        sheet_name: "RPAS Central 2026",
        viewerKey: "crew-dana",
      },
    });
  });

  test("the failed tile is raised and is NOT in the resolve set", async () => {
    await sweepTileRenderAlerts(
      ledger(["crew:gear:scope", "crew:today:notes"], { "crew:gear:scope": "boom" }),
      ARGS,
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const resolved = resolveMock.mock.calls[0]?.[0] as unknown as { tileIds: string[] };
    expect(resolved.tileIds).toEqual(["crew:today:notes"]);
  });

  test("raise happens before resolve", async () => {
    const order: string[] = [];
    upsertMock.mockImplementationOnce(async () => {
      order.push("raise");
      return null;
    });
    resolveMock.mockImplementationOnce(async () => {
      order.push("resolve");
    });
    await sweepTileRenderAlerts(
      ledger(["crew:gear:scope", "crew:today:notes"], { "crew:gear:scope": "boom" }),
      ARGS,
    );
    expect(order).toEqual(["raise", "resolve"]);
  });

  test("the resolve carries THIS render's viewerKey", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes"]), ARGS);
    expect(resolveMock).toHaveBeenCalledWith({
      showId: "show-1",
      viewerKey: "crew-dana",
      tileIds: ["crew:today:notes"],
    });
  });

  test("a plain-admin render sweeps under the admin key", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes"]), { ...ARGS, viewerKey: "admin" });
    expect(resolveMock).toHaveBeenCalledWith(expect.objectContaining({ viewerKey: "admin" }));
  });

  test("an all-clean render raises nothing", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes", "crew:gear:scope"]), ARGS);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("a tile that never ran is neither raised nor resolved", async () => {
    await sweepTileRenderAlerts(ledger(["crew:today:notes"]), ARGS);
    const resolved = resolveMock.mock.calls[0]?.[0] as unknown as { tileIds: string[] };
    expect(resolved.tileIds).not.toContain("crew:budget:rows");
  });

  // The accepted concurrent race (spec 4.7) is only tolerable because a genuinely
  // broken tile re-raises. If this stops holding, the trade-off is unsound.
  test("a spuriously resolved tile is re-raised by the next failing sweep", async () => {
    await sweepTileRenderAlerts(ledger(["crew:travel:transport"]), ARGS);
    expect(upsertMock).not.toHaveBeenCalled();

    upsertMock.mockClear();
    await sweepTileRenderAlerts(
      ledger(["crew:travel:transport"], { "crew:travel:transport": "still broken" }),
      ARGS,
    );
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]?.[0]).toMatchObject({
      context: expect.objectContaining({ tileId: "crew:travel:transport" }),
    });
  });

  // Without this, replacing `await log.error(...)` with `void log.error(...)`
  // leaves every other test green while re-opening the evidence-loss hole the
  // awaited log exists to close.
  test("the durable failure log is AWAITED before the sweep settles", async () => {
    let logSettled = false;
    logErrorMock.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            logSettled = true;
            resolve();
          }, 0),
        ),
    );
    await sweepTileRenderAlerts(ledger(["crew:gear:scope"], { "crew:gear:scope": "boom" }), ARGS);
    expect(logSettled, "sweepTileRenderAlerts must await the durable log").toBe(true);
  });

  test("an upsert failure does not prevent the resolve", async () => {
    upsertMock.mockRejectedValueOnce(new Error("supabase down"));
    await expect(
      sweepTileRenderAlerts(
        ledger(["crew:gear:scope", "crew:today:notes"], { "crew:gear:scope": "boom" }),
        ARGS,
      ),
    ).resolves.toBeUndefined();
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });

  test("a resolve failure is swallowed", async () => {
    resolveMock.mockRejectedValueOnce(new Error("supabase down"));
    await expect(
      sweepTileRenderAlerts(ledger(["crew:today:notes"]), ARGS),
    ).resolves.toBeUndefined();
  });
});
