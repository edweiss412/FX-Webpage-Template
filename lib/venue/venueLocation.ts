/**
 * lib/venue/venueLocation.ts — best-effort venue "name + city" for the Step-3
 * review card's collapsed summary (Venue row, replacing the old Totals row).
 *
 * The venue address is whatever the sheet author typed (`ShowRow.venue.address`,
 * lib/parser/types.ts). We NEVER invent a city: when a city can't be confidently
 * isolated, `cityFromAddress` returns null and the card shows the venue name
 * alone. This keeps the row honest (a wrong city is worse than no city).
 *
 * Heuristic over comma-separated segments (trimmed, empties dropped):
 *   - "123 Main St, Chicago, IL 60601"            → "Chicago"  (street, CITY, state/zip)
 *   - "The Drake, 140 E Walton Pl, Chicago, IL"   → "Chicago"  (name, street, CITY, state)
 *   - "Chicago, IL 60601"                         → "Chicago"  (CITY, state/zip)
 *   - "123 Main St, Chicago"                      → "Chicago"  (street, CITY)
 *   - "140 E Walton Pl, IL 60611"                 → null       (no city segment)
 *   - "The Drake" / "123 Main St"                 → null       (no comma → no city signal)
 *
 * The common US formats (with a trailing "ST ZIP" or a street-number lead) resolve
 * correctly; genuinely ambiguous inputs degrade to null rather than guess wrong.
 */

/** "IL", "IL 60601", "IL 60601-1234", "60601", "60601-1234". */
function isStateOrZip(segment: string): boolean {
  return /^[A-Za-z]{2}(\s+\d{5}(-\d{4})?)?$/.test(segment) || /^\d{5}(-\d{4})?$/.test(segment);
}

/** Best-effort city from a free-text address; null when none can be isolated. */
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1] ?? "";
  let candidate: string;
  if (isStateOrZip(last)) {
    // "…, CITY, ST ZIP" — the city is the segment right before the state/zip.
    candidate = parts[parts.length - 2] ?? "";
  } else if (/\d/.test(parts[0] ?? "")) {
    // "STREET, CITY" — a street-number lead means the next segment is the city.
    candidate = parts[1] ?? "";
  } else {
    // "CITY, …" — no trailing state/zip and no street lead.
    candidate = parts[0] ?? "";
  }

  candidate = candidate.trim();
  if (!candidate) return null;
  if (isStateOrZip(candidate)) return null; // candidate is itself a state/zip
  if (/^\d/.test(candidate)) return null; // candidate looks like a street line
  return candidate;
}

export type VenueDisplay = { name: string | null; city: string | null };

/**
 * The collapsed-card Venue row value: the venue name (primary) and a best-effort
 * city (secondary). Returns `{ name: null, city: null }` when nothing is known
 * (the card then renders the "Venue not detected" fallback). `name` falls back to
 * null (not the address) so the address never masquerades as a venue name.
 */
export function venueDisplay(
  venue: { name?: string | null; address?: string | null } | null | undefined,
): VenueDisplay {
  if (!venue) return { name: null, city: null };
  const name = venue.name?.trim() ? venue.name.trim() : null;
  const city = cityFromAddress(venue.address);
  return { name, city };
}
