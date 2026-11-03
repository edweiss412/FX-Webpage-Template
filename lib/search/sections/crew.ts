import { rosterPanel, type CrewSearchLine } from "@/components/crew/sections/crewRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Crew search entries (spec §2.4, §4): the roster up to its inline cap, one
 * entry per identity line (the name, or the role when there is none, with the
 * role and chips as context), exactly the lines `CrewSection` renders from the
 * shared Crew body's props (`rosterPanel`). The contacts are their own section
 * from PR B Task 7 (lib/search/sections/contacts.ts). Phones and emails render
 * only as `tel:`/`sms:`/`mailto:` links and labels, so they are not indexed
 * (spec §12 L4).
 *
 * `CrewSection` derives the roster inside one `WrappedSection`; when that
 * derivation throws the section renders a fallback with no lines, so the
 * builder contributes nothing either.
 */
export function buildCrewEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  // Outside the guard, as in the section: a malformed projection throws here.
  resolveViewerContext(viewer, data);

  let lines: CrewSearchLine[];
  try {
    lines = rosterPanel(data, viewer).lines;
  } catch {
    return [];
  }
  return lines.map((line) => ({ ...line, section: "crew" as const, copy: null }));
}
