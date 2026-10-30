/**
 * components/crew/sections/todayRows.ts — the Today section's derivations,
 * shared by `TodaySection` and the Today search builder (lib/search/sections/today.ts),
 * so the page and the search index describe the same lines (spec §2.4, INV-1).
 *
 * `todayRows` returns everything the section renders below `RightNowHero` (the
 * mode, each card's rows, the notes) together with each line's search target id
 * and the search entries in render order. The section renders the model; the
 * builder keeps the entries. Every card is its own search region (its
 * `data-card-id`); Mode A's bare key-times strip sits outside every card
 * (region `none`, no group heading, so its group is "").
 *
 * The whole Today body sits inside one `WrappedSection`: a throw here renders
 * the fallback and the builder contributes nothing.
 *
 * A non-client module: the builder runs on the server and imports from here.
 */
import type { KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { personRowDisplay } from "@/components/crew/primitives/PersonRow";
import { runOfShowEntryLine } from "@/components/crew/primitives/RunOfShowList";
import {
  agendaSessionRowLine,
  capTimelineItems,
} from "@/components/crew/primitives/ShowDayTimelineList";
import {
  addEntry,
  addRunOfShowEntries,
  entrySink,
  keyTimeEntries,
  type EntrySink,
} from "@/components/crew/sections/scheduleRows";
import type { AgendaSession } from "@/lib/agenda/types";
import { agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import { aggregateDays, scheduleEntriesForViewer } from "@/lib/crew/agendaDisplay";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";
import { resolveKeyTimes, type KeyTimeAnchors } from "@/lib/crew/resolveKeyTimes";
import { selectPrimaryContact } from "@/lib/crew/selectPrimaryContact";
import { buildShowDayTimeline, type TimelineItem } from "@/lib/crew/showDayTimeline";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ViewerContext } from "@/lib/data/viewerContext";
import type { AgendaEntry } from "@/lib/parser/types";
import type { SearchEntry } from "@/lib/search/types";
import { streetFromAddress, venueDisplay } from "@/lib/venue/venueLocation";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

// Ported from NotesTile.tsx (:57-58) — the 5-source caps, exported for lib/search.
export const TRUNCATE_AT = 280;
export const SOURCE_CAP = 8;

/** Card titles, which are also the search groups of their lines. */
export const TODAY_TITLES = {
  tonight: "Tonight",
  where: "Where",
  contact: "Need something",
  keyTimes: "Key times",
  dress: "Dress code",
  showNotes: "Show notes",
  runOfShow: "Run of show",
} as const;

export type NotesEntry = {
  source: "venue" | "hotel" | "room" | "transport" | "contact";
  label: string;
  text: string;
};

/**
 * Identity-field non-empty predicate (NotesTile.tsx:88-92) — raw truthiness for
 * labels (hotel_name, room.name, contact.name) which may legitimately be a
 * sentinel-looking string.
 */
function nonEmpty(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

/**
 * Notes-text predicate (NotesTile.tsx:104-108) — §8.3 generic-optional: hides
 * null/empty/whitespace AND the universal sentinels via the single predicate.
 */
function notesText(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  if (shouldHideGenericOptional(s)) return null;
  return s.trim();
}

/**
 * Aggregate every notes source in the canonical order venue → hotel → room →
 * transport → contact (NotesTile.tsx:116-174). The transport source is only
 * included when `includeTransport` is true (the viewer can see the transport
 * tile per `transportTileVisible`).
 */
export function aggregateNotes(data: ShowForViewer, includeTransport: boolean): NotesEntry[] {
  const out: NotesEntry[] = [];

  const venueText = notesText(data.show.venue?.notes ?? null);
  if (venueText) {
    out.push({ source: "venue", label: "Venue", text: venueText });
  }

  for (const h of data.hotelReservations) {
    const text = notesText(h.notes);
    if (!text) continue;
    const name = nonEmpty(h.hotel_name);
    out.push({ source: "hotel", label: name ? `Hotel: ${name}` : "Hotel", text });
  }

  for (const r of data.rooms) {
    const text = notesText(r.notes);
    if (!text) continue;
    const name = nonEmpty(r.name);
    out.push({ source: "room", label: name ? `Room: ${name}` : "Room", text });
  }

  if (includeTransport && data.transportation) {
    const text = notesText(data.transportation.notes);
    if (text) {
      out.push({ source: "transport", label: "Transport", text });
    }
  }

  for (const c of data.contacts) {
    const text = notesText(c.notes);
    if (!text) continue;
    const name = nonEmpty(c.name);
    out.push({ source: "contact", label: name ? `Contact: ${name}` : "Contact", text });
  }

  return out;
}

/** Truncate on codepoint count; single Unicode ellipsis (NotesTile.tsx:184-187). */
export function truncateNote(text: string, max: number): { display: string; truncated: boolean } {
  if (text.length <= max) return { display: text, truncated: false };
  return { display: `${text.slice(0, max - 1).trimEnd()}…`, truncated: true };
}

/** `KeyValueRows`' own hiding rule: a sentinel/empty value renders no row. */
const rendersRow = (row: KeyValueRow): boolean => !shouldHideGenericOptional(row.v);

/** Gives each row `KeyValueRows` will render its search entry and target id. */
function withKeyValueTargets(sink: EntrySink, group: string, rows: KeyValueRow[]): KeyValueRow[] {
  return rows.map((row) => {
    if (!rendersRow(row)) return row;
    const id = addEntry(sink, { group, label: row.k, value: row.v });
    return id !== undefined ? { ...row, searchTarget: id } : row;
  });
}

type Person = Parameters<typeof personRowDisplay>[0];

export type TodayModel = {
  todayIso: string;
  /** Mode A (§5): the bare key-times strip plus the run-of-show card. */
  modeA: boolean;
  transportVisible: boolean;
  anchors: KeyTimeAnchors;
  anchorsPresent: boolean;
  keyTimeTargets: Record<string, string>;
  /** The Tonight card's rows (with targets); null renders no card. */
  tonightRows: KeyValueRow[] | null;
  whereRows: KeyValueRow[] | null;
  contact: Person | null;
  /** The dress code value DressCodeLines renders, with one target per line it renders. */
  dress: { value: string; targets: (string | undefined)[] } | null;
  noteRows: (NotesEntry & { display: string; truncated: boolean; target: string | undefined })[];
  notesOverflow: number;
  /** Mode A's run of show: the merged timeline when today has agenda sessions, else the list. */
  runOfShow:
    | { kind: "timeline"; items: TimelineItem[]; targets: (string | undefined)[] }
    | { kind: "list"; entries: AgendaEntry[]; targets: (string | undefined)[] }
    | null;
  /** Every Today search entry, in render order. */
  entries: SearchEntry[];
};

/**
 * Everything the Today section renders below `RightNowHero`, with its search
 * entries. `ctx` is the section's `resolveViewerContext` result (resolved
 * outside the section's error boundary, where a malformed projection throws).
 */
export function todayRows(data: ShowForViewer, ctx: ViewerContext, today: Date): TodayModel {
  // ── Mode A gate (the today-only run-of-show fork; §5). ────────────
  // The Today run-of-show timeline is a NEW data surface that MUST
  // enforce the IDENTICAL date-restriction trust boundary as
  // ScheduleSection — via the SAME shared code path, never a
  // re-implemented predicate.
  //
  //   - unknown_asterisk → ZERO leak: the *** marker is the operator's
  //     "haven't told us yet" signal. NO timeline, NO show-day text →
  //     Mode B (identical to ScheduleSection.tsx unknown_asterisk arm).
  //   - todayIso is the SHOW-tz date (todayIsoInShowTimezone) — NEVER
  //     new Date()/UTC. Around tz midnight the wrong run-of-show day
  //     must not show, and a date-restricted viewer must not see the
  //     NEXT day's agenda before it is actually that day in the show tz.
  //   - isShowDay: todayIso ∈ aggregateDays(dates) (Codex plan R1 HIGH)
  //     — guards a stale/off-aggregate runOfShow key whose date is not
  //     one of THIS show's days.
  //   - eligible: kind==='none' OR (kind==='explicit' AND days has
  //     todayIso) — the SAME rule Schedule uses to intersect.
  //   - todays: displayableEntries(...) — the SAME leak-critical filter
  //     (URL-only/sentinel titles never occupy a row).
  //
  // Mode A iff isShowDay && eligible && (todays.length > 0 ||
  // agendaToday.length > 0) — the unified timeline also activates on an
  // agenda-only show day. Fail-closed: any ambiguity (unknown_asterisk,
  // not a show day, ineligible, no crew AND no agenda) → Mode B
  // (the full-width stack, unchanged).
  const dateRestriction = ctx.dateRestriction;
  const todayIso = todayIsoInShowTimezone(data.show, today);
  const isShowDay = aggregateDays(data.show.dates).some((d) => d.date === todayIso);
  const eligible =
    dateRestriction.kind === "none" ||
    (dateRestriction.kind === "explicit" && new Set(dateRestriction.days).has(todayIso));
  // §9.6 load-out trust boundary — computed BEFORE `todays` so the Mode-A
  // gate and the rendered list are the SAME post-gate set: a viewer whose
  // only today entry is a gated-out load-out falls to Mode B (no empty
  // run-of-show). Also reused below for the 5-source notes transport gate.
  const transportVisible = transportTileVisible({
    transportation: data.transportation,
    viewerId: data.viewerId,
    transportationOwnerIds: data.transportationOwnerIds,
    viewerName: data.viewerName,
    viewerNameAliases: data.viewerNameAliases,
    isAdmin: ctx.isAdmin,
  });
  const todays = suppressesDates(dateRestriction)
    ? []
    : scheduleEntriesForViewer(data.runOfShow?.[todayIso]?.entries, { transportVisible });
  // Unified show-day timeline: today's PLACEABLE agenda sessions (high-conf,
  // day-matched, aggregated across links). agendaToday.length>0 activates the merge.
  const agendaToday: AgendaSession[] = agendaSessionsForToday(
    data.show.agenda_links ?? [],
    data.show.dates.showDays ?? [],
    todayIso,
  );
  const modeA = isShowDay && eligible && (todays.length > 0 || agendaToday.length > 0);

  // Today shows ONLY today's Show anchor — the full per-day breakdown
  // belongs in Schedule (§5.4 / D6). set/strike are SHOW-WIDE milestones
  // (§13.8) → pass through untouched. unknown_asterisk → resolveKeyTimes
  // returns {} (§5.1) → all anchors absent → no strip / no card / no leak.
  const resolved = resolveKeyTimes(
    data.show,
    data.rooms,
    data.runOfShow ?? null,
    ctx.dateRestriction,
    ctx.stageRestriction, // #248 — off-stage Set/Strike gating
  );
  const anchors: KeyTimeAnchors = {
    ...(resolved.set != null ? { set: resolved.set } : {}),
    ...(resolved.strike != null ? { strike: resolved.strike } : {}),
    ...((resolved.shows ?? []).some((s) => s.date === todayIso)
      ? { shows: resolved.shows!.filter((s) => s.date === todayIso) }
      : {}),
  };
  // Mirrors KeyTimesStrip's own all-absent → null rule, so the "Key times"
  // card never wraps an empty strip.
  const anchorsPresent =
    anchors.set != null ||
    (anchors.shows != null && anchors.shows.length > 0) ||
    anchors.strike != null;

  const firstHotel = data.hotelReservations[0] ?? null;
  // Tonight uses the 2-up grid (columns={2} on the card): the Hotel headline
  // spans both columns (`span: 2`) so the name sits full width above Check in |
  // Check out. BL-CREW-UNKNOWN-ASTERISK-TODAY-DATES: an `unknown_asterisk`
  // viewer's days are unconfirmed, and a hotel check-in date IS the travel-in
  // date, so this card drops both dates for them. The NAME stays, and the Hotel
  // row KEEPS `span: 2` when it is alone ("occupy both columns",
  // KeyValueRows.tsx:38), so the lone row is full-width at >=720px.
  const hideDates = suppressesDates(dateRestriction);
  const rawTonightRows: KeyValueRow[] | null = firstHotel
    ? hideDates
      ? [{ k: "Hotel", v: firstHotel.hotel_name ?? "", span: 2 as const }]
      : [
          { k: "Hotel", v: firstHotel.hotel_name ?? "", span: 2 },
          { k: "Check in", v: firstHotel.check_in ?? "" },
          { k: "Check out", v: firstHotel.check_out ?? "" },
        ]
    : null;

  // Venue / City / Address as discrete rows. venueDisplay resolves the city
  // (geocoded → structured-address → trailing-known-city in the NAME) and
  // returns the name with a redundant trailing city stripped, so a blank-address
  // FXAV venue ("Four Seasons Hotel Chicago") still shows a clean "Chicago" City
  // row without printing the city twice. streetFromAddress drops the city tail
  // from the Address value for the same reason; an empty street reflows the
  // Address row out (KeyValueRows sentinel-hides empty values).
  const venue = data.show.venue;
  const { name: venueDisplayName, city: venueCity } = venueDisplay(venue);
  const rawWhereRows: KeyValueRow[] | null = venue
    ? [
        { k: "Venue", v: venueDisplayName ?? venue.name ?? "" },
        ...(venueCity ? [{ k: "City", v: venueCity } as KeyValueRow] : []),
        { k: "Address", v: streetFromAddress(venue.address, venueCity) ?? "" },
        // Read-site sentinel guard (matches VenueSection's loadingDock contract):
        // a "TBD"/"N/A" sentinel must reflow out at the READ site, not only at
        // KeyValueRows render time, so the sentinel-hiding meta-test surface holds.
        ...(shouldHideGenericOptional(venue.loadingDock ?? null)
          ? []
          : [{ k: "Loading dock", v: venue.loadingDock! } as KeyValueRow]),
      ]
    : null;

  const primaryContact = selectPrimaryContact(data.contacts);

  // Dress code — read the single canonical `dress_code` key (M4-D1). The
  // VALUE-level sentinel guard stays: a canonical `dress_code:"N/A"` must still
  // reflow the block out.
  const dressValue = data.show.event_details.dress_code ?? null;
  const dressRaw = shouldHideGenericOptional(dressValue) ? null : dressValue;

  // 5-source notes — transport source gated on transportTileVisible (the gate
  // uses the projection's `viewerName`, per the NotesTile transport contract).
  const noteEntries = aggregateNotes(data, transportVisible);
  const visibleNotes = noteEntries.slice(0, SOURCE_CAP);
  const notesOverflow = Math.max(0, noteEntries.length - SOURCE_CAP);

  // ── Search entries, card by card. ──
  const keyTimes = modeA
    ? keyTimeEntries("today", "none", "", anchors)
    : anchorsPresent
      ? keyTimeEntries("today", "today-key-times", TODAY_TITLES.keyTimes, anchors)
      : { targets: {}, entries: [] };

  const tonightSink = entrySink("today", "today-tonight");
  const tonightRows =
    rawTonightRows && withKeyValueTargets(tonightSink, TODAY_TITLES.tonight, rawTonightRows);
  const whereSink = entrySink("today", "today-where");
  const whereRows =
    rawWhereRows && withKeyValueTargets(whereSink, TODAY_TITLES.where, rawWhereRows);

  const contactSink = entrySink("today", "today-contact");
  let contact: Person | null = null;
  if (primaryContact) {
    const person: Person = {
      ...(primaryContact.name != null ? { name: primaryContact.name } : {}),
      fallbackLabel: primaryContact.kind === "in_house_av" ? "In-house AV" : "Venue contact",
      ...(primaryContact.phone != null ? { phone: primaryContact.phone } : {}),
      ...(primaryContact.email != null ? { email: primaryContact.email } : {}),
      primary: true,
    };
    const shown = personRowDisplay(person);
    // The identity line: the heading and its "Primary" chip. No role or notes are passed.
    const identity =
      shown.rendered && shown.heading !== undefined
        ? addEntry(contactSink, {
            group: TODAY_TITLES.contact,
            value: shown.heading,
            context: ["Primary"],
          })
        : undefined;
    contact = identity !== undefined ? { ...person, searchTarget: { identity } } : person;
  }

  const dressSink = entrySink("today", "today-dress");
  let dress: TodayModel["dress"] = null;
  if (dressRaw !== null) {
    const lines = parseDressCodeLines(dressRaw);
    const targets =
      lines === null
        ? [addEntry(dressSink, { group: TODAY_TITLES.dress, value: dressRaw })]
        : lines.map(({ phase, attire }) =>
            addEntry(dressSink, { group: TODAY_TITLES.dress, label: phase, value: attire }),
          );
    dress = { value: dressRaw, targets };
  }

  const notesSink = entrySink("today", "today-notes");
  const noteRows = visibleNotes.map((entry) => ({
    ...entry,
    ...truncateNote(entry.text, TRUNCATE_AT),
    // The note's label and its FULL text; a truncated note's cut preview is skipped.
    target: addEntry(notesSink, {
      group: TODAY_TITLES.showNotes,
      label: entry.label,
      value: entry.text,
    }),
  }));

  const rosSink = entrySink("today", "today-run-of-show");
  let runOfShow: TodayModel["runOfShow"] = null;
  if (modeA) {
    if (agendaToday.length > 0) {
      const items = buildShowDayTimeline(todays, agendaToday);
      const targets = capTimelineItems(items).kept.map((it) => {
        if (it.source === "crew") {
          const line = runOfShowEntryLine(it.entry);
          return addEntry(rosSink, {
            group: TODAY_TITLES.runOfShow,
            label: line.timeLabel,
            value: line.title,
            context: [line.room, line.av],
          });
        }
        const { time, title, room } = agendaSessionRowLine(it.session);
        return addEntry(rosSink, {
          group: TODAY_TITLES.runOfShow,
          label: title !== "" ? time : null,
          value: title !== "" ? title : time,
          context: [room],
        });
      });
      runOfShow = { kind: "timeline", items, targets };
    } else {
      const targets = addRunOfShowEntries(rosSink, TODAY_TITLES.runOfShow, todays);
      runOfShow = { kind: "list", entries: todays, targets };
    }
  }

  // Render order: Mode A puts the strip, then the run of show beside the quick
  // cards, then dress and notes; every other mode puts the day-context column
  // (key times, dress, notes) before the quick cards.
  const quick = [...tonightSink.entries, ...whereSink.entries, ...contactSink.entries];
  const dayContext = [...dressSink.entries, ...notesSink.entries];
  const entries = modeA
    ? [...keyTimes.entries, ...rosSink.entries, ...quick, ...dayContext]
    : [...keyTimes.entries, ...dayContext, ...quick];

  return {
    todayIso,
    modeA,
    transportVisible,
    anchors,
    anchorsPresent,
    keyTimeTargets: keyTimes.targets,
    tonightRows,
    whereRows,
    contact,
    dress,
    noteRows,
    notesOverflow,
    runOfShow,
    entries,
  };
}
