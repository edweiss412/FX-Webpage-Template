/**
 * components/crew/sections/contactsRows.ts — the Contacts section's row
 * derivation, shared by `ContactsSection` and the search index builder
 * (lib/search/sections/contacts.ts), so the page and the index read the same
 * rows (spec §2.4).
 *
 * The contacts are the shared Contacts body's crew props (`contactsPanel`, crew
 * page redesign PR B Task 7, components/show-panels/ContactsBody.tsx); their
 * search lines come from `contactsBodyLines`, the body's own predicate, so a row
 * that renders no line has none, and a row cut by the inline cap is not in the
 * list at all. Never `show.client_contact`: the body is told not to include it
 * and is never given it (spec §6.2, "the client contact never reaches the crew
 * DOM").
 *
 * Non-client module: the builder runs on the server and imports it.
 */
import { crewMailtoHref, crewTelHref } from "@/components/crew/sections/crewRows";
import {
  contactsBodyBlocks,
  contactsBodyLines,
  type ContactsBodyProps,
  type ContactsBodyTargets,
} from "@/components/show-panels/ContactsBody";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { entryId } from "@/lib/search/entryId";
import type { SearchEntry } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";

/**
 * Cardinality cap for the contacts before the `[data-tile-show-more]` overflow
 * affordance renders. Ported verbatim from ContactsTile (CONTACTS_INLINE_CAP =
 * 6). Contacts past it are not in the DOM, so they are not in search (spec §12
 * L3).
 */
export const CONTACTS_INLINE_CAP = 6;

/**
 * The contacts card's `data-card-id` (the search region and its source link,
 * `CARD_REGION_MAP`). Its title, and so the search `group` of its lines, is the
 * registry label of `contacts` (plan decision 4).
 */
export const CONTACTS_CARD_ID = "crew-contacts";

/** A search entry without the parts the builder adds (section and copy). */
export type ContactsSearchLine = Omit<SearchEntry, "section" | "copy">;

/** The contacts' body props (all but the overflow slot, which is markup) and their search lines. */
export type ContactsPanel = {
  body: Omit<Extract<ContactsBodyProps, { includeClient: false }>, "overflow">;
  lines: ContactsSearchLine[];
  /**
   * Whether any contact renders a row: a name the crew sees or something to tap.
   * False when every contact lacks both, and the section then shows its own empty
   * state rather than an empty card (PR B invariant-8 gate, row 13).
   */
  hasRows: boolean;
};

/**
 * The contacts the "Contacts" panel card renders: every `data.contacts` block
 * in order (the body caps them at `CONTACTS_INLINE_CAP`), notes shown, a
 * sentinel name or note hidden, Call only for a phone with digits and Email
 * behind its sentinel gate, and a search target per identity and note line of
 * the rows the cap keeps.
 */
export function contactsPanel(data: ShowForViewer): ContactsPanel {
  const options = {
    sentinels: "hide",
    showNotes: true,
    telHref: crewTelHref,
    mailtoHref: crewMailtoHref,
  } as const;
  const group = showSection("contacts").label;
  const seen = new Map<string, number>();
  const targets: Record<string, ContactsBodyTargets> = {};
  const lines: ContactsSearchLine[] = [];
  const blocks = contactsBodyBlocks(null, data.contacts);
  // The body's own predicate: a block renders exactly when it has an identity line.
  const hasRows = blocks.some((block) => contactsBodyLines(block, options).identity !== null);
  for (const block of blocks.slice(0, CONTACTS_INLINE_CAP)) {
    const { identity, notes } = contactsBodyLines(block, options);
    const target: ContactsBodyTargets = {};
    for (const [slot, line] of [
      ["identity", identity],
      ["notes", notes],
    ] as const) {
      if (line === null) continue;
      const id = entryId("contacts", CONTACTS_CARD_ID, group, null, line.value, seen);
      target[slot] = id;
      lines.push({ id, group, label: null, value: line.value, context: line.context });
    }
    targets[block.key] = target;
  }
  return {
    body: {
      includeClient: false,
      contacts: data.contacts,
      cap: CONTACTS_INLINE_CAP,
      ...options,
      // PR B invariant-8 gate rows 17 and 20, as the roster.
      actionsPlacement: "below-until-split",
      actionTone: "text",
      targets,
      rowTestId: "crew-panel-contact-row",
    },
    lines,
    hasRows,
  };
}
