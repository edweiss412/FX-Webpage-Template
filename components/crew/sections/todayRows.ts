/**
 * components/crew/sections/todayRows.ts — the home body's derivations, shared
 * by `HomeSection` and the Today search builder (lib/search/sections/today.ts),
 * so the page and the search index describe the same lines (spec §2.4, INV-1).
 *
 * `todayRows` returns the show notes and the Dress code card the home renders
 * below the quick facts, with each line's search target id and the search
 * entries in render order. Each card is its own search region (its
 * `data-card-id`). The home's other pieces carry their own lines: the run-of-show
 * card's come from lib/crew/runOfShowCard.ts, the pass is not indexed, and the
 * quick facts sit outside search coverage, because every fact repeats a line its
 * own section renders (crew page redesign plan Task 11, which retired Today's
 * Tonight, Where, Need something and Key times cards).
 *
 * The whole home body sits inside one `WrappedSection`: a throw here renders the
 * fallback and the builder contributes nothing.
 *
 * A non-client module: the builder runs on the server and imports from here.
 */
import { addEntry, entrySink } from "@/components/crew/sections/scheduleRows";
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { ViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

// Ported from NotesTile.tsx (:57-58) — the 5-source caps, exported for lib/search.
export const TRUNCATE_AT = 280;
export const SOURCE_CAP = 8;

/** Card titles, which are also the search groups of their lines. */
export const TODAY_TITLES = {
  dress: "Dress code",
  showNotes: "Show notes",
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

export type TodayModel = {
  transportVisible: boolean;
  /** The dress code value DressCodeLines renders, with one target per line it renders. */
  dress: { value: string; targets: (string | undefined)[] } | null;
  noteRows: (NotesEntry & { display: string; truncated: boolean; target: string | undefined })[];
  notesOverflow: number;
  /** Every search entry of this body, in render order (show notes, then the dress code). */
  entries: SearchEntry[];
};

/**
 * The home body's show notes and Dress code card, with their search entries.
 * `ctx` is the section's `resolveViewerContext` result (resolved outside the
 * section's error boundary, where a malformed projection throws).
 */
export function todayRows(data: ShowForViewer, ctx: ViewerContext): TodayModel {
  // The transport gate: the 5-source notes' transport source (the gate uses the
  // projection's `viewerName`, per the NotesTile transport contract).
  const transportVisible = transportTileVisible({
    transportation: data.transportation,
    viewerId: data.viewerId,
    transportationOwnerIds: data.transportationOwnerIds,
    viewerName: data.viewerName,
    viewerNameAliases: data.viewerNameAliases,
    isAdmin: ctx.isAdmin,
  });

  // Dress code: the single canonical `dress_code` key (M4-D1). The VALUE-level
  // sentinel guard stays: a canonical `dress_code:"N/A"` must still reflow the
  // card out.
  const dressValue = data.show.event_details.dress_code ?? null;
  const dressRaw = shouldHideGenericOptional(dressValue) ? null : dressValue;

  const noteEntries = aggregateNotes(data, transportVisible);
  const visibleNotes = noteEntries.slice(0, SOURCE_CAP);
  const notesOverflow = Math.max(0, noteEntries.length - SOURCE_CAP);

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

  // Render order: show notes, then the Dress code card (spec §3.2, AC-1).
  const entries = [...notesSink.entries, ...dressSink.entries];

  return { transportVisible, dress, noteRows, notesOverflow, entries };
}
