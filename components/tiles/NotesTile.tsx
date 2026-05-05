/**
 * components/tiles/NotesTile.tsx: "Things to know" aggregation tile
 * (M4 Task 4.10; spec §8.1).
 *
 * Aggregates every block-level `notes` field across the show into a
 * single tile so crew don't have to hunt through Lodging / Venue /
 * Contacts / Transport tiles to surface the prose Doug left behind.
 *
 * Sources (every nullable string `notes` field on the projection):
 *   - `show.venue?.notes`                       label: "Venue"
 *   - `hotelReservations[*].notes`              label: "Hotel: <hotel_name>"
 *   - `rooms[*].notes`                          label: "Room: <name>"
 *   - `transportation?.notes`                   label: "Transport"
 *   - `contacts[*].notes`                       label: "Contact: <name>"
 *
 * Source order: venue, hotel, room, transport, contact (the same order
 * a crew member encounters them on the show day, top to bottom). Within
 * a source class, the projection order is preserved.
 *
 * Whole-tile-missing (§8.3, returns null):
 *   - Zero non-null/non-empty notes anywhere → tile reflows out.
 *
 * Truncation:
 *   - Per-source items truncated at 280 chars (dispatch instructions);
 *     the truncated head is the <summary>, the full text is the
 *     <details> body. Items at or below 280 chars render the full text
 *     in <summary> with no <details> body, but to keep the tap target
 *     consistent we still wrap them in <details> with the same body
 *     marker. Items that DO get truncated carry
 *     data-testid="notes-item-truncated" so the e2e spec can pin them.
 *
 * Cardinality cap:
 *   - 8 sources rendered inline. Beyond that, render a "+N more notes"
 *     stub (data-testid="notes-overflow-stub"). Same M4-static pattern as
 *     PackListTile; M9 polish may upgrade to a client expand.
 *
 * Tap-to-expand:
 *   - Native <details>/<summary>. 44px tap-min on the summary. No
 *     client island; the browser handles keyboard / screen reader
 *     toggling natively.
 *
 * data-testid markers:
 *   - notes-tile, notes-item, notes-item-truncated, notes-overflow-stub.
 *
 * Server Component (no `'use client'`).
 */
import type {
  ContactRow,
  HotelReservationRow,
  RoomRow,
  ShowRow,
  TransportationRow,
} from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

const TRUNCATE_AT = 280;
const SOURCE_CAP = 8;

type NotesEntry = {
  source: "venue" | "hotel" | "room" | "transport" | "contact";
  /**
   * Display label rendered as the source attribution. Always populated;
   * if the underlying source has no name (e.g., a hotel without
   * hotel_name), the label falls back to the source class only.
   */
  label: string;
  /** Full notes text. Caller has already filtered null/whitespace. */
  text: string;
};

type NotesTileProps = {
  show: Pick<ShowRow, "venue">;
  hotelReservations: HotelReservationRow[];
  rooms: RoomRow[];
  transportation: TransportationRow | null;
  contacts: ContactRow[];
};

/**
 * Identity-field "non-empty" predicate. Treats null/undefined/
 * whitespace-only as missing — used for labels like `hotel_name`,
 * room `name`, contact `name`. These are identity fields, NOT
 * generic-optional sentinels (per §8.3 + Codex round-10 finding) —
 * a hotel literally named "TBD" is rare but valid, and a room
 * named "N/A" is identifying, so we keep raw truthiness here.
 */
function nonEmpty(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

/**
 * Notes-text predicate. Per §8.3, generic optional text fields
 * (notes columns across every M4 tile) must hide null/empty/
 * whitespace AND the universally-meaningless sentinels
 * `'TBD' / 'N/A' / 'TBA'` (case-insensitive after trim). Routes
 * through `lib/visibility/emptyState.ts:shouldHideGenericOptional`
 * — the central predicate table that prevents per-tile sentinel
 * drift. See lib/visibility/emptyState.ts:27-29 for the
 * single-source-of-truth contract.
 */
function notesText(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  if (shouldHideGenericOptional(s)) return null;
  return s.trim();
}

/**
 * Aggregate every notes source into a flat ordered list. The order
 * mirrors the crew member's mental traversal of a show day: venue →
 * hotel → room → transport → contacts. Within each source class the
 * input order is preserved.
 */
function aggregateNotes(
  show: Pick<ShowRow, "venue">,
  hotels: HotelReservationRow[],
  rooms: RoomRow[],
  transportation: TransportationRow | null,
  contacts: ContactRow[],
): NotesEntry[] {
  const out: NotesEntry[] = [];

  // notes text → §8.3 generic-optional predicate (sentinels hidden).
  // labels (hotel_name, room.name, contact.name) → identity fields,
  // raw truthiness via nonEmpty().
  const venueText = notesText(show.venue?.notes ?? null);
  if (venueText) {
    out.push({ source: "venue", label: "Venue", text: venueText });
  }

  for (const h of hotels) {
    const text = notesText(h.notes);
    if (!text) continue;
    const name = nonEmpty(h.hotel_name);
    out.push({
      source: "hotel",
      label: name ? `Hotel: ${name}` : "Hotel",
      text,
    });
  }

  for (const r of rooms) {
    const text = notesText(r.notes);
    if (!text) continue;
    const name = nonEmpty(r.name);
    out.push({
      source: "room",
      label: name ? `Room: ${name}` : "Room",
      text,
    });
  }

  if (transportation) {
    const text = notesText(transportation.notes);
    if (text) {
      out.push({ source: "transport", label: "Transport", text });
    }
  }

  for (const c of contacts) {
    const text = notesText(c.notes);
    if (!text) continue;
    const name = nonEmpty(c.name);
    out.push({
      source: "contact",
      label: name ? `Contact: ${name}` : "Contact",
      text,
    });
  }

  return out;
}

/**
 * Truncate `text` to at most `max` characters; if shorter, return as-is
 * and signal `truncated: false`. The truncated form ends with an
 * ellipsis character (single Unicode ellipsis, not three periods, per
 * DESIGN.md anti-pattern list, "no em dashes"). Truncation is on
 * codepoint count rather than grapheme count; sufficient for the
 * domestic-US English copy that flows through these notes.
 */
function truncate(text: string, max: number): { display: string; truncated: boolean } {
  if (text.length <= max) return { display: text, truncated: false };
  return { display: `${text.slice(0, max - 1).trimEnd()}…`, truncated: true };
}

export function NotesTile({
  show,
  hotelReservations,
  rooms,
  transportation,
  contacts,
}: NotesTileProps) {
  const entries = aggregateNotes(
    show,
    hotelReservations,
    rooms,
    transportation,
    contacts,
  );

  // §8.3 whole-tile-missing: zero notes anywhere reflows out.
  if (entries.length === 0) return null;

  const visible = entries.slice(0, SOURCE_CAP);
  const overflowCount = Math.max(0, entries.length - SOURCE_CAP);

  return (
    <Section
      testId="notes-tile"
      heading="Things to know"
      headingTone="eyebrow"
      variant="reference"
      ariaLabel="Things to know"
      bodyAs="div"
    >
      <ul className="flex flex-1 flex-col gap-2">
        {visible.map((entry, idx) => {
          const { display, truncated } = truncate(entry.text, TRUNCATE_AT);
          return (
            <li
              key={`${entry.source}-${idx}`}
              data-testid="notes-item"
              data-source={entry.source}
              {...(truncated ? { "data-truncated": "true" } : {})}
              className="rounded-sm border border-border bg-surface"
            >
              <details className="group">
                <summary
                  className={[
                    "flex min-h-tap-min cursor-pointer list-none",
                    "flex-col gap-1 px-3 py-2",
                    "rounded-sm",
                    "[&::-webkit-details-marker]:hidden",
                  ].join(" ")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
                      {entry.label}
                    </span>
                    {truncated ? (
                      <span
                        data-testid="notes-item-truncated"
                        className={[
                          "text-xs font-medium text-text-faint",
                          "transition-opacity duration-fast",
                          "group-open:opacity-0",
                        ].join(" ")}
                      >
                        Tap to expand
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={[
                      "text-sm leading-snug text-text",
                      // Hide the truncated head when the details are
                      // open (the full body below replaces it). Pure
                      // CSS via the open: variant.
                      truncated ? "group-open:hidden" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {display}
                  </span>
                </summary>
                {truncated ? (
                  <div
                    className={[
                      "border-t border-border",
                      "px-3 py-3",
                      "text-sm leading-relaxed text-text",
                      "whitespace-pre-wrap",
                    ].join(" ")}
                  >
                    {entry.text}
                  </div>
                ) : null}
              </details>
            </li>
          );
        })}
      </ul>

      {overflowCount > 0 ? (
        <div
          data-testid="notes-overflow-stub"
          className="rounded-sm bg-surface-sunken px-3 py-2 text-sm text-text-subtle"
        >
          <span className="tabular-nums">+{overflowCount}</span>{" "}
          {overflowCount === 1 ? "more note" : "more notes"} on the source
          sheet
        </div>
      ) : null}
    </Section>
  );
}
