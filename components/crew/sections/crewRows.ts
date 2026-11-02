/**
 * components/crew/sections/crewRows.ts — the Crew section's row derivation,
 * shared by `CrewSection` and the search index builder (lib/search/sections/
 * crew.ts), so the page and the index read the same rows (spec §2.4).
 *
 * The roster is the shared Crew body's crew props (`rosterPanel`, crew page
 * redesign PR B Task 6, components/show-panels/CrewBody.tsx); its search lines
 * come from `crewBodyIdentity`, the body's own identity predicate. The key
 * contacts are still `PersonRow` rows (`contactPersons`), whose lines come from
 * `personRowLines`, PersonRow's render predicate. Either way a row that renders
 * no line has none, and a row cut by an inline cap is not in the list at all.
 *
 * Non-client module: the builder runs on the server and imports it.
 */
import { personRowLines, type Person } from "@/components/crew/primitives/PersonRow";
import {
  crewBodyIdentity,
  type CrewBodyMember,
  type CrewBodyProps,
} from "@/components/show-panels/CrewBody";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { digitsOnly } from "@/lib/format/phone";
import { entryId } from "@/lib/search/entryId";
import type { SearchEntry } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";
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

/**
 * The roster card's `data-card-id` (the search region). Its title, and so the
 * search `group` of its lines, is the registry label of `crew` (plan decision 4).
 */
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

/** The crew's call link: a `tel:` of the digits, none when the phone has none (phase 1 §4.16). */
export function crewTelHref(phone: string): string | null {
  const digits = digitsOnly(phone);
  return digits.length > 0 ? `tel:${digits}` : null;
}

/** The crew's text link, under the same digits gate as the call link (plan decision 8). */
export function crewSmsHref(phone: string): string | null {
  const digits = digitsOnly(phone);
  return digits.length > 0 ? `sms:${digits}` : null;
}

/** The crew's email link: none for a sentinel or a blank address. */
export function crewMailtoHref(email: string): string | null {
  return shouldHideGenericOptional(email) ? null : `mailto:${email}`;
}

/** The roster's body props (all but the overflow slot, which is markup) and its search lines. */
export type RosterPanel = {
  body: Omit<CrewBodyProps, "overflow">;
  lines: CrewSearchLine[];
};

/**
 * The roster the "Crew" panel card renders: every member in `data.crewMembers`
 * order (the body caps them at `CREW_INLINE_CAP`), the viewer's own row with
 * the "You" chip, department leads with the "Lead" chip, a partial-attendance
 * chip humanized, and a search target per identity line of the rows the cap
 * keeps.
 */
export function rosterPanel(data: ShowForViewer, viewer: Viewer): RosterPanel {
  // The viewer's own crew row id, used to stamp the "You" chip. Admin viewers
  // have no crewMemberId so nobody is highlighted as "You".
  const viewerCrewId =
    viewer.kind === "crew" || viewer.kind === "admin_preview" ? viewer.crewMemberId : null;
  const members: CrewBodyMember[] = data.crewMembers.map((member) => {
    const name = member.name.trim().length > 0 ? member.name : null;
    return {
      key: member.id,
      name,
      avatarName: name ?? "",
      role: member.role,
      // Partial-attendance chip (BL-CREW-PARTIAL-ATTENDANCE-CHIP): the projection
      // carries ISO-normalized days, so humanize.
      partial: partialAttendanceLabel(member.dateRestriction, { humanize: true }),
      phone: member.phone,
      email: member.email,
      you: viewerCrewId !== null && member.id === viewerCrewId,
      lead: member.roleFlags.includes("LEAD"),
    };
  });
  const options = { sentinels: "hide", partialAs: "chip" } as const;
  const group = showSection("crew").label;
  const seen = new Map<string, number>();
  const targets: Record<string, string> = {};
  const lines: CrewSearchLine[] = [];
  for (const member of members.slice(0, CREW_INLINE_CAP)) {
    const identity = crewBodyIdentity(member, options);
    if (identity === null) continue;
    const id = entryId("crew", ROSTER_CARD_ID, group, null, identity.value, seen);
    targets[member.key] = id;
    lines.push({ id, group, label: null, value: identity.value, context: identity.context });
  }
  return {
    body: {
      members,
      cap: CREW_INLINE_CAP,
      telHref: crewTelHref,
      smsHref: crewSmsHref,
      mailtoHref: crewMailtoHref,
      ...options,
      actionsPlacement: "below",
      targets,
      testIdPrefix: "crew-panel",
    },
    lines,
  };
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
