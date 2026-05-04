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

/** Strip non-digit characters for the tel: href. */
function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
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
      variant="people"
      ariaLabel="Contacts"
    >
      {contacts.map((contact, idx) => (
        <li
          key={`${contact.kind}-${idx}`}
          data-testid="contact-row"
          className={[
            "flex items-start gap-3",
            idx > 0 ? "border-t border-border pt-4" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Avatar name={contact.name} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {contact.name ? (
              <p className="truncate text-sm font-semibold leading-tight text-text-strong">
                {contact.name}
              </p>
            ) : null}
            <p className="truncate text-xs uppercase tracking-[0.12em] text-text-faint">
              {kindLabel(contact.kind)}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {contact.phone ? (
                <a
                  href={`tel:${digitsOnly(contact.phone)}`}
                  className={[
                    "inline-flex min-h-(--spacing-tap-min) items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium tabular-nums text-text",
                    "transition-colors duration-(--duration-fast)",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={
                    contact.name
                      ? `Call ${contact.name}`
                      : `Call ${kindLabel(contact.kind)}`
                  }
                >
                  <span aria-hidden="true">{"☎"}</span>
                  <span>Call</span>
                </a>
              ) : null}
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className={[
                    "inline-flex min-h-(--spacing-tap-min) items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium text-text",
                    "transition-colors duration-(--duration-fast)",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={
                    contact.name
                      ? `Email ${contact.name}`
                      : `Email ${kindLabel(contact.kind)}`
                  }
                >
                  <span aria-hidden="true">{"✉"}</span>
                  <span>Email</span>
                </a>
              ) : null}
            </div>
            {contact.notes ? (
              <p className="pt-1 text-xs leading-snug text-text-subtle">
                {contact.notes}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </Section>
  );
}
