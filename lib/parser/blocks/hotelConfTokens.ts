/**
 * lib/parser/blocks/hotelConfTokens.ts
 *
 * The SINGLE source of the hotel confirmation-number strip policy. `hotel_reservations.names`
 * is crew-readable (`can_read_show`, SELECT granted to `authenticated`), so a confirmation
 * number must NEVER survive in a persisted guest name — on the normal parse path (blocks/
 * hotels.ts) OR the "use the sheet's raw value" path (warnings.ts). Both share `stripConfTokens`
 * here so the two paths can never diverge (Codex whole-diff R10/R11 — a reimplemented, weaker
 * strip on the use-raw path leaked shapes the parser stripped). Self-contained leaf module (no
 * parser/warnings imports) so both callers can depend on it without an import cycle.
 */
import { clean, decodeEntities } from "./_helpers";

const STREET_ADDRESS_RE =
  /\s(\d{1,5})\s+(?:(?:[NSEW]{1,2}|North|South|East|West)\.?\s+)?(?:(?:\d{1,3}(?:st|nd|rd|th)|\p{L}[\p{L}.'-]*)\s+){0,4}(?:St|Street|Ave|Avenue|Av|Blvd|Boulevard|Dr|Drive|Rd|Road|Pl|Place|Ln|Lane|Way|Ct|Court|Pkwy|Parkway|Sq|Square|Ter|Terrace|Cir|Circle|Hwy|Highway|Pike|Row|Walk|Trl|Trail|Loop|Path|Plaza|Crescent|Cres|Commons|Close|Mews|Quay|Wharf|Gardens|Gdns|Esplanade|Promenade|Concourse)\b/iu;

// Suffixless street: "<1–5 digit number> <words…>, <2-letter state> <5-digit ZIP>".
// The interior (street name + city) is digit-free so it can't run past a conf# or a
// second number; the comma+state+ZIP tail is what marks it as an address.
const STREET_ADDRESS_ZIP_RE =
  /\s(\d{1,5})\s+\p{L}[\p{L}\p{M}\s.'#/-]*?,\s*[A-Z]{2}\s+(?:\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/u;

/** True iff `" " + s.slice(i)` begins a street phrase by SUFFIX or by US ZIP tail.
 * Used ONLY by the Hotel-Stays discriminator to tell a dash-STREET-number from a
 * dash-CONF#. NOT used to SPLIT (splitHotelNameAddress stays strictly suffix-only,
 * so a numeric hotel brand like "Hotel 71 Chicago, IL 60601" is never corrupted —
 * the ZIP tail would otherwise treat "71 Chicago, IL …" as an address, Codex R5). */
export function looksLikeStreetStart(s: string): boolean {
  const a = STREET_ADDRESS_RE.exec(s);
  if (a && a.index === 0) return true;
  const b = STREET_ADDRESS_ZIP_RE.exec(s);
  return b !== null && b.index === 0;
}

export { STREET_ADDRESS_RE };

/**
 * Remove any confirmation number from a string, alphabet-agnostic. Covers all
 * inline shapes in the corpus: dash/#-prefixed ("Doug--- 103317", "Eric - #2069853")
 * AND the legacy BARE form ("Eric Weiss 2004173 In on the 6th"). Bare runs are
 * gated at 6+ digits so a US ZIP (5) or street number survives.
 */
export function stripConfTokens(name: string): string {
  return (
    name
      // dash-prefixed conf# (#optional). Preserve ONLY a true ZIP+4 hyphen: a
      // word-boundary 5-digit ZIP immediately before, a SINGLE "-" with NO separator, and
      // EXACTLY 4 trailing digits ("…IL 60611-1234"), so the crew-visible "+4" is not
      // clipped (audit idx4). Every other dash-number is a conf# and is stripped — including
      // a conf# after a 5-digit token ("Suite 12345-2069854"), a #/spaced/multi-dash conf#,
      // and any run of 5+ trailing digits (Codex R1/R2). A left-only lookbehind can't gate
      // the right side, so use a replacer that inspects both.
      .replace(
        /(\s*)([-–—]{1,3})(\s*#?\s*)(\d{4,})/g,
        (
          whole,
          ws: string,
          dashes: string,
          sep: string,
          digits: string,
          offset: number,
          str: string,
        ) => {
          // The predicate is EXACTLY `\b\d{5}-\d{4}\b`: a boundary 5-digit ZIP before, an
          // ASCII hyphen (en/em-dash is a conf# delimiter — Codex R3), no separator, exactly
          // 4 digits, and a trailing word boundary (Codex R4 — "60611-1234A" is not a ZIP+4).
          const afterMatch = str.charAt(offset + whole.length);
          const isZip4 =
            dashes === "-" &&
            sep.length === 0 &&
            digits.length === 4 &&
            /\b\d{5}$/.test(str.slice(0, offset + ws.length)) &&
            (afterMatch === "" || !/\w/.test(afterMatch));
          if (isZip4) return whole;
          // idx88: a dash-prefixed number that BEGINS A STREET PHRASE is a street
          // address, not a conf#. Deleting it strands splitHotelNameAddress with no
          // street number to split on, collapsing the whole cell into hotel_name with
          // a null address ("Hyatt Regency - 1515 Madison Ave …" → the "- 1515" is
          // dropped). looksLikeStreetStart is the SAME street-vs-conf discriminator the
          // Hotel-Stays path uses (suffixed street OR "…, ST ZIP" tail). A "#"-marked
          // run ("- #1515") is always a conf#, so only a plain dash qualifies. Keep the
          // NUMBER but DROP the separator dash, yielding the flattened "name number
          // street" form splitHotelNameAddress expects (matching the inline no-guest
          // path). A dash-number that is NOT a street phrase stays stripped.
          if (
            !sep.includes("#") &&
            looksLikeStreetStart(" " + digits + str.slice(offset + whole.length))
          ) {
            return " " + digits;
          }
          return " ";
        },
      )
      .replace(/\s*#\s*\d{4,}/g, " ") // #-prefixed, no dash
      .replace(/\b\d{6,}\b/g, " ") // bare 6+ digit run (conf#; longer than any ZIP)
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * The "use the sheet's raw value" sanitizer for a hotel guest cell: flatten the raw cell
 * the way the parser flattens a "Names on Reservation" cell (clean + decode `&#10;`/`&#9;`
 * separators + collapse whitespace), then run the SAME `stripConfTokens` the parser applies
 * per guest name — so the raw replacement can never persist a confirmation number the normal
 * parse would strip. Returns "" when the cell reduces to nothing but conf tokens (the emitter
 * treats that as empty-raw, never `names:[""]`).
 */
export function stripConfirmationTokens(rawCell: string): string {
  const flat = decodeEntities(clean(rawCell)).replace(/\s+/g, " ").trim();
  return stripConfTokens(flat);
}

// TRANSFORM_SITES (spec 2026-07-07-ambiguity-warnings-v1 §6) — value-producing
// transform sites in this file that rest on a JUDGMENT the parser could get wrong.
// None here — pure conf-token/street regex policy; no value-producing judgment transforms.
export const TRANSFORM_SITES: ReadonlyArray<
  { site: string; code: string } | { site: string; exempt: string }
> = [];
