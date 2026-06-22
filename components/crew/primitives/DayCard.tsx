/**
 * components/crew/primitives/DayCard.tsx — crew-redesign §4.6 primitive
 * (mock-fidelity Task 4: horizontal date-badge form).
 *
 * One row in the schedule timeline, laid out HORIZONTALLY to match the mock's
 * `.day` row:
 *
 *   [ date badge ] | [ vline ] | [ tone dot + phase (+ optional meta) ] | [ Today pill ]
 *
 *   - date badge (`data-testid="day-card-date"`): a 50px column stacking the
 *     weekday-short (`.dow`, 11px/700/uppercase) over the numeric day (`.dnum`,
 *     23px/800). Both derived from the ISO `day` via `dayBadgeParts` (UTC —
 *     single-sourced TZ handling, no inline re-derivation).
 *   - vline: a self-stretch hairline divider (`self-stretch` fills the row
 *     height — Tailwind v4 does not default `.flex` to `align-items: stretch`,
 *     so the divider's full height comes from `self-stretch`, not the parent).
 *   - phase line: a tone dot (`data-testid="day-card-phase-dot"`,
 *     `data-tone={travel|set|show}`) + the `phase` text. travel → border-strong
 *     dot; set → the gold `#caa53a` (no @theme token — inline style); show →
 *     accent. The dot is `aria-hidden` (decorative) — the phase TEXT carries
 *     the meaning, so the tone is never color-only (DESIGN.md §1 floor).
 *   - Today pill: rendered ONLY when `today`, trailing. Uses `bg-stale-tint`
 *     (the mock's `accent-wash` is NOT an @theme token here — undefined tokens
 *     silently fall back, so the defined stale-tint is used).
 *
 * When `today` is true the node carries `data-today="true"` (the §4.8 today-pin
 * hook downstream CSS + the screenshot clock-pipeline key off it) and the badge
 * dow flips to the accent text-pair.
 *
 * Props (binding contract): {day (ISO), phase (union), today, meta?}.
 *
 * Server Component (no `'use client'`) — props in, markup out.
 */
import type { ReactNode } from "react";
import { dayBadgeParts } from "@/lib/format/date";
import type { SchedulePhase } from "@/lib/crew/agendaDisplay";

type DayCardProps = {
  /** ISO date (YYYY-MM-DD). Rendered as the stacked weekday + day-num badge. */
  day: string;
  /** Schedule phase — drives the tone dot + reads as the phase line text. */
  phase: SchedulePhase;
  /** When true, applies the pinned-today style hook (`data-today="true"`) + Today pill. */
  today: boolean;
  /** Optional secondary meta line. null → no meta node. */
  meta?: ReactNode;
};

/** Phase → tone. Travel In/Out share the neutral `travel` tone. */
const TONE: Record<SchedulePhase, "travel" | "set" | "show"> = {
  "Travel In": "travel",
  "Travel Out": "travel",
  Set: "set",
  Show: "show",
};

export function DayCard({ day, phase, today, meta }: DayCardProps) {
  const { dow, dnum } = dayBadgeParts(day);
  const tone = TONE[phase];

  return (
    <div
      data-testid="day-card"
      // The pinned-today hook is present ONLY when `today` is true so the
      // attribute selector reads cleanly downstream.
      {...(today ? { "data-today": "true" } : {})}
      className={[
        "flex items-center gap-4 rounded-md border p-3",
        today ? "border-accent bg-stale-tint" : "border-border bg-surface",
      ].join(" ")}
    >
      <div data-testid="day-card-date" className="flex w-12.5 shrink-0 flex-col items-center">
        <span
          className={[
            "text-[11px] font-bold uppercase leading-none tracking-eyebrow",
            today ? "text-accent-on-bg" : "text-text-faint",
          ].join(" ")}
        >
          {dow}
        </span>
        <span className="mt-0.5 text-[23px] font-extrabold leading-none tracking-daynum text-text-strong">
          {dnum}
        </span>
      </div>

      {/* self-stretch fills the row height (Tailwind v4 .flex ≠ items-stretch). */}
      <span className="w-px self-stretch bg-border" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-text-strong">
          <span
            data-testid="day-card-phase-dot"
            data-tone={tone}
            aria-hidden="true"
            className={[
              "size-1.75 shrink-0 rounded-full",
              tone === "show" ? "bg-accent" : tone === "set" ? "" : "bg-border-strong",
            ].join(" ")}
            // set tone is the mock's gold — no @theme token, so inline.
            style={tone === "set" ? { backgroundColor: "#caa53a" } : undefined}
          />
          {phase}
        </span>
        {meta != null ? (
          <span data-slot="day-card-meta" className="text-xs text-text-subtle">
            {meta}
          </span>
        ) : null}
      </div>

      {today ? (
        <span className="shrink-0 rounded-pill bg-stale-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow text-accent-on-bg">
          Today
        </span>
      ) : null}
    </div>
  );
}
