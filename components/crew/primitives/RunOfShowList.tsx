/**
 * components/crew/primitives/RunOfShowList.tsx — per-day run-of-show list +
 * single-entry row, extracted verbatim from ScheduleSection.tsx so the crew
 * Today surface (Task 9) and the Schedule surface (Task 3) render the SAME
 * run-of-show rows from the SAME shared display predicates
 * (@/lib/crew/agendaDisplay).
 *
 * Pure move — behavior identical.
 */
import type { JSX } from "react";

import type { AgendaEntry } from "@/lib/parser/types";
import {
  displayableEntries,
  RUN_OF_SHOW_DISPLAY_CAP,
  resolveOptionalField,
  TITLE_TRUNCATE_AT,
} from "@/lib/crew/agendaDisplay";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

/**
 * One run-of-show row (spec §4.3 shape). Surfaces ALL six AgendaEntry fields:
 * the time group `START–FINISH · TRT` (each part sentinel-guarded), the required
 * real TITLE, then the ROOM + AV-badge metadata when present.
 */
export function RunOfShowEntry({ entry }: { entry: AgendaEntry }): JSX.Element {
  // Title is URL-stripped (free text could paste a link). The caller only passes
  // DISPLAYABLE entries (isDisplayableEntry — stripped title is real), so the
  // stripped title here is guaranteed non-empty and renders. A title strictly
  // longer than TITLE_TRUNCATE_AT chars (> 80; exactly 80 is plain) collapses into
  // a <details> — the <summary> shows the first 80 chars + an ellipsis, the
  // expandable body preserves the full text (nothing is lost).
  const title = stripAgendaUrls(entry.title);
  const isLong = title.length > TITLE_TRUNCATE_AT;
  const start = resolveOptionalField(entry.start) ?? "";
  const finish = resolveOptionalField(entry.finish);
  const trt = resolveOptionalField(entry.trt);
  const room = resolveOptionalField(entry.room);
  const av = resolveOptionalField(entry.av);
  // Synthetic-entry treatment (spec §9.3): strike/load-out read as production
  // milestones via the §9.3 "muted-title" option — the title itself renders in a
  // muted tone (text-text-subtle vs the agenda row's text-text-strong) with a
  // leading hairline rule, NOT a kind-word badge. A badge would duplicate the
  // title's own leading word ("STRIKE" badge + "Strike — …" title = a redundant
  // double-read). Agenda entries (kind absent/"agenda") render unchanged.
  const isSynthetic = entry.kind === "strike" || entry.kind === "loadout";
  const titleTone = isSynthetic ? "text-text-subtle" : "text-text-strong";
  // Time group (spec §4.3 row shape): START–FINISH with the TRT duration as a
  // middot-joined suffix when present (e.g. "7:15 AM–7:30 AM · 0:15"). Each part
  // is sentinel-guarded via resolveOptionalField, so a TBD/blank trt/finish drops
  // out without leaving an orphan separator.
  const range = finish ? `${start}–${finish}` : start;
  const timeLabel = trt ? (range ? `${range} · ${trt}` : trt) : range;

  return (
    <li
      data-testid="agenda-entry"
      data-entry-kind={isSynthetic ? entry.kind : undefined}
      className="flex flex-col gap-0.5 py-1"
    >
      <div className="flex items-baseline gap-2">
        {timeLabel ? (
          <span
            data-agenda-field="time"
            className="shrink-0 text-xs font-semibold tabular-nums text-text-subtle"
          >
            {timeLabel}
          </span>
        ) : null}
        {/* Title cell (the flexible track): on a synthetic entry the title itself
            carries the muted tone + a leading hairline rule (§9.3 "muted-title"
            option — no kind-word badge), so it reads as a milestone without
            repeating its own leading word. The rule lives inside the title cell,
            never as its own column — so it can't break the time/title two-track read. */}
        <div
          className={`flex min-w-0 items-baseline gap-2${
            isSynthetic ? " border-l border-border pl-2" : ""
          }`}
        >
          {isLong ? (
            <details data-testid="agenda-title-truncated" className="min-w-0">
              <summary
                className={`cursor-pointer list-none text-sm font-medium ${titleTone} [&::-webkit-details-marker]:hidden`}
              >
                {`${title.slice(0, TITLE_TRUNCATE_AT)}…`}
              </summary>
              <span className={`text-sm ${titleTone}`}>{title}</span>
            </details>
          ) : (
            <span className={`min-w-0 text-sm font-medium ${titleTone}`}>{title}</span>
          )}
        </div>
      </div>
      {room || av ? (
        <div className="flex items-center gap-2 text-xs text-text-subtle">
          {room ? <span data-agenda-field="room">{room}</span> : null}
          {av ? (
            <span
              data-agenda-field="av"
              className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-medium uppercase tracking-eyebrow"
            >
              {av}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Per-day run-of-show list. Renders the DISPLAYABLE entries (stripped-title-real)
 * in sheet order, capped at RUN_OF_SHOW_DISPLAY_CAP. The caller already gates on
 * displayableEntries(...).length > 0, so `display` here is non-empty.
 *
 * Cap + overflow count are computed on the DISPLAYABLE entries (stripped-title-
 * real), NOT the raw stored array — a URL-only entry never occupies a row slot nor
 * inflates the `+N more` count. The slice keeps the first `cap` displayable entries
 * (tail-trim) and the `+N more agenda item(s)` stub renders ONLY when `overflow >
 * 0` (strictly more than cap — no `+0` stub at exactly cap).
 */
export function RunOfShowList({
  entries,
  isoDate,
}: {
  entries: AgendaEntry[];
  isoDate: string;
}): JSX.Element {
  // Partition (spec §9.4): synthetic entries (kind strike/loadout) are FEW and
  // load-bearing — they must never hide behind the cap. Cap ONLY the agenda group
  // (kind absent/"agenda"); ALWAYS render the synthetic group after it. The
  // overflow stub counts the AGENDA group only.
  const display = displayableEntries(entries);
  const agenda = display.filter((e) => e.kind !== "strike" && e.kind !== "loadout");
  const synthetic = display.filter((e) => e.kind === "strike" || e.kind === "loadout");
  const shownAgenda = agenda.slice(0, RUN_OF_SHOW_DISPLAY_CAP);
  const overflow = agenda.length - RUN_OF_SHOW_DISPLAY_CAP; // agenda-only count
  return (
    <div data-testid={`run-of-show-${isoDate}`} className="mt-2 flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {shownAgenda.map((entry, i) => (
          <RunOfShowEntry key={`a${i}`} entry={entry} />
        ))}
        {synthetic.map((entry, i) => (
          <RunOfShowEntry key={`s${i}`} entry={entry} />
        ))}
      </ul>
      {overflow > 0 ? (
        <div
          data-testid="agenda-overflow-stub"
          data-tile-show-more="true"
          className="pt-1 text-xs text-text-subtle"
        >
          {`+${overflow} more ${overflow === 1 ? "agenda item" : "agenda items"}`}
        </div>
      ) : null}
    </div>
  );
}
