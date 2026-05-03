/**
 * EVENT DETAILS block parser (§2.10).
 *
 * Returns Record<string, string> — a flat map of field label → value.
 * All values are stored as raw strings (free-text preserved, no normalization).
 *
 * Layout variants:
 *
 * 1. v4/v2 "EVENT DETAILS" block (2025+):
 *    Header row: | EVENT DETAILS | |
 *    Followed by rows: | <label> | <value> |
 *    Labels include: DIagrams, LED, Backdrop / Scenic, Stage Size, Opening Reel,
 *    Keynote Requirements, Virtual Speaker, Virtual Audience, GS Podium Type,
 *    Record, Polling, Internet, Power, Equipment Storage, Staff Office Room, etc.
 *
 * 2. v2 "DETAILS" block (2025 older):
 *    Header: | DETAILS |
 *    Single-column list of field LABELS only (no values on same row).
 *    Values do not appear in this block; return empty record for these.
 *
 * 3. v1 "DETAILS/Room Diagram" block (2024):
 *    Header: | DETAILS/Room Diagram | DETAILS |
 *    Rows: | <label> | <value> |
 *
 * 4. v2 "GS DETAILS (FOR BOTH)" block (DCI RPAS):
 *    Same format as DETAILS but label "GS DETAILS".
 *
 * Key normalization: labels are lowercased and spaces replaced with underscores
 * to form canonical keys (e.g., "Virtual Audience" → "virtual_audience").
 * The original-case label is also stored for round-trip fidelity where needed.
 */

import { clean, presence, splitRow } from "./_helpers";

// The EVENT DETAILS block header labels (all variants found in corpus)
const EVENT_DETAILS_HEADER_RE =
  /^\|\s*(EVENT\s+DETAILS|DETAILS(?:\/Room\s+Diagram)?|GS\s+DETAILS(?:\s+\(FOR\s+BOTH\))?)\s*[|]/im;

// Labels that terminate the event details block
const TERMINATING_LABELS = new Set([
  "general session",
  "breakout",
  "crew",
  "hotel",
  "hotels",
  "transportation",
  "venue name",
  "venue address",
  "dates",
  "pull sheet",
  "pull",
  // Note: "diagrams" is NOT a terminator — it is a field within the event details block
  "no_header",
]);

// Field label → canonical key mapping (for well-known fields)
const CANONICAL_KEY_MAP: Record<string, string> = {
  "virtual audience": "virtual_audience",
  "virtaul audience": "virtual_audience", // typo variant
  "virtual speaker": "virtual_speaker",
  "opening reel": "opening_reel",
  "keynote requirements": "keynote_requirements",
  "backdrop / scenic": "scenic",
  "backdrop/scenic": "scenic",
  "gs podium type": "podium_type",
  "podium type": "podium_type",
  "stage size": "stage_size",
  diagrams: "diagrams",
  "diagrams link": "diagrams",
  led: "led",
  record: "record",
  polling: "polling",
  internet: "internet",
  power: "power",
  "equipment storage": "equipment_storage",
  "staff office room": "staff_office_room",
  "test pattern": "test_pattern",
  fonts: "fonts",
  "fonts (ii only)": "fonts",
  "digital signage": "digital_signage",
  gooseneck: "gooseneck",
  goosneck: "gooseneck",
  goosenecks: "gooseneck",
  notes: "notes",
};

export function parseEventDetails(
  markdown: string,
  _version: "v1" | "v2" | "v4",
): Record<string, string> {
  const result: Record<string, string> = {};

  // Find the event details block
  const headerMatch = EVENT_DETAILS_HEADER_RE.exec(markdown);
  if (!headerMatch) return result;

  const section = markdown.slice(headerMatch.index);
  const lines = section.split("\n");
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line.startsWith("|")) {
      if (inBlock) break; // end of block
      continue;
    }

    const cells = splitRow(line);
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue; // separator

    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    // The first row is the header itself
    if (!inBlock) {
      inBlock = true;
      // If this row is the header with no value, skip it
      if (EVENT_DETAILS_HEADER_RE.test(line)) continue;
    }

    if (!col0) continue;

    // Check for terminating labels (new block starting)
    const col0Lower = col0.toLowerCase();
    if (TERMINATING_LABELS.has(col0Lower)) break;
    // Also break on GENERAL SESSION / BREAKOUT headers
    if (/^GENERAL SESSION\b/.test(col0) || /^BREAKOUT \d/.test(col0)) break;

    // Two-column row: col0 is label, col1 is value
    if (col1) {
      const key = toCanonicalKey(col0);
      const val = presence(col1);
      if (key && val) {
        result[key] = val;
      }
    }
    // Single-column row (label only, no value) — skip
  }

  return result;
}

function toCanonicalKey(label: string): string {
  const lower = label.toLowerCase().trim();
  // Check known map first
  if (CANONICAL_KEY_MAP[lower]) return CANONICAL_KEY_MAP[lower]!;
  // Fallback: lowercase + underscores
  return lower.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
