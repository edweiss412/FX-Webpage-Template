/**
 * components/tiles/ContactsTile.tsx — show contacts tile (M4 Task 4.4
 * line 290-302; spec §8.1 + §8.3).
 *
 * Reads `props.contacts: ContactRow[]` straight off
 * `getShowForViewer.ts:294-300` (which mirrors `lib/parser/types.ts:172-178`).
 * Each row carries `{ kind, name, email, phone, notes }` where `kind`
 * is `'venue'` or `'in_house_av'` (`ContactKind`).
 *
 * Empty-state behavior (spec §8.3):
 *   - contacts.length === 0 → return null. Whole-tile-missing reflow
 *     (some shows simply have no in-house AV / venue contacts in the
 *     sheet); the grid simply has fewer cells.
 *   - per-field optional missing → KeyValue renders the canonical
 *     placeholder for that field. The contact's name is the heading
 *     for its row; if name is missing we still render the row with
 *     a placeholder so the email/phone lines remain useful.
 *
 * Tap targets: tel:/mailto: anchors inherit the 44px floor from
 * KeyValue's anchor variant.
 *
 * Server Component (no `'use client'`).
 */
import type { ContactRow } from "@/lib/parser/types";
import { Avatar } from "@/components/atoms/Avatar";
import { Section } from "@/components/atoms/Section";
import { digitsOnly } from "@/lib/format/phone";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type ContactsTileProps = {
  contacts: ContactRow[];
};

/** Human-readable label for the ContactKind discriminator. */
function kindLabel(kind: ContactRow["kind"]): string {
  switch (kind) {
    case "venue":
      return "Venue contact";
    case "in_house_av":
      return "In-house AV";
    default:
      return "Contact";
  }
}

/**
 * Cardinality cap before the §8.4 / AC-4.4 overflow disclosure
 * renders. Each contact row is avatar (32px) + 2-3 lines of text +
 * tap-target gap, ~120px per row in practice. The body's
 * max-h-tile-overflow is 240px, so 6 rows clear the floor before
 * the second screen of scroll. Mirrors the round-22 CrewTile
 * threshold pattern (Codex round-23 MEDIUM closure).
 */
const CONTACTS_INLINE_CAP = 6;

export function ContactsTile({ contacts }: ContactsTileProps) {
  if (!contacts || contacts.length === 0) {
    return null;
  }

  const visibleContacts = contacts.slice(0, CONTACTS_INLINE_CAP);
  const overflowCount = Math.max(0, contacts.length - CONTACTS_INLINE_CAP);

  return (
    <Section
      testId="contacts-tile"
      heading="Contacts"
      headingTone="eyebrow"
      variant="people"
      ariaLabel="Contacts"
    >
      {visibleContacts.map((contact, idx) => (
        <li
          key={`${contact.kind}-${idx}`}
          data-testid="contact-row"
          className={["flex items-start gap-3", idx > 0 ? "border-t border-border pt-4" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <Avatar name={contact.name} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {contact.name ? (
              <p className="truncate text-sm/tight font-semibold text-text-strong">
                {contact.name}
              </p>
            ) : null}
            <p className="truncate text-xs uppercase tracking-eyebrow text-text-faint">
              {kindLabel(contact.kind)}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {/*
                §8.3 actionable-link sentinel guard (Codex round-16):
                hide the phone tap target when value is a sentinel
                ("TBD"/"N/A"/"TBA") — a `tel:` link to nothing is a
                dead/misleading contact control. Same harm pattern as
                round-15 driver_phone fix.
              */}
              {!shouldHideGenericOptional(contact.phone) &&
              digitsOnly(contact.phone ?? "").length > 0 ? (
                <a
                  href={`tel:${digitsOnly(contact.phone ?? "")}`}
                  className={[
                    "inline-flex min-h-tap-min items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium tabular-nums text-text",
                    "transition-colors duration-fast",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={
                    contact.name ? `Call ${contact.name}` : `Call ${kindLabel(contact.kind)}`
                  }
                >
                  <span aria-hidden="true">{"☎"}</span>
                  <span>Call</span>
                </a>
              ) : null}
              {/*
                §8.3 actionable-link sentinel guard (Codex round-16):
                hide the email tap target when value is a sentinel.
                A `mailto:TBD` link is a dead/misleading control.
              */}
              {!shouldHideGenericOptional(contact.email) ? (
                <a
                  href={`mailto:${contact.email}`}
                  className={[
                    "inline-flex min-h-tap-min items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium text-text",
                    "transition-colors duration-fast",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={
                    contact.name ? `Email ${contact.name}` : `Email ${kindLabel(contact.kind)}`
                  }
                >
                  <span aria-hidden="true">{"✉"}</span>
                  <span>Email</span>
                </a>
              ) : null}
            </div>
            {/*
              §8.3 generic-optional (Codex round-10): sentinels
              (`'TBD'`/`'N/A'`/`'TBA'`) are hidden via the central
              predicate so the notes paragraph reflows out for
              meaningless values.
            */}
            {!shouldHideGenericOptional(contact.notes) ? (
              <p className="pt-1 text-xs/snug text-text-subtle">{contact.notes}</p>
            ) : null}
          </div>
        </li>
      ))}
      {overflowCount > 0 ? (
        // §8.4 / AC-4.4 overflow disclosure (Codex round-23 MEDIUM):
        // mirror the round-22 CrewTile pattern. Renders below the
        // last visible contact when count > CONTACTS_INLINE_CAP.
        <li
          data-testid="contacts-overflow-stub"
          data-tile-show-more="true"
          className={[
            "rounded-sm bg-surface-sunken px-3 py-2",
            "text-sm text-text-subtle",
            "border-t border-border pt-4",
          ].join(" ")}
        >
          <span className="tabular-nums">+{overflowCount}</span>{" "}
          {overflowCount === 1 ? "more contact" : "more contacts"} on the source sheet
        </li>
      ) : null}
    </Section>
  );
}


/**
 * View alias + async loader for M9 Task 9.2 — `ContactsTile` is
 * already pure; the loader is identity but provides the seam where
 * future per-tile derivation can throw and be caught by
 * <TileServerFallback>.
 */
export const ContactsTileView = ContactsTile;

export async function loadContactsTileData(
  props: ContactsTileProps,
): Promise<ContactsTileProps> {
  return props;
}
