import type { AgendaEntry } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional string fields on AgendaEntry (beyond the required start + title). */
const OPTIONAL_FIELDS = ["finish", "trt", "room", "av"] as const;

/**
 * Total, deep per-layer JSONB decoder for `shows_internal.run_of_show`.
 *
 * The column is schemaless JSONB; a buggy sync / pre-lockdown manual edit /
 * migration drift could store non-ISO keys, non-array day values, null entries,
 * or non-string optional fields. Because §03's UI keys off
 * `runOfShow[isoDate]?.length > 0`, an under-validated value turns corrupt
 * storage into a Schedule render crash instead of the anchor-strip fallback.
 *
 * Contract (spec §4.2 + R14):
 * - `null`                        → { value: null,  corrupt: false }
 * - non-plain-object top-level   → { value: null,  corrupt: true  }
 * - non-ISO key                   → key dropped,    corrupt = true
 * - non-array day value           → day dropped,    corrupt = true
 * - entry: not plain obj, missing/non-string title, sentinel title,
 *   missing/non-string start, any present optional not a string
 *                                 → entry dropped,  corrupt = true
 * - day with zero valid entries   → key omitted from value
 * - no surviving days             → { value: null,  corrupt: <accumulated> }
 *
 * Totality scope (R16): operates on JSONB-shaped plain data only — no
 * throwing property reads are possible. try/catch is intentionally absent.
 */
export function decodeRunOfShow(raw: unknown): {
  value: Record<string, AgendaEntry[]> | null;
  corrupt: boolean;
} {
  // Layer 0: null is legitimate empty — NOT corrupt.
  if (raw === null) return { value: null, corrupt: false };

  // Layer 1: top-level must be a plain object (not array, not primitive).
  if (
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return { value: null, corrupt: true };
  }

  let corrupt = false;
  const result: Record<string, AgendaEntry[]> = {};

  for (const key of Object.keys(raw as Record<string, unknown>)) {
    const dayRaw = (raw as Record<string, unknown>)[key];

    // Layer 2: key must be a YYYY-MM-DD ISO date.
    if (!ISO_DATE_RE.test(key)) {
      corrupt = true;
      continue;
    }

    // Layer 3: day value must be an array.
    if (!Array.isArray(dayRaw)) {
      corrupt = true;
      continue;
    }

    // Layer 4: validate each entry.
    const validEntries: AgendaEntry[] = [];
    for (const entryRaw of dayRaw) {
      // Entry must be a plain, non-null object.
      if (
        entryRaw === null ||
        typeof entryRaw !== "object" ||
        Array.isArray(entryRaw)
      ) {
        corrupt = true;
        continue;
      }

      const entry = entryRaw as Record<string, unknown>;

      // `title` must be a non-empty string that passes the real-title gate.
      const title = entry["title"];
      if (
        typeof title !== "string" ||
        title === "" ||
        shouldHideGenericOptional(title)
      ) {
        corrupt = true;
        continue;
      }

      // `start` is required and must be a string.
      const start = entry["start"];
      if (typeof start !== "string") {
        corrupt = true;
        continue;
      }

      // Every PRESENT optional field must be a string.
      let optionalsOk = true;
      for (const field of OPTIONAL_FIELDS) {
        const v = entry[field];
        if (v !== undefined && typeof v !== "string") {
          optionalsOk = false;
          break;
        }
      }
      if (!optionalsOk) {
        corrupt = true;
        continue;
      }

      // Build the decoded entry — only include present optional fields.
      const decoded: AgendaEntry = { start, title };
      for (const field of OPTIONAL_FIELDS) {
        const v = entry[field];
        if (typeof v === "string") {
          decoded[field] = v;
        }
      }
      validEntries.push(decoded);
    }

    // Days with zero valid entries are omitted (→ anchor-strip fallback).
    if (validEntries.length > 0) {
      result[key] = validEntries;
    }
  }

  // No surviving days → value is null (so §03 UI and §4.5 guard both see null).
  const value = Object.keys(result).length > 0 ? result : null;
  return { value, corrupt };
}
