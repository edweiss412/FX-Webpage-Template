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
 *     `min-h-(--spacing-tap-min)` class on KeyValue's anchor variant.
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
 *     hasn't filled this in yet").
 *
 * Each row carries `data-testid="crew-row"` for the e2e suite to
 * enumerate.
 *
 * Server Component (no `'use client'`).
 */
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { Section } from "@/components/atoms/Section";
import { KeyValue } from "@/components/atoms/KeyValue";
import { EmptyState } from "@/components/atoms/EmptyState";

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
        ariaLabel="Crew"
        bodyAs="div"
      >
        <EmptyState variant="required-field" />
      </Section>
    );
  }

  return (
    <Section
      testId="crew-tile"
      heading="Crew"
      headingTone="eyebrow"
      ariaLabel="Crew"
      bodyAs="div"
    >
      <ul className="flex flex-1 flex-col gap-4">
        {crewMembers.map((member, idx) => (
          <li
            key={member.id}
            data-testid="crew-row"
            className={[
              "flex flex-col gap-2",
              idx > 0 ? "border-t border-border pt-4" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-semibold leading-tight text-text-strong">
                {member.name}
              </p>
              {member.role ? (
                <p className="text-xs uppercase tracking-[0.12em] text-text-faint">
                  {member.role}
                </p>
              ) : null}
            </div>
            <dl className="flex flex-col gap-2">
              <KeyValue
                label="Phone"
                value={member.phone}
                {...(member.phone ? { linkAs: "tel" as const } : {})}
              />
              <KeyValue
                label="Email"
                value={member.email}
                {...(member.email ? { linkAs: "mailto" as const } : {})}
              />
            </dl>
          </li>
        ))}
      </ul>
    </Section>
  );
}
