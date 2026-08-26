// tests/messages/warningCardCopyRegistry.ts - fixture data for _metaWarningCardCopy.test.ts.
// Nothing in lib/ or components/ imports this module (spec 2026-07-20-warning-card-copy-restore §3.5).
// Copy strings are the spec §4.2 table, byte-for-byte - the frozen enforcement arm of the canonical table.
export const WARNING_CARD_COPY_CODES: ReadonlySet<string> = new Set([
  "REF_ERROR_LITERAL",
  "ROW_CELLS_FUSED",
  "LEADING_COLUMN_AUTOCORRECTED",
  "AGENDA_BLOCK_UNRESOLVED",
  "AGENDA_DAY_AMBIGUOUS",
  "AGENDA_DAY_EMPTIED",
  "AGENDA_DAY_TRUNCATED",
  "AGENDA_FILE_INACCESSIBLE",
  "AGENDA_GRID_MALFORMED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "CREW_COLUMN_POSITIONAL_FALLBACK",
  "DATE_ORDER_SUGGESTS_DMY",
  "FIELD_LABEL_AUTOCORRECTED",
  "FIELD_UNREADABLE",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  "HOTEL_CARDINALITY_EXCEEDED",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
  "HOTEL_INLINE_GROUP_OWN_HOTEL",
  "PULL_SHEET_AMBIGUOUS_FORMAT",
  "PULL_SHEET_PARSE_PARTIAL",
  "PULL_SHEET_UNKNOWN_VARIANT",
  "ROLE_TOKEN_AUTOCORRECTED",
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
  "SCHEDULE_TIME_UNPARSED",
  "SECTION_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_NO_FIELDS",
  "STAGE_WORD_AUTOCORRECTED",
  "UNKNOWN_DAY_RESTRICTION",
  "UNKNOWN_FIELD",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_SECTION_HEADER",
  "UNKNOWN_STAGE_RESTRICTION",
  "AGENDA_LINK_NOT_CLICKABLE",
  "AGENDA_PDF_UNREADABLE",
  "AGENDA_SCHEDULE_LOW_CONFIDENCE",
  "AGENDA_SCHEDULE_TIME_ADJUSTED",
  "PULL_SHEET_ON_ARCHIVED_TAB",
  "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
  "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
  "TRAVEL_FLIGHT_NAME_UNMATCHED",
  "TRAVEL_FLIGHT_UNPARSEABLE",
  "TRAVEL_TRANSPORT_NAME_UNMATCHED",
  "VENUE_GEOCODE_UNRESOLVED",
  "VENUE_TIMEZONE_UNRESOLVED",
  "ORPHANED_CREW_ROWS",
]);

export const EXPECTED_TRIGGER_CONTEXT: Readonly<Record<string, string>> = {
  AGENDA_BLOCK_UNRESOLVED: "Appears when a day in the AGENDA tab has no readable date above it.",
  HOTEL_INLINE_GROUP_OWN_HOTEL: "Appears when one hotel line seems to book more than one hotel.",
  HOTEL_INLINE_GROUP_HOTEL_SUSPECTED:
    "Appears when a reservation on a shared hotel line may be under the wrong hotel.",
  AGENDA_DAY_AMBIGUOUS:
    "Appears when an AGENDA day banner gives only a weekday (like 'Wednesday') and the show has two of them.",
  AGENDA_DAY_EMPTIED:
    "Appears when a previously published AGENDA day has been cleared out of the sheet.",
  AGENDA_DAY_TRUNCATED:
    "Appears when one AGENDA day holds far more entries, or far longer text, than a day normally does.",
  AGENDA_GRID_MALFORMED:
    "Appears when the AGENDA tab is missing, renamed, or missing its header row.",
  COLUMN_HEADER_AUTOCORRECTED:
    "Appears when a crew-table column header is a letter or two off a standard header.",
  CREW_COLUMN_POSITIONAL_FALLBACK: "Appears when a crew table has no header row we recognize.",
  DATE_ORDER_SUGGESTS_DMY: "Appears when the sheet's dates are only in order if read day-first.",
  FIELD_LABEL_AUTOCORRECTED: "Appears when a row label is a letter or two off a standard label.",
  FIELD_UNREADABLE:
    "Appears when a crew phone or email cell can't work as a real phone number or email address.",
  LEADING_COLUMN_AUTOCORRECTED:
    "Appears when every row of a sheet section, including its header, starts with an empty column.",
  HOTEL_CARDINALITY_EXCEEDED: "Appears when the sheet has more than four hotel blocks.",
  HOTEL_ADDRESS_SPLIT_AMBIGUOUS:
    "Appears when a hotel line's name and street address may not have been separated correctly.",
  HOTEL_GUEST_SPLIT_AMBIGUOUS: "Appears when a hotel line could be read more than one way.",
  PULL_SHEET_AMBIGUOUS_FORMAT:
    "Appears when a PULL SHEET tab's columns don't match any layout we know.",
  PULL_SHEET_PARSE_PARTIAL: "Appears when a pull-sheet QTY cell isn't a plain number.",
  PULL_SHEET_UNKNOWN_VARIANT:
    "Appears when a pull-sheet's columns don't match any layout we know for certain.",
  ROLE_TOKEN_AUTOCORRECTED:
    "Appears when a role in a crew cell is a letter or two off a known role.",
  ROOM_HEADER_SPLIT_AMBIGUOUS:
    "Appears when a room line mixes its name and dimensions in an unusual order.",
  REF_ERROR_LITERAL:
    "Appears when any cell in the sheet contains the text '#REF!', including a cell that mixes it with other text.",
  ROW_CELLS_FUSED:
    "Appears when a row in a section is exactly one cell short of the width its neighboring rows share.",
  SCHEDULE_STRIKE_DATE_OFF_SCHEDULE:
    "Appears when a Strike Time's date isn't one of the show's days.",
  SCHEDULE_TIME_UNPARSED: "Appears when a TIME cell doesn't begin with a readable time.",
  SECTION_HEADER_AUTOCORRECTED:
    "Appears when a section header is a letter or two off a standard section name.",
  SECTION_HEADER_NO_FIELDS: "Appears when a section header has no usable rows beneath it.",
  STAGE_WORD_AUTOCORRECTED:
    "Appears when a work-phase word in a role cell is a letter or two off (Load In / Set / Show / Strike / Load Out).",
  UNKNOWN_DAY_RESTRICTION: "Appears when a name carries the '***' marker but no days are listed.",
  UNKNOWN_FIELD: "Appears when a row's label doesn't exactly match a row we know how to show.",
  UNKNOWN_ROLE_TOKEN: "Appears when a role label in a crew cell isn't on the known-roles list.",
  UNKNOWN_SECTION_HEADER: "Appears when a header row doesn't match any section we know.",
  UNKNOWN_STAGE_RESTRICTION:
    "Appears when a role cell's phase restriction contains a word outside the standard phases.",
  AGENDA_LINK_NOT_CLICKABLE: "Appears when the agenda cell has no clickable link in it.",
  AGENDA_FILE_INACCESSIBLE:
    "Appears when we can't open the linked agenda file: it's missing, not shared with us, not a PDF, or too large.",
  AGENDA_PDF_UNREADABLE:
    "Appears when the agenda PDF opens fine but we couldn't find a schedule in it.",
  AGENDA_SCHEDULE_LOW_CONFIDENCE:
    "Appears when the agenda PDF's times are laid out too unusually to trust.",
  AGENDA_SCHEDULE_TIME_ADJUSTED:
    "Appears when an agenda time only makes sense with its AM/PM flipped.",
  PULL_SHEET_ON_ARCHIVED_TAB:
    "Appears when a PULL SHEET is found on a tab that looks like an older copy of the sheet, not its main tab.",
  PULL_SHEET_OVERRIDE_CONTENT_CHANGED:
    "Appears when the contents of an included archived-tab pull sheet change.",
  TRAVEL_FLIGHT_AMBIGUOUS_TABLE: "Appears when the sheet holds two or more FLIGHT DETAILS tables.",
  TRAVEL_FLIGHT_NAME_UNMATCHED:
    "Appears when a FLIGHT DETAILS name matches zero or several crew names.",
  TRAVEL_FLIGHT_UNPARSEABLE: "Appears when a FLIGHT DETAILS cell has no date we can read.",
  TRAVEL_TRANSPORT_NAME_UNMATCHED:
    "Appears when a transport name matches zero or several crew names.",
  VENUE_GEOCODE_UNRESOLVED: "Appears when the venue address doesn't resolve to a city.",
  VENUE_TIMEZONE_UNRESOLVED: "Appears when the venue's location doesn't resolve to a time zone.",
  ORPHANED_CREW_ROWS:
    "Appears when rows carrying crew role text (like 'Load In / Set / Strike / Load Out') sit in a block with no section header above them.",
};

export const EXPECTED_TITLE_CHANGES: Readonly<Record<string, string>> = {
  FIELD_UNREADABLE: "Phone or email we couldn't use",
  SECTION_HEADER_NO_FIELDS: "Section with nothing under it",
  UNKNOWN_SECTION_HEADER: "Section we didn't recognize",
  TRAVEL_FLIGHT_UNPARSEABLE: "Flight we couldn't read",
  AGENDA_FILE_INACCESSIBLE: "Can't open the agenda file",
  AGENDA_PDF_UNREADABLE: "No agenda schedule found",
  // 2026-08-15 field-near-miss detector §5 (plan-r1 finding 6). UNKNOWN_FIELD's
  // title was governed by NO live check before this row: the cap/banned-word
  // sweeps accept any non-empty string, and only codes listed HERE are
  // byte-compared. Retitled from "Unrecognized row in sheet", which the
  // content-keyed detector made false - the row DOES nearly match a field.
  // Retitled again at close-out (impeccable gate F3 + F8): "Row label that looks
  // misnamed" put no agent in the subject position and handed down a verdict on a
  // sheet Doug authored, unlike its siblings ("Section we didn't recognize"). The
  // shipped form is also SHORTER than both it and the original, which settles F8's
  // group-eyebrow wrap concern - the gate's own suggested wording was longer than
  // what it replaced and would have made that worse.
  UNKNOWN_FIELD: "Row we couldn't match",
};

/**
 * Frozen `longExplanation` - the `/help/errors` body rendered at
 * `app/help/errors/page.tsx:94`. PARTIAL by design, like EXPECTED_TITLE_CHANGES:
 * the x1 parity gate pins only dougFacing/crewFacing/followUp/helpfulContext
 * against §12.4, and the §4.2 table carries no longExplanation column, so a
 * code absent from this map has its help-page body governed by nothing.
 * UNKNOWN_FIELD is enrolled here with its near-miss rewrite (2026-08-15
 * field-near-miss detector §5, plan-r1 finding 6) so the help body cannot drift
 * back to the retired "doesn't match any section we read" framing unnoticed.
 */
export const EXPECTED_LONG_EXPLANATION: Readonly<Record<string, string>> = {
  UNKNOWN_FIELD:
    "A row in your sheet is labeled something we don't read as one of the rows we show, so it isn't showing on the crew page. When we can tell which row you meant, the notice names it. Rename it in the sheet and it will show the next time this show checks its sheet. We don't rename it for you, because the row you meant would be a guess.",
};

/**
 * Frozen `helpfulContext` for EVERY registry code: the spec-§4.2 row and the
 * catalog entry are held in lockstep for the whole table (spec
 * 2026-08-01-card-copy-parity-sync-job-name §2). A typo in either the
 * canonical row or the catalog entry fails the gate, and the key-set
 * assertion in _metaWarningCardCopy keeps this map total over
 * WARNING_CARD_COPY_CODES.
 */
export const EXPECTED_HELPFUL_CONTEXT: Readonly<Record<string, string>> = {
  AGENDA_BLOCK_UNRESOLVED:
    "One run-of-show day couldn't be matched to a calendar date, so that day shows the standard schedule. Check that day's date banner in the AGENDA tab; it's usually missing or showing an error like #REF!.",
  AGENDA_DAY_AMBIGUOUS:
    "This run-of-show day names only a weekday that matches two show dates, so we didn't guess and it shows the standard schedule. Add the actual date to the AGENDA banner.",
  AGENDA_DAY_EMPTIED:
    "A run-of-show day you'd published before is now blank in the sheet, so it went back to the standard schedule. Put the rows back if that wasn't on purpose.",
  AGENDA_DAY_TRUNCATED:
    "This run-of-show day was too large, so crew see a trimmed list. It's almost always a stray cell; let us know if a real day genuinely needs more.",
  AGENDA_FILE_INACCESSIBLE:
    "We couldn't open the linked agenda file, so there's no schedule and crew may not be able to see the agenda. It may be private and not shared with us, deleted, a non-PDF link, or too large to open. Confirm it's a shared, reasonably sized PDF, or replace the link.",
  AGENDA_GRID_MALFORMED:
    "We couldn't find the run-of-show grid in the AGENDA tab, so every day shows the standard schedule. Check the tab still has its header row and its usual name.",
  AGENDA_LINK_NOT_CLICKABLE:
    "The agenda cell holds text with nothing to open: a file name or a note instead of a working link. Replace it with a real web link or Drive file.",
  AGENDA_PDF_UNREADABLE:
    "We opened the agenda PDF but couldn't find a day-by-day schedule in it, so crew see the agenda document only. Nothing is broken; no action is needed unless it should include a readable schedule.",
  AGENDA_SCHEDULE_LOW_CONFIDENCE:
    "We read the agenda PDF but weren't sure enough about the session times to publish them, so crew see the document only. Nothing is broken; no action needed unless the agenda layout recently changed.",
  AGENDA_SCHEDULE_TIME_ADJUSTED:
    "We corrected at least one agenda session time that looked like a typo, like a morning session marked PM. Open the agenda to confirm; if our correction is wrong, update the agenda document.",
  COLUMN_HEADER_AUTOCORRECTED:
    "A crew-table column header looked misspelled, so we used the closest real one (like 'E-MAIL' as 'EMAIL'). Fix the header in the sheet if that guess is wrong.",
  CREW_COLUMN_POSITIONAL_FALLBACK:
    "We didn't recognize this crew table's headers, so we read columns by position; some names or roles may be misplaced. Add a header row (Name / Role / Phone / Email) and recheck the crew.",
  DATE_ORDER_SUGGESTS_DMY:
    "The show dates only make sense read day-first (10/3 as 3 October), but we read them month-first, so every date may be wrong. Rewrite the dates unambiguously, like 'June 24'.",
  FIELD_LABEL_AUTOCORRECTED:
    "A row label looked misspelled, so we used the closest real one (like 'Venue Adress' as 'Venue Address'). Fix the label in the sheet if that guess is wrong.",
  FIELD_UNREADABLE:
    "A crew phone or email in your sheet couldn't work as one (a phone with no digits, or an email without an @), so that link is left off the crew page. Fix the cell in the sheet.",
  HOTEL_ADDRESS_SPLIT_AMBIGUOUS:
    "A hotel line's name and street address may not have been separated correctly. Check the hotel name and address in case part of one landed in the other.",
  HOTEL_CARDINALITY_EXCEEDED:
    "Your sheet lists more than four hotels; we kept the first four and dropped the rest. Remove old or duplicate hotel blocks so the four we keep are the right ones.",
  HOTEL_GUEST_SPLIT_AMBIGUOUS:
    "A hotel line could be read more than one way, so we made a judgment call. Check who is on the reservation in case two people were merged, one was split, part of the hotel name was read as a person, or someone was left out.",
  HOTEL_INLINE_GROUP_HOTEL_SUSPECTED:
    "A reservation on a shared hotel line may be under the wrong hotel. Check it against your sheet. This cannot be fixed in the app: move the bookings into the sheet's HOTEL table, one booking per RESERVATION column, and the next sync will pick it up.",
  HOTEL_INLINE_GROUP_OWN_HOTEL:
    "One hotel line seems to book more than one hotel, so this reservation was given its own hotel instead of the line's first one. Check its hotel name, address, guests, and dates against your sheet. To avoid this, move the bookings into the sheet's HOTEL table, one booking per RESERVATION column.",
  LEADING_COLUMN_AUTOCORRECTED:
    "Every row in a section started with an empty column, so we read it one column to the left instead. Update the sheet if the empty column was intentional.",
  ORPHANED_CREW_ROWS:
    "Rows that look like crew assignments are not attached to a crew section header, so they were not read as crew. A blank row may have been added in the middle of the crew section. Check the crew section in the sheet and remove the stray blank row.",
  PULL_SHEET_AMBIGUOUS_FORMAT:
    "This looks like a PULL SHEET, but its columns aren't laid out the way we expect, so crew see the original text instead of a clean packing list. Let us know if you'd like this layout supported.",
  PULL_SHEET_ON_ARCHIVED_TAB:
    "We found a PULL SHEET on a tab that looks like an older copy, so we left it out to avoid mixing old gear in. If it really is this show's gear, the Gear section on this page offers to include it.",
  PULL_SHEET_OVERRIDE_CONTENT_CHANGED:
    "A pull sheet you'd included changed since you last saw it, so we left it out rather than publish gear you haven't seen. Recheck the tab, then re-include it from the Gear section.",
  PULL_SHEET_PARSE_PARTIAL:
    "Some pull-sheet rows have a QTY we couldn't read (a word, or a range like '1-2'), so those rows show their original text. The Report button on this card sends it to us if you'd like the format supported.",
  PULL_SHEET_UNKNOWN_VARIANT:
    "We could read this pull sheet's rows but not which column is which, so we used the standard column order. Check that quantities, item names, and categories landed right.",
  ROLE_TOKEN_AUTOCORRECTED:
    "A role looked misspelled, so we used the closest real one (like 'Content Cretion' as 'Content Creation'). Update the sheet if the spelling was intentional.",
  ROOM_HEADER_SPLIT_AMBIGUOUS:
    "A room line could split into name and dimensions more than one way, so we picked the most likely reading. Check the rooms section; the name or dimensions might be slightly off.",
  SCHEDULE_STRIKE_DATE_OFF_SCHEDULE:
    "A room's Strike Time is dated on a day outside the show's schedule, so it won't appear on crew schedules. Fix that cell's date to a show day.",
  REF_ERROR_LITERAL:
    "A cell here reads '#REF!' instead of a real value. That is what Sheets leaves behind when the cell a formula pointed at was deleted.",
  ROW_CELLS_FUSED:
    "A row here has one fewer column than the rows around it. That is what a merged cell looks like once the sheet is exported, and it can push values under the wrong headings.",
  SCHEDULE_TIME_UNPARSED:
    "One show day's TIME cell wasn't readable as a start time, so that day shows the standard schedule. Give it a clear start like '7:15am - Registration'.",
  SECTION_HEADER_AUTOCORRECTED:
    "A section header looked misspelled, so we read it as the closest real one (like 'Transportaton' as 'Transportation'). Update the sheet if it was intentional.",
  SECTION_HEADER_NO_FIELDS:
    "A section header in your sheet has no readable rows under it, so that section is missing from the crew page. Add the rows back, or delete the leftover header.",
  STAGE_WORD_AUTOCORRECTED:
    "A stage word in this crew member's role looked misspelled, so we used the closest real one (like 'Strke' as 'Strike'). Update the sheet if the spelling was intentional.",
  TRAVEL_FLIGHT_AMBIGUOUS_TABLE:
    "The sheet has more than one TRAVEL flight table, so no flights were attached, since they could belong to different shows. Remove or rename the old table so only one remains.",
  TRAVEL_FLIGHT_NAME_UNMATCHED:
    "A flight's crew name didn't match exactly one roster name, so the flight was skipped rather than mis-assigned. Fix the spelling so it matches the roster.",
  TRAVEL_FLIGHT_UNPARSEABLE:
    "A flight row had no readable date, so it was skipped. Start each leg with an M/D date, like '3/22 AA123 JFK - LAX'.",
  TRAVEL_TRANSPORT_NAME_UNMATCHED:
    "A transport assignee's name didn't clearly match one crew member, so that ride can't show on anyone's page. Fix the spelling, split merged names, or add the missing crew member.",
  UNKNOWN_DAY_RESTRICTION:
    "This crew member is marked day-restricted ('***' in the sheet) but the sheet doesn't say which days, so their schedule shows 'days unconfirmed'. Add the days to the name cell, like '(6/24 and 6/26 ONLY)'.",
  UNKNOWN_FIELD:
    "Rename this row in your sheet so it matches the row we show. It isn't showing on the crew page because the label doesn't match one we read. Report flags it to us; Ignore hides this notice.",
  UNKNOWN_ROLE_TOKEN:
    "One of this crew member's role labels isn't one we recognize, so we left it off their page instead of guessing. If the label is correct, this card's controls let you add it as a real role.",
  UNKNOWN_SECTION_HEADER:
    "A header in your sheet isn't a section we know, so the rows under it aren't shown on the crew page. Rename it to a standard section, or use the Report button on this card if it should be supported.",
  UNKNOWN_STAGE_RESTRICTION:
    "This role cell mixes a known work-phase with something we couldn't read, so we show this crew member the full schedule rather than hide any of it. Use the standard phases: Load In / Set / Show / Strike / Load Out.",
  VENUE_GEOCODE_UNRESOLVED:
    "We couldn't look up the venue's city from its address, so the page shows the raw address instead. Often temporary; if it keeps happening, check the address for typos.",
  VENUE_TIMEZONE_UNRESOLVED:
    "We couldn't work out the venue's time zone, so times show in Eastern Time for now. It usually clears on the next sync; if not, check the venue address.",
};

export const EXPECTED_CORPUS_WARN_CODES: ReadonlySet<string> = new Set([
  "REF_ERROR_LITERAL",
  "AGENDA_BLOCK_UNRESOLVED",
  // 2026-07-25 hotel-ambiguity-coverage: the inline hotel path now reports the
  // hotel/first-guest boundary it has always judged silently. 9 cards across the
  // corpus, pinned per fixture in tests/parser/hotelAmbiguityCorpusGolden.test.ts.
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "SECTION_HEADER_NO_FIELDS",
  "STAGE_WORD_AUTOCORRECTED",
  "UNKNOWN_FIELD",
  "UNKNOWN_SECTION_HEADER",
]); // measured 2026-07-20 (Task 1 Step 3); extended 2026-07-25
export const EXPECTED_CORPUS_FIXTURES: ReadonlySet<string> = new Set([
  "2024-05-east-coast-family-office.md",
  "2025-03-dci-rpas-central.md",
  "2025-04-asset-mgmt-cfo-coo.md",
  "2025-05-redefining-fixed-income-private-credit.md",
  "2025-06-ria-investment-forum.md",
  "2025-10-consultants-roundtable.md",
  "2025-10-fixed-income-trading-summit.md",
  "2026-03-rpas-central-four-seasons.md",
  "2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "2026-05-fintech-forum-cto-summit.md",
]); // measured 2026-07-20 (Task 1 Step 3)
