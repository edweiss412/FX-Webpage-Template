import type { SectionId } from "@/lib/crew/resolveActiveSection";

/**
 * Search index and result shapes. `SearchCopy`, `SearchEntry` and `SearchIndex`
 * are spec §3 verbatim; `SearchHit` and `SearchResult` are the §5.6 output.
 */

export type SearchCopy = {
  kind: "network" | "password" | "hotelConfirmation" | "flightConfirmation";
  text: string; // the exact string written to the clipboard
};

export type SearchEntry = {
  id: string; // the data-search-target value, unique within the index
  section: SectionId;
  group: string; // card title or sub-heading shown on the row, e.g. "Video"
  label: string | null; // field label, e.g. "Grand Ballroom"; null for free text
  value: string; // the line's displayed text
  context: readonly string[]; // other visible words that place the line, e.g. a day label
  copy: SearchCopy | null;
};

export type SearchIndex = { entries: readonly SearchEntry[] };

/** A half-open `[start, end)` span of UTF-16 offsets into a display string. */
export type Range = { start: number; end: number };

export type SearchHit = {
  entry: SearchEntry;
  score: number;
  /** Highlight spans per displayed field. Context strings carry none. */
  ranges: { group: Range[]; label: Range[]; value: Range[] };
  /**
   * The display text of the first alias source span, set only when no query
   * token matched a displayed field by exact, prefix or fuzzy (spec §5.6). The
   * UI renders it as `Matched "<aliasNote>"` (spec §10).
   */
  aliasNote: string | null;
};

export type SearchResult = {
  total: number;
  sections: { section: SectionId; rows: SearchHit[] }[];
};
