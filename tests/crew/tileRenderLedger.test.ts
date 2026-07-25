import { describe, expect, test } from "vitest";

import {
  cleanTileIds,
  createTileRenderLedger,
  type TileRenderLedger,
} from "@/lib/crew/tileRenderLedger";

// Fixture: the tiles this render attempted. cleanTileIds must be derived from
// THIS set, never a hardcoded list, so a shrinking render shrinks the result.
const ATTEMPTED = ["crew:today:notes", "crew:travel:transport", "crew:gear:scope"] as const;

function ledgerWith(failed: Record<string, string> = {}): TileRenderLedger {
  const ledger = createTileRenderLedger();
  for (const id of ATTEMPTED) ledger.attempted.add(id);
  for (const [id, message] of Object.entries(failed))
    ledger.failed.set(id, { message, error: new Error(message) });
  return ledger;
}

describe("tileRenderLedger", () => {
  test("a fresh ledger is empty", () => {
    const ledger = createTileRenderLedger();
    expect(ledger.attempted.size).toBe(0);
    expect(ledger.failed.size).toBe(0);
  });

  test("cleanTileIds is attempted minus failed, sorted", () => {
    const ledger = ledgerWith({ "crew:travel:transport": "boom" });
    expect(cleanTileIds(ledger)).toEqual(
      [...ATTEMPTED].filter((id) => id !== "crew:travel:transport").sort(),
    );
  });

  test("a tile that never ran is NOT clean", () => {
    const ledger = createTileRenderLedger();
    ledger.attempted.add("crew:today:notes");
    // Budget was never attempted (viewer not entitled) - must not appear.
    expect(cleanTileIds(ledger)).not.toContain("crew:budget:rows");
  });

  test("the thrown message is retained per tile", () => {
    const ledger = ledgerWith({ "crew:gear:scope": "scope projection blew up" });
    expect(ledger.failed.get("crew:gear:scope")?.message).toBe("scope projection blew up");
  });

  test("every attempted tile is clean when nothing failed", () => {
    expect(cleanTileIds(ledgerWith())).toEqual([...ATTEMPTED].sort());
  });

  test("two ledgers are independent", () => {
    const a = createTileRenderLedger();
    const b = createTileRenderLedger();
    a.attempted.add("crew:gear:scope");
    a.failed.set("crew:gear:scope", { message: "boom", error: new Error("boom") });
    expect(b.attempted.size).toBe(0);
    expect(b.failed.size).toBe(0);
  });
});
