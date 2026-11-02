import { contactsPanel, type ContactsSearchLine } from "@/components/crew/sections/contactsRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchEntry } from "@/lib/search/types";

/**
 * Contacts search entries (spec §2.4, §4; crew page redesign PR B Task 7): the
 * venue and in-house AV contacts up to their inline cap, one entry per identity
 * line (the name, or the kind when there is none, with the kind as context
 * under a named contact) and one per note, exactly the lines `ContactsSection`
 * renders from the shared Contacts body's props (`contactsPanel`). Never the
 * client contact. Phones and emails render only as `tel:`/`mailto:` links and
 * labels, so they are not indexed (spec §12 L4).
 *
 * `ContactsSection` derives its rows inside one `WrappedSection`; when that
 * derivation throws the section renders a fallback with no lines, so the
 * builder contributes nothing either.
 */
export function buildContactsEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  // Outside the guard, as in the section: a malformed projection throws here.
  resolveViewerContext(viewer, data);

  let lines: ContactsSearchLine[];
  try {
    lines = contactsPanel(data).lines;
  } catch {
    return [];
  }
  return lines.map((line) => ({ ...line, section: "contacts" as const, copy: null }));
}
