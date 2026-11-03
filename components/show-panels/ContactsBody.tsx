/**
 * components/show-panels/ContactsBody.tsx
 *
 * The Contacts section body both surfaces render (crew page redesign spec §6.2,
 * `contacts` row): the list of the admin's `ContactsBreakdown` over the blocks
 * `contactBlocks` shapes. One row per block up to `cap`: an avatar, the heading
 * (the name, or the contact's kind when it has none), the kind under a named
 * contact, the call and email actions as drawn icons, and the note.
 *
 * - Admin: `includeClient: true` (the client contact's blocks first), no cap,
 *   no notes, sentinels as parsed, the raw `tel:`/`mailto:` builders, the
 *   actions at the row's end, and its action test ids
 *   (`${testIdPrefix}-contact-${key}-${slot}`). No search markers, no row ids.
 * - Crew: `includeClient: false` (the client contact is never given, so it
 *   never reaches the crew props or DOM), `cap` = `CONTACTS_INLINE_CAP` with the
 *   crew's overflow stub, notes shown, a sentinel name or note hidden, Call only
 *   when the phone has digits and Email behind its sentinel gate, the actions
 *   under the identity, a search target per identity and note line, and
 *   `rowTestId` (`contactsRows.ts`, `contactsPanel`).
 *
 * Crew presentation (PR B invariant-8 UI gate rows 17 and 20), each a prop whose
 * default is the admin's markup: `actionTone: "text"` draws the action glyphs in
 * body text with the home "Who to call" buttons' hover, and `actionsPlacement:
 * "below-until-split"` moves the actions to the identity's row end at the crew
 * section container's `@min-crew-split`.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function
 * inside `WrappedSection`'s render callback (spec §6.1, error containment).
 */
import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";

import { Avatar } from "@/components/atoms/Avatar";
import { contentRows } from "@/components/show-panels/FieldRowList";
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

/** A block's two search lines' target ids. */
export type ContactsBodyTargets = { identity?: string; notes?: string };

type ClientOption =
  | { includeClient: true; clientContact: ClientContact | null }
  | { includeClient: false; clientContact?: never };

export type ContactsBodyProps = ClientOption & {
  contacts: readonly ContactRow[];
  /** Rows shown; the blocks past it are counted, not rendered. Absent, every block renders. */
  cap?: number;
  /** What follows the list when the cap hides blocks. */
  overflow?: (hidden: number) => ReactNode;
  /** Whether a contact's note renders. */
  showNotes: boolean;
  /** A phone's call link, or null for none. */
  telHref: (phone: string) => string | null;
  /** An email's link, or null for none. */
  mailtoHref: (email: string) => string | null;
  /** "show": a sentinel name or note renders as parsed (admin). "hide": it is omitted (crew). */
  sentinels: "show" | "hide";
  /**
   * "end": the actions close the row (admin). "below": they sit under the
   * identity. "below-until-split" (crew): under the identity below the crew
   * section container's `@min-crew-split`, closing the identity's row from it.
   */
  actionsPlacement: "end" | "below" | "below-until-split";
  /** "subtle" (the default, admin): the drawn glyph muted. "text" (crew): body text, with the home buttons' hover. */
  actionTone?: "subtle" | "text";
  /** Search targets by block key (crew). Given, the avatar and the actions are skipped. */
  targets?: Readonly<Record<string, ContactsBodyTargets>>;
  /** Given, each action is `${testIdPrefix}-contact-${key}-${slot}` (the admin's ids). */
  testIdPrefix?: string;
  /** Given, each row's test id. */
  rowTestId?: string;
};

type BlockOptions = Pick<ContactsBodyProps, "sentinels" | "showNotes" | "telHref" | "mailtoHref">;

/** A value the surface shows: non-blank, and under "hide" not a sentinel. */
function shown(value: string | null, sentinels: "show" | "hide"): string | null {
  if (!hasText(value)) return null;
  return sentinels === "hide" && shouldHideGenericOptional(value) ? null : value;
}

type ContactAction = { verb: string; slot: string; href: string; isEmail: boolean };

/** What one block renders, decided once for the render and the crew index (spec §2.4). */
type BlockDisplay = {
  /** The name when the surface shows it, else null (the kind is then the heading). */
  name: string | null;
  heading: string;
  actions: ContactAction[];
  notes: string | null;
};

function blockDisplay(block: ContactsBodyBlock, options: BlockOptions): BlockDisplay | null {
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
  options: BlockOptions,
): { identity: ContactsBodyLine | null; notes: ContactsBodyLine | null } {
  const d = blockDisplay(block, options);
  if (d === null) return { identity: null, notes: null };
  return {
    identity: { value: d.heading, context: d.name !== null ? [block.kind] : [] },
    notes: d.notes !== null ? { value: d.notes, context: [d.heading] } : null,
  };
}

export function ContactsBody(props: ContactsBodyProps) {
  const { cap, actionsPlacement, targets } = props;
  const tone = props.actionTone ?? "subtle";
  const blocks = contactsBodyBlocks(
    props.includeClient ? props.clientContact : null,
    props.contacts,
  );
  const visible = cap === undefined ? blocks : blocks.slice(0, cap);
  const hidden = blocks.length - visible.length;
  const skip = targets === undefined ? {} : { "data-search-skip": "" };

  const rows = visible.map((block) => {
    const d = blockDisplay(block, props);
    if (d === null) return null;
    const target = targets?.[block.key];

    const identityBlock = (
      <span className="min-w-0 flex-1" data-search-target={target?.identity}>
        <span className="block wrap-break-word text-sm font-medium text-text-strong">
          {d.heading}
        </span>
        {d.name !== null ? (
          <span className="block wrap-break-word text-xs text-text-subtle">{block.kind}</span>
        ) : null}
      </span>
    );

    // §8 exact anchor DOM: the INTERACTIVE <a> is the 44×44 border box
    // (`size-tap-min`); the bordered 32px square is a nested NON-interactive
    // visual. Adjacent anchors sit flush (no gap) so the 44×44 hit areas never
    // overlap; the centered 32px visuals leave a natural gutter.
    const actionLinks =
      d.actions.length > 0 ? (
        <span
          {...skip}
          className={
            actionsPlacement === "end"
              ? "flex shrink-0 items-center"
              : actionsPlacement === "below-until-split"
                ? "-ml-1.5 flex shrink-0 items-center @min-crew-split:ml-0"
                : "-ml-1.5 flex shrink-0 items-center"
          }
        >
          {d.actions.map(({ verb, slot, href, isEmail }) => {
            const Icon = isEmail ? Mail : Phone;
            return (
              <a
                key={slot}
                href={href}
                data-testid={
                  props.testIdPrefix !== undefined
                    ? `${props.testIdPrefix}-contact-${block.key}-${slot}`
                    : undefined
                }
                aria-label={`${verb} ${d.heading}`}
                className={`${tone === "text" ? "group " : ""}inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`}
              >
                {/* The crew's square, as the roster's (CrewBody): body-text glyph, the
                    home buttons' hover, instant. */}
                <span
                  className={
                    tone === "text"
                      ? "grid size-8 place-items-center rounded-sm border border-text-faint bg-surface text-text group-hover:bg-surface-sunken group-hover:text-accent-on-bg"
                      : "grid size-8 place-items-center rounded-sm border border-text-faint text-text-subtle"
                  }
                >
                  <Icon aria-hidden="true" className="size-4" />
                </span>
              </a>
            );
          })}
        </span>
      ) : null;

    const notesLine =
      d.notes !== null ? (
        <span
          data-search-target={target?.notes}
          className="block wrap-break-word pt-1 text-xs/snug text-text-subtle"
        >
          {d.notes}
        </span>
      ) : null;

    const avatar = <Avatar name={d.name} searchSkip={targets !== undefined} />;
    const rowId = props.rowTestId !== undefined ? { "data-testid": props.rowTestId } : {};

    return actionsPlacement === "end" ? (
      <li key={block.key} {...rowId} className="flex items-center gap-3 py-1">
        {avatar}
        {notesLine === null ? (
          identityBlock
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {identityBlock}
            {notesLine}
          </span>
        )}
        {actionLinks}
      </li>
    ) : actionsPlacement === "below-until-split" ? (
      // The crew's (PR B invariant-8 gate row 20): the identity and its actions
      // share a row from the crew threshold; the note stays under both.
      <li key={block.key} {...rowId} className="flex items-start gap-3 py-1">
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-col gap-1 @min-crew-split:flex-row @min-crew-split:items-center @min-crew-split:gap-3">
            {identityBlock}
            {actionLinks}
          </span>
          {notesLine}
        </span>
      </li>
    ) : (
      <li key={block.key} {...rowId} className="flex items-start gap-3 py-1">
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {identityBlock}
          {actionLinks}
          {notesLine}
        </span>
      </li>
    );
  });

  return (
    <>
      {blocks.length === 0 ? (
        <p className="text-sm text-text-subtle">No contacts parsed.</p>
      ) : (
        <ul className="flex flex-col">{rows}</ul>
      )}
      {hidden > 0 && props.overflow !== undefined ? props.overflow(hidden) : null}
    </>
  );
}
