import type { AgendaEntry, ScheduleDay } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional string fields on AgendaEntry (beyond the required start + title). */
const OPTIONAL_FIELDS = ["finish", "trt", "room", "av"] as const;

/**
 * Validate and decode a raw array of entries. Mutates the outer `corruptRef`
 * array (single-element box) when a bad entry is encountered.
 */
function decodeEntries(rawArr: unknown[], corruptRef: [boolean]): AgendaEntry[] {
  const validEntries: AgendaEntry[] = [];
  for (const entryRaw of rawArr) {
    // Entry must be a plain, non-null object.
    if (entryRaw === null || typeof entryRaw !== "object" || Array.isArray(entryRaw)) {
      corruptRef[0] = true;
      continue;
    }

    const entry = entryRaw as Record<string, unknown>;

    // `title` must be a non-empty string that passes the real-title gate.
    const title = entry["title"];
    if (typeof title !== "string" || title === "" || shouldHideGenericOptional(title)) {
      corruptRef[0] = true;
      continue;
    }

    // `start` is required and must be a string.
    const start = entry["start"];
    if (typeof start !== "string") {
      corruptRef[0] = true;
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
      corruptRef[0] = true;
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
    const k = entry["kind"];
    if (k === "strike" || k === "loadout") {
      decoded.kind = k;
    }
    // any other value (absent, "agenda", non-string, "banana") ⇒ no kind field; not corrupt.
    validEntries.push(decoded);
  }
  return validEntries;
}

/**
 * Total, deep per-layer JSONB decoder for `shows_internal.run_of_show`.
 *
 * The column is schemaless JSONB; a buggy sync / pre-lockdown manual edit /
 * migration drift could store non-ISO keys, non-array day values, null entries,
 * or non-string optional fields. Because §03's UI keys off
 * `runOfShow[isoDate]?.entries.length > 0`, an under-validated value turns
 * corrupt storage into a Schedule render crash instead of the anchor-strip
 * fallback.
 *
 * Contract (spec §4.2 + R14 + §3.2 ScheduleDay reshape):
 * - `null`                          → { value: null,  corrupt: false }
 * - non-plain-object top-level     → { value: null,  corrupt: true  }
 * - non-ISO key                     → key dropped,    corrupt = true
 * - legacy array day (AgendaEntry[]) → wrapped to { entries, showStart: null, window: null }
 * - object day (ScheduleDay shape) → validated (entries[], showStart, window)
 * - primitive/other day value       → day dropped,    corrupt = true  (§14 rollback contract)
 * - entry: not plain obj, missing/non-string title, sentinel title,
 *   missing/non-string start, any present optional not a string
 *                                   → entry dropped,  corrupt = true
 * - day with zero usable fields (entries:[] + showStart:null + window:null)
 *                                   → key omitted from value
 * - no surviving days               → { value: null,  corrupt: <accumulated> }
 *
 * Totality scope (R16): operates on JSONB-shaped plain data only — no
 * throwing property reads are possible. try/catch is intentionally absent.
 */
export function decodeRunOfShow(raw: unknown): {
  value: Record<string, ScheduleDay> | null;
  corrupt: boolean;
} {
  // Layer 0: null is legitimate empty — NOT corrupt.
  if (raw === null) return { value: null, corrupt: false };

  // Layer 1: top-level must be a plain object (not array, not primitive).
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { value: null, corrupt: true };
  }

  const corruptRef: [boolean] = [false];
  const result: Record<string, ScheduleDay> = {};

  for (const key of Object.keys(raw as Record<string, unknown>)) {
    const dayRaw = (raw as Record<string, unknown>)[key];

    // Layer 2: key must be a YYYY-MM-DD ISO date.
    if (!ISO_DATE_RE.test(key)) {
      corruptRef[0] = true;
      continue;
    }

    // Layer 3 + 4: shape-discriminating day decoder (§3.2).
    let entries: AgendaEntry[];
    let showStart: string | null = null;
    let window: { start: string; end: string } | null = null;

    if (Array.isArray(dayRaw)) {
      // Legacy Record<iso, AgendaEntry[]> → wrap (deploy→re-sync negative-regression §3.2).
      entries = decodeEntries(dayRaw, corruptRef);
    } else if (dayRaw !== null && typeof dayRaw === "object") {
      // New ScheduleDay object shape.
      const day = dayRaw as Record<string, unknown>;

      // entries[] is required and must be an array.
      if (!Array.isArray(day["entries"])) {
        corruptRef[0] = true;
        continue;
      }
      entries = decodeEntries(day["entries"] as unknown[], corruptRef);

      // showStart: string | null, sentinel-guarded.
      const ss = day["showStart"];
      if (ss === null || ss === undefined) {
        showStart = null;
      } else if (typeof ss === "string") {
        showStart = shouldHideGenericOptional(ss) ? null : ss;
      } else {
        corruptRef[0] = true;
        continue;
      }

      // window: {start, end} both non-sentinel strings, else null.
      const w = day["window"];
      if (w === null || w === undefined) {
        window = null;
      } else if (typeof w === "object" && !Array.isArray(w)) {
        const ws = (w as Record<string, unknown>)["start"];
        const we = (w as Record<string, unknown>)["end"];
        if (
          typeof ws === "string" &&
          typeof we === "string" &&
          !shouldHideGenericOptional(ws) &&
          !shouldHideGenericOptional(we)
        ) {
          window = { start: ws, end: we };
        } else {
          // Sentinel / partial window → drop the window field, not corrupt.
          window = null;
        }
      } else {
        corruptRef[0] = true;
        continue;
      }
    } else {
      // Primitive / other → corrupt-skip (§14 rollback blast-radius contract).
      corruptRef[0] = true;
      continue;
    }

    // Omit fully-empty days (no usable fields) → anchor-strip fallback upstream.
    if (entries.length > 0 || showStart !== null || window !== null) {
      result[key] = { entries, showStart, window };
    }
  }

  // No surviving days → value is null (so §03 UI and §4.5 guard both see null).
  const value = Object.keys(result).length > 0 ? result : null;
  return { value, corrupt: corruptRef[0] };
}
