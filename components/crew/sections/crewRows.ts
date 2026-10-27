/**
 * components/crew/sections/crewRows.ts — the Crew section's row derivation,
 * shared by `CrewSection` and the search index builder (lib/search/sections/
 * crew.ts), so the page and the index read the same rows (spec §2.4).
 *
 * Each row carries the `PersonRow` props it renders with, search target ids
 * included, and the search lines those ids name. The lines come from
 * `personRowLines`, PersonRow's own render predicate, so a row PersonRow omits
 * (no identity and nothing actionable) has no line, and a row cut by an inline
 * cap is not in the list at all.
 *
 * Non-client module: the builder runs on the server and imports it.
 */
import { personRowLines, type Person } from "@/components/crew/primitives/PersonRow";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { entryId } from "@/lib/search/entryId";
import type { SearchEntry } from "@/lib/search/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/**
 * Cardinality cap for the crew roster before the `[data-tile-show-more]`
 * overflow affordance renders. Ported verbatim from CrewTile (CREW_INLINE_CAP
 * = 8) so the two surfaces agree on the roster floor. Members past it are not
 * in the DOM, so they are not in search (spec §12 L3).
 */
export const CREW_INLINE_CAP = 8;

/**
 * Cardinality cap for the key-contacts column before its overflow affordance
 * renders. Ported verbatim from ContactsTile (CONTACTS_INLINE_CAP = 6).
 */
export const CONTACTS_INLINE_CAP = 6;

/** The roster card: title (the search `group`) and `data-card-id` (the region). */
export const ROSTER_TITLE = "Show crew";
export const ROSTER_CARD_ID = "crew-roster";

/** The key-contacts card: title and `data-card-id`. */
export const CONTACTS_TITLE = "Key contacts";
export const CONTACTS_CARD_ID = "crew-contacts";

/** Human-readable fallback heading for a nameless contact row. */
export function contactFallbackLabel(kind: ShowForViewer["contacts"][number]["kind"]): string {
  switch (kind) {
    case "venue":
      return "Venue contact";
    case "in_house_av":
      return "In-house AV";
    default:
      return "Contact";
  }
}

/** A search entry without the parts the builder adds (section and copy). */
export type CrewSearchLine = Omit<SearchEntry, "section" | "copy">;

export type CrewPersonRow = {
  /** React key, as the section has always keyed the row. */
  key: string;
  /** PersonRow props, `searchTarget` included when the row renders a line. */
  person: Person;
  /** The row's search lines in render order: identity, then notes. */
  lines: CrewSearchLine[];
};

function withSearchLines(
  key: string,
  person: Person,
  region: string,
  group: string,
  seen: Map<string, number>,
): CrewPersonRow {
  const { identity, notes } = personRowLines(person);
  const lines: CrewSearchLine[] = [];
  const searchTarget: { identity?: string; notes?: string } = {};
  if (identity !== null) {
    const id = entryId("crew", region, group, null, identity.value, seen);
    searchTarget.identity = id;
    lines.push({ id, group, label: null, value: identity.value, context: identity.context });
  }
  if (notes !== null) {
    const id = entryId("crew", region, group, null, notes.value, seen);
    searchTarget.notes = id;
    lines.push({ id, group, label: null, value: notes.value, context: notes.context });
  }
  // Always set, even with no line: a row on the search surface marks its
  // avatar and action glyphs skip whether or not it has a line to index.
  return { key, person: { ...person, searchTarget }, lines };
}

/**
 * The roster rows the "Show crew" card renders, capped at `CREW_INLINE_CAP`, in
 * `data.crewMembers` order. The viewer gets the "You" chip; department leads
 * the "Lead" chip.
 */
export function rosterPersons(data: ShowForViewer, viewer: Viewer): CrewPersonRow[] {
  // The viewer's own crew row id, used to stamp the "You" chip. Admin viewers
  // have no crewMemberId so nobody is highlighted as "You".
  const viewerCrewId =
    viewer.kind === "crew" || viewer.kind === "admin_preview" ? viewer.crewMemberId : null;
  const seen = new Map<string, number>();
  return data.crewMembers.slice(0, CREW_INLINE_CAP).map((member) => {
    // Sentinel-guard the free-text heading source: a sentinel role must not
    // seed PersonRow's role eyebrow.
    const role = shouldHideGenericOptional(member.role) ? undefined : member.role;
    // Partial-attendance chip (BL-CREW-PARTIAL-ATTENDANCE-CHIP): the projection
    // carries ISO-normalized days, so humanize.
    const partial = partialAttendanceLabel(member.dateRestriction, { humanize: true });
    const person: Person = {
      name: member.name,
      ...(role !== undefined ? { role } : {}),
      ...(member.phone !== null ? { phone: member.phone } : {}),
      ...(member.email !== null ? { email: member.email } : {}),
      you: viewerCrewId !== null && member.id === viewerCrewId,
      lead: member.roleFlags.includes("LEAD"),
      ...(partial ? { partial } : {}),
    };
    return withSearchLines(member.id, person, ROSTER_CARD_ID, ROSTER_TITLE, seen);
  });
}

/**
 * The contact rows the "Key contacts" card renders, capped at
 * `CONTACTS_INLINE_CAP`, in `data.contacts` order. Never `show.client_contact`.
 */
export function contactPersons(data: ShowForViewer): CrewPersonRow[] {
  const seen = new Map<string, number>();
  return data.contacts.slice(0, CONTACTS_INLINE_CAP).map((contact, idx) => {
    const name =
      contact.name !== null && !shouldHideGenericOptional(contact.name) ? contact.name : undefined;
    const person: Person = {
      ...(name !== undefined ? { name } : {}),
      fallbackLabel: contactFallbackLabel(contact.kind),
      ...(contact.phone !== null ? { phone: contact.phone } : {}),
      ...(contact.email !== null ? { email: contact.email } : {}),
      ...(contact.notes !== null ? { notes: contact.notes } : {}),
    };
    return withSearchLines(
      `${contact.kind}-${idx}`,
      person,
      CONTACTS_CARD_ID,
      CONTACTS_TITLE,
      seen,
    );
  });
}
