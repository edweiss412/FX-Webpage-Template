import type {
  ClientContact,
  ContactKind,
  ContactRow,
  CrewMemberRow,
  DateRestriction,
  HotelReservationRow,
  ParseResult,
  ParseWarning,
  PullSheetCase,
  RoleFlag,
  RoomKind,
  RoomRow,
  RunOfShow,
  ShowRow,
  StageRestriction,
  TransportationRow,
  TransportScheduleEntry,
} from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { buildAdminAgendaPreview, type AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import { AGENDA_MAX_PDFS_PER_SHEET } from "@/lib/agenda/constants";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";

/**
 * Published-mode adapter (spec §3.2 / §3.3). Pure function — NO Supabase calls,
 * NO re-parsing. It maps the statement-consistent `ShowReviewSnapshot` jsonb
 * payload (a `shows` row, a nullable `shows_internal` row, and the per-show
 * `crew_members` / `rooms` / `hotel_reservations` / `transportation` / `contacts`
 * row sets — all `to_jsonb(row)` projections, so field names are DB column names)
 * onto `PublishedSectionData`. The snapshot RPC returns loosely-typed sections
 * (`unknown[]`); this adapter owns narrowing to the `SectionCore` shapes the
 * section panels render from.
 *
 * Guards (spec §11): a missing `shows_internal` row (`snapshot.internal === null`)
 * yields empty `warnings` / `ros` / `useRawDecisions`, `rawUnrecognized: null`, and
 * null financials — never a throw. `coiStatus` always comes from the `shows` row.
 */
export function buildPublishedSectionData(
  snapshot: ShowReviewSnapshot,
  opts: { slug: string },
): PublishedSectionData {
  const show = snapshot.show;
  const internal = snapshot.internal;
  const showId = str(show.id) ?? "";

  const financials = asRecord(internal?.financials);

  // ONE crew display sort feeds both the rendered `crewMembers` and the id-bearing
  // `previewRoster` (§5.5), so `previewRoster[i]` is guaranteed to be the persisted id of
  // `crewMembers[i]` by construction — no positional drift between the two arrays.
  const sortedCrew = sortCrew(snapshot.crew_members);

  return {
    mode: "published",
    showId,
    slug: opts.slug,
    archived: Boolean(show.archived),
    published: Boolean(show.published),

    // ── SectionCore header/content, from the `shows` row. ──
    title: str(show.title) ?? "",
    clientLabel: str(show.client_label) || null,
    dates: (show.dates as ShowRow["dates"] | null) ?? null,
    venue: (show.venue as ShowRow["venue"]) ?? null,
    eventDetails: (show.event_details as ShowRow["event_details"] | null) ?? null,
    clientContact: (show.client_contact as ClientContact | null) ?? null,
    contacts: sortContacts(snapshot.contacts).map(toContactRow),
    ros: (internal?.run_of_show as RunOfShow | undefined) ?? {},
    agendaBaseline: buildAgendaBaseline(show.agenda_links, showId),
    hotels: snapshot.hotel_reservations.map(asRecord).map(toHotelRow),
    transportation: pickTransportation(snapshot.transportation),
    rooms: sortRooms(snapshot.rooms).map(toRoomRow),
    diagrams: (show.diagrams as ParseResult["diagrams"] | null) ?? null,
    crewMembers: sortedCrew.map(toCrewRow),
    previewRoster: sortedCrew.map((r) => ({ id: str(r.id) ?? "", name: str(r.name) ?? "" })),
    pullSheet: (show.pull_sheet as PullSheetCase[] | null) ?? [],
    // Archived pull-sheet tabs are a staged-time accept/skip decision; published
    // rows carry the final pull sheet only (spec §3.2).
    archivedPullSheetTabs: [],
    billing: {
      coiStatus: str(show.coi_status) ?? null,
      proposal: str(financials?.proposal) ?? null,
      po: str(financials?.po) ?? null,
      invoice: str(financials?.invoice) ?? null,
      invoiceNotes: str(financials?.invoice_notes) ?? null,
    },

    // ── Cross-section, from the nullable `shows_internal` row. ──
    warnings: (internal?.parse_warnings as ParseWarning[] | undefined) ?? [],
    useRawDecisions: (internal?.use_raw_decisions as UseRawDecision[] | undefined) ?? [],
    rawUnrecognized: (internal?.raw_unrecognized as ParseResult["raw_unrecognized"] | null) ?? null,
    sourceAnchors: (show.source_anchors as PublishedSectionData["sourceAnchors"] | undefined) ?? {},
    driveFileId: str(show.drive_file_id) ?? null,
  };
}

// ── Agenda ─────────────────────────────────────────────────────────────────
// Published `freshByLinkKey` = the set of ordinals whose `link.extracted` is
// non-null (spec §3.5); persisted extraction is fresh-by-construction. The
// builder maps over `links.slice(0, AGENDA_MAX_PDFS_PER_SHEET)` 1:1
// (`agendaAdminPreview.ts` `visible.map`), so the adapter mirrors that same
// slice to rewrite fileId-backed hrefs to the published asset route by
// construction (index-aligned), not by accidental output position. url-only
// links keep the builder's validated external URL.
type AgendaLink = { label: string; fileId?: string; url?: string; extracted?: unknown };

function buildAgendaBaseline(raw: unknown, showId: string): AdminAgendaItem[] {
  const links = (Array.isArray(raw) ? raw : []) as AgendaLink[];
  const freshByLinkKey = new Set<number>();
  links.forEach((link, i) => {
    if (link.extracted != null) freshByLinkKey.add(i);
  });
  const visible = links.slice(0, AGENDA_MAX_PDFS_PER_SHEET);
  const items = buildAdminAgendaPreview(links, { validatedHrefs: true, freshByLinkKey });
  return items.map((item, i) => {
    const fileId = visible[i]?.fileId;
    return fileId ? { ...item, href: `/api/asset/agenda/${showId}/${fileId}` } : item;
  });
}

// ── Row projections ──────────────────────────────────────────────────────────
function toCrewRow(r: Record<string, unknown>): CrewMemberRow {
  return {
    name: str(r.name) ?? "",
    email: str(r.email) ?? null,
    phone: str(r.phone) ?? null,
    role: str(r.role) ?? "",
    role_flags: (r.role_flags as RoleFlag[] | undefined) ?? [],
    date_restriction: r.date_restriction as DateRestriction,
    stage_restriction: r.stage_restriction as StageRestriction,
    flight_info: str(r.flight_info) ?? null,
  };
}

function toRoomRow(r: Record<string, unknown>): RoomRow {
  return {
    kind: r.kind as RoomKind,
    name: str(r.name) ?? "",
    dimensions: str(r.dimensions) ?? null,
    floor: str(r.floor) ?? null,
    setup: str(r.setup) ?? null,
    set_time: str(r.set_time) ?? null,
    show_time: str(r.show_time) ?? null,
    strike_time: str(r.strike_time) ?? null,
    audio: str(r.audio) ?? null,
    video: str(r.video) ?? null,
    lighting: str(r.lighting) ?? null,
    scenic: str(r.scenic) ?? null,
    power: str(r.power) ?? null,
    digital_signage: str(r.digital_signage) ?? null,
    other: str(r.other) ?? null,
    notes: str(r.notes) ?? null,
  };
}

function toHotelRow(r: Record<string, unknown>): HotelReservationRow {
  return {
    ordinal: Number(r.ordinal),
    hotel_name: str(r.hotel_name) ?? null,
    hotel_address: str(r.hotel_address) ?? null,
    names: (r.names as string[] | undefined) ?? [],
    confirmation_no: str(r.confirmation_no) ?? null,
    check_in: str(r.check_in) ?? null,
    check_out: str(r.check_out) ?? null,
    notes: str(r.notes) ?? null,
  };
}

function toContactRow(r: Record<string, unknown>): ContactRow {
  return {
    kind: r.kind as ContactKind,
    name: str(r.name) ?? null,
    email: str(r.email) ?? null,
    phone: str(r.phone) ?? null,
    notes: str(r.notes) ?? null,
  };
}

function toTransportationRow(r: Record<string, unknown>): TransportationRow {
  return {
    driver_name: str(r.driver_name) ?? null,
    driver_phone: str(r.driver_phone) ?? null,
    driver_email: str(r.driver_email) ?? null,
    loadout_name: str(r.loadout_name) ?? null,
    loadout_phone: str(r.loadout_phone) ?? null,
    loadout_email: str(r.loadout_email) ?? null,
    vehicle: str(r.vehicle) ?? null,
    license_plate: str(r.license_plate) ?? null,
    color: str(r.color) ?? null,
    parking: str(r.parking) ?? null,
    schedule: (r.schedule as TransportScheduleEntry[] | undefined) ?? [],
    notes: str(r.notes) ?? null,
  };
}

// Transportation is 1:1 with a show (`getShowForViewer.ts` `.maybeSingle()`);
// the snapshot aggregates it as an array ordered by id. Take the lowest-id row
// for determinism, or null when there is none (spec §11 empty-state).
function pickTransportation(raw: unknown[]): TransportationRow | null {
  const rows = raw.map(asRecord);
  rows.sort((a, b) => cmp(str(a.id), str(b.id)));
  const first = rows[0];
  return first ? toTransportationRow(first) : null;
}

// ── Display sort helpers (spec §3.3 read-completeness & ordering) ─────────────
function sortRooms(raw: unknown[]): Record<string, unknown>[] {
  return raw
    .map(asRecord)
    .sort(
      (a, b) =>
        cmp(str(a.kind), str(b.kind)) || cmp(str(a.name), str(b.name)) || cmp(str(a.id), str(b.id)),
    );
}

function sortContacts(raw: unknown[]): Record<string, unknown>[] {
  return raw
    .map(asRecord)
    .sort(
      (a, b) =>
        cmp(str(a.kind), str(b.kind)) || cmp(str(a.name), str(b.name)) || cmp(str(a.id), str(b.id)),
    );
}

function sortCrew(raw: unknown[]): Record<string, unknown>[] {
  return raw
    .map(asRecord)
    .sort((a, b) => cmp(str(a.name), str(b.name)) || cmp(str(a.id), str(b.id)));
}

// ── Primitives ────────────────────────────────────────────────────────────────
function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// Stable ordering over nullable strings — nulls sort last.
function cmp(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
