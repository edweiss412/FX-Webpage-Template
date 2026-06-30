import type { JSX } from "react";
import { RunOfShowEntry } from "@/components/crew/primitives/RunOfShowList";
import type { AgendaSession } from "@/lib/agenda/types";
import { RUN_OF_SHOW_DISPLAY_CAP, resolveOptionalField } from "@/lib/crew/agendaDisplay";
import type { TimelineItem } from "@/lib/crew/showDayTimeline";

/** A muted "event" row for a PDF agenda session — DISTINCT from the muted SYNTHETIC
 *  crew row (which uses a leading hairline `border-l`): the agenda row carries a small
 *  "Agenda" event eyebrow instead. Renders the full `session.time` string verbatim;
 *  tracks + drift are never read (D7). */
function AgendaSessionRow({ session }: { session: AgendaSession }): JSX.Element {
  // AgendaSession.room is `string | null`; resolveOptionalField takes `string | undefined`.
  // Under exactOptionalPropertyTypes, coerce null→undefined (mirrors ScheduleSection.tsx:262).
  const room = resolveOptionalField(session.room ?? undefined);
  return (
    <li data-testid="timeline-agenda-session" className="flex min-w-0 flex-col gap-0.5 py-1">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-xs font-semibold tabular-nums text-text-subtle">{session.time}</span>
        <span
          data-agenda-field="event"
          className="shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-eyebrow text-text-subtle"
        >
          Agenda
        </span>
        {session.title ? (
          <span className="min-w-0 text-sm font-medium text-text-subtle">{session.title}</span>
        ) : null}
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
export function ShowDayTimelineList({ items, isoDate }: { items: TimelineItem[]; isoDate: string }): JSX.Element {
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
  return (
    <div data-testid={`show-day-timeline-${isoDate}`} className="mt-2 flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {kept.map((it, i) =>
          it.source === "crew" ? (
            <RunOfShowEntry key={`c${i}`} entry={it.entry} />
          ) : (
            <AgendaSessionRow key={`a${i}`} session={it.session} />
          ),
        )}
      </ul>
      {dropped > 0 ? (
        <p data-testid="timeline-agenda-overflow" className="mt-1 text-xs text-text-subtle">
          {`…and ${dropped} more agenda item${dropped === 1 ? "" : "s"}`}
        </p>
      ) : null}
    </div>
  );
}
