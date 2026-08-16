/**
 * Barrel of every block parser's `SECTION_HEADER_TOKENS`, in the ORDER the near-miss
 * calibration derived its vocabulary (`docs/superpowers/specs/parser/probes/2026-08-15-near-miss-followup-probe.ts`,
 * `BLOCK_SECTION_HEADER_TOKENS`): client, dates, dress, crew, event, venue, transport,
 * rooms, hotels.
 *
 * The order is NORMATIVE, not cosmetic. Spec §3.1's tie-break makes vocabulary
 * insertion order the rule that decides which raw spelling a near-miss reports, so
 * reordering this array silently rewrites emitted `candidate` values.
 *
 * Membership is derived from the actual `export const SECTION_HEADER_TOKENS`, never
 * from a filename grep: `rg -l SECTION_HEADER_TOKENS lib/parser/blocks/` returns TEN
 * files, and the tenth (`ops.ts`) matches only its own comment saying it exports none.
 * `tests/parser/fieldNearMiss.test.ts` walks the directory and fails if a block gains
 * tokens this barrel does not carry.
 */
import { SECTION_HEADER_TOKENS as CLIENT_SECTION_HEADER_TOKENS } from "./blocks/client";
import { SECTION_HEADER_TOKENS as DATES_SECTION_HEADER_TOKENS } from "./blocks/dates";
import { SECTION_HEADER_TOKENS as DRESS_SECTION_HEADER_TOKENS } from "./blocks/dress";
import { SECTION_HEADER_TOKENS as CREW_SECTION_HEADER_TOKENS } from "./blocks/crew";
import { SECTION_HEADER_TOKENS as EVENT_SECTION_HEADER_TOKENS } from "./blocks/event";
import { SECTION_HEADER_TOKENS as VENUE_SECTION_HEADER_TOKENS } from "./blocks/venue";
import { SECTION_HEADER_TOKENS as TRANSPORT_SECTION_HEADER_TOKENS } from "./blocks/transport";
import { SECTION_HEADER_TOKENS as ROOMS_SECTION_HEADER_TOKENS } from "./blocks/rooms";
import { SECTION_HEADER_TOKENS as HOTELS_SECTION_HEADER_TOKENS } from "./blocks/hotels";

export {
  CLIENT_SECTION_HEADER_TOKENS,
  DATES_SECTION_HEADER_TOKENS,
  DRESS_SECTION_HEADER_TOKENS,
  CREW_SECTION_HEADER_TOKENS,
  EVENT_SECTION_HEADER_TOKENS,
  VENUE_SECTION_HEADER_TOKENS,
  TRANSPORT_SECTION_HEADER_TOKENS,
  ROOMS_SECTION_HEADER_TOKENS,
  HOTELS_SECTION_HEADER_TOKENS,
};

/** Derivation order is normative (spec §3.1) — see the file header. */
export const SECTION_HEADER_TOKEN_SETS: readonly (readonly string[])[] = [
  CLIENT_SECTION_HEADER_TOKENS,
  DATES_SECTION_HEADER_TOKENS,
  DRESS_SECTION_HEADER_TOKENS,
  CREW_SECTION_HEADER_TOKENS,
  EVENT_SECTION_HEADER_TOKENS,
  VENUE_SECTION_HEADER_TOKENS,
  TRANSPORT_SECTION_HEADER_TOKENS,
  ROOMS_SECTION_HEADER_TOKENS,
  HOTELS_SECTION_HEADER_TOKENS,
];
