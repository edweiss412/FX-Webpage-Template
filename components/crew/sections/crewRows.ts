/**
 * components/crew/sections/crewRows.ts — the Crew section's row derivation,
 * shared by `CrewSection` and the search index builder (lib/search/sections/
 * crew.ts), so the page and the index read the same rows (spec §2.4).
 *
 * The roster is the shared Crew body's crew props (`rosterPanel`, crew page
 * redesign PR B Task 6, components/show-panels/CrewBody.tsx); its search lines
 * come from `crewBodyIdentity`, the body's own identity predicate, so a row that
 * renders no line has none, and a row cut by the inline cap is not in the list
 * at all. The contacts are their own section from PR B Task 7
 * (contactsRows.ts); the crew's call, text and email builders here serve both.
 *
 * Non-client module: the builder runs on the server and imports it.
 */
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
 * The roster card's `data-card-id` (the search region). Its title, and so the
 * search `group` of its lines, is the registry label of `crew` (plan decision 4).
 */
export const ROSTER_CARD_ID = "crew-roster";

/** A search entry without the parts the builder adds (section and copy). */
export type CrewSearchLine = Omit<SearchEntry, "section" | "copy">;

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
      // PR B invariant-8 gate rows 17 and 20: the actions drawn in body text with
      // the home buttons' hover, under the identity until the crew threshold and
      // at the row's end from it.
      actionsPlacement: "below-until-split",
      actionTone: "text",
      targets,
      testIdPrefix: "crew-panel",
    },
    lines,
  };
}
