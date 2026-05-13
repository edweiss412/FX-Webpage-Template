/**
 * components/tiles/FinancialsTile.tsx — LEAD/admin-only financials tile
 * (M4 Task 4.8; spec §4.4 + §8.1; closes AC-4.2).
 *
 * Renders `props.financials.{po, proposal, invoice, invoice_notes}` as a
 * stack of KeyValue rows. The four fields are stored in the LEAD-only
 * `shows_internal.financials` JSONB (see lib/data/getShowForViewer.ts:59
 * for the row shape).
 *
 * Visibility — defense in depth:
 *
 *   1. lib/data/getShowForViewer.ts gates the query: `shows_internal` is
 *      JOINed only when isAdmin || roleFlags.includes('LEAD'). A non-LEAD
 *      response has financials === undefined.
 *   2. RLS on shows_internal is admin-only via is_admin() (M5 widens to
 *      LEAD-aware for cookie-bound viewers).
 *   3. THIS COMPONENT additionally re-checks via the canonical
 *      `financialsVisible(flags, isAdmin)` predicate. Even if a future
 *      projection refactor accidentally exposes financials to a non-LEAD
 *      viewer, the predicate gate here returns null and the user sees
 *      nothing.
 *
 * Empty-state (§8.3):
 *   - Predicate FALSE → return null. Page tile-grid reflows.
 *   - Predicate TRUE but `financials` undefined OR all four fields null →
 *     render the required-field EmptyState. A LEAD on a no-financials
 *     show STILL gets the tile so they see the missing-data signal
 *     (Doug owes them PO/Proposal/Invoice).
 *
 * Server Component (no `'use client'`).
 */
import type { FinancialsRow } from "@/lib/data/getShowForViewer";
import type { RoleFlag } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type FinancialsTileProps = {
  /**
   * Optional — only present when getShowForViewer's projection includes
   * the LEAD-only JSONB. The component MUST tolerate `undefined` (the
   * projection's signal that the viewer isn't entitled to financials).
   */
  financials: FinancialsRow | undefined;
  /** Freshly-derived role_flags from getShowForViewer. */
  viewerFlags: RoleFlag[];
  /** True when viewer.kind === 'admin'. */
  isAdmin: boolean;
};

export function FinancialsTile({ financials, viewerFlags, isAdmin }: FinancialsTileProps) {
  // Defense-in-depth gate. The application-layer projection already
  // gates this; the predicate re-check makes the contract local to the
  // component so a future refactor can't accidentally expose financials.
  if (!financialsVisible(viewerFlags, isAdmin)) return null;

  // §8.3 generic-optional sentinel-hiding (Codex round-12): each of
  // the four fields is a generic optional text field. Sentinel values
  // (`'TBD'`/`'N/A'`/`'TBA'`) must be treated as missing — both for
  // the allEmpty branch (so an all-sentinel financials row falls into
  // the empty-state placeholder) AND for the per-field render gate
  // (so individual sentinel fields reflow out).
  const poVisible = !shouldHideGenericOptional(financials?.po ?? null);
  const proposalVisible = !shouldHideGenericOptional(financials?.proposal ?? null);
  const invoiceVisible = !shouldHideGenericOptional(financials?.invoice ?? null);
  const invoiceNotesVisible = !shouldHideGenericOptional(financials?.invoice_notes ?? null);

  const allEmpty =
    !financials || (!poVisible && !proposalVisible && !invoiceVisible && !invoiceNotesVisible);

  if (allEmpty) {
    return (
      <Section
        testId="financials-tile"
        heading="Financials"
        headingTone="eyebrow"
        variant="reference"
        ariaLabel="Financials"
        bodyAs="div"
      >
        <EmptyState label="No financial details on file yet." />
      </Section>
    );
  }

  return (
    <Section
      testId="financials-tile"
      heading="Financials"
      headingTone="eyebrow"
      variant="reference"
      ariaLabel="Financials"
      bodyAs="dl"
    >
      {poVisible ? <KeyValue label="PO" value={financials.po} tabular /> : null}
      {proposalVisible ? <KeyValue label="Proposal" value={financials.proposal} tabular /> : null}
      {invoiceVisible ? <KeyValue label="Invoice" value={financials.invoice} tabular /> : null}
      {invoiceNotesVisible ? (
        <KeyValue label="Invoice notes" value={financials.invoice_notes} />
      ) : null}
    </Section>
  );
}


/**
 * View alias + async loader for M9 Task 9.2 — `FinancialsTile` is
 * already pure; the loader is identity but provides the seam where
 * future per-tile derivation can throw and be caught by
 * <TileServerFallback>.
 */
export const FinancialsTileView = FinancialsTile;

export async function loadFinancialsTileData(
  props: FinancialsTileProps,
): Promise<FinancialsTileProps> {
  return props;
}
