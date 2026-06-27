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
import type { ParseAggregator } from "@/lib/parser/warnings";
import { resolveAliasScoped } from "@/lib/parser/aliases";
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

/**
 * Admin-table placeholder values that should be treated as absent.
 * Matched case-insensitively against the trimmed cell value.
 * These appear in reference/admin tables and must not overwrite real ops data.
 */
const ADMIN_PLACEHOLDER_VALUES = new Set(["FALSE", "TRUE", "N/A", "TBD", "—", "-", "?"]);

export function parseOps(
  markdown: string,
  _version: "v1" | "v2" | "v4",

  agg?: ParseAggregator,
): OpsResult {
  let po: string | null = null;
  let proposal: string | null = null;
  let invoice: string | null = null;
  let invoice_notes: string | null = null;
  let coi_status: string | null = null;

  // First-match-wins: track which fields have been seen (even if blank).
  // Without this, a blank first match leaves the field null, and a later
  // admin-table row (e.g. "PO # | FALSE") would backfill it with garbage.
  const seen = new Set<string>();

  // Scoped fuzzy fallback (PR-C): a row whose label matches none of the exact
  // patterns above is checked against the in-scope `ops.*` field aliases. A
  // near-miss (Damerau ≤ 1, minLen 5, tie-abort — so COI/PO# can't be fuzzed)
  // is recorded as a candidate and applied AFTER the loop, but only if the real
  // (exact-spelled) field never appeared. Exact rows always win.
  const CANON_TO_FIELD: Record<string, keyof OpsResult> = {
    "ops.coi": "coi_status",
    "ops.po": "po",
    "ops.proposal": "proposal",
    "ops.invoice": "invoice",
    "ops.invoice_notes": "invoice_notes",
  };
  const fuzzyCandidates: Partial<
    Record<keyof OpsResult, { rawLabel: string; value: string | null; canonical: string }>
  > = {};

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
    const rawVal = col1 || clean(cells[2] ?? "") || null;

    // Reject admin-table placeholders — treat them as blank
    const isPlaceholder =
      rawVal !== null && ADMIN_PLACEHOLDER_VALUES.has(rawVal.trim().toUpperCase());
    const val = isPlaceholder ? null : rawVal;

    if (COI_RE.test(col0)) {
      if (!seen.has("coi_status")) {
        seen.add("coi_status");
        // coi_status is verbatim — no normalization
        coi_status = presence(val ?? "");
      }
    } else if (PROPOSAL_RE.test(col0)) {
      if (!seen.has("proposal")) {
        seen.add("proposal");
        proposal = presence(val ?? "");
      }
    } else if (PO_RE.test(col0)) {
      if (!seen.has("po")) {
        seen.add("po");
        po = presence(val ?? "");
      }
    } else if (INVOICE_NOTES_RE.test(col0)) {
      if (!seen.has("invoice_notes")) {
        seen.add("invoice_notes");
        invoice_notes = presence(val ?? "");
      }
    } else if (INVOICE_RE.test(col0)) {
      if (!seen.has("invoice")) {
        seen.add("invoice");
        invoice = presence(val ?? "");
      }
    } else {
      // No exact pattern matched — try a scoped fuzzy recovery on the LABEL only
      // (never the value). First fuzzy candidate per field wins.
      const fuzzy = resolveAliasScoped(col0, "ops.");
      if (fuzzy?.corrected) {
        const field = CANON_TO_FIELD[fuzzy.canonical];
        if (field && fuzzyCandidates[field] === undefined) {
          fuzzyCandidates[field] = { rawLabel: col0, value: val, canonical: fuzzy.canonical };
        }
      }
    }
  }

  // Apply fuzzy candidates only for fields no exact row claimed. Exact wins.
  for (const key of Object.keys(fuzzyCandidates) as (keyof OpsResult)[]) {
    if (seen.has(key)) continue;
    const cand = fuzzyCandidates[key]!;
    const v = presence(cand.value ?? "");
    if (key === "coi_status") coi_status = v;
    else if (key === "po") po = v;
    else if (key === "proposal") proposal = v;
    else if (key === "invoice") invoice = v;
    else if (key === "invoice_notes") invoice_notes = v;
    seen.add(key);
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      message: `Read likely-misspelled field label '${cand.rawLabel}' as field '${cand.canonical}'`,
      blockRef: { kind: "financials" },
      rawSnippet: cand.rawLabel,
    });
  }

  return { po, proposal, invoice, invoice_notes, coi_status };
}
