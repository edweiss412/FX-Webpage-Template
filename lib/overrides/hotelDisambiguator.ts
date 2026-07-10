// §5.3 hotel content disambiguator. A same-parsed-name reservation group is
// disambiguated by STABLE, non-overridable booking columns only: `check_in`, plus
// `confirmation_no` (a per-booking identifier) when the row carries one. The mutable
// occupant list is DELIBERATELY not read (R30) — a roster edit must never shift a
// reservation's disambiguator, or it could false-deactivate a stable override or make
// a stale key coincidentally match a different reservation.
//
// The delimiter is `\x1f` (U+001F unit separator): it cannot occur inside a hotel name
// or a date, and the UI hides it. Null booking fields substitute the empty string —
// never the literal text "null".

/** U+001F unit-separator delimiter (raw byte). */
export const HOTEL_DISAMBIGUATOR_SEP = "\x1f";

export function computeHotelDisambiguator(res: {
  check_in: string | null;
  confirmation_no: string | null;
}): string {
  const checkIn = res.check_in ?? "";
  const confirmation = res.confirmation_no ?? "";
  return confirmation === "" ? checkIn : `${checkIn}${HOTEL_DISAMBIGUATOR_SEP}${confirmation}`;
}
