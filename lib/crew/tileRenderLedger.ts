/**
 * Per-request record of which crew tiles ran, and which threw.
 *
 * Threaded from `_CrewShell` to each section as a REQUIRED prop, deliberately
 * NOT React `cache()`: the React build Vitest resolves without the
 * `react-server` condition turns `cache` into a pass-through, which would make
 * the shell/section identity contract untestable in exactly the place it
 * matters. The topology meta-test bounds who may construct a section, which is
 * what actually guarantees the ledger reaching the sweep.
 *
 * `failed` is a Map, not a Set: the sweep runs after `WrappedSection`'s catch
 * has returned, so the thrown message must be carried, not re-derived.
 */
export type TileRenderLedger = {
  attempted: Set<string>;
  /** tileId -> the thrown error's message, for the alert's `context.message`. */
  failed: Map<string, string>;
};

export function createTileRenderLedger(): TileRenderLedger {
  return { attempted: new Set(), failed: new Map() };
}

/**
 * Tiles that ran their render seam to completion without throwing.
 *
 * Membership requires `attempted`, so a tile the viewer was not entitled to
 * (Budget for a non-lead) is never clean and can never resolve its alert.
 */
export function cleanTileIds(ledger: TileRenderLedger): string[] {
  return [...ledger.attempted].filter((id) => !ledger.failed.has(id)).sort();
}
