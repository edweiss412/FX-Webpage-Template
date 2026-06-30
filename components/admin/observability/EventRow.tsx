// components/admin/observability/EventRow.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { formatRelative } from "@/lib/admin/showDisplay";
import { CRON_RUN_SUMMARY } from "@/lib/cron/runSummary";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";
import { EventLevelBadge } from "./EventLevelBadge";
import { ContextDetail } from "./ContextDetail";
import { CronRunSummaryCard } from "./CronRunSummaryCard";

export function EventRow({ event, now }: { event: AppEventRow; now: Date }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const isSummary = event.code === CRON_RUN_SUMMARY;
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad">
      <div className="flex items-start gap-3">
        <EventLevelBadge level={event.level} />
        <div className="min-w-0 flex-1">
          {isSummary ? (
            // Summary row: the rich card IS the collapsed body, but the row still expands to
            // ContextDetail (AC4). A <button> may contain ONLY phrasing content, but the card is a
            // <div>/<dl> (block) — so use a keyboard-accessible role="button" div, not a <button>.
            <div
              role="button"
              tabIndex={0}
              data-testid={`event-row-toggle-${event.id}`}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              }}
              className="block w-full cursor-pointer text-left min-h-tap-min"
            >
              <CronRunSummaryCard event={event} />
            </div>
          ) : (
            <>
              {/* The toggle button contains ONLY the message — no nested interactive elements.
                  min-h-tap-min = 44px mobile tap target (DESIGN.md --spacing-tap-min, spec G7). */}
              <button
                type="button"
                data-testid={`event-row-toggle-${event.id}`}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="block min-h-tap-min w-full truncate text-left text-sm text-text"
              >
                {event.message}
              </button>
              {/* Metadata row — SIBLING of the button (links must not nest inside a button). */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                {/* Raw source/code are unbreakable identifiers — break-all + min-w-0 lets a long
                    token wrap inside the row instead of forcing horizontal overflow (spec G7). */}
                <span className="min-w-0 break-all font-medium">{event.source}</span>
                {event.code && (
                  <span className="max-w-full break-all rounded-pill bg-surface-sunken px-1.5">
                    {event.code}
                  </span>
                )}
                {event.showId &&
                  (event.showSlug ? (
                    // Route is /admin/show/[slug] — link by SLUG, never the UUID.
                    <Link
                      href={`/admin/show/${encodeURIComponent(event.showSlug)}`}
                      className="inline-flex min-h-tap-min items-center underline"
                    >
                      {event.showTitle ?? event.showSlug}
                    </Link>
                  ) : (
                    // show_id present but slug unavailable (effectively impossible: slug is NOT NULL and
                    // show_id is ON DELETE SET NULL) — render plain text, never a broken UUID link.
                    <span>{event.showTitle ?? event.showId}</span>
                  ))}
              </div>
            </>
          )}
        </div>
        <span className="shrink-0 text-xs text-text-faint">
          {formatRelative(event.occurredAt, now)}
        </span>
        {event.requestId && (
          <Link
            data-testid={`event-row-request-${event.id}`}
            href={`/admin/observability?requestId=${encodeURIComponent(event.requestId)}&since=all`}
            className="inline-flex min-h-tap-min shrink-0 items-center rounded-pill bg-surface-sunken px-2 text-xs text-accent-on-bg"
          >
            {event.requestId.slice(0, 8)}
          </Link>
        )}
      </div>
      {/* The ONE animated transition in this surface (spec §7): height disclosure,
          220ms ease-out-quart, instant under prefers-reduced-motion (useReducedMotion → 0). */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.25, 1, 0.5, 1] }}
            style={{ overflow: "hidden" }}
          >
            <ContextDetail event={event} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
