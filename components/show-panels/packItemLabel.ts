/**
 * components/show-panels/packItemLabel.ts
 *
 * The one label a parsed pull-sheet item reads as (crew page redesign PR C plan
 * decision 9). A module of its own, without the body's markup, because the crew's
 * rows file feeds the search builders, and a builder's import graph may reach no
 * `"use client"` module (tests/search/builderImports.test.ts), which the body's does
 * through `PackCaseItems`. `PackListBody.tsx` re-exports it under the same name.
 *
 * Pure and server-safe.
 */
import { hasContent } from "@/components/show-panels/fieldRows";
import type { PullSheetItem } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/**
 * One parsed PULL-sheet item as its row reads: `qty × item (cat / subCat)`, with the
 * decorative cat/subCat taxonomy sentinel-guarded (hidden when TBD/N/A/empty) and the
 * qty prefix dropped when null. The item NAME itself is shown as-parsed: on a review
 * surface a garbled name must be visible, not hidden.
 */
export function packItemLabel(item: PullSheetItem): string {
  const cat = shouldHideGenericOptional(item.cat) ? null : item.cat;
  const subCat = shouldHideGenericOptional(item.subCat) ? null : item.subCat;
  const taxonomy = [cat, subCat].filter(Boolean).join(" / ");
  const qtyPart = item.qty !== null && item.qty !== undefined ? `${item.qty} × ` : "";
  // Defensive (§4.6, untyped-on-wire JSONB): the type says `item: string`, but a
  // malformed row must never render the literal "undefined". A nameless item is
  // itself a parse signal worth seeing on a review surface, so label it.
  const name = hasContent(item.item) ? item.item : "(unnamed item)";
  return `${qtyPart}${name}${taxonomy ? ` (${taxonomy})` : ""}`;
}
