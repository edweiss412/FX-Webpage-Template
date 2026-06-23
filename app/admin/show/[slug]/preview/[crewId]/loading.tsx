import { Skeleton, LoadingShell } from "@/components/layout/Skeleton";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";

/**
 * app/admin/show/[slug]/preview/[crewId]/loading.tsx (nav-perf Phase 2 / D) —
 * instant skeleton for the admin "preview as crew member" route while the
 * PreviewBanner + CrewShell load. Mirrors the real silhouette: a full-width
 * banner strip, then the CrewShell envelope (max-w-[1200px], px-4/sm:px-8) with a
 * Header band, a CrewSubNav-shaped tab row, and a section frame — so the swap to
 * real content settles rather than jumps (impeccable LOW: match CrewShell width).
 *
 * §4.17 / no-Budget invariant: the tab row renders the 6 BASE_SECTION_IDS ONLY;
 * the conditional Budget tab's `financialsVisible` gate is unknown pre-projection,
 * so a Budget tab MUST NEVER flash here (mirrors the crew route's loading.tsx).
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
    <LoadingShell testId="admin-preview-crew-loading" label="Loading crew preview…">
      {/* PreviewBanner strip */}
      <Skeleton className="h-10 w-full" />

      {/* Header band — mirrors the context-strip Header (max-w-[1200px]). */}
      <div className="border-b border-border bg-bg">
        <div className="mx-auto flex w-full max-w-[1200px] items-baseline justify-between gap-6 px-4 py-3 sm:px-8 sm:py-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-1 h-5 w-56" />
            <Skeleton className="mt-1 h-3 w-40" />
          </div>
        </div>
      </div>

      {/* CrewSubNav-shaped tab row — 6 base tabs only (never Budget). */}
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-8">
        <div className="flex items-stretch gap-1 border-b border-border">
          {BASE_SECTION_IDS.map((id) => (
            <div
              key={id}
              data-testid="preview-loading-tab"
              className="inline-flex min-h-tap-min items-center justify-center px-3"
            >
              <span className="text-sm font-medium text-text-faint">{SECTION_LABELS[id]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section frame — placeholder content at the canonical floor. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 py-section-gap sm:px-8">
        <div className="min-h-right-now-min-h rounded-lg border border-border bg-surface-sunken" />
      </div>
    </LoadingShell>
  );
}
