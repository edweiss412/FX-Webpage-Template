/**
 * Canonical known-section-header registry (parse-data-quality-warnings §5.2).
 *
 * Consolidates the header tokens that the scattered block parsers recognize
 * (crew.ts CREW/TECH, hotels.ts HOTEL/HOTEL RESERVATIONS/HOTEL STAYS,
 * transport.ts TRANSPORTATION, rooms.ts GENERAL SESSION/BREAKOUT/ADDITIONAL
 * ROOM/LUNCH ROOM/DETAILS, event.ts EVENT DETAILS/DETAILS/GS DETAILS, dates.ts
 * DATES, venue.ts VENUE/VENUES, contacts.ts IN HOUSE AV, index.ts AGENDA) into
 * a single source of truth so the class-B unknown-section scan can tell a real
 * (parsed) section from a genuinely-unrecognized one.
 *
 * The companion registry meta-test (`tests/parser/_metaKnownSectionsRegistry.test.ts`)
 * asserts every block-parser header token is present here, so adding a future
 * block parser without registering its header fails CI rather than producing a
 * false-positive UNKNOWN_SECTION_HEADER on its rows.
 */

/** Normalize a header cell for comparison: upper-cased, single-spaced, trimmed. */
export function normalizeHeader(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Canonical section-header tokens. Many real headers carry a suffix (a room
 * name, an ordinal): `GENERAL SESSION - GRAND BALLROOM A/B`, `ADDITIONAL ROOM 2`.
 * `isKnownSectionHeader` therefore matches a registry entry as a whole-token
 * PREFIX of the (normalized) col0, not only an exact equality.
 */
export const KNOWN_SECTION_HEADERS: ReadonlySet<string> = new Set([
  "CREW",
  "TECH",
  "HOTEL",
  "HOTELS",
  "HOTEL RESERVATIONS",
  "HOTEL RESERVATION",
  "HOTEL STAYS",
  "HOTEL STAY",
  "TRANSPORTATION",
  "GENERAL SESSION",
  "GS DETAILS",
  "BREAKOUT",
  "BREAKOUTS",
  "ADDITIONAL ROOM",
  "LUNCH ROOM",
  "LUNCH SESSION",
  "EVENT DETAILS",
  "DETAILS",
  "DATES",
  "VENUE",
  "VENUES",
  "IN HOUSE AV",
  "AGENDA",
  "AGENDA LINK",
  "CLIENT",
  "DRESS",
  "COI",
  "DOCUMENT FOLDER LINK",
  "PULL SHEET",
  "FOYER",
]);

/**
 * Section/sub-field labels and category/value tokens that are all-caps and may
 * carry a multi-column shape but are NOT section headers — they are column
 * sub-headers (agenda/flight grids), pull-sheet equipment categories, boolean
 * data cells, or contact/transport sub-labels. Empirically derived from the 7
 * committed exporter fixtures (the class-B corpus regression pins zero false
 * positives). Matched as a whole-token PREFIX, like the registry.
 */
export const KNOWN_SUB_LABELS: ReadonlySet<string> = new Set([
  // Record/grid column labels (agenda, flights, crew, contacts sub-headers)
  "NAME",
  "ROLE",
  "PHONE",
  "EMAIL",
  "ARRIVAL",
  "DEPARTURE",
  "FLIGHT",
  "TIME",
  "TITLE",
  "ROOM",
  "START",
  "FINISH",
  "TRT",
  "AV",
  "DATE",
  "DAY",
  "CONFIRMED",
  "NOTES",
  "OK TO BOOK",
  "ADDRESS",
  "LOADING DOCK",
  "CAT",
  "TYPE",
  "ITEM",
  "QTY",
  "CONFIRMATION",
  // Agenda day-type cells
  "TRAVEL DAY",
  "SET DAY",
  "SHOW DAY",
  "TRAVEL",
  "SET",
  // Pull-sheet equipment categories / area buckets
  "AUDIO",
  "VIDEO",
  "CABLE",
  "CABLING",
  "LIGHTS",
  "LIGHTING",
  "SCENIC",
  "TRUSS",
  "RIGGING",
  "STAGING",
  "MISC",
  "LED",
  "BASES",
  "POWER",
  "INTERNAL",
  // Pull-sheet boolean data cells
  "TRUE",
  "FALSE",
  // Misc all-caps free-text contact label seen in the corpus
  "ME",
  "BACK TO INFO",
  "DETAIL CHECKLIST",
]);

function matchesAsTokenPrefix(normalized: string, registry: ReadonlySet<string>): boolean {
  if (registry.has(normalized)) return true;
  for (const entry of registry) {
    // Whole-token prefix: entry must be followed by a token boundary, so
    // "DATESOMETHING" does not match "DATES" but "DATES - X" / "DATES 2" does.
    if (
      normalized.startsWith(entry) &&
      (normalized.length === entry.length || /[^A-Z0-9]/.test(normalized[entry.length] ?? ""))
    ) {
      return true;
    }
  }
  return false;
}

/** True when `col0` is a recognized section header (registry membership, prefix-aware). */
export function isKnownSectionHeader(col0: string): boolean {
  return matchesAsTokenPrefix(normalizeHeader(col0), KNOWN_SECTION_HEADERS);
}

/** True when `col0` is a recognized sub-field/category label (not a section header). */
export function isKnownSubLabel(col0: string): boolean {
  return matchesAsTokenPrefix(normalizeHeader(col0), KNOWN_SUB_LABELS);
}

/**
 * Field-header words — the column labels that INTRODUCE a section's records
 * (a person/contact/vehicle table). A genuine unknown section header (the VB09
 * `CATERING | NAME | PHONE` shape) is followed by ≥2 of these; a pull-sheet
 * equipment row (`AUDIO | BASES | CABLE`) or a repeated-name GEAR row
 * (`DLP DATA PROJECTOR | DLP DATA PROJECTOR | ...`) is not. This is the
 * discriminator that keeps the corpus regression at zero false positives.
 */
export const SECTION_FIELD_HEADER_WORDS: ReadonlySet<string> = new Set([
  "NAME",
  "PHONE",
  "EMAIL",
  "ROLE",
  "ADDRESS",
  "CONTACT",
  "TITLE",
  "COMPANY",
  "CELL",
  "MOBILE",
  "POSITION",
]);

/** Count of DISTINCT field-header words among the given (already-trimmed) cells. */
export function countFieldHeaderWords(cells: readonly string[]): number {
  const seen = new Set<string>();
  for (const cell of cells) {
    const n = normalizeHeader(cell);
    if (SECTION_FIELD_HEADER_WORDS.has(n)) seen.add(n);
  }
  return seen.size;
}
