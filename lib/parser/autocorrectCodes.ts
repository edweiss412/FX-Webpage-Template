// lib/parser/autocorrectCodes.ts
//
// The two autocorrect codes whose under-row placement keys off `autocorrect.subject`
// (spec 2026-07-21-warning-card-identity-placement §5.1; narrowed by spec
// 2026-07-23-crew-warning-attachment §2A — OTHER codes with a crew blockRef now also
// place under rows, keyed via lib/admin/crewRowKey.ts, so membership here means
// "subject-keyed", not "the only under-row codes"). The other three *_AUTOCORRECTED
// codes (SECTION_HEADER / COLUMN_HEADER / FIELD_LABEL) are document/column/field
// scoped and keep their section-group placement.
//
// Declared parser-layer so both the section model (lib/admin/**) and the tests read one
// list. Pinned equal to exactly these two by tests/parser/_metaAutocorrectProducers.test.ts.
export const CREW_SCOPED_WARNING_CODES: ReadonlySet<string> = new Set([
  "STAGE_WORD_AUTOCORRECTED",
  "ROLE_TOKEN_AUTOCORRECTED",
]);

/** All five *_AUTOCORRECTED codes, the closed set the card copy layer composes for. */
export const AUTOCORRECT_CODES: readonly string[] = [
  "STAGE_WORD_AUTOCORRECTED",
  "ROLE_TOKEN_AUTOCORRECTED",
  "SECTION_HEADER_AUTOCORRECTED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "FIELD_LABEL_AUTOCORRECTED",
];
