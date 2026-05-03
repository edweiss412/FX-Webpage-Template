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
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";

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

export function ContactsTile({ contacts }: ContactsTileProps) {
  if (!contacts || contacts.length === 0) {
    return null;
  }

  return (
    <Section
      testId="contacts-tile"
      heading="Contacts"
      headingTone="eyebrow"
      ariaLabel="Contacts"
      bodyAs="div"
    >
      <ul className="flex flex-1 flex-col gap-4">
        {contacts.map((contact, idx) => (
          <li
            key={`${contact.kind}-${idx}`}
            data-testid="contact-row"
            className={[
              "flex flex-col gap-2",
              idx > 0 ? "border-t border-border pt-4" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="flex flex-col gap-0.5">
              {contact.name ? (
                <p className="text-base font-semibold leading-tight text-text-strong">
                  {contact.name}
                </p>
              ) : null}
              <p className="text-xs uppercase tracking-[0.12em] text-text-faint">
                {kindLabel(contact.kind)}
              </p>
            </div>
            <dl className="flex flex-col gap-2">
              <KeyValue
                label="Phone"
                value={contact.phone}
                {...(contact.phone ? { linkAs: "tel" as const } : {})}
              />
              <KeyValue
                label="Email"
                value={contact.email}
                {...(contact.email ? { linkAs: "mailto" as const } : {})}
              />
              {contact.notes ? (
                <KeyValue label="Notes" value={contact.notes} />
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </Section>
  );
}
