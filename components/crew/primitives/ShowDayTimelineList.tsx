import type { JSX } from "react";
import { NextMarker, RunOfShowEntry } from "@/components/crew/primitives/RunOfShowList";
import type { AgendaSession } from "@/lib/agenda/types";
import { RUN_OF_SHOW_DISPLAY_CAP, resolveOptionalField } from "@/lib/crew/agendaDisplay";
import type { TimelineItem } from "@/lib/crew/showDayTimeline";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

/** A muted "event" row for a PDF agenda session — DISTINCT from the muted SYNTHETIC
 *  crew row (which uses a leading hairline `border-l`): the agenda row carries a small
 *  "Agenda" event eyebrow instead. Renders the full `session.time` string verbatim;
 *  tracks + drift are never read (D7). */
function AgendaSessionRow({
  session,
  searchTarget,
  next,
}: {
  session: AgendaSession;
  searchTarget: string | undefined;
  /** The crew home's run card marks the next row (crew page redesign spec §4.4). */
  next: boolean;
}): JSX.Element {
  const { time, title, room } = agendaSessionRowLine(session);
  return (
    <li
      data-testid="timeline-agenda-session"
      data-search-target={searchTarget}
      className="flex min-w-0 flex-col gap-0.5 py-1"
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-xs font-semibold tabular-nums text-text-subtle">{time}</span>
        <span
          data-agenda-field="event"
          // The "Agenda" eyebrow marks the row's source; it is not sheet data.
          data-search-skip={searchTarget !== undefined ? "" : undefined}
          className="shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium uppercase tracking-eyebrow text-text-subtle"
        >
          Agenda
        </span>
        {title ? (
          <span className="min-w-0 wrap-break-word text-sm font-medium text-text-subtle">
            {title}
          </span>
        ) : null}
        {next ? <NextMarker /> : null}
      </div>
      {room ? <div className="text-xs text-text-subtle">{room}</div> : null}
    </li>
  );
}

const isSynthetic = (i: TimelineItem): boolean =>
  i.source === "crew" && (i.entry.kind === "strike" || i.entry.kind === "loadout");

/** Render the discriminated, sorted timeline. Synthetic crew rows (strike/loadout) are
 *  EXEMPT from the cap and stay in their chronological position; the non-synthetic content
 *  (crew-agenda + PDF-agenda) is capped at RUN_OF_SHOW_DISPLAY_CAP with an overflow stub. */
export function ShowDayTimelineList({
  items,
  isoDate,
  searchTargets,
  nextIndex,
}: {
  items: TimelineItem[];
  isoDate: string;
  /**
   * Search target ids, one per rendered row in render order (`capTimelineItems(items).kept`).
   * Absent renders no search markers.
   */
  searchTargets?: readonly (string | undefined)[];
  /** The row, in render order, that carries the run card's "Next" marker; absent marks none. */
  nextIndex?: number;
}): JSX.Element {
  const { kept, dropped } = capTimelineItems(items);
  return (
    <div data-testid={`show-day-timeline-${isoDate}`} className="mt-2 flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {kept.map((it, i) => {
          const target = searchTargets?.[i];
          return it.source === "crew" ? (
            <RunOfShowEntry
              key={`c${i}`}
              entry={it.entry}
              next={nextIndex === i}
              {...(target !== undefined ? { searchTarget: target } : {})}
            />
          ) : (
            <AgendaSessionRow
              key={`a${i}`}
              session={it.session}
              searchTarget={target}
              next={nextIndex === i}
            />
          );
        })}
      </ul>
      {dropped > 0 ? (
        <p
          data-testid="timeline-agenda-overflow"
          data-search-skip={searchTargets !== undefined ? "" : undefined}
          className="mt-1 text-xs text-text-subtle"
        >
          {/* Source-accurate noun: the capped non-synthetic content is crew-agenda rows
              AND PDF-agenda rows, so "items" (not "agenda items") — a dropped crew row
              must not read as merely "agenda". */}
          {`…and ${dropped} more item${dropped === 1 ? "" : "s"}`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The rows the timeline renders, in render order. Synthetic crew rows
 * (strike/loadout) are EXEMPT from the cap and stay in their chronological
 * position; the non-synthetic content (crew-agenda + PDF-agenda) is capped at
 * RUN_OF_SHOW_DISPLAY_CAP. Shared with the search builders so entry order
 * matches row order.
 */
export function capTimelineItems(items: TimelineItem[]): { kept: TimelineItem[]; dropped: number } {
  let nonSynthShown = 0;
  let dropped = 0;
  const kept: TimelineItem[] = [];
  for (const it of items) {
    if (isSynthetic(it)) {
      kept.push(it);
      continue;
    }
    if (nonSynthShown < RUN_OF_SHOW_DISPLAY_CAP) {
      kept.push(it);
      nonSynthShown++;
    } else {
      dropped++;
    }
  }
  return { kept, dropped };
}

/** An agenda session row's display fields; shared with the search builders. */
export function agendaSessionRowLine(session: AgendaSession): {
  time: string;
  title: string;
  room: string | null;
} {
  // AgendaSession.room is `string | null`; resolveOptionalField takes `string | undefined`.
  // Under exactOptionalPropertyTypes, coerce null→undefined (mirrors ScheduleSection.tsx:262).
  const room = resolveOptionalField(session.room ?? undefined);
  // URL-strip the title (a PDF-extracted title could carry a pasted link) — the same
  // treatment crew titles get (RunOfShowEntry). A null/empty result drops the title cell.
  const title = session.title ? stripAgendaUrls(session.title) : "";
  return { time: session.time, title, room };
}
