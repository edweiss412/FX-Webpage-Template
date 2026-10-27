/**
 * components/crew/CrewAllSections.tsx: the compact home's "All sections" card
 * (crew page redesign spec §4.6).
 *
 * One row per section the viewer may open, in nav order: icon, label, a
 * one-line peek when the section has something to summarize, a chevron. The
 * membership and the peeks arrive from the server (`crewSectionEntries`), so
 * the card and the wide nav can never list different sections, and a peek is
 * never computed on the client from data the viewer may not see.
 *
 * Every row is a real link built by `buildSectionHref` (it keeps an
 * allow-listed `gate`), so a tap before hydration, a JavaScript-off tap or
 * "open in new tab" lands on the server-rendered open sheet. After hydration
 * the section controller intercepts the click and opens the sheet with a
 * history call instead (`CrewSections`). Not `next/link`: nothing here should
 * prefetch a section URL.
 *
 * Each row is named by its label and described by its peek.
 *
 * data-testid: crew-all-sections, -card, -row (data-section), -peek.
 */
import { ChevronRight } from "lucide-react";
import { SECTION_ICON } from "@/components/crew/sectionIcon";
import type { CrewSectionEntry, CrewSectionId } from "@/lib/crew/crewSections";

export interface CrewAllSectionsProps {
  sections: readonly CrewSectionEntry[];
  hrefFor: (id: CrewSectionId) => string;
}

export function CrewAllSections({ sections, hrefFor }: CrewAllSectionsProps) {
  if (sections.length === 0) return null;
  return (
    <section
      data-testid="crew-all-sections"
      aria-labelledby="crew-all-sections-heading"
      className="flex flex-col gap-3"
    >
      <h2 id="crew-all-sections-heading" className="text-base font-semibold text-text-strong">
        All sections
      </h2>
      <ul
        data-testid="crew-all-sections-card"
        className="overflow-hidden rounded-md border border-border bg-surface shadow-tile"
      >
        {sections.map((section) => {
          const Icon = SECTION_ICON[section.id];
          return (
            <li key={section.id} className="border-t border-border first:border-t-0">
              <a
                data-testid="crew-all-sections-row"
                data-section={section.id}
                href={hrefFor(section.id)}
                // Named by the label alone and described by the peek, so a
                // screen reader hears "Venue, link, Grand Hall" rather than the
                // two run together.
                aria-labelledby={`crew-all-sections-label-${section.id}`}
                aria-describedby={
                  section.peek !== null ? `crew-all-sections-peek-${section.id}` : undefined
                }
                className="flex min-h-tap-min items-center gap-3 px-4 py-3 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-text-subtle">
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    id={`crew-all-sections-label-${section.id}`}
                    className="text-sm font-semibold text-text-strong"
                  >
                    {section.label}
                  </span>
                  {section.peek !== null ? (
                    <span
                      id={`crew-all-sections-peek-${section.id}`}
                      data-testid="crew-all-sections-peek"
                      className="truncate text-xs/relaxed text-text-subtle"
                    >
                      {section.peek}
                    </span>
                  ) : null}
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-faint" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
