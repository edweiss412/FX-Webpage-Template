// BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR — the committed anchor for the parse-warning
// code universe.
//
// `scanParseWarningSites` is fail-closed for the sites it VISITS: a construction
// whose code it cannot resolve is signalled, never dropped. The SCOPE it visits
// is a different question, and it had no anchor at all. `inWarningScanRoots`
// (`scripts/extract-internal-code-enums.ts`) is a hand-written predicate —
// `^(lib|app)/` minus a few carve-outs — and a file the predicate never admits
// produces no site, so there is nothing to signal. Narrow the predicate, or land
// an emitter outside `lib/`|`app/`, and the universe shrinks in SILENCE while
// every existing assertion stays green.
//
// Probed on the originating branch: excluding one contributing file dropped the
// set 57 → 51 with `unresolved` still empty, and tightening a pre-filter WITHIN
// files dropped 22 of 57 with the contributing-FILE set unchanged — which is why
// a file-list anchor does not close it and this anchors the CODES instead.
//
// The trade is deliberate and stated: this is a hand-maintained list. It is
// justified not by being small but by its failure mode — it cannot rot silently.
// Equality in BOTH directions means a narrowed scan fails loud, and a genuinely
// new warning code fails loud too, with the diff as the review artifact.
//
// This anchor is INTERIM. `BL-CATALOG-PARTITION-WARNING-CLASS` closes the same
// gap properly by making the catalog enumerate its warnings instead of having a
// scanner infer them; when that lands, the scan stops being the source of truth
// and this file should be deleted with it. It is not filed as a duplicate today
// because that fix has not shipped, and closing this as one would leave the
// silent-narrowing failure mode guarded by nothing in the meantime.

/** Every code the production scan resolves as a ParseWarning (census 2026-08-04). */
export const WARNING_CODE_ANCHOR: readonly string[] = [
  "AGENDA_BLOCK_UNRESOLVED",
  "AGENDA_DAY_AMBIGUOUS",
  "AGENDA_DAY_EMPTIED",
  "AGENDA_DAY_TRUNCATED",
  "AGENDA_FILE_INACCESSIBLE",
  "AGENDA_GRID_MALFORMED",
  "AGENDA_LINK_NOT_CLICKABLE",
  "AGENDA_PDF_UNREADABLE",
  "AGENDA_SCHEDULE_LOW_CONFIDENCE",
  "AGENDA_SCHEDULE_TIME_ADJUSTED",
  "BLOCK_DISAPPEARED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "CREW_COLUMN_POSITIONAL_FALLBACK",
  "DATE_ORDER_SUGGESTS_DMY",
  "DAY_RESTRICTION_DOUBLE_LOCATION",
  "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_TAB_MISSING",
  "EMBEDDED_ASSET_DRIFTED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "FIELD_LABEL_AUTOCORRECTED",
  "FIELD_UNREADABLE",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  "HOTEL_CARDINALITY_EXCEEDED",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
  "HOTEL_INLINE_GROUP_OWN_HOTEL",
  "LEADING_COLUMN_AUTOCORRECTED",
  "LINKED_FOLDER_OVERFLOW_TRUNCATED",
  "OPENING_REEL_NOT_VIDEO",
  "OPENING_REEL_PERMISSION_DENIED",
  "ORPHANED_CREW_ROWS",
  "PULL_SHEET_AMBIGUOUS_FORMAT",
  "PULL_SHEET_ON_ARCHIVED_TAB",
  "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
  "PULL_SHEET_PARSE_PARTIAL",
  "PULL_SHEET_UNKNOWN_VARIANT",
  "REEL_DRIFTED",
  "REF_ERROR_LITERAL",
  "ROLE_TOKEN_AUTOCORRECTED",
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "ROW_CELLS_FUSED",
  "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
  "SCHEDULE_TIME_UNPARSED",
  "SECTION_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_NO_FIELDS",
  "STAGE_WORD_AUTOCORRECTED",
  "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
  "TRAVEL_FLIGHT_NAME_UNMATCHED",
  "TRAVEL_FLIGHT_UNPARSEABLE",
  "TRAVEL_TRANSPORT_NAME_UNMATCHED",
  "TYPO_NORMALIZED",
  "UNKNOWN_DAY_RESTRICTION",
  "UNKNOWN_FIELD",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_SECTION_HEADER",
  "UNKNOWN_STAGE_RESTRICTION",
  "VENUE_GEOCODE_UNRESOLVED",
  "VENUE_TIMEZONE_UNRESOLVED",
];
