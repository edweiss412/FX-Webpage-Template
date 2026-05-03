/**
 * OPS / FINANCIALS block parser (§4.4).
 *
 * Parses: { po, proposal, invoice, invoiceNotes, coi_status }
 *
 * These fields appear as rows in the TRANSPORTATION block (all versions):
 *   | COI | <value> |
 *   | Proposal | <value> |
 *   | PO\# | <value> |    (or "PO#", "PO #")
 *   | Invoice | <value> |
 *   | Invoice Notes | <value> |
 *
 * coi_status is stored VERBATIM — no enum normalization (§6.5 free-text fallback).
 * Values like "SENT", "IN PROCESS", "Sent", "Sent - Budget $17,500" are all preserved.
 *
 * Field aliases are used for label-to-canonical resolution via FIELD_ALIASES.
 */

import type { ShowRow } from "../types";
import { clean, presence, splitRow } from "./_helpers";

export type OpsResult = Pick<
  ShowRow,
  "po" | "proposal" | "invoice" | "invoice_notes" | "coi_status"
>;

// Label patterns that map to ops fields
const COI_RE = /^\s*COI\s*$/i;
const PROPOSAL_RE = /^\s*Proposal\s*$/i;
const PO_RE = /^\s*PO[\\#\s]*#?\s*$/i;
const INVOICE_RE = /^\s*Invoice\s*$/i;
const INVOICE_NOTES_RE = /^\s*Invoice\s+Notes?\s*$/i;

export function parseOps(markdown: string, _version: "v1" | "v2" | "v4"): OpsResult {
  let po: string | null = null;
  let proposal: string | null = null;
  let invoice: string | null = null;
  let invoice_notes: string | null = null;
  let coi_status: string | null = null;

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = splitRow(trimmed);
    if (cells.length < 2) continue;
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue; // separator

    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    if (!col0) continue;

    // Extract value from first non-empty cell after col0
    const val = col1 || clean(cells[2] ?? "") || null;

    if (COI_RE.test(col0)) {
      // coi_status is verbatim — no normalization
      if (coi_status === null) coi_status = presence(val ?? "");
    } else if (PROPOSAL_RE.test(col0)) {
      if (proposal === null) proposal = presence(val ?? "");
    } else if (PO_RE.test(col0)) {
      if (po === null) po = presence(val ?? "");
    } else if (INVOICE_NOTES_RE.test(col0)) {
      if (invoice_notes === null) invoice_notes = presence(val ?? "");
    } else if (INVOICE_RE.test(col0)) {
      if (invoice === null) invoice = presence(val ?? "");
    }
  }

  return { po, proposal, invoice, invoice_notes, coi_status };
}
