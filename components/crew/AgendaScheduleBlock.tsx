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
 * ScheduleSection, so day labels here are <h3> -- still true after the fold: the h3 lives
 * INSIDE each day's <summary>, so the disclosure and the document outline coexist.
 *
 * Dimensional invariants (§6 — Tailwind v4 has NO default
 * `align-items: stretch`):
 *   - the block carries `min-w-0` so it can shrink inside its column.
 *   - session rows use `grid-cols-[auto_minmax(0,1fr)]`; the text cell is
 *     `min-w-0` + `wrap-break-word` so a long unbreakable title wraps instead
 *     of overflowing at 320px.
 */
import { ChevronRight } from "lucide-react";

import type { ViewerAgendaDays } from "@/lib/crew/agendaViewerDays";
import type { JSX } from "react";

import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";

type AgendaScheduleBlockProps = {
  /** Raw `agenda_links[i].extracted` jsonb — narrowed at the render boundary. */
  extraction: unknown;
  /** Per-document badge ("RFI"/"PCF"); null for a single bare-AGENDA link. */
  label?: string | null;
  /**
   * Which of this extraction's day rows are the viewer's own, or `{ kind: "all" }` when that
   * cannot be established completely (spec §2). OPTIONAL with an `{ kind: "all" }` default so
   * the admin Step 3 review preview (`components/admin/wizard/step3ReviewSections.tsx:3230`),
   * which has no viewer, keeps rendering the whole schedule unchanged.
   *
   * Three unrelated causes converge on `{ kind: "all" }` — no viewer, an unrestricted viewer,
   * and an incomplete match — and all three render identically, so no consumer branches on
   * which one it was.
   *
   * T2 declares the prop and threads the value; T3 is what makes the component USE it.
   */
  viewerDays?: ViewerAgendaDays;
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
  viewerDays: _viewerDays = { kind: "all" },
}: AgendaScheduleBlockProps): JSX.Element | null {
  const data = normalizeAgendaExtraction(extraction);
  // §4.7 gate: render the structured schedule ONLY for a high-confidence
  // extraction that actually has days. Everything else → embed-only.
  if (!data || data.confidence !== "high" || data.days.length === 0) return null;

  // An EMPTY subset is treated as "all": "fold iff my index is absent" would otherwise fold
  // every row including the viewer's own, which is the worst outcome this feature can produce.
  // The type cannot forbid the empty set, so the consumer must.
  const rows = _viewerDays.kind === "subset" && _viewerDays.rows.size > 0 ? _viewerDays.rows : null;
  const isOpen = (di: number): boolean => rows === null || rows.has(di);
  // THE MARKER RULE (spec §5): the marker renders only when it DISTINGUISHES, i.e. some day is
  // the viewer's AND some day is not. `rows === null` means nothing is distinguished; a full
  // set means every day is theirs, which tells the viewer nothing either.
  const marks = rows !== null && rows.size < data.days.length ? rows : null;
  const markerOn = (di: number): boolean => marks !== null && marks.has(di);

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
        <details
          key={`${day.dayLabel}-${di}`}
          data-testid={`agenda-day-${di}`}
          open={isOpen(di)}
          // `w-full` supplies the width and `min-w-0` allows shrinking below the content
          // minimum: min-w-0 alone does NOT make a flex item fill the cross axis, and this
          // project's Tailwind v4 does not default .flex to align-items: stretch.
          // `list-none` plus the marker-hiding variants remove the UA disclosure triangle so
          // it does not render beside the chevron. The <summary> role is unchanged.
          className="w-full min-w-0 list-none [&::-webkit-details-marker]:hidden [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
        >
          <summary
            data-testid={`agenda-day-summary-${di}`}
            className="flex min-h-tap-min min-w-0 cursor-pointer list-none items-baseline gap-1.5 text-xs font-medium uppercase tracking-eyebrow text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {/* Still an <h3>, inside the <summary> (impeccable audit P1). Replacing the day
                heading with a bare span removed every per-day heading from the document
                outline, so a screen-reader user navigating by heading lost the day labels
                entirely. A heading inside a summary keeps BOTH: the disclosure role and its
                expanded state come from <details>/<summary>, the outline entry from the h3. */}
            <h3 className="min-w-0 font-medium wrap-break-word">{day.dayLabel}</h3>
            {day.date ? (
              <span className="max-w-[12ch] shrink-0 truncate font-normal normal-case tabular-nums text-text-subtle">
                {day.date}
              </span>
            ) : null}
            {/* Only on a FOLDED row. On an open row the sessions are listed directly below,
                so the count restates what is already on screen -- and it costs a fourth atom
                on the summary line at 320px, which is exactly where space is tightest. On a
                folded row it is the only signal of what the fold is hiding, which is what
                earns it the space. */}
            {isOpen(di) ? null : (
              <span
                data-testid={`agenda-day-count-${di}`}
                className="shrink-0 font-normal normal-case tabular-nums text-text-subtle"
              >
                {day.sessions.length === 1 ? "1 session" : `${day.sessions.length} sessions`}
              </span>
            )}
            {markerOn(di) ? (
              <span
                data-testid={`agenda-day-marker-${di}`}
                className="shrink-0 font-semibold normal-case text-text-strong"
              >
                Your day
              </span>
            ) : null}
            <ChevronRight
              aria-hidden="true"
              data-agenda-day-chevron=""
              className="ml-auto size-3.5 shrink-0"
            />
          </summary>
          <ul className="flex flex-col gap-2 pt-2">
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
        </details>
      ))}
    </div>
  );
}
