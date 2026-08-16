/**
 * lib/data/stagedShowForViewer.ts — the pure `parse_result → ShowForViewer`
 * adapter behind the admin-only staged crew preview.
 *
 * Spec: docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md §2.2
 *
 * Governing rule (spec §2.2): this reproduces, for staged data, EVERY
 * viewer-dependent transform `readShowDataForViewer` applies between raw rows
 * and the projection — reusing the exported helper wherever one exists, never a
 * hand-rolled variant. `normalizeDateRestriction`, `effectiveViewerDateRestriction`,
 * `hotelVisibleToViewer`, `resolveTransportOwners`, `aggregateDays` and
 * `financialsVisible` are all the live projection's own helpers.
 *
 * `asParseResult` validates top-level CONTAINERS only and casts the rest
 * (lib/db/coerceJsonbObject.ts:133), so every nested field arriving here is
 * UNTRUSTED. The normalizers below coerce each one to the projection's runtime
 * grain (spec §2.2 guard conditions): a wrong-typed scalar becomes the field's
 * null/empty default, a wrong-typed array becomes `[]` with bad elements
 * dropped, and a wrong-typed required object drops the owning entry. The one
 * family that cannot default is `show.dates` (it drives day gating everywhere),
 * so a dates-shape failure returns `decode_error`. The adapter never throws.
 */
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import { effectiveViewerDateRestriction } from "@/lib/crew/stageSchedule";
import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import {
  hotelVisibleToViewer,
  type FinancialsRow,
  type ShowForViewer,
} from "@/lib/data/getShowForViewer";
import { normalizeDateRestriction } from "@/lib/data/normalizeDateRestriction";
import { resolveTransportOwners } from "@/lib/data/transportOwnerResolve";
import type { AgendaEntry } from "@/lib/parser/types";
import type {
  ClientContact,
  ClientContactPerson,
  ContactRow,
  DateRestriction,
  HotelReservationRow,
  ParseResult,
  PullSheetCase,
  PullSheetItem,
  RoleFlag,
  RoomKind,
  RunOfShow,
  ScheduleDay,
  ShowRow,
  StageRestriction,
  TransportationRow,
  TransportScheduleEntry,
  WorkPhase,
} from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { financialsVisible } from "@/lib/visibility/scopeTiles";

export type StagedPreviewRosterEntry = { id: string; name: string; role: string };

export type StagedShowForViewerResult =
  | { kind: "ok"; data: ShowForViewer; selectedId: string; roster: StagedPreviewRosterEntry[] }
  | { kind: "empty_roster" }
  | { kind: "decode_error" };

type ProjectedCrewRow = ShowForViewer["crewMembers"][number];

/** Inert token: the realtime bridge that consumes it is suppressed in preview posture (§2.6). */
const STAGED_VIEWER_VERSION_TOKEN = "staged-preview";

// ---------------------------------------------------------------------------
// Grain primitives
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string, or null for every other runtime shape. */
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A string, or the supplied default for every other runtime shape. */
function strOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Array of strings; non-array becomes `[]`, non-string elements are dropped. */
function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((el): el is string => typeof el === "string");
}

/** Map an array's object elements through `f`, dropping non-objects and `null` results. */
function objectArray<T>(value: unknown, f: (entry: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const el of value) {
    if (!isPlainObject(el)) continue;
    const mapped = f(el);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

/**
 * A legacy double-encoded jsonb scalar arrives as a STRING; the live projection
 * routes restrictions through `decodeJsonbColumn` for exactly this reason
 * (lib/data/getShowForViewer.ts:493-497).
 */
function decodeMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Per-family normalizers
// ---------------------------------------------------------------------------

const WORK_PHASES: ReadonlySet<string> = new Set<WorkPhase>([
  "Load In",
  "Set",
  "Show",
  "Strike",
  "Load Out",
]);
const ROOM_KINDS: ReadonlySet<string> = new Set<RoomKind>(["gs", "breakout", "additional"]);
const CONTACT_KINDS: ReadonlySet<string> = new Set<ContactRow["kind"]>(["venue", "in_house_av"]);
const AGENDA_ENTRY_KINDS: ReadonlySet<string> = new Set(["agenda", "strike", "loadout"]);

function toDateRestriction(value: unknown): DateRestriction {
  const decoded = decodeMaybeJson(value);
  if (!isPlainObject(decoded)) return { kind: "none" };
  if (decoded.kind === "explicit") return { kind: "explicit", days: strArray(decoded.days) };
  if (decoded.kind === "unknown_asterisk") return { kind: "unknown_asterisk", days: null };
  return { kind: "none" };
}

function toStageRestriction(value: unknown): StageRestriction {
  const decoded = decodeMaybeJson(value);
  if (!isPlainObject(decoded)) return { kind: "none" };
  if (decoded.kind !== "explicit") return { kind: "none" };
  const stages = strArray(decoded.stages).filter((s): s is WorkPhase => WORK_PHASES.has(s));
  return { kind: "explicit", stages };
}

/**
 * `show.dates` is the one family with no safe default — it drives aggregate-day
 * derivation, run-of-show gating and every schedule surface — so a shape failure
 * is reported as `decode_error` rather than coerced (spec §2.2).
 */
function toDates(value: unknown): ShowRow["dates"] | null {
  if (!isPlainObject(value)) return null;
  const showDays = value.showDays;
  if (!Array.isArray(showDays)) return null;
  if (showDays.some((d) => typeof d !== "string")) return null;
  for (const field of ["travelIn", "set", "travelOut", "loadIn", "setupTime"] as const) {
    const v = value[field];
    if (v !== null && v !== undefined && typeof v !== "string") return null;
  }
  return {
    travelIn: str(value.travelIn),
    set: str(value.set),
    showDays: showDays as string[],
    travelOut: str(value.travelOut),
    loadIn: str(value.loadIn),
    setupTime: str(value.setupTime),
  };
}

function toClientContactPerson(value: Record<string, unknown>): ClientContactPerson {
  return {
    name: strOr(value.name, ""),
    email: str(value.email),
    phone: str(value.phone),
    officePhone: str(value.officePhone),
  };
}

function toClientContact(value: unknown): ClientContact | null {
  if (!isPlainObject(value)) return null;
  const secondaryRaw = value.secondary;
  return {
    ...toClientContactPerson(value),
    secondary: isPlainObject(secondaryRaw) ? toClientContactPerson(secondaryRaw) : null,
  };
}

function toVenue(value: unknown): ShowRow["venue"] {
  if (!isPlainObject(value)) return null;
  return {
    name: strOr(value.name, ""),
    address: strOr(value.address, ""),
    loadingDock: str(value.loadingDock),
    googleLink: str(value.googleLink),
    notes: str(value.notes),
    city: str(value.city),
    timezone: str(value.timezone),
  };
}

function toSchedulePhases(value: unknown): Record<string, WorkPhase[]> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, WorkPhase[]> = {};
  for (const [key, phases] of Object.entries(value)) {
    out[key] = strArray(phases).filter((p): p is WorkPhase => WORK_PHASES.has(p));
  }
  return out;
}

function toEventDetails(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, detail] of Object.entries(value)) {
    if (typeof detail === "string") out[key] = detail;
  }
  return out;
}

/**
 * The §2.2 agenda strip: `fileId` and `extracted` are dropped from every entry.
 * The asset proxy authorizes against a PERSISTED show's `agenda_links`
 * (app/api/asset/agenda/[show]/[id]/route.ts:17-20), so an embed could only 404;
 * fileId-less entries render nothing (ScheduleSection.tsx:143-148).
 */
function toAgendaLinks(value: unknown): ShowRow["agenda_links"] {
  return objectArray(value, (entry) => {
    const url = str(entry.url);
    return { label: strOr(entry.label, ""), ...(url === null ? {} : { url }) };
  });
}

function toCrewRow(entry: Record<string, unknown>, id: string, show: ShowRow): ProjectedCrewRow {
  const stageRestriction = toStageRestriction(entry.stage_restriction);
  // Same two boundary transforms the live projection applies
  // (lib/data/getShowForViewer.ts:494-516).
  const normalizedDateRestriction = normalizeDateRestriction(
    toDateRestriction(entry.date_restriction),
    show.dates,
  );
  return {
    id,
    name: entry.name as string,
    email: str(entry.email),
    phone: str(entry.phone),
    role: strOr(entry.role, ""),
    roleFlags: strArray(entry.role_flags) as RoleFlag[],
    dateRestriction: effectiveViewerDateRestriction(
      show.dates,
      show.schedule_phases,
      normalizedDateRestriction,
      stageRestriction,
    ),
    stageRestriction,
  };
}

function toHotels(value: unknown): HotelReservationRow[] {
  return objectArray(value, (entry) => {
    const ordinal = num(entry.ordinal);
    if (ordinal === null) return null;
    return {
      ordinal,
      hotel_name: str(entry.hotel_name),
      hotel_address: str(entry.hotel_address),
      names: strArray(entry.names),
      confirmation_no: str(entry.confirmation_no),
      check_in: str(entry.check_in),
      check_out: str(entry.check_out),
      notes: str(entry.notes),
    };
  });
}

function toRooms(value: unknown): ProjectedRoomRow[] {
  const rows = objectArray(value, (entry) => {
    if (typeof entry.name !== "string") return null;
    const kind = entry.kind;
    return {
      // `id` is minted below so it follows ROSTER order, not source index.
      kind: (typeof kind === "string" && ROOM_KINDS.has(kind) ? kind : "additional") as RoomKind,
      name: entry.name,
      dimensions: str(entry.dimensions),
      floor: str(entry.floor),
      setup: str(entry.setup),
      set_time: str(entry.set_time),
      show_time: str(entry.show_time),
      strike_time: str(entry.strike_time),
      audio: str(entry.audio),
      video: str(entry.video),
      lighting: str(entry.lighting),
      scenic: str(entry.scenic),
      power: str(entry.power),
      digital_signage: str(entry.digital_signage),
      other: str(entry.other),
      notes: str(entry.notes),
    };
  });
  // `RoomRow` carries no id (lib/parser/types.ts:259) and `ProjectedRoomRow.id`
  // is a sort tie-break plus React key (lib/crew/resolveKeyTimes.ts:37-44), so
  // index-minted ids stay collision-free even for duplicate room names.
  return rows.map((room, index) => ({ ...room, id: `staged-room-${index}` }));
}

function toTransportSchedule(value: unknown): TransportScheduleEntry[] {
  return objectArray(value, (entry) => ({
    stage: strOr(entry.stage, ""),
    date: str(entry.date),
    time: str(entry.time),
    assigned_names: strArray(entry.assigned_names),
  }));
}

function toTransportation(value: unknown): TransportationRow | null {
  if (!isPlainObject(value)) return null;
  return {
    driver_name: str(value.driver_name),
    driver_phone: str(value.driver_phone),
    driver_email: str(value.driver_email),
    loadout_name: str(value.loadout_name),
    loadout_phone: str(value.loadout_phone),
    loadout_email: str(value.loadout_email),
    vehicle: str(value.vehicle),
    license_plate: str(value.license_plate),
    color: str(value.color),
    parking: str(value.parking),
    schedule: toTransportSchedule(value.schedule),
    notes: str(value.notes),
  };
}

function toContacts(value: unknown): ContactRow[] {
  return objectArray(value, (entry) => {
    const kind = entry.kind;
    return {
      kind: (typeof kind === "string" && CONTACT_KINDS.has(kind)
        ? kind
        : "venue") as ContactRow["kind"],
      name: str(entry.name),
      email: str(entry.email),
      phone: str(entry.phone),
      notes: str(entry.notes),
    };
  });
}

function toPullSheetItem(entry: Record<string, unknown>): PullSheetItem {
  const rawSnippet = str(entry.rawSnippet);
  return {
    qty: num(entry.qty),
    cat: str(entry.cat),
    subCat: str(entry.subCat),
    item: strOr(entry.item, ""),
    ...(rawSnippet === null ? {} : { rawSnippet }),
  };
}

function toPullSheet(value: unknown): PullSheetCase[] | null {
  if (!Array.isArray(value)) return null;
  return objectArray(value, (entry) => ({
    caseLabel: strOr(entry.caseLabel, ""),
    items: objectArray(entry.items, toPullSheetItem),
  }));
}

function toAgendaEntry(entry: Record<string, unknown>): AgendaEntry {
  const finish = str(entry.finish);
  const trt = str(entry.trt);
  const room = str(entry.room);
  const av = str(entry.av);
  const kind = str(entry.kind);
  return {
    start: strOr(entry.start, ""),
    title: strOr(entry.title, ""),
    ...(finish === null ? {} : { finish }),
    ...(trt === null ? {} : { trt }),
    ...(room === null ? {} : { room }),
    ...(av === null ? {} : { av }),
    ...(kind !== null && AGENDA_ENTRY_KINDS.has(kind)
      ? { kind: kind as NonNullable<AgendaEntry["kind"]> }
      : {}),
  };
}

function toScheduleDay(entry: Record<string, unknown>): ScheduleDay {
  const windowRaw = entry.window;
  const windowStart = isPlainObject(windowRaw) ? str(windowRaw.start) : null;
  const windowEnd = isPlainObject(windowRaw) ? str(windowRaw.end) : null;
  return {
    entries: objectArray(entry.entries, toAgendaEntry),
    showStart: str(entry.showStart),
    showEnd: str(entry.showEnd),
    window:
      windowStart !== null && windowEnd !== null ? { start: windowStart, end: windowEnd } : null,
  };
}

function toRunOfShow(value: unknown): RunOfShow | null {
  if (!isPlainObject(value)) return null;
  const out: RunOfShow = {};
  for (const [key, day] of Object.entries(value)) {
    if (!isPlainObject(day)) continue; // a non-object ScheduleDay drops that day key
    out[key] = toScheduleDay(day);
  }
  return out;
}

/**
 * The projection's run-of-show gate (lib/data/getShowForViewer.ts:795-830):
 * (decoded keys) ∩ `aggregateDays(show.dates)` ∩ the ACTIVE viewer's normalized
 * date restriction; an empty result collapses to `null`.
 */
function gateRunOfShow(
  runOfShow: RunOfShow | null,
  show: ShowRow,
  activeRestriction: DateRestriction,
): Record<string, ScheduleDay> | null {
  if (runOfShow === null) return null;
  const aggregateSet = new Set(aggregateDays(show.dates).map((d) => d.date));

  let allowed: Set<string>;
  if (activeRestriction.kind === "unknown_asterisk") {
    allowed = new Set<string>();
  } else if (activeRestriction.kind === "explicit") {
    allowed = new Set(activeRestriction.days.filter((d) => aggregateSet.has(d)));
  } else {
    allowed = aggregateSet;
  }

  const gated: Record<string, ScheduleDay> = {};
  for (const key of Object.keys(runOfShow)) {
    if (allowed.has(key)) gated[key] = runOfShow[key]!;
  }
  return Object.keys(gated).length > 0 ? gated : null;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export function buildStagedShowForViewer(
  parse: ParseResult,
  opts: {
    driveFileId: string | null;
    sourceAnchors: Record<string, SourceAnchor>;
    stagedModifiedTime: string | null;
    checkedAt: string;
    requestedViewerId: string | null;
  },
): StagedShowForViewerResult {
  const showRaw: unknown = parse.show;
  if (!isPlainObject(showRaw)) return { kind: "decode_error" };

  const dates = toDates(showRaw.dates);
  if (dates === null) return { kind: "decode_error" };

  // Captured BEFORE the strip so a non-entitled viewer's projection carries no
  // financial string anywhere (spec §2.2, mirroring getShowForViewer.ts:438-442).
  const capturedFinancials: FinancialsRow = {
    po: str(showRaw.po),
    proposal: str(showRaw.proposal),
    invoice: str(showRaw.invoice),
    invoice_notes: str(showRaw.invoice_notes),
  };

  const templateVersion = showRaw.template_version;
  const show: ShowRow = {
    title: strOr(showRaw.title, ""),
    client_label: strOr(showRaw.client_label, ""),
    client_contact: toClientContact(showRaw.client_contact),
    template_version: (templateVersion === "v1" || templateVersion === "v2"
      ? templateVersion
      : "v4") as ShowRow["template_version"],
    venue: toVenue(showRaw.venue),
    dates,
    schedule_phases: toSchedulePhases(showRaw.schedule_phases),
    event_details: toEventDetails(showRaw.event_details),
    agenda_links: toAgendaLinks(showRaw.agenda_links),
    coi_status: str(showRaw.coi_status),
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
  };

  const crewMembers: ProjectedCrewRow[] = [];
  // `flight_info` is the viewer's OWN itinerary and is deliberately NOT on the
  // roster rows (getShowForViewer.ts's `viewerFlightInfo` contract), so it is
  // captured here keyed by surrogate id rather than re-walked later.
  const flightInfoById = new Map<string, string | null>();
  if (Array.isArray(parse.crewMembers)) {
    for (const entry of parse.crewMembers as unknown[]) {
      if (!isPlainObject(entry)) continue; // non-object crew entry: dropped
      if (typeof entry.name !== "string") continue; // no string name: dropped
      const id = `staged-crew-${crewMembers.length}`;
      const rawFlight = str(entry.flight_info);
      // Blank-normalized to null exactly as the projection does (getShowForViewer.ts:376-377).
      flightInfoById.set(id, rawFlight !== null && rawFlight.trim().length > 0 ? rawFlight : null);
      crewMembers.push(toCrewRow(entry, id, show));
    }
  }
  if (crewMembers.length === 0) return { kind: "empty_roster" };

  const roster: StagedPreviewRosterEntry[] = crewMembers.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
  }));

  // The adapter owns the roster, so it resolves `?as=` itself: unknown or absent
  // falls back to index 0 and never reaches resolveViewerContext's fail-closed
  // throw (spec §2.2).
  const selected = crewMembers.find((c) => c.id === opts.requestedViewerId) ?? crewMembers[0]!;
  const viewerNameAliases = [selected.name];

  const transportation = toTransportation(parse.transportation);
  const data: ShowForViewer = {
    show,
    crewMembers,
    // For crew / admin_preview viewers the projection filters reservations to
    // those naming the viewer (getShowForViewer.ts:784-787).
    hotelReservations: toHotels(parse.hotelReservations).filter((res) =>
      hotelVisibleToViewer(res, viewerNameAliases),
    ),
    rooms: toRooms(parse.rooms),
    transportation,
    contacts: toContacts(parse.contacts),
    pullSheet: toPullSheet(parse.pullSheet),
    diagrams: null,
    openingReelHasVideo: false,
    lastSyncedAt: opts.stagedModifiedTime,
    lastCheckedAt: opts.checkedAt,
    lastSyncStatus: null,
    tileErrors: {},
    runOfShow: gateRunOfShow(toRunOfShow(parse.runOfShow), show, selected.dateRestriction),
    ...(financialsVisible(selected.roleFlags, false) ? { financials: capturedFinancials } : {}),
    viewerName: selected.name,
    viewerNameAliases,
    viewerId: selected.id,
    transportationOwnerIds: resolveTransportOwners(transportation, roster),
    viewerFlightInfo: flightInfoById.get(selected.id) ?? null,
    viewerVersionToken: STAGED_VIEWER_VERSION_TOKEN,
    driveFileId: opts.driveFileId,
    sourceAnchors: opts.sourceAnchors,
  };

  return { kind: "ok", data, selectedId: selected.id, roster };
}
