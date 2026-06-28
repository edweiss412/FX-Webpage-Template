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
import { isAgendaLinkRow } from "./agendaLinkRow";
import { newAggregator, emitUnknownSection } from "./warnings";
import { isKnownSectionHeader, isKnownSubLabel, countFieldHeaderWords } from "./knownSections";
import { parseClient } from "./blocks/client";
import { parseVenue } from "./blocks/venue";
import { parseDates } from "./blocks/dates";
import { parseCrew } from "./blocks/crew";
import { normalizeSectionHeaders } from "./sectionHeaderNormalize";
import { parseTravelFlights } from "./blocks/travelFlights";
import { parseHotels } from "./blocks/hotels";
import { parseRooms } from "./blocks/rooms";
import { parseTransportation } from "./blocks/transport";
import { parseContacts } from "./blocks/contacts";
import { parseEventDetails } from "./blocks/event";
import { parseOps } from "./blocks/ops";
import { parsePullSheet } from "./pull-sheet";
import { parseDiagrams, extractLinkedFolder } from "./diagrams";
import { extractOpeningReel } from "./opening-reel";
import { parseAgenda } from "./blocks/agenda";
import { parseScheduleTimes } from "./blocks/scheduleTimes";
import type { ParsedSheet, ParseError, ShowRow, WorkPhase, ScheduleDay } from "./types";

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
//      The label cell is exactly "Event Name:" (case-insensitive).
//      This row lives in the CLIENT block, NOT the EVENT DETAILS block, so
//      parseEventDetails never captures it. We scan raw markdown directly.
//
//   2. v2 "Title of Event" row in venue-reference form ->
//      | Title of Event | SHOW TITLE |
//      Value cell must be non-empty (some fixtures have empty value cells).
//
//   3. v2 with NO_HEADER first row (2025-06-ria-investment-forum):
//      First row of the markdown is a table row whose col0 is "NO_HEADER"
//      and col1 contains the show title.
//
//   4. v1 (2024-05-east-coast): First table row, first non-empty cell
//      (the title is repeated in both col0 and col1).
//
// Priority: Event Name: > Title of Event > NO_HEADER > first-row cell.
//
// KNOWN_NON_TITLES: values that look like show titles but are actually column
// headers or block labels. Any candidate that matches (case-insensitively) is
// rejected and the next candidate is tried.

const KNOWN_NON_TITLES = new Set([
  "main",
  "secondary",
  "name",
  "details",
  "setup",
  "bo setup",
  "gs setup",
  "event details",
  "event name",
  "event name:",
  "title of event",
  "no_header",
]);

const TABLE_ROW_RE = /^\|\s*(.+?)\s*\|/;
const CELL_SPLIT_RE = /\s*\|\s*/;

function isKnownNonTitle(candidate: string): boolean {
  return KNOWN_NON_TITLES.has(candidate.toLowerCase().trim());
}

function extractTitleFromMarkdown(
  md: string,
  eventDetails: Record<string, string>,
  filename?: string,
): string {
  const lines = md.split("\n");

  // 1. Scan raw markdown for "Event Name:" label row (v4/v2 newer fixtures).
  //    This row lives in the CLIENT block, so parseEventDetails never captures it.
  //    Format: | Event Name: | <TITLE> | ... |
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split(CELL_SPLIT_RE)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells[0]?.toLowerCase() === "event name:" && cells[1] && cells[1].length > 0) {
      const candidate = cells[1].trim();
      if (candidate.length > 0 && !isKnownNonTitle(candidate)) {
        return candidate;
      }
    }
  }

  // 2. Scan raw markdown for "Title of Event" row with non-empty value cell.
  //    Format: | Title of Event | <TITLE> |
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split(CELL_SPLIT_RE)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells[0]?.toLowerCase() === "title of event" && cells[1] && cells[1].length > 0) {
      const candidate = cells[1].trim();
      if (candidate.length > 0 && !isKnownNonTitle(candidate)) {
        return candidate;
      }
    }
  }

  // 3. event_name from parseEventDetails output (overlaps with #1 but kept as
  //    a safety net in case a future fixture puts Event Name in the details block).
  const fromEventName = eventDetails["event_name"];
  if (fromEventName && fromEventName.trim().length > 0 && !isKnownNonTitle(fromEventName)) {
    return fromEventName.trim();
  }

  // 4. title_of_event from parseEventDetails output (safety net).
  const fromTitleOfEvent = eventDetails["title_of_event"];
  if (
    fromTitleOfEvent &&
    fromTitleOfEvent.trim().length > 0 &&
    !isKnownNonTitle(fromTitleOfEvent)
  ) {
    return fromTitleOfEvent.trim();
  }

  // 5. NO_HEADER first-row pattern (v2 RIA style):
  //    | NO_HEADER | <show title> | ...
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split(CELL_SPLIT_RE)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells[0]?.toUpperCase() === "NO_HEADER" && cells[1] && cells[1] !== "NO_HEADER") {
      const candidate = cells[1].trim();
      if (candidate.length > 0 && !isKnownNonTitle(candidate)) {
        return candidate;
      }
    }
    // Found first non-separator table row that doesn't match NO_HEADER -- stop
    if (cells.some((c) => !/^[\s:|*-]*$/.test(c))) break;
  }

  // 6. v1 fallback: first non-empty, non-separator table cell in the FIRST table
  //    only (stops at first blank line after table starts, to avoid scanning
  //    crew/contact tables that follow the title table in v1 fixtures).
  let inFirstTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // Once we have entered a table and hit a blank line, stop scanning
    if (inFirstTable && trimmed === "") break;
    if (!trimmed.startsWith("|")) continue;
    inFirstTable = true;
    // Skip separator rows
    if (/^\|\s*[:|-]+\s*\|/.test(trimmed)) continue;
    const match = TABLE_ROW_RE.exec(trimmed);
    if (match) {
      const cell = match[1]?.trim() ?? "";
      // Skip obvious label cells and empty/escape sequences
      if (
        cell.length > 0 &&
        !isKnownNonTitle(cell) &&
        !cell.toUpperCase().startsWith("CLIENT") &&
        !cell.toUpperCase().startsWith("NO_HEADER") &&
        cell !== "\\#NUM\\!" &&
        !/^\\#/.test(cell)
      ) {
        return cell;
      }
    }
  }

  // 7. Final fallback: derive from filename if provided.
  //    Strip the .md extension and the leading YYYY-MM- date prefix, then
  //    convert dashes to spaces. E.g. "2025-03-dci-rpas-central.md" → "dci rpas central".
  if (filename) {
    const base = filename.replace(/\.md$/i, "").replace(/^\d{4}-\d{2}-/, "");
    if (base.length > 0) {
      return base.replace(/-/g, " ").trim();
    }
  }

  return "";
}

// ── Agenda link extraction ────────────────────────────────────────────────────
// Scans the raw markdown for rows matching:
//   | AGENDA LINK <SUFFIX> | <filename or URL> |
// These rows appear OUTSIDE the EVENT DETAILS block (corpus-verified:
// 2025-03-dci-rpas-central.md:239-241 and
// 2025-05-redefining-fixed-income-private-credit.md:87-89).
// If the value is a Drive URL, extracts the fileId from the /d/<id> segment.
// If the value is a plain URL (https://...), stores it as `url`.
// Otherwise (filename or plain text) stores the value as `url` (the only
// string-valued carry field in the type).
// Drive file resolution (for fileId → real download) is deferred to M4/Task 1.13.
function parseAgendaLinks(markdown: string): ShowRow["agenda_links"] {
  const links: { label: string; fileId?: string; url?: string }[] = [];
  for (const line of markdown.split("\n")) {
    // Accept the standard "AGENDA LINK[ - suffix]" label AND a bare "AGENDA"
    // label (the 2024 East Coast template labels the agenda Drive-URL row just
    // "AGENDA"). The bare `AGENDA` alternative is exact-bounded by the trailing
    // `\s*\|`, so "AGENDA DAY"/"AGENDA TAB"-style cells do NOT match.
    const m = line.match(/^\s*\|\s*(AGENDA LINK[^|]*?|AGENDA)\s*\|\s*([^|]+?)\s*\|/i);
    if (!m) continue;
    const label = m[1]?.trim() ?? "";
    const value = m[2]?.trim() ?? "";
    if (!isAgendaLinkRow(label, value)) continue;
    const driveFileMatch = value.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveFileMatch?.[1]) {
      links.push({ label, fileId: driveFileMatch[1] });
    } else if (/^https?:\/\//.test(value)) {
      links.push({ label, url: value });
    } else if (value.length > 0) {
      // Plain filename or descriptive text — preserve as `url` (label-only carry)
      links.push({ label, url: value });
    }
  }
  return links;
}

// ── schedule_phases ───────────────────────────────────────────────────────────
// M1 baseline: derives work phases from the dates block only.
//
//   dates.set        → ['Set'] always.
//                      'Load In' is added on set day ONLY when travelIn is
//                      absent or travelIn === set (same-day fly-out/drive-in
//                      crew pattern). When travelIn is a separate calendar day,
//                      Load In is NOT automatically placed on set day — the
//                      dates-only baseline does not know which day crew actually
//                      loads in, so the safer default is to omit it rather than
//                      misrepresent the schedule (Codex round-2 finding).
//   showDays[0..n-2] → ['Show']
//   showDays[n-1]    → ['Show', 'Strike']  (last show day is always compound)
//   dates.travelOut  → ['Load Out']
//
// travelIn is a travel-only day and does not map to a WorkPhase entry.
//
// A richer per-day derivation (parsing the SCHEDULE block for explicit phase
// rows) is deferred — the spec notes "RightNowState alone is too coarse" for
// compound days; this dates-only mapping is the agreed M1 baseline.
// PackListTile reads this map via todayWorkPhases(show, today).
export function deriveSchedulePhases(dates: ShowRow["dates"]): ShowRow["schedule_phases"] {
  const phases: Record<string, WorkPhase[]> = {};

  // Helper: append a phase to a date's list (de-duplicated, ordered).
  const addPhase = (date: string | null | undefined, phase: WorkPhase) => {
    if (!date) return;
    const existing = phases[date] ?? [];
    if (!existing.includes(phase)) {
      phases[date] = [...existing, phase];
    }
  };

  if (dates.set) {
    addPhase(dates.set, "Set");
    // Load In on set day only when travel-in is absent or on the same day.
    // When travelIn is a separate calendar day, skip Load In — the M1
    // dates-only baseline cannot determine which day crew loads in.
    if (!dates.travelIn || dates.travelIn === dates.set) {
      addPhase(dates.set, "Load In");
    }
  }

  const days = dates.showDays;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day) continue;
    addPhase(day, "Show");
    if (i === days.length - 1) {
      addPhase(day, "Strike"); // last show day is compound Show+Strike
    }
  }

  if (dates.travelOut) addPhase(dates.travelOut, "Load Out");

  return phases;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export function parseSheet(markdown: string, filename?: string): ParsedSheet {
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

  // Step 2.5: Auto-correct misspelled LONG section headers (TRANSPORTATION / EVENT
  // DETAILS) ONCE, upstream of every block parser, so a typo'd header doesn't drop the
  // whole section. Gated + corpus-no-op (see lib/parser/sectionHeaderNormalize.ts).
  // Runs AFTER version detection (a section typo never affects v1/v2/v4 detection).
  const secNorm = normalizeSectionHeaders(markdown);
  markdown = secNorm.corrected;
  agg.warnings.push(...secNorm.warnings);

  // Step 3: Call each block parser.
  const { client_label, client_contact } = parseClient(markdown, version, agg);
  const venue = parseVenue(markdown, version, agg);
  const dates = parseDates(markdown, version, agg);
  const agendaResult = parseAgenda(markdown, dates);
  agg.warnings.push(...agendaResult.warnings);
  const scheduleTimesResult = parseScheduleTimes(markdown, dates);
  agg.warnings.push(...scheduleTimesResult.warnings); // mirrors :369 — routes SCHEDULE_TIME_UNPARSED to ParsedSheet.warnings → sync log → §12.4
  const crewMembers = parseCrew(markdown, version, agg);
  parseTravelFlights(markdown, crewMembers, agg);
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

  // parseDiagrams is a pure exact-label extractor. If the DIagrams label was misspelled,
  // its exact scan misses — but parseEventDetails (typo-tolerant, PR-D1) already recovered the
  // cell value into eventDetails.diagrams AND warned (FIELD_LABEL_AUTOCORRECTED). Recover the
  // folder link from that value (mirrors extractOpeningReel(eventDetails["opening_reel"]) below).
  const diag = parseDiagrams(markdown);
  const { embeddedImages, linkedFolderItems } = diag;
  let linkedFolder = diag.linkedFolder;
  if (linkedFolder === null) {
    linkedFolder = extractLinkedFolder(eventDetails["diagrams"] ?? "");
  }

  // extractOpeningReel reads the opening_reel field from event details.
  const openingReel = extractOpeningReel(eventDetails["opening_reel"] ?? null);

  // Step 4: Compose show title.
  const title = extractTitleFromMarkdown(markdown, eventDetails, filename);

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
    agenda_links: parseAgendaLinks(markdown),
    coi_status: ops.coi_status,
    po: ops.po,
    proposal: ops.proposal,
    invoice: ops.invoice,
    invoice_notes: ops.invoice_notes,
  };

  // §4.3 D2 merge — runs IN THE PARSER (single carrier). grid wins per day with
  // ≥1 titled entry (lifted to ScheduleDay); else the DATES-column ScheduleDay.
  // showStart/window of a grid-lifted day come from the grid first entry / null.
  let mergedRunOfShow: Record<string, ScheduleDay> | undefined;
  const gridDays = agendaResult.runOfShow; // Record<iso, AgendaEntry[]> | undefined
  const datesDays = scheduleTimesResult.scheduleDays; // Record<iso, ScheduleDay>
  if (gridDays !== undefined || Object.keys(datesDays).length > 0) {
    const merged: Record<string, ScheduleDay> = { ...datesDays };
    for (const [iso, gridEntries] of Object.entries(gridDays ?? {})) {
      if (gridEntries.length > 0) {
        merged[iso] = {
          entries: gridEntries,
          showStart: gridEntries[0]!.start,
          window: null,
        };
      }
      // grid day present-as-[] → leave the DATES-column ScheduleDay (if any) in place
      else if (!(iso in merged)) {
        merged[iso] = { entries: [], showStart: null, window: null };
      }
    }
    mergedRunOfShow = merged;
  }

  // Class B (§5.2) — scan for section-header-shaped rows whose col0 matches no
  // known-section-header. Span-independent (registry + header-band shape, NOT
  // block-slice position) so an unknown section appended right after a block with
  // no blank separator (the VB09 `CATERING | NAME | PHONE` shape) still fires.
  // The gate requires col0 to be an all-caps token NOT in the registry, NOT a
  // recognized sub-label, AND col1+ to carry >=2 distinct field-header words
  // (NAME/PHONE/EMAIL/...) — pull-sheet equipment rows and repeated-name GEAR
  // rows lack that band, keeping the corpus regression at zero false positives.
  // De-dup: track headers already emitted so a repeated unknown header (a few
  // data rows) fires once.
  {
    const emittedUnknownHeaders = new Set<string>();
    for (const line of markdown.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) continue;
      const cells = trimmed
        .split(CELL_SPLIT_RE)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      const col0 = cells[0] ?? "";
      if (!col0 || !/^[A-Z][A-Z\s/&]+$/.test(col0)) continue;
      if (isKnownSectionHeader(col0) || isKnownSubLabel(col0)) continue;
      if (countFieldHeaderWords(cells.slice(1)) < 2) continue;
      const key = col0.toUpperCase();
      if (emittedUnknownHeaders.has(key)) continue;
      emittedUnknownHeaders.add(key);
      emitUnknownSection(agg, col0);
    }
  }

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
    ...(mergedRunOfShow !== undefined ? { runOfShow: mergedRunOfShow } : {}),
  };
}
