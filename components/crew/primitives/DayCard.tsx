/**
 * components/crew/primitives/DayCard.tsx — crew-redesign §4.6 primitive.
 *
 * One row in the schedule timeline: a `day` label, a `phase` line, the
 * `today` pin, and an optional `meta` line. When `today` is true the node
 * carries the `data-today="true"` style hook (downstream CSS + the §4.8
 * "today pin" treatment key off it; the orange accent stays text-paired per
 * DESIGN.md §1 color-blind floor). `meta` null → the phase line renders
 * alone with no meta node.
 *
 * Props (binding contract): {day, phase, today, meta?}.
 *
 * Server Component (no `'use client'`) — props in, markup out.
 */
import type { ReactNode } from "react";

type DayCardProps = {
  /** Day label (e.g. "Day 2"). Rendered as the eyebrow. */
  day: string;
  /** Phase line (e.g. "Show day 2 of 3"). Always rendered. */
  phase: string;
  /** When true, applies the pinned-today style hook (`data-today="true"`). */
  today: boolean;
  /** Optional secondary meta line (e.g. "Set 9:00 AM"). null → no meta node. */
  meta?: ReactNode;
};

export function DayCard({ day, phase, today, meta }: DayCardProps) {
  return (
    <div
      data-testid="day-card"
      // The pinned-today hook is present ONLY when `today` is true, so the
      // attribute selector reads cleanly downstream. The today row also reads
      // its accent text-paired (label color) — never color-only.
      {...(today ? { "data-today": "true" } : {})}
      className={[
        "flex flex-col gap-1 rounded-md border p-3",
        today ? "border-accent bg-stale-tint" : "border-border bg-surface",
      ].join(" ")}
    >
      <span
        className={[
          "text-xs font-medium uppercase tracking-eyebrow",
          today ? "text-accent-on-bg" : "text-text-faint",
        ].join(" ")}
      >
        {day}
      </span>
      <span className="text-sm font-medium text-text">{phase}</span>
      {meta != null ? (
        <span data-slot="day-card-meta" className="text-xs text-text-subtle">
          {meta}
        </span>
      ) : null}
    </div>
  );
}
