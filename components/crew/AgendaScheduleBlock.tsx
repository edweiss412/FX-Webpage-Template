/**
 * components/crew/AgendaScheduleBlock.tsx — structured per-day agenda schedule
 * (spec §4.7). Pure presentational Server Component (no `'use client'`): it
 * renders the schedule that the sync step already extracted from the agenda
 * PDF and stored on `agenda_links[i].extracted`.
 *
 * Render gate (§4.7 / §5): consumes ONLY the output of
 * `normalizeAgendaExtraction` — never the raw jsonb. When the payload is not a
 * high-confidence extraction with at least one day, the block renders nothing
 * (the AgendaEmbed PDF is the surface). This block is ALWAYS paired with that
 * embed (the authoritative source of truth); it never stands alone.
 *
 * Per day: a day heading + a list of sessions. Each session row is
 * `time · title · room`; breakout tracks are indented under the session; a
 * drift indicator renders only when `session.drift != null` — and the original
 * (pre-correction) value is shown as VISIBLE text (impeccable HIGH: a hover-only
 * `title=` is dead on the 390px primary touch device and unreachable by
 * keyboard/SR), so crew can verify the correction against the agenda PDF.
 *
 * `label` (optional) is the per-document badge (e.g. "RFI" / "PCF"); rendered as
 * a caption above the days so multiple agenda blocks are distinguishable
 * (impeccable MEDIUM). The signpost <h2> "Agenda" lives one level up in
 * ScheduleSection, so day labels here are <h3>.
 *
 * Dimensional invariants (§6 — Tailwind v4 has NO default
 * `align-items: stretch`):
 *   - the block carries `min-w-0` so it can shrink inside its column.
 *   - session rows use `grid-cols-[auto_minmax(0,1fr)]`; the text cell is
 *     `min-w-0` + `wrap-break-word` so a long unbreakable title wraps instead
 *     of overflowing at 320px.
 */
import type { JSX } from "react";

import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";

type AgendaScheduleBlockProps = {
  /** Raw `agenda_links[i].extracted` jsonb — narrowed at the render boundary. */
  extraction: unknown;
  /** Per-document badge ("RFI"/"PCF"); null for a single bare-AGENDA link. */
  label?: string | null;
};

/** Turn the stored drift string ("start→12:25 PM (source: 12:25 AM)") into a
 *  short, crew-readable, VISIBLE note. Falls back gracefully if the shape
 *  differs. The corrected value is already shown as `session.time`. */
function driftNote(drift: string): string {
  const src = drift.match(/source:\s*([^)]+)\)/)?.[1]?.trim();
  return src ? `Adjusted from ${src}` : "Adjusted from the sheet";
}

export function AgendaScheduleBlock({
  extraction,
  label = null,
}: AgendaScheduleBlockProps): JSX.Element | null {
  const data = normalizeAgendaExtraction(extraction);
  // §4.7 gate: render the structured schedule ONLY for a high-confidence
  // extraction that actually has days. Everything else → embed-only.
  if (!data || data.confidence !== "high" || data.days.length === 0) return null;

  return (
    <div data-testid="agenda-schedule" className="flex min-w-0 flex-col gap-4">
      {label ? (
        <p
          data-testid="agenda-schedule-label"
          className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
        >
          {label}
        </p>
      ) : null}
      {data.days.map((day, di) => (
        <div key={`${day.dayLabel}-${di}`} className="flex min-w-0 flex-col gap-2">
          <h3 className="flex items-baseline gap-1.5 text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
            <span>{day.dayLabel}</span>
            {day.date ? (
              <span className="font-normal normal-case tabular-nums text-text-subtle">
                {day.date}
              </span>
            ) : null}
          </h3>
          <ul className="flex flex-col gap-2">
            {day.sessions.map((session, si) => (
              <li
                key={`${di}-${si}-${session.time}`}
                data-testid="agenda-session"
                className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3"
              >
                <span className="shrink-0 text-sm tabular-nums text-text-subtle">
                  {session.time}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  {session.title !== null || session.room !== null ? (
                    <p className="min-w-0 text-sm text-text-strong wrap-break-word">
                      {session.title !== null ? session.title : null}
                      {session.room !== null ? (
                        <span className="text-text-subtle">
                          {session.title !== null ? " · " : ""}
                          {session.room}
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {session.drift !== null ? (
                    <span
                      data-testid="agenda-drift"
                      className="inline-flex w-fit items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-text-subtle"
                    >
                      {driftNote(session.drift)}
                    </span>
                  ) : null}

                  {session.tracks.length > 0 ? (
                    <ul className="mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                      {session.tracks.map((track, ti) => (
                        <li
                          key={`${ti}-${track.label}`}
                          data-testid="agenda-track"
                          className="min-w-0 text-sm text-text wrap-break-word"
                        >
                          <span className="font-medium text-text-strong">{track.label}</span>
                          {track.title !== null ? <span> · {track.title}</span> : null}
                          {track.room !== null ? (
                            <span className="text-text-subtle"> · {track.room}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
