import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";

/**
 * Spread into any crew-section or `<WrappedSection>` construction in tests:
 * `{...ledgerProp()}`.
 *
 * Use this where the test does not care about the ledger. Where it DOES care
 * (asserting what a render recorded), construct the ledger explicitly and pass
 * `ledger={ledger}` so the assertion has a handle on it.
 */
export function ledgerProp(): { ledger: TileRenderLedger } {
  return { ledger: createTileRenderLedger() };
}
