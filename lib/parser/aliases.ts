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
  "venue.google_link": ["GOOGLE LINK", "Google Link"],
  "venue.notes": ["VENUE NOTES", "Venue Notes"],

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

  // ── Dates ─────────────────────────────────────────────────────────────────
  // v4/v2 DATES table row labels (used for label-to-canonical resolution)
  "dates.travel_in": ["TRAVEL IN", "Travel In"],
  "dates.travel_out": ["TRAVEL OUT", "Travel Out"],
  "dates.travel": ["TRAVEL", "Travel"],
  "dates.travel_set": ["TRAVEL / SET", "TRAVEL/SET"],
  "dates.set": ["SET", "Set"],
  "dates.show": ["SHOW", "Show"],

  // ── Transport ─────────────────────────────────────────────────────────────
  "transport.driver": ["Driver", "Equipment Transporter"],
  "transport.vehicle": ["Vehicle"],
  "transport.parking": ["Parking"],
  "transport.pick_up_warehouse": ["Pick Up Warehouse"],
  "transport.drop_off_venue": ["Drop Off Venue"],
  "transport.pick_up_venue": ["Pick Up Venue"],
  "transport.drop_off_warehouse": ["Drop Off Warehouse"],
  "transport.load_in_at_venue": ["Load In at Venue"],
  "transport.unload_at_warehouse": ["Unload at Warehouse"],
  "transport.load_at_warehouse": ["Load at Warehouse"],
  "transport.rental_pickup": ["Rental Pickup"],
  "transport.rental_return": ["Rental Return"],
  "transport.license_plate": ["License Plate"],
  "transport.color": ["Color"],

  // ── Hotels ────────────────────────────────────────────────────────────────
  "hotels.name": ["Hotel Name / Address", "Hotel Name/Address"],
  "hotels.confirmation_no": ["Confirmation #", "Confirmation No"],
  "hotels.check_in": ["Check In Date", "Check In"],
  "hotels.check_out": ["Check Out Date", "Check Out"],
  "hotels.names_on_reservation": ["Names on Reservation"],

  // ── Rooms ─────────────────────────────────────────────────────────────────
  "rooms.gs": ["GENERAL SESSION", "GS"],
  "rooms.breakout": ["BREAKOUT"],
  "rooms.additional": ["ADDITIONAL ROOM"],
  "rooms.setup": ["GS Setup", "BO Setup", "Setup"],
  "rooms.set_time": ["GS Set Time", "BO Set Time", "Set Time"],
  "rooms.show_time": ["GS Show Time", "BO Show Time", "Show Time"],
  "rooms.strike_time": ["GS Strike Time", "BO Strike Time", "Strike Time"],
  "rooms.audio": ["GS Audio", "BO Audio", "Audio"],
  "rooms.video": ["GS Video", "BO Video", "Video"],
  "rooms.lighting": ["GS Lighting", "BO Lighting", "Lighting", "GS LED", "BO LED"],
  "rooms.scenic": ["GS Scenic", "BO Scenic", "Scenic", "Backdrop / Scenic"],
  "rooms.power": ["GS Power", "BO Power"],
  "rooms.digital_signage": ["Digital Signage"],

  // ── Contacts ─────────────────────────────────────────────────────────────
  "contacts.venue": ["Venue Contact Info", "Hotel Contact Info", "Hotal Contact Info", "Hotel Contact Information"],
  "contacts.in_house_av": ["In House AV"],

  // ── Event details ─────────────────────────────────────────────────────────
  "event.gooseneck": ["Gooseneck", "Goosneck", "Goosenecks"],
  "event.power": ["Power"],
  "event.internet": ["Internet"],
  "event.keynote_requirements": ["Keynote Requirements"],
  "event.opening_reel": ["Opening Reel"],
  "event.virtual_audience": ["Virtual Audience", "Virtaul Audience"],
  "event.virtual_speaker": ["Virtual Speaker"],
  "event.stage_size": ["Stage Size"],
  "event.podium_type": ["GS Podium Type", "Podium Type"],
  "event.record": ["Record"],
  "event.polling": ["Polling"],
  "event.equipment_storage": ["Equipment Storage"],
  "event.staff_office_room": ["Staff Office Room"],
  "event.test_pattern": ["Test Pattern"],
  "event.fonts": ["Fonts", "Fonts (II ONLY)"],
  "event.scenic": ["Backdrop / Scenic", "Backdrop/Scenic"],
  "event.led": ["LED"],
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
