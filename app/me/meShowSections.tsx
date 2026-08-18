/**
 * app/me/meShowSections.tsx (2026-08-07 Step-3 a11y cluster — spec §8, R10)
 *
 * The render half of `app/me/page.tsx`, relocated VERBATIM. Nothing here is
 * new: `formatShowDate`, `MeShowSections`, `UndatedShowRow`, `NextUpCard`,
 * `ShowListRow`, `chipToneClass`, and `pickVenueLabel` moved unchanged from
 * that file, which keeps `MePage` and every line of server logic.
 *
 * Why the split exists. The tap-target live-entry harness
 * (tests/e2e/tap-target-floor.layout.spec.ts) must mount the REAL `/me` past-
 * shows disclosure to measure it, and it bundles through
 * `tests/e2e/_step3ReviewModalBundle.mjs`, which maps every Node builtin to an
 * empty CJS module. `app/me/page.tsx` cannot survive that: it imports
 * `validateGoogleIdentity`, whose graph constructs `new AsyncLocalStorage()` at
 * MODULE SCOPE (lib/log/requestContext.ts:15), so the bundle builds and then
 * dies with "AsyncLocalStorage is not a constructor" before React mounts
 * anything. Exporting `MeShowSections` from the page therefore cannot work, and
 * teaching the shared bundler a functional stub is a redesign of a surface that
 * branch does not otherwise touch — both are ratified as refuted in spec §1.1
 * R10 and §8. Extraction is the seam that was probed working (spec §7 probe P7).
 *
 * Every import below is browser-safe: the two type imports erase at compile,
 * `lib/time/relative.ts` imports nothing, and `lib/me/partitionMeShows.ts`
 * carries only a type import.
 */
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { CrewShowSummary } from "@/lib/data/listShowsForCrew";
import {
  partitionMeShows,
  resolveDisplayDate,
  type PartitionedMeShow,
} from "@/lib/me/partitionMeShows";
import { relativeDayChip } from "@/lib/time/relative";

// R14 (codex finding): the local pickShowDate helper accepted any
// non-empty string and rendered normalized bogus dates that Doug
// never typed (split-brain: partition used the valid fallback,
// render used the invalid earlier field). Replaced with
// `resolveDisplayDate` from lib/me/partitionMeShows.ts which gates
// every candidate through isIsoDate's strict YYYY-MM-DD round-trip
// check. Single source of truth for both partition + render.

/**
 * Render an ISO date as "Month D, YYYY" — same shape as Header.tsx.
 *
 * Shares the same Date.UTC + en-US "Month D, YYYY" shape as
 * components/layout/Header.tsx (formatHeaderDate). The helper is duplicated
 * intentionally — Header consumes the typed ShowRow["dates"] union, while
 * listShowsForCrew returns `dates: unknown` (the value flows through JSONB).
 * Centralising would require widening Header's type signature, which the
 * milestone is explicitly scoped against (Header is M4 surface).
 */
function formatShowDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Render the partitioned NEXT UP / UPCOMING / PAST sections per shape brief
 * §5.1. Pure render function over the partition output; no I/O. Today is
 * resolved once here so all three sections share the same reference (chip
 * labels and partition use identical comparisons).
 *
 * Exported for the unit test (meShowSections.test.tsx) and for the tap-target
 * live entry (spec §8) — the module boundary is the seam itself.
 */
export function MeShowSections({ shows, now }: { shows: readonly CrewShowSummary[]; now: Date }) {
  const { featured, upcoming, past, undated } = partitionMeShows(shows, now);

  // R11 (codex finding): the only true empty state is shows.length === 0,
  // handled in the parent. If we're here AND featured is null AND undated
  // is empty, something dropped a show without surfacing it — render a
  // diagnostic placeholder so the user isn't stranded.
  if (!featured && undated.length === 0) {
    return (
      <div data-testid="me-no-dated-shows" className="py-12 text-center text-base text-text-subtle">
        <p>Your shows are missing dates. Doug will fill them in.</p>
      </div>
    );
  }

  return (
    <div data-testid="me-show-sections" className="flex flex-col gap-section-gap">
      {featured && (
        <section data-testid="me-next-up" aria-labelledby="me-next-up-heading">
          <h2
            id="me-next-up-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Next up
          </h2>
          <NextUpCard entry={featured} now={now} />
        </section>
      )}

      {upcoming.length > 0 && (
        <section data-testid="me-upcoming" aria-labelledby="me-upcoming-heading">
          <h2
            id="me-upcoming-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Upcoming
          </h2>
          <ul className="flex flex-col gap-2">
            {upcoming.map((entry) => (
              <ShowListRow key={entry.show.id} entry={entry} now={now} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <details data-testid="me-past" className="group">
          <summary
            data-testid="me-past-summary"
            className="inline-flex w-fit min-h-tap-min cursor-pointer list-none items-center text-xs font-semibold uppercase tracking-eyebrow text-text-subtle hover:text-text"
          >
            Past ({past.length}){" "}
            <ChevronRight
              aria-hidden="true"
              className="ml-1 inline-block size-4 shrink-0 transition-transform duration-normal group-open:rotate-90"
            />
          </summary>
          <ul data-testid="me-past-list" className="mt-3 flex flex-col gap-2">
            {past.map((entry) => (
              <ShowListRow key={entry.show.id} entry={entry} now={now} />
            ))}
          </ul>
        </details>
      )}

      {/*
        R11 (codex finding): undated shows render in their own section
        so the user retains the link to the show even when Doug hasn't
        filled in dates yet. No chip (no chip-meaningful date), but
        same row chrome as Upcoming/Past — title + link target.
      */}
      {undated.length > 0 && (
        <section data-testid="me-undated" aria-labelledby="me-undated-heading">
          <h2
            id="me-undated-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-text-subtle"
          >
            Date pending
          </h2>
          <ul data-testid="me-undated-list" className="flex flex-col gap-2">
            {undated.map((show) => (
              <UndatedShowRow key={show.id} show={show} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * R11: undated show row. Same compact chrome as ShowListRow but no
 * chip (no date to anchor) and no date label. Title + venue (when
 * present) + link to the show.
 */
function UndatedShowRow({ show }: { show: CrewShowSummary }) {
  const venueLabel = pickVenueLabel(show);
  return (
    <li>
      <Link
        data-testid={`me-show-card-${show.slug}`}
        href={`/show/${show.slug}/${show.shareToken}`}
        className="flex min-h-tap-min items-center gap-3 rounded-md border border-text-faint bg-surface px-tile-pad py-3 transition-colors hover:border-border-strong"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium text-text-strong">{show.title}</div>
          {venueLabel && (
            <div className="mt-0.5 truncate text-xs text-text-subtle">{venueLabel}</div>
          )}
        </div>
      </Link>
    </li>
  );
}

/**
 * Featured card — emphasized vertical padding, larger title, accent chip
 * for relative-time. Brief §5.1: "Tomorrow" / "Today" use orange chip;
 * "In N days" uses neutral info chip; past uses no chip background.
 *
 * R2 F1 (codex finding): chip uses `entry.chipAnchor` (status-aware)
 * not the display date — for an active multi-day show with set=yesterday
 * + showDays=[today], chipAnchor = today → "Today", whereas display
 * date = yesterday would render "Ended" while crew are on-site.
 *
 * R2 F2 (codex finding): venue is now part of the brief's "Where am I
 * going next?" answer (Venue · Date). Surfaces show.venue.name when
 * present; gracefully omits when absent.
 */
function NextUpCard({ entry, now }: { entry: PartitionedMeShow; now: Date }) {
  const { show, chipAnchor } = entry;
  const isoDate = resolveDisplayDate(show.dates);
  const dateLabel = isoDate ? formatShowDate(isoDate) : null;
  const chip = relativeDayChip(chipAnchor, now);
  const chipTone = chipToneClass(chip);
  const venueLabel = pickVenueLabel(show);

  return (
    <Link
      data-testid={`me-show-card-${show.slug}`}
      href={`/show/${show.slug}/${show.shareToken}`}
      className="block rounded-md border border-text-faint bg-surface p-tile-pad py-6 shadow-tile transition-colors hover:border-border-strong sm:py-8"
    >
      {chip && (
        <span
          data-testid="me-next-up-chip"
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${chipTone}`}
        >
          {chip}
        </span>
      )}
      <h3 className="mt-2 text-lg font-semibold text-text-strong sm:text-xl">{show.title}</h3>
      {(dateLabel || venueLabel) && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-text-subtle">
          {venueLabel && <span>{venueLabel}</span>}
          {venueLabel && dateLabel && (
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
          )}
          {dateLabel && isoDate && <time dateTime={isoDate}>{dateLabel}</time>}
        </p>
      )}
    </Link>
  );
}

/**
 * UPCOMING / PAST list row — compact 56px tap-target row with chip on the
 * right. Per brief §5.1: "regular list row, 56px tap target". R2 F1: chip
 * uses the partition's chipAnchor, not the display date — same fix as
 * NextUpCard.
 */
function ShowListRow({ entry, now }: { entry: PartitionedMeShow; now: Date }) {
  const { show, chipAnchor } = entry;
  const isoDate = resolveDisplayDate(show.dates);
  const dateLabel = isoDate ? formatShowDate(isoDate) : null;
  const chip = relativeDayChip(chipAnchor, now);
  const chipTone = chipToneClass(chip);
  const venueLabel = pickVenueLabel(show);

  return (
    <li>
      <Link
        data-testid={`me-show-card-${show.slug}`}
        href={`/show/${show.slug}/${show.shareToken}`}
        className="flex min-h-tap-min items-center justify-between gap-3 rounded-md border border-text-faint bg-surface px-tile-pad py-3 transition-colors hover:border-border-strong"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium text-text-strong">{show.title}</div>
          {(venueLabel || dateLabel) && (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-text-subtle">
              {venueLabel && <span className="truncate">{venueLabel}</span>}
              {venueLabel && dateLabel && (
                <span aria-hidden="true" className="text-text-faint">
                  ·
                </span>
              )}
              {dateLabel && isoDate && <time dateTime={isoDate}>{dateLabel}</time>}
            </div>
          )}
        </div>
        {chip && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${chipTone}`}>
            {chip}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * Map a chip label to its chrome class per brief §5.1:
 *   "Today" / "Tomorrow"     → accent (the singular brand moment on /me)
 *   "In N days" / "In N weeks" → info-bg (neutral)
 *   "Ended …"                  → text-subtle, no background
 */
function chipToneClass(chip: string): string {
  if (chip === "Today" || chip === "Tomorrow") {
    return "bg-accent text-accent-text";
  }
  if (chip.startsWith("In ")) {
    return "bg-info-bg text-text";
  }
  // Ended / Ended N days ago / Ended N weeks ago
  return "text-text-subtle";
}

/**
 * R2 F2 (codex finding): the brief's /me card answers
 * "Where am I going next?" with `Venue · Date`. listShowsForCrew now
 * projects `shows.venue` so this surfaces the venue.name. Returns null
 * defensively when the venue is missing or doesn't carry a name —
 * the row gracefully collapses to title + date only.
 */
function pickVenueLabel(show: CrewShowSummary): string | null {
  return show.venue?.name ?? null;
}
