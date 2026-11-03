/**
 * components/show-panels/contactsBlocks.ts
 *
 * The contacts body's block and line derivations, without its markup:
 * `ContactsBody` renders from these, the admin's rail count and freshness read
 * `contactBlocks`, and the crew page's section gate, search index and "All
 * sections" peek read the display rule, so none of them can disagree about
 * which contacts render a row.
 *
 * JSX-free on purpose (PR B invariant-8 gate, row 9 and row 13's peer): the
 * peek (lib/crew/sectionPeek.ts) is reachable from the crew page's client
 * bundle and must not pull the body into it. ContactsBody.tsx re-exports every
 * name here.
 *
 * Pure and server-safe.
 */
import { contentRows } from "@/components/show-panels/fieldRows";
import type { ClientContact, ContactRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/** One contact block: the admin's shape (`contactBlocks`), plus the contact's note. */
export type ContactsBodyBlock = {
  key: string;
  /** The contact's kind as a label: the heading of a nameless contact. */
  kind: string;
  name: string;
  /** Phone, Email and (client only) Office, each non-empty and trimmed. */
  rows: { label: string; value: string }[];
  notes: string | null;
};

/** A contact's kind as its label: the heading of a nameless contact, the line under a named one. */
export function contactKindLabel(kind: ContactRow["kind"]): string {
  return kind === "in_house_av" ? "In-house AV" : "Venue contact";
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The blocks a contacts body renders, in order: the client contact's (primary,
 * then the optional secondary), then each venue and in-house AV contact. A block
 * with no name and no phone or email is dropped.
 */
export function contactsBodyBlocks(
  clientContact: ClientContact | null,
  contacts: readonly ContactRow[],
): ContactsBodyBlock[] {
  // Client people: primary + optional secondary (null-safe). Each a "Client
  // contact" (the second flagged "(secondary)" so the operator can tell the lead
  // client rep from the backup). Index keys avoid same-name React key collisions.
  const clientPeople = [clientContact, clientContact?.secondary].filter(Boolean) as {
    name: string;
    phone: string | null;
    email: string | null;
    officePhone?: string | null;
  }[];
  return [
    ...clientPeople.map((p, i) => ({
      key: `client-${i}`,
      kind: i === 0 ? "Client contact" : "Client contact (secondary)",
      name: p.name,
      rows: contentRows([
        ["Phone", p.phone],
        ["Email", p.email],
        ["Office", p.officePhone],
      ]),
      notes: null,
    })),
    ...contacts.map((c, i) => ({
      key: `contact-${i}`,
      kind: contactKindLabel(c.kind),
      name: c.name ?? "",
      rows: contentRows([
        ["Phone", c.phone],
        ["Email", c.email],
      ]),
      notes: c.notes,
    })),
  ].filter((b) => hasText(b.name) || b.rows.length > 0);
}

/**
 * The contact "blocks" the admin contacts body renders (client primary +
 * optional secondary + venue / in-house-AV rows). Shared so the admin's §6.1
 * rail count, its freshness projection and the body derive the SAME list
 * (count={blocks.length}, the existing contract) without duplicating the
 * shaping logic. Re-exported from step3ReviewSections.tsx under this name.
 */
export function contactBlocks(
  clientContact: ClientContact | null,
  contacts: ContactRow[],
): Array<{ key: string; kind: string; name: string; rows: { label: string; value: string }[] }> {
  return contactsBodyBlocks(clientContact, contacts).map((b) => ({
    key: b.key,
    kind: b.kind,
    name: b.name,
    rows: b.rows,
  }));
}

/** What a block's display reads: the surface's sentinel rule, notes and link builders. */
export type ContactBlockOptions = {
  /** "show": a sentinel name or note renders as parsed (admin). "hide": it is omitted (crew). */
  sentinels: "show" | "hide";
  /** Whether a contact's note renders. */
  showNotes: boolean;
  /** A phone's call link, or null for none. */
  telHref: (phone: string) => string | null;
  /** An email's link, or null for none. */
  mailtoHref: (email: string) => string | null;
};

/** A value the surface shows: non-blank, and under "hide" not a sentinel. */
function shown(value: string | null, sentinels: "show" | "hide"): string | null {
  if (!hasText(value)) return null;
  return sentinels === "hide" && shouldHideGenericOptional(value) ? null : value;
}

export type ContactAction = { verb: string; slot: string; href: string; isEmail: boolean };

/** What one block renders, decided once for the render and the crew index (spec §2.4). */
export type BlockDisplay = {
  /** The name when the surface shows it, else null (the kind is then the heading). */
  name: string | null;
  heading: string;
  actions: ContactAction[];
  notes: string | null;
};

export function contactBlockDisplay(
  block: ContactsBodyBlock,
  options: ContactBlockOptions,
): BlockDisplay | null {
  const name = shown(block.name, options.sentinels);
  const heading = name ?? block.kind;
  const actions: ContactAction[] = [];
  for (const r of block.rows) {
    const isEmail = r.label === "Email";
    const href = isEmail ? options.mailtoHref(r.value) : options.telHref(r.value);
    if (href === null) continue;
    // Distinguish a second (office) phone in the accessible name so two Call
    // buttons on one contact stay tellable apart.
    const verb = isEmail ? "Email" : r.label === "Office" ? "Call the office for" : "Call";
    actions.push({ verb, slot: isEmail ? "email" : r.label.toLowerCase(), href, isEmail });
  }
  // A row with no name and nothing to tap has nothing to show, its note included.
  if (name === null && actions.length === 0) return null;
  const notes = options.showNotes ? shown(block.notes, options.sentinels) : null;
  return { name, heading, actions, notes };
}

/** One searchable line of a contact row: its displayed text and the words around it. */
export type ContactsBodyLine = { value: string; context: string[] };

/**
 * A block's lines as search sees them (spec §2.3), decided here so the crew
 * index and the render apply the same predicates (spec §2.4): the identity line
 * (the heading, with the kind as its context under a named contact) and the
 * note line, each null when it does not render.
 */
export function contactsBodyLines(
  block: ContactsBodyBlock,
  options: ContactBlockOptions,
): { identity: ContactsBodyLine | null; notes: ContactsBodyLine | null } {
  const d = contactBlockDisplay(block, options);
  if (d === null) return { identity: null, notes: null };
  return {
    identity: { value: d.heading, context: d.name !== null ? [block.kind] : [] },
    notes: d.notes !== null ? { value: d.notes, context: [d.heading] } : null,
  };
}
