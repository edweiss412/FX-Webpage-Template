import {
  contactPersons,
  rosterPanel,
  type CrewSearchLine,
} from "@/components/crew/sections/crewRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Crew search entries (spec §2.4, §4): the roster and the key contacts up to
 * their inline caps, one entry per identity line (name or fallback label, with
 * the role and chips as context) and one per contact note, exactly the lines
 * `CrewSection` renders: the roster's from the shared Crew body's props
 * (`rosterPanel`), the contacts' from their `PersonRow` rows. Phones and emails render only
 * as `tel:`/`sms:`/`mailto:` links and labels, so they are not indexed (spec §12 L4).
 *
 * `CrewSection` derives both columns inside one `WrappedSection`; when that
 * derivation throws the section renders a fallback with no lines, so the
 * builder contributes nothing either.
 */
export function buildCrewEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  // Outside the guard, as in the section: a malformed projection throws here.
  resolveViewerContext(viewer, data);

  let lines: CrewSearchLine[];
  try {
    lines = [...rosterPanel(data, viewer).lines, ...contactPersons(data).flatMap((r) => r.lines)];
  } catch {
    return [];
  }
  return lines.map((line) => ({ ...line, section: "crew" as const, copy: null }));
}
