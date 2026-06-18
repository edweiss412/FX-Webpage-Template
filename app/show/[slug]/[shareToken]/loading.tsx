import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";

/**
 * app/show/[slug]/[shareToken]/loading.tsx (crew-redesign Task 7) — the crew
 * route's initial loading skeleton, shown during the initial fetch + the
 * picker / auth flow.
 *
 * It echoes the live page chrome silhouette: a Header band placeholder
 * (components/layout/Header.tsx — context strip, max-w-[1200px], px-4/sm:px-8),
 * a CrewSubNav-shaped tab row, and an empty section frame at the canonical
 * `min-h-right-now-min-h` floor (`--spacing-right-now-min-h` = 176px), so the
 * page silhouette appears at once instead of a blank first paint.
 *
 * §4.17 / no-Budget invariant: it renders placeholders for the 6
 * BASE_SECTION_IDS ONLY. The conditional Budget tab's `financialsVisible` gate
 * is unknown pre-projection, so a Budget tab MUST NEVER flash here — the tab
 * list derives from BASE_SECTION_IDS so it cannot drift.
 *
 * Pure server component (no 'use client', no hooks). Intentionally NOT in any
 * screenshot manifest.
 */

const SECTION_LABELS: Record<(typeof BASE_SECTION_IDS)[number], string> = {
  today: "Today",
  schedule: "Schedule",
  venue: "Venue",
  travel: "Travel",
  crew: "Crew",
  gear: "Gear",
};

export default function Loading() {
  return (
    <LoadingShell testId="crew-loading-skeleton" label="Loading show…">
      {/* Header band placeholder — mirrors the context-strip Header. */}
      <div
        data-testid="crew-loading-header"
        className="border-b border-border bg-bg"
      >
        <div className="mx-auto flex w-full max-w-[1200px] items-baseline justify-between gap-6 px-4 py-3 sm:px-8 sm:py-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-1 h-5 w-56" />
            <Skeleton className="mt-1 h-3 w-40" />
          </div>
          <Skeleton className="hidden h-3 w-12 shrink-0 self-start sm:block" />
        </div>
      </div>

      {/* Sub-nav placeholder — CrewSubNav-shaped desktop tab row, 6 base tabs. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-8">
        <div
          data-testid="crew-loading-subnav"
          className="flex items-stretch gap-1 border-b border-border"
        >
          {BASE_SECTION_IDS.map((id) => (
            <div
              key={id}
              data-testid="crew-loading-tab"
              className="inline-flex min-h-tap-min items-center justify-center px-3"
            >
              <span className="text-sm font-medium text-text-faint">
                {SECTION_LABELS[id]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Empty section frame — placeholder content at the canonical floor. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 py-section-gap sm:px-8">
        <div
          data-testid="crew-loading-section"
          className="min-h-right-now-min-h rounded-lg border border-border bg-surface-sunken"
        />
      </div>
    </LoadingShell>
  );
}
