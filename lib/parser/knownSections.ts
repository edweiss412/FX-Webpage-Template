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
 * TWO guards protect this registry, in this order:
 *
 * PRIMARY — `tests/parser/_metaKnownSectionsWalker.test.ts` (shipped 2026-07-06). A real source
 * walker: it reads `lib/parser/blocks/` from the filesystem, so a NEW block parser fails by
 * default unless it exports `SECTION_HEADER_TOKENS` or is explicitly allowlisted, and every
 * exported token must be an EXACT member of this set. Header detection is no longer heterogeneous
 * — the parsers build their matchers from the shared factory `lib/parser/blocks/_sectionHeaderMatch.ts`
 * and export their tokens for introspection. A registry-keyed source-text backstop also flags a
 * hand-rolled matcher for a registered opener a file neither owns nor allowlists, and a no-orphan
 * check fails for any registry entry no parser opens.
 *
 * SECONDARY — `tests/parser/_metaKnownSectionsRegistry.test.ts` pins a hand-maintained
 * `REQUIRED_HEADERS` ⊆ this registry. Not redundant with the walker: the walker's subset check
 * catches a registry deletion only while some parser still exports that token, so a single edit
 * removing a header from BOTH this set AND the owning parser's `SECTION_HEADER_TOKENS` leaves the
 * walker green — `REQUIRED_HEADERS` is what fails then.
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
  "DRIVER",
  "GENERAL SESSION",
  "GS DETAILS",
  "GS DETAILS (FOR BOTH)",
  "BREAKOUT",
  "BREAKOUTS",
  "ADDITIONAL ROOM",
  "LUNCH ROOM",
  "LUNCH SESSION",
  "EVENT DETAILS",
  "DETAILS",
  "DETAILS/ROOM DIAGRAM",
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
 * Section-header families that legitimately carry a room-name / ordinal SUFFIX on
 * real sheets (rooms.ts splits these): "GENERAL SESSION - GRAND BALLROOM A/B",
 * "BREAKOUT 2 - SALON C", "ADDITIONAL ROOM 2", "LUNCH ROOM - SALON A". ONLY these
 * may match as a whole-token PREFIX; every other KNOWN_SECTION_HEADERS entry is a
 * complete header matched EXACTLY. Whole-diff review R1 [medium]: generic single
 * labels (CLIENT, HOTEL, DETAILS, DATES) were prefix-matched, so a genuinely-dropped
 * "CLIENT SERVICES | NAME | PHONE" / "HOTEL STAFF | NAME | PHONE" was inferred "known"
 * and the unknown-section detector stayed silent — the exact silent-drop it exists to
 * catch. (These families are also in KNOWN_SECTION_HEADERS, so the bare form matches
 * exactly too.)
 */
export const PREFIX_SECTION_FAMILIES: ReadonlySet<string> = new Set([
  "GENERAL SESSION",
  "BREAKOUT",
  "BREAKOUTS",
  "ADDITIONAL ROOM",
  "LUNCH ROOM",
  "LUNCH SESSION",
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

/** Whole-token prefix: `entry` must be followed by a token boundary, so
 *  "DATESOMETHING" does not match "DATES" but "DATES - X" / "DATES 2" does. */
function matchesTokenPrefix(normalized: string, entry: string): boolean {
  return (
    normalized.startsWith(entry) &&
    (normalized.length === entry.length || /[^A-Z0-9]/.test(normalized[entry.length] ?? ""))
  );
}

function matchesAsTokenPrefix(normalized: string, registry: ReadonlySet<string>): boolean {
  if (registry.has(normalized)) return true;
  for (const entry of registry) {
    if (matchesTokenPrefix(normalized, entry)) return true;
  }
  return false;
}

/**
 * True when `col0` is a recognized section header: EXACT membership in the registry,
 * OR a room-family PREFIX (PREFIX_SECTION_FAMILIES) for the headers that carry a real
 * name/ordinal suffix. Generic labels match exact-only, so a dropped section sharing a
 * known label's prefix ("CLIENT SERVICES", "HOTEL STAFF") is NOT masked. (R1 [medium].)
 */
export function isKnownSectionHeader(col0: string): boolean {
  const normalized = normalizeHeader(col0);
  if (KNOWN_SECTION_HEADERS.has(normalized)) return true;
  for (const entry of PREFIX_SECTION_FAMILIES) {
    if (matchesTokenPrefix(normalized, entry)) return true;
  }
  return false;
}

/**
 * True when `col0` is a recognized sub-field/category label (not a section header).
 * Sub-labels stay PREFIX-matched: this is the conservative "don't-flag" set (column
 * headers / equipment categories / value cells), empirically tuned to keep the corpus
 * regression at zero false positives. It is the OPPOSITE-direction bias from the section
 * registry — over-suppressing a column row is safe, and the ≥2-header-word gate in
 * index.ts is the primary discriminator — so the R1 [medium] exact-match tightening
 * applies to the section registry, not here.
 */
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

/** Tokenize a normalized cell on non-alphanumeric boundaries: "PHONE #" → ["PHONE"],
 *  "Contact Name" → ["CONTACT","NAME"], "Email Address" → ["EMAIL","ADDRESS"]. */
function headerTokens(cell: string): string[] {
  return normalizeHeader(cell)
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/**
 * Count of field-header COLUMNS — cells that contain at least one field-header word as
 * a token — among the given cells. Whole-diff review R2 [medium]: matching the ENTIRE
 * cell against the whitelist missed common multi-word / punctuated labels, so a dropped
 * "CATERING | Contact Name | Phone # | Email Address" scored 0 and was silently dropped.
 * Tokenizing each cell counts it ("CONTACT NAME"→NAME, "PHONE #"→PHONE, "EMAIL ADDRESS"
 * →EMAIL), so the ≥2-labelled-column header band is detected. Counts COLUMNS (not words)
 * so a single multi-word cell is not a band on its own, and a repeated-equipment-name
 * GEAR row ("DLP DATA PROJECTOR | DLP DATA PROJECTOR | …", no header-word tokens) still
 * scores 0 — the corpus regression pins zero false positives.
 */
export function countFieldHeaderWords(cells: readonly string[]): number {
  let columns = 0;
  for (const cell of cells) {
    if (headerTokens(cell).some((t) => SECTION_FIELD_HEADER_WORDS.has(t))) columns += 1;
  }
  return columns;
}

/** Section labels that live mid-block in real sheets (corpus-verified) and must NOT
 *  start a new block when seen mid-block. CLIENT: east-coast INFO (a CLIENT label row
 *  directly under a #NUM! row) + fintech INFO; probe 2026-07-27
 *  (spec 2026-07-27-export-blank-row-segmentation §2.1). */
export const MID_BLOCK_SPLIT_EXCLUDED: ReadonlySet<string> = new Set(["CLIENT"]);

/**
 * True when a grid row's first non-blank cell BEGINS a new section mid-block
 * (exporter `splitBlocks` header-aware segmentation, spec
 * 2026-07-27-export-blank-row-segmentation §2.1-2.2). Case-SENSITIVE by design:
 * only the first LINE of the cell is considered (fused multi-line room headers keep
 * their header on line 1), and ANY lowercase letter disqualifies — real section
 * headers on the live sheets are uppercase, while mixed-case shapes ("General
 * Session Room Name" FORM labels, "In House AV", "Driver") legitimately sit
 * mid-block (probe 2026-07-27: a case-insensitive rule hits 85 corpus rows; the
 * uppercase rule minus CLIENT hits 0).
 */
export function isMidBlockSectionStart(rawCell: string): boolean {
  const line1 = (rawCell.split(/\r\n?|\n/)[0] ?? "").trim();
  if (line1.length === 0) return false;
  if (/[a-z]/.test(line1)) return false;
  if (MID_BLOCK_SPLIT_EXCLUDED.has(normalizeHeader(line1))) return false;
  return isKnownSectionHeader(line1);
}

/**
 * Crew-role token set for orphaned-crew-row detection (spec
 * 2026-07-27-export-blank-row-segmentation §3.1 arm 3). A cell is a crew ROLE cell
 * only when ≥2 DISTINCT tokens co-occur on ONE line — every corpus crew roster row
 * carries a single-line role cell with ≥2 of these ("- Load In / Set / Strike /
 * Load Out - LEAD", "- Load In / Set ONLY"), while the single-token shapes that
 * would false-positive ("GS Strike Time", "Setup / Load In Date / Time", agenda
 * "9:00PM - LOAD IN" lines) never do. "SETUP" does not match SET (word boundary).
 */
export const CREW_ROLE_CELL_TOKENS: ReadonlyArray<readonly [string, RegExp]> = [
  ["LOAD_IN", /\bLOAD\s*[- /]*\s*IN\b/i],
  ["LOAD_OUT", /\bLOAD\s*[- /]*\s*OUT\b/i],
  ["STRIKE", /\bSTRIKE\b/i],
  ["SET", /\bSET\b/i],
];

/** Split a raw cell into display lines: `&#10;` entities (exporter-encoded newlines)
 *  and raw newlines both break lines. Bare CR (legacy Mac line ends surviving a
 *  paste) breaks a line too — otherwise two single-token lines read as one line
 *  and defeat the per-line ≥2-token gate (whole-diff r1 F3). */
export function cellLines(rawCell: string): string[] {
  return rawCell.split(/&#10;|\r\n?|\n/);
}

export function isCrewRoleCell(rawCell: string): boolean {
  for (const line of cellLines(rawCell)) {
    let distinct = 0;
    for (const [, re] of CREW_ROLE_CELL_TOKENS) {
      if (re.test(line)) distinct += 1;
    }
    if (distinct >= 2) return true;
  }
  return false;
}
