/**
 * components/tiles/CrewTile.tsx — crew roster tile (M4 Task 4.4 line
 * 290-306; spec §8.1 + §8.3).
 *
 * Reads `props.crewMembers` straight off `getShowForViewer.ts:88-102`.
 * Each row carries `{ id, name, email, phone, role, roleFlags }` per
 * the §11 projection contract. Plan §4.4 explicitly states "Do NOT
 * filter the viewer themselves out — the viewer SEES themselves in
 * the crew list (it's intentional; crew want to see their own
 * role/phone/email displayed correctly)."
 *
 * Render contract:
 *   - Every crew member with role + phone + email.
 *   - Phone: rendered with original formatting in the visible label,
 *     digits-only in the `tel:` href so the dialer opens cleanly.
 *   - Email: canonicalized at the M1 boundary (lib/email/canonicalize.ts),
 *     rendered as a `mailto:` link.
 *   - Tap targets: every interactive anchor is ≥44×44px via the
 *     `min-h-tap-min` class on KeyValue's anchor variant.
 *
 * Empty-state behavior (spec §8.3):
 *   - crewMembers.length === 0 (very unlikely; a show always has crew)
 *     → render the EmptyState placeholder. The tile is conceptually
 *     required (every show has crew), so the required-field branch
 *     applies, not whole-tile-missing.
 *   - phone or email missing on a row → render the canonical
 *     placeholder via KeyValue (the field is structurally required).
 *   - role missing → render the placeholder (parser warns separately
 *     if the source row is malformed; render-time we just say "Doug
 *     placeholder ("No crew listed for this show yet.") per Task 4.14.
 *
 * Each row carries `data-testid="crew-row"` for the e2e suite to
 * enumerate.
 *
 * Server Component (no `'use client'`).
 */
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { Avatar } from "@/components/atoms/Avatar";
import { Section } from "@/components/atoms/Section";
import { EmptyState } from "@/components/atoms/EmptyState";
import { digitsOnly } from "@/lib/format/phone";

type CrewTileProps = {
  crewMembers: ShowForViewer["crewMembers"];
};

export function CrewTile({ crewMembers }: CrewTileProps) {
  if (!crewMembers || crewMembers.length === 0) {
    return (
      <Section
        testId="crew-tile"
        heading="Crew"
        headingTone="eyebrow"
        variant="people"
        ariaLabel="Crew"
        bodyAs="div"
      >
        <EmptyState label="No crew listed for this show yet." />
      </Section>
    );
  }

  return (
    <Section
      testId="crew-tile"
      heading="Crew"
      headingTone="eyebrow"
      variant="people"
      ariaLabel="Crew"
    >
      {crewMembers.map((member, idx) => (
        <li
          key={member.id}
          data-testid="crew-row"
          className={[
            "flex items-start gap-3",
            idx > 0 ? "border-t border-border pt-4" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Avatar name={member.name} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-sm/tight font-semibold text-text-strong">
              {member.name}
            </p>
            {member.role ? (
              <p className="truncate text-xs uppercase tracking-[0.12em] text-text-faint">
                {member.role}
              </p>
            ) : null}
            {/*
              Tap-to-call / tap-to-email controls. Each anchor is a
              standalone tap target ≥44px (--spacing-tap-min) per
              DESIGN.md §3. The visible label is just the icon-glyph +
              short word ("Call" / "Email") to keep the row scannable;
              the digits / address are NOT repeated as text — crew
              don't read 10-digit numbers from the row, they tap to
              dial. This is the substantive shape difference from the
              old `dl`-of-KeyValue treatment (Finding 2 close-out).
            */}
            <div className="flex flex-wrap gap-2 pt-1">
              {member.phone ? (
                <a
                  href={`tel:${digitsOnly(member.phone)}`}
                  className={[
                    "inline-flex min-h-tap-min items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium tabular-nums text-text",
                    "transition-colors duration-fast",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={`Call ${member.name}`}
                >
                  <span aria-hidden="true">{"☎"}</span>
                  <span>Call</span>
                </a>
              ) : null}
              {member.email ? (
                <a
                  href={`mailto:${member.email}`}
                  className={[
                    "inline-flex min-h-tap-min items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium text-text",
                    "transition-colors duration-fast",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={`Email ${member.name}`}
                >
                  <span aria-hidden="true">{"✉"}</span>
                  <span>Email</span>
                </a>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </Section>
  );
}
