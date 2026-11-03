/**
 * components/crew/sections/crewContacts.ts — which contacts the crew Contacts
 * section renders a row for, decided once by the shared body's own display rule
 * under the crew's options. The section's empty-state gate and search lines
 * (contactsRows.ts) and the "All sections" peek (lib/crew/sectionPeek.ts) read
 * it, so the peek never counts a contact the section does not show (PR B
 * invariant-8 gate, row 13 and its peer).
 *
 * Markup-free: the peek is reachable from the crew page's client bundle.
 * Pure and server-safe.
 */
import {
  contactsBodyBlocks,
  contactsBodyLines,
  type ContactBlockOptions,
  type ContactsBodyBlock,
} from "@/components/show-panels/contactsBlocks";
import { crewMailtoHref, crewTelHref } from "@/lib/crew/contactHrefs";
import type { ContactRow } from "@/lib/parser/types";

/** The crew's contact options: notes shown, sentinels hidden, the digits-only call link. */
export const CREW_CONTACT_OPTIONS = {
  sentinels: "hide",
  showNotes: true,
  telHref: crewTelHref,
  mailtoHref: crewMailtoHref,
} as const satisfies ContactBlockOptions;

/**
 * The contact blocks the crew body renders a row for, in order: every venue and
 * in-house AV contact (never the client contact) with a name the crew sees or
 * something to tap.
 */
export function crewContactsShown(contacts: readonly ContactRow[]): ContactsBodyBlock[] {
  return contactsBodyBlocks(null, contacts).filter(
    (block) => contactsBodyLines(block, CREW_CONTACT_OPTIONS).identity !== null,
  );
}
