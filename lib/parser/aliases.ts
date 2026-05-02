/**
 * Field alias map — canonical key → accepted label spellings (including typos).
 *
 * Canonical key convention: `<block>.<snake_case_field>`
 *   Block prefixes: venue, client, dates, crew, transport, details, ops, etc.
 *
 * All matching is case-insensitive and whitespace-trimmed (see resolveAlias).
 * The forward-map values preserve original case for documentation; the reverse
 * map is built from their lowercased forms.
 *
 * Sources:
 *   - Spec §6.4 fieldAliases block (parser-config.json)
 *   - Corpus grep across fixtures/shows/raw/*.md for per-version label spellings
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  // ── Version-detection markers ─────────────────────────────────────────────
  // v4: "Contact Office" row in CLIENT block (2026-03+ sheets)
  "client.contact_office": ["Contact Office"],
  // v2: standalone "Client Contact" row (v1 uses merged "Client Contact/Name" cells)
  "client.contact": ["Client Contact"],

  // ── Venue / hotel ─────────────────────────────────────────────────────────
  "venue.contact_info": ["Hotel Contact Info", "Hotal Contact Info", "Venue Contact Info"],
  "venue.in_house_av": ["In House AV"],
  "venue.hotel_reservations": ["Hotel Reservations"],
  "venue.name": ["VENUE NAME", "Venue Name"],
  "venue.address": ["VENUE ADDRESS", "Venue Address", "Hotel Address"],
  "venue.loading_dock": ["LOADING DOCK", "Loading Dock"],

  // ── Client ────────────────────────────────────────────────────────────────
  "client.name": ["CLIENT"],
  "client.contact_email": ["Client Email"],
  "client.contact_phone": ["Client Phone"],
  "client.contact_cell": ["Contact Cell"],
  "client.contact_email_main": ["Contact Email"],

  // ── Ops / financials ─────────────────────────────────────────────────────
  "ops.po": ["PO#", "PO\\#", "PO #"],
  "ops.coi": ["COI"],
  "ops.proposal": ["Proposal"],
  "ops.invoice": ["Invoice"],
  "ops.invoice_notes": ["Invoice Notes"],

  // ── Details / event info ─────────────────────────────────────────────────
  "details.diagrams": ["DIagrams", "Diagrams", "DIAGRAMS"],
  "details.virtual_audience": ["Virtual Audience", "Virtaul Audience"],
  "details.gooseneck": ["Gooseneck", "Goosneck", "Goosenecks"],
  "details.agenda_link": ["AGENDA LINK"],

  // ── Transport ─────────────────────────────────────────────────────────────
  "transport.driver": ["Driver", "Equipment Transporter"],
  "transport.vehicle": ["Vehicle"],
  "transport.parking": ["Parking"],
  "transport.pick_up_warehouse": ["Pick Up Warehouse"],
  "transport.drop_off_venue": ["Drop Off Venue"],
  "transport.pick_up_venue": ["Pick Up Venue"],
  "transport.drop_off_warehouse": ["Drop Off Warehouse"],
};

/**
 * Reverse lookup map: lowercased alias → canonical key.
 * Built once at module load time.
 */
const REVERSE_MAP: Map<string, string> = new Map(
  Object.entries(FIELD_ALIASES).flatMap(([canonical, aliases]) =>
    aliases.map((a) => [a.toLowerCase(), canonical] as const),
  ),
);

/**
 * Resolve a cell label to its canonical key.
 *
 * Matching is case-insensitive and whitespace-trimmed.
 * Returns the canonical key string (e.g. `"venue.contact_info"`) or `null`
 * if the label is not recognised.
 */
export function resolveAlias(label: string): string | null {
  return REVERSE_MAP.get(label.trim().toLowerCase()) ?? null;
}
