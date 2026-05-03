/**
 * lib/parser/index.ts — top-level parseSheet orchestrator (Task 1.11, AC-1.1).
 *
 * Composes all block parsers into a single ParsedSheet.
 * NO Drive API calls — pure markdown-in / ParsedSheet-out.
 *
 * The sync layer (M6/M7) wraps this with enrichWithDrivePins(parsed, driveClient)
 * to populate embeddedImages[], linkedFolderItems[], openingReel.drive_modified_time,
 * headRevisionId, and mimeType — those fields are NEVER populated here.
 */

import { detectVersion } from "./schema";
import { newAggregator } from "./warnings";
import { parseClient } from "./blocks/client";
import { parseVenue } from "./blocks/venue";
import { parseDates } from "./blocks/dates";
import { parseCrew } from "./blocks/crew";
import { parseHotels } from "./blocks/hotels";
import { parseRooms } from "./blocks/rooms";
import { parseTransportation } from "./blocks/transport";
import { parseContacts } from "./blocks/contacts";
import { parseEventDetails } from "./blocks/event";
import { parseOps } from "./blocks/ops";
import { parsePullSheet } from "./pull-sheet";
import { parseDiagrams } from "./diagrams";
import { extractOpeningReel } from "./opening-reel";
import type { ParsedSheet, ParseError, ShowRow } from "./types";

export type { ParsedSheet, ParseResult, ParseWarning, ParseError } from "./types";
export type {
  ShowRow,
  CrewMemberRow,
  RoleFlag,
  HotelReservationRow,
  RoomRow,
  RoomKind,
  TransportationRow,
  TransportScheduleEntry,
  ContactRow,
  PullSheetCase,
  PullSheetItem,
  LinkedFolderRef,
  OpeningReelRef,
  WorkPhase,
  DateRestriction,
  StageRestriction,
  ClientContact,
  ClientContactPerson,
} from "./types";
export { resolveAlias, resolveAliasFull } from "./aliases";
export { detectVersion } from "./schema";

// ── Title extraction ──────────────────────────────────────────────────────────
//
// Corpus analysis across all 10 fixtures reveals four title locations:
//
//   1. v4/v2 newer (2025-10+):  "Event Name:" label row ->
//      | Event Name: | SHOW TITLE | ... |
//      Produces canonical key "event_name" from toCanonicalKey.
//
//   2. v2 "Title of Event" in EVENT DETAILS block ->
//      | Title of Event | SHOW TITLE |
//      Produces canonical key "title_of_event".
//
//   3. v2 with NO_HEADER first row (2025-06-ria-investment-forum):
//      First row of the markdown is a table row whose col0 is "NO_HEADER"
//      and col1 contains the show title.
//
//   4. v1 (2024-05-east-coast): First table row, first non-empty cell
//      (the title is repeated in both col0 and col1).
//
// Priority: event_name > title_of_event > NO_HEADER > first-row cell.

const TABLE_ROW_RE = /^\|\s*(.+?)\s*\|/;
const CELL_SPLIT_RE = /\s*\|\s*/;

function extractTitleFromMarkdown(md: string, eventDetails: Record<string, string>): string {
  // 1. "Event Name:" row directly in markdown (v4/v2 newer)
  //    toCanonicalKey("Event Name:") -> "event_name" (trailing colon stripped by [^a-z0-9_] filter)
  const fromEventName = eventDetails["event_name"];
  if (fromEventName && fromEventName.trim().length > 0) {
    return fromEventName.trim();
  }

  // 2. "Title of Event" in event details block
  const fromTitleOfEvent = eventDetails["title_of_event"];
  if (fromTitleOfEvent && fromTitleOfEvent.trim().length > 0) {
    return fromTitleOfEvent.trim();
  }

  // 3. NO_HEADER first-row pattern (v2 RIA style):
  //    | NO_HEADER | <show title> | ...
  const lines = md.split("\n");
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split(CELL_SPLIT_RE)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells[0]?.toUpperCase() === "NO_HEADER" && cells[1] && cells[1] !== "NO_HEADER") {
      return cells[1];
    }
    // Found first non-separator table row that doesn't match NO_HEADER -- stop
    if (cells.some((c) => !/^[\s:|*-]*$/.test(c))) break;
  }

  // 4. v1 fallback: first non-empty, non-separator table cell in the document
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // Skip separator rows
    if (/^\|\s*[:|-]+\s*\|/.test(trimmed)) continue;
    const match = TABLE_ROW_RE.exec(trimmed);
    if (match) {
      const cell = match[1]?.trim() ?? "";
      // Skip obvious label cells and empty/escape sequences
      if (
        cell.length > 0 &&
        !cell.toUpperCase().startsWith("CLIENT") &&
        !cell.toUpperCase().startsWith("NO_HEADER") &&
        cell !== "\\#NUM\\!" &&
        !/^\\#/.test(cell)
      ) {
        return cell;
      }
    }
  }

  return "";
}

// ── Agenda link extraction ────────────────────────────────────────────────────
// Deferred: agenda_links population is deferred to Task 1.13 / M4 when the
// Drive integration layer is available to resolve file IDs. For now, emit
// an empty array. The event_details map already preserves any agenda-related
// values verbatim under their canonical keys.
function extractAgendaLinks(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _eventDetails: Record<string, string>,
): ShowRow["agenda_links"] {
  // TODO(Task 1.13 / M4): parse agenda_link keys from eventDetails into
  // { label, fileId?, url? } entries once Drive URL pattern is confirmed.
  return [];
}

// ── schedule_phases ───────────────────────────────────────────────────────────
// Deferred: schedule_phases derivation is deferred to Task 1.13 / M4.
// PackListTile reads this map via todayWorkPhases(show, today). For now,
// emit an empty Record; the dates block already populates travelIn/set/showDays.
function deriveSchedulePhases(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dates: ShowRow["dates"],
): ShowRow["schedule_phases"] {
  // TODO(Task 1.13 / M4): map each date in dates.travelIn / dates.set /
  // dates.showDays / dates.travelOut to the appropriate WorkPhase[] entry.
  return {};
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export function parseSheet(markdown: string): ParsedSheet {
  const hardErrors: ParseError[] = [];

  // Step 1: Detect version. Hard-error gate per spec §6.8.
  const version = detectVersion(markdown);
  if (version === null) {
    hardErrors.push({
      code: "MI-1_VERSION_DETECTION_FAILED",
      message:
        "Could not detect sheet template version (v1/v2/v4). " +
        "The markdown does not match any known FXAV sheet layout.",
    });
    // Return a minimal-but-valid ParsedSheet shape. Phase-1 sync will gate on hardErrors.
    return {
      show: {
        title: "",
        client_label: "",
        client_contact: null,
        template_version: "v4", // placeholder; version unknown
        venue: null,
        dates: { travelIn: null, set: null, showDays: [], travelOut: null },
        schedule_phases: {},
        event_details: {},
        agenda_links: [],
        coi_status: null,
        po: null,
        proposal: null,
        invoice: null,
        invoice_notes: null,
      },
      crewMembers: [],
      hotelReservations: [],
      rooms: [],
      transportation: null,
      contacts: [],
      pullSheet: null,
      diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
      openingReel: null,
      raw_unrecognized: [],
      warnings: [],
      hardErrors,
    };
  }

  // Step 2: Initialize aggregator for warnings + raw_unrecognized.
  const agg = newAggregator();

  // Step 3: Call each block parser.
  const { client_label, client_contact } = parseClient(markdown, version, agg);
  const venue = parseVenue(markdown, version, agg);
  const dates = parseDates(markdown, version, agg);
  const crewMembers = parseCrew(markdown, version, agg);
  const hotelReservations = parseHotels(markdown, version, agg);
  const rooms = parseRooms(markdown, version, agg);
  const transportation = parseTransportation(markdown, version, crewMembers, agg);
  const contacts = parseContacts(markdown, version, agg);
  const eventDetails = parseEventDetails(markdown, version, agg);
  const ops = parseOps(markdown, version, agg);

  // parsePullSheet returns { pullSheet, warnings } -- merge warnings into agg.
  const pullSheetResult = parsePullSheet(markdown);
  agg.warnings.push(...pullSheetResult.warnings);
  const pullSheet = pullSheetResult.pullSheet;

  // parseDiagrams takes only markdown (no agg param in its signature).
  const { linkedFolder, embeddedImages, linkedFolderItems } = parseDiagrams(markdown);

  // extractOpeningReel reads the opening_reel field from event details.
  const openingReel = extractOpeningReel(eventDetails["opening_reel"] ?? null);

  // Step 4: Compose show title.
  const title = extractTitleFromMarkdown(markdown, eventDetails);

  // Step 5: Compose ShowRow.
  const show: ShowRow = {
    title,
    client_label,
    client_contact,
    template_version: version,
    venue,
    dates,
    schedule_phases: deriveSchedulePhases(dates),
    event_details: eventDetails,
    agenda_links: extractAgendaLinks(eventDetails),
    coi_status: ops.coi_status,
    po: ops.po,
    proposal: ops.proposal,
    invoice: ops.invoice,
    invoice_notes: ops.invoice_notes,
  };

  // Step 6: Return ParsedSheet.
  return {
    show,
    crewMembers,
    hotelReservations,
    rooms,
    transportation,
    contacts,
    pullSheet,
    diagrams: { linkedFolder, embeddedImages, linkedFolderItems },
    openingReel,
    raw_unrecognized: agg.rawUnrecognized,
    warnings: agg.warnings,
    hardErrors,
  };
}
